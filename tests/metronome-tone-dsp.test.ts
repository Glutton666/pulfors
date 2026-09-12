import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NEUTRAL,
  limitLinkedPCM,
  mapTonePositionToWeights,
  processClickPCM,
  sanitizeTonePosition,
} from "../lib/metronome-tone-dsp";

test("sanitizeTonePosition clamps coordinates and treats non-finite values as neutral", () => {
  assert.deepEqual(sanitizeTonePosition({ x: 4, y: -3 }), { x: 1, y: -1 });
  assert.deepEqual(sanitizeTonePosition({ x: Number.NaN, y: Number.POSITIVE_INFINITY }), NEUTRAL);
  assert.deepEqual(sanitizeTonePosition(undefined), NEUTRAL);
});

test("corner weights are bilinear and sum to one", () => {
  assert.deepEqual(mapTonePositionToWeights({ x: -1, y: -1 }), {
    attack: 1,
    high: 0,
    resonance: 0,
    low: 0,
  });
  assert.deepEqual(mapTonePositionToWeights({ x: 1, y: 1 }), {
    attack: 0,
    high: 0,
    resonance: 0,
    low: 1,
  });
  const middle = mapTonePositionToWeights({ x: 0, y: 0 });
  assert.deepEqual(middle, { attack: 0.25, high: 0.25, resonance: 0.25, low: 0.25 });
  assert.equal(Object.values(middle).reduce((a, b) => a + b, 0), 1);
});

test("neutral processing bypasses finite PCM exactly when no limiting is needed", () => {
  const mono = new Float32Array([0.125, -0.25, 0, 0.5]);
  assert.strictEqual(processClickPCM(mono, NEUTRAL), mono);
  assert.deepEqual(Array.from(processClickPCM(mono, NEUTRAL) as Float32Array), Array.from(mono));
});

test("tone processing is pure, finite, and changes a click away from neutral", () => {
  const source = new Float32Array([0.2, 0.1, -0.15, 0.05, 0]);
  const original = Array.from(source);
  const shaped = processClickPCM(source, { x: -1, y: -1 });
  assert.notStrictEqual(shaped, source);
  assert.deepEqual(Array.from(source), original);
  assert.ok(Array.from(shaped as Float32Array).every(Number.isFinite));
  assert.notDeepEqual(Array.from(shaped as Float32Array), original);
});

test("stereo limiter is linked and keeps every output at or below 0.98", () => {
  const source = {
    left: new Float32Array([0.4, -2]),
    right: new Float32Array([0.75, 0.1]),
  };
  const limited = limitLinkedPCM(source) as { left: Float32Array; right: Float32Array };
  assert.notStrictEqual(limited, source);
  assert.ok(Math.max(...Array.from(limited.left).map(Math.abs)) <= 0.98);
  assert.ok(Math.max(...Array.from(limited.right).map(Math.abs)) <= 0.98);
  // The frame containing the -2 peak applies the same reduction to both channels.
  assert.ok(Math.abs(limited.right[1] / limited.left[1] - (0.1 / -2)) < 0.001);
});

test("soft-knee limiting keeps boosted quiet detail louder than unity", () => {
  const unity = new Float32Array([0.95, 0.2, -0.3, 0.1]);
  const boosted = new Float32Array(Array.from(unity, (sample) => sample * 2));
  const limited = limitLinkedPCM(boosted) as Float32Array;
  const rms = (pcm: Float32Array) =>
    Math.sqrt(Array.from(pcm).reduce((sum, sample) => sum + sample * sample, 0) / pcm.length);
  assert.ok(rms(limited) > rms(unity));
  assert.ok(Math.max(...Array.from(limited).map(Math.abs)) <= 0.98);
});

test("non-finite input is converted to finite output", () => {
  const output = processClickPCM(new Float32Array([NaN, Infinity, -Infinity, 0]), {
    position: NEUTRAL,
  }) as Float32Array;
  assert.ok(Array.from(output).every(Number.isFinite));
});
