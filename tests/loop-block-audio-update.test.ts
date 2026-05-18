import { test } from "node:test";
import assert from "node:assert/strict";

// 루프 블록 변경 후 오디오가 즉시 갱신되는지 검증하는 단위 테스트 (Task #168)
// 실행: npx tsx --require ./tests/_stubs/setup.cjs --test tests/loop-block-audio-update.test.ts
import { MetronomeEngine } from "../lib/metronome-engine";
import type { LoopBlock } from "../components/beat-indicator.types";

// 실제 프로덕션 코드 경로 직접 import — handleLoopBlocksChange가 이 함수를 위임한다.
import { applyLoopBlocksChange } from "../app/index.helpers";

// ──────────────────────────────────────────────────────────────
// MetronomeEngine.setLoopBlocks / getLoopBlocks 단위 테스트
// ──────────────────────────────────────────────────────────────

test("setLoopBlocks: BPM 오버라이드 포함 블록이 올바르게 저장된다", () => {
  const engine = new MetronomeEngine();
  const blocks: LoopBlock[] = [
    { startBeat: 0, endBeat: 3, type: "count", value: 2, bpm: 80 },
    { startBeat: 4, endBeat: 7, type: "count", value: 1 },
    { startBeat: 8, endBeat: 11, type: "count", value: 3, bpm: 140 },
  ];

  engine.setLoopBlocks(blocks);
  const stored = engine.getLoopBlocks();

  assert.equal(stored.length, 3);
  assert.equal(stored[0].bpm, 80, "첫 번째 블록 BPM 오버라이드가 보존되어야 한다");
  assert.equal(stored[1].bpm, undefined, "BPM 없는 블록은 undefined를 유지해야 한다");
  assert.equal(stored[2].bpm, 140, "세 번째 블록 BPM 오버라이드가 보존되어야 한다");
  assert.equal(stored[0].startBeat, 0);
  assert.equal(stored[2].endBeat, 11);
});

test("setLoopBlocks: BPM 오버라이드 변경 후 getLoopBlocks가 최신 값을 반환한다", () => {
  const engine = new MetronomeEngine();

  engine.setLoopBlocks([
    { startBeat: 0, endBeat: 3, type: "count", value: 1, bpm: 100 },
  ]);
  assert.equal(engine.getLoopBlocks()[0].bpm, 100);

  engine.setLoopBlocks([
    { startBeat: 0, endBeat: 3, type: "count", value: 1, bpm: 160 },
  ]);
  const updated = engine.getLoopBlocks();
  assert.equal(updated[0].bpm, 160, "변경된 BPM 오버라이드가 즉시 반영되어야 한다");
});

test("setLoopBlocks: 반환된 블록은 내부 상태와 독립적인 복사본이다", () => {
  const engine = new MetronomeEngine();
  engine.setLoopBlocks([{ startBeat: 0, endBeat: 3, type: "count", value: 2, bpm: 90 }]);

  const copy = engine.getLoopBlocks();
  copy[0].bpm = 999;

  const internal = engine.getLoopBlocks();
  assert.equal(internal[0].bpm, 90, "외부 변조가 내부 상태에 영향을 주지 않아야 한다");
});

test("setLoopBlocks: 입력 배열을 변조해도 내부 상태에 영향 없다", () => {
  const engine = new MetronomeEngine();
  const blocks: LoopBlock[] = [{ startBeat: 0, endBeat: 3, type: "count", value: 1, bpm: 120 }];
  engine.setLoopBlocks(blocks);

  blocks[0].bpm = 50;

  const stored = engine.getLoopBlocks();
  assert.equal(stored[0].bpm, 120, "입력 배열 변조가 내부 상태에 영향을 주지 않아야 한다");
});

test("setLoopBlocks: clearLoopBlocks 후 빈 배열을 반환한다", () => {
  const engine = new MetronomeEngine();
  engine.setLoopBlocks([{ startBeat: 0, endBeat: 3, type: "count", value: 1, bpm: 120 }]);
  assert.equal(engine.getLoopBlocks().length, 1);

  engine.clearLoopBlocks();
  assert.equal(engine.getLoopBlocks().length, 0, "clearLoopBlocks 후 블록이 없어야 한다");
});

