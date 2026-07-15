import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getTupletNormalCount,
  getTupletBeatScale,
  type ScoreMeasure,
  type ScoreNote,
  type ScoreRest,
} from "../lib/score-types";
import {
  findTupletForElement,
  getElementBeatScale,
  createTupletGroup,
  removeTupletGroup,
  removeElementFromTuplets,
  remapTupletsWithIdMap,
} from "../lib/score-tuplet";

function note(id: string, duration: ScoreNote["duration"] = "eighth"): ScoreNote {
  return { id, type: "note", pitch: { step: "C", octave: 4 }, duration };
}

function rest(id: string, duration: ScoreRest["duration"] = "eighth"): ScoreRest {
  return { id, type: "rest", duration };
}

function measure(elements: (ScoreNote | ScoreRest)[]): ScoreMeasure {
  return { id: "m1", elements };
}

// ── getTupletNormalCount: 표준 표기 규칙 ──────────────────────

test("getTupletNormalCount: N보다 작은 가장 큰 2의 거듭제곱을 반환한다", () => {
  assert.equal(getTupletNormalCount(2), 1);
  assert.equal(getTupletNormalCount(3), 2);
  assert.equal(getTupletNormalCount(4), 2);
  assert.equal(getTupletNormalCount(5), 4);
  assert.equal(getTupletNormalCount(6), 4);
  assert.equal(getTupletNormalCount(7), 4);
  assert.equal(getTupletNormalCount(8), 4);
  assert.equal(getTupletNormalCount(9), 8);
});

test("getTupletBeatScale: normalCount/count 비율을 반환한다", () => {
  assert.equal(getTupletBeatScale(3, 2), 2 / 3);
  assert.equal(getTupletBeatScale(5, 4), 4 / 5);
  assert.equal(getTupletBeatScale(0, 2), 1);
});

// ── createTupletGroup / findTupletForElement / getElementBeatScale ──

test("createTupletGroup: 연속 요소를 튜플렛 그룹으로 지정하면 normalCount가 자동 계산된다", () => {
  const m = measure([note("a"), note("b"), note("c"), note("d")]);
  const next = createTupletGroup(m, ["a", "b", "c"], 3);
  assert.equal(next.tuplets?.length, 1);
  const g = next.tuplets![0];
  assert.deepEqual(g.elementIds, ["a", "b", "c"]);
  assert.equal(g.count, 3);
  assert.equal(g.normalCount, 2);

  assert.ok(findTupletForElement(next, "a"));
  assert.ok(findTupletForElement(next, "b"));
  assert.equal(findTupletForElement(next, "d"), undefined);

  assert.equal(getElementBeatScale(next, "a"), 2 / 3);
  assert.equal(getElementBeatScale(next, "d"), 1); // 튜플렛 밖 요소는 스케일 1
});

test("createTupletGroup: 쉼표가 섞인 그룹도 지정 가능하다", () => {
  const m = measure([note("a"), rest("b"), note("c")]);
  const next = createTupletGroup(m, ["a", "b", "c"], 3);
  assert.equal(next.tuplets?.[0].elementIds.length, 3);
  assert.equal(getElementBeatScale(next, "b"), 2 / 3);
});

test("createTupletGroup: 겹치는 기존 그룹은 치환된다 (중첩 미지원)", () => {
  const m = measure([note("a"), note("b"), note("c"), note("d"), note("e")]);
  const withFirst = createTupletGroup(m, ["a", "b", "c"], 3);
  const withSecond = createTupletGroup(withFirst, ["b", "c", "d"], 3);
  assert.equal(withSecond.tuplets?.length, 1);
  assert.deepEqual(withSecond.tuplets![0].elementIds, ["b", "c", "d"]);
});

// ── removeTupletGroup / removeElementFromTuplets ──

test("removeTupletGroup: groupId로 그룹을 제거하면 tuplets가 undefined가 된다", () => {
  const m = measure([note("a"), note("b"), note("c")]);
  const withGroup = createTupletGroup(m, ["a", "b", "c"], 3);
  const groupId = withGroup.tuplets![0].id;
  const removed = removeTupletGroup(withGroup, groupId);
  assert.equal(removed.tuplets, undefined);
});

