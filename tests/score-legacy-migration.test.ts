import { test } from "node:test";
import assert from "node:assert/strict";
import { migrateLegacyLayoutOverrides } from "../lib/score-types";
import type { ScoreDocument, ScoreMeasure, ScoreNote, ScorePart } from "../lib/score-types";

// ── 픽스처 ────────────────────────────────────────────────────

function legacyNote(id: string, placedX?: number): ScoreNote & { placedX?: number } {
  const n: ScoreNote & { placedX?: number } = {
    id,
    type: "note",
    pitch: { step: "C", octave: 4 },
    duration: "quarter",
  };
  if (placedX !== undefined) n.placedX = placedX;
  return n;
}

function measure(id: string, elements: ScoreMeasure["elements"]): ScoreMeasure {
  return { id, elements };
}

function part(id: string, measures: ScoreMeasure[]): ScorePart {
  return { id, instrumentId: "piano", clef: "treble", measures };
}

function doc(parts: ScorePart[], layoutOverrides?: ScoreDocument["layoutOverrides"]): ScoreDocument {
  return {
    id: "doc-1",
    metadata: { title: "Test", createdAt: 0, updatedAt: 0 },
    parts,
    keySignature: { sharps: 0 },
    timeSignature: { numerator: 4, denominator: 4 },
    bpm: 120,
    layoutOverrides,
  };
}

// ── 마이그레이션 ────────────────────────────────────────────────

test("migrateLegacyLayoutOverrides: 레거시 placedX가 있으면 layoutOverrides로 이동한다", () => {
  const d = doc([part("p1", [measure("m1", [legacyNote("n1", 42)])])]);
  const migrated = migrateLegacyLayoutOverrides(d);
  assert.equal(migrated.layoutOverrides?.["m1"]?.["n1"], 42);
  // 원본 요소에서 placedX 필드가 제거되어야 함
  const el = migrated.parts[0].measures[0].elements[0] as ScoreNote & { placedX?: number };
  assert.equal(el.placedX, undefined);
});

test("migrateLegacyLayoutOverrides: placedX가 없으면 문서를 그대로 반환한다 (동일 참조)", () => {
  const d = doc([part("p1", [measure("m1", [legacyNote("n1")])])]);
  const migrated = migrateLegacyLayoutOverrides(d);
  assert.equal(migrated, d);
});

test("migrateLegacyLayoutOverrides: 기존 layoutOverrides와 병합된다", () => {
  const d = doc(
    [part("p1", [measure("m1", [legacyNote("n1", 10), legacyNote("n2")])])],
    { m1: { existing: 99 } },
  );
  const migrated = migrateLegacyLayoutOverrides(d);
  assert.equal(migrated.layoutOverrides?.["m1"]?.["existing"], 99);
  assert.equal(migrated.layoutOverrides?.["m1"]?.["n1"], 10);
});

test("migrateLegacyLayoutOverrides: placedX가 0인 요소도 올바르게 이동된다", () => {
  const d = doc([part("p1", [measure("m1", [legacyNote("n1", 0)])])]);
  const migrated = migrateLegacyLayoutOverrides(d);
  assert.equal(migrated.layoutOverrides?.["m1"]?.["n1"], 0);
});

test("migrateLegacyLayoutOverrides: 여러 마디/파트에 걸친 레거시 데이터를 모두 이동한다", () => {
  const d = doc([
    part("p1", [
      measure("m1", [legacyNote("n1", 5)]),
      measure("m2", [legacyNote("n2", 15)]),
    ]),
  ]);
  const migrated = migrateLegacyLayoutOverrides(d);
  assert.equal(migrated.layoutOverrides?.["m1"]?.["n1"], 5);
  assert.equal(migrated.layoutOverrides?.["m2"]?.["n2"], 15);
});