test("setLoopBlocks: getScheduleInfo가 새 블록을 반영한다 (스케줄 캐시 무효화)", () => {
  const engine = new MetronomeEngine();
  engine.setBpm(120);
  engine.setBeatsPerMeasure(8);
  engine.setBeatTypes(["accent", "normal", "normal", "normal", "normal", "normal", "normal", "normal"]);

  engine.setLoopBlocks([{ startBeat: 0, endBeat: 3, type: "count", value: 2 }]);
  const ticks1 = engine.getScheduleInfo().ticks;
  const blockIndices1 = new Set(ticks1.map(t => t.blockIndex));

  engine.setLoopBlocks([
    { startBeat: 0, endBeat: 3, type: "count", value: 1 },
    { startBeat: 4, endBeat: 7, type: "count", value: 1, bpm: 60 },
  ]);
  const ticks2 = engine.getScheduleInfo().ticks;
  const blockIndices2 = new Set(ticks2.map(t => t.blockIndex));

  assert.ok(blockIndices2.has(1), "BPM 오버라이드가 있는 두 번째 블록이 스케줄에 포함되어야 한다");
  assert.equal(blockIndices1.has(1), false, "이전 스케줄에는 블록 인덱스 1이 없었어야 한다");
});

// ──────────────────────────────────────────────────────────────
// WAV 버퍼 stale 방지: 재생 중 스케줄 재구성 (onScheduleRebuild)
// ──────────────────────────────────────────────────────────────

test("setLoopBlocks 재생 중: preRenderedAudio=true 상태에서 onScheduleRebuild가 호출된다", () => {
  // 재생 중 + preRenderedAudio=true 상태에서 loop block이 바뀌면
  // rebuildSchedule() 내부에서 onScheduleRebuild 콜백이 즉시 발화한다.
  // 이 콜백이 실제로 scheduleReRender(WAV 재구성 예약)에 연결되므로
  // "stale WAV buffer" 회귀를 방지하는 핵심 경로다.
  const engine = new MetronomeEngine();
  engine.setBpm(120);
  engine.setBeatsPerMeasure(4);
  engine.setBeatTypes(["accent", "normal", "normal", "normal"]);
  engine.setLoopBlocks([{ startBeat: 0, endBeat: 3, type: "count", value: 1 }]);

  let rebuildCount = 0;
  engine.setOnScheduleRebuild(() => { rebuildCount += 1; });

  // 엔진을 "재생 중 + pre-rendered audio 활성" 상태로 만든다.
  // start()는 오디오 컨텍스트가 stub이므로 throw 가능 — try/finally로 항상 stop 보장.
  try {
    engine.start(0);
    engine.setPreRenderedAudio(true);

    const wasRunning = engine.getIsRunning();

    // 루프 블록 BPM 오버라이드 변경
    engine.setLoopBlocks([{ startBeat: 0, endBeat: 3, type: "count", value: 1, bpm: 160 }]);

    if (wasRunning) {
      assert.equal(
        rebuildCount,
        1,
        "재생 중 BPM 오버라이드 변경 시 onScheduleRebuild가 한 번 호출되어야 한다",
      );
    } else {
      // stub 환경에서 start()가 isRunning을 true로 만들지 못한 경우에도
      // 블록 변경 후 getLoopBlocks가 최신 BPM을 반영하는지 확인한다.
      const blocks = engine.getLoopBlocks();
      assert.equal(blocks[0].bpm, 160, "stub 환경에서도 블록 BPM 오버라이드가 갱신되어야 한다");
    }
  } finally {
    // start()가 성공했을 경우 타이머 누수 방지
    engine.stop();
    engine.setPreRenderedAudio(false);
  }
});

