import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useLandscapePanel } from "@/hooks/useLandscapePanel";
import { useNotificationBridge } from "@/hooks/useNotificationBridge";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useAudioPipeline } from "@/hooks/useAudioPipeline";
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
import { ensurePermission, tryRecoverPermissionActions, hasAnyPendingPermissionAction, runPermissionRecoveryLoop } from "@/lib/permissions";
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
} from "react-native-reanimated";
import { safePlay, notifyAudioPoolFallback, detectPoolCutoffRisk } from "@/lib/audio-utils";
import { registerMetronomeBridge, notifyUserMetronomeToggle, setAutoResumeAfterInterruption as setAudioSessionAutoResume } from "@/lib/audio-session";
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
import { MetronomeEngine, soundSets } from "@/lib/metronome-engine";
import type { BeatType, ProgressInfo } from "@/lib/metronome-engine";
import { loadSettings, saveSettings, loadCustomSoundSets, saveCustomSoundSets, loadPracticeBook, savePracticeBook, createPracticeEntry, runStorageMigrations, type MetronomeSettings } from "@/lib/storage";
import type { FlashMode, HapticMode, SoundSet, BuiltinSoundSet, CustomSoundSetConfig, CustomSoundSample, FadeOutSettings, PracticeEntry } from "@/lib/storage";
import type { BarRepeat, LoopBlock } from "@/components/BeatIndicator";
import type { StopwatchTimerHandle } from "@/components/StopwatchTimer";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useDeepLink } from "@/contexts/DeepLinkContext";
import { useVoiceAssistant } from "@/contexts/VoiceAssistantContext";
import { make_styles } from "@/app/index.styles";
import { defaultBeatTypes, isCompoundMeterBeatCount, isSafeNoteSampleUri, createInitialDialConfig, createInitialBarConfig, createShuffledIndices as createShuffledIndicesPure, applyQueueInsert, beatSubdivisionCounts as beatSubdivisionCountsPure, selectCurrentBarConfig, computeLandscapeStats, entryToBarConfig, applyEntryToEngine as applyEntryToEngineCore, migrateLayerBlocks, applyLoopBlocksChange } from "@/app/index.helpers";
import {
  type ActiveModal,
  type SgTgState,
  deriveModalFlags,
  openTuningGuideFromSignalGen,
  closeTuningGuide,
} from "@/lib/modal-routing";
import { useAudioPlayers, BUILTIN_POOL_SIZE, type BuiltinPlayers, type SoundSetPlayers } from "@/hooks/useAudioPlayers";
import { useNoteSamples } from "@/hooks/useNoteSamples";
import { useBarConfig, useDialConfig } from "@/hooks/useBarDialConfig";
import { useMetronomeEngine } from "@/hooks/useMetronomeEngine";
import { useEasterEggQuiz } from "@/hooks/useEasterEggQuiz";
import { useFadeOutSession } from "@/hooks/useFadeOutSession";
import { useGoalPopups } from "@/hooks/useGoalPopups";
import { usePracticeRoomTracking } from "@/hooks/usePracticeRoomTracking";
import { useStageMode } from "@/hooks/useStageMode";
import { applySwitchToMode, type ModeSwitchState, type ModeSwitchCallbacks } from "@/lib/stage-mode-logic";
import { createDebouncedPersister, type DebouncedPersister } from "@/lib/persist";
import { createRafBatcher } from "@/lib/raf-batcher";
import type { ModeSlot } from "@/components/ModeSwitcherDial";
import type { ScoreDocument } from "@/lib/score-types";
import type { OnboardingResult } from "@/components/OnboardingModal";
import { loadLoggingEnabled, saveLoggingEnabled, addActivityLog, loadActivityLogs, loadGoals, saveGoals } from "@/lib/activity-log";
import { loadNoteSamples, saveNoteSamples, setNoteSample, removeNoteSample, hasNoteSample, loadNoteSampleNames, saveNoteSampleNames, setNoteSampleName, removeNoteSampleName, loadNoteSampleSources, saveNoteSampleSources, setNoteSampleSource, removeNoteSampleSource, loadNoteSampleChannels, saveNoteSampleChannels, setNoteSampleChannel, removeNoteSampleChannel, loadNoteSampleMetroChannels, saveNoteSampleMetroChannels, setNoteSampleMetroChannel, removeNoteSampleMetroChannel } from "@/lib/note-samples";
import type { NoteSampleMap, NoteSampleNameMap, NoteSampleSourceMap, NoteSampleChannelMap, NoteSampleMetroChannelMap, SampleSource } from "@/lib/note-samples";
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
  loadKeyBindings,
  saveKeyBindings,
  matchesBinding,
  isEditableTarget,
  nativeKeyToCode,
  DEFAULT_BINDINGS,
  type KeyBindingsMap,
  type NormalizedKeyEvent,
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

  const [bpm, setBpm] = useState(120);
  const bpmRef = useRef(bpm);
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
  const [halfTime, setHalfTime] = useState(false);
  const [beatDenominator, setBeatDenominator] = useState<2 | 4 | 8>(4);
  useEffect(() => { beatDenominatorRef.current = beatDenominator; }, [beatDenominator]);
  const [beatsPerMeasure, setBeatsPerMeasure] = useState(4);
  const [beatTypes, setBeatTypes] = useState<BeatType[]>(defaultBeatTypes(4));
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
  const [subdivisionPattern, setSubdivisionPattern] = useState<BeatType[]>([
    "accent",
  ]);
  const [beatSubdivisions, setBeatSubdivisions] = useState<
    Record<string, BeatType[]>
  >({});
  const {
    landscapeImageUri, setLandscapeImageUri,
    landscapeImageModalVisible, setLandscapeImageModalVisible,
    showLandscapeImage, setShowLandscapeImage,
    landscapeContentType, setLandscapeContentType,
    landscapeStatsLogs, landscapeStats, formatStatMinutes,
    pickLandscapeImage, removeLandscapeImage,
  } = useLandscapePanel({ isLandscape, isPlaying, t });

  const [barMode, setBarMode] = useState(false);
  const barModeRef = useRef(barMode);
  const [barStartBeat, setBarStartBeat] = useState<number | null>(null);
  const [barLoopMode, setBarLoopMode] = useState<"loop" | "once">("once");
  const [blockPlayMode, setBlockPlayMode] = useState<"sequential" | "loop" | "random">("loop");
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
  const nativeKbDownRef = useRef<((e: NormalizedKeyEvent) => void) | null>(null);
  const nativeKbUpRef = useRef<((e: NormalizedKeyEvent) => void) | null>(null);
  const stopwatchTimerRef = useRef<StopwatchTimerHandle>(null);
  const stopwatchTimerLandscapeRef = useRef<StopwatchTimerHandle>(null);
  const [barRepeats, setBarRepeats] = useState<Record<number, BarRepeat>>({});
  const [loopBlocks, setLoopBlocks] = useState<LoopBlock[]>([]);
  const barAreaRef = useRef<View>(null);
  const barAreaLayoutRef = useRef({ y: 0, height: 0 });
  const barScrollOffsetRef = useRef(0);

  const { dialConfigRef } = useDialConfig();
  const { barConfigRef } = useBarConfig();

  const [progressInfo, setProgressInfo] = useState<ProgressInfo | null>(null);
  const [layerProgressMap, setLayerProgressMap] = useState<Record<string, number>>({});

  const [noteMode, setNoteMode] = useState(false);
  const noteModeRef = useRef(false);
  useEffect(() => { noteModeRef.current = noteMode; }, [noteMode]);

  // 악보 모드: null=비활성, "list"=목록, "editor"=편집기
  const [scoreMode, setScoreMode] = useState<null | "list" | "editor">(null);
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
  // 악보-마디 프리셋 전환: 연습장 캐시 + 버전 카운터(race 방지)
  const scorePracticeBookRef = useRef<PracticeEntry[]>([]);
  const linkedEntryVersionRef = useRef(0);
  const [noteBarEntries, setNoteBarEntries] = useState<PracticeEntry[]>([]);
  const noteAdvanceQueueRef = useRef<() => void>(() => {});
  const noteShuffledIndicesRef = useRef<number[]>([]);
  const noteShuffledPosRef = useRef(0);

  const [isDragging, setIsDragging] = useState(false);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [dropTargetBeat, setDropTargetBeat] = useState<number | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const isPreparingRef = useRef(false);
  useEffect(() => { isPreparingRef.current = isPreparing; }, [isPreparing]);
  const preparingCancelledRef = useRef(false);
  const [volume, setVolume] = useState(0.75);
  const volumeRef = useRef(0.75);
  const [sampleVolume, setSampleVolume] = useState(0.8);
  const sampleVolumeRef = useRef(0.8);
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
    showMoreMenu,
    showDrumKit,
    showScheduledStart,
    showFadeOut,
    showBpmDetect,
    showStemSep,
  } = deriveModalFlags(activeModal);
  const [backgroundPlay, setBackgroundPlay] = useState(false);
  const [autoResumeAfterInterruption, setAutoResumeAfterInterruption] = useState(true);
  const [soundSet, setSoundSet] = useState<SoundSet>("classic");
  const [layerSoundSets, setLayerSoundSets] = useState<Record<number, SoundSet>>({});
  const layerSoundSetsRef = useRef<Record<number, SoundSet>>({});
  useEffect(() => { layerSoundSetsRef.current = layerSoundSets; }, [layerSoundSets]);
  const [flashMode, setFlashMode] = useState<FlashMode>("accent");
  const [hapticMode, setHapticMode] = useState<HapticMode>("all");
  const [audioOffsetMs, setAudioOffsetMs] = useState(0);
  const [timerStopMode, setTimerStopMode] = useState<"immediate" | "end-of-cycle">("end-of-cycle");
  const [landscapeReversed, setLandscapeReversed] = useState(false);
  const [beatDirection, setBeatDirection] = useState<"cw" | "ccw">("cw");
  const [username, setUsername] = useState("");
  const tuningGuideOnSelectRef = useRef<((freq: number) => void) | null>(null);
  // SignalGenerator → TuningGuide 전환 시 SignalGen을 닫고, TuningGuide
  // 종료 직후 자동으로 SignalGen을 재오픈하기 위한 플래그.
  // 단일 활성 모달 보장(태스크 #70)을 위해 두 모달의 동시 visible=true를 금지한다.
  const reopenSignalGenAfterTuningGuideRef = useRef(false);
  const [loggingEnabled, setLoggingEnabled] = useState(false);
  const practiceStartRef = useRef<number | null>(null);
  const featureStartRef = useRef<{ name: string; start: number } | null>(null);
  const loadedPracticeNoteRef = useRef<{ id: string; label: string } | null>(null);
  const { completedGoalPopups, checkCompletedGoals, dismissGoalPopup } = useGoalPopups();
  const {
    roomTrackingActive, setRoomTrackingActive,
    trackingRoomName, setTrackingRoomName,
    startRoomTracking, stopRoomTracking,
  } = usePracticeRoomTracking(checkCompletedGoals);
  const [showReboot, setShowReboot] = useState(false);
  const {
    fadeOutSessionRef, fadeOutMutedRef, fadeOutPhase, setFadeOutPhase,
    fadeOutMeasureInPhase, setFadeOutMeasureInPhase, fadeOutMeasureCountRef,
    clearFadeOutSession, fadeOutStatusText,
  } = useFadeOutSession(isPlaying, t);


  const closeAllModals = useCallback(() => {
    tuningGuideOnSelectRef.current = null;
    setActiveModal(null);
    setLandscapeImageModalVisible(false);
    setRecorderTarget(null);
  }, []);

  // Tracks which modal opened settings, so we can return there on close
  const settingsReturnModalRef = useRef<ActiveModal>(null);

  const openExclusive = useCallback((modal: ActiveModal) => {
    tuningGuideOnSelectRef.current = null;
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
        setActiveModal(null);
        return true;
      }
      if (showPracticeBook) { setActiveModal(null); return true; }
      if (showWorkUp) { setActiveModal(null); return true; }
      if (showFadeOut) { setActiveModal(null); return true; }
      if (showScheduledStart) { setActiveModal(null); return true; }
      if (showDrumKit) { setActiveModal(null); return true; }
      if (showStemSep) { setActiveModal(null); return true; }
      if (showMoreMenu) { setActiveModal(null); return true; }
      if (showMenu) { setActiveModal(null); return true; }
      if (showOnboarding) { setActiveModal(null); return true; }
      if (showReboot) { setShowReboot(false); return true; }
      if (barModeRef.current) { setBarMode(false); barModeRef.current = false; return true; }
      Alert.alert("앱 종료", "앱을 종료하시겠습니까?", [
        { text: "취소", style: "cancel" },
        { text: "종료", style: "destructive", onPress: () => BackHandler.exitApp() },
      ]);
      return true;
    };
    const sub = BackHandler.addEventListener("hardwareBackPress", onBack);
    return () => sub.remove();
  }, [activeModal, showReboot]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        engineRef.current?.resyncTiming();
      }
    });
    return () => sub.remove();
  }, []);

  const [permissionRecoveryToast, setPermissionRecoveryToast] = useState<string | null>(null);
  const recoveryToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showRecoveryToast = useCallback((msg: string) => {
    if (recoveryToastTimerRef.current) clearTimeout(recoveryToastTimerRef.current);
    setPermissionRecoveryToast(msg);
    recoveryToastTimerRef.current = setTimeout(() => setPermissionRecoveryToast(null), 2500);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const runRecovery = () => runPermissionRecoveryLoop({
      hasPending: hasAnyPendingPermissionAction,
      recover: tryRecoverPermissionActions,
      isCancelled: () => cancelled,
      onRecovered: (kind) => {
        const key = kind === "mic" ? "recoveredMic" : "recoveredPhoto";
        showRecoveryToast(t("permissions", key));
      },
    });
    if (Platform.OS === "web") {
      const onVis = () => {
        if (typeof document !== "undefined" && document.visibilityState === "visible") {
          void runRecovery();
        }
      };
      if (typeof document !== "undefined") {
        document.addEventListener("visibilitychange", onVis);
        return () => {
          cancelled = true;
          document.removeEventListener("visibilitychange", onVis);
        };
      }
      return () => { cancelled = true; };
    }
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") void runRecovery();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [t, showRecoveryToast]);

  useEffect(() => {
    return () => {
      if (recoveryToastTimerRef.current) clearTimeout(recoveryToastTimerRef.current);
    };
  }, []);

  const noteSamplesHook = useNoteSamples();
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
  } = noteSamplesHook;
  const [barMetronomeChannel, setBarMetronomeChannel] = useState<SampleChannel>("both");
  const barMetronomeChannelRef = useRef<SampleChannel>("both");
  const [barCellOpacity, setBarCellOpacity] = useState(0.55);
  const [barRowHeight, setBarRowHeight] = useState(44);
  const [noteSampleMetroChannels, setNoteSampleMetroChannels] = useState<NoteSampleMetroChannelMap>({});
  const noteSampleMetroChannelsRef = useRef<NoteSampleMetroChannelMap>({});
  const [recorderTarget, setRecorderTarget] = useState<{ beat: number; sub: number } | null>(null);

  const { engineRef } = useMetronomeEngine();
  const tapTimesRef = useRef<number[]>([]);
  const dialRef = useRef<View>(null);
  const dialCenterRef = useRef({ x: 0, y: 0 });

  const audioPlayersHook = useAudioPlayers(soundSet);
  const { allPlayers, allPlayersRef, soundSetRef, highToggle, lowToggle, strongToggle } = audioPlayersHook;

  // ── Audio pipeline (PCM cache, rendered player, watchdog, sample players) ──
  const {
    renderedPlayerRef, clickPCMCacheRef, samplePCMCacheRef, renderedUrlRef,
    webRenderedLoopRef, webClickReadyRef, lastAudioFireRef,
    armAudioWatchdogRef, clearAudioWatchdogRef,
    noteSampleSoundsRef, samplePlayStateRef,
    buildRenderedPlayer, scheduleReRender, stopRenderedAudio, warmupAudioPlayers,
    getClickPCMs, getSamplePCMs, getLayerClickPCMsForSchedule,
    invalidateSamplePCMCache, preloadNoteSampleSounds, clearSamplePlayStates,
    armAudioWatchdog, clearAudioWatchdog,
  } = useAudioPipeline({
    engineRef, soundSet, soundSetRef, customSoundSetsRef, allPlayersRef,
    layerSoundSetsRef, noteSamplesRef, noteSampleChannelsRef, barModeRef,
    barMetronomeChannelRef, noteSampleMetroChannelsRef, volumeRef, sampleVolumeRef,
    isPlayingRef, bpmRef, t, showRecoveryToast,
  });

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

    engine.setAudioCallbacks(
      () => {
        if (fadeOutMutedRef.current) return;
        if (Platform.OS === "web") {
          const ch = barModeRef.current
            ? (noteSampleMetroChannelsRef.current[String(engine.getCurrentBeat())] ?? barMetronomeChannelRef.current)
            : "both";
          if (playWebClick("high", ch)) lastAudioFireRef.current = Date.now();
          return;
        }
        try {
          const active = getCustomPlayer("high", highToggle.current);
          highToggle.current = (highToggle.current + 1) % BUILTIN_POOL_SIZE;
          restartPlayer(active);
          lastAudioFireRef.current = Date.now();
        } catch (e) {}
      },
      () => {
        if (fadeOutMutedRef.current) return;
        if (Platform.OS === "web") {
          const ch = barModeRef.current
            ? (noteSampleMetroChannelsRef.current[String(engine.getCurrentBeat())] ?? barMetronomeChannelRef.current)
            : "both";
          if (playWebClick("low", ch)) lastAudioFireRef.current = Date.now();
          return;
        }
        try {
          const active = getCustomPlayer("low", lowToggle.current);
          lowToggle.current = (lowToggle.current + 1) % BUILTIN_POOL_SIZE;
          restartPlayer(active);
          lastAudioFireRef.current = Date.now();
        } catch (e) {}
      },
      () => {
        if (fadeOutMutedRef.current) return;
        if (Platform.OS === "web") {
          const ch = barModeRef.current
            ? (noteSampleMetroChannelsRef.current[String(engine.getCurrentBeat())] ?? barMetronomeChannelRef.current)
            : "both";
          if (playWebClick("strong", ch)) lastAudioFireRef.current = Date.now();
          return;
        }
        try {
          const active = getCustomPlayer("strong", strongToggle.current);
          strongToggle.current = (strongToggle.current + 1) % BUILTIN_POOL_SIZE;
          restartPlayer(active);
          lastAudioFireRef.current = Date.now();
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
        playWebClick(role === "strong" ? "strong" : role === "high" ? "high" : "low", ch);
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
            return;
          }
          players = allPlayersRef.current.classic;
        } else {
          players = allPlayersRef.current[layerSet as keyof typeof allPlayersRef.current] || allPlayersRef.current.classic;
        }
        restartPlayer(pickSlot(players, role, toggle));
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
        playWebClick(role === "strong" ? "strong" : role === "high" ? "high" : "low", ch);
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
            return;
          }
          players = allPlayersRef.current.classic;
        } else {
          players = allPlayersRef.current[blockSet as keyof typeof allPlayersRef.current] || allPlayersRef.current.classic;
        }
        restartPlayer(pickSlot(players, role, toggle));
      } catch (e) {}
    });


    loadSettings().then((settings) => {
      setBpm(settings.bpm);
      const loadedDenom = settings.beatDenominator ?? 4;
      baseBpmRef.current = Math.round(settings.bpm * (loadedDenom / 4));
      setBeatsPerMeasure(settings.beatsPerMeasure);
      if (settings.beatDenominator) {
        setBeatDenominator(settings.beatDenominator);
      }
      // 분모에 따라 실제 엔진 속도 조정 (표시 BPM은 그대로 유지)
      engine.setBpm(settings.bpm * (4 / loadedDenom));
      engine.setBeatsPerMeasure(settings.beatsPerMeasure);

      if (settings.subdivisionPattern && settings.subdivisionPattern.length > 0) {
        setSubdivisionPattern(settings.subdivisionPattern);
      }
      if (settings.beatSubdivisions) {
        setBeatSubdivisions(settings.beatSubdivisions);
        engine.setAllBeatSubdivisions(settings.beatSubdivisions);
      }
      if (settings.volume !== undefined) {
        setVolume(settings.volume);
        volumeRef.current = settings.volume;
      }
      if (settings.sampleVolume !== undefined) {
        setSampleVolume(settings.sampleVolume);
        sampleVolumeRef.current = settings.sampleVolume;
      }
      if (settings.backgroundPlay !== undefined) {
        setBackgroundPlay(settings.backgroundPlay);
      }
      if (settings.autoResumeAfterInterruption !== undefined) {
        setAutoResumeAfterInterruption(settings.autoResumeAfterInterruption);
        setAudioSessionAutoResume(settings.autoResumeAfterInterruption);
      }
      if (settings.soundSet) {
        setSoundSet(settings.soundSet);
      }
      if (settings.layerSoundSets) {
        setLayerSoundSets(settings.layerSoundSets);
      }
      if (settings.flashMode) {
        setFlashMode(settings.flashMode);
        flashModeRef.current = settings.flashMode;
      }
      if (settings.hapticMode) {
        setHapticMode(settings.hapticMode);
        engine.setHapticMode(settings.hapticMode);
      }
      if (settings.audioOffsetMs !== undefined) {
        setAudioOffsetMs(settings.audioOffsetMs);
        engine.setAudioOffsetMs(settings.audioOffsetMs);
      }
      if (settings.themeColor) {
        setThemeColor(settings.themeColor);
      }
      if (settings.timerStopMode) {
        setTimerStopMode(settings.timerStopMode);
      }
      if (settings.landscapeReversed !== undefined) {
        setLandscapeReversed(settings.landscapeReversed);
      }
      if (settings.showLandscapeImage !== undefined) {
        setShowLandscapeImage(settings.showLandscapeImage);
      }
      if (settings.landscapeContentType) {
        setLandscapeContentType(settings.landscapeContentType);
      }
      if (settings.beatDirection) {
        setBeatDirection(settings.beatDirection);
      }
      if (settings.barMetronomeChannel) {
        setBarMetronomeChannel(settings.barMetronomeChannel);
        barMetronomeChannelRef.current = settings.barMetronomeChannel;
      }
      if (settings.barCellOpacity != null) setBarCellOpacity(settings.barCellOpacity);
      if (settings.barRowHeight != null) setBarRowHeight(settings.barRowHeight);
      if (settings.username) {
        setUsername(settings.username);
      }
      loadCustomSoundSets().then(setCustomSoundSets);
      loadKeyBindings().then((kb) => { setKeyBindings(kb); keyBindingsRef.current = kb; });
      setIsLoaded(true);

      const set = settings.soundSet || "classic";
      const src = soundSets[set as keyof typeof soundSets] || soundSets.classic;
      Promise.all([
        loadAssetPCM(src.strong),
        loadAssetPCM(src.high),
        loadAssetPCM(src.low),
      ]).then(([strong, high, low]) => {
        clickPCMCacheRef.current[set] = { strong, high, low };
      }).catch(() => {});
    });

    Promise.all([loadNoteSamples(), loadNoteSampleNames(), loadNoteSampleSources(), loadNoteSampleChannels(), loadNoteSampleMetroChannels()]).then(async ([samples, names, sources, channels, metroChannels]) => {
      setNoteSamples(samples);
      noteSamplesRef.current = samples;
      setNoteSampleNames(names);
      noteSampleNamesRef.current = names;
      setNoteSampleSources(sources);
      noteSampleSourcesRef.current = sources;
      setNoteSampleChannels(channels);
      noteSampleChannelsRef.current = channels;
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
        }, effectiveDur);
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

  const handleNoteRecordSave = useCallback(async (uri: string, name: string, source: SampleSource, channel: SampleChannel, metronomeChannel: MetroChannel) => {
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

  const flashModeRef = useRef(flashMode);
  useEffect(() => { flashModeRef.current = flashMode; }, [flashMode]);

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
      if (webRenderedLoopRef.current) {
        try { webRenderedLoopRef.current.stop(); } catch {}
        webRenderedLoopRef.current = null;
      }
      engine.setPendingMeasureStartAction(null);
      // takeover 핸드셰이크: 사전 렌더 audio가 정리됐으니 실시간 발화 short-circuit을 해제한다.
      engine.setPreRenderedAudio(false);
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

  useEffect(() => {
    try {
      Object.values(allPlayers).forEach((set) => {
        const v = Math.max(0, Math.min(1, volume));
        set.highA.volume = v;
        set.highB.volume = v;
        set.highC.volume = v;
        set.highD.volume = v;
        set.lowA.volume = v;
        set.lowB.volume = v;
        set.lowC.volume = v;
        set.lowD.volume = v;
        set.strongA.volume = v;
        set.strongB.volume = v;
        set.strongC.volume = v;
        set.strongD.volume = v;
      });
    } catch (e) {}
  }, [volume, allPlayers]);

  // 설정 영속화 스냅샷 ref. 매 렌더에서 최신 React state를 복사해 둔다 →
  // createDebouncedPersister가 flush 시점에 항상 최신값을 읽는다.
  const persistSnapshotRef = useRef<MetronomeSettings>({
    bpm,
    beatsPerMeasure,
    subdivisions: 1,
    subdivisionPattern,
    beatSubdivisions,
    volume,
    sampleVolume,
    backgroundPlay,
    autoResumeAfterInterruption,
    soundSet,
    layerSoundSets,
    flashMode,
    hapticMode,
    audioOffsetMs,
    timerStopMode,
    landscapeReversed,
    showLandscapeImage,
    landscapeContentType,
    beatDirection,
    barMetronomeChannel,
  });
  persistSnapshotRef.current = {
    bpm,
    beatsPerMeasure,
    subdivisions: 1,
    subdivisionPattern,
    beatSubdivisions,
    volume,
    sampleVolume,
    backgroundPlay,
    autoResumeAfterInterruption,
    soundSet,
    layerSoundSets,
    flashMode,
    hapticMode,
    audioOffsetMs,
    timerStopMode,
    landscapeReversed,
    showLandscapeImage,
    landscapeContentType,
    beatDirection,
    barMetronomeChannel,
    barCellOpacity,
    barRowHeight,
  };
  const persistSettingsRef = useRef<DebouncedPersister<MetronomeSettings> | null>(null);
  if (!persistSettingsRef.current) {
    persistSettingsRef.current = createDebouncedPersister<MetronomeSettings>(
      () => persistSnapshotRef.current,
      // saveSettings는 실패 시 reject한다. 디바운서가 자동으로 백오프 재시도하고
      // 최종 실패 시 storage-notifier 구독자(StorageErrorAlert)에게 알린다.
      (merged) => saveSettings(merged),
      500,
      { maxAttempts: 3, baseDelayMs: 500 },
    );
  }
  const persistSettings = persistSettingsRef.current;

  const updateVolume = useCallback(
    (newVolume: number) => {
      setVolume(newVolume);
      volumeRef.current = newVolume;
      persistSettings({ volume: newVolume });
      scheduleReRender();
    },
    [persistSettings, scheduleReRender]
  );

  const updateSampleVolume = useCallback(
    (newVol: number) => {
      setSampleVolume(newVol);
      sampleVolumeRef.current = newVol;
      for (const player of Object.values(noteSampleSoundsRef.current)) {
        try { player.volume = Math.max(0, Math.min(1, newVol)); } catch {}
      }
      persistSettings({ sampleVolume: newVol });
      scheduleReRender();
    },
    [persistSettings, scheduleReRender]
  );

  useEffect(() => {
    for (const player of Object.values(noteSampleSoundsRef.current)) {
      try { player.volume = Math.max(0, Math.min(1, sampleVolume)); } catch {}
    }
  }, [sampleVolume]);

  const updateBackgroundPlay = useCallback(
    (value: boolean) => {
      setBackgroundPlay(value);
      persistSettings({ backgroundPlay: value });
    },
    [persistSettings]
  );

  const updateAutoResumeAfterInterruption = useCallback(
    (value: boolean) => {
      setAutoResumeAfterInterruption(value);
      setAudioSessionAutoResume(value);
      persistSettings({ autoResumeAfterInterruption: value });
    },
    [persistSettings]
  );

  const updateSoundSet = useCallback(
    (value: SoundSet) => {
      delete clickPCMCacheRef.current[value];
      clearWebClickBuffers();           // 캐시 초기화 → preload effect가 새 셋으로 재로드
      webClickReadyRef.current = false;
      setSoundSet(value);
      persistSettings({ soundSet: value });
      scheduleReRender();
    },
    [persistSettings, scheduleReRender]
  );

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

  const updateFlashMode = useCallback(
    (value: FlashMode) => {
      setFlashMode(value);
      flashModeRef.current = value;
      persistSettings({ flashMode: value });
    },
    [persistSettings]
  );

  const updateHapticMode = useCallback(
    (value: HapticMode) => {
      setHapticMode(value);
      engineRef.current?.setHapticMode(value);
      persistSettings({ hapticMode: value });
    },
    [persistSettings]
  );

  const updateAudioOffset = useCallback(
    (value: number) => {
      setAudioOffsetMs(value);
      engineRef.current?.setAudioOffsetMs(value);
      persistSettings({ audioOffsetMs: value });
    },
    [persistSettings]
  );

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
      const engine = engineRef.current;
      if (engine?.getIsRunning()) {
        engine.stop();
      }
      await AsyncStorage.clear();

      setActiveModal(null);
      tuningGuideOnSelectRef.current = null;

      setBpm(120);
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
        noteSamples: {},
        noteSampleNames: {},
        noteSampleSources: {},
        noteSampleChannels: {},
      };
      barConfigRef.current = {
        beatsPerMeasure: 4,
        beatTypes: defaultBeatTypes(4),
        beatSubdivisions: {},
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
      setBackgroundPlay(false);
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
        engine.setBeatsPerMeasure(4);
        engine.setHapticMode("all");
        engine.setAudioOffsetMs(0);
        engine.setBeatTypes(defaultBeatTypes(4));
        engine.setAllBeatSubdivisions({});
        engine.setAllBarRepeats({});
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
  }, [setThemeColor]);

  const updateBpm = useCallback(
    (newBpm: number) => {
      const clampedBpm = Math.max(20, Math.min(300, newBpm));
      setBpm(clampedBpm);
      // 엔진은 분모 반영 속도로 실행 (표시 BPM은 clampedBpm 그대로)
      engineRef.current?.setBpm(clampedBpm * (4 / beatDenominator));
      persistSettings({ bpm: clampedBpm });
      scheduleReRender();
    },
    [beatDenominator, persistSettings, scheduleReRender]
  );

  const handleEasterEggGuess = useCallback((guess: number) => {
    const actual = easterEggActualBpmRef.current;
    if (Math.abs(guess - actual) <= 5) {
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEasterEggSuccessCount(c => c + 1);
      setEasterEggGiveUpMode(false);
      setEasterEggHintDirection(null);
      setEasterEggRevealBpm(actual);
      setTimeout(() => {
        if (easterEggApplyBpmRef.current) {
          updateBpm(actual);
        } else {
          engineRef.current?.setBpm(easterEggPrevBpmRef.current);
        }
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
  }, [stopRenderedAudio, resetPlaybackVisuals, setEasterEggHintDirection, updateBpm, easterEggApplyBpmRef, setEasterEggApplyBpm]);

  const handleEasterEggGiveUp = useCallback((stopEngine = false) => {
    const actual = easterEggActualBpmRef.current;
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setEasterEggGiveUpMode(true);
    setEasterEggHintDirection(null);
    setEasterEggRevealBpm(actual);
    if (stopEngine) {
      engineRef.current?.stop();
      stopRenderedAudio();
      clearSamplePlayStates();
      setIsPlaying(false);
      isPlayingRef.current = false;
      setIsPreparing(false);
      resetPlaybackVisuals();
    }
    setTimeout(() => {
      if (easterEggApplyBpmRef.current) {
        updateBpm(actual);
      } else {
        engineRef.current?.setBpm(easterEggPrevBpmRef.current);
      }
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
  }, [stopRenderedAudio, clearSamplePlayStates, resetPlaybackVisuals, setEasterEggHintDirection, updateBpm, easterEggApplyBpmRef, setEasterEggApplyBpm]);

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

  const updateTimeSignature = useCallback(
    (beats: number) => {
      beats = Math.max(1, Math.min(16, beats));
      const oldBeats = beatsPerMeasure;
      const oldTypes = beatTypes;
      const isAdding = beats > oldBeats;

      let newTypes: BeatType[];
      if (isAdding && !isCompoundMeterBeatCount(beats)) {
        newTypes = [...oldTypes];
        for (let i = oldTypes.length; i < beats; i++) {
          newTypes.push("normal");
        }
      } else {
        newTypes = defaultBeatTypes(beats);
      }

      setBeatsPerMeasure(beats);
      setBeatTypes(newTypes);
      engineRef.current?.setBeatsPerMeasure(beats);
      engineRef.current?.setBeatTypes(newTypes);
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      const cleaned: Record<string, BeatType[]> = {};
      for (const [k, v] of Object.entries(beatSubdivisions)) {
        if (Number(k) < beats) cleaned[k] = v;
      }
      if (isAdding && barModeRef.current) {
        const currentPattern = subdivisionPattern;
        for (let i = oldBeats; i < beats; i++) {
          if (currentPattern.length > 1 || (currentPattern.length === 1 && currentPattern[0] !== "normal")) {
            cleaned[String(i)] = [...currentPattern];
            engineRef.current?.setBeatSubdivision(i, [...currentPattern]);
          }
        }
      }
      setBeatSubdivisions(cleaned);
      if (barModeRef.current) {
        barConfigRef.current.beatsPerMeasure = beats;
        barConfigRef.current.beatTypes = newTypes;
        barConfigRef.current.beatSubdivisions = cleaned;
      } else {
        dialConfigRef.current.beatsPerMeasure = beats;
        dialConfigRef.current.beatTypes = newTypes;
        dialConfigRef.current.beatSubdivisions = cleaned;
        persistSettings({ beatsPerMeasure: beats, beatSubdivisions: cleaned });
      }
    },
    [persistSettings, beatSubdivisions, beatsPerMeasure, beatTypes, subdivisionPattern]
  );

  const handleBeatTypeChange = useCallback(
    (index: number, type: BeatType) => {
      setBeatTypes((prev) => {
        const next = [...prev];
        next[index] = type;
        if (barModeRef.current) {
          barConfigRef.current.beatTypes = next;
        } else {
          dialConfigRef.current.beatTypes = next;
        }
        return next;
      });
      // 서브디비전이 있으면 첫 번째 셀을 비트 타입과 동기화
      setBeatSubdivisions((prev) => {
        const subs = prev[String(index)];
        if (!subs || subs.length === 0) return prev;
        const newSubs = { ...prev, [String(index)]: [type, ...subs.slice(1)] as BeatType[] };
        if (barModeRef.current) {
          barConfigRef.current.beatSubdivisions = newSubs;
        } else {
          dialConfigRef.current.beatSubdivisions = newSubs;
        }
        engineRef.current?.setAllBeatSubdivisions(newSubs);
        return newSubs;
      });
      const engine = engineRef.current;
      if (engine) {
        const currentTypes = [...engine.getBeatTypes()];
        currentTypes[index] = type;
        engine.setBeatTypes(currentTypes);
      }
    },
    []
  );

  useEffect(() => { barModeRef.current = barMode; }, [barMode]);
  const barStartBeatRef = useRef(barStartBeat);
  useEffect(() => { barStartBeatRef.current = barStartBeat; }, [barStartBeat]);
  const barLoopModeRef = useRef(barLoopMode);
  useEffect(() => { barLoopModeRef.current = barLoopMode; }, [barLoopMode]);
  /** 셋리스트 seamless 전환 시 onMeasureComplete에서 즉시 적용할 다음 항목 */
  const seamlessNextEntryRef = useRef<PracticeEntry | null>(null);
  const blockPlayModeRef = useRef(blockPlayMode);
  useEffect(() => { blockPlayModeRef.current = blockPlayMode; }, [blockPlayMode]);

  const togglePlayPause = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;

    // 모달이 열려있는 동안 사용자가 직접 토글했음을 audio-session에 알려서
    // 모달 닫힐 때 우리가 무심코 자동 resume하지 않도록 한다.
    notifyUserMetronomeToggle();

    // BPM 퀴즈 이스터에그 활성 중 정지 → 정답 공개 후 비트모드로 복귀
    if (easterEggActiveRef.current) {
      handleEasterEggGiveUpRef.current(true);
      return;
    }

    if (isPreparing && !isPlaying) {
      preparingCancelledRef.current = true;
      setIsPreparing(false);
      return;
    }

    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    const modeLabel = barModeRef.current ? "Bar" : "Dial";
    if (isPlaying) {
      seamlessNextEntryRef.current = null; // 수동 정지 시 예약된 seamless 취소
      clearAudioWatchdogRef.current();
      engine.stop();
      stopRenderedAudio();
      clearSamplePlayStates();
      setIsPreparing(false);
      setIsPlaying(false);
      notifyVoicePlayState(false);
      resetPlaybackVisuals();
      showPausedNotification(bpm, modeLabel, languageRef.current);
      if (loggingEnabled && practiceStartRef.current) {
        const dur = Math.round((Date.now() - practiceStartRef.current) / 1000);
        if (dur >= 3) {
          const noteRef = loadedPracticeNoteRef.current;
          addActivityLog({
            type: "practice_session",
            data: {
              bpm,
              mode: barMode ? "bar" : "dial",
              duration: dur,
              ...(barMode ? { barConfig: { beatsPerMeasure, subdivisions: subdivisionPattern.length } } : {}),
              ...(barMode && noteRef ? { practiceNoteId: noteRef.id, practiceNoteLabel: noteRef.label } : {}),
            },
          }).then(() => checkCompletedGoals());
        }
        practiceStartRef.current = null;
      }
    } else {
      resetPlaybackVisuals();
      clearSamplePlayStates();

      const startBeat = barModeRef.current ? barStartBeatRef.current : undefined;
      showPlayingNotification(bpm, modeLabel, languageRef.current);
      if (loggingEnabled) {
        practiceStartRef.current = Date.now();
      }

      if (barModeRef.current) {
        engine.setBeatTypes([...(barConfigRef.current.beatTypes || [])]);
        engine.setAllBeatSubdivisions(barConfigRef.current.beatSubdivisions || {});
        engine.setAllBarRepeats(barConfigRef.current.barRepeats || {});
        engine.setLoopBlocks(barConfigRef.current.loopBlocks || []);
        engine.setBlockPlayMode(blockPlayModeRef.current);
        const bpmOverrides: Record<number, number> = {};
        for (const [k, v] of Object.entries(barConfigRef.current.barRepeats || {})) {
          if (v.bpm) bpmOverrides[Number(k)] = v.bpm;
        }
        engine.setAllBarBpmOverrides(bpmOverrides);
      } else {
        engine.setBeatTypes([...(dialConfigRef.current.beatTypes || [])]);
        engine.setAllBeatSubdivisions(dialConfigRef.current.beatSubdivisions || {});
      }
      engine.buildScheduleOnly();

      preparingCancelledRef.current = false;

      try {
        if (Platform.OS === "web") {
          const ctx = getWebAudioContext();
          // ① 항상 resume 시도 — 이미 running이면 즉시 resolve (no-op)
          if (ctx) {
            await ctx.resume().catch(() => {});
          }
          // ② 버퍼 미준비면 엔진 시작 전에 먼저 로드
          //    (preload effect에서 이미 완료됐으면 즉시 true 반환)
          if (!webClickReadyRef.current) {
            const src = soundSets[soundSetRef.current as keyof typeof soundSets] || soundSets.classic;
            const ready = await ensureWebClickBuffers(src as any).catch(() => false);
            if (ready) webClickReadyRef.current = true;
          }

          // context running + buffers ready 상태에서 시작
          setIsPreparing(false);
          setIsPlaying(true);
          notifyVoicePlayState(true);
          isPlayingRef.current = true;
          engine.start(startBeat ?? undefined);
          armAudioWatchdogRef.current();

          // 백그라운드: PCM 렌더 후 pre-rendered loop으로 전환
          ;(async () => {
            try {
              const src = soundSets[soundSetRef.current as keyof typeof soundSets] || soundSets.classic;
              const ready = await ensureWebClickBuffers(src as any);
              if (!ready || !engineRef.current?.getIsRunning()) return;
              webClickReadyRef.current = true;

              // ctx는 이미 위에서 resume됨 — 한 번 더 suspend된 경우만 처리
              if (ctx && ctx.state === "suspended") {
                await ctx.resume().catch(() => {});
              }

              if (webRenderedLoopRef.current) {
                webRenderedLoopRef.current.stop();
                webRenderedLoopRef.current = null;
              }

              try {
                const scheduleInfo = engineRef.current.getScheduleInfo();
                const ticks = scheduleInfo.ticks as TickInfo[];
                const [clickPCMs, layerClickPCMs] = await Promise.all([
                  getClickPCMs(soundSetRef.current),
                  getLayerClickPCMsForSchedule(ticks),
                ]);
                if (!engineRef.current?.getIsRunning()) return;
                const pcm = renderMeasure({
                  schedule: ticks,
                  measureDurationMs: scheduleInfo.durationMs,
                  clickPCMs,
                  samplePCMs: new Map(),
                  clickVolume: Math.max(1.0, volumeRef.current),
                  sampleVolume: 0,
                  metronomeChannel: barModeRef.current ? barMetronomeChannelRef.current : "both",
                  metroChannelsByBeat: barModeRef.current ? noteSampleMetroChannelsRef.current : undefined,
                  layerClickPCMs,
                });
                if (volumeRef.current > 1.0) {
                  if (pcm instanceof Float32Array) { applySoftClip(pcm); }
                  else { applySoftClip(pcm.left); applySoftClip(pcm.right); }
                }
                // 다음 마디 경계에서 루프 시작 — 마디 중간에 시작하면 위상이 어긋남
                engineRef.current.setPendingMeasureStartAction(() => {
                  if (!engineRef.current?.getIsRunning()) return;
                  if (webRenderedLoopRef.current) {
                    try { webRenderedLoopRef.current.stop(); } catch {}
                    webRenderedLoopRef.current = null;
                  }
                  const loop = playWebRenderedLoop(pcm);
                  webRenderedLoopRef.current = loop;
                  engineRef.current?.setPreRenderedAudio(true);
                });
              } catch (renderErr) {
                captureBreadcrumb({ category: "metronome", message: "togglePlayPause: Web pre-render failed, using per-tick", level: "warning", data: { error: String(renderErr) } });
              }
            } catch {}
          })();
        } else {
          // 즉시 시작 — per-tick 모드로 바로 재생
          setIsPreparing(false);
          setIsPlaying(true);
          notifyVoicePlayState(true);
          isPlayingRef.current = true;
          engine.start(startBeat ?? undefined);
          armAudioWatchdogRef.current();

          // 백그라운드: pre-render 완료 후 rendered player로 전환
          buildRenderedPlayer().then(renderedPlayer => {
            if (!renderedPlayer || !engineRef.current?.getIsRunning()) {
              if (renderedPlayer) { try { renderedPlayer.release(); } catch {} }
              return;
            }
            stopRenderedAudio();
            renderedPlayerRef.current = renderedPlayer;
            renderedPlayer.volume = 1.0;
            engine.setPreRenderedAudio(true);
            safePlay(renderedPlayer, "metronome.start.native");
          }).catch(() => {});
        }

        if (barModeRef.current && barLoopModeRef.current === "once") {
          engine.requestStopAfterMeasure();
        }
      } catch {
        setIsPreparing(false);
      }
    }
  }, [isPlaying, loggingEnabled, bpm, barMode, beatsPerMeasure, getClickPCMs, getLayerClickPCMsForSchedule]);

  const togglePlayPauseRef = useRef(togglePlayPause);
  useEffect(() => { togglePlayPauseRef.current = togglePlayPause; }, [togglePlayPause]);

  useEffect(() => {
    registerMetronomeBridge({
      isRunning: () => engineRef.current?.getIsRunning() ?? false,
      pause: () => {
        if (engineRef.current?.getIsRunning()) togglePlayPauseRef.current?.();
      },
      resume: () => {
        if (!engineRef.current?.getIsRunning()) togglePlayPauseRef.current?.();
      },
    });
    return () => { registerMetronomeBridge(null); };
  }, []);
  const updateBpmRef = useRef(updateBpm);
  useEffect(() => { updateBpmRef.current = updateBpm; }, [updateBpm]);
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);

  const { stageModeActive, enterStageMode, exitStageMode } = useStageMode(bpmRef, updateBpm);
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
  const { notifyPlayState: notifyVoicePlayState } = useVoiceAssistant();
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
  useEffect(() => { anyModalOpenRef.current = activeModal !== null || landscapeImageModalVisible || recorderTarget !== null || showKbShortcuts || showNativeKbHint; }, [activeModal, landscapeImageModalVisible, recorderTarget, showKbShortcuts, showNativeKbHint]);

  const rootViewRef = useRef<View>(null);

  useEffect(() => {
    if (Platform.OS !== "web") {
      rootViewRef.current?.focus?.();
    }
  }, []);

  const handleNativeKeyDown = useCallback((nativeEvent: { key: string; shiftKey?: boolean; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean }) => {
    if (!nativeKbDownRef.current) return;
    const e: NormalizedKeyEvent = {
      code: nativeKeyToCode(nativeEvent.key),
      key: nativeEvent.key,
      shiftKey: nativeEvent.shiftKey ?? false,
      ctrlKey: nativeEvent.ctrlKey ?? false,
      altKey: nativeEvent.altKey ?? false,
      metaKey: nativeEvent.metaKey ?? false,
      preventDefault: () => {},
      target: null,
    };
    nativeKbDownRef.current(e);
  }, []);

  const handleNativeKeyUp = useCallback((nativeEvent: { key: string }) => {
    if (!nativeKbUpRef.current) return;
    const e: NormalizedKeyEvent = {
      code: nativeKeyToCode(nativeEvent.key),
      key: nativeEvent.key,
      shiftKey: false,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      preventDefault: () => {},
      target: null,
    };
    nativeKbUpRef.current(e);
  }, []);

  useKeyboardShortcuts({
    keyBindingsRef, bpmRef, updateBpmRef, beatsPerMeasureRef, updateTimeSignatureRef,
    barModeRef, noteModeRef, stopwatchTimerRef, stopwatchTimerLandscapeRef,
    subdivisionPatternRef, beatTypesRef, handleNoteTogglePlayRef, anyModalOpenRef,
    showKbShortcutsRef, showNativeKbHintRef, engineRef, nativeKbDownRef, nativeKbUpRef,
    togglePlayPauseRef, setNoteMode, setBarMode, setShowKbShortcuts, setShowNativeKbHint,
    setActiveModal, setBarLoopMode, setBlockPlayMode, setBeatsPerMeasure, setBeatTypes,
    setSubdivisionPattern, persistSettings,
  });

  // ── Notification bridge (TOGGLE_PLAY / BPM_UP / BPM_DOWN from lock screen) ─
  useNotificationBridge({
    engineRef, barModeRef, barConfigRef, dialConfigRef, barLoopModeRef,
    blockPlayModeRef, barStartBeatRef, bpmRef, updateBpmRef, languageRef,
    renderedPlayerRef, buildRenderedPlayer, stopRenderedAudio, clearSamplePlayStates,
    resetPlaybackVisuals, setIsPlaying, setIsPreparing,
  });


  const handleBarModeChange = useCallback((toBarMode: boolean) => {
    const engine = engineRef.current;
    if (!engine) return;

    if (isPlaying) {
      engine.stop();
      stopRenderedAudio();
      clearSamplePlayStates();
      setIsPreparing(false);
      setIsPlaying(false);
      resetPlaybackVisuals();
    }
    setBarStartBeat(null);

    if (toBarMode) {
      dialConfigRef.current = {
        beatsPerMeasure,
        beatTypes: [...beatTypes],
        beatSubdivisions: { ...beatSubdivisions },
        noteSamples: { ...noteSamples },
        noteSampleNames: { ...noteSampleNames },
        noteSampleSources: { ...noteSampleSources },
        noteSampleChannels: { ...noteSampleChannels },
      };

      const bc = barConfigRef.current;
      barConfigRef.current = {
        ...bc,
        beatsPerMeasure: 0,
        beatTypes: [],
        beatSubdivisions: {},
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
        hasBeenConfigured: true,
      };
      setBeatsPerMeasure(0);
      setBeatTypes([]);
      setBeatSubdivisions({});
      setBarRepeats({});
      setLoopBlocks([]);
      setBarLoopMode("once");
      setNoteSamples({});
      noteSamplesRef.current = {};
      setNoteSampleNames({});
      noteSampleNamesRef.current = {};
      setNoteSampleSources({});
      noteSampleSourcesRef.current = {};
      setNoteSampleChannels({});
      noteSampleChannelsRef.current = {};
      setNoteSampleMetroChannels({});
      noteSampleMetroChannelsRef.current = {};
      engine.setBeatsPerMeasure(0);
      engine.setBeatTypes([]);
      engine.setAllBeatSubdivisions({});
      engine.clearLoopBlocks();
      engine.clearBarRepeats();
    } else {
      barConfigRef.current = {
        ...barConfigRef.current,
        beatsPerMeasure,
        beatTypes: [...beatTypes],
        beatSubdivisions: { ...beatSubdivisions },
        barRepeats: { ...barRepeats },
        loopBlocks: [...loopBlocks],
        noteSamples: { ...noteSamples },
        noteSampleNames: { ...noteSampleNames },
        noteSampleSources: { ...noteSampleSources },
        noteSampleChannels: { ...noteSampleChannels },
        barLoopMode,
        blockPlayMode,
        hasBeenConfigured: true,
      };
      const dc = dialConfigRef.current;
      setBeatsPerMeasure(dc.beatsPerMeasure);
      setBeatTypes([...dc.beatTypes]);
      setBeatSubdivisions({ ...dc.beatSubdivisions });
      setBarRepeats({});
      setLoopBlocks([]);
      setNoteSamples({ ...dc.noteSamples });
      noteSamplesRef.current = { ...dc.noteSamples };
      setNoteSampleNames({ ...dc.noteSampleNames });
      noteSampleNamesRef.current = { ...dc.noteSampleNames };
      setNoteSampleSources({ ...dc.noteSampleSources });
      noteSampleSourcesRef.current = { ...dc.noteSampleSources };
      setNoteSampleChannels({ ...(dc.noteSampleChannels || {}) });
      noteSampleChannelsRef.current = { ...(dc.noteSampleChannels || {}) };
      engine.setBeatsPerMeasure(dc.beatsPerMeasure);
      engine.setBeatTypes([...dc.beatTypes]);
      engine.setAllBeatSubdivisions(dc.beatSubdivisions);
      engine.clearLoopBlocks();
      engine.clearBarRepeats();
    }

    void releaseAllStereoArtifacts();
    engine.flushSchedule();
    setBarMode(toBarMode);
  }, [isPlaying, beatsPerMeasure, beatTypes, beatSubdivisions, barRepeats, loopBlocks, barLoopMode, noteSamples, noteSampleNames, noteSampleSources, noteSampleChannels]);

  const startMetronome = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine || isPlayingRef.current || isPreparingRef.current) return;

    resetPlaybackVisuals();
    clearSamplePlayStates();

    if (barModeRef.current) {
      engine.setBeatTypes([...(barConfigRef.current.beatTypes || [])]);
      engine.setAllBeatSubdivisions(barConfigRef.current.beatSubdivisions || {});
      engine.setAllBarRepeats(barConfigRef.current.barRepeats || {});
      engine.setLoopBlocks(barConfigRef.current.loopBlocks || []);
      engine.setBlockPlayMode(blockPlayModeRef.current);
      const bpmOv: Record<number, number> = {};
      for (const [k, v] of Object.entries(barConfigRef.current.barRepeats || {})) {
        if (v.bpm) bpmOv[Number(k)] = v.bpm;
      }
      engine.setAllBarBpmOverrides(bpmOv);
    } else {
      engine.setBeatTypes([...(dialConfigRef.current.beatTypes || [])]);
      engine.setAllBeatSubdivisions(dialConfigRef.current.beatSubdivisions || {});
    }
    engine.buildScheduleOnly();

    preparingCancelledRef.current = false;
    setIsPreparing(true);

    try {
      if (Platform.OS === "web") {
        const ctx = getWebAudioContext();
        if (ctx && ctx.state === "suspended") {
          ctx.resume().catch(() => {});
        }

        const src = soundSets[soundSetRef.current as keyof typeof soundSets] || soundSets.classic;
        await ensureWebClickBuffers(src as any);
        webClickReadyRef.current = true;

        if (ctx && ctx.state === "suspended") {
          ctx.resume().catch(() => {});
        }

        if (preparingCancelledRef.current) {
          setIsPreparing(false);
          return;
        }
        setIsPreparing(false);

        if (webRenderedLoopRef.current) {
          webRenderedLoopRef.current.stop();
          webRenderedLoopRef.current = null;
        }

        try {
          const scheduleInfo = engine.getScheduleInfo();
          const ticks = scheduleInfo.ticks as TickInfo[];
          const [clickPCMs, layerClickPCMs] = await Promise.all([
            getClickPCMs(soundSetRef.current),
            getLayerClickPCMsForSchedule(ticks),
          ]);
          const pcm = renderMeasure({
            schedule: ticks,
            measureDurationMs: scheduleInfo.durationMs,
            clickPCMs,
            samplePCMs: new Map(),
            clickVolume: Math.max(1.0, volumeRef.current),
            sampleVolume: 0,
            metronomeChannel: barModeRef.current ? barMetronomeChannelRef.current : "both",
            metroChannelsByBeat: barModeRef.current ? noteSampleMetroChannelsRef.current : undefined,
            layerClickPCMs,
          });
          if (volumeRef.current > 1.0) {
            if (pcm instanceof Float32Array) { applySoftClip(pcm); }
            else { applySoftClip(pcm.left); applySoftClip(pcm.right); }
          }
          const loop = playWebRenderedLoop(pcm);
          webRenderedLoopRef.current = loop;
          engine.setPreRenderedAudio(true);
        } catch (renderErr) {
          captureBreadcrumb({ category: "metronome", message: "startMetronome: Web pre-render failed, using per-tick", level: "warning", data: { error: String(renderErr) } });
          engine.setPreRenderedAudio(false);
        }

        setIsPlaying(true);
        engine.start();
        armAudioWatchdogRef.current();
      } else {
        const renderedPlayer = await buildRenderedPlayer();
        if (preparingCancelledRef.current) {
          if (renderedPlayer) { try { renderedPlayer.release(); } catch {} }
          setIsPreparing(false);
          return;
        }
        setIsPreparing(false);

        if (renderedPlayer) {
          stopRenderedAudio();
          renderedPlayerRef.current = renderedPlayer;
          renderedPlayer.volume = 1.0;
          engine.setPreRenderedAudio(true);
        } else {
          engine.setPreRenderedAudio(false);
        }

        setIsPlaying(true);
        engine.start();
        armAudioWatchdogRef.current();

        if (renderedPlayer) {
          safePlay(renderedPlayer, "metronome.start.fallback");
        }
      }
    } catch (e) {
      captureBreadcrumb({ category: "metronome", message: "startMetronome error", level: "error", data: { error: String(e) } });
      setIsPreparing(false);
    }
  }, [buildRenderedPlayer, stopRenderedAudio, getClickPCMs, getLayerClickPCMsForSchedule]);

  const handleEasterEggTrigger = useCallback(async (isHighRange: boolean) => {
    if (barModeRef.current) return;

    const engine = engineRef.current;
    if (!engine) return;

    // 발동 직전 재생 상태 저장 (종료 시 복원용)
    easterEggWasPlayingRef.current = isPlayingRef.current;
    easterEggPrevBpmRef.current = bpmRef.current;
    const randomBpm = isHighRange
      ? Math.floor(Math.random() * (200 - 100 + 1)) + 100
      : Math.floor(Math.random() * (100 - 30 + 1)) + 30;
    easterEggActualBpmRef.current = randomBpm;
    setEasterEggApplyBpm(false);
    const eggBeatTypes = defaultBeatTypes(1);

    // ① 기존 재생/준비 중단 — startMetronome 우회하여 직접 제어
    preparingCancelledRef.current = true;
    if (engine.getIsRunning()) engine.stop();
    stopRenderedAudio();
    setIsPreparing(false);
    isPreparingRef.current = false;
    setIsPlaying(false);
    isPlayingRef.current = false;

    // ② 새 BPM / 박자 설정
    engine.setBpm(randomBpm);
    engine.setBeatsPerMeasure(1);
    engine.setBeatTypes(eggBeatTypes);
    engine.setAllBeatSubdivisions({});
    setBeatsPerMeasure(1);
    setBeatTypes(eggBeatTypes);
    dialConfigRef.current = {
      ...dialConfigRef.current,
      beatTypes: eggBeatTypes,
      beatSubdivisions: {},
    };

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

    if (preparingCancelledRef.current) return;

    // ④ pre-rendered loop 없이 per-tick으로 즉시 시작 (AudioContext 상태에 무관)
    engine.setPreRenderedAudio(false);
    engine.buildScheduleOnly();
    setIsPlaying(true);
    isPlayingRef.current = true;
    engine.start();
    armAudioWatchdogRef.current();
  }, [stopRenderedAudio, resetPlaybackVisuals, clearSamplePlayStates, setEasterEggApplyBpm]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setOnMeasureComplete(() => {
      setMeasureCount(c => c + 1);
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
            const modeLabel = barModeRef.current ? "Bar" : "Dial";
            showPausedNotification(bpmRef.current, modeLabel, languageRef.current);
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
        const modeLabel = barModeRef.current ? "Bar" : "Dial";
        showPausedNotification(bpmRef.current, modeLabel, languageRef.current);
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
      const modeLabel = barModeRef.current ? "Bar" : "Dial";
      showPausedNotification(bpmRef.current, modeLabel, languageRef.current);
    } else {
      engine.requestStopAfterMeasure();
    }
  }, []);

  const updateTimerStopMode = useCallback(
    (mode: "immediate" | "end-of-cycle") => {
      setTimerStopMode(mode);
      persistSettings({ timerStopMode: mode });
    },
    [persistSettings]
  );

  const updateUsername = useCallback(
    (name: string) => {
      setUsername(name);
      persistSettings({ username: name });
    },
    [persistSettings]
  );

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
      } else {
        delete newSubs[String(beatIndex)];
        engineRef.current?.setBeatSubdivision(beatIndex, null);
      }
      setBeatSubdivisions(newSubs);
      if (barModeRef.current) {
        barConfigRef.current.beatSubdivisions = newSubs;
      } else {
        dialConfigRef.current.beatSubdivisions = newSubs;
        persistSettings({ beatSubdivisions: newSubs });
      }
    },
    [beatSubdivisions, persistSettings]
  );

  const handlePatternChange = useCallback(
    (pattern: BeatType[]) => {
      setSubdivisionPattern(pattern);
      if (barModeRef.current && barStartBeatRef.current !== null) {
        const target = barStartBeatRef.current;
        setBeatSubdivisions((prev) => {
          const newSubs = { ...prev, [String(target)]: [...pattern] };
          barConfigRef.current.beatSubdivisions = newSubs;
          return newSubs;
        });
        engineRef.current?.setBeatSubdivision(target, pattern);
      } else {
        persistSettings({ subdivisionPattern: pattern });
      }
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
    dialConfigRef.current.beatSubdivisions = {};
    for (let i = 0; i < beatsPerMeasure; i++) {
      engineRef.current?.setBeatSubdivision(i, null);
    }
    persistSettings({
      subdivisionPattern: ["accent"],
      beatSubdivisions: emptySubs,
    });
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
      setIsDragging(false);
      setDropTargetBeat(null);

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
    [findDropTarget, subdivisionPattern, beatSubdivisions, persistSettings, applyToAllBeats]
  );

  const handleBarRepeatChange = useCallback((beat: number, repeat: BarRepeat | null) => {
    setBarRepeats(prev => {
      const next = { ...prev };
      if (repeat) {
        next[beat] = repeat;
      } else {
        delete next[beat];
      }
      barConfigRef.current.barRepeats = { ...next };
      engineRef.current?.setBarRepeat(beat, repeat);
      engineRef.current?.setBarBpmOverride(beat, repeat?.bpm ?? null);
      return next;
    });
    scheduleReRender();
  }, [scheduleReRender]);

  const handleLoopBlocksChange = useCallback((blocks: LoopBlock[]) => {
    setLoopBlocks(blocks);
    applyLoopBlocksChange(engineRef.current ?? null, barConfigRef.current, scheduleReRender, blocks);
  }, [scheduleReRender]);

  const fullScreenResetFlash = useSharedValue(0);
  const fullScreenResetFlashStyle = useAnimatedStyle(() => ({
    opacity: fullScreenResetFlash.value * 0.5,
  }));

  const handleBarQuickSave = useCallback(async (): Promise<boolean> => {
    try {
      const config = {
        mode: "bar" as const,
        bpm,
        beatsPerMeasure,
        beatTypes: [...beatTypes],
        beatSubdivisions: { ...beatSubdivisions },
        barRepeats: { ...barRepeats },
        loopBlocks: [...loopBlocks],
        barLoopMode: barLoopMode as "loop" | "once",
        blockPlayMode: blockPlayMode as "sequential" | "loop" | "random",
        subdivisionPattern: [...subdivisionPattern],
        barClockMode: barConfigRef.current.barClockMode,
        barTimerDuration: barConfigRef.current.barTimerDuration,
      };
      const now = new Date();
      const label = `Bar ${beatsPerMeasure}/${bpm} ${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
      const entry = createPracticeEntry(label, config, username);
      const existing = await loadPracticeBook();
      await savePracticeBook([entry, ...existing]);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return true;
    } catch (e) {
      captureBreadcrumb({ category: "practice-book", message: "Quick save error", level: "warning", data: { error: String(e) } });
      return false;
    }
  }, [bpm, beatsPerMeasure, beatTypes, beatSubdivisions, barRepeats, loopBlocks, barLoopMode, blockPlayMode, subdivisionPattern, username, t]);

  const handleResetFlash = useCallback(() => {
    fullScreenResetFlash.value = withSequence(
      withTiming(1, { duration: 80 }),
      withTiming(0, { duration: 500, easing: Easing.out(Easing.quad) })
    );
  }, []);

  const handleAddBar = useCallback((draftRepeat?: BarRepeat) => {
    if (beatsPerMeasure >= 16) return;
    const newBeat = beatsPerMeasure;
    const newBeats = beatsPerMeasure + 1;
    const newTypes: BeatType[] = [...beatTypes, "normal"];
    setBeatsPerMeasure(newBeats);
    setBeatTypes(newTypes);
    engineRef.current?.setBeatsPerMeasure(newBeats);
    engineRef.current?.setBeatTypes(newTypes);
    const currentPattern = subdivisionPattern;
    const newSubs = { ...beatSubdivisions };
    if (currentPattern.length > 1 || (currentPattern.length === 1 && currentPattern[0] !== "normal")) {
      newSubs[String(newBeat)] = [...currentPattern];
      engineRef.current?.setBeatSubdivision(newBeat, [...currentPattern]);
    }
    setBeatSubdivisions(newSubs);
    // draftRepeat이 있으면 그 설정을 사용, 없으면 현재 편집 중인 바 레이어 복사
    const newRepeat: BarRepeat = draftRepeat
      ? { ...draftRepeat }
      : (() => {
          const srcLayers = barStartBeat !== null ? (barRepeats[barStartBeat]?.layers ?? []) : [];
          return { type: "count", value: 1, layers: srcLayers.length ? srcLayers.map(l => ({ ...l })) : [] };
        })();
    setBarRepeats(prev => ({ ...prev, [newBeat]: newRepeat }));
    barConfigRef.current.beatsPerMeasure = newBeats;
    barConfigRef.current.beatTypes = newTypes;
    barConfigRef.current.beatSubdivisions = newSubs;
    barConfigRef.current.barRepeats = { ...barConfigRef.current.barRepeats, [newBeat]: newRepeat };
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [beatsPerMeasure, beatTypes, beatSubdivisions, subdivisionPattern, barStartBeat, barRepeats]);

  const handleCopyBar = useCallback((beatIndex: number) => {
    if (isPlaying) return;
    if (beatsPerMeasure >= 16) return;
    const srcType = beatTypes[beatIndex] ?? "strong";
    const srcSub = beatSubdivisions[String(beatIndex)] ?? [];
    const srcRepeat = barRepeats[beatIndex];
    const newBeat = beatsPerMeasure;
    const newTypes = [...beatTypes, srcType];
    const newSubs = { ...beatSubdivisions };
    if (srcSub.length > 0) newSubs[String(newBeat)] = [...srcSub];
    // barRepeats 전체 복사 (반복 유형/BPM/심볼/레이어 포함) — layers 깊은 복사로 공유 참조 방지
    const newRepeats = { ...barRepeats };
    if (srcRepeat) newRepeats[newBeat] = {
      ...srcRepeat,
      layers: srcRepeat.layers ? srcRepeat.layers.map(l => ({ ...l })) : undefined,
    };
    setBeatsPerMeasure(beatsPerMeasure + 1);
    setBeatTypes(newTypes);
    setBeatSubdivisions(newSubs);
    setBarRepeats(newRepeats);
    engineRef.current?.setBeatsPerMeasure(beatsPerMeasure + 1);
    engineRef.current?.setBeatTypes(newTypes);
    engineRef.current?.setAllBeatSubdivisions(newSubs);
    engineRef.current?.setAllBarRepeats(newRepeats);
    barConfigRef.current.beatsPerMeasure = beatsPerMeasure + 1;
    barConfigRef.current.beatTypes = newTypes;
    barConfigRef.current.beatSubdivisions = newSubs;
    barConfigRef.current.barRepeats = newRepeats;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [isPlaying, beatTypes, beatSubdivisions, beatsPerMeasure, barRepeats]);

  const handleInsertBarAfter = useCallback((beatIndex: number) => {
    if (isPlaying) return;
    if (beatsPerMeasure >= 16) return;
    const insertAt = beatIndex + 1;
    const srcType = beatTypes[beatIndex] ?? "normal";
    const srcSub = beatSubdivisions[String(beatIndex)] ?? [];
    const srcRepeat = barRepeats[beatIndex];

    const newTypes = [...beatTypes.slice(0, insertAt), srcType, ...beatTypes.slice(insertAt)];

    const newSubs: Record<string, BeatType[]> = {};
    for (const [k, v] of Object.entries(beatSubdivisions)) {
      const ki = Number(k);
      if (ki < insertAt) newSubs[String(ki)] = v;
      else newSubs[String(ki + 1)] = v;
    }
    if (srcSub.length > 0) newSubs[String(insertAt)] = [...srcSub];

    const newRepeats: Record<number, BarRepeat> = {};
    for (const [k, v] of Object.entries(barRepeats)) {
      const ki = Number(k);
      if (ki < insertAt) newRepeats[ki] = v;
      else newRepeats[ki + 1] = v;
    }
    if (srcRepeat) newRepeats[insertAt] = {
      ...srcRepeat,
      layers: srcRepeat.layers ? srcRepeat.layers.map(l => ({ ...l })) : undefined,
    };

    const shiftUp = (b: number) => b >= insertAt ? b + 1 : b;
    const newBlocks = loopBlocks.map(lb => {
      const newOwnBeatTypes: Record<number, BeatType> = {};
      for (const [k, v] of Object.entries(lb.ownBeatTypes ?? {})) {
        newOwnBeatTypes[shiftUp(Number(k))] = v as BeatType;
      }
      const newOwnSubdivisions: Record<string, BeatType[]> = {};
      for (const [k, v] of Object.entries(lb.ownSubdivisions ?? {})) {
        newOwnSubdivisions[String(shiftUp(Number(k)))] = v as BeatType[];
      }
      return {
        ...lb,
        startBeat: shiftUp(lb.startBeat),
        endBeat: shiftUp(lb.endBeat),
        ownBeatTypes: newOwnBeatTypes,
        ownSubdivisions: newOwnSubdivisions,
      };
    });

    const newBeats = beatsPerMeasure + 1;
    setBeatsPerMeasure(newBeats);
    setBeatTypes(newTypes);
    setBeatSubdivisions(newSubs);
    setBarRepeats(newRepeats);
    setLoopBlocks(newBlocks);
    engineRef.current?.setBeatsPerMeasure(newBeats);
    engineRef.current?.setBeatTypes(newTypes);
    engineRef.current?.setAllBeatSubdivisions(newSubs);
    engineRef.current?.setAllBarRepeats(newRepeats);
    engineRef.current?.setLoopBlocks(newBlocks);
    barConfigRef.current.beatsPerMeasure = newBeats;
    barConfigRef.current.beatTypes = newTypes;
    barConfigRef.current.beatSubdivisions = newSubs;
    barConfigRef.current.barRepeats = newRepeats;
    barConfigRef.current.loopBlocks = newBlocks;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [isPlaying, beatsPerMeasure, beatTypes, beatSubdivisions, barRepeats, loopBlocks]);

  const handleDeleteBar = useCallback((beatIndex: number) => {
    const newBeats = beatsPerMeasure - 1;
    const newTypes = beatTypes.filter((_, i) => i !== beatIndex);
    const newSubs: Record<string, BeatType[]> = {};
    for (const [k, v] of Object.entries(beatSubdivisions)) {
      const ki = Number(k);
      if (ki < beatIndex) newSubs[String(ki)] = v;
      else if (ki > beatIndex) newSubs[String(ki - 1)] = v;
    }
    const newRepeats: Record<number, BarRepeat> = {};
    for (const [k, v] of Object.entries(barRepeats)) {
      const ki = Number(k);
      if (ki < beatIndex) newRepeats[ki] = v;
      else if (ki > beatIndex) newRepeats[ki - 1] = v;
    }
    // loopBlocks 재인덱싱: 삭제된 beat를 포함하는 블록 처리
    const shiftBeat = (b: number) => b < beatIndex ? b : b - 1;
    const newBlocks = loopBlocks
      .map(lb => {
        const newStart = lb.startBeat < beatIndex ? lb.startBeat : lb.startBeat > beatIndex ? lb.startBeat - 1 : lb.endBeat > beatIndex ? lb.startBeat : -1;
        const newEnd = lb.endBeat < beatIndex ? lb.endBeat : lb.endBeat > beatIndex ? lb.endBeat - 1 : lb.startBeat < beatIndex ? lb.endBeat - 1 : -1;
        if (newStart < 0 || newEnd < 0 || newStart > newEnd) return null;
        const newOwnBeatTypes: Record<number, BeatType> = {};
        for (const [k, v] of Object.entries(lb.ownBeatTypes ?? {})) {
          const ki = Number(k);
          if (ki !== beatIndex) newOwnBeatTypes[shiftBeat(ki)] = v;
        }
        const newOwnSubdivisions: Record<string, BeatType[]> = {};
        for (const [k, v] of Object.entries(lb.ownSubdivisions ?? {})) {
          const ki = Number(k);
          if (ki !== beatIndex) newOwnSubdivisions[String(shiftBeat(ki))] = v;
        }
        return { ...lb, startBeat: newStart, endBeat: newEnd, ownBeatTypes: newOwnBeatTypes, ownSubdivisions: newOwnSubdivisions };
      })
      .filter((b): b is NonNullable<typeof b> => b !== null);
    setBeatsPerMeasure(newBeats);
    setBeatTypes(newTypes);
    setBeatSubdivisions(newSubs);
    setBarRepeats(newRepeats);
    setLoopBlocks(newBlocks);
    engineRef.current?.setBeatsPerMeasure(newBeats);
    engineRef.current?.setBeatTypes(newTypes);
    engineRef.current?.setAllBeatSubdivisions(newSubs);
    engineRef.current?.setAllBarRepeats(newRepeats);
    engineRef.current?.setLoopBlocks(newBlocks);
    if (barStartBeat !== null) {
      if (barStartBeat === beatIndex) setBarStartBeat(null);
      else if (barStartBeat > beatIndex) setBarStartBeat(barStartBeat - 1);
    }
    barConfigRef.current.beatsPerMeasure = newBeats;
    barConfigRef.current.beatTypes = newTypes;
    barConfigRef.current.beatSubdivisions = newSubs;
    barConfigRef.current.barRepeats = newRepeats;
    barConfigRef.current.loopBlocks = newBlocks;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [beatsPerMeasure, beatTypes, beatSubdivisions, barRepeats, barStartBeat, loopBlocks]);

  const handleReorderBar = useCallback((fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;

    const reindex = (b: number): number => {
      if (b === fromIndex) return toIndex;
      if (fromIndex < toIndex && b > fromIndex && b <= toIndex) return b - 1;
      if (fromIndex > toIndex && b >= toIndex && b < fromIndex) return b + 1;
      return b;
    };

    const newTypes = [...beatTypes];
    const [moved] = newTypes.splice(fromIndex, 1);
    newTypes.splice(toIndex, 0, moved);

    const newSubs: Record<string, BeatType[]> = {};
    for (const [k, v] of Object.entries(beatSubdivisions)) {
      newSubs[String(reindex(Number(k)))] = v;
    }

    const newRepeats: Record<number, BarRepeat> = {};
    for (const [k, v] of Object.entries(barRepeats)) {
      newRepeats[reindex(Number(k))] = v as BarRepeat;
    }

    const newBlocks = loopBlocks.map(lb => {
      const newStart = reindex(lb.startBeat);
      const newEnd = reindex(lb.endBeat);
      const newOwnBeatTypes: Record<number, BeatType> = {};
      for (const [k, v] of Object.entries(lb.ownBeatTypes ?? {})) {
        newOwnBeatTypes[reindex(Number(k))] = v as BeatType;
      }
      const newOwnSubdivisions: Record<string, BeatType[]> = {};
      for (const [k, v] of Object.entries(lb.ownSubdivisions ?? {})) {
        newOwnSubdivisions[String(reindex(Number(k)))] = v as BeatType[];
      }
      return {
        ...lb,
        startBeat: Math.min(newStart, newEnd),
        endBeat: Math.max(newStart, newEnd),
        ownBeatTypes: newOwnBeatTypes,
        ownSubdivisions: newOwnSubdivisions,
      };
    });

    setBeatTypes(newTypes);
    setBeatSubdivisions(newSubs);
    setBarRepeats(newRepeats);
    setLoopBlocks(newBlocks);
    engineRef.current?.setBeatTypes(newTypes);
    engineRef.current?.setAllBeatSubdivisions(newSubs);
    engineRef.current?.setAllBarRepeats(newRepeats);
    engineRef.current?.setLoopBlocks(newBlocks);

    if (barStartBeat !== null) setBarStartBeat(reindex(barStartBeat));

    barConfigRef.current.beatTypes = newTypes;
    barConfigRef.current.beatSubdivisions = newSubs;
    barConfigRef.current.barRepeats = newRepeats;
    barConfigRef.current.loopBlocks = newBlocks;
  }, [beatTypes, beatSubdivisions, barRepeats, loopBlocks, barStartBeat]);

  const handleBarReset = useCallback(() => {
    const engine = engineRef.current;
    const beats = barConfigRef.current.beatsPerMeasure || 4;
    const newTypes = defaultBeatTypes(beats);
    setBeatTypes(newTypes);
    setBeatSubdivisions({});
    setBarRepeats({});
    setLoopBlocks([]);
    setBarStartBeat(null);
    setBarLoopMode("once");
    setNoteSamples({});
    noteSamplesRef.current = {};
    setNoteSampleNames({});
    noteSampleNamesRef.current = {};
    setNoteSampleSources({});
    noteSampleSourcesRef.current = {};
    setNoteSampleChannels({});
    noteSampleChannelsRef.current = {};
    for (const [k, st] of Object.entries(samplePlayStateRef.current)) {
      if (st.endTimer) clearTimeout(st.endTimer);
    }
    samplePlayStateRef.current = {};
    for (const player of Object.values(noteSampleSoundsRef.current)) {
      try { player.pause(); } catch {}
      try { player.release(); } catch {}
    }
    noteSampleSoundsRef.current = {};
    void releaseAllStereoArtifacts();
    saveNoteSamples({});
    saveNoteSampleNames({});
    saveNoteSampleSources({});
    saveNoteSampleChannels({});
    barConfigRef.current = {
      beatsPerMeasure: beats,
      beatTypes: [...newTypes],
      beatSubdivisions: {},
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
      hasBeenConfigured: true,
    };
    if (engine) {
      engine.setBeatTypes([...newTypes]);
      engine.setAllBeatSubdivisions({});
      engine.setAllBarRepeats({});
      engine.clearLoopBlocks();
      engine.setAllBarBpmOverrides({});
    }
  }, []);

  const applyEntryToEngine = useCallback((entry: PracticeEntry) => {
    const engine = engineRef.current;
    if (!engine) return;

    const { barRepeats: mgRepeats1, loopBlocks: mgBlocks1 } = migrateLayerBlocks((entry.loopBlocks || []) as LoopBlock[], { ...entry.barRepeats });
    setBpm(entry.bpm);
    setBeatsPerMeasure(entry.beatsPerMeasure);
    setBeatTypes([...entry.beatTypes]);
    setBeatSubdivisions({ ...entry.beatSubdivisions });
    setBarRepeats(mgRepeats1);
    setLoopBlocks([...mgBlocks1]);
    setBarLoopMode(entry.barLoopMode || "once");
    setBlockPlayMode(entry.blockPlayMode || "loop");
    if (entry.subdivisionPattern) setSubdivisionPattern([...entry.subdivisionPattern]);

    const entrySamples = entry.noteSamples || {};
    const entryNames = entry.noteSampleNames || {};
    const entrySources = entry.noteSampleSources || {};
    const entryChannels = entry.noteSampleChannels || {};
    setNoteSamples({ ...entrySamples });
    noteSamplesRef.current = { ...entrySamples };
    setNoteSampleNames({ ...entryNames });
    noteSampleNamesRef.current = { ...entryNames };
    setNoteSampleSources({ ...entrySources });
    noteSampleSourcesRef.current = { ...entrySources };
    setNoteSampleChannels({ ...entryChannels });
    noteSampleChannelsRef.current = { ...entryChannels };

    if (Object.keys(entrySamples).length > 0) {
      preloadNoteSampleSounds(entrySamples);
    }

    applyEntryToEngineCore(engine, entry, beatDenominatorRef.current);

    barConfigRef.current = entryToBarConfig(entry);

    if (!barMode) {
      dialConfigRef.current = {
        beatsPerMeasure,
        beatTypes: [...beatTypes],
        beatSubdivisions: { ...beatSubdivisions },
        noteSamples: { ...noteSamples },
        noteSampleNames: { ...noteSampleNames },
        noteSampleSources: { ...noteSampleSources },
        noteSampleChannels: { ...noteSampleChannels },
      };
      setBarMode(true);
    }
  }, [barMode, beatsPerMeasure, beatTypes, beatSubdivisions, noteSamples, noteSampleNames, noteSampleSources, noteSampleChannels, preloadNoteSampleSounds]);

  const handleLinkedEntryChange = useCallback(async (
    entryId: string | undefined,
    scoreDefaults: { bpm: number; beatsPerMeasure: number },
  ) => {
    const version = ++linkedEntryVersionRef.current;
    if (!entryId) {
      // 연결 없는 마디: 악보 기본 설정 복원
      const engine = engineRef.current;
      if (engine) {
        const clampedBpm = Math.max(20, Math.min(300, scoreDefaults.bpm));
        setBpm(clampedBpm);
        engine.setBpm(clampedBpm);
        setBeatsPerMeasure(scoreDefaults.beatsPerMeasure);
        engine.setBeatsPerMeasure(scoreDefaults.beatsPerMeasure);
      }
      return;
    }
    // 캐시된 연습장 우선 사용; 미스 시 로드 후 캐시 갱신
    let book = scorePracticeBookRef.current;
    if (book.length === 0) {
      book = await loadPracticeBook();
      scorePracticeBookRef.current = book;
    }
    if (version !== linkedEntryVersionRef.current) return; // stale
    const entry = book.find((e) => e.id === entryId);
    if (entry) {
      applyEntryToEngine(entry);
    }
  }, [applyEntryToEngine]);

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
    engine.requestStopAfterMeasure();
    showPlayingNotification(entry.bpm, "Note", languageRef.current);
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
      showPausedNotification(bpmRef.current, "Note", languageRef.current);
    }
  }, [noteStartPlayingEntry, createShuffledIndices]);

  useEffect(() => { noteAdvanceQueueRef.current = noteAdvanceQueue; }, [noteAdvanceQueue]);

  const handleEnterNoteMode = useCallback(async () => {
    const engine = engineRef.current;
    if (engine && isPlaying) {
      engine.stop();
      stopRenderedAudio();
      clearSamplePlayStates();
      setIsPreparing(false);
      setIsPlaying(false);
      resetPlaybackVisuals();
    }
    const book = await loadPracticeBook();
    const barItems = book.filter(e => (e.mode || "bar") === "bar");
    setNoteBarEntries(barItems);
    setNoteMode(true);
    noteModeRef.current = true;
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
    resetPlaybackVisuals();
    setNoteMode(false);
    noteModeRef.current = false;
    setNoteIsPlaying(false);
    noteIsPlayingRef.current = false;
    setNoteCurrentIndex(-1);
    setNoteQueue([]);
    noteQueueRef.current = [];
    setNoteBarEntries([]);
  }, [isPlaying]);

  const currentMode: ModeSlot = showMenu
    ? "menu"
    : stageModeActive
    ? "stage"
    : noteMode
    ? "note"
    : showPracticeBook
    ? "practice"
    : barMode
    ? "bar"
    : scoreMode !== null
    ? "score"
    : "beat";

  const switchToMode = useCallback(async (mode: ModeSlot, direction: "left" | "right" = "right") => {
    const state: ModeSwitchState = {
      currentMode, noteMode, barMode, scoreMode,
      stageModeActive, showMenu, showPracticeBook, activeModal,
    };
    // 콘텐츠가 바뀔 때 슬라이드+페이드 적용
    // 메뉴 진입·이탈 → 위에서 아래로 슬라이드 (Y축)
    // 그 외 모드 전환  → 다이얼 방향에 따라 좌우 슬라이드 (X축)
    if (mode !== currentMode) {
      const isMenuTransition = mode === "menu" || currentMode === "menu";
      if (isMenuTransition) {
        modeSlideX.value       = 0;
        modeSlideY.value       = -windowHeight * 0.25;
        modeSlideOpacity.value = 0;
      } else {
        modeSlideX.value       = direction === "right" ? windowWidth * 0.25 : -windowWidth * 0.25;
        modeSlideY.value       = 0;
        modeSlideOpacity.value = 0;
      }
    }
    const cb: ModeSwitchCallbacks = {
      handleExitNoteMode,
      handleBarModeChange,
      setScoreMode: (m) => setScoreMode(m as "list" | "editor" | null),
      exitStageMode,
      setActiveModal: (m) => setActiveModal(m as ActiveModal),
      handleEnterNoteMode,
      enterStageMode: () => { void enterStageMode(); },
      openExclusive: (m) => openExclusive(m as ActiveModal),
    };
    await applySwitchToMode(mode, state, cb);
    // Load practice entries after entering stage mode (side-effect kept in hook)
    if (mode === "stage") {
      loadPracticeBook().then((entries) => {
        setStagePracticeEntries(entries);
      }).catch(() => {});
    }
  }, [currentMode, noteMode, barMode, scoreMode, stageModeActive, showMenu, showPracticeBook, handleExitNoteMode, handleBarModeChange, handleEnterNoteMode, enterStageMode, exitStageMode, activeModal, openExclusive]);

  // ── 상단 중앙 레이블 탭 → 다음 모드 순환 ──
  const MODE_CYCLE: ModeSlot[] = ["beat", "bar", "score", "note", "practice", "stage"];
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
      modeSlideX.value       = withTiming(0, { duration: 270, easing: Easing.out(Easing.cubic) });
      modeSlideY.value       = withTiming(0, { duration: 270, easing: Easing.out(Easing.cubic) });
      modeSlideOpacity.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMode]);

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
      showPausedNotification(bpmRef.current, "Note", languageRef.current);
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
        noteQueueEntries: q.map(e => ({
          id: e.id,
          label: e.label,
          createdAt: e.createdAt,
          bpm: e.bpm,
          beatsPerMeasure: e.beatsPerMeasure,
          beatTypes: [...e.beatTypes],
          beatSubdivisions: { ...e.beatSubdivisions },
          barRepeats: { ...e.barRepeats },
          barLoopMode: e.barLoopMode,
          subdivisionPattern: e.subdivisionPattern || ["accent"],
          mode: e.mode || "bar",
          noteSamples: e.noteSamples,
          noteSampleNames: e.noteSampleNames,
          noteSampleSources: e.noteSampleSources,
          noteSampleChannels: e.noteSampleChannels,
          loopBlocks: (e as any).loopBlocks,
          blockPlayMode: (e as any).blockPlayMode,
          imageUri: e.imageUri,
        })),
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
    dialConfig: dialConfigRef.current,
    barClockMode: barConfigRef.current.barClockMode,
    barTimerDuration: barConfigRef.current.barTimerDuration,
  }), [barMode, bpm, beatsPerMeasure, beatTypes, beatSubdivisions, barRepeats, loopBlocks, barLoopMode, blockPlayMode, subdivisionPattern, noteSamples, noteSampleNames, noteSampleSources, noteSampleChannels]);

  const handleLoadPracticeEntry = useCallback((entry: PracticeEntry) => {
    const engine = engineRef.current;
    if (!engine) return;

    if (isPlaying) {
      engine.stop();
      stopRenderedAudio();
      clearSamplePlayStates();
      setIsPreparing(false);
      setIsPlaying(false);
      resetPlaybackVisuals();
    }

    const entryMode = entry.mode || "bar";
    const isBeatEntry = entryMode === "beat";
    const isNoteEntry = entryMode === "note";

    if (isNoteEntry) {
      if (!noteMode) {
        setNoteMode(true);
        noteModeRef.current = true;
      }
      const queueEntries = entry.noteQueueEntries || [];
      setNoteQueue(queueEntries);
      noteQueueRef.current = queueEntries;
      setNotePlayMode(entry.notePlayMode || "once");
      notePlayModeRef.current = entry.notePlayMode || "once";
      setNoteCurrentIndex(-1);
      setNoteIsPlaying(false);
      noteIsPlayingRef.current = false;
      (async () => {
        const book = await loadPracticeBook();
        setNoteBarEntries(book.filter(e => (e.mode || "bar") === "bar"));
      })();
      return;
    }

    if (noteMode) {
      handleExitNoteMode();
    }

    if (isBeatEntry) {
      if (barMode) {
        barConfigRef.current = {
          ...barConfigRef.current,
          beatsPerMeasure,
          beatTypes: [...beatTypes],
          beatSubdivisions: { ...beatSubdivisions },
          barRepeats: { ...barRepeats },
          loopBlocks: [...loopBlocks],
          noteSamples: { ...noteSamples },
          noteSampleNames: { ...noteSampleNames },
          noteSampleSources: { ...noteSampleSources },
          hasBeenConfigured: true,
        };
        setBarMode(false);
      }

      const entrySamples = entry.noteSamples || {};
      const entryNames = entry.noteSampleNames || {};
      const entrySources = entry.noteSampleSources || {};

      dialConfigRef.current = {
        ...dialConfigRef.current,
        beatsPerMeasure: entry.beatsPerMeasure,
        beatTypes: [...entry.beatTypes],
        beatSubdivisions: { ...entry.beatSubdivisions },
        noteSamples: { ...entrySamples },
        noteSampleNames: { ...entryNames },
        noteSampleSources: { ...entrySources },
      };

      setBpm(entry.bpm);
      setBeatsPerMeasure(entry.beatsPerMeasure);
      setBeatTypes([...entry.beatTypes]);
      setBeatSubdivisions({ ...entry.beatSubdivisions });
      if (entry.subdivisionPattern) setSubdivisionPattern([...entry.subdivisionPattern]);
      setNoteSamples({ ...entrySamples });
      noteSamplesRef.current = { ...entrySamples };
      setNoteSampleNames({ ...entryNames });
      noteSampleNamesRef.current = { ...entryNames };
      setNoteSampleSources({ ...entrySources });
      noteSampleSourcesRef.current = { ...entrySources };
      setNoteSampleChannels({ ...(entry.noteSampleChannels || {}) });
      noteSampleChannelsRef.current = { ...(entry.noteSampleChannels || {}) };
      saveNoteSamples(entrySamples);
      saveNoteSampleNames(entryNames);
      saveNoteSampleSources(entrySources);
      saveNoteSampleChannels(entry.noteSampleChannels || {});
      if (Object.keys(entrySamples).length > 0) {
        preloadNoteSampleSounds(entrySamples);
      }

      engine.setBpm(entry.bpm * (4 / beatDenominatorRef.current));
      engine.setBeatsPerMeasure(entry.beatsPerMeasure);
      engine.setBeatTypes([...entry.beatTypes]);
      engine.setAllBeatSubdivisions(entry.beatSubdivisions);
    } else {
      if (!barMode) {
        dialConfigRef.current = {
          ...dialConfigRef.current,
          beatsPerMeasure,
          beatTypes: [...beatTypes],
          beatSubdivisions: { ...beatSubdivisions },
          noteSamples: { ...noteSamples },
          noteSampleNames: { ...noteSampleNames },
          noteSampleSources: { ...noteSampleSources },
        };
        setBarMode(true);
      }

      const barSamples = entry.noteSamples || {};
      const barNames = entry.noteSampleNames || {};
      const barSources = entry.noteSampleSources || {};
      const barChannels = entry.noteSampleChannels || {};

      const { barRepeats: mgRepeats3, loopBlocks: mgBlocks3 } = migrateLayerBlocks((entry.loopBlocks || []) as LoopBlock[], { ...entry.barRepeats });
      setBpm(entry.bpm);
      setBeatsPerMeasure(entry.beatsPerMeasure);
      setBeatTypes([...entry.beatTypes]);
      setBeatSubdivisions({ ...entry.beatSubdivisions });
      setBarRepeats(mgRepeats3);
      setLoopBlocks([...mgBlocks3]);
      setBarLoopMode(entry.barLoopMode);
      setBlockPlayMode(entry.blockPlayMode || "loop");
      setSubdivisionPattern([...entry.subdivisionPattern]);
      setNoteSamples({ ...barSamples });
      noteSamplesRef.current = { ...barSamples };
      setNoteSampleNames({ ...barNames });
      noteSampleNamesRef.current = { ...barNames };
      setNoteSampleSources({ ...barSources });
      noteSampleSourcesRef.current = { ...barSources };
      setNoteSampleChannels({ ...barChannels });
      noteSampleChannelsRef.current = { ...barChannels };
      saveNoteSamples(barSamples);
      saveNoteSampleNames(barNames);
      saveNoteSampleSources(barSources);
      saveNoteSampleChannels(barChannels);
      if (Object.keys(barSamples).length > 0) {
        preloadNoteSampleSounds(barSamples);
      }

      engine.setBpm(entry.bpm * (4 / beatDenominatorRef.current));
      engine.setBeatsPerMeasure(entry.beatsPerMeasure);
      engine.setBeatTypes([...entry.beatTypes]);
      engine.setAllBeatSubdivisions(entry.beatSubdivisions);
      engine.setLoopBlocks(mgBlocks3);
      engine.setBlockPlayMode(entry.blockPlayMode || "loop");
      engine.setAllBarRepeats(mgRepeats3 || {});
      const bpmOverridesEntry: Record<number, number> = {};
      for (const [k, v] of Object.entries(mgRepeats3 || {})) {
        if ((v as any).bpm) bpmOverridesEntry[Number(k)] = (v as any).bpm;
      }
      engine.setAllBarBpmOverrides(bpmOverridesEntry);
      barConfigRef.current = {
        ...barConfigRef.current,
        beatsPerMeasure: entry.beatsPerMeasure,
        beatTypes: [...entry.beatTypes],
        beatSubdivisions: { ...entry.beatSubdivisions },
        barRepeats: { ...mgRepeats3 },
        loopBlocks: [...mgBlocks3],
        barClockMode: entry.barClockMode || "stopwatch",
        barTimerDuration: entry.barTimerDuration ?? 180,
        noteSamples: { ...barSamples },
        noteSampleNames: { ...barNames },
        noteSampleSources: { ...barSources },
        hasBeenConfigured: true,
      };
    }

    loadedPracticeNoteRef.current = { id: entry.id, label: entry.label };
  }, [isPlaying, barMode, beatsPerMeasure, beatTypes, beatSubdivisions, barRepeats, loopBlocks, noteSamples, noteSampleNames, noteSampleSources, preloadNoteSampleSounds]);

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
    handleNoteTogglePlayRef,
    clickPCMCacheRef,
    // Core playback state
    bpm,
    beatsPerMeasure,
    beatDenominator,
    beatTypes,
    subdivisionPattern,
    beatSubdivisions,
    isPlaying,
    isPreparing,
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
    handleTimerExpired,
    // Beat subdivision drag
    beatSubdivisionCounts,
    beatDirection,
    setBeatDirection,
    isDragging,
    dragPos,
    dropTargetBeat,
    handlePatternChange,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
    showSubdivisionLongPressHint,
    setShowSubdivisionLongPressHint,
    // Modal state
    activeModal,
    setActiveModal,
    openExclusive,
    showSettings,
    showMenu,
    showSignalGen,
    showTuningGuide,
    showPracticeBook,
    showWorkUp,
    showOnboarding,
    showMoreMenu,
    showDrumKit,
    showScheduledStart,
    showFadeOut,
    showBpmDetect,
    showStemSep,
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
    handleBarModeChange,
    barLoopMode,
    setBarLoopMode,
    blockPlayMode,
    setBlockPlayMode,
    barRepeats,
    loopBlocks,
    barStartBeat,
    setBarStartBeat,
    handleBarRepeatChange,
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
    enterStageMode,
    exitStageMode,
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
    scheduleReRender,
    stopRenderedAudio,
    clearSamplePlayStates,
    resetPlaybackVisuals,
    notifyVoicePlayState,
    persistSettings,
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
  };
}
