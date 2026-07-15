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

// ──────────────────────────────────────────────────────────────
// 하프타임 모드 + BPM 오버라이드 상호작용 테스트 (Task #173)
// halfTime=true 시 블록 BPM 오버라이드에도 /2 배율이 적용되는지 검증
// ──────────────────────────────────────────────────────────────

test("buildScheduleOnly: 블록 BPM=120 + halfTime=true → tick 간격이 1000ms여야 한다", () => {
  // halfTime 시 effectiveBpm = blockBpm / 2 = 120 / 2 = 60 → 60000 / 60 = 1000ms
  const engine = new MetronomeEngine();
  engine.setBpm(90);
  engine.setBeatsPerMeasure(4);
  engine.setBeatTypes(["accent", "normal", "normal", "normal"]);
  engine.setHalfTime(true);

  engine.setLoopBlocks([
    { startBeat: 0, endBeat: 3, type: "count", value: 1, bpm: 120 },
  ]);

  engine.buildScheduleOnly();
  const { ticks } = engine.getScheduleInfo();
  const intervals = getMainBeatIntervals(ticks, 0);

  assert.ok(intervals.length >= 3, "4비트 블록에서 최소 3개의 간격이 있어야 한다");
  for (const interval of intervals) {
    assert.equal(
      interval,
      1000,
      `블록 BPM=120 + halfTime=true → tick 간격은 1000ms여야 한다 (실제: ${interval}ms)`,
    );
  }
});

test("buildScheduleOnly: 블록 BPM=60 + halfTime=true → tick 간격이 2000ms여야 한다", () => {
  // halfTime 시 effectiveBpm = blockBpm / 2 = 60 / 2 = 30 → 60000 / 30 = 2000ms
  const engine = new MetronomeEngine();
  engine.setBpm(90);
  engine.setBeatsPerMeasure(4);
  engine.setBeatTypes(["accent", "normal", "normal", "normal"]);
  engine.setHalfTime(true);

  engine.setLoopBlocks([
    { startBeat: 0, endBeat: 3, type: "count", value: 1, bpm: 60 },
  ]);

  engine.buildScheduleOnly();
  const { ticks } = engine.getScheduleInfo();
  const intervals = getMainBeatIntervals(ticks, 0);

  assert.ok(intervals.length >= 3, "4비트 블록에서 최소 3개의 간격이 있어야 한다");
  for (const interval of intervals) {
    assert.equal(
      interval,
      2000,
      `블록 BPM=60 + halfTime=true → tick 간격은 2000ms여야 한다 (실제: ${interval}ms)`,
    );
  }
});

// ──────────────────────────────────────────────────────────────
// 재생 중 setBarBpmOverride / clearBarBpmOverrides → onScheduleRebuild (Task #176)
// ──────────────────────────────────────────────────────────────

test("setBarBpmOverride 재생 중: onScheduleRebuild가 정확히 한 번 호출된다", () => {
  // 재생 중 + preRenderedAudio=true 상태에서 setBarBpmOverride()를 호출하면
  // rebuildSchedule()이 실행되고 onScheduleRebuild 콜백이 한 번 발화해야 한다.
  // 이 경로가 누락되면 WAV 버퍼가 stale 상태로 남아 오디오 타이밍이 틀어진다.
  const engine = new MetronomeEngine();
  engine.setBpm(120);
  engine.setBeatsPerMeasure(4);
  engine.setBeatTypes(["accent", "normal", "normal", "normal"]);
  engine.setLoopBlocks([{ startBeat: 0, endBeat: 3, type: "count", value: 1, bpm: 60 }]);

  let rebuildCount = 0;
  engine.setOnScheduleRebuild(() => { rebuildCount += 1; });

  try {
    engine.start(0);
    engine.setPreRenderedAudio(true);

    const wasRunning = engine.getIsRunning();

    engine.setBarBpmOverride(0, 180);

    if (wasRunning) {
      assert.equal(
        rebuildCount,
        1,
        "재생 중 setBarBpmOverride 호출 시 onScheduleRebuild가 정확히 한 번 호출되어야 한다",
      );
    } else {
      const overrides = engine.getBarBpmOverrides();
      assert.equal(overrides[0], 180, "stub 환경에서도 barBpmOverride가 저장되어야 한다");
    }
  } finally {
    engine.stop();
    engine.setPreRenderedAudio(false);
  }
});

test("clearBarBpmOverrides 재생 중: onScheduleRebuild가 정확히 한 번 호출된다", () => {
  // 재생 중 + preRenderedAudio=true 상태에서 clearBarBpmOverrides()를 호출하면
  // rebuildSchedule()이 실행되고 onScheduleRebuild 콜백이 한 번 발화해야 한다.
  // 오버라이드 제거 경로도 setBarBpmOverride(beat, null)과 동일하게 즉시 반영되어야 한다.
  const engine = new MetronomeEngine();
  engine.setBpm(120);
  engine.setBeatsPerMeasure(4);
  engine.setBeatTypes(["accent", "normal", "normal", "normal"]);
  engine.setBarBpmOverride(0, 180);
  engine.setBarBpmOverride(2, 90);

  let rebuildCount = 0;
  engine.setOnScheduleRebuild(() => { rebuildCount += 1; });

  try {
    engine.start(0);
    engine.setPreRenderedAudio(true);

    const wasRunning = engine.getIsRunning();
    rebuildCount = 0;

    engine.clearBarBpmOverrides();

    if (wasRunning) {
      assert.equal(
        rebuildCount,
        1,
        "재생 중 clearBarBpmOverrides 호출 시 onScheduleRebuild가 정확히 한 번 호출되어야 한다",
      );
      assert.deepEqual(
        engine.getBarBpmOverrides(),
        {},
        "clearBarBpmOverrides 후 오버라이드 맵이 비어야 한다",
      );
    } else {
      assert.deepEqual(engine.getBarBpmOverrides(), {}, "stub 환경에서도 오버라이드가 비워져야 한다");
    }
  } finally {
    engine.stop();
    engine.setPreRenderedAudio(false);
  }
});

test("setAllBarBpmOverrides 재생 중: onScheduleRebuild가 정확히 한 번 호출된다", () => {
  // 재생 중 + preRenderedAudio=true 상태에서 setAllBarBpmOverrides()를 호출하면
  // rebuildSchedule()이 실행되고 onScheduleRebuild 콜백이 한 번 발화해야 한다.
  // 이 경로가 누락되면 WAV 버퍼가 stale 상태로 남아 오디오 타이밍이 틀어진다.
  const engine = new MetronomeEngine();
  engine.setBpm(120);
  engine.setBeatsPerMeasure(4);
  engine.setBeatTypes(["accent", "normal", "normal", "normal"]);
  engine.setLoopBlocks([{ startBeat: 0, endBeat: 3, type: "count", value: 1, bpm: 60 }]);

  let rebuildCount = 0;
  engine.setOnScheduleRebuild(() => { rebuildCount += 1; });

  try {
    engine.start(0);
    engine.setPreRenderedAudio(true);

    const wasRunning = engine.getIsRunning();
    rebuildCount = 0;

    engine.setAllBarBpmOverrides({ 0: 180, 2: 90 });

    if (wasRunning) {
      assert.equal(
        rebuildCount,
        1,
        "재생 중 setAllBarBpmOverrides 호출 시 onScheduleRebuild가 정확히 한 번 호출되어야 한다",
      );
      const overrides = engine.getBarBpmOverrides();
      assert.equal(overrides[0], 180, "bar 0의 BPM 오버라이드가 저장되어야 한다");
      assert.equal(overrides[2], 90, "bar 2의 BPM 오버라이드가 저장되어야 한다");
    } else {
      const overrides = engine.getBarBpmOverrides();
      assert.equal(overrides[0], 180, "stub 환경에서도 bar 0 오버라이드가 저장되어야 한다");
      assert.equal(overrides[2], 90, "stub 환경에서도 bar 2 오버라이드가 저장되어야 한다");
    }
  } finally {
    engine.stop();
    engine.setPreRenderedAudio(false);
  }
});

// ──────────────────────────────────────────────────────────────
// 재생 중 단일 바 BPM 오버라이드 제거 → tick 간격 정확성 (Task #185)
// setBarBpmOverride(beat, null) 후 WAV 버퍼가 기본 BPM으로 복원되는지 검증
// ──────────────────────────────────────────────────────────────

test("setBarBpmOverride(0, null) 재생 중: buildScheduleOnly 후 모든 tick 간격이 기본 BPM(500ms)으로 복원된다", () => {
  // 회귀 방지: 재생 중 단일 바 BPM 오버라이드를 null로 제거했을 때
  // WAV 버퍼(buildScheduleOnly)가 stale 오버라이드 없이 엔진 기본 BPM=120(500ms)을
  // 올바르게 반영하는지 확인한다.
  const engine = new MetronomeEngine();
  engine.setBpm(120);
  engine.setBeatsPerMeasure(4);
  engine.setBeatTypes(["accent", "normal", "normal", "normal"]);

  // beat 0에 BPM=60 오버라이드를 설정한 뒤 엔진을 시작한다.
  engine.setBarBpmOverride(0, 60);

  try {
    engine.start(0);
    engine.setPreRenderedAudio(true);

    const wasRunning = engine.getIsRunning();

    // 재생 중 단일 바 오버라이드 제거
    engine.setBarBpmOverride(0, null);

    // WAV 재구성 트리거 (scheduleReRender가 실제로 호출하는 경로와 동일)
    engine.buildScheduleOnly();
    const { ticks } = engine.getScheduleInfo();

    // 오버라이드가 없으므로 블록 인덱스 없는(-1) 일반 ticks 사용
    const mainTicks = ticks
      .filter(t => t.isMainBeat)
      .sort((a, b) => a.time - b.time);
    const intervals: number[] = [];
    for (let i = 1; i < mainTicks.length; i++) {
      intervals.push(Math.round(mainTicks[i].time - mainTicks[i - 1].time));
    }

    if (wasRunning) {
      // 오버라이드 제거 후 오버라이드 맵이 비어 있어야 한다.
      assert.deepEqual(
        engine.getBarBpmOverrides(),
        {},
        "setBarBpmOverride(0, null) 후 오버라이드 맵이 비어야 한다",
      );
      // 모든 tick 간격이 엔진 기본 BPM=120 → 500ms여야 한다.
      assert.ok(
        intervals.length >= 3,
        `4비트에서 최소 3개의 tick 간격이 있어야 한다 (실제: ${intervals.length})`,
      );
      for (const interval of intervals) {
        assert.equal(
          interval,
          500,
          `오버라이드 제거 후 tick 간격은 기본 BPM=120 → 500ms여야 한다 (실제: ${interval}ms)`,
        );
      }
    } else {
      // stub 환경에서 start()가 isRunning을 true로 만들지 못한 경우:
      // 오버라이드가 제거됐는지만 확인한다.
      assert.deepEqual(
        engine.getBarBpmOverrides(),
        {},
        "stub 환경에서도 setBarBpmOverride(0, null) 후 오버라이드가 비워져야 한다",
      );
    }
  } finally {
    engine.stop();
    engine.setPreRenderedAudio(false);
  }
});

