import { test } from "node:test";
import assert from "node:assert/strict";
import type { PracticeEntry } from "../lib/storage";
import {
  loadCurrentStageSetlist,
  pruneStageKeyMappings,
  reconcileStageSetlist,
} from "../lib/stage-practice-sync";

function entry(id: string, label: string): PracticeEntry {
  return {
    id,
    label,
    createdAt: 1,
    bpm: 120,
    beatsPerMeasure: 4,
    beatTypes: ["strong", "normal", "normal", "normal"],
    beatSubdivisions: {},
    barRepeats: {},
    subdivisionPattern: ["strong"],
    barLoopMode: "loop",
  };
}

test("연습장 변경 사항을 중복 슬롯 ID를 유지한 채 셋리스트에 반영", () => {
  const saved = [entry("a__slot__1", "Old")];
  const result = reconcileStageSetlist(saved, [entry("a", "New")]);

  assert.equal(result[0]!.id, "a__slot__1");
  assert.equal(result[0]!.label, "New");
});

test("삭제 항목은 제거하되 재생 중인 슬롯은 현재 스냅샷을 유지", () => {
  const active = entry("a__slot__1", "Playing");
  const deleted = entry("b__slot__2", "Deleted");

  const result = reconcileStageSetlist([active, deleted], [], active.id);

  assert.deepEqual(result, [active]);
  assert.strictEqual(result[0], active);
});

test("재생이 끝나면 연습장에서 삭제된 활성 슬롯도 제거", () => {
  const active = entry("a__slot__1", "Finished");

  assert.deepEqual(reconcileStageSetlist([active], []), []);
});

test("연습장이 먼저 준비되고 셋리스트가 늦게 로드돼도 최신 상태로 조정", async () => {
  let resolveSaved!: (entries: PracticeEntry[]) => void;
  const savedPromise = new Promise<PracticeEntry[]>((resolve) => {
    resolveSaved = resolve;
  });
  let current = {
    practiceBook: [] as PracticeEntry[],
    practiceBookReady: false,
  };

  const resultPromise = loadCurrentStageSetlist(
    () => savedPromise,
    () => current,
  );
  current = {
    practiceBook: [entry("kept", "Latest")],
    practiceBookReady: true,
  };
  resolveSaved([
    entry("kept__slot__1", "Stale"),
    entry("deleted__slot__2", "Deleted"),
  ]);

  const result = await resultPromise;
  assert.deepEqual(result, [entry("kept__slot__1", "Latest")]);
});

test("삭제된 연습장 항목의 무대 단축키 매핑만 정리", () => {
  const result = pruneStageKeyMappings(
    { "1": "kept", "2": "deleted", "3": undefined },
    [entry("kept", "Kept")],
  );

  assert.deepEqual(result, { "1": "kept" });
});