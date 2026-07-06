import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultBeatTypes,
  isCompoundMeterBeatCount,
  getCompoundGroupStarts,
  isSafeNoteSampleUri,
  createInitialDialConfig,
  createInitialBarConfig,
  createShuffledIndices,
  adjustShuffledIndicesOnInsert,
  appendShuffledIndexOnAdd,
  applyQueueInsert,
  beatSubdivisionCounts,
  selectCurrentBarConfig,
  computeLandscapeStats,
  type CurrentBarConfigInput,
} from "../app/index.helpers";

const mkPracticeLog = (timestamp: number, mode: "dial" | "bar", duration: number) => ({
  id: String(timestamp),
  timestamp,
  type: "practice_session" as const,
  data: { mode, duration, bpm: 120 },
});

test("computeLandscapeStats: 빈 로그는 0 반환", () => {
  const r = computeLandscapeStats([], new Date("2026-05-03T12:00:00Z"));
  assert.deepEqual(r, { todayTotal: 0, todayBeat: 0, todayBar: 0, weekTotal: 0 });
});

test("computeLandscapeStats: practice_session 외 타입 무시", () => {
  const now = new Date("2026-05-03T12:00:00Z");
  const logs = [
    { id: "1", timestamp: now.getTime() - 1000, type: "feature_usage" as const, data: { feature: "x" as any } },
  ];
  const r = computeLandscapeStats(logs as any, now);
  assert.equal(r.todayTotal, 0);
});

test("computeLandscapeStats: dial/bar 모드별 분리 + 합계", () => {
  const now = new Date("2026-05-03T12:00:00Z");
  const todayMs = now.getTime();
  const logs = [
    mkPracticeLog(todayMs - 60_000, "dial", 100),
    mkPracticeLog(todayMs - 30_000, "bar", 200),
    mkPracticeLog(todayMs - 10_000, "dial", 50),
  ];
  const r = computeLandscapeStats(logs as any, now);
  assert.equal(r.todayBeat, 150);
  assert.equal(r.todayBar, 200);
  assert.equal(r.todayTotal, 350);
  assert.equal(r.weekTotal, 350);
});

test("computeLandscapeStats: 어제 로그는 todayTotal 제외, weekTotal 포함", () => {
  const now = new Date("2026-05-03T12:00:00Z"); // 일요일
  const yesterday = new Date("2026-05-02T12:00:00Z").getTime();
  const logs = [mkPracticeLog(yesterday, "dial", 500)];
  const r = computeLandscapeStats(logs as any, now);
  assert.equal(r.todayTotal, 0);
  assert.equal(r.weekTotal, 500);
});

test("computeLandscapeStats: 월요일 시작 — 일요일은 이전 주", () => {
  // 2026-05-03 = 일요일. 이번 주 시작 = 2026-04-27 (월). 그래서 04-26(일)은 제외
  const now = new Date("2026-05-03T12:00:00Z");
  const lastSunday = new Date("2026-04-26T12:00:00Z").getTime();
  const thisWeekMon = new Date("2026-04-27T12:00:00Z").getTime();
  const logs = [
    mkPracticeLog(lastSunday, "dial", 100),
    mkPracticeLog(thisWeekMon, "bar", 200),
  ];
  const r = computeLandscapeStats(logs as any, now);
  assert.equal(r.weekTotal, 200);
});

test("computeLandscapeStats: duration 누락 시 0으로 처리", () => {
  const now = new Date("2026-05-03T12:00:00Z");
  const logs = [{
    id: "1",
    timestamp: now.getTime() - 1000,
    type: "practice_session" as const,
    data: { mode: "dial", bpm: 120 } as any,
  }];
  const r = computeLandscapeStats(logs as any, now);
  assert.equal(r.todayTotal, 0);
});

test("defaultBeatTypes: first beat is accent, rest normal", () => {
  assert.deepEqual(defaultBeatTypes(4), ["accent", "normal", "normal", "normal"]);
});

test("defaultBeatTypes: zero beats returns empty array", () => {
  assert.deepEqual(defaultBeatTypes(0), []);
});

test("defaultBeatTypes: single beat is accent", () => {
  assert.deepEqual(defaultBeatTypes(1), ["accent"]);
});