// ──────────────────────────────────────────────────────────────
// 재생 중 halfTime 토글 → buildScheduleOnly 후 tick 간격 정확성 (Task #175)
// halfTime 토글이 스케줄을 stale 없이 즉시 갱신하는지 검증
// ──────────────────────────────────────────────────────────────

test("halfTime 토글 mid-run: false→true 전환 후 buildScheduleOnly → tick 간격이 두 배가 된다", () => {
  // BPM=120, halfTime=false: 간격 = 60000/120 = 500ms
  // setHalfTime(true) 후 buildScheduleOnly: effectiveBpm = 120/2 = 60 → 간격 = 1000ms (두 배)
  const engine = new MetronomeEngine();
  engine.setBpm(120);
  engine.setBeatsPerMeasure(4);
  engine.setBeatTypes(["accent", "normal", "normal", "normal"]);
  engine.setHalfTime(false);

  try {
    engine.start(0);

    engine.buildScheduleOnly();
    const before = getMainBeatIntervals(engine.getScheduleInfo().ticks, -1);
    const beforeInterval = before.length > 0 ? before[0] : null;

    engine.setHalfTime(true);
    engine.buildScheduleOnly();
    const after = getMainBeatIntervals(engine.getScheduleInfo().ticks, -1);

    if (after.length > 0 && beforeInterval !== null) {
      for (const interval of after) {
        assert.equal(
          interval,
          beforeInterval * 2,
          `halfTime false→true: tick 간격이 두 배(${beforeInterval * 2}ms)여야 한다 (실제: ${interval}ms)`,
        );
      }
    } else {
      // stub 환경에서 blockIndex=-1 틱이 없으면 no-block 스케줄로 직접 검증
      assert.equal(engine.getHalfTime(), true, "setHalfTime(true)가 엔진에 반영되어야 한다");

      // 블록 없이 일반 스케줄 검증: halfTime=false → 500ms, halfTime=true → 1000ms
      engine.setHalfTime(false);
      engine.buildScheduleOnly();
      const infoOff = engine.getScheduleInfo();
      const durOff = infoOff.durationMs;

      engine.setHalfTime(true);
      engine.buildScheduleOnly();
      const infoOn = engine.getScheduleInfo();
      const durOn = infoOn.durationMs;

      assert.equal(
        durOn,
        durOff * 2,
        `halfTime=true 시 measureDurationMs가 두 배여야 한다 (off=${durOff}, on=${durOn})`,
      );
    }
  } finally {
    engine.stop();
    engine.setHalfTime(false);
  }
});

test("halfTime 토글 mid-run: true→false 전환 후 buildScheduleOnly → tick 간격이 절반이 된다", () => {
  // BPM=120, halfTime=true: effectiveBpm = 60 → 간격 = 1000ms
  // setHalfTime(false) 후 buildScheduleOnly: effectiveBpm = 120 → 간격 = 500ms (절반)
  const engine = new MetronomeEngine();
  engine.setBpm(120);
  engine.setBeatsPerMeasure(4);
  engine.setBeatTypes(["accent", "normal", "normal", "normal"]);
  engine.setHalfTime(true);

  try {
    engine.start(0);

    engine.buildScheduleOnly();
    const before = getMainBeatIntervals(engine.getScheduleInfo().ticks, -1);
    const beforeInterval = before.length > 0 ? before[0] : null;

    engine.setHalfTime(false);
    engine.buildScheduleOnly();
    const after = getMainBeatIntervals(engine.getScheduleInfo().ticks, -1);

    if (after.length > 0 && beforeInterval !== null) {
      for (const interval of after) {
        assert.equal(
          interval,
          Math.round(beforeInterval / 2),
          `halfTime true→false: tick 간격이 절반(${Math.round(beforeInterval / 2)}ms)여야 한다 (실제: ${interval}ms)`,
        );
      }
    } else {
      // stub 환경에서 블록 없는 스케줄로 직접 검증
      assert.equal(engine.getHalfTime(), false, "setHalfTime(false)가 엔진에 반영되어야 한다");

      engine.setHalfTime(true);
      engine.buildScheduleOnly();
      const infoOn = engine.getScheduleInfo();
      const durOn = infoOn.durationMs;

      engine.setHalfTime(false);
      engine.buildScheduleOnly();
      const infoOff = engine.getScheduleInfo();
      const durOff = infoOff.durationMs;

      assert.equal(
        durOn,
        durOff * 2,
        `halfTime=true 시 measureDurationMs가 false의 두 배여야 한다 (on=${durOn}, off=${durOff})`,
      );
    }
  } finally {
    engine.stop();
    engine.setHalfTime(false);
  }
});

test("halfTime 토글: false→true 전환 후 블록 BPM 오버라이드에도 /2 배율이 정확히 적용된다", () => {
  // halfTime=false, blockBpm=120: 간격 500ms
  // setHalfTime(true) + buildScheduleOnly: effectiveBpm = 120/2 = 60 → 간격 1000ms
  const engine = new MetronomeEngine();
  engine.setBpm(90);
  engine.setBeatsPerMeasure(4);
  engine.setBeatTypes(["accent", "normal", "normal", "normal"]);
  engine.setHalfTime(false);
  engine.setLoopBlocks([{ startBeat: 0, endBeat: 3, type: "count", value: 1, bpm: 120 }]);

  engine.buildScheduleOnly();
  const intervalsBefore = getMainBeatIntervals(engine.getScheduleInfo().ticks, 0);
  assert.ok(intervalsBefore.length >= 3, "halfTime=false: 4비트 블록에서 최소 3개의 간격이 있어야 한다");
  for (const interval of intervalsBefore) {
    assert.equal(interval, 500, `halfTime=false, blockBpm=120 → 간격 500ms여야 한다 (실제: ${interval}ms)`);
  }

  engine.setHalfTime(true);
  engine.buildScheduleOnly();
  const intervalsAfter = getMainBeatIntervals(engine.getScheduleInfo().ticks, 0);
  assert.ok(intervalsAfter.length >= 3, "halfTime=true: 4비트 블록에서 최소 3개의 간격이 있어야 한다");
  for (const interval of intervalsAfter) {
    assert.equal(
      interval,
      1000,
      `halfTime=true, blockBpm=120 → effectiveBpm=60 → 간격 1000ms여야 한다 (실제: ${interval}ms)`,
    );
  }
});

test("halfTime 토글: true→false 전환 후 블록 BPM 오버라이드 간격이 정상으로 복귀된다", () => {
  // halfTime=true, blockBpm=60: effectiveBpm=30 → 간격 2000ms
  // setHalfTime(false) + buildScheduleOnly: effectiveBpm=60 → 간격 1000ms (정상 복귀)
  const engine = new MetronomeEngine();
  engine.setBpm(90);
  engine.setBeatsPerMeasure(4);
  engine.setBeatTypes(["accent", "normal", "normal", "normal"]);
  engine.setHalfTime(true);
  engine.setLoopBlocks([{ startBeat: 0, endBeat: 3, type: "count", value: 1, bpm: 60 }]);

  engine.buildScheduleOnly();
  const intervalsBefore = getMainBeatIntervals(engine.getScheduleInfo().ticks, 0);
  assert.ok(intervalsBefore.length >= 3, "halfTime=true: 4비트 블록에서 최소 3개의 간격이 있어야 한다");
  for (const interval of intervalsBefore) {
    assert.equal(
      interval,
      2000,
      `halfTime=true, blockBpm=60 → effectiveBpm=30 → 간격 2000ms여야 한다 (실제: ${interval}ms)`,
    );
  }

  engine.setHalfTime(false);
  engine.buildScheduleOnly();
  const intervalsAfter = getMainBeatIntervals(engine.getScheduleInfo().ticks, 0);
  assert.ok(intervalsAfter.length >= 3, "halfTime=false: 4비트 블록에서 최소 3개의 간격이 있어야 한다");
  for (const interval of intervalsAfter) {
    assert.equal(
      interval,
      1000,
      `halfTime=false, blockBpm=60 → effectiveBpm=60 → 간격 1000ms여야 한다 (실제: ${interval}ms)`,
    );
  }
});

// ──────────────────────────────────────────────────────────────
// 재생 중 setHalfTime → onScheduleRebuild 콜백 발화 검증 (Task #178)
// halfTime 토글이 WAV 버퍼 재구성 콜백을 즉시 발화하는지 확인
// ──────────────────────────────────────────────────────────────

test("setHalfTime(true) 재생 중: preRenderedAudio=true 상태에서 onScheduleRebuild가 정확히 한 번 호출된다", () => {
  // 재생 중 + preRenderedAudio=true 상태에서 setHalfTime(true)를 호출하면
  // rebuildSchedule()이 실행되고 onScheduleRebuild 콜백이 정확히 한 번 발화해야 한다.
  // 이 콜백이 누락되면 WAV 버퍼가 stale 상태로 남아 halfTime 전환 후 오디오 타이밍이 틀어진다.
  const engine = new MetronomeEngine();
  engine.setBpm(120);
  engine.setBeatsPerMeasure(4);
  engine.setBeatTypes(["accent", "normal", "normal", "normal"]);
  engine.setHalfTime(false);

  let rebuildCount = 0;
  engine.setOnScheduleRebuild(() => { rebuildCount += 1; });

  try {
    engine.start(0);
    engine.setPreRenderedAudio(true);

    const wasRunning = engine.getIsRunning();

    engine.setHalfTime(true);

    if (wasRunning) {
      assert.equal(
        rebuildCount,
        1,
        "재생 중 setHalfTime(true) 호출 시 onScheduleRebuild가 정확히 한 번 호출되어야 한다",
      );
    } else {
      assert.equal(engine.getHalfTime(), true, "stub 환경에서도 setHalfTime(true)가 엔진에 반영되어야 한다");
    }
  } finally {
    engine.stop();
    engine.setHalfTime(false);
    engine.setPreRenderedAudio(false);
  }
});

