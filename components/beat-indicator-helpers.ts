import type { LoopBlock, BarRepeat, BeatType } from "./beat-indicator.types";

export interface PillLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function findPillDropTarget(
  pageX: number,
  pageY: number,
  sourceIdx: number,
  layouts: Record<number, PillLayout>,
  hitSlop = 8,
): number | null {
  for (const key of Object.keys(layouts)) {
    const idx = parseInt(key, 10);
    if (idx === sourceIdx) continue;
    const l = layouts[idx];
    if (
      pageX >= l.x - hitSlop &&
      pageX <= l.x + l.w + hitSlop &&
      pageY >= l.y - hitSlop &&
      pageY <= l.y + l.h + hitSlop
    ) {
      return idx;
    }
  }
  return null;
}


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

/**
 * 드래그된 source block을 target block의 레이어로 병합.
 * - target이 이미 다른 블록의 layer면 null 반환(병합 거부).
 * - source의 startBeat~endBeat 범위 beatTypes/beatSubdivisions를 ownBeatTypes/ownSubdivisions로 캡처.
 * - source가 자식을 가지면 자식들도 새 target으로 재부착.
 */
export function mergePillToLayer(
  loopBlocks: LoopBlock[],
  sourceIdx: number,
  targetIdx: number,
  beatTypes: Record<number, BeatType>,
  beatSubdivisions: Record<string, BeatType[]>,
): LoopBlock[] | null {
  const sourceBlock = loopBlocks[sourceIdx];
  const targetBlock = loopBlocks[targetIdx];
  if (!sourceBlock || !targetBlock) return null;
  if (targetBlock.layerOf !== undefined) return null;

  const ownBT: Record<number, BeatType> = {};
  for (let b = sourceBlock.startBeat; b <= sourceBlock.endBeat; b++) {
    ownBT[b] = beatTypes[b] || "normal";
  }
  const ownSub: Record<string, BeatType[]> = {};
  for (let b = sourceBlock.startBeat; b <= sourceBlock.endBeat; b++) {
    const key = String(b);
    if (beatSubdivisions[key]) {
      ownSub[key] = [...beatSubdivisions[key]] as BeatType[];
    }
  }
  const sourceHasChildren = loopBlocks.some(b => b.layerOf === sourceIdx);
  return loopBlocks.map((b, i) => {
    if (i === sourceIdx)
      return {
        ...b,
        layerOf: targetIdx,
        jumpToBlock: undefined,
        jumpCount: undefined,
        ownBeatTypes: ownBT,
        ownSubdivisions: Object.keys(ownSub).length > 0 ? ownSub : undefined,
      };
    if (sourceHasChildren && b.layerOf === sourceIdx) return { ...b, layerOf: targetIdx };
    return b;
  });
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
