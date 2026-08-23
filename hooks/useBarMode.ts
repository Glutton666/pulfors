/**
 * useBarMode — bar mode domain hook extracted from useMetronomeScreen.
 *
 * Owns:
 *   - barRepeats, loopBlocks, barStartBeat, barLoopMode, blockPlayMode state
 *   - barStartBeatRef, barLoopModeRef, blockPlayModeRef (stable mirror refs)
 *   - barConfigRef (source of truth for bar setup; absorbs useBarConfig)
 *   - All bar-mode callbacks: handleBarModeChange, handleBarRepeatChange,
 *     handleLoopBlocksChange, handleBarReset, handleBarQuickSave, handleAddBar,
 *     handleDeleteBar, handleCopyBar, handleInsertBarAfter, handleReorderBar
 *
 * Interface with togglePlayPause (explicit, no direct engine coupling):
 *   - stopIfPlaying: () => void  — idempotent; stops engine + play state
 *   - isPlayingRef: RefObject<boolean> — read-only guard inside gesture callbacks
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { toEngineBpm } from "@/lib/metronome-engine";
import type { BeatType, MetronomeEngine } from "@/lib/metronome-engine";
import type { BarRepeat, LoopBlock } from "@/components/BeatIndicator";
import type { MetronomeSettings, PracticeEntry } from "@/lib/storage";
import {
  loadPracticeBook,
  savePracticeBook,
  createPracticeEntry,
} from "@/lib/storage";
import type {
  BarConfig,
  DialConfig,
} from "@/app/index.helpers";
import {
  defaultBeatTypes,
  createInitialBarConfig,
  applyLoopBlocksChange,
} from "@/app/index.helpers";
import {
  saveNoteSamples,
  saveNoteSampleNames,
  saveNoteSampleSources,
  saveNoteSampleChannels,
  saveNoteSampleVolumes,
} from "@/lib/note-samples";
import type {
  NoteSampleMap,
  NoteSampleNameMap,
  NoteSampleSourceMap,
  NoteSampleChannelMap,
  NoteSampleVolumeMap,
  NoteSampleMetroChannelMap,
} from "@/lib/note-samples";
import { releaseAll as releaseAllStereoArtifacts } from "@/lib/sample-cache";
import { applyDialConfigToEngine } from "@/lib/dial-engine-boundary";
import { captureBreadcrumb } from "@/lib/error-tracking";
import type { TranslationFn } from "@/lib/i18n";
import type { AudioPlayer as ExpoAudioPlayer } from "expo-audio";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type SamplePlayState = Record<
  string,
  { playing: boolean; endTimer: ReturnType<typeof setTimeout> | null }
>;

function syncEngineBarBpmOverrides(
  engine: MetronomeEngine | null,
  repeats: Record<number, BarRepeat>,
  fallbackDenominator: 2 | 4 | 8,
): void {
  if (!engine) return;
  const overrides: Record<number, number> = {};
  for (const [key, repeat] of Object.entries(repeats)) {
    if (typeof repeat.bpm === "number" && repeat.bpm > 0) {
      overrides[Number(key)] = toEngineBpm(
        repeat.bpm,
        repeat.meterDenominator ?? fallbackDenominator,
      );
    }
  }
  engine.setAllBarBpmOverrides(overrides);
}

export interface UseBarModeParams {
  // ── Engine ────────────────────────────────────────────────────────────────
  engineRef: React.MutableRefObject<MetronomeEngine | null>;

  // ── Mode management ───────────────────────────────────────────────────────
  /** Proxy ref: get/set drives activeModeRef + setCoreMode */
  barModeRef: React.MutableRefObject<boolean>;
  setBarMode: (v: boolean) => void;
  /** Dial config ref (owned by useDialConfig; shared during mode swaps) */
  dialConfigRef: React.MutableRefObject<DialConfig>;

  // ── Explicit stop-playback interface (no direct togglePlayPause coupling) ─
  /**
   * Idempotent: stops engine, rendered audio, resets play state.
   * No-op when not playing. Replaces the inline `if (isPlaying) { ... }`
   * blocks in handleBarModeChange so useBarMode has no dependency on
   * stopRenderedAudio / clearSamplePlayStates / setIsPlaying / setIsPreparing.
   */
  stopIfPlaying: () => void;
  /** Read-only ref — used to gate gesture callbacks without creating deps. */
  isPlayingRef: React.MutableRefObject<boolean>;

  // ── Shared beat state (both dial + bar use these) ─────────────────────────
  beatsPerMeasure: number;
  setBeatsPerMeasure: React.Dispatch<React.SetStateAction<number>>;
  beatTypes: BeatType[];
  setBeatTypes: React.Dispatch<React.SetStateAction<BeatType[]>>;
  beatSubdivisions: Record<string, BeatType[]>;
  setBeatSubdivisions: React.Dispatch<
    React.SetStateAction<Record<string, BeatType[]>>
  >;
  subdivisionPattern: BeatType[];
  setSubdivisionPattern: React.Dispatch<React.SetStateAction<BeatType[]>>;

  // ── Note samples (shared with note mode) ─────────────────────────────────
  noteSamples: NoteSampleMap;
  setNoteSamples: React.Dispatch<React.SetStateAction<NoteSampleMap>>;
  noteSamplesRef: React.MutableRefObject<NoteSampleMap>;
  noteSampleNames: NoteSampleNameMap;
  setNoteSampleNames: React.Dispatch<React.SetStateAction<NoteSampleNameMap>>;
  noteSampleNamesRef: React.MutableRefObject<NoteSampleNameMap>;
  noteSampleSources: NoteSampleSourceMap;
  setNoteSampleSources: React.Dispatch<
    React.SetStateAction<NoteSampleSourceMap>
  >;
  noteSampleSourcesRef: React.MutableRefObject<NoteSampleSourceMap>;
  noteSampleChannels: NoteSampleChannelMap;
  setNoteSampleChannels: React.Dispatch<
    React.SetStateAction<NoteSampleChannelMap>
  >;
  noteSampleChannelsRef: React.MutableRefObject<NoteSampleChannelMap>;
  noteSampleVolumes: NoteSampleVolumeMap;
  setNoteSampleVolumes: React.Dispatch<React.SetStateAction<NoteSampleVolumeMap>>;
  noteSampleVolumesRef: React.MutableRefObject<NoteSampleVolumeMap>;
  setNoteSampleMetroChannels: React.Dispatch<
    React.SetStateAction<NoteSampleMetroChannelMap>
  >;
  noteSampleMetroChannelsRef: React.MutableRefObject<NoteSampleMetroChannelMap>;
  /** Expo Audio players keyed by beat index string */
  noteSampleSoundsRef: React.MutableRefObject<Record<string, ExpoAudioPlayer>>;
  /** Live playback tracker for note sample players */
  samplePlayStateRef: React.MutableRefObject<SamplePlayState>;
  /** Pre-warms note sample audio players */
  preloadNoteSampleSounds: (samples: NoteSampleMap) => void;

  // ── BPM / denominator ──────────────────────────────────────────────────────
  /** Called whenever bar-mode BPM changes — updates the engine + global BPM state. */
  onBarBpmChange: (bpm: number) => void;
  beatDenominatorRef: React.MutableRefObject<2 | 4 | 8>;

  // ── Settings ──────────────────────────────────────────────────────────────
  username: string;
  persistSettings: (s: Partial<MetronomeSettings>) => void;

  // ── Audio pipeline ────────────────────────────────────────────────────────
  scheduleReRender: () => void;

  // ── i18n ──────────────────────────────────────────────────────────────────
  t: TranslationFn;
}