test("defaultBeatTypes: 7-beat measure", () => {
  const r = defaultBeatTypes(7);
  assert.equal(r.length, 7);
  assert.equal(r[0], "accent");
  assert.equal(r[6], "normal");
});

test("isCompoundMeterBeatCount: only 6, 9, 12 are compound", () => {
  assert.equal(isCompoundMeterBeatCount(6), true);
  assert.equal(isCompoundMeterBeatCount(9), true);
  assert.equal(isCompoundMeterBeatCount(12), true);
  assert.equal(isCompoundMeterBeatCount(3), false);
  assert.equal(isCompoundMeterBeatCount(4), false);
  assert.equal(isCompoundMeterBeatCount(8), false);
  assert.equal(isCompoundMeterBeatCount(15), false);
});

test("getCompoundGroupStarts: groups of 3 for compound counts", () => {
  assert.deepEqual(getCompoundGroupStarts(6), [0, 3]);
  assert.deepEqual(getCompoundGroupStarts(9), [0, 3, 6]);
  assert.deepEqual(getCompoundGroupStarts(12), [0, 3, 6, 9]);
  assert.deepEqual(getCompoundGroupStarts(4), []);
});

test("defaultBeatTypes: 6/8 groups into 2 dotted-quarter beats (strong, accent)", () => {
  assert.deepEqual(defaultBeatTypes(6), ["strong", "normal", "normal", "accent", "normal", "normal"]);
});

test("defaultBeatTypes: 9/8 groups into 3 dotted-quarter beats", () => {
  assert.deepEqual(defaultBeatTypes(9), [
    "strong", "normal", "normal",
    "accent", "normal", "normal",
    "accent", "normal", "normal",
  ]);
});

test("defaultBeatTypes: 12/8 groups into 4 dotted-quarter beats", () => {
  assert.deepEqual(defaultBeatTypes(12), [
    "strong", "normal", "normal",
    "accent", "normal", "normal",
    "accent", "normal", "normal",
    "accent", "normal", "normal",
  ]);
});

test("defaultBeatTypes: simple meters with beat count divisible by 3 stay unaffected unless 6/9/12 (e.g. 3-beat)", () => {
  assert.deepEqual(defaultBeatTypes(3), ["accent", "normal", "normal"]);
});

test("isSafeNoteSampleUri: rejects http/https (SSRF prevention)", () => {
  assert.equal(isSafeNoteSampleUri("http://evil.com/a.wav"), false);
  assert.equal(isSafeNoteSampleUri("https://evil.com/a.wav"), false);
});

test("isSafeNoteSampleUri: rejects http with fragment", () => {
  assert.equal(isSafeNoteSampleUri("http://evil.com/a.wav#frag"), false);
});

test("isSafeNoteSampleUri: accepts file:// on native (Platform.OS !== 'web' in node test)", () => {
  // node test env reports Platform.OS as native-like; file:// always allowed
  assert.equal(isSafeNoteSampleUri("file:///tmp/sample.wav"), true);
});

test("isSafeNoteSampleUri: rejects unknown scheme", () => {
  assert.equal(isSafeNoteSampleUri("ftp://server/a.wav"), false);
  assert.equal(isSafeNoteSampleUri("javascript:alert(1)"), false);
});

test("createInitialDialConfig: default 4 beats with accent first", () => {
  const c = createInitialDialConfig();
  assert.equal(c.beatsPerMeasure, 4);
  assert.deepEqual(c.beatTypes, ["accent", "normal", "normal", "normal"]);
  assert.deepEqual(c.beatSubdivisions, {});
  assert.deepEqual(c.noteSamples, {});
});

test("createInitialDialConfig: custom beats", () => {
  const c = createInitialDialConfig(6);
  assert.equal(c.beatsPerMeasure, 6);
  assert.equal(c.beatTypes.length, 6);
});

test("createInitialBarConfig: defaults", () => {
  const c = createInitialBarConfig();
  assert.equal(c.beatsPerMeasure, 4);
  assert.equal(c.barClockMode, "stopwatch");
  assert.equal(c.barTimerDuration, 180);
  assert.equal(c.barLoopMode, "once");
  assert.equal(c.blockPlayMode, "loop");
  assert.equal(c.hasBeenConfigured, false);
  assert.deepEqual(c.loopBlocks, []);
  assert.deepEqual(c.barRepeats, {});
});

