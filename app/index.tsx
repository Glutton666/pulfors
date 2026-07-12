import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  Platform,
  Pressable,
  Alert,
  useWindowDimensions,
  BackHandler,
  AppState,
} from "react-native";
import { AnimatedModal } from "@/components/AnimatedModal";
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
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";
import { Radius, Spacing, FontSize } from "@/constants/tokens";
import type { ThemeColor } from "@/constants/colors";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { getTempoLabel as getTempoLabelI18n } from "@/lib/i18n";
import { useScale } from "@/lib/scale";
import type { ScaleValues } from "@/lib/scale";
import {
  MetronomeEngine,
  soundSets,
} from "@/lib/metronome-engine";
import type { BeatType, ProgressInfo } from "@/lib/metronome-engine";
import { loadSettings, saveSettings, loadCustomSoundSets, saveCustomSoundSets, loadPracticeBook, savePracticeBook, createPracticeEntry, type ControlPadMapping, type MetronomeSettings } from "@/lib/storage";
import type { FlashMode, HapticMode, SoundSet, BuiltinSoundSet, CustomSoundSetConfig, CustomSoundSample } from "@/lib/storage";
import { BeatIndicator } from "@/components/BeatIndicator";
import type { BarRepeat, LoopBlock } from "@/components/BeatIndicator";
import { BpmSlider } from "@/components/BpmSlider";
import { EasterEggQuiz } from "@/components/EasterEggQuiz";
import { SubdivisionBar, DragGhost } from "@/components/SubdivisionBar";
import { StopwatchTimer, type StopwatchTimerHandle } from "@/components/StopwatchTimer";
import { SettingsModal } from "@/components/SettingsModal";
import { SignalGeneratorModal, TuningGuideModal } from "@/components/SignalGeneratorModal";
import { PracticeBookModal } from "@/components/PracticeBookModal";
import { WorkUpOverviewModal } from "@/components/WorkUpOverviewModal";
import PracticeStatsGraph from "@/components/PracticeStatsGraph";
import { useDeepLink } from "@/contexts/DeepLinkContext";
import { make_styles } from "./index.styles";
import { defaultBeatTypes, isCompoundMeterBeatCount, isSafeNoteSampleUri, createInitialDialConfig, createInitialBarConfig, createShuffledIndices as createShuffledIndicesPure, applyQueueInsert, beatSubdivisionCounts as beatSubdivisionCountsPure, selectCurrentBarConfig, computeLandscapeStats, entryToBarConfig, applyEntryToEngine as applyEntryToEngineCore, migrateLayerBlocks, applyLoopBlocksChange } from "./index.helpers";
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
import { useControlPadMapping } from "@/hooks/useControlPadMapping";
import { useQuickAddList } from "@/hooks/useQuickAddList";
import { useStageMode } from "@/hooks/useStageMode";
import { StageModeOverlay } from "@/components/StageModeOverlay";
import { createDebouncedPersister, type DebouncedPersister } from "@/lib/persist";
import { createRafBatcher } from "@/lib/raf-batcher";
import { OnboardingModal } from "@/components/OnboardingModal";
import { MoreMenuModal } from "@/components/MoreMenuModal";
import { ScoreListScreen } from "@/components/ScoreListScreen";
import { ScoreEditorScreen } from "@/components/ScoreEditorScreen";
import type { ScoreDocument } from "@/lib/score-types";
import { BpmDetectModal } from "@/components/BpmDetectModal";
import { StemSeparationModal } from "@/components/StemSeparationModal";
import { DrumKitModal } from "@/components/DrumKitModal";
import { ScheduledStartModal } from "@/components/ScheduledStartModal";
import { FadeOutModal } from "@/components/FadeOutModal";
import type { FadeOutSettings } from "@/lib/storage";
import type { OnboardingResult } from "@/components/OnboardingModal";
import { GoalCompletePopup } from "@/components/GoalCompletePopup";
import type { PracticeEntry } from "@/lib/storage";
import { loadLoggingEnabled, saveLoggingEnabled, addActivityLog, loadActivityLogs, loadGoals, saveGoals } from "@/lib/activity-log";
import { loadNoteSamples, saveNoteSamples, setNoteSample, removeNoteSample, hasNoteSample, loadNoteSampleNames, saveNoteSampleNames, setNoteSampleName, removeNoteSampleName, loadNoteSampleSources, saveNoteSampleSources, setNoteSampleSource, removeNoteSampleSource, loadNoteSampleChannels, saveNoteSampleChannels, setNoteSampleChannel, removeNoteSampleChannel, loadNoteSampleMetroChannels, saveNoteSampleMetroChannels, setNoteSampleMetroChannel, removeNoteSampleMetroChannel } from "@/lib/note-samples";
import type { NoteSampleMap, NoteSampleNameMap, NoteSampleSourceMap, NoteSampleChannelMap, NoteSampleMetroChannelMap, SampleSource } from "@/lib/note-samples";
import type { SampleChannel, MetroChannel } from "@/lib/stereo-channel";
import { NoteRecorderModal } from "@/components/NoteRecorderModal";
import { NoteModeView } from "@/components/NoteModeView";
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
import { KeyboardShortcutsModal } from "@/components/KeyboardShortcutsModal";
import { NativeKeyboardHintOverlay } from "@/components/NativeKeyboardHintOverlay";


