import type { BeatType, MetronomeEngine } from "@/lib/metronome-engine";

/**
 * The subset of the beat-mode snapshot needed to fully replace bar-owned
 * schedule state in the metronome engine.
 */
export interface DialEngineConfig {
  beatsPerMeasure: number;
  beatTypes: BeatType[];
  beatSubdivisions: Record<string, BeatType[]>;
}

type DialEngine = Pick<
  MetronomeEngine,
  | "setBeatsPerMeasure"
  | "setBeatTypes"
  | "setAllBeatSubdivisions"
  | "clearLoopBlocks"
  | "clearBarRepeats"
  | "clearBarBpmOverrides"
  | "setBlockPlayMode"
>;

/**
 * Establishes a hard boundary before beat-mode playback. Bar-specific
 * scheduling state must never survive a mode change or full reset.
 */
export function applyDialConfigToEngine(engine: DialEngine, config: DialEngineConfig): void {
  engine.setBeatsPerMeasure(config.beatsPerMeasure);
  engine.setBeatTypes([...config.beatTypes]);
  engine.setAllBeatSubdivisions(
    Object.fromEntries(
      Object.entries(config.beatSubdivisions).map(([key, pattern]) => [key, [...pattern]]),
    ),
  );
  engine.clearLoopBlocks();
  engine.clearBarRepeats();
  engine.clearBarBpmOverrides();
  engine.setBlockPlayMode("loop");
}