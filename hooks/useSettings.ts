/**
 * useSettings — settings persistence layer extracted from useMetronomeScreen.
 *
 * Owns:
 *   - All MetronomeSettings state (bpm, volume, soundSet, flashMode, …)
 *   - Key refs (bpmRef, flashModeRef, layerSoundSetsRef, barMetronomeChannelRef)
 *   - createDebouncedPersister / persistSnapshotRef / persistSettings
 *   - loadSettings effect (mount-once)
 *   - persistAudioSettingsCallbackRef (forwarded to useAudioPipeline)
 *   - All "pure-settings" update callbacks (updateVolume, updateBpm, …)
 *
 * Receives as params (refs/callbacks that live elsewhere):
 *   - engineRef, baseBpmRef, volumeRef, sampleVolumeRef, beatDenominatorRef
 *   - noteSampleSoundsRef, clickPCMCacheRef, webClickReadyRef
 *   - scheduleReRenderCallbackRef, applyAudioSettingsCallbackRef
 *   - onSettingsLoaded  — called at end of settings load for extra init
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { loadSettings, saveSettings } from "@/lib/storage";
import type { MetronomeSettings, FlashMode, HapticMode, SoundSet } from "@/lib/storage";
import {
  createDebouncedPersister,
  type DebouncedPersister,
  type PersisterStatus,
} from "@/lib/persist";
import { clearWebClickBuffers } from "@/lib/audio-renderer";
import type { ClickPCMs } from "@/lib/audio-renderer";
import { defaultBeatTypes } from "@/app/index.helpers";
import type { MetronomeEngine, BeatType } from "@/lib/metronome-engine";
import type { SampleChannel } from "@/lib/stereo-channel";
import type { AudioPlayer as ExpoAudioPlayer } from "expo-audio";
import type { PersistAudioSettingsFn } from "@/hooks/useAudioPipeline";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface UseSettingsParams {
  /** Metronome engine ref — needed during settings load and update callbacks. */
  engineRef: React.MutableRefObject<MetronomeEngine | null>;
  /**
   * Physical-BPM ref set at load time (baseBpm = displayBpm × loadedDenom / 4).
   * Created in useMetronomeScreen; updated here during settings load.
   */
  baseBpmRef: React.MutableRefObject<number>;
  /** Shared volume ref — created in useMetronomeScreen, also read by useAudioPipeline. */
  volumeRef: React.MutableRefObject<number>;
  /** Shared sample-volume ref — created in useMetronomeScreen, also read by useAudioPipeline. */
  sampleVolumeRef: React.MutableRefObject<number>;
  /** Shared beat-denominator ref — created in useMetronomeScreen, also used by engine callbacks. */
  beatDenominatorRef: React.MutableRefObject<2 | 4 | 8>;
  /** Per-note sample players — volume synced in updateSampleVolume. */
  noteSampleSoundsRef: React.MutableRefObject<Record<string, ExpoAudioPlayer>>;
  /** PCM cache — entry cleared in updateSoundSet. */
  clickPCMCacheRef: React.MutableRefObject<Record<string, ClickPCMs>>;
  /** Web click-ready flag — reset in updateSoundSet. */
  webClickReadyRef: React.MutableRefObject<boolean>;
  /**
   * Stable ref for scheduleReRender (from useAudioPipeline).
   * Created in useMetronomeScreen before any hook call; .current updated
   * after the pipeline resolves.
   */
  scheduleReRenderCallbackRef: React.MutableRefObject<() => void>;
  /**
   * Stable ref for applyAudioSettings (from useAudioPipeline).
   * Created in useMetronomeScreen before any hook call; .current updated
   * after the pipeline resolves.
   */
  applyAudioSettingsCallbackRef: React.MutableRefObject<
    (s: Partial<{ backgroundPlay: boolean; autoResumeAfterInterruption: boolean }>) => void
  >;
  /**
   * Called at the end of the settings-load .then() for any extra init that
   * lives outside this hook (setIsLoaded, loadCustomSoundSets, PCM warmup, …).
   */
  onSettingsLoaded?: (settings: MetronomeSettings) => void;
}