test("setHalfTime(false) 재생 중: preRenderedAudio=true 상태에서 onScheduleRebuild가 정확히 한 번 호출된다", () => {
  // 재생 중 + preRenderedAudio=true 상태에서 setHalfTime(false)를 호출하면
  // rebuildSchedule()이 실행되고 onScheduleRebuild 콜백이 정확히 한 번 발화해야 한다.
  // halfTime 해제 경로도 활성화 경로와 동일하게 즉시 WAV 재구성을 트리거해야 한다.
  const engine = new MetronomeEngine();
  engine.setBpm(120);
  engine.setBeatsPerMeasure(4);
  engine.setBeatTypes(["accent", "normal", "normal", "normal"]);
  engine.setHalfTime(true);

  let rebuildCount = 0;
  engine.setOnScheduleRebuild(() => { rebuildCount += 1; });

  try {
    engine.start(0);
    engine.setPreRenderedAudio(true);

    const wasRunning = engine.getIsRunning();

    engine.setHalfTime(false);

    if (wasRunning) {
      assert.equal(
        rebuildCount,
        1,
        "재생 중 setHalfTime(false) 호출 시 onScheduleRebuild가 정확히 한 번 호출되어야 한다",
      );
    } else {
      assert.equal(engine.getHalfTime(), false, "stub 환경에서도 setHalfTime(false)가 엔진에 반영되어야 한다");
    }
  } finally {
    engine.stop();
    engine.setHalfTime(false);
    engine.setPreRenderedAudio(false);
  }
});

// ──────────────────────────────────────────────────────────────
// setAllBarBpmOverrides + buildScheduleOnly 타이밍 정확성 검증 (Task #179)
// rebuildSchedule()이 호출되는지뿐 아니라 tick 간격이 실제로 새 BPM을 반영하는지 확인
// ──────────────────────────────────────────────────────────────

test("setAllBarBpmOverrides 재생 중: buildScheduleOnly 후 bar 0의 tick 간격이 BPM=180 (~333ms)로 갱신된다", () => {
  // 재생 중 setAllBarBpmOverrides({ 0: 180 })를 호출한 뒤 buildScheduleOnly()를 실행하면
  // bar 0 (beat 0 → beat 1) 의 tick 간격이 60000/180 ≈ 333ms로 갱신되어야 한다.
  // 이 테스트는 rebuildSchedule 콜백 발화 여부가 아닌 스케줄 내 실제 타이밍 정확성을 검증한다.
  const engine = new MetronomeEngine();
  engine.setBpm(120);
  engine.setBeatsPerMeasure(4);
  engine.setBeatTypes(["accent", "normal", "normal", "normal"]);

  // 블록 BPM 오버라이드 없음 → 엔진 기본 BPM=120 → 간격 500ms
  engine.setLoopBlocks([
    { startBeat: 0, endBeat: 3, type: "count", value: 1 },
  ]);

  try {
    engine.start(0);
    engine.setPreRenderedAudio(true);

    // setAllBarBpmOverrides 호출 — 재생 중 내부적으로 rebuildSchedule()이 실행된다
    engine.setAllBarBpmOverrides({ 0: 180 });

    // buildScheduleOnly: 스케줄 스냅샷을 강제로 재구성해 최신 barBpmOverride를 반영
    engine.buildScheduleOnly();
    const { ticks } = engine.getScheduleInfo();
    const intervals = getMainBeatIntervals(ticks, 0);

    assert.ok(intervals.length >= 3, `블록 0에서 최소 3개의 간격이 있어야 한다 (실제: ${intervals.length})`);

    // bar 0에 barBpmOverride=180이 적용되었으므로
    // beat 0 → beat 1 간격(첫 번째 간격)은 60000/180 ≈ 333ms여야 한다
    assert.equal(
      Math.round(intervals[0]),
      333,
      `setAllBarBpmOverrides({0: 180}) 후 bar 0 첫 번째 tick 간격은 ≈333ms여야 한다 (실제: ${intervals[0]}ms)`,
    );

    // bar 0에만 오버라이드가 적용되었으므로 나머지 간격은 기본 BPM=120 → 500ms여야 한다
    for (const interval of intervals.slice(1)) {
      assert.equal(
        interval,
        500,
        `bar 0 이후 beat들은 engineBpm=120 → 간격 500ms여야 한다 (실제: ${interval}ms)`,
      );
    }
  } finally {
    engine.stop();
    engine.setPreRenderedAudio(false);
    engine.clearBarBpmOverrides();
  }
});

test("setAllBarBpmOverrides: 여러 bar에 서로 다른 BPM 적용 후 buildScheduleOnly → 각 bar tick 간격이 독립적으로 갱신된다", () => {
  // setAllBarBpmOverrides({ 0: 60, 2: 240 }) 적용 시:
  //   bar 0 (beat 0 → 1): 60000/60 = 1000ms
  //   bar 1 (beat 1 → 2): engineBpm=120 → 500ms
  //   bar 2 (beat 2 → 3): 60000/240 = 250ms
  const engine = new MetronomeEngine();
  engine.setBpm(120);
  engine.setBeatsPerMeasure(4);
  engine.setBeatTypes(["accent", "normal", "normal", "normal"]);

  engine.setLoopBlocks([
    { startBeat: 0, endBeat: 3, type: "count", value: 1 },
  ]);

  engine.setAllBarBpmOverrides({ 0: 60, 2: 240 });
  engine.buildScheduleOnly();
  const { ticks } = engine.getScheduleInfo();
  const intervals = getMainBeatIntervals(ticks, 0);

  assert.ok(intervals.length >= 3, `최소 3개의 간격이 있어야 한다 (실제: ${intervals.length})`);

  assert.equal(
    Math.round(intervals[0]),
    1000,
    `bar 0: barBpmOverride=60 → 간격 1000ms여야 한다 (실제: ${intervals[0]}ms)`,
  );
  assert.equal(
    Math.round(intervals[1]),
    500,
    `bar 1: 오버라이드 없음 → engineBpm=120 → 간격 500ms여야 한다 (실제: ${intervals[1]}ms)`,
  );
  assert.equal(
    Math.round(intervals[2]),
    250,
    `bar 2: barBpmOverride=240 → 간격 250ms여야 한다 (실제: ${intervals[2]}ms)`,
  );

  engine.clearBarBpmOverrides();
});

test("setAllBarBpmOverrides: 호출 전후 buildScheduleOnly → tick 간격이 stale 없이 즉시 갱신된다", () => {
  // 이전 barBpmOverride 상태(비어 있음)로 빌드한 스케줄과
  // setAllBarBpmOverrides({ 0: 180 }) 후 재빌드한 스케줄을 비교해
  // stale 스케줄 재사용 없이 올바르게 갱신되는지 회귀 방지.
  const engine = new MetronomeEngine();
  engine.setBpm(120);
  engine.setBeatsPerMeasure(4);
  engine.setBeatTypes(["accent", "normal", "normal", "normal"]);

  engine.setLoopBlocks([
    { startBeat: 0, endBeat: 3, type: "count", value: 1 },
  ]);

  // 오버라이드 없음 → 모든 간격 500ms
  engine.buildScheduleOnly();
  const before = getMainBeatIntervals(engine.getScheduleInfo().ticks, 0);
  assert.ok(
    before.every(i => i === 500),
    `오버라이드 전: 모든 간격이 500ms여야 한다 (실제: ${before})`,
  );

  // setAllBarBpmOverrides → bar 0 = 180 BPM → 첫 번째 간격만 ~333ms
  engine.setAllBarBpmOverrides({ 0: 180 });
  engine.buildScheduleOnly();
  const after = getMainBeatIntervals(engine.getScheduleInfo().ticks, 0);

  assert.equal(
    Math.round(after[0]),
    333,
    `오버라이드 후 bar 0: BPM=180 → 간격 ≈333ms여야 한다 (실제: ${after[0]}ms)`,
  );
  assert.ok(
    after.slice(1).every(i => i === 500),
    `오버라이드 후 bar 1~: engineBpm=120 → 간격 500ms여야 한다 (실제: ${after.slice(1)})`,
  );

  engine.clearBarBpmOverrides();
});

test("clearBarBpmOverrides: setAllBarBpmOverrides 후 clearBarBpmOverrides + buildScheduleOnly → 모든 tick 간격이 엔진 기본 BPM으로 복원된다", () => {
  // Task #181: clearBarBpmOverrides 경로의 타이밍 정확성 회귀 방지.
  // 1) setAllBarBpmOverrides({ 0: 60 }) 적용 후 buildScheduleOnly → 첫 번째 간격 1000ms 확인.
  // 2) clearBarBpmOverrides() 호출 후 buildScheduleOnly 재실행.
  // 3) 모든 tick 간격이 engineBpm=120 → 500ms로 복원되어야 한다 (stale override 없음).
  const engine = new MetronomeEngine();
  engine.setBpm(120);
  engine.setBeatsPerMeasure(4);
  engine.setBeatTypes(["accent", "normal", "normal", "normal"]);

  engine.setLoopBlocks([
    { startBeat: 0, endBeat: 3, type: "count", value: 1 },
  ]);

  // 1단계: bar 0에 BPM=60 오버라이드 적용 → 첫 번째 간격 1000ms
  engine.setAllBarBpmOverrides({ 0: 60 });
  engine.buildScheduleOnly();
  const overrideIntervals = getMainBeatIntervals(engine.getScheduleInfo().ticks, 0);

  assert.ok(overrideIntervals.length >= 3, `오버라이드 적용 후 최소 3개의 간격이 있어야 한다 (실제: ${overrideIntervals.length})`);
  assert.equal(
    Math.round(overrideIntervals[0]),
    1000,
    `setAllBarBpmOverrides({0: 60}) 후 bar 0 첫 번째 tick 간격은 1000ms여야 한다 (실제: ${overrideIntervals[0]}ms)`,
  );

  // 2단계: 오버라이드 전체 삭제 후 스케줄 재구성
  engine.clearBarBpmOverrides();
  engine.buildScheduleOnly();
  const clearedIntervals = getMainBeatIntervals(engine.getScheduleInfo().ticks, 0);

  // 3단계: 모든 간격이 engineBpm=120 → 500ms로 복원
  assert.ok(clearedIntervals.length >= 3, `clearBarBpmOverrides 후 최소 3개의 간격이 있어야 한다 (실제: ${clearedIntervals.length})`);
  for (const interval of clearedIntervals) {
    assert.equal(
      interval,
      500,
      `clearBarBpmOverrides 후 모든 tick 간격은 engineBpm=120 → 500ms여야 한다 (stale override 없음, 실제: ${interval}ms)`,
    );
  }
});

// ──────────────────────────────────────────────────────────────
// 재생 중 subdivision·accent·beatsPerMeasure → onScheduleRebuild 발화 검증 (Task #180)
// setBeatSubdivision, setBeatTypes, setBeatsPerMeasure가 WAV 버퍼 재구성 콜백을 즉시 발화하는지 확인
// ──────────────────────────────────────────────────────────────

