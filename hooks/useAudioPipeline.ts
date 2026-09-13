import { useRef, useEffect, useCallback, useState } from "react";
import { Platform } from "react-native";
import { createAudioPlayer } from "expo-audio";
import type { AudioPlayer as ExpoAudioPlayer } from "expo-audio";
import { soundSets } from "@/lib/metronome-engine";
import type { MetronomeEngine } from "@/lib/metronome-engine";
import {
  decodeSampleFile,
  loadAssetPCM,
  parseTrimInfo,
  renderMeasure,
  saveRenderedWav,
  ensureWebClickBuffers,
  playWebRenderedLoop,
  getWebAudioContext,
  clearWebClickBuffers,
  scheduleWebClickAt,
  beginAbortableRender,
  abortActiveRender,
  finishAbortableRender,
  isRenderAborted,
  renderMeasureAbortable,
} from "@/lib/audio-renderer";
import { syncStereoArtifact, releaseStereoArtifact } from "@/lib/sample-cache";
import { captureBreadcrumb } from "@/lib/error-tracking";
import { safePlay } from "@/lib/audio-utils";
import { isSafeNoteSampleUri } from "@/app/index.helpers";
import type {
  ClickPCMs,
  SamplePCMEntry,
  TickInfo,
  DecodedSample,
  WebRenderedLoop,
} from "@/lib/audio-renderer";
import type { SoundSet, CustomSoundSetConfig } from "@/lib/storage";
import type { NoteSampleMap, NoteSampleChannelMap, NoteSampleMetroChannelMap, NoteSampleVolumeMap, NoteSampleSpeedMap } from "@/lib/note-samples";
import type { SampleChannel } from "@/lib/stereo-channel";
import { NEUTRAL, processClickPCM, type TonePosition } from "@/lib/metronome-tone-dsp";
import { useAudioPlayers } from "@/hooks/useAudioPlayers";
import type { BuiltinPlayers, SoundSetPlayers } from "@/hooks/useAudioPlayers";
import { BUILTIN_POOL_SIZE } from "@/hooks/useAudioPlayers";
import {
  setAutoResumeAfterInterruption as setAudioSessionAutoResume,
  setAudioSessionBackgroundPlay,
} from "@/lib/audio-session";
import { setPlaybackNotificationsEnabled } from "@/lib/notification-preferences";
import {
  getAudioLifecycleSnapshot,
  markAudioRecoveryFailed,
  markAudioRecoverySucceeded,
} from "@/lib/audio-lifecycle";
import type { TranslationFn } from "@/lib/i18n";
import {
  AUDIO_TIMING_LIMITS,
  AudioClockAdapter,
  AudioOutputStateMachine,
  AudioTimingDiagnostics,
} from "@/lib/audio-clock";

/** Narrow callback type for audio-specific settings persistence. */
export type PersistAudioSettingsFn = (s: Partial<{
  backgroundPlay: boolean;
  playbackNotifications: boolean;
  autoResumeAfterInterruption: boolean;
}>) => void;

export interface UseAudioPipelineParams {
  engineRef: React.MutableRefObject<MetronomeEngine | null>;
  /** Reactive: triggers click-buffer preload when sound set changes. */
  soundSet: SoundSet;
  /** Updated synchronously by settings controls so in-flight playback changes on the next tick. */
  soundSetRef: React.MutableRefObject<SoundSet>;
  // soundSetRef and allPlayersRef are now owned by this hook via useAudioPlayers.
  customSoundSetsRef: React.MutableRefObject<Record<string, CustomSoundSetConfig>>;
  layerSoundSetsRef: React.MutableRefObject<Record<number, SoundSet>>;
  noteSamplesRef: React.MutableRefObject<NoteSampleMap>;
  noteSampleChannelsRef: React.MutableRefObject<NoteSampleChannelMap>;
  noteSampleVolumesRef: React.MutableRefObject<NoteSampleVolumeMap>;
  noteSampleSpeedsRef: React.MutableRefObject<NoteSampleSpeedMap>;
  barModeRef: React.MutableRefObject<boolean>;
  barMetronomeChannelRef: React.MutableRefObject<SampleChannel>;
  noteSampleMetroChannelsRef: React.MutableRefObject<NoteSampleMetroChannelMap>;
  /** Reactive volume (0–1+). Used to sync all player pool volumes. */
  volume: number;
  volumeRef: React.MutableRefObject<number>;
  tonePositionRef?: React.MutableRefObject<TonePosition>;
  tonePositionsRef?: React.MutableRefObject<Partial<Record<SoundSet, TonePosition>>>;
  sampleVolumeRef: React.MutableRefObject<number>;
  /** PCM cache — created in useMetronomeScreen, shared with useSettings. */
  clickPCMCacheRef: React.MutableRefObject<Record<string, ClickPCMs>>;
  /** Web click-ready flag — created in useMetronomeScreen, shared with useSettings. */
  webClickReadyRef: React.MutableRefObject<boolean>;
  /** Per-note sample players — created in useMetronomeScreen, shared with useSettings. */
  noteSampleSoundsRef: React.MutableRefObject<Record<string, ExpoAudioPlayer>>;
  /** Shared epoch invalidating every initial/scheduled pre-render producer. */
  renderGenerationRef: React.MutableRefObject<number>;
  isPlayingRef: React.MutableRefObject<boolean>;
  bpmRef: React.MutableRefObject<number>;
  t: TranslationFn;
  showRecoveryToast: (msg: string) => void;
  fatalRenderFailureRef: React.MutableRefObject<() => void>;
  /**
   * Ref to the settings-persistence callback. Kept as a ref so this hook can be
   * called before persistSettings is created in useMetronomeScreen; the ref's
   * .current is updated each render by the caller.
   */
  persistAudioSettingsCallbackRef: React.MutableRefObject<PersistAudioSettingsFn>;
}

