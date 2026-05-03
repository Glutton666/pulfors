import type { LoopBlock, BarRepeat } from "./beat-indicator.types";

export function getLayerCountForBeat(
  beat: number,
  loopBlocks: LoopBlock[],
  beatsPerMeasure: number,
): number {
  for (let i = 0; i < loopBlocks.length; i++) {
    const b = loopBlocks[i];
    if (b.layerOf !== undefined) continue;
    if (beat >= b.startBeat && beat <= Math.min(b.endBeat, beatsPerMeasure - 1)) {
      let count = 0;
      for (let j = 0; j < loopBlocks.length; j++) {
        if (loopBlocks[j].layerOf === i) count++;
      }
      return count;
    }
  }
  return 0;
}

export function formatRepeat(r: BarRepeat): string {
  let label = "";
  if (r.type === "count") {
    label = `\u00D7${r.value}`;
  } else {
    const totalSec = r.value;
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    if (m > 0) label = s > 0 ? `${m}'${s.toString().padStart(2, "0")}"` : `${m}'`;
    else label = `${s}"`;
  }
  if (r.bpm) label += ` ${r.bpm}`;
  return label;
}
