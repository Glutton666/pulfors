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
  applySoftClip,
  saveRenderedWav,
  ensureWebClickBuffers,
  playWebRenderedLoop,
  getWebAudioContext,
  clearWebClickBuffers,
} from "@/lib/audio-renderer";
import { syncStereoArtifact, releaseStereoArtifact } from "@/lib/sample-cache";
import { captureBreadcrumb } from "@/lib/error-tracking";
import { safePlay, notifyAudioPoolFallback } from "@/lib/audio-utils";
import { isSafeNoteSampleUri } from "@/app/index.helpers";
import type { ClickPCMs, SamplePCMEntry, TickInfo, DecodedSample } from "@/lib/audio-renderer";
import type { SoundSet, BuiltinSoundSet, CustomSoundSetConfig } from "@/lib/storage";
import type { NoteSampleMap, NoteSampleChannelMap, NoteSampleMetroChannelMap, NoteSampleVolumeMap, NoteSampleSpeedMap } from "@/lib/note-samples";
import type { SampleChannel } from "@/lib/stereo-channel";
import { useAudioPlayers } from "@/hooks/useAudioPlayers";
import type { BuiltinPlayers, SoundSetPlayers } from "@/hooks/useAudioPlayers";
import { BUILTIN_POOL_SIZE } from "@/hooks/useAudioPlayers";
import { setAutoResumeAfterInterruption as setAudioSessionAutoResume } from "@/lib/audio-session";
import {
  markAudioRecoveryFailed,
  markAudioRecoverySucceeded,
} from "@/lib/audio-lifecycle";
import type { TranslationFn } from "@/lib/i18n";

