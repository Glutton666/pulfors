import { useCallback, useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { safePlay } from "@/lib/audio-utils";
import { toEngineBpm, soundSets } from "@/lib/metronome-engine";
import { applyDialConfigToEngine } from "@/lib/dial-engine-boundary";
import {
  applySoftClip,
  ensureWebClickBuffers,
  getWebAudioContext,
  playWebRenderedLoop,
  renderMeasure,
} from "@/lib/audio-renderer";
import type { ClickPCMs, SamplePCMEntry, TickInfo } from "@/lib/audio-renderer";
import type { WebRenderedLoop } from "@/lib/audio-renderer";
import type { MetronomeEngine } from "@/lib/metronome-engine";
import type { BarConfig, DialConfig } from "@/app/index.helpers";
import type { PracticeEntry, SoundSet } from "@/lib/storage";
import { PracticeSessionTracker, type PracticeSessionData } from "@/lib/activity-log";
import type { Language } from "@/lib/i18n";
import type { SampleChannel } from "@/lib/stereo-channel";
import type {
  NoteSampleChannelMap,
  NoteSampleMap,
  NoteSampleMetroChannelMap,
  NoteSampleSpeedMap,
  NoteSampleVolumeMap,
} from "@/lib/note-samples";
import type { PlaybackContext } from "@/lib/playback-context";
import type { AudioPlayer } from "expo-audio";
import {
  getAudioLifecycleSnapshot,
  markAudioPlaying,
  markAudioPreparing,
  markAudioRecovering,
  markAudioRecoveryFailed,
  markAudioStopped,
} from "@/lib/audio-lifecycle";

type Ref<T> = { current: T };

export interface UsePlaybackControlParams {
  engineRef: Ref<MetronomeEngine | null>;
  isPlaying: boolean;
  isPreparing: boolean;
  setIsPlaying: (value: boolean) => void;
  setIsPreparing: (value: boolean) => void;
  isPlayingRef: Ref<boolean>;
  isPreparingRef: Ref<boolean>;
  preparingCancelledRef: Ref<boolean>;
  barMode: boolean;
  barModeRef: Ref<boolean>;
  bpm: number;
  getPlaybackContext: (overrides?: { activeBarIndex?: number }) => PlaybackContext;
  beatsPerMeasure: number;
  subdivisionPattern: unknown[];
  barConfigRef: Ref<BarConfig>;
  dialConfigRef: Ref<DialConfig>;
  barStartBeatRef: Ref<number | null>;
  barLoopModeRef: Ref<"loop" | "once">;
  blockPlayModeRef: Ref<"sequential" | "loop" | "random">;
  beatDenominatorRef: Ref<2 | 4 | 8>;
  seamlessNextEntryRef?: Ref<PracticeEntry | null>;
  stopRenderedAudio: () => void;
  clearSamplePlayStates: () => void;
  resetPlaybackVisuals: () => void;
  renderedPlayerRef: Ref<AudioPlayer | null>;
  webRenderedLoopRef: Ref<WebRenderedLoop | null>;
  activateWebRenderedLoop: (loop: WebRenderedLoop) => void;
  renderGenerationRef: Ref<number>;
  buildRenderedPlayer: () => Promise<AudioPlayer | null>;
  clearAudioWatchdogRef: Ref<() => void>;
  armAudioWatchdogRef: Ref<() => void>;
  soundSetRef: Ref<SoundSet>;
  volumeRef: Ref<number>;
  sampleVolumeRef: Ref<number>;
  noteSamplesRef: Ref<NoteSampleMap>;
  noteSampleChannelsRef: Ref<NoteSampleChannelMap>;
  noteSampleVolumesRef: Ref<NoteSampleVolumeMap>;
  noteSampleSpeedsRef: Ref<NoteSampleSpeedMap>;
  webClickReadyRef: Ref<boolean>;
  getClickPCMs: (soundSet: SoundSet) => Promise<ClickPCMs>;
  getSamplePCMs: (samples: NoteSampleMap) => Promise<Map<string, SamplePCMEntry>>;
  getLayerClickPCMsForSchedule: (ticks: TickInfo[]) => Promise<Map<string, ClickPCMs>>;
  barMetronomeChannelRef: Ref<SampleChannel>;
  noteSampleMetroChannelsRef: Ref<NoteSampleMetroChannelMap>;
  notifyVoicePlayState: (playing: boolean) => void;
  languageRef: Ref<Language>;
  notifyUserToggle: () => Promise<unknown> | undefined;
  showPlayingNotification: (bpm: number, mode: string, language?: Language) => void | Promise<void>;
  showPausedNotification: (bpm: number, mode: string, language?: Language) => void | Promise<void>;
  easterEggActiveRef: Ref<boolean>;
  handleEasterEggGiveUpRef: Ref<(stopEngine?: boolean) => void>;
  loggingEnabled: boolean;
  practiceStartRef: Ref<number | null>;
  practiceSessionRef: Ref<PracticeSessionTracker | null>;
  loadedPracticeNoteRef: Ref<{ id: string; label: string } | null>;
  addPracticeLog: (data: PracticeSessionData) => Promise<unknown>;
  checkCompletedGoals: () => void;
  capturePlaybackError: (message: string, error: unknown, level?: "warning" | "error") => void;
  onPlaybackStopped?: () => void;
}

/** Owns ordinary start, stop, and user-toggle playback paths. */
export function usePlaybackControl(p: UsePlaybackControlParams) {
  const seamlessNextEntryRef = useRef<PracticeEntry | null>(null);
  const seamlessRef = p.seamlessNextEntryRef ?? seamlessNextEntryRef;
  const renderGenerationRef = p.renderGenerationRef;

  const startOrResumePracticeSession = useCallback(() => {
    if (!p.loggingEnabled) return;
    const now = Date.now();
    const existing = p.practiceSessionRef.current;
    const playback = p.getPlaybackContext();
    if (existing) {
      existing.updateBpm(playback.bpm);
      existing.resume(now);
      p.practiceStartRef.current = now;
      return;
    }
    const note = p.loadedPracticeNoteRef.current;
    p.practiceSessionRef.current = new PracticeSessionTracker({
      bpm: playback.bpm,
      mode: playback.activityMode,
      bpmSource: playback.bpmSource,
      activeBarIndex: playback.activeBarIndex,
      startedAt: now,
      ...(p.barModeRef.current ? { barConfig: { beatsPerMeasure: p.beatsPerMeasure, subdivisions: p.subdivisionPattern.length } } : {}),
      ...(p.barModeRef.current && note ? { practiceNoteId: note.id, practiceNoteLabel: note.label } : {}),
    }, now);
    p.practiceStartRef.current = now;
  }, [p]);

  const pausePracticeSession = useCallback((interrupted: boolean) => {
    const session = p.practiceSessionRef.current;
    if (!session) return;
    if (interrupted) session.interrupt();
    else session.pause();
  }, [p, renderGenerationRef]);

  const completePracticeSession = useCallback((
    endReason: NonNullable<PracticeSessionData["endReason"]> = "manual",
    status: NonNullable<PracticeSessionData["status"]> = "completed",
  ) => {
    const session = p.practiceSessionRef.current;
    p.practiceSessionRef.current = null;
    p.practiceStartRef.current = null;
    if (!session || !p.loggingEnabled) return;
    const playback = p.getPlaybackContext();
    const data = session.complete(
      playback.bpm,
      endReason,
      status,
      Date.now(),
      {
        bpmSource: playback.bpmSource,
        activeBarIndex: playback.activeBarIndex,
      },
    );
    if (data.duration < 3) return;
    void p.addPracticeLog(data).then(p.checkCompletedGoals);
  }, [p]);

  const discardPracticeSession = useCallback(() => {
    p.practiceSessionRef.current = null;
    p.practiceStartRef.current = null;
  }, [p]);

  const configureEngine = useCallback((engine: MetronomeEngine) => {
    if (p.barModeRef.current) {
      engine.setBeatTypes([...(p.barConfigRef.current.beatTypes || [])]);
      engine.setAllBeatSubdivisions(p.barConfigRef.current.beatSubdivisions || {});
      engine.setAllBarRepeats(p.barConfigRef.current.barRepeats || {});
      engine.setLoopBlocks(p.barConfigRef.current.loopBlocks || []);
      engine.setBlockPlayMode(p.blockPlayModeRef.current);
      const bpmOverrides: Record<number, number> = {};
      for (const [key, repeat] of Object.entries(p.barConfigRef.current.barRepeats || {})) {
        if (repeat.bpm) {
          bpmOverrides[Number(key)] = toEngineBpm(
            repeat.bpm,
            repeat.meterDenominator ?? p.beatDenominatorRef.current,
          );
        }
      }
      engine.setAllBarBpmOverrides(bpmOverrides);
    } else {
      applyDialConfigToEngine(engine, p.dialConfigRef.current);
    }
    engine.buildScheduleOnly();
  }, [p]);

  const renderWebLoop = useCallback(async (engine: MetronomeEngine, atMeasureBoundary: boolean) => {
    const generation = ++renderGenerationRef.current;
    if (atMeasureBoundary && !p.engineRef.current?.getIsRunning()) return;
    const scheduleInfo = engine.getScheduleInfo();
    const ticks = scheduleInfo.ticks as TickInfo[];
    const [clickPCMs, layerClickPCMs, samplePCMs] = await Promise.all([
      p.getClickPCMs(p.soundSetRef.current),
      p.getLayerClickPCMsForSchedule(ticks),
      p.getSamplePCMs(p.noteSamplesRef.current),
    ]);
    if (
      generation !== renderGenerationRef.current ||
      (atMeasureBoundary && !p.engineRef.current?.getIsRunning())
    ) return;
    const pcm = renderMeasure({
      schedule: ticks,
      measureDurationMs: scheduleInfo.durationMs,
      clickPCMs,
      samplePCMs,
      clickVolume: Math.max(1, p.volumeRef.current),
      sampleVolume: samplePCMs.size > 0 ? p.sampleVolumeRef.current : 0,
      sampleVolumes: p.noteSampleVolumesRef.current,
      sampleSpeeds: p.noteSampleSpeedsRef.current,
      sampleChannels: p.noteSampleChannelsRef.current,
      metronomeChannel: p.barModeRef.current ? p.barMetronomeChannelRef.current : "both",
      metroChannelsByBeat: p.barModeRef.current ? p.noteSampleMetroChannelsRef.current : undefined,
      layerClickPCMs,
    });
    if (p.volumeRef.current > 1) {
      if (pcm instanceof Float32Array) applySoftClip(pcm);
      else { applySoftClip(pcm.left); applySoftClip(pcm.right); }
    }
    if (atMeasureBoundary) {
      engine.setPendingMeasureStartAction(() => {
        if (
          generation !== renderGenerationRef.current ||
          !p.engineRef.current?.getIsRunning()
        ) return;
        const previous = p.webRenderedLoopRef.current;
        const previousDuration = previous?.getDurationSeconds?.();
        const nextDuration = (pcm instanceof Float32Array
          ? pcm.length
          : Math.min(pcm.left.length, pcm.right.length)) / 44100;
        const phaseCompatible = previousDuration !== undefined
          && Math.abs(previousDuration - nextDuration) < 0.001;
        const boundary = phaseCompatible ? previous?.getNextBoundaryTime?.() : undefined;
        const next = playWebRenderedLoop(pcm, undefined, "both", p.volumeRef.current, boundary);
        p.activateWebRenderedLoop(next);
        if (previous) {
          try { previous.stop(boundary); } catch {}
        }
        p.engineRef.current?.setPreRenderedAudio(true);
      });
    } else {
      p.webRenderedLoopRef.current?.stop();
      p.activateWebRenderedLoop(playWebRenderedLoop(pcm, undefined, "both", p.volumeRef.current));
      engine.setPreRenderedAudio(true);
    }
  }, [p]);

  const stopMetronome = useCallback(() => {
    if (!p.isPlayingRef.current) return;
    renderGenerationRef.current += 1;
    p.engineRef.current?.stop();
    p.stopRenderedAudio();
    p.clearSamplePlayStates();
    p.setIsPreparing(false);
    p.setIsPlaying(false);
    p.resetPlaybackVisuals();
    markAudioStopped();
    completePracticeSession("manual");
    p.onPlaybackStopped?.();
  }, [completePracticeSession, p, renderGenerationRef]);

  const togglePlayPause = useCallback(async () => {
    const engine = p.engineRef.current;
    if (!engine) return false;
    const androidProbeReady = p.notifyUserToggle();
    if (p.easterEggActiveRef.current) {
      p.handleEasterEggGiveUpRef.current(true);
      return true;
    }
    if (p.isPreparing && !p.isPlaying) {
      renderGenerationRef.current += 1;
      p.preparingCancelledRef.current = true;
      p.setIsPreparing(false);
      markAudioStopped();
      p.onPlaybackStopped?.();
      return true;
    }
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (p.isPlaying) {
      renderGenerationRef.current += 1;
      const playback = p.getPlaybackContext();
      seamlessRef.current = null;
      p.clearAudioWatchdogRef.current();
      engine.stop();
      p.stopRenderedAudio();
      p.clearSamplePlayStates();
      p.setIsPreparing(false);
      p.setIsPlaying(false);
      p.notifyVoicePlayState(false);
      p.resetPlaybackVisuals();
      const interrupted = ["interrupted", "recovering"].includes(getAudioLifecycleSnapshot().phase);
      if (!interrupted) markAudioStopped();
      p.showPausedNotification(playback.bpm, playback.modeLabel, p.languageRef.current);
      pausePracticeSession(interrupted);
      p.onPlaybackStopped?.();
      return;
    }

    p.resetPlaybackVisuals();
    p.clearSamplePlayStates();
    markAudioPreparing();
    p.setIsPreparing(true);
    const startBeat = p.barModeRef.current ? p.barStartBeatRef.current : undefined;
    const playback = p.getPlaybackContext({
      activeBarIndex: startBeat ?? 0,
    });
    p.showPlayingNotification(playback.bpm, playback.modeLabel, p.languageRef.current);
    configureEngine(engine);
    p.preparingCancelledRef.current = false;
    try {
      if (Platform.OS === "web") {
        const context = getWebAudioContext();
        await context?.resume().catch(() => {});
        if (!p.webClickReadyRef.current) {
          const source = soundSets[p.soundSetRef.current as keyof typeof soundSets] || soundSets.classic;
          if (await ensureWebClickBuffers(source as never).catch(() => false)) p.webClickReadyRef.current = true;
        }
        p.setIsPreparing(false); p.setIsPlaying(true); p.notifyVoicePlayState(true); p.isPlayingRef.current = true;
        engine.start(startBeat ?? undefined);
        markAudioPlaying();
        p.armAudioWatchdogRef.current();
        void renderWebLoop(engine, true).catch((error) => p.capturePlaybackError("togglePlayPause: Web pre-render failed, using per-tick", error, "warning"));
      } else {
        if (Platform.OS === "android") await androidProbeReady;
        // Android Beat mode keeps the proven per-tick player path. Switching it
        // to a rendered WAV changed the audible role mix on real devices and
        // caused a pronounced volume/timbre drop. Bar mode still needs the
        // rendered loop for its samples and expanded schedule.
        const useRenderedLoop =
          Platform.OS !== "android" ||
          p.barModeRef.current ||
          String(p.soundSetRef.current).startsWith("custom");
        const player = useRenderedLoop ? await p.buildRenderedPlayer() : null;
        if (p.preparingCancelledRef.current) {
          try { player?.release(); } catch {}
          p.setIsPreparing(false);
          markAudioStopped();
          return true;
        }
        p.setIsPreparing(false); p.setIsPlaying(true); p.notifyVoicePlayState(true); p.isPlayingRef.current = true;
        if (player) {
          p.stopRenderedAudio();
          p.renderedPlayerRef.current = player;
          engine.setPreRenderedAudio(true);
        } else {
          engine.setPreRenderedAudio(false);
        }
        engine.start(startBeat ?? undefined);
        markAudioPlaying();
        p.armAudioWatchdogRef.current();
        if (player) safePlay(player, "metronome.start.native");
      }
      startOrResumePracticeSession();
      if (p.barModeRef.current && p.barLoopModeRef.current === "once") engine.requestStopAfterMeasure();
      return true;
    } catch {
      p.setIsPreparing(false);
      p.setIsPlaying(false);
      p.isPlayingRef.current = false;
      if (getAudioLifecycleSnapshot().phase === "recovering") markAudioRecoveryFailed("interruption");
      else markAudioStopped();
      p.onPlaybackStopped?.();
      return false;
    }
  }, [configureEngine, p, pausePracticeSession, renderGenerationRef, renderWebLoop, startOrResumePracticeSession, seamlessRef]);

  const togglePlayPauseRef = useRef(togglePlayPause);
  useEffect(() => { togglePlayPauseRef.current = togglePlayPause; }, [togglePlayPause]);

  const startMetronome = useCallback(async () => {
    const engine = p.engineRef.current;
    if (!engine || p.isPlayingRef.current || p.isPreparingRef.current) return;
    p.resetPlaybackVisuals();
    p.clearSamplePlayStates();
    markAudioPreparing();
    configureEngine(engine);
    p.preparingCancelledRef.current = false;
    p.setIsPreparing(true);
    try {
      if (Platform.OS === "web") {
        const context = getWebAudioContext();
        if (context?.state === "suspended") await context.resume().catch(() => {});
        const source = soundSets[p.soundSetRef.current as keyof typeof soundSets] || soundSets.classic;
        await ensureWebClickBuffers(source as never);
        p.webClickReadyRef.current = true;
        if (context?.state === "suspended") await context.resume().catch(() => {});
        if (p.preparingCancelledRef.current) { p.setIsPreparing(false); markAudioStopped(); return; }
        p.setIsPreparing(false);
        try {
          await renderWebLoop(engine, false);
        } catch (error) {
          p.capturePlaybackError("startMetronome: Web pre-render failed, using per-tick", error, "warning");
          engine.setPreRenderedAudio(false);
        }
        p.setIsPlaying(true); engine.start(); markAudioPlaying(); p.armAudioWatchdogRef.current();
      } else {
        const player = await p.buildRenderedPlayer();
        if (p.preparingCancelledRef.current) {
          try { player?.release(); } catch {}
          p.setIsPreparing(false);
          markAudioStopped();
          return;
        }
        p.setIsPreparing(false);
        if (player) {
          p.stopRenderedAudio();
          p.renderedPlayerRef.current = player;
          engine.setPreRenderedAudio(true);
        } else engine.setPreRenderedAudio(false);
        p.setIsPlaying(true); engine.start(); markAudioPlaying(); p.armAudioWatchdogRef.current();
        if (player) safePlay(player, "metronome.start.fallback");
      }
      startOrResumePracticeSession();
    } catch (error) {
      p.capturePlaybackError("startMetronome error", error);
      p.setIsPreparing(false);
      p.setIsPlaying(false);
      p.isPlayingRef.current = false;
      if (getAudioLifecycleSnapshot().phase === "recovering") markAudioRecoveryFailed("interruption");
      else markAudioStopped();
      p.onPlaybackStopped?.();
    }
  }, [configureEngine, p, renderWebLoop, startOrResumePracticeSession]);

  const retryAudioRecovery = useCallback(async () => {
    if (p.isPreparingRef.current) return;
    renderGenerationRef.current += 1;
    markAudioRecovering("watchdog");
    p.practiceSessionRef.current?.interrupt();
    p.engineRef.current?.stop();
    p.stopRenderedAudio();
    p.clearSamplePlayStates();
    p.setIsPlaying(false);
    p.isPlayingRef.current = false;
    p.setIsPreparing(false);
    p.isPreparingRef.current = false;
    await startMetronome();
  }, [p, renderGenerationRef, startMetronome]);

  return {
    togglePlayPause,
    togglePlayPauseRef,
    startMetronome,
    stopMetronome,
    retryAudioRecovery,
    completePracticeSession,
    discardPracticeSession,
    startOrResumePracticeSession,
    seamlessNextEntryRef: seamlessRef,
  };
}