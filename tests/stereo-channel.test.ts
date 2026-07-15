import { test } from "node:test";
import assert from "node:assert/strict";
import {
  encodeStereoWavBuffer,
  parseStereoWavBuffer,
  encodeStereoWavBase64,
  arrayBufferToBase64,
  normalizeSampleChannel,
  isSampleChannel,
} from "@/lib/stereo-channel";

function makeMono(n: number): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.sin((i / n) * Math.PI * 2) * 0.5;
  return out;
}

test("encodeStereoWavBuffer left fills only left channel", () => {
  const mono = makeMono(64);
  const buf = encodeStereoWavBuffer(mono, 44100, "left");
  const parsed = parseStereoWavBuffer(buf);
  assert.equal(parsed.numChannels, 2);
  assert.equal(parsed.sampleRate, 44100);
  assert.equal(parsed.left.length, 64);
  for (let i = 0; i < 64; i++) {
    assert.equal(parsed.right[i], 0, `right[${i}] should be 0`);
  }
  let leftEnergy = 0;
  for (let i = 0; i < 64; i++) leftEnergy += Math.abs(parsed.left[i]);
  assert.ok(leftEnergy > 0, "left should carry signal");
});

test("encodeStereoWavBuffer right fills only right channel", () => {
  const mono = makeMono(64);
  const buf = encodeStereoWavBuffer(mono, 22050, "right");
  const parsed = parseStereoWavBuffer(buf);
  assert.equal(parsed.sampleRate, 22050);
  for (let i = 0; i < 64; i++) {
    assert.equal(parsed.left[i], 0, `left[${i}] should be 0`);
  }
  let rightEnergy = 0;
  for (let i = 0; i < 64; i++) rightEnergy += Math.abs(parsed.right[i]);
  assert.ok(rightEnergy > 0, "right should carry signal");
});

test("encodeStereoWavBuffer clamps out-of-range samples", () => {
  const mono = new Float32Array([1.5, -1.5, 0]);
  const buf = encodeStereoWavBuffer(mono, 8000, "left");
  const parsed = parseStereoWavBuffer(buf);
  assert.ok(parsed.left[0] > 0.99 && parsed.left[0] <= 1);
  assert.ok(parsed.left[1] >= -1 && parsed.left[1] < -0.99);
  assert.equal(parsed.left[2], 0);
});

test("encodeStereoWavBase64 round-trips through base64", () => {
  const mono = makeMono(16);
  const base64 = encodeStereoWavBase64(mono, 44100, "right");
  assert.match(base64, /^[A-Za-z0-9+/=]+$/);
  // Decode base64 manually to verify parseable
  const bin = Buffer.from(base64, "base64");
  const ab = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
  const parsed = parseStereoWavBuffer(ab);
  for (let i = 0; i < 16; i++) {
    assert.equal(parsed.left[i], 0);
  }
});

test("arrayBufferToBase64 handles padding for various lengths", () => {
  for (const len of [0, 1, 2, 3, 4, 5, 100]) {
    const ab = new Uint8Array(len);
    for (let i = 0; i < len; i++) ab[i] = i & 0xff;
    const b64 = arrayBufferToBase64(ab.buffer);
    const decoded = Buffer.from(b64, "base64");
    assert.equal(decoded.length, len);
    for (let i = 0; i < len; i++) assert.equal(decoded[i], i & 0xff);
  }
});

test("normalizeSampleChannel falls back to both for unknown values", () => {
  assert.equal(normalizeSampleChannel(undefined), "both");
  assert.equal(normalizeSampleChannel(null), "both");
  assert.equal(normalizeSampleChannel("center"), "both");
  assert.equal(normalizeSampleChannel("left"), "left");
  assert.equal(normalizeSampleChannel("right"), "right");
  assert.equal(normalizeSampleChannel("both"), "both");
});

test("isSampleChannel narrows known values", () => {
  assert.equal(isSampleChannel("left"), true);
  assert.equal(isSampleChannel("right"), true);
  assert.equal(isSampleChannel("both"), true);
  assert.equal(isSampleChannel(""), false);
  assert.equal(isSampleChannel(0), false);
});
