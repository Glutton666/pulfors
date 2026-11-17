import type { BarRepeat, LoopBlock } from "@/components/beat-indicator.types";

/** Resolve read-only information without changing the bar selected for editing. */
export function getBarPlaybackInfo({
  currentBeat, beatsPerMeasure, isPreparing, barRepeats, beatSubdivisions,
  bpm = 120, soundSet = "classic", loopBlocks,
}: {
  currentBeat: number;
  beatsPerMeasure: number;
  isPreparing: boolean;
  barRepeats: Record<number, BarRepeat>;
  beatSubdivisions: Record<string, unknown[]>;
  bpm?: number;
  soundSet?: string;
  loopBlocks: LoopBlock[];
}) {
  const sourceBeat = !isPreparing && Number.isInteger(currentBeat) &&
    currentBeat >= 0 && currentBeat < beatsPerMeasure ? currentBeat : null;
  const repeat = sourceBeat === null ? null : barRepeats[sourceBeat] ?? null;
  const blocks = sourceBeat === null ? [] : loopBlocks
    .filter(block => block.layerOf === undefined && block.startBeat <= sourceBeat && block.endBeat >= sourceBeat)
    .sort((a, b) => (a.endBeat - a.startBeat) - (b.endBeat - b.startBeat));
  const block = blocks[0];
  return {
    sourceBeat,
    repeat,
    subdivisionCount: sourceBeat === null ? 1 : (beatSubdivisions[String(sourceBeat)]?.length || 1),
    bpm: repeat?.bpm ?? blocks.find(candidate => candidate.bpm !== undefined)?.bpm ?? bpm,
    soundSet: block?.soundSet ?? soundSet,
  };
}
