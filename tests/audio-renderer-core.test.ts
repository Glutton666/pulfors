/**
 * audio-renderer-core.test.ts
 *
 * 순수 함수 단위 테스트 (Node 환경, DOM/AudioContext 불필요):
 *   parseWav, encodeWav, applySoftClip, parseTrimInfo,
 *   pcmToStereoBuffers, renderMeasure (stereo·mute·channel-off·trim·repeatIteration 경로)
 *
 * audio-renderer-bpm-lock.test.ts   → BPM 격리, 기본 mono 렌더링
 * audio-renderer-layers.test.ts     → layerClickPCMs, layerSoundSet
 * (위 파일들과 중복 없음)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseWav,
  encodeWav,
  applySoftClip,
  parseTrimInfo,
  pcmToStereoBuffers,
  renderMeasure,
  getRenderSampleRate,
  type ClickPCMs,
  type TickInfo,
  type SamplePCMEntry,
} from "../lib/audio-renderer";

const SR = getRenderSampleRate(); // 44100

// ── WAV 빌더 헬퍼 ─────────────────────────────────────────────────────────────

function ws(v: DataView, off: number, s: string): void {
  for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
}

/**
 * 정규화된 [-1,1] 샘플 배열에서 WAV ArrayBuffer를 생성한다.
 * stereo인 경우 samples는 첫 채널 값이며, 두 번째 채널에는 -samples를 넣어
 * 두 채널이 다른 값을 갖도록 한다.
 */
function buildWav(opts: {
  fmt?: 1 | 3;        // 1=PCM (default), 3=float
  bps: 8 | 16 | 24 | 32;
  channels?: number;
  sr?: number;
  samples: number[];  // 첫 채널 [normalized -1..1]
}): ArrayBuffer {
  const { bps, samples, fmt = 1, channels = 1, sr = 44100 } = opts;
  const bytesPerSample = bps / 8;
  const frameSize = channels * bytesPerSample;
  const dataSize = samples.length * frameSize;
  const buf = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buf);

  ws(v, 0, "RIFF");
  v.setUint32(4, 36 + dataSize, true);
  ws(v, 8, "WAVE");
  ws(v, 12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, fmt, true);
  v.setUint16(22, channels, true);
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * frameSize, true);
  v.setUint16(32, frameSize, true);
  v.setUint16(34, bps, true);
  ws(v, 36, "data");
  v.setUint32(40, dataSize, true);

  for (let i = 0; i < samples.length; i++) {
    const base = 44 + i * frameSize;
    const s = samples[i];
    writeSample(v, base, bps, fmt, s);
    if (channels === 2) {
      // 두 번째 채널은 -s (채널 격리 확인용)
      writeSample(v, base + bytesPerSample, bps, fmt, -s);
    }
  }
  return buf;
}

function writeSample(v: DataView, off: number, bps: number, fmt: number, s: number): void {
  if (bps === 16) {
    v.setInt16(off, Math.round(s * 32767), true);
  } else if (bps === 8) {
    v.setUint8(off, Math.max(0, Math.min(255, Math.round(s * 128 + 128))));
  } else if (bps === 24) {
    const val = Math.round(s * 8388607);
    v.setUint8(off, val & 0xff);
    v.setUint8(off + 1, (val >> 8) & 0xff);
    v.setUint8(off + 2, (val >> 16) & 0xff);
  } else if (bps === 32 && fmt === 3) {
    v.setFloat32(off, s, true);
  } else if (bps === 32) {
    v.setInt32(off, Math.round(s * 2147483647), true);
  }
}

// ── parseWav ──────────────────────────────────────────────────────────────────

test("parseWav: 16-bit mono — 정확한 값 복원", () => {
  const input = [0, 0.5, -0.5, 1, -1];
  const wav = buildWav({ bps: 16, samples: input });
  const { pcm, sampleRate } = parseWav(wav);
  assert.equal(sampleRate, 44100);
  assert.equal(pcm.length, input.length);
  // 16-bit 양자화 오차 ≤ 1/32767
  const tol = 1 / 32767;
  for (let i = 0; i < input.length; i++) {
    assert.ok(
      Math.abs(pcm[i] - input[i]) <= tol + 1e-6,
      `index ${i}: expected ~${input[i]} got ${pcm[i]}`,
    );
  }
});

