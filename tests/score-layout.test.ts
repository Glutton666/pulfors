import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutMeasure } from "../lib/score-layout";
import type { ScoreMeasure, ScoreNote, ScoreRest } from "../lib/score-types";

// ── 픽스처 ────────────────────────────────────────────────────

function note(id: string, duration: ScoreNote["duration"] = "quarter", octave = 4): ScoreNote {
  return {
    id,
    type: "note",
    pitch: { step: "C", octave },
    duration,
  };
}

function rest(id: string, duration: ScoreRest["duration"] = "quarter"): ScoreRest {
  return { id, type: "rest", duration };
}

function measure(id: string, elements: ScoreMeasure["elements"]): ScoreMeasure {
  return { id, elements };
}

// ── 순차 레이아웃 (오버라이드 없음) ───────────────────────────

test("layoutMeasure: 오버라이드가 없으면 순차 배치된다", () => {
  const m = measure("m1", [note("n1"), note("n2"), note("n3")]);
  const positions = layoutMeasure(m, 0, "treble", 200);
  assert.equal(positions.length, 3);
  // 순차 배치이므로 x가 증가하는 순서로 정렬되어 있어야 함
  assert.ok(positions[0].x < positions[1].x);
  assert.ok(positions[1].x < positions[2].x);
});

// ── 오버라이드 배치 ────────────────────────────────────────────

test("layoutMeasure: 오버라이드된 요소는 저장된 X 좌표(중심 기준)를 그대로 사용한다", () => {
  const m = measure("m1", [note("n1"), note("n2")]);
  const overrides = { n1: 50, n2: 10 };
  const positions = layoutMeasure(m, 0, "treble", 200, overrides);
  const p1 = positions.find((p) => p.elementId === "n1")!;
  const p2 = positions.find((p) => p.elementId === "n2")!;
  assert.equal(p1.x, 50);
  assert.equal(p2.x, 10);
});

test("layoutMeasure: startX가 오버라이드 좌표에 더해진다", () => {
  const m = measure("m1", [note("n1")]);
  const overrides = { n1: 30 };
  const positions = layoutMeasure(m, 100, "treble", 200, overrides);
  assert.equal(positions[0].x, 130);
});

test("layoutMeasure: 오버라이드 없는 요소는 순차 레이아웃 위치로 fallback된다", () => {
  const m = measure("m1", [note("n1"), note("n2"), note("n3")]);
  // n2만 자유 배치됨 — n1, n3은 fallback
  const overrides = { n2: 5 };
  const positions = layoutMeasure(m, 0, "treble", 200, overrides);
  const p2 = positions.find((p) => p.elementId === "n2")!;
  assert.equal(p2.x, 5);
  // fallback 요소들도 계속 위치를 가짐 (순차 배치에서 계산된 값)
  const p1 = positions.find((p) => p.elementId === "n1")!;
  const p3 = positions.find((p) => p.elementId === "n3")!;
  assert.ok(p1.x > 0);
  assert.ok(p3.x > p1.x);
});

// ── 겹침 방지 제거 확인 ─────────────────────────────────────────

test("layoutMeasure: 겹침 방지 로직이 제거되어 같은 X에 겹쳐서 배치된다", () => {
  const m = measure("m1", [note("n1", "quarter", 4), note("n2", "quarter", 5)]);
  // 두 음표를 정확히 같은 X에 배치 (서로 다른 음높이지만 근접) — 예전에는 밀어냈지만 이제는 그대로 겹침
  const overrides = { n1: 40, n2: 40 };
  const positions = layoutMeasure(m, 0, "treble", 200, overrides);
  const p1 = positions.find((p) => p.elementId === "n1")!;
  const p2 = positions.find((p) => p.elementId === "n2")!;
  assert.equal(p1.x, 40);
  assert.equal(p2.x, 40);
});

test("layoutMeasure: 화음처럼 같은 X, 다른 Y도 그대로 유지된다", () => {
  const m = measure("m1", [note("n1", "quarter", 4), note("n2", "quarter", 4)]);
  const overrides = { n1: 60, n2: 60 };
  const positions = layoutMeasure(m, 0, "treble", 200, overrides);
  const p1 = positions.find((p) => p.elementId === "n1")!;
  const p2 = positions.find((p) => p.elementId === "n2")!;
  assert.equal(p1.x, p2.x);
});

test("layoutMeasure: 쉼표도 오버라이드된 X를 사용한다", () => {
  const m = measure("m1", [rest("r1")]);
  const overrides = { r1: 77 };
  const positions = layoutMeasure(m, 0, "treble", 200, overrides);
  assert.equal(positions[0].x, 77);
});

test("layoutMeasure: 빈 마디는 빈 배열을 반환한다", () => {
  const m = measure("m1", []);
  const positions = layoutMeasure(m, 0, "treble", 200, { n1: 10 });
  assert.deepEqual(positions, []);
});