test("createInitialBarConfig: independent instances (no shared mutable state)", () => {
  const a = createInitialBarConfig();
  const b = createInitialBarConfig();
  a.loopBlocks.push({ startBeat: 0, endBeat: 1, type: "count", value: 1 });
  assert.equal(b.loopBlocks.length, 0);
  a.barRepeats[0] = { type: "count", value: 2 };
  assert.equal(Object.keys(b.barRepeats).length, 0);
});

test("createShuffledIndices: length 0 returns empty", () => {
  assert.deepEqual(createShuffledIndices(0), []);
});

test("createShuffledIndices: length 1 returns [0]", () => {
  assert.deepEqual(createShuffledIndices(1), [0]);
});

test("createShuffledIndices: result is permutation of 0..n-1", () => {
  const r = createShuffledIndices(7);
  assert.equal(r.length, 7);
  assert.deepEqual([...r].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6]);
});

test("createShuffledIndices: deterministic exact output with RNG=0", () => {
  // Fisher-Yates with j=0 each step on [0,1,2,3]:
  //   i=3, swap(3,0) → [3,1,2,0]
  //   i=2, swap(2,0) → [2,1,3,0]
  //   i=1, swap(1,0) → [1,2,3,0]
  assert.deepEqual(createShuffledIndices(4, () => 0), [1, 2, 3, 0]);
});

test("createShuffledIndices: deterministic with injected RNG=0.999 (max j)", () => {
  // Math.floor(0.999 * (i+1)) = i; swaps with self → identity
  const r = createShuffledIndices(5, () => 0.999);
  assert.deepEqual(r, [0, 1, 2, 3, 4]);
});

test("adjustShuffledIndicesOnInsert: shifts indices >= insertedIdx and inserts at pos+1", () => {
  // queue: [A, B, C], shuffled order: [2, 0, 1] (current pos=0 → playing C)
  // insert X at queueIdx=1 → new queue: [A, X, B, C]
  // expected: 2→3 (C shift), 0→0 (A stay), 1→2 (B shift), then insert 1 at pos+1=1
  const r = adjustShuffledIndicesOnInsert([2, 0, 1], 0, 1);
  assert.deepEqual(r, [3, 1, 0, 2]);
});

test("adjustShuffledIndicesOnInsert: does not mutate input", () => {
  const input = [2, 0, 1];
  adjustShuffledIndicesOnInsert(input, 0, 1);
  assert.deepEqual(input, [2, 0, 1]);
});

test("adjustShuffledIndicesOnInsert: empty indices", () => {
  assert.deepEqual(adjustShuffledIndicesOnInsert([], 0, 0), [0]);
});

test("adjustShuffledIndicesOnInsert: insert at end (pos = last)", () => {
  const r = adjustShuffledIndicesOnInsert([0, 1, 2], 2, 3);
  assert.deepEqual(r, [0, 1, 2, 3]);
});

test("appendShuffledIndexOnAdd: appends new index at end", () => {
  const r = appendShuffledIndexOnAdd([2, 0, 1], 3);
  assert.deepEqual(r, [2, 0, 1, 3]);
});

test("appendShuffledIndexOnAdd: returns input when index already present", () => {
  const input = [2, 0, 1];
  const r = appendShuffledIndexOnAdd(input, 1);
  assert.equal(r, input);
});

test("appendShuffledIndexOnAdd: empty indices → single element", () => {
  assert.deepEqual(appendShuffledIndexOnAdd([], 0), [0]);
});

test("appendShuffledIndexOnAdd: does not mutate input", () => {
  const input = [2, 0, 1];
  appendShuffledIndexOnAdd(input, 3);
  assert.deepEqual(input, [2, 0, 1]);
});

// applyQueueInsert: Note 모드 큐 삽입 + currentIndex 보정 (Task #65)