export interface UseAudioPipelineResult {
  // ── Player pool (owned here, forwarded for tick callback use) ────────────
  allPlayersRef: React.MutableRefObject<BuiltinPlayers>;
  soundSetRef: React.MutableRefObject<SoundSet>;
  /** Round-robin indices for polyphony; read/write these in the tick callback. */
  highToggle: React.MutableRefObject<number>;
  lowToggle: React.MutableRefObject<number>;
  strongToggle: React.MutableRefObject<number>;
  // ── Audio-session settings (owned here, exposed for settings UI) ─────────
  backgroundPlay: boolean;
  playbackNotifications: boolean;
  autoResumeAfterInterruption: boolean;
  /**
   * User-facing setter: updates state + calls audio-session + persists.
   * Use this from settings UI change handlers.
   */
  updateBackgroundPlay: (v: boolean) => void;
  updatePlaybackNotifications: (v: boolean) => void;
  updateAutoResumeAfterInterruption: (v: boolean) => void;
  /**
   * Apply-only setter (no persistence side-effect).
   * Use this when restoring saved settings on startup.
   */
  applyAudioSettings: (s: Partial<{
    backgroundPlay: boolean;
    playbackNotifications: boolean;
    autoResumeAfterInterruption: boolean;
  }>) => void;
  // ── Refs owned by this hook, exposed for coordination ────────────────────
  renderedPlayerRef: React.MutableRefObject<ExpoAudioPlayer | null>;
  samplePCMCacheRef: React.MutableRefObject<Map<string, SamplePCMEntry>>;
  renderedUrlRef: React.MutableRefObject<string | null>;
  webRenderedLoopRef: React.MutableRefObject<WebRenderedLoop | null>;
  activateWebRenderedLoop: (loop: WebRenderedLoop) => void;
  lastAudioFireRef: React.MutableRefObject<number>;
  beginAudioStartupProbe: () => number;
  getAudioStartupEpoch: () => number;
  invalidateAudioStartupProbe: () => void;
  isAudioStartupEpochCurrent: (epoch: number) => boolean;
  recordAudioActivity: (epoch?: number) => boolean;
  waitForFirstAudioActivity: (epoch: number, isCancelled?: () => boolean, timeoutMs?: number) => Promise<boolean>;
  armAudioWatchdogRef: React.MutableRefObject<() => void>;
  clearAudioWatchdogRef: React.MutableRefObject<() => void>;
  samplePlayStateRef: React.MutableRefObject<Record<string, { playing: boolean; endTimer: ReturnType<typeof setTimeout> | null }>>;
  // ── Functions ────────────────────────────────────────────────────────────
  buildRenderedPlayer: () => Promise<ExpoAudioPlayer | null>;
  /**
   * buildRenderedPlayer과 동일한 렌더링을 수행하지만, null 하나로는 구분 못 하는
   * "다른 렌더에 의해 대체됨(aborted)"과 "진짜 렌더 실패(failed)"를 구분해 반환한다.
   * 호출자가 aborted를 실패로 오인해 불필요한 에러/폴백을 유발하지 않도록 한다.
   */
  buildRenderedPlayerDetailed: () => Promise<
    | { status: "ready"; player: ExpoAudioPlayer }
    | { status: "aborted" }
    | { status: "failed" }
  >;
  scheduleReRender: () => void;
  stopRenderedAudio: () => void;
  getClickPCMs: (set: SoundSet, signal?: AbortSignal) => Promise<ClickPCMs>;
  getSamplePCMs: (samples: NoteSampleMap, signal?: AbortSignal) => Promise<Map<string, SamplePCMEntry>>;
  getLayerClickPCMsForSchedule: (ticks: TickInfo[], signal?: AbortSignal) => Promise<Map<string, ClickPCMs>>;
  invalidateSamplePCMCache: (key?: string) => void;
  preloadNoteSampleSounds: (samples: NoteSampleMap, keepExisting?: boolean) => Promise<void>;
  clearSamplePlayStates: () => void;
  armAudioWatchdog: () => void;
  clearAudioWatchdog: () => void;
  scheduleRealtimeWebClick: (
    role: "strong" | "high" | "low",
    channel: SampleChannel | "off",
    atPerformanceTime: number,
  ) => boolean;
  clearRealtimeWebAudio: () => void;
}

/**
 * Owns the audio pre-rendering pipeline: PCM caches, rendered player lifecycle,
 * scheduled re-render on settings changes, warmup, sample preloading, and the
 * playback-recovery watchdog.
 *
 * Extracted from useMetronomeScreen so audio I/O logic lives in one place.
 */
