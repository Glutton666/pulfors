/**
 * LoopBlockStrip(Compact/Detailed) 공용 순수 헬퍼.
 * UI 의존 없음 — 단위 테스트 가능.
 */
import type { LoopBlock, BlockPlayMode } from "./beat-indicator.types";
import type { ProgressInfo } from "@/lib/metronome-engine";

export interface SortedBlockEntry {
  block: LoopBlock;
  origIndex: number;
}

export function sortBlocksByStart(loopBlocks: LoopBlock[]): SortedBlockEntry[] {
  return loopBlocks
    .map((b, i) => ({ block: b, origIndex: i }))
    .sort((a, b) => a.block.startBeat - b.block.startBeat);
}

export type JumpDirection = "none" | "back" | "forward";

export function detectJumpDirection(
  sorted: SortedBlockEntry[],
  currentSortedIdx: number,
  jumpToBlock: number | undefined | null,
): JumpDirection {
  if (jumpToBlock === undefined || jumpToBlock === null) return "none";
  const targetSortedIdx = sorted.findIndex(s => s.origIndex === jumpToBlock);
  if (targetSortedIdx < 0) return "none";
  return targetSortedIdx <= currentSortedIdx ? "back" : "forward";
}

export interface JumpLabelResult {
  label: string;
  isActive: boolean;
}

/**
 * jump 라벨 계산. 재생 중이고 현재 블록이 jump source면 n/total,
 * 아니면 ×count 폴백.
 */
export function formatJumpLabel(
  progressInfo: ProgressInfo | null | undefined,
  isPlaying: boolean,
  origIndex: number,
  jumpCount: number | undefined,
): JumpLabelResult {
  const isActive =
    isPlaying &&
    !!progressInfo &&
    progressInfo.jumpSourceBlockIndex === origIndex &&
    (progressInfo.jumpTotal ?? 0) > 0;
  if (isActive && progressInfo) {
    return {
      label: `${(progressInfo.jumpCurrent ?? 0) + 1}/${progressInfo.jumpTotal}`,
      isActive: true,
    };
  }
  return { label: `×${jumpCount || 1}`, isActive: false };
}

const BLOCK_PLAY_MODE_NEXT: Record<BlockPlayMode, BlockPlayMode> = {
  sequential: "loop",
  loop: "random",
  random: "sequential",
};

export function nextBlockPlayMode(mode: BlockPlayMode): BlockPlayMode {
  return BLOCK_PLAY_MODE_NEXT[mode];
}

export function blockPlayModeIcon(mode: BlockPlayMode): "arrow-forward" | "repeat" | "shuffle" {
  if (mode === "sequential") return "arrow-forward";
  if (mode === "loop") return "repeat";
  return "shuffle";
}

export function blockPlayModeLabel(mode: BlockPlayMode): "Once" | "Loop" | "Random" {
  if (mode === "sequential") return "Once";
  if (mode === "loop") return "Loop";
  return "Random";
}

export function isBlockPlayModeHighlighted(mode: BlockPlayMode): boolean {
  return mode !== "loop";
}

/**
 * jump target 의 비트 범위 라벨. 끝 비트는 beatsPerMeasure를 넘지 않도록 클램프.
 */
export function formatJumpRange(
  jumpTarget: LoopBlock,
  beatsPerMeasure: number,
): string {
  return `${jumpTarget.startBeat + 1}-${Math.min(jumpTarget.endBeat + 1, beatsPerMeasure)}`;
}
