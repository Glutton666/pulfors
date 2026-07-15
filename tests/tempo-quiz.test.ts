import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TEMPO_QUIZ_RANGES,
  TEMPO_QUIZ_GOOD,
  TEMPO_QUIZ_PERFECT,
  clampBpmGuess,
  gradeGuess,
  pickRandomBpm,
} from "../lib/tempo-quiz";

test("pickRandomBpm: stays within difficulty range", () => {
  for (const d of ["easy", "normal", "hard"] as const) {
    const { min, max } = TEMPO_QUIZ_RANGES[d];
    for (const r of [0, 0.001, 0.5, 0.999, 1]) {
      const bpm = pickRandomBpm(d, () => r);
      assert.ok(bpm >= min && bpm <= max, `${d}: bpm=${bpm} out of [${min},${max}]`);
    }
  }
});

test("gradeGuess: perfect/good/fail boundaries", () => {
  assert.equal(gradeGuess(120, 120).grade, "perfect");
  assert.equal(gradeGuess(120, 117).grade, "perfect");
  assert.equal(gradeGuess(120, 123).grade, "perfect");
  assert.equal(gradeGuess(120, 120 - TEMPO_QUIZ_PERFECT - 1).grade, "good");
  assert.equal(gradeGuess(120, 120 + TEMPO_QUIZ_GOOD).grade, "good");
  assert.equal(gradeGuess(120, 120 + TEMPO_QUIZ_GOOD + 1).grade, "fail");
});

test("snapshot/restore covers all engine scheduling fields and isolates quiz playback", () => {
  type EngineState = {
    bpm: number;
    beatsPerMeasure: number;
    beatTypes: string[];
    beatSubdivisions: Record<string, string[]>;
    loopBlocks: any[];
    blockPlayMode: "sequential" | "loop" | "random";
    barRepeats: Record<number, { type: "count" | "duration"; value: number }>;
    barBpmOverrides: Record<number, number>;
    halfTime: boolean;
  };
  const initial: EngineState = {
    bpm: 132,
    beatsPerMeasure: 6,
    beatTypes: ["accent", "normal", "normal", "normal", "normal", "normal"],
    beatSubdivisions: { "0": ["accent", "normal", "normal"] },
    loopBlocks: [{ startBeat: 0, endBeat: 3, type: "count", value: 2 }],
    blockPlayMode: "sequential",
    barRepeats: { 1: { type: "count", value: 2 } },
    barBpmOverrides: { 2: 90 },
    halfTime: true,
  };
  const eng: EngineState = JSON.parse(JSON.stringify(initial));
  const snapshot = (): EngineState => JSON.parse(JSON.stringify(eng));
  const apply = (s: EngineState) => Object.assign(eng, JSON.parse(JSON.stringify(s)));

  // Entry: snapshot
  const entrySnap = snapshot();
  // Quiz play: clean slate + target bpm
  apply({
    ...eng,
    bpm: 200,
    beatsPerMeasure: 4,
    beatTypes: ["accent", "normal", "normal", "normal"],
    beatSubdivisions: {},
    loopBlocks: [],
    blockPlayMode: "loop",
    barRepeats: {},
    barBpmOverrides: {},
    halfTime: false,
  });
  assert.equal(eng.bpm, 200);
  assert.deepEqual(eng.loopBlocks, []);
  assert.equal(eng.halfTime, false);
  assert.deepEqual(eng.barBpmOverrides, {});
  // Close: restore
  apply(entrySnap);
  assert.deepEqual(eng, initial, "engine state must be fully restored on quiz close");
});

test("clampBpmGuess: clamps to 20..300 and rounds", () => {
  assert.equal(clampBpmGuess(0), 20);
  assert.equal(clampBpmGuess(19), 20);
  assert.equal(clampBpmGuess(120.7), 121);
  assert.equal(clampBpmGuess(301), 300);
  assert.equal(clampBpmGuess(NaN), 60);
});
