import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sortBlocksByStart,
  detectJumpDirection,
  formatJumpLabel,
  nextBlockPlayMode,
  blockPlayModeIcon,
  blockPlayModeLabel,
  isBlockPlayModeHighlighted,
  formatJumpRange,
} from "../components/loop-block-strip-utils";
import type { LoopBlock } from "../components/beat-indicator.types";

const b = (startBeat: number, endBeat: number, extra: Partial<LoopBlock> = {}): LoopBlock => ({
  startBeat,
  endBeat,
  type: "count",
  value: 1,
  ...extra,
});

test("sortBlocksByStart: startBeat 오름차순, origIndex 보존", () => {
  const blocks = [b(8, 11), b(0, 3), b(4, 7)];
  const sorted = sortBlocksByStart(blocks);
  assert.deepEqual(
    sorted.map(s => s.origIndex),
    [1, 2, 0],
  );
  assert.equal(sorted[0].block.startBeat, 0);
  assert.equal(sorted[2].block.startBeat, 8);
});

test("sortBlocksByStart: 빈 배열은 빈 배열 반환", () => {
  assert.deepEqual(sortBlocksByStart([]), []);
});

test("detectJumpDirection: jumpToBlock null/undefined → none", () => {
  const sorted = sortBlocksByStart([b(0, 3), b(4, 7)]);
  assert.equal(detectJumpDirection(sorted, 0, undefined), "none");
  assert.equal(detectJumpDirection(sorted, 0, null), "none");
});

test("detectJumpDirection: 자기 자신 또는 앞쪽 타깃 → back", () => {
  const sorted = sortBlocksByStart([b(0, 3), b(4, 7), b(8, 11)]);
  // si=2 (origIndex=2), 타깃 origIndex=0 (sortedIdx=0): 0 <= 2 → back
  assert.equal(detectJumpDirection(sorted, 2, 0), "back");
  // 자기 자신
  assert.equal(detectJumpDirection(sorted, 1, 1), "back");
});

test("detectJumpDirection: 뒤쪽 타깃 → forward", () => {
  const sorted = sortBlocksByStart([b(0, 3), b(4, 7), b(8, 11)]);
  // si=0, 타깃 origIndex=2 (sortedIdx=2): forward
  assert.equal(detectJumpDirection(sorted, 0, 2), "forward");
});

test("detectJumpDirection: 존재하지 않는 타깃 인덱스 → none", () => {
  const sorted = sortBlocksByStart([b(0, 3)]);
  assert.equal(detectJumpDirection(sorted, 0, 99), "none");
});

test("formatJumpLabel: 비재생/progressInfo 없음 → ×count 폴백", () => {
  const r = formatJumpLabel(null, false, 0, 3);
  assert.equal(r.label, "×3");
  assert.equal(r.isActive, false);
});

test("formatJumpLabel: jumpCount undefined → ×1 기본값", () => {
  const r = formatJumpLabel(null, false, 0, undefined);
  assert.equal(r.label, "×1");
});

test("formatJumpLabel: 재생 중 jumpSource 일치 + jumpTotal>0 → n/total", () => {
  const progressInfo = {
    blockIndex: 0,
    jumpSourceBlockIndex: 0,
    jumpCurrent: 1,
    jumpTotal: 4,
  } as any;
  const r = formatJumpLabel(progressInfo, true, 0, 5);
  assert.equal(r.label, "2/4");
  assert.equal(r.isActive, true);
});

test("formatJumpLabel: jumpSource 불일치 → ×count 폴백", () => {
  const progressInfo = {
    jumpSourceBlockIndex: 1,
    jumpCurrent: 0,
    jumpTotal: 4,
  } as any;
  const r = formatJumpLabel(progressInfo, true, 0, 2);
  assert.equal(r.label, "×2");
  assert.equal(r.isActive, false);
});

test("formatJumpLabel: 활성 jump + jumpCurrent undefined → 1/total", () => {
  const progressInfo = {
    jumpSourceBlockIndex: 0,
    jumpTotal: 4,
  } as any;
  const r = formatJumpLabel(progressInfo, true, 0, 9);
  assert.equal(r.label, "1/4");
  assert.equal(r.isActive, true);
});

test("sortBlocksByStart: 동일 startBeat → 안정 정렬(원래 순서 유지)", () => {
  const blocks = [b(4, 7), b(0, 3), b(0, 1), b(8, 11)];
  const sorted = sortBlocksByStart(blocks);
  // origIndex 1과 2 모두 startBeat=0 — 입력 순서대로 1, 2가 선두
  assert.equal(sorted[0].block.startBeat, 0);
  assert.equal(sorted[1].block.startBeat, 0);
  assert.deepEqual(
    sorted.map(s => s.origIndex),
    [1, 2, 0, 3],
  );
});

test("formatJumpLabel: jumpTotal 0 → ×count 폴백 (활성 아님)", () => {
  const progressInfo = {
    jumpSourceBlockIndex: 0,
    jumpCurrent: 0,
    jumpTotal: 0,
  } as any;
  const r = formatJumpLabel(progressInfo, true, 0, 3);
  assert.equal(r.label, "×3");
  assert.equal(r.isActive, false);
});

test("nextBlockPlayMode: sequential→loop→random→sequential 순환", () => {
  assert.equal(nextBlockPlayMode("sequential"), "loop");
  assert.equal(nextBlockPlayMode("loop"), "random");
  assert.equal(nextBlockPlayMode("random"), "sequential");
});

test("blockPlayModeIcon/Label: 모드별 매핑", () => {
  assert.equal(blockPlayModeIcon("sequential"), "arrow-forward");
  assert.equal(blockPlayModeIcon("loop"), "repeat");
  assert.equal(blockPlayModeIcon("random"), "shuffle");
  assert.equal(blockPlayModeLabel("sequential"), "Once");
  assert.equal(blockPlayModeLabel("loop"), "Loop");
  assert.equal(blockPlayModeLabel("random"), "Random");
});

test("isBlockPlayModeHighlighted: loop만 false, 나머지는 true", () => {
  assert.equal(isBlockPlayModeHighlighted("sequential"), true);
  assert.equal(isBlockPlayModeHighlighted("loop"), false);
  assert.equal(isBlockPlayModeHighlighted("random"), true);
});

test("formatJumpRange: 1-based, beatsPerMeasure로 클램프", () => {
  assert.equal(formatJumpRange(b(0, 3), 4), "1-4");
  // endBeat 5는 beatsPerMeasure=4를 넘으므로 4로 클램프
  assert.equal(formatJumpRange(b(0, 5), 4), "1-4");
  // 단일 비트
  assert.equal(formatJumpRange(b(2, 2), 8), "3-3");
});