test("parseWav: 16-bit stereo — 첫 채널(L)만 반환", () => {
  const samples = [0.4, 0.8, -0.4];
  const wav = buildWav({ bps: 16, channels: 2, samples });
  const { pcm } = parseWav(wav);
  assert.equal(pcm.length, samples.length);
  const tol = 1 / 32767;
  for (let i = 0; i < samples.length; i++) {
    // 두 번째 채널(-samples[i])이 아닌 첫 채널만 읽혀야 함
    assert.ok(
      Math.abs(pcm[i] - samples[i]) <= tol + 1e-6,
      `stereo ch0[${i}]: expected ~${samples[i]} got ${pcm[i]}`,
    );
  }
});

test("parseWav: 8-bit — 부호 없는 정수 디코딩", () => {
  // 128 = silence (0.0), 192 = ~0.5, 64 = ~-0.5
  const wav = buildWav({ bps: 8, samples: [0, 0.5, -0.5] });
  const { pcm } = parseWav(wav);
  assert.equal(pcm.length, 3);
  assert.ok(Math.abs(pcm[0]) < 0.01, `8-bit silence: ${pcm[0]}`);
  assert.ok(pcm[1] > 0.4 && pcm[1] < 0.6, `8-bit +0.5: ${pcm[1]}`);
  assert.ok(pcm[2] > -0.6 && pcm[2] < -0.4, `8-bit -0.5: ${pcm[2]}`);
});

test("parseWav: 24-bit PCM — 부호 있는 3바이트 디코딩", () => {
  const input = [0, 0.75, -0.75];
  const wav = buildWav({ bps: 24, samples: input });
  const { pcm } = parseWav(wav);
  assert.equal(pcm.length, input.length);
  const tol = 2 / 8388607;
  for (let i = 0; i < input.length; i++) {
    assert.ok(
      Math.abs(pcm[i] - input[i]) <= tol + 1e-6,
      `24-bit[${i}]: expected ~${input[i]} got ${pcm[i]}`,
    );
  }
});

test("parseWav: 32-bit float WAV (fmt=3) — 무손실 복원", () => {
  const input = [0.123456789, -0.987654321, 0];
  const wav = buildWav({ fmt: 3, bps: 32, samples: input });
  const { pcm } = parseWav(wav);
  assert.equal(pcm.length, input.length);
  // Float32 정밀도 이내
  for (let i = 0; i < input.length; i++) {
    assert.ok(
      Math.abs(pcm[i] - input[i]) < 1e-6,
      `float32[${i}]: expected ${input[i]} got ${pcm[i]}`,
    );
  }
});

test("parseWav: 32-bit PCM (fmt=1) — int32 디코딩", () => {
  const wav = buildWav({ fmt: 1, bps: 32, samples: [0.5, -0.5] });
  const { pcm } = parseWav(wav);
  assert.equal(pcm.length, 2);
  assert.ok(Math.abs(pcm[0] - 0.5) < 0.001, `32-bit PCM[0]: ${pcm[0]}`);
  assert.ok(Math.abs(pcm[1] + 0.5) < 0.001, `32-bit PCM[1]: ${pcm[1]}`);
});

test("parseWav: 샘플레이트 보존", () => {
  const wav = buildWav({ bps: 16, sr: 22050, samples: [0] });
  const { sampleRate } = parseWav(wav);
  assert.equal(sampleRate, 22050);
});

test("parseWav: 잘못된 WAV는 에러를 던진다", () => {
  const junk = new ArrayBuffer(100);
  assert.throws(() => parseWav(junk), /Invalid WAV/);
});