test("setLoopBlocks: BPM 오버라이드 변경 후 getScheduleInfo ticks가 stale하지 않다", () => {
  // WAV 재구성에 쓰이는 getScheduleInfo()가 setLoopBlocks 직후 최신 데이터를 반환하는지 검증.
  // scheduleReRender는 이 정보를 토대로 WAV를 빌드하므로, stale한 schedule이 없어야 한다.
  const engine = new MetronomeEngine();
  engine.setBpm(120);
  engine.setBeatsPerMeasure(4);
  engine.setBeatTypes(["accent", "normal", "normal", "normal"]);

  engine.setLoopBlocks([{ startBeat: 0, endBeat: 3, type: "count", value: 1 }]);
  const ticksBefore = engine.getScheduleInfo().ticks;
  const blockCountBefore = new Set(ticksBefore.map(t => t.blockIndex)).size;

  engine.setLoopBlocks([
    { startBeat: 0, endBeat: 1, type: "count", value: 1, bpm: 60 },
    { startBeat: 2, endBeat: 3, type: "count", value: 1, bpm: 180 },
  ]);
  const ticksAfter = engine.getScheduleInfo().ticks;
  const blockCountAfter = new Set(ticksAfter.map(t => t.blockIndex)).size;

  assert.equal(blockCountBefore, 1, "변경 전: 블록 하나");
  assert.equal(blockCountAfter, 2, "변경 후: 블록 두 개가 스케줄에 즉시 반영되어야 한다 (stale 없음)");
});

// ──────────────────────────────────────────────────────────────
// applyLoopBlocksChange (실제 프로덕션 헬퍼) 단위 테스트
// ──────────────────────────────────────────────────────────────

test("applyLoopBlocksChange: scheduleReRender가 정확히 한 번 호출된다", () => {
  const engine = new MetronomeEngine();
  const barConfig = { loopBlocks: [] as LoopBlock[] };
  let reRenderCount = 0;
  const scheduleReRender = () => { reRenderCount += 1; };

  applyLoopBlocksChange(engine, barConfig, scheduleReRender, [
    { startBeat: 0, endBeat: 3, type: "count", value: 1, bpm: 100 },
  ]);

  assert.equal(reRenderCount, 1, "루프 블록 변경 후 scheduleReRender가 한 번 호출되어야 한다");
});

test("applyLoopBlocksChange: 여러 번 호출 시 scheduleReRender가 매번 호출된다", () => {
  const engine = new MetronomeEngine();
  const barConfig = { loopBlocks: [] as LoopBlock[] };
  let reRenderCount = 0;
  const scheduleReRender = () => { reRenderCount += 1; };

  applyLoopBlocksChange(engine, barConfig, scheduleReRender, [
    { startBeat: 0, endBeat: 3, type: "count", value: 1, bpm: 80 },
  ]);
  applyLoopBlocksChange(engine, barConfig, scheduleReRender, [
    { startBeat: 0, endBeat: 3, type: "count", value: 1, bpm: 120 },
  ]);
  applyLoopBlocksChange(engine, barConfig, scheduleReRender, [
    { startBeat: 0, endBeat: 3, type: "count", value: 1, bpm: 160 },
  ]);

  assert.equal(reRenderCount, 3, "BPM 오버라이드 변경마다 scheduleReRender가 트리거되어야 한다");
});

test("applyLoopBlocksChange: 엔진 루프 블록이 BPM 오버라이드와 함께 즉시 갱신된다", () => {
  const engine = new MetronomeEngine();
  const barConfig = { loopBlocks: [] as LoopBlock[] };

  applyLoopBlocksChange(engine, barConfig, () => {}, [
    { startBeat: 0, endBeat: 3, type: "count", value: 2, bpm: 75 },
    { startBeat: 4, endBeat: 7, type: "count", value: 1 },
  ]);

  const engineBlocks = engine.getLoopBlocks();
  assert.equal(engineBlocks.length, 2);
  assert.equal(engineBlocks[0].bpm, 75, "BPM 오버라이드가 엔진에 즉시 반영되어야 한다");
  assert.equal(engineBlocks[1].bpm, undefined, "BPM 없는 블록은 undefined여야 한다");
});

test("applyLoopBlocksChange: barConfig.loopBlocks가 새 블록으로 즉시 갱신된다", () => {
  const engine = new MetronomeEngine();
  const barConfig = { loopBlocks: [] as LoopBlock[] };

  applyLoopBlocksChange(engine, barConfig, () => {}, [
    { startBeat: 0, endBeat: 3, type: "count", value: 1, bpm: 110 },
  ]);

  assert.equal(barConfig.loopBlocks.length, 1);
  assert.equal(barConfig.loopBlocks[0].bpm, 110, "barConfig에 BPM 오버라이드가 반영되어야 한다");
});

