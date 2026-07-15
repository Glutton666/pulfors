import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clampRepeats,
  clampFadeOutSec,
  repeatAndFadeMono,
  repeatAndFadeStereo,
  encodeMp3Mono,
} from "../lib/audio-export-pure";

test("clampRepeats: 1..99 floor, NaN→1", () => {
  assert.equal(clampRepeats(0), 1);
  assert.equal(clampRepeats(-3), 1);
  assert.equal(clampRepeats(1), 1);
  assert.equal(clampRepeats(50), 50);
  assert.equal(clampRepeats(99), 99);
  assert.equal(clampRepeats(100), 99);
  assert.equal(clampRepeats(4.7), 4);
  assert.equal(clampRepeats(NaN), 1);
  assert.equal(clampRepeats(Infinity), 1);
});

test("clampFadeOutSec: 0..60 clamp", () => {
  assert.equal(clampFadeOutSec(-1), 0);
  assert.equal(clampFadeOutSec(0), 0);
  assert.equal(clampFadeOutSec(4), 4);
  assert.equal(clampFadeOutSec(60), 60);
  assert.equal(clampFadeOutSec(120), 60);
  assert.equal(clampFadeOutSec(NaN), 0);
});

test("repeatAndFadeMono: length = loop * repeats, no fade is identity-tile", () => {
  const loop = new Float32Array([0.5, 0.5, 0.5, 0.5]);
  const out = repeatAndFadeMono(loop, 3, 0, 1000);
  assert.equal(out.length, 12);
  for (let i = 0; i < 12; i++) assert.equal(out[i], 0.5);
});

test("repeatAndFadeMono: linear fade attenuates last fadeSec to ~0", () => {
  const sr = 1000;
  const loop = new Float32Array(1000).fill(1.0); // 1초
  const out = repeatAndFadeMono(loop, 4, 1, sr); // 4초, 마지막 1초 fade
  // 첫 3초 전 구간은 그대로
  assert.equal(out[0], 1.0);
  assert.equal(out[2999], 1.0);
  // 마지막 샘플은 0에 매우 가까움
  assert.ok(out[3999] < 0.01, `last sample should be ~0, got ${out[3999]}`);
  // 중간 페이드 지점은 ~0.5
  const mid = out[3500];
  assert.ok(mid > 0.4 && mid < 0.6, `mid fade ~0.5, got ${mid}`);
});

test("repeatAndFadeMono: fadeOut larger than buffer clamps gracefully", () => {
  const loop = new Float32Array([1, 1, 1, 1]);
  const out = repeatAndFadeMono(loop, 1, 100, 1); // 100초 페이드, 버퍼는 4샘플
  assert.equal(out.length, 4);
  // 마지막 샘플은 거의 0
  assert.ok(out[3] < 0.5);
});

test("repeatAndFadeStereo: applies independent fade to L/R", () => {
  const left = new Float32Array(100).fill(0.8);
  const right = new Float32Array(100).fill(-0.8);
  const out = repeatAndFadeStereo({ left, right }, 2, 0.1, 1000); // 0.1s fade @ 1000sr = 100 samples (마지막 100)
  assert.equal(out.left.length, 200);
  assert.equal(out.right.length, 200);
  // 첫 100 샘플은 그대로 (float32 정밀도 허용)
  assert.ok(Math.abs(out.left[0] - 0.8) < 1e-6);
  assert.ok(Math.abs(out.right[0] - -0.8) < 1e-6);
  // 마지막 샘플은 ~0
  assert.ok(Math.abs(out.left[199]) < 0.05);
  assert.ok(Math.abs(out.right[199]) < 0.05);
});

test("encodeMp3Mono: produces a non-empty MP3 buffer with frame sync header", async () => {
  const sr = 44100;
  const dur = 0.2;
  const n = Math.floor(sr * dur);
  const pcm = new Float32Array(n);
  for (let i = 0; i < n; i++) pcm[i] = Math.sin((2 * Math.PI * 440 * i) / sr) * 0.5;
  const mp3 = await encodeMp3Mono(pcm, sr, 128);
  assert.ok(mp3.length > 100, "mp3 bytes too short");
  // MPEG audio frame sync = 11 ones in the first 11 bits → first byte 0xFF, second byte 0xE0+ at top
  // ID3 prefix 'ID3' is also valid; lamejs typically emits raw MP3 frames.
  const isMpegSync = mp3[0] === 0xff && (mp3[1] & 0xe0) === 0xe0;
  const isId3 = mp3[0] === 0x49 && mp3[1] === 0x44 && mp3[2] === 0x33;
  assert.ok(isMpegSync || isId3, `expected MPEG sync or ID3, got ${mp3[0].toString(16)} ${mp3[1].toString(16)}`);
});
