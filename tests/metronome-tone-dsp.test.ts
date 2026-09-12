import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  NEUTRAL,
  limitLinkedPCM,
  mapTonePositionToWeights,
  processClickPCM,
  sanitizeTonePosition,
  toneEffectIntensity,
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

test("limiter changes continuously when a peak crosses the ceiling", () => {
  const below = limitLinkedPCM(new Float32Array([0.979, 0.8])) as Float32Array;
  const above = limitLinkedPCM(new Float32Array([0.981, 0.8])) as Float32Array;
  assert.ok(Math.abs(above[0] - below[0]) < 0.003);
  assert.ok(Math.abs(above[1] - below[1]) < 0.003);
});

test("effect intensity has a neutral dead-zone and grows smoothly to the edge", () => {
  assert.equal(toneEffectIntensity({ x: 0.04, y: -0.03 }), 0);
  const quarter = toneEffectIntensity({ x: 0.25, y: 0 });
  const half = toneEffectIntensity({ x: 0.5, y: 0 });
  const edge = toneEffectIntensity({ x: 1, y: 0 });
  assert.ok(quarter > 0);
  assert.ok(half > quarter);
  assert.equal(edge, 1);
});

test("four corners produce strongly distinct acoustic signatures", () => {
  const sampleRate = 44_100;
  const source = new Float32Array(Math.round(sampleRate * 0.012));
  for (let i = 0; i < source.length; i++) {
    const time = i / sampleRate;
    source[i] = (
      0.42 * Math.sin(2 * Math.PI * 500 * time)
      + 0.16 * Math.sin(2 * Math.PI * 7_000 * time)
    ) * Math.exp(-time / 0.006);
  }
  const corner = (x: number, y: number) =>
    processClickPCM(source, { x, y }, sampleRate) as Float32Array;
  const attack = corner(-1, -1);
  const high = corner(1, -1);
  const resonance = corner(-1, 1);
  const low = corner(1, 1);
  const energy = (pcm: Float32Array, start = 0, end = pcm.length) =>
    Array.from(pcm.subarray(start, end)).reduce((sum, value) => sum + value * value, 0);
  const roughness = (pcm: Float32Array) => {
    let changes = 0;
    for (let i = 1; i < pcm.length; i++) changes += (pcm[i] - pcm[i - 1]) ** 2;
    return changes / Math.max(1e-9, energy(pcm));
  };
  const onset = Math.round(sampleRate * 0.002);

  assert.ok(energy(attack, 0, onset) / energy(attack) > energy(low, 0, onset) / energy(low));
  assert.ok(roughness(high) > roughness(low) * 2);
  const resonanceTailRatio = energy(resonance, source.length) / energy(resonance, 0, source.length);
  assert.ok(resonanceTailRatio > 0.005, `resonance tail ratio ${resonanceTailRatio}`);

  const outputs = [attack, high, resonance, low];
  for (let a = 0; a < outputs.length; a++) {
    for (let b = a + 1; b < outputs.length; b++) {
      let difference = 0;
      for (let i = 0; i < outputs[a].length; i++) {
        difference += Math.abs(outputs[a][i] - outputs[b][i]);
      }
      assert.ok(difference / outputs[a].length > 0.005);
    }
  }
});

function decodePcm16Wav(path: string): Float32Array {
  const wav = readFileSync(path);
  let offset = 12;
  while (offset + 8 <= wav.length) {
    const chunk = wav.toString("ascii", offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    if (chunk === "data") {
      const sampleCount = Math.floor(size / 2);
      const pcm = new Float32Array(sampleCount);
      for (let i = 0; i < sampleCount; i++) pcm[i] = wav.readInt16LE(offset + 8 + i * 2) / 32768;
      return pcm;
    }
    offset += 8 + size + (size & 1);
  }
  throw new Error(`No PCM data chunk in ${path}`);
}

test("every bundled metronome click remains finite, audible, limited, and corner-distinct", () => {
  const soundDir = join(process.cwd(), "assets", "sounds");
  const sets = new Set(["click", "woodblock", "cowbell", "digital", "jamblock", "sine", "blip", "clave", "cajon", "marimba", "stick"]);
  const files = readdirSync(soundDir).filter((name) => name.endsWith(".wav") && sets.has(name.split("-")[0]));
  assert.equal(files.length, 33);

  for (const filename of files) {
    const source = decodePcm16Wav(join(soundDir, filename));
    const outputs = [
      processClickPCM(source, { x: -1, y: -1 }) as Float32Array,
      processClickPCM(source, { x: 1, y: -1 }) as Float32Array,
      processClickPCM(source, { x: -1, y: 1 }) as Float32Array,
      processClickPCM(source, { x: 1, y: 1 }) as Float32Array,
    ];
    for (const output of outputs) {
      assert.ok(Array.from(output).every(Number.isFinite), `${filename} contains non-finite output`);
      assert.ok(Math.max(...Array.from(output).map(Math.abs)) <= 0.98, `${filename} exceeds limiter ceiling`);
      assert.ok(Array.from(output).some((value) => Math.abs(value) > 0.01), `${filename} became inaudible`);
    }
    for (let a = 0; a < outputs.length; a++) {
      for (let b = a + 1; b < outputs.length; b++) {
        let difference = 0;
        let magnitude = 0;
        for (let i = 0; i < outputs[a].length; i++) {
          difference += Math.abs(outputs[a][i] - outputs[b][i]);
          magnitude += Math.max(Math.abs(outputs[a][i]), Math.abs(outputs[b][i]));
        }
        assert.ok(difference / Math.max(1e-9, magnitude) > 0.08, `${filename} corners ${a}/${b} are too similar`);
      }
    }
  }
});

test("non-finite input is converted to finite output", () => {
  const output = processClickPCM(new Float32Array([NaN, Infinity, -Infinity, 0]), {
    position: NEUTRAL,
  }) as Float32Array;
  assert.ok(Array.from(output).every(Number.isFinite));
});
