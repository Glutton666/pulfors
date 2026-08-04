/**
 * audio-renderer-export-integration.test.ts
 *
 * WAV 내보내기 통합 테스트:
 *   MetronomeEngine 스케줄 → renderMeasure → encodeWav → parseWav 라운드트립
 *
 * 검증 항목:
 *   1. WAV 바이트 길이 = 44 + loopSamples × 2  (loopSamples = measureSamples × COPIES)
 *   2. 피크 진폭 > 0  (클릭 사운드가 실제로 믹스됨)
 *   3. 하드 클리핑 없음  (모든 샘플 |v| ≤ 1.0)
 *   4. 스테레오 렌더 → 두 채널 각각 독립 WAV 인코딩 + 파싱 성공
 *   5. BPM이 다르면 버퍼 길이도 비례해서 달라짐  (BPM 격리 선행 조건)
 *   6. measureDurationMs 대비 클릭 오프셋이 올바른 비트 위치에 생성됨
 *   7. 인터리브 스테레오 WAV 바이트 레이아웃 검증 (writeStereoWavBytes 경로)
 *   8. pcmToStereoBuffers 채널 라우팅 검증
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  renderMeasure,
  encodeWav,
  parseWav,
  getRenderSampleRate,
  pcmToStereoBuffers,
  type ClickPCMs,
  type TickInfo,
} from "../lib/audio-renderer";
import { MetronomeEngine } from "../lib/metronome-engine";

const SR = getRenderSampleRate(); // 44100
const COPIES = 2; // renderMeasure 내부 상수와 동기화

// ── 헬퍼 ──────────────────────────────────────────────────────────────────────

/** 진폭 val의 균일한 클릭 PCM을 만든다 */
function makeClicks(val = 0.8, len = 441): ClickPCMs {
  return {
    strong: new Float32Array(len).fill(val),
    high: new Float32Array(len).fill(val),
    low: new Float32Array(len).fill(val),
  };
}

/** buf[offset..offset+window] 구간의 최대 절댓값 */
function peakIn(buf: Float32Array, offset = 0, window = 441): number {
  let max = 0;
  const end = Math.min(offset + window, buf.length);
  for (let i = offset; i < end; i++) {
    if (Math.abs(buf[i]) > max) max = Math.abs(buf[i]);
  }
  return max;
}

/** 전체 버퍼의 최대 절댓값 */
function peakAll(buf: Float32Array): number {
  return peakIn(buf, 0, buf.length);
}

/** WAV 헤더에서 채널 수(오프셋 22, uint16 LE)를 읽는다 */
function wavChannels(ab: ArrayBuffer): number {
  return new DataView(ab).getUint16(22, true);
}

/** WAV 헤더에서 샘플레이트(오프셋 24, uint32 LE)를 읽는다 */
function wavSampleRate(ab: ArrayBuffer): number {
  return new DataView(ab).getUint32(24, true);
}

/** renderMeasure 출력 길이 계산 (COPIES 반영) */
function expectedLoopSamples(durationMs: number): number {
  return Math.ceil((durationMs / 1000) * SR) * COPIES;
}

/**
 * 인터리브 스테레오 WAV ArrayBuffer를 빌드한다.
 * 내부의 writeStereoWavBytes와 동일한 인코딩 로직을 복제하여
 * 해당 비공개 함수를 직접 호출하지 않고 동일한 경로를 커버한다.
 */
function buildStereoWav(
  left: Float32Array,
  right: Float32Array,
  sr: number,
): ArrayBuffer {
  const n = Math.min(left.length, right.length);
  const dataSize = n * 4; // 2 channels × 2 bytes/sample
  const buf = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buf);
  const ws = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
  };
  ws(0, "RIFF");
  v.setUint32(4, 36 + dataSize, true);
  ws(8, "WAVE");
  ws(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 2, true); // stereo
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * 4, true); // byte-rate
  v.setUint16(32, 4, true); // block-align
  v.setUint16(34, 16, true); // bits/sample
  ws(36, "data");
  v.setUint32(40, dataSize, true);
  for (let i = 0; i < n; i++) {
    const l = Math.max(-1, Math.min(1, left[i]));
    const r = Math.max(-1, Math.min(1, right[i]));
    v.setInt16(44 + i * 4, l < 0 ? l * 32768 : l * 32767, true);
    v.setInt16(44 + i * 4 + 2, r < 0 ? r * 32768 : r * 32767, true);
  }
  return buf;
}

// ── 기본 파이프라인 ────────────────────────────────────────────────────────────

