import { useRef, useEffect, useCallback, useState } from "react";
import { Platform } from "react-native";
import type { AudioPlayer as ExpoAudioPlayer } from "expo-audio";
import { soundSets } from "@/lib/metronome-engine";
import type { MetronomeEngine } from "@/lib/metronome-engine";
import {
  parseTrimInfo,
  renderMeasure,
  saveRenderedWav,
  releaseRenderedWav,
  ensureWebClickBuffers,
  getWebAudioContext,
  isRenderAborted,
  renderMeasureAbortable,
} from "@/lib/audio-renderer";
import { loadPCM, isPCMCancelled } from "@/lib/pcm-loader";
import { createAudioWarmup } from "@/lib/audio-warmup";
import { getPCM, getClickPCM, getDecodedPCM, peekPCM, invalidatePCMCache } from "@/lib/pcm-cache";
import {
  createAudioRenderLifecycle,
  type AudioRenderLifecycle,
  type AudioRenderResult,
} from "@/lib/audio-render-lifecycle";
import {
  syncStereoArtifact,
  releaseStereoArtifact,
  releaseStereoArtifactIfCurrent,
} from "@/lib/sample-cache";
import { captureBreadcrumb } from "@/lib/error-tracking";
import { safePlay } from "@/lib/audio-utils";
import {
  createAudioOutputOwner,
  publishAudioOutput,
  type AudioOutputOwner,
  type AudioOutputResource,
} from "@/lib/audio-output-owner";
import type { NativeAudioOutput } from "@/lib/native-audio-output";
import type { WebAudioOutput } from "@/lib/web-audio-output";
import { isSafeNoteSampleUri } from "@/lib/index.helpers";
import type {
  ClickPCMs,
  SamplePCMEntry,
  TickInfo,
  DecodedSample,
} from "@/lib/audio-renderer";
import type { SoundSet, CustomSoundSetConfig } from "@/lib/storage";
import type { NoteSampleMap, NoteSampleChannelMap, NoteSampleMetroChannelMap, NoteSampleVolumeMap, NoteSampleSpeedMap } from "@/lib/note-samples";
import type { SampleChannel } from "@/lib/stereo-channel";
import type { TonePosition } from "@/lib/metronome-tone-dsp";
import {
  applyAudioToneSnapshot,
  createAudioToneSnapshot,
  readAudioToneSnapshot,
  type AudioToneSnapshot,
} from "@/lib/audio-tone-snapshot";
import type { MetronomePlaybackPlan } from "@/lib/audio-playback-plan";
import { useAudioPlayers } from "@/hooks/useAudioPlayers";
import type { BuiltinPlayers } from "@/hooks/useAudioPlayers";
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
  AudioTimingDiagnostics,
} from "@/lib/audio-clock";