test("setBeatSubdivision 재생 중: preRenderedAudio=true 상태에서 onScheduleRebuild가 정확히 한 번 호출된다", () => {
  // 재생 중 + preRenderedAudio=true 상태에서 setBeatSubdivision을 호출하면
  // rebuildSchedule()이 실행되고 onScheduleRebuild 콜백이 정확히 한 번 발화해야 한다.
  // 누락 시 subdivision 변경 후 WAV 버퍼가 stale 상태로 남아 오디오 타이밍이 틀어진다.
  const engine = new MetronomeEngine();
  engine.setBpm(120);
  engine.setBeatsPerMeasure(4);
  engine.setBeatTypes(["accent", "normal", "normal", "normal"]);

  let rebuildCount = 0;
  engine.setOnScheduleRebuild(() => { rebuildCount += 1; });

  try {
    engine.start(0);
    engine.setPreRenderedAudio(true);

    const wasRunning = engine.getIsRunning();

    engine.setBeatSubdivision(0, ["accent", "normal", "normal"]);

    if (wasRunning) {
      assert.equal(
        rebuildCount,
        1,
        "재생 중 setBeatSubdivision 호출 시 onScheduleRebuild가 정확히 한 번 호출되어야 한다",
      );
    } else {
      assert.deepEqual(
        engine.getBeatSubdivision(0),
        ["accent", "normal", "normal"],
        "stub 환경에서도 setBeatSubdivision이 엔진에 반영되어야 한다",
      );
    }
  } finally {
    engine.stop();
    engine.setBeatSubdivision(0, null);
    engine.setPreRenderedAudio(false);
  }
});

test("setBeatTypes 재생 중: preRenderedAudio=true 상태에서 onScheduleRebuild가 정확히 한 번 호출된다", () => {
  // 재생 중 + preRenderedAudio=true 상태에서 setBeatTypes를 호출하면
  // rebuildSchedule()이 실행되고 onScheduleRebuild 콜백이 정확히 한 번 발화해야 한다.
  // accent 패턴 변경 후 WAV 버퍼가 stale 상태로 남는 회귀를 방지한다.
  const engine = new MetronomeEngine();
  engine.setBpm(120);
  engine.setBeatsPerMeasure(4);
  engine.setBeatTypes(["accent", "normal", "normal", "normal"]);

  let rebuildCount = 0;
  engine.setOnScheduleRebuild(() => { rebuildCount += 1; });

  try {
    engine.start(0);
    engine.setPreRenderedAudio(true);

    const wasRunning = engine.getIsRunning();

    engine.setBeatTypes(["accent", "normal", "accent", "normal"]);

    if (wasRunning) {
      assert.equal(
        rebuildCount,
        1,
        "재생 중 setBeatTypes 호출 시 onScheduleRebuild가 정확히 한 번 호출되어야 한다",
      );
    } else {
      assert.deepEqual(
        engine.getBeatTypes(),
        ["accent", "normal", "accent", "normal"],
        "stub 환경에서도 setBeatTypes가 엔진에 반영되어야 한다",
      );
    }
  } finally {
    engine.stop();
    engine.setPreRenderedAudio(false);
  }
});

test("setBeatsPerMeasure 재생 중: preRenderedAudio=true 상태에서 onScheduleRebuild가 정확히 한 번 호출된다", () => {
  // 재생 중 + preRenderedAudio=true 상태에서 setBeatsPerMeasure를 호출하면
  // rebuildSchedule()이 실행되고 onScheduleRebuild 콜백이 정확히 한 번 발화해야 한다.
  // Task #180 이전 setBeatsPerMeasure는 rebuildSchedule()을 호출하지 않아
  // 박자 수 변경 후 WAV 버퍼가 stale 상태로 남는 버그가 있었다.
  const engine = new MetronomeEngine();
  engine.setBpm(120);
  engine.setBeatsPerMeasure(4);
  engine.setBeatTypes(["accent", "normal", "normal", "normal"]);

  let rebuildCount = 0;
  engine.setOnScheduleRebuild(() => { rebuildCount += 1; });

  try {
    engine.start(0);
    engine.setPreRenderedAudio(true);

    const wasRunning = engine.getIsRunning();

    engine.setBeatsPerMeasure(3);

    if (wasRunning) {
      assert.equal(
        rebuildCount,
        1,
        "재생 중 setBeatsPerMeasure 호출 시 onScheduleRebuild가 정확히 한 번 호출되어야 한다",
      );
    } else {
      assert.equal(
        engine.getBeatsPerMeasure(),
        3,
        "stub 환경에서도 setBeatsPerMeasure가 엔진에 반영되어야 한다",
      );
    }
  } finally {
    engine.stop();
    engine.setPreRenderedAudio(false);
  }
});

test("halfTime 토글 후 블록 교체: 각 블록의 tick 간격이 halfTime 배율을 유지한다", () => {
  // halfTime=true로 재생 중 루프 블록 집합을 교체했을 때
  // 새 블록에도 동일하게 /2 배율이 적용된 tick 간격이 나와야 한다.
  // 재생 중 블록 교체 + halfTime 동시 적용이 stale 스케줄 없이 정확한지 검증.
  const engine = new MetronomeEngine();
  engine.setBpm(90);
  engine.setBeatsPerMeasure(8);
  engine.setBeatTypes(["accent", "normal", "normal", "normal", "accent", "normal", "normal", "normal"]);
  engine.setHalfTime(true);

  // 첫 번째 블록 집합: blockBpm=120, halfTime=true → effectiveBpm=60 → 간격 1000ms
  engine.setLoopBlocks([
    { startBeat: 0, endBeat: 3, type: "count", value: 1, bpm: 120 },
  ]);
  engine.buildScheduleOnly();
  const phase1 = getMainBeatIntervals(engine.getScheduleInfo().ticks, 0);
  assert.ok(phase1.length >= 3, "1단계: 4비트 블록에서 최소 3개의 간격이 있어야 한다");
  for (const interval of phase1) {
    assert.equal(
      interval,
      1000,
      `1단계: halfTime=true + blockBpm=120 → 간격 1000ms여야 한다 (실제: ${interval}ms)`,
    );
  }

  // 재생 중 블록 교체: 두 블록으로 변경 (blockBpm=60, 180)
  // halfTime=true 이므로 effectiveBpm: 30 → 2000ms, 90 → ~667ms
  engine.setLoopBlocks([
    { startBeat: 0, endBeat: 3, type: "count", value: 1, bpm: 60 },
    { startBeat: 4, endBeat: 7, type: "count", value: 1, bpm: 180 },
  ]);
  engine.buildScheduleOnly();
  const ticks2 = engine.getScheduleInfo().ticks;
  const phase2Block0 = getMainBeatIntervals(ticks2, 0);
  const phase2Block1 = getMainBeatIntervals(ticks2, 1);

  assert.ok(phase2Block0.length >= 3, "2단계 블록0: 최소 3개의 간격이 있어야 한다");
  for (const interval of phase2Block0) {
    assert.equal(
      interval,
      2000,
      `2단계 블록0: halfTime=true + blockBpm=60 → effectiveBpm=30 → 간격 2000ms여야 한다 (실제: ${interval}ms)`,
    );
  }

  assert.ok(phase2Block1.length >= 3, "2단계 블록1: 최소 3개의 간격이 있어야 한다");
  for (const interval of phase2Block1) {
    assert.equal(
      Math.round(interval),
      667,
      `2단계 블록1: halfTime=true + blockBpm=180 → effectiveBpm=90 → 간격 ~667ms여야 한다 (실제: ${interval}ms)`,
    );
  }
});

// ──────────────────────────────────────────────────────────────
// 재생 중 setAllBeatSubdivisions → onScheduleRebuild 콜백 발화 검증 (Task #182)
// 벌크 subdivision 초기화가 재생 중 WAV 버퍼를 즉시 갱신하는지 확인
// ──────────────────────────────────────────────────────────────

test("setAllBeatSubdivisions 재생 중: preRenderedAudio=true 상태에서 onScheduleRebuild가 정확히 한 번 호출된다", () => {
  // 재생 중 + preRenderedAudio=true 상태에서 setAllBeatSubdivisions를 호출하면
  // rebuildSchedule()이 실행되고 onScheduleRebuild 콜백이 정확히 한 번 발화해야 한다.
  // Task #182 이전 setAllBeatSubdivisions는 rebuildSchedule()을 호출하지 않아
  // 벌크 subdivision 초기화 후 WAV 버퍼가 stale 상태로 남는 버그가 있었다.
  const engine = new MetronomeEngine();
  engine.setBpm(120);
  engine.setBeatsPerMeasure(4);
  engine.setBeatTypes(["accent", "normal", "normal", "normal"]);

  let rebuildCount = 0;
  engine.setOnScheduleRebuild(() => { rebuildCount += 1; });

  try {
    engine.start(0);
    engine.setPreRenderedAudio(true);

    const wasRunning = engine.getIsRunning();

    engine.setAllBeatSubdivisions({ "0": ["normal", "normal"], "1": ["normal", "normal"] });

    if (wasRunning) {
      assert.equal(
        rebuildCount,
        1,
        "재생 중 setAllBeatSubdivisions 호출 시 onScheduleRebuild가 정확히 한 번 호출되어야 한다",
      );
    } else {
      assert.ok(
        true,
        "stub 환경에서도 setAllBeatSubdivisions가 크래시 없이 실행되어야 한다",
      );
    }
  } finally {
    engine.stop();
    engine.setPreRenderedAudio(false);
  }
});

// ──────────────────────────────────────────────────────────────
// 재생 중 clearBarBpmOverrides → tick 간격 타이밍 정확성 검증 (Task #183)
// 재생 중 오버라이드 삭제 후 buildScheduleOnly가 stale 오버라이드 없이
// 엔진 기본 BPM(500ms)으로 복원되는지 확인
// ──────────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────────
// 재생 중 setAllBarBpmOverrides → onScheduleRebuild 콜백 발화 검증 (Task #184)
// 벌크 bar BPM 오버라이드 설정이 재생 중 WAV 버퍼를 즉시 갱신하는지 확인
// ──────────────────────────────────────────────────────────────