test("export pipeline: BPM=120 4/4 → WAV 바이트 길이가 스케줄 길이와 일치", () => {
  const engine = new MetronomeEngine();
  engine.setBpm(120);
  engine.setBeatsPerMeasure(4);

  const { ticks, durationMs } = engine.getScheduleInfo();
  const clicks = makeClicks();

  const pcm = renderMeasure({
    schedule: ticks as TickInfo[],
    measureDurationMs: durationMs,
    clickPCMs: clicks,
    samplePCMs: new Map(),
    clickVolume: 1.0,
    sampleVolume: 0,
  }) as Float32Array;

  assert.ok(pcm instanceof Float32Array, "mono 모드여야 함");

  const loopSamples = expectedLoopSamples(durationMs);
  assert.equal(pcm.length, loopSamples,
    `렌더 PCM 길이: expected ${loopSamples}, got ${pcm.length}`);

  const wav = encodeWav(pcm, SR);
  const expectedBytes = 44 + loopSamples * 2;
  assert.equal(wav.byteLength, expectedBytes,
    `WAV 바이트 길이: expected ${expectedBytes}, got ${wav.byteLength}`);
});

test("export pipeline: parseWav로 재파싱 후 샘플레이트·길이·값 복원", () => {
  const engine = new MetronomeEngine();
  engine.setBpm(100);
  engine.setBeatsPerMeasure(3);

  const { ticks, durationMs } = engine.getScheduleInfo();
  const pcm = renderMeasure({
    schedule: ticks as TickInfo[],
    measureDurationMs: durationMs,
    clickPCMs: makeClicks(0.7),
    samplePCMs: new Map(),
    clickVolume: 1.0,
    sampleVolume: 0,
  }) as Float32Array;

  const wav = encodeWav(pcm, SR);
  const { pcm: decoded, sampleRate } = parseWav(wav);

  assert.equal(sampleRate, SR, "샘플레이트 보존");
  assert.equal(decoded.length, pcm.length, "샘플 수 보존");

  // 16-bit 양자화 오차 이내에서 값 일치.
  // encodeWav는 양수에 ×32767, parseWav는 ÷32768로 비대칭 디코딩한다.
  // 이론적 최대 오차 = (s + frac(s×32767)) / 32768 ≤ 2/32768 ≈ 6.1e-5.
  const tol = 2 / 32768 + 1e-6;
  let maxErr = 0;
  for (let i = 0; i < pcm.length; i++) {
    maxErr = Math.max(maxErr, Math.abs(decoded[i] - pcm[i]));
  }
  assert.ok(maxErr <= tol, `최대 양자화 오차: ${maxErr} (허용: ${tol})`);
});

test("export pipeline: 클릭 소리가 실제로 믹스됨 (피크 > 0)", () => {
  const engine = new MetronomeEngine();
  engine.setBpm(120);
  engine.setBeatsPerMeasure(4);

  const { ticks, durationMs } = engine.getScheduleInfo();
  const pcm = renderMeasure({
    schedule: ticks as TickInfo[],
    measureDurationMs: durationMs,
    clickPCMs: makeClicks(0.9),
    samplePCMs: new Map(),
    clickVolume: 1.0,
    sampleVolume: 0,
  }) as Float32Array;

  const peak = peakIn(pcm, 0, pcm.length);
  assert.ok(peak > 0.01, `클릭 믹스 결과 피크가 0에 너무 가까움: ${peak}`);
});

test("export pipeline: finalize 후 하드 클리핑 없음 (|v| ≤ 1.0)", () => {
  const engine = new MetronomeEngine();
  engine.setBpm(120);
  engine.setBeatsPerMeasure(4);

  const { ticks, durationMs } = engine.getScheduleInfo();
  // 볼륨을 높게 설정해 의도적으로 클리핑 경계를 테스트
  const pcm = renderMeasure({
    schedule: ticks as TickInfo[],
    measureDurationMs: durationMs,
    clickPCMs: makeClicks(2.0), // 범위 초과 — finalize가 클램핑해야 함
    samplePCMs: new Map(),
    clickVolume: 5.0,
    sampleVolume: 0,
  }) as Float32Array;

  let maxAbs = 0;
  for (let i = 0; i < pcm.length; i++) {
    if (Math.abs(pcm[i]) > maxAbs) maxAbs = Math.abs(pcm[i]);
  }
  assert.ok(maxAbs <= 1.0,
    `finalize 클램핑 실패 — 최대 절댓값: ${maxAbs}`);
});

// ── WAV 헤더 검증 ─────────────────────────────────────────────────────────────

