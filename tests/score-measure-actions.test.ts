import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildMeasureLongPressButtons,
  deleteMeasureFromDoc,
  setMeasureKeySignature,
  type MeasureAlertButton,
} from "../lib/score-measure-actions";
import type { ScoreDocument, ScoreMeasure, ScorePart } from "../lib/score-types";

// ── 픽스처 ────────────────────────────────────────────────────

function measure(id: string, linkedPracticeEntryId?: string): ScoreMeasure {
  return { id, elements: [], linkedPracticeEntryId };
}

function part(id: string, measures: ScoreMeasure[]): ScorePart {
  return { id, instrumentId: "piano", clef: "treble", measures };
}

function doc(parts: ScorePart[]): ScoreDocument {
  return {
    id: "doc-1",
    metadata: { title: "Test", createdAt: 0, updatedAt: 0 },
    parts,
    keySignature: { sharps: 0 },
    timeSignature: { numerator: 4, denominator: 4 },
    bpm: 120,
  };
}

const LABELS = { editLinkEntry: "연결 편집", clearLink: "연결 해제", delete: "삭제", cancel: "취소" };

function pressButton(buttons: MeasureAlertButton[], text: string) {
  const btn = buttons.find((b) => b.text === text);
  assert.ok(btn, `button "${text}" should exist`);
  btn!.onPress?.();
}

// ── buildMeasureLongPressButtons: Alert 버튼 구성 ────────────

test("롱프레스: 링크 없는 마디 → [연결 편집, 삭제, 취소] 3개 버튼", () => {
  const m = measure("m1");
  const buttons = buildMeasureLongPressButtons({
    measure: m,
    measureIdx: 0,
    labels: LABELS,
    onEditLinkEntry: () => {},
    onClearLink: () => {},
    onDelete: () => {},
  });
  assert.equal(buttons.length, 3);
  assert.deepEqual(buttons.map((b) => b.text), ["연결 편집", "삭제", "취소"]);
});

test("롱프레스: 링크 있는 마디 → [연결 편집, 연결 해제, 삭제, 취소] 4개 버튼", () => {
  const m = measure("m1", "entry-123");
  const buttons = buildMeasureLongPressButtons({
    measure: m,
    measureIdx: 0,
    labels: LABELS,
    onEditLinkEntry: () => {},
    onClearLink: () => {},
    onDelete: () => {},
  });
  assert.equal(buttons.length, 4);
  assert.deepEqual(buttons.map((b) => b.text), ["연결 편집", "연결 해제", "삭제", "취소"]);
});

test("롱프레스: 삭제 버튼은 destructive 스타일, 취소 버튼은 cancel 스타일", () => {
  const buttons = buildMeasureLongPressButtons({
    measure: measure("m1"),
    measureIdx: 2,
    labels: LABELS,
    onEditLinkEntry: () => {},
    onClearLink: () => {},
    onDelete: () => {},
  });
  const del = buttons.find((b) => b.text === "삭제");
  const cancel = buttons.find((b) => b.text === "취소");
  assert.equal(del?.style, "destructive");
  assert.equal(cancel?.style, "cancel");
});

// ── "삭제" 버튼 동작: onDelete가 올바른 measureIdx로 호출되는지 ──

test("롱프레스 → 삭제 선택: onDelete가 정확한 measureIdx로 1회 호출됨", () => {
  let calledWith: number | null = null;
  let callCount = 0;
  const buttons = buildMeasureLongPressButtons({
    measure: measure("m1"),
    measureIdx: 3,
    labels: LABELS,
    onEditLinkEntry: () => {},
    onClearLink: () => {},
    onDelete: (idx) => {
      calledWith = idx;
      callCount++;
    },
  });
  pressButton(buttons, "삭제");
  assert.equal(calledWith, 3);
  assert.equal(callCount, 1);
});

// ── "취소" 버튼 동작: 아무 것도 호출되지 않아야 함 ──────────────

test("롱프레스 → 취소 선택: onDelete/onEditLinkEntry/onClearLink 모두 호출되지 않음", () => {
  let deleteCalled = false;
  let editCalled = false;
  let clearCalled = false;
  const buttons = buildMeasureLongPressButtons({
    measure: measure("m1", "entry-1"),
    measureIdx: 0,
    labels: LABELS,
    onEditLinkEntry: () => { editCalled = true; },
    onClearLink: () => { clearCalled = true; },
    onDelete: () => { deleteCalled = true; },
  });
  const cancelBtn = buttons.find((b) => b.text === "취소");
  assert.ok(cancelBtn);
  const cancelOnPress: (() => void) | undefined = cancelBtn!.onPress;
  assert.ok(cancelOnPress === undefined);
  if (cancelOnPress) (cancelOnPress as () => void)();
  assert.equal(deleteCalled, false);
  assert.equal(editCalled, false);
  assert.equal(clearCalled, false);
});

// ── deleteMeasureFromDoc: 실제 문서에서 마디 제거 ───────────────

test("deleteMeasureFromDoc: 선택한 마디가 모든 파트에서 제거됨", () => {
  const d = doc([
    part("p1", [measure("m0"), measure("m1"), measure("m2")]),
  ]);
  const result = deleteMeasureFromDoc(d, 0, 1);
  assert.equal(result.parts[0]!.measures.length, 2);
  assert.deepEqual(result.parts[0]!.measures.map((m) => m.id), ["m0", "m2"]);
});