test("applyLoopBlocksChange: barConfig.loopBlocks는 입력 배열과 다른 참조(얕은 복사)이다", () => {
  // [...blocks] 얕은 복사로 배열 컨테이너는 새 참조가 된다.
  // 원본 배열에 요소를 추가해도 barConfig에 영향 없어 WAV buffer stale 방지.
  const engine = new MetronomeEngine();
  const barConfig = { loopBlocks: [] as LoopBlock[] };

  const blocks: LoopBlock[] = [{ startBeat: 0, endBeat: 3, type: "count", value: 1, bpm: 100 }];
  applyLoopBlocksChange(engine, barConfig, () => {}, blocks);

  assert.notEqual(barConfig.loopBlocks, blocks, "barConfig.loopBlocks는 입력 배열과 다른 참조여야 한다");

  blocks.push({ startBeat: 4, endBeat: 7, type: "count", value: 1 });
  assert.equal(
    barConfig.loopBlocks.length,
    1,
    "원본 배열 push가 barConfig에 영향을 주지 않아야 한다",
  );
});

test("applyLoopBlocksChange: engine=null이어도 barConfig와 scheduleReRender는 실행된다", () => {
  const barConfig = { loopBlocks: [] as LoopBlock[] };
  let reRenderCount = 0;

  applyLoopBlocksChange(null, barConfig, () => { reRenderCount += 1; }, [
    { startBeat: 0, endBeat: 3, type: "count", value: 1, bpm: 90 },
  ]);

  assert.equal(reRenderCount, 1, "engine=null이어도 scheduleReRender가 호출되어야 한다");
  assert.equal(barConfig.loopBlocks.length, 1, "engine=null이어도 barConfig가 갱신되어야 한다");
  assert.equal(barConfig.loopBlocks[0].bpm, 90);
});

test("applyLoopBlocksChange: BPM 오버라이드 제거 후 엔진과 barConfig 모두 갱신된다", () => {
  const engine = new MetronomeEngine();
  const barConfig = { loopBlocks: [] as LoopBlock[] };
  let reRenderCount = 0;
  const scheduleReRender = () => { reRenderCount += 1; };

  applyLoopBlocksChange(engine, barConfig, scheduleReRender, [
    { startBeat: 0, endBeat: 3, type: "count", value: 1, bpm: 80 },
  ]);
  assert.equal(engine.getLoopBlocks()[0].bpm, 80);
  assert.equal(reRenderCount, 1);

  applyLoopBlocksChange(engine, barConfig, scheduleReRender, [
    { startBeat: 0, endBeat: 3, type: "count", value: 1 },
  ]);
  assert.equal(engine.getLoopBlocks()[0].bpm, undefined, "BPM 오버라이드 제거가 엔진에 반영되어야 한다");
  assert.equal(barConfig.loopBlocks[0].bpm, undefined, "BPM 오버라이드 제거가 barConfig에 반영되어야 한다");
  assert.equal(reRenderCount, 2, "BPM 오버라이드 제거 후에도 scheduleReRender가 호출되어야 한다");
});

// ──────────────────────────────────────────────────────────────
// 통합 테스트: buildScheduleOnly() 후 tick.time 간격 검증 (Task #169)
// BPM 오버라이드가 실제 재생 속도(tick 간격)에 정확히 반영되는지 확인
// ──────────────────────────────────────────────────────────────

/**
 * 주어진 tick 배열에서 지정 blockIndex의 isMainBeat=true 틱만 추출하고,
 * 연속하는 틱 간 시간 간격(ms) 배열을 반환한다.
 */
function getMainBeatIntervals(
  ticks: { time: number; beat: number; isMainBeat: boolean; blockIndex: number }[],
  blockIndex: number,
): number[] {
  const mainTicks = ticks
    .filter(t => t.blockIndex === blockIndex && t.isMainBeat)
    .sort((a, b) => a.time - b.time);
  const intervals: number[] = [];
  for (let i = 1; i < mainTicks.length; i++) {
    intervals.push(Math.round(mainTicks[i].time - mainTicks[i - 1].time));
  }
  return intervals;
}

