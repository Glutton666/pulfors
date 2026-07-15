import { test } from "node:test";
import assert from "node:assert/strict";
import {
  renderMeasure,
  getRenderSampleRate,
  type ClickPCMs,
  type TickInfo,
} from "../lib/audio-renderer";
import { MetronomeEngine } from "../lib/metronome-engine";

const SR = getRenderSampleRate(); // 44100

function makeClickPCMs(val: number, len = 64): ClickPCMs {
  return {
    strong: new Float32Array(len).fill(val),
    high: new Float32Array(len).fill(val),
    low: new Float32Array(len).fill(val),
  };
}

function msToSample(ms: number): number {
  return Math.round((ms / 1000) * SR);
}

function peakAt(buf: Float32Array, offsetSamples: number, windowLen = 64): number {
  let max = 0;
  const end = Math.min(offsetSamples + windowLen, buf.length);
  for (let i = offsetSamples; i < end; i++) {
    if (Math.abs(buf[i]) > max) max = Math.abs(buf[i]);
  }
  return max;
}

/**
 * Core invariant: once the schedule is captured from the engine via
 * getScheduleInfo(), renderMeasure() receives only that frozen schedule.
 * Any BPM mutation that happens after capture cannot affect the rendered PCM,
 * because renderMeasure has no reference back to the engine.
 *
 * Beats in the engine are 0-indexed:
 *   BPM=120 4/4 → beat 0 = 0ms, beat 1 = 500ms, beat 2 = 1000ms, beat 3 = 1500ms
 *   BPM=240 4/4 → beat 0 = 0ms, beat 1 = 250ms, beat 2 = 500ms, beat 3 = 750ms
 */

test("내보내기 시작 시 BPM이 고정됨: 이후 BPM 변경이 렌더 결과에 영향을 주지 않음", () => {
  const engine = new MetronomeEngine();
  engine.setBpm(120);
  engine.setBeatsPerMeasure(4);

  // BPM=120에서 스케줄을 캡처 (내보내기 시작 시점과 동일)
  const capturedInfo = engine.getScheduleInfo();

  // "내보내기 중 BPM 변경" 시뮬레이션 — 캡처 후 BPM을 두 배로 올린다
  engine.setBpm(240);

  const clickPCMs = makeClickPCMs(0.8);

  // 캡처된 스케줄로 렌더 (변경된 BPM=240은 renderMeasure에 전달되지 않음)
  const result = renderMeasure({
    schedule: capturedInfo.ticks as TickInfo[],
    measureDurationMs: capturedInfo.durationMs,
    clickPCMs,
    samplePCMs: new Map(),
    clickVolume: 1.0,
    sampleVolume: 0,
  });

  const buf = result instanceof Float32Array ? result : result.left;

  // BPM=120, 4/4: beat 1 (0-indexed, the second beat) is at ~500ms
  const beat1Tick = capturedInfo.ticks.find((t) => t.beat === 1 && t.subBeat === 0);
  assert.ok(beat1Tick, "beat 1 틱이 캡처된 스케줄에 있어야 함");
  const beat1Ms = beat1Tick!.time;
  assert.ok(
    Math.abs(beat1Ms - 500) < 10,
    `BPM=120에서 beat 1은 ~500ms여야 함: actual=${beat1Ms}ms`,
  );

  // 렌더 버퍼의 500ms 위치에 피크가 있어야 함 (BPM=120 기준)
  const peakAt500 = peakAt(buf, msToSample(beat1Ms));
  assert.ok(
    peakAt500 > 0.5,
    `캡처된 BPM=120 스케줄: ${beat1Ms}ms에 피크 있어야 함 (got ${peakAt500})`,
  );

  // BPM=240의 beat 1 위치(250ms)에는 BPM=120 스케줄에 틱이 없어야 함
  // BPM=120 beats: 0, 500, 1000, 1500ms → 250ms는 어떤 틱과도 겹치지 않음
  const peakAt250 = peakAt(buf, msToSample(250));
  assert.ok(
    peakAt250 < 0.05,
    `변경된 BPM=240의 beat 1 위치(250ms)에는 BPM=120 스케줄에 틱 없어야 함 (got ${peakAt250})`,
  );

  // 렌더 버퍼 길이가 BPM=120 기준이어야 함 (BPM=240 기준보다 훨씬 길어야 함)
  const expectedMeasureSamples = Math.ceil((capturedInfo.durationMs / 1000) * SR);
  const expectedBufLen = expectedMeasureSamples * 2; // renderMeasure는 COPIES=2
  assert.ok(
    Math.abs(buf.length - expectedBufLen) < 10,
    `렌더 버퍼 길이은 BPM=120 기준 ${expectedBufLen}이어야 함: actual=${buf.length}`,
  );
});