export default function MetronomeScreen() {
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
  const baseBpmRef = useRef(120); // /4 기준 BPM (분모 순환과 무관하게 유지)
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
  const [beatsPerMeasure, setBeatsPerMeasure] = useState(4);
  const [beatTypes, setBeatTypes] = useState<BeatType[]>(defaultBeatTypes(4));
  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingRef = useRef(false);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  // State for DrumKit → StemSep handoff (passes selected pad URI directly)
  const [stemSepInitUri, setStemSepInitUri] = useState<string | undefined>();
  const [stemSepInitName, setStemSepInitName] = useState<string | undefined>();
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
  const [landscapeImageUri, setLandscapeImageUri] = useState<string | null>(null);
  const [landscapeImageModalVisible, setLandscapeImageModalVisible] = useState(false);
  const [showLandscapeImage, setShowLandscapeImage] = useState(true);
  const [landscapeContentType, setLandscapeContentType] = useState<"photo" | "stats">("photo");
  const [landscapeStatsLogs, setLandscapeStatsLogs] = useState<ActivityLog[]>([]);

  const [barMode, setBarMode] = useState(false);
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
  const { controlPadMapping, handleControlPadMappingChange } = useControlPadMapping();
  const noteAdvanceQueueRef = useRef<() => void>(() => {});
  const quickAddNoteRef = useRef<(entry: PracticeEntry) => void>(() => {});

  const { quickAddList, quickAddListRef, handleQuickAddListChange } = useQuickAddList();
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
  const noteSampleSoundsRef = useRef<Record<string, ExpoAudioPlayer>>({});
  const samplePlayStateRef = useRef<Record<string, { playing: boolean; endTimer: ReturnType<typeof setTimeout> | null }>>({});
  const [recorderTarget, setRecorderTarget] = useState<{ beat: number; sub: number } | null>(null);

  const renderedPlayerRef = useRef<ExpoAudioPlayer | null>(null);
  const pendingRenderedPlayerRef = useRef<ExpoAudioPlayer | null>(null);
  const clickPCMCacheRef = useRef<Record<string, ClickPCMs>>({});
  const samplePCMCacheRef = useRef<Map<string, SamplePCMEntry>>(new Map());
  const renderedUrlRef = useRef<string | null>(null);
  const webRenderedLoopRef = useRef<{ stop: () => void } | null>(null);
  const webClickReadyRef = useRef(false);
  // 재생 복구 watchdog용 — 오디오 콜백이 실제로 발화할 때마다 갱신
  const lastAudioFireRef = useRef(0);
  const audioWatchdogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioRetryCountRef = useRef(0);
  const armAudioWatchdogRef = useRef<() => void>(() => {});
  const clearAudioWatchdogRef = useRef<() => void>(() => {});

  const { engineRef } = useMetronomeEngine();
  const tapTimesRef = useRef<number[]>([]);
  const dialRef = useRef<View>(null);
  const dialCenterRef = useRef({ x: 0, y: 0 });

  const audioPlayersHook = useAudioPlayers(soundSet);
  const { allPlayers, allPlayersRef, soundSetRef, highToggle, lowToggle, strongToggle } = audioPlayersHook;

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

  // ── 웹 클릭 버퍼 사전 로드 ──────────────────────────────────────────────────
  // 마운트 직후 + soundSet 변경 시 버퍼를 미리 디코딩해두면
  // 사용자가 재생을 누를 때 webClickReadyRef = true 상태가 돼
  // 엔진 시작 즉시 per-tick 오디오가 발화된다.
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const src = soundSets[soundSet as keyof typeof soundSets] || soundSets.classic;
    ensureWebClickBuffers(src as any)
      .then((ok) => { if (ok) webClickReadyRef.current = true; })
      .catch(() => {});
  }, [soundSet]);

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

  const flashStyle = useAnimatedStyle(() => ({
    opacity: flashOpacity.value,
  }));
  const halfTimeFlashStyle = useAnimatedStyle(() => ({
    opacity: halfTimeFlash.value,
  }));

  useEffect(() => {
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

    const preloadSounds = async (samples: NoteSampleMap) => {
      for (const s of Object.values(noteSampleSoundsRef.current)) {
        try { s.release(); } catch {}
      }
      noteSampleSoundsRef.current = {};

      for (const [key, uri] of Object.entries(samples)) {
        if (!isSafeNoteSampleUri(uri)) {
          captureBreadcrumb({ category: "sample.preload", message: "Unsafe URI blocked on startup", level: "warning", data: { key, uriPrefix: uri.slice(0, 80) } });
          continue;
        }
        try {
          const channel = noteSampleChannelsRef.current[key] ?? "both";
          const result = await syncStereoArtifact(key, uri, channel);
          const isFileUri = result.uri.startsWith("file://");
          const player = createAudioPlayer(result.uri, { downloadFirst: isFileUri });
          player.volume = Math.max(0, Math.min(1, sampleVolumeRef.current));
          noteSampleSoundsRef.current[key] = player;
        } catch (e) {
          captureBreadcrumb({ category: "sample.preload", message: "Failed to preload", level: "warning", data: { key, error: String(e) } });
        }
      }
    };

    loadSettings().then((settings) => {
      setBpm(settings.bpm);
      const loadedDenom = settings.beatDenominator ?? 4;
      baseBpmRef.current = Math.round(settings.bpm * (loadedDenom / 4));
      setBeatsPerMeasure(settings.beatsPerMeasure);
      if (settings.beatDenominator) {
        setBeatDenominator(settings.beatDenominator);
      }
      engine.setBpm(settings.bpm);
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
        await preloadSounds(samples);
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

  const preloadNoteSampleSounds = useCallback(async (samples: NoteSampleMap, keepExisting?: boolean) => {
    const existing = noteSampleSoundsRef.current;
    const newPlayers: Record<string, ExpoAudioPlayer> = {};
    const keysToKeep = new Set<string>();

    for (const [key, uri] of Object.entries(samples)) {
      if (!isSafeNoteSampleUri(uri)) {
        captureBreadcrumb({ category: "sample.preload", message: "Unsafe URI blocked", level: "warning", data: { key, uriPrefix: uri.slice(0, 80) } });
        continue;
      }
      const channel = noteSampleChannelsRef.current[key] ?? "both";
      let result;
      try {
        result = await syncStereoArtifact(key, uri, channel);
      } catch (e) {
        captureBreadcrumb({ category: "sample.preload", message: "syncStereoArtifact failed", level: "warning", data: { key, error: String(e) } });
        continue;
      }
      if (keepExisting && existing[key] && !result.changed) {
        newPlayers[key] = existing[key];
        keysToKeep.add(key);
      } else {
        try {
          const isFileUri = result.uri.startsWith("file://");
          const player = createAudioPlayer(result.uri, { downloadFirst: isFileUri });
          player.volume = Math.max(0, Math.min(1, sampleVolumeRef.current));
          newPlayers[key] = player;
        } catch (e) {
          captureBreadcrumb({ category: "sample.preload", message: "Failed", level: "warning", data: { key, error: String(e) } });
        }
      }
    }

    for (const [key, s] of Object.entries(existing)) {
      if (!keysToKeep.has(key)) {
        try { s.release(); } catch {}
        if (!samples[key]) {
          await releaseStereoArtifact(key);
        }
      }
    }
    noteSampleSoundsRef.current = newPlayers;
  }, []);

  const clearSamplePlayStates = useCallback(() => {
    for (const [key, state] of Object.entries(samplePlayStateRef.current)) {
      if (state.endTimer) clearTimeout(state.endTimer);
    }
    samplePlayStateRef.current = {};
    for (const [key, player] of Object.entries(noteSampleSoundsRef.current)) {
      try { player.pause(); } catch {}
      const uri = noteSamplesRef.current[key] || "";
      const hashParts = uri.split("#t=")[1];
      let startSec = 0;
      if (hashParts) {
        const parts = hashParts.split(",").map(Number);
        if (!isNaN(parts[0])) startSec = parts[0] / 1000;
      }
      try { player.seekTo(startSec); } catch {}
    }
  }, []);

  const trimPCM = useCallback((decoded: DecodedSample, durationSec: number): DecodedSample => {
    const maxSamples = Math.floor(durationSec * 44100);
    if (decoded.pcm.length <= maxSamples) return decoded;
    const trimmed = decoded.pcm.slice(0, maxSamples);
    const fadeLen = Math.min(Math.floor(0.01 * 44100), trimmed.length);
    for (let i = 0; i < fadeLen; i++) {
      trimmed[trimmed.length - fadeLen + i] *= (fadeLen - i) / fadeLen;
    }
    return { pcm: trimmed, trimStartSamples: decoded.trimStartSamples, trimLenSamples: Math.min(decoded.trimLenSamples, maxSamples) };
  }, []);

  const getClickPCMs = useCallback(async (set: SoundSet): Promise<ClickPCMs> => {
    if (clickPCMCacheRef.current[set]) return clickPCMCacheRef.current[set];

    const customCfg = customSoundSetsRef.current[set];
    if (customCfg) {
      const loadSample = async (cfg: CustomSoundSample) => {
        if (cfg.type === "custom" && cfg.sampleUri) {
          try {
            const pcm = await decodeSampleFile(cfg.sampleUri);
            if (pcm) {
              const trimmed = trimPCM({ pcm, trimStartSamples: 0, trimLenSamples: pcm.length }, cfg.duration);
              return trimmed.pcm;
            }
            captureBreadcrumb({ category: "custom-sound", message: "Decode returned null", level: "warning", data: { sampleUri: cfg.sampleUri } });
          } catch (e) {
            captureBreadcrumb({ category: "custom-sound", message: "Failed to decode custom sample", level: "warning", data: { error: String(e) } });
          }
        }
        const srcSet = cfg.sourceSet || "classic";
        const srcRole = cfg.sourceRole || "strong";
        const src = (soundSets as Record<string, typeof soundSets.classic>)[srcSet] ?? soundSets.classic;
        const asset = srcRole === "strong" ? src.strong : srcRole === "high" ? src.high : src.low;
        const raw = await loadAssetPCM(asset);
        const trimmed = trimPCM({ pcm: raw, trimStartSamples: 0, trimLenSamples: raw.length }, cfg.duration);
        return trimmed.pcm;
      };
      const [strong, high, low] = await Promise.all([
        loadSample(customCfg.strong),
        loadSample(customCfg.accent),
        loadSample(customCfg.normal),
      ]);
      const result: ClickPCMs = { strong, high, low };
      clickPCMCacheRef.current[set] = result;
      return result;
    }

    const src = soundSets[set as keyof typeof soundSets] || soundSets.classic;
    const [strong, high, low] = await Promise.all([
      loadAssetPCM(src.strong),
      loadAssetPCM(src.high),
      loadAssetPCM(src.low),
    ]);
    const result: ClickPCMs = { strong, high, low };
    clickPCMCacheRef.current[set] = result;
    return result;
  }, [trimPCM]);

  const getSamplePCMs = useCallback(async (samples: NoteSampleMap): Promise<Map<string, SamplePCMEntry>> => {
    const map = new Map<string, SamplePCMEntry>();
    const entries = Object.entries(samples);
    if (entries.length === 0) return map;

    await Promise.all(entries.map(async ([key, uri]) => {
      const cached = samplePCMCacheRef.current.get(key);
      if (cached) {
        map.set(key, cached);
        return;
      }
      try {
        const pcm = await decodeSampleFile(uri);
        if (pcm) {
          const { trimStartMs, trimDurationMs } = parseTrimInfo(uri);
          const entry: SamplePCMEntry = { pcm, trimStartMs, trimDurationMs };
          map.set(key, entry);
          samplePCMCacheRef.current.set(key, entry);
        }
      } catch (e) {
        captureBreadcrumb({ category: "pre-render", message: "Failed to decode sample", level: "warning", data: { key, error: String(e) } });
      }
    }));
    return map;
  }, []);

  const getLayerClickPCMsForSchedule = useCallback(async (
    ticks: TickInfo[]
  ): Promise<Map<string, ClickPCMs>> => {
    const soundSetByName = new Set<string>();
    const fallbackByIndex = new Map<number, string>();
    for (const tick of ticks) {
      const li = tick.layerIndex ?? 0;
      if (li > 0) {
        if (tick.layerSoundSet) {
          soundSetByName.add(tick.layerSoundSet);
        } else {
          const ss = layerSoundSetsRef.current[li] || soundSetRef.current;
          fallbackByIndex.set(li, ss);
          soundSetByName.add(ss);
        }
      }
    }
    const loaded = new Map<string, ClickPCMs>();
    await Promise.all([...soundSetByName].map(async (ss) => {
      const pcms = await getClickPCMs(ss as SoundSet);
      loaded.set(ss, pcms);
    }));
    const map = new Map<string, ClickPCMs>(loaded);
    for (const [li, ss] of fallbackByIndex) {
      const pcms = loaded.get(ss);
      if (pcms) map.set(`#${li}`, pcms);
    }
    return map;
  }, [getClickPCMs]);

  const buildRenderedPlayer = useCallback(async (): Promise<ExpoAudioPlayer | null> => {
    const engine = engineRef.current;
    if (!engine) return null;

    try {
      const scheduleInfo = engine.getScheduleInfo();
      const ticks = scheduleInfo.ticks as TickInfo[];
      const [clickPCMs, layerClickPCMs] = await Promise.all([
        getClickPCMs(soundSetRef.current),
        getLayerClickPCMsForSchedule(ticks),
      ]);
      const samplePCMs = new Map<string, SamplePCMEntry>();

      await new Promise(r => setTimeout(r, 0));

      const pcm = renderMeasure({
        schedule: ticks,
        measureDurationMs: scheduleInfo.durationMs,
        clickPCMs,
        samplePCMs,
        clickVolume: Math.max(1.0, volumeRef.current),
        sampleVolume: samplePCMs.size > 0 ? sampleVolumeRef.current : 0,
        metronomeChannel: barModeRef.current ? barMetronomeChannelRef.current : "both",
        metroChannelsByBeat: barModeRef.current ? noteSampleMetroChannelsRef.current : undefined,
        layerClickPCMs,
      });
      if (volumeRef.current > 1.0) {
        if (pcm instanceof Float32Array) {
          applySoftClip(pcm);
        } else {
          applySoftClip(pcm.left);
          applySoftClip(pcm.right);
        }
      }

      const wavUri = await saveRenderedWav(pcm);

      if (Platform.OS === "web" && renderedUrlRef.current) {
        try { URL.revokeObjectURL(renderedUrlRef.current); } catch {}
      }
      renderedUrlRef.current = wavUri;

      const player = createAudioPlayer(wavUri);
      player.loop = true;
      player.volume = 1.0;
      return player;
    } catch (e) {
      captureBreadcrumb({ category: "pre-render", message: "Failed, falling back to per-tick audio", level: "warning", data: { error: String(e) } });
      return null;
    }
  }, [getClickPCMs, getSamplePCMs, getLayerClickPCMsForSchedule]);

  const warmupAudioPlayers = useCallback(async () => {
    try {
      const set = soundSetRef.current;
      const customCfg = customSoundSetsRef.current[set];
      const builtinSet: BuiltinSoundSet = (customCfg ? customCfg.strong.sourceSet : (set as BuiltinSoundSet)) || "classic";
      const pool = allPlayersRef.current[builtinSet as keyof BuiltinPlayers];
      if (!pool) {
        notifyAudioPoolFallback("warmup-missing-set", { requestedSet: String(builtinSet) });
      }
      const players = pool || allPlayersRef.current.classic;
      const toWarm = [players.highA, players.highB, players.highC, players.highD, players.lowA, players.lowB, players.lowC, players.lowD, players.strongA, players.strongB, players.strongC, players.strongD];
      const savedVolumes = toWarm.map(p => p.volume);
      toWarm.forEach(p => { p.volume = 0; });
      await Promise.all(toWarm.map(async (p) => {
        try { await p.seekTo(0); } catch {}
        safePlay(p, "warmup");
      }));
      await new Promise(r => setTimeout(r, 50));
      await Promise.all(toWarm.map(async (p, i) => {
        try { p.pause(); await p.seekTo(0); p.volume = savedVolumes[i]; } catch {}
      }));
    } catch {}
  }, []);

  const stopRenderedAudio = useCallback(() => {
    if (webRenderedLoopRef.current) {
      webRenderedLoopRef.current.stop();
      webRenderedLoopRef.current = null;
    }
    if (renderedPlayerRef.current) {
      try {
        renderedPlayerRef.current.pause();
        renderedPlayerRef.current.release();
      } catch {}
      renderedPlayerRef.current = null;
    }
    if (Platform.OS === "web" && renderedUrlRef.current) {
      try { URL.revokeObjectURL(renderedUrlRef.current); } catch {}
      renderedUrlRef.current = null;
    }
    const engine = engineRef.current;
    if (engine) engine.setPreRenderedAudio(false);
  }, []);


  const reRenderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleReRender = useCallback(() => {
    if (reRenderTimerRef.current) clearTimeout(reRenderTimerRef.current);
    reRenderTimerRef.current = setTimeout(async () => {
      const engine = engineRef.current;
      if (!engine?.getIsRunning()) return;

      stopRenderedAudio();
      engine.setPendingMeasureStartAction(null);

      if (Platform.OS === "web") {
        try {
          const scheduleInfo = engine.getScheduleInfo();
          const ticks = scheduleInfo.ticks as TickInfo[];
          const [clickPCMs, layerClickPCMs] = await Promise.all([
            getClickPCMs(soundSetRef.current),
            getLayerClickPCMsForSchedule(ticks),
          ]);
          if (!engine.getIsRunning()) return;
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
          engine.setPendingMeasureStartAction(() => {
            if (!engine.getIsRunning()) return;
            if (webRenderedLoopRef.current) {
              try { webRenderedLoopRef.current.stop(); } catch {}
              webRenderedLoopRef.current = null;
            }
            const loop = playWebRenderedLoop(pcm);
            webRenderedLoopRef.current = loop;
            engine.setPreRenderedAudio(true);
          });
        } catch {
        }
      } else {
        try {
          const player = await buildRenderedPlayer();
          if (!player) return;
          if (!engine.getIsRunning()) {
            try { player.release(); } catch {}
            return;
          }
          engine.setPendingMeasureStartAction(() => {
            if (!engine.getIsRunning()) {
              try { player.release(); } catch {}
              return;
            }
            if (renderedPlayerRef.current) {
              try {
                renderedPlayerRef.current.pause();
                renderedPlayerRef.current.release();
              } catch {}
              renderedPlayerRef.current = null;
            }
            renderedPlayerRef.current = player;
            player.volume = 1.0;
            engine.setPreRenderedAudio(true);
            safePlay(player, "preRender.initial");
          });
        } catch {
        }
      }
    }, 300);
  }, [stopRenderedAudio, buildRenderedPlayer, getClickPCMs, getLayerClickPCMsForSchedule]);

  const invalidateSamplePCMCache = useCallback((key?: string) => {
    if (key) {
      samplePCMCacheRef.current.delete(key);
    } else {
      samplePCMCacheRef.current.clear();
    }
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
    engineRef.current?.setBpm(clamped);
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
        const shouldFlash = fm === "all" || (fm === "accent" && pendingAccent);
        if (shouldFlash) {
          flashOpacity.value = withSequence(
            withTiming(0.12, { duration: 50 }),
            withTiming(0, { duration: 250, easing: Easing.out(Easing.quad) })
          );
        }
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
      engineRef.current?.setBpm(clampedBpm);
      // 수동 BPM 변경 시 /4 기준값도 갱신
      baseBpmRef.current = Math.round(clampedBpm * (beatDenominator / 4));
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
      // 현재 BPM과 현재 분모로 /4 기준값을 재계산 (stale ref 방지)
      baseBpmRef.current = Math.round(bpm * (prev / 4));
      const newBpm = Math.round(Math.min(300, Math.max(20, baseBpmRef.current * (4 / next))));
      setBpm(newBpm);
      engineRef.current?.setBpm(newBpm);
      persistSettings({ beatDenominator: next, bpm: newBpm });
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

  const barModeRef = useRef(barMode);
  useEffect(() => { barModeRef.current = barMode; }, [barMode]);
  const barStartBeatRef = useRef(barStartBeat);
  useEffect(() => { barStartBeatRef.current = barStartBeat; }, [barStartBeat]);
  const barLoopModeRef = useRef(barLoopMode);
  useEffect(() => { barLoopModeRef.current = barLoopMode; }, [barLoopMode]);
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
      clearAudioWatchdogRef.current();
      engine.stop();
      stopRenderedAudio();
      clearSamplePlayStates();
      setIsPreparing(false);
      setIsPlaying(false);
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
          if (ctx && ctx.state === "suspended") {
            await ctx.resume().catch(() => {});
          }

          // 즉시 시작 — per-tick 모드로 바로 재생, pre-render는 백그라운드 처리
          setIsPreparing(false);
          setIsPlaying(true);
          isPlayingRef.current = true;
          engine.start(startBeat ?? undefined);
          armAudioWatchdogRef.current();

          // 백그라운드: 버퍼 로딩 후 pre-rendered loop으로 전환
          ;(async () => {
            try {
              const src = soundSets[soundSetRef.current as keyof typeof soundSets] || soundSets.classic;
              const ready = await ensureWebClickBuffers(src as any);
              if (!ready || !engineRef.current?.getIsRunning()) return;
              webClickReadyRef.current = true;

              if (ctx && ctx.state === "suspended") {
                await ctx.resume();
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
                const loop = playWebRenderedLoop(pcm);
                webRenderedLoopRef.current = loop;
                engineRef.current?.setPreRenderedAudio(true);
              } catch (renderErr) {
                captureBreadcrumb({ category: "metronome", message: "togglePlayPause: Web pre-render failed, using per-tick", level: "warning", data: { error: String(renderErr) } });
              }
            } catch {}
          })();
        } else {
          // 즉시 시작 — per-tick 모드로 바로 재생
          setIsPreparing(false);
          setIsPlaying(true);
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

  // ─── 재생 복구 watchdog ───────────────────────────────────────────────────
  const armTimeRef = useRef<number | null>(null);
  const showRecoveryToastRef = useRef(showRecoveryToast);
  useEffect(() => { showRecoveryToastRef.current = showRecoveryToast; }, [showRecoveryToast]);

  const clearAudioWatchdog = useCallback(() => {
    if (audioWatchdogTimerRef.current) {
      clearTimeout(audioWatchdogTimerRef.current);
      audioWatchdogTimerRef.current = null;
    }
  }, []);

  const armAudioWatchdog = useCallback(() => {
    clearAudioWatchdog();
    audioRetryCountRef.current = 0;
    lastAudioFireRef.current = 0;

    const runCheck = () => {
      const engine = engineRef.current;
      if (!engine?.getIsRunning() || !isPlayingRef.current) {
        audioWatchdogTimerRef.current = null;
        return;
      }

      const bpmNow = bpmRef.current;
      const beatMs = 60000 / Math.max(bpmNow, 20);
      const threshold = Math.max(3500, 5 * beatMs);
      const timeSinceFire = lastAudioFireRef.current > 0
        ? Date.now() - lastAudioFireRef.current
        : Date.now() - (armTimeRef.current ?? Date.now());

      // web: AudioContext가 suspended이면 무조건 stuck
      const webCtxSuspended = Platform.OS === "web"
        && (getWebAudioContext()?.state === "suspended");

      const isStuck = webCtxSuspended || timeSinceFire > threshold;

      if (!isStuck) {
        audioWatchdogTimerRef.current = setTimeout(runCheck, 3000);
        return;
      }

      if (audioRetryCountRef.current < 2) {
        audioRetryCountRef.current += 1;

        if (Platform.OS === "web") {
          const ctx = getWebAudioContext();
          if (ctx?.state === "suspended") {
            ctx.resume().catch(() => {});
          }
          if (!webClickReadyRef.current) {
            const src = soundSets[soundSetRef.current as keyof typeof soundSets] || soundSets.classic;
            ensureWebClickBuffers(src as any).then((ok) => {
              if (ok) webClickReadyRef.current = true;
            }).catch(() => {});
          }
        }
        // pre-rendered 모드가 막혀있을 수 있으므로 per-tick으로 강제 전환
        engine.setPreRenderedAudio(false);
        lastAudioFireRef.current = Date.now();
        showRecoveryToastRef.current(t("main", "audioRecoveryRetry"));
        audioWatchdogTimerRef.current = setTimeout(runCheck, 3500);
      } else {
        showRecoveryToastRef.current(t("main", "audioRecoveryFailed"));
        audioWatchdogTimerRef.current = null;
      }
    };

    armTimeRef.current = Date.now();
    audioWatchdogTimerRef.current = setTimeout(runCheck, 4000);
  }, [clearAudioWatchdog, t]);

  useEffect(() => {
    armAudioWatchdogRef.current = armAudioWatchdog;
    clearAudioWatchdogRef.current = clearAudioWatchdog;
  }, [armAudioWatchdog, clearAudioWatchdog]);
  // ─────────────────────────────────────────────────────────────────────────
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
  const bpmRef = useRef(bpm);
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);

  const { stageModeActive, enterStageMode, exitStageMode } = useStageMode(bpmRef, updateBpm);

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
  useEffect(() => { anyModalOpenRef.current = activeModal !== null || landscapeImageModalVisible || recorderTarget !== null || showKbShortcuts || showNativeKbHint; }, [activeModal, landscapeImageModalVisible, recorderTarget, showKbShortcuts, showNativeKbHint]);

  const bpmTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bpmTapCountRef = useRef<{ direction: string; count: number }>({ direction: "", count: 0 });

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

  useEffect(() => {
    const repeatTimerRef = { current: null as ReturnType<typeof setInterval> | null };
    const heldKeyRef = { current: "" };
    const repeatCountRef = { current: 0 };

    const clearRepeat = () => {
      if (repeatTimerRef.current) { clearInterval(repeatTimerRef.current); repeatTimerRef.current = null; }
      heldKeyRef.current = "";
      repeatCountRef.current = 0;
    };

    const applyBpmDelta = (delta: number) => {
      const cur = bpmRef.current;
      updateBpmRef.current(cur + delta);
    };

    const applyBeatDelta = (delta: number) => {
      updateTimeSignatureRef.current(beatsPerMeasureRef.current + delta);
    };

    const tapTimestamps: number[] = [];
    const TAP_RESET_MS = 2000;
    const TAP_MIN_TAPS = 2;

    const kb = () => keyBindingsRef.current;

    const handleKeyDown = (e: NormalizedKeyEvent) => {
      if (isEditableTarget(e)) return;

      const b = kb();
      const inNoteMode = noteModeRef.current;
      const inBarMode = barModeRef.current;
      const modalOpen = anyModalOpenRef.current;

      // Escape — 우선순위: 노트모드 → 바모드 → 단축키 모달 → 네이티브 힌트 → 기타 모달
      if (matchesBinding(e, b.escape)) {
        if (inNoteMode) {
          e.preventDefault();
          setNoteMode(false);
          return;
        }
        if (inBarMode) {
          e.preventDefault();
          setBarMode(false);
          return;
        }
        if (showKbShortcutsRef.current) {
          e.preventDefault();
          setShowKbShortcuts(false);
          return;
        }
        if (showNativeKbHintRef.current) {
          e.preventDefault();
          setShowNativeKbHint(false);
          return;
        }
        if (modalOpen) {
          // anyModalOpen이면 App level 뒤로가기가 처리
          return;
        }
        return;
      }

      if (modalOpen) return;

      // Space — 재생/정지 (노트모드에서는 노트 토글)
      if (matchesBinding(e, b.playPause)) {
        e.preventDefault();
        if (inNoteMode && handleNoteTogglePlayRef.current) {
          handleNoteTogglePlayRef.current();
        } else {
          togglePlayPauseRef.current();
        }
        return;
      }

      // 노트 모드 빠른 추가: 1~9 숫자 키 (재생 중일 때만 큐 추가)
      if (inNoteMode && /^Digit[1-9]$/.test(e.code)) {
        const idx = parseInt(e.code.slice(5), 10) - 1;
        const entry = quickAddListRef.current[idx];
        if (entry && noteIsPlayingRef.current) {
          e.preventDefault();
          quickAddNoteRef.current(entry);
        }
        return;
      }

      // 노트 모드에서는 Space 외 단축키 비활성
      if (inNoteMode) return;

      // Enter — 타이머 idle/편집 중이면 타이머 설정 완료, 아니면 탭 템포
      if (matchesBinding(e, b.tapTempo)) {
        const swRef = stopwatchTimerRef.current || stopwatchTimerLandscapeRef.current;
        if (swRef?.isTimerInputActive()) {
          e.preventDefault();
          swRef.handleEnterKey();
          return;
        }
        e.preventDefault();
        const now = performance.now();
        if (tapTimestamps.length > 0 && now - tapTimestamps[tapTimestamps.length - 1] > TAP_RESET_MS) {
          tapTimestamps.length = 0;
        }
        tapTimestamps.push(now);
        if (tapTimestamps.length >= TAP_MIN_TAPS) {
          const intervals: number[] = [];
          for (let i = 1; i < tapTimestamps.length; i++) {
            intervals.push(tapTimestamps[i] - tapTimestamps[i - 1]);
          }
          const avgMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;
          const tapBpm = Math.round(60000 / avgMs);
          if (tapBpm >= 20 && tapBpm <= 300) {
            updateBpmRef.current(tapBpm);
          }
        }
        if (tapTimestamps.length > 8) tapTimestamps.splice(0, tapTimestamps.length - 8);
        return;
      }

      // Arrow Up/Down — BPM ±1 (키 반복 지원)
      if (matchesBinding(e, b.bpmUp) || matchesBinding(e, b.bpmDown)) {
        e.preventDefault();
        const delta = matchesBinding(e, b.bpmUp) ? 1 : -1;
        applyBeatDelta(delta);
        if (heldKeyRef.current !== e.code) {
          clearRepeat();
          heldKeyRef.current = e.code;
          repeatCountRef.current = 0;
          repeatTimerRef.current = setInterval(() => {
            repeatCountRef.current++;
            const d = repeatCountRef.current > 10 ? delta * 2 : delta;
            applyBeatDelta(d);
          }, 150);
        }
        return;
      }

      // Arrow Left/Right — BPM ±5 (키 반복 지원)
      if (matchesBinding(e, b.bpmRight) || matchesBinding(e, b.bpmLeft)) {
        e.preventDefault();
        const delta = matchesBinding(e, b.bpmRight) ? 5 : -5;
        applyBpmDelta(delta);
        if (heldKeyRef.current !== e.code) {
          clearRepeat();
          heldKeyRef.current = e.code;
          repeatCountRef.current = 0;
          repeatTimerRef.current = setInterval(() => {
            repeatCountRef.current++;
            const step = repeatCountRef.current > 10 ? 20 : repeatCountRef.current > 5 ? 10 : 5;
            const d = matchesBinding(e, b.bpmRight) ? step : -step;
            applyBpmDelta(d);
          }, 120);
        }
        return;
      }

      // Tab — 메뉴 토글
      if (matchesBinding(e, b.toggleMenu)) {
        e.preventDefault();
        setActiveModal((prev) => (prev === "menu" ? null : "menu"));
        return;
      }

      // W — 스톱워치 토글
      if (matchesBinding(e, b.toggleStopwatch)) {
        e.preventDefault();
        const ref = stopwatchTimerRef.current || stopwatchTimerLandscapeRef.current;
        if (ref) ref.openStopwatch();
        return;
      }

      // T — 타이머 토글
      if (matchesBinding(e, b.toggleTimer)) {
        e.preventDefault();
        const ref = stopwatchTimerRef.current || stopwatchTimerLandscapeRef.current;
        if (ref) ref.openTimer();
        return;
      }

      // P — Practice Book 열기
      if (matchesBinding(e, b.openPracticeBook)) {
        e.preventDefault();
        setActiveModal((prev) => (prev === "practiceBook" ? null : "practiceBook"));
        return;
      }

      // ? — 단축키 목록 팝업 (web) / 힌트 오버레이 (native)
      // 네이티브에서는 shiftKey 없이 key==="?" 만 전달될 수 있으므로 직접 비교도 추가
      if (matchesBinding(e, b.showShortcuts) || (Platform.OS !== "web" && e.key === "?")) {
        e.preventDefault();
        if (Platform.OS === "web") {
          setShowKbShortcuts((prev) => !prev);
        } else {
          setShowNativeKbHint((prev) => !prev);
        }
        return;
      }

      // S/A/N/M — 비트 추가 (비트 모드 + 재생 중 비활성화)
      const playing = engineRef.current?.getIsRunning() ?? false;
      if (!playing && !barModeRef.current && !noteModeRef.current) {
        const addBeatShortcuts: { binding: typeof b.addBeatStrong; type: BeatType }[] = [
          { binding: b.addBeatStrong, type: "strong" },
          { binding: b.addBeatAccent, type: "accent" },
          { binding: b.addBeatNormal, type: "normal" },
          { binding: b.addBeatMute,   type: "mute" },
        ];
        for (const { binding, type } of addBeatShortcuts) {
          if (matchesBinding(e, binding)) {
            e.preventDefault();
            const cur = beatsPerMeasureRef.current;
            if (cur < 16) {
              const newBeats = cur + 1;
              const newTypes: BeatType[] = [...beatTypesRef.current, type];
              setBeatsPerMeasure(newBeats);
              setBeatTypes(newTypes);
              engineRef.current?.setBeatsPerMeasure(newBeats);
              engineRef.current?.setBeatTypes(newTypes);
              if (!inBarMode) persistSettings({ beatsPerMeasure: newBeats });
            }
            return;
          }
        }

        // D — 마지막 비트 삭제 (재생 중에는 비활성화)
        if (matchesBinding(e, b.removeBeat)) {
          e.preventDefault();
          const cur = beatsPerMeasureRef.current;
          if (cur > 1) {
            const newBeats = cur - 1;
            const newTypes = beatTypesRef.current.slice(0, newBeats);
            setBeatsPerMeasure(newBeats);
            setBeatTypes(newTypes);
            engineRef.current?.setBeatsPerMeasure(newBeats);
            engineRef.current?.setBeatTypes(newTypes);
            if (!inBarMode) persistSettings({ beatsPerMeasure: newBeats });
          }
          return;
        }
      }

      // Shift+S/A/N/M — 서브디비전 셀 추가 (비트 모드 + 재생 중 비활성화)
      if (!playing && !barModeRef.current && !noteModeRef.current) {
        const addSubShortcuts: { binding: typeof b.addSubStrong; type: BeatType }[] = [
          { binding: b.addSubStrong, type: "strong" },
          { binding: b.addSubAccent, type: "accent" },
          { binding: b.addSubNormal, type: "normal" },
          { binding: b.addSubMute,   type: "mute" },
        ];
        for (const { binding, type } of addSubShortcuts) {
          if (matchesBinding(e, binding)) {
            e.preventDefault();
            const p = subdivisionPatternRef.current;
            if (p.length < 8) {
              const newP: BeatType[] = [...p, type];
              setSubdivisionPattern(newP);
              persistSettings({ subdivisionPattern: newP });
            }
            return;
          }
        }

        // Shift+D — 서브디비전 셀 삭제 (재생 중에는 비활성화)
        if (matchesBinding(e, b.removeSub)) {
          e.preventDefault();
          const p = subdivisionPatternRef.current;
          if (p.length > 1) {
            const newP = p.slice(0, -1);
            setSubdivisionPattern(newP);
            persistSettings({ subdivisionPattern: newP });
          }
          return;
        }
      }

      // 0 — 서브디비전 셀 전체 타입 순환 (strong→accent→normal→mute, 비트 모드 전용)
      if (!barModeRef.current && !noteModeRef.current && matchesBinding(e, b.cycleBeatTypes)) {
        e.preventDefault();
        const subCycleOrder: BeatType[] = ["strong", "accent", "normal", "mute"];
        const prev = subdivisionPatternRef.current;
        const first = prev[0] || "normal";
        const idx = subCycleOrder.indexOf(first as BeatType);
        const next = subCycleOrder[(idx + 1) % subCycleOrder.length];
        const newP = prev.map(() => next) as BeatType[];
        setSubdivisionPattern(newP);
        persistSettings({ subdivisionPattern: newP });
        return;
      }

      // 숫자 키 — 타이머 입력 활성 상태일 때만 consume (미활성 시 하위 액션 재바인딩 허용)
      if (/^Digit[0-9]$/.test(e.code)) {
        const swRef = stopwatchTimerRef.current || stopwatchTimerLandscapeRef.current;
        if (swRef?.isTimerInputActive()) {
          const digit = e.code.slice(5);
          swRef.handleDigit(digit);
          return;
        }
      }

      // L — 루프 모드 토글 (바 모드)
      if (inBarMode && matchesBinding(e, b.loopToggle)) {
        e.preventDefault();
        setBarLoopMode((prev) => (prev === "once" ? "loop" : "once"));
        return;
      }

      // G — 재생 순서 순환 (바 모드)
      if (inBarMode && matchesBinding(e, b.blockPlayModeNext)) {
        e.preventDefault();
        setBlockPlayMode((prev) => {
          const order: ("sequential" | "loop" | "random")[] = ["sequential", "loop", "random"];
          const idx = order.indexOf(prev);
          return order[(idx + 1) % order.length];
        });
        return;
      }
    };

    const handleKeyUp = (e: NormalizedKeyEvent) => {
      if (e.code === heldKeyRef.current) clearRepeat();
    };

    if (Platform.OS === "web") {
      const webKeyDown = (e: KeyboardEvent) => handleKeyDown(e);
      const webKeyUp = (e: KeyboardEvent) => handleKeyUp(e);
      window.addEventListener("keydown", webKeyDown);
      window.addEventListener("keyup", webKeyUp);
      return () => {
        clearRepeat();
        window.removeEventListener("keydown", webKeyDown);
        window.removeEventListener("keyup", webKeyUp);
      };
    } else {
      nativeKbDownRef.current = handleKeyDown;
      nativeKbUpRef.current = handleKeyUp;
      return () => {
        clearRepeat();
        nativeKbDownRef.current = null;
        nativeKbUpRef.current = null;
      };
    }
  }, []);

  useEffect(() => {
    const sub = addNotificationActionListener((actionId) => {
      const handleAsync = async () => {
      if (actionId === "TOGGLE_PLAY") {
        const engine = engineRef.current;
        if (!engine) return;

        const modeLabel = barModeRef.current ? "Bar" : "Dial";

        if (engine.getIsRunning()) {
          engine.stop();
          stopRenderedAudio();
          clearSamplePlayStates();
          setIsPreparing(false);
          setIsPlaying(false);
          resetPlaybackVisuals();
          showPausedNotification(bpmRef.current, modeLabel, languageRef.current);
        } else {
          stopRenderedAudio();
          engine.setPreRenderedAudio(false);
          setIsPreparing(false);

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

          resetPlaybackVisuals();

          if (Platform.OS !== "web") {
            try {
              await AudioModule.setAudioModeAsync({
                playsInSilentMode: true,
                interruptionMode: "mixWithOthers",
                shouldPlayInBackground: true,
              });
            } catch {}
          }

          // 오디오 플레이어 생성 후 재생 (일반 재생 버튼과 동일한 경로)
          const renderedPlayer = await buildRenderedPlayer();
          if (renderedPlayer) {
            stopRenderedAudio();
            renderedPlayerRef.current = renderedPlayer;
            renderedPlayer.volume = 1.0;
            engine.setPreRenderedAudio(true);
          }

          setIsPlaying(true);
          engine.start(barModeRef.current ? (barStartBeatRef.current ?? undefined) : undefined);

          if (renderedPlayer) {
            safePlay(renderedPlayer, "metronome.start.barMode");
          }

          showPlayingNotification(bpmRef.current, modeLabel, languageRef.current);

          if (barModeRef.current && barLoopModeRef.current === "once") {
            engine.requestStopAfterMeasure();
          }
        }
        return;
      }

      if (actionId === "BPM_DOWN" || actionId === "BPM_UP") {
        const dir = actionId;
        const engine = engineRef.current;

        if (bpmTapCountRef.current.direction === dir && bpmTapTimerRef.current) {
          clearTimeout(bpmTapTimerRef.current);
          bpmTapTimerRef.current = null;
          bpmTapCountRef.current = { direction: "", count: 0 };

          const delta = dir === "BPM_DOWN" ? -5 : 5;
          const newBpm = Math.max(20, Math.min(300, bpmRef.current + delta));
          updateBpmRef.current(newBpm);
          const isCurrentlyPlaying = engine?.getIsRunning() ?? false;
          if (isCurrentlyPlaying) {
            stopRenderedAudio();
          }
          const modeLabel = barModeRef.current ? "Bar" : "Dial";
          updateNotificationBpm(newBpm, modeLabel, isCurrentlyPlaying, languageRef.current);
        } else {
          if (bpmTapTimerRef.current) {
            clearTimeout(bpmTapTimerRef.current);
          }
          bpmTapCountRef.current = { direction: dir, count: 1 };

          bpmTapTimerRef.current = setTimeout(() => {
            bpmTapTimerRef.current = null;
            bpmTapCountRef.current = { direction: "", count: 0 };

            const delta = dir === "BPM_DOWN" ? -1 : 1;
            const newBpm = Math.max(20, Math.min(300, bpmRef.current + delta));
            updateBpmRef.current(newBpm);
            const isNowPlaying = engineRef.current?.getIsRunning() ?? false;
            if (isNowPlaying) {
              stopRenderedAudio();
            }
            const modeLabel = barModeRef.current ? "Bar" : "Dial";
            updateNotificationBpm(newBpm, modeLabel, isNowPlaying, languageRef.current);
          }, 300);
        }
      }
      };
      handleAsync().catch((e) => captureBreadcrumb({ category: "notification", message: "알림 버튼 핸들러 에러", level: "warning", data: { error: String(e) } }));
    });
    return () => {
      sub.remove();
      if (bpmTapTimerRef.current) clearTimeout(bpmTapTimerRef.current);
    };
  }, []);

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

    applyEntryToEngineCore(engine, entry);

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

    applyEntryToEngineCore(engine, entry);
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

  useEffect(() => { quickAddNoteRef.current = handleNoteAddToQueue; }, [handleNoteAddToQueue]);

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

      engine.setBpm(entry.bpm);
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

      engine.setBpm(entry.bpm);
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

  const pickLandscapeImageRef = useRef<() => Promise<void>>(async () => {});
  const pickLandscapeImage = useCallback(async () => {
    try {
      const ok = await ensurePermission("photo", t, {
        pendingAction: () => { void pickLandscapeImageRef.current(); },
      });
      if (!ok) {
        setLandscapeImageModalVisible(false);
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        const uri = result.assets[0].uri;
        setLandscapeImageUri(uri);
        AsyncStorage.setItem("metronome_landscape_image", uri);
      }
    } catch (e) {
      captureBreadcrumb({ category: "imagePicker", message: "pickLandscapeImage failed", level: "warning", data: { error: String(e) } });
    } finally {
      setLandscapeImageModalVisible(false);
    }
  }, [t]);

  useEffect(() => { pickLandscapeImageRef.current = pickLandscapeImage; }, [pickLandscapeImage]);

  const removeLandscapeImage = useCallback(() => {
    setLandscapeImageUri(null);
    AsyncStorage.removeItem("metronome_landscape_image");
    setLandscapeImageModalVisible(false);
  }, []);

  // Load activity logs whenever the landscape stats panel is visible / playback toggles
  useEffect(() => {
    if (!isLandscape || !showLandscapeImage || landscapeContentType !== "stats") return;
    let cancelled = false;
    const refresh = () => {
      loadActivityLogs().then((logs) => { if (!cancelled) setLandscapeStatsLogs(logs); });
    };
    refresh();
    const id = setInterval(refresh, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, [isLandscape, showLandscapeImage, landscapeContentType, isPlaying]);

  const landscapeStats = useMemo(
    () => computeLandscapeStats(landscapeStatsLogs),
    [landscapeStatsLogs],
  );

  const formatStatMinutes = useCallback((seconds: number): string => {
    const mins = Math.round(seconds / 60);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;
    return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
  }, []);

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  if (!isLoaded) {
    return (
      <View style={[styles.screen, { backgroundColor: C.background }]} />
    );
  }

  type NativeKbViewProps = React.ComponentProps<typeof View> & {
    ref?: React.Ref<View>;
    focusable?: boolean;
    onKeyDown?: (e: { nativeEvent: { key: string; shiftKey?: boolean; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean } }) => void;
    onKeyUp?: (e: { nativeEvent: { key: string } }) => void;
  };
  const KbView = View as React.ComponentType<NativeKbViewProps>;

  return (
    <KbView
      ref={rootViewRef}
      style={styles.screen}
      focusable={Platform.OS !== "web" ? true : undefined}
      onKeyDown={Platform.OS !== "web" ? (e) => handleNativeKeyDown(e.nativeEvent) : undefined}
      onKeyUp={Platform.OS !== "web" ? (e) => handleNativeKeyUp(e.nativeEvent) : undefined}
    >
      <StatusBar style={themeMode === "day" ? "dark" : "light"} />

      {/* ── 악보 모드 전체화면 오버레이 ── */}
      {scoreMode === "list" && (
        <View style={[StyleSheet.absoluteFillObject, { zIndex: 500, backgroundColor: C.background }]}>
          <ScoreListScreen
            defaultBpm={bpm}
            onClose={() => setScoreMode(null)}
            onOpenEditor={(doc) => {
              setScoreEditorDoc(doc);
              setScoreMode("editor");
            }}
          />
        </View>
      )}
      {scoreMode === "editor" && scoreEditorDoc && (
        <View style={[StyleSheet.absoluteFillObject, { zIndex: 500, backgroundColor: C.background }]}>
          <ScoreEditorScreen
            doc={scoreEditorDoc}
            onBack={() => setScoreMode("list")}
            onSaved={(updatedDoc) => {
              setScoreEditorDoc(updatedDoc);
              // 연습장 캐시 무효화 (저장된 연결 항목 반영)
              scorePracticeBookRef.current = [];
            }}
            onLinkedEntryChange={handleLinkedEntryChange}
          />
        </View>
      )}
      {permissionRecoveryToast ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: insets.top + 12,
            left: 16,
            right: 16,
            zIndex: 9999,
            backgroundColor: C.surface,
            borderRadius: 12,
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderWidth: 1,
            borderColor: C.border,
            alignItems: "center",
          }}
        >
          <Text style={{ color: C.text, fontSize: 14, fontWeight: "500" as const }}>
            {permissionRecoveryToast}
          </Text>
        </View>
      ) : null}
      <LinearGradient
        colors={themeMode === "day" ? [C.background, C.background] : [C.background, "#0A0E14", C.background]}
        style={StyleSheet.absoluteFill}
      />
      {themeMode === "day" && (
        <LinearGradient
          colors={["rgba(255,255,255,0.6)", "rgba(255,255,255,0.2)", "transparent"]}
          style={{ position: "absolute", top: 0, left: 0, right: 0, height: 180, zIndex: 0 }}
          pointerEvents="none"
        />
      )}

      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: C.accent,
            pointerEvents: "none" as const,
          },
          flashStyle,
        ]}
      />

      {isPlaying && fadeOutStatusText && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute" as const,
            top: insets.top + (Platform.OS === "web" ? 67 : 8),
            alignSelf: "center" as const,
            backgroundColor: fadeOutPhase === "muted" ? "rgba(0,0,0,0.7)" : C.accent,
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 12,
            zIndex: 20,
          }}
          testID="fade-out-status"
        >
          <Text style={{ color: "#fff", fontFamily: "SpaceGrotesk_600SemiBold", fontSize: FontSize.small }}>
            {fadeOutStatusText}
          </Text>
        </View>
      )}

      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: C.accent,
            pointerEvents: "none" as const,
            zIndex: 9999,
            alignItems: "center",
            justifyContent: "center",
          },
          halfTimeFlashStyle,
        ]}
      >
        <Text style={{
          fontFamily: "SpaceGrotesk_700Bold",
          fontSize: S.ms(96, 0.5),
          color: C.background,
          letterSpacing: 4,
        }}>
          {beatsPerMeasure}/{beatDenominator}
        </Text>
      </Animated.View>

      {!noteMode && !barMode && (
      <Pressable
        style={[
          styles.menuButton,
          { backgroundColor: C.surface, borderColor: C.border },
          isLandscape
            ? { left: 20, right: "auto" as any, top: (insets.top || webTopInset) }
            : { right: S.ms(20, 0.3), top: (insets.top || webTopInset) + 12 },
        ]}
        onPress={() => setActiveModal(activeModal === "menu" ? null : "menu")}
        hitSlop={8}
        testID="menu-button"
        accessibilityRole="button"
        accessibilityLabel={t("a11y", "menuButton")}
        accessibilityState={{ expanded: showMenu }}
      >
        <Ionicons name="menu" size={S.ms(22, 0.5)} color={C.textSecondary} />
      </Pressable>
      )}

      <AnimatedModal transparent visible={showMenu} onRequestClose={() => setActiveModal(null)}>
        <Pressable style={styles.menuOverlay} onPress={() => setActiveModal(null)} testID="menu-overlay">
          <View style={[styles.menuDropdown, { backgroundColor: C.surface, borderColor: C.border }, isLandscape ? { left: S.ms(20, 0.3), right: "auto" as any, top: (insets.top || webTopInset) + S.ms(40, 0.3) } : { top: (insets.top || webTopInset) + 52 }]}>
            <Pressable
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
              onPress={() => openExclusive("settings")}
              accessibilityRole="menuitem"
              accessibilityLabel={t("a11y", "menuSettings")}
            >
              <Ionicons name="settings-outline" size={S.ms(18, 0.3)} color={C.textSecondary} />
              <Text style={[styles.menuItemText, { color: C.text }]}>{t("main", "menuSettings")}</Text>
            </Pressable>
            <View style={[styles.menuDivider, { backgroundColor: C.border }]} />
            <Pressable
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
              onPress={() => {
                if (loggingEnabled) featureStartRef.current = { name: "signal_generator", start: Date.now() };
                openExclusive("signalGen");
              }}
              accessibilityRole="menuitem"
              accessibilityLabel={t("a11y", "menuSignalGenerator")}
            >
              <MaterialCommunityIcons name="waveform" size={S.ms(18, 0.3)} color={C.accent} />
              <Text style={[styles.menuItemText, { color: C.text }]}>{t("main", "menuSignalGenerator")}</Text>
            </Pressable>
            <View style={[styles.menuDivider, { backgroundColor: C.border }]} />
            <Pressable
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
              onPress={() => openExclusive("workUp")}
              accessibilityRole="menuitem"
              accessibilityLabel={t("a11y", "menuWorkUp")}
            >
              <MaterialCommunityIcons name="chart-line" size={S.ms(18, 0.3)} color={C.accent} />
              <Text style={[styles.menuItemText, { color: C.text }]}>{t("main", "menuWorkUp")}</Text>
            </Pressable>
            <View style={[styles.menuDivider, { backgroundColor: C.border }]} />
            <Pressable
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
              onPress={() => {
                if (loggingEnabled) featureStartRef.current = { name: "practice_note", start: Date.now() };
                openExclusive("practiceBook");
              }}
              accessibilityRole="menuitem"
              accessibilityLabel={t("a11y", "menuPracticeBook")}
            >
              <MaterialCommunityIcons name="notebook-outline" size={S.ms(18, 0.3)} color={C.accent} />
              <Text style={[styles.menuItemText, { color: C.text }]}>{t("main", "menuPracticeNote")}</Text>
            </Pressable>
            <View style={[styles.menuDivider, { backgroundColor: C.border }]} />
            <Pressable
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
              onPress={() => openExclusive("moreMenu")}
              accessibilityRole="menuitem"
              accessibilityLabel={t("main", "menuMore")}
              testID="menu-more"
            >
              <Ionicons name="ellipsis-horizontal" size={S.ms(18, 0.3)} color={C.accent} />
              <Text style={[styles.menuItemText, { color: C.text }]}>{t("main", "menuMore")}</Text>
            </Pressable>
          </View>
        </Pressable>
      </AnimatedModal>

      <MoreMenuModal
        visible={showMoreMenu}
        onClose={() => setActiveModal(null)}
        onScheduledStart={() => openExclusive("scheduledStart")}
        onFadeOut={() => openExclusive("fadeOut")}
        onStageMode={() => {
          setActiveModal(null);
          void enterStageMode();
        }}
        onDrumKit={() => {
          const engine = engineRef.current;
          if (engine?.getIsRunning()) engine.stop();
          stopRenderedAudio();
          clearSamplePlayStates();
          resetPlaybackVisuals();
          setIsPreparing(false);
          setIsPlaying(false);
          openExclusive("drumKit");
        }}
        onStemSep={() => openExclusive("stemSep")}
        onScoreMode={() => {
          setActiveModal(null);
          setScoreMode("list");
        }}
      />

      <DrumKitModal
        visible={showDrumKit}
        onClose={() => setActiveModal(null)}
        onStemSep={(uri, name) => {
          setStemSepInitUri(uri);
          setStemSepInitName(name);
          setActiveModal(null);
          setTimeout(() => openExclusive("stemSep"), 50);
        }}
      />

      <BpmDetectModal
        visible={showBpmDetect}
        onClose={() => setActiveModal(null)}
        onApply={(bpm) => {
          updateBpm(bpm);
          setActiveModal(null);
        }}
      />

      <StemSeparationModal
        visible={showStemSep}
        onClose={() => {
          setActiveModal(null);
          setStemSepInitUri(undefined);
          setStemSepInitName(undefined);
        }}
        onSetBpm={updateBpm}
        initialUri={stemSepInitUri}
        initialName={stemSepInitName}
        onStartMetronome={() => {
          if (!engineRef.current?.getIsRunning()) {
            void togglePlayPauseRef.current?.();
          }
        }}
        onStopMetronome={() => {
          if (engineRef.current?.getIsRunning()) {
            void togglePlayPauseRef.current?.();
          }
        }}
      />


      <FadeOutModal
        visible={showFadeOut}
        onClose={() => setActiveModal(null)}
        onStart={(s: FadeOutSettings) => {
          const engine = engineRef.current;
          if (!engine) return;
          setActiveModal(null);
          if (engine.getIsRunning()) {
            engine.stop();
          }
          stopRenderedAudio();
          clearSamplePlayStates();
          resetPlaybackVisuals();
          fadeOutSessionRef.current = { N: s.audibleN, M: s.mutedM, K: s.audibleK };
          fadeOutMutedRef.current = false;
          fadeOutMeasureCountRef.current = 0;
          setFadeOutPhase("audible1");
          setFadeOutMeasureInPhase(0);
          practiceStartRef.current = null;
          setIsPlaying(true);
          const modeLabel = barModeRef.current ? "Bar" : "Dial";
          showPlayingNotification(bpm, modeLabel, languageRef.current);
          engine.start();
        }}
      />

      {showScheduledStart && (
        <ScheduledStartModal
          visible={showScheduledStart}
          onClose={() => setActiveModal(null)}
          bpm={bpm}
          beatsPerMeasure={beatsPerMeasure}
          onScheduled={({ startAtPerformanceTime }) => {
            const engine = engineRef.current;
            if (!engine) return;
            engine.stop();
            resetPlaybackVisuals();
            setIsPlaying(true);
            engine.start({ startAtPerformanceTime });
          }}
        />
      )}

      <AnimatedModal visible={landscapeImageModalVisible} transparent onRequestClose={() => setLandscapeImageModalVisible(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center" as const, alignItems: "center" as const }} onPress={() => setLandscapeImageModalVisible(false)}>
          <View style={{ backgroundColor: C.background, borderRadius: 16, padding: 24, gap: 12, minWidth: 220 }} onStartShouldSetResponder={() => true}>
            <Text style={{ fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 16, color: C.text, textAlign: "center" as const }}>{t("settings", "hubImages")}</Text>
            <Pressable onPress={pickLandscapeImage} style={{ flexDirection: "row" as const, alignItems: "center" as const, gap: 10, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: C.surface, borderRadius: 10 }}>
              <Ionicons name="image-outline" size={S.ms(20, 0.4)} color={C.accent} />
              <Text style={{ fontFamily: "SpaceGrotesk_500Medium", fontSize: 14, color: C.text }}>{landscapeImageUri ? t("settings", "changeImage") : t("settings", "addImage")}</Text>
            </Pressable>
            {landscapeImageUri && (
              <Pressable onPress={removeLandscapeImage} style={{ flexDirection: "row" as const, alignItems: "center" as const, gap: 10, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: C.surface, borderRadius: 10 }}>
                <Ionicons name="trash-outline" size={S.ms(20, 0.4)} color={C.danger} />
                <Text style={{ fontFamily: "SpaceGrotesk_500Medium", fontSize: 14, color: C.danger }}>{t("settings", "removeImage")}</Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      </AnimatedModal>

      {/* SignalGeneratorModal은 항상 마운트 상태로 유지한다.
          TuningGuide로 전환 시 SignalGen을 visible=false로 잠시 숨긴 뒤
          TuningGuide 종료 후 재오픈할 때 내부 상태(주파수/파형/옥타브 등)를
          보존하기 위함이다. */}
      <SignalGeneratorModal
        visible={showSignalGen}
        onClose={() => {
          // 사용자가 명시적으로 SignalGen을 닫으면 TG 재오픈 플래그도 클리어.
          reopenSignalGenAfterTuningGuideRef.current = false;
          tuningGuideOnSelectRef.current = null;
          if (loggingEnabled && featureStartRef.current?.name === "signal_generator") {
            const dur = Math.round((Date.now() - featureStartRef.current.start) / 1000);
            if (dur >= 2) addActivityLog({ type: "feature_usage", data: { feature: "signal_generator", duration: dur } });
            featureStartRef.current = null;
          }
          setActiveModal(null);
        }}
        onOpenTuningGuide={(currentFreq, onSelectFreq) => {
          tuningGuideOnSelectRef.current = onSelectFreq;
          const next = openTuningGuideFromSignalGen({
            activeModal,
            reopenSignalGenAfterTuningGuide: reopenSignalGenAfterTuningGuideRef.current,
          } satisfies SgTgState);
          reopenSignalGenAfterTuningGuideRef.current = next.reopenSignalGenAfterTuningGuide;
          setActiveModal(next.activeModal);
        }}
        onOpenBpmDetect={() => openExclusive("bpmDetect")}
      />

      {recorderTarget !== null && (
      <NoteRecorderModal
        visible={recorderTarget !== null}
        onClose={() => setRecorderTarget(null)}
        onSave={handleNoteRecordSave}
        onDelete={handleNoteRecordDelete}
        onSuggestBpm={handleNoteRecordSuggestBpm}
        beatIndex={recorderTarget?.beat ?? 0}
        subIndex={recorderTarget?.sub ?? 0}
        hasExisting={recorderTarget ? hasNoteSample(recorderTarget.beat, recorderTarget.sub, noteSamples) : false}
        existingName={recorderTarget ? (noteSampleNames[`${recorderTarget.beat}-${recorderTarget.sub}`] || "") : ""}
        existingChannel={recorderTarget ? (noteSampleChannels[`${recorderTarget.beat}-${recorderTarget.sub}`] ?? "both") : "both"}
        existingMetronomeChannel={noteSampleMetroChannels[String(recorderTarget?.beat ?? 0)] ?? "both"}
        bpm={bpm}
        beatsPerMeasure={beatsPerMeasure}
        soundSet={soundSet.startsWith("custom") ? "classic" : soundSet as any}
        onOpenStemSep={() => {
          setRecorderTarget(null);
          setTimeout(() => openExclusive("stemSep"), 50);
        }}
      />
      )}

      {/* TuningGuideModal — SignalGeneratorModal 외부(앱 루트 레벨)에서 단독 렌더링하여
          네이티브 Modal 중첩(ghost 입력 차단) 문제를 방지한다. */}
      <TuningGuideModal
        visible={showTuningGuide}
        onClose={() => {
          tuningGuideOnSelectRef.current = null;
          // closeTuningGuide 가 재오픈 플래그를 보고 다음 activeModal 을 결정한다.
          const next = closeTuningGuide({
            activeModal,
            reopenSignalGenAfterTuningGuide: reopenSignalGenAfterTuningGuideRef.current,
          } satisfies SgTgState);
          reopenSignalGenAfterTuningGuideRef.current = next.reopenSignalGenAfterTuningGuide;
          setActiveModal(next.activeModal);
        }}
        onSelectFreq={(freq) => {
          // SignalGen이 닫혀 있어도 콜백 자체는 호출한다.
          if (tuningGuideOnSelectRef.current) {
            tuningGuideOnSelectRef.current(freq);
          }
          tuningGuideOnSelectRef.current = null;
          const next = closeTuningGuide({
            activeModal,
            reopenSignalGenAfterTuningGuide: reopenSignalGenAfterTuningGuideRef.current,
          } satisfies SgTgState);
          reopenSignalGenAfterTuningGuideRef.current = next.reopenSignalGenAfterTuningGuide;
          setActiveModal(next.activeModal);
        }}
        lang={language as "ko" | "en"}
        accentColor={C.accent}
        accentDim={C.accentDim}
      />

      {showPracticeBook && (
      <PracticeBookModal
        visible={showPracticeBook}
        onClose={() => {
          setActiveModal(null);
          if (loggingEnabled && featureStartRef.current?.name === "practice_note") {
            const dur = Math.round((Date.now() - featureStartRef.current.start) / 1000);
            if (dur >= 2) addActivityLog({ type: "feature_usage", data: { feature: "practice_note", duration: dur } });
            featureStartRef.current = null;
          }
        }}
        onLoad={handleLoadPracticeEntry}
        onSetGoal={handleSetPracticeNoteGoal}
        currentConfig={currentBarConfig}
        username={username}
        onOpenScore={(scoreId) => {
          setActiveModal(null);
          import("@/lib/score-storage").then(({ loadScore }) => {
            loadScore(scoreId).then((scoreDoc) => {
              if (scoreDoc) {
                setScoreEditorDoc(scoreDoc);
                setScoreMode("editor");
              }
            });
          });
        }}
        onStemSep={(uri, name) => {
          setActiveModal(null);
          setStemSepInitUri(uri);
          setStemSepInitName(name);
          setTimeout(() => openExclusive("stemSep"), 50);
        }}
      />
      )}

      {showOnboarding && (
      <OnboardingModal
        visible={showOnboarding}
        onComplete={handleOnboardingComplete}
      />
      )}

      <Animated.View
        pointerEvents="none"
        style={[{
          position: "absolute",
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: C.danger,
          zIndex: 9998,
        }, fullScreenResetFlashStyle]}
      />

      {showReboot && (
        <View style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "#0D1117",
          justifyContent: "center",
          alignItems: "center",
          zIndex: 9999,
        }}>
          <Ionicons name="refresh" size={S.ms(36, 0.4)} color="#D4A846" />
          <Text style={{
            color: "#8B949E",
            fontSize: 14,
            marginTop: 12,
            fontFamily: "SpaceGrotesk_400Regular",
          }}>{t("main", "rebooting")}</Text>
        </View>
      )}

      {showWorkUp && (
      <WorkUpOverviewModal
        visible={showWorkUp}
        onClose={() => setActiveModal(null)}
        loggingEnabled={loggingEnabled}
        roomTrackingActive={roomTrackingActive}
        trackingRoomName={trackingRoomName}
        onStartRoomTracking={startRoomTracking}
        onStopRoomTracking={stopRoomTracking}
        username={username}
      />
      )}

      {showSettings && (
      <SettingsModal
        visible={showSettings}
        onClose={() => setActiveModal(null)}
        volume={volume}
        onVolumeChange={updateVolume}
        sampleVolume={sampleVolume}
        onSampleVolumeChange={updateSampleVolume}
        backgroundPlay={backgroundPlay}
        onBackgroundPlayChange={updateBackgroundPlay}
        autoResumeAfterInterruption={autoResumeAfterInterruption}
        onAutoResumeAfterInterruptionChange={updateAutoResumeAfterInterruption}
        soundSet={soundSet}
        onSoundSetChange={updateSoundSet}
        layerSoundSets={layerSoundSets}
        onLayerSoundSetsChange={(val) => {
          for (const ss of Object.values(val)) {
            delete clickPCMCacheRef.current[ss];
          }
          setLayerSoundSets(val);
          layerSoundSetsRef.current = val;
          persistSettings({ layerSoundSets: val });
          scheduleReRender();
        }}
        flashMode={flashMode}
        onFlashModeChange={updateFlashMode}
        hapticMode={hapticMode}
        onHapticModeChange={updateHapticMode}
        audioOffsetMs={audioOffsetMs}
        onAudioOffsetChange={updateAudioOffset}
        timerStopMode={timerStopMode}
        onTimerStopModeChange={updateTimerStopMode}
        loggingEnabled={loggingEnabled}
        onLoggingEnabledChange={(val) => {
          setLoggingEnabled(val);
          saveLoggingEnabled(val);
        }}
        username={username}
        onUsernameChange={updateUsername}
        roomTrackingActive={roomTrackingActive}
        trackingRoomName={trackingRoomName}
        onStartRoomTracking={startRoomTracking}
        onStopRoomTracking={stopRoomTracking}
        onResetApp={handleResetApp}
        customSoundSets={customSoundSets}
        onCustomSoundSetsChange={(configs) => {
          setCustomSoundSets(configs);
          for (const key of Object.keys(clickPCMCacheRef.current)) {
            if (key.startsWith("custom")) delete clickPCMCacheRef.current[key];
          }
        }}
        landscapeReversed={landscapeReversed}
        onLandscapeReversedChange={(val) => {
          setLandscapeReversed(val);
          persistSettings({ landscapeReversed: val });
        }}
        showLandscapeImage={showLandscapeImage}
        onShowLandscapeImageChange={(val) => {
          setShowLandscapeImage(val);
          persistSettings({ showLandscapeImage: val });
        }}
        beatDirection={beatDirection}
        onBeatDirectionChange={(val) => {
          setBeatDirection(val);
          persistSettings({ beatDirection: val });
        }}
        barMetronomeChannel={barMetronomeChannel}
        onBarMetronomeChannelChange={(val) => {
          setBarMetronomeChannel(val);
          barMetronomeChannelRef.current = val;
          persistSettings({ barMetronomeChannel: val });
          scheduleReRender();
        }}
        barCellOpacity={barCellOpacity}
        onBarCellOpacityChange={(val) => {
          setBarCellOpacity(val);
          persistSettings({ barCellOpacity: val });
        }}
        barRowHeight={barRowHeight}
        onBarRowHeightChange={(val) => {
          setBarRowHeight(val);
          persistSettings({ barRowHeight: val });
        }}
        onEnterNoteMode={handleEnterNoteMode}
        onShowOnboarding={() => openExclusive("onboarding")}
        keyBindings={keyBindings}
        onKeyBindingsChange={(kb) => {
          setKeyBindings(kb);
          keyBindingsRef.current = kb;
        }}
      />
      )}

      {!showMenu && !showSignalGen && !showPracticeBook && !showWorkUp && !showSettings && !noteMode && (
        <GoalCompletePopup
          popups={completedGoalPopups}
          topOffset={(insets.top || webTopInset) + 8}
          onDismiss={dismissGoalPopup}
        />
      )}

      <View
        style={[
          isLandscape
            ? styles.contentLandscape
            : barMode
              ? styles.contentBarMode
              : styles.content,
          {
            paddingTop: noteMode
              ? (isLandscape ? (insets.top || 8) : (insets.top || webTopInset) + 4)
              : (insets.top || webTopInset) + (isLandscape ? 8 : 12),
            paddingBottom: noteMode
              ? (isLandscape ? (insets.bottom || 4) : (insets.bottom || webBottomInset) + 4)
              : (insets.bottom || webBottomInset) + (isLandscape ? 8 : 12),
          },
          isLandscape && noteMode && { paddingHorizontal: Spacing.sm },
          noteMode && { justifyContent: "flex-start" as const },
          S.contentMaxWidth != null && { maxWidth: S.contentMaxWidth, alignSelf: "center" as const, width: "100%" as const },
        ]}
      >
        {noteMode ? (
          <NoteModeView
            queue={noteQueue}
            barEntries={noteBarEntries}
            playMode={notePlayMode}
            currentIndex={noteCurrentIndex}
            isPlaying={noteIsPlaying}
            playingBarIdx={noteMeasureCount}
            onAddToQueue={handleNoteAddToQueue}
            onRemoveFromQueue={handleNoteRemoveFromQueue}
            onReorderQueue={handleNoteReorderQueue}
            onInsertNext={handleNoteInsertNext}
            onPlayModeChange={setNotePlayMode}
            onTogglePlay={handleNoteTogglePlay}
            onManualNext={handleNoteManualNext}
            onManualNextImmediate={handleNoteManualNextImmediate}
            quickAddList={quickAddList}
            onQuickAddListChange={handleQuickAddListChange}
            onSave={handleNoteSave}
            onReset={handleNoteReset}
            onExitNoteMode={handleExitNoteMode}
            onQueueItemImageChange={handleNoteQueueItemImageChange}
            padMapping={controlPadMapping}
            onPadMappingChange={handleControlPadMappingChange}
          />
        ) : (
        <>
        <View style={
          isLandscape && !barMode
            ? { flexDirection: landscapeReversed ? "row-reverse" as const : "row" as const, flex: 1 }
            : { flex: 1 }
        }>
        <View style={
          isLandscape
            ? barMode
              ? { flex: 1, justifyContent: "flex-start" as const, alignItems: "stretch" as const }
              : { flex: 5, justifyContent: "center" as const, alignItems: "center" as const }
            : barMode
              ? { flex: 5, justifyContent: "flex-start" as const, alignItems: "stretch" as const }
              : { flex: 5, justifyContent: "center" as const, alignItems: "center" as const }
        }>
          <BeatIndicator
            beatsPerMeasure={beatsPerMeasure}
            currentBeat={currentBeat}
            isPlaying={isPlaying}
            isPreparing={isPreparing}
            onBeatsChange={updateTimeSignature}
            onTogglePlay={togglePlayPause}
            beatTypes={beatTypes}
            onBeatTypeChange={handleBeatTypeChange}
            dropTargetBeat={dropTargetBeat}
            beatSubdivisionCounts={beatSubdivisionCounts}
            dialRef={dialRef}
            barMode={barMode}
            onBarModeChange={handleBarModeChange}
            beatSubdivisions={beatSubdivisions}
            onBeatSubdivisionChange={handleBeatSubdivisionChange}
            activeSubNote={activeSubNote}
            barAreaRef={barAreaRef}
            barRepeats={barRepeats}
            onBarRepeatChange={handleBarRepeatChange}
            loopBlocks={loopBlocks}
            onLoopBlocksChange={handleLoopBlocksChange}
            barLoopMode={barLoopMode}
            onBarLoopModeChange={setBarLoopMode}
            blockPlayMode={blockPlayMode}
            onBlockPlayModeChange={setBlockPlayMode}
            onBarScrollOffset={(offset) => { barScrollOffsetRef.current = offset; }}
            noteSamples={noteSamples}
            noteSampleNames={noteSampleNames}
            noteSampleSources={noteSampleSources}
            onNoteRecordRequest={handleNoteRecordRequest}
            bpm={bpm}
            barStartBeat={barStartBeat}
            onBarStartBeatSelect={setBarStartBeat}
            progressInfo={progressInfo}
            layerProgressMap={layerProgressMap}
            measureCount={measureCount}
            onBarReset={handleBarReset}
            onBarQuickSave={handleBarQuickSave}
            onResetFlash={handleResetFlash}
            halfTime={halfTime}
            beatDenominator={beatDenominator}
            onDenominatorCycle={handleBeatDenominatorCycle}
            isLandscape={isLandscape}
            beatDirection={beatDirection}
            subdivisionBarElement={barMode ? (
              <SubdivisionBar
                pattern={subdivisionPattern}
                onPatternChange={handlePatternChange}
                onDragStart={handleDragStart}
                onDragMove={handleDragMove}
                onDragEnd={handleDragEnd}
                onReset={handleReset}
                isPlaying={isPlaying}
                activeSubNote={activeSubNote}
                activeBeatPattern={isPlaying && currentBeat >= 0 ? (beatSubdivisions[String(currentBeat)] || null) : null}
              />
            ) : undefined}
            bpmSliderElement={!barMode && isLandscape ? (
              easterEggActive ? (
                <EasterEggQuiz
                  onGuess={handleEasterEggGuess}
                  revealBpm={easterEggRevealBpm}
                  isGiveUp={easterEggGiveUpMode}
                  shakeCount={easterEggShakeCount}
                  successCount={easterEggSuccessCount}
                  hintDirection={easterEggHintDirection}
                  isLandscape={true}
                  applyBpmSelected={easterEggApplyBpm}
                  onToggleApplyBpm={handleEasterEggToggleApplyBpm}
                />
              ) : (
                <BpmSlider
                  bpm={bpm}
                  onBpmChange={updateBpm}
                  onTapTempo={handleTapTempo}
                  onDenominatorCycle={handleBeatDenominatorCycle}
                  isLandscape={true}
                />
              )
            ) : undefined}
            onEnterNoteMode={handleEnterNoteMode}
            onAddBar={handleAddBar}
            onDeleteBar={handleDeleteBar}
            onCopyBar={handleCopyBar}
            onReorderBar={handleReorderBar}
            onInsertBarAfter={handleInsertBarAfter}
            tempoLabel={tempoLabel}
            soundSet={soundSet}
            onSoundSetChange={(ss) => updateSoundSet(ss as SoundSet)}
            onPreviewSoundSet={previewSoundSet}
            layerSoundSets={layerSoundSets as Record<number, string>}
            onLayerSoundSetsChange={(val) => {
              const typed = val as Record<number, SoundSet>;
              for (const ss of Object.values(typed)) {
                delete clickPCMCacheRef.current[ss];
              }
              setLayerSoundSets(typed);
              layerSoundSetsRef.current = typed;
              persistSettings({ layerSoundSets: typed });
              scheduleReRender();
            }}
            customSoundSets={customSoundSets}
            onCustomSoundSetsChange={(configs) => {
              setCustomSoundSets(configs);
              for (const key of Object.keys(clickPCMCacheRef.current)) {
                if (key.startsWith("custom")) delete clickPCMCacheRef.current[key];
              }
            }}
            barCellOpacity={barCellOpacity}
            barRowHeight={barRowHeight}
            onEasterEggTrigger={handleEasterEggTrigger}
          />
        </View>

        {!isLandscape && !barMode && (windowHeight > 600 || S.isTablet) && (
          <Text style={[styles.beatHintText, { color: C.textTertiary, textAlign: "center" }]}>{t("main", "beatHint")}</Text>
        )}

        {!isLandscape && !barMode && (
          <View style={{ alignItems: "center", gap: S.ms(6, 0.3) }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: S.ms(24, 0.4) }}>
              <Pressable
                onPress={handleEnterNoteMode}
                style={styles.modeHandle}
                testID="open-note-mode"
                hitSlop={{ top: 10, bottom: 10, left: 20, right: 20 }}
                accessibilityRole="button"
                accessibilityLabel={t("a11y", "openNoteMode")}
              >
                <Ionicons name="musical-notes-outline" size={S.ms(18, 0.5)} color={C.textTertiary} />
              </Pressable>
              <Pressable
                onPress={() => handleBarModeChange(true)}
                style={styles.modeHandle}
                testID="open-bar-mode"
                hitSlop={{ top: 10, bottom: 10, left: 20, right: 20 }}
                accessibilityRole="button"
                accessibilityLabel={t("a11y", "openBarMode")}
              >
                <Ionicons name="reorder-three" size={S.ms(22, 0.5)} color={C.textTertiary} />
              </Pressable>
            </View>
            <SubdivisionBar
              pattern={subdivisionPattern}
              onPatternChange={handlePatternChange}
              onDragStart={handleDragStart}
              onDragMove={handleDragMove}
              onDragEnd={handleDragEnd}
              onReset={handleReset}
              isPlaying={isPlaying}
              activeSubNote={activeSubNote}
              activeBeatPattern={isPlaying && currentBeat >= 0 ? (beatSubdivisions[String(currentBeat)] || null) : null}
            />
            {showSubdivisionLongPressHint && (
              <Pressable
                onPress={() => {
                  setShowSubdivisionLongPressHint(false);
                  AsyncStorage.setItem("metronome_subdivision_longpress_hint_v1", "1");
                }}
                hitSlop={{ top: 6, bottom: 6, left: 16, right: 16 }}
              >
                <Text style={[styles.beatHintText, { color: C.textTertiary, textAlign: "center" }]}>
                  {t("main", "subdivisionLongPressHint")}
                </Text>
              </Pressable>
            )}
            <Text style={[styles.tempoLabel, { color: C.accentMuted }]}>{tempoLabel}</Text>
          </View>
        )}
        {isLandscape && !barMode && (
          <View style={[{ flex: 3, justifyContent: "center" as const, alignItems: "center" as const, gap: 6 }, S.isTablet && { maxWidth: Math.min(windowWidth * 0.38, 420) }]}>
            {!noteMode && (
              <>
                {showLandscapeImage && (
                  <View style={{ width: "100%" as any, flex: 0.8, minHeight: 48 }}>
                    <View
                      style={{
                        position: "absolute" as const,
                        top: 4,
                        right: 4,
                        zIndex: 10,
                        flexDirection: "row" as const,
                        backgroundColor: "rgba(0,0,0,0.55)",
                        borderRadius: 999,
                        padding: Spacing.xxs,
                        gap: Spacing.xxs,
                      }}
                    >
                      <Pressable
                        onPress={() => {
                          setLandscapeContentType("photo");
                          persistSettings({ landscapeContentType: "photo" });
                        }}
                        hitSlop={6}
                        style={{
                          paddingHorizontal: Spacing.sm,
                          paddingVertical: Spacing.xs,
                          borderRadius: 999,
                          backgroundColor: landscapeContentType === "photo" ? C.accent : "transparent",
                          alignItems: "center" as const,
                          justifyContent: "center" as const,
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={t("a11y", "landscapePhotoMode")}
                        accessibilityState={{ selected: landscapeContentType === "photo" }}
                      >
                        <Ionicons
                          name="image-outline"
                          size={S.ms(14, 0.3)}
                          color={landscapeContentType === "photo" ? C.background : C.textSecondary}
                        />
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          setLandscapeContentType("stats");
                          persistSettings({ landscapeContentType: "stats" });
                        }}
                        hitSlop={6}
                        style={{
                          paddingHorizontal: Spacing.sm,
                          paddingVertical: Spacing.xs,
                          borderRadius: 999,
                          backgroundColor: landscapeContentType === "stats" ? C.accent : "transparent",
                          alignItems: "center" as const,
                          justifyContent: "center" as const,
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={t("a11y", "landscapeStatsMode")}
                        accessibilityState={{ selected: landscapeContentType === "stats" }}
                      >
                        <Ionicons
                          name="stats-chart"
                          size={S.ms(14, 0.3)}
                          color={landscapeContentType === "stats" ? C.background : C.textSecondary}
                        />
                      </Pressable>
                    </View>
                    {landscapeContentType === "photo" ? (
                      <Pressable
                        onPress={() => setLandscapeImageModalVisible(true)}
                        style={{ flex: 1, borderRadius: 10, overflow: "hidden" as const, alignItems: "center" as const, justifyContent: "center" as const, backgroundColor: landscapeImageUri ? "transparent" : C.surface, borderWidth: landscapeImageUri ? 0 : 1, borderColor: C.overlay10, borderStyle: "dashed" as const }}
                        accessibilityRole="button"
                        accessibilityLabel={t("a11y", "landscapeImagePicker")}
                      >
                        {landscapeImageUri ? (
                          <Image source={{ uri: landscapeImageUri }} style={{ width: "100%" as any, height: "100%" as any, borderRadius: 10 }} resizeMode="cover" />
                        ) : (
                          <Ionicons name="image-outline" size={S.ms(24, 0.4)} color={C.textTertiary} />
                        )}
                      </Pressable>
                    ) : (
                      <View style={{ flex: 1, borderRadius: 10, overflow: "hidden" as const, backgroundColor: C.surface, borderWidth: 1, borderColor: C.overlay10, padding: 10, justifyContent: "center" as const }}>
                        {!loggingEnabled ? (
                          <Text style={{ color: C.textTertiary, fontSize: S.ms(11, 0.3), textAlign: "center" as const, fontFamily: "Inter_500Medium" }}>
                            {t("settings", "statsNoLogs")}
                          </Text>
                        ) : landscapeStats.todayTotal === 0 && landscapeStats.weekTotal === 0 ? (
                          <Text style={{ color: C.textTertiary, fontSize: S.ms(11, 0.3), textAlign: "center" as const, fontFamily: "Inter_500Medium" }}>
                            {t("settings", "statsEmpty")}
                          </Text>
                        ) : (
                          <View style={{ gap: 6 }}>
                            <View style={{ flexDirection: "row" as const, justifyContent: "space-between" as const, alignItems: "baseline" as const }}>
                              <Text style={{ color: C.textSecondary, fontSize: S.ms(10, 0.25), fontFamily: "Inter_500Medium", textTransform: "uppercase" as const, letterSpacing: 0.5 }}>
                                {t("settings", "statsTodayPractice")}
                              </Text>
                              <Text style={{ color: C.accent, fontSize: S.ms(20, 0.4), fontFamily: "SpaceGrotesk_700Bold" }}>
                                {formatStatMinutes(landscapeStats.todayTotal)}
                              </Text>
                            </View>
                            <View style={{ flexDirection: "row" as const, gap: Spacing.sm }}>
                              <View style={{ flex: 1, flexDirection: "row" as const, justifyContent: "space-between" as const, paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs, backgroundColor: C.overlay10, borderRadius: Radius.sm }}>
                                <Text style={{ color: C.textSecondary, fontSize: S.ms(10, 0.25), fontFamily: "Inter_500Medium" }}>{t("settings", "statsBeat")}</Text>
                                <Text style={{ color: C.text, fontSize: S.ms(11, 0.3), fontFamily: "SpaceGrotesk_500Medium" }}>{formatStatMinutes(landscapeStats.todayBeat)}</Text>
                              </View>
                              <View style={{ flex: 1, flexDirection: "row" as const, justifyContent: "space-between" as const, paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs, backgroundColor: C.overlay10, borderRadius: Radius.sm }}>
                                <Text style={{ color: C.textSecondary, fontSize: S.ms(10, 0.25), fontFamily: "Inter_500Medium" }}>{t("settings", "statsBar")}</Text>
                                <Text style={{ color: C.text, fontSize: S.ms(11, 0.3), fontFamily: "SpaceGrotesk_500Medium" }}>{formatStatMinutes(landscapeStats.todayBar)}</Text>
                              </View>
                            </View>
                            <View style={{ flexDirection: "row" as const, justifyContent: "space-between" as const, alignItems: "center" as const, paddingTop: Spacing.xs, borderTopWidth: 1, borderTopColor: C.overlay10 }}>
                              <Text style={{ color: C.textSecondary, fontSize: S.ms(10, 0.25), fontFamily: "Inter_500Medium", textTransform: "uppercase" as const, letterSpacing: 0.5 }}>
                                {t("settings", "statsWeekPractice")}
                              </Text>
                              <Text style={{ color: C.text, fontSize: S.ms(13, 0.3), fontFamily: "SpaceGrotesk_600SemiBold" }}>
                                {formatStatMinutes(landscapeStats.weekTotal)}
                              </Text>
                            </View>
                            <View style={{ marginTop: Spacing.xs }}>
                              <PracticeStatsGraph
                                logs={landscapeStatsLogs}
                                accentColor={C.accent}
                                borderColor={C.overlay10}
                                textColor={C.text}
                                textSecondary={C.textSecondary}
                                width={S.ms(240, 0.4)}
                                height={S.ms(60, 0.3)}
                                days={7}
                                lang={language}
                              />
                            </View>
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                )}
                <StopwatchTimer
                  ref={stopwatchTimerLandscapeRef}
                  onTimerExpired={handleTimerExpired}
                  onStopRequested={handleTimerExpired}
                  onStartMetronome={startMetronome}
                  isMetronomePlaying={isPlaying}
                  currentBeat={currentBeat}
                  topInset={insets.top || webTopInset}
                  isLandscape={true}
                />
              </>
            )}
            <SubdivisionBar
              pattern={subdivisionPattern}
              onPatternChange={handlePatternChange}
              onDragStart={handleDragStart}
              onDragMove={handleDragMove}
              onDragEnd={handleDragEnd}
              onReset={handleReset}
              isPlaying={isPlaying}
              activeSubNote={activeSubNote}
              activeBeatPattern={isPlaying && currentBeat >= 0 ? (beatSubdivisions[String(currentBeat)] || null) : null}
            />
            {showSubdivisionLongPressHint && (
              <Pressable
                onPress={() => {
                  setShowSubdivisionLongPressHint(false);
                  AsyncStorage.setItem("metronome_subdivision_longpress_hint_v1", "1");
                }}
                hitSlop={{ top: 6, bottom: 6, left: 16, right: 16 }}
              >
                <Text style={[styles.beatHintText, { color: C.textTertiary, textAlign: "center" }]}>
                  {t("main", "subdivisionLongPressHint")}
                </Text>
              </Pressable>
            )}
            <Text style={[styles.tempoLabel, { color: C.accentMuted }]}>{tempoLabel}</Text>
            {easterEggActive ? (
              <EasterEggQuiz
                onGuess={handleEasterEggGuess}
                revealBpm={easterEggRevealBpm}
                isGiveUp={easterEggGiveUpMode}
                shakeCount={easterEggShakeCount}
                successCount={easterEggSuccessCount}
                hintDirection={easterEggHintDirection}
                isLandscape={true}
                applyBpmSelected={easterEggApplyBpm}
                onToggleApplyBpm={handleEasterEggToggleApplyBpm}
              />
            ) : (
              <BpmSlider
                bpm={bpm}
                onBpmChange={updateBpm}
                onTapTempo={handleTapTempo}
                onDenominatorCycle={handleBeatDenominatorCycle}
                isLandscape={true}
              />
            )}
          </View>
        )}
        {!isLandscape && !barMode && (
        <View style={[styles.bpmSection, { flex: 2 }]}>
          {easterEggActive ? (
            <EasterEggQuiz
              onGuess={handleEasterEggGuess}
              revealBpm={easterEggRevealBpm}
              isGiveUp={easterEggGiveUpMode}
              shakeCount={easterEggShakeCount}
              successCount={easterEggSuccessCount}
              hintDirection={easterEggHintDirection}
              isLandscape={false}
              applyBpmSelected={easterEggApplyBpm}
              onToggleApplyBpm={handleEasterEggToggleApplyBpm}
            />
          ) : (
            <BpmSlider
              bpm={bpm}
              onBpmChange={updateBpm}
              onTapTempo={handleTapTempo}
              onDenominatorCycle={handleBeatDenominatorCycle}
              isLandscape={false}
            />
          )}
        </View>
        )}
        </View>
        </>
        )}
      </View>

      {!barMode && !noteMode && !isLandscape && (
        <StopwatchTimer
          ref={stopwatchTimerRef}
          onTimerExpired={handleTimerExpired}
          onStopRequested={handleTimerExpired}
          onStartMetronome={startMetronome}
          isMetronomePlaying={isPlaying}
          currentBeat={currentBeat}
          topInset={insets.top || webTopInset}
        />
      )}

      {isDragging && !noteMode && (
        <DragGhost
          pattern={subdivisionPattern}
          x={dragPos.x}
          y={dragPos.y}
        />
      )}

      {Platform.OS === "web" && (
        <KeyboardShortcutsModal
          visible={showKbShortcuts}
          onClose={() => setShowKbShortcuts(false)}
          bindings={keyBindings}
        />
      )}

      {Platform.OS !== "web" && (
        <NativeKeyboardHintOverlay
          visible={showNativeKbHint}
          onClose={() => setShowNativeKbHint(false)}
          bindings={keyBindings}
        />
      )}

      <StageModeOverlay
        visible={stageModeActive}
        bpm={bpm}
        flashOpacity={flashOpacity}
        onExit={() => void exitStageMode()}
        onBpmChange={updateBpm}
      />
    </KbView>
  );
}