/** Narrow callback type for audio-specific settings persistence. */
export type PersistAudioSettingsFn = (s: Partial<{ backgroundPlay: boolean; autoResumeAfterInterruption: boolean }>) => void;

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
  autoResumeAfterInterruption: boolean;
  /**
   * User-facing setter: updates state + calls audio-session + persists.
   * Use this from settings UI change handlers.
   */
  updateBackgroundPlay: (v: boolean) => void;
  updateAutoResumeAfterInterruption: (v: boolean) => void;
  /**
   * Apply-only setter (no persistence side-effect).
   * Use this when restoring saved settings on startup.
   */
  applyAudioSettings: (s: Partial<{ backgroundPlay: boolean; autoResumeAfterInterruption: boolean }>) => void;
  // ── Refs owned by this hook, exposed for coordination ────────────────────
  renderedPlayerRef: React.MutableRefObject<ExpoAudioPlayer | null>;
  samplePCMCacheRef: React.MutableRefObject<Map<string, SamplePCMEntry>>;
  renderedUrlRef: React.MutableRefObject<string | null>;
  webRenderedLoopRef: React.MutableRefObject<{ stop: () => void } | null>;
  lastAudioFireRef: React.MutableRefObject<number>;
  armAudioWatchdogRef: React.MutableRefObject<() => void>;
  clearAudioWatchdogRef: React.MutableRefObject<() => void>;
  samplePlayStateRef: React.MutableRefObject<Record<string, { playing: boolean; endTimer: ReturnType<typeof setTimeout> | null }>>;
  // ── Functions ────────────────────────────────────────────────────────────
  buildRenderedPlayer: () => Promise<ExpoAudioPlayer | null>;
  scheduleReRender: () => void;
  stopRenderedAudio: () => void;
  warmupAudioPlayers: () => Promise<void>;
  getClickPCMs: (set: SoundSet) => Promise<ClickPCMs>;
  getSamplePCMs: (samples: NoteSampleMap) => Promise<Map<string, SamplePCMEntry>>;
  getLayerClickPCMsForSchedule: (ticks: TickInfo[]) => Promise<Map<string, ClickPCMs>>;
  invalidateSamplePCMCache: (key?: string) => void;
  preloadNoteSampleSounds: (samples: NoteSampleMap, keepExisting?: boolean) => Promise<void>;
  clearSamplePlayStates: () => void;
  armAudioWatchdog: () => void;
  clearAudioWatchdog: () => void;
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
    barMetronomeChannelRef, noteSampleMetroChannelsRef, volumeRef, sampleVolumeRef,
    isPlayingRef, bpmRef, t, showRecoveryToast, persistAudioSettingsCallbackRef,
    renderGenerationRef,
  } = params;

  // ── Player pool ownership (moved from useMetronomeScreen) ───────────────────
  // allPlayersRef, soundSetRef, highToggle/lowToggle/strongToggle are now owned
  // here. useMetronomeScreen's tick callback reads these via the return value.
  const { allPlayers, allPlayersRef, soundSetRef, highToggle, lowToggle, strongToggle, setPoolsVolume } =
    useAudioPlayers(soundSet, params.soundSetRef);

  // 3 refs now live in useMetronomeScreen (shared with useSettings)
  const { clickPCMCacheRef, webClickReadyRef, noteSampleSoundsRef } = params;

  // ── Audio-session settings (moved from useMetronomeScreen) ─────────────────
  const [backgroundPlay, setBackgroundPlay] = useState(false);
  const [autoResumeAfterInterruption, setAutoResumeState] = useState(true);

  /**
   * Apply-only: sets state (and audio-session for autoResume) without persisting.
   * Called during initial settings load.
   */
  const applyAudioSettings = useCallback(
    (s: Partial<{ backgroundPlay: boolean; autoResumeAfterInterruption: boolean }>) => {
      if (s.backgroundPlay !== undefined) setBackgroundPlay(s.backgroundPlay);
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
      persistAudioSettingsCallbackRef.current({ backgroundPlay: value });
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
  }, [volume, setPoolsVolume]);

  // ── Owned refs ──────────────────────────────────────────────────────────────
  const renderedPlayerRef = useRef<ExpoAudioPlayer | null>(null);
  const samplePCMCacheRef = useRef<Map<string, SamplePCMEntry>>(new Map());
  const samplePCMUriRef = useRef<Map<string, string>>(new Map());
  const renderedUrlRef = useRef<string | null>(null);
  const webRenderedLoopRef = useRef<{ stop: () => void } | null>(null);
  const lastAudioFireRef = useRef(0);
  const audioWatchdogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioRetryCountRef = useRef(0);
  const armAudioWatchdogRef = useRef<() => void>(() => {});
  const clearAudioWatchdogRef = useRef<() => void>(() => {});
  const reRenderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const samplePlayStateRef = useRef<Record<string, { playing: boolean; endTimer: ReturnType<typeof setTimeout> | null }>>({});
  const armTimeRef = useRef<number | null>(null);
  const showRecoveryToastRef = useRef(showRecoveryToast);
  useEffect(() => { showRecoveryToastRef.current = showRecoveryToast; }, [showRecoveryToast]);
  useEffect(() => () => {
    renderGenerationRef.current += 1;
    if (reRenderTimerRef.current) {
      clearTimeout(reRenderTimerRef.current);
      reRenderTimerRef.current = null;
    }
  }, [renderGenerationRef]);

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

  const getClickPCMs = useCallback(async (set: SoundSet): Promise<ClickPCMs> => {
    if (clickPCMCacheRef.current[set]) return clickPCMCacheRef.current[set];
    const customCfg = customSoundSetsRef.current[set];
    if (customCfg) {
      const loadSample = async (cfg: any) => {
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
      const [strong, high, low] = await Promise.all([loadSample(customCfg.strong), loadSample(customCfg.accent), loadSample(customCfg.normal)]);
      const result: ClickPCMs = { strong, high, low };
      clickPCMCacheRef.current[set] = result;
      return result;
    }
    const src = soundSets[set as keyof typeof soundSets] || soundSets.classic;
    const [strong, high, low] = await Promise.all([loadAssetPCM(src.strong), loadAssetPCM(src.high), loadAssetPCM(src.low)]);
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
      if (cached && samplePCMUriRef.current.get(key) === uri) {
        map.set(key, cached);
        return;
      }
      try {
        const pcm = await decodeSampleFile(uri);
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
        captureBreadcrumb({ category: "pre-render", message: "Failed to decode sample", level: "warning", data: { key, error: String(e) } });
      }
    }));
    return map;
  }, [noteSamplesRef]);

  const getLayerClickPCMsForSchedule = useCallback(async (ticks: TickInfo[]): Promise<Map<string, ClickPCMs>> => {
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

  // ── Core audio player lifecycle ──────────────────────────────────────────────
  const buildRenderedPlayer = useCallback(async (): Promise<ExpoAudioPlayer | null> => {
    const engine = engineRef.current;
    if (!engine) return null;
    const generation = ++renderGenerationRef.current;
    try {
      const scheduleInfo = engine.getScheduleInfo();
      const ticks = scheduleInfo.ticks as TickInfo[];
      const [clickPCMs, layerClickPCMs, samplePCMs] = await Promise.all([
        getClickPCMs(soundSetRef.current),
        getLayerClickPCMsForSchedule(ticks),
        getSamplePCMs(noteSamplesRef.current),
      ]);
      if (generation !== renderGenerationRef.current) return null;
      await new Promise(r => setTimeout(r, 0));
      if (generation !== renderGenerationRef.current) return null;
      const pcm = renderMeasure({
        schedule: ticks,
        measureDurationMs: scheduleInfo.durationMs,
        clickPCMs,
        samplePCMs,
        clickVolume: Math.max(1.0, volumeRef.current),
        sampleVolume: samplePCMs.size > 0 ? sampleVolumeRef.current : 0,
        sampleVolumes: noteSampleVolumesRef.current,
        sampleSpeeds: noteSampleSpeedsRef.current,
        sampleChannels: noteSampleChannelsRef.current,
        metronomeChannel: barModeRef.current ? barMetronomeChannelRef.current : "both",
        metroChannelsByBeat: barModeRef.current ? noteSampleMetroChannelsRef.current : undefined,
        layerClickPCMs,
      });
      if (volumeRef.current > 1.0) {
        if (pcm instanceof Float32Array) { applySoftClip(pcm); }
        else { applySoftClip(pcm.left); applySoftClip(pcm.right); }
      }
      const wavUri = await saveRenderedWav(pcm);
      if (generation !== renderGenerationRef.current) {
        if (Platform.OS === "web") {
          try { URL.revokeObjectURL(wavUri); } catch {}
        }
        return null;
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
      player.volume = Math.max(0, Math.min(1, volumeRef.current));
      return player;
    } catch (e) {
      captureBreadcrumb({ category: "pre-render", message: "Failed, falling back to per-tick audio", level: "warning", data: { error: String(e) } });
      return null;
    }
  }, [getClickPCMs, getLayerClickPCMsForSchedule, getSamplePCMs]);

  const warmupAudioPlayers = useCallback(async () => {
    try {
      const set = soundSetRef.current;
      const customCfg = customSoundSetsRef.current[set];
      const builtinSet: BuiltinSoundSet = (customCfg ? customCfg.strong.sourceSet : (set as BuiltinSoundSet)) || "classic";
      const pool = allPlayersRef.current[builtinSet as keyof BuiltinPlayers];
      if (!pool) notifyAudioPoolFallback("warmup-missing-set", { requestedSet: String(builtinSet) });
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
    renderGenerationRef.current += 1;
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
  }, []);

  const scheduleReRender = useCallback(() => {
    renderGenerationRef.current += 1;
    if (reRenderTimerRef.current) clearTimeout(reRenderTimerRef.current);
    reRenderTimerRef.current = setTimeout(async () => {
      const engine = engineRef.current;
      if (!engine?.getIsRunning()) return;
      stopRenderedAudio();
      engine.setPendingMeasureStartAction(null);

      if (Platform.OS === "web") {
        const generation = ++renderGenerationRef.current;
        try {
          const scheduleInfo = engine.getScheduleInfo();
          const ticks = scheduleInfo.ticks as TickInfo[];
          const [clickPCMs, layerClickPCMs, samplePCMs] = await Promise.all([
            getClickPCMs(soundSetRef.current),
            getLayerClickPCMsForSchedule(ticks),
            getSamplePCMs(noteSamplesRef.current),
          ]);
          if (generation !== renderGenerationRef.current || !engine.getIsRunning()) return;
          const pcm = renderMeasure({
            schedule: ticks,
            measureDurationMs: scheduleInfo.durationMs,
            clickPCMs,
            samplePCMs,
            clickVolume: Math.max(1.0, volumeRef.current),
            sampleVolume: samplePCMs.size > 0 ? sampleVolumeRef.current : 0,
            sampleVolumes: noteSampleVolumesRef.current,
            sampleSpeeds: noteSampleSpeedsRef.current,
            sampleChannels: noteSampleChannelsRef.current,
            metronomeChannel: barModeRef.current ? barMetronomeChannelRef.current : "both",
            metroChannelsByBeat: barModeRef.current ? noteSampleMetroChannelsRef.current : undefined,
            layerClickPCMs,
          });
          if (volumeRef.current > 1.0) {
            if (pcm instanceof Float32Array) { applySoftClip(pcm); }
            else { applySoftClip(pcm.left); applySoftClip(pcm.right); }
          }
          if (generation !== renderGenerationRef.current || !engine.getIsRunning()) return;
          engine.setPendingMeasureStartAction(() => {
            if (generation !== renderGenerationRef.current || !engine.getIsRunning()) return;
            if (webRenderedLoopRef.current) { try { webRenderedLoopRef.current.stop(); } catch {} webRenderedLoopRef.current = null; }
            const loop = playWebRenderedLoop(pcm, undefined, "both", volumeRef.current);
            webRenderedLoopRef.current = loop;
            engine.setPreRenderedAudio(true);
          });
        } catch {}
      } else {
        try {
          const player = await buildRenderedPlayer();
          if (!player) return;
          const generation = renderGenerationRef.current;
          if (!engine.getIsRunning()) { try { player.release(); } catch {} return; }
          engine.setPendingMeasureStartAction(() => {
            if (generation !== renderGenerationRef.current || !engine.getIsRunning()) {
              try { player.release(); } catch {}
              return;
            }
            if (renderedPlayerRef.current) {
              try { renderedPlayerRef.current.pause(); renderedPlayerRef.current.release(); } catch {}
              renderedPlayerRef.current = null;
            }
            renderedPlayerRef.current = player;
            engine.setPreRenderedAudio(true);
            safePlay(player, "preRender.initial");
          });
        } catch {}
      }
    }, 300);
  }, [stopRenderedAudio, buildRenderedPlayer, getClickPCMs, getLayerClickPCMsForSchedule, getSamplePCMs]);

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
      const isStuck = webCtxSuspended || timeSinceFire > threshold;

      if (!isStuck) {
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
        lastAudioFireRef.current = Date.now();
        audioWatchdogTimerRef.current = setTimeout(runCheck, 3500);
      } else {
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
    autoResumeAfterInterruption,
    updateBackgroundPlay,
    updateAutoResumeAfterInterruption,
    applyAudioSettings,
    // PCM / rendered-player refs
    renderedPlayerRef,
    samplePCMCacheRef,
    renderedUrlRef,
    webRenderedLoopRef,
    lastAudioFireRef,
    armAudioWatchdogRef,
    clearAudioWatchdogRef,
    samplePlayStateRef,
    buildRenderedPlayer,
    scheduleReRender,
    stopRenderedAudio,
    warmupAudioPlayers,
    getClickPCMs,
    getSamplePCMs,
    getLayerClickPCMsForSchedule,
    invalidateSamplePCMCache,
    preloadNoteSampleSounds,
    clearSamplePlayStates,
    armAudioWatchdog,
    clearAudioWatchdog,
  };
}