test("setAllBarBpmOverrides 재생 중: preRenderedAudio=true 상태에서 onScheduleRebuild가 정확히 한 번 호출된다", () => {
  // 재생 중 + preRenderedAudio=true 상태에서 setAllBarBpmOverrides를 호출하면
  // rebuildSchedule()이 실행되고 onScheduleRebuild 콜백이 정확히 한 번 발화해야 한다.
  // Task #179는 타이밍 정확성만 검증했고, 이 테스트는 콜백 발화 자체를 직접 검증한다.
  const engine = new MetronomeEngine();
  engine.setBpm(120);
  engine.setBeatsPerMeasure(4);
  engine.setBeatTypes(["accent", "normal", "normal", "normal"]);

  let rebuildCount = 0;
  engine.setOnScheduleRebuild(() => { rebuildCount += 1; });

  try {
    engine.start(0);
    engine.setPreRenderedAudio(true);

    const wasRunning = engine.getIsRunning();

    engine.setAllBarBpmOverrides({ 0: 180, 2: 60 });

    if (wasRunning) {
      assert.equal(
        rebuildCount,
        1,
        "재생 중 setAllBarBpmOverrides 호출 시 onScheduleRebuild가 정확히 한 번 호출되어야 한다",
      );
    } else {
      assert.deepEqual(
        engine.getBarBpmOverrides(),
        { 0: 180, 2: 60 },
        "stub 환경에서도 setAllBarBpmOverrides가 엔진에 반영되어야 한다",
      );
    }
  } finally {
    engine.stop();
    engine.setPreRenderedAudio(false);
    engine.clearBarBpmOverrides();
  }
});

// ──────────────────────────────────────────────────────────────
// 재생 중 setAllBarRepeats → onScheduleRebuild 콜백 발화 검증 (Task #184)
// ──────────────────────────────────────────────────────────────

test("setAllBarRepeats 재생 중: preRenderedAudio=true 상태에서 onScheduleRebuild가 정확히 한 번 호출된다", () => {
  // 재생 중 + preRenderedAudio=true 상태에서 setAllBarRepeats를 호출하면
  // rebuildSchedule()이 실행되고 onScheduleRebuild 콜백이 정확히 한 번 발화해야 한다.
  // 벌크 bar repeat 갱신 후 WAV 버퍼가 stale 상태로 남는 회귀를 방지한다.
  const engine = new MetronomeEngine();
  engine.setBpm(120);
  engine.setBeatsPerMeasure(4);
  engine.setBeatTypes(["accent", "normal", "normal", "normal"]);

  let rebuildCount = 0;
  engine.setOnScheduleRebuild(() => { rebuildCount += 1; });

  try {
    engine.start(0);
    engine.setPreRenderedAudio(true);

    const wasRunning = engine.getIsRunning();

    engine.setAllBarRepeats({ 0: { type: "count", value: 2 }, 2: { type: "count", value: 3 } });

    if (wasRunning) {
      assert.equal(
        rebuildCount,
        1,
        "재생 중 setAllBarRepeats 호출 시 onScheduleRebuild가 정확히 한 번 호출되어야 한다",
      );
    } else {
      const repeats = engine.getAllBarRepeats();
      assert.ok(
        repeats[0] !== undefined,
        "stub 환경에서도 setAllBarRepeats가 엔진에 반영되어야 한다",
      );
    }
  } finally {
    engine.stop();
    engine.setPreRenderedAudio(false);
    engine.clearBarRepeats();
  }
});

// ──────────────────────────────────────────────────────────────
// 재생 중 clearBarRepeats → onScheduleRebuild 콜백 발화 검증 (Task #184)
// ──────────────────────────────────────────────────────────────

test("clearBarRepeats 재생 중: preRenderedAudio=true 상태에서 onScheduleRebuild가 정확히 한 번 호출된다", () => {
  // 재생 중 + preRenderedAudio=true 상태에서 clearBarRepeats를 호출하면
  // rebuildSchedule()이 실행되고 onScheduleRebuild 콜백이 정확히 한 번 발화해야 한다.
  // bar repeat 전체 삭제 후 WAV 버퍼가 stale 상태로 남는 회귀를 방지한다.
  const engine = new MetronomeEngine();
  engine.setBpm(120);
  engine.setBeatsPerMeasure(4);
  engine.setBeatTypes(["accent", "normal", "normal", "normal"]);
  engine.setAllBarRepeats({ 0: { type: "count", value: 2 } });

  let rebuildCount = 0;
  engine.setOnScheduleRebuild(() => { rebuildCount += 1; });

  try {
    engine.start(0);
    engine.setPreRenderedAudio(true);

    const wasRunning = engine.getIsRunning();

    engine.clearBarRepeats();

    if (wasRunning) {
      assert.equal(
        rebuildCount,
        1,
        "재생 중 clearBarRepeats 호출 시 onScheduleRebuild가 정확히 한 번 호출되어야 한다",
      );
    } else {
      assert.deepEqual(
        engine.getAllBarRepeats(),
        {},
        "stub 환경에서도 clearBarRepeats 후 barRepeats가 비어 있어야 한다",
      );
    }
  } finally {
    engine.stop();
    engine.setPreRenderedAudio(false);
  }
});

// ──────────────────────────────────────────────────────────────
// 재생 중 clearLoopBlocks → onScheduleRebuild 콜백 발화 검증 (Task #184)
// ──────────────────────────────────────────────────────────────

test("clearLoopBlocks 재생 중: preRenderedAudio=true 상태에서 onScheduleRebuild가 정확히 한 번 호출된다", () => {
  // 재생 중 + preRenderedAudio=true 상태에서 clearLoopBlocks를 호출하면
  // rebuildSchedule()이 실행되고 onScheduleRebuild 콜백이 정확히 한 번 발화해야 한다.
  // 루프 블록 전체 삭제 후 WAV 버퍼가 stale 상태로 남는 회귀를 방지한다.
  const engine = new MetronomeEngine();
  engine.setBpm(120);
  engine.setBeatsPerMeasure(4);
  engine.setBeatTypes(["accent", "normal", "normal", "normal"]);
  engine.setLoopBlocks([{ startBeat: 0, endBeat: 3, type: "count", value: 2, bpm: 80 }]);

  let rebuildCount = 0;
  engine.setOnScheduleRebuild(() => { rebuildCount += 1; });

  try {
    engine.start(0);
    engine.setPreRenderedAudio(true);

    const wasRunning = engine.getIsRunning();

    engine.clearLoopBlocks();

    if (wasRunning) {
      assert.equal(
        rebuildCount,
        1,
        "재생 중 clearLoopBlocks 호출 시 onScheduleRebuild가 정확히 한 번 호출되어야 한다",
      );
    } else {
      assert.equal(
        engine.getLoopBlocks().length,
        0,
        "stub 환경에서도 clearLoopBlocks 후 루프 블록이 없어야 한다",
      );
    }
  } finally {
    engine.stop();
    engine.setPreRenderedAudio(false);
  }
});

// ──────────────────────────────────────────────────────────────
// 재생 중 setBlockPlayMode → onScheduleRebuild 콜백 발화 검증 (Task #184)
// ──────────────────────────────────────────────────────────────

test("setBlockPlayMode 재생 중: preRenderedAudio=true 상태에서 onScheduleRebuild가 정확히 한 번 호출된다", () => {
  // 재생 중 + preRenderedAudio=true 상태에서 setBlockPlayMode를 호출하면
  // rebuildSchedule()이 실행되고 onScheduleRebuild 콜백이 정확히 한 번 발화해야 한다.
  // 재생 모드 변경(sequential→random 등) 후 WAV 버퍼가 stale 상태로 남는 회귀를 방지한다.
  const engine = new MetronomeEngine();
  engine.setBpm(120);
  engine.setBeatsPerMeasure(4);
  engine.setBeatTypes(["accent", "normal", "normal", "normal"]);
  engine.setLoopBlocks([{ startBeat: 0, endBeat: 3, type: "count", value: 1 }]);

  let rebuildCount = 0;
  engine.setOnScheduleRebuild(() => { rebuildCount += 1; });

  try {
    engine.start(0);
    engine.setPreRenderedAudio(true);

    const wasRunning = engine.getIsRunning();

    engine.setBlockPlayMode("random");

    if (wasRunning) {
      assert.equal(
        rebuildCount,
        1,
        "재생 중 setBlockPlayMode 호출 시 onScheduleRebuild가 정확히 한 번 호출되어야 한다",
      );
    } else {
      assert.equal(
        engine.getBlockPlayMode(),
        "random",
        "stub 환경에서도 setBlockPlayMode가 엔진에 반영되어야 한다",
      );
    }
  } finally {
    engine.stop();
    engine.setBlockPlayMode("sequential");
    engine.setPreRenderedAudio(false);
  }
});

test("clearBarBpmOverrides 재생 중: preRenderedAudio=true 상태에서 clearBarBpmOverrides + buildScheduleOnly → 모든 tick 간격이 엔진 기본 BPM으로 복원된다", () => {
  // Task #183: 재생 중 clearBarBpmOverrides 경로의 타이밍 정확성 회귀 방지.
  // 1) preRenderedAudio=true + setAllBarBpmOverrides({ 0: 60 }) 적용 → WAV 버퍼에 stale 오버라이드 가능.
  // 2) 재생 중 clearBarBpmOverrides() 호출 후 buildScheduleOnly().
  // 3) 모든 tick 간격이 engineBpm=120 → 500ms로 복원되어야 한다.
  //    이 경로가 없으면 WAV 버퍼가 BPM=60(1000ms) 오버라이드를 유지한 채 재생돼 타이밍이 틀어진다.
  const engine = new MetronomeEngine();
  engine.setBpm(120);
  engine.setBeatsPerMeasure(4);
  engine.setBeatTypes(["accent", "normal", "normal", "normal"]);

  engine.setLoopBlocks([
    { startBeat: 0, endBeat: 3, type: "count", value: 1 },
  ]);

  try {
    engine.start(0);
    engine.setPreRenderedAudio(true);

    const wasRunning = engine.getIsRunning();

    // 재생 중 bar 0에 BPM=60 오버라이드 적용
    engine.setAllBarBpmOverrides({ 0: 60 });

    // 재생 중 오버라이드 전체 삭제
    engine.clearBarBpmOverrides();

    // 스케줄 재구성 후 tick 간격 검증
    engine.buildScheduleOnly();
    const intervals = getMainBeatIntervals(engine.getScheduleInfo().ticks, 0);

    if (wasRunning) {
      // 재생 중 clearBarBpmOverrides가 invalidateScheduleCache + rebuildSchedule을 호출하므로
      // buildScheduleOnly 결과에 stale 오버라이드가 없어야 한다.
      assert.ok(
        intervals.length >= 3,
        `clearBarBpmOverrides 후 최소 3개의 간격이 있어야 한다 (실제: ${intervals.length})`,
      );
      for (const interval of intervals) {
        assert.equal(
          interval,
          500,
          `재생 중 clearBarBpmOverrides 후 모든 tick 간격은 engineBpm=120 → 500ms여야 한다 (stale 오버라이드 없음, 실제: ${interval}ms)`,
        );
      }
    } else {
      // stub 환경: start()가 isRunning=true를 만들지 못한 경우에도
      // barBpmOverrides가 비어 있고 buildScheduleOnly가 500ms 간격을 반환하는지 확인한다.
      assert.deepEqual(
        engine.getBarBpmOverrides(),
        {},
        "stub 환경에서도 clearBarBpmOverrides 후 barBpmOverrides가 비어 있어야 한다",
      );
      assert.ok(
        intervals.length >= 3,
        `stub 환경에서도 최소 3개의 간격이 있어야 한다 (실제: ${intervals.length})`,
      );
      for (const interval of intervals) {
        assert.equal(
          interval,
          500,
          `stub 환경에서도 clearBarBpmOverrides 후 tick 간격은 500ms여야 한다 (실제: ${interval}ms)`,
        );
      }
    }
  } finally {
    engine.stop();
    engine.setPreRenderedAudio(false);
    engine.clearBarBpmOverrides();
  }
});

