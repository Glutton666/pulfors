import { useCallback } from "react";
import type { BeatType, MetronomeEngine } from "@/lib/metronome-engine";
import type { DebouncedPersister } from "@/lib/persist";
import type { MetronomeSettings } from "@/lib/storage";

interface BeatStaffConfig {
  beatsPerMeasure: number;
  beatTypes: BeatType[];
  beatSubdivisions: Record<string, BeatType[]>;
}

interface Params {
  engineRef: React.MutableRefObject<MetronomeEngine | null>;
  barModeRef: React.MutableRefObject<boolean>;
  barConfigRef: React.MutableRefObject<BeatStaffConfig>;
  dialConfigRef: React.MutableRefObject<BeatStaffConfig>;
  beatTypes: BeatType[];
  beatSubdivisions: Record<string, BeatType[]>;
  setBeatsPerMeasure: React.Dispatch<React.SetStateAction<number>>;
  setBeatTypes: React.Dispatch<React.SetStateAction<BeatType[]>>;
  setBeatSubdivisions: React.Dispatch<React.SetStateAction<Record<string, BeatType[]>>>;
  persistSettings: DebouncedPersister<MetronomeSettings>;
  scheduleReRender: () => void;
}

export function useBeatStaffControls({
  engineRef, barModeRef, barConfigRef, dialConfigRef, beatTypes, beatSubdivisions,
  setBeatsPerMeasure, setBeatTypes, setBeatSubdivisions, persistSettings, scheduleReRender,
}: Params) {
  const handleBeatStaffDelete = useCallback((index: number) => {
    if (index < 0 || index >= beatTypes.length || beatTypes.length <= 1) return;
    const nextTypes = beatTypes.filter((_, i) => i !== index);
    const nextSubs: Record<string, BeatType[]> = {};
    Object.entries(beatSubdivisions).forEach(([key, value]) => {
      const old = Number(key);
      if (old < index) nextSubs[key] = value;
      else if (old > index) nextSubs[String(old - 1)] = value;
    });
    setBeatsPerMeasure(nextTypes.length);
    setBeatTypes(nextTypes);
    setBeatSubdivisions(nextSubs);
    engineRef.current?.setBeatsPerMeasure(nextTypes.length);
    engineRef.current?.setBeatTypes(nextTypes);
    engineRef.current?.setAllBeatSubdivisions(nextSubs);
    dialConfigRef.current.beatsPerMeasure = nextTypes.length;
    dialConfigRef.current.beatTypes = nextTypes;
    dialConfigRef.current.beatSubdivisions = nextSubs;
    persistSettings({ beatsPerMeasure: nextTypes.length, beatSubdivisions: nextSubs });
    scheduleReRender();
  }, [
    beatTypes, beatSubdivisions, dialConfigRef, engineRef, persistSettings,
    scheduleReRender, setBeatSubdivisions, setBeatTypes, setBeatsPerMeasure,
  ]);

  const applyBeatStaffSubdivision = useCallback((target: number, pattern: BeatType[]) => {
    const newSubs = { ...beatSubdivisions };
    if (pattern.length) newSubs[String(target)] = [...pattern];
    else delete newSubs[String(target)];
    setBeatSubdivisions(newSubs);
    engineRef.current?.setBeatSubdivision(target, pattern.length ? pattern : null);

    if (pattern.length && pattern[0] !== "mute") {
      const firstType = pattern[0];
      setBeatTypes((prev) => {
        const next = [...prev];
        next[target] = firstType;
        if (barModeRef.current) barConfigRef.current.beatTypes = next;
        else dialConfigRef.current.beatTypes = next;
        const engine = engineRef.current;
        if (engine) {
          const engineTypes = [...engine.getBeatTypes()];
          engineTypes[target] = firstType;
          engine.setBeatTypes(engineTypes);
        }
        return next;
      });
    }
    if (barModeRef.current) barConfigRef.current.beatSubdivisions = { ...newSubs };
    else dialConfigRef.current.beatSubdivisions = { ...newSubs };
    persistSettings({ beatSubdivisions: newSubs });
  }, [
    barConfigRef, barModeRef, beatSubdivisions, dialConfigRef, engineRef,
    persistSettings, setBeatSubdivisions, setBeatTypes,
  ]);

  return { handleBeatStaffDelete, applyBeatStaffSubdivision };
}