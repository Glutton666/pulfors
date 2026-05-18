import { test } from "node:test";
import assert from "node:assert/strict";
import { renderMeasure, getRenderSampleRate, type ClickPCMs, type TickInfo } from "../lib/audio-renderer";
import { MetronomeEngine } from "../lib/metronome-engine";

const SR = getRenderSampleRate(); // 44100

// 간단한 테스트용 ClickPCMs 생성 헬퍼.
// 모든 샘플을 동일한 값으로 채워 렌더 결과에서 어떤 PCM이 혼합됐는지 식별할 수 있다.
function makeClickPCMs(strong: number, high: number, low: number, len = 64): ClickPCMs {
  return {
    strong: new Float32Array(len).fill(strong),
    high: new Float32Array(len).fill(high),
    low: new Float32Array(len).fill(low),
  };
}

// ms → 샘플 오프셋 (renderMeasure 내부와 동일 계산)
function msToSample(ms: number): number {
  return Math.round((ms / 1000) * SR);
}

// 렌더 결과의 특정 오프셋 근처에 max-abs 값을 반환한다.
function peakAt(buf: Float32Array, offsetSamples: number, windowLen = 64): number {
  let max = 0;
  for (let i = offsetSamples; i < Math.min(offsetSamples + windowLen, buf.length); i++) {
    if (Math.abs(buf[i]) > max) max = Math.abs(buf[i]);
  }
  return max;
}

// --- 테스트 ---

test("레이어 틱이 layerClickPCMs 없이 renderMeasure에 전달되면 메인 PCM으로 렌더된다", () => {
  const MAIN_STRONG_VAL = 0.5;
  const measureDurationMs = 2000; // 2초 마디
  const mainPCMs = makeClickPCMs(MAIN_STRONG_VAL, 0.3, 0.2);

  const schedule: TickInfo[] = [
    // 메인 틱 (layerIndex 미지정)
    { time: 0, type: "strong", beat: 1, subBeat: 0, repeatIteration: 0, barRepeatIteration: 0 },
    // 레이어 틱 (layerIndex=1) — layerClickPCMs 없으면 메인 PCM fallback
    { time: 500, type: "strong", beat: 1, subBeat: 0, repeatIteration: 0, barRepeatIteration: 0, layerIndex: 1, layerSoundSet: "woodblock" },
  ];

  const result = renderMeasure({
    schedule,
    measureDurationMs,
    clickPCMs: mainPCMs,
    samplePCMs: new Map(),
    clickVolume: 1.0,
    sampleVolume: 0,
  });

  const buf = result instanceof Float32Array ? result : result.left;

  // 레이어 틱 오프셋에도 메인 strong PCM(0.5)이 혼합돼야 한다
  const layerPeak = peakAt(buf, msToSample(500));
  assert.ok(layerPeak > 0.4, `layerClickPCMs 없을 때 메인 PCM fallback: peak=${layerPeak}`);
});

test("레이어 틱에 layerSoundSet 키로 등록된 PCM이 올바르게 렌더된다", () => {
  const MAIN_VAL = 0.3;
  const LAYER_VAL = 0.8;
  const measureDurationMs = 2000;

  const mainPCMs = makeClickPCMs(MAIN_VAL, MAIN_VAL, MAIN_VAL);
  const layerPCMs = makeClickPCMs(LAYER_VAL, LAYER_VAL, LAYER_VAL);

  const layerClickPCMs = new Map<string, ClickPCMs>();
  layerClickPCMs.set("woodblock", layerPCMs);

  const schedule: TickInfo[] = [
    // 메인 틱 (0ms)
    { time: 0, type: "strong", beat: 1, subBeat: 0, repeatIteration: 0, barRepeatIteration: 0 },
    // 레이어 틱 (500ms) — "woodblock" 사운드 셋
    { time: 500, type: "strong", beat: 1, subBeat: 0, repeatIteration: 0, barRepeatIteration: 0, layerIndex: 1, layerSoundSet: "woodblock" },
  ];

  const result = renderMeasure({
    schedule,
    measureDurationMs,
    clickPCMs: mainPCMs,
    samplePCMs: new Map(),
    clickVolume: 1.0,
    sampleVolume: 0,
    layerClickPCMs,
  });

  const buf = result instanceof Float32Array ? result : result.left;

  // 레이어 틱 오프셋(500ms)에 레이어 PCM(0.8)이 렌더돼야 한다
  const layerOffset = msToSample(500);
  const layerPeak = peakAt(buf, layerOffset);
  assert.ok(layerPeak > 0.7, `레이어 PCM(0.8) 렌더 확인: peak=${layerPeak}`);

  // 레이어 값이 메인 값(0.3)과 구분된다
  assert.ok(layerPeak > MAIN_VAL + 0.3, `레이어 PCM이 메인 PCM보다 크다: peak=${layerPeak}, mainVal=${MAIN_VAL}`);
});

