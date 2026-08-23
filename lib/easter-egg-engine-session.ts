import type { BeatType, MetronomeEngine } from "@/lib/metronome-engine";

type EasterEggEngine = Pick<
  MetronomeEngine,
  | "getBpm"
  | "getBeatsPerMeasure"
  | "getBeatTypes"
  | "getAllBeatSubdivisions"
  | "getLoopBlocks"
  | "getBlockPlayMode"
  | "getAllBarRepeats"
  | "getBarBpmOverrides"
  | "setBpm"
  | "setBeatsPerMeasure"
  | "setBeatTypes"
  | "setAllBeatSubdivisions"
  | "setLoopBlocks"
  | "setBlockPlayMode"
  | "setAllBarRepeats"
  | "setAllBarBpmOverrides"
  | "clearLoopBlocks"
  | "clearBarRepeats"
  | "clearBarBpmOverrides"
>;

export interface EasterEggBarEngineSnapshot {
  bpm: number;
  beatsPerMeasure: number;
  beatTypes: BeatType[];
  beatSubdivisions: Record<string, BeatType[]>;
  loopBlocks: ReturnType<MetronomeEngine["getLoopBlocks"]>;
  blockPlayMode: ReturnType<MetronomeEngine["getBlockPlayMode"]>;
  barRepeats: ReturnType<MetronomeEngine["getAllBarRepeats"]>;
  barBpmOverrides: ReturnType<MetronomeEngine["getBarBpmOverrides"]>;
}

export function prepareEasterEggEngine(
  engine: EasterEggEngine,
  randomBpm: number,
  eggBeatTypes: BeatType[],
  preserveBarState: boolean,
): EasterEggBarEngineSnapshot | null {
  const snapshot = preserveBarState
    ? {
        bpm: engine.getBpm(),
        beatsPerMeasure: engine.getBeatsPerMeasure(),
        beatTypes: engine.getBeatTypes(),
        beatSubdivisions: engine.getAllBeatSubdivisions(),
        loopBlocks: engine.getLoopBlocks(),
        blockPlayMode: engine.getBlockPlayMode(),
        barRepeats: engine.getAllBarRepeats(),
        barBpmOverrides: engine.getBarBpmOverrides(),
      }
    : null;

  engine.setBpm(randomBpm);
  engine.setBeatsPerMeasure(1);
  engine.setBeatTypes(eggBeatTypes);
  engine.setAllBeatSubdivisions({});

  if (snapshot) {
    engine.clearLoopBlocks();
    engine.clearBarRepeats();
    engine.clearBarBpmOverrides();
  }

  return snapshot;
}

export function restoreEasterEggBarEngine(
  engine: EasterEggEngine,
  snapshot: EasterEggBarEngineSnapshot,
): void {
  engine.setBpm(snapshot.bpm);
  engine.setBeatsPerMeasure(snapshot.beatsPerMeasure);
  engine.setBeatTypes(snapshot.beatTypes);
  engine.setAllBeatSubdivisions(snapshot.beatSubdivisions);
  engine.setLoopBlocks(snapshot.loopBlocks);
  engine.setBlockPlayMode(snapshot.blockPlayMode);
  engine.setAllBarRepeats(snapshot.barRepeats);
  engine.setAllBarBpmOverrides(snapshot.barBpmOverrides);
}

/**
 * Restores the active bar session without discarding the optional BPM the user
 * chose for their normal beat-mode settings.
 */
export function completeEasterEggBarSession(
  engine: EasterEggEngine,
  snapshot: EasterEggBarEngineSnapshot,
  actualBpm: number,
  applyToBeatMode: boolean,
  updateBeatModeBpm: (bpm: number) => void,
): void {
  if (applyToBeatMode) updateBeatModeBpm(actualBpm);
  restoreEasterEggBarEngine(engine, snapshot);
}