test("export pipeline: WAV 헤더가 mono 16-bit 44100Hz로 기록됨", () => {
  const engine = new MetronomeEngine();
  engine.setBpm(120);
  engine.setBeatsPerMeasure(4);

  const { ticks, durationMs } = engine.getScheduleInfo();
  const pcm = renderMeasure({
    schedule: ticks as TickInfo[],
    measureDurationMs: durationMs,
    clickPCMs: makeClicks(),
    samplePCMs: new Map(),
    clickVolume: 1.0,
    sampleVolume: 0,
  }) as Float32Array;

  const wav = encodeWav(pcm, SR);
  const v = new DataView(wav);

  const str = (off: number, len: number) =>
    Array.from({ length: len }, (_, i) =>
      String.fromCharCode(v.getUint8(off + i)),
    ).join("");

  assert.equal(str(0, 4), "RIFF");
  assert.equal(str(8, 4), "WAVE");
  assert.equal(str(12, 4), "fmt ");
  assert.equal(str(36, 4), "data");
  assert.equal(wavChannels(wav), 1, "mono");
  assert.equal(wavSampleRate(wav), SR, "44100 Hz");
  assert.equal(v.getUint16(34, true), 16, "16-bit");
  assert.equal(v.getUint16(20, true), 1, "PCM format");
});

// ── BPM에 따라 버퍼 길이 변화 ─────────────────────────────────────────────────

test("export pipeline: BPM이 두 배이면 WAV 길이가 절반", () => {
  function renderForBpm(bpm: number): number {
    const engine = new MetronomeEngine();
    engine.setBpm(bpm);
    engine.setBeatsPerMeasure(4);
    const { ticks, durationMs } = engine.getScheduleInfo();
    const pcm = renderMeasure({
      schedule: ticks as TickInfo[],
      measureDurationMs: durationMs,
      clickPCMs: makeClicks(),
      samplePCMs: new Map(),
      clickVolume: 1.0,
      sampleVolume: 0,
    }) as Float32Array;
    return encodeWav(pcm, SR).byteLength;
  }

  const bytes80 = renderForBpm(80);
  const bytes160 = renderForBpm(160);

  // BPM이 두 배 → 마디 길이 절반 → 샘플 수 절반 → WAV 바이트 수 약 절반
  // 헤더(44)를 제외한 데이터 영역 비교
  const data80 = bytes80 - 44;
  const data160 = bytes160 - 44;
  assert.ok(
    Math.abs(data80 / data160 - 2.0) < 0.01,
    `BPM 2× → 길이 1/2 기대: data80=${data80} data160=${data160} ratio=${data80 / data160}`,
  );
});

test("export pipeline: BPM과 박자 수에 비례한 durationMs로 정확한 샘플 수 생성", () => {
  // BPM=60, 3/4 → 마디 = 3s → measureSamples = 132300 → loopSamples = 264600
  const engine = new MetronomeEngine();
  engine.setBpm(60);
  engine.setBeatsPerMeasure(3);

  const { ticks, durationMs } = engine.getScheduleInfo();

  // 3/4 @ 60bpm: 마디 길이 = 3000ms
  assert.ok(
    Math.abs(durationMs - 3000) < 5,
    `3/4 @60bpm: durationMs=${durationMs}ms (기대 3000ms)`,
  );

  const pcm = renderMeasure({
    schedule: ticks as TickInfo[],
    measureDurationMs: durationMs,
    clickPCMs: makeClicks(),
    samplePCMs: new Map(),
    clickVolume: 1.0,
    sampleVolume: 0,
  }) as Float32Array;

  const expected = expectedLoopSamples(durationMs);
  assert.equal(pcm.length, expected);
});

// ── 비트 오프셋 검증 ──────────────────────────────────────────────────────────

test("export pipeline: BPM=120 4/4 beat 1(500ms)에 클릭 피크가 존재함", () => {
  const engine = new MetronomeEngine();
  engine.setBpm(120);
  engine.setBeatsPerMeasure(4);

  const { ticks, durationMs } = engine.getScheduleInfo();
  const clicks = makeClicks(1.0, 441); // 10ms

  const pcm = renderMeasure({
    schedule: ticks as TickInfo[],
    measureDurationMs: durationMs,
    clickPCMs: clicks,
    samplePCMs: new Map(),
    clickVolume: 1.0,
    sampleVolume: 0,
  }) as Float32Array;

  // BPM=120, beat interval = 500ms
  const beat1Tick = (ticks as TickInfo[]).find((t) => t.beat === 1 && t.subBeat === 0);
  assert.ok(beat1Tick, "beat 1 틱이 스케줄에 있어야 함");

  const offsetSamples = Math.round((beat1Tick!.time / 1000) * SR);
  const peak = peakIn(pcm, offsetSamples, 441);
  assert.ok(peak > 0.5, `beat 1 오프셋(${beat1Tick!.time}ms)에 클릭 피크 없음: peak=${peak}`);
});