test("removeElementFromTuplets: 요소 삭제 시 그룹에서 제거, 1개 이하로 줄면 그룹 해제", () => {
  const m = measure([note("a"), note("b"), note("c")]);
  const withGroup = createTupletGroup(m, ["a", "b", "c"], 3);
  const afterOneRemoved = removeElementFromTuplets(withGroup, "a");
  assert.equal(afterOneRemoved.tuplets?.[0].elementIds.length, 2);

  const afterTwoRemoved = removeElementFromTuplets(afterOneRemoved, "b");
  assert.equal(afterTwoRemoved.tuplets, undefined);
});

// ── 불변식: count === elementIds.length (표기/타이밍이 실제 요소 개수와 일치해야 함) ──

test("createTupletGroup: count 인자가 elementIds.length와 달라도 실제 개수로 강제된다", () => {
  const m = measure([note("a"), note("b")]);
  // 2개만 선택했는데 count=7을 전달해도, 실제 그룹 개수(2)로 강제되어야 한다.
  const next = createTupletGroup(m, ["a", "b"], 7);
  const g = next.tuplets![0];
  assert.equal(g.count, 2);
  assert.equal(g.normalCount, getTupletNormalCount(2));
});

test("removeElementFromTuplets: 요소 삭제 후 남은 개수에 맞춰 count/normalCount가 재계산된다", () => {
  const m = measure([note("a"), note("b"), note("c"), note("d"), note("e")]);
  const withGroup = createTupletGroup(m, ["a", "b", "c", "d", "e"], 5);
  assert.equal(withGroup.tuplets![0].count, 5);
  assert.equal(withGroup.tuplets![0].normalCount, 4);

  // 5연음 중 1개 삭제 → 남은 4개는 4연음이 되어야 한다 (5연음 표기/타이밍을 그대로 유지하면 안 됨).
  const afterRemoved = removeElementFromTuplets(withGroup, "e");
  const g = afterRemoved.tuplets![0];
  assert.equal(g.elementIds.length, 4);
  assert.equal(g.count, 4);
  assert.equal(g.normalCount, getTupletNormalCount(4));
  assert.equal(getElementBeatScale(afterRemoved, "a"), getTupletBeatScale(4, 2));
});

// ── remapTupletsWithIdMap (마디 복사/붙여넣기) ──

test("remapTupletsWithIdMap: idMap 기준으로 elementIds를 재작성한다", () => {
  const m = measure([note("a"), note("b"), note("c")]);
  const withGroup = createTupletGroup(m, ["a", "b", "c"], 3);
  const idMap = new Map([
    ["a", "a2"],
    ["b", "b2"],
    ["c", "c2"],
  ]);
  const remapped = remapTupletsWithIdMap(withGroup.tuplets, idMap);
  assert.equal(remapped?.length, 1);
  assert.deepEqual(remapped![0].elementIds, ["a2", "b2", "c2"]);
  assert.notEqual(remapped![0].id, withGroup.tuplets![0].id);
});

test("remapTupletsWithIdMap: 복사 범위 밖 참조가 있으면 해당 그룹은 버려진다", () => {
  const m = measure([note("a"), note("b"), note("c")]);
  const withGroup = createTupletGroup(m, ["a", "b", "c"], 3);
  const idMap = new Map([
    ["a", "a2"],
    ["b", "b2"],
    // "c"는 복사 범위 밖 (idMap에 없음)
  ]);
  const remapped = remapTupletsWithIdMap(withGroup.tuplets, idMap);
  assert.equal(remapped, undefined);
});

test("remapTupletsWithIdMap: 원본 tuplets가 없으면 undefined를 반환한다", () => {
  const idMap = new Map([["a", "a2"]]);
  assert.equal(remapTupletsWithIdMap(undefined, idMap), undefined);
});
