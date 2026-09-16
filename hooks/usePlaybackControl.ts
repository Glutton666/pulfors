import { useCallback, useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { safePlayAndConfirm } from "@/lib/audio-utils";
import { toEngineBpm, soundSets } from "@/lib/metronome-engine";
import { applyDialConfigToEngine } from "@/lib/dial-engine-boundary";
import {
  ensureWebClickBuffers,
  getWebAudioContext,
  playWebRenderedLoop,
  renderMeasureAbortable,
  getClickOutputVolume,
  getClickRenderVolume,
  beginAbortableRender,
  abortActiveRender,
  finishAbortableRender,
  isRenderAborted,
} from "@/lib/audio-renderer";
import type { ClickPCMs, SamplePCMEntry, TickInfo, WebRenderedLoop } from "@/lib/audio-renderer";
import type { BeatType, MetronomeEngine } from "@/lib/metronome-engine";
import type { BarConfig, DialConfig } from "@/lib/index.helpers";
import type { PracticeEntry, SoundSet } from "@/lib/storage";
import { PracticeSessionTracker, type PracticeSessionData } from "@/lib/activity-log";
import type { Language } from "@/lib/i18n";
import type { SampleChannel } from "@/lib/stereo-channel";
import { toneEffectIntensity, type TonePosition } from "@/lib/metronome-tone-dsp";
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
  /**
   * buildRenderedPlayer의 null만으로는 "다른 렌더에 의해 대체됨(aborted)"과
   * "진짜 렌더 실패(failed)"를 구분할 수 없어, 대체된 경우까지 실패로 오인해
   * 불필요한 시작 실패 에러를 던지는 레이스 컨디션이 있었다. 있으면 이 버전을
   * 우선 사용해 그 둘을 구분한다. optional인 이유는 기존 테스트 mock과의
   * 하위 호환 유지용.
   */
  buildRenderedPlayerDetailed?: () => Promise<
    | { status: "ready"; player: AudioPlayer }
    | { status: "aborted" }
    | { status: "failed" }
  >;
  clearAudioWatchdogRef: Ref<() => void>;
  armAudioWatchdogRef: Ref<() => void>;
  soundSetRef: Ref<SoundSet>;
  volumeRef: Ref<number>;
  tonePositionRef?: Ref<TonePosition>;
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
  const scheduledStartTokenRef = useRef<symbol | null>(null);

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

  const renderWebLoop = useCallback(async (
    engine: MetronomeEngine,
    atMeasureBoundary: boolean,
    startAtPerformanceTime?: number,
  ) => {
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
        clickVolume: getClickRenderVolume(p.volumeRef.current),
        sampleVolume: samplePCMs.size > 0 ? p.sampleVolumeRef.current : 0,
        sampleVolumes: p.noteSampleVolumesRef.current,
        sampleSpeeds: p.noteSampleSpeedsRef.current,
        sampleChannels: p.noteSampleChannelsRef.current,
        metronomeChannel: p.barModeRef.current ? p.barMetronomeChannelRef.current : "both",
        metroChannelsByBeat: p.barModeRef.current ? p.noteSampleMetroChannelsRef.current : undefined,
        layerClickPCMs,
      }, signal);
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
          const next = playWebRenderedLoop(pcm, undefined, "both", 1, boundary);
          p.activateWebRenderedLoop(next);
          if (previous) {
            try { previous.stop(boundary); } catch {}
          }
          p.engineRef.current?.setPreRenderedAudio(true);
        });
      } else {
        p.webRenderedLoopRef.current?.stop();
        const context = getWebAudioContext();
        const now = typeof performance !== "undefined" ? performance.now() : Date.now();
        const startAtAudioTime = startAtPerformanceTime !== undefined && context
          ? context.currentTime + Math.max(0, startAtPerformanceTime - now) / 1000
          : undefined;
        p.activateWebRenderedLoop(playWebRenderedLoop(
          pcm,
          undefined,
          "both",
          getClickOutputVolume(p.volumeRef.current),
          startAtAudioTime,
        ));
        engine.setPreRenderedAudio(true);
      }
    } catch (error) {
      if (!isRenderAborted(error)) throw error;
    } finally {
      finishAbortableRender(renderGenerationRef, signal);
    }
  }, [p, renderGenerationRef]);

  const stopMetronome = useCallback((
    endReason: NonNullable<PracticeSessionData["endReason"]> = "manual",
  ) => {
    if (!p.isPlayingRef.current && !p.isPreparingRef.current) return;
    scheduledStartTokenRef.current = null;
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
    completePracticeSession(endReason);
    p.onPlaybackStopped?.();
  }, [completePracticeSession, p, renderGenerationRef]);

  const cancelPlaybackAttempt = useCallback((
    notifyFailure = false,
    preserveLifecycle = false,
  ) => {
    scheduledStartTokenRef.current = null;
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
    startAtPerformanceTime?: number,
    options: {
      configureEngine?: boolean;
      stopAfterMeasure?: boolean;
    } = {},
  ): Promise<boolean> => {
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
      configureEngine(engine);
    }

    let localNativePlayer: AudioPlayer | null = null;
    let nativePlayerPublished = false;
    const releaseLocalNativePlayer = () => {
      if (!localNativePlayer || nativePlayerPublished) return;
      try { localNativePlayer.pause(); } catch {}
      try { localNativePlayer.release(); } catch {}
      localNativePlayer = null;
    };

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
      const tonePosition = p.tonePositionRef?.current;
      // toneEffectIntensity()가 정의하는 것과 같은 중심부 데드존(0.05)을 존중한다.
      // 좌표가 정확히 0이 아니어도 그 데드존 안이면 DSP가 실제로는 완전히 중립과
      // 동일한 소리를 내므로(processClickPCM의 intensity===0 우회 경로), 여기서도
      // "톤 조정됨"으로 취급하지 않아야 불필요하게 더 취약한 렌더 경로로 몰지 않는다.
      const hasToneShaping = tonePosition
        ? toneEffectIntensity(tonePosition) > 0
        : false;
      const useRenderedLoop = Platform.OS === "web"
        ? p.barModeRef.current || String(p.soundSetRef.current).startsWith("custom")
          || p.volumeRef.current > 1 || hasToneShaping
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
          await awaitWithin(
            renderWebLoop(engine, false, startAtPerformanceTime),
            "Web rendered loop",
          );
          if (cancelled()) {
            return false;
          }
          if (!p.webRenderedLoopRef.current?.isRunning()) {
            throw new Error("Web rendered loop did not start");
          }
          startEngine();
          await waitForScheduledStart();
        } else {
          engine.setPreRenderedAudio(false);
          const ticks = engine.getScheduleInfo().ticks as TickInfo[];
          const expectsAudio = ticks.some((tick) => tick.type !== "mute") ||
            Object.keys(p.noteSamplesRef.current).length > 0;
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
        // buildRenderedPlayer()의 null만으로는 "다른 렌더에 의해 대체됨(aborted)"과
        // "진짜 렌더 실패(failed)"를 구분할 수 없다. 예전엔 aborted도 failed와
        // 똑같이 취급해, 부스트/톤 조정 중에는 아무 문제 없었는데도 순수 레이스
        // 컨디션으로 "시작 실패" 에러를 던지는 경우가 있었다. 있으면 상세 버전을
        // 써서 그 둘을 구분한다(없으면 이전 동작으로 폴백). 로컬 변수
        // (localNativePlayer)로도 같이 들고 있어서, 공용 ref에 등록되기 전에
        // 취소/에러가 나도 releaseLocalNativePlayer()가 확실히 정리한다.
        const detailedResult = useRenderedLoop
          ? p.buildRenderedPlayerDetailed
            ? await awaitWithin(p.buildRenderedPlayerDetailed(), "Native rendered player")
            : await awaitWithin(p.buildRenderedPlayer(), "Native rendered player").then(
                (built): { status: "ready"; player: AudioPlayer } | { status: "failed" } =>
                  built ? { status: "ready" as const, player: built } : { status: "failed" as const },
              )
          : ({ status: "failed" } as const);
        if (detailedResult.status === "ready") {
          localNativePlayer = detailedResult.player;
        }
        if (cancelled()) {
          releaseLocalNativePlayer();
          return false;
        }
        if (detailedResult.status === "ready") {
          const player = detailedResult.player;
          p.renderedPlayerRef.current = player;
          nativePlayerPublished = true;
          localNativePlayer = null;
          engine.setPreRenderedAudio(true);
          // safePlayAndConfirm invokes play() synchronously before returning its
          // confirmation promise. Start the engine in the same turn so rendered
          // audio and visual scheduling share one launch anchor; only publishing
          // the playing UI waits for confirmation.
          await waitForScheduledStart();
          if (cancelled()) {
            return false;
          }
          const playConfirmation = safePlayAndConfirm(player, "metronome.start.native");
          startEngine();
          const accepted = await awaitWithin(
            playConfirmation,
            "Native playback request",
          );
          if (!accepted) throw new Error("Native rendered player rejected playback");
          if (cancelled()) {
            return false;
          }
        } else if (detailedResult.status === "aborted") {
          // 이 시도의 렌더가 다른 무언가(설정 변경, 노트 편집, 알림 액션 등이
          // 직접 부르는 stopRenderedAudio())에 의해 대체됐다 — cancelled()는
          // startAttemptRef가 바뀔 때만 true가 되므로, 새 재생 시도 없이
          // stopRenderedAudio만 호출된 이 경로에서는 아직 false다. 아무것도
          // 실패하지 않았으니 실패 알림 없이(notifyFailure=false) 정리만 하고
          // 끝낸다 — 그냥 return false만 하면 isPreparing이 영원히 true로
          // 걸린 채 남는다.
          cancelPlaybackAttempt(false);
          return false;
        } else {
          if (p.volumeRef.current > 1 || hasToneShaping) {
            throw new Error("Boosted or tone-shaped native playback requires rendered audio");
          }
          engine.setPreRenderedAudio(false);
          const ticks = engine.getScheduleInfo().ticks as TickInfo[];
          const expectsAudio = ticks.some((tick) => tick.type !== "mute") ||
            Object.keys(p.noteSamplesRef.current).length > 0;
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
      const playback = p.getPlaybackContext({ activeBarIndex: startBeat ?? 0 });
      p.showPlayingNotification(playback.bpm, playback.modeLabel, p.languageRef.current);
      startOrResumePracticeSession();
      if (
        options.stopAfterMeasure ||
        (p.barModeRef.current && p.barLoopModeRef.current === "once")
      ) {
        engine.requestStopAfterMeasure();
      }
      return true;
    } catch (error) {
      // A rendered player belongs to this startup attempt until it is
      // published. Cancellation can happen while the async builder is
      // resolving, so do not leave an unpublished native player alive.
      releaseLocalNativePlayer();
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
      scheduledStartTokenRef.current = null;
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
      renderGenerationRef.current += 1;
      abortActiveRender(renderGenerationRef);
      p.invalidateAudioStartupProbe();
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
  }, [cancelPlaybackAttempt, p, pausePracticeSession, renderGenerationRef, startPreparedPlayback]);

  const cancelScheduledMetronome = useCallback(() => {
    if (!scheduledStartTokenRef.current) return;
    scheduledStartTokenRef.current = null;
    cancelPlaybackAttempt(false);
  }, [cancelPlaybackAttempt]);

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