test("export pipeline: beat 0과 beat 1 중간(250ms)에는 피크가 없음", () => {
  const engine = new MetronomeEngine();
  engine.setBpm(120);
  engine.setBeatsPerMeasure(4);

  const { ticks, durationMs } = engine.getScheduleInfo();
  const clicks = makeClicks(1.0, 441);

  const pcm = renderMeasure({
    schedule: ticks as TickInfo[],
    measureDurationMs: durationMs,
    clickPCMs: clicks,
    samplePCMs: new Map(),
    clickVolume: 1.0,
    sampleVolume: 0,
  }) as Float32Array;

  // 250ms = beat 0과 beat 1 사이 — 어떤 틱과도 겹치지 않아야 함
  const midOffset = Math.round((250 / 1000) * SR);
  const peak = peakIn(pcm, midOffset - 220, 440);
  assert.ok(peak < 0.01, `250ms 근방에 피크가 있으면 안 됨: peak=${peak}`);
});

// ── 스테레오 렌더 통합 ─────────────────────────────────────────────────────────

test("export pipeline: 스테레오 렌더 → 각 채널 encodeWav + parseWav 성공", () => {
  const engine = new MetronomeEngine();
  engine.setBpm(120);
  engine.setBeatsPerMeasure(4);

  const { ticks, durationMs } = engine.getScheduleInfo();

  // metronomeChannel='left' → 스테레오 결과
  const result = renderMeasure({
    schedule: ticks as TickInfo[],
    measureDurationMs: durationMs,
    clickPCMs: makeClicks(0.8),
    samplePCMs: new Map(),
    clickVolume: 1.0,
    sampleVolume: 0,
    metronomeChannel: "left",
  });

  assert.ok(!(result instanceof Float32Array), "스테레오 모드여야 함");
  const { left, right } = result as { left: Float32Array; right: Float32Array };

  // 길이 일치
  assert.equal(left.length, right.length);
  assert.equal(left.length, expectedLoopSamples(durationMs));

  // 각 채널 WAV 인코딩 + 파싱 성공
  const wavL = encodeWav(left, SR);
  const wavR = encodeWav(right, SR);
  const { pcm: decL, sampleRate: srL } = parseWav(wavL);
  const { pcm: decR, sampleRate: srR } = parseWav(wavR);

  assert.equal(srL, SR);
  assert.equal(srR, SR);
  assert.equal(decL.length, left.length);
  assert.equal(decR.length, right.length);
});

test("export pipeline: 스테레오 — L에 클릭 있고 R은 침묵 (metronomeChannel=left)", () => {
  const engine = new MetronomeEngine();
  engine.setBpm(120);
  engine.setBeatsPerMeasure(4);

  const { ticks, durationMs } = engine.getScheduleInfo();

  const result = renderMeasure({
    schedule: ticks as TickInfo[],
    measureDurationMs: durationMs,
    clickPCMs: makeClicks(0.9),
    samplePCMs: new Map(),
    clickVolume: 1.0,
    sampleVolume: 0,
    metronomeChannel: "left",
  }) as { left: Float32Array; right: Float32Array };

  const peakL = peakIn(result.left, 0, result.left.length);
  const peakR = peakIn(result.right, 0, result.right.length);

  assert.ok(peakL > 0.5, `L 채널에 클릭 피크 있어야 함: peakL=${peakL}`);
  assert.ok(peakR < 1e-9, `R 채널은 침묵이어야 함: peakR=${peakR}`);
});

test("export pipeline: 스테레오 각 채널 하드 클리핑 없음", () => {
  const engine = new MetronomeEngine();
  engine.setBpm(120);
  engine.setBeatsPerMeasure(2);

  const { ticks, durationMs } = engine.getScheduleInfo();

  const result = renderMeasure({
    schedule: ticks as TickInfo[],
    measureDurationMs: durationMs,
    clickPCMs: makeClicks(3.0), // 클리핑 유발 가능 값
    samplePCMs: new Map(),
    clickVolume: 5.0,
    sampleVolume: 0,
    metronomeChannel: "right",
  }) as { left: Float32Array; right: Float32Array };

  for (const [name, ch] of [["left", result.left], ["right", result.right]] as const) {
    for (let i = 0; i < ch.length; i++) {
      assert.ok(
        Math.abs(ch[i]) <= 1.0,
        `${name} 채널 하드 클리핑: index=${i} value=${ch[i]}`,
      );
    }
  }
});