export interface UseBarModeResult {
  // ── Bar config ref (source of truth for the bar setup) ────────────────────
  barConfigRef: React.MutableRefObject<BarConfig>;

  // ── State ─────────────────────────────────────────────────────────────────
  /** Bar-mode's own BPM, independent of global beat-mode BPM. */
  barBpm: number;
  setBarBpm: React.Dispatch<React.SetStateAction<number>>;
  barBpmRef: React.MutableRefObject<number>;
  barRepeats: Record<number, BarRepeat>;
  setBarRepeats: React.Dispatch<React.SetStateAction<Record<number, BarRepeat>>>;
  loopBlocks: LoopBlock[];
  setLoopBlocks: React.Dispatch<React.SetStateAction<LoopBlock[]>>;
  barStartBeat: number | null;
  setBarStartBeat: React.Dispatch<React.SetStateAction<number | null>>;
  barLoopMode: "loop" | "once";
  setBarLoopMode: React.Dispatch<React.SetStateAction<"loop" | "once">>;
  blockPlayMode: "sequential" | "loop" | "random";
  setBlockPlayMode: React.Dispatch<
    React.SetStateAction<"sequential" | "loop" | "random">
  >;

  // ── Stable mirror refs ────────────────────────────────────────────────────
  barStartBeatRef: React.MutableRefObject<number | null>;
  barLoopModeRef: React.MutableRefObject<"loop" | "once">;
  blockPlayModeRef: React.MutableRefObject<"sequential" | "loop" | "random">;