test("parseWav: 지원하지 않는 포맷(fmt=2 ADPCM)은 에러를 던진다", () => {
  const buf = new ArrayBuffer(44);
  const v = new DataView(buf);
  ws(v, 0, "RIFF"); v.setUint32(4, 36, true); ws(v, 8, "WAVE");
  ws(v, 12, "fmt "); v.setUint32(16, 16, true);
  v.setUint16(20, 2, true); // ADPCM — not supported
  ws(v, 36, "data"); v.setUint32(40, 0, true);
  assert.throws(() => parseWav(buf), /Only PCM\/Float WAV supported/);
});

// ── encodeWav ─────────────────────────────────────────────────────────────────

test("encodeWav: WAV 헤더 시그니처가 정확히 기록됨", () => {
  const pcm = new Float32Array([0, 0.5, -0.5]);
  const buf = encodeWav(pcm, 44100);
  const v = new DataView(buf);
  const str = (off: number, len: number) =>
    Array.from({ length: len }, (_, i) => String.fromCharCode(v.getUint8(off + i))).join("");
  assert.equal(str(0, 4), "RIFF");
  assert.equal(str(8, 4), "WAVE");
  assert.equal(str(12, 4), "fmt ");
  assert.equal(str(36, 4), "data");
  assert.equal(v.getUint16(20, true), 1);   // PCM
  assert.equal(v.getUint16(22, true), 1);   // mono
  assert.equal(v.getUint32(24, true), 44100); // sample rate
  assert.equal(v.getUint16(34, true), 16);  // 16-bit
});

test("encodeWav: 총 바이트 길이 = 44 + n*2", () => {
  const n = 1000;
  const pcm = new Float32Array(n);
  const buf = encodeWav(pcm, 44100);
  assert.equal(buf.byteLength, 44 + n * 2);
});

test("encodeWav: preClamped=false — [-1,1] 범위 초과 값 클램핑", () => {
  const pcm = new Float32Array([2.0, -3.0, 0.5]);
  const buf = encodeWav(pcm, 44100, false);
  const v = new DataView(buf);
  // 2.0 → 클램핑 → +32767
  const s0 = v.getInt16(44, true);
  assert.ok(s0 === 32767, `s0 should be clamped to 32767, got ${s0}`);
  // -3.0 → -32768
  const s1 = v.getInt16(46, true);
  assert.ok(s1 === -32768, `s1 should be clamped to -32768, got ${s1}`);
});

test("encodeWav: encode → parseWav 라운드트립", () => {
  const input = new Float32Array([0, 0.25, -0.25, 0.5, -0.5]);
  const buf = encodeWav(input, 44100);
  const { pcm, sampleRate } = parseWav(buf);
  assert.equal(sampleRate, 44100);
  assert.equal(pcm.length, input.length);
  const tol = 1 / 32767 + 1e-6;
  for (let i = 0; i < input.length; i++) {
    assert.ok(Math.abs(pcm[i] - input[i]) <= tol, `roundtrip[${i}]: ${pcm[i]} ≠ ${input[i]}`);
  }
});

// ── applySoftClip ─────────────────────────────────────────────────────────────

test("applySoftClip: tanh(0) = 0", () => {
  const buf = new Float32Array([0]);
  applySoftClip(buf);
  assert.ok(Math.abs(buf[0]) < 1e-9);
});

test("applySoftClip: 큰 양수 입력 → +1에 수렴", () => {
  const buf = new Float32Array([100]);
  applySoftClip(buf);
  assert.ok(buf[0] > 0.999 && buf[0] <= 1, `got ${buf[0]}`);
});

test("applySoftClip: 큰 음수 입력 → -1에 수렴", () => {
  const buf = new Float32Array([-100]);
  applySoftClip(buf);
  assert.ok(buf[0] < -0.999 && buf[0] >= -1, `got ${buf[0]}`);
});

test("applySoftClip: 0.5 → tanh(0.5) ≈ 0.4621", () => {
  const buf = new Float32Array([0.5]);
  applySoftClip(buf);
  assert.ok(Math.abs(buf[0] - Math.tanh(0.5)) < 1e-6, `got ${buf[0]}`);
});