/** Compatibility export for callers that size their note-sample aliases. */
export const NOTE_SAMPLE_PCM_CACHE_LIMIT = 16;

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
  isPlayingRef: React.MutableRefObject<boolean>;
  isPreparingRef: React.MutableRefObject<boolean>;
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
  samplePCMCacheRef: React.MutableRefObject<Map<string, SamplePCMEntry>>;
  audioRenderLifecycle: AudioRenderLifecycle;
  outputOwner: AudioOutputOwner;
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
  prepareRenderedPlayer: (
    plan?: MetronomePlaybackPlan,
    toneSnapshotOverride?: AudioToneSnapshot,
  ) => Promise<
    AudioRenderResult<AudioOutputResource>
  >;
  scheduleReRender: () => void;
  stopRenderedAudio: () => void;
  stopPlaybackAudio: () => void;
  getClickPCMs: (
    set: SoundSet,
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
  invalidateSamplePCMCache: (key?: string) => void;
  preloadNoteSampleSounds: (samples: NoteSampleMap, keepExisting?: boolean) => Promise<void>;
  cancelNoteSamplePreload: () => void;
  clearSamplePlayStates: () => void;
  queueNoteSamplePlayback: (
    key: string,
    player: ExpoAudioPlayer,
    startMs: number,
    durationMs: number,
  ) => boolean;
  releaseNoteSampleResource: (key: string) => Promise<void>;
  releaseNoteSampleResources: (playbackAlreadyStopped?: boolean) => void;
  armAudioWatchdog: () => void;
  clearAudioWatchdog: () => void;
  scheduleRealtimeWebClick: (
    role: "strong" | "high" | "low",
    channel: SampleChannel | "off",
    atPerformanceTime: number,
  ) => boolean;
  clearRealtimeWebAudio: () => void;
  captureAudioToneSnapshot: () => AudioToneSnapshot;
  setActiveAudioToneSnapshot: (snapshot: AudioToneSnapshot) => void;
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
    isPlayingRef, isPreparingRef, bpmRef, t, showRecoveryToast, persistAudioSettingsCallbackRef,
    fatalRenderFailureRef,
  } = params;

  const outputOwnerRef = useRef<AudioOutputOwner | null>(null);
  if (!outputOwnerRef.current) {
    outputOwnerRef.current = createAudioOutputOwner();
  }
  const outputOwner = outputOwnerRef.current;
  const audioWarmupRef = useRef<ReturnType<typeof createAudioWarmup> | null>(null);
  if (!audioWarmupRef.current) audioWarmupRef.current = createAudioWarmup();

  // ── Player pool ownership (moved from useMetronomeScreen) ───────────────────
  // allPlayersRef, soundSetRef, highToggle/lowToggle/strongToggle are now owned
  // here. useMetronomeScreen's tick callback reads these via the return value.
  const { allPlayersRef, soundSetRef, highToggle, lowToggle, strongToggle, setPoolsVolume } =
    useAudioPlayers(soundSet, params.soundSetRef, outputOwner);

  // 3 refs now live in useMetronomeScreen (shared with useSettings)
  const { clickPCMCacheRef, webClickReadyRef, noteSampleSoundsRef } = params;
  const initialToneSnapshot = createAudioToneSnapshot({
    volume: volumeRef.current,
    defaultSoundSet: soundSetRef.current,
    defaultPosition: tonePositionRef?.current,
    positions: tonePositionsRef?.current,
  });
  const activeToneSnapshotRef = useRef(initialToneSnapshot);
  const captureAudioToneSnapshot = useCallback(() => createAudioToneSnapshot({
    volume: volumeRef.current,
    defaultSoundSet: soundSetRef.current,
    defaultPosition: tonePositionRef?.current,
    positions: tonePositionsRef?.current,
  }), [soundSetRef, tonePositionRef, tonePositionsRef, volumeRef]);
  const setActiveAudioToneSnapshot = useCallback((snapshot: AudioToneSnapshot) => {
    activeToneSnapshotRef.current = snapshot;
    setPoolsVolume(snapshot.realtimeGain);
  }, [setPoolsVolume]);

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
    const snapshot = createAudioToneSnapshot({
      volume,
      defaultSoundSet: soundSetRef.current,
      defaultPosition: tonePositionRef?.current,
      positions: tonePositionsRef?.current,
    });
    if (!isPlayingRef.current && !isPreparingRef?.current) {
      activeToneSnapshotRef.current = snapshot;
      setPoolsVolume(snapshot.realtimeGain);
    }
  }, [isPlayingRef, isPreparingRef, setPoolsVolume, soundSetRef, tonePositionRef, tonePositionsRef, volume]);

  // ── Owned refs ──────────────────────────────────────────────────────────────
  const releasedPlayersRef = useRef(new WeakSet<object>());
  const mountedRef = useRef(true);
  const samplePreloadGenerationRef = useRef(0);
  const samplePreloadKeysRef = useRef(new Set<string>());
  const samplePreloadOwnerRef = useRef(new Map<string, number>());
  const samplePCMCacheRef = useRef<Map<string, SamplePCMEntry>>(new Map());
  const samplePCMUriRef = useRef<Map<string, string>>(new Map());
  // URI ownership is independent from beat-cell keys. Note queue look-ahead
  // can safely warm this cache without replacing the current entry's key map.
  const samplePCMCacheGenerationRef = useRef(0);
  const pcmPreparationOwnerRef = useRef(new AbortController());
  const audioRenderLifecycleRef = useRef<AudioRenderLifecycle | null>(null);
  if (!audioRenderLifecycleRef.current) {
    audioRenderLifecycleRef.current = createAudioRenderLifecycle();
  }
  const audioRenderLifecycle = audioRenderLifecycleRef.current;
  const webClockAdapterRef = useRef<AudioClockAdapter | null>(null);
  const timingDiagnosticsRef = useRef(new AudioTimingDiagnostics(__DEV__));
  const lastAudioFireRef = useRef(0);
  const audioStartupEpochRef = useRef(0);
  const audioWatchdogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioRetryCountRef = useRef(0);
  const armAudioWatchdogRef = useRef<() => void>(() => {});
  const clearAudioWatchdogRef = useRef<() => void>(() => {});
  const reRenderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const samplePlayStateRef = useRef<Record<string, { playing: boolean; endTimer: ReturnType<typeof setTimeout> | null }>>({});
  const samplePlaybackEpochRef = useRef(0);
  const armTimeRef = useRef<number | null>(null);
  const showRecoveryToastRef = useRef(showRecoveryToast);
  useEffect(() => { showRecoveryToastRef.current = showRecoveryToast; }, [showRecoveryToast]);

  const clearRealtimeWebAudio = useCallback(() => {
    outputOwner.clearRealtime();
  }, [outputOwner]);

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
    if (!mountedRef.current) return false;
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
    if (outputOwner.snapshot().mode !== "realtime") {
      outputOwner.transition("realtime");
    }
    const generation = outputOwner.snapshot().generation;
    const startupEpoch = audioStartupEpochRef.current;
    const source = (outputOwner.adapter as WebAudioOutput).click(
      role,
      channel,
      activeToneSnapshotRef.current.realtimeGain,
      atAudioTime,
    );
    if (!source) return false;
    outputOwner.trackRealtime(source);
    source.onEnded?.(() => {
      if (outputOwner.owns(generation) && outputOwner.snapshot().mode === "realtime") {
        recordAudioActivity(startupEpoch);
      }
    });
    return true;
  }, [outputOwner, recordAudioActivity]);
  useEffect(() => {
    // StrictMode replays cleanup/setup while preserving refs. Reactivating the
    // same state machine supports that replay, while a true unmount leaves it
    // permanently disposed so escaped callbacks cannot publish new output.
    audioRenderLifecycle.activate();
    return () => {
      audioRenderLifecycle.dispose();
      audioWarmupRef.current?.dispose();
      clearRealtimeWebAudio();
      if (reRenderTimerRef.current) {
        clearTimeout(reRenderTimerRef.current);
        reRenderTimerRef.current = null;
      }
    };
  }, [audioRenderLifecycle, clearRealtimeWebAudio]);

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


  const getClickPCMs = useCallback(async (
    set: SoundSet,
    signal?: AbortSignal,
    toneSnapshot?: AudioToneSnapshot,
    customConfigOverride?: Readonly<CustomSoundSetConfig> | null,
  ): Promise<ClickPCMs> => {
    const snapshot = toneSnapshot ?? createAudioToneSnapshot({
      volume: volumeRef.current,
      defaultSoundSet: soundSetRef.current,
      defaultPosition: tonePositionRef?.current,
      positions: tonePositionsRef?.current,
    });
    const shape = (pcm: Float32Array) =>
      applyAudioToneSnapshot(pcm, snapshot, set) as Float32Array;
    const customCfg = customConfigOverride === undefined
      ? customSoundSetsRef.current[set]
      : customConfigOverride ?? undefined;
    if (customCfg) {
      const loadSample = async (cfg: any, preparationSignal: AbortSignal) => {
        if (cfg.type === "custom" && cfg.sampleUri) {
          try {
            const pcm = await getDecodedPCM(
              `raw:${cfg.sampleUri}`,
              loadSignal => loadPCM(cfg.sampleUri, loadSignal),
              preparationSignal,
            );
            if (pcm) {
              const trimmed = trimPCM({ pcm, trimStartSamples: 0, trimLenSamples: pcm.length }, cfg.duration);
              return trimmed.pcm;
            }
            captureBreadcrumb({ category: "custom-sound", message: "Decode returned null", level: "warning", data: { sampleUri: cfg.sampleUri } });
          } catch (e) {
            if (isRenderAborted(e) || isPCMCancelled(e)) throw e;
            captureBreadcrumb({ category: "custom-sound", message: "Failed to decode custom sample", level: "warning", data: { error: String(e) } });
          }
        }
        const srcSet = cfg.sourceSet || "classic";
        const srcRole = cfg.sourceRole || "strong";
        const src = (soundSets as Record<string, typeof soundSets.classic>)[srcSet] ?? soundSets.classic;
        const asset = srcRole === "strong" ? src.strong : srcRole === "high" ? src.high : src.low;
        const raw = await getDecodedPCM(
          `raw:asset:${String(asset)}`,
          loadSignal => loadPCM({ kind: "asset", source: asset }, loadSignal),
          preparationSignal,
        );
        const trimmed = trimPCM({ pcm: raw, trimStartSamples: 0, trimLenSamples: raw.length }, cfg.duration);
        return trimmed.pcm;
      };
      const key = `click:${set}:${JSON.stringify(customCfg)}:${JSON.stringify(snapshot)}`;
      return getClickPCM(key, async (preparationSignal) => {
        const [strong, high, low] = await Promise.all([
          loadSample(customCfg.strong, preparationSignal),
          loadSample(customCfg.accent, preparationSignal),
          loadSample(customCfg.normal, preparationSignal),
        ]);
        return { strong: shape(strong), high: shape(high), low: shape(low) };
      }, signal);
    }
    const src = soundSets[set as keyof typeof soundSets] || soundSets.classic;
    const key = `click:${set}:${JSON.stringify(snapshot)}`;
    return getClickPCM(key, async (preparationSignal) => {
      const [strong, high, low] = await Promise.all([
        getDecodedPCM(`raw:asset:${String(src.strong)}`, loadSignal => loadPCM({ kind: "asset", source: src.strong }, loadSignal), preparationSignal),
        getDecodedPCM(`raw:asset:${String(src.high)}`, loadSignal => loadPCM({ kind: "asset", source: src.high }, loadSignal), preparationSignal),
        getDecodedPCM(`raw:asset:${String(src.low)}`, loadSignal => loadPCM({ kind: "asset", source: src.low }, loadSignal), preparationSignal),
      ]);
      return { strong: shape(strong), high: shape(high), low: shape(low) };
    }, signal);
  }, [clickPCMCacheRef, customSoundSetsRef, soundSetRef, tonePositionRef, tonePositionsRef, trimPCM, volumeRef]);

  // Warm only decoded/shaped PCM. Playback-owned WebAudio buffers are created
  // later at the explicit playback-start boundary.
  useEffect(() => {
    if (Platform.OS !== "web") return;
    void audioWarmupRef.current!.warm(
      `web-click-pcm:${soundSet}`,
      signal => getClickPCMs(soundSet, signal),
    ).catch(() => {});
  }, [getClickPCMs, soundSet]);

  const getSamplePCMs = useCallback(async (samples: NoteSampleMap, signal?: AbortSignal): Promise<Map<string, SamplePCMEntry>> => {
    const map = new Map<string, SamplePCMEntry>();
    const entries = Object.entries(samples);
    if (entries.length === 0) return map;
    const ownerSignal = pcmPreparationOwnerRef.current.signal;
    const preparationController = new AbortController();
    const abortPreparation = () => preparationController.abort();
    const linkedSignals = [ownerSignal, signal].filter((value): value is AbortSignal => Boolean(value));
    for (const linkedSignal of linkedSignals) {
      if (linkedSignal.aborted) {
        abortPreparation();
      } else {
        linkedSignal.addEventListener("abort", abortPreparation, { once: true });
      }
    }
    const cacheGeneration = samplePCMCacheGenerationRef.current;
    try {
      await Promise.all(entries.map(async ([key, uri]) => {
        const canonicalKey = `sample:${uri}`;
        const cached = peekPCM<SamplePCMEntry>(canonicalKey);
        if (cached) {
          map.set(key, cached);
          return;
        }
        try {
          const pcm = await getPCM(canonicalKey, async (preparationSignal) => {
            const decoded = await loadPCM(uri, preparationSignal);
            const { trimStartMs, trimDurationMs } = parseTrimInfo(uri);
            return { pcm: decoded, trimStartMs, trimDurationMs };
          }, preparationController.signal);
          if (
            pcm &&
            mountedRef.current &&
            cacheGeneration === samplePCMCacheGenerationRef.current
          ) {
            const entry = pcm;
            map.set(key, entry);
            if (noteSamplesRef.current[key] === uri) {
              samplePCMUriRef.current.set(key, uri);
            }
          }
        } catch (e) {
          if (isRenderAborted(e) || isPCMCancelled(e)) throw e;
          captureBreadcrumb({ category: "pre-render", message: "Failed to decode sample", level: "warning", data: { key, error: String(e) } });
        }
      }));
      return map;
    } finally {
      for (const linkedSignal of linkedSignals) {
        linkedSignal.removeEventListener("abort", abortPreparation);
      }
    }
  }, [noteSamplesRef]);

  const getLayerClickPCMsForSchedule = useCallback(async (
    ticks: TickInfo[],
    signal?: AbortSignal,
    snapshot?: {
      defaultSoundSet: SoundSet;
      layerSoundSets: Readonly<Record<number, SoundSet>>;
      tone: AudioToneSnapshot;
      customSoundSets: Readonly<Record<string, Readonly<CustomSoundSetConfig>>>;
    },
  ): Promise<Map<string, ClickPCMs>> => {
    const soundSetByName = new Set<string>();
    const fallbackByIndex = new Map<number, string>();
    for (const tick of ticks) {
      const li = tick.layerIndex ?? 0;
      if (li > 0) {
        if (tick.layerSoundSet) {
          soundSetByName.add(tick.layerSoundSet);
        } else {
          const ss = snapshot
            ? snapshot.layerSoundSets[li] || snapshot.defaultSoundSet
            : layerSoundSetsRef.current[li] || soundSetRef.current;
          fallbackByIndex.set(li, ss);
          soundSetByName.add(ss);
        }
      }
    }
    const loaded = new Map<string, ClickPCMs>();
    await Promise.all([...soundSetByName].map(async (ss) => {
      const pcms = await getClickPCMs(
        ss as SoundSet,
        signal,
        snapshot?.tone,
        snapshot ? snapshot.customSoundSets[ss] ?? null : undefined,
      );
      loaded.set(ss, pcms);
    }));
    const map = new Map<string, ClickPCMs>(loaded);
    for (const [li, ss] of fallbackByIndex) {
      const pcms = loaded.get(ss);
      if (pcms) map.set(`#${li}`, pcms);
    }
    return map;
  }, [getClickPCMs, layerSoundSetsRef, soundSetRef]);

  // ── Core audio player lifecycle ──────────────────────────────────────────────
  const releaseAudioPlayer = useCallback((player: ExpoAudioPlayer, pause = true) => {
    if (releasedPlayersRef.current.has(player)) return;
    releasedPlayersRef.current.add(player);
    if (pause) {
      try { player.pause(); } catch {}
    }
    if (!outputOwner.releaseManaged(player)) {
      outputOwner.nativeAdapter.releasePlayer(player);
    }
  }, [outputOwner]);
  const manageAudioPlayer = useCallback((player: ExpoAudioPlayer) => {
    outputOwner.manage(player, {
      stop: () => { try { player.pause(); } catch {} },
      release: () => outputOwner.nativeAdapter.releasePlayer(player),
    });
    return player;
  }, [outputOwner]);

  const prepareRenderedPlayer = useCallback(async (
    plan?: MetronomePlaybackPlan,
    toneSnapshotOverride?: AudioToneSnapshot,
  ): Promise<AudioRenderResult<AudioOutputResource>> => {
    const engine = engineRef.current;
    const session = audioRenderLifecycle.start();
    if (!engine) return session.fail(new Error("Audio engine is unavailable"));
    const signal = session.signal;
    try {
      const audio = plan?.audio ?? {
        soundSet: soundSetRef.current,
        sampleVolume: sampleVolumeRef.current,
        tone: toneSnapshotOverride ?? captureAudioToneSnapshot(),
        customSoundSets: customSoundSetsRef.current,
        noteSamples: noteSamplesRef.current,
        noteSampleChannels: noteSampleChannelsRef.current,
        noteSampleVolumes: noteSampleVolumesRef.current,
        noteSampleSpeeds: noteSampleSpeedsRef.current,
        metronomeChannel: barModeRef.current ? barMetronomeChannelRef.current : "both" as const,
        noteSampleMetroChannels: noteSampleMetroChannelsRef.current,
        layerSoundSets: layerSoundSetsRef.current,
      };
      const scheduleInfo = engine.getScheduleInfo();
      const ticks = scheduleInfo.ticks as TickInfo[];
      const [clickPCMs, layerClickPCMs, samplePCMs] = await Promise.all([
        getClickPCMs(
          audio.soundSet,
          signal,
          audio.tone,
          plan ? audio.customSoundSets[audio.soundSet] ?? null : undefined,
        ),
        getLayerClickPCMsForSchedule(ticks, signal, plan ? {
          defaultSoundSet: audio.soundSet,
          layerSoundSets: audio.layerSoundSets,
          tone: audio.tone,
          customSoundSets: audio.customSoundSets,
        } : undefined),
        getSamplePCMs(audio.noteSamples, signal),
      ]);
      if (!session.isCurrent()) return session.interruption();
      await new Promise(r => setTimeout(r, 0));
      if (!session.isCurrent()) return session.interruption();
      const pcm = await renderMeasureAbortable({
        schedule: ticks,
        measureDurationMs: scheduleInfo.durationMs,
        clickPCMs,
        samplePCMs,
        clickVolume: audio.tone.renderGain,
        sampleVolume: samplePCMs.size > 0 ? audio.sampleVolume : 0,
        sampleVolumes: audio.noteSampleVolumes,
        sampleSpeeds: audio.noteSampleSpeeds,
        sampleChannels: audio.noteSampleChannels,
        metronomeChannel: audio.metronomeChannel,
        metroChannelsByBeat: plan
          ? plan.mode === "bar" ? audio.noteSampleMetroChannels : undefined
          : barModeRef.current ? audio.noteSampleMetroChannels : undefined,
        layerClickPCMs,
      }, signal);
      const wavUri = await saveRenderedWav(
        pcm,
        `rendered_measure_${session.id}.wav`,
      );
      let output: AudioOutputResource;
      try {
        output = (outputOwner.adapter as NativeAudioOutput).rendered(
          wavUri,
          audio.tone.outputGain,
          releaseRenderedWav,
        );
      } catch (error) {
        releaseRenderedWav(wavUri);
        captureBreadcrumb({ category: "pre-render", message: "Failed, falling back to per-tick audio", level: "warning", data: { error: String(error) } });
        return session.fail(error);
      }
      const acquired = session.complete(output, (resource) => resource.release());
      if (acquired.status !== "completed") return acquired;
      // 예전엔 1.0 고정값이라 사용자가 설정한 실제 볼륨(예: 0.8)을 무시하고
      // pre-rendered 루프로 전환되는 순간 항상 최대 볼륨으로 재생됐다
      // (2026-08-25 확인). per-tick 풀 플레이어(setPoolsVolume)와 동일하게
      // 실제 볼륨을 반영한다.
      const prepared = acquired.prepared;
      return {
        status: "completed" as const,
        prepared: {
          value: output,
          commit(publish: (value: AudioOutputResource) => void) {
            return prepared.commit((resource) => {
              publish(resource);
              outputOwner.transition("prerender");
            });
          },
          discard: () => prepared.discard(),
          fail: (error: unknown) => prepared.fail(error),
        },
      };
    } catch (e) {
      if (isRenderAborted(e) || !session.isCurrent()) return session.interruption();
      captureBreadcrumb({ category: "pre-render", message: "Failed, falling back to per-tick audio", level: "warning", data: { error: String(e) } });
      return session.fail(e);
    }
  }, [
    audioRenderLifecycle,
    captureAudioToneSnapshot,
    barMetronomeChannelRef,
    barModeRef,
    engineRef,
    getClickPCMs,
    getLayerClickPCMsForSchedule,
    getSamplePCMs,
    noteSampleChannelsRef,
    noteSampleMetroChannelsRef,
    noteSampleSpeedsRef,
    noteSampleVolumesRef,
    noteSamplesRef,
    outputOwner,
    sampleVolumeRef,
    soundSetRef,
  ]);

  const stopRenderedAudio = useCallback(() => {
    audioRenderLifecycle.cancel();
    clearRealtimeWebAudio();
    engineRef.current?.setPendingMeasureStartAction(null);
    outputOwner.stop();
    const engine = engineRef.current;
    if (engine) engine.setPreRenderedAudio(false);
    webClockAdapterRef.current?.invalidate();
  }, [audioRenderLifecycle, clearRealtimeWebAudio, engineRef, outputOwner]);

  const scheduleReRender = useCallback(() => {
    const toneSnapshot = captureAudioToneSnapshot();
    setActiveAudioToneSnapshot(toneSnapshot);
    audioRenderLifecycle.cancel();
    engineRef.current?.setPendingMeasureStartAction(null);
    if (reRenderTimerRef.current) clearTimeout(reRenderTimerRef.current);
    reRenderTimerRef.current = setTimeout(async () => {
       if (!mountedRef.current) return;
      const engine = engineRef.current;
      if (!engine?.getIsRunning()) return;
      engine.setPendingMeasureStartAction(null);
      const realtimeBeatMode =
        !barModeRef.current &&
        !String(soundSetRef.current).startsWith("custom") &&
        !toneSnapshot.boosted &&
        !toneSnapshot.toneShaped &&
        Platform.OS === "web";
      if (realtimeBeatMode) {
        stopRenderedAudio();
        engine.setPreRenderedAudio(false);
        outputOwner.transition("realtime");
        return;
      }

      if (Platform.OS === "web") {
        const session = audioRenderLifecycle.start();
        const signal = session.signal;
        try {
          const scheduleInfo = engine.getScheduleInfo();
          const ticks = scheduleInfo.ticks as TickInfo[];
          const [clickPCMs, layerClickPCMs, samplePCMs] = await Promise.all([
            getClickPCMs(soundSetRef.current, signal, toneSnapshot),
            getLayerClickPCMsForSchedule(ticks, signal, {
              defaultSoundSet: soundSetRef.current,
              layerSoundSets: layerSoundSetsRef.current,
              tone: toneSnapshot,
              customSoundSets: customSoundSetsRef.current,
            }),
            getSamplePCMs(noteSamplesRef.current, signal),
          ]);
          if (!session.isCurrent()) return;
          if (!engine.getIsRunning()) {
            audioRenderLifecycle.cancel();
            return;
          }
          const pcm = await renderMeasureAbortable({
            schedule: ticks,
            measureDurationMs: scheduleInfo.durationMs,
            clickPCMs,
            samplePCMs,
            clickVolume: toneSnapshot.renderGain,
            sampleVolume: samplePCMs.size > 0 ? sampleVolumeRef.current : 0,
            sampleVolumes: noteSampleVolumesRef.current,
            sampleSpeeds: noteSampleSpeedsRef.current,
            sampleChannels: noteSampleChannelsRef.current,
            metronomeChannel: barModeRef.current ? barMetronomeChannelRef.current : "both",
            metroChannelsByBeat: barModeRef.current ? noteSampleMetroChannelsRef.current : undefined,
            layerClickPCMs,
          }, signal);
          if (!session.isCurrent()) return;
          if (!engine.getIsRunning()) {
            audioRenderLifecycle.cancel();
            return;
          }
          const result = session.complete(pcm, () => {});
          if (result.status !== "completed") return;
          const prepared = result.prepared;
          engine.setPendingMeasureStartAction(() => {
            if (!engine.getIsRunning()) {
              prepared.discard();
              return;
            }
            prepared.commit((readyPcm) => {
            const previous = outputOwner.active();
            const previousDuration = previous?.getDurationSeconds?.();
            const nextDuration = (readyPcm instanceof Float32Array
              ? readyPcm.length
              : Math.min(readyPcm.left.length, readyPcm.right.length)) / 44100;
            const phaseCompatible = previousDuration !== undefined
              && Math.abs(previousDuration - nextDuration) < 0.001;
            const boundary = phaseCompatible ? previous?.getNextBoundaryTime?.() : undefined;
            outputOwner.transition("transitioning");
            const loop = (outputOwner.adapter as WebAudioOutput).rendered(
              readyPcm,
              toneSnapshot.outputGain,
              "both",
              boundary,
            );
            publishAudioOutput(outputOwner, loop, { replaceAtAudioTime: boundary });
            const ctx = getWebAudioContext();
            if (ctx) {
              const adapter = new AudioClockAdapter({ nowSeconds: () => ctx.currentTime });
              adapter.map(loop.getPositionSeconds?.() ?? 0);
              webClockAdapterRef.current = adapter;
              const sample = adapter.now();
              if (sample) timingDiagnosticsRef.current.record(sample);
            }
            outputOwner.transition("prerender");
            engine.setPreRenderedAudio(true);
            });
          });
        } catch (error) {
          if (isRenderAborted(error) || !session.isCurrent()) return;
          session.fail(error);
          fatalRenderFailureRef.current();
        }
      } else {
        try {
          const result = await prepareRenderedPlayer(undefined, toneSnapshot);
          if (result.status === "cancelled" || result.status === "superseded") return;
          if (result.status === "failed") {
            fatalRenderFailureRef.current();
            return;
          }
          const prepared = result.prepared;
           if (!mountedRef.current || !engine.getIsRunning()) {
              prepared.discard();
             return;
           }
          engine.setPendingMeasureStartAction(() => {
             if (!mountedRef.current || !engine.getIsRunning()) {
               prepared.discard();
              return;
            }
            prepared.commit((output) => {
              engine.setPreRenderedAudio(true);
              publishAudioOutput(outputOwner, output);
              void output.playAndConfirm?.("preRender.initial");
            });
          });
         } catch {
           if (!mountedRef.current) return;
          fatalRenderFailureRef.current();
        }
      }
    }, 300);
   }, [
     barMetronomeChannelRef,
     captureAudioToneSnapshot,
     customSoundSetsRef,
     layerSoundSetsRef,
     barModeRef,
     audioRenderLifecycle,
     engineRef,
     fatalRenderFailureRef,
     getClickPCMs,
     getLayerClickPCMsForSchedule,
     getSamplePCMs,
     noteSampleChannelsRef,
     noteSampleMetroChannelsRef,
     noteSampleSpeedsRef,
     noteSampleVolumesRef,
     noteSamplesRef,
      outputOwner,
     prepareRenderedPlayer,
     sampleVolumeRef,
     soundSetRef,
     setActiveAudioToneSnapshot,
     stopRenderedAudio,
   ]);

  const invalidateSamplePCMCache = useCallback((key?: string) => {
    audioRenderLifecycle.cancel();
    samplePCMCacheGenerationRef.current += 1;
    if (key) {
      const uri = samplePCMUriRef.current.get(key);
      if (uri) invalidatePCMCache(`sample:${uri}`);
      samplePCMCacheRef.current.delete(key);
      samplePCMUriRef.current.delete(key);
    } else {
      invalidatePCMCache();
      samplePCMCacheRef.current.clear();
      samplePCMUriRef.current.clear();
    }
  }, [audioRenderLifecycle]);

  // ── Note sample player management ───────────────────────────────────────────
  const preloadNoteSampleSounds = useCallback(async (samples: NoteSampleMap, keepExisting?: boolean) => {
    const preloadGeneration = ++samplePreloadGenerationRef.current;
    const existing = noteSampleSoundsRef.current;
    const newPlayers: Record<string, ExpoAudioPlayer> = {};
    const keysToKeep = new Set<string>();
    const ownedArtifactUris = new Map<string, string>();
    const releaseNewPlayers = () => {
      for (const [key, player] of Object.entries(newPlayers)) {
        if (!keysToKeep.has(key)) releaseAudioPlayer(player);
      }
    };
    const releaseOwnedArtifacts = () => {
      for (const [key, uri] of ownedArtifactUris) {
        // A newer preload for this key owns the replacement. Its completion
        // (or unmount cleanup) is responsible for that artifact instead.
        if (samplePreloadOwnerRef.current.get(key) === preloadGeneration) {
          void releaseStereoArtifactIfCurrent(key, uri);
        }
      }
    };
    const isCurrent = () =>
      mountedRef.current && preloadGeneration === samplePreloadGenerationRef.current;

    for (const [key, uri] of Object.entries(samples)) {
      if (!isCurrent()) {
        releaseNewPlayers();
        return;
      }
      samplePreloadKeysRef.current.add(key);
      samplePreloadOwnerRef.current.set(key, preloadGeneration);
      if (!isSafeNoteSampleUri(uri)) {
        captureBreadcrumb({ category: "sample.preload", message: "Unsafe URI blocked", level: "warning", data: { key, uriPrefix: uri.slice(0, 80) } });
        samplePreloadKeysRef.current.delete(key);
        continue;
      }
      const channel = noteSampleChannelsRef.current[key] ?? "both";
      let result;
      try { result = await syncStereoArtifact(key, uri, channel); }
      catch (e) {
        captureBreadcrumb({ category: "sample.preload", message: "syncStereoArtifact failed", level: "warning", data: { key, error: String(e) } });
        samplePreloadKeysRef.current.delete(key);
        continue;
      }
      ownedArtifactUris.set(key, result.uri);
      if (!isCurrent()) {
        samplePreloadKeysRef.current.delete(key);
        releaseNewPlayers();
        releaseOwnedArtifacts();
        return;
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
          const player = manageAudioPlayer(outputOwner.nativeAdapter.createPlayer(
            result.uri,
            { downloadFirst: isFileUri },
          ));
          player.volume = Math.max(0, Math.min(1, sampleVolumeRef.current * (noteSampleVolumesRef.current[key] ?? 1)));
          player.playbackRate = noteSampleSpeedsRef.current[key] ?? 1;
          player.shouldCorrectPitch = false;
          newPlayers[key] = player;
        } catch (e) {
          captureBreadcrumb({ category: "sample.preload", message: "Failed", level: "warning", data: { key, error: String(e) } });
        }
      }
      samplePreloadKeysRef.current.delete(key);
    }
    if (!isCurrent()) {
      releaseNewPlayers();
      releaseOwnedArtifacts();
      return;
    }
    for (const [key, s] of Object.entries(existing)) {
      if (!keysToKeep.has(key)) {
        releaseAudioPlayer(s);
        if (!samples[key]) { await releaseStereoArtifact(key); }
      }
    }
    if (!isCurrent()) {
      releaseNewPlayers();
      releaseOwnedArtifacts();
      return;
    }
    noteSampleSoundsRef.current = newPlayers;
  }, [
    noteSampleChannelsRef,
    noteSampleSoundsRef,
    noteSampleSpeedsRef,
    noteSampleVolumesRef,
    manageAudioPlayer,
    outputOwner,
    releaseAudioPlayer,
    sampleVolumeRef,
  ]);

  const cancelNoteSamplePreload = useCallback(() => {
    samplePreloadGenerationRef.current += 1;
  }, []);

  const clearSamplePlayStates = useCallback(() => {
    samplePlaybackEpochRef.current += 1;
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
  }, [noteSampleSoundsRef, noteSamplesRef]);

  const queueNoteSamplePlayback = useCallback((
    key: string,
    player: ExpoAudioPlayer,
    startMs: number,
    durationMs: number,
  ): boolean => {
    const playbackEpoch = samplePlaybackEpochRef.current;
    const stillOwnsPlayback = () =>
      mountedRef.current &&
      playbackEpoch === samplePlaybackEpochRef.current &&
      noteSampleSoundsRef.current[key] === player;

    setTimeout(() => {
      if (!stillOwnsPlayback()) return;
      const previousState = samplePlayStateRef.current[key];
      if (previousState?.endTimer) clearTimeout(previousState.endTimer);
      samplePlayStateRef.current[key] = { playing: true, endTimer: null };

      const startSec = startMs / 1000;
      if (Platform.OS === "web") {
        try { player.seekTo(startSec); } catch {}
        setTimeout(() => {
          if (stillOwnsPlayback()) safePlay(player, "preview.web.startMs");
        }, 10);
      } else {
        try { player.pause(); } catch {}
        Promise.resolve(player.seekTo(startSec)).then(() => {
          if (stillOwnsPlayback()) safePlay(player, "preview.native.startMs");
        }).catch(() => {});
      }

      const effectiveDuration = durationMs > 0
        ? durationMs
        : player.duration > 0
          ? (player.duration - startSec) * 1000
          : 0;
      if (effectiveDuration <= 0) return;
      const timer = setTimeout(() => {
        if (!stillOwnsPlayback()) return;
        try { player.pause(); } catch {}
        const state = samplePlayStateRef.current[key];
        if (state) {
          state.playing = false;
          state.endTimer = null;
        }
      }, effectiveDuration / (noteSampleSpeedsRef.current[key] ?? 1));
      const state = samplePlayStateRef.current[key];
      if (state) state.endTimer = timer;
    }, 0);
    return true;
  }, [noteSampleSoundsRef, noteSampleSpeedsRef]);

  const cleanupNoteSampleResources = useCallback((playbackAlreadyStopped = false) => {
    if (!playbackAlreadyStopped) clearSamplePlayStates();
    const players = noteSampleSoundsRef.current;
    noteSampleSoundsRef.current = {};
    for (const player of Object.values(players)) releaseAudioPlayer(player, false);

    const artifactKeys = new Set([
      ...Object.keys(players),
      ...Object.keys(noteSamplesRef.current),
      ...samplePreloadKeysRef.current,
    ]);
    // releaseStereoArtifact is idempotent at the cache boundary. Do not await
    // here: React effect cleanup must synchronously invalidate producers first.
    for (const key of artifactKeys) void releaseStereoArtifact(key);
  }, [clearSamplePlayStates, noteSampleSoundsRef, noteSamplesRef, releaseAudioPlayer]);

  const releaseNoteSampleResources = useCallback((playbackAlreadyStopped = false) => {
    cancelNoteSamplePreload();
    cleanupNoteSampleResources(playbackAlreadyStopped);
    samplePreloadKeysRef.current.clear();
  }, [cancelNoteSamplePreload, cleanupNoteSampleResources]);

  const releaseNoteSampleResource = useCallback(async (key: string) => {
    // Keep the previous key owner token until its pending preload observes the
    // cancelled generation, so it can release an artifact that finishes late.
    cancelNoteSamplePreload();
    const state = samplePlayStateRef.current[key];
    if (state?.endTimer) clearTimeout(state.endTimer);
    delete samplePlayStateRef.current[key];
    const player = noteSampleSoundsRef.current[key];
    if (player) {
      delete noteSampleSoundsRef.current[key];
      releaseAudioPlayer(player);
    }
    samplePreloadKeysRef.current.delete(key);
    await releaseStereoArtifact(key);
  }, [cancelNoteSamplePreload, noteSampleSoundsRef, releaseAudioPlayer]);

  // ── Playback-recovery watchdog ───────────────────────────────────────────────
  const clearAudioWatchdog = useCallback(() => {
    if (audioWatchdogTimerRef.current) {
      clearTimeout(audioWatchdogTimerRef.current);
      audioWatchdogTimerRef.current = null;
    }
  }, []);

  const stopPlaybackAudio = useCallback(() => {
    // One ownership boundary for every complete playback stop. Render/sample
    // producers are invalidated before active outputs and timers are released.
    cancelNoteSamplePreload();
    invalidateAudioStartupProbe();
    clearAudioWatchdog();
    if (reRenderTimerRef.current) {
      clearTimeout(reRenderTimerRef.current);
      reRenderTimerRef.current = null;
    }
    engineRef.current?.stop();
    stopRenderedAudio();
    clearSamplePlayStates();
  }, [
    cancelNoteSamplePreload,
    clearAudioWatchdog,
    clearSamplePlayStates,
    engineRef,
    invalidateAudioStartupProbe,
    stopRenderedAudio,
  ]);

  const armAudioWatchdog = useCallback(() => {
    if (!mountedRef.current) return;
    clearAudioWatchdog();
    audioRetryCountRef.current = 0;
    lastAudioFireRef.current = 0;

    const runCheck = () => {
      if (!mountedRef.current) {
        audioWatchdogTimerRef.current = null;
        return;
      }
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
      const renderedOutputHealthy = outputOwner.active()?.isRunning?.() ?? false;
      const isStuck = webCtxSuspended || (!renderedOutputHealthy && timeSinceFire > threshold);

      if (!isStuck) {
        const sample = webClockAdapterRef.current?.now();
        if (sample) {
          timingDiagnosticsRef.current.record(sample);
          const positionSeconds = outputOwner.active()?.getPositionSeconds?.();
          if (positionSeconds !== undefined && outputOwner.snapshot().mode === "prerender") {
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
        outputOwner.transition("recovering");
        lastAudioFireRef.current = Date.now();
        audioWatchdogTimerRef.current = setTimeout(runCheck, 3500);
      } else {
        outputOwner.transition("failed");
        markAudioRecoveryFailed("watchdog");
        showRecoveryToastRef.current(t("main", "audioRecoveryFailed"));
        audioWatchdogTimerRef.current = null;
      }
    };

    armTimeRef.current = Date.now();
    audioWatchdogTimerRef.current = setTimeout(runCheck, 4000);
  }, [
    bpmRef,
    clearAudioWatchdog,
    engineRef,
    isPlayingRef,
    outputOwner,
    soundSetRef,
    stopRenderedAudio,
    t,
    webClickReadyRef,
  ]);

  useEffect(() => {
    armAudioWatchdogRef.current = armAudioWatchdog;
    clearAudioWatchdogRef.current = clearAudioWatchdog;
  }, [armAudioWatchdog, clearAudioWatchdog]);

  const cleanupAudioResources = useCallback(() => {
    if (!mountedRef.current) return;
    // Invalidate every producer before releasing anything. This prevents a
    // render/preload continuation from publishing a resource after unmount.
    mountedRef.current = false;
    samplePCMCacheGenerationRef.current += 1;
    pcmPreparationOwnerRef.current.abort();
    stopPlaybackAudio();
    cleanupNoteSampleResources(true);
    outputOwner.dispose();
    samplePCMCacheRef.current.clear();
    samplePCMUriRef.current.clear();
    samplePreloadKeysRef.current.clear();
  }, [
    cleanupNoteSampleResources,
    outputOwner,
    stopPlaybackAudio,
  ]);

  useEffect(() => {
    mountedRef.current = true;
    if (pcmPreparationOwnerRef.current.signal.aborted) {
      pcmPreparationOwnerRef.current = new AbortController();
    }
    outputOwner.activate();
    // A StrictMode effect replay is a new producer lifetime even though the
    // hook refs are preserved between the two effect setups.
    samplePreloadGenerationRef.current += 1;
    return cleanupAudioResources;
  }, [cleanupAudioResources, outputOwner]);

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
    samplePCMCacheRef,
    audioRenderLifecycle,
    outputOwner,
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
    prepareRenderedPlayer,
    scheduleReRender,
    stopRenderedAudio,
    stopPlaybackAudio,
    getClickPCMs,
    getSamplePCMs,
    getLayerClickPCMsForSchedule,
    invalidateSamplePCMCache,
    preloadNoteSampleSounds,
    cancelNoteSamplePreload,
    clearSamplePlayStates,
    queueNoteSamplePlayback,
    releaseNoteSampleResource,
    releaseNoteSampleResources,
    armAudioWatchdog,
    clearAudioWatchdog,
    scheduleRealtimeWebClick,
    clearRealtimeWebAudio,
    captureAudioToneSnapshot,
    setActiveAudioToneSnapshot,
  };
}
