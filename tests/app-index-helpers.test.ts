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
  type CurrentBarConfigInput,
} from "../app/index.helpers";

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