test("deleteMeasureFromDoc: 여러 파트가 있으면 모두 동일 인덱스에서 제거됨", () => {
  const d = doc([
    part("p1", [measure("a0"), measure("a1")]),
    part("p2", [measure("b0"), measure("b1")]),
  ]);
  const result = deleteMeasureFromDoc(d, 0, 0);
  assert.deepEqual(result.parts[0]!.measures.map((m) => m.id), ["a1"]);
  assert.deepEqual(result.parts[1]!.measures.map((m) => m.id), ["b1"]);
});

test("deleteMeasureFromDoc: 마디가 1개뿐이면 삭제되지 않고 원본 doc 그대로 반환", () => {
  const d = doc([part("p1", [measure("only")])]);
  const result = deleteMeasureFromDoc(d, 0, 0);
  assert.equal(result, d);
  assert.equal(result.parts[0]!.measures.length, 1);
});

test("deleteMeasureFromDoc: 존재하지 않는 파트 인덱스면 원본 doc 그대로 반환", () => {
  const d = doc([part("p1", [measure("m0"), measure("m1")])]);
  const result = deleteMeasureFromDoc(d, 5, 0);
  assert.equal(result, d);
});

// ── 통합: 마디 롱프레스 → Alert → 삭제 선택 → 문서에서 제거 확인 ──

test("통합: 롱프레스 → 삭제 선택 → 실제 문서에서 마디가 사라짐", () => {
  const d = doc([part("p1", [measure("m0"), measure("m1"), measure("m2")])]);
  let currentDoc = d;

  const buttons = buildMeasureLongPressButtons({
    measure: currentDoc.parts[0]!.measures[1]!,
    measureIdx: 1,
    labels: LABELS,
    onEditLinkEntry: () => {},
    onClearLink: () => {},
    onDelete: (idx) => {
      currentDoc = deleteMeasureFromDoc(currentDoc, 0, idx);
    },
  });

  pressButton(buttons, "삭제");

  assert.equal(currentDoc.parts[0]!.measures.length, 2);
  assert.deepEqual(currentDoc.parts[0]!.measures.map((m) => m.id), ["m0", "m2"]);
});

// ── setMeasureKeySignature: 마디별 조표 변경 ─────────────────────

test("setMeasureKeySignature: 지정한 마디의 keySignature가 설정됨", () => {
  const d = doc([part("p1", [measure("m0"), measure("m1"), measure("m2")])]);
  const result = setMeasureKeySignature(d, 0, 1, 2);
  assert.deepEqual(result.parts[0]!.measures[1]!.keySignature, { sharps: 2 });
  assert.equal(result.parts[0]!.measures[0]!.keySignature, undefined);
  assert.equal(result.parts[0]!.measures[2]!.keySignature, undefined);
});

test("setMeasureKeySignature: 다른 파트는 영향받지 않음", () => {
  const d = doc([
    part("p1", [measure("a0"), measure("a1")]),
    part("p2", [measure("b0"), measure("b1")]),
  ]);
  const result = setMeasureKeySignature(d, 0, 0, -3);
  assert.deepEqual(result.parts[0]!.measures[0]!.keySignature, { sharps: -3 });
  assert.equal(result.parts[1]!.measures[0]!.keySignature, undefined);
});

test("setMeasureKeySignature: 기존 조표를 새 값으로 덮어씀", () => {
  const d = doc([part("p1", [{ ...measure("m0"), keySignature: { sharps: 1 } }])]);
  const result = setMeasureKeySignature(d, 0, 0, -5);
  assert.deepEqual(result.parts[0]!.measures[0]!.keySignature, { sharps: -5 });
});

test("setMeasureKeySignature: 존재하지 않는 파트 인덱스면 원본 doc 그대로 반환", () => {
  const d = doc([part("p1", [measure("m0")])]);
  const result = setMeasureKeySignature(d, 5, 0, 3);
  assert.equal(result, d);
});

test("setMeasureKeySignature: 존재하지 않는 마디 인덱스면 원본 doc 그대로 반환", () => {
  const d = doc([part("p1", [measure("m0")])]);
  const result = setMeasureKeySignature(d, 0, 9, 3);
  assert.equal(result, d);
});

test("통합: 롱프레스 → 취소 선택 → 문서가 그대로 유지됨", () => {
  const d = doc([part("p1", [measure("m0"), measure("m1"), measure("m2")])]);
  let currentDoc = d;

  const buttons = buildMeasureLongPressButtons({
    measure: currentDoc.parts[0]!.measures[1]!,
    measureIdx: 1,
    labels: LABELS,
    onEditLinkEntry: () => {},
    onClearLink: () => {},
    onDelete: (idx) => {
      currentDoc = deleteMeasureFromDoc(currentDoc, 0, idx);
    },
  });

  const cancelBtn = buttons.find((b) => b.text === "취소");
  cancelBtn!.onPress?.();

  assert.equal(currentDoc, d);
  assert.equal(currentDoc.parts[0]!.measures.length, 3);
});