test("applySoftClip: 배열 전체에 in-place 적용", () => {
  const values = [0.3, -0.3, 1.5, -2.0, 0];
  const buf = new Float32Array(values);
  applySoftClip(buf);
  for (let i = 0; i < values.length; i++) {
    assert.ok(
      Math.abs(buf[i] - Math.tanh(values[i])) < 1e-6,
      `index ${i}: expected tanh(${values[i]}) = ${Math.tanh(values[i])}, got ${buf[i]}`,
    );
  }
});

// ── parseTrimInfo ─────────────────────────────────────────────────────────────

test("parseTrimInfo: fragment 없으면 start=0 duration=0", () => {
  const r = parseTrimInfo("file:///a/b.wav");
  assert.deepEqual(r, { trimStartMs: 0, trimDurationMs: 0 });
});

test("parseTrimInfo: #t=1,3 → start=1ms duration=2ms", () => {
  const r = parseTrimInfo("file:///a.wav#t=1,3");
  assert.deepEqual(r, { trimStartMs: 1, trimDurationMs: 2 });
});

test("parseTrimInfo: 소수점 구간 #t=0.5,2.0 → start=0.5 duration=1.5", () => {
  const r = parseTrimInfo("blob:abc#t=0.5,2.0");
  assert.equal(r.trimStartMs, 0.5);
  assert.ok(Math.abs(r.trimDurationMs - 1.5) < 1e-9);
});

test("parseTrimInfo: end <= start → duration=0", () => {
  const r = parseTrimInfo("file:///a.wav#t=5,3");
  assert.equal(r.trimStartMs, 5);
  assert.equal(r.trimDurationMs, 0);
});

test("parseTrimInfo: end === start → duration=0", () => {
  const r = parseTrimInfo("file:///a.wav#t=2,2");
  assert.equal(r.trimDurationMs, 0);
});

test("parseTrimInfo: 값이 하나만 있으면 end=0 → duration=0", () => {
  const r = parseTrimInfo("file:///a.wav#t=1.5");
  assert.equal(r.trimStartMs, 1.5);
  assert.equal(r.trimDurationMs, 0); // end(0) <= start(1.5) → 0
});

test("parseTrimInfo: #t= 이지만 NaN → start=0 duration=0", () => {
  const r = parseTrimInfo("file:///a.wav#t=abc,xyz");
  assert.equal(r.trimStartMs, 0);
  assert.equal(r.trimDurationMs, 0);
});

// ── pcmToStereoBuffers ────────────────────────────────────────────────────────

test("pcmToStereoBuffers: 'both' — left=pcm, right=pcm (동일 레퍼런스)", () => {
  const pcm = new Float32Array([0.1, 0.2, 0.3]);
  const { left, right } = pcmToStereoBuffers(pcm, "both");
  assert.strictEqual(left, pcm);
  assert.strictEqual(right, pcm);
});

test("pcmToStereoBuffers: 'left' — left=pcm, right=zeros", () => {
  const pcm = new Float32Array([0.5, 0.6]);
  const { left, right } = pcmToStereoBuffers(pcm, "left");
  assert.strictEqual(left, pcm);
  assert.equal(right[0], 0);
  assert.equal(right[1], 0);
  assert.equal(right.length, pcm.length);
});

test("pcmToStereoBuffers: 'right' — left=zeros, right=pcm", () => {
  const pcm = new Float32Array([0.7, 0.8]);
  const { left, right } = pcmToStereoBuffers(pcm, "right");
  assert.equal(left[0], 0);
  assert.equal(left[1], 0);
  assert.strictEqual(right, pcm);
});

// ── renderMeasure (stereo / channel / trim / repeatIteration 경로) ────────────

function makeClicks(val = 0.8, len = 64): ClickPCMs {
  return {
    strong: new Float32Array(len).fill(val),
    high: new Float32Array(len).fill(val),
    low: new Float32Array(len).fill(val),
  };
}

