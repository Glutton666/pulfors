import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultBeatTypes,
  isSafeNoteSampleUri,
  createInitialDialConfig,
  createInitialBarConfig,
  createShuffledIndices,
  adjustShuffledIndicesOnInsert,
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