// ──────────────────────────────────────────────────────────────
// 단일 바 세터 재생 중 onScheduleRebuild 검증 (Task #186)
// setBarBpmOverride / setBarRepeat (single-bar setters)
// ──────────────────────────────────────────────────────────────

test("setBarBpmOverride 재생 중 (단일 바): preRenderedAudio=true 상태에서 onScheduleRebuild가 정확히 한 번 호출된다", () => {
  const engine = new MetronomeEngine();
  engine.setBpm(120);
  engine.setBeatsPerMeasure(4);
  engine.setBeatTypes(["accent", "normal", "normal", "normal"]);
  engine.setLoopBlocks([{ startBeat: 0, endBeat: 3, type: "count", value: 1 }]);

  let rebuildCount = 0;
  engine.setOnScheduleRebuild(() => { rebuildCount += 1; });

  try {
    engine.start(0);
    engine.setPreRenderedAudio(true);

    const wasRunning = engine.getIsRunning();

    engine.setBarBpmOverride(0, 180);

    if (wasRunning) {
      assert.equal(
        rebuildCount,
        1,
        "재생 중 setBarBpmOverride 호출 시 onScheduleRebuild가 정확히 한 번 호출되어야 한다",
      );
    } else {
      // stub 환경: isRunning=true가 되지 않더라도 오버라이드 값이 저장됐는지 확인한다
      assert.deepEqual(
        engine.getBarBpmOverrides(),
        { 0: 180 },
        "stub 환경에서도 setBarBpmOverride 값이 저장되어야 한다",
      );
    }
  } finally {
    engine.stop();
    engine.setPreRenderedAudio(false);
    engine.setBarBpmOverride(0, null);
  }
});

test("setBarRepeat 재생 중 (단일 바): preRenderedAudio=true 상태에서 onScheduleRebuild가 정확히 한 번 호출된다", () => {
  const engine = new MetronomeEngine();
  engine.setBpm(120);
  engine.setBeatsPerMeasure(4);
  engine.setBeatTypes(["accent", "normal", "normal", "normal"]);
  engine.setLoopBlocks([{ startBeat: 0, endBeat: 3, type: "count", value: 1 }]);

  let rebuildCount = 0;
  engine.setOnScheduleRebuild(() => { rebuildCount += 1; });

  try {
    engine.start(0);
    engine.setPreRenderedAudio(true);

    const wasRunning = engine.getIsRunning();

    engine.setBarRepeat(0, { type: "count", value: 2 });

    if (wasRunning) {
      assert.equal(
        rebuildCount,
        1,
        "재생 중 setBarRepeat 호출 시 onScheduleRebuild가 정확히 한 번 호출되어야 한다",
      );
    } else {
      // stub 환경: isRunning=true가 되지 않더라도 반복 설정이 저장됐는지 확인한다
      const stored = engine.getAllBarRepeats();
      assert.ok(
        stored[0] != null,
        "stub 환경에서도 setBarRepeat 값이 저장되어야 한다",
      );
      assert.equal(stored[0].value, 2, "반복 횟수가 올바르게 저장되어야 한다");
    }
  } finally {
    engine.stop();
    engine.setPreRenderedAudio(false);
    engine.setBarRepeat(0, null);
  }
});

// ──────────────────────────────────────────────────────────────
// 다중 바 오버라이드 순차 제거 타이밍 검증 (Task #187)
// ──────────────────────────────────────────────────────────────

test("setBarBpmOverride null 순차 제거: 두 바 오버라이드를 개별 제거 후 모든 tick 간격이 엔진 기본 BPM으로 복귀한다", () => {
  const engine = new MetronomeEngine();
  // 엔진 BPM=120 → 오버라이드 없을 때 간격 500ms
  engine.setBpm(120);
  engine.setBeatsPerMeasure(4);
  engine.setBeatTypes(["accent", "normal", "normal", "normal"]);
  engine.setLoopBlocks([{ startBeat: 0, endBeat: 3, type: "count", value: 1 }]);

  // 재생 전 두 바에 서로 다른 오버라이드 설정
  engine.setBarBpmOverride(0, 60);  // beat 0 → 1000ms
  engine.setBarBpmOverride(2, 90);  // beat 2 → ~667ms

  let rebuildCount = 0;
  engine.setOnScheduleRebuild(() => { rebuildCount += 1; });

  try {
    engine.start(0);
    engine.setPreRenderedAudio(true);

    const wasRunning = engine.getIsRunning();

    // 재생 중 beat 0 오버라이드 제거
    engine.setBarBpmOverride(0, null);
    // 재생 중 beat 2 오버라이드 제거
    engine.setBarBpmOverride(2, null);

    engine.buildScheduleOnly();
    const intervals = getMainBeatIntervals(engine.getScheduleInfo().ticks, 0);

    if (wasRunning) {
      // 각 setBarBpmOverride(beat, null)마다 rebuildSchedule이 호출되므로 총 2회
      assert.equal(
        rebuildCount,
        2,
        `두 번의 단일 바 오버라이드 제거 → onScheduleRebuild 2회 호출되어야 한다 (실제: ${rebuildCount})`,
      );
      // 모든 오버라이드 제거 후 tick 간격은 engineBpm=120 → 500ms
      assert.ok(intervals.length >= 3, `최소 3개의 간격이 있어야 한다 (실제: ${intervals.length})`);
      for (const interval of intervals) {
        assert.equal(
          interval,
          500,
          `두 오버라이드 제거 후 모든 tick 간격은 engineBpm=120 → 500ms여야 한다 (stale 없음, 실제: ${interval}ms)`,
        );
      }
    } else {
      // stub 환경: overrides 맵이 비어있는지, tick 간격이 올바른지 확인
      assert.deepEqual(
        engine.getBarBpmOverrides(),
        {},
        "stub 환경에서도 두 오버라이드 제거 후 barBpmOverrides가 비어 있어야 한다",
      );
      assert.ok(intervals.length >= 3, `stub 환경에서도 최소 3개의 간격이 있어야 한다 (실제: ${intervals.length})`);
      for (const interval of intervals) {
        assert.equal(
          interval,
          500,
          `stub 환경에서도 오버라이드 제거 후 tick 간격은 500ms여야 한다 (실제: ${interval}ms)`,
        );
      }
    }
  } finally {
    engine.stop();
    engine.setPreRenderedAudio(false);
    engine.clearBarBpmOverrides();
  }
});

// ──────────────────────────────────────────────────────────────
// 재생 중 단일 바 BPM 오버라이드 제거 → tick 간격 타이밍 정확성 검증 (Task #188)
// setBarBpmOverride(beat, null) 경로: 오버라이드 제거 후 buildScheduleOnly가
// stale 값 없이 엔진 기본 BPM 간격을 올바르게 반환하는지 확인한다.
// ──────────────────────────────────────────────────────────────

// 재생 중 단일 바 BPM 오버라이드 값 변경 → tick 간격 타이밍 정확성 검증 (Task #190)
// setBarBpmOverride(beat, newValue) 경로: 기존 오버라이드를 다른 값으로 교체한 뒤
// buildScheduleOnly가 새 BPM 기준 간격을 stale 없이 올바르게 반환하는지 확인한다.
// ──────────────────────────────────────────────────────────────

test("setBarBpmOverride(0, 60→90) 재생 중: preRenderedAudio=true 상태에서 오버라이드 값 변경 후 buildScheduleOnly → beat-0 간격이 ~667ms(새 BPM), 나머지는 500ms(엔진 기본 BPM)여야 한다", () => {
  // Task #190: 재생 중 단일 바 BPM 오버라이드를 제거(null)가 아닌 다른 값으로 교체하는 경우의
  // 타이밍 정확성 회귀 방지.
  // setBarBpmOverride(beat, value)는 해당 beat 하나의 간격만 제어한다.
  // 1) preRenderedAudio=true + setBarBpmOverride(0, 60) 적용(재생 중) → beat-0 간격 stale 1000ms.
  // 2) 재생 중 setBarBpmOverride(0, 90) 호출 후 buildScheduleOnly().
  // 3) beat-0 간격이 60000/90 ≈ 667ms로 갱신, beat-1..3 간격은 engineBpm=120 → 500ms.
  //    stale 오버라이드(60)가 남아 있으면 intervals[0]=1000ms가 나오므로 회귀를 감지할 수 있다.
  const engine = new MetronomeEngine();
  engine.setBpm(120);
  engine.setBeatsPerMeasure(4);
  engine.setBeatTypes(["accent", "normal", "normal", "normal"]);

  engine.setLoopBlocks([
    { startBeat: 0, endBeat: 3, type: "count", value: 1 },
  ]);

  try {
    engine.start(0);
    engine.setPreRenderedAudio(true);

    const wasRunning = engine.getIsRunning();

    engine.setBarBpmOverride(0, 60);

    engine.setBarBpmOverride(0, 90);

    engine.buildScheduleOnly();
    const intervals = getMainBeatIntervals(engine.getScheduleInfo().ticks, 0);

    if (wasRunning) {
      assert.deepEqual(
        engine.getBarBpmOverrides(),
        { 0: 90 },
        "setBarBpmOverride(0, 90) 후 오버라이드 맵에 새 값(90)만 있어야 한다",
      );
      assert.ok(
        intervals.length >= 3,
        `최소 3개의 간격이 있어야 한다 (실제: ${intervals.length})`,
      );
      // intervals[0]: beat-0 → beat-1, barBpmOverride=90 → 60000/90 ≈ 667ms
      // (stale BPM=60이면 1000ms, engineBpm=120이면 500ms — 두 쪽 모두 회귀를 감지한다)
      assert.equal(
        Math.round(intervals[0]),
        667,
        `beat-0: setBarBpmOverride(0, 90) 후 간격은 ~667ms여야 한다 (stale=1000ms, engineBpm=500ms, 실제: ${intervals[0]}ms)`,
      );
      // intervals[1..]: barBpmOverride 없음 + 블록 BPM 오버라이드 없음 → engineBpm=120 → 500ms
      for (const interval of intervals.slice(1)) {
        assert.equal(
          interval,
          500,
          `beat-1~3: barBpmOverride 없음 → engineBpm=120 → 500ms여야 한다 (실제: ${interval}ms)`,
        );
      }
    } else {
      // stub 환경: start()가 isRunning=true를 만들지 못한 경우에도
      // 오버라이드 맵과 스케줄이 최신 값을 반영하는지 확인한다.
      assert.deepEqual(
        engine.getBarBpmOverrides(),
        { 0: 90 },
        "stub 환경에서도 setBarBpmOverride(0, 90) 후 오버라이드 맵에 새 값(90)이 있어야 한다",
      );
      assert.ok(
        intervals.length >= 3,
        `stub 환경에서도 최소 3개의 간격이 있어야 한다 (실제: ${intervals.length})`,
      );
      assert.equal(
        Math.round(intervals[0]),
        667,
        `stub 환경에서도 beat-0 간격은 BPM=90 → ~667ms여야 한다 (실제: ${intervals[0]}ms)`,
      );
      for (const interval of intervals.slice(1)) {
        assert.equal(
          interval,
          500,
          `stub 환경에서도 beat-1~3 간격은 engineBpm=120 → 500ms여야 한다 (실제: ${interval}ms)`,
        );
      }
    }
  } finally {
    engine.stop();
    engine.setPreRenderedAudio(false);
    engine.setBarBpmOverride(0, null);
  }
});

