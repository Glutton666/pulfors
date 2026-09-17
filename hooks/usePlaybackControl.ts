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

  useEffect(() => () => {
    // A focus/buffer/scheduled-start await may resolve after the owning screen
    // has unmounted. Invalidate the attempt before any continuation can start
    // the engine or publish React/audio lifecycle state.
    scheduledStartTokenRef.current = null;
    startAttemptRef.current += 1;
    p.preparingCancelledRef.current = true;
    p.invalidateAudioStartupProbe();
  }, [p.invalidateAudioStartupProbe, p.preparingCancelledRef]);

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
  }, [completePracticeSession, p]);

  const cancelPlaybackAttempt = useCallback((
    notifyFailure = false,
    preserveLifecycle = false,
  ) => {
    scheduledStartTokenRef.current = null;
    startAttemptRef.current += 1;
    p.preparingCancelledRef.current = true;
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
  }, [p]);

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
      p.armAudioWatchdogRef.current();
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
  }, [cancelPlaybackAttempt, p, renderWebLoop, startOrResumePracticeSession]);

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
      p.stopPlaybackAudio();
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
  }, [cancelPlaybackAttempt, p, pausePracticeSession, seamlessRef, startPreparedPlayback]);

  const togglePlayPauseRef = useRef(togglePlayPause);
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
  }, [cancelPlaybackAttempt, p, pausePracticeSession, startPreparedPlayback]);

  const cancelScheduledMetronome = useCallback(() => {
    if (!scheduledStartTokenRef.current) return;
    scheduledStartTokenRef.current = null;
    cancelPlaybackAttempt(false);
  }, [cancelPlaybackAttempt]);

  const retryAudioRecovery = useCallback(async () => {
    if (p.isPreparingRef.current) return;
    markAudioRecovering("watchdog");
    p.practiceSessionRef.current?.interrupt();
    p.stopPlaybackAudio();
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
