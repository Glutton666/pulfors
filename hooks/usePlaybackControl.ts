import { useCallback, useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { safePlay } from "@/lib/audio-utils";
import { toEngineBpm, soundSets } from "@/lib/metronome-engine";
import {
  applySoftClip,
  ensureWebClickBuffers,
  getWebAudioContext,
  playWebRenderedLoop,
  renderMeasure,
} from "@/lib/audio-renderer";
import type { ClickPCMs, TickInfo } from "@/lib/audio-renderer";
import type { MetronomeEngine } from "@/lib/metronome-engine";
import type { BarConfig, DialConfig } from "@/app/index.helpers";
import type { PracticeEntry, SoundSet } from "@/lib/storage";
import { PracticeSessionTracker, type PracticeSessionData } from "@/lib/activity-log";
import type { Language } from "@/lib/i18n";
import type { SampleChannel } from "@/lib/stereo-channel";
import type { NoteSampleMetroChannelMap } from "@/lib/note-samples";
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
  webRenderedLoopRef: Ref<{ stop: () => void } | null>;
  buildRenderedPlayer: () => Promise<AudioPlayer | null>;
  clearAudioWatchdogRef: Ref<() => void>;
  armAudioWatchdogRef: Ref<() => void>;
  soundSetRef: Ref<SoundSet>;
  volumeRef: Ref<number>;
  webClickReadyRef: Ref<boolean>;
  getClickPCMs: (soundSet: SoundSet) => Promise<ClickPCMs>;
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
}

/** Owns ordinary start, stop, and user-toggle playback paths. */
export function usePlaybackControl(p: UsePlaybackControlParams) {
  const seamlessNextEntryRef = useRef<PracticeEntry | null>(null);
  const seamlessRef = p.seamlessNextEntryRef ?? seamlessNextEntryRef;

  const startOrResumePracticeSession = useCallback(() => {
    if (!p.loggingEnabled) return;
    const now = Date.now();
    const existing = p.practiceSessionRef.current;
    if (existing) {
      existing.updateBpm(p.bpm);
      existing.resume(now);
      p.practiceStartRef.current = now;
      return;
    }
    const note = p.loadedPracticeNoteRef.current;
    p.practiceSessionRef.current = new PracticeSessionTracker({
      bpm: p.bpm,
      mode: p.barModeRef.current ? "bar" : "dial",
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
  }, [p]);

  const completePracticeSession = useCallback((
    endReason: NonNullable<PracticeSessionData["endReason"]> = "manual",
    status: NonNullable<PracticeSessionData["status"]> = "completed",
  ) => {
    const session = p.practiceSessionRef.current;
    p.practiceSessionRef.current = null;
    p.practiceStartRef.current = null;
    if (!session || !p.loggingEnabled) return;
    const data = session.complete(p.bpm, endReason, status);
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
        if (repeat.bpm) bpmOverrides[Number(key)] = toEngineBpm(repeat.bpm, p.beatDenominatorRef.current);
      }
      engine.setAllBarBpmOverrides(bpmOverrides);
    } else {
      engine.setBeatTypes([...(p.dialConfigRef.current.beatTypes || [])]);
      engine.setAllBeatSubdivisions(p.dialConfigRef.current.beatSubdivisions || {});
    }
    engine.buildScheduleOnly();
  }, [p]);

  const renderWebLoop = useCallback(async (engine: MetronomeEngine, atMeasureBoundary: boolean) => {
    if (atMeasureBoundary && !p.engineRef.current?.getIsRunning()) return;
    const scheduleInfo = engine.getScheduleInfo();
    const ticks = scheduleInfo.ticks as TickInfo[];
    const [clickPCMs, layerClickPCMs] = await Promise.all([
      p.getClickPCMs(p.soundSetRef.current),
      p.getLayerClickPCMsForSchedule(ticks),
    ]);
    if (atMeasureBoundary && !p.engineRef.current?.getIsRunning()) return;
    const pcm = renderMeasure({
      schedule: ticks,
      measureDurationMs: scheduleInfo.durationMs,
      clickPCMs,
      samplePCMs: new Map(),
      clickVolume: Math.max(1, p.volumeRef.current),
      sampleVolume: 0,
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
        if (!p.engineRef.current?.getIsRunning()) return;
        try { p.webRenderedLoopRef.current?.stop(); } catch {}
        p.webRenderedLoopRef.current = playWebRenderedLoop(pcm);
        p.engineRef.current?.setPreRenderedAudio(true);
      });
    } else {
      p.webRenderedLoopRef.current?.stop();
      p.webRenderedLoopRef.current = playWebRenderedLoop(pcm);
      engine.setPreRenderedAudio(true);
    }
  }, [p]);

  const stopMetronome = useCallback(() => {
    if (!p.isPlayingRef.current) return;
    p.engineRef.current?.stop();
    p.stopRenderedAudio();
    p.clearSamplePlayStates();
    p.setIsPreparing(false);
    p.setIsPlaying(false);
    p.resetPlaybackVisuals();
    markAudioStopped();
    completePracticeSession("manual");
  }, [completePracticeSession, p]);

  const togglePlayPause = useCallback(async () => {
    const engine = p.engineRef.current;
    if (!engine) return false;
    const androidProbeReady = p.notifyUserToggle();
    if (p.easterEggActiveRef.current) {
      p.handleEasterEggGiveUpRef.current(true);
      return true;
    }
    if (p.isPreparing && !p.isPlaying) {
      p.preparingCancelledRef.current = true;
      p.setIsPreparing(false);
      markAudioStopped();
      return true;
    }
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const modeLabel = p.barModeRef.current ? "Bar" : "Dial";
    if (p.isPlaying) {
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
      p.showPausedNotification(p.bpm, modeLabel, p.languageRef.current);
      pausePracticeSession(interrupted);
      return;
    }

    p.resetPlaybackVisuals();
    p.clearSamplePlayStates();
    markAudioPreparing();
    const startBeat = p.barModeRef.current ? p.barStartBeatRef.current : undefined;
    p.showPlayingNotification(p.bpm, modeLabel, p.languageRef.current);
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
        p.setIsPreparing(false); p.setIsPlaying(true); p.notifyVoicePlayState(true); p.isPlayingRef.current = true;
        engine.start(startBeat ?? undefined);
        markAudioPlaying();
        p.armAudioWatchdogRef.current();
        void p.buildRenderedPlayer().then((player) => {
          if (!player || !p.engineRef.current?.getIsRunning()) { try { player?.release(); } catch {} return; }
          p.stopRenderedAudio();
          p.renderedPlayerRef.current = player;
          player.volume = 1;
          engine.setPreRenderedAudio(true);
          safePlay(player, "metronome.start.native");
        }).catch(() => {});
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
      return false;
    }
  }, [configureEngine, p, pausePracticeSession, renderWebLoop, startOrResumePracticeSession, seamlessRef]);

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
          player.volume = 1;
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
    }
  }, [configureEngine, p, renderWebLoop, startOrResumePracticeSession]);

  const retryAudioRecovery = useCallback(async () => {
    if (p.isPreparingRef.current) return;
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
  }, [p, startMetronome]);

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