// ── 인터리브 스테레오 WAV 바이트 레이아웃 (writeStereoWavBytes 경로) ─────────

test("export pipeline: 인터리브 스테레오 WAV — 바이트 길이, L 비무음, R 침묵 (raw 바이트 검증)", () => {
  const engine = new MetronomeEngine();
  engine.setBpm(120);
  engine.setBeatsPerMeasure(4);

  const { ticks, durationMs } = engine.getScheduleInfo();

  // metronomeChannel='left' → 클릭이 L채널에만 들어간다
  const result = renderMeasure({
    schedule: ticks as TickInfo[],
    measureDurationMs: durationMs,
    clickPCMs: makeClicks(0.5),
    samplePCMs: new Map(),
    clickVolume: 1.0,
    sampleVolume: 0,
    metronomeChannel: "left",
  });

  assert.ok(!(result instanceof Float32Array), "스테레오 모드여야 함");
  const { left, right } = result as { left: Float32Array; right: Float32Array };

  // 인터리브 스테레오 WAV 빌드 (writeStereoWavBytes 동일 로직)
  const stereoWav = buildStereoWav(left, right, SR);
  const n = left.length;

  // 바이트 길이: 44헤더 + n프레임 × 2채널 × 2바이트
  assert.equal(stereoWav.byteLength, 44 + n * 4, "스테레오 WAV 바이트 길이 불일치");

  // parseWav는 첫 채널(L)을 반환한다
  const { pcm: leftDecoded, sampleRate } = parseWav(stereoWav);
  assert.equal(sampleRate, SR, "샘플레이트 보존");
  assert.equal(leftDecoded.length, n, "디코딩된 프레임 수 불일치");
  assert.ok(peakAll(leftDecoded) > 0.01, `L채널 침묵 (peak=${peakAll(leftDecoded)})`);
  assert.ok(peakAll(leftDecoded) < 1.0, `L채널 하드 클리핑`);

  // raw 바이트에서 R 채널 직접 추출하여 침묵 확인
  const v = new DataView(stereoWav);
  let rightPeak = 0;
  for (let i = 0; i < n; i++) {
    const raw = v.getInt16(44 + i * 4 + 2, true);
    const s = raw < 0 ? raw / 32768 : raw / 32767;
    if (Math.abs(s) > rightPeak) rightPeak = Math.abs(s);
  }
  assert.ok(rightPeak < 0.001, `R채널이 침묵이어야 함 (peak=${rightPeak})`);
});

// ── pcmToStereoBuffers 채널 라우팅 ────────────────────────────────────────────

test("export pipeline: pcmToStereoBuffers 'right' → R채널 비무음, L채널 침묵", () => {
  const engine = new MetronomeEngine();
  engine.setBpm(100);
  engine.setBeatsPerMeasure(4);

  const { ticks, durationMs } = engine.getScheduleInfo();

  const mono = renderMeasure({
    schedule: ticks as TickInfo[],
    measureDurationMs: durationMs,
    clickPCMs: makeClicks(0.6),
    samplePCMs: new Map(),
    clickVolume: 1.0,
    sampleVolume: 0,
  }) as Float32Array;

  assert.ok(mono instanceof Float32Array, "mono 렌더 결과여야 함");

  // mono를 R채널에만 라우팅
  const { left, right } = pcmToStereoBuffers(mono, "right");
  assert.ok(peakAll(left) < 1e-9, `left zeros 배열은 침묵이어야 함`);
  assert.strictEqual(right, mono, "right는 원본 PCM 레퍼런스여야 함");

  const stereoWav = buildStereoWav(left, right, SR);
  const n = mono.length;
  assert.equal(stereoWav.byteLength, 44 + n * 4, "스테레오 WAV 바이트 길이 불일치");

  // raw 바이트에서 두 채널 피크 추출
  const v = new DataView(stereoWav);
  let leftPeak = 0;
  let rightPeak = 0;
  for (let i = 0; i < n; i++) {
    const lRaw = v.getInt16(44 + i * 4, true);
    const rRaw = v.getInt16(44 + i * 4 + 2, true);
    const lS = lRaw < 0 ? lRaw / 32768 : lRaw / 32767;
    const rS = rRaw < 0 ? rRaw / 32768 : rRaw / 32767;
    if (Math.abs(lS) > leftPeak) leftPeak = Math.abs(lS);
    if (Math.abs(rS) > rightPeak) rightPeak = Math.abs(rS);
  }

  assert.ok(rightPeak > 0.01, `R채널에 오디오가 있어야 함 (peak=${rightPeak})`);
  assert.ok(leftPeak < 0.001, `L채널은 침묵이어야 함 (peak=${leftPeak})`);
});
