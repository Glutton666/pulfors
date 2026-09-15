import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NOTE_NAMES,
  MAX_LOCAL_BASE64_CHARS,
  base64ToBytes,
  decodePcm16Base64,
  frequencyToNote,
  noteToFreq,
  realFFT,
  fftPeakDetect,
} from "../lib/signal-analysis";

test("NOTE_NAMES: 12개 반음", () => {
  assert.equal(NOTE_NAMES.length, 12);
  assert.equal(NOTE_NAMES[0], "C");
  assert.equal(NOTE_NAMES[9], "A");
});

test("base64ToBytes: 'TWFu' → 'Man' (RFC 4648 예제)", () => {
  const r = base64ToBytes("TWFu");
  assert.equal(r.length, 3);
  assert.equal(r[0], 77); // M
  assert.equal(r[1], 97); // a
  assert.equal(r[2], 110); // n
});

test("base64ToBytes: padding 처리 'TQ==' → 'M'", () => {
  const r = base64ToBytes("TQ==");
  assert.equal(r.length, 1);
  assert.equal(r[0], 77);
});

test("base64ToBytes: padding 처리 'TWE=' → 'Ma'", () => {
  const r = base64ToBytes("TWE=");
  assert.equal(r.length, 2);
  assert.equal(r[0], 77);
  assert.equal(r[1], 97);
});

test("base64ToBytes: 비-base64 문자 무시(개행/공백)", () => {
  const r = base64ToBytes("TW\nFu ");
  assert.equal(r.length, 3);
});

test("base64ToBytes: 잘못된 문자는 빈 배열로 거절", () => {
  const r = base64ToBytes("not base64!");
  assert.equal(r.length, 0);
});

test("base64ToBytes: 로컬 한도 초과 입력은 디코드 전에 빈 배열로 거절", () => {
  const r = base64ToBytes("A".repeat(MAX_LOCAL_BASE64_CHARS + 1));
  assert.equal(r.length, 0);
});

test("decodePcm16Base64: little-endian signed PCM을 float 샘플로 변환", () => {
  // 0x0000, 0x4000, 0xC000 => 0, 0.5, -0.5
  const pcm = Buffer.from([0x00, 0x00, 0x00, 0x40, 0x00, 0xC0]).toString("base64");
  assert.deepEqual(Array.from(decodePcm16Base64(pcm)), [0, 0.5, -0.5]);
});

test("decodePcm16Base64: malformed 청크 뒤에도 다음 정상 PCM을 변환", () => {
  assert.equal(decodePcm16Base64("not-a-pcm-chunk").length, 0);
  const valid = Buffer.from([0x00, 0x40, 0x00, 0xC0]).toString("base64");
  assert.deepEqual(Array.from(decodePcm16Base64(valid)), [0.5, -0.5]);
});

test("frequencyToNote: A4 = 440Hz → A/4/0cents", () => {
  const r = frequencyToNote(440);
  assert.equal(r.name, "A");
  assert.equal(r.octave, 4);
  assert.equal(r.cents, 0);
});

test("frequencyToNote: C4 ≈ 261.63Hz", () => {
  const r = frequencyToNote(261.63);
  assert.equal(r.name, "C");
  assert.equal(r.octave, 4);
  assert.ok(Math.abs(r.cents) <= 1);
});

test("frequencyToNote: A5 = 880Hz → A/5", () => {
  const r = frequencyToNote(880);
  assert.equal(r.name, "A");
  assert.equal(r.octave, 5);
  assert.equal(r.cents, 0);
});

test("frequencyToNote: 약간 어긋난 주파수의 cents", () => {
  const r = frequencyToNote(445); // A4보다 약간 위 (~+19.6 cents)
  assert.equal(r.name, "A");
  assert.equal(r.octave, 4);
  assert.ok(r.cents > 0 && r.cents < 30);
});

test("noteToFreq: A4 → 440", () => {
  assert.equal(noteToFreq("A", 4), 440);
});

test("noteToFreq: C4 → 261.63", () => {
  const f = noteToFreq("C", 4);
  assert.ok(Math.abs(f - 261.63) < 0.01);
});

test("noteToFreq: A5 → 880", () => {
  assert.equal(noteToFreq("A", 5), 880);
});

test("noteToFreq: 잘못된 음이름 → 440 fallback", () => {
  assert.equal(noteToFreq("X", 4), 440);
});

test("noteToFreq ↔ frequencyToNote 라운드트립", () => {
  for (const name of ["C", "D", "E", "F", "G", "A", "B"]) {
    for (const oct of [3, 4, 5]) {
      const f = noteToFreq(name, oct);
      const back = frequencyToNote(f);
      assert.equal(back.name, name, `${name}${oct}`);
      assert.equal(back.octave, oct, `${name}${oct}`);
    }
  }
});

test("realFFT: 길이 1/2 magnitude 반환", () => {
  const N = 1024;
  const samples = new Float32Array(N);
  for (let i = 0; i < N; i++) samples[i] = Math.sin(2 * Math.PI * 100 * i / N);
  const mag = realFFT(samples);
  assert.equal(mag.length, N / 2);
});

test("realFFT: DC 신호의 0번째 bin이 가장 큼", () => {
  const N = 256;
  const samples = new Float32Array(N).fill(1.0);
  const mag = realFFT(samples);
  for (let i = 1; i < mag.length; i++) {
    assert.ok(mag[0] >= mag[i], `bin0 ${mag[0]} should >= bin${i} ${mag[i]}`);
  }
});

test("fftPeakDetect: 신호 없음 → null", () => {
  const mag = new Float32Array(2048).fill(-200);
  const r = fftPeakDetect(mag, 48000, 4096);
  assert.equal(r, null);
});

test("fftPeakDetect: minBin >= maxBin → null", () => {
  const mag = new Float32Array(2048).fill(0);
  // sampleRate가 너무 낮아 minFreq가 fftSize 한계 초과
  const r = fftPeakDetect(mag, 100, 4096, 27.5, 4200);
  assert.equal(r, null);
});

test("fftPeakDetect: 합성 440Hz peak 탐지", () => {
  const sampleRate = 48000;
  const fftSize = 4096;
  const mag = new Float32Array(fftSize / 2).fill(-100);
  const targetBin = Math.round(440 / (sampleRate / fftSize));
  // 기음 + 2,3,4,5배음에 강한 신호 부여 (HPS 양수화)
  for (let h = 1; h <= 5; h++) {
    const b = targetBin * h;
    if (b < mag.length) mag[b] = -10;
  }
  const r = fftPeakDetect(mag, sampleRate, fftSize, 27.5, 4200, -80);
  assert.ok(r);
  assert.ok(Math.abs(r!.freq - 440) < 10, `expected ~440 got ${r!.freq}`);
});

test("fftPeakDetect: 배음 없는 순수한 440Hz도 실제 피크를 탐지", () => {
  const sampleRate = 44100;
  const fftSize = 8192;
  const samples = new Float32Array(fftSize);
  for (let i = 0; i < fftSize; i++) {
    const window = 0.5 * (1 - Math.cos(2 * Math.PI * i / (fftSize - 1)));
    samples[i] = Math.sin(2 * Math.PI * 440 * i / sampleRate) * window;
  }
  const result = fftPeakDetect(realFFT(samples), sampleRate, fftSize);
  assert.ok(result);
  assert.ok(Math.abs(result!.freq - 440) < 10, `expected ~440 got ${result!.freq}`);
});
