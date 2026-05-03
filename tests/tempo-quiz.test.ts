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

test("clampBpmGuess: clamps to 20..300 and rounds", () => {
  assert.equal(clampBpmGuess(0), 20);
  assert.equal(clampBpmGuess(19), 20);
  assert.equal(clampBpmGuess(120.7), 121);
  assert.equal(clampBpmGuess(301), 300);
  assert.equal(clampBpmGuess(NaN), 60);
});