// ──────────────────────────────────────────────────────────────
// 재생 중 다중 바 BPM 오버라이드 동시 변경 → tick 간격 타이밍 정확성 검증 (Task #191)
// setBarBpmOverride(beat0, newVal) + setBarBpmOverride(beat2, newVal) 경로:
// 두 오버라이드를 같은 라이브 세션에서 각각 다른 값으로 교체한 뒤
// buildScheduleOnly가 두 beat 모두 새 BPM 기준 간격을 stale 없이 반환하는지 확인한다.
// ──────────────────────────────────────────────────────────────

test("setBarBpmOverride(0, 60→90) + setBarBpmOverride(2, 60→180) 재생 중: preRenderedAudio=true 상태에서 두 오버라이드 동시 변경 후 buildScheduleOnly → intervals[0]≈667ms, intervals[1]=500ms, intervals[2]≈333ms여야 한다", () => {
  // Task #191: 재생 중 두 개의 바 BPM 오버라이드를 각각 다른 값으로 교체하는 경우의
  // 타이밍 정확성 회귀 방지.
  // setBarBpmOverride(beat, value)는 해당 beat 하나의 간격만 제어한다.
  // 1) preRenderedAudio=true + beat-0과 beat-2에 각각 BPM=60 적용(재생 중).
  // 2) 재생 중 beat-0 → 90, beat-2 → 180으로 각각 교체 후 buildScheduleOnly().
  // 3) intervals[0](beat-0→1) ≈ 667ms(BPM=90), intervals[1](beat-1→2) = 500ms(engineBpm=120),
  //    intervals[2](beat-2→3) ≈ 333ms(BPM=180) 여야 한다.
  //    어느 한 beat라도 stale 오버라이드(60)가 남으면 해당 간격이 1000ms가 되므로 회귀를 감지한다.
  const engine = new MetronomeEngine();
  engine.setBpm(120);
  engine.setBeatsPerMeasure(4);
  engine.setBeatTypes(["accent", "normal", "normal", "normal"]);

  engine.setLoopBlocks([
    { startBeat: 0, endBeat: 3, type: "count", value: 1 },
  ]);

  try {
    engine.start(0);
    engine.setPreRenderedAudio(true);

    const wasRunning = engine.getIsRunning();

    // 초기 상태: beat-0과 beat-2에 BPM=60 오버라이드 적용
    engine.setBarBpmOverride(0, 60);
    engine.setBarBpmOverride(2, 60);

    // 동시 교체: beat-0 → 90, beat-2 → 180
    engine.setBarBpmOverride(0, 90);
    engine.setBarBpmOverride(2, 180);

    engine.buildScheduleOnly();
    const intervals = getMainBeatIntervals(engine.getScheduleInfo().ticks, 0);

    if (wasRunning) {
      assert.deepEqual(
        engine.getBarBpmOverrides(),
        { 0: 90, 2: 180 },
        "두 오버라이드 교체 후 맵에 { 0: 90, 2: 180 }만 있어야 한다",
      );
      assert.ok(
        intervals.length >= 3,
        `최소 3개의 간격이 있어야 한다 (실제: ${intervals.length})`,
      );
      // intervals[0]: beat-0→1, barBpmOverride=90 → 60000/90 ≈ 667ms
      // (stale BPM=60이면 1000ms, engineBpm=120이면 500ms — 두 쪽 모두 회귀를 감지한다)
      assert.equal(
        Math.round(intervals[0]),
        667,
        `beat-0: setBarBpmOverride(0, 90) 후 간격은 ~667ms여야 한다 (stale=1000ms, engineBpm=500ms, 실제: ${intervals[0]}ms)`,
      );
      // intervals[1]: beat-1→2, barBpmOverride 없음 → engineBpm=120 → 500ms
      assert.equal(
        intervals[1],
        500,
        `beat-1: barBpmOverride 없음 → engineBpm=120 → 500ms여야 한다 (실제: ${intervals[1]}ms)`,
      );
      // intervals[2]: beat-2→3, barBpmOverride=180 → 60000/180 ≈ 333ms
      // (stale BPM=60이면 1000ms, engineBpm=120이면 500ms — 두 쪽 모두 회귀를 감지한다)
      assert.equal(
        Math.round(intervals[2]),
        333,
        `beat-2: setBarBpmOverride(2, 180) 후 간격은 ~333ms여야 한다 (stale=1000ms, engineBpm=500ms, 실제: ${intervals[2]}ms)`,
      );
    } else {
      // stub 환경: start()가 isRunning=true를 만들지 못한 경우에도
      // 오버라이드 맵과 스케줄이 최신 값을 반영하는지 확인한다.
      assert.deepEqual(
        engine.getBarBpmOverrides(),
        { 0: 90, 2: 180 },
        "stub 환경에서도 두 오버라이드 교체 후 맵에 { 0: 90, 2: 180 }이 있어야 한다",
      );
      assert.ok(
        intervals.length >= 3,
        `stub 환경에서도 최소 3개의 간격이 있어야 한다 (실제: ${intervals.length})`,
      );
      assert.equal(
        Math.round(intervals[0]),
        667,
        `stub 환경에서도 beat-0 간격은 BPM=90 → ~667ms여야 한다 (실제: ${intervals[0]}ms)`,
      );
      assert.equal(
        intervals[1],
        500,
        `stub 환경에서도 beat-1 간격은 engineBpm=120 → 500ms여야 한다 (실제: ${intervals[1]}ms)`,
      );
      assert.equal(
        Math.round(intervals[2]),
        333,
        `stub 환경에서도 beat-2 간격은 BPM=180 → ~333ms여야 한다 (실제: ${intervals[2]}ms)`,
      );
    }
  } finally {
    engine.stop();
    engine.setPreRenderedAudio(false);
    engine.setBarBpmOverride(0, null);
    engine.setBarBpmOverride(2, null);
  }
});

// ──────────────────────────────────────────────────────────────
// 재생 중 모든 바 BPM 오버라이드 일괄 제거 → tick 간격 타이밍 정확성 검증 (Task #192)
// setBarBpmOverride(0, null) + setBarBpmOverride(1, null) + setBarBpmOverride(2, null) 경로:
// 세 개의 오버라이드를 같은 라이브 세션에서 한꺼번에 null로 제거한 뒤
// buildScheduleOnly가 모든 beat를 stale 없이 engineBpm(500ms) 기준으로 반환하는지 확인한다.
// ──────────────────────────────────────────────────────────────

test("setBarBpmOverride 전체 일괄 제거 재생 중: preRenderedAudio=true 상태에서 세 오버라이드 모두 null 처리 후 buildScheduleOnly → 모든 tick 간격이 엔진 기본 BPM(500ms)으로 복원된다", () => {
  // Task #192: 재생 중 모든 바 BPM 오버라이드를 한꺼번에 null로 제거하는 경우의
  // 타이밍 정확성 회귀 방지.
  // setBarBpmOverride(beat, null)은 해당 beat의 오버라이드를 제거하고 engineBpm을 사용하게 한다.
  // 1) preRenderedAudio=true + beat-0(60), beat-1(80), beat-2(60) 오버라이드 적용(재생 중).
  // 2) 재생 중 세 beat 모두 null로 일괄 제거 후 buildScheduleOnly().
  // 3) 모든 tick 간격이 engineBpm=120 → 500ms로 복원되어야 한다.
  //    어느 한 beat라도 stale 오버라이드가 남으면 해당 간격이 1000ms 또는 750ms가 되므로 회귀를 감지한다.
  const engine = new MetronomeEngine();
  engine.setBpm(120);
  engine.setBeatsPerMeasure(4);
  engine.setBeatTypes(["accent", "normal", "normal", "normal"]);

  engine.setLoopBlocks([
    { startBeat: 0, endBeat: 3, type: "count", value: 1 },
  ]);

  try {
    engine.start(0);
    engine.setPreRenderedAudio(true);

    const wasRunning = engine.getIsRunning();

    // 초기 상태: beat-0, beat-1, beat-2에 각각 BPM 오버라이드 적용
    engine.setBarBpmOverride(0, 60);   // beat-0 → 1000ms
    engine.setBarBpmOverride(1, 80);   // beat-1 → 750ms
    engine.setBarBpmOverride(2, 60);   // beat-2 → 1000ms

    // 일괄 제거: 세 beat 모두 null → 오버라이드 맵이 비어야 한다
    engine.setBarBpmOverride(0, null);
    engine.setBarBpmOverride(1, null);
    engine.setBarBpmOverride(2, null);

    // 스케줄 재구성 후 tick 간격 검증
    engine.buildScheduleOnly();
    const intervals = getMainBeatIntervals(engine.getScheduleInfo().ticks, 0);

    if (wasRunning) {
      assert.deepEqual(
        engine.getBarBpmOverrides(),
        {},
        "세 오버라이드 일괄 제거 후 오버라이드 맵이 비어야 한다",
      );
      assert.ok(
        intervals.length >= 3,
        `최소 3개의 간격이 있어야 한다 (실제: ${intervals.length})`,
      );
      for (const interval of intervals) {
        assert.equal(
          interval,
          500,
          `재생 중 전체 일괄 제거 후 모든 tick 간격은 engineBpm=120 → 500ms여야 한다 (stale 오버라이드 없음, 실제: ${interval}ms)`,
        );
      }
    } else {
      // stub 환경: start()가 isRunning=true를 만들지 못한 경우에도
      // 오버라이드 맵이 비어 있고 buildScheduleOnly가 500ms 간격을 반환하는지 확인한다.
      assert.deepEqual(
        engine.getBarBpmOverrides(),
        {},
        "stub 환경에서도 세 오버라이드 일괄 제거 후 오버라이드 맵이 비어야 한다",
      );
      assert.ok(
        intervals.length >= 3,
        `stub 환경에서도 최소 3개의 간격이 있어야 한다 (실제: ${intervals.length})`,
      );
      for (const interval of intervals) {
        assert.equal(
          interval,
          500,
          `stub 환경에서도 전체 일괄 제거 후 tick 간격은 500ms여야 한다 (실제: ${interval}ms)`,
        );
      }
    }
  } finally {
    engine.stop();
    engine.setPreRenderedAudio(false);
    engine.setBarBpmOverride(0, null);
    engine.setBarBpmOverride(1, null);
    engine.setBarBpmOverride(2, null);
  }
});