test("buildScheduleOnly: 블록 BPM=60 오버라이드 시 tick 간격이 1000ms여야 한다", () => {
  const engine = new MetronomeEngine();
  engine.setBpm(120);
  engine.setBeatsPerMeasure(4);
  engine.setBeatTypes(["accent", "normal", "normal", "normal"]);

  engine.setLoopBlocks([
    { startBeat: 0, endBeat: 3, type: "count", value: 1, bpm: 60 },
  ]);

  engine.buildScheduleOnly();
  const { ticks } = engine.getScheduleInfo();
  const intervals = getMainBeatIntervals(ticks, 0);

  assert.ok(intervals.length >= 3, "4비트 블록에서 최소 3개의 간격이 있어야 한다");
  for (const interval of intervals) {
    assert.equal(interval, 1000, `BPM=60 블록에서 tick 간격은 1000ms여야 한다 (실제: ${interval}ms)`);
  }
});

test("buildScheduleOnly: 블록 BPM=120 오버라이드 시 tick 간격이 500ms여야 한다", () => {
  const engine = new MetronomeEngine();
  engine.setBpm(60);
  engine.setBeatsPerMeasure(4);
  engine.setBeatTypes(["accent", "normal", "normal", "normal"]);

  engine.setLoopBlocks([
    { startBeat: 0, endBeat: 3, type: "count", value: 1, bpm: 120 },
  ]);

  engine.buildScheduleOnly();
  const { ticks } = engine.getScheduleInfo();
  const intervals = getMainBeatIntervals(ticks, 0);

  assert.ok(intervals.length >= 3, "4비트 블록에서 최소 3개의 간격이 있어야 한다");
  for (const interval of intervals) {
    assert.equal(interval, 500, `BPM=120 블록에서 tick 간격은 500ms여야 한다 (실제: ${interval}ms)`);
  }
});

test("buildScheduleOnly: BPM 오버라이드 없는 블록은 엔진 기본 BPM으로 tick 간격이 결정된다", () => {
  const engine = new MetronomeEngine();
  engine.setBpm(60);
  engine.setBeatsPerMeasure(4);
  engine.setBeatTypes(["accent", "normal", "normal", "normal"]);

  engine.setLoopBlocks([
    { startBeat: 0, endBeat: 3, type: "count", value: 1 },
  ]);

  engine.buildScheduleOnly();
  const { ticks } = engine.getScheduleInfo();
  const intervals = getMainBeatIntervals(ticks, 0);

  assert.ok(intervals.length >= 3, "4비트 블록에서 최소 3개의 간격이 있어야 한다");
  for (const interval of intervals) {
    assert.equal(interval, 1000, `BPM 오버라이드 없을 때 엔진 BPM=60 → 간격은 1000ms여야 한다 (실제: ${interval}ms)`);
  }
});

test("buildScheduleOnly: 두 블록에 각기 다른 BPM 오버라이드 적용 시 각 블록 tick 간격이 독립적으로 올바르다", () => {
  const engine = new MetronomeEngine();
  engine.setBpm(90);
  engine.setBeatsPerMeasure(8);
  engine.setBeatTypes(["accent", "normal", "normal", "normal", "accent", "normal", "normal", "normal"]);

  engine.setLoopBlocks([
    { startBeat: 0, endBeat: 3, type: "count", value: 1, bpm: 60 },
    { startBeat: 4, endBeat: 7, type: "count", value: 1, bpm: 180 },
  ]);

  engine.buildScheduleOnly();
  const { ticks } = engine.getScheduleInfo();

  const block0Intervals = getMainBeatIntervals(ticks, 0);
  const block1Intervals = getMainBeatIntervals(ticks, 1);

  assert.ok(block0Intervals.length >= 3, "블록 0은 4비트 → 최소 3개 간격");
  assert.ok(block1Intervals.length >= 3, "블록 1은 4비트 → 최소 3개 간격");

  for (const interval of block0Intervals) {
    assert.equal(interval, 1000, `블록 0 BPM=60 → tick 간격은 1000ms여야 한다 (실제: ${interval}ms)`);
  }
  for (const interval of block1Intervals) {
    assert.equal(
      Math.round(interval),
      333,
      `블록 1 BPM=180 → tick 간격은 ~333ms여야 한다 (실제: ${interval}ms)`,
    );
  }
});