export function useAudioPipeline(params: UseAudioPipelineParams): UseAudioPipelineResult {
  const {
    engineRef, soundSet, volume, customSoundSetsRef,
    layerSoundSetsRef, noteSamplesRef, noteSampleChannelsRef, noteSampleVolumesRef, noteSampleSpeedsRef, barModeRef,
    barMetronomeChannelRef, noteSampleMetroChannelsRef, volumeRef, sampleVolumeRef, tonePositionRef, tonePositionsRef,
    isPlayingRef, bpmRef, t, showRecoveryToast, persistAudioSettingsCallbackRef,
    renderGenerationRef, fatalRenderFailureRef,
  } = params;

  // ── Player pool ownership (moved from useMetronomeScreen) ───────────────────
  // allPlayersRef, soundSetRef, highToggle/lowToggle/strongToggle are now owned
  // here. useMetronomeScreen's tick callback reads these via the return value.
  const { allPlayers, allPlayersRef, soundSetRef, highToggle, lowToggle, strongToggle, setPoolsVolume } =
    useAudioPlayers(soundSet, params.soundSetRef);

  // 3 refs now live in useMetronomeScreen (shared with useSettings)
  const { clickPCMCacheRef, webClickReadyRef, noteSampleSoundsRef } = params;

  // ── Audio-session settings (moved from useMetronomeScreen) ─────────────────
  const [backgroundPlay, setBackgroundPlay] = useState(true);
  const [playbackNotifications, setPlaybackNotifications] = useState(false);
  const [autoResumeAfterInterruption, setAutoResumeState] = useState(true);

  /**
   * Apply-only: sets state (and audio-session for autoResume) without persisting.
   * Called during initial settings load.
   */
  const applyAudioSettings = useCallback(
    (s: Partial<{
      backgroundPlay: boolean;
      playbackNotifications: boolean;
      autoResumeAfterInterruption: boolean;
    }>) => {
      if (s.backgroundPlay !== undefined) {
        setBackgroundPlay(s.backgroundPlay);
        setAudioSessionBackgroundPlay(s.backgroundPlay);
      }
      if (s.playbackNotifications !== undefined) {
        setPlaybackNotifications(s.playbackNotifications);
        setPlaybackNotificationsEnabled(s.playbackNotifications);
      }
      if (s.autoResumeAfterInterruption !== undefined) {
        setAutoResumeState(s.autoResumeAfterInterruption);
        setAudioSessionAutoResume(s.autoResumeAfterInterruption);
      }
    },
    [],
  );

  /**
   * User-facing setter for backgroundPlay: updates state + persists.
   */
  const updateBackgroundPlay = useCallback(
    (value: boolean) => {
      setBackgroundPlay(value);
      setAudioSessionBackgroundPlay(value);
      persistAudioSettingsCallbackRef.current({ backgroundPlay: value });
    },
    [persistAudioSettingsCallbackRef],
  );

  const updatePlaybackNotifications = useCallback(
    (value: boolean) => {
      setPlaybackNotifications(value);
      setPlaybackNotificationsEnabled(value);
      persistAudioSettingsCallbackRef.current({ playbackNotifications: value });
    },
    [persistAudioSettingsCallbackRef],
  );

  /**
   * User-facing setter for autoResumeAfterInterruption: updates state +
   * notifies audio-session module + persists.
   */
  const updateAutoResumeAfterInterruption = useCallback(
    (value: boolean) => {
      setAutoResumeState(value);
      setAudioSessionAutoResume(value);
      persistAudioSettingsCallbackRef.current({ autoResumeAfterInterruption: value });
    },
    [persistAudioSettingsCallbackRef],
  );

  // ── Player volume sync ───────────────────────────────────────────────────────
  // Keeps all pooled players in sync with the reactive volume state.
  // Moved from useMetronomeScreen so audio resource management stays in one layer.
  // NOTE: allPlayers is a lazy Proxy with no enumerable keys — iterating it via
  // Object.values() returns []. We use setPoolsVolume() which walks the internal
  // cache directly and also records the value for pools created lazily afterward.
  useEffect(() => {
    setPoolsVolume(volume);
    webRenderedLoopRef.current?.setVolume?.(1);
    if (renderedPlayerRef.current) {
      renderedPlayerRef.current.volume = 1;
    }
  }, [volume, setPoolsVolume]);

  // ── Owned refs ──────────────────────────────────────────────────────────────
  const renderedPlayerRef = useRef<ExpoAudioPlayer | null>(null);
  const pendingRenderedPlayerRef = useRef<ExpoAudioPlayer | null>(null);
  const samplePCMCacheRef = useRef<Map<string, SamplePCMEntry>>(new Map());
  const samplePCMUriRef = useRef<Map<string, string>>(new Map());
  const renderedUrlRef = useRef<string | null>(null);
  const webRenderedLoopRef = useRef<WebRenderedLoop | null>(null);
  const outputStateRef = useRef(new AudioOutputStateMachine());
  const webClockAdapterRef = useRef<AudioClockAdapter | null>(null);
  const timingDiagnosticsRef = useRef(new AudioTimingDiagnostics(__DEV__));
  const lastAudioFireRef = useRef(0);
  const audioStartupEpochRef = useRef(0);
  const audioWatchdogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioRetryCountRef = useRef(0);
  const armAudioWatchdogRef = useRef<() => void>(() => {});
  const clearAudioWatchdogRef = useRef<() => void>(() => {});
  const reRenderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const realtimeSourcesRef = useRef(new Set<import("@/lib/audio-renderer").ScheduledWebAudio>());
  const samplePlayStateRef = useRef<Record<string, { playing: boolean; endTimer: ReturnType<typeof setTimeout> | null }>>({});
  const armTimeRef = useRef<number | null>(null);
  const showRecoveryToastRef = useRef(showRecoveryToast);
  useEffect(() => { showRecoveryToastRef.current = showRecoveryToast; }, [showRecoveryToast]);

  const clearRealtimeWebAudio = useCallback(() => {
    realtimeSourcesRef.current.forEach((source) => source.cancel());
    realtimeSourcesRef.current.clear();
  }, []);

  const beginAudioStartupProbe = useCallback(() => {
    audioStartupEpochRef.current += 1;
    lastAudioFireRef.current = 0;
    return audioStartupEpochRef.current;
  }, []);

  const getAudioStartupEpoch = useCallback(() => audioStartupEpochRef.current, []);
  const invalidateAudioStartupProbe = useCallback(() => {
    audioStartupEpochRef.current += 1;
    lastAudioFireRef.current = 0;
  }, []);
  const isAudioStartupEpochCurrent = useCallback(
    (epoch: number) => epoch === audioStartupEpochRef.current,
    [],
  );

  const recordAudioActivity = useCallback((epoch = audioStartupEpochRef.current): boolean => {
    if (epoch !== audioStartupEpochRef.current) return false;
    lastAudioFireRef.current = Date.now();
    if (getAudioLifecycleSnapshot().phase === "recovering") {
      markAudioRecoverySucceeded();
    }
    return true;
  }, []);

  const waitForFirstAudioActivity = useCallback(async (
    epoch: number,
    isCancelled?: () => boolean,
    timeoutMs = 5000,
  ): Promise<boolean> => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (isCancelled?.()) return false;
      if (epoch !== audioStartupEpochRef.current) return false;
      if (lastAudioFireRef.current > 0) return true;
      await new Promise<void>((resolve) => setTimeout(resolve, 25));
    }
    return false;
  }, []);

  const scheduleRealtimeWebClick = useCallback((
    role: "strong" | "high" | "low",
    channel: SampleChannel | "off",
    atPerformanceTime: number,
  ): boolean => {
    const ctx = getWebAudioContext();
    if (!ctx || ctx.state !== "running") return false;
    let adapter = webClockAdapterRef.current;
    if (!adapter?.isMapped()) {
      adapter = new AudioClockAdapter({ nowSeconds: () => ctx.currentTime });
      adapter.map();
      webClockAdapterRef.current = adapter;
    }
    const atAudioTime = adapter.performanceTimeToAudioSeconds(atPerformanceTime);
    if (atAudioTime === null) return false;
    if (outputStateRef.current.snapshot().mode !== "realtime") {
      outputStateRef.current.transition("realtime");
    }
    const generation = outputStateRef.current.snapshot().generation;
    const startupEpoch = audioStartupEpochRef.current;
    const source = scheduleWebClickAt(role, channel, volumeRef.current, atAudioTime);
    if (!source) return false;
    realtimeSourcesRef.current.add(source);
    source.onEnded?.(() => {
      realtimeSourcesRef.current.delete(source);
      if (outputStateRef.current.owns(generation) && outputStateRef.current.snapshot().mode === "realtime") {
        recordAudioActivity(startupEpoch);
      }
    });
    return true;
  }, [recordAudioActivity, volumeRef]);

  const activateWebRenderedLoop = useCallback((loop: WebRenderedLoop) => {
    webRenderedLoopRef.current = loop;
    const ctx = getWebAudioContext();
    if (ctx) {
      const adapter = new AudioClockAdapter({ nowSeconds: () => ctx.currentTime });
      adapter.map(loop.getPositionSeconds?.() ?? 0);
      webClockAdapterRef.current = adapter;
      const sample = adapter.now();
      if (sample) timingDiagnosticsRef.current.record(sample);
    }
    outputStateRef.current.transition("prerender");
  }, []);
  useEffect(() => () => {
    renderGenerationRef.current += 1;
    abortActiveRender(renderGenerationRef);
    clearRealtimeWebAudio();
    if (reRenderTimerRef.current) {
      clearTimeout(reRenderTimerRef.current);
      reRenderTimerRef.current = null;
    }
  }, [clearRealtimeWebAudio, renderGenerationRef]);

  // ── Web click-buffer preload (re-runs on soundSet change) ───────────────────
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const src = soundSets[soundSet as keyof typeof soundSets] || soundSets.classic;
    ensureWebClickBuffers(src as any)
      .then((ok) => { if (ok) webClickReadyRef.current = true; })
      .catch(() => {});
  }, [soundSet]);

  // ── PCM helpers ─────────────────────────────────────────────────────────────
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

  const getClickPCMs = useCallback(async (set: SoundSet, signal?: AbortSignal): Promise<ClickPCMs> => {
    if (clickPCMCacheRef.current[set]) return clickPCMCacheRef.current[set];
    const shape = (pcm: Float32Array) =>
      processClickPCM(
        pcm,
        tonePositionsRef
          ? tonePositionsRef.current[set] ?? NEUTRAL
          : tonePositionRef?.current ?? NEUTRAL,
      ) as Float32Array;
    const customCfg = customSoundSetsRef.current[set];
    if (customCfg) {
      const loadSample = async (cfg: any) => {
        if (cfg.type === "custom" && cfg.sampleUri) {
          try {
            const pcm = await decodeSampleFile(cfg.sampleUri, signal);
            if (pcm) {
              const trimmed = trimPCM({ pcm, trimStartSamples: 0, trimLenSamples: pcm.length }, cfg.duration);
              return trimmed.pcm;
            }
            captureBreadcrumb({ category: "custom-sound", message: "Decode returned null", level: "warning", data: { sampleUri: cfg.sampleUri } });
          } catch (e) {
            if (isRenderAborted(e)) throw e;
            captureBreadcrumb({ category: "custom-sound", message: "Failed to decode custom sample", level: "warning", data: { error: String(e) } });
          }
        }
        const srcSet = cfg.sourceSet || "classic";
        const srcRole = cfg.sourceRole || "strong";
        const src = (soundSets as Record<string, typeof soundSets.classic>)[srcSet] ?? soundSets.classic;
        const asset = srcRole === "strong" ? src.strong : srcRole === "high" ? src.high : src.low;
        const raw = await loadAssetPCM(asset, signal);
        const trimmed = trimPCM({ pcm: raw, trimStartSamples: 0, trimLenSamples: raw.length }, cfg.duration);
        return trimmed.pcm;
      };
      const [strong, high, low] = await Promise.all([loadSample(customCfg.strong), loadSample(customCfg.accent), loadSample(customCfg.normal)]);
       const result: ClickPCMs = { strong: shape(strong), high: shape(high), low: shape(low) };
      clickPCMCacheRef.current[set] = result;
      return result;
    }
    const src = soundSets[set as keyof typeof soundSets] || soundSets.classic;
    const [strong, high, low] = await Promise.all([loadAssetPCM(src.strong, signal), loadAssetPCM(src.high, signal), loadAssetPCM(src.low, signal)]);
    const result: ClickPCMs = { strong: shape(strong), high: shape(high), low: shape(low) };
    clickPCMCacheRef.current[set] = result;
    return result;
  }, [tonePositionRef, tonePositionsRef, trimPCM]);

  const getSamplePCMs = useCallback(async (samples: NoteSampleMap, signal?: AbortSignal): Promise<Map<string, SamplePCMEntry>> => {
    const map = new Map<string, SamplePCMEntry>();
    const entries = Object.entries(samples);
    if (entries.length === 0) return map;
    await Promise.all(entries.map(async ([key, uri]) => {
      const cached = samplePCMCacheRef.current.get(key);
      if (cached && samplePCMUriRef.current.get(key) === uri) {
        map.set(key, cached);
        return;
      }
      try {
        const pcm = await decodeSampleFile(uri, signal);
        if (pcm) {
          const { trimStartMs, trimDurationMs } = parseTrimInfo(uri);
          const entry: SamplePCMEntry = { pcm, trimStartMs, trimDurationMs };
          map.set(key, entry);
          if (noteSamplesRef.current[key] === uri) {
            samplePCMCacheRef.current.set(key, entry);
            samplePCMUriRef.current.set(key, uri);
          }
        }
      } catch (e) {
        if (isRenderAborted(e)) throw e;
        captureBreadcrumb({ category: "pre-render", message: "Failed to decode sample", level: "warning", data: { key, error: String(e) } });
      }
    }));
    return map;
  }, [noteSamplesRef]);

  const getLayerClickPCMsForSchedule = useCallback(async (ticks: TickInfo[], signal?: AbortSignal): Promise<Map<string, ClickPCMs>> => {
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
      const pcms = await getClickPCMs(ss as SoundSet, signal);
      loaded.set(ss, pcms);
    }));
    const map = new Map<string, ClickPCMs>(loaded);
    for (const [li, ss] of fallbackByIndex) {
      const pcms = loaded.get(ss);
      if (pcms) map.set(`#${li}`, pcms);
    }
    return map;
  }, [getClickPCMs]);

  // ── Core audio player lifecycle ──────────────────────────────────────────────
  const buildRenderedPlayerDetailed = useCallback(async (): Promise<
    | { status: "ready"; player: ExpoAudioPlayer }
    | { status: "aborted" }
    | { status: "failed" }
  > => {
    const engine = engineRef.current;
    if (!engine) return { status: "failed" };
    const generation = ++renderGenerationRef.current;
    const signal = beginAbortableRender(renderGenerationRef);
    outputStateRef.current.transition("rendering");
    try {
      const scheduleInfo = engine.getScheduleInfo();
      const ticks = scheduleInfo.ticks as TickInfo[];
      const [clickPCMs, layerClickPCMs, samplePCMs] = await Promise.all([
        getClickPCMs(soundSetRef.current, signal),
        getLayerClickPCMsForSchedule(ticks, signal),
        getSamplePCMs(noteSamplesRef.current, signal),
      ]);
      if (generation !== renderGenerationRef.current) return { status: "aborted" };
      await new Promise(r => setTimeout(r, 0));
      if (generation !== renderGenerationRef.current) return { status: "aborted" };
      const pcm = await renderMeasureAbortable({
        schedule: ticks,
        measureDurationMs: scheduleInfo.durationMs,
        clickPCMs,
        samplePCMs,
        clickVolume: Math.max(0, volumeRef.current),
        sampleVolume: samplePCMs.size > 0 ? sampleVolumeRef.current : 0,
        sampleVolumes: noteSampleVolumesRef.current,
        sampleSpeeds: noteSampleSpeedsRef.current,
        sampleChannels: noteSampleChannelsRef.current,
        metronomeChannel: barModeRef.current ? barMetronomeChannelRef.current : "both",
        metroChannelsByBeat: barModeRef.current ? noteSampleMetroChannelsRef.current : undefined,
        layerClickPCMs,
      }, signal);
      const wavUri = await saveRenderedWav(pcm);
      if (generation !== renderGenerationRef.current) {
        if (Platform.OS === "web") {
          try { URL.revokeObjectURL(wavUri); } catch {}
        }
        return { status: "aborted" };
      }
      if (Platform.OS === "web" && renderedUrlRef.current) {
        try { URL.revokeObjectURL(renderedUrlRef.current); } catch {}
      }
      renderedUrlRef.current = wavUri;
      const player = createAudioPlayer(wavUri);
      player.loop = true;
      // 예전엔 1.0 고정값이라 사용자가 설정한 실제 볼륨(예: 0.8)을 무시하고
      // pre-rendered 루프로 전환되는 순간 항상 최대 볼륨으로 재생됐다
      // (2026-08-25 확인). per-tick 풀 플레이어(setPoolsVolume)와 동일하게
      // 실제 볼륨을 반영한다.
      player.volume = 1;
      outputStateRef.current.transition("prerender");
      return { status: "ready", player };
    } catch (e) {
      if (isRenderAborted(e)) return { status: "aborted" };
      captureBreadcrumb({ category: "pre-render", message: "Failed, falling back to per-tick audio", level: "warning", data: { error: String(e) } });
      return { status: "failed" };
    } finally {
      finishAbortableRender(renderGenerationRef, signal);
    }
  }, [getClickPCMs, getLayerClickPCMsForSchedule, getSamplePCMs]);

  const buildRenderedPlayer = useCallback(async (): Promise<ExpoAudioPlayer | null> => {
    const result = await buildRenderedPlayerDetailed();
    return result.status === "ready" ? result.player : null;
  }, [buildRenderedPlayerDetailed]);

  const releasePendingRenderedPlayer = useCallback(() => {
    const pending = pendingRenderedPlayerRef.current;
    pendingRenderedPlayerRef.current = null;
    if (!pending) return;
    try { pending.pause(); } catch {}
    try { pending.release(); } catch {}
  }, []);

  const stopRenderedAudio = useCallback(() => {
    renderGenerationRef.current += 1;
    abortActiveRender(renderGenerationRef);
    clearRealtimeWebAudio();
    engineRef.current?.setPendingMeasureStartAction(null);
    releasePendingRenderedPlayer();
    if (webRenderedLoopRef.current) {
      webRenderedLoopRef.current.stop();
      webRenderedLoopRef.current = null;
    }
    if (renderedPlayerRef.current) {
      try { renderedPlayerRef.current.pause(); renderedPlayerRef.current.release(); } catch {}
      renderedPlayerRef.current = null;
    }
    if (Platform.OS === "web" && renderedUrlRef.current) {
      try { URL.revokeObjectURL(renderedUrlRef.current); } catch {}
      renderedUrlRef.current = null;
    }
    const engine = engineRef.current;
    if (engine) engine.setPreRenderedAudio(false);
    outputStateRef.current.transition("idle");
    webClockAdapterRef.current?.invalidate();
  }, [clearRealtimeWebAudio, releasePendingRenderedPlayer, renderGenerationRef]);

  const scheduleReRender = useCallback(() => {
    renderGenerationRef.current += 1;
    abortActiveRender(renderGenerationRef);
    engineRef.current?.setPendingMeasureStartAction(null);
    releasePendingRenderedPlayer();
    if (reRenderTimerRef.current) clearTimeout(reRenderTimerRef.current);
    reRenderTimerRef.current = setTimeout(async () => {
      const engine = engineRef.current;
      if (!engine?.getIsRunning()) return;
      engine.setPendingMeasureStartAction(null);
      const realtimeBeatMode =
        !barModeRef.current &&
        !String(soundSetRef.current).startsWith("custom") &&
        volumeRef.current <= 1 &&
        tonePositionRef?.current.x === 0 &&
        tonePositionRef?.current.y === 0 &&
        Platform.OS === "web";
      if (realtimeBeatMode) {
        stopRenderedAudio();
        engine.setPreRenderedAudio(false);
        outputStateRef.current.transition("realtime");
        return;
      }

      if (Platform.OS === "web") {
        const generation = ++renderGenerationRef.current;
        const signal = beginAbortableRender(renderGenerationRef);
        try {
          const scheduleInfo = engine.getScheduleInfo();
          const ticks = scheduleInfo.ticks as TickInfo[];
          const [clickPCMs, layerClickPCMs, samplePCMs] = await Promise.all([
            getClickPCMs(soundSetRef.current, signal),
            getLayerClickPCMsForSchedule(ticks, signal),
            getSamplePCMs(noteSamplesRef.current, signal),
          ]);
          if (generation !== renderGenerationRef.current || !engine.getIsRunning()) return;
          const pcm = await renderMeasureAbortable({
            schedule: ticks,
            measureDurationMs: scheduleInfo.durationMs,
            clickPCMs,
            samplePCMs,
            clickVolume: Math.max(0, volumeRef.current),
            sampleVolume: samplePCMs.size > 0 ? sampleVolumeRef.current : 0,
            sampleVolumes: noteSampleVolumesRef.current,
            sampleSpeeds: noteSampleSpeedsRef.current,
            sampleChannels: noteSampleChannelsRef.current,
            metronomeChannel: barModeRef.current ? barMetronomeChannelRef.current : "both",
            metroChannelsByBeat: barModeRef.current ? noteSampleMetroChannelsRef.current : undefined,
            layerClickPCMs,
          }, signal);
          if (generation !== renderGenerationRef.current || !engine.getIsRunning()) return;
          engine.setPendingMeasureStartAction(() => {
            if (generation !== renderGenerationRef.current || !engine.getIsRunning()) return;
            const previous = webRenderedLoopRef.current;
            const previousDuration = previous?.getDurationSeconds?.();
            const nextDuration = (pcm instanceof Float32Array
              ? pcm.length
              : Math.min(pcm.left.length, pcm.right.length)) / 44100;
            const phaseCompatible = previousDuration !== undefined
              && Math.abs(previousDuration - nextDuration) < 0.001;
            const boundary = phaseCompatible ? previous?.getNextBoundaryTime?.() : undefined;
            outputStateRef.current.transition("transitioning");
            const loop = playWebRenderedLoop(pcm, undefined, "both", 1, boundary);
            if (previous) {
              try { previous.stop(boundary); } catch {}
            }
            activateWebRenderedLoop(loop);
            engine.setPreRenderedAudio(true);
          });
        } catch (error) {
          if (isRenderAborted(error)) return;
          if (generation !== renderGenerationRef.current) return;
          fatalRenderFailureRef.current();
        } finally {
          finishAbortableRender(renderGenerationRef, signal);
        }
      } else {
        try {
          const result = await buildRenderedPlayerDetailed();
          if (result.status === "aborted") return;
          if (result.status === "failed") {
            fatalRenderFailureRef.current();
            return;
          }
          const player = result.player;
          const generation = renderGenerationRef.current;
          if (!engine.getIsRunning()) { try { player.release(); } catch {} return; }
          pendingRenderedPlayerRef.current = player;
          engine.setPendingMeasureStartAction(() => {
            if (generation !== renderGenerationRef.current || !engine.getIsRunning()) {
              if (pendingRenderedPlayerRef.current === player) {
                pendingRenderedPlayerRef.current = null;
              }
              try { player.release(); } catch {}
              return;
            }
            if (renderedPlayerRef.current) {
              try { renderedPlayerRef.current.pause(); renderedPlayerRef.current.release(); } catch {}
              renderedPlayerRef.current = null;
            }
            pendingRenderedPlayerRef.current = null;
            renderedPlayerRef.current = player;
            engine.setPreRenderedAudio(true);
            safePlay(player, "preRender.initial");
          });
        } catch {
          fatalRenderFailureRef.current();
        }
      }
    }, 300);
  }, [activateWebRenderedLoop, buildRenderedPlayerDetailed, fatalRenderFailureRef, getClickPCMs, getLayerClickPCMsForSchedule, getSamplePCMs, releasePendingRenderedPlayer, stopRenderedAudio, tonePositionRef, volumeRef]);

  const invalidateSamplePCMCache = useCallback((key?: string) => {
    renderGenerationRef.current += 1;
    if (key) {
      samplePCMCacheRef.current.delete(key);
      samplePCMUriRef.current.delete(key);
    } else {
      samplePCMCacheRef.current.clear();
      samplePCMUriRef.current.clear();
    }
  }, [renderGenerationRef]);

  // ── Note sample player management ───────────────────────────────────────────
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
      try { result = await syncStereoArtifact(key, uri, channel); }
      catch (e) {
        captureBreadcrumb({ category: "sample.preload", message: "syncStereoArtifact failed", level: "warning", data: { key, error: String(e) } });
        continue;
      }
      if (keepExisting && existing[key] && !result.changed) {
        const player = existing[key];
        player.volume = Math.max(0, Math.min(1, sampleVolumeRef.current * (noteSampleVolumesRef.current[key] ?? 1)));
        player.playbackRate = noteSampleSpeedsRef.current[key] ?? 1;
        player.shouldCorrectPitch = false;
        newPlayers[key] = player;
        keysToKeep.add(key);
      } else {
        try {
          const isFileUri = result.uri.startsWith("file://");
          const player = createAudioPlayer(result.uri, { downloadFirst: isFileUri });
          player.volume = Math.max(0, Math.min(1, sampleVolumeRef.current * (noteSampleVolumesRef.current[key] ?? 1)));
          player.playbackRate = noteSampleSpeedsRef.current[key] ?? 1;
          player.shouldCorrectPitch = false;
          newPlayers[key] = player;
        } catch (e) {
          captureBreadcrumb({ category: "sample.preload", message: "Failed", level: "warning", data: { key, error: String(e) } });
        }
      }
    }
    for (const [key, s] of Object.entries(existing)) {
      if (!keysToKeep.has(key)) {
        try { s.release(); } catch {}
        if (!samples[key]) { await releaseStereoArtifact(key); }
      }
    }
    noteSampleSoundsRef.current = newPlayers;
  }, []);

  const clearSamplePlayStates = useCallback(() => {
    for (const [, state] of Object.entries(samplePlayStateRef.current)) {
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

  // ── Playback-recovery watchdog ───────────────────────────────────────────────
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
      const webCtxSuspended = Platform.OS === "web" && (getWebAudioContext()?.state === "suspended");
      const renderedOutputHealthy = Platform.OS === "web"
        ? (webRenderedLoopRef.current?.isRunning() ?? false)
        : (renderedPlayerRef.current?.playing ?? false);
      const isStuck = webCtxSuspended || (!renderedOutputHealthy && timeSinceFire > threshold);

      if (!isStuck) {
        const sample = webClockAdapterRef.current?.now();
        if (sample) {
          timingDiagnosticsRef.current.record(sample);
          const positionSeconds = webRenderedLoopRef.current?.getPositionSeconds?.();
          if (positionSeconds !== undefined && outputStateRef.current.snapshot().mode === "prerender") {
            engine.syncToMeasureElapsedMs(
              positionSeconds * 1000,
              AUDIO_TIMING_LIMITS.uiResyncThresholdMs,
            );
          }
          if (__DEV__) {
            const summary = timingDiagnosticsRef.current.summary(sample.performanceTimeMs);
            if (summary && summary.sampleCount % 20 === 0) {
              console.debug("[audio-clock]", {
                samples: summary.sampleCount,
                driftPerMinuteMs: Math.round(summary.driftPerMinuteMs * 10) / 10,
                maxJitterMs: Math.round(summary.maxJitterMs * 10) / 10,
              });
            }
          }
        }
        if (audioRetryCountRef.current > 0) markAudioRecoverySucceeded();
        audioWatchdogTimerRef.current = setTimeout(runCheck, 3000);
        return;
      }

      if (audioRetryCountRef.current < 2) {
        audioRetryCountRef.current += 1;
        // A watchdog only observes missing callbacks; it cannot prove that
        // output has stopped (for example, pre-rendered audio bypasses those
        // callbacks). Retry silently and reserve lifecycle recovery UI for
        // real session interruptions or a confirmed failure.
        if (Platform.OS === "web") {
          const ctx = getWebAudioContext();
          if (ctx?.state === "suspended") { ctx.resume().catch(() => {}); }
          if (!webClickReadyRef.current) {
            const src = soundSets[soundSetRef.current as keyof typeof soundSets] || soundSets.classic;
            ensureWebClickBuffers(src as any).then((ok) => { if (ok) webClickReadyRef.current = true; }).catch(() => {});
          }
        }
        stopRenderedAudio();
        outputStateRef.current.transition("recovering");
        lastAudioFireRef.current = Date.now();
        audioWatchdogTimerRef.current = setTimeout(runCheck, 3500);
      } else {
        outputStateRef.current.transition("failed");
        markAudioRecoveryFailed("watchdog");
        showRecoveryToastRef.current(t("main", "audioRecoveryFailed"));
        audioWatchdogTimerRef.current = null;
      }
    };

    armTimeRef.current = Date.now();
    audioWatchdogTimerRef.current = setTimeout(runCheck, 4000);
  }, [clearAudioWatchdog, stopRenderedAudio, t]);

  useEffect(() => {
    armAudioWatchdogRef.current = armAudioWatchdog;
    clearAudioWatchdogRef.current = clearAudioWatchdog;
  }, [armAudioWatchdog, clearAudioWatchdog]);

  return {
    // Player pool
    allPlayersRef,
    soundSetRef,
    highToggle,
    lowToggle,
    strongToggle,
    // Audio-session settings
    backgroundPlay,
    playbackNotifications,
    autoResumeAfterInterruption,
    updateBackgroundPlay,
    updatePlaybackNotifications,
    updateAutoResumeAfterInterruption,
    applyAudioSettings,
    // PCM / rendered-player refs
    renderedPlayerRef,
    samplePCMCacheRef,
    renderedUrlRef,
    webRenderedLoopRef,
    activateWebRenderedLoop,
    lastAudioFireRef,
    beginAudioStartupProbe,
    getAudioStartupEpoch,
    invalidateAudioStartupProbe,
    isAudioStartupEpochCurrent,
    recordAudioActivity,
    waitForFirstAudioActivity,
    armAudioWatchdogRef,
    clearAudioWatchdogRef,
    samplePlayStateRef,
    buildRenderedPlayer,
    buildRenderedPlayerDetailed,
    scheduleReRender,
    stopRenderedAudio,
    getClickPCMs,
    getSamplePCMs,
    getLayerClickPCMsForSchedule,
    invalidateSamplePCMCache,
    preloadNoteSampleSounds,
    clearSamplePlayStates,
    armAudioWatchdog,
    clearAudioWatchdog,
    scheduleRealtimeWebClick,
    clearRealtimeWebAudio,
  };
}