  // ── Callbacks ─────────────────────────────────────────────────────────────
  handleBarModeChange: (toBarMode: boolean) => void;
  /** Sets bar-mode BPM, updates engine and notifies parent via onBarBpmChange. */
  handleBarBpmChange: (newBpm: number) => void;
  handleBarRepeatChange: (beat: number, repeat: BarRepeat | null) => void;
  handleBarMeterChange: (
    beat: number,
    meter: { numerator: number; denominator: 2 | 4 | 8 },
  ) => void;
  handleLoopBlocksChange: (blocks: LoopBlock[]) => void;
  handleBarReset: () => void;
  handleBarQuickSave: () => Promise<boolean>;
  handleAddBar: (draftRepeat?: BarRepeat) => void;
  handleDeleteBar: (beatIndex: number) => void;
  handleCopyBar: (beatIndex: number) => void;
  handleInsertBarAfter: (beatIndex: number) => void;
  handleReorderBar: (fromIndex: number, toIndex: number) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useBarMode(p: UseBarModeParams): UseBarModeResult {
  // ── Bar config ref (absorbs useBarConfig) ──────────────────────────────────
  const barConfigRef = useRef<BarConfig>(createInitialBarConfig(4));

  // ── State ──────────────────────────────────────────────────────────────────
  /** Bar-mode BPM — independent of global beat-mode BPM. Seeded by useMetronomeScreen
   *  wrapper (which calls setBarBpm / sets barBpmRef) before entering bar mode. */
  const [barBpm, setBarBpm] = useState<number>(120);
  const barBpmRef = useRef<number>(120);
  useEffect(() => { barBpmRef.current = barBpm; }, [barBpm]);

  const [barRepeats, setBarRepeats] = useState<Record<number, BarRepeat>>({});
  const [loopBlocks, setLoopBlocks] = useState<LoopBlock[]>([]);
  const [barStartBeat, setBarStartBeat] = useState<number | null>(null);
  const [barLoopMode, setBarLoopMode] = useState<"loop" | "once">("once");
  const [blockPlayMode, setBlockPlayMode] = useState<
    "sequential" | "loop" | "random"
  >("loop");

  // ── Stable mirror refs ─────────────────────────────────────────────────────
  const barStartBeatRef = useRef<number | null>(barStartBeat);
  useEffect(() => {
    barStartBeatRef.current = barStartBeat;
  }, [barStartBeat]);

  const barLoopModeRef = useRef<"loop" | "once">(barLoopMode);
  useEffect(() => {
    barLoopModeRef.current = barLoopMode;
  }, [barLoopMode]);

  const blockPlayModeRef = useRef<"sequential" | "loop" | "random">(
    blockPlayMode,
  );
  useEffect(() => {
    blockPlayModeRef.current = blockPlayMode;
  }, [blockPlayMode]);

  // ─────────────────────────────────────────────────────────────────────────
  // handleBarBpmChange
  // ─────────────────────────────────────────────────────────────────────────

  const handleBarBpmChange = useCallback((newBpm: number) => {
    const clamped = Math.max(20, Math.min(300, newBpm));
    setBarBpm(clamped);
    barBpmRef.current = clamped;
    p.onBarBpmChange(clamped);
  }, [p.onBarBpmChange]);

  // ─────────────────────────────────────────────────────────────────────────
  // handleBarModeChange
  // ─────────────────────────────────────────────────────────────────────────

  const handleBarModeChange = useCallback(
    (toBarMode: boolean) => {
      const engine = p.engineRef.current;
      if (!engine) return;

      // Explicit interface with togglePlayPause — no direct engine.stop() call.
      p.stopIfPlaying();
      setBarStartBeat(null);

      if (toBarMode) {
        // Save current dial config before switching to bar mode.
        p.dialConfigRef.current = {
          beatsPerMeasure: p.beatsPerMeasure,
          beatTypes: [...p.beatTypes],
          beatSubdivisions: { ...p.beatSubdivisions },
          subdivisionPattern: [...p.subdivisionPattern],
          noteSamples: { ...p.noteSamples },
          noteSampleNames: { ...p.noteSampleNames },
          noteSampleSources: { ...p.noteSampleSources },
          noteSampleChannels: { ...p.noteSampleChannels },
          noteSampleVolumes: { ...p.noteSampleVolumes },
        };

        const savedBarConfig = barConfigRef.current;
        if (savedBarConfig.hasBeenConfigured) {
          // A bar session is a persistent editing surface. Restoring this
          // snapshot is essential: bar-specific meter/BPM and repeat data must
          // not fall back to the global defaults merely because the user
          // visited another mode.
          const savedRepeats = { ...savedBarConfig.barRepeats };
          const savedBlocks = [...savedBarConfig.loopBlocks];
          const bpmOverrides: Record<number, number> = {};
          for (const [key, repeat] of Object.entries(savedRepeats)) {
            if (typeof repeat.bpm === "number" && repeat.bpm > 0) {
              bpmOverrides[Number(key)] = toEngineBpm(
                repeat.bpm,
                repeat.meterDenominator ?? p.beatDenominatorRef.current,
              );
            }
          }

          p.setBeatsPerMeasure(savedBarConfig.beatsPerMeasure);
          p.setBeatTypes([...savedBarConfig.beatTypes]);
          p.setBeatSubdivisions({ ...savedBarConfig.beatSubdivisions });
          p.setSubdivisionPattern([...(savedBarConfig.subdivisionPattern ?? ["accent"])]);
          setBarRepeats(savedRepeats);
          setLoopBlocks(savedBlocks);
          setBarLoopMode(savedBarConfig.barLoopMode);
          setBlockPlayMode(savedBarConfig.blockPlayMode);
          p.setNoteSamples({ ...savedBarConfig.noteSamples });
          p.noteSamplesRef.current = { ...savedBarConfig.noteSamples };
          p.setNoteSampleNames({ ...savedBarConfig.noteSampleNames });
          p.noteSampleNamesRef.current = { ...savedBarConfig.noteSampleNames };
          p.setNoteSampleSources({ ...savedBarConfig.noteSampleSources });
          p.noteSampleSourcesRef.current = { ...savedBarConfig.noteSampleSources };
          p.setNoteSampleChannels({ ...savedBarConfig.noteSampleChannels });
          p.noteSampleChannelsRef.current = { ...savedBarConfig.noteSampleChannels };
          p.setNoteSampleVolumes({ ...(savedBarConfig.noteSampleVolumes || {}) });
          p.noteSampleVolumesRef.current = { ...(savedBarConfig.noteSampleVolumes || {}) };
          p.setNoteSampleMetroChannels({});
          p.noteSampleMetroChannelsRef.current = {};

          engine.setBeatsPerMeasure(savedBarConfig.beatsPerMeasure);
          engine.setBeatTypes([...savedBarConfig.beatTypes]);
          engine.setAllBeatSubdivisions({ ...savedBarConfig.beatSubdivisions });
          engine.setLoopBlocks(savedBlocks);
          engine.setBlockPlayMode(savedBarConfig.blockPlayMode);
          engine.setAllBarRepeats(savedRepeats);
          engine.setAllBarBpmOverrides(bpmOverrides);
        } else {
          // First visit: start with an empty bar canvas.
          barConfigRef.current = {
            ...savedBarConfig,
            beatsPerMeasure: 0,
            beatTypes: [],
            beatSubdivisions: {},
            subdivisionPattern: ["accent"],
            barRepeats: {},
            loopBlocks: [],
            barClockMode: "stopwatch",
            barTimerDuration: 180,
            noteSamples: {},
            noteSampleNames: {},
            noteSampleSources: {},
            noteSampleChannels: {},
            noteSampleVolumes: {},
            barLoopMode: "once",
            blockPlayMode: "loop",
            hasBeenConfigured: true,
          };
          p.setBeatsPerMeasure(0);
          p.setBeatTypes([]);
          p.setBeatSubdivisions({});
          p.setSubdivisionPattern(["accent"]);
          setBarRepeats({});
          setLoopBlocks([]);
          setBarLoopMode("once");
          p.setNoteSamples({});
          p.noteSamplesRef.current = {};
          p.setNoteSampleNames({});
          p.noteSampleNamesRef.current = {};
          p.setNoteSampleSources({});
          p.noteSampleSourcesRef.current = {};
          p.setNoteSampleChannels({});
          p.noteSampleChannelsRef.current = {};
          p.setNoteSampleVolumes({});
          p.noteSampleVolumesRef.current = {};
          p.setNoteSampleMetroChannels({});
          p.noteSampleMetroChannelsRef.current = {};
          engine.setBeatsPerMeasure(0);
          engine.setBeatTypes([]);
          engine.setAllBeatSubdivisions({});
          engine.clearLoopBlocks();
          engine.clearBarRepeats();
          engine.clearBarBpmOverrides();
        }
      } else {
        // Snapshot current bar state before leaving.
        barConfigRef.current = {
          ...barConfigRef.current,
          beatsPerMeasure: p.beatsPerMeasure,
          beatTypes: [...p.beatTypes],
          beatSubdivisions: { ...p.beatSubdivisions },
          subdivisionPattern: [...p.subdivisionPattern],
          barRepeats: { ...barRepeats },
          loopBlocks: [...loopBlocks],
          noteSamples: { ...p.noteSamples },
          noteSampleNames: { ...p.noteSampleNames },
          noteSampleSources: { ...p.noteSampleSources },
          noteSampleChannels: { ...p.noteSampleChannels },
          noteSampleVolumes: { ...p.noteSampleVolumes },
          barLoopMode,
          blockPlayMode,
          hasBeenConfigured: true,
        };
        // Restore dial config.
        const dc = p.dialConfigRef.current;
        p.setBeatsPerMeasure(dc.beatsPerMeasure);
        p.setBeatTypes([...dc.beatTypes]);
        p.setBeatSubdivisions({ ...dc.beatSubdivisions });
        p.setSubdivisionPattern([...(dc.subdivisionPattern ?? ["accent"])]);
        setBarRepeats({});
        setLoopBlocks([]);
        p.setNoteSamples({ ...dc.noteSamples });
        p.noteSamplesRef.current = { ...dc.noteSamples };
        p.setNoteSampleNames({ ...dc.noteSampleNames });
        p.noteSampleNamesRef.current = { ...dc.noteSampleNames };
        p.setNoteSampleSources({ ...dc.noteSampleSources });
        p.noteSampleSourcesRef.current = { ...dc.noteSampleSources };
        p.setNoteSampleChannels({ ...(dc.noteSampleChannels || {}) });
        p.noteSampleChannelsRef.current = { ...(dc.noteSampleChannels || {}) };
        p.setNoteSampleVolumes({ ...(dc.noteSampleVolumes || {}) });
        p.noteSampleVolumesRef.current = { ...(dc.noteSampleVolumes || {}) };
        applyDialConfigToEngine(engine, dc);
      }

      void releaseAllStereoArtifacts();
      engine.flushSchedule();
      p.setBarMode(toBarMode);
    },
    // p.stopIfPlaying / p.setBarMode / p.dialConfigRef are stable.
    // Reactive values that affect the snapshot are included.
    [
      p.beatsPerMeasure,
      p.beatTypes,
      p.beatSubdivisions,
      p.noteSamples,
      p.noteSampleNames,
      p.noteSampleSources,
      p.noteSampleChannels,
      p.noteSampleVolumes,
      barRepeats,
      loopBlocks,
      barLoopMode,
      blockPlayMode,
    ],
  );

  // ─────────────────────────────────────────────────────────────────────────
  // handleBarRepeatChange
  // ─────────────────────────────────────────────────────────────────────────

  const handleBarRepeatChange = useCallback(
    (beat: number, repeat: BarRepeat | null) => {
      setBarRepeats((prev) => {
        const next = { ...prev };
        if (repeat) {
          next[beat] = repeat;
        } else {
          delete next[beat];
        }
        barConfigRef.current.barRepeats = { ...next };
        p.engineRef.current?.setBarRepeat(beat, repeat);
        p.engineRef.current?.setBarBpmOverride(
          beat,
          repeat?.bpm != null
            ? toEngineBpm(
                repeat.bpm,
                repeat.meterDenominator ?? p.beatDenominatorRef.current,
              )
            : null,
        );
        return next;
      });
      p.scheduleReRender();
    },
    [p.scheduleReRender],
  );

  const handleBarMeterChange = useCallback(
    (
      beat: number,
      meter: { numerator: number; denominator: 2 | 4 | 8 },
    ) => {
      const existing = barRepeats[beat] ?? { type: "count" as const, value: 1 };
      const next: BarRepeat = {
        ...existing,
        meterNumerator: Math.max(1, Math.min(16, Math.round(meter.numerator))),
        meterDenominator: meter.denominator,
      };
      handleBarRepeatChange(beat, next);
    },
    [barRepeats, handleBarRepeatChange],
  );

  // ─────────────────────────────────────────────────────────────────────────
  // handleLoopBlocksChange
  // ─────────────────────────────────────────────────────────────────────────

  const handleLoopBlocksChange = useCallback(
    (blocks: LoopBlock[]) => {
      setLoopBlocks(blocks);
      applyLoopBlocksChange(
        p.engineRef.current ?? null,
        barConfigRef.current,
        p.scheduleReRender,
        blocks,
      );
    },
    [p.scheduleReRender],
  );

  // ─────────────────────────────────────────────────────────────────────────
  // handleBarQuickSave
  // ─────────────────────────────────────────────────────────────────────────

  const handleBarQuickSave = useCallback(async (): Promise<boolean> => {
    try {
      const config = {
        mode: "bar" as const,
        bpm: barBpm,
        beatsPerMeasure: p.beatsPerMeasure,
        beatTypes: [...p.beatTypes],
        beatSubdivisions: { ...p.beatSubdivisions },
        barRepeats: { ...barRepeats },
        loopBlocks: [...loopBlocks],
        barLoopMode: barLoopMode as "loop" | "once",
        blockPlayMode: blockPlayMode as "sequential" | "loop" | "random",
        subdivisionPattern: [...p.subdivisionPattern],
        barClockMode: barConfigRef.current.barClockMode,
        barTimerDuration: barConfigRef.current.barTimerDuration,
      };
      const now = new Date();
      const label = `Bar ${p.beatsPerMeasure}/${barBpm} ${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
      const entry = createPracticeEntry(label, config, p.username);
      const existing = await loadPracticeBook();
      await savePracticeBook([entry, ...existing]);
      if (Platform.OS !== "web")
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return true;
    } catch (e) {
      captureBreadcrumb({
        category: "practice-book",
        message: "Quick save error",
        level: "warning",
        data: { error: String(e) },
      });
      return false;
    }
  }, [
    barBpm,
    p.beatsPerMeasure,
    p.beatTypes,
    p.beatSubdivisions,
    p.subdivisionPattern,
    p.username,
    barRepeats,
    loopBlocks,
    barLoopMode,
    blockPlayMode,
  ]);

  // ─────────────────────────────────────────────────────────────────────────
  // handleAddBar
  // ─────────────────────────────────────────────────────────────────────────

  const handleAddBar = useCallback(
    (draftRepeat?: BarRepeat) => {
      if (p.beatsPerMeasure >= 16) return;
      const newBeat = p.beatsPerMeasure;
      const newBeats = p.beatsPerMeasure + 1;
      const newTypes: BeatType[] = [...p.beatTypes, "normal"];
      p.setBeatsPerMeasure(newBeats);
      p.setBeatTypes(newTypes);
      p.engineRef.current?.setBeatsPerMeasure(newBeats);
      p.engineRef.current?.setBeatTypes(newTypes);
      const currentPattern = p.subdivisionPattern;
      const newSubs = { ...p.beatSubdivisions };
      if (
        currentPattern.length > 1 ||
        (currentPattern.length === 1 && currentPattern[0] !== "normal")
      ) {
        newSubs[String(newBeat)] = [...currentPattern];
        p.engineRef.current?.setBeatSubdivision(newBeat, [...currentPattern]);
      }
      p.setBeatSubdivisions(newSubs);
      const newRepeat: BarRepeat = draftRepeat
        ? {
            ...draftRepeat,
            type: draftRepeat.type,
            value: draftRepeat.value,
            bpm: draftRepeat.bpm ?? barBpmRef.current,
            meterNumerator: draftRepeat.meterNumerator ?? (newSubs[String(newBeat)]?.length || 1),
            meterDenominator: draftRepeat.meterDenominator ?? p.beatDenominatorRef.current,
          }
        : (() => {
            const srcLayers =
              barStartBeat !== null
                ? (barRepeats[barStartBeat]?.layers ?? [])
                : [];
            return {
              type: "count",
              value: 1,
              bpm: barBpmRef.current,
              meterNumerator: newSubs[String(newBeat)]?.length || 1,
              meterDenominator: p.beatDenominatorRef.current,
              layers: srcLayers.length
                ? srcLayers.map((l) => ({ ...l }))
                : [],
            };
          })();
      setBarRepeats((prev) => ({ ...prev, [newBeat]: newRepeat }));
      barConfigRef.current.beatsPerMeasure = newBeats;
      barConfigRef.current.beatTypes = newTypes;
      barConfigRef.current.beatSubdivisions = newSubs;
      barConfigRef.current.barRepeats = {
        ...barConfigRef.current.barRepeats,
        [newBeat]: newRepeat,
      };
       p.engineRef.current?.setBarRepeat(newBeat, newRepeat);
       p.engineRef.current?.setBarBpmOverride(
         newBeat,
         toEngineBpm(newRepeat.bpm!, newRepeat.meterDenominator!),
       );
      if (Platform.OS !== "web")
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [
      p.beatsPerMeasure,
      p.beatTypes,
      p.beatSubdivisions,
      p.subdivisionPattern,
      barStartBeat,
      barRepeats,
    ],
  );

  // ─────────────────────────────────────────────────────────────────────────
  // handleCopyBar
  // ─────────────────────────────────────────────────────────────────────────

  const handleCopyBar = useCallback(
    (beatIndex: number) => {
      if (p.isPlayingRef.current) return;
      if (p.beatsPerMeasure >= 16) return;
      const srcType = p.beatTypes[beatIndex] ?? "strong";
      const srcSub = p.beatSubdivisions[String(beatIndex)] ?? [];
      const srcRepeat = barRepeats[beatIndex];
      const newBeat = p.beatsPerMeasure;
      const newTypes = [...p.beatTypes, srcType];
      const newSubs = { ...p.beatSubdivisions };
      if (srcSub.length > 0) newSubs[String(newBeat)] = [...srcSub];
      const newRepeats = { ...barRepeats };
       newRepeats[newBeat] = {
         ...(srcRepeat ?? {}),
         type: srcRepeat?.type ?? "count",
         value: srcRepeat?.value ?? 1,
         bpm: srcRepeat?.bpm ?? barBpmRef.current,
         meterNumerator: srcRepeat?.meterNumerator ?? (srcSub.length || 1),
         meterDenominator: srcRepeat?.meterDenominator ?? p.beatDenominatorRef.current,
         layers: srcRepeat?.layers
           ? srcRepeat.layers.map((l) => ({ ...l }))
           : undefined,
       };
      p.setBeatsPerMeasure(p.beatsPerMeasure + 1);
      p.setBeatTypes(newTypes);
      p.setBeatSubdivisions(newSubs);
      setBarRepeats(newRepeats);
      p.engineRef.current?.setBeatsPerMeasure(p.beatsPerMeasure + 1);
      p.engineRef.current?.setBeatTypes(newTypes);
      p.engineRef.current?.setAllBeatSubdivisions(newSubs);
      p.engineRef.current?.setAllBarRepeats(newRepeats);
       syncEngineBarBpmOverrides(
         p.engineRef.current,
         newRepeats,
         p.beatDenominatorRef.current,
       );
      barConfigRef.current.beatsPerMeasure = p.beatsPerMeasure + 1;
      barConfigRef.current.beatTypes = newTypes;
      barConfigRef.current.beatSubdivisions = newSubs;
      barConfigRef.current.barRepeats = newRepeats;
      if (Platform.OS !== "web")
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [p.beatTypes, p.beatSubdivisions, p.beatsPerMeasure, barRepeats],
  );

  // ─────────────────────────────────────────────────────────────────────────
  // handleInsertBarAfter
  // ─────────────────────────────────────────────────────────────────────────

  const handleInsertBarAfter = useCallback(
    (beatIndex: number) => {
      if (p.isPlayingRef.current) return;
      if (p.beatsPerMeasure >= 16) return;
      const insertAt = beatIndex + 1;
      const srcType = p.beatTypes[beatIndex] ?? "normal";
      const srcSub = p.beatSubdivisions[String(beatIndex)] ?? [];
      const srcRepeat = barRepeats[beatIndex];

      const newTypes = [
        ...p.beatTypes.slice(0, insertAt),
        srcType,
        ...p.beatTypes.slice(insertAt),
      ];

      const newSubs: Record<string, BeatType[]> = {};
      for (const [k, v] of Object.entries(p.beatSubdivisions)) {
        const ki = Number(k);
        if (ki < insertAt) newSubs[String(ki)] = v;
        else newSubs[String(ki + 1)] = v;
      }
      if (srcSub.length > 0) newSubs[String(insertAt)] = [...srcSub];

      const newRepeats: Record<number, BarRepeat> = {};
      for (const [k, v] of Object.entries(barRepeats)) {
        const ki = Number(k);
        if (ki < insertAt) newRepeats[ki] = v;
        else newRepeats[ki + 1] = v;
      }
       newRepeats[insertAt] = {
         ...(srcRepeat ?? {}),
         type: srcRepeat?.type ?? "count",
         value: srcRepeat?.value ?? 1,
         bpm: srcRepeat?.bpm ?? barBpmRef.current,
         meterNumerator: srcRepeat?.meterNumerator ?? (srcSub.length || 1),
         meterDenominator: srcRepeat?.meterDenominator ?? p.beatDenominatorRef.current,
         layers: srcRepeat?.layers
           ? srcRepeat.layers.map((l) => ({ ...l }))
           : undefined,
       };

      const shiftUp = (b: number) => (b >= insertAt ? b + 1 : b);
      const newBlocks = loopBlocks.map((lb) => {
        const newOwnBeatTypes: Record<number, BeatType> = {};
        for (const [k, v] of Object.entries(lb.ownBeatTypes ?? {})) {
          newOwnBeatTypes[shiftUp(Number(k))] = v as BeatType;
        }
        const newOwnSubdivisions: Record<string, BeatType[]> = {};
        for (const [k, v] of Object.entries(lb.ownSubdivisions ?? {})) {
          newOwnSubdivisions[String(shiftUp(Number(k)))] = v as BeatType[];
        }
        return {
          ...lb,
          startBeat: shiftUp(lb.startBeat),
          endBeat: shiftUp(lb.endBeat),
          ownBeatTypes: newOwnBeatTypes,
          ownSubdivisions: newOwnSubdivisions,
        };
      });

      const newBeats = p.beatsPerMeasure + 1;
      p.setBeatsPerMeasure(newBeats);
      p.setBeatTypes(newTypes);
      p.setBeatSubdivisions(newSubs);
      setBarRepeats(newRepeats);
      setLoopBlocks(newBlocks);
      p.engineRef.current?.setBeatsPerMeasure(newBeats);
      p.engineRef.current?.setBeatTypes(newTypes);
      p.engineRef.current?.setAllBeatSubdivisions(newSubs);
      p.engineRef.current?.setAllBarRepeats(newRepeats);
       syncEngineBarBpmOverrides(
         p.engineRef.current,
         newRepeats,
         p.beatDenominatorRef.current,
       );
      p.engineRef.current?.setLoopBlocks(newBlocks);
      barConfigRef.current.beatsPerMeasure = newBeats;
      barConfigRef.current.beatTypes = newTypes;
      barConfigRef.current.beatSubdivisions = newSubs;
      barConfigRef.current.barRepeats = newRepeats;
      barConfigRef.current.loopBlocks = newBlocks;
      if (Platform.OS !== "web")
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [p.beatsPerMeasure, p.beatTypes, p.beatSubdivisions, barRepeats, loopBlocks],
  );

  // ─────────────────────────────────────────────────────────────────────────
  // handleDeleteBar
  // ─────────────────────────────────────────────────────────────────────────

  const handleDeleteBar = useCallback(
    (beatIndex: number) => {
      const newBeats = p.beatsPerMeasure - 1;
      const newTypes = p.beatTypes.filter((_, i) => i !== beatIndex);
      const newSubs: Record<string, BeatType[]> = {};
      for (const [k, v] of Object.entries(p.beatSubdivisions)) {
        const ki = Number(k);
        if (ki < beatIndex) newSubs[String(ki)] = v;
        else if (ki > beatIndex) newSubs[String(ki - 1)] = v;
      }
      const newRepeats: Record<number, BarRepeat> = {};
      for (const [k, v] of Object.entries(barRepeats)) {
        const ki = Number(k);
        if (ki < beatIndex) newRepeats[ki] = v;
        else if (ki > beatIndex) newRepeats[ki - 1] = v;
      }
      const shiftBeat = (b: number) => (b < beatIndex ? b : b - 1);
      const newBlocks = loopBlocks
        .map((lb) => {
          const newStart =
            lb.startBeat < beatIndex
              ? lb.startBeat
              : lb.startBeat > beatIndex
                ? lb.startBeat - 1
                : lb.endBeat > beatIndex
                  ? lb.startBeat
                  : -1;
          const newEnd =
            lb.endBeat < beatIndex
              ? lb.endBeat
              : lb.endBeat > beatIndex
                ? lb.endBeat - 1
                : lb.startBeat < beatIndex
                  ? lb.endBeat - 1
                  : -1;
          if (newStart < 0 || newEnd < 0 || newStart > newEnd) return null;
          const newOwnBeatTypes: Record<number, BeatType> = {};
          for (const [k, v] of Object.entries(lb.ownBeatTypes ?? {})) {
            const ki = Number(k);
            if (ki !== beatIndex) newOwnBeatTypes[shiftBeat(ki)] = v as BeatType;
          }
          const newOwnSubdivisions: Record<string, BeatType[]> = {};
          for (const [k, v] of Object.entries(lb.ownSubdivisions ?? {})) {
            const ki = Number(k);
            if (ki !== beatIndex)
              newOwnSubdivisions[String(shiftBeat(ki))] = v as BeatType[];
          }
          return {
            ...lb,
            startBeat: newStart,
            endBeat: newEnd,
            ownBeatTypes: newOwnBeatTypes,
            ownSubdivisions: newOwnSubdivisions,
          };
        })
        .filter((b): b is NonNullable<typeof b> => b !== null);
      p.setBeatsPerMeasure(newBeats);
      p.setBeatTypes(newTypes);
      p.setBeatSubdivisions(newSubs);
      setBarRepeats(newRepeats);
      setLoopBlocks(newBlocks);
      p.engineRef.current?.setBeatsPerMeasure(newBeats);
      p.engineRef.current?.setBeatTypes(newTypes);
      p.engineRef.current?.setAllBeatSubdivisions(newSubs);
      p.engineRef.current?.setAllBarRepeats(newRepeats);
       syncEngineBarBpmOverrides(
         p.engineRef.current,
         newRepeats,
         p.beatDenominatorRef.current,
       );
      p.engineRef.current?.setLoopBlocks(newBlocks);
      if (barStartBeat !== null) {
        if (barStartBeat === beatIndex) setBarStartBeat(null);
        else if (barStartBeat > beatIndex) setBarStartBeat(barStartBeat - 1);
      }
      barConfigRef.current.beatsPerMeasure = newBeats;
      barConfigRef.current.beatTypes = newTypes;
      barConfigRef.current.beatSubdivisions = newSubs;
      barConfigRef.current.barRepeats = newRepeats;
      barConfigRef.current.loopBlocks = newBlocks;
      if (Platform.OS !== "web")
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    },
    [
      p.beatsPerMeasure,
      p.beatTypes,
      p.beatSubdivisions,
      barRepeats,
      barStartBeat,
      loopBlocks,
    ],
  );

  // ─────────────────────────────────────────────────────────────────────────
  // handleReorderBar
  // ─────────────────────────────────────────────────────────────────────────

  const handleReorderBar = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return;

      const reindex = (b: number): number => {
        if (b === fromIndex) return toIndex;
        if (fromIndex < toIndex && b > fromIndex && b <= toIndex) return b - 1;
        if (fromIndex > toIndex && b >= toIndex && b < fromIndex) return b + 1;
        return b;
      };

      const newTypes = [...p.beatTypes];
      const [moved] = newTypes.splice(fromIndex, 1);
      newTypes.splice(toIndex, 0, moved);

      const newSubs: Record<string, BeatType[]> = {};
      for (const [k, v] of Object.entries(p.beatSubdivisions)) {
        newSubs[String(reindex(Number(k)))] = v;
      }

      const newRepeats: Record<number, BarRepeat> = {};
      for (const [k, v] of Object.entries(barRepeats)) {
        newRepeats[reindex(Number(k))] = v as BarRepeat;
      }

      const newBlocks = loopBlocks.map((lb) => {
        const newStart = reindex(lb.startBeat);
        const newEnd = reindex(lb.endBeat);
        const newOwnBeatTypes: Record<number, BeatType> = {};
        for (const [k, v] of Object.entries(lb.ownBeatTypes ?? {})) {
          newOwnBeatTypes[reindex(Number(k))] = v as BeatType;
        }
        const newOwnSubdivisions: Record<string, BeatType[]> = {};
        for (const [k, v] of Object.entries(lb.ownSubdivisions ?? {})) {
          newOwnSubdivisions[String(reindex(Number(k)))] = v as BeatType[];
        }
        return {
          ...lb,
          startBeat: Math.min(newStart, newEnd),
          endBeat: Math.max(newStart, newEnd),
          ownBeatTypes: newOwnBeatTypes,
          ownSubdivisions: newOwnSubdivisions,
        };
      });

      p.setBeatTypes(newTypes);
      p.setBeatSubdivisions(newSubs);
      setBarRepeats(newRepeats);
      setLoopBlocks(newBlocks);
      p.engineRef.current?.setBeatTypes(newTypes);
      p.engineRef.current?.setAllBeatSubdivisions(newSubs);
      p.engineRef.current?.setAllBarRepeats(newRepeats);
       syncEngineBarBpmOverrides(
         p.engineRef.current,
         newRepeats,
         p.beatDenominatorRef.current,
       );
      p.engineRef.current?.setLoopBlocks(newBlocks);

      if (barStartBeat !== null) setBarStartBeat(reindex(barStartBeat));

      barConfigRef.current.beatTypes = newTypes;
      barConfigRef.current.beatSubdivisions = newSubs;
      barConfigRef.current.barRepeats = newRepeats;
      barConfigRef.current.loopBlocks = newBlocks;
    },
    [p.beatTypes, p.beatSubdivisions, barRepeats, loopBlocks, barStartBeat],
  );

  // ─────────────────────────────────────────────────────────────────────────
  // handleBarReset
  // ─────────────────────────────────────────────────────────────────────────

  const handleBarReset = useCallback(() => {
    const engine = p.engineRef.current;
    const beats = barConfigRef.current.beatsPerMeasure || 4;
    const newTypes = defaultBeatTypes(beats);
    p.setBeatTypes(newTypes);
    p.setBeatSubdivisions({});
    // The editor renders this staging pattern while stopped. Keep it aligned
    // with the engine state we are about to reset below.
    p.setSubdivisionPattern(["accent"]);
    setBarRepeats({});
    setLoopBlocks([]);
    setBarStartBeat(null);
    setBarLoopMode("once");
    p.setNoteSamples({});
    p.noteSamplesRef.current = {};
    p.setNoteSampleNames({});
    p.noteSampleNamesRef.current = {};
    p.setNoteSampleSources({});
    p.noteSampleSourcesRef.current = {};
    p.setNoteSampleChannels({});
    p.noteSampleChannelsRef.current = {};
    p.setNoteSampleVolumes({});
    p.noteSampleVolumesRef.current = {};
    for (const [, st] of Object.entries(p.samplePlayStateRef.current)) {
      if (st.endTimer) clearTimeout(st.endTimer);
    }
    p.samplePlayStateRef.current = {};
    for (const player of Object.values(p.noteSampleSoundsRef.current)) {
      try {
        player.pause();
      } catch {}
      try {
        player.release();
      } catch {}
    }
    p.noteSampleSoundsRef.current = {};
    void releaseAllStereoArtifacts();
    saveNoteSamples({});
    saveNoteSampleNames({});
    saveNoteSampleSources({});
    saveNoteSampleChannels({});
    saveNoteSampleVolumes({});
    barConfigRef.current = {
      beatsPerMeasure: beats,
      beatTypes: [...newTypes],
      beatSubdivisions: {},
      barRepeats: {},
      loopBlocks: [],
      barClockMode: "stopwatch",
      barTimerDuration: 180,
      noteSamples: {},
      noteSampleNames: {},
      noteSampleSources: {},
      noteSampleChannels: {},
      noteSampleVolumes: {},
      barLoopMode: "once",
      blockPlayMode: "loop",
      hasBeenConfigured: true,
    };
    if (engine) {
      engine.setBeatTypes([...newTypes]);
      engine.setAllBeatSubdivisions({});
      engine.setAllBarRepeats({});
      engine.clearLoopBlocks();
      engine.setAllBarBpmOverrides({});
    }
  }, []); // stable: only refs + stable setters used

  // ─────────────────────────────────────────────────────────────────────────
  // Return
  // ─────────────────────────────────────────────────────────────────────────

  return {
    barConfigRef,
    barBpm,
    setBarBpm,
    barBpmRef,
    barRepeats,
    setBarRepeats,
    loopBlocks,
    setLoopBlocks,
    barStartBeat,
    setBarStartBeat,
    barLoopMode,
    setBarLoopMode,
    blockPlayMode,
    setBlockPlayMode,
    barStartBeatRef,
    barLoopModeRef,
    blockPlayModeRef,
    handleBarModeChange,
    handleBarBpmChange,
    handleBarRepeatChange,
    handleBarMeterChange,
    handleLoopBlocksChange,
    handleBarReset,
    handleBarQuickSave,
    handleAddBar,
    handleDeleteBar,
    handleCopyBar,
    handleInsertBarAfter,
    handleReorderBar,
  };
}
