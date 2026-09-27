import { test } from "node:test";
import assert from "node:assert/strict";
import { extractSparseAudibleIntervals } from "../lib/audio-sparse-intervals";

const SAMPLE_RATE = 44100;
const MIN_GAP_FRAMES = Math.ceil(SAMPLE_RATE * 0.005);

function makeTwoCopyPCM(periodFrames: number): Float32Array {
  return new Float32Array(periodFrames * 2);
}

test("sparse intervals merge sub-5ms exact-zero gaps, split longer gaps, and retain both rendered copies", () => {
  const measureFrames = 2000;
  const pcm = makeTwoCopyPCM(measureFrames);
  pcm[10] = 0.25;
  pcm[20] = -0.5;
  // 9 zero frames are bridged; a 5ms exact-zero gap remains a separator.
  pcm[20 + MIN_GAP_FRAMES + 1] = 0.75;
  pcm[measureFrames + 40] = -0.25;
  pcm[measureFrames + 55] = 0.5;
  pcm[measureFrames + 55 + MIN_GAP_FRAMES + 1] = -0.75;

  const result = extractSparseAudibleIntervals(pcm);
  assert.equal(result.periodFrames, pcm.length);
  assert.deepStrictEqual(result.intervals, [
    { startFrame: 10, endFrame: 21 },
    { startFrame: 20 + MIN_GAP_FRAMES + 1, endFrame: 21 + MIN_GAP_FRAMES + 1 },
    { startFrame: measureFrames + 40, endFrame: measureFrames + 56 },
    {
      startFrame: measureFrames + 55 + MIN_GAP_FRAMES + 1,
      endFrame: measureFrames + 56 + MIN_GAP_FRAMES + 1,
    },
  ]);
});

test("retains the full tail and reports a region wrapping the two-copy loop boundary", () => {
  const measureFrames = 1000;
  const pcm = makeTwoCopyPCM(measureFrames);
  const periodFrames = pcm.length;
  pcm[0] = 0.1;
  pcm[1] = 0.2;
  pcm[periodFrames - 2] = 0.3;
  pcm[periodFrames - 1] = 0.4;

  assert.deepStrictEqual(extractSparseAudibleIntervals(pcm), {
    periodFrames,
    intervals: [{ startFrame: periodFrames - 2, endFrame: periodFrames + 2 }],
  });
});

test("stereo output is audible when only one channel contains sound", () => {
  const measureFrames = 500;
  const left = makeTwoCopyPCM(measureFrames);
  const right = makeTwoCopyPCM(measureFrames);
  const periodFrames = left.length;
  right[100] = 0.00000001;
  right[measureFrames + 100] = 0.00000001;

  assert.deepStrictEqual(extractSparseAudibleIntervals({ left, right }), {
    periodFrames,
    intervals: [
      { startFrame: 100, endFrame: 101 },
      { startFrame: measureFrames + 100, endFrame: measureFrames + 101 },
    ],
  });
});

test("long overlapping sample content remains one interval", () => {
  const measureFrames = 5000;
  const pcm = makeTwoCopyPCM(measureFrames);
  pcm.fill(1, 100, 2501);
  pcm.fill(-1, 2000, 3501);
  pcm.fill(1, measureFrames + 100, measureFrames + 2501);
  pcm.fill(-1, measureFrames + 2000, measureFrames + 3501);

  assert.deepStrictEqual(extractSparseAudibleIntervals(pcm), {
    periodFrames: pcm.length,
    intervals: [
      { startFrame: 100, endFrame: 3501 },
      { startFrame: measureFrames + 100, endFrame: measureFrames + 3501 },
    ],
  });
});

test("all-zero mono and stereo PCM produce no intervals", () => {
  const measureFrames = 300;
  const mono = makeTwoCopyPCM(measureFrames);
  const left = makeTwoCopyPCM(measureFrames);
  const right = makeTwoCopyPCM(measureFrames);

  assert.deepStrictEqual(extractSparseAudibleIntervals(mono), { intervals: [], periodFrames: mono.length });
  assert.deepStrictEqual(extractSparseAudibleIntervals({ left, right }), {
    intervals: [],
    periodFrames: left.length,
  });
});