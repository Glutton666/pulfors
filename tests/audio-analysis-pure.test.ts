/**
 * Parity tests for lib/audio-analysis-pure.ts
 *
 * Goals:
 *  1. Verify frequencyToNote / pickDominantFreq / detectBpmCandidatesFromSamples
 *     produce identical results whether called directly from the shared module
 *     or injected into an eval-mode Worker via .toString().
 *  2. Provide focused unit coverage for each exported function.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";
import {
  frequencyToNote,
  pickDominantFreq,
  detectBpmCandidatesFromSamples,
} from "../lib/audio-analysis-pure";

// ---------------------------------------------------------------------------
// frequencyToNote unit tests
// ---------------------------------------------------------------------------

describe("frequencyToNote", () => {
  test("A4 (440 Hz) → name=A, octave=4, cents=0", () => {
    const r = frequencyToNote(440);
    assert.equal(r.name, "A");
    assert.equal(r.octave, 4);
    assert.equal(r.cents, 0);
  });

  test("C4 (≈261.63 Hz) → name=C, octave=4", () => {
    const r = frequencyToNote(261.63);
    assert.equal(r.name, "C");
    assert.equal(r.octave, 4);
    assert.ok(Math.abs(r.cents) <= 1);
  });

  test("A5 (880 Hz) → name=A, octave=5, cents=0", () => {
    const r = frequencyToNote(880);
    assert.equal(r.name, "A");
    assert.equal(r.octave, 5);
    assert.equal(r.cents, 0);
  });

  test("slightly sharp (445 Hz) → name=A, octave=4, positive cents", () => {
    const r = frequencyToNote(445);
    assert.equal(r.name, "A");
    assert.equal(r.octave, 4);
    assert.ok(r.cents > 0 && r.cents < 30);
  });

  test("matches lib/signal-analysis.ts frequencyToNote for common notes", async () => {
    // Import the client-side version and compare results.
    // It lives in a React-Native module that imports @/lib/logger, so we
    // cannot import it in a Node test runner.  Instead we verify the
    // algorithm parity by checking a hand-known round-trip against standard
    // equal-temperament values.
    const knownPairs: [number, string, number][] = [
      [261.63, "C", 4],
      [293.66, "D", 4],
      [329.63, "E", 4],
      [349.23, "F", 4],
      [392.00, "G", 4],
      [440.00, "A", 4],
      [493.88, "B", 4],
    ];
    for (const [freq, name, octave] of knownPairs) {
      const r = frequencyToNote(freq);
      assert.equal(r.name, name, `freq ${freq}: expected ${name}, got ${r.name}`);
      assert.equal(r.octave, octave, `freq ${freq}: expected octave ${octave}, got ${r.octave}`);
    }
  });
});

// ---------------------------------------------------------------------------
// pickDominantFreq unit tests
// ---------------------------------------------------------------------------

describe("pickDominantFreq", () => {
  test("empty array → null", () => {
    assert.equal(pickDominantFreq([]), null);
  });

  test("single reading → that reading", () => {
    const result = pickDominantFreq([440]);
    // Median of [440] is 440
    assert.equal(result, 440);
  });

  test("multiple identical notes → median of those frequencies", () => {
    // Three readings all quantise to A4
    const result = pickDominantFreq([438, 440, 442]);
    // sorted: [438, 440, 442], median index 1 → 440
    assert.equal(result, 440);
  });

  test("mixed notes → returns median of modal note group", () => {
    // A4 appears 3 times, C4 appears 1 time → A4 wins
    const readings = [440, 261.63, 440.5, 439.5];
    const result = pickDominantFreq(readings);
    assert.ok(result !== null);
    // Result should be in A4 range
    const info = frequencyToNote(result!);
    assert.equal(info.name, "A");
    assert.equal(info.octave, 4);
  });

  test("tie in note count → one of the tied notes is returned (not null)", () => {
    // A4 and C4 each appear twice
    const result = pickDominantFreq([440, 440, 261.63, 261.63]);
    assert.ok(result !== null);
  });
});

// ---------------------------------------------------------------------------
// detectBpmCandidatesFromSamples unit tests
// ---------------------------------------------------------------------------

function makeImpulseSamples(sampleRate: number, durationSec: number, bpm: number): Float32Array {
  const numSamples = Math.floor(sampleRate * durationSec);
  const samples = new Float32Array(numSamples);
  const samplesPerBeat = Math.round(sampleRate * 60 / bpm);
  for (let s = 0; s < numSamples; s += samplesPerBeat) {
    samples[s] = 1.0;
    if (s + 1 < numSamples) samples[s + 1] = 0.5;
    if (s + 2 < numSamples) samples[s + 2] = 0.2;
  }
  return samples;
}

describe("detectBpmCandidatesFromSamples", () => {
  test("empty samples → []", () => {
    assert.deepStrictEqual(detectBpmCandidatesFromSamples(new Float32Array(0), 44100), []);
  });

  test("too-short samples (< 8 frames) → []", () => {
    assert.deepStrictEqual(detectBpmCandidatesFromSamples(new Float32Array(100), 44100), []);
  });

  test("silence → [] (no onset → bestCorr=0)", () => {
    const silence = new Float32Array(44100 * 3);
    assert.deepStrictEqual(detectBpmCandidatesFromSamples(silence, 44100), []);
  });

  test("120 BPM impulse → at least 1 candidate", () => {
    const samples = makeImpulseSamples(44100, 3, 120);
    const candidates = detectBpmCandidatesFromSamples(samples, 44100);
    assert.ok(candidates.length >= 1, `no candidates: ${JSON.stringify(candidates)}`);
  });

  test("all candidates are in [50, 250] BPM range", () => {
    const samples = makeImpulseSamples(44100, 3, 150);
    const candidates = detectBpmCandidatesFromSamples(samples, 44100);
    for (const bpm of candidates) {
      assert.ok(bpm >= 50 && bpm <= 250, `candidate ${bpm} out of range`);
    }
  });

  test("candidates are unique integers", () => {
    const samples = makeImpulseSamples(44100, 3, 100);
    const candidates = detectBpmCandidatesFromSamples(samples, 44100);
    const unique = new Set(candidates);
    assert.equal(candidates.length, unique.size, "duplicate candidates present");
    for (const bpm of candidates) {
      assert.ok(Number.isInteger(bpm), `${bpm} is not an integer`);
    }
  });

  test("at most 3 candidates returned", () => {
    const samples = makeImpulseSamples(44100, 3, 80);
    const candidates = detectBpmCandidatesFromSamples(samples, 44100);
    assert.ok(candidates.length <= 3, `more than 3 candidates: ${candidates.length}`);
  });
});

// ---------------------------------------------------------------------------
// Worker-parity tests: inject functions via .toString() into eval Worker
// and compare output to direct calls on the same inputs.
// ---------------------------------------------------------------------------

/**
 * Run a snippet in an eval Worker that has the three pure functions injected
 * via .toString(), then return the result via postMessage.
 */