test("레이어 틱이 #idx 키 fallback으로 올바른 PCM을 선택한다", () => {
  const MAIN_VAL = 0.2;
  const LAYER_VAL = 0.7;
  const measureDurationMs = 2000;

  const mainPCMs = makeClickPCMs(MAIN_VAL, MAIN_VAL, MAIN_VAL);
  const layerPCMs = makeClickPCMs(LAYER_VAL, LAYER_VAL, LAYER_VAL);

  const layerClickPCMs = new Map<string, ClickPCMs>();
  // "#1" 인덱스 키로 등록 (layerSoundSet 없는 틱용)
  layerClickPCMs.set("#1", layerPCMs);

  const schedule: TickInfo[] = [
    { time: 0, type: "strong", beat: 1, subBeat: 0, repeatIteration: 0, barRepeatIteration: 0 },
    // layerSoundSet 미지정 → #1 키로 fallback
    { time: 750, type: "strong", beat: 1, subBeat: 0, repeatIteration: 0, barRepeatIteration: 0, layerIndex: 1 },
  ];

  const result = renderMeasure({
    schedule,
    measureDurationMs,
    clickPCMs: mainPCMs,
    samplePCMs: new Map(),
    clickVolume: 1.0,
    sampleVolume: 0,
    layerClickPCMs,
  });

  const buf = result instanceof Float32Array ? result : result.left;

  const layerOffset = msToSample(750);
  const layerPeak = peakAt(buf, layerOffset);
  assert.ok(layerPeak > 0.6, `#idx fallback 레이어 PCM(0.7) 렌더 확인: peak=${layerPeak}`);
});

test("layerClickPCMs 없으면 레이어 틱도 비-0으로 렌더된다 (메인 PCM 사용)", () => {
  const measureDurationMs = 1000;
  const mainPCMs = makeClickPCMs(0.6, 0.4, 0.2);

  const schedule: TickInfo[] = [
    { time: 250, type: "strong", beat: 1, subBeat: 0, repeatIteration: 0, barRepeatIteration: 0, layerIndex: 1 },
  ];

  const result = renderMeasure({
    schedule,
    measureDurationMs,
    clickPCMs: mainPCMs,
    samplePCMs: new Map(),
    clickVolume: 1.0,
    sampleVolume: 0,
    // layerClickPCMs 미전달 — Task #151 이전 버그 재현 방지
  });

  const buf = result instanceof Float32Array ? result : result.left;
  const peak = peakAt(buf, msToSample(250));
  assert.ok(peak > 0.5, `layerClickPCMs 없어도 레이어 틱 비-0: peak=${peak}`);
});