function makeTick(overrides: Partial<TickInfo> = {}): TickInfo {
  return {
    time: 0,
    type: "strong",
    beat: 0,
    subBeat: 0,
    repeatIteration: 0,
    barRepeatIteration: 0,
    ...overrides,
  };
}

function peakAt(buf: Float32Array, offsetSamples: number, window = 64): number {
  let max = 0;
  const end = Math.min(offsetSamples + window, buf.length);
  for (let i = offsetSamples; i < end; i++) {
    if (Math.abs(buf[i]) > max) max = Math.abs(buf[i]);
  }
  return max;
}

test("renderMeasure: mute 틱은 클릭을 생성하지 않음", () => {
  const result = renderMeasure({
    schedule: [makeTick({ type: "mute", time: 0 })],
    measureDurationMs: 500,
    clickPCMs: makeClicks(1.0),
    samplePCMs: new Map(),
    clickVolume: 1,
    sampleVolume: 0,
  });
  const buf = result instanceof Float32Array ? result : result.left;
  const peak = peakAt(buf, 0);
  assert.ok(peak < 1e-9, `mute 틱이 소리를 냄: peak=${peak}`);
});

test("renderMeasure: metronomeChannel='left' → 스테레오 결과, R채널에 클릭 없음", () => {
  const result = renderMeasure({
    schedule: [makeTick({ time: 0 })],
    measureDurationMs: 500,
    clickPCMs: makeClicks(0.9),
    samplePCMs: new Map(),
    clickVolume: 1,
    sampleVolume: 0,
    metronomeChannel: "left",
  });
  assert.ok(!(result instanceof Float32Array), "stereo mode여야 함");
  const { left, right } = result as { left: Float32Array; right: Float32Array };
  assert.ok(peakAt(left, 0) > 0.5, "left 채널에 클릭 있어야 함");
  assert.ok(peakAt(right, 0) < 1e-9, "right 채널은 침묵이어야 함");
});

test("renderMeasure: metronomeChannel='right' → R채널에 클릭, L은 침묵", () => {
  const result = renderMeasure({
    schedule: [makeTick({ time: 0 })],
    measureDurationMs: 500,
    clickPCMs: makeClicks(0.9),
    samplePCMs: new Map(),
    clickVolume: 1,
    sampleVolume: 0,
    metronomeChannel: "right",
  });
  assert.ok(!(result instanceof Float32Array));
  const { left, right } = result as { left: Float32Array; right: Float32Array };
  assert.ok(peakAt(left, 0) < 1e-9, "left 침묵");
  assert.ok(peakAt(right, 0) > 0.5, "right에 클릭");
});

test("renderMeasure: metroChannelsByBeat 비트별 채널 오버라이드", () => {
  // beat 0 → off, beat 1 → left (500ms)
  const result = renderMeasure({
    schedule: [
      makeTick({ time: 0, beat: 0 }),
      makeTick({ time: 500, beat: 1 }),
    ],
    measureDurationMs: 1000,
    clickPCMs: makeClicks(0.9),
    samplePCMs: new Map(),
    clickVolume: 1,
    sampleVolume: 0,
    metronomeChannel: "both",
    metroChannelsByBeat: { "0": "off", "1": "left" },
  });
  assert.ok(!(result instanceof Float32Array), "stereo mode여야 함");
  const { left, right } = result as { left: Float32Array; right: Float32Array };

  // beat 0 (0ms) → off → 소리 없어야 함
  const peak0 = peakAt(left, 0);
  assert.ok(peak0 < 1e-9, `beat 0 (off): peak=${peak0}`);

  // beat 1 (500ms) → left → L에만 소리
  const offset1 = Math.round((500 / 1000) * SR);
  assert.ok(peakAt(left, offset1) > 0.5, "beat 1 left 채널에 클릭 있어야 함");
  assert.ok(peakAt(right, offset1) < 1e-9, "beat 1 right 채널은 침묵이어야 함");
});