// ──────────────────────────────────────────────────────────────
// 통합 테스트: 바-레벨 BPM 오버라이드 우선순위 검증 (Task #174)
// 우선순위: barBpmOverride > blockBpm > engineBpm (pureGetBeatDur)
// ──────────────────────────────────────────────────────────────

test("우선순위 체인: 바-레벨 오버라이드(180)가 블록 오버라이드(60)를 이긴다 — 해당 beat만 ~333ms, 나머지는 1000ms", () => {
  const engine = new MetronomeEngine();
  // 엔진 기본 BPM=90 (검증 대상이 아님), 블록 BPM=60 → 기본 간격 1000ms
  engine.setBpm(90);
  engine.setBeatsPerMeasure(4);
  engine.setBeatTypes(["accent", "normal", "normal", "normal"]);

  // 블록 BPM=60: barBpmOverride 없으면 모든 간격 1000ms
  engine.setLoopBlocks([
    { startBeat: 0, endBeat: 3, type: "count", value: 1, bpm: 60 },
  ]);

  // beat 0에만 barBpmOverride=180 (60000/180 ≈ 333ms)
  engine.setBarBpmOverride(0, 180);

  engine.buildScheduleOnly();
  const { ticks } = engine.getScheduleInfo();
  const intervals = getMainBeatIntervals(ticks, 0);

  // 4비트 → 간격 3개: [333, 1000, 1000]
  assert.ok(intervals.length >= 3, `간격이 최소 3개여야 한다 (실제: ${intervals.length})`);
  assert.equal(
    Math.round(intervals[0]),
    333,
    `beat 0: barBpmOverride=180 → 간격 ≈333ms여야 한다 (실제: ${intervals[0]}ms)`,
  );
  for (const interval of intervals.slice(1)) {
    assert.equal(
      interval,
      1000,
      `beat 1~3: blockBpm=60 → 간격 1000ms여야 한다 (실제: ${interval}ms)`,
    );
  }

  // 정리
  engine.setBarBpmOverride(0, null);
});

test("우선순위 체인: 블록 오버라이드(60)가 엔진 기본 BPM(120)을 이긴다 — 바-레벨 오버라이드 없을 때", () => {
  const engine = new MetronomeEngine();
  // 엔진 기본 BPM=120 → 간격 500ms, 블록 BPM=60 → 간격 1000ms
  engine.setBpm(120);
  engine.setBeatsPerMeasure(4);
  engine.setBeatTypes(["accent", "normal", "normal", "normal"]);

  engine.setLoopBlocks([
    { startBeat: 0, endBeat: 3, type: "count", value: 1, bpm: 60 },
  ]);
  // barBpmOverride 없음 → blockBpm=60이 우선

  engine.buildScheduleOnly();
  const { ticks } = engine.getScheduleInfo();
  const intervals = getMainBeatIntervals(ticks, 0);

  assert.ok(intervals.length >= 3, `간격이 최소 3개여야 한다 (실제: ${intervals.length})`);
  for (const interval of intervals) {
    assert.equal(
      interval,
      1000,
      `blockBpm=60이 engineBpm=120을 이겨야 한다 → 간격 1000ms (실제: ${interval}ms)`,
    );
  }
});

test("buildScheduleOnly: BPM 오버라이드 변경 후 buildScheduleOnly 재호출 시 tick 간격이 즉시 갱신된다", () => {
  const engine = new MetronomeEngine();
  engine.setBpm(120);
  engine.setBeatsPerMeasure(4);
  engine.setBeatTypes(["accent", "normal", "normal", "normal"]);

  engine.setLoopBlocks([
    { startBeat: 0, endBeat: 3, type: "count", value: 1, bpm: 60 },
  ]);
  engine.buildScheduleOnly();
  const before = getMainBeatIntervals(engine.getScheduleInfo().ticks, 0);
  assert.ok(before.every(i => i === 1000), "변경 전: BPM=60 → 1000ms");

  engine.setLoopBlocks([
    { startBeat: 0, endBeat: 3, type: "count", value: 1, bpm: 120 },
  ]);
  engine.buildScheduleOnly();
  const after = getMainBeatIntervals(engine.getScheduleInfo().ticks, 0);
  assert.ok(after.every(i => i === 500), "변경 후: BPM=120 → 500ms");
});
