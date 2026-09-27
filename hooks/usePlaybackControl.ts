import { useCallback, useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { soundSets } from "@/lib/metronome-engine";
import {
  ensureWebClickBuffers,
  getWebAudioContext,
  renderMeasureAbortable,
  isRenderAborted,
} from "@/lib/audio-renderer";
import type { ClickPCMs, SamplePCMEntry, TickInfo } from "@/lib/audio-renderer";
import type { BeatType, MetronomeEngine } from "@/lib/metronome-engine";
import type { BarConfig, DialConfig } from "@/lib/index.helpers";
import type { CustomSoundSetConfig, PracticeEntry, SoundSet } from "@/lib/storage";
import { PracticeSessionTracker, type PracticeSessionData } from "@/lib/activity-log";
import type { Language } from "@/lib/i18n";
import type { SampleChannel } from "@/lib/stereo-channel";
import type { TonePosition } from "@/lib/metronome-tone-dsp";
import {
  readAudioToneSnapshot,
  type AudioToneSnapshot,
} from "@/lib/audio-tone-snapshot";
import {
  applyMetronomePlaybackPlan,
  buildPlaybackPlan,
  type MetronomePlaybackPlan,
} from "@/lib/audio-playback-plan";
import type {
  NoteSampleChannelMap,
  NoteSampleMap,
  NoteSampleMetroChannelMap,
  NoteSampleSpeedMap,
  NoteSampleVolumeMap,
} from "@/lib/note-samples";

import type { PlaybackContext } from "@/lib/playback-context";
import type {
  AudioRenderLifecycle,
  AudioRenderResult,
} from "@/lib/audio-render-lifecycle";
import {
  publishAudioOutput,
  type AudioOutputOwner,
  type AudioOutputResource,
} from "@/lib/audio-output-owner";
import type { WebAudioOutput } from "@/lib/web-audio-output";
import {
  getAudioLifecycleSnapshot,
  markAudioPlaying,
  markAudioPreparing,
  markAudioRecovering,
  markAudioStopped,
} from "@/lib/audio-lifecycle";
import {
  beginBackgroundPlaybackLease,
  endBackgroundPlaybackLease,
  type BackgroundPlaybackLease,
} from "@/lib/background-playback-lease";
import {
  isSparseMetronomeAvailable,
  SparseMetronome,
  addSparseMetronomeErrorListener,
  addSparseMetronomeInterruptionListener,
  addSparseMetronomeReplacementListener,
  addSparseMetronomeTimingOverrunListener,
} from "@/modules/sparse-metronome/src";
import { prepareSparseEvents, type PreparedSparseEvents } from "@/lib/audio-sparse-event-preparation";
import {
  registerSparsePlaybackStopper,
  setSparseNotificationMode,
  setSparsePlaybackActive,
} from "@/lib/notification-controls";

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
  previewNextRandomBarChunk?: (engine: MetronomeEngine) =>
    { ticks: TickInfo[]; durationMs: number } | null;
  beatDenominatorRef: Ref<2 | 4 | 8>;
  seamlessNextEntryRef?: Ref<PracticeEntry | null>;
  stopRenderedAudio: () => void;
  stopPlaybackAudio: () => void;
  clearSamplePlayStates: () => void;
  resetPlaybackVisuals: () => void;
  flushPlaybackVisuals: () => void;
  outputOwner: AudioOutputOwner;
  beginAudioStartupProbe: () => number;
  invalidateAudioStartupProbe: () => void;
  waitForFirstAudioActivity: (epoch: number, isCancelled?: () => boolean, timeoutMs?: number) => Promise<boolean>;
  audioRenderLifecycle: AudioRenderLifecycle;
  prepareRenderedPlayer: (
    plan?: MetronomePlaybackPlan,
    toneSnapshotOverride?: AudioToneSnapshot,
  ) => Promise<
    AudioRenderResult<AudioOutputResource>
  >;
  clearAudioWatchdogRef: Ref<() => void>;
  armAudioWatchdogRef: Ref<() => void>;
  soundSetRef: Ref<SoundSet>;
  captureAudioToneSnapshot: () => AudioToneSnapshot;
  setActiveAudioToneSnapshot: (snapshot: AudioToneSnapshot) => void;
  customSoundSetsRef?: Ref<Record<string, CustomSoundSetConfig>>;
  sampleVolumeRef: Ref<number>;
  noteSamplesRef: Ref<NoteSampleMap>;
  noteSampleChannelsRef: Ref<NoteSampleChannelMap>;
  noteSampleVolumesRef: Ref<NoteSampleVolumeMap>;
  noteSampleSpeedsRef: Ref<NoteSampleSpeedMap>;
  webClickReadyRef: Ref<boolean>;
  getClickPCMs: (
    soundSet: SoundSet,
    signal?: AbortSignal,
    toneSnapshot?: AudioToneSnapshot,
    customConfigOverride?: Readonly<CustomSoundSetConfig> | null,
  ) => Promise<ClickPCMs>;
  getSamplePCMs: (samples: NoteSampleMap, signal?: AbortSignal) => Promise<Map<string, SamplePCMEntry>>;
  getLayerClickPCMsForSchedule: (
    ticks: TickInfo[],
    signal?: AbortSignal,
    snapshot?: {
      defaultSoundSet: SoundSet;
      layerSoundSets: Readonly<Record<number, SoundSet>>;
      tone: AudioToneSnapshot;
      customSoundSets: Readonly<Record<string, Readonly<CustomSoundSetConfig>>>;
    },
  ) => Promise<Map<string, ClickPCMs>>;
  barMetronomeChannelRef: Ref<SampleChannel>;
  noteSampleMetroChannelsRef: Ref<NoteSampleMetroChannelMap>;
  layerSoundSetsRef?: Ref<Record<number, SoundSet>>;
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
  const startAttemptRef = useRef(0);
  const scheduledStartTokenRef = useRef<symbol | null>(null);
  const backgroundLeaseRef = useRef<BackgroundPlaybackLease | null>(null);
  const sparseSessionRef = useRef<{
    id: string;
    prepared: PreparedSparseEvents;
    maxDurationMs: number;
    periodFrames: number;
  } | null>(null);
  const sparsePendingRef = useRef<{
    id: string;
    prepared: PreparedSparseEvents;
    maxDurationMs: number;
    periodFrames: number;
  } | null>(null);
  const sparseGenerationRef = useRef(0);
  const sparseAbortRef = useRef<AbortController | null>(null);
  const sparseFatalHandlerRef = useRef<((message: string, error?: unknown) => void) | null>(null);
  const sparseReplaceHandlerRef = useRef<((event: { previousSessionId: string; sessionId: string; boundaryWallClockTimeMillis?: number }) => void) | null>(null);
  const sparseListenersRef = useRef<{ remove(): void }[]>([]);
  const togglePlayPauseRef = useRef<() => Promise<boolean | undefined>>(
    async () => undefined,
  );
  const invalidateAudioStartupProbe = p.invalidateAudioStartupProbe;
  const preparingCancelledRef = p.preparingCancelledRef;

  const releaseBackgroundLease = useCallback(() => {
    endBackgroundPlaybackLease(backgroundLeaseRef.current);
    backgroundLeaseRef.current = null;
  }, []);

  const disposeSparseSession = useCallback((
    session: { id: string; prepared: PreparedSparseEvents; maxDurationMs: number } | null,
    stopNative: boolean,
  ) => {
    if (!session) return;
    const disposeFiles = () => session.prepared.dispose();
    if (!stopNative) {
      setTimeout(disposeFiles, Math.max(250, session.maxDurationMs + 250));
      return;
    }
    void SparseMetronome.stop(session.id).then(disposeFiles, () => {
      // Keep decoder source files available if native did not confirm a stop.
      setTimeout(disposeFiles, Math.max(1500, session.maxDurationMs + 250));
    });
  }, []);

  const stopSparsePlayback = useCallback(() => {
    sparseGenerationRef.current += 1;
    sparseAbortRef.current?.abort();
    sparseAbortRef.current = null;
    sparseReplaceHandlerRef.current = null;
    const active = sparseSessionRef.current;
    const pending = sparsePendingRef.current;
    sparseSessionRef.current = null;
    sparsePendingRef.current = null;
    setSparsePlaybackActive(false);
    disposeSparseSession(active, true);
    if (pending && pending.id !== active?.id) disposeSparseSession(pending, true);
  }, [disposeSparseSession]);

  const prepareSparseSchedule = useCallback(async (
    plan: MetronomePlaybackPlan,
    scheduleInfo: { ticks: TickInfo[]; durationMs: number },
    generation: number,
  ) => {
    if (!isSparseMetronomeAvailable) {
      throw new Error("Android sparse audio is unavailable in this build; no continuous-audio fallback is permitted.");
    }
    const controller = new AbortController();
    sparseAbortRef.current = controller;
    const shouldAbort = () => generation !== sparseGenerationRef.current ||
      p.preparingCancelledRef.current;
    const [clickPCMs, layerClickPCMs, samplePCMs] = await Promise.all([
      p.getClickPCMs(
        plan.audio.soundSet,
        controller.signal,
        plan.audio.tone,
        plan.audio.customSoundSets[plan.audio.soundSet] ?? null,
      ),
      p.getLayerClickPCMsForSchedule(scheduleInfo.ticks, controller.signal, {
        defaultSoundSet: plan.audio.soundSet,
        layerSoundSets: plan.audio.layerSoundSets,
        tone: plan.audio.tone,
        customSoundSets: plan.audio.customSoundSets,
      }),
      p.getSamplePCMs(plan.audio.noteSamples, controller.signal),
    ]);
    if (shouldAbort()) throw new Error("Sparse audio preparation was cancelled.");
    const prepared = await prepareSparseEvents({
      schedule: scheduleInfo.ticks,
      measureDurationMs: scheduleInfo.durationMs,
      clickPCMs,
      layerClickPCMs,
      samplePCMs,
      clickVolume: plan.audio.tone.renderGain,
      sampleVolume: samplePCMs.size > 0 ? plan.audio.sampleVolume : 0,
      sampleVolumes: plan.audio.noteSampleVolumes,
      sampleSpeeds: plan.audio.noteSampleSpeeds,
      sampleChannels: plan.audio.noteSampleChannels,
      metronomeChannel: plan.audio.metronomeChannel,
      metroChannelsByBeat: plan.mode === "bar" ? plan.audio.noteSampleMetroChannels : undefined,
      outputGain: plan.audio.tone.outputGain,
    }, { signal: controller.signal, shouldAbort });
    if (sparseAbortRef.current === controller) sparseAbortRef.current = null;
    if (shouldAbort()) {
      prepared.dispose();
      throw new Error("Sparse audio preparation was cancelled.");
    }
    const id = `sparse-${Date.now()}-${generation}-${Math.random().toString(36).slice(2)}`;
    try {
      await SparseMetronome.prepare(id, prepared.clipDescriptors, prepared.periodFrames);
      if (shouldAbort()) {
        void SparseMetronome.stop(id).finally(() => prepared.dispose());
        throw new Error("Sparse audio preparation was cancelled.");
      }
    } catch (error) {
      prepared.dispose();
      throw error;
    }
    return {
      id,
      prepared,
      maxDurationMs: prepared.clipDescriptors.reduce(
        (max, event) => Math.max(max, event.durationFrames / 44.1),
        0,
      ),
      periodFrames: prepared.periodFrames,
    };
  }, [p]);

  sparseFatalHandlerRef.current = (message: string, error?: unknown) => {
    if (!sparseSessionRef.current && !sparsePendingRef.current) return;
    startAttemptRef.current += 1;
    p.preparingCancelledRef.current = true;
    p.capturePlaybackError(message, error ?? message, "error");
    stopSparsePlayback();
    p.stopPlaybackAudio();
    p.setIsPreparing(false);
    p.isPreparingRef.current = false;
    p.setIsPlaying(false);
    p.isPlayingRef.current = false;
    p.notifyVoicePlayState(false);
    p.resetPlaybackVisuals();
    markAudioStopped();
    p.showPlaybackStartFailure();
    completePracticeSession("audio_interruption", "abandoned");
    p.onPlaybackStopped?.();
  };

  useEffect(() => {
    registerSparsePlaybackStopper(stopSparsePlayback);
    const ownsSession = (id?: string) => !!id && (
      sparseSessionRef.current?.id === id || sparsePendingRef.current?.id === id
    );
    sparseListenersRef.current = [
      addSparseMetronomeErrorListener?.((event) => {
        if (ownsSession(event.sessionId)) sparseFatalHandlerRef.current?.(event.message, event);
      }),
      addSparseMetronomeInterruptionListener?.((event) => {
        if (ownsSession(event.sessionId)) sparseFatalHandlerRef.current?.("Android audio focus was interrupted.", event);
      }),
      addSparseMetronomeTimingOverrunListener?.((event) => {
        // The native clock skips late events and keeps running. Report the
        // recoverable delay without tearing down the session.
        if (ownsSession(event.sessionId)) {
          p.capturePlaybackError("Android sparse scheduling delay", event, "warning");
        }
      }),
      addSparseMetronomeReplacementListener?.((event) => {
        if (ownsSession(event.previousSessionId) || ownsSession(event.sessionId)) {
          sparseReplaceHandlerRef.current?.(event);
        }
      }),
    ].filter((listener): listener is { remove(): void } => !!listener);
    return () => {
      registerSparsePlaybackStopper(null);
      for (const listener of sparseListenersRef.current) listener.remove();
      sparseListenersRef.current = [];
      stopSparsePlayback();
      invalidateAudioStartupProbe();
    };
  }, [invalidateAudioStartupProbe, stopSparsePlayback]);

  useEffect(() => () => {
    // A focus/buffer/scheduled-start await may resolve after the owning screen
    // has unmounted. Invalidate the attempt before any continuation can start
    // the engine or publish React/audio lifecycle state.
    scheduledStartTokenRef.current = null;
    startAttemptRef.current += 1;
    preparingCancelledRef.current = true;
    invalidateAudioStartupProbe();
    releaseBackgroundLease();
  }, [invalidateAudioStartupProbe, preparingCancelledRef, releaseBackgroundLease]);

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
  }, [p]);

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

  const renderWebLoop = useCallback(async (
    engine: MetronomeEngine,
    plan: MetronomePlaybackPlan,
    atMeasureBoundary: boolean,
    startAtPerformanceTime?: number,
  ): Promise<
    | { status: "completed" }
    | { status: "cancelled" }
    | { status: "superseded" }
    | { status: "failed"; error: unknown }
  > => {
    const session = p.audioRenderLifecycle.start();
    const signal = session.signal;
    try {
      if (atMeasureBoundary && !p.engineRef.current?.getIsRunning()) {
        p.audioRenderLifecycle.cancel();
        return session.interruption();
      }
      const scheduleInfo = engine.getScheduleInfo();
      const ticks = scheduleInfo.ticks as TickInfo[];
      readAudioToneSnapshot(plan.audio.tone, plan.audio.soundSet);
      const [clickPCMs, layerClickPCMs, samplePCMs] = await Promise.all([
        p.getClickPCMs(
          plan.audio.soundSet,
          signal,
          plan.audio.tone,
          plan.audio.customSoundSets[plan.audio.soundSet] ?? null,
        ),
        p.getLayerClickPCMsForSchedule(ticks, signal, {
          defaultSoundSet: plan.audio.soundSet,
          layerSoundSets: plan.audio.layerSoundSets,
          tone: plan.audio.tone,
          customSoundSets: plan.audio.customSoundSets,
        }),
        p.getSamplePCMs(plan.audio.noteSamples, signal),
      ]);
      if (
        !session.isCurrent() ||
        (atMeasureBoundary && !p.engineRef.current?.getIsRunning())
      ) {
        if (session.isCurrent()) p.audioRenderLifecycle.cancel();
        return session.interruption();
      }
      const pcm = await renderMeasureAbortable({
        schedule: ticks,
        measureDurationMs: scheduleInfo.durationMs,
        clickPCMs,
        samplePCMs,
        clickVolume: plan.audio.tone.renderGain,
        sampleVolume: samplePCMs.size > 0 ? plan.audio.sampleVolume : 0,
        sampleVolumes: plan.audio.noteSampleVolumes,
        sampleSpeeds: plan.audio.noteSampleSpeeds,
        sampleChannels: plan.audio.noteSampleChannels,
        metronomeChannel: plan.audio.metronomeChannel,
        metroChannelsByBeat: plan.mode === "bar" ? plan.audio.noteSampleMetroChannels : undefined,
        layerClickPCMs,
      }, signal);
      const preparedPcm = session.complete(pcm, () => {});
      if (preparedPcm.status !== "completed") return preparedPcm;
      const prepared = preparedPcm.prepared;
      if (atMeasureBoundary) {
        engine.setPendingMeasureStartAction(() => {
          if (!p.engineRef.current?.getIsRunning()) {
            prepared.discard();
            return;
          }
          prepared.commit((readyPcm) => {
          const previous = p.outputOwner.active();
          const previousDuration = previous?.getDurationSeconds?.();
          const nextDuration = (readyPcm instanceof Float32Array
            ? readyPcm.length
            : Math.min(readyPcm.left.length, readyPcm.right.length)) / 44100;
          const phaseCompatible = previousDuration !== undefined
            && Math.abs(previousDuration - nextDuration) < 0.001;
          const boundary = phaseCompatible ? previous?.getNextBoundaryTime?.() : undefined;
          const next = (p.outputOwner.adapter as WebAudioOutput).rendered(
            readyPcm,
            plan.audio.tone.outputGain,
            "both",
            boundary,
          );
          publishAudioOutput(p.outputOwner, next, { replaceAtAudioTime: boundary });
          p.outputOwner.transition("prerender");
          p.engineRef.current?.setPreRenderedAudio(true);
          });
        });
        return { status: "completed" };
      } else {
        let loop: AudioOutputResource | null = null;
        const committed = prepared.commit((readyPcm) => {
          const context = getWebAudioContext();
          const now = typeof performance !== "undefined" ? performance.now() : Date.now();
          const startAtAudioTime = startAtPerformanceTime !== undefined && context
            ? context.currentTime + Math.max(0, startAtPerformanceTime - now) / 1000
            : undefined;
          loop = (p.outputOwner.adapter as WebAudioOutput).rendered(
            readyPcm,
            plan.audio.tone.outputGain,
            "both",
            startAtAudioTime,
          );
          publishAudioOutput(p.outputOwner, loop);
          p.outputOwner.transition("prerender");
          engine.setPreRenderedAudio(true);
        });
        if (!committed || !loop) return session.interruption();
        return { status: "completed" };
      }
    } catch (error) {
      if (isRenderAborted(error) || !session.isCurrent()) return session.interruption();
      return session.fail(error);
    }
  }, [p]);

  const stopMetronome = useCallback((
    endReason: NonNullable<PracticeSessionData["endReason"]> = "manual",
  ) => {
    if (!p.isPlayingRef.current && !p.isPreparingRef.current) return;
    scheduledStartTokenRef.current = null;
    startAttemptRef.current += 1;
    p.preparingCancelledRef.current = true;
    stopSparsePlayback();
    p.stopPlaybackAudio();
    p.setIsPreparing(false);
    p.isPreparingRef.current = false;
    p.setIsPlaying(false);
    p.isPlayingRef.current = false;
    p.notifyVoicePlayState(false);
    p.resetPlaybackVisuals();
    markAudioStopped();
    completePracticeSession(endReason);
    p.onPlaybackStopped?.();
    releaseBackgroundLease();
  }, [completePracticeSession, p, releaseBackgroundLease, stopSparsePlayback]);

  const cancelPlaybackAttempt = useCallback((
    notifyFailure = false,
    preserveLifecycle = false,
  ) => {
    scheduledStartTokenRef.current = null;
    startAttemptRef.current += 1;
    p.preparingCancelledRef.current = true;
    stopSparsePlayback();
    p.stopPlaybackAudio();
    p.setIsPreparing(false);
    p.isPreparingRef.current = false;
    p.setIsPlaying(false);
    p.isPlayingRef.current = false;
    p.notifyVoicePlayState(false);
    p.resetPlaybackVisuals();
    if (!preserveLifecycle) markAudioStopped();
    if (notifyFailure) p.showPlaybackStartFailure();
    p.onPlaybackStopped?.();
    releaseBackgroundLease();
  }, [p, releaseBackgroundLease, stopSparsePlayback]);

  const startPreparedPlayback = useCallback(async (
    engine: MetronomeEngine,
    startBeat: number | undefined,
    androidProbeReady?: Promise<unknown>,
    startAtPerformanceTime?: number,
    options: {
      configureEngine?: boolean;
      stopAfterMeasure?: boolean;
    } = {},
  ): Promise<boolean> => {
    const playbackAtStart = p.getPlaybackContext({ activeBarIndex: startBeat ?? 0 });
    const toneSnapshot = p.captureAudioToneSnapshot();
    const startTone = readAudioToneSnapshot(toneSnapshot, p.soundSetRef.current);
    if (!Number.isFinite(startTone.intensity)) {
      throw new Error("Audio tone snapshot is invalid");
    }
    const audio = {
      soundSet: p.soundSetRef.current,
      sampleVolume: p.sampleVolumeRef.current,
      tone: toneSnapshot,
      customSoundSets: p.customSoundSetsRef?.current ?? {},
      noteSamples: p.noteSamplesRef.current,
      noteSampleChannels: p.noteSampleChannelsRef.current,
      noteSampleVolumes: p.noteSampleVolumesRef.current,
      noteSampleSpeeds: p.noteSampleSpeedsRef.current,
      metronomeChannel: p.barModeRef.current ? p.barMetronomeChannelRef.current : "both" as const,
      noteSampleMetroChannels: p.noteSampleMetroChannelsRef.current,
      layerSoundSets: p.layerSoundSetsRef?.current ?? {},
    };
    const plan = buildPlaybackPlan(
      options.configureEngine === false || playbackAtStart.mode === "note"
        ? {
            mode: "note",
            platform: Platform.OS === "web" ? "web" : "native",
            bpm: playbackAtStart.bpm,
            audio,
            stopAfterMeasure: options.stopAfterMeasure ?? false,
          }
        : p.barModeRef.current
        ? {
            mode: "bar",
            platform: Platform.OS === "web" ? "web" : "native",
            bpm: playbackAtStart.bpm,
            audio,
            config: p.barConfigRef.current,
            startBeat,
            denominator: p.beatDenominatorRef.current,
            blockPlayMode: p.blockPlayModeRef.current,
          }
        : {
            mode: "beat",
            platform: Platform.OS === "web" ? "web" : "native",
            bpm: playbackAtStart.bpm,
            audio,
            config: p.dialConfigRef.current,
          },
    );
    p.setActiveAudioToneSnapshot(plan.audio.tone);
    const attempt = ++startAttemptRef.current;
    const startupEpoch = p.beginAudioStartupProbe();
    let deadline = Date.now() + 8000;
    const cancelled = () =>
      attempt !== startAttemptRef.current || p.preparingCancelledRef.current;
    const remainingMs = () => Math.max(0, deadline - Date.now());
    const waitForScheduledStart = async () => {
      if (startAtPerformanceTime === undefined) return;
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      const delay = startAtPerformanceTime - now;
      if (delay > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
      }
      deadline = Math.max(deadline, Date.now() + 2000);
    };
    const startEngine = () => {
      if (startAtPerformanceTime !== undefined && Platform.OS === "web") {
        engine.start({ startFromBeat: startBeat, startAtPerformanceTime });
      } else {
        engine.start(startBeat);
      }
    };
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
    if (options.configureEngine !== false) {
      applyMetronomePlaybackPlan(engine, plan);
    }

    try {
      releaseBackgroundLease();
      const useSparseAndroid =
        Platform.OS === "android" &&
        (plan.mode === "beat" || plan.mode === "bar") &&
        // Keep the existing default until a custom Android build has passed
        // locked-screen, interruption and wired-output device verification.
        process.env.EXPO_PUBLIC_ENABLE_ANDROID_SPARSE_AUDIO === "1";
      if (useSparseAndroid) {
        if (!isSparseMetronomeAvailable) {
          throw new Error("Android sparse audio is unavailable in this build; no continuous-audio fallback is permitted.");
        }
      } else {
        setSparseNotificationMode(false);
        const backgroundLease = beginBackgroundPlaybackLease({
          isPlaying: () => p.isPlayingRef.current || p.isPreparingRef.current,
          pause: () => togglePlayPauseRef.current(),
          resume: () => togglePlayPauseRef.current(),
        });
        backgroundLeaseRef.current = backgroundLease.token;
        // Do not block other modes on their optional playback lease.
        void backgroundLease.ready;
      }
      if (cancelled()) {
        releaseBackgroundLease();
        return false;
      }
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
      const useRenderedLoop = plan.output.strategy === "prerender";

      if (Platform.OS === "web") {
        const context = getWebAudioContext();
        if (context?.state === "suspended") {
          await awaitWithin(context.resume(), "Web AudioContext resume");
        }
        const source = soundSets[plan.audio.soundSet as keyof typeof soundSets] || soundSets.classic;
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
          const webRenderResult = await awaitWithin(
            renderWebLoop(engine, plan, false, startAtPerformanceTime),
            "Web rendered loop",
          );
          if (webRenderResult.status === "cancelled" || webRenderResult.status === "superseded") {
            cancelPlaybackAttempt(false);
            return false;
          }
          if (webRenderResult.status === "failed") throw webRenderResult.error;
          if (cancelled()) {
            return false;
          }
          if (!p.outputOwner.active()?.isRunning?.()) {
            throw new Error("Web rendered loop did not start");
          }
          startEngine();
          await waitForScheduledStart();
        } else {
          engine.setPreRenderedAudio(false);
          const ticks = engine.getScheduleInfo().ticks as TickInfo[];
          const expectsAudio = ticks.some((tick) => tick.type !== "mute") ||
            Object.keys(plan.audio.noteSamples).length > 0;
          startEngine();
          await waitForScheduledStart();
          const active = !expectsAudio || await p.waitForFirstAudioActivity(
            startupEpoch,
            cancelled,
            remainingMs(),
          );
          if (!active) throw new Error("No initial Web Audio activity");
        }
      } else if (useSparseAndroid) {
        stopSparsePlayback();
        const sparseGeneration = sparseGenerationRef.current;
        const initialInfo = engine.getScheduleInfo();
        const randomBar = plan.mode === "bar" && p.blockPlayModeRef.current === "random";
        const upcoming = randomBar
          ? engine.getUpcomingRandomScheduleInfo() ?? p.previewNextRandomBarChunk?.(engine) ?? null
          : null;
        if (randomBar && !upcoming) {
          throw new Error("Random Bar playback could not preselect its next sparse schedule.");
        }
        const selectedStartTick = startBeat === undefined
          ? undefined
          : (initialInfo.ticks as TickInfo[]).find(
              (tick) => tick.beat === startBeat && tick.subBeat === 0,
            );
        if (startBeat !== undefined && !selectedStartTick) {
          throw new Error("The selected Bar start beat is missing from the sparse schedule.");
        }
        const startOffsetMs = selectedStartTick?.time ?? 0;
        const partialPeriod = startOffsetMs > 0;
        const initialSparseInfo = partialPeriod
          ? {
              ticks: (initialInfo.ticks as TickInfo[])
                .filter((tick) => tick.time >= startOffsetMs)
                .map((tick) => ({ ...tick, time: tick.time - startOffsetMs })),
              durationMs: initialInfo.durationMs - startOffsetMs,
            }
          : {
              ticks: initialInfo.ticks as TickInfo[],
              durationMs: initialInfo.durationMs,
            };
        if (initialSparseInfo.durationMs <= 0) {
          throw new Error("The selected Bar start beat leaves no sparse audio period.");
        }
        const replaceAtFirstBoundary = randomBar || partialPeriod;
        const activeSession = await awaitWithin(
          prepareSparseSchedule(plan, initialSparseInfo, sparseGeneration),
          "Android sparse event preparation",
        );
        let nextSession: Awaited<ReturnType<typeof prepareSparseSchedule>> | null = null;
        const firstReplacementInfo = upcoming ?? (partialPeriod
          ? { ticks: initialInfo.ticks as TickInfo[], durationMs: initialInfo.durationMs }
          : null);
        if (firstReplacementInfo) {
          nextSession = await awaitWithin(
            prepareSparseSchedule(plan, {
              ticks: firstReplacementInfo.ticks as TickInfo[],
              durationMs: firstReplacementInfo.durationMs,
            }, sparseGeneration),
            randomBar ? "Android random Bar look-ahead preparation" : "Android selected-start continuation preparation",
          );
        }
        if (cancelled() || sparseGeneration !== sparseGenerationRef.current) {
          disposeSparseSession(activeSession, true);
          if (nextSession) disposeSparseSession(nextSession, true);
          return false;
        }
        sparseSessionRef.current = activeSession;
        sparsePendingRef.current = nextSession;
        sparseReplaceHandlerRef.current = (event) => {
          if (
            !sparsePendingRef.current ||
            sparsePendingRef.current.id !== event.sessionId ||
            sparseSessionRef.current?.id !== event.previousSessionId
          ) return;
          const previous = sparseSessionRef.current;
          sparseSessionRef.current = sparsePendingRef.current;
          sparsePendingRef.current = null;
          const boundaryWallClockTimeMillis = event.boundaryWallClockTimeMillis;
          if (randomBar && boundaryWallClockTimeMillis === undefined) {
            sparseFatalHandlerRef.current?.("Android did not report the random Bar replacement boundary.");
            return;
          }
          const expectedNextBoundary = boundaryWallClockTimeMillis === undefined
            ? undefined
            : boundaryWallClockTimeMillis + sparseSessionRef.current.periodFrames / 44.1;
          disposeSparseSession(previous, false);
          if (!randomBar) return;
          // Never preview from the old JS pass simply because a fixed delay
          // expired. Wait for the visual engine to consume this exact pass,
          // or stop if there is no time left for the next native boundary.
          const boundaryPerformanceTime = performance.now() +
            (boundaryWallClockTimeMillis! - Date.now());
          const prepareAfterVisualRollover = () => {
            if (
              sparseGeneration !== sparseGenerationRef.current ||
              !sparseSessionRef.current ||
              sparsePendingRef.current
            ) return;
            if (Date.now() >= expectedNextBoundary! - 20) {
              sparseFatalHandlerRef.current?.("Random Bar next pass missed its native boundary.");
              return;
            }
            if (engine.getMeasureStartTime() < boundaryPerformanceTime - 20) {
              setTimeout(prepareAfterVisualRollover, 8);
              return;
            }
            const next = engine.getUpcomingRandomScheduleInfo() ??
              p.previewNextRandomBarChunk?.(engine);
            if (!next) {
              sparseFatalHandlerRef.current?.("Random Bar sparse playback lost its preselected next pass.");
              return;
            }
            void prepareSparseSchedule(plan, {
              ticks: next.ticks as TickInfo[],
              durationMs: next.durationMs,
            }, sparseGeneration).then(async (preparedNext) => {
              if (sparseGeneration !== sparseGenerationRef.current || !sparseSessionRef.current) {
                disposeSparseSession(preparedNext, true);
                return;
              }
              sparsePendingRef.current = preparedNext;
              const replacement = await SparseMetronome.replace({ sessionId: preparedNext.id });
              if (
                expectedNextBoundary !== undefined &&
                replacement.nextBoundaryWallClockTimeMillis !== undefined &&
                replacement.nextBoundaryWallClockTimeMillis > expectedNextBoundary + 40
              ) {
                throw new Error("Random Bar next pass was not ready for its immediately following boundary.");
              }
            }).catch((error) => {
              sparseFatalHandlerRef.current?.("Could not prepare the next random Bar pass.", error);
            });
          };
          setTimeout(prepareAfterVisualRollover, 0);
        };

        if (startAtPerformanceTime !== undefined) {
          // Native start reserves its first event 120 ms ahead; submit the
          // command before the requested start rather than 120 ms after it.
          const now = typeof performance !== "undefined" ? performance.now() : Date.now();
          const waitMs = startAtPerformanceTime - now - 120;
          if (waitMs > 0) await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
          deadline = Math.max(deadline, Date.now() + 2000);
        }
        if (cancelled()) return false;
        const started = await awaitWithin(SparseMetronome.start(activeSession.id), "Android sparse playback start");
        if (cancelled() || sparseGeneration !== sparseGenerationRef.current) return false;
        setSparseNotificationMode(true);
        setSparsePlaybackActive(true);
        // The native sparse scheduler owns all click audio. Keep the engine's
        // visual/haptic clock running while suppressing its legacy click path.
        engine.setPreRenderedAudio(true);
        const nowPerformance = typeof performance !== "undefined" ? performance.now() : Date.now();
        const anchorPerformance = started.startWallClockTimeMillis === undefined
          ? nowPerformance + 120
          : nowPerformance + (started.startWallClockTimeMillis - Date.now());
        if (cancelled()) return false;
        const engineStartAt = anchorPerformance;
        engine.start({
          startFromBeat: startBeat,
          startAtPerformanceTime: engineStartAt,
        });
        if (nextSession && replaceAtFirstBoundary) {
          const replacement = await awaitWithin(
            SparseMetronome.replace({ sessionId: nextSession.id }),
            "Android first sparse boundary replacement scheduling",
          );
          const expectedBoundary = started.startWallClockTimeMillis === undefined
            ? undefined
            : started.startWallClockTimeMillis + activeSession.periodFrames / 44.1;
          if (
            expectedBoundary !== undefined &&
            replacement.nextBoundaryWallClockTimeMillis !== undefined &&
            replacement.nextBoundaryWallClockTimeMillis > expectedBoundary + 40
          ) {
            throw new Error("The first sparse replacement missed its matching visual measure boundary.");
          }
        }
        if (cancelled()) return false;
      } else {
        const renderResult = useRenderedLoop
          ? await awaitWithin(p.prepareRenderedPlayer(plan), "Native rendered player")
          : ({ status: "failed", error: new Error("Rendered output is disabled") } as const);
        if (cancelled()) {
          if (renderResult.status === "completed") renderResult.prepared.discard();
          return false;
        }
        if (renderResult.status === "completed") {
          const prepared = renderResult.prepared;
          let output: AudioOutputResource | null = null;
          const committed = prepared.commit((readyOutput) => {
            output = readyOutput;
          });
          if (!committed) {
            cancelPlaybackAttempt(false);
            return false;
          }
          const published = publishAudioOutput(p.outputOwner, output);
          if (!published) {
            cancelPlaybackAttempt(false);
            return false;
          }
          engine.setPreRenderedAudio(true);
          // safePlayAndConfirm invokes play() synchronously before returning its
          // confirmation promise. Start the engine in the same turn so rendered
          // audio and visual scheduling share one launch anchor; only publishing
          // the playing UI waits for confirmation.
          await waitForScheduledStart();
          if (cancelled()) {
            return false;
          }
          const playConfirmation = p.outputOwner.active()?.playAndConfirm?.("metronome.start.native")
            ?? Promise.resolve(false);
          startEngine();
          const accepted = await awaitWithin(
            playConfirmation,
            "Native playback request",
          );
          if (!accepted) throw new Error("Native rendered player rejected playback");
          if (cancelled()) {
            return false;
          }
        } else if (renderResult.status === "cancelled" || renderResult.status === "superseded") {
          cancelPlaybackAttempt(false);
          return false;
        } else {
          if (plan.output.boosted || plan.output.toneShaped) {
            throw new Error("Boosted or tone-shaped native playback requires rendered audio");
          }
          engine.setPreRenderedAudio(false);
          const ticks = engine.getScheduleInfo().ticks as TickInfo[];
          const expectsAudio = ticks.some((tick) => tick.type !== "mute") ||
            Object.keys(plan.audio.noteSamples).length > 0;
          await waitForScheduledStart();
          if (cancelled()) {
            return false;
          }
          startEngine();
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
      // Sparse native playback reports focus loss and scheduler failures via
      // its own listeners. The JS watchdog cannot observe MediaPlayer events
      // and would falsely declare healthy sparse output stuck.
      if (!useSparseAndroid) p.armAudioWatchdogRef.current();
      p.showPlayingNotification(plan.bpm, playbackAtStart.modeLabel, p.languageRef.current);
      startOrResumePracticeSession();
      if (
        plan.mode === "note" && plan.unit.stopAfterMeasure ||
        (p.barModeRef.current && p.barLoopModeRef.current === "once")
      ) {
        engine.requestStopAfterMeasure();
      }
      return true;
    } catch (error) {
      if (cancelled()) return false;
      p.capturePlaybackError("Audio startup failed", error, "warning");
      cancelPlaybackAttempt(true);
      return false;
    }
  }, [cancelPlaybackAttempt, disposeSparseSession, p, prepareSparseSchedule, renderWebLoop, startOrResumePracticeSession, stopSparsePlayback, releaseBackgroundLease]);

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
      scheduledStartTokenRef.current = null;
      p.notifyUserToggle();
      startAttemptRef.current += 1;
      const playback = p.getPlaybackContext();
      seamlessRef.current = null;
      stopSparsePlayback();
      p.stopPlaybackAudio();
      p.setIsPreparing(false);
      p.isPreparingRef.current = false;
      p.setIsPlaying(false);
      p.isPlayingRef.current = false;
      p.notifyVoicePlayState(false);
      p.resetPlaybackVisuals();
      const interrupted = ["interrupted", "recovering"].includes(getAudioLifecycleSnapshot().phase);
      if (!interrupted) markAudioStopped();
      // An OS interruption owns the pause. Do not create the separate
      // paused-notification silent player while the OS is withholding audio.
      if (!interrupted) {
        p.showPausedNotification(playback.bpm, playback.modeLabel, p.languageRef.current);
      }
      pausePracticeSession(interrupted);
      p.onPlaybackStopped?.();
      releaseBackgroundLease();
      return;
    }

    const androidProbeReady = p.notifyUserToggle();
    const startBeat = p.barModeRef.current ? p.barStartBeatRef.current : undefined;
    return startPreparedPlayback(engine, startBeat ?? undefined, androidProbeReady);
  }, [cancelPlaybackAttempt, p, pausePracticeSession, releaseBackgroundLease, seamlessRef, startPreparedPlayback, stopSparsePlayback]);

  useEffect(() => { togglePlayPauseRef.current = togglePlayPause; }, [togglePlayPause]);

  const startMetronome = useCallback(async () => {
    const engine = p.engineRef.current;
    if (!engine || p.isPlayingRef.current || p.isPreparingRef.current) return;
    await startPreparedPlayback(engine, undefined);
  }, [p, startPreparedPlayback]);

  /**
   * Starts an engine schedule that the caller already configured. Note queue
   * entries can contain Beat or Bar schedules while the screen itself remains
   * in Note mode, so running configureEngine() here would overwrite the entry
   * with the ordinary Beat-mode dial configuration.
   */
  const startConfiguredPlayback = useCallback(async (stopAfterMeasure = false) => {
    const engine = p.engineRef.current;
    if (!engine) return false;
    return startPreparedPlayback(
      engine,
      undefined,
      undefined,
      undefined,
      { configureEngine: false, stopAfterMeasure },
    );
  }, [p.engineRef, startPreparedPlayback]);

  const startScheduledMetronome = useCallback(async (startAtPerformanceTime: number) => {
    const engine = p.engineRef.current;
    if (!engine || scheduledStartTokenRef.current) return false;
    if (p.isPlayingRef.current) {
      const playback = p.getPlaybackContext();
      startAttemptRef.current += 1;
      stopSparsePlayback();
      p.stopPlaybackAudio();
      p.setIsPreparing(false);
      p.isPreparingRef.current = false;
      p.setIsPlaying(false);
      p.isPlayingRef.current = false;
      p.notifyVoicePlayState(false);
      p.resetPlaybackVisuals();
      markAudioStopped();
      p.showPausedNotification(playback.bpm, playback.modeLabel, p.languageRef.current);
      pausePracticeSession(false);
      p.onPlaybackStopped?.();
      releaseBackgroundLease();
    } else if (p.isPreparingRef.current) {
      cancelPlaybackAttempt(false);
    }
    const token = Symbol("scheduled-start");
    scheduledStartTokenRef.current = token;
    const androidProbeReady = p.notifyUserToggle();
    const startBeat = p.barModeRef.current ? p.barStartBeatRef.current : undefined;
    try {
      return await startPreparedPlayback(
        engine,
        startBeat ?? undefined,
        androidProbeReady,
        startAtPerformanceTime,
      );
    } finally {
      if (scheduledStartTokenRef.current === token) {
        scheduledStartTokenRef.current = null;
      }
    }
  }, [cancelPlaybackAttempt, p, pausePracticeSession, releaseBackgroundLease, startPreparedPlayback, stopSparsePlayback]);

  const cancelScheduledMetronome = useCallback(() => {
    if (!scheduledStartTokenRef.current) return;
    scheduledStartTokenRef.current = null;
    cancelPlaybackAttempt(false);
  }, [cancelPlaybackAttempt]);

  const retryAudioRecovery = useCallback(async () => {
    if (p.isPreparingRef.current) return;
    markAudioRecovering("watchdog");
    p.practiceSessionRef.current?.interrupt();
    stopSparsePlayback();
    p.stopPlaybackAudio();
    p.setIsPlaying(false);
    p.isPlayingRef.current = false;
    p.setIsPreparing(false);
    p.isPreparingRef.current = false;
    await startMetronome();
  }, [p, startMetronome, stopSparsePlayback]);

  return {
    togglePlayPause,
    togglePlayPauseRef,
    startMetronome,
    startConfiguredPlayback,
    startScheduledMetronome,
    cancelScheduledMetronome,
    stopMetronome,
    retryAudioRecovery,
    cancelPlaybackAttempt,
    completePracticeSession,
    discardPracticeSession,
    startOrResumePracticeSession,
    seamlessNextEntryRef: seamlessRef,
  };
}