test("레이어 틱과 메인 틱이 동일 오프셋에 있으면 두 PCM이 모두 혼합된다", () => {
  const MAIN_VAL = 0.3;
  const LAYER_VAL = 0.3;
  const measureDurationMs = 1000;

  const mainPCMs = makeClickPCMs(MAIN_VAL, MAIN_VAL, MAIN_VAL);
  const layerPCMs = makeClickPCMs(LAYER_VAL, LAYER_VAL, LAYER_VAL);

  const layerClickPCMs = new Map<string, ClickPCMs>();
  layerClickPCMs.set("woodblock", layerPCMs);

  const schedule: TickInfo[] = [
    // 동일 오프셋에 메인 + 레이어
    { time: 0, type: "strong", beat: 1, subBeat: 0, repeatIteration: 0, barRepeatIteration: 0 },
    { time: 0, type: "strong", beat: 1, subBeat: 0, repeatIteration: 0, barRepeatIteration: 0, layerIndex: 1, layerSoundSet: "woodblock" },
  ];

  const result = renderMeasure({
    schedule,
    measureDurationMs,
    clickPCMs: mainPCMs,
    samplePCMs: new Map(),
    clickVolume: 1.0,
    sampleVolume: 0,
    layerClickPCMs,
  });

  const buf = result instanceof Float32Array ? result : result.left;

  // 두 PCM이 합산되므로 peak ≈ 0.6 (합산 후 클램프 전 구간)
  const peak = peakAt(buf, 0);
  assert.ok(peak > 0.5, `메인+레이어 PCM 합산: peak=${peak}`);
});

// --- MetronomeEngine 통합 테스트 (Task #159) ---

test("MetronomeEngine.setBarRepeat(layers) → getScheduleInfo에 layerIndex>0 틱 포함", () => {
  const engine = new MetronomeEngine();
  engine.setBpm(120);
  engine.setBeatsPerMeasure(4);

  // barRepeat 없이는 레이어 틱이 없어야 한다
  const before = engine.getScheduleInfo();
  const beforeLayerTicks = before.ticks.filter(t => t.layerIndex > 0);
  assert.equal(beforeLayerTicks.length, 0, "초기 상태에는 레이어 틱 없음");

  // beat 1에 barRepeat + layers 설정
  engine.setBarRepeat(1, {
    type: "count",
    value: 1,
    layers: [{ subdivisions: ["normal", "normal"], soundSet: "woodblock" }],
  });

  const after = engine.getScheduleInfo();
  const afterLayerTicks = after.ticks.filter(t => t.layerIndex > 0);
  assert.ok(afterLayerTicks.length > 0, "barRepeat.layers 설정 후 레이어 틱이 스케줄에 포함돼야 함");
  assert.ok(
    afterLayerTicks.every(t => t.layerSoundSet === "woodblock"),
    "모든 레이어 틱에 layerSoundSet='woodblock'이 전파돼야 함",
  );
});

test("barRepeat.layers 틱들이 renderMeasure에 전달되면 해당 오프셋에서 비-0 버퍼 생성", () => {
  const LAYER_VAL = 0.75;
  const engine = new MetronomeEngine();
  engine.setBpm(120);
  engine.setBeatsPerMeasure(2);

  // beat 1, 서브디비전 2개 → 비트 중간(500ms 근처)에 레이어 틱 발생
  engine.setBarRepeat(1, {
    type: "count",
    value: 1,
    layers: [{ subdivisions: ["normal", "normal"], soundSet: "woodblock" }],
  });

  const scheduleInfo = engine.getScheduleInfo();
  const layerTicks = scheduleInfo.ticks.filter(t => t.layerIndex > 0);
  assert.ok(layerTicks.length > 0, "레이어 틱이 스케줄에 포함돼야 함");

  const mainPCMs = makeClickPCMs(0.2, 0.2, 0.2);
  const layerPCMs = makeClickPCMs(LAYER_VAL, LAYER_VAL, LAYER_VAL);

  const layerClickPCMs = new Map<string, ClickPCMs>();
  layerClickPCMs.set("woodblock", layerPCMs);

  const result = renderMeasure({
    schedule: scheduleInfo.ticks as TickInfo[],
    measureDurationMs: scheduleInfo.durationMs,
    clickPCMs: mainPCMs,
    samplePCMs: new Map(),
    clickVolume: 1.0,
    sampleVolume: 0,
    layerClickPCMs,
  });

  const buf = result instanceof Float32Array ? result : result.left;

  // 각 레이어 틱 오프셋에서 레이어 PCM 값(0.75)이 렌더됐는지 확인
  for (const tick of layerTicks) {
    const offset = msToSample(tick.time);
    const peak = peakAt(buf, offset);
    assert.ok(peak > 0.5, `레이어 틱(time=${tick.time}ms) 오프셋에서 비-0 렌더: peak=${peak}`);
  }
});
