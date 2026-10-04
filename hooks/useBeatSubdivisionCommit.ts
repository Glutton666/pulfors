import { useCallback, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { BeatType, MetronomeEngine } from "@/lib/metronome-engine";
import type { BarConfig, DialConfig } from "@/lib/bar-config-helpers";
import type { MetronomeSettings } from "@/lib/storage";
import { circularPatternBeatType } from "@/lib/circular-subdivision";

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
  setBeatTypes: Dispatch<SetStateAction<BeatType[]>>;
  setBeatSubdivisions: Dispatch<SetStateAction<Record<string, BeatType[]>>>;
  persistSettings: (settings?: Partial<MetronomeSettings>) => void;
  scheduleReRender: () => void;
}

/** One per-beat commit boundary shared by existing editors and circular input. */
export function useBeatSubdivisionCommit({
  beatSubdivisions, beatTypes, barModeRef, barConfigRef, dialConfigRef,
  engineRef, activeModeRef, isPlayingRef, isPreparingRef, setBeatTypes,
  setBeatSubdivisions, persistSettings, scheduleReRender,
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
    // Align the override first: a previous S/M must not promote or silence the
    // newly authored pattern (a leading M retains only its own silent slot).
    const nextTypes = [...dialConfigRef.current.beatTypes];
    nextTypes[beatIndex] = circularPatternBeatType(pattern);
    dialConfigRef.current.beatTypes = nextTypes;
    setBeatTypes(nextTypes);
    engineRef.current?.setBeatTypes(nextTypes);
    handleBeatSubdivisionChange(beatIndex, pattern);
    persistSettings({ beatTypes: nextTypes });
  }, [activeModeRef, isPlayingRef, isPreparingRef, dialConfigRef, setBeatTypes,
    engineRef, handleBeatSubdivisionChange, persistSettings]);

  return { handleBeatSubdivisionChange, handleCircularSubdivisionCommit };
}