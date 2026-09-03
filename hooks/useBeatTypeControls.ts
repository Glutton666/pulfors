/**
 * useBeatTypeControls
 *
 * Focused hook that owns `handleBeatTypeChange` and `updateTimeSignature`,
 * extracted from useMetronomeScreen (task #532).
 *
 * Preserves all existing behaviour:
 *   - bar-vs-dial branching (barModeRef gates writes to barConfigRef vs dialConfigRef)
 *   - persistence (persistSettings called for dial path only)
 *   - engine/config ref synchronisation
 *   - custom subdivision pruning / propagation on beat-count changes
 *   - beat-type first-cell synchronisation in handleBeatTypeChange
 *
 * The returned callbacks are identity-stable (useCallback) and safe to pass
 * directly to memoised child components.
 */

import { useCallback } from "react";
import { Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { defaultBeatTypes } from "@/app/index.helpers";
import type { BeatType } from "@/lib/metronome-engine";
import type { MetronomeEngine } from "@/lib/metronome-engine";
import type { DebouncedPersister } from "@/lib/persist";
import type { MetronomeSettings } from "@/lib/storage";

// ── Minimal config-ref shape (subset used by both barConfigRef and dialConfigRef) ──

interface BeatConfig {
  beatsPerMeasure: number;
  beatTypes: BeatType[];
  beatSubdivisions: Record<string, BeatType[]>;
}

export interface UseBeatTypeControlsParams {
  // Stable engine ref
  engineRef: React.MutableRefObject<MetronomeEngine | null>;
  // bar-vs-dial routing
  barModeRef: React.MutableRefObject<boolean>;
  barConfigRef: React.MutableRefObject<BeatConfig>;
  dialConfigRef: React.MutableRefObject<BeatConfig>;
  // Current React state values (needed for updateTimeSignature closure)
  beatsPerMeasure: number;
  beatTypes: BeatType[];
  beatSubdivisions: Record<string, BeatType[]>;
  subdivisionPattern: BeatType[];
  // React state setters (identity-stable from useState)
  setBeatsPerMeasure: React.Dispatch<React.SetStateAction<number>>;
  setBeatTypes: React.Dispatch<React.SetStateAction<BeatType[]>>;
  setBeatSubdivisions: React.Dispatch<React.SetStateAction<Record<string, BeatType[]>>>;
  // Persistence
  persistSettings: DebouncedPersister<MetronomeSettings>;
  // Rebuild active pre-rendered audio after schedule-affecting changes.
  scheduleReRender: () => void;
}

export interface UseBeatTypeControlsResult {
  /**
   * Change the beat count for the current measure.
   * Handles beat-type array resize, subdivision pruning/propagation, engine sync,
   * config-ref write and persistence (dial path only).
   */
  updateTimeSignature: (beats: number) => void;
  /**
   * Change the type of a single beat cell and synchronise the first subdivision
   * cell to match (if subdivisions exist for that beat).
   */
  handleBeatTypeChange: (index: number, type: BeatType) => void;
}

export function useBeatTypeControls(
  params: UseBeatTypeControlsParams
): UseBeatTypeControlsResult {
  const {
    engineRef,
    barModeRef,
    barConfigRef,
    dialConfigRef,
    beatsPerMeasure,
    beatTypes,
    beatSubdivisions,
    subdivisionPattern,
    setBeatsPerMeasure,
    setBeatTypes,
    setBeatSubdivisions,
    persistSettings,
    scheduleReRender,
  } = params;

  // ── updateTimeSignature ──────────────────────────────────────────────────────
  const updateTimeSignature = useCallback(
    (beats: number) => {
      beats = Math.max(1, Math.min(16, beats));
      const oldBeats = beatsPerMeasure;
      const oldTypes = beatTypes;
      const isAdding = beats > oldBeats;

      let newTypes: BeatType[];
      if (isAdding) {
        newTypes = [...oldTypes];
        for (let i = oldTypes.length; i < beats; i++) {
          newTypes.push("normal");
        }
      } else if (beats < oldBeats) {
        newTypes = oldTypes.slice(0, beats);
      } else {
        newTypes = defaultBeatTypes(beats);
      }

      setBeatsPerMeasure(beats);
      setBeatTypes(newTypes);
      engineRef.current?.setBeatsPerMeasure(beats);
      engineRef.current?.setBeatTypes(newTypes);
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }

      // Prune subdivisions for removed beats; propagate pattern to new beats in bar mode
      const cleaned: Record<string, BeatType[]> = {};
      for (const [k, v] of Object.entries(beatSubdivisions)) {
        if (Number(k) < beats) cleaned[k] = v;
      }
      if (isAdding && barModeRef.current) {
        const currentPattern = subdivisionPattern;
        for (let i = oldBeats; i < beats; i++) {
          if (
            currentPattern.length > 1 ||
            (currentPattern.length === 1 && currentPattern[0] !== "normal")
          ) {
            cleaned[String(i)] = [...currentPattern];
          }
        }
      }

      engineRef.current?.setAllBeatSubdivisions(cleaned);
      setBeatSubdivisions(cleaned);

      if (barModeRef.current) {
        barConfigRef.current.beatsPerMeasure = beats;
        barConfigRef.current.beatTypes = newTypes;
        barConfigRef.current.beatSubdivisions = cleaned;
      } else {
        dialConfigRef.current.beatsPerMeasure = beats;
        dialConfigRef.current.beatTypes = newTypes;
        dialConfigRef.current.beatSubdivisions = cleaned;
        persistSettings({ beatsPerMeasure: beats, beatSubdivisions: cleaned });
      }
      scheduleReRender();
    },
    // Intentionally mirrors the original dep array in useMetronomeScreen
    [persistSettings, beatSubdivisions, beatsPerMeasure, beatTypes, subdivisionPattern, scheduleReRender]
  );

  // ── handleBeatTypeChange ─────────────────────────────────────────────────────
  const handleBeatTypeChange = useCallback(
    (index: number, type: BeatType) => {
      setBeatTypes((prev) => {
        const next = [...prev];
        next[index] = type;
        if (barModeRef.current) {
          barConfigRef.current.beatTypes = next;
        } else {
          dialConfigRef.current.beatTypes = next;
        }
        return next;
      });

      // Synchronise the first subdivision cell with the new beat type
      setBeatSubdivisions((prev) => {
        const subs = prev[String(index)];
        if (!subs || subs.length === 0) return prev;
        const newSubs = {
          ...prev,
          [String(index)]: [type, ...subs.slice(1)] as BeatType[],
        };
        if (barModeRef.current) {
          barConfigRef.current.beatSubdivisions = newSubs;
        } else {
          dialConfigRef.current.beatSubdivisions = newSubs;
        }
        engineRef.current?.setAllBeatSubdivisions(newSubs);
        return newSubs;
      });

      const engine = engineRef.current;
      if (engine) {
        const currentTypes = [...engine.getBeatTypes()];
        currentTypes[index] = type;
        engine.setBeatTypes(currentTypes);
      }
      scheduleReRender();
    },
    [scheduleReRender]
  );

  return { updateTimeSignature, handleBeatTypeChange };
}