test("applyQueueInsert: append (insertAt = queue.length) — currentIndex 변하지 않음", () => {
  const r = applyQueueInsert(["a", "b", "c"], 1, [], 0, "once", 3, "d");
  assert.deepEqual(r.queue, ["a", "b", "c", "d"]);
  assert.equal(r.currentIndex, 1);
});

test("applyQueueInsert: 삽입 위치 < currentIndex — currentIndex가 +1 보정되어 같은 항목을 가리킨다", () => {
  // 현재 'c' (index 2)를 재생 중. 'a' 앞(index 0)에 'X' 삽입.
  const r = applyQueueInsert(["a", "b", "c"], 2, [], 0, "once", 0, "X");
  assert.deepEqual(r.queue, ["X", "a", "b", "c"]);
  assert.equal(r.currentIndex, 3, "현재 인덱스가 +1 보정되어 여전히 'c'를 가리켜야 함");
  assert.equal(r.queue[r.currentIndex], "c");
});

test("applyQueueInsert: 삽입 위치 == currentIndex — currentIndex가 +1 보정", () => {
  const r = applyQueueInsert(["a", "b", "c"], 1, [], 0, "once", 1, "X");
  assert.deepEqual(r.queue, ["a", "X", "b", "c"]);
  assert.equal(r.currentIndex, 2);
  assert.equal(r.queue[r.currentIndex], "b");
});

test("applyQueueInsert: 삽입 위치 > currentIndex — currentIndex 그대로", () => {
  const r = applyQueueInsert(["a", "b", "c"], 1, [], 0, "once", 2, "X");
  assert.deepEqual(r.queue, ["a", "b", "X", "c"]);
  assert.equal(r.currentIndex, 1);
  assert.equal(r.queue[r.currentIndex], "b");
});

test("applyQueueInsert: currentIndex = -1 (재생 중 아님) — 보정 없음", () => {
  const r = applyQueueInsert(["a", "b"], -1, [], 0, "once", 0, "X");
  assert.deepEqual(r.queue, ["X", "a", "b"]);
  assert.equal(r.currentIndex, -1);
});

test("applyQueueInsert: random + append — shuffled에 새 인덱스만 추가", () => {
  const r = applyQueueInsert(["a", "b", "c"], 0, [0, 2, 1], 0, "random", 3, "d");
  assert.deepEqual(r.shuffledIndices, [0, 2, 1, 3]);
  assert.equal(r.currentIndex, 0);
});

test("applyQueueInsert: random + 중간 삽입 — shuffled 인덱스 시프트 + 현재 인덱스 보정", () => {
  // 큐 [a,b,c], shuffled=[2,0,1], pos=0 (현재 c=index 2 재생 중, ci=2).
  // index 1에 X 삽입. 큐 [a,X,b,c]. 현재 c는 이제 index 3.
  const r = applyQueueInsert(["a", "b", "c"], 2, [2, 0, 1], 0, "random", 1, "X");
  assert.deepEqual(r.queue, ["a", "X", "b", "c"]);
  assert.equal(r.currentIndex, 3);
  assert.equal(r.queue[r.currentIndex], "c");
  // shuffled: 기존 인덱스 >= 1 은 +1로 시프트되어 [3,0,2], 그리고 pos+1=1 자리에 새 인덱스 1이 삽입
  assert.deepEqual(r.shuffledIndices, [3, 1, 0, 2]);
});

test("applyQueueInsert: 빈 큐 + insert at 0", () => {
  const r = applyQueueInsert<string>([], -1, [], 0, "once", 0, "first");
  assert.deepEqual(r.queue, ["first"]);
  assert.equal(r.currentIndex, -1);
});

test("applyQueueInsert: insertAt 음수는 0으로 클램프", () => {
  const r = applyQueueInsert(["a", "b"], 1, [], 0, "once", -5, "X");
  assert.deepEqual(r.queue, ["X", "a", "b"]);
  assert.equal(r.currentIndex, 2);
});

test("applyQueueInsert: insertAt > queue.length는 append로 처리", () => {
  const r = applyQueueInsert(["a", "b"], 0, [], 0, "once", 99, "X");
  assert.deepEqual(r.queue, ["a", "b", "X"]);
  assert.equal(r.currentIndex, 0);
});

