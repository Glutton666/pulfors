import { useCallback, useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { safePlayAndConfirm } from "@/lib/audio-utils";
import { toEngineBpm, soundSets } from "@/lib/metronome-engine";
import { applyDialConfigToEngine } from "@/lib/dial-engine-boundary";
import {
  applySoftClip,
  ensureWebClickBuffers,
  getWebAudioContext,
  playWebRenderedLoop,
  renderMeasure,
  renderMeasureAbortable,
  beginAbortableRender,
  abortActiveRender,
  finishAbortableRender,
  isRenderAborted,
} from "@/lib/audio-renderer";
import type { ClickPCMs, SamplePCMEntry, TickInfo } from "@/lib/audio-renderer";
import type { WebRenderedLoop } from "@/lib/audio-renderer";
import type { BeatType, MetronomeEngine } from "@/lib/metronome-engine";
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
  beatTypes: BeatType[];
  beatSubdivisions: Record<string, BeatType[]>;
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
  flushPlaybackVisuals: () => void;
  renderedPlayerRef: Ref<AudioPlayer | null>;
  webRenderedLoopRef: Ref<WebRenderedLoop | null>;
  activateWebRenderedLoop: (loop: WebRenderedLoop) => void;
  beginAudioStartupProbe: () => number;
  invalidateAudioStartupProbe: () => void;
  waitForFirstAudioActivity: (epoch: number, isCancelled?: () => boolean, timeoutMs?: number) => Promise<boolean>;
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
  getClickPCMs: (soundSet: SoundSet, signal?: AbortSignal) => Promise<ClickPCMs>;
  getSamplePCMs: (samples: NoteSampleMap, signal?: AbortSignal) => Promise<Map<string, SamplePCMEntry>>;
  getLayerClickPCMsForSchedule: (ticks: TickInfo[], signal?: AbortSignal) => Promise<Map<string, ClickPCMs>>;
  barMetronomeChannelRef: Ref<SampleChannel>;
  noteSampleMetroChannelsRef: Ref<NoteSampleMetroChannelMap>;
  notifyVoicePlayState: (playing: boolean) => void;
  languageRef: Ref<Language>;
  notifyUserToggle: () => Promise<unknown> | undefined;
  showPlayingNotification: (bpm: number, mode: string, language?: Language) => void | Promise<void>;
  showPausedNotification: (bpm: number, mode: string, language?: Language) => void | Promise<void>;
  showPlaybackStartFailure: () => void;
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
  const startAttemptRef = useRef(0);

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
      const cfg = p.barConfigRef.current;
      engine.setBeatTypes([...(cfg.beatTypes || [])]);
      engine.setAllBeatSubdivisions(cfg.beatSubdivisions || {});
      engine.setAllBarRepeats(cfg.barRepeats || {});
      engine.setLoopBlocks(cfg.loopBlocks || []);
      engine.setBlockPlayMode(cfg.blockPlayMode ?? p.blockPlayModeRef.current);
      const bpmOverrides: Record<number, number> = {};
      for (const [key, repeat] of Object.entries(cfg.barRepeats || {})) {
        if (repeat.bpm) {
          bpmOverrides[Number(key)] = toEngineBpm(
            repeat.bpm,
            repeat.meterDenominator ?? p.beatDenominatorRef.current,
          );
        }
      }
      engine.setAllBarBpmOverrides(bpmOverrides);
    } else {
      // The Beat-owned ref is updated synchronously by every rhythm editor.
      // Reading it here avoids a Bar→Beat transition applying stale shared
      // render state before React commits the restored Beat profile.
      const cfg = p.dialConfigRef.current;
      applyDialConfigToEngine(engine, {
        beatsPerMeasure: cfg.beatsPerMeasure,
        beatTypes: [...cfg.beatTypes],
        beatSubdivisions: Object.fromEntries(
          Object.entries(cfg.beatSubdivisions).map(([key, pattern]) => [key, [...pattern]]),
        ),
      });
    }
    engine.buildScheduleOnly();
  }, [p]);

  const renderWebLoop = useCallback(async (engine: MetronomeEngine, atMeasureBoundary: boolean) => {
    const generation = ++renderGenerationRef.current;
    const signal = beginAbortableRender(renderGenerationRef);
    try {
      if (atMeasureBoundary && !p.engineRef.current?.getIsRunning()) return;
      const scheduleInfo = engine.getScheduleInfo();
      const ticks = scheduleInfo.ticks as TickInfo[];
      const [clickPCMs, layerClickPCMs, samplePCMs] = await Promise.all([
        p.getClickPCMs(p.soundSetRef.current, signal),
        p.getLayerClickPCMsForSchedule(ticks, signal),
        p.getSamplePCMs(p.noteSamplesRef.current, signal),
      ]);
      if (
        generation !== renderGenerationRef.current ||
        (atMeasureBoundary && !p.engineRef.current?.getIsRunning())
      ) return;
      const pcm = await renderMeasureAbortable({
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
      }, signal);
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
    } catch (error) {
      if (!isRenderAborted(error)) throw error;
    } finally {
      finishAbortableRender(renderGenerationRef, signal);
    }
  }, [p]);

  const stopMetronome = useCallback(() => {
    if (!p.isPlayingRef.current && !p.isPreparingRef.current) return;
    startAttemptRef.current += 1;
    renderGenerationRef.current += 1;
    abortActiveRender(renderGenerationRef);
    p.preparingCancelledRef.current = true;
    p.invalidateAudioStartupProbe();
    p.clearAudioWatchdogRef.current();
    p.engineRef.current?.stop();
    p.stopRenderedAudio();
    p.clearSamplePlayStates();
    p.setIsPreparing(false);
    p.isPreparingRef.current = false;
    p.setIsPlaying(false);
    p.isPlayingRef.current = false;
    p.notifyVoicePlayState(false);
    p.resetPlaybackVisuals();
    markAudioStopped();
    completePracticeSession("manual");
    p.onPlaybackStopped?.();
  }, [completePracticeSession, p, renderGenerationRef]);

  const cancelPlaybackAttempt = useCallback((
    notifyFailure = false,
    preserveLifecycle = false,
  ) => {
    startAttemptRef.current += 1;
    renderGenerationRef.current += 1;
    abortActiveRender(renderGenerationRef);
    p.preparingCancelledRef.current = true;
    p.invalidateAudioStartupProbe();
    p.clearAudioWatchdogRef.current();
    p.engineRef.current?.stop();
    p.stopRenderedAudio();
    p.clearSamplePlayStates();
    p.setIsPreparing(false);
    p.isPreparingRef.current = false;
    p.setIsPlaying(false);
    p.isPlayingRef.current = false;
    p.notifyVoicePlayState(false);
    p.resetPlaybackVisuals();
    if (!preserveLifecycle) markAudioStopped();
    if (notifyFailure) p.showPlaybackStartFailure();
    p.onPlaybackStopped?.();
  }, [p, renderGenerationRef]);

  const startPreparedPlayback = useCallback(async (
    engine: MetronomeEngine,
    startBeat: number | undefined,
    androidProbeReady?: Promise<unknown>,
  ): Promise<boolean> => {
    const attempt = ++startAttemptRef.current;
    const startupEpoch = p.beginAudioStartupProbe();
    const deadline = Date.now() + 8000;
    const cancelled = () =>
      attempt !== startAttemptRef.current || p.preparingCancelledRef.current;
    const remainingMs = () => Math.max(0, deadline - Date.now());
    const awaitWithin = async <T,>(promise: Promise<T>, label: string): Promise<T> => {
      const remaining = remainingMs();
      if (remaining <= 0) throw new Error(`Audio startup timed out: ${label}`);
      return Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          setTimeout(() => reject(new Error(`Audio startup timed out: ${label}`)), remaining);
        }),
      ]);
    };
    const setPreparing = (value: boolean) => {
      p.isPreparingRef.current = value;
      p.setIsPreparing(value);
    };
    const setPlaying = (value: boolean) => {
      p.isPlayingRef.current = value;
      p.setIsPlaying(value);
    };
    p.resetPlaybackVisuals();
    p.clearSamplePlayStates();
    markAudioPreparing();
    setPreparing(true);
    setPlaying(false);
    p.preparingCancelledRef.current = false;
    p.stopRenderedAudio();
    configureEngine(engine);

    try {
      if (Platform.OS === "android" && androidProbeReady) {
        await awaitWithin(androidProbeReady, "Android audio focus");
      }
      if (cancelled()) {
        return false;
      }

      // Native per-tick playback seeks pooled players asynchronously. Under dense
      // subdivisions those seeks can resolve out of order across normal/accent
      // pools, so native playback always attempts one deterministic rendered loop
      // first. A render failure still falls back to the realtime callbacks below.
      const useRenderedLoop = Platform.OS === "web"
        ? p.barModeRef.current || String(p.soundSetRef.current).startsWith("custom")
        : true;

      if (Platform.OS === "web") {
        const context = getWebAudioContext();
        if (context?.state === "suspended") {
          await awaitWithin(context.resume(), "Web AudioContext resume");
        }
        const source = soundSets[p.soundSetRef.current as keyof typeof soundSets] || soundSets.classic;
        const buffersReady = p.webClickReadyRef.current ||
          await awaitWithin(ensureWebClickBuffers(source as never).catch(() => false), "Web click buffers");
        if (!buffersReady) throw new Error("Web click buffers were not ready");
        p.webClickReadyRef.current = true;
        if (context?.state === "suspended") {
          await awaitWithin(context.resume(), "Web AudioContext resume");
        }
        if (cancelled()) {
          return false;
        }

        if (useRenderedLoop) {
          await awaitWithin(renderWebLoop(engine, false), "Web rendered loop");
          if (cancelled()) {
            return false;
          }
          if (!p.webRenderedLoopRef.current?.isRunning()) {
            throw new Error("Web rendered loop did not start");
          }
          engine.start(startBeat);
        } else {
          engine.setPreRenderedAudio(false);
          const ticks = engine.getScheduleInfo().ticks as TickInfo[];
          const expectsAudio = ticks.some((tick) => tick.type !== "mute") ||
            Object.keys(p.noteSamplesRef.current).length > 0;
          engine.start(startBeat);
          const active = !expectsAudio || await p.waitForFirstAudioActivity(
            startupEpoch,
            cancelled,
            remainingMs(),
          );
          if (!active) throw new Error("No initial Web Audio activity");
        }
      } else {
        const player = useRenderedLoop
          ? await awaitWithin(p.buildRenderedPlayer(), "Native rendered player")
          : null;
        if (cancelled()) {
          try { player?.release(); } catch {}
          return false;
        }
        if (player) {
          p.renderedPlayerRef.current = player;
          engine.setPreRenderedAudio(true);
          // safePlayAndConfirm invokes play() synchronously before returning its
          // confirmation promise. Start the engine in the same turn so rendered
          // audio and visual scheduling share one launch anchor; only publishing
          // the playing UI waits for confirmation.
          const playConfirmation = safePlayAndConfirm(player, "metronome.start.native");
          engine.start(startBeat);
          const accepted = await awaitWithin(
            playConfirmation,
            "Native playback request",
          );
          if (!accepted) throw new Error("Native rendered player rejected playback");
          if (cancelled()) {
            return false;
          }
        } else {
          engine.setPreRenderedAudio(false);
          const ticks = engine.getScheduleInfo().ticks as TickInfo[];
          const expectsAudio = ticks.some((tick) => tick.type !== "mute") ||
            Object.keys(p.noteSamplesRef.current).length > 0;
          engine.start(startBeat);
          const active = !expectsAudio || await p.waitForFirstAudioActivity(
            startupEpoch,
            cancelled,
            remainingMs(),
          );
          if (!active) throw new Error("No initial native audio activity");
        }
      }

      if (cancelled()) {
        return false;
      }
      setPreparing(false);
      setPlaying(true);
      p.flushPlaybackVisuals();
      p.notifyVoicePlayState(true);
      markAudioPlaying();
      p.armAudioWatchdogRef.current();
      const playback = p.getPlaybackContext({ activeBarIndex: startBeat ?? 0 });
      p.showPlayingNotification(playback.bpm, playback.modeLabel, p.languageRef.current);
      startOrResumePracticeSession();
      if (p.barModeRef.current && p.barLoopModeRef.current === "once") {
        engine.requestStopAfterMeasure();
      }
      return true;
    } catch (error) {
      if (cancelled()) return false;
      p.capturePlaybackError("Audio startup failed", error, "warning");
      cancelPlaybackAttempt(true);
      return false;
    }
  }, [cancelPlaybackAttempt, configureEngine, p, renderWebLoop, startOrResumePracticeSession]);

  const togglePlayPause = useCallback(async () => {
    const engine = p.engineRef.current;
    if (!engine) return false;
    if (p.easterEggActiveRef.current) {
      p.handleEasterEggGiveUpRef.current(true);
      return true;
    }
    if (p.isPreparingRef.current && !p.isPlayingRef.current) {
      p.notifyUserToggle();
      const interrupted = ["interrupted", "recovering"].includes(getAudioLifecycleSnapshot().phase);
      cancelPlaybackAttempt(false, interrupted);
      return true;
    }
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (p.isPlayingRef.current) {
      p.notifyUserToggle();
      startAttemptRef.current += 1;
      renderGenerationRef.current += 1;
      p.invalidateAudioStartupProbe();
      const playback = p.getPlaybackContext();
      seamlessRef.current = null;
      p.clearAudioWatchdogRef.current();
      engine.stop();
      p.stopRenderedAudio();
      p.clearSamplePlayStates();
      p.setIsPreparing(false);
      p.isPreparingRef.current = false;
      p.setIsPlaying(false);
      p.isPlayingRef.current = false;
      p.notifyVoicePlayState(false);
      p.resetPlaybackVisuals();
      const interrupted = ["interrupted", "recovering"].includes(getAudioLifecycleSnapshot().phase);
      if (!interrupted) markAudioStopped();
      p.showPausedNotification(playback.bpm, playback.modeLabel, p.languageRef.current);
      pausePracticeSession(interrupted);
      p.onPlaybackStopped?.();
      return;
    }

    const androidProbeReady = p.notifyUserToggle();
    const startBeat = p.barModeRef.current ? p.barStartBeatRef.current : undefined;
    return startPreparedPlayback(engine, startBeat ?? undefined, androidProbeReady);
  }, [cancelPlaybackAttempt, p, pausePracticeSession, renderGenerationRef, seamlessRef, startPreparedPlayback]);

  const togglePlayPauseRef = useRef(togglePlayPause);
  useEffect(() => { togglePlayPauseRef.current = togglePlayPause; }, [togglePlayPause]);

  const startMetronome = useCallback(async () => {
    const engine = p.engineRef.current;
    if (!engine || p.isPlayingRef.current || p.isPreparingRef.current) return;
    await startPreparedPlayback(engine, undefined);
  }, [p, startPreparedPlayback]);

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
    cancelPlaybackAttempt,
    completePracticeSession,
    discardPracticeSession,
    startOrResumePracticeSession,
    seamlessNextEntryRef: seamlessRef,
  };
}