function runInWorker(
  input: unknown,
  workerBody: string,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const code = `
const { workerData, parentPort } = require('worker_threads');
${frequencyToNote.toString()}
${pickDominantFreq.toString()}
${detectBpmCandidatesFromSamples.toString()}
${workerBody}
`;
    const w = new Worker(code, { eval: true, workerData: input });
    const timeout = setTimeout(() => {
      w.terminate();
      reject(new Error("Worker timed out"));
    }, 5000);
    w.once("message", (msg) => { clearTimeout(timeout); resolve(msg); });
    w.once("error", (err) => { clearTimeout(timeout); reject(err); });
  });
}

describe("worker parity: frequencyToNote injected via .toString()", () => {
  test("A4 (440 Hz) → same result as direct call", async () => {
    const direct = frequencyToNote(440);
    const fromWorker = await runInWorker({ freq: 440 }, `
      const r = frequencyToNote(workerData.freq);
      parentPort.postMessage(r);
    `) as typeof direct;
    assert.equal(fromWorker.name, direct.name);
    assert.equal(fromWorker.octave, direct.octave);
    assert.equal(fromWorker.cents, direct.cents);
  });

  test("C4 (261.63 Hz) → same result as direct call", async () => {
    const direct = frequencyToNote(261.63);
    const fromWorker = await runInWorker({ freq: 261.63 }, `
      const r = frequencyToNote(workerData.freq);
      parentPort.postMessage(r);
    `) as typeof direct;
    assert.equal(fromWorker.name, direct.name);
    assert.equal(fromWorker.octave, direct.octave);
  });
});

describe("worker parity: pickDominantFreq injected via .toString()", () => {
  test("empty array → null", async () => {
    const fromWorker = await runInWorker({ readings: [] }, `
      const r = pickDominantFreq(workerData.readings);
      parentPort.postMessage({ result: r });
    `) as { result: number | null };
    assert.equal(fromWorker.result, null);
  });

  test("[438, 440, 442] → same median as direct call", async () => {
    const readings = [438, 440, 442];
    const direct = pickDominantFreq(readings);
    const fromWorker = await runInWorker({ readings }, `
      const r = pickDominantFreq(workerData.readings);
      parentPort.postMessage({ result: r });
    `) as { result: number | null };
    assert.equal(fromWorker.result, direct);
  });
});

describe("worker parity: detectBpmCandidatesFromSamples injected via .toString()", () => {
  test("silence → [] in worker and directly", async () => {
    const silence = new Float32Array(44100 * 2);
    const direct = detectBpmCandidatesFromSamples(silence, 44100);

    const ab = silence.buffer.slice(silence.byteOffset, silence.byteOffset + silence.byteLength);
    const fromWorker = await runInWorker(
      { samplesBuffer: ab, sampleRate: 44100 },
      `
      const samples = new Float32Array(workerData.samplesBuffer);
      const r = detectBpmCandidatesFromSamples(samples, workerData.sampleRate);
      parentPort.postMessage(r);
      `,
    ) as number[];
    assert.deepStrictEqual(fromWorker, direct);
  });

  test("120 BPM impulse → same candidates in worker as directly", async () => {
    const sampleRate = 44100;
    const numSamples = Math.floor(sampleRate * 3);
    const samples = new Float32Array(numSamples);
    const spb = Math.round(sampleRate * 60 / 120);
    for (let s = 0; s < numSamples; s += spb) {
      samples[s] = 1.0;
      if (s + 1 < numSamples) samples[s + 1] = 0.5;
      if (s + 2 < numSamples) samples[s + 2] = 0.2;
    }
    const direct = detectBpmCandidatesFromSamples(samples, sampleRate);

    const ab = samples.buffer.slice(samples.byteOffset, samples.byteOffset + samples.byteLength);
    const fromWorker = await runInWorker(
      { samplesBuffer: ab, sampleRate },
      `
      const samples = new Float32Array(workerData.samplesBuffer);
      const r = detectBpmCandidatesFromSamples(samples, workerData.sampleRate);
      parentPort.postMessage(r);
      `,
    ) as number[];
    assert.deepStrictEqual(fromWorker, direct);
  });
});