test("applyQueueInsert: 입력 배열을 변형하지 않는다", () => {
  const queue = ["a", "b", "c"];
  const shuffled = [2, 0, 1];
  applyQueueInsert(queue, 1, shuffled, 0, "random", 1, "X");
  assert.deepEqual(queue, ["a", "b", "c"]);
  assert.deepEqual(shuffled, [2, 0, 1]);
});

test("beatSubdivisionCounts: empty map", () => {
  assert.deepEqual(beatSubdivisionCounts({}), {});
});

test("beatSubdivisionCounts: maps string keys to numeric, counts arrays", () => {
  assert.deepEqual(
    beatSubdivisionCounts({ "0": ["a", "b"], "2": ["x"], "5": [] }),
    { 0: 2, 2: 1, 5: 0 },
  );
});

function baseInput(barMode: boolean): CurrentBarConfigInput {
  return {
    barMode,
    bpm: 120,
    beatsPerMeasure: 4,
    beatTypes: ["accent", "normal", "normal", "normal"],
    beatSubdivisions: { "0": ["accent", "normal"] },
    barRepeats: { 0: { type: "count", value: 2 } },
    loopBlocks: [{ startBeat: 0, endBeat: 3, type: "count", value: 4 }],
    barLoopMode: "once",
    blockPlayMode: "loop",
    subdivisionPattern: ["accent", "normal"],
    noteSamples: { C4: "file:///c4.wav" },
    noteSampleNames: { C4: "C4 sample" },
    noteSampleSources: { C4: "recording" },
    noteSampleChannels: { C4: "both" },
    dialConfig: createInitialDialConfig(3),
    barClockMode: "stopwatch",
    barTimerDuration: 180,
  };
}

test("selectCurrentBarConfig: barMode=true returns live bar state", () => {
  const out = selectCurrentBarConfig(baseInput(true));
  assert.equal(out.mode, "bar");
  assert.equal(out.beatsPerMeasure, 4);
  assert.deepEqual(out.beatTypes, ["accent", "normal", "normal", "normal"]);
  assert.equal(out.barClockMode, "stopwatch");
  assert.equal(out.barTimerDuration, 180);
  assert.equal(out.loopBlocks.length, 1);
});

test("selectCurrentBarConfig: barMode=false returns dial-derived state", () => {
  const out = selectCurrentBarConfig(baseInput(false));
  assert.equal(out.mode, "beat");
  assert.equal(out.beatsPerMeasure, 3); // from dialConfig (created with 3)
  assert.deepEqual(out.barRepeats, {});
  assert.deepEqual(out.loopBlocks, []);
  assert.equal(out.barLoopMode, "once");
  assert.equal(out.blockPlayMode, "loop");
  assert.equal(out.barClockMode, undefined);
});

test("selectCurrentBarConfig: returned containers are independent clones", () => {
  const input = baseInput(true);
  const out = selectCurrentBarConfig(input);
  out.beatTypes.push("accent");
  out.barRepeats[99] = { type: "count", value: 9 };
  out.loopBlocks.push({ startBeat: 5, endBeat: 6, type: "count", value: 1 });
  // Original input unchanged
  assert.equal(input.beatTypes.length, 4);
  assert.equal(input.barRepeats[99], undefined);
  assert.equal(input.loopBlocks.length, 1);
});

test("selectCurrentBarConfig: subdivisionPattern always cloned regardless of mode", () => {
  const inA = baseInput(true);
  const outA = selectCurrentBarConfig(inA);
  outA.subdivisionPattern.push("normal");
  assert.equal(inA.subdivisionPattern.length, 2);
  const inB = baseInput(false);
  const outB = selectCurrentBarConfig(inB);
  outB.subdivisionPattern.push("normal");
  assert.equal(inB.subdivisionPattern.length, 2);
});

test("selectCurrentBarConfig: barMode preserves bpm regardless of dialConfig", () => {
  const input = baseInput(true);
  input.bpm = 75;
  input.dialConfig.beatsPerMeasure = 7;
  const out = selectCurrentBarConfig(input);
  assert.equal(out.bpm, 75);
  assert.equal(out.beatsPerMeasure, 4); // from input.beatsPerMeasure, not dialConfig
});
