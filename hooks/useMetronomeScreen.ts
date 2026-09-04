import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useLandscapePanel } from "@/hooks/useLandscapePanel";
import { useNotificationBridge } from "@/hooks/useNotificationBridge";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useAudioPipeline } from "@/hooks/useAudioPipeline";
import { useSettings } from "@/hooks/useSettings";
import {
  View,
  Platform,
  Alert,
  PanResponder,
  useWindowDimensions,
  BackHandler,
  AppState,
  type GestureResponderEvent,
  type PanResponderGestureState,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { ensurePermission } from "@/lib/permissions";
import * as Linking from "expo-linking";
import {
  setupNotificationControls,
  showPlayingNotification,
  showPausedNotification,
  updateNotificationBpm,
  dismissNotification,
  addNotificationActionListener,
} from "@/lib/notification-controls";
import Animated, {
  useAnimatedStyle,
  withTiming,
  withSequence,
  Easing,
  useSharedValue,
  cancelAnimation,
} from "react-native-reanimated";
import { safePlay, notifyAudioPoolFallback, detectPoolCutoffRisk } from "@/lib/audio-utils";
import { registerMetronomeBridge, notifyUserMetronomeToggle } from "@/lib/audio-session";
import { captureBreadcrumb } from "@/lib/error-tracking";
import { sanitizeDeepLinkEntry } from "@/lib/deep-link-import";
import * as Haptics from "expo-haptics";
import * as Crypto from "expo-crypto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";
import { Radius, Spacing, FontSize } from "@/constants/tokens";
import type { ThemeColor } from "@/constants/colors";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { getTempoLabel as getTempoLabelI18n } from "@/lib/i18n";
import { useScale } from "@/lib/scale";
import type { ScaleValues } from "@/lib/scale";
import { MetronomeEngine, soundSets, toEngineBpm } from "@/lib/metronome-engine";
import type { BeatType, ProgressInfo } from "@/lib/metronome-engine";
import {
  appendBarRandomPlaybackChunk,
  createBarRandomSession,
  DEFAULT_BAR_RANDOM_CONFIG,
  type BarRandomConfig,
  type BarRandomSession,
} from "@/lib/bar-random-session";
import { loadSettings, saveSettings, loadCustomSoundSets, saveCustomSoundSets, loadPracticeBook, savePracticeBook, createPracticeEntry, runStorageMigrations, clearAllAppStorage, type MetronomeSettings } from "@/lib/storage";
import type { FlashMode, HapticMode, SoundSet, BuiltinSoundSet, CustomSoundSetConfig, CustomSoundSample, FadeOutSettings, PracticeEntry, MetronomeMode } from "@/lib/storage";
import type { BarRepeat, LoopBlock } from "@/components/BeatIndicator";
import type { StopwatchTimerHandle } from "@/components/StopwatchTimer";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useDeepLink } from "@/contexts/DeepLinkContext";
import { useVoiceAssistant } from "@/contexts/VoiceAssistantContext";
import { make_styles } from "@/app/index.styles";
import { defaultBeatTypes, isSafeNoteSampleUri, createInitialDialConfig, createInitialBarConfig, hydrateDialConfigFromSettings, createShuffledIndices as createShuffledIndicesPure, applyQueueInsert, beatSubdivisionCounts as beatSubdivisionCountsPure, selectCurrentBarConfig, computeLandscapeStats, entryToBarConfig, applyEntryToEngine as applyEntryToEngineCore, migrateLayerBlocks, applyLoopBlocksChange } from "@/app/index.helpers";
import { serializeNoteQueueEntries } from "@/lib/note-queue-helpers";
import {
  type ActiveModal,
  type SgTgState,
  deriveModalFlags,
  getMenuItemCloseTarget,
  openTuningGuideFromSignalGen,
  closeTuningGuide,
} from "@/lib/modal-routing";
import { BUILTIN_POOL_SIZE, type BuiltinPlayers, type SoundSetPlayers } from "@/hooks/useAudioPlayers";
import { useNoteSamples } from "@/hooks/useNoteSamples";
import { useNoteSamplePersistenceStatus } from "@/hooks/useNoteSamplePersistenceStatus";
import { usePlaybackControl } from "@/hooks/usePlaybackControl";
import { useAudioLifecycle } from "@/hooks/useAudioLifecycle";
import {
  getAudioLifecycleSnapshot,
  markAudioPlaying,
  markAudioRecoverySucceeded,
  markAudioStopped,
} from "@/lib/audio-lifecycle";
import { useDialConfig } from "@/hooks/useBarDialConfig";
import { useBarMode } from "@/hooks/useBarMode";
import { useMetronomeEngine } from "@/hooks/useMetronomeEngine";
import { useEasterEggQuiz } from "@/hooks/useEasterEggQuiz";
import {
  completeEasterEggBarSession,
  prepareEasterEggEngine,
  type EasterEggBarEngineSnapshot,
} from "@/lib/easter-egg-engine-session";
import { applyDialConfigToEngine } from "@/lib/dial-engine-boundary";
import { beatTypeToClickRole } from "@/lib/metronome-engine-pure";
import { useFadeOutSession } from "@/hooks/useFadeOutSession";
import { usePermissionRecoveryToast } from "@/hooks/usePermissionRecoveryToast";
import { useBeatQuickSave } from "@/hooks/useBeatQuickSave";
import { usePracticeBookLoad } from "@/hooks/usePracticeBookLoad";
import { useGoalPopups } from "@/hooks/useGoalPopups";
import { usePracticeRoomTracking } from "@/hooks/usePracticeRoomTracking";
import { useStageMode } from "@/hooks/useStageMode";
import { useBeatTypeControls } from "@/hooks/useBeatTypeControls";
import { applySwitchToMode, type ModeSwitchState, type ModeSwitchCallbacks } from "@/lib/stage-mode-logic";
import { createDebouncedPersister, type DebouncedPersister } from "@/lib/persist";
import { createRafBatcher } from "@/lib/raf-batcher";
import type { ModeSlot } from "@/components/ModeSwitcherDial";
import {
  createModeTransitionCoordinator,
  modeTransitionMayApply,
  stageExitRevealMode,
} from "@/lib/mode-dial-logic";
import type { ScoreDocument } from "@/lib/score-types";
import type { OnboardingResult } from "@/components/OnboardingModal";
import {
  resolvePlaybackContext,
  type PlaybackContext,
  type PlaybackMode,
} from "@/lib/playback-context";
import { PracticeSessionTracker, loadLoggingEnabled, saveLoggingEnabled, addActivityLog, loadActivityLogs, loadGoals, saveGoals } from "@/lib/activity-log";
import { loadNoteSamples, saveNoteSamples, setNoteSample, removeNoteSample, hasNoteSample, loadNoteSampleNames, saveNoteSampleNames, setNoteSampleName, removeNoteSampleName, loadNoteSampleSources, saveNoteSampleSources, setNoteSampleSource, removeNoteSampleSource, loadNoteSampleChannels, saveNoteSampleChannels, setNoteSampleChannel, removeNoteSampleChannel, loadNoteSampleVolumes, setNoteSampleVolume, removeNoteSampleVolume, loadNoteSampleSpeeds, setNoteSampleSpeed, removeNoteSampleSpeed, loadNoteSampleMetroChannels, saveNoteSampleMetroChannels, setNoteSampleMetroChannel, removeNoteSampleMetroChannel } from "@/lib/note-samples";
import type { NoteSampleMap, NoteSampleNameMap, NoteSampleSourceMap, NoteSampleChannelMap, NoteSampleVolumeMap, NoteSampleSpeedMap, NoteSampleMetroChannelMap, SampleSource } from "@/lib/note-samples";
import type { SampleChannel, MetroChannel } from "@/lib/stereo-channel";
import { AudioModule, createAudioPlayer } from "expo-audio";
import type { AudioPlayer as ExpoAudioPlayer } from "expo-audio";
import {
  decodeSampleFile,
  loadAssetPCM,
  parseTrimInfo,
  renderMeasure,
  applySoftClip,
  saveRenderedWav,
  ensureWebClickBuffers,
  playWebClick,
  clearWebClickBuffers,
  playWebRenderedLoop,
  getWebAudioContext,
  installAudioPlayInterruptHandler,
  previewClickOnWeb,
} from "@/lib/audio-renderer";
import { syncStereoArtifact, releaseStereoArtifact, releaseAll as releaseAllStereoArtifacts } from "@/lib/sample-cache";
import type { ClickPCMs, SamplePCMEntry, TickInfo, DecodedSample } from "@/lib/audio-renderer";
import type { ActivityLog, Goal } from "@/lib/activity-log";
import {
  loadModeKeyBindings,
  matchesBinding,
  isEditableTarget,
  DEFAULT_BINDINGS,
  type KeyBindingsMap,
} from "@/lib/keyboard-bindings";

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useMetronomeScreen() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isLandscape = windowWidth > windowHeight;
  const { setThemeColor, setCustomHex, colors: C, themeMode } = useTheme();
  const S = useScale();
  const styles = make_styles(C, S);
  const { language, t } = useLanguage();
  const languageRef = useRef(language);
  useEffect(() => { languageRef.current = language; }, [language]);

  // bpm/halfTime/beatDenominator/beatsPerMeasure/beatTypes → useSettings 소유
  // baseBpmRef / beatDenominatorRef 는 useSettings 파라미터이므로 여기서 생성
  const baseBpmRef = useRef(120);
  const beatDenominatorRef = useRef<2 | 4 | 8>(4);
  const {
    easterEggActive, setEasterEggActive,
    easterEggShakeCount, setEasterEggShakeCount,
    easterEggSuccessCount, setEasterEggSuccessCount,
    easterEggRevealBpm, setEasterEggRevealBpm,
    easterEggGiveUpMode, setEasterEggGiveUpMode,
    easterEggHintDirection, setEasterEggHintDirection,
    easterEggApplyBpm, setEasterEggApplyBpm, easterEggApplyBpmRef,
    easterEggPrevBpmRef, easterEggActualBpmRef, easterEggActiveRef,
  } = useEasterEggQuiz();
  // 이스터에그 발동 직전 재생 상태 보존 → 종료 시 원상복구
  const easterEggWasPlayingRef = useRef(false);
  const easterEggBarEngineSnapshotRef = useRef<EasterEggBarEngineSnapshot | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingRef = useRef(false);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  const [currentBeat, setCurrentBeat] = useState(-1);
  const [measureCount, setMeasureCount] = useState(0);
  const [activeSubNote, setActiveSubNote] = useState(-1);
  const activeSubNoteRef = useRef(-1);
  const resetPlaybackVisuals = useCallback(() => {
    setCurrentBeat(-1);
    setMeasureCount(0);
    setActiveSubNote(-1);
    activeSubNoteRef.current = -1;
    setProgressInfo(null);
    setLayerProgressMap({});
  }, []);
  // subdivisionPattern / beatSubdivisions → useSettings 소유
  const {
    landscapeImageUri, setLandscapeImageUri,
    landscapeImageModalVisible, setLandscapeImageModalVisible,
    showLandscapeImage, setShowLandscapeImage,
    landscapeContentType, setLandscapeContentType,
    landscapeStatsLogs, landscapeStats, formatStatMinutes,
    pickLandscapeImage, removeLandscapeImage,
  } = useLandscapePanel({ isLandscape, isPlaying, t });

  // ── 주 콘텐츠 모드 — 단일 소스오브트루스 ──────────────────────────────
  // 기존 barMode/noteMode/scoreMode boolean 세 개를 단일 enum 상태로 통합.
  const [coreMode, setCoreMode] = useState<"beat" | "bar" | "note" | "score">("beat");
  const [settingsMode, setSettingsMode] = useState<MetronomeMode>("beat");
  const activeModeRef = useRef<"beat" | "bar" | "note" | "score">("beat");
  const playbackModeRef = useRef<PlaybackMode>("beat");
  const modeTransitionCoordinatorRef = useRef(createModeTransitionCoordinator());
  const modeTransitionWriteTokenRef = useRef<number | null>(null);
  // 원자적 setter: ref와 React state를 항상 동시에 갱신.
  // useEffect 동기화를 쓰지 않으므로 effect 지연으로 인한 stale 덮어쓰기가 없다.
  // setCoreMode는 React가 렌더 간 동일 참조를 보장하므로 deps 없이 안정적.
  const setCoreModeAndRef = useCallback(
    (mode: "beat" | "bar" | "note" | "score") => {
      const token = modeTransitionWriteTokenRef.current;
      if (token === null) {
        modeTransitionCoordinatorRef.current.invalidateForExternalModeChange();
      } else {
        modeTransitionCoordinatorRef.current.expectModeCommit(mode, token);
      }
      activeModeRef.current = mode;
      playbackModeRef.current = mode;
      setSettingsMode(mode === "bar" ? "bar" : mode === "note" || mode === "score" ? "note" : "beat");
      setCoreMode(mode);
    },
    [], // setCoreMode & activeModeRef are both stable
  );
  // 하위 호환 파생 상수 — 나머지 코드는 수정 없이 그대로 동작
  const barMode  = coreMode === "bar";
  const noteMode = coreMode === "note";
  // 하위 호환 setter 래퍼 (useCallback으로 참조 안정성 보장)
  const setBarMode  = useCallback((v: boolean) => setCoreModeAndRef(v ? "bar" : "beat"), [setCoreModeAndRef]);
  const setNoteMode = useCallback((v: boolean) => setCoreModeAndRef(v ? "note" : "beat"), [setCoreModeAndRef]);
  // barModeRef / noteModeRef — 안정적 프록시 (useRef로 렌더 간 동일 객체 참조 보장).
  // setter가 setCoreModeAndRef를 호출해 ref+state를 원자적으로 갱신한다.
  // 초기화 클로저에서 setCoreMode/activeModeRef를 직접 참조해도 안전:
  //   • activeModeRef는 useRef이므로 항상 같은 객체
  //   • setCoreMode는 React가 동일 참조를 보장
  // barModeRef / noteModeRef — 안정적 프록시 (useRef로 렌더 간 동일 객체 참조 보장).
  // setter의 false 경로는 해당 모드가 실제로 활성화된 경우에만 beat로 클리어한다.
  // 이렇게 해야 다른 모드(예: score, note)에서 오래된 cleanup 코드가
  // barModeRef.current = false 를 호출해도 현재 모드를 덮어쓰지 않는다.
  const _barModeRefHolder = useRef<React.MutableRefObject<boolean>>({
    get current(): boolean { return activeModeRef.current === "bar"; },
    set current(v: boolean) {
      if (v) {
        setCoreModeAndRef("bar");
      } else if (activeModeRef.current === "bar") {
        // false 경로: 현재 bar 모드일 때만 beat로 클리어 (다른 모드는 no-op)
        setCoreModeAndRef("beat");
      }
    },
  });
  const barModeRef = _barModeRefHolder.current;
  const _noteModeRefHolder = useRef<React.MutableRefObject<boolean>>({
    get current(): boolean { return activeModeRef.current === "note"; },
    set current(v: boolean) {
      if (v) {
        setCoreModeAndRef("note");
      } else if (activeModeRef.current === "note") {
        // false 경로: 현재 note 모드일 때만 beat로 클리어 (다른 모드는 no-op)
        setCoreModeAndRef("beat");
      }
    },
  });
  const noteModeRef = _noteModeRefHolder.current;
  const [keyBindings, setKeyBindings] = useState<KeyBindingsMap>(DEFAULT_BINDINGS);
  const keyBindingsRef = useRef<KeyBindingsMap>(DEFAULT_BINDINGS);
  useEffect(() => { keyBindingsRef.current = keyBindings; }, [keyBindings]);
  const [showKbShortcuts, setShowKbShortcuts] = useState(false);
  const showKbShortcutsRef = useRef(false);
  useEffect(() => { showKbShortcutsRef.current = showKbShortcuts; }, [showKbShortcuts]);
  const [showSubdivisionLongPressHint, setShowSubdivisionLongPressHint] = useState(false);
  const [showNativeKbHint, setShowNativeKbHint] = useState(false);
  const showNativeKbHintRef = useRef(false);
  useEffect(() => { showNativeKbHintRef.current = showNativeKbHint; }, [showNativeKbHint]);
  const stopwatchTimerRef = useRef<StopwatchTimerHandle>(null);
  const stopwatchTimerLandscapeRef = useRef<StopwatchTimerHandle>(null);
  const barAreaRef = useRef<View>(null);
  const barAreaLayoutRef = useRef({ y: 0, height: 0 });
  const barScrollOffsetRef = useRef(0);

  const { dialConfigRef } = useDialConfig();

  const [progressInfo, setProgressInfo] = useState<ProgressInfo | null>(null);
  const [layerProgressMap, setLayerProgressMap] = useState<Record<string, number>>({});
  const [randomBarSession, setRandomBarSession] = useState<BarRandomSession | null>(null);
  const randomBarSessionRef = useRef<BarRandomSession | null>(null);
  const randomBarViewportCapacityRef = useRef(4);
  const randomBarChunkStartRef = useRef(0);
  const randomBarChunkLengthRef = useRef(0);
  const randomBarPreparedChunkRef = useRef<{
    chunk: number[];
    nextSession: BarRandomSession;
  } | null>(null);
  const updateRandomBarSession = useCallback((session: BarRandomSession | null) => {
    randomBarSessionRef.current = session;
    setRandomBarSession(session ? { ...session, order: [...session.order] } : null);
  }, []);

  // 악보 서브-모드 ("list" | "editor"); coreMode==="score"일 때만 의미 있음.
  const [scoreSubMode, setScoreSubMode] = useState<"list" | "editor">("list");
  const scoreMode: "list" | "editor" | null = coreMode === "score" ? scoreSubMode : null;
  // setScoreMode — 하위 호환 래퍼 (모드 변경 + 서브-모드 설정)
  const setScoreMode = useCallback((m: "list" | "editor" | null) => {
    if (m === null) setCoreModeAndRef("beat");
    else { setCoreModeAndRef("score"); setScoreSubMode(m); }
  }, [setCoreModeAndRef]);
  const [scoreEditorDoc, setScoreEditorDoc] = useState<ScoreDocument | null>(null);
  const [noteQueue, setNoteQueue] = useState<PracticeEntry[]>([]);
  const noteQueueRef = useRef<PracticeEntry[]>([]);
  useEffect(() => { noteQueueRef.current = noteQueue; }, [noteQueue]);
  const [notePlayMode, setNotePlayMode] = useState<"once" | "loop" | "random">("once");
  const notePlayModeRef = useRef<"once" | "loop" | "random">("once");
  useEffect(() => { notePlayModeRef.current = notePlayMode; }, [notePlayMode]);
  const [noteCurrentIndex, setNoteCurrentIndex] = useState(-1);
  const noteCurrentIndexRef = useRef(-1);
  useEffect(() => { noteCurrentIndexRef.current = noteCurrentIndex; }, [noteCurrentIndex]);
  const [noteIsPlaying, setNoteIsPlaying] = useState(false);
  const noteIsPlayingRef = useRef(false);
  useEffect(() => { noteIsPlayingRef.current = noteIsPlaying; }, [noteIsPlaying]);
  const [noteMeasureCount, setNoteMeasureCount] = useState(0);
  const noteMeasureCountRef = useRef(0);
  const noteFirstBeatFiredRef = useRef(false);
  // 악보-마디 프리셋 전환: 연습장 캐시 + 버전 카운터 → usePracticeBookLoad 소유
  const [noteBarEntries, setNoteBarEntries] = useState<PracticeEntry[]>([]);
  const noteAdvanceQueueRef = useRef<() => void>(() => {});
  const noteShuffledIndicesRef = useRef<number[]>([]);
  const noteShuffledPosRef = useRef(0);

  const [isDragging, setIsDragging] = useState(false);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [dragPattern, setDragPattern] = useState<BeatType[] | null>(null);
  const [dropTargetBeat, setDropTargetBeat] = useState<number | null>(null);
  const dragModeRef = useRef<"bar" | "beat" | null>(null);
  const clearDragState = useCallback(() => {
    dragModeRef.current = null;
    setIsDragging(false);
    setDragPattern(null);
    setDragPos({ x: 0, y: 0 });
    setDropTargetBeat(null);
  }, []);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const isPreparingRef = useRef(false);
  useEffect(() => { isPreparingRef.current = isPreparing; }, [isPreparing]);
  const preparingCancelledRef = useRef(false);
  // volume / sampleVolume state → useSettings 소유. refs 는 파라미터로 여기서 생성.
  const volumeRef = useRef(0.75);
  /** 폴리곤 모드 비트 핸들러 ref — 엔진 오디오 콜백에서 매 비트마다 호출된다 */
  const polygonOnBeatRef = useRef<(() => void) | null>(null);
  const sampleVolumeRef = useRef(0.8);
  const renderGenerationRef = useRef(0);
  // 단일 활성 모달 상태 머신: null = 모달 없음. openExclusive로만 전환해 mutual exclusion 보장.
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const {
    showSettings,
    showMenu,
    showSignalGen,
    showTuningGuide,
    showPracticeBook,
    showWorkUp,
    showOnboarding,
    showDrumKit,
    showScheduledStart,
    showFadeOut,
    showBpmDetect,
    showPolygon,
  } = deriveModalFlags(activeModal);
  // soundSet/layerSoundSets/flashMode/hapticMode/audioOffsetMs/timerStopMode/
  // landscapeReversed/beatDirection/username → useSettings 소유
  const tuningGuideOnSelectRef = useRef<((freq: number) => void) | null>(null);
  // SignalGenerator → TuningGuide 전환 시 SignalGen을 닫고, TuningGuide
  // 종료 직후 자동으로 SignalGen을 재오픈하기 위한 플래그.
  // 단일 활성 모달 보장(태스크 #70)을 위해 두 모달의 동시 visible=true를 금지한다.
  const reopenSignalGenAfterTuningGuideRef = useRef(false);
  const [loggingEnabled, setLoggingEnabled] = useState(false);
  const practiceStartRef = useRef<number | null>(null);
  const practiceSessionRef = useRef<PracticeSessionTracker | null>(null);
  const featureStartRef = useRef<{ name: string; start: number } | null>(null);
  const loadedPracticeNoteRef = useRef<{ id: string; label: string } | null>(null);
  const { completedGoalPopups, checkCompletedGoals, dismissGoalPopup } = useGoalPopups();
  const {
    roomTrackingActive, setRoomTrackingActive,
    trackingRoomName, setTrackingRoomName,
    startRoomTracking, stopRoomTracking, discardRoomTracking,
  } = usePracticeRoomTracking(checkCompletedGoals, loggingEnabled);
  const [showReboot, setShowReboot] = useState(false);
  const {
    fadeOutSessionRef, fadeOutMutedRef, fadeOutPhase, setFadeOutPhase,
    fadeOutMeasureInPhase, setFadeOutMeasureInPhase, fadeOutMeasureCountRef,
    clearFadeOutSession, fadeOutStatusText,
  } = useFadeOutSession(isPlaying, t);


  // Tracks which modal opened settings, so we can return there on close
  const settingsReturnModalRef = useRef<ActiveModal>(null);

  // Tracks whether a full-screen item was opened from the main menu.
  // This lives in the screen hook (rather than a UI component) so Android's
  // hardware-back handler follows the same return path as on-screen close buttons.
  const menuItemReturnRef = useRef(false);
  const markMenuItemReturn = useCallback(() => {
    menuItemReturnRef.current = true;
  }, []);
  const clearMenuItemReturn = useCallback(() => {
    menuItemReturnRef.current = false;
  }, []);
  const closeMenuItem = useCallback(() => {
    const target = getMenuItemCloseTarget(menuItemReturnRef.current);
    menuItemReturnRef.current = false;
    setActiveModal(target);
  }, []);

  const closeScoreMode = useCallback(() => {
    setScoreEditorDoc(null);
    setScoreMode(null);
    // Score is opened from the Lab menu. Its X should close the score surface
    // and return to that menu, matching the other Lab tools.
    closeMenuItem();
  }, [closeMenuItem, setScoreMode]);

  const closeAllModals = useCallback(() => {
    tuningGuideOnSelectRef.current = null;
    clearMenuItemReturn();
    setActiveModal(null);
    setLandscapeImageModalVisible(false);
    setRecorderTarget(null);
  }, [clearMenuItemReturn]);

  const openExclusive = useCallback((modal: ActiveModal) => {
    tuningGuideOnSelectRef.current = null;
    if (modal === "polygon") playbackModeRef.current = "polygon";
    setActiveModal(modal);
  }, []);
  const [customSoundSets, setCustomSoundSets] = useState<Record<string, CustomSoundSetConfig>>({});
  const customSoundSetsRef = useRef<Record<string, CustomSoundSetConfig>>({});
  useEffect(() => { customSoundSetsRef.current = customSoundSets; }, [customSoundSets]);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const onBack = () => {
      if (showSettings) { setActiveModal(null); return true; }
      if (showTuningGuide) {
        tuningGuideOnSelectRef.current = null;
        // SignalGen에서 진입했었다면 back으로 닫을 때도 재오픈한다.
        if (reopenSignalGenAfterTuningGuideRef.current) {
          reopenSignalGenAfterTuningGuideRef.current = false;
          setActiveModal("signalGen");
        } else {
          setActiveModal(null);
        }
        return true;
      }
      if (showSignalGen) {
        tuningGuideOnSelectRef.current = null;
        reopenSignalGenAfterTuningGuideRef.current = false;
        closeMenuItem();
        return true;
      }
      if (showPracticeBook) { closeMenuItem(); return true; }
      if (showWorkUp) { closeMenuItem(); return true; }
      if (showFadeOut) { setActiveModal(null); return true; }
      if (showScheduledStart) { setActiveModal(null); return true; }
      if (showDrumKit) { setActiveModal(null); return true; }
      if (showBpmDetect) { setActiveModal(null); return true; }
      if (showPolygon) { closeMenuItem(); return true; }
      if (showMenu) { clearMenuItemReturn(); setActiveModal(null); return true; }
      if (showOnboarding) { setActiveModal(null); return true; }
      if (showReboot) { setShowReboot(false); return true; }
      if (coreMode === "score") {
        closeScoreMode();
        return true;
      }
      if (barModeRef.current) { setBarMode(false); barModeRef.current = false; return true; }
      Alert.alert("앱 종료", "앱을 종료하시겠습니까?", [
        { text: "취소", style: "cancel" },
        { text: "종료", style: "destructive", onPress: () => BackHandler.exitApp() },
      ]);
      return true;
    };
    const sub = BackHandler.addEventListener("hardwareBackPress", onBack);
    return () => sub.remove();
  }, [activeModal, showReboot, coreMode, closeScoreMode, closeMenuItem, clearMenuItemReturn, setScoreMode]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        engineRef.current?.resyncTiming();
      }
    });
    return () => sub.remove();
  }, []);

  // ── 권한 복구 토스트 ────────────────────────────────────────────────────────
  const { permissionRecoveryToast, showRecoveryToast } = usePermissionRecoveryToast(t);
  const audioLifecycle = useAudioLifecycle();

  const noteSamplesHook = useNoteSamples();
  const noteSamplePersistStatus = useNoteSamplePersistenceStatus();
  const {
    samples: noteSamples,
    samplesRef: noteSamplesRef,
    setSamples: setNoteSamples,
    names: noteSampleNames,
    namesRef: noteSampleNamesRef,
    setNames: setNoteSampleNames,
    sources: noteSampleSources,
    sourcesRef: noteSampleSourcesRef,
    setSources: setNoteSampleSources,
    channels: noteSampleChannels,
    channelsRef: noteSampleChannelsRef,
    setChannels: setNoteSampleChannels,
    volumes: noteSampleVolumes,
    volumesRef: noteSampleVolumesRef,
    setVolumes: setNoteSampleVolumes,
    speeds: noteSampleSpeeds,
    speedsRef: noteSampleSpeedsRef,
    setSpeeds: setNoteSampleSpeeds,
  } = noteSamplesHook;
  // barMetronomeChannel/barCellOpacity/barRowHeight → useSettings 소유
  const [noteSampleMetroChannels, setNoteSampleMetroChannels] = useState<NoteSampleMetroChannelMap>({});
  const noteSampleMetroChannelsRef = useRef<NoteSampleMetroChannelMap>({});
  const [recorderTarget, setRecorderTarget] = useState<{ beat: number; sub: number } | null>(null);

  const { engineRef } = useMetronomeEngine();
  // The engine resets `currentBeat` when it stops. Keep the last main-bar
  // cursor so a stop notification/log still identifies the BPM just played.
  const activeBarIndexRef = useRef(0);
  const tapTimesRef = useRef<number[]>([]);
  const dialRef = useRef<View>(null);
  const dialCenterRef = useRef({ x: 0, y: 0 });

  // ── Refs shared between useSettings and useAudioPipeline ─────────────────────
  // Created here so both hooks can receive them as params.
  // clickPCMCacheRef / webClickReadyRef / noteSampleSoundsRef were previously
  // owned by useAudioPipeline; they now live here so useSettings (called first)
  // can also access them in updateSoundSet / updateSampleVolume.
  const clickPCMCacheRef = useRef<Record<string, import("@/lib/audio-renderer").ClickPCMs>>({});
  const webClickReadyRef = useRef(false);
  const noteSampleSoundsRef = useRef<Record<string, import("expo-audio").AudioPlayer>>({});
  // Shared by the settings control and the engine's audio callbacks.  It is
  // intentionally created before both hooks so a sound-set change is audible
  // on the very next tick, even before React rerenders the audio pipeline.
  const soundSetRef = useRef<SoundSet>("classic");

  // Stable refs for callbacks that come from useAudioPipeline (called after useSettings).
  // useSettings' loadSettings effect fires asynchronously, so by the time it runs
  // both hooks have already been called and .current is populated.
  const scheduleReRenderCallbackRef = useRef<() => void>(() => {});
  const applyAudioSettingsCallbackRef = useRef<
    (s: Partial<{ backgroundPlay: boolean; autoResumeAfterInterruption: boolean }>) => void
  >(() => {});

  // ── Settings (persistent state + load effect + update callbacks) ──────────────
  const {
    bpm, setBpm, bpmRef,
    halfTime, setHalfTime,
    beatDenominator, setBeatDenominator,
    beatsPerMeasure, setBeatsPerMeasure,
    beatTypes, setBeatTypes,
    subdivisionPattern, setSubdivisionPattern,
    beatSubdivisions, setBeatSubdivisions,
    volume, setVolume,
    sampleVolume, setSampleVolume,
    soundSet, setSoundSet,
    layerSoundSets, setLayerSoundSets, layerSoundSetsRef,
    flashMode, setFlashMode, flashModeRef,
    hapticMode, setHapticMode,
    audioOffsetMs, setAudioOffsetMs,
    timerStopMode, setTimerStopMode,
    landscapeReversed, setLandscapeReversed,
    beatDirection, setBeatDirection,
    username, setUsername,
    barMetronomeChannel, setBarMetronomeChannel, barMetronomeChannelRef,
    barCellOpacity, setBarCellOpacity,
    barRowHeight, setBarRowHeight,
    barRandomStrategy, setBarRandomStrategy,
    stageSettings, updateStageSettings,
    persistSettings,
    invalidateSettingsLoad,
    cancelSettingsPersistence,
    persistStatus,
    persistAudioSettingsCallbackRef,
    syncExternalSnapshot,
    updateVolume, updateSampleVolume, updateSoundSet,
    updateFlashMode, updateHapticMode, updateAudioOffset,
    updateBpm, updateTimerStopMode, updateUsername,
  } = useSettings({
    mode: settingsMode,
    engineRef,
    baseBpmRef,
    volumeRef,
    sampleVolumeRef,
    beatDenominatorRef,
    noteSampleSoundsRef,
    clickPCMCacheRef,
    webClickReadyRef,
    soundSetRef,
    scheduleReRenderCallbackRef,
    applyAudioSettingsCallbackRef,
    onSettingsLoaded: (settings) => {
      // `configureEngine` restores playback from this ref, while useSettings
      // restores the visible state separately. Keep the two snapshots aligned
      // after an app restart so saved beat subdivisions are audible.
      if (settingsMode !== "bar") {
        dialConfigRef.current = hydrateDialConfigFromSettings(dialConfigRef.current, settings);
      }
      if (settings.themeColor) setThemeColor(settings.themeColor);
      if (settings.showLandscapeImage !== undefined) setShowLandscapeImage(settings.showLandscapeImage);
      if (settings.landscapeContentType) setLandscapeContentType(settings.landscapeContentType);
      loadCustomSoundSets().then(setCustomSoundSets);
      setIsLoaded(true);
      // PCM warmup for the loaded sound-set
      const set = settings.soundSet || "classic";
      const src = soundSets[set as keyof typeof soundSets] || soundSets.classic;
      Promise.all([
        loadAssetPCM(src.strong),
        loadAssetPCM(src.high),
        loadAssetPCM(src.low),
      ]).then(([strong, high, low]) => {
        clickPCMCacheRef.current[set] = { strong, high, low };
      }).catch(() => {});
    },
  });

  useEffect(() => {
    let cancelled = false;
    loadModeKeyBindings(settingsMode).then((kb) => {
      if (cancelled) return;
      setKeyBindings(kb);
      keyBindingsRef.current = kb;
    });
    return () => { cancelled = true; };
  }, [settingsMode]);

  const randomBarConfig = useMemo<BarRandomConfig>(
    () => ({ ...DEFAULT_BAR_RANDOM_CONFIG, strategy: barRandomStrategy }),
    [barRandomStrategy],
  );
  const randomBarConfigRef = useRef(randomBarConfig);
  useEffect(() => { randomBarConfigRef.current = randomBarConfig; }, [randomBarConfig]);
  const setRandomBarConfig = useCallback((config: BarRandomConfig) => {
    setBarRandomStrategy(config.strategy);
    persistSettings({ barRandomStrategy: config.strategy });
  }, [persistSettings, setBarRandomStrategy]);

  // ── 비트 모드 빠른 저장 ────────────────────────────────────────────────────
  const {
    beatQuickSaveModalVisible, setBeatQuickSaveModalVisible,
    beatQuickSaveName, setBeatQuickSaveName,
    beatQuickSaveToast,
    handleBeatQuickSaveOpen, handleBeatQuickSaveCancel, handleBeatQuickSaveConfirm,
  } = useBeatQuickSave({ bpm, beatsPerMeasure, beatTypes, beatSubdivisions, subdivisionPattern, username, t });

  // ── Audio pipeline (player pool + PCM cache + rendered player + audio session settings) ──
  const {
    // Player pool (now owned by the pipeline)
    allPlayersRef, highToggle, lowToggle, strongToggle,
    // Audio-session settings (now owned by the pipeline)
    backgroundPlay, autoResumeAfterInterruption,
    updateBackgroundPlay, updateAutoResumeAfterInterruption, applyAudioSettings,
    // PCM / rendered-player refs & functions
    renderedPlayerRef, samplePCMCacheRef, renderedUrlRef,
    webRenderedLoopRef, activateWebRenderedLoop, lastAudioFireRef,
    armAudioWatchdogRef, clearAudioWatchdogRef,
    samplePlayStateRef,
    buildRenderedPlayer, scheduleReRender, stopRenderedAudio, warmupAudioPlayers,
    getClickPCMs, getSamplePCMs, getLayerClickPCMsForSchedule,
    invalidateSamplePCMCache, preloadNoteSampleSounds, clearSamplePlayStates,
    armAudioWatchdog, clearAudioWatchdog,
    scheduleRealtimeWebClick, clearRealtimeWebAudio,
  } = useAudioPipeline({
    engineRef, soundSet, soundSetRef, volume, customSoundSetsRef,
    layerSoundSetsRef, noteSamplesRef, noteSampleChannelsRef, noteSampleVolumesRef, noteSampleSpeedsRef, barModeRef,
    barMetronomeChannelRef, noteSampleMetroChannelsRef, volumeRef, sampleVolumeRef,
    clickPCMCacheRef, webClickReadyRef, noteSampleSoundsRef,
    renderGenerationRef,
    isPlayingRef, bpmRef, t, showRecoveryToast, persistAudioSettingsCallbackRef,
  });

  // 폴리곤은 엔진의 메인 비트 콜백을 시계로만 사용하고, 자체 레이어 소리만 낸다.
  // 기존 렌더링 루프는 진입 전부터 일반 클릭을 포함할 수 있으므로 함께 중지한다.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setBaseClickMuted(showPolygon);
    if (showPolygon) stopRenderedAudio();
    return () => {
      engine.setBaseClickMuted(false);
    };
  }, [showPolygon, stopRenderedAudio]);

  // ── Post-pipeline: populate stable callback refs & sync external snapshot ───
  // Inline updates — run every render, not inside a useEffect (they are ref
  // mutations, safe to call during render).
  scheduleReRenderCallbackRef.current = scheduleReRender;
  applyAudioSettingsCallbackRef.current = applyAudioSettings;
  syncExternalSnapshot({
    backgroundPlay,
    autoResumeAfterInterruption,
    showLandscapeImage,
    landscapeContentType,
  });

  // ── stopIfPlaying — explicit stop interface passed to useBarMode ──────────
  // Bundles engine.stop() + rendered-audio teardown + state reset so that
  // useBarMode has no dependency on stopRenderedAudio / clearSamplePlayStates
  // / setIsPlaying / setIsPreparing.
  const stopIfPlayingRef = useRef<() => void>(() => {});
  const stopIfPlaying = useCallback(() => stopIfPlayingRef.current(), []);

  // ── Bar mode domain ───────────────────────────────────────────────────────
  /** Global BPM saved on bar mode entry; restored on exit. */
  const prevGlobalBpmRef = useRef<number>(120);

  const {
    barConfigRef,
    barBpm, setBarBpm, barBpmRef,
    barRepeats, setBarRepeats,
    loopBlocks, setLoopBlocks,
    barStartBeat, setBarStartBeat,
    barLoopMode, setBarLoopMode,
    blockPlayMode, setBlockPlayMode,
    barStartBeatRef,
    barLoopModeRef,
    blockPlayModeRef,
    handleBarModeChange: barModeHandleBarModeChange,
    handleBarBpmChange,
    handleBarRepeatChange,
    handleBarMeterChange,
    handleLoopBlocksChange,
    handleBarReset,
    handleBarQuickSave,
    handleAddBar,
    handleDeleteBar,
    handleCopyBar,
    handleInsertBarAfter,
    handleReorderBar,
  } = useBarMode({
    engineRef,
    barModeRef,
    setBarMode,
    dialConfigRef,
    stopIfPlaying,
    isPlayingRef,
    beatsPerMeasure, setBeatsPerMeasure,
    beatTypes, setBeatTypes,
    beatSubdivisions, setBeatSubdivisions,
    subdivisionPattern,
    setSubdivisionPattern,
    noteSamples, setNoteSamples, noteSamplesRef,
    noteSampleNames, setNoteSampleNames, noteSampleNamesRef,
    noteSampleSources, setNoteSampleSources, noteSampleSourcesRef,
    noteSampleChannels, setNoteSampleChannels, noteSampleChannelsRef,
    noteSampleVolumes, setNoteSampleVolumes, noteSampleVolumesRef,
    noteSampleSpeeds, setNoteSampleSpeeds, noteSampleSpeedsRef,
    setNoteSampleMetroChannels,
    noteSampleMetroChannelsRef,
    noteSampleSoundsRef,
    samplePlayStateRef,
    preloadNoteSampleSounds,
    onBarBpmChange: (newBpm) => {
      // Bar mode owns a separate base BPM. Keep the dial setting untouched
      // while making the bar engine tempo change immediately audible.
      engineRef.current?.setBpm(
        toEngineBpm(newBpm, beatDenominatorRef.current),
      );
      scheduleReRender();
    },
    beatDenominatorRef,
    username,
    persistSettings,
    scheduleReRender,
    t,
  });

  /**
   * Wraps barMode's handleBarModeChange with BPM isolation logic:
   *   enter → save prevGlobalBpm, sync barBpm to current global BPM
   *   exit  → restore prevGlobalBpm via updateBpm
   */
  const handleBarModeChange = useCallback((toBarMode: boolean) => {
    if (toBarMode) {
      // Snapshot current global BPM before entering bar mode
      prevGlobalBpmRef.current = bpmRef.current;
      // A returning bar session keeps its own base BPM. Only a brand-new bar
      // session inherits the current dial BPM.
      const nextBarBpm = barConfigRef.current.hasBeenConfigured
        ? barBpmRef.current
        : bpmRef.current;
      barBpmRef.current = nextBarBpm;
      setBarBpm(nextBarBpm);
      barModeHandleBarModeChange(true);
      // The dial BPM is intentionally preserved until bar mode exits. Apply
      // the bar session's own base BPM directly to the engine instead.
      engineRef.current?.setBpm(
        toEngineBpm(nextBarBpm, beatDenominatorRef.current),
      );
    } else {
      barModeHandleBarModeChange(false);
      // Restore global BPM to the value before bar mode was entered
      updateBpmRef.current(prevGlobalBpmRef.current);
    }
  }, [barModeHandleBarModeChange, setBarBpm, barBpmRef]);

  const getPlaybackContext = useCallback((
    overrides: { mode?: unknown; bpm?: number; activeBarIndex?: number } = {},
  ): PlaybackContext => resolvePlaybackContext({
    mode: overrides.mode ?? playbackModeRef.current,
    language: languageRef.current,
    globalBpm: overrides.bpm ?? bpmRef.current,
    barBpm: barBpmRef.current,
    barConfig: barConfigRef.current,
    activeBarIndex: overrides.activeBarIndex ?? (barModeRef.current
      ? (engineRef.current?.getIsRunning()
        ? engineRef.current.getCurrentBeat()
        : activeBarIndexRef.current)
      : undefined),
  }), []);

  const setPlaybackBpm = useCallback((nextBpm: number, playback: PlaybackContext) => {
    const clamped = Math.max(20, Math.min(300, Math.round(nextBpm)));
    if (playback.mode === "bar") {
      if (playback.bpmSource === "bar_override" && playback.activeBarIndex !== undefined) {
        const repeat = barConfigRef.current.barRepeats[playback.activeBarIndex];
        if (repeat) {
          handleBarRepeatChange(playback.activeBarIndex, { ...repeat, bpm: clamped });
          return;
        }
      }
      handleBarBpmChange(clamped);
      return;
    }
    updateBpmRef.current(clamped);
  }, [handleBarBpmChange, handleBarRepeatChange]);

  const getPlaybackContextRef = useRef<() => PlaybackContext>(() => getPlaybackContext());
  getPlaybackContextRef.current = () => getPlaybackContext();
  const setPlaybackBpmRef = useRef<(bpm: number, context: PlaybackContext) => void>(() => {});
  setPlaybackBpmRef.current = setPlaybackBpm;

  // ── 웹 AudioContext 잠금 해제 (audio unlock) ─────────────────────────────
  // Chrome의 Autoplay Policy: AudioContext는 사용자 제스처 이후에만 resume 가능.
  // 첫 번째 포인터/터치/키보드 이벤트에서 즉시 ctx.resume()을 호출해두면
  // 이스터에그 트리거·재생 버튼 등 모든 오디오 경로에서 컨텍스트가 이미 실행 중임이 보장된다.
  useEffect(() => {
    if (Platform.OS !== "web") return;
    let unlocked = false;
    const unlock = () => {
      if (unlocked) return;
      unlocked = true;
      const ctx = getWebAudioContext();
      if (ctx && ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }
      // 이벤트 리스너 제거 (1회만 실행)
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("keydown", unlock, true);
    };
    window.addEventListener("pointerdown", unlock, true);
    window.addEventListener("keydown", unlock, true);
    return () => {
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("keydown", unlock, true);
    };
  }, []);

  // 재생 시작 1회만 풀 cut-off 위험 측정 (관측 전용).
  // prev 게이트로 false→true edge에서만 통과. 재생 중 bpm/분할 변경 시 effect는
  // 재실행되지만 wasPlaying=true이므로 즉시 반환 → notify 스팸 없음.
  // 추가로 동일 risk 키 중복 억제(세션 내 dedupe).
  const prevIsPlayingRef = useRef(false);
  const lastCutoffRiskKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const wasPlaying = prevIsPlayingRef.current;
    prevIsPlayingRef.current = isPlaying;
    // 재생 정지 시 dedupe 키 리셋 → "재생 세션당 1회" 의미로 명확화
    if (!isPlaying) {
      if (wasPlaying) lastCutoffRiskKeyRef.current = null;
      return;
    }
    if (wasPlaying) return;
    const sub = Math.max(1, subdivisionPattern?.length ?? 1);
    const risk = detectPoolCutoffRisk(bpm, sub, 2);
    if (!risk.atRisk) return;
    const key = `${risk.recommended}|${sub}|${Math.round(bpm / 10)}`;
    if (lastCutoffRiskKeyRef.current === key) return;
    lastCutoffRiskKeyRef.current = key;
    notifyAudioPoolFallback("cutoff-risk-detected", {
      bpm,
      subdivisions: sub,
      recommended: risk.recommended,
      current: risk.current,
    });
  }, [isPlaying, bpm, subdivisionPattern]);

  const flashOpacity = useSharedValue(0);
  const halfTimeFlash = useSharedValue(0);
  /** 비트 진행률: 각 비트 시작 시 0 → 다음 비트까지 1 로 sweep. StageBeatArc 구동. */
  const beatProgress = useSharedValue(0);
  /** 모드 전환 슬라이드 애니메이션: 좌우(X) 또는 위→아래(Y) */
  const modeSlideX       = useSharedValue(0);
  const modeSlideY       = useSharedValue(0);
  const modeSlideOpacity = useSharedValue(1);

  const flashStyle = useAnimatedStyle(() => ({
    opacity: flashOpacity.value,
  }));
  const halfTimeFlashStyle = useAnimatedStyle(() => ({
    opacity: halfTimeFlash.value,
  }));
  const modeSlideStyle = useAnimatedStyle(() => ({
    opacity: modeSlideOpacity.value,
    transform: [{ translateX: modeSlideX.value }, { translateY: modeSlideY.value }],
  }));

  useEffect(() => {
    runStorageMigrations().catch(() => {});

    const engine = new MetronomeEngine();
    engineRef.current = engine;

    const restartPlayer = (active: any) => {
      if (Platform.OS === "web") return;
      try {
        Promise.resolve(active.seekTo(0)).then(() => {
          safePlay(active, "metronome.restartPlayer");
        });
      } catch (e) {}
    };

    const pickSlot = (p: SoundSetPlayers, role: "high" | "low" | "strong", idx: number) => {
      const i = idx % BUILTIN_POOL_SIZE;
      if (role === "strong") return i === 0 ? p.strongA : i === 1 ? p.strongB : i === 2 ? p.strongC : p.strongD;
      if (role === "high") return i === 0 ? p.highA : i === 1 ? p.highB : i === 2 ? p.highC : p.highD;
      return i === 0 ? p.lowA : i === 1 ? p.lowB : i === 2 ? p.lowC : p.lowD;
    };

    const getCustomPlayer = (role: "high" | "low" | "strong", idx: number) => {
      const set = soundSetRef.current;
      const customs = customSoundSetsRef.current;
      const customCfg = customs[set];
      if (customCfg) {
        const mapping = role === "strong" ? customCfg.strong : role === "high" ? customCfg.accent : customCfg.normal;
        if (mapping.type === "custom" && mapping.sampleUri) {
          return pickSlot(allPlayersRef.current.classic, role, idx);
        }
        const srcSet = mapping.sourceSet || "classic";
        const srcPlayers = allPlayersRef.current[srcSet as keyof BuiltinPlayers] || allPlayersRef.current.classic;
        if (!allPlayersRef.current[srcSet as keyof BuiltinPlayers]) {
          notifyAudioPoolFallback("custom-mapping-missing-source", { role, soundSet: set, requestedSourceSet: srcSet });
        }
        const r = (mapping.sourceRole || "strong") as "high" | "low" | "strong";
        return pickSlot(srcPlayers, r, idx);
      }
      const players = allPlayersRef.current[set as keyof typeof allPlayersRef.current] || allPlayersRef.current.classic;
      return pickSlot(players, role, idx);
    };

    // Every audible path must report activity to the watchdog. Layer/block
    // callbacks were previously omitted, which could label healthy playback as
    // "recovering" and trigger an unnecessary restart.
    const recordAudibleTick = () => {
      lastAudioFireRef.current = Date.now();
      if (getAudioLifecycleSnapshot().phase === "recovering") {
        markAudioRecoverySucceeded();
      }
    };

    let realtimeReservationDebugCount = 0;
    engine.setRealtimeAudioScheduler(
      Platform.OS === "web"
        ? (tick, atPerformanceTime) => {
            if (fadeOutMutedRef.current) return false;
            const role = beatTypeToClickRole(tick.type);
            if (__DEV__ && realtimeReservationDebugCount < 12) {
              console.info("[beat-audio-trace] reserve", {
                sequence: realtimeReservationDebugCount,
                beat: tick.beat,
                subBeat: tick.subBeat,
                type: tick.type,
                role,
                atPerformanceTime: Math.round(atPerformanceTime),
              });
              if (typeof document !== "undefined") {
                const trace = document.getElementById("beat-audio-trace");
                if (trace) {
                  const roles = `${trace.dataset.roles ?? ""}${role?.[0] ?? "m"}`;
                  trace.dataset.roles = roles;
                  const configured = trace.textContent?.split(" R:")[0] ?? "C:?";
                  trace.textContent = `${configured} R:${roles}`;
                }
              }
              realtimeReservationDebugCount += 1;
            }
            if (!role) return true;
            const channel = barModeRef.current
              ? (noteSampleMetroChannelsRef.current[String(tick.beat)] ?? barMetronomeChannelRef.current)
              : "both";
            return scheduleRealtimeWebClick(role, channel, atPerformanceTime);
          }
        : null,
      clearRealtimeWebAudio,
    );

    engine.setAudioCallbacks(
      () => {
        if (fadeOutMutedRef.current) return;
        if (Platform.OS === "web") {
          const ch = barModeRef.current
            ? (noteSampleMetroChannelsRef.current[String(engine.getCurrentBeat())] ?? barMetronomeChannelRef.current)
            : "both";
          if (playWebClick("high", ch)) recordAudibleTick();
          return;
        }
        try {
          const active = getCustomPlayer("high", highToggle.current);
          highToggle.current = (highToggle.current + 1) % BUILTIN_POOL_SIZE;
          restartPlayer(active);
          recordAudibleTick();
        } catch (e) {}
      },
      () => {
        if (fadeOutMutedRef.current) return;
        if (Platform.OS === "web") {
          const ch = barModeRef.current
            ? (noteSampleMetroChannelsRef.current[String(engine.getCurrentBeat())] ?? barMetronomeChannelRef.current)
            : "both";
          if (playWebClick("low", ch)) recordAudibleTick();
          return;
        }
        try {
          const active = getCustomPlayer("low", lowToggle.current);
          lowToggle.current = (lowToggle.current + 1) % BUILTIN_POOL_SIZE;
          restartPlayer(active);
          recordAudibleTick();
        } catch (e) {}
      },
      () => {
        if (fadeOutMutedRef.current) return;
        if (Platform.OS === "web") {
          const ch = barModeRef.current
            ? (noteSampleMetroChannelsRef.current[String(engine.getCurrentBeat())] ?? barMetronomeChannelRef.current)
            : "both";
          if (playWebClick("strong", ch)) recordAudibleTick();
          return;
        }
        try {
          const active = getCustomPlayer("strong", strongToggle.current);
          strongToggle.current = (strongToggle.current + 1) % BUILTIN_POOL_SIZE;
          restartPlayer(active);
          recordAudibleTick();
        } catch (e) {}
      }
    );
    const layerToggle: Record<string, number> = {};
    engine.setLayerAudioCallback((layerIndex: number, role: "high" | "low" | "strong", soundSet?: string) => {
      if (fadeOutMutedRef.current) return;
      const layerSet = soundSet || layerSoundSetsRef.current[layerIndex] || soundSetRef.current;
      const toggleKey = `${layerIndex}-${role}`;
      const toggle = layerToggle[toggleKey] ?? 0;
      layerToggle[toggleKey] = (toggle + 1) % BUILTIN_POOL_SIZE;

      if (Platform.OS === "web") {
        const ch = barModeRef.current
          ? (noteSampleMetroChannelsRef.current[String(engine.getCurrentBeat())] ?? barMetronomeChannelRef.current)
          : "both";
        if (playWebClick(role === "strong" ? "strong" : role === "high" ? "high" : "low", ch)) {
          recordAudibleTick();
        }
        return;
      }

      try {
        const customs = customSoundSetsRef.current;
        const customCfg = customs[layerSet];
        let players: SoundSetPlayers;
        if (customCfg) {
          const mapping = role === "strong" ? customCfg.strong : role === "high" ? customCfg.accent : customCfg.normal;
          if (mapping.type === "builtin") {
            const srcSet = mapping.sourceSet || "classic";
            players = allPlayersRef.current[srcSet as keyof BuiltinPlayers] || allPlayersRef.current.classic;
            const r = (mapping.sourceRole || "strong") as "high" | "low" | "strong";
            restartPlayer(pickSlot(players, r, toggle));
            recordAudibleTick();
            return;
          }
          players = allPlayersRef.current.classic;
        } else {
          players = allPlayersRef.current[layerSet as keyof typeof allPlayersRef.current] || allPlayersRef.current.classic;
        }
        restartPlayer(pickSlot(players, role, toggle));
        recordAudibleTick();
      } catch (e) {}
    });

    const blockToggle: Record<string, number> = {};
    engine.setBlockAudioCallback((blockIndex: number, role: "high" | "low" | "strong") => {
      if (fadeOutMutedRef.current) return;
      const block = barConfigRef.current.loopBlocks[blockIndex];
      const blockSet = block?.soundSet || soundSetRef.current;
      const toggleKey = `blk-${blockIndex}-${role}`;
      const toggle = blockToggle[toggleKey] ?? 0;
      blockToggle[toggleKey] = (toggle + 1) % BUILTIN_POOL_SIZE;

      if (Platform.OS === "web") {
        const ch = barModeRef.current
          ? (noteSampleMetroChannelsRef.current[String(engine.getCurrentBeat())] ?? barMetronomeChannelRef.current)
          : "both";
        if (playWebClick(role === "strong" ? "strong" : role === "high" ? "high" : "low", ch)) {
          recordAudibleTick();
        }
        return;
      }

      try {
        const customs = customSoundSetsRef.current;
        const customCfg = customs[blockSet];
        let players: SoundSetPlayers;
        if (customCfg) {
          const mapping = role === "strong" ? customCfg.strong : role === "high" ? customCfg.accent : customCfg.normal;
          if (mapping.type === "builtin") {
            const srcSet = mapping.sourceSet || "classic";
            players = allPlayersRef.current[srcSet as keyof BuiltinPlayers] || allPlayersRef.current.classic;
            const r = (mapping.sourceRole || "strong") as "high" | "low" | "strong";
            restartPlayer(pickSlot(players, r, toggle));
            recordAudibleTick();
            return;
          }
          players = allPlayersRef.current.classic;
        } else {
          players = allPlayersRef.current[blockSet as keyof typeof allPlayersRef.current] || allPlayersRef.current.classic;
        }
        restartPlayer(pickSlot(players, role, toggle));
        recordAudibleTick();
      } catch (e) {}
    });


    // loadSettings は useSettings が担当。ここでは note-sample 관련만 처리.

    Promise.all([loadNoteSamples(), loadNoteSampleNames(), loadNoteSampleSources(), loadNoteSampleChannels(), loadNoteSampleVolumes(), loadNoteSampleSpeeds(), loadNoteSampleMetroChannels()]).then(async ([samples, names, sources, channels, volumes, speeds, metroChannels]) => {
      setNoteSamples(samples);
      noteSamplesRef.current = samples;
      setNoteSampleNames(names);
      noteSampleNamesRef.current = names;
      setNoteSampleSources(sources);
      noteSampleSourcesRef.current = sources;
      setNoteSampleChannels(channels);
      noteSampleChannelsRef.current = channels;
      setNoteSampleVolumes(volumes);
      noteSampleVolumesRef.current = volumes;
      setNoteSampleSpeeds(speeds);
      noteSampleSpeedsRef.current = speeds;
      setNoteSampleMetroChannels(metroChannels);
      noteSampleMetroChannelsRef.current = metroChannels;
      if (Object.keys(samples).length > 0) {
        await preloadNoteSampleSounds(samples);
      }
    }).catch(() => {});

    const sampleTimingCacheRef = { current: new Map<string, { startMs: number; durationMs: number }>() };

    const parseSampleTiming = (key: string): { startMs: number; durationMs: number } => {
      const cached = sampleTimingCacheRef.current.get(key);
      if (cached) return cached;
      const sampleUri = noteSamplesRef.current[key] || "";
      const hashParts = sampleUri.split("#t=")[1];
      let startMs = 0;
      let endMs = 0;
      if (hashParts) {
        const parts = hashParts.split(",").map(Number);
        if (!isNaN(parts[0])) startMs = parts[0];
        if (parts.length > 1 && !isNaN(parts[1])) endMs = parts[1];
      }
      const durationMs = endMs > startMs ? endMs - startMs : 0;
      const result = { startMs, durationMs };
      sampleTimingCacheRef.current.set(key, result);
      return result;
    };

    const playSampleAsync = (key: string, player: any) => {
      if (samplePlayStateRef.current[key]?.endTimer) {
        clearTimeout(samplePlayStateRef.current[key].endTimer!);
      }

      const { startMs, durationMs } = parseSampleTiming(key);
      samplePlayStateRef.current[key] = { playing: true, endTimer: null };

      const startSec = startMs / 1000;
      if (Platform.OS === "web") {
        try { player.seekTo(startSec); } catch {}
        setTimeout(() => safePlay(player, "preview.web.startMs"), 10);
      } else {
        try { player.pause(); } catch {}
        Promise.resolve(player.seekTo(startSec)).then(() => {
          safePlay(player, "preview.native.startMs");
        }).catch(() => {});
      }

      const effectiveDur = durationMs > 0
        ? durationMs
        : player.duration > 0
          ? (player.duration - startSec) * 1000
          : 0;
      if (effectiveDur > 0) {
        const timer = setTimeout(() => {
          try { player.pause(); } catch {}
          if (samplePlayStateRef.current[key]) {
            samplePlayStateRef.current[key].playing = false;
            samplePlayStateRef.current[key].endTimer = null;
          }
        }, effectiveDur / (noteSampleSpeedsRef.current[key] ?? 1));
        if (samplePlayStateRef.current[key]) {
          samplePlayStateRef.current[key].endTimer = timer;
        }
      }
    };

    engine.setCustomSampleCallback((beat: number, subBeat: number) => {
      if (fadeOutMutedRef.current) return false;
      if (!barModeRef.current) return false;
      const key = `${beat}-${subBeat}`;
      const player = noteSampleSoundsRef.current[key];
      if (player) {
        if (samplePlayStateRef.current[key]?.playing) return true;
        // Keep a saved per-sample level independent from the global sample master.
        // This also updates retained players after a metadata-only edit.
        player.volume = Math.max(0, Math.min(1, sampleVolumeRef.current * (noteSampleVolumesRef.current[key] ?? 1)));
        player.playbackRate = noteSampleSpeedsRef.current[key] ?? 1;
        player.shouldCorrectPitch = false;
        setTimeout(() => playSampleAsync(key, player), 0);
        return true;
      }
      return false;
    });

    loadLoggingEnabled().then((val) => setLoggingEnabled(val));
    AsyncStorage.getItem("metronome_landscape_image").then((val) => {
      if (val) setLandscapeImageUri(val);
    });
    AsyncStorage.getItem("metronome_onboarding_done").then((val) => {
      if (!val) {
        setActiveModal("onboarding");
      }
    });
    AsyncStorage.getItem("metronome_subdivision_longpress_hint_v1").then((val) => {
      if (!val) setShowSubdivisionLongPressHint(true);
    });
    setupNotificationControls();

    setTimeout(() => {
      warmupAudioPlayers().catch(() => {});
    }, 500);

    return () => {
      engine.cleanup();
      if (renderedPlayerRef.current) {
        try { renderedPlayerRef.current.release(); } catch {}
        renderedPlayerRef.current = null;
      }
      dismissNotification();
    };
  }, []);


  const handleNoteRecordRequest = useCallback((beatIndex: number, subIndex: number) => {
    setRecorderTarget({ beat: beatIndex, sub: subIndex });
  }, []);

  const handleNoteRecordSave = useCallback(async (uri: string, name: string, source: SampleSource, channel: SampleChannel, metronomeChannel: MetroChannel, sampleGain = 1, sampleSpeed = 1) => {
    if (!recorderTarget) return;
    const key = `${recorderTarget.beat}-${recorderTarget.sub}`;
    invalidateSamplePCMCache(key);
    const updated = await setNoteSample(recorderTarget.beat, recorderTarget.sub, uri, noteSamplesRef.current);
    setNoteSamples(updated);
    noteSamplesRef.current = updated;
    const updatedNames = await setNoteSampleName(recorderTarget.beat, recorderTarget.sub, name, noteSampleNamesRef.current);
    setNoteSampleNames(updatedNames);
    noteSampleNamesRef.current = updatedNames;
    const updatedSources = await setNoteSampleSource(recorderTarget.beat, recorderTarget.sub, source, noteSampleSourcesRef.current);
    setNoteSampleSources(updatedSources);
    noteSampleSourcesRef.current = updatedSources;
    const updatedChannels = await setNoteSampleChannel(recorderTarget.beat, recorderTarget.sub, channel, noteSampleChannelsRef.current);
    setNoteSampleChannels(updatedChannels);
    noteSampleChannelsRef.current = updatedChannels;
    const updatedVolumes = await setNoteSampleVolume(recorderTarget.beat, recorderTarget.sub, sampleGain, noteSampleVolumesRef.current);
    setNoteSampleVolumes(updatedVolumes);
    noteSampleVolumesRef.current = updatedVolumes;
    const updatedSpeeds = await setNoteSampleSpeed(recorderTarget.beat, recorderTarget.sub, sampleSpeed, noteSampleSpeedsRef.current);
    setNoteSampleSpeeds(updatedSpeeds);
    noteSampleSpeedsRef.current = updatedSpeeds;
    const updatedMetroChannels = await setNoteSampleMetroChannel(recorderTarget.beat, metronomeChannel, noteSampleMetroChannelsRef.current);
    setNoteSampleMetroChannels(updatedMetroChannels);
    noteSampleMetroChannelsRef.current = updatedMetroChannels;
    await preloadNoteSampleSounds(updated, true);
    scheduleReRender();
    setRecorderTarget(null);
  }, [recorderTarget, preloadNoteSampleSounds, invalidateSamplePCMCache, scheduleReRender]);

  const handleNoteRecordSuggestBpm = useCallback((detectedBpm: number) => {
    const clamped = Math.max(20, Math.min(300, Math.round(detectedBpm)));
    setBpm(clamped);
    engineRef.current?.setBpm(clamped * (4 / beatDenominatorRef.current));
  }, []);

  const handleNoteRecordDelete = useCallback(async () => {
    if (!recorderTarget) return;
    const key = `${recorderTarget.beat}-${recorderTarget.sub}`;
    invalidateSamplePCMCache(key);
    const updated = await removeNoteSample(recorderTarget.beat, recorderTarget.sub, noteSamplesRef.current);
    setNoteSamples(updated);
    noteSamplesRef.current = updated;
    const updatedNames = await removeNoteSampleName(recorderTarget.beat, recorderTarget.sub, noteSampleNamesRef.current);
    setNoteSampleNames(updatedNames);
    noteSampleNamesRef.current = updatedNames;
    const updatedSources = await removeNoteSampleSource(recorderTarget.beat, recorderTarget.sub, noteSampleSourcesRef.current);
    setNoteSampleSources(updatedSources);
    noteSampleSourcesRef.current = updatedSources;
    const updatedChannels = await removeNoteSampleChannel(recorderTarget.beat, recorderTarget.sub, noteSampleChannelsRef.current);
    setNoteSampleChannels(updatedChannels);
    noteSampleChannelsRef.current = updatedChannels;
    const updatedVolumes = await removeNoteSampleVolume(recorderTarget.beat, recorderTarget.sub, noteSampleVolumesRef.current);
    setNoteSampleVolumes(updatedVolumes);
    noteSampleVolumesRef.current = updatedVolumes;
    const updatedSpeeds = await removeNoteSampleSpeed(recorderTarget.beat, recorderTarget.sub, noteSampleSpeedsRef.current);
    setNoteSampleSpeeds(updatedSpeeds);
    noteSampleSpeedsRef.current = updatedSpeeds;
    const beatStillHasSamples = Object.keys(updated).some((k) => k.startsWith(`${recorderTarget.beat}-`));
    if (!beatStillHasSamples) {
      const updatedMetroChannels = await removeNoteSampleMetroChannel(recorderTarget.beat, noteSampleMetroChannelsRef.current);
      setNoteSampleMetroChannels(updatedMetroChannels);
      noteSampleMetroChannelsRef.current = updatedMetroChannels;
    }
    if (noteSampleSoundsRef.current[key]) {
      try { noteSampleSoundsRef.current[key].release(); } catch {}
      delete noteSampleSoundsRef.current[key];
    }
    await releaseStereoArtifact(key);
    scheduleReRender();
    setRecorderTarget(null);
  }, [recorderTarget, invalidateSamplePCMCache, scheduleReRender]);

  // flashModeRef は useSettings から返される

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;

    // 책임 경계: 이 화면에서 onBeat/onSubBeat/onProgress는 모두 "시각용"
    // 콜백으로만 사용된다(currentBeat/activeSubNote/progressInfo/layerProgressMap
    // setState). 오디오 재생·스케줄링은 엔진 내부 fireTick → playTickAudio가
    // 동기적으로 처리하므로 rAF 배칭의 영향을 받지 않는다. 향후 이 콜백에
    // 오디오/타이밍 의존 로직을 추가하려는 경우 배처를 우회하는 별도 경로가
    // 필요하다.
    // 모든 시각용 콜백은 rAF 배처로 합쳐 프레임당 한 번만 setState 한다.
    // BPM 200 · 16서브비트에서도 60Hz 이하 보장.
    let pendingBeat = -1;
    let pendingAccent = false;
    let pendingSubBeat = -1;
    let pendingProgress: typeof progressInfo = null;
    let hasBeatUpdate = false;
    let hasSubBeatUpdate = false;
    let hasProgressUpdate = false;
    let pendingLayerMap: Record<string, number> = {};
    let hasLayerUpdate = false;

    const batcher = createRafBatcher(() => {
      if (hasBeatUpdate) {
        hasBeatUpdate = false;
        setCurrentBeat(pendingBeat);
        const fm = flashModeRef.current;
        const shouldFlash = fm === "all" || fm === "both" || (fm === "accent" && pendingAccent);
        if (shouldFlash) {
          flashOpacity.value = withSequence(
            withTiming(0.12, { duration: 50 }),
            withTiming(0, { duration: 250, easing: Easing.out(Easing.quad) })
          );
        }
        // 비트 아크: 현재 비트에서 다음 비트까지 0→1 sweep (무대 모드 StageBeatArc 구동)
        beatProgress.value = 0;
        beatProgress.value = withTiming(1, { duration: Math.round(60000 / (bpmRef.current || 120)) });
      }
      if (hasSubBeatUpdate) {
        hasSubBeatUpdate = false;
        setActiveSubNote(pendingSubBeat);
      }
      if (hasProgressUpdate) {
        hasProgressUpdate = false;
        setProgressInfo(pendingProgress);
      }
      if (hasLayerUpdate) {
        hasLayerUpdate = false;
        setLayerProgressMap(prev => ({ ...prev, ...pendingLayerMap }));
        pendingLayerMap = {};
      }
    });

    engine.setOnBeat((beat: number, isAccent: boolean) => {
      // 폴리곤 모드: 메인 비트에서만 트리거 (서브비트·레이어비트 제외)
      polygonOnBeatRef.current?.();
      pendingBeat = beat;
      pendingAccent = isAccent;
      hasBeatUpdate = true;
      batcher.schedule();
      // 노트모드 재생 중 마디 카운트 추적
      if (noteModeRef.current && noteIsPlayingRef.current) {
        const wasFirst = !noteFirstBeatFiredRef.current;
        noteFirstBeatFiredRef.current = true;
        if (beat === 0 && !wasFirst) {
          noteMeasureCountRef.current += 1;
          setNoteMeasureCount(noteMeasureCountRef.current);
        }
      }
    });

    engine.setOnSubBeat((_beat: number, subBeat: number) => {
      activeSubNoteRef.current = subBeat;
      pendingSubBeat = subBeat;
      hasSubBeatUpdate = true;
      batcher.schedule();
    });

    engine.setOnProgress((info) => {
      if (info.layerIndex !== undefined && info.layerIndex > 0 && info.layerBeat !== undefined) {
        const key = `${info.blockIndex}:${info.layerIndex}`;
        pendingLayerMap[key] = info.layerBeat;
        hasLayerUpdate = true;
      } else {
        activeBarIndexRef.current = info.beat;
        const randomSession = randomBarSessionRef.current;
        if (randomSession?.active && info.randomSequenceIndex !== undefined) {
          const nextCursor = randomBarChunkStartRef.current + info.randomSequenceIndex;
          if (nextCursor !== randomSession.cursor) {
            randomSession.cursor = nextCursor;
            setRandomBarSession({ ...randomSession, order: [...randomSession.order] });
          }
          const prefetchAt = Math.max(
            0,
            randomBarChunkLengthRef.current - Math.max(1, randomBarViewportCapacityRef.current),
          );
          if (
            barLoopModeRef.current === "loop" &&
            randomBarPreparedChunkRef.current === null &&
            info.randomSequenceIndex >= prefetchAt
          ) {
            const nextLength = Math.max(2, randomBarViewportCapacityRef.current * 2);
            const nextSession: BarRandomSession = {
              ...randomSession,
              order: [...randomSession.order],
              remainingShuffleBag: [...randomSession.remainingShuffleBag],
            };
            const chunk = appendBarRandomPlaybackChunk(
              nextSession,
              nextLength,
              true,
              randomBarConfigRef.current,
            );
            randomBarPreparedChunkRef.current = { chunk, nextSession };
          }
        }
        pendingProgress = info;
        hasProgressUpdate = true;
      }
      batcher.schedule();
    });

    engine.setOnScheduleRebuild(() => {
      if (renderedPlayerRef.current) {
        try {
          renderedPlayerRef.current.pause();
          renderedPlayerRef.current.release();
        } catch {}
        renderedPlayerRef.current = null;
      }
      engine.setPendingMeasureStartAction(null);
      if (Platform.OS === "web") {
        // A random pass or failed/replaced schedule must not leave the previous
        // PCM loop owning output. Hand audio to the look-ahead fallback now;
        // the debounced render can reclaim ownership at a later boundary.
        try { webRenderedLoopRef.current?.stop(); } catch {}
        webRenderedLoopRef.current = null;
        engine.setPreRenderedAudio(false);
        scheduleReRenderCallbackRef.current();
      } else {
        engine.setPreRenderedAudio(false);
      }
    });

    // unmount 시 보류 중인 frame을 취소하고 엔진 콜백을 분리한다.
    // (setOnBeat은 null을 받지 않으므로 no-op으로 교체)
    return () => {
      batcher.cancel();
      try { engine.setOnBeat(() => {}); } catch {}
      try { engine.setOnSubBeat(null); } catch {}
      try { engine.setOnProgress(null); } catch {}
      try { engine.setOnScheduleRebuild(null); } catch {}
    };
  }, [flashOpacity]);


  // persistSnapshotRef / persistSettings / updateVolume / updateSampleVolume /
  // updateSoundSet → useSettings 소유 (위에서 destructure된 persistSettings 사용)

  const previewSoundSet = useCallback((key: string) => {
    if (engineRef.current?.getIsRunning()) return;
    if (Platform.OS === "web") {
      const soundSetDef = soundSets[key as keyof typeof soundSets];
      if (soundSetDef) {
        previewClickOnWeb(key, soundSetDef.strong).catch(() => {});
      }
    } else {
      const customCfg = customSoundSetsRef.current[key];
      const builtinKey: string = (customCfg?.strong?.sourceSet ?? key) || "classic";
      const pool = (allPlayersRef.current as any)[builtinKey] || allPlayersRef.current.classic;
      if (pool?.strongA) {
        pool.strongA.seekTo(0).then(() => {
          safePlay(pool.strongA, "preview.soundset");
        }).catch(() => {});
      }
    }
  }, []);

  // updateFlashMode / updateHapticMode / updateAudioOffset → useSettings 소유

  const handleOnboardingComplete = useCallback(async (result: OnboardingResult) => {
    setActiveModal(null);
    AsyncStorage.setItem("metronome_onboarding_done", "1");

    setThemeColor(result.themeColor);
    if (result.themeColor === "custom" && result.customHex) {
      setCustomHex(result.customHex);
    }
    persistSettings({ flashMode: result.flashMode, hapticMode: result.hapticMode });
    setFlashMode(result.flashMode);
    flashModeRef.current = result.flashMode;
    setHapticMode(result.hapticMode);
    engineRef.current?.setHapticMode(result.hapticMode);
    setLoggingEnabled(result.loggingEnabled);
    saveLoggingEnabled(result.loggingEnabled);

    if (result.username) {
      setUsername(result.username);
      persistSettings({ username: result.username });
    }

    if (result.practiceRoomName) {
      try {
        const { requestLocationPermission, addPracticeRoom } = await import("@/lib/practice-room");
        const granted = await requestLocationPermission();
        if (granted) {
          await addPracticeRoom(result.practiceRoomName);
        }
      } catch (e) {
        captureBreadcrumb({ category: "practice-room", message: "Failed to register practice room", level: "warning", data: { error: String(e) } });
      }
    }
  }, [setThemeColor, setCustomHex, persistSettings]);

  const handleResetApp = useCallback(async () => {
    try {
      // `loadSettings` and the debounced persister can outlive a full reset.
      // Invalidate both before clearing storage so an old pattern cannot return
      // to the UI after the engine has already been reset.
      invalidateSettingsLoad();
      cancelSettingsPersistence();
      const engine = engineRef.current;
      if (engine?.getIsRunning()) {
        engine.stop();
      }
      practiceSessionRef.current = null;
      practiceStartRef.current = null;
      discardRoomTracking();
      featureStartRef.current = null;
      await clearAllAppStorage();

      setActiveModal(null);
      tuningGuideOnSelectRef.current = null;

      setBpm(120);
      bpmRef.current = 120;
      setHalfTime(false);
      setBeatDenominator(4);
      beatDenominatorRef.current = 4;
      setBeatsPerMeasure(4);
      setBeatTypes(defaultBeatTypes(4));
      setSubdivisionPattern(["accent"]);
      setBeatSubdivisions({});
      setBarMode(false);
      setBarStartBeat(null);
      setBarLoopMode("once");
      setBarRepeats({});
      setLoopBlocks([]);
      barModeRef.current = false;
      dialConfigRef.current = {
        beatsPerMeasure: 4,
        beatTypes: defaultBeatTypes(4),
        beatSubdivisions: {},
        subdivisionPattern: ["accent"],
        noteSamples: {},
        noteSampleNames: {},
        noteSampleSources: {},
        noteSampleChannels: {},
      };
      barConfigRef.current = {
        beatsPerMeasure: 4,
        beatTypes: defaultBeatTypes(4),
        beatSubdivisions: {},
        subdivisionPattern: ["accent"],
        barRepeats: {},
        loopBlocks: [],
        barClockMode: "stopwatch",
        barTimerDuration: 180,
        noteSamples: {},
        noteSampleNames: {},
        noteSampleSources: {},
        noteSampleChannels: {},
        barLoopMode: "once",
        blockPlayMode: "loop",
        hasBeenConfigured: false,
      };

      setVolume(0.5);
      volumeRef.current = 0.5;
      setSampleVolume(0.8);
      sampleVolumeRef.current = 0.8;
      applyAudioSettings({ backgroundPlay: false, autoResumeAfterInterruption: true });
      setSoundSet("classic");
      setFlashMode("accent");
      flashModeRef.current = "accent";
      setHapticMode("all");
      setAudioOffsetMs(0);
      setTimerStopMode("end-of-cycle");
      setLandscapeReversed(false);
      setBeatDirection("cw");
      setUsername("");
      setLoggingEnabled(false);
      setRoomTrackingActive(false);
      setTrackingRoomName(null);
      setProgressInfo(null); setLayerProgressMap({});
      setNoteSamples({});
      setNoteSampleNames({});
      setNoteSampleSources({});
      setNoteSampleChannels({});
      setNoteSampleMetroChannels({});
      noteSamplesRef.current = {};
      noteSampleNamesRef.current = {};
      noteSampleSourcesRef.current = {};
      noteSampleChannelsRef.current = {};
      noteSampleMetroChannelsRef.current = {};
      loadedPracticeNoteRef.current = null;

      if (engine) {
        engine.setBpm(120);
        engine.setHalfTime(false);
        engine.setHapticMode("all");
        engine.setAudioOffsetMs(0);
        applyDialConfigToEngine(engine, dialConfigRef.current);
        engine.flushSchedule();
      }

      setThemeColor("gold");
      setShowReboot(true);
      setTimeout(() => {
        setShowReboot(false);
        setActiveModal("onboarding");
      }, 800);
    } catch (e) {
      captureBreadcrumb({ category: "reset", message: "Reset failed", level: "error", data: { error: String(e) } });
    }
  }, [setThemeColor, discardRoomTracking, invalidateSettingsLoad, cancelSettingsPersistence]);

  // updateBpm → useSettings 소유

  const restoreEasterEggEngine = useCallback((actual: number) => {
    const engine = engineRef.current;
    const barSnapshot = easterEggBarEngineSnapshotRef.current;
    if (engine && barSnapshot) {
      completeEasterEggBarSession(
        engine,
        barSnapshot,
        actual,
        easterEggApplyBpmRef.current,
        updateBpm,
      );
      easterEggBarEngineSnapshotRef.current = null;
      return;
    }

    if (easterEggApplyBpmRef.current) {
      updateBpm(actual);
    } else {
      engine?.setBpm(easterEggPrevBpmRef.current);
    }
  }, [easterEggApplyBpmRef, updateBpm]);

  const handleEasterEggGuess = useCallback((guess: number) => {
    const actual = easterEggActualBpmRef.current;
    if (Math.abs(guess - actual) <= 5) {
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEasterEggSuccessCount(c => c + 1);
      setEasterEggGiveUpMode(false);
      setEasterEggHintDirection(null);
      setEasterEggRevealBpm(actual);
      setTimeout(() => {
        restoreEasterEggEngine(actual);
        // 이스터에그 발동 전 재생 중이 아니었으면 엔진 정지
        if (!easterEggWasPlayingRef.current) {
          engineRef.current?.stop();
          stopRenderedAudio();
          setIsPlaying(false);
          isPlayingRef.current = false;
          resetPlaybackVisuals();
        }
        setEasterEggActive(false);
        setEasterEggRevealBpm(null);
        setEasterEggGiveUpMode(false);
        setEasterEggHintDirection(null);
        setEasterEggApplyBpm(false);
      }, 2000);
    } else {
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setEasterEggShakeCount(c => c + 1);
      setEasterEggHintDirection(guess < actual ? "up" : "down");
    }
  }, [stopRenderedAudio, resetPlaybackVisuals, setEasterEggHintDirection, restoreEasterEggEngine, setEasterEggApplyBpm]);

  const handleEasterEggGiveUp = useCallback((stopEngine = false) => {
    const actual = easterEggActualBpmRef.current;
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setEasterEggGiveUpMode(true);
    setEasterEggHintDirection(null);
    setEasterEggRevealBpm(actual);
    if (stopEngine) {
      completePracticeSessionRef.current("manual");
      engineRef.current?.stop();
      stopRenderedAudio();
      clearSamplePlayStates();
      setIsPlaying(false);
      isPlayingRef.current = false;
      setIsPreparing(false);
      resetPlaybackVisuals();
    }
    setTimeout(() => {
      restoreEasterEggEngine(actual);
      // 이스터에그 발동 전 재생 중이 아니었으면 엔진 정지
      if (!easterEggWasPlayingRef.current) {
        engineRef.current?.stop();
        stopRenderedAudio();
        setIsPlaying(false);
        isPlayingRef.current = false;
        resetPlaybackVisuals();
      }
      setEasterEggActive(false);
      setEasterEggRevealBpm(null);
      setEasterEggGiveUpMode(false);
      setEasterEggHintDirection(null);
      setEasterEggApplyBpm(false);
    }, 2000);
  }, [stopRenderedAudio, clearSamplePlayStates, resetPlaybackVisuals, setEasterEggHintDirection, restoreEasterEggEngine, setEasterEggApplyBpm]);

  const handleEasterEggGiveUpRef = useRef(handleEasterEggGiveUp);
  useEffect(() => { handleEasterEggGiveUpRef.current = handleEasterEggGiveUp; }, [handleEasterEggGiveUp]);

  const handleEasterEggToggleApplyBpm = useCallback(() => {
    setEasterEggApplyBpm(prev => !prev);
  }, [setEasterEggApplyBpm]);

  const toggleHalfTime = useCallback(() => {
    setHalfTime((prev) => {
      const next = !prev;
      engineRef.current?.setHalfTime(next);
      halfTimeFlash.value = withSequence(
        withTiming(next ? 0.35 : 0.2, { duration: 100 }),
        withTiming(0, { duration: 800, easing: Easing.out(Easing.quad) })
      );
      return next;
    });
  }, []);

  const handleBeatDenominatorCycle = useCallback(() => {
    setBeatDenominator((prev) => {
      const next: 2 | 4 | 8 = prev === 4 ? 8 : prev === 8 ? 2 : 4;
      // 표시 BPM 변경 없이 분모에 따른 엔진 속도 갱신
      engineRef.current?.setBpm(bpm * (4 / next));
      persistSettings({ beatDenominator: next });
      halfTimeFlash.value = withSequence(
        withTiming(0.25, { duration: 80 }),
        withTiming(0, { duration: 600, easing: Easing.out(Easing.quad) })
      );
      return next;
    });
  }, [bpm, persistSettings]);

  // ── Beat-type controls (updateTimeSignature + handleBeatTypeChange) ──────────
  // Extracted to useBeatTypeControls (task #532). Behaviour is identical;
  // the returned callbacks preserve the same identity-stability guarantees.
  const { updateTimeSignature, handleBeatTypeChange } = useBeatTypeControls({
    engineRef,
    barModeRef,
    barConfigRef,
    dialConfigRef,
    beatsPerMeasure,
    beatTypes,
    beatSubdivisions,
    subdivisionPattern,
    setBeatsPerMeasure,
    setBeatTypes,
    setBeatSubdivisions,
    persistSettings,
    scheduleReRender,
  });

  const { notifyPlayState: notifyVoicePlayState } = useVoiceAssistant();
  const randomBarPreviousModeRef = useRef<"sequential" | "loop" | "random" | null>(null);
  const finishRandomBarPlay = useCallback(() => {
    const previousMode = randomBarPreviousModeRef.current;
    if (previousMode === null) return;
    randomBarPreviousModeRef.current = null;
    randomBarPreparedChunkRef.current = null;
    blockPlayModeRef.current = previousMode;
    setBlockPlayMode(previousMode);
    engineRef.current?.setRandomBarOrder(null);
    engineRef.current?.setBlockPlayMode(previousMode);
    const session = randomBarSessionRef.current;
    if (session) {
      session.active = false;
      updateRandomBarSession(session);
    }
  }, [blockPlayModeRef, engineRef, setBlockPlayMode, updateRandomBarSession]);
  const randomBarPlaybackBecameActiveRef = useRef(false);
  useEffect(() => {
    if (randomBarPreviousModeRef.current === null) {
      randomBarPlaybackBecameActiveRef.current = false;
      return;
    }
    if (isPlaying || isPreparing) {
      randomBarPlaybackBecameActiveRef.current = true;
      return;
    }
    if (randomBarPlaybackBecameActiveRef.current) {
      randomBarPlaybackBecameActiveRef.current = false;
      finishRandomBarPlay();
    }
  }, [finishRandomBarPlay, isPlaying, isPreparing]);

  const {
    togglePlayPause,
    togglePlayPauseRef,
    startMetronome,
    stopMetronome,
    retryAudioRecovery,
    completePracticeSession,
    discardPracticeSession,
    startOrResumePracticeSession,
    seamlessNextEntryRef,
  } = usePlaybackControl({
    engineRef,
    isPlaying,
    isPreparing,
    setIsPlaying,
    setIsPreparing,
    isPlayingRef,
    isPreparingRef,
    preparingCancelledRef,
    barMode,
    barModeRef,
    bpm,
    getPlaybackContext: () => getPlaybackContext(),
    beatsPerMeasure,
    beatTypes,
    beatSubdivisions,
    subdivisionPattern,
    barConfigRef,
    dialConfigRef,
    barStartBeatRef,
    barLoopModeRef,
    blockPlayModeRef,
    beatDenominatorRef,
    stopRenderedAudio,
    clearSamplePlayStates,
    resetPlaybackVisuals,
    renderedPlayerRef,
    webRenderedLoopRef,
    activateWebRenderedLoop,
    renderGenerationRef,
    buildRenderedPlayer,
    clearAudioWatchdogRef,
    armAudioWatchdogRef,
    soundSetRef,
    volumeRef,
    sampleVolumeRef,
    noteSamplesRef,
    noteSampleChannelsRef,
    noteSampleVolumesRef,
    noteSampleSpeedsRef,
    webClickReadyRef,
    getClickPCMs,
    getSamplePCMs,
    getLayerClickPCMsForSchedule,
    barMetronomeChannelRef,
    noteSampleMetroChannelsRef,
    notifyVoicePlayState,
    languageRef,
    notifyUserToggle: notifyUserMetronomeToggle,
    showPlayingNotification,
    showPausedNotification,
    easterEggActiveRef,
    handleEasterEggGiveUpRef,
    loggingEnabled,
    practiceStartRef,
    practiceSessionRef,
    loadedPracticeNoteRef,
    addPracticeLog: (data) => addActivityLog({ type: "practice_session", data }),
    checkCompletedGoals,
    capturePlaybackError: (message, error, level = "error") =>
      captureBreadcrumb({ category: "metronome", message, level, data: { error: String(error) } }),
    onPlaybackStopped: finishRandomBarPlay,
  });

  const handleRandomBarPlay = useCallback(() => {
    if (
      !barMode ||
      isPlaying ||
      isPreparing ||
      randomBarPreviousModeRef.current !== null
    ) return;
    const sourceCount = barConfigRef.current.beatsPerMeasure;
    if (sourceCount <= 0) return;
    const session = createBarRandomSession(sourceCount);
    const repeatEnabled = barLoopModeRef.current === "loop";
    const chunkLength = repeatEnabled
      ? Math.max(2, randomBarViewportCapacityRef.current * 2)
      : sourceCount;
    const chunk = appendBarRandomPlaybackChunk(
      session,
      chunkLength,
      repeatEnabled,
      randomBarConfig,
    );
    if (chunk.length === 0) return;
    randomBarChunkStartRef.current = 0;
    randomBarChunkLengthRef.current = chunk.length;
    randomBarPreparedChunkRef.current = null;
    updateRandomBarSession(session);
    randomBarPreviousModeRef.current = blockPlayModeRef.current;
    blockPlayModeRef.current = "random";
    setBlockPlayMode("random");
    engineRef.current?.setRandomBarOrder(chunk);
    engineRef.current?.setBlockPlayMode("random");
    void togglePlayPauseRef.current();
  }, [
    barMode,
    barConfigRef,
    blockPlayModeRef,
    engineRef,
    isPlaying,
    isPreparing,
    randomBarPreviousModeRef,
    randomBarConfig,
    setBlockPlayMode,
    togglePlayPauseRef,
    updateRandomBarSession,
  ]);

  const materializeRandomBarOrder = useCallback((requestedOrder: number[]) => {
    const source = barConfigRef.current;
    const order = requestedOrder
      .filter(index => index >= 0 && index < source.beatsPerMeasure);
    const remapSamples = <T,>(map: Record<string, T> | undefined): Record<string, T> => {
      const result: Record<string, T> = {};
      for (let targetBeat = 0; targetBeat < order.length; targetBeat += 1) {
        const sourceBeat = order[targetBeat];
        for (const [key, value] of Object.entries(map ?? {})) {
          const [beat, ...rest] = key.split("-");
          if (Number(beat) === sourceBeat) result[[targetBeat, ...rest].join("-")] = value;
        }
      }
      return result;
    };
    const nextSubdivisions: Record<string, BeatType[]> = {};
    const nextRepeats: Record<number, BarRepeat> = {};
    order.forEach((sourceBeat, targetBeat) => {
      const subdivisions = source.beatSubdivisions[String(sourceBeat)];
      if (subdivisions?.length) nextSubdivisions[String(targetBeat)] = [...subdivisions];
      const repeat = source.barRepeats[sourceBeat];
      if (repeat) {
        const {
          jumpFromId: _jumpFromId,
          jumpToId: _jumpToId,
          voltaMax: _voltaMax,
          isEnd: _isEnd,
          ...portableRepeat
        } = repeat;
        nextRepeats[targetBeat] = {
          ...portableRepeat,
          layers: portableRepeat.layers?.map(layer => ({ ...layer })),
        };
      }
    });
    return {
      order,
      beatsPerMeasure: order.length,
      beatTypes: order.map(index => source.beatTypes[index] ?? "normal"),
      beatSubdivisions: nextSubdivisions,
      barRepeats: nextRepeats,
      noteSamples: remapSamples(source.noteSamples),
      noteSampleNames: remapSamples(source.noteSampleNames),
      noteSampleSources: remapSamples(source.noteSampleSources),
      noteSampleChannels: remapSamples(source.noteSampleChannels),
      noteSampleVolumes: remapSamples(source.noteSampleVolumes),
      noteSampleSpeeds: remapSamples(source.noteSampleSpeeds),
    };
  }, [barConfigRef]);

  const handleReplayRandomBarSession = useCallback(() => {
    const previous = randomBarSessionRef.current;
    if (!previous || previous.order.length === 0 || isPlaying || isPreparing) return;
    const session = {
      ...previous,
      order: [...previous.order],
      cursor: 0,
      active: true,
    };
    randomBarChunkStartRef.current = 0;
    randomBarChunkLengthRef.current = session.order.length;
    randomBarPreparedChunkRef.current = null;
    updateRandomBarSession(session);
    randomBarPreviousModeRef.current = blockPlayModeRef.current;
    blockPlayModeRef.current = "random";
    setBlockPlayMode("random");
    engineRef.current?.setRandomBarOrder(session.order);
    engineRef.current?.setBlockPlayMode("random");
    void togglePlayPauseRef.current();
  }, [
    blockPlayModeRef,
    engineRef,
    isPlaying,
    isPreparing,
    setBlockPlayMode,
    togglePlayPauseRef,
    updateRandomBarSession,
  ]);

  const handleSaveRandomBarSession = useCallback(async (): Promise<boolean> => {
    const session = randomBarSessionRef.current;
    if (!session?.order.length) return false;
    try {
      const source = barConfigRef.current;
      const now = new Date();
      const entry = createPracticeEntry(
        `Random ${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`,
        {
          mode: "bar",
          bpm: barBpmRef.current,
          beatsPerMeasure: source.beatsPerMeasure,
          beatTypes: [...source.beatTypes],
          beatSubdivisions: { ...source.beatSubdivisions },
          barRepeats: { ...source.barRepeats },
          loopBlocks: [...source.loopBlocks],
          blockPlayMode: "random",
          randomBarOrder: [...session.order],
          barLoopMode: "once",
          subdivisionPattern: [...(barConfigRef.current.subdivisionPattern ?? ["accent"])],
          noteSamples: { ...source.noteSamples },
          noteSampleNames: { ...source.noteSampleNames },
          noteSampleSources: { ...source.noteSampleSources },
          noteSampleChannels: { ...source.noteSampleChannels },
          noteSampleVolumes: { ...(source.noteSampleVolumes ?? {}) },
          noteSampleSpeeds: { ...(source.noteSampleSpeeds ?? {}) },
        },
        username,
      );
      const existing = await loadPracticeBook();
      await savePracticeBook([entry, ...existing]);
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      return true;
    } catch (error) {
      captureBreadcrumb({
        category: "practice-book",
        message: "Random bar session save error",
        level: "warning",
        data: { error: String(error) },
      });
      return false;
    }
  }, [barBpmRef, username]);

  const handleApplyRandomBarSession = useCallback(() => {
    const session = randomBarSessionRef.current;
    if (!session?.order.length || isPlaying || isPreparing) return;
    const sourceCount = barConfigRef.current.beatsPerMeasure;
    const uniqueOrder = Array.from(new Set(session.order))
      .filter(index => index >= 0 && index < sourceCount);
    for (let index = 0; index < sourceCount; index += 1) {
      if (!uniqueOrder.includes(index)) uniqueOrder.push(index);
    }
    const next = materializeRandomBarOrder(uniqueOrder);
    if (next.beatsPerMeasure === 0) return;
    setBeatsPerMeasure(next.beatsPerMeasure);
    setBeatTypes(next.beatTypes);
    setBeatSubdivisions(next.beatSubdivisions);
    setBarRepeats(next.barRepeats);
    setLoopBlocks([]);
    setBarStartBeat(null);
    setNoteSamples(next.noteSamples);
    noteSamplesRef.current = next.noteSamples;
    setNoteSampleNames(next.noteSampleNames);
    noteSampleNamesRef.current = next.noteSampleNames;
    setNoteSampleSources(next.noteSampleSources);
    noteSampleSourcesRef.current = next.noteSampleSources;
    setNoteSampleChannels(next.noteSampleChannels);
    noteSampleChannelsRef.current = next.noteSampleChannels;
    setNoteSampleVolumes(next.noteSampleVolumes);
    noteSampleVolumesRef.current = next.noteSampleVolumes;
    setNoteSampleSpeeds(next.noteSampleSpeeds);
    noteSampleSpeedsRef.current = next.noteSampleSpeeds;
    barConfigRef.current = {
      ...barConfigRef.current,
      ...next,
      loopBlocks: [],
      hasBeenConfigured: true,
    };
    const engine = engineRef.current;
    engine?.setRandomBarOrder(null);
    engine?.setBeatsPerMeasure(next.beatsPerMeasure);
    engine?.setBeatTypes(next.beatTypes);
    engine?.setAllBeatSubdivisions(next.beatSubdivisions);
    engine?.setAllBarRepeats(next.barRepeats);
    engine?.setLoopBlocks([]);
    updateRandomBarSession(null);
    scheduleReRender();
  }, [
    engineRef,
    isPlaying,
    isPreparing,
    materializeRandomBarOrder,
    noteSampleChannelsRef,
    noteSampleNamesRef,
    noteSampleSourcesRef,
    noteSampleSpeedsRef,
    noteSampleVolumesRef,
    noteSamplesRef,
    scheduleReRender,
    setBarRepeats,
    setBarStartBeat,
    setBeatSubdivisions,
    setBeatTypes,
    setBeatsPerMeasure,
    setLoopBlocks,
    setNoteSampleChannels,
    setNoteSampleNames,
    setNoteSampleSources,
    setNoteSampleSpeeds,
    setNoteSampleVolumes,
    setNoteSamples,
    updateRandomBarSession,
  ]);

  const handleReturnToOriginalBarList = useCallback(() => {
    if (isPlaying || isPreparing) {
      void togglePlayPauseRef.current();
    }
    finishRandomBarPlay();
    randomBarPreparedChunkRef.current = null;
    updateRandomBarSession(null);
  }, [
    finishRandomBarPlay,
    isPlaying,
    isPreparing,
    togglePlayPauseRef,
    updateRandomBarSession,
  ]);

  stopIfPlayingRef.current = stopMetronome;
  const completePracticeSessionRef = useRef(completePracticeSession);
  useEffect(() => { completePracticeSessionRef.current = completePracticeSession; }, [completePracticeSession]);

  useEffect(() => {
    const session = practiceSessionRef.current;
    if (!session) return;
    if (audioLifecycle.phase === "interrupted" || audioLifecycle.phase === "recovering") {
      session.interrupt();
    } else if (audioLifecycle.phase === "playing" && session.getState() === "interrupted") {
      startOrResumePracticeSession();
    } else if (audioLifecycle.phase === "recoveryFailed") {
      completePracticeSessionRef.current("audio_recovery_failed", "abandoned");
    } else if (audioLifecycle.phase === "idle" && session.getState() === "interrupted") {
      completePracticeSessionRef.current("audio_interruption", "abandoned");
    }
  }, [audioLifecycle, startOrResumePracticeSession]);

  useEffect(() => {
    registerMetronomeBridge({
      isRunning: () => engineRef.current?.getIsRunning() ?? false,
      pause: () => {
        if (engineRef.current?.getIsRunning()) return togglePlayPauseRef.current?.();
      },
      resume: () => {
        if (!engineRef.current?.getIsRunning()) return togglePlayPauseRef.current?.();
      },
    });
    return () => { registerMetronomeBridge(null); };
  }, []);
  const updateBpmRef = useRef(updateBpm);
  useEffect(() => { updateBpmRef.current = updateBpm; }, [updateBpm]);
  // bpmRef sync는 useSettings 내부에서 처리

  const { stageModeActive, enterStageMode, exitStageMode } = useStageMode();
  const enterStageModeForPlayback = useCallback(() => {
    playbackModeRef.current = "stage";
    setSettingsMode("stage");
    enterStageMode();
  }, [enterStageMode]);
  const exitStageModeForPlayback = useCallback(async () => {
    playbackModeRef.current = activeModeRef.current;
    setSettingsMode(
      activeModeRef.current === "bar"
        ? "bar"
        : activeModeRef.current === "note" || activeModeRef.current === "score"
          ? "note"
          : "beat",
    );
    await exitStageMode();
  }, [exitStageMode]);
  useEffect(() => {
    playbackModeRef.current = stageModeActive
      ? "stage"
      : showPolygon
      ? "polygon"
      : activeModeRef.current;
  }, [coreMode, stageModeActive, showPolygon]);
  /** 무대 모드 셋 리스트 — 진입 시 연습장에서 로드 */
  const [stagePracticeEntries, setStagePracticeEntries] = useState<PracticeEntry[]>([]);
  /** 셋 리스트에서 현재 선택/적용된 항목 ID */
  const [activeStagePracticeEntryId, setActiveStagePracticeEntryId] = useState<string | undefined>(undefined);

  const updateTimeSignatureRef = useRef(updateTimeSignature);
  useEffect(() => { updateTimeSignatureRef.current = updateTimeSignature; }, [updateTimeSignature]);
  const beatsPerMeasureRef = useRef(beatsPerMeasure);
  useEffect(() => { beatsPerMeasureRef.current = beatsPerMeasure; }, [beatsPerMeasure]);
  const beatTypesRef = useRef(beatTypes);
  useEffect(() => { beatTypesRef.current = beatTypes; }, [beatTypes]);
  const subdivisionPatternRef = useRef(subdivisionPattern);
  useEffect(() => { subdivisionPatternRef.current = subdivisionPattern; }, [subdivisionPattern]);

  // 딥링크 명령 핸들러 등록
  const { setCommandHandler } = useDeepLink();
  useEffect(() => {
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    setCommandHandler((cmd) => {
      const engine = engineRef.current;
      const isRunning = engine?.getIsRunning?.() ?? false;
      switch (cmd.type) {
        case "play":
          if (!isRunning) togglePlayPauseRef.current?.();
          break;
        case "stop":
          if (isRunning) togglePlayPauseRef.current?.();
          break;
        case "toggle":
          togglePlayPauseRef.current?.();
          break;
        case "setBpm": {
          const next = clamp(Math.round(cmd.bpm), 20, 300);
          updateBpmRef.current?.(next);
          break;
        }
        case "bpmDelta": {
          const next = clamp(Math.round(bpmRef.current + cmd.delta), 20, 300);
          updateBpmRef.current?.(next);
          break;
        }
        case "bpmMultiplier": {
          const next = clamp(Math.round(bpmRef.current * cmd.factor), 20, 300);
          updateBpmRef.current?.(next);
          break;
        }
        case "setBeats": {
          const next = clamp(Math.round(cmd.beats), 1, 16);
          updateTimeSignatureRef.current?.(next);
          break;
        }
        case "reset":
          if (isRunning) togglePlayPauseRef.current?.();
          updateBpmRef.current?.(120);
          updateTimeSignatureRef.current?.(4);
          break;
        case "help":
        case "unknown":
        default:
          break;
      }
    });
    return () => setCommandHandler(null);
  }, [setCommandHandler]);
  const handleNoteTogglePlayRef = useRef<(() => void) | null>(null);
  const anyModalOpenRef = useRef(false);
  useEffect(() => {
    // stageModeActive must count as "modal open" here too — otherwise global
    // shortcuts (Tab → menu, P → practice book, etc.) stay live while Stage
    // Mode is on screen and a stray key/pedal press silently kicks the user
    // back out to another mode without going through exitStageMode().
    anyModalOpenRef.current = activeModal !== null || landscapeImageModalVisible || recorderTarget !== null || showKbShortcuts || showNativeKbHint || stageModeActive;
  }, [activeModal, landscapeImageModalVisible, recorderTarget, showKbShortcuts, showNativeKbHint, stageModeActive]);

  const rootViewRef = useRef<View>(null);

  useEffect(() => {
    if (Platform.OS !== "web") {
      rootViewRef.current?.focus?.();
    }
  }, []);

  // handleNativeKeyDown / handleNativeKeyUp — useKeyboardShortcuts 내부에서 생성돼 반환된다.
  const { handleNativeKeyDown, handleNativeKeyUp } = useKeyboardShortcuts({
    keyBindingsRef, bpmRef, updateBpmRef, beatsPerMeasureRef, updateTimeSignatureRef,
    barModeRef, noteModeRef, stopwatchTimerRef, stopwatchTimerLandscapeRef,
    subdivisionPatternRef, beatTypesRef, handleNoteTogglePlayRef, anyModalOpenRef,
    showKbShortcutsRef, showNativeKbHintRef, engineRef,
    togglePlayPauseRef, setNoteMode, setBarMode, setShowKbShortcuts, setShowNativeKbHint,
    setActiveModal, setBarLoopMode, setBlockPlayMode, setBeatsPerMeasure, setBeatTypes,
    setSubdivisionPattern, persistSettings,
  });

  // ── Notification bridge (TOGGLE_PLAY / BPM_UP / BPM_DOWN from lock screen) ─
  useNotificationBridge({
    engineRef, languageRef, getPlaybackContextRef, setPlaybackBpmRef,
    stopRenderedAudio, togglePlaybackRef: togglePlayPauseRef,
  });


  // handleBarModeChange → wrapped (BPM swap) + barModeHandleBarModeChange

  const handleEasterEggTrigger = useCallback(async (isHighRange: boolean) => {
    const engine = engineRef.current;
    if (!engine) return;
    const isBarMode = barModeRef.current;

    // 발동 직전 재생 상태 저장 (종료 시 복원용)
    easterEggWasPlayingRef.current = isPlayingRef.current;
    easterEggPrevBpmRef.current = isBarMode ? engine.getBpm() : bpmRef.current;
    const randomBpm = isHighRange
      ? Math.floor(Math.random() * (200 - 100 + 1)) + 100
      : Math.floor(Math.random() * (100 - 30 + 1)) + 30;
    easterEggActualBpmRef.current = randomBpm;
    setEasterEggApplyBpm(false);
    const eggBeatTypes = defaultBeatTypes(1);

    // ① 기존 재생/준비 중단 — startMetronome 우회하여 직접 제어
    preparingCancelledRef.current = true;
    completePracticeSessionRef.current("manual");
    if (engine.getIsRunning()) engine.stop();
    stopRenderedAudio();
    setIsPreparing(false);
    isPreparingRef.current = false;
    setIsPlaying(false);
    isPlayingRef.current = false;

    // ② 새 BPM / 박자 설정
    easterEggBarEngineSnapshotRef.current = prepareEasterEggEngine(
      engine,
      randomBpm,
      eggBeatTypes,
      isBarMode,
    );
    if (!isBarMode) {
      setBeatsPerMeasure(1);
      setBeatTypes(eggBeatTypes);
      dialConfigRef.current = {
        ...dialConfigRef.current,
        beatTypes: eggBeatTypes,
        beatSubdivisions: {},
      };
    }

    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    // 이전 라운드 잔여 상태 초기화 (2초 타이머가 아직 살아있어도 클린 상태로 시작)
    setEasterEggRevealBpm(null);
    setEasterEggGiveUpMode(false);
    setEasterEggHintDirection(null);
    setEasterEggShakeCount(0);
    setEasterEggActive(true);
    resetPlaybackVisuals();
    clearSamplePlayStates();

    // ③ 오디오 준비 — web은 click buffer 로드 후 per-tick 경로로 직접 시작
    preparingCancelledRef.current = false;
    if (Platform.OS === "web") {
      try {
        const ctx = getWebAudioContext();
        if (ctx && ctx.state === "suspended") {
          await ctx.resume().catch(() => {});
        }
        const src = soundSets[soundSetRef.current as keyof typeof soundSets] || soundSets.classic;
        const webReady = await ensureWebClickBuffers(src as any);
        if (webReady) webClickReadyRef.current = true;
        if (ctx && ctx.state === "suspended") {
          await ctx.resume().catch(() => {});
        }
      } catch (_) {}
    }

    if (preparingCancelledRef.current) {
      markAudioStopped();
      return;
    }

    // ④ pre-rendered loop 없이 per-tick으로 즉시 시작 (AudioContext 상태에 무관)
    engine.setPreRenderedAudio(false);
    engine.buildScheduleOnly();
    setIsPlaying(true);
    isPlayingRef.current = true;
    engine.start();
    markAudioPlaying();
    armAudioWatchdogRef.current();
  }, [stopRenderedAudio, resetPlaybackVisuals, clearSamplePlayStates, setEasterEggApplyBpm]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setOnMeasureComplete(() => {
      setMeasureCount(c => c + 1);
      const randomSession = randomBarSessionRef.current;
      if (
        randomSession?.active &&
        randomBarPreviousModeRef.current !== null &&
        engine.getIsRunning() &&
        barLoopModeRef.current === "loop"
      ) {
        const nextStart = randomBarChunkStartRef.current + randomBarChunkLengthRef.current;
        const nextLength = Math.max(2, randomBarViewportCapacityRef.current * 2);
        const prepared = randomBarPreparedChunkRef.current;
        let nextChunk: number[];
        if (prepared) {
          nextChunk = prepared.chunk;
          randomSession.order = prepared.nextSession.order;
          randomSession.remainingShuffleBag = prepared.nextSession.remainingShuffleBag;
        } else {
          nextChunk = appendBarRandomPlaybackChunk(
            randomSession,
            nextLength,
            true,
            randomBarConfigRef.current,
          );
        }
        randomBarPreparedChunkRef.current = null;
        randomSession.cursor = nextStart;
        randomBarChunkStartRef.current = nextStart;
        randomBarChunkLengthRef.current = nextChunk.length;
        updateRandomBarSession(randomSession);
        engine.setRandomBarOrder(nextChunk);
      }
      const sess = fadeOutSessionRef.current;
      if (sess) {
        const elapsed = fadeOutMeasureCountRef.current + 1;
        fadeOutMeasureCountRef.current = elapsed;
        const total = sess.N + sess.M + sess.K;
        if (elapsed >= total) {
          fadeOutMutedRef.current = false;
          fadeOutSessionRef.current = null;
          fadeOutMeasureCountRef.current = 0;
          setFadeOutPhase(null);
          setFadeOutMeasureInPhase(0);
          setTimeout(() => {
            const eng = engineRef.current;
            if (eng) eng.stop();
            stopRenderedAudio();
            clearSamplePlayStates();
            setIsPreparing(false);
            setIsPlaying(false);
            resetPlaybackVisuals();
             markAudioStopped();
             completePracticeSessionRef.current("fade_out");
            const playback = getPlaybackContext();
            showPausedNotification(playback.bpm, playback.modeLabel, languageRef.current);
          }, 0);
          return;
        }
        if (elapsed === sess.N) {
          fadeOutMutedRef.current = true;
          // pre-rendered loop (webRenderedLoopRef / renderedPlayerRef)는
          // fadeOutMutedRef를 확인하지 않으므로 반드시 명시적으로 중단해야 한다.
          // stopRenderedAudio()는 loop 정지 + engine.setPreRenderedAudio(false) 포함.
          stopRenderedAudio();
          setFadeOutPhase("muted");
          setFadeOutMeasureInPhase(0);
        } else if (elapsed === sess.N + sess.M) {
          fadeOutMutedRef.current = false;
          setFadeOutPhase("audible2");
          setFadeOutMeasureInPhase(0);
        } else {
          setFadeOutMeasureInPhase((p) => p + 1);
        }
      }
      if (!engine.getIsRunning()) {
        // ── Seamless setlist advance ──────────────────────────────────
        // 다음 항목이 예약돼 있으면 엔진을 즉시 재시작 (정지 없음 = gap 없음).
        const seamlessNext = seamlessNextEntryRef.current;
        if (seamlessNext) {
          seamlessNextEntryRef.current = null;
          const entryIsBar = seamlessNext.mode === "bar";
          // ref를 동기적으로 갱신 (togglePlayPause와 동일한 순서)
          barModeRef.current    = entryIsBar;
          barLoopModeRef.current = (seamlessNext.barLoopMode || "once") as "loop" | "once";
          barConfigRef.current  = {
            ...barConfigRef.current,
            beatsPerMeasure:  seamlessNext.beatsPerMeasure,
            beatTypes:        [...seamlessNext.beatTypes],
            beatSubdivisions: { ...seamlessNext.beatSubdivisions },
            barRepeats:       { ...(seamlessNext.barRepeats  || {}) },
            loopBlocks:       [...(seamlessNext.loopBlocks   || [])],
            barLoopMode:      (seamlessNext.barLoopMode  || "once") as "loop" | "once",
            blockPlayMode:    (seamlessNext.blockPlayMode || "loop") as "sequential" | "loop" | "random",
          };
          dialConfigRef.current = {
            ...dialConfigRef.current,
            beatsPerMeasure:  seamlessNext.beatsPerMeasure,
            beatTypes:        [...seamlessNext.beatTypes],
            beatSubdivisions: { ...seamlessNext.beatSubdivisions },
          };
          // 현재 마디의 정확한 다음 마디 시작 시각을 캡처
          // (applyEntryToEngineCore 전에 캡처 — 그 함수가 measureDurationMs를 변경할 수 있음)
          const nextMeasureStart =
            engine.getMeasureStartTime() + engine.getMeasureDurationMs();
          // 엔진 설정 적용 → 스케줄 재구성 → 다음 마디 경계에서 정확히 시작
          applyEntryToEngineCore(engine, seamlessNext, beatDenominatorRef.current);
          engine.buildScheduleOnly();
          // measureStartAt = 이전 마디 끝 시각 → 비트 1이 그 순간에 발화됨 (1비트 gap 없음)
          engine.start({ measureStartAt: nextMeasureStart });
          // 새 항목도 유한(once)이면 마디 끝에 정지 예약 → 다음 seamless 트리거
          if (barModeRef.current && barLoopModeRef.current === "once") {
            engine.requestStopAfterMeasure();
          }
          // React 상태 비동기 갱신 (UI 업데이트용, 엔진은 이미 재시작됨)
          updateBpmRef.current(seamlessNext.bpm);
          setBeatsPerMeasure(seamlessNext.beatsPerMeasure);
          setBeatTypes([...seamlessNext.beatTypes]);
          setBeatSubdivisions({ ...seamlessNext.beatSubdivisions });
          setBarMode(entryIsBar);
          setBarLoopMode(seamlessNext.barLoopMode || "once");
          setBarRepeats({ ...(seamlessNext.barRepeats  || {}) });
          setLoopBlocks([...(seamlessNext.loopBlocks   || [])]);
          setActiveStagePracticeEntryId(seamlessNext.id);
          scheduleReRender();
          return; // 일반 정지 로직 스킵
        }
        // ── 일반 정지 ─────────────────────────────────────────────────
        if (noteModeRef.current && noteIsPlayingRef.current) {
          const lastBeatMs = Math.round(60000 / (bpmRef.current || 120));
          setTimeout(() => {
            noteAdvanceQueueRef.current();
          }, lastBeatMs);
          return;
        }
        if (webRenderedLoopRef.current) {
          webRenderedLoopRef.current.stop();
          webRenderedLoopRef.current = null;
        }
        if (renderedPlayerRef.current) {
          try { renderedPlayerRef.current.pause(); renderedPlayerRef.current.release(); } catch {}
          renderedPlayerRef.current = null;
        }
        for (const [k, st] of Object.entries(samplePlayStateRef.current)) {
          if (st.endTimer) clearTimeout(st.endTimer);
        }
        samplePlayStateRef.current = {};
        for (const snd of Object.values(noteSampleSoundsRef.current)) {
          try { snd.pause(); } catch {}
        }
        setIsPreparing(false);
        setIsPlaying(false);
        resetPlaybackVisuals();
        finishRandomBarPlay();
         markAudioStopped();
         completePracticeSessionRef.current("measure_complete");
        const playback = getPlaybackContext();
        showPausedNotification(playback.bpm, playback.modeLabel, languageRef.current);
      }
    });
  }, []);

  const timerStopModeRef = useRef(timerStopMode);
  useEffect(() => { timerStopModeRef.current = timerStopMode; }, [timerStopMode]);

  const handleTimerExpired = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (timerStopModeRef.current === "immediate") {
      engine.stop();
      stopRenderedAudio();
      clearSamplePlayStates();
      setIsPreparing(false);
      setIsPlaying(false);
      resetPlaybackVisuals();
      markAudioStopped();
      completePracticeSession("timer");
      const playback = getPlaybackContext();
      showPausedNotification(playback.bpm, playback.modeLabel, languageRef.current);
    } else {
      engine.requestStopAfterMeasure();
    }
  }, [completePracticeSession]);

  // updateTimerStopMode / updateUsername → useSettings 소유

  const handleTapTempo = useCallback(() => {
    const now = Date.now();
    const taps = tapTimesRef.current;

    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    if (taps.length > 0 && now - taps[taps.length - 1] > 2500) {
      tapTimesRef.current = [];
    }

    taps.push(now);

    if (taps.length > 8) {
      taps.shift();
    }

    if (taps.length >= 2) {
      let totalInterval = 0;
      for (let i = 1; i < taps.length; i++) {
        totalInterval += taps[i] - taps[i - 1];
      }
      const avgInterval = totalInterval / (taps.length - 1);
      const detectedBpm = Math.round(60000 / avgInterval);
      updateBpm(detectedBpm);
    }

    tapTimesRef.current = taps;
  }, [updateBpm]);

  const handleBeatSubdivisionChange = useCallback(
    (beatIndex: number, pattern: BeatType[] | null) => {
      const newSubs = { ...beatSubdivisions };
      if (pattern && pattern.length > 1) {
        newSubs[String(beatIndex)] = pattern;
        engineRef.current?.setBeatSubdivision(beatIndex, pattern);
      } else if (pattern?.length === 1) {
        // A one-note pattern is the beat itself, not a subdivision. Promote its
        // note type to the visible beat so UI, engine schedule, and audio agree.
        delete newSubs[String(beatIndex)];
        engineRef.current?.setBeatSubdivision(beatIndex, null);
        const type = pattern[0];
        const nextTypes = [...beatTypes];
        nextTypes[beatIndex] = type;
        setBeatTypes(nextTypes);
        if (barModeRef.current) barConfigRef.current.beatTypes = nextTypes;
        else dialConfigRef.current.beatTypes = nextTypes;
        engineRef.current?.setBeatTypes(nextTypes);
      } else {
        delete newSubs[String(beatIndex)];
        engineRef.current?.setBeatSubdivision(beatIndex, null);
      }
      setBeatSubdivisions(newSubs);
      if (barModeRef.current) {
        barConfigRef.current.beatSubdivisions = newSubs;
      } else {
        dialConfigRef.current.beatSubdivisions = newSubs;
        persistSettings({
          beatSubdivisions: newSubs,
          ...(pattern?.length === 1
            ? {
                beatTypes: dialConfigRef.current.beatTypes,
              }
            : {}),
        });
      }
      scheduleReRender();
    },
    [beatSubdivisions, beatTypes, persistSettings, scheduleReRender]
  );

  const handlePatternChange = useCallback(
    (pattern: BeatType[]) => {
      setSubdivisionPattern(pattern);
      if (barModeRef.current) {
        barConfigRef.current.subdivisionPattern = [...pattern];
        const target = barStartBeatRef.current;
        if (target !== null) {
          setBeatSubdivisions((prev) => {
            const newSubs = { ...prev, [String(target)]: [...pattern] };
            barConfigRef.current.beatSubdivisions = newSubs;
            return newSubs;
          });
          engineRef.current?.setBeatSubdivision(target, pattern);
        }
        return;
      }

      dialConfigRef.current.subdivisionPattern = [...pattern];
      persistSettings({ subdivisionPattern: pattern });
    },
    [persistSettings]
  );

  // 바 선택(barStartBeat) 변경 시, 드로어의 서브디비전 패턴을 그 마디에 저장된
  // 패턴(beatSubdivisions[beatIndex])으로 동기화. 없으면 beatTypes[beatIndex] 기반
  // 단일 셀로 대체하고, 선택 해제(null) 시에는 이전 마디의 패턴이 남지 않도록 초기화한다.
  useEffect(() => {
    if (!barMode) return;
    if (barStartBeat === null) {
      setSubdivisionPattern(["normal"]);
      return;
    }
    const stored = beatSubdivisions[String(barStartBeat)];
    if (stored && stored.length > 0) {
      setSubdivisionPattern([...stored]);
    } else {
      const bt = beatTypes[barStartBeat] ?? "normal";
      setSubdivisionPattern([bt]);
    }
  }, [barMode, barStartBeat]);

  const handleReset = useCallback(() => {
    setSubdivisionPattern(["accent"]);
    const emptySubs: Record<string, BeatType[]> = {};
    setBeatSubdivisions(emptySubs);
    if (barModeRef.current) {
      barConfigRef.current.beatSubdivisions = {};
      barConfigRef.current.subdivisionPattern = ["accent"];
    } else {
      dialConfigRef.current.beatSubdivisions = {};
      dialConfigRef.current.subdivisionPattern = ["accent"];
    }
    for (let i = 0; i < beatsPerMeasure; i++) {
      engineRef.current?.setBeatSubdivision(i, null);
    }
    if (!barModeRef.current) {
      persistSettings({
        subdivisionPattern: ["accent"],
        beatSubdivisions: emptySubs,
      });
    }
  }, [beatsPerMeasure, persistSettings]);

  const measureDialCenter = useCallback(() => {
    if (!dialRef.current) return;
    if (Platform.OS === "web") {
      const el = dialRef.current as unknown as HTMLElement;
      if (el?.getBoundingClientRect) {
        const rect = el.getBoundingClientRect();
        dialCenterRef.current = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };
      }
    } else {
      const ref = dialRef.current as any;
      if (ref?.measureInWindow) {
        ref.measureInWindow(
          (x: number, y: number, w: number, h: number) => {
            if (w > 0 && h > 0) {
              dialCenterRef.current = { x: x + w / 2, y: y + h / 2 };
            }
          }
        );
      } else if (ref?.measure) {
        ref.measure(
          (
            _x: number,
            _y: number,
            w: number,
            h: number,
            pageX: number,
            pageY: number
          ) => {
            if (w > 0 && h > 0) {
              dialCenterRef.current = { x: pageX + w / 2, y: pageY + h / 2 };
            }
          }
        );
      }
    }
  }, []);

  const CENTER_HUB_RADIUS = S.ms(55, 0.3);

  const measureBarArea = useCallback(() => {
    const ref = barAreaRef.current as any;
    if (!ref) return;
    if (Platform.OS === "web" && ref?.getBoundingClientRect) {
      const rect = ref.getBoundingClientRect();
      barAreaLayoutRef.current = { y: rect.top, height: rect.height };
    } else if (ref?.measure) {
      ref.measure((_x: number, _y: number, _w: number, h: number, _px: number, py: number) => {
        barAreaLayoutRef.current = { y: py, height: h };
      });
    }
  }, []);

  const findDropTarget = useCallback(
    (pageX: number, pageY: number): number | null => {
      if (barMode) {
        const layout = barAreaLayoutRef.current;
        if (layout.height <= 0) return null;
        const relY = pageY - layout.y;
        if (relY < -60) return null;
        if (relY < 0) return -1;
        if (relY > layout.height) return null;
        const BAR_HEIGHT = 36;
        const barGap = 18;
        const rowH = BAR_HEIGHT + 1 + barGap;
        const scrollY = barScrollOffsetRef.current;
        const contentY = relY + scrollY;
        const centerPad = Math.max(0, (layout.height - BAR_HEIGHT) / 2);
        const adjustedY = contentY - centerPad;
        const beatIdx = Math.floor(adjustedY / rowH);
        if (beatIdx >= 0 && beatIdx < beatsPerMeasure) return beatIdx;
        return null;
      }

      const center = dialCenterRef.current;
      if (center.x === 0 && center.y === 0) return null;

      const distToCenter = Math.sqrt(
        (pageX - center.x) ** 2 + (pageY - center.y) ** 2
      );
      if (distToCenter < CENTER_HUB_RADIUS) return -1;

      let closestBeat: number | null = null;
      let closestDist = Infinity;

      for (let i = 0; i < beatsPerMeasure; i++) {
        const angle = (i / beatsPerMeasure) * 2 * Math.PI - Math.PI / 2;
        const dotX = center.x + S.dotRadiusFromCenter * Math.cos(angle);
        const dotY = center.y + S.dotRadiusFromCenter * Math.sin(angle);

        const dist = Math.sqrt((pageX - dotX) ** 2 + (pageY - dotY) ** 2);
        if (dist < closestDist) {
          closestDist = dist;
          closestBeat = i;
        }
      }

      if (closestDist < S.ms(55, 0.3)) return closestBeat;
      return null;
    },
    [beatsPerMeasure, barMode, S]
  );

  const handleDragStart = useCallback(() => {
    dragModeRef.current = barMode ? "bar" : "beat";
    setDragPattern([...subdivisionPatternRef.current]);
    setDragPos({ x: 0, y: 0 });
    setIsDragging(true);
    if (barMode) {
      measureBarArea();
    } else {
      measureDialCenter();
    }
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [measureDialCenter, measureBarArea, barMode]);

  const handleDragMove = useCallback(
    (pageX: number, pageY: number) => {
      setDragPos({ x: pageX, y: pageY });
      const target = findDropTarget(pageX, pageY);
      setDropTargetBeat(target);
    },
    [findDropTarget]
  );

  const handleDragCancel = useCallback(() => {
    clearDragState();
  }, [clearDragState]);

  useEffect(() => {
    if (isPlaying && isDragging) {
      clearDragState();
    }
  }, [isPlaying, isDragging, clearDragState]);

  useEffect(() => {
    if (dragModeRef.current === "bar" && !barMode && isDragging) {
      clearDragState();
    }
  }, [barMode, isDragging, clearDragState]);

  const applyToAllBeats = useCallback(
    (pattern: BeatType[]) => {
      const newSubs: Record<string, BeatType[]> = {};
      for (let i = 0; i < beatsPerMeasure; i++) {
        if (pattern.length >= 1) {
          newSubs[String(i)] = [...pattern];
          engineRef.current?.setBeatSubdivision(i, pattern);
        } else {
          engineRef.current?.setBeatSubdivision(i, null);
        }
      }
      setBeatSubdivisions(newSubs);
      // 패턴 첫 노트의 강세를 모든 비트 타입에 동기화 (뮤트는 전파하지 않음)
      if (pattern.length >= 1) {
        const firstType = pattern[0];
        if (firstType !== "mute") {
          setBeatTypes((prev) => {
            const next = prev.map(() => firstType);
            if (barModeRef.current) {
              barConfigRef.current.beatTypes = next;
            } else {
              dialConfigRef.current.beatTypes = next;
            }
            const engine = engineRef.current;
            if (engine) engine.setBeatTypes(next);
            return next;
          });
        }
      }
      if (barModeRef.current) {
        barConfigRef.current.beatSubdivisions = newSubs;
      } else {
        dialConfigRef.current.beatSubdivisions = newSubs;
      }
      persistSettings({ beatSubdivisions: newSubs });
    },
    [beatsPerMeasure, persistSettings]
  );

  const handleDragEnd = useCallback(
    (pageX: number, pageY: number) => {
      const target = findDropTarget(pageX, pageY);
      clearDragState();

      if (target === -1) {
        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        applyToAllBeats(subdivisionPattern);
      } else if (target !== null && subdivisionPattern.length >= 1) {
        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        const newSubs = { ...beatSubdivisions };
        newSubs[String(target)] = [...subdivisionPattern];
        setBeatSubdivisions(newSubs);
        engineRef.current?.setBeatSubdivision(target, subdivisionPattern);
        // 패턴 첫 노트의 강세를 해당 비트 타입에 동기화 (뮤트는 전파하지 않음)
        const firstType = subdivisionPattern[0];
        if (firstType !== "mute") {
          setBeatTypes((prev) => {
            const next = [...prev];
            next[target] = firstType;
            if (barModeRef.current) {
              barConfigRef.current.beatTypes = next;
            } else {
              dialConfigRef.current.beatTypes = next;
            }
            const engine = engineRef.current;
            if (engine) {
              const engineTypes = [...engine.getBeatTypes()];
              engineTypes[target] = firstType;
              engine.setBeatTypes(engineTypes);
            }
            return next;
          });
        }
        if (barModeRef.current) {
          barConfigRef.current.beatSubdivisions = { ...newSubs };
        } else {
          dialConfigRef.current.beatSubdivisions = { ...newSubs };
        }
        persistSettings({ beatSubdivisions: newSubs });
      } else if (target !== null && subdivisionPattern.length < 1) {
        if (Platform.OS !== "web") {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        const newSubs = { ...beatSubdivisions };
        delete newSubs[String(target)];
        setBeatSubdivisions(newSubs);
        engineRef.current?.setBeatSubdivision(target, null);
        if (barModeRef.current) {
          barConfigRef.current.beatSubdivisions = { ...newSubs };
        } else {
          dialConfigRef.current.beatSubdivisions = { ...newSubs };
        }
        persistSettings({ beatSubdivisions: newSubs });
      }
    },
    [findDropTarget, subdivisionPattern, beatSubdivisions, persistSettings, applyToAllBeats, clearDragState]
  );

  // handleBarRepeatChange / handleLoopBlocksChange → useBarMode

  const fullScreenResetFlash = useSharedValue(0);
  const fullScreenResetFlashStyle = useAnimatedStyle(() => ({
    opacity: fullScreenResetFlash.value * 0.5,
  }));

  // handleBeatQuickSaveOpen / handleBeatQuickSaveCancel / handleBeatQuickSaveConfirm → useBeatQuickSave
  // handleBarQuickSave → useBarMode

  const handleResetFlash = useCallback(() => {
    fullScreenResetFlash.value = withSequence(
      withTiming(1, { duration: 80 }),
      withTiming(0, { duration: 500, easing: Easing.out(Easing.quad) })
    );
  }, []);

  // handleAddBar / handleCopyBar / handleInsertBarAfter / handleDeleteBar
  // handleReorderBar / handleBarReset → useBarMode
  // applyEntryToEngine / handleLinkedEntryChange / handleLoadPracticeEntry → usePracticeBookLoad

  const noteStartPlayingEntry = useCallback(async (index: number) => {
    const q = noteQueueRef.current;
    if (index < 0 || index >= q.length) return;
    const entry = q[index];
    const engine = engineRef.current;
    if (!engine) return;

    const wasRunning = engine.getIsRunning();
    if (wasRunning) {
      engine.stop();
      clearSamplePlayStates();
    }

    setNoteCurrentIndex(index);
    noteCurrentIndexRef.current = index;
    noteMeasureCountRef.current = 0;
    noteFirstBeatFiredRef.current = false;
    setNoteMeasureCount(0);

    const entrySamples = entry.noteSamples || {};
    const entryNames = entry.noteSampleNames || {};
    const entrySources = entry.noteSampleSources || {};
    if (Object.keys(entrySamples).length > 0) {
      preloadNoteSampleSounds(entrySamples, true);
    } else {
      for (const s of Object.values(noteSampleSoundsRef.current)) {
        try { s.release(); } catch {}
      }
      noteSampleSoundsRef.current = {};
      void releaseAllStereoArtifacts();
    }
    noteSamplesRef.current = { ...entrySamples };
    noteSampleNamesRef.current = { ...entryNames };
    noteSampleSourcesRef.current = { ...entrySources };
    noteSampleVolumesRef.current = { ...(entry.noteSampleVolumes || {}) };
    noteSampleSpeedsRef.current = { ...(entry.noteSampleSpeeds || {}) };

    const { barRepeats: mgRepeats2, loopBlocks: mgBlocks2 } = migrateLayerBlocks((entry.loopBlocks || []) as LoopBlock[], { ...entry.barRepeats });
    setBpm(entry.bpm);
    bpmRef.current = entry.bpm;
    setBeatsPerMeasure(entry.beatsPerMeasure);
    setBeatTypes([...entry.beatTypes]);
    setBeatSubdivisions({ ...entry.beatSubdivisions });
    setBarRepeats(mgRepeats2);
    setLoopBlocks([...mgBlocks2]);
    setBarLoopMode(entry.barLoopMode || "once");
    setBlockPlayMode(entry.blockPlayMode || "loop");
    if (entry.subdivisionPattern) setSubdivisionPattern([...entry.subdivisionPattern]);
    setNoteSamples({ ...entrySamples });
    setNoteSampleNames({ ...entryNames });
    setNoteSampleSources({ ...entrySources });
    setNoteSampleVolumes({ ...(entry.noteSampleVolumes || {}) });
    setNoteSampleSpeeds({ ...(entry.noteSampleSpeeds || {}) });
    setNoteSampleChannels({ ...(entry.noteSampleChannels || {}) });
    noteSampleChannelsRef.current = { ...(entry.noteSampleChannels || {}) };

    applyEntryToEngineCore(engine, entry, beatDenominatorRef.current);
    engine.buildScheduleOnly();

    resetPlaybackVisuals();

    barConfigRef.current = {
      ...barConfigRef.current,
      beatsPerMeasure: entry.beatsPerMeasure,
      beatTypes: [...entry.beatTypes],
      beatSubdivisions: { ...entry.beatSubdivisions },
      barRepeats: { ...mgRepeats2 },
      loopBlocks: [...mgBlocks2],
      barClockMode: entry.barClockMode || "stopwatch",
      barTimerDuration: entry.barTimerDuration ?? 180,
      noteSamples: { ...entrySamples },
      noteSampleNames: { ...entryNames },
      noteSampleSources: { ...entrySources },
      noteSampleSpeeds: { ...(entry.noteSampleSpeeds || {}) },
      barLoopMode: "once",
      blockPlayMode: entry.blockPlayMode || "loop",
      hasBeenConfigured: true,
    };

    if (Platform.OS === "web") {
      if (webRenderedLoopRef.current) {
        webRenderedLoopRef.current.stop();
        webRenderedLoopRef.current = null;
      }
      const ctx = getWebAudioContext();
      if (ctx && ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }
      const src = soundSets[soundSetRef.current as keyof typeof soundSets] || soundSets.classic;
      await ensureWebClickBuffers(src as any);
      webClickReadyRef.current = true;
      engine.setPreRenderedAudio(false);
    }

    setIsPlaying(true);
    setNoteIsPlaying(true);
    engine.start();
    markAudioPlaying();
    engine.requestStopAfterMeasure();
    const playback = getPlaybackContext({ mode: "note", bpm: entry.bpm });
    showPlayingNotification(playback.bpm, playback.modeLabel, languageRef.current);
  }, [preloadNoteSampleSounds]);

  const createShuffledIndices = useCallback((length: number) => createShuffledIndicesPure(length), []);

  const noteAdvanceQueue = useCallback(() => {
    const q = noteQueueRef.current;
    const mode = notePlayModeRef.current;
    const ci = noteCurrentIndexRef.current;

    if (q.length === 0) {
      setNoteIsPlaying(false);
      return;
    }

    let nextIndex = -1;

    if (mode === "once") {
      if (ci + 1 < q.length) {
        nextIndex = ci + 1;
      }
    } else if (mode === "loop") {
      nextIndex = (ci + 1) % q.length;
    } else if (mode === "random") {
      let pos = noteShuffledPosRef.current + 1;
      const indices = noteShuffledIndicesRef.current;
      if (pos < indices.length && indices[pos] < q.length) {
        noteShuffledPosRef.current = pos;
        nextIndex = indices[pos];
      } else {
        const newIndices = createShuffledIndices(q.length);
        noteShuffledIndicesRef.current = newIndices;
        noteShuffledPosRef.current = 0;
        nextIndex = newIndices[0];
      }
    }

    if (nextIndex >= 0) {
      noteStartPlayingEntry(nextIndex);
    } else {
      setNoteIsPlaying(false);
      setIsPlaying(false);
      resetPlaybackVisuals();
      const playback = getPlaybackContext({ mode: "note" });
      showPausedNotification(playback.bpm, playback.modeLabel, languageRef.current);
    }
  }, [noteStartPlayingEntry, createShuffledIndices]);

  useEffect(() => { noteAdvanceQueueRef.current = noteAdvanceQueue; }, [noteAdvanceQueue]);

  /** Returns true for entries that should appear as note-mode sources:
   *  bar entries, beat entries, and score entries. */
  const isNoteSourceEntry = (e: PracticeEntry) =>
    (e.mode || "bar") === "bar" ||
    e.mode === "score" ||
    e.mode === "beat";

  const handleEnterNoteMode = useCallback(async (
    isCurrentTransition?: () => boolean,
    transitionToken?: number,
  ) => {
    const engine = engineRef.current;
    if (engine && isPlaying) {
      engine.stop();
      stopRenderedAudio();
      clearSamplePlayStates();
      setIsPreparing(false);
      setIsPlaying(false);
      resetPlaybackVisuals();
    }
    completePracticeSessionRef.current("manual");
    const book = await loadPracticeBook();
    if (!modeTransitionMayApply(isCurrentTransition)) return;
    setNoteBarEntries(book.filter(isNoteSourceEntry));
    if (transitionToken !== undefined) {
      modeTransitionWriteTokenRef.current = transitionToken;
    }
    try {
      setNoteMode(true);
    } finally {
      modeTransitionWriteTokenRef.current = null;
    }
    setNoteIsPlaying(false);
    setNoteCurrentIndex(-1);
  }, [isPlaying]);

  const handleExitNoteMode = useCallback(() => {
    const engine = engineRef.current;
    if (engine && isPlaying) {
      engine.stop();
      stopRenderedAudio();
      clearSamplePlayStates();
      setIsPlaying(false);
    }
    completePracticeSessionRef.current("manual");
    resetPlaybackVisuals();
    setNoteMode(false);
    setNoteIsPlaying(false);
    noteIsPlayingRef.current = false;
    setNoteCurrentIndex(-1);
    setNoteQueue([]);
    noteQueueRef.current = [];
    setNoteBarEntries([]);
  }, [isPlaying]);

  // ── 연습장 로드 훅 ──────────────────────────────────────────────────────────
  const {
    scorePracticeBookRef,
    applyEntryToEngine,
    handleLinkedEntryChange,
    handleLoadPracticeEntry,
  } = usePracticeBookLoad({
    engineRef,
    barModeRef, noteModeRef,
    barConfigRef, barBpmRef, dialConfigRef,
    beatDenominatorRef,
    noteSamplesRef, noteSampleNamesRef, noteSampleSourcesRef, noteSampleChannelsRef, noteSampleVolumesRef,
    noteSampleSpeedsRef,
    noteQueueRef, notePlayModeRef, noteIsPlayingRef,
    seamlessNextEntryRef, loadedPracticeNoteRef,
    isPlaying, barMode, noteMode,
    beatsPerMeasure, beatTypes, beatSubdivisions,
    barRepeats, loopBlocks,
    noteSamples, noteSampleNames, noteSampleSources, noteSampleChannels, noteSampleVolumes, noteSampleSpeeds,
    setBpm, setBarBpm, setBeatsPerMeasure, setBeatTypes, setBeatSubdivisions,
    setBarRepeats, setLoopBlocks, setBarLoopMode, setBlockPlayMode, setSubdivisionPattern,
    setNoteSamples, setNoteSampleNames, setNoteSampleSources, setNoteSampleChannels, setNoteSampleVolumes, setNoteSampleSpeeds,
    setBarMode, setNoteMode,
    setIsPlaying, setIsPreparing,
    setNoteQueue, setNotePlayMode, setNoteCurrentIndex, setNoteIsPlaying, setNoteBarEntries,
    stopRenderedAudio, clearSamplePlayStates, resetPlaybackVisuals,
    preloadNoteSampleSounds,
    handleExitNoteMode,
    completePracticeSession: () => completePracticeSessionRef.current("manual"),
  });

  const currentMode: ModeSlot = showMenu
    ? "menu"
    : stageModeActive
    ? "stage"
    : coreMode === "note"
    ? "note"
    : showPracticeBook
    ? "practice"
    : coreMode === "bar"
    ? "bar"
    : coreMode === "score"
    ? "score"
    : "beat";

  const switchToMode = useCallback(async (mode: ModeSlot, direction: "left" | "right" = "right") => {
    const transitionGeneration = modeTransitionCoordinatorRef.current.begin();
    const state: ModeSwitchState = {
      currentMode,
      stageModeActive, showMenu, showPracticeBook, activeModal,
    };
    // 콘텐츠가 바뀔 때 슬라이드+페이드 적용
    // 메뉴 진입·이탈 → 위에서 아래로 슬라이드 (Y축)
    // 그 외 모드 전환  → 다이얼 방향에 따라 좌우 슬라이드 (X축)
    if (mode !== currentMode) {
      cancelAnimation(modeSlideX);
      cancelAnimation(modeSlideY);
      cancelAnimation(modeSlideOpacity);
      modeSlideX.value       = direction === "right" ? windowWidth * 0.25 : -windowWidth * 0.25;
      modeSlideY.value       = 0;
      modeSlideOpacity.value = 0;
    }
    const applyOwnedCoreMode = (
      nextMode: "beat" | "bar" | "note" | "score",
      apply: () => void,
    ) => {
      modeTransitionCoordinatorRef.current.expectModeCommit(nextMode, transitionGeneration);
      modeTransitionWriteTokenRef.current = transitionGeneration;
      try {
        apply();
      } finally {
        modeTransitionWriteTokenRef.current = null;
      }
    };
    const underlyingCoreMode = stageExitRevealMode(coreMode);
    const underlyingMode: ModeSlot = stageModeActive ? "stage" : underlyingCoreMode;
    const cb: ModeSwitchCallbacks = {
      handleExitNoteMode: () => applyOwnedCoreMode("beat", handleExitNoteMode),
      handleBarModeChange: (v) => applyOwnedCoreMode(v ? "bar" : "beat", () => handleBarModeChange(v)),
      setScoreMode: (m) => applyOwnedCoreMode(m === null ? "beat" : "score", () => setScoreMode(m as "list" | "editor" | null)),
      exitStageMode: () => {
        // Stage is an overlay: closing it reveals whichever core mode was
        // underneath, rather than necessarily returning to beat.
        modeTransitionCoordinatorRef.current.expectModeCommit(underlyingCoreMode, transitionGeneration);
        exitStageModeForPlayback();
      },
      setActiveModal: (m) => {
        const expected = m === "menu"
          ? "menu"
          : m === "practiceBook"
          ? "practice"
          : m === null
          ? underlyingMode
          : null;
        if (expected) modeTransitionCoordinatorRef.current.expectModeCommit(expected, transitionGeneration);
        setActiveModal(m as ActiveModal);
      },
      handleEnterNoteMode: () => handleEnterNoteMode(
        () => modeTransitionCoordinatorRef.current.isCurrent(transitionGeneration),
        transitionGeneration,
      ),
      enterStageMode: () => {
        modeTransitionCoordinatorRef.current.expectModeCommit("stage", transitionGeneration);
        enterStageModeForPlayback();
      },
      openExclusive: (m) => {
        if (m === "practiceBook") {
          modeTransitionCoordinatorRef.current.expectModeCommit("practice", transitionGeneration);
        }
        openExclusive(m as ActiveModal);
      },
    };
    try {
      await applySwitchToMode(mode, state, cb);
    } catch (error) {
      modeTransitionCoordinatorRef.current.finish(transitionGeneration);
      throw error;
    }
    // An older async mode entry (notably note-mode practice-book loading)
    // must not perform any post-transition work after a newer selection wins.
    if (!modeTransitionCoordinatorRef.current.isCurrent(transitionGeneration)) {
      modeTransitionCoordinatorRef.current.finish(transitionGeneration);
      return;
    }
    // Load practice entries after entering stage mode (side-effect kept in hook)
    if (mode === "stage") {
      loadPracticeBook().then((entries) => {
        if (modeTransitionCoordinatorRef.current.isCurrent(transitionGeneration)) {
          setStagePracticeEntries(entries);
        }
      }).catch(() => {}).finally(() => {
        modeTransitionCoordinatorRef.current.finish(transitionGeneration);
      });
      return;
    }
    modeTransitionCoordinatorRef.current.finish(transitionGeneration);
  }, [currentMode, coreMode, stageModeActive, showMenu, showPracticeBook, handleExitNoteMode, handleBarModeChange, handleEnterNoteMode, enterStageModeForPlayback, exitStageModeForPlayback, activeModal, openExclusive, modeSlideX, modeSlideY, modeSlideOpacity, windowWidth]);

  // ── 상단 중앙 레이블 탭 → 다음 모드 순환 ──
  const MODE_CYCLE: ModeSlot[] = ["beat", "bar", "note", "stage", "practice"];
  const cycleToNextMode = useCallback(() => {
    const idx = MODE_CYCLE.indexOf(currentMode as typeof MODE_CYCLE[number]);
    const nextMode = MODE_CYCLE[(idx + 1) % MODE_CYCLE.length];
    void switchToMode(nextMode, "right");
  }, [currentMode, switchToMode]);

  // 모드 변경 후 useEffect에서 withTiming 시작 (초기값은 switchToMode에서 사전 설정)
  const prevModeRef = useRef<ModeSlot>(currentMode);
  useEffect(() => {
    if (prevModeRef.current !== currentMode) {
      prevModeRef.current = currentMode;
      // A queued synchronous mode can commit while a newer async selection is
      // loading. The coordinator recognises that earlier commit without
      // cancelling the newer request; only a truly external mode update wins.
      modeTransitionCoordinatorRef.current.acknowledgeModeCommit(currentMode);
      cancelAnimation(modeSlideX);
      cancelAnimation(modeSlideY);
      cancelAnimation(modeSlideOpacity);
      modeSlideX.value       = withTiming(0, { duration: 270, easing: Easing.out(Easing.cubic) });
      modeSlideY.value       = withTiming(0, { duration: 270, easing: Easing.out(Easing.cubic) });
      modeSlideOpacity.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMode, modeSlideX, modeSlideY, modeSlideOpacity]);

  const handleNoteAddToQueue = useCallback((entry: PracticeEntry, insertAt?: number) => {
    setNoteQueue(prev => {
      const pos = (typeof insertAt === "number") ? insertAt : prev.length;
      const result = applyQueueInsert(
        prev,
        noteCurrentIndexRef.current,
        noteShuffledIndicesRef.current,
        noteShuffledPosRef.current,
        notePlayModeRef.current,
        pos,
        entry,
      );
      noteQueueRef.current = result.queue;
      noteShuffledIndicesRef.current = result.shuffledIndices;
      if (result.currentIndex !== noteCurrentIndexRef.current) {
        noteCurrentIndexRef.current = result.currentIndex;
        setNoteCurrentIndex(result.currentIndex);
      }
      return result.queue;
    });
  }, []);


  const handleNoteRemoveFromQueue = useCallback((index: number) => {
    const curIdx = noteCurrentIndexRef.current;
    const wasPlaying = noteIsPlayingRef.current;
    const updated = noteQueueRef.current.filter((_, i) => i !== index);
    noteQueueRef.current = updated;
    setNoteQueue(updated);

    if (curIdx === index && wasPlaying) {
      const nextIdx = curIdx < updated.length ? curIdx : 0;
      if (updated.length > 0) {
        noteStartPlayingEntry(nextIdx);
      } else {
        const engine = engineRef.current;
        if (engine && engine.getIsRunning()) { engine.stop(); stopRenderedAudio(); clearSamplePlayStates(); }
        setNoteIsPlaying(false);
        noteIsPlayingRef.current = false;
        setIsPlaying(false);
        setNoteCurrentIndex(-1);
        resetPlaybackVisuals();
      }
    } else if (curIdx > index) {
      setNoteCurrentIndex(curIdx - 1);
    }
  }, [noteStartPlayingEntry]);

  const handleNoteReorderQueue = useCallback((fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= noteQueueRef.current.length) return;
    const updated = [...noteQueueRef.current];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);
    noteQueueRef.current = updated;
    setNoteQueue(updated);
    const ci = noteCurrentIndexRef.current;
    if (ci === fromIndex) {
      setNoteCurrentIndex(toIndex);
    } else if (fromIndex < ci && toIndex >= ci) {
      setNoteCurrentIndex(ci - 1);
    } else if (fromIndex > ci && toIndex <= ci) {
      setNoteCurrentIndex(ci + 1);
    }
  }, []);

  const handleNoteQueueItemImageChange = useCallback((index: number, imageUri: string | undefined) => {
    setNoteQueue(prev => {
      const updated = [...prev];
      if (updated[index]) {
        updated[index] = { ...updated[index], imageUri };
      }
      noteQueueRef.current = updated;
      return updated;
    });
  }, []);

  const handleNoteInsertNext = useCallback((entry: PracticeEntry) => {
    setNoteQueue(prev => {
      const ci = noteCurrentIndexRef.current;
      const pos = Math.max(0, ci + 1);
      const result = applyQueueInsert(
        prev,
        ci,
        noteShuffledIndicesRef.current,
        noteShuffledPosRef.current,
        notePlayModeRef.current,
        pos,
        entry,
      );
      noteQueueRef.current = result.queue;
      noteShuffledIndicesRef.current = result.shuffledIndices;
      if (result.currentIndex !== noteCurrentIndexRef.current) {
        noteCurrentIndexRef.current = result.currentIndex;
        setNoteCurrentIndex(result.currentIndex);
      }
      return result.queue;
    });
  }, []);

  const handleNoteTogglePlay = useCallback(() => {
    if (noteIsPlayingRef.current) {
      noteIsPlayingRef.current = false;
      const engine = engineRef.current;
      if (engine) {
        engine.stop();
        stopRenderedAudio();
        clearSamplePlayStates();
      }
      setIsPlaying(false);
      setNoteIsPlaying(false);
      resetPlaybackVisuals();
      const playback = getPlaybackContext({ mode: "note" });
      showPausedNotification(playback.bpm, playback.modeLabel, languageRef.current);
    } else {
      const q = noteQueueRef.current;
      if (q.length === 0) return;
      let startIndex = 0;
      if (notePlayModeRef.current === "random") {
        const indices = createShuffledIndices(q.length);
        noteShuffledIndicesRef.current = indices;
        noteShuffledPosRef.current = 0;
        startIndex = indices[0];
      }
      noteStartPlayingEntry(startIndex);
    }
  }, [noteStartPlayingEntry, createShuffledIndices]);

  useEffect(() => { handleNoteTogglePlayRef.current = handleNoteTogglePlay; }, [handleNoteTogglePlay]);

  const handleNoteManualNext = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || !noteIsPlayingRef.current) return;
    engine.requestStopAfterMeasure();
  }, []);

  const handleNoteManualNextImmediate = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || !noteIsPlayingRef.current) return;
    engine.stop();
    stopRenderedAudio();
    clearSamplePlayStates();
    noteAdvanceQueueRef.current();
  }, []);

  const handleNoteSave = useCallback(async (): Promise<boolean> => {
    const q = noteQueueRef.current;
    if (q.length === 0) return false;
    try {
      const firstEntry = q[0];
      const now = new Date();
      const label = `Note ${q.length} items ${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
      const noteEntry = createPracticeEntry(label, {
        mode: "note" as const,
        bpm: firstEntry.bpm,
        beatsPerMeasure: firstEntry.beatsPerMeasure,
        beatTypes: [...firstEntry.beatTypes],
        beatSubdivisions: {},
        barRepeats: {},
        barLoopMode: "once",
        subdivisionPattern: firstEntry.subdivisionPattern || ["accent"],
        noteQueueEntryIds: q.map(e => e.id),
        notePlayMode: notePlayModeRef.current,
        noteQueueEntries: serializeNoteQueueEntries(q),
      }, username);
      const existing = await loadPracticeBook();
      await savePracticeBook([noteEntry, ...existing]);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return true;
    } catch (e) {
      captureBreadcrumb({ category: "practice-book", message: "Note save error", level: "warning", data: { error: String(e) } });
      return false;
    }
  }, [username, t]);

  const handleNoteReset = useCallback(() => {
    noteIsPlayingRef.current = false;
    const engine = engineRef.current;
    if (engine && engine.getIsRunning()) {
      engine.stop();
      stopRenderedAudio();
      clearSamplePlayStates();
    }
    setNoteQueue([]);
    noteQueueRef.current = [];
    setNoteCurrentIndex(-1);
    setNoteIsPlaying(false);
    setIsPlaying(false);
    resetPlaybackVisuals();
  }, [resetPlaybackVisuals]);

  useEffect(() => {
    if (loopBlocks.length === 0) return;
    const clamped = loopBlocks
      .map(b => ({
        ...b,
        startBeat: Math.min(b.startBeat, beatsPerMeasure - 1),
        endBeat: Math.min(b.endBeat, beatsPerMeasure - 1),
      }))
      .filter(b => b.startBeat <= b.endBeat);
    const changed = clamped.length !== loopBlocks.length || clamped.some((b, i) => b.startBeat !== loopBlocks[i].startBeat || b.endBeat !== loopBlocks[i].endBeat);
    if (changed) {
      handleLoopBlocksChange(clamped);
    }
  }, [beatsPerMeasure]);

  const beatSubdivisionCounts = useMemo(() => beatSubdivisionCountsPure(beatSubdivisions), [beatSubdivisions]);

  const currentBarConfig = useMemo(() => selectCurrentBarConfig({
    barMode,
    bpm,
    beatsPerMeasure,
    beatTypes,
    beatSubdivisions,
    barRepeats,
    loopBlocks,
    barLoopMode,
    blockPlayMode,
    subdivisionPattern,
    noteSamples,
    noteSampleNames,
    noteSampleSources,
    noteSampleChannels,
    noteSampleVolumes,
    noteSampleSpeeds,
    dialConfig: dialConfigRef.current,
    barClockMode: barConfigRef.current.barClockMode,
    barTimerDuration: barConfigRef.current.barTimerDuration,
  }), [barMode, bpm, beatsPerMeasure, beatTypes, beatSubdivisions, barRepeats, loopBlocks, barLoopMode, blockPlayMode, subdivisionPattern, noteSamples, noteSampleNames, noteSampleSources, noteSampleChannels, noteSampleVolumes, noteSampleSpeeds]);

  // handleLoadPracticeEntry → usePracticeBookLoad

  const handleDeepLinkImport = useCallback((url: string) => {
    try {
      const parsed = Linking.parse(url);
      if (parsed.path === "practice" && parsed.queryParams?.d) {
        const decoded = JSON.parse(atob(decodeURIComponent(parsed.queryParams.d as string)));
        const safe = sanitizeDeepLinkEntry(decoded);
        if (safe) {
          const entry: PracticeEntry = {
            ...safe,
            id: Crypto.randomUUID(),
            createdAt: Date.now(),
          };
          Alert.alert(
            t("main", "importSettings"),
            `"${entry.label}" ${t("main", "importConfirm")}\n\n${t("practiceBook", "bpmUnit")}: ${entry.bpm} | ${entry.beatsPerMeasure} ${t("practiceBook", "beatsUnit")}`,
            [
              { text: t("main", "cancel"), style: "cancel" },
              {
                text: t("main", "apply"),
                onPress: () => handleLoadPracticeEntry(entry),
              },
              {
                text: t("main", "saveAndApply"),
                onPress: async () => {
                  const existing = await loadPracticeBook();
                  await savePracticeBook([entry, ...existing]);
                  handleLoadPracticeEntry(entry);
                  Alert.alert(t("main", "saved"), `"${entry.label}" ${t("main", "savedToNote")}`);
                },
              },
            ]
          );
        }
      }
    } catch (e) {
      captureBreadcrumb({ category: "deep-link", message: "Parse error", level: "warning", data: { error: String(e) } });
    }
  }, [handleLoadPracticeEntry]);

  useEffect(() => {
    const handleUrl = (event: { url: string }) => handleDeepLinkImport(event.url);
    const sub = Linking.addEventListener("url", handleUrl);
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLinkImport(url);
    });
    return () => sub.remove();
  }, [handleDeepLinkImport]);

  const pendingImportProcessed = useRef(false);
  useEffect(() => {
    if (pendingImportProcessed.current) return;
    const timer = setTimeout(async () => {
      const { consumePendingImport } = require("@/lib/pending-import");
      const decoded = consumePendingImport();
      const safe = decoded ? sanitizeDeepLinkEntry(decoded) : null;
      if (safe) {
        pendingImportProcessed.current = true;
        const entry: PracticeEntry = {
          ...safe,
          id: Crypto.randomUUID(),
          createdAt: Date.now(),
        };
        Alert.alert(
          t("main", "importSettings"),
          `"${entry.label}" ${t("main", "importConfirm")}\n\n${t("practiceBook", "bpmUnit")}: ${entry.bpm} | ${entry.beatsPerMeasure} ${t("practiceBook", "beatsUnit")}`,
          [
            { text: t("main", "cancel"), style: "cancel" },
            {
              text: t("main", "apply"),
              onPress: () => handleLoadPracticeEntry(entry),
            },
            {
              text: t("main", "saveAndApply"),
              onPress: async () => {
                const existing = await loadPracticeBook();
                await savePracticeBook([entry, ...existing]);
                handleLoadPracticeEntry(entry);
                Alert.alert(t("main", "saved"), `"${entry.label}" ${t("main", "savedToNote")}`);
              },
            },
          ]
        );
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [handleLoadPracticeEntry]);

  const handleSetPracticeNoteGoal = useCallback(async (entry: PracticeEntry, targetMinutes: number) => {
    const goals = await loadGoals();
    const existing = goals.find((g) => g.type === "session_goal" && g.practiceNoteId === entry.id);
    if (existing) {
      const updated = goals.map((g) =>
        g.id === existing.id ? { ...g, target: targetMinutes, label: `♫ ${entry.label}` } : g
      );
      await saveGoals(updated);
      Alert.alert(t("main", "goalEdited"), `"${entry.label}" ${t("main", "goalEditedMsg")}`);
      return;
    }
    const newGoal: Goal = {
      id: Crypto.randomUUID(),
      type: "session_goal",
      target: targetMinutes,
      label: `♫ ${entry.label}`,
      practiceNoteId: entry.id,
      practiceNoteLabel: entry.label,
    };
    const updated = [...goals, newGoal];
    await saveGoals(updated);
    Alert.alert(t("main", "goalSet"), `"${entry.label}" ${t("main", "goalSetMsg")} (${targetMinutes}${t("duration", "m")})`);
  }, []);

  const tempoLabel = getTempoLabelI18n(bpm, language);


  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;


  return {
    // Layout
    styles,
    C,
    S,
    t,
    themeMode,
    language,
    insets,
    webTopInset,
    webBottomInset,
    isLandscape,
    windowWidth,
    isLoaded,
    // Refs
    rootViewRef,
    barAreaRef,
    dialRef,
    stopwatchTimerRef,
    stopwatchTimerLandscapeRef,
    barScrollOffsetRef,
    engineRef,
    togglePlayPauseRef,
    updateBpmRef,
    beatDenominatorRef,
    seamlessNextEntryRef,
    tuningGuideOnSelectRef,
    reopenSignalGenAfterTuningGuideRef,
    settingsReturnModalRef,
    featureStartRef,
    practiceStartRef,
    discardPracticeSession,
    startOrResumePracticeSession,
    getPlaybackContext,
    discardRoomTracking,
    handleNoteTogglePlayRef,
    clickPCMCacheRef,
    allPlayersRef,
    volumeRef,
    // Core playback state
    bpm,
    beatsPerMeasure,
    beatDenominator,
    beatTypes,
    subdivisionPattern,
    beatSubdivisions,
    isPlaying,
    isPreparing,
    audioLifecycle,
    currentBeat,
    measureCount,
    activeSubNote,
    progressInfo,
    layerProgressMap,
    halfTime,
    // Playback handlers
    togglePlayPause,
    updateBpm,
    updateTimeSignature,
    handleBeatTypeChange,
    handleBeatSubdivisionChange,
    handleBeatDenominatorCycle,
    handleTapTempo,
    handleReset,
    startMetronome,
    retryAudioRecovery,
    handleTimerExpired,
    // Beat subdivision drag
    beatSubdivisionCounts,
    beatDirection,
    setBeatDirection,
    isDragging,
    dragPos,
    dragPattern,
    dropTargetBeat,
    handlePatternChange,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
    handleDragCancel,
    showSubdivisionLongPressHint,
    setShowSubdivisionLongPressHint,
    // Modal state
    activeModal,
    setActiveModal,
    openExclusive,
    markMenuItemReturn,
    clearMenuItemReturn,
    closeMenuItem,
    closeScoreMode,
    showSettings,
    showMenu,
    showSignalGen,
    showTuningGuide,
    showPracticeBook,
    showWorkUp,
    showOnboarding,
    showDrumKit,
    showScheduledStart,
    showFadeOut,
    showBpmDetect,
    showPolygon,
    // Settings
    volume,
    updateVolume,
    sampleVolume,
    updateSampleVolume,
    backgroundPlay,
    updateBackgroundPlay,
    autoResumeAfterInterruption,
    updateAutoResumeAfterInterruption,
    soundSet,
    updateSoundSet,
    previewSoundSet,
    layerSoundSets,
    setLayerSoundSets,
    layerSoundSetsRef,
    customSoundSets,
    setCustomSoundSets,
    flashMode,
    updateFlashMode,
    hapticMode,
    updateHapticMode,
    audioOffsetMs,
    updateAudioOffset,
    timerStopMode,
    updateTimerStopMode,
    loggingEnabled,
    setLoggingEnabled,
    username,
    updateUsername,
    roomTrackingActive,
    trackingRoomName,
    startRoomTracking,
    stopRoomTracking,
    handleResetApp,
    handleOnboardingComplete,
    keyBindings,
    setKeyBindings,
    keyBindingsRef,
    showKbShortcuts,
    setShowKbShortcuts,
    showNativeKbHint,
    setShowNativeKbHint,
    showReboot,
    permissionRecoveryToast,
    // Easter egg
    easterEggActive,
    easterEggRevealBpm,
    easterEggGiveUpMode,
    easterEggShakeCount,
    easterEggSuccessCount,
    easterEggHintDirection,
    easterEggApplyBpm,
    handleEasterEggGuess,
    handleEasterEggToggleApplyBpm,
    handleEasterEggTrigger,
    handleEasterEggGiveUpRef,
    // Bar mode
    barMode,
    barBpm,
    setBarBpm,
    barBpmRef,
    handleBarBpmChange,
    handleBarModeChange,
    barLoopMode,
    setBarLoopMode,
    blockPlayMode,
    setBlockPlayMode,
    blockPlayModeRef,
    handleRandomBarPlay,
    handleReplayRandomBarSession,
    handleSaveRandomBarSession,
    handleApplyRandomBarSession,
    handleReturnToOriginalBarList,
    randomBarSession,
    randomBarConfig,
    onRandomBarConfigChange: setRandomBarConfig,
    onRandomViewportCapacityChange: (capacity: number) => {
      randomBarViewportCapacityRef.current = Math.max(1, Math.floor(capacity));
    },
    barRepeats,
    loopBlocks,
    barStartBeat,
    setBarStartBeat,
    handleBarRepeatChange,
    handleBarMeterChange,
    handleLoopBlocksChange,
    handleBarReset,
    handleBarQuickSave,
    handleResetFlash,
    handleAddBar,
    handleDeleteBar,
    handleCopyBar,
    handleReorderBar,
    handleInsertBarAfter,
    barCellOpacity,
    setBarCellOpacity,
    barRowHeight,
    setBarRowHeight,
    barMetronomeChannel,
    setBarMetronomeChannel,
    barMetronomeChannelRef,
    stageSettings,
    updateStageSettings,
    currentBarConfig,
    // Note mode
    noteMode,
    handleEnterNoteMode,
    handleExitNoteMode,
    noteQueue,
    noteBarEntries,
    notePlayMode,
    noteCurrentIndex,
    noteIsPlaying,
    noteMeasureCount,
    setNotePlayMode,
    handleNoteAddToQueue,
    handleNoteRemoveFromQueue,
    handleNoteReorderQueue,
    handleNoteInsertNext,
    handleNoteTogglePlay,
    handleNoteManualNext,
    handleNoteManualNextImmediate,
    handleNoteSave,
    handleNoteReset,
    handleNoteQueueItemImageChange,
    // Note samples / recorder
    noteSamples,
    noteSampleNames,
    noteSampleSources,
    noteSampleChannels,
    noteSampleVolumes,
    noteSampleSpeeds,
    noteSampleMetroChannels,
    recorderTarget,
    setRecorderTarget,
    handleNoteRecordRequest,
    handleNoteRecordSave,
    handleNoteRecordDelete,
    handleNoteRecordSuggestBpm,
    // Score mode
    scoreMode,
    setScoreMode,
    scoreEditorDoc,
    setScoreEditorDoc,
    scorePracticeBookRef,
    handleLinkedEntryChange,
    // Practice book
    handleLoadPracticeEntry,
    handleSetPracticeNoteGoal,
    // Stage mode
    stageModeActive,
    enterStageMode: enterStageModeForPlayback,
    exitStageMode: exitStageModeForPlayback,
    stagePracticeEntries,
    setStagePracticeEntries,
    activeStagePracticeEntryId,
    setActiveStagePracticeEntryId,
    // Fade out
    fadeOutPhase,
    fadeOutStatusText,
    fadeOutSessionRef,
    fadeOutMutedRef,
    fadeOutMeasureCountRef,
    setFadeOutPhase,
    setFadeOutMeasureInPhase,
    // Landscape
    landscapeReversed,
    setLandscapeReversed,
    showLandscapeImage,
    setShowLandscapeImage,
    landscapeImageUri,
    landscapeImageModalVisible,
    setLandscapeImageModalVisible,
    landscapeContentType,
    setLandscapeContentType,
    landscapeStats,
    landscapeStatsLogs,
    formatStatMinutes,
    pickLandscapeImage,
    removeLandscapeImage,
    // Native keyboard handlers
    handleNativeKeyDown,
    handleNativeKeyUp,
    // Animation values / styles
    flashOpacity,
    beatProgress,
    flashStyle,
    halfTimeFlashStyle,
    modeSlideStyle,
    fullScreenResetFlashStyle,
    // Mode switcher
    currentMode,
    cycleToNextMode,
    switchToMode,
    // Goal popups
    completedGoalPopups,
    dismissGoalPopup,
    // Audio helpers used inline in JSX
    getClickPCMs,
    polygonOnBeatRef,
    scheduleReRender,
    stopRenderedAudio,
    clearSamplePlayStates,
    resetPlaybackVisuals,
    notifyVoicePlayState,
    persistSettings,
    persistStatus,
    noteSamplePersistStatus,
    // Tempo label
    tempoLabel,
    // Additional state setters exposed for JSX inline callbacks
    setIsPreparing,
    setIsPlaying,
    setBeatsPerMeasure,
    setBeatTypes,
    setBeatSubdivisions,
    setSubdivisionPattern,
    setFlashMode,
    setHapticMode,
    setBarMode,
    setBarRepeats,
    setLoopBlocks,
    // Refs exposed for JSX inline callbacks
    barModeRef,
    barConfigRef,
    dialConfigRef,
    barLoopModeRef,
    languageRef,
    // Window height
    windowHeight,
    // Beat mode quick save
    beatQuickSaveModalVisible,
    setBeatQuickSaveModalVisible,
    beatQuickSaveName,
    setBeatQuickSaveName,
    beatQuickSaveToast,
    handleBeatQuickSaveOpen,
    handleBeatQuickSaveCancel,
    handleBeatQuickSaveConfirm,
  };
}