test("두 BPM의 렌더 결과가 서로 다른 버퍼 길이와 틱 간격을 가짐 (BPM 격리 선행 조건 검증)", () => {
  // BPM=80: 4/4, beat 1 = 750ms
  const engineA = new MetronomeEngine();
  engineA.setBpm(80);
  engineA.setBeatsPerMeasure(4);
  const infoA = engineA.getScheduleInfo();

  // BPM=160: 4/4, beat 1 = 375ms
  // BPM=80의 비트 위치(0, 750, 1500, 2250ms)와 BPM=160의 beat 1(375ms)은 겹치지 않음
  const engineB = new MetronomeEngine();
  engineB.setBpm(160);
  engineB.setBeatsPerMeasure(4);
  const infoB = engineB.getScheduleInfo();

  // 두 스케줄의 마디 길이가 명확히 달라야 함
  assert.ok(
    Math.abs(infoA.durationMs - infoB.durationMs) > 1000,
    `BPM=80/160 마디 길이 차이가 충분해야 함: A=${infoA.durationMs}ms, B=${infoB.durationMs}ms`,
  );

  const clickPCMs = makeClickPCMs(0.8);

  // BPM=80 스케줄로 렌더
  const resultA = renderMeasure({
    schedule: infoA.ticks as TickInfo[],
    measureDurationMs: infoA.durationMs,
    clickPCMs,
    samplePCMs: new Map(),
    clickVolume: 1.0,
    sampleVolume: 0,
  });

  // BPM=160 스케줄로 렌더
  const resultB = renderMeasure({
    schedule: infoB.ticks as TickInfo[],
    measureDurationMs: infoB.durationMs,
    clickPCMs,
    samplePCMs: new Map(),
    clickVolume: 1.0,
    sampleVolume: 0,
  });

  const bufA = resultA instanceof Float32Array ? resultA : resultA.left;
  const bufB = resultB instanceof Float32Array ? resultB : resultB.left;

  // 렌더 버퍼 길이가 BPM에 따라 달라야 함 (1초 이상 차이)
  assert.ok(
    Math.abs(bufA.length - bufB.length) > SR,
    `두 렌더의 샘플 수가 충분히 달라야 함: A=${bufA.length}, B=${bufB.length}`,
  );

  // BPM=80: beat 1(0-indexed) = 750ms — 해당 위치에 피크가 있어야 함
  const beat1msA = infoA.ticks.find((t) => t.beat === 1 && t.subBeat === 0)?.time ?? 750;
  const peakA_beat1 = peakAt(bufA, msToSample(beat1msA));
  assert.ok(
    peakA_beat1 > 0.5,
    `BPM=80 렌더: beat 1(${beat1msA}ms)에 피크 있어야 함 (got ${peakA_beat1})`,
  );

  // BPM=80 렌더에서 BPM=160의 beat 1 위치(375ms)에는 피크 없어야 함
  // BPM=80 beats: 0, 750, 1500, 2250ms → 375ms는 어떤 틱과도 겹치지 않음
  const beat1msB = infoB.ticks.find((t) => t.beat === 1 && t.subBeat === 0)?.time ?? 375;
  const peakA_at_bpmB_beat1 = peakAt(bufA, msToSample(beat1msB));
  assert.ok(
    peakA_at_bpmB_beat1 < 0.05,
    `BPM=80 렌더에서 BPM=160의 beat 1 위치(${beat1msB}ms)에는 피크 없어야 함 (got ${peakA_at_bpmB_beat1})`,
  );

  // BPM=160 렌더: beat 1(0-indexed) = 375ms — 해당 위치에 피크가 있어야 함
  const peakB_beat1 = peakAt(bufB, msToSample(beat1msB));
  assert.ok(
    peakB_beat1 > 0.5,
    `BPM=160 렌더: beat 1(${beat1msB}ms)에 피크 있어야 함 (got ${peakB_beat1})`,
  );
});

test("getScheduleInfo 이후 BPM을 변경해도 캡처된 스케줄 ticks는 변하지 않음", () => {
  const engine = new MetronomeEngine();
  engine.setBpm(100);
  engine.setBeatsPerMeasure(4);

  // BPM=100에서 스케줄 캡처
  const info = engine.getScheduleInfo();
  const originalDurationMs = info.durationMs;
  const originalBeat1Ms = info.ticks.find((t) => t.beat === 1 && t.subBeat === 0)?.time;

  // BPM을 크게 변경 (200 = 100의 두 배, beat 1이 300ms로 절반이 됨)
  engine.setBpm(200);

  // 이미 캡처된 info 객체의 값은 바뀌지 않아야 함 (primitives are copied)
  assert.equal(
    info.durationMs,
    originalDurationMs,
    "캡처된 durationMs는 BPM 변경 후에도 유지돼야 함",
  );

  const stillBeat1Ms = info.ticks.find((t) => t.beat === 1 && t.subBeat === 0)?.time;
  assert.equal(
    stillBeat1Ms,
    originalBeat1Ms,
    "캡처된 beat 1 time은 BPM 변경 후에도 유지돼야 함",
  );

  // BPM=100: beat 간격 = 60000/100 = 600ms → beat 1(0-indexed)은 ~600ms
  assert.ok(
    originalBeat1Ms !== undefined && Math.abs(originalBeat1Ms - 600) < 10,
    `BPM=100에서 beat 1은 ~600ms여야 함: actual=${originalBeat1Ms}ms`,
  );

  // 캡처된 스케줄로 렌더하면 BPM=100 기준 비트 간격이 나타나야 함
  const clickPCMs = makeClickPCMs(0.75);
  const result = renderMeasure({
    schedule: info.ticks as TickInfo[],
    measureDurationMs: info.durationMs,
    clickPCMs,
    samplePCMs: new Map(),
    clickVolume: 1.0,
    sampleVolume: 0,
  });

  const buf = result instanceof Float32Array ? result : result.left;

  // 600ms(BPM=100의 beat 1)에 피크가 있어야 함
  const peak600 = peakAt(buf, msToSample(600));
  assert.ok(
    peak600 > 0.5,
    `캡처된 BPM=100 스케줄로 렌더: 600ms에 피크 있어야 함 (got ${peak600})`,
  );

  // 300ms(BPM=200의 beat 1)에는 피크가 없어야 함
  // BPM=100 beats: 0, 600, 1200, 1800ms → 300ms는 어떤 틱과도 겹치지 않음
  const peak300 = peakAt(buf, msToSample(300));
  assert.ok(
    peak300 < 0.05,
    `변경된 BPM=200의 beat 1 위치(300ms)에는 피크 없어야 함 (got ${peak300})`,
  );
});