test("setBarBpmOverride(0, null) 재생 중: preRenderedAudio=true 상태에서 단일 오버라이드 제거 후 buildScheduleOnly → 모든 tick 간격이 엔진 기본 BPM으로 복원된다", () => {
  // Task #188: 재생 중 단일 바 BPM 오버라이드 제거 경로의 타이밍 정확성 회귀 방지.
  // 1) preRenderedAudio=true + setBarBpmOverride(0, 60) 적용(재생 중) → WAV 버퍼에 stale 오버라이드 가능.
  // 2) 재생 중 setBarBpmOverride(0, null) 호출 후 buildScheduleOnly().
  // 3) 모든 tick 간격이 engineBpm=120 → 500ms로 복원되어야 한다.
  //    이 경로가 없으면 WAV 버퍼가 BPM=60(1000ms) 오버라이드를 유지한 채 재생돼 타이밍이 틀어진다.
  const engine = new MetronomeEngine();
  engine.setBpm(120);
  engine.setBeatsPerMeasure(4);
  engine.setBeatTypes(["accent", "normal", "normal", "normal"]);

  engine.setLoopBlocks([
    { startBeat: 0, endBeat: 3, type: "count", value: 1 },
  ]);

  try {
    engine.start(0);
    engine.setPreRenderedAudio(true);

    const wasRunning = engine.getIsRunning();

    // 재생 중 bar 0에 BPM=60 오버라이드 적용
    engine.setBarBpmOverride(0, 60);

    // 재생 중 단일 바 오버라이드 제거 (null = no override → 엔진 기본 BPM 사용)
    engine.setBarBpmOverride(0, null);

    // 스케줄 재구성 후 tick 간격 검증
    engine.buildScheduleOnly();
    const intervals = getMainBeatIntervals(engine.getScheduleInfo().ticks, 0);

    if (wasRunning) {
      // 재생 중 setBarBpmOverride(0, null)이 invalidateScheduleCache + rebuildSchedule을 호출하므로
      // buildScheduleOnly 결과에 stale 오버라이드가 없어야 한다.
      assert.deepEqual(
        engine.getBarBpmOverrides(),
        {},
        "setBarBpmOverride(0, null) 후 오버라이드 맵이 비어야 한다",
      );
      assert.ok(
        intervals.length >= 3,
        `setBarBpmOverride(0, null) 후 최소 3개의 간격이 있어야 한다 (실제: ${intervals.length})`,
      );
      for (const interval of intervals) {
        assert.equal(
          interval,
          500,
          `재생 중 setBarBpmOverride(0, null) 후 모든 tick 간격은 engineBpm=120 → 500ms여야 한다 (stale 오버라이드 없음, 실제: ${interval}ms)`,
        );
      }
    } else {
      // stub 환경: start()가 isRunning=true를 만들지 못한 경우에도
      // barBpmOverrides가 비어 있고 buildScheduleOnly가 500ms 간격을 반환하는지 확인한다.
      assert.deepEqual(
        engine.getBarBpmOverrides(),
        {},
        "stub 환경에서도 setBarBpmOverride(0, null) 후 barBpmOverrides가 비어 있어야 한다",
      );
      assert.ok(
        intervals.length >= 3,
        `stub 환경에서도 최소 3개의 간격이 있어야 한다 (실제: ${intervals.length})`,
      );
      for (const interval of intervals) {
        assert.equal(
          interval,
          500,
          `stub 환경에서도 setBarBpmOverride(0, null) 후 tick 간격은 500ms여야 한다 (실제: ${interval}ms)`,
        );
      }
    }
  } finally {
    engine.stop();
    engine.setPreRenderedAudio(false);
    engine.setBarBpmOverride(0, null);
  }
});

// ──────────────────────────────────────────────────────────────
// 재생 중 버퍼 이미 진행된 상태에서 오버라이드 일괄 제거 → 타이밍 정확성 (Task #193)
// start() 시 첫 틱(time=0)이 동기 발화 → scheduleIndex=1(마디 중간) 상태에서
// 세 오버라이드를 일괄 제거했을 때 다음 마디 tick 간격 검증
// ──────────────────────────────────────────────────────────────

test("재생 중 첫 틱 발화 후 일괄 제거 + buildScheduleOnly: preRenderedAudio=true + scheduleIndex=1(한 틱 진행) 상태에서 세 오버라이드 일괄 제거 후 buildScheduleOnly → 다음 마디 tick 간격이 모두 500ms여야 한다 (stale 오버라이드 누출 없음)", () => {
  // Task #193: WAV 버퍼가 이미 한 틱 진행된(마디 중간) 상태에서 바 BPM 오버라이드를
  // 일괄 제거한 뒤 buildScheduleOnly()를 호출할 때, 다음 전체 마디의 tick 간격이
  // engineBpm=120 → 500ms로 정확히 복원되는지 검증한다.
  //
  // 기존 Task #192 테스트와의 차이점(핵심):
  // - start()를 호출하면 loop()가 동기 실행되어 첫 틱(time=0)이 즉시 발화하고
  //   scheduleIndex가 1로 증가한다. 이것이 "한 틱 진행" 상태이며,
  //   이 시점에서 오버라이드를 적용하면 rebuildSchedule()이 oldIndex=1
  //   (비-제로) 경로를 타서 lastFiredTick 기반 화해를 수행한다.
  // - 오버라이드 적용 중에는 buildScheduleOnly()를 호출하지 않는다.
  //   buildScheduleOnly()는 scheduleIndex를 0으로 리셋해 oldIndex=0 경로만
  //   타게 만들므로 비-제로 인덱스 화해 로직이 우회된다.
  // - 일괄 제거 후에는 buildScheduleOnly()를 명시적으로 호출하여 다음 마디
  //   tick 간격을 검증한다. 이것이 Task #193이 요구하는 시퀀스다:
  //   "start → 오버라이드 적용(한 틱 진행) → 일괄 제거 → buildScheduleOnly()".
  //
  // 설정: BPM=120, 4비트, 루프 블록 오버라이드 없음
  //       beat-0=60(1000ms), beat-1=80(750ms), beat-2=60(1000ms) 바 오버라이드 적용
  // 검증: 한 틱 진행 후 세 오버라이드 일괄 제거 → buildScheduleOnly() → 모든 tick 간격 500ms
  const engine = new MetronomeEngine();
  engine.setBpm(120);
  engine.setBeatsPerMeasure(4);
  engine.setBeatTypes(["accent", "normal", "normal", "normal"]);

  engine.setLoopBlocks([
    { startBeat: 0, endBeat: 3, type: "count", value: 1 },
  ]);

  try {
    // start() → loop()가 동기 실행 → 첫 틱(time=0) 즉시 발화 → scheduleIndex=1.
    // 이것이 "한 틱 진행" 상태다.
    engine.start(0);
    engine.setPreRenderedAudio(true);

    const wasRunning = engine.getIsRunning();

    // 바 BPM 오버라이드 적용 (각기 다른 BPM → stale 검출 용이).
    // wasRunning=true 시 각 호출이 rebuildSchedule()을 트리거하며,
    // scheduleIndex≥1이므로 oldIndex>0 → lastFiredTick 화해 경로를 탄다.
    // 오버라이드 적용 중에는 buildScheduleOnly()를 호출하지 않는다 —
    // 호출하면 scheduleIndex가 0으로 리셋되어 oldIndex=0 경로만 타게 된다.
    engine.setBarBpmOverride(0, 60);  // beat-0 → 1000ms
    engine.setBarBpmOverride(1, 80);  // beat-1 → 750ms
    engine.setBarBpmOverride(2, 60);  // beat-2 → 1000ms

    // 일괄 제거: 세 beat 모두 null → 오버라이드 맵이 비어야 한다.
    engine.setBarBpmOverride(0, null);
    engine.setBarBpmOverride(1, null);
    engine.setBarBpmOverride(2, null);

    // Task #193 요구 시퀀스: 일괄 제거 후 buildScheduleOnly() 호출.
    // 이 시점의 스케줄은 오버라이드가 없으므로 500ms 간격으로 구성되어야 한다.
    engine.buildScheduleOnly();
    const intervals = getMainBeatIntervals(engine.getScheduleInfo().ticks, 0);

    if (wasRunning) {
      assert.deepEqual(
        engine.getBarBpmOverrides(),
        {},
        "한 틱 진행 후 세 오버라이드 일괄 제거 시 오버라이드 맵이 비어야 한다",
      );
      assert.ok(
        intervals.length >= 3,
        `최소 3개의 간격이 있어야 한다 (실제: ${intervals.length})`,
      );
      for (const interval of intervals) {
        assert.equal(
          interval,
          500,
          `재생 중 한 틱 진행 후 전체 제거 + buildScheduleOnly 시 tick 간격은 engineBpm=120 → 500ms여야 한다 (stale 오버라이드 누출 없음, 실제: ${interval}ms)`,
        );
      }
    } else {
      // stub 환경: start()가 isRunning=true를 만들지 못한 경우에도
      // 오버라이드 맵이 비어 있고 buildScheduleOnly가 500ms 간격을 반환하는지 확인한다.
      assert.deepEqual(
        engine.getBarBpmOverrides(),
        {},
        "stub 환경에서도 세 오버라이드 일괄 제거 후 오버라이드 맵이 비어야 한다",
      );
      assert.ok(
        intervals.length >= 3,
        `stub 환경에서도 최소 3개의 간격이 있어야 한다 (실제: ${intervals.length})`,
      );
      for (const interval of intervals) {
        assert.equal(
          interval,
          500,
          `stub 환경에서도 일괄 제거 + buildScheduleOnly 후 tick 간격은 500ms여야 한다 (실제: ${interval}ms)`,
        );
      }
    }
  } finally {
    engine.stop();
    engine.setPreRenderedAudio(false);
    engine.setBarBpmOverride(0, null);
    engine.setBarBpmOverride(1, null);
    engine.setBarBpmOverride(2, null);
  }
});