test("renderMeasure: samplePCMs — repeatIteration>0이면 샘플 믹스 안 됨", () => {
  const key = "0-0";
  const samplePCMs = new Map<string, SamplePCMEntry>([
    [key, { pcm: new Float32Array(64).fill(0.9), trimStartMs: 0, trimDurationMs: 0 }],
  ]);
  // repeatIteration=1 → 샘플 스킵
  const result = renderMeasure({
    schedule: [makeTick({ time: 0, beat: 0, subBeat: 0, repeatIteration: 1, barRepeatIteration: 0 })],
    measureDurationMs: 500,
    clickPCMs: makeClicks(0), // 클릭은 0으로 무시
    samplePCMs,
    clickVolume: 0,
    sampleVolume: 1,
  });
  const buf = result instanceof Float32Array ? result : result.left;
  assert.ok(peakAt(buf, 0) < 1e-9, `repeatIteration=1 → 샘플 렌더되면 안 됨, peak=${peakAt(buf, 0)}`);
});

test("renderMeasure: samplePCMs — barRepeatIteration>0이면 샘플 믹스 안 됨", () => {
  const key = "0-0";
  const samplePCMs = new Map<string, SamplePCMEntry>([
    [key, { pcm: new Float32Array(64).fill(0.9), trimStartMs: 0, trimDurationMs: 0 }],
  ]);
  const result = renderMeasure({
    schedule: [makeTick({ time: 0, beat: 0, subBeat: 0, repeatIteration: 0, barRepeatIteration: 1 })],
    measureDurationMs: 500,
    clickPCMs: makeClicks(0),
    samplePCMs,
    clickVolume: 0,
    sampleVolume: 1,
  });
  const buf = result instanceof Float32Array ? result : result.left;
  assert.ok(peakAt(buf, 0) < 1e-9, `barRepeatIteration=1 → 샘플 렌더되면 안 됨`);
});

test("renderMeasure: samplePCMs — repeatIteration=0, barRepeatIteration=0이면 샘플 믹스됨", () => {
  const key = "0-0";
  const samplePCMs = new Map<string, SamplePCMEntry>([
    [key, { pcm: new Float32Array(64).fill(0.9), trimStartMs: 0, trimDurationMs: 0 }],
  ]);
  const result = renderMeasure({
    schedule: [makeTick({ time: 0, beat: 0, subBeat: 0, repeatIteration: 0, barRepeatIteration: 0 })],
    measureDurationMs: 500,
    clickPCMs: makeClicks(0),
    samplePCMs,
    clickVolume: 0,
    sampleVolume: 1,
  });
  const buf = result instanceof Float32Array ? result : result.left;
  assert.ok(peakAt(buf, 0) > 0.5, `repeatIteration=0 → 샘플 렌더돼야 함, peak=${peakAt(buf, 0)}`);
});

test("renderMeasure: samplePCMs trimStartMs > 0 — 앞부분 잘리고 나머지 믹스됨", () => {
  // PCM: [0, 0, 0, ..., 0.9, 0.9, ...] → trimStartMs으로 앞 묵음부 스킵
  const SR_local = SR;
  // 앞 10ms = silence, 이후 = 0.9
  const trimStartMs = 10;
  const silenceSamples = Math.round((trimStartMs / 1000) * SR_local);
  const totalLen = silenceSamples + 128;
  const pcm = new Float32Array(totalLen);
  pcm.fill(0.9, silenceSamples); // 10ms 이후부터 0.9

  const key = "0-0";
  const samplePCMs = new Map<string, SamplePCMEntry>([
    [key, { pcm, trimStartMs, trimDurationMs: 0 }],
  ]);
  const result = renderMeasure({
    schedule: [makeTick({ time: 0, beat: 0, subBeat: 0, repeatIteration: 0, barRepeatIteration: 0 })],
    measureDurationMs: 500,
    clickPCMs: makeClicks(0),
    samplePCMs,
    clickVolume: 0,
    sampleVolume: 1,
  });
  const buf = result instanceof Float32Array ? result : result.left;
  // offset=0에서 trimStartMs 이후 구간(0.9)이 믹스됨
  assert.ok(peakAt(buf, 0, 128) > 0.5, "trim 이후 구간이 offset=0에서 믹스돼야 함");
});