export interface UseSettingsResult {
  // ── Core playback ──────────────────────────────────────────────────────────
  bpm: number;
  setBpm: React.Dispatch<React.SetStateAction<number>>;
  /** Kept in sync with bpm state; read by engine callbacks and notifications. */
  bpmRef: React.MutableRefObject<number>;
  halfTime: boolean;
  setHalfTime: React.Dispatch<React.SetStateAction<boolean>>;
  beatDenominator: 2 | 4 | 8;
  setBeatDenominator: React.Dispatch<React.SetStateAction<2 | 4 | 8>>;
  beatsPerMeasure: number;
  setBeatsPerMeasure: React.Dispatch<React.SetStateAction<number>>;
  beatTypes: BeatType[];
  setBeatTypes: React.Dispatch<React.SetStateAction<BeatType[]>>;
  subdivisionPattern: BeatType[];
  setSubdivisionPattern: React.Dispatch<React.SetStateAction<BeatType[]>>;
  beatSubdivisions: Record<string, BeatType[]>;
  setBeatSubdivisions: React.Dispatch<React.SetStateAction<Record<string, BeatType[]>>>;
  // ── Audio ──────────────────────────────────────────────────────────────────
  volume: number;
  setVolume: React.Dispatch<React.SetStateAction<number>>;
  sampleVolume: number;
  setSampleVolume: React.Dispatch<React.SetStateAction<number>>;
  soundSet: SoundSet;
  setSoundSet: React.Dispatch<React.SetStateAction<SoundSet>>;
  layerSoundSets: Record<number, SoundSet>;
  setLayerSoundSets: React.Dispatch<React.SetStateAction<Record<number, SoundSet>>>;
  layerSoundSetsRef: React.MutableRefObject<Record<number, SoundSet>>;
  flashMode: FlashMode;
  setFlashMode: React.Dispatch<React.SetStateAction<FlashMode>>;
  flashModeRef: React.MutableRefObject<FlashMode>;
  hapticMode: HapticMode;
  setHapticMode: React.Dispatch<React.SetStateAction<HapticMode>>;
  audioOffsetMs: number;
  setAudioOffsetMs: React.Dispatch<React.SetStateAction<number>>;
  // ── UX / appearance ────────────────────────────────────────────────────────
  timerStopMode: "immediate" | "end-of-cycle";
  setTimerStopMode: React.Dispatch<React.SetStateAction<"immediate" | "end-of-cycle">>;
  landscapeReversed: boolean;
  setLandscapeReversed: React.Dispatch<React.SetStateAction<boolean>>;
  beatDirection: "cw" | "ccw";
  setBeatDirection: React.Dispatch<React.SetStateAction<"cw" | "ccw">>;
  username: string;
  setUsername: React.Dispatch<React.SetStateAction<string>>;
  // ── Bar mode ───────────────────────────────────────────────────────────────
  barMetronomeChannel: SampleChannel;
  setBarMetronomeChannel: React.Dispatch<React.SetStateAction<SampleChannel>>;
  barMetronomeChannelRef: React.MutableRefObject<SampleChannel>;
  barCellOpacity: number;
  setBarCellOpacity: React.Dispatch<React.SetStateAction<number>>;
  barRowHeight: number;
  setBarRowHeight: React.Dispatch<React.SetStateAction<number>>;
  // ── Persistence ────────────────────────────────────────────────────────────
  persistSettings: DebouncedPersister<MetronomeSettings>;
  /** Latest retry status, kept in React state so the UI can show stale changes. */
  persistStatus: PersisterStatus;
  /**
   * Created here so it exists before useAudioPipeline is called.
   * Pass directly to useAudioPipeline; .current is kept current each render.
   */
  persistAudioSettingsCallbackRef: React.MutableRefObject<PersistAudioSettingsFn>;
  /**
   * Call this every render (inline, after useAudioPipeline resolves) to keep
   * the snapshot's cross-hook fields — backgroundPlay, autoResumeAfterInterruption,
   * showLandscapeImage, landscapeContentType — current at flush time.
   */
  syncExternalSnapshot: (
    vals: Pick<
      MetronomeSettings,
      "backgroundPlay" | "autoResumeAfterInterruption" | "showLandscapeImage" | "landscapeContentType"
    >
  ) => void;
  // ── Update callbacks ───────────────────────────────────────────────────────
  updateVolume: (v: number) => void;
  updateSampleVolume: (v: number) => void;
  updateSoundSet: (v: SoundSet) => void;
  updateFlashMode: (v: FlashMode) => void;
  updateHapticMode: (v: HapticMode) => void;
  updateAudioOffset: (v: number) => void;
  updateBpm: (v: number) => void;
  updateTimerStopMode: (v: "immediate" | "end-of-cycle") => void;
  updateUsername: (v: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useSettings(params: UseSettingsParams): UseSettingsResult {
  const {
    engineRef, baseBpmRef,
    volumeRef, sampleVolumeRef, beatDenominatorRef,
    noteSampleSoundsRef, clickPCMCacheRef, webClickReadyRef,
    scheduleReRenderCallbackRef, applyAudioSettingsCallbackRef,
    onSettingsLoaded,
  } = params;

  // ── Settings state ──────────────────────────────────────────────────────────

  const [bpm, setBpm] = useState(120);
  const bpmRef = useRef(120);
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);

  const [halfTime, setHalfTime] = useState(false);

  const [beatDenominator, setBeatDenominator] = useState<2 | 4 | 8>(4);
  // Sync shared ref so engine-tick callbacks outside this hook read the right value.
  useEffect(() => { beatDenominatorRef.current = beatDenominator; }, [beatDenominator, beatDenominatorRef]);

  const [beatsPerMeasure, setBeatsPerMeasure] = useState(4);
  const [beatTypes, setBeatTypes] = useState<BeatType[]>(() => defaultBeatTypes(4));
  const [subdivisionPattern, setSubdivisionPattern] = useState<BeatType[]>(["accent"]);
  const [beatSubdivisions, setBeatSubdivisions] = useState<Record<string, BeatType[]>>({});

  const [volume, setVolume] = useState(0.75);
  useEffect(() => { volumeRef.current = volume; }, [volume, volumeRef]);

  const [sampleVolume, setSampleVolume] = useState(0.8);
  useEffect(() => { sampleVolumeRef.current = sampleVolume; }, [sampleVolume, sampleVolumeRef]);

  const [soundSet, setSoundSet] = useState<SoundSet>("classic");

  const [layerSoundSets, setLayerSoundSets] = useState<Record<number, SoundSet>>({});
  const layerSoundSetsRef = useRef<Record<number, SoundSet>>({});
  useEffect(() => { layerSoundSetsRef.current = layerSoundSets; }, [layerSoundSets]);

  const [flashMode, setFlashMode] = useState<FlashMode>("accent");
  const flashModeRef = useRef<FlashMode>("accent");
  useEffect(() => { flashModeRef.current = flashMode; }, [flashMode]);

  const [hapticMode, setHapticMode] = useState<HapticMode>("all");
  const [audioOffsetMs, setAudioOffsetMs] = useState(0);
  const [timerStopMode, setTimerStopMode] = useState<"immediate" | "end-of-cycle">("end-of-cycle");
  const [landscapeReversed, setLandscapeReversed] = useState(false);
  const [beatDirection, setBeatDirection] = useState<"cw" | "ccw">("cw");
  const [username, setUsername] = useState("");

  const [barMetronomeChannel, setBarMetronomeChannel] = useState<SampleChannel>("both");
  const barMetronomeChannelRef = useRef<SampleChannel>("both");
  useEffect(() => { barMetronomeChannelRef.current = barMetronomeChannel; }, [barMetronomeChannel]);

  const [barCellOpacity, setBarCellOpacity] = useState(0.55);
  const [barRowHeight, setBarRowHeight] = useState(44);

  // ── Persistence infrastructure ───────────────────────────────────────────────

  // Values that live in other hooks but must appear in the snapshot.
  // syncExternalSnapshot() is called inline every render by useMetronomeScreen.
  const externalSnapshotRef = useRef<
    Pick<MetronomeSettings, "backgroundPlay" | "autoResumeAfterInterruption" | "showLandscapeImage" | "landscapeContentType">
  >({
    backgroundPlay: false,
    autoResumeAfterInterruption: true,
    showLandscapeImage: true,
    landscapeContentType: "photo",
  });

  // Stable callback — just mutates the ref, no React state change.
  const syncExternalSnapshot = useCallback(
    (vals: Pick<MetronomeSettings, "backgroundPlay" | "autoResumeAfterInterruption" | "showLandscapeImage" | "landscapeContentType">) => {
      externalSnapshotRef.current = vals;
    },
    [],
  );

  // Snapshot ref — updated inline every render so the persister always reads
  // the latest values when it flushes (debounced async write).
  const persistSnapshotRef = useRef<MetronomeSettings>({
    bpm, beatsPerMeasure, beatDenominator, subdivisions: 1, subdivisionPattern, beatSubdivisions,
    volume, sampleVolume, soundSet, layerSoundSets, flashMode, hapticMode,
    audioOffsetMs, timerStopMode, landscapeReversed, beatDirection, username,
    barMetronomeChannel, barCellOpacity, barRowHeight,
    ...externalSnapshotRef.current,
  });
  // Inline update — runs on every render of useMetronomeScreen.
  persistSnapshotRef.current = {
    bpm, beatsPerMeasure, beatDenominator, subdivisions: 1, subdivisionPattern, beatSubdivisions,
    volume, sampleVolume, soundSet, layerSoundSets, flashMode, hapticMode,
    audioOffsetMs, timerStopMode, landscapeReversed, beatDirection, username,
    barMetronomeChannel, barCellOpacity, barRowHeight,
    ...externalSnapshotRef.current,
  };

  const persistSettingsRef = useRef<DebouncedPersister<MetronomeSettings> | null>(null);
  if (!persistSettingsRef.current) {
    persistSettingsRef.current = createDebouncedPersister<MetronomeSettings>(
      () => persistSnapshotRef.current,
      // saveSettings rejects on failure and the debouncer auto-retries with
      // backoff. The retry banner below owns this error path. Do not emit the global
      // storage error event here: StorageErrorAlert turns that event into a
      // blocking native Alert for every failed retry.
      (merged) => saveSettings(merged, { notifyOnError: false }),
      500,
      { maxAttempts: 3, baseDelayMs: 500 },
    );
  }
  const persistSettings = persistSettingsRef.current;

  // The persister intentionally has no React dependency, so retry callbacks
  // cannot trigger a render on their own. Poll its public status while this
  // screen is mounted; this catches both the first failed attempt and the
  // eventual success that should hide the warning.
  const [persistStatus, setPersistStatus] = useState<PersisterStatus>({
    lastSaveAt: null,
    lastErrorAt: null,
    consecutiveFailures: 0,
    pendingChanges: 0,
    cycleFailed: false,
  });
  useEffect(() => {
    // Keep this guard for lightweight test doubles and older callers that
    // provide only the callable persister contract.
    if (typeof persistSettings.getStatus !== "function") return;

    const refreshStatus = () => {
      const next = persistSettings.getStatus();
      setPersistStatus((previous) => (
        previous.lastSaveAt === next.lastSaveAt
        && previous.lastErrorAt === next.lastErrorAt
        && previous.consecutiveFailures === next.consecutiveFailures
        && previous.pendingChanges === next.pendingChanges
        && previous.cycleFailed === next.cycleFailed
          ? previous
          : next
      ));
    };

    refreshStatus();
    const timer = setInterval(refreshStatus, 250);
    return () => clearInterval(timer);
  }, [persistSettings]);

  // Stable ref for the audio-settings persist callback.
  // Created here so it is available before useAudioPipeline is called in
  // useMetronomeScreen.  .current is updated every render.
  const persistAudioSettingsCallbackRef = useRef<PersistAudioSettingsFn>(() => {});
  persistAudioSettingsCallbackRef.current = (s) => persistSettings(s);

  // ── Settings load (mount-once) ────────────────────────────────────────────────

  useEffect(() => {
    loadSettings().then((settings) => {
      setBpm(settings.bpm);
      const loadedDenom = settings.beatDenominator ?? 4;
      baseBpmRef.current = Math.round(settings.bpm * (loadedDenom / 4));
      setBeatsPerMeasure(settings.beatsPerMeasure);
      if (settings.beatDenominator) {
        setBeatDenominator(settings.beatDenominator);
      }

      const engine = engineRef.current;
      if (engine) {
        // 분모에 따라 실제 엔진 속도 조정 (표시 BPM은 그대로 유지)
        engine.setBpm(settings.bpm * (4 / loadedDenom));
        engine.setBeatsPerMeasure(settings.beatsPerMeasure);
      }

      if (settings.subdivisionPattern && settings.subdivisionPattern.length > 0) {
        setSubdivisionPattern(settings.subdivisionPattern);
      }
      if (settings.beatSubdivisions) {
        setBeatSubdivisions(settings.beatSubdivisions);
        engine?.setAllBeatSubdivisions(settings.beatSubdivisions);
      }
      if (settings.volume !== undefined) {
        setVolume(settings.volume);
        volumeRef.current = settings.volume;
      }
      if (settings.sampleVolume !== undefined) {
        setSampleVolume(settings.sampleVolume);
        sampleVolumeRef.current = settings.sampleVolume;
      }
      // applyAudioSettings comes from useAudioPipeline (called after useSettings in
      // useMetronomeScreen). The ref is populated by mount time (async .then).
      applyAudioSettingsCallbackRef.current({
        backgroundPlay: settings.backgroundPlay,
        autoResumeAfterInterruption: settings.autoResumeAfterInterruption,
      });
      if (settings.soundSet) {
        setSoundSet(settings.soundSet);
      }
      if (settings.layerSoundSets) {
        setLayerSoundSets(settings.layerSoundSets);
      }
      if (settings.flashMode) {
        setFlashMode(settings.flashMode);
        flashModeRef.current = settings.flashMode;
      }
      if (settings.hapticMode) {
        setHapticMode(settings.hapticMode);
        engine?.setHapticMode(settings.hapticMode);
      }
      if (settings.audioOffsetMs !== undefined) {
        setAudioOffsetMs(settings.audioOffsetMs);
        engine?.setAudioOffsetMs(settings.audioOffsetMs);
      }
      if (settings.timerStopMode) {
        setTimerStopMode(settings.timerStopMode);
      }
      if (settings.landscapeReversed !== undefined) {
        setLandscapeReversed(settings.landscapeReversed);
      }
      if (settings.beatDirection) {
        setBeatDirection(settings.beatDirection);
      }
      if (settings.barMetronomeChannel) {
        setBarMetronomeChannel(settings.barMetronomeChannel);
        barMetronomeChannelRef.current = settings.barMetronomeChannel;
      }
      if (settings.barCellOpacity != null) setBarCellOpacity(settings.barCellOpacity);
      if (settings.barRowHeight != null) setBarRowHeight(settings.barRowHeight);
      if (settings.username) {
        setUsername(settings.username);
      }

      // Delegate extra init (setIsLoaded, loadCustomSoundSets, PCM warmup, …)
      // to useMetronomeScreen — these are not settings concerns.
      onSettingsLoaded?.(settings);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount-only: settings are loaded once on startup

  // ── Sample-volume sideEffect ─────────────────────────────────────────────────
  // Sync existing note-sample player volumes whenever sampleVolume state changes.
  useEffect(() => {
    for (const player of Object.values(noteSampleSoundsRef.current)) {
      try { player.volume = Math.max(0, Math.min(1, sampleVolume)); } catch {}
    }
  }, [sampleVolume, noteSampleSoundsRef]);

  // ── Update callbacks ──────────────────────────────────────────────────────────

  const updateVolume = useCallback(
    (newVolume: number) => {
      setVolume(newVolume);
      volumeRef.current = newVolume;
      persistSettings({ volume: newVolume });
      scheduleReRenderCallbackRef.current();
    },
    // persistSettings is stable (created once); refs are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [persistSettings],
  );

  const updateSampleVolume = useCallback(
    (newVol: number) => {
      setSampleVolume(newVol);
      sampleVolumeRef.current = newVol;
      for (const player of Object.values(noteSampleSoundsRef.current)) {
        try { player.volume = Math.max(0, Math.min(1, newVol)); } catch {}
      }
      persistSettings({ sampleVolume: newVol });
      scheduleReRenderCallbackRef.current();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [persistSettings],
  );

  const updateSoundSet = useCallback(
    (value: SoundSet) => {
      delete clickPCMCacheRef.current[value];
      clearWebClickBuffers();
      webClickReadyRef.current = false;
      setSoundSet(value);
      persistSettings({ soundSet: value });
      scheduleReRenderCallbackRef.current();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [persistSettings],
  );

  const updateFlashMode = useCallback(
    (value: FlashMode) => {
      setFlashMode(value);
      flashModeRef.current = value;
      persistSettings({ flashMode: value });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [persistSettings],
  );

  const updateHapticMode = useCallback(
    (value: HapticMode) => {
      setHapticMode(value);
      engineRef.current?.setHapticMode(value);
      persistSettings({ hapticMode: value });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [persistSettings],
  );

  const updateAudioOffset = useCallback(
    (value: number) => {
      setAudioOffsetMs(value);
      engineRef.current?.setAudioOffsetMs(value);
      persistSettings({ audioOffsetMs: value });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [persistSettings],
  );

  const updateBpm = useCallback(
    (newBpm: number) => {
      const clampedBpm = Math.max(20, Math.min(300, newBpm));
      setBpm(clampedBpm);
      // Engine runs at denominator-adjusted speed; display BPM stays as clampedBpm.
      engineRef.current?.setBpm(clampedBpm * (4 / beatDenominator));
      persistSettings({ bpm: clampedBpm });
      scheduleReRenderCallbackRef.current();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [beatDenominator, persistSettings],
  );

  const updateTimerStopMode = useCallback(
    (mode: "immediate" | "end-of-cycle") => {
      setTimerStopMode(mode);
      persistSettings({ timerStopMode: mode });
    },
    [persistSettings],
  );

  const updateUsername = useCallback(
    (name: string) => {
      setUsername(name);
      persistSettings({ username: name });
    },
    [persistSettings],
  );

  // ── Return ────────────────────────────────────────────────────────────────────

  return {
    bpm, setBpm, bpmRef,
    halfTime, setHalfTime,
    beatDenominator, setBeatDenominator,
    beatsPerMeasure, setBeatsPerMeasure,
    beatTypes, setBeatTypes,
    subdivisionPattern, setSubdivisionPattern,
    beatSubdivisions, setBeatSubdivisions,
    volume, setVolume,
    sampleVolume, setSampleVolume,
    soundSet, setSoundSet,
    layerSoundSets, setLayerSoundSets, layerSoundSetsRef,
    flashMode, setFlashMode, flashModeRef,
    hapticMode, setHapticMode,
    audioOffsetMs, setAudioOffsetMs,
    timerStopMode, setTimerStopMode,
    landscapeReversed, setLandscapeReversed,
    beatDirection, setBeatDirection,
    username, setUsername,
    barMetronomeChannel, setBarMetronomeChannel, barMetronomeChannelRef,
    barCellOpacity, setBarCellOpacity,
    barRowHeight, setBarRowHeight,
    persistSettings,
    persistStatus,
    persistAudioSettingsCallbackRef,
    syncExternalSnapshot,
    updateVolume,
    updateSampleVolume,
    updateSoundSet,
    updateFlashMode,
    updateHapticMode,
    updateAudioOffset,
    updateBpm,
    updateTimerStopMode,
    updateUsername,
  };
}
