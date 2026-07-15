import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decodeWavBase64,
  analyzeWavLocally,
  base64ToBytes,
} from "../lib/signal-analysis";

function buildWavBase64(samples: number[], sampleRate = 48000, bits = 16): string {
  const numSamples = samples.length;
  const bytesPerSample = bits / 8;
  const dataSize = numSamples * bytesPerSample;
  const buf = new Uint8Array(44 + dataSize);
  const view = new DataView(buf.buffer);
  buf.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  view.setUint32(4, 36 + dataSize, true);
  buf.set([0x57, 0x41, 0x56, 0x45], 8); // WAVE
  buf.set([0x66, 0x6d, 0x74, 0x20], 12); // fmt
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, bits, true);
  buf.set([0x64, 0x61, 0x74, 0x61], 36); // data
  view.setUint32(40, dataSize, true);
  for (let i = 0; i < numSamples; i++) {
    if (bits === 16) {
      const v = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(44 + i * 2, Math.round(v * 32767), true);
    } else if (bits === 8) {
      const v = Math.max(-1, Math.min(1, samples[i]));
      buf[44 + i] = Math.round(v * 127) + 128;
    }
  }
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  // Buffer is available in Node test env
  return Buffer.from(bin, "binary").toString("base64");
}

test("decodeWavBase64: 너무 작은 파일 → null", () => {
  const small = Buffer.from(new Uint8Array(20)).toString("base64");
  assert.equal(decodeWavBase64(small, 48000), null);
});

test("decodeWavBase64: RIFF 헤더 아니면 null", () => {
  const fake = new Uint8Array(48);
  fake.set([0x46, 0x41, 0x4b, 0x45], 0); // FAKE
  const b64 = Buffer.from(fake).toString("base64");
  assert.equal(decodeWavBase64(b64, 48000), null);
});

test("decodeWavBase64: 16-bit PCM mono 정상 디코드", () => {
  const samples = [0, 0.5, -0.5, 1, -1];
  const b64 = buildWavBase64(samples, 48000, 16);
  const r = decodeWavBase64(b64, 48000);
  assert.ok(r);
  assert.equal(r!.rate, 48000);
  assert.equal(r!.samples.length, 5);
  assert.ok(Math.abs(r!.samples[0]) < 0.01);
  assert.ok(Math.abs(r!.samples[1] - 0.5) < 0.01);
  assert.ok(Math.abs(r!.samples[3] - 1) < 0.01);
});

test("decodeWavBase64: 8-bit PCM 정상 디코드", () => {
  const samples = [0, 1, -1];
  const b64 = buildWavBase64(samples, 22050, 8);
  const r = decodeWavBase64(b64, 22050);
  assert.ok(r);
  assert.equal(r!.rate, 22050);
  assert.equal(r!.samples.length, 3);
});

test("decodeWavBase64: data chunk 없으면 null", () => {
  const buf = new Uint8Array(60);
  const view = new DataView(buf.buffer);
  buf.set([0x52, 0x49, 0x46, 0x46], 0);
  view.setUint32(4, 52, true);
  buf.set([0x57, 0x41, 0x56, 0x45], 8);
  buf.set([0x66, 0x6d, 0x74, 0x20], 12); // fmt only, no data
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 48000, true);
  view.setUint32(28, 96000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  const b64 = Buffer.from(buf).toString("base64");
  assert.equal(decodeWavBase64(b64, 48000), null);
});

test("analyzeWavLocally: 너무 짧은 신호 → frequency null", () => {
  const samples = new Array(100).fill(0);
  const b64 = buildWavBase64(samples, 48000, 16);
  const r = analyzeWavLocally(b64, 48000);
  assert.equal(r.frequency, null);
});

test("analyzeWavLocally: 무음 신호 → frequency null (RMS 임계 미달)", () => {
  const samples = new Array(20000).fill(0);
  const b64 = buildWavBase64(samples, 48000, 16);
  const r = analyzeWavLocally(b64, 48000);
  assert.equal(r.frequency, null);
});

test("analyzeWavLocally: 합성 톤(기음+배음) → 기음 탐지", () => {
  // HPS는 배음 구조를 활용하므로 실제 악기처럼 배음 포함 신호 사용
  const sampleRate = 48000;
  const fundamental = 440;
  const N = Math.floor(sampleRate * 0.5);
  const samples: number[] = [];
  for (let i = 0; i < N; i++) {
    const t = i / sampleRate;
    const v =
      0.6 * Math.sin(2 * Math.PI * fundamental * t) +
      0.3 * Math.sin(2 * Math.PI * fundamental * 2 * t) +
      0.15 * Math.sin(2 * Math.PI * fundamental * 3 * t) +
      0.08 * Math.sin(2 * Math.PI * fundamental * 4 * t);
    samples.push(v * 0.7);
  }
  const b64 = buildWavBase64(samples, sampleRate, 16);
  const r = analyzeWavLocally(b64, sampleRate);
  assert.ok(r.frequency !== null, "frequency should be detected");
  assert.ok(
    Math.abs(r.frequency! - fundamental) < 15,
    `expected ~${fundamental} got ${r.frequency}`,
  );
  assert.equal(r.note, "A4");
});

test("base64ToBytes ↔ buildWavBase64 라운드트립 sanity", () => {
  const b64 = buildWavBase64([0, 0.5, -0.5], 48000, 16);
  const bytes = base64ToBytes(b64);
  // RIFF header at start
  assert.equal(bytes[0], 0x52);
  assert.equal(bytes[1], 0x49);
  assert.equal(bytes[2], 0x46);
  assert.equal(bytes[3], 0x46);
});