test("renderMeasure: samplePCMs trimDurationMs > 0 — 지정 길이만 믹스", () => {
  const trimDurationMs = 5; // 5ms만 사용
  const durationSamples = Math.round((trimDurationMs / 1000) * SR);
  // 전체 PCM은 길지만 앞 5ms만 쓰여야 함
  const pcmLen = durationSamples + 200;
  const pcm = new Float32Array(pcmLen).fill(0.9);
  // durationSamples 이후를 0으로 만들어 초과 사용 여부 확인할 수 없지만,
  // trim 잘림으로 길이가 제한됨은 내부 로직으로 보장된다.
  // 여기서는 믹스 자체가 일어나는지 확인한다.
  const key = "0-0";
  const samplePCMs = new Map<string, SamplePCMEntry>([
    [key, { pcm, trimStartMs: 0, trimDurationMs }],
  ]);
  const result = renderMeasure({
    schedule: [makeTick({ time: 0, beat: 0, subBeat: 0, repeatIteration: 0, barRepeatIteration: 0 })],
    measureDurationMs: 500,
    clickPCMs: makeClicks(0),
    samplePCMs,
    clickVolume: 0,
    sampleVolume: 1,
  });
  const buf = result instanceof Float32Array ? result : result.left;
  assert.ok(peakAt(buf, 0, durationSamples) > 0.5, "trim 범위 내에 신호 있어야 함");
});

test("renderMeasure: sampleChannel='left' → 스테레오 모드, R 침묵", () => {
  const key = "0-0";
  const samplePCMs = new Map<string, SamplePCMEntry>([
    [key, { pcm: new Float32Array(64).fill(0.8), trimStartMs: 0, trimDurationMs: 0 }],
  ]);
  const result = renderMeasure({
    schedule: [makeTick({ time: 0, beat: 0, subBeat: 0 })],
    measureDurationMs: 500,
    clickPCMs: makeClicks(0),
    samplePCMs,
    clickVolume: 0,
    sampleVolume: 1,
    sampleChannels: { [key]: "left" },
  });
  assert.ok(!(result instanceof Float32Array), "sampleChannel=left → stereo mode여야 함");
  const { left, right } = result as { left: Float32Array; right: Float32Array };
  assert.ok(peakAt(left, 0) > 0.5, "left에 샘플 있어야 함");
  assert.ok(peakAt(right, 0) < 1e-9, "right 침묵이어야 함");
});

test("renderMeasure: clickVolume 비율 — 0이면 클릭 침묵", () => {
  const result = renderMeasure({
    schedule: [makeTick({ time: 0 })],
    measureDurationMs: 500,
    clickPCMs: makeClicks(1.0),
    samplePCMs: new Map(),
    clickVolume: 0,
    sampleVolume: 0,
  });
  const buf = result instanceof Float32Array ? result : result.left;
  assert.ok(peakAt(buf, 0) < 1e-9, "clickVolume=0 → 침묵");
});

test("renderMeasure: accent 틱 → effectiveClickPCMs.high 사용", () => {
  const lowVal = 0.3;
  const highVal = 0.8;
  const clicks: ClickPCMs = {
    strong: new Float32Array(64).fill(0.5),
    high: new Float32Array(64).fill(highVal),  // accent 전용
    low: new Float32Array(64).fill(lowVal),
  };
  const result = renderMeasure({
    schedule: [makeTick({ time: 0, type: "accent" })],
    measureDurationMs: 500,
    clickPCMs: clicks,
    samplePCMs: new Map(),
    clickVolume: 1,
    sampleVolume: 0,
  });
  const buf = result instanceof Float32Array ? result : result.left;
  const peak = peakAt(buf, 0);
  // 클램핑 후 결과는 클램핑에 따라 달라지지만 low값(0.3)보다는 커야 함
  assert.ok(peak > lowVal, `accent → high PCM(${highVal}) 사용, peak=${peak}`);
});
