import React, { useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  Platform,
  Pressable,
  Modal,
  TextInput,
  KeyboardAvoidingView,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import Animated from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { AnimatedModal } from "@/components/AnimatedModal";
import { BeatIndicator } from "@/components/BeatIndicator";
import { BpmSlider } from "@/components/BpmSlider";
import { EasterEggQuiz } from "@/components/EasterEggQuiz";
import { PitchQuizModal } from "@/components/PitchQuizModal";
import { SubdivisionBar, DragGhost } from "@/components/SubdivisionBar";
import { StopwatchTimer } from "@/components/StopwatchTimer";
import { SettingsModal, type SettingsScope } from "@/components/SettingsModal";
import { SignalGeneratorModal, TuningGuideModal } from "@/components/SignalGeneratorModal";
import { PracticeBookModal } from "@/components/PracticeBookModal";
import { WorkUpOverviewModal } from "@/components/WorkUpOverviewModal";
import PracticeStatsGraph from "@/components/PracticeStatsGraph";
import { StageModeOverlay } from "@/components/StageModeOverlay";
import { markAudioPlaying, markAudioStopped } from "@/lib/audio-lifecycle";
import { OnboardingModal } from "@/components/OnboardingModal";
import { ScoreListScreen } from "@/components/ScoreListScreen";
import { ScoreEditorScreen } from "@/components/ScoreEditorScreen";
import { ModeSwitcherDial } from "@/components/ModeSwitcherDial";
import type { ModeSwitcherDialHandle } from "@/components/ModeSwitcherDial";
import type { ModeSlot } from "@/components/ModeSwitcherDial";
import { ModeIcon } from "@/components/ModeIcon";
import { MenuScreen } from "@/components/MenuScreen";
import { BpmDetectModal } from "@/components/BpmDetectModal";
import { PolygonModeView } from "@/components/PolygonModeView";
import { usePolygonMode } from "@/hooks/usePolygonMode";
import { DrumKitModal } from "@/components/DrumKitModal";
import { ScheduledStartModal } from "@/components/ScheduledStartModal";
import { FadeOutModal } from "@/components/FadeOutModal";
import { GoalCompletePopup } from "@/components/GoalCompletePopup";
import { NoteRecorderModal } from "@/components/NoteRecorderModal";
import { NoteModeView } from "@/components/NoteModeView";
import { KeyboardShortcutsModal } from "@/components/KeyboardShortcutsModal";
import { NativeKeyboardHintOverlay } from "@/components/NativeKeyboardHintOverlay";
import {
  openTuningGuideFromSignalGen,
  closeTuningGuide,
  type SgTgState,
} from "@/lib/modal-routing";
import { loadPracticeBook, type FadeOutSettings, type SoundSet } from "@/lib/storage";
import { applyEntryToEngine as applyEntryToEngineCore } from "@/app/index.helpers";
import { Radius, Spacing, FontSize } from "@/constants/tokens";
import { showPlayingNotification } from "@/lib/notification-controls";
import { addActivityLog, saveLoggingEnabled } from "@/lib/activity-log";
import { hasNoteSample } from "@/lib/note-samples";
import { combinePersisterStatuses, getPersistFailureBannerKey } from "@/lib/persist-status";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { useMetronomeScreen } from "@/hooks/useMetronomeScreen";
import { onAccentColor } from "@/lib/color-contrast";
import { appendRapidTap, isChordEasterEggTitle, type PitchQuizMode } from "@/lib/pitch-quiz";
import { stopAllScoreNotes } from "@/lib/score-audio";
import * as Haptics from "expo-haptics";
import { useEasterEggGesture } from "@/hooks/useEasterEggGesture";
import { usesSharedEasterEggGesture } from "@/lib/easter-egg-gesture";
import { saveModeKeyBindings } from "@/lib/keyboard-bindings";

type Props = ReturnType<typeof useMetronomeScreen>;

export function MetronomeScreenUI(props: Props) {
  const modeSwitcherDialRef = useRef<ModeSwitcherDialHandle>(null);

  const {
    styles, C, S, t, themeMode, language, insets, webTopInset, webBottomInset,
    isLandscape, windowWidth,
    rootViewRef, barAreaRef, dialRef, stopwatchTimerRef, stopwatchTimerLandscapeRef,
    barScrollOffsetRef, engineRef, togglePlayPauseRef, updateBpmRef, beatDenominatorRef,
    seamlessNextEntryRef, tuningGuideOnSelectRef, reopenSignalGenAfterTuningGuideRef,
    settingsReturnModalRef, featureStartRef, practiceStartRef, discardPracticeSession, startOrResumePracticeSession,
    handleNoteTogglePlayRef, clickPCMCacheRef,
    bpm, beatsPerMeasure, beatDenominator, beatTypes, subdivisionPattern, beatSubdivisions,
    isPlaying, isPreparing, audioLifecycle, retryAudioRecovery, currentBeat, measureCount, activeSubNote, progressInfo,
    layerProgressMap, halfTime,
    togglePlayPause, updateBpm, updateTimeSignature, handleBeatTypeChange,
    handleBeatSubdivisionChange, handleBeatDenominatorCycle, handleTapTempo,
    handleReset, startMetronome, handleTimerExpired,
    beatSubdivisionCounts, beatDirection, setBeatDirection,
    isDragging, dragPos, dragPattern, dropTargetBeat,
    handleDragCancel,
    handlePatternChange, handleDragStart, handleDragMove, handleDragEnd,
    showSubdivisionLongPressHint, setShowSubdivisionLongPressHint,
    activeModal, setActiveModal, openExclusive,
    markMenuItemReturn, clearMenuItemReturn, closeMenuItem, closeScoreMode,
    showSettings, showMenu, showSignalGen, showTuningGuide, showPracticeBook,
    showWorkUp, showOnboarding, showDrumKit, showScheduledStart,
    showFadeOut, showBpmDetect, showPolygon,
    volume, updateVolume, sampleVolume, updateSampleVolume,
    backgroundPlay, updateBackgroundPlay,
    autoResumeAfterInterruption, updateAutoResumeAfterInterruption,
    soundSet, updateSoundSet, previewSoundSet,
    layerSoundSets, setLayerSoundSets, layerSoundSetsRef,
    customSoundSets, setCustomSoundSets,
    flashMode, updateFlashMode, hapticMode, updateHapticMode,
    audioOffsetMs, updateAudioOffset, timerStopMode, updateTimerStopMode,
    loggingEnabled, setLoggingEnabled, username, updateUsername,
    roomTrackingActive, trackingRoomName, startRoomTracking, stopRoomTracking, discardRoomTracking,
    handleResetApp, handleOnboardingComplete,
    keyBindings, setKeyBindings, keyBindingsRef,
    showKbShortcuts, setShowKbShortcuts,
    showNativeKbHint, setShowNativeKbHint,
    showReboot, permissionRecoveryToast,
    easterEggActive, easterEggRevealBpm, easterEggGiveUpMode,
    easterEggShakeCount, easterEggSuccessCount, easterEggHintDirection, easterEggApplyBpm,
    handleEasterEggGuess, handleEasterEggToggleApplyBpm, handleEasterEggTrigger,
    handleEasterEggGiveUpRef,
    barMode, barBpm, setBarBpm, barBpmRef, handleBarBpmChange, handleBarModeChange, barLoopMode, setBarLoopMode,
     blockPlayMode, setBlockPlayMode, handleRandomBarPlay,
     randomBarSession, randomBarConfig, onRandomBarConfigChange, onRandomViewportCapacityChange,
    handleReplayRandomBarSession, handleSaveRandomBarSession, handleApplyRandomBarSession,
    handleReturnToOriginalBarList,
    barRepeats, loopBlocks,
    barStartBeat, setBarStartBeat,
    handleBarRepeatChange, handleBarMeterChange, handleLoopBlocksChange,
    handleBarReset, handleBarQuickSave, handleResetFlash,
    handleAddBar, handleDeleteBar, handleCopyBar, handleReorderBar, handleInsertBarAfter,
    barCellOpacity, setBarCellOpacity, barRowHeight, setBarRowHeight,
    barMetronomeChannel, setBarMetronomeChannel, barMetronomeChannelRef,
    currentBarConfig,
    noteMode, handleEnterNoteMode, handleExitNoteMode,
    noteQueue, noteBarEntries, notePlayMode, noteCurrentIndex, noteIsPlaying, noteMeasureCount,
    setNotePlayMode,
    handleNoteAddToQueue, handleNoteRemoveFromQueue, handleNoteReorderQueue, handleNoteInsertNext,
    handleNoteTogglePlay, handleNoteManualNext, handleNoteManualNextImmediate,
    handleNoteSave, handleNoteReset, handleNoteQueueItemImageChange,
    noteSamples, noteSampleNames, noteSampleSources, noteSampleChannels, noteSampleVolumes, noteSampleSpeeds, noteSampleMetroChannels,
    recorderTarget, setRecorderTarget,
    handleNoteRecordRequest, handleNoteRecordSave, handleNoteRecordDelete, handleNoteRecordSuggestBpm,
    scoreMode, setScoreMode, scoreEditorDoc, setScoreEditorDoc, scorePracticeBookRef,
    handleLinkedEntryChange,
    handleLoadPracticeEntry, handleSetPracticeNoteGoal,
    stageModeActive, enterStageMode, exitStageMode,
    stagePracticeEntries, setStagePracticeEntries,
    activeStagePracticeEntryId, setActiveStagePracticeEntryId,
    fadeOutPhase, fadeOutStatusText,
    fadeOutSessionRef, fadeOutMutedRef, fadeOutMeasureCountRef,
    setFadeOutPhase, setFadeOutMeasureInPhase,
    getPlaybackContext,
    landscapeReversed, setLandscapeReversed,
    showLandscapeImage, setShowLandscapeImage, landscapeImageUri,
    landscapeImageModalVisible, setLandscapeImageModalVisible,
    landscapeContentType, setLandscapeContentType,
    landscapeStats, landscapeStatsLogs, formatStatMinutes,
    pickLandscapeImage, removeLandscapeImage,
    handleNativeKeyDown, handleNativeKeyUp,
    flashOpacity, beatProgress, flashStyle, halfTimeFlashStyle, modeSlideStyle, fullScreenResetFlashStyle,
    currentMode, cycleToNextMode, switchToMode,
    completedGoalPopups, dismissGoalPopup,
    getClickPCMs,
    polygonOnBeatRef,
    scheduleReRender, stopRenderedAudio, clearSamplePlayStates, resetPlaybackVisuals,
    notifyVoicePlayState, persistSettings, persistStatus, noteSamplePersistStatus,
    tempoLabel,
    // Additional state setters
    setIsPreparing, setIsPlaying,
    setBeatsPerMeasure, setBeatTypes, setBeatSubdivisions, setSubdivisionPattern,
    setFlashMode, setHapticMode,
    setBarMode, setBarRepeats, setLoopBlocks,
    // Refs for inline callbacks
    barModeRef, barConfigRef, dialConfigRef, barLoopModeRef, languageRef,
    // Window height
    windowHeight,
    // Beat mode quick save
    beatQuickSaveModalVisible,
    beatQuickSaveName,
    setBeatQuickSaveName,
    beatQuickSaveToast,
    handleBeatQuickSaveOpen,
    handleBeatQuickSaveCancel,
    handleBeatQuickSaveConfirm,
    allPlayersRef,
    volumeRef,
  } = props;

  const { nativeGestureHandlers: easterEggGestureHandlers } = useEasterEggGesture({
    enabled: !easterEggActive && usesSharedEasterEggGesture(currentMode, showPolygon),
    resetKey: currentMode,
    onTrigger: handleEasterEggTrigger,
  });
  const showSharedEasterEggQuiz = easterEggActive
    && usesSharedEasterEggGesture(currentMode, showPolygon);

  const saveFailureBannerKey = getPersistFailureBannerKey(
    combinePersisterStatuses(persistStatus, noteSamplePersistStatus),
  );
  const [pitchQuizVisible, setPitchQuizVisible] = useState(false);
  const [pitchQuizMode, setPitchQuizMode] = useState<PitchQuizMode | null>(null);
  const [settingsScope, setSettingsScope] = useState<SettingsScope>("global");
  const [stageOptionsRequest, setStageOptionsRequest] = useState(0);
  const rapidMicTapRef = useRef<number[]>([]);
  const pitchQuizEntryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPlaybackForPitchQuiz = useCallback(() => {
    const engine = engineRef.current;
    if (engine?.getIsRunning()) engine.stop();
    stopRenderedAudio();
    stopAllScoreNotes();
    clearSamplePlayStates();
    resetPlaybackVisuals();
    setIsPlaying(false);
    markAudioStopped();
  }, [engineRef, stopRenderedAudio, clearSamplePlayStates, resetPlaybackVisuals, setIsPlaying]);

  const enterPitchQuiz = useCallback((mode: PitchQuizMode | null) => {
    stopPlaybackForPitchQuiz();
    // SignalGenerator와 게임 오버레이가 겹치지 않도록 단일 모달 상태를 먼저 비운다.
    clearMenuItemReturn();
    setActiveModal(null);
    if (pitchQuizEntryTimerRef.current) clearTimeout(pitchQuizEntryTimerRef.current);
    setPitchQuizVisible(false);
    // AnimatedModal은 visible=false 뒤에도 150ms 동안 native Modal을 유지한다.
    // 두 native Modal이 동시에 존재하면 iOS에서 새 모달이 입력을 받지 못할 수
    // 있으므로, 이전 모달의 exit animation이 끝난 뒤에만 퀴즈를 연다.
    pitchQuizEntryTimerRef.current = setTimeout(() => {
      pitchQuizEntryTimerRef.current = null;
      setPitchQuizMode(mode);
      setPitchQuizVisible(true);
    }, 180);
    if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [stopPlaybackForPitchQuiz, clearMenuItemReturn, setActiveModal]);

  const handleSignalMicTap = useCallback(() => {
    rapidMicTapRef.current = appendRapidTap(rapidMicTapRef.current, Date.now());
    if (rapidMicTapRef.current.length < 14) return false;
    rapidMicTapRef.current = [];
    enterPitchQuiz(null);
    return true;
  }, [enterPitchQuiz]);

  const handleScoreTitleSubmit = useCallback((title: string) => {
    if (!isChordEasterEggTitle(title)) return false;
    setScoreMode(null);
    enterPitchQuiz("chord");
    return true;
  }, [enterPitchQuiz, setScoreMode]);

  const openMenuItem = (open: () => void) => {
    markMenuItemReturn();
    open();
  };

  const openScopedSettings = useCallback((scope: SettingsScope) => {
    settingsReturnModalRef.current = null;
    setSettingsScope(scope);
    openExclusive("settings");
  }, [openExclusive, settingsReturnModalRef]);

  const openStageOptions = useCallback(() => {
    setStageOptionsRequest((request) => request + 1);
    setActiveModal(null);
  }, [setActiveModal]);

  const openModeDial = () => {
    // 사용자가 다이얼에서 새 모드를 고르면 메뉴 복귀 흐름을 벗어난다.
    clearMenuItemReturn();
    modeSwitcherDialRef.current?.open();
  };

  // ── 폴리곤 메트로놈 상태 ──────────────────────────────────────────────────
  const polygonMode = usePolygonMode({
    enabled: showPolygon,
    isPlaying,
    engineBeatCallbackRef: polygonOnBeatRef,
    bpm,
    beatsPerMeasure,
    allPlayersRef,
    clickPCMCacheRef,
    volumeRef,
    getClickPCMs,
  });

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
      {...easterEggGestureHandlers}
    >
      <StatusBar style={themeMode === "day" ? "dark" : "light"} />

      {saveFailureBannerKey ? (
        <View
          pointerEvents="none"
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          testID="storage-save-status"
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
            borderColor: C.accent,
            alignItems: "center",
          }}
        >
          <Text style={{ color: C.text, fontSize: 14, fontWeight: "500" as const, textAlign: "center" }}>
            {t("storage", saveFailureBannerKey)}
          </Text>
        </View>
      ) : null}

      {/* ── 악보 모드 전체화면 오버레이 ── */}
      {scoreMode === "list" && (
        <Animated.View style={[StyleSheet.absoluteFillObject, { zIndex: 500, backgroundColor: C.background }, modeSlideStyle]}>
          <ScoreListScreen
            defaultBpm={bpm}
            onClose={closeScoreMode}
            onTitleSubmit={handleScoreTitleSubmit}
            onOpenEditor={(doc) => {
              setScoreEditorDoc(doc);
              setScoreMode("editor");
            }}
          />
        </Animated.View>
      )}
      {scoreMode === "editor" && scoreEditorDoc && (
        <Animated.View style={[StyleSheet.absoluteFillObject, { zIndex: 500, backgroundColor: C.background }, modeSlideStyle]}>
          <ScoreEditorScreen
            doc={scoreEditorDoc}
            onBack={() => setScoreMode("list")}
            onClose={closeScoreMode}
            onSaved={(updatedDoc) => {
              setScoreEditorDoc(updatedDoc);
              // 연습장 캐시 무효화 (저장된 연결 항목 반영)
              scorePracticeBookRef.current = [];
            }}
            onLinkedEntryChange={handleLinkedEntryChange}
          />
        </Animated.View>
      )}
      {permissionRecoveryToast ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: insets.top + (saveFailureBannerKey ? 60 : 12),
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
      {audioLifecycle.phase !== "idle" && audioLifecycle.phase !== "playing" ? (
        <View
          pointerEvents={audioLifecycle.phase === "recoveryFailed" ? "auto" : "none"}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          testID="audio-lifecycle-status"
          style={{
            position: "absolute",
            top: insets.top + (saveFailureBannerKey ? 60 : 12),
            left: 16,
            right: 16,
            zIndex: 10000,
            backgroundColor: audioLifecycle.phase === "recoveryFailed" ? C.accent : C.surface,
            borderRadius: 12,
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderWidth: 1,
            borderColor: C.border,
            alignItems: "center",
            gap: 6,
          }}
        >
          <Text style={{ color: audioLifecycle.phase === "recoveryFailed" ? onAccentColor(C.accent) : C.text, fontSize: 14, fontWeight: "600" as const }}>
            {t("main", `audioStatus${audioLifecycle.phase[0].toUpperCase()}${audioLifecycle.phase.slice(1)}` as any)}
          </Text>
          {audioLifecycle.phase === "recoveryFailed" ? (
            <Pressable
              onPress={() => void retryAudioRecovery()}
              accessibilityRole="button"
              accessibilityLabel={t("main", "audioRecoveryRetry")}
              testID="audio-recovery-retry"
              style={{ backgroundColor: C.surface, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 }}
            >
              <Text style={{ color: C.text, fontWeight: "700" as const }}>{t("main", "audioRecoveryRetry")}</Text>
            </Pressable>
          ) : null}
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
          <Text style={{ color: fadeOutPhase === "muted" ? "#fff" : onAccentColor(C.accent), fontFamily: "SpaceGrotesk_600SemiBold", fontSize: FontSize.small }}>
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
          color: onAccentColor(C.accent),
          letterSpacing: 4,
        }}>
          {beatsPerMeasure}/{beatDenominator}
        </Text>
      </Animated.View>

      {/* 상단 중앙 고정 모드 레이블 — 탭하면 팬 다이얼 열기 (무대·악보·메뉴·연습장 중 숨김, 해당 화면 헤더에 자체 트리거 있음) */}
      {!stageModeActive && scoreMode === null && !showMenu && !showPracticeBook && !showPolygon && (
        <Pressable
          onPress={openModeDial}
          style={{
            position: "absolute",
            top: (insets.top || webTopInset) + 2,
            alignSelf: "center" as const,
            zIndex: 99999,
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderRadius: 28,
            flexDirection: "row" as const,
            alignItems: "center" as const,
            gap: 8,
          }}
          accessibilityRole="button"
          accessibilityLabel={t("switcher", "openDial")}
          testID="mode-cycle-label"
        >
          <ModeIcon
            mode={currentMode as ModeSlot}
            size={S.ms(20, 0.4)}
            color={C.accent}
          />
          <Text
            style={{
              fontFamily: "SpaceGrotesk_700Bold",
              fontSize: S.ms(18, 0.4),
              color: C.accent,
              letterSpacing: 1.2,
              textTransform: "uppercase" as const,
            }}
          >
            {t("switcher", currentMode as "beat" | "bar" | "score" | "note" | "practice" | "stage")}
          </Text>
        </Pressable>
      )}

      {/* 모드 다이얼 — D-탭 없이 텍스트 레이블이 트리거 */}
      {scoreMode === null && (
        <ModeSwitcherDial
          ref={modeSwitcherDialRef}
          currentMode={currentMode}
          onSelectMode={switchToMode}
          topInset={insets.top || webTopInset}
          isLandscape={isLandscape}
          isPlaying={isPlaying}
          hideHandle
        />
      )}


      {showMenu && (
        <Animated.View style={[StyleSheet.absoluteFillObject, { zIndex: 400 }, modeSlideStyle]}>
          <MenuScreen
            topInset={insets.top || webTopInset}
            onOpenDial={openModeDial}
            onClose={() => {
              clearMenuItemReturn();
              setActiveModal(null);
            }}
            onSettings={() => {
              settingsReturnModalRef.current = "menu";
              setSettingsScope("global");
              openExclusive("settings");
            }}
            onSignalGen={() => {
              openMenuItem(() => {
                if (loggingEnabled) featureStartRef.current = { name: "signal_generator", start: Date.now() };
                openExclusive("signalGen");
              });
            }}
            onWorkUp={() => openMenuItem(() => openExclusive("workUp"))}
            onScore={() => {
              openMenuItem(() => {
                setActiveModal(null);
                setScoreMode("list");
              });
            }}
            onPolygon={() => {
              openMenuItem(() => openExclusive("polygon"));
            }}
          />
        </Animated.View>
      )}

      <DrumKitModal
        visible={showDrumKit}
        onClose={() => setActiveModal(null)}
      />

      <BpmDetectModal
        visible={showBpmDetect}
        onClose={() => setActiveModal(null)}
        onApply={(bpm) => {
          updateBpm(bpm);
          setActiveModal(null);
        }}
      />

      {/* ── 폴리곤 메트로놈 전체화면 ── */}
      {showPolygon && (
        <View style={[StyleSheet.absoluteFillObject, { zIndex: 600 }]}>
          <PolygonModeView
            polygonMode={polygonMode}
            isPlaying={isPlaying}
            onClose={closeMenuItem}
            onTogglePlay={() => void togglePlayPauseRef.current?.()}
            bpm={bpm}
            onBpmChange={updateBpm}
          />
        </View>
      )}

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
          // Fade-out begins from the first bar. Do not reuse the last cursor
          // from a previous stopped bar session when resolving its notification.
          const playback = getPlaybackContext({ activeBarIndex: 0 });
          showPlayingNotification(playback.bpm, playback.modeLabel, languageRef.current);
          engine.start();
          markAudioPlaying();
          startOrResumePracticeSession();
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
            markAudioPlaying();
            startOrResumePracticeSession();
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
          closeMenuItem();
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
        onOpenBpmDetect={() => { setActiveModal(null); setTimeout(() => openExclusive("bpmDetect"), 160); }}
        onMicTap={handleSignalMicTap}
      />

      <PitchQuizModal
        visible={pitchQuizVisible}
        initialMode={pitchQuizMode}
        onClose={() => {
          setPitchQuizVisible(false);
          setPitchQuizMode(null);
        }}
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
        existingVolume={recorderTarget ? (noteSampleVolumes[`${recorderTarget.beat}-${recorderTarget.sub}`] ?? 1) : 1}
        existingSpeed={recorderTarget ? (noteSampleSpeeds[`${recorderTarget.beat}-${recorderTarget.sub}`] ?? 1) : 1}
        existingMetronomeChannel={noteSampleMetroChannels[String(recorderTarget?.beat ?? 0)] ?? "both"}
        bpm={bpm}
        beatsPerMeasure={beatsPerMeasure}
        soundSet={soundSet.startsWith("custom") ? "classic" : soundSet as any}
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
        onOpenDial={() => {
          clearMenuItemReturn();
          setActiveModal(null);
          setTimeout(() => modeSwitcherDialRef.current?.open(), 100);
        }}
        onClose={() => {
          closeMenuItem();
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
        onClose={closeMenuItem}
        loggingEnabled={loggingEnabled}
        roomTrackingActive={roomTrackingActive}
        trackingRoomName={trackingRoomName}
        onStartRoomTracking={startRoomTracking}
        onStopRoomTracking={stopRoomTracking}
        username={username}
        onActivityDataCleared={() => {
          discardPracticeSession();
          discardRoomTracking();
          featureStartRef.current = null;
          setLoggingEnabled(false);
        }}
      />
      )}

      {showSettings && (
      <SettingsModal
        visible={showSettings}
        scope={settingsScope}
        onClose={() => {
          const returnTo = settingsReturnModalRef.current;
          settingsReturnModalRef.current = null;
          setSettingsScope("global");
          setActiveModal(returnTo);
        }}
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
          if (!val) {
            discardPracticeSession();
            discardRoomTracking();
          }
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
        randomBarConfig={randomBarConfig}
        onRandomBarConfigChange={onRandomBarConfigChange}
        onEnterNoteMode={handleEnterNoteMode}
        onShowOnboarding={() => openExclusive("onboarding")}
        keyBindings={keyBindings}
        onKeyBindingsChange={(kb) => {
          setKeyBindings(kb);
          keyBindingsRef.current = kb;
          if (settingsScope !== "global") {
            void saveModeKeyBindings(settingsScope, kb);
          }
        }}
        onOpenStageOptions={openStageOptions}
      />
      )}

      {!showMenu && !showSignalGen && !showPracticeBook && !showWorkUp && !showSettings && !noteMode && (
        <GoalCompletePopup
          popups={completedGoalPopups}
          topOffset={(insets.top || webTopInset) + 8}
          onDismiss={dismissGoalPopup}
        />
      )}

      <Animated.View
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
          modeSlideStyle,
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
            onSave={handleNoteSave}
            onReset={handleNoteReset}
            onExitNoteMode={handleExitNoteMode}
            onQueueItemImageChange={handleNoteQueueItemImageChange}
            onOpenSettings={() => openScopedSettings("note")}
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
              : { flex: 5, justifyContent: "center" as const, alignItems: "center" as const, transform: [{ translateY: windowHeight > 400 || S.isTablet ? S.ms(8, 0.3) : 0 }] }
            : barMode
              ? { flex: 5, justifyContent: "flex-start" as const, alignItems: "stretch" as const }
              : { flex: 5, justifyContent: "center" as const, alignItems: "center" as const, transform: [{ translateY: windowHeight > 600 || S.isTablet ? S.ms(12, 0.3) : 0 }] }
        }>
          <BeatIndicator
            beatsPerMeasure={beatsPerMeasure}
            currentBeat={currentBeat}
            isPlaying={isPlaying}
            isPreparing={isPreparing}
            onBeatsChange={updateTimeSignature}
            onTogglePlay={togglePlayPause}
            onOpenSettings={() => openScopedSettings(barMode ? "bar" : "beat")}
            onPlayLongPress={scoreMode === null && !barMode ? handleBeatQuickSaveOpen : undefined}
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
            onBarMeterChange={handleBarMeterChange}
            loopBlocks={loopBlocks}
            onLoopBlocksChange={handleLoopBlocksChange}
            barLoopMode={barLoopMode}
            onBarLoopModeChange={setBarLoopMode}
            blockPlayMode={blockPlayMode}
            onBlockPlayModeChange={setBlockPlayMode}
            onRandomPlayRequest={handleRandomBarPlay}
            randomBarSession={randomBarSession}
            onRandomViewportCapacityChange={onRandomViewportCapacityChange}
            onReplayRandomBarSession={handleReplayRandomBarSession}
            onSaveRandomBarSession={handleSaveRandomBarSession}
            onApplyRandomBarSession={handleApplyRandomBarSession}
            onReturnToOriginalBarList={handleReturnToOriginalBarList}
            onBarScrollOffset={(offset) => { barScrollOffsetRef.current = offset; }}
            noteSamples={noteSamples}
            noteSampleNames={noteSampleNames}
            noteSampleSources={noteSampleSources}
            onNoteRecordRequest={handleNoteRecordRequest}
            bpm={bpm}
            barBpm={barBpm}
            onBarBpmChange={handleBarBpmChange}
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
                onDragCancel={handleDragCancel}
                onReset={handleReset}
                isPlaying={isPlaying}
                activeSubNote={activeSubNote}
                activeBeatPattern={isPlaying && currentBeat >= 0 ? (beatSubdivisions[String(currentBeat)] || null) : null}
                currentBeatType={isPlaying && currentBeat >= 0 ? (beatTypes[currentBeat] ?? "normal") : null}
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
            easterEggEnabled={!usesSharedEasterEggGesture(currentMode, showPolygon)}
          />
        </View>

        {!isLandscape && !barMode && (windowHeight > 600 || S.isTablet) && (
          <Text style={[styles.beatHintText, { color: C.textTertiary, textAlign: "center" }]}>{t("main", "beatHint")}</Text>
        )}

        {!isLandscape && !barMode && (
          <View style={{ alignItems: "center", gap: S.ms(6, 0.3) }}>
            <SubdivisionBar
              pattern={subdivisionPattern}
              onPatternChange={handlePatternChange}
              onDragStart={handleDragStart}
              onDragMove={handleDragMove}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
              onReset={handleReset}
              isPlaying={isPlaying}
              activeSubNote={activeSubNote}
              activeBeatPattern={isPlaying && currentBeat >= 0 ? (beatSubdivisions[String(currentBeat)] || null) : null}
                currentBeatType={isPlaying && currentBeat >= 0 ? (beatTypes[currentBeat] ?? "normal") : null}
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
                          color={landscapeContentType === "photo" ? onAccentColor(C.accent) : C.textSecondary}
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
                          color={landscapeContentType === "stats" ? onAccentColor(C.accent) : C.textSecondary}
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
              onDragCancel={handleDragCancel}
              onReset={handleReset}
              isPlaying={isPlaying}
              activeSubNote={activeSubNote}
              activeBeatPattern={isPlaying && currentBeat >= 0 ? (beatSubdivisions[String(currentBeat)] || null) : null}
                currentBeatType={isPlaying && currentBeat >= 0 ? (beatTypes[currentBeat] ?? "normal") : null}
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
      </Animated.View>

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

      {isDragging && dragPattern && dragPattern.length > 0 && !noteMode && (
        <DragGhost
          pattern={dragPattern}
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

      <Animated.View
        style={[StyleSheet.absoluteFillObject, { zIndex: 99999 }, modeSlideStyle]}
        pointerEvents="box-none"
      >
      <StageModeOverlay
        visible={stageModeActive}
        onOpenDial={() => modeSwitcherDialRef.current?.open()}
        bpm={bpm}
        flashOpacity={flashOpacity}
        beatProgress={beatProgress}
        currentBeat={currentBeat}
        beatsPerMeasure={beatsPerMeasure}
        beatDenominator={beatDenominator}
        subdivisionPattern={subdivisionPattern}
        beatTypes={beatTypes}
        beatSubdivisions={beatSubdivisions}
        activeSubNote={activeSubNote}
        progressInfo={progressInfo}
        isPlaying={isPlaying}
        audioLifecycle={audioLifecycle}
        onRetryAudioRecovery={() => void retryAudioRecovery()}
        flashMode={flashMode}
        hapticMode={hapticMode}
        onPlayPause={() => void togglePlayPauseRef.current?.()}
        onExit={() => void exitStageMode()}
        onBpmChange={updateBpm}
        onTapTempo={handleTapTempo}
        onBeatsPerMeasureChange={(n) => {
          setBeatsPerMeasure(n);
          engineRef.current?.setBeatsPerMeasure(n);
        }}
        onBeatTypesChange={(types) => {
          setBeatTypes(types);
          engineRef.current?.setBeatTypes(types);
        }}
        onBeatDenominatorCycle={handleBeatDenominatorCycle}
        onFlashModeChange={(m) => {
          setFlashMode(m);
          persistSettings({ flashMode: m });
        }}
        onHapticModeChange={(m) => {
          setHapticMode(m);
          engineRef.current?.setHapticMode(m);
          persistSettings({ hapticMode: m });
        }}
        noSetlistContent={
          <>
            <BeatIndicator
              beatsPerMeasure={beatsPerMeasure}
              currentBeat={currentBeat}
              isPlaying={isPlaying}
              isPreparing={isPreparing}
              onBeatsChange={updateTimeSignature}
              onTogglePlay={togglePlayPause}
              onPlayLongPress={scoreMode === null && !barMode ? handleBeatQuickSaveOpen : undefined}
              beatTypes={beatTypes}
              onBeatTypeChange={handleBeatTypeChange}
              dropTargetBeat={dropTargetBeat}
              beatSubdivisionCounts={beatSubdivisionCounts}
              barMode={false}
              onBarModeChange={handleBarModeChange}
              beatSubdivisions={beatSubdivisions}
              onBeatSubdivisionChange={handleBeatSubdivisionChange}
              activeSubNote={activeSubNote}
              barRepeats={barRepeats}
              onBarRepeatChange={handleBarRepeatChange}
              loopBlocks={loopBlocks}
              onLoopBlocksChange={handleLoopBlocksChange}
              barLoopMode={barLoopMode}
              onBarLoopModeChange={setBarLoopMode}
              blockPlayMode={blockPlayMode}
              onBlockPlayModeChange={setBlockPlayMode}
              beatDenominator={beatDenominator}
              halfTime={halfTime}
            />
            <SubdivisionBar
              pattern={subdivisionPattern}
              onPatternChange={handlePatternChange}
              onDragStart={handleDragStart}
              onDragMove={handleDragMove}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
              onReset={handleReset}
              isPlaying={isPlaying}
              activeSubNote={activeSubNote}
              activeBeatPattern={isPlaying && currentBeat >= 0 ? (beatSubdivisions[String(currentBeat)] || null) : null}
                currentBeatType={isPlaying && currentBeat >= 0 ? (beatTypes[currentBeat] ?? "normal") : null}
            />
          </>
        }
        practiceBook={stagePracticeEntries}
        activeEntryId={activeStagePracticeEntryId}
        noteCurrentIndex={noteCurrentIndex}
        onOpenScheduledStart={() => openExclusive("scheduledStart")}
        onOpenModeSettings={() => openScopedSettings("stage")}
        stageOptionsRequest={stageOptionsRequest}
        modeSettingsVisible={showSettings && settingsScope === "stage"}
        onQueueSeamlessNext={(next) => { seamlessNextEntryRef.current = next; }}
        onSelectEntry={(entry) => {
          seamlessNextEntryRef.current = null; // 수동 전환 시 예약된 seamless 취소
          const engine = engineRef.current;
          if (!engine) return;
          const entryIsBar = entry.mode === "bar";
          updateBpmRef.current(entry.bpm);
          // 바 모드 항목 선택 시 barBpm 상태도 동기화해야 나중에
          // 일반 바 모드로 복귀할 때 BPM 표시가 올바르게 유지된다.
          if (entryIsBar) {
            barBpmRef.current = entry.bpm;
            setBarBpm(entry.bpm);
          }
          setBeatsPerMeasure(entry.beatsPerMeasure);
          setBeatTypes([...entry.beatTypes]);
          setBeatSubdivisions({ ...entry.beatSubdivisions });
          if (entry.subdivisionPattern && entry.subdivisionPattern.length > 0) {
            setSubdivisionPattern([...entry.subdivisionPattern]);
          }
          // ── ref를 동기적으로 갱신 ─────────────────────────────────────
          // barModeRef: applyEntryToEngineCore 전에 갱신해야 바 모드 정지 로직 작동.
          // barConfigRef / dialConfigRef: togglePlayPause 시작 분기가 이 ref들을
          // 엔진에 덮어쓰므로, React 상태 업데이트(async)를 기다리지 않고 여기서
          // 즉시 동기화해야 다음 재생 시 올바른 항목 설정이 적용된다.
          barModeRef.current = entryIsBar;
          barConfigRef.current = {
            ...barConfigRef.current,
            beatsPerMeasure: entry.beatsPerMeasure,
            beatTypes:        [...entry.beatTypes],
            beatSubdivisions: { ...entry.beatSubdivisions },
            barRepeats:       { ...(entry.barRepeats  || {}) },
            loopBlocks:       [...(entry.loopBlocks   || [])],
            barLoopMode:      (entry.barLoopMode  || "once") as "loop" | "once",
            blockPlayMode:    (entry.blockPlayMode || "loop") as "sequential" | "loop" | "random",
          };
          dialConfigRef.current = {
            ...dialConfigRef.current,
            beatsPerMeasure: entry.beatsPerMeasure,
            beatTypes:        [...entry.beatTypes],
            beatSubdivisions: { ...entry.beatSubdivisions },
          };
          barLoopModeRef.current = (entry.barLoopMode || "once") as "loop" | "once";
          // ─────────────────────────────────────────────────────────────
          setBarMode(entryIsBar);
          setBarLoopMode(entry.barLoopMode || "once");
          setBarRepeats({ ...(entry.barRepeats || {}) });
          setLoopBlocks([...(entry.loopBlocks || [])]);
          applyEntryToEngineCore(engine, entry, beatDenominatorRef.current);
          scheduleReRender();
          setActiveStagePracticeEntryId(entry.id);
        }}
      />
      </Animated.View>

      {/* Beat mode quick-save name input modal */}
      <Modal
        visible={beatQuickSaveModalVisible}
        transparent
        animationType="fade"
        onRequestClose={handleBeatQuickSaveCancel}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.55)",
            alignItems: "center",
            justifyContent: "center",
          }}
          onPress={handleBeatQuickSaveCancel}
        >
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
            <Pressable
              style={{
                backgroundColor: C.surface,
                borderRadius: 16,
                padding: S.ms(20, 0.4),
                width: Math.min(320, windowWidth - 48),
                gap: S.ms(14, 0.3),
                borderWidth: 1,
                borderColor: C.border,
              }}
              onPress={() => {}}
            >
              <Text
                style={{
                  color: C.text,
                  fontSize: S.ms(16, 0.4),
                  fontWeight: "600",
                  textAlign: "center",
                }}
              >
                {t("main", "beatQuickSaveTitle")}
              </Text>
              <TextInput
                style={{
                  borderWidth: 1,
                  borderColor: C.accent,
                  borderRadius: 10,
                  paddingHorizontal: S.ms(12, 0.3),
                  paddingVertical: S.ms(10, 0.3),
                  color: C.text,
                  fontSize: S.ms(15, 0.3),
                  backgroundColor: C.background,
                }}
                value={beatQuickSaveName}
                onChangeText={setBeatQuickSaveName}
                placeholder={t("main", "beatQuickSaveNamePlaceholder")}
                placeholderTextColor={C.textTertiary}
                autoFocus
                onSubmitEditing={() => void handleBeatQuickSaveConfirm(beatQuickSaveName)}
                returnKeyType="done"
              />
              <View style={{ flexDirection: "row", gap: S.ms(10, 0.3) }}>
                <Pressable
                  onPress={handleBeatQuickSaveCancel}
                  style={{
                    flex: 1,
                    paddingVertical: S.ms(10, 0.3),
                    borderRadius: 10,
                    backgroundColor: C.overlay10,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: C.textSecondary, fontSize: S.ms(15, 0.3), fontWeight: "500" }}>
                    {t("main", "cancel")}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => void handleBeatQuickSaveConfirm(beatQuickSaveName)}
                  style={{
                    flex: 1,
                    paddingVertical: S.ms(10, 0.3),
                    borderRadius: 10,
                    backgroundColor: C.accent,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: onAccentColor(C.accent), fontSize: S.ms(15, 0.3), fontWeight: "600" }}>
                    {t("main", "beatQuickSaveConfirm")}
                  </Text>
                </Pressable>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* Beat quick-save success toast */}
      {beatQuickSaveToast ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            bottom: (insets.bottom || webBottomInset) + 24,
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
            {beatQuickSaveToast}
          </Text>
        </View>
      ) : null}

      {showSharedEasterEggQuiz ? (
        <View
          accessibilityViewIsModal
          style={[
            StyleSheet.absoluteFillObject,
            {
              zIndex: 12000,
              backgroundColor: C.background + "F2",
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: S.ms(20, 0.3),
            },
          ]}
        >
          <View style={{ width: "100%", maxWidth: 440 }}>
            <EasterEggQuiz
              onGuess={handleEasterEggGuess}
              revealBpm={easterEggRevealBpm}
              isGiveUp={easterEggGiveUpMode}
              shakeCount={easterEggShakeCount}
              successCount={easterEggSuccessCount}
              hintDirection={easterEggHintDirection}
              isLandscape={isLandscape}
              applyBpmSelected={easterEggApplyBpm}
              onToggleApplyBpm={handleEasterEggToggleApplyBpm}
            />
          </View>
        </View>
      ) : null}
    </KbView>
  );
}

