import { useCallback, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { BeatType, MetronomeEngine } from "@/lib/metronome-engine";
import type { BarConfig, DialConfig } from "@/lib/bar-config-helpers";
import type { MetronomeSettings } from "@/lib/storage";
import { insertCircularBeat, MAX_CIRCULAR_BEATS } from "@/lib/circular-beat-insertion";

interface Options {
  beatSubdivisions: Record<string, BeatType[]>;
  beatTypes: BeatType[];
  barModeRef: RefObject<boolean>;
  barConfigRef: RefObject<BarConfig>;
  dialConfigRef: RefObject<DialConfig>;
  engineRef: RefObject<MetronomeEngine | null>;
  activeModeRef: RefObject<string>;
  isPlayingRef: RefObject<boolean>;
  isPreparingRef: RefObject<boolean>;
  setBeatsPerMeasure: Dispatch<SetStateAction<number>>;
  onInsertBeatSamples: (insertAt: number) => void;
  onBeatLimit: () => void;
  setBeatTypes: Dispatch<SetStateAction<BeatType[]>>;
  setBeatSubdivisions: Dispatch<SetStateAction<Record<string, BeatType[]>>>;
  persistSettings: (settings?: Partial<MetronomeSettings>) => void;
  scheduleReRender: () => void;
}

/** Existing editors replace patterns; circular input inserts a new beat. */
export function useBeatSubdivisionCommit({
  beatSubdivisions, beatTypes, barModeRef, barConfigRef, dialConfigRef,
  engineRef, activeModeRef, isPlayingRef, isPreparingRef, setBeatTypes,
  setBeatSubdivisions, persistSettings, scheduleReRender,
  setBeatsPerMeasure, onInsertBeatSamples, onBeatLimit,
}: Options) {
  const handleBeatSubdivisionChange = useCallback(
    (beatIndex: number, pattern: BeatType[] | null) => {
      const newSubs = { ...beatSubdivisions };
      if (pattern && pattern.length > 1) {
        newSubs[String(beatIndex)] = pattern;
        engineRef.current?.setBeatSubdivision(beatIndex, pattern);
      } else if (pattern?.length === 1) {
        // One note is the beat's accent, not a subdivision.
        delete newSubs[String(beatIndex)];
        engineRef.current?.setBeatSubdivision(beatIndex, null);
        const nextTypes = [...beatTypes];
        nextTypes[beatIndex] = pattern[0];
        setBeatTypes(nextTypes);
        if (barModeRef.current) barConfigRef.current.beatTypes = nextTypes;
        else dialConfigRef.current.beatTypes = nextTypes;
        engineRef.current?.setBeatTypes(nextTypes);
      } else {
        delete newSubs[String(beatIndex)];
        engineRef.current?.setBeatSubdivision(beatIndex, null);
      }
      setBeatSubdivisions(newSubs);
      if (barModeRef.current) {
        barConfigRef.current.beatSubdivisions = newSubs;
      } else {
        dialConfigRef.current.beatSubdivisions = newSubs;
        persistSettings({
          beatSubdivisions: newSubs,
          ...(pattern?.length === 1 ? { beatTypes: dialConfigRef.current.beatTypes } : {}),
        });
      }
      scheduleReRender();
    },
    [beatSubdivisions, beatTypes, barModeRef, barConfigRef, dialConfigRef, engineRef,
      setBeatTypes, setBeatSubdivisions, persistSettings, scheduleReRender],
  );

  const handleCircularSubdivisionCommit = useCallback((beatIndex: number, pattern: BeatType[]) => {
    if (activeModeRef.current !== "beat" || isPlayingRef.current || isPreparingRef.current) return;
    const config = dialConfigRef.current;
    if (config.beatsPerMeasure >= MAX_CIRCULAR_BEATS) { onBeatLimit(); return; }
    const next = insertCircularBeat(config, beatIndex, pattern);
    if (!next) return;
    onInsertBeatSamples(beatIndex + 1);
    Object.assign(config, next);
    setBeatsPerMeasure(next.beatsPerMeasure);
    setBeatTypes(next.beatTypes);
    setBeatSubdivisions(next.beatSubdivisions);
    engineRef.current?.setBeatsPerMeasure(next.beatsPerMeasure);
    engineRef.current?.setBeatTypes(next.beatTypes);
    engineRef.current?.setAllBeatSubdivisions(next.beatSubdivisions);
    persistSettings(next);
    scheduleReRender();
  }, [activeModeRef, isPlayingRef, isPreparingRef, dialConfigRef, setBeatTypes,
    engineRef, persistSettings, setBeatSubdivisions, setBeatsPerMeasure, onInsertBeatSamples,
    onBeatLimit, scheduleReRender]);

  return { handleBeatSubdivisionChange, handleCircularSubdivisionCommit };
}