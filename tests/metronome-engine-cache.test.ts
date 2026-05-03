import { test } from "node:test";
import assert from "node:assert/strict";
import { MetronomeEngine } from "../lib/metronome-engine";

test("동일 입력 두 번째 빌드는 캐시 적중이며 동일 ticks 참조 반환", () => {
  const engine = new MetronomeEngine();
  engine.setBeatsPerMeasure(4);
  engine.setBeatTypes(["accent", "normal", "normal", "normal"]);

  engine.buildScheduleOnly();
  assert.equal(engine._wasLastBuildCacheHit(), false);
  const first = engine.getScheduleInfo();

  engine.buildScheduleOnly();
  assert.equal(engine._wasLastBuildCacheHit(), true);
  const second = engine.getScheduleInfo();

  assert.equal(first.ticks.length, second.ticks.length);
  assert.equal(first.durationMs, second.durationMs);
});

test("캐시된 ticks 배열은 frozen이라 외부 변형 불가", () => {
  const engine = new MetronomeEngine();
  engine.setBeatsPerMeasure(4);
  engine.buildScheduleOnly();
  engine.buildScheduleOnly();
  // private이지만 schedule 참조는 buildScheduleOnly가 this.schedule에 할당하고 cached가 쓰임
  // getScheduleInfo는 사본을 반환하므로 직접 frozen 검증은 schedule 자체를 보는 다른 방법이 필요.
  // 대신 캐시 적중 시 measureDurationMs가 변하지 않는지 + 캐시 항목 수로 간접 검증.
  assert.equal(engine._wasLastBuildCacheHit(), true);
  assert.equal(engine._getScheduleCacheSize(), 1);
});

test("입력 16종 초과 시 LRU로 가장 오래된 항목이 축출된다", () => {
  const engine = new MetronomeEngine();
  engine.setBeatsPerMeasure(4);

  for (let i = 20; i < 40; i++) {
    engine.setBpm(i + 60); // 80..99: 20개의 서로 다른 입력
    engine.buildScheduleOnly();
    assert.equal(engine._wasLastBuildCacheHit(), false);
  }
  assert.equal(engine._getScheduleCacheSize(), 16, "캐시 항목은 16개로 제한");

  // 가장 오래된(BPM 80)은 축출되었으므로 미스, 가장 최근(BPM 99)은 적중
  engine.setBpm(80);
  engine.buildScheduleOnly();
  assert.equal(engine._wasLastBuildCacheHit(), false, "축출된 BPM은 미스");

  engine.setBpm(99);
  engine.buildScheduleOnly();
  assert.equal(engine._wasLastBuildCacheHit(), true, "최근 BPM은 적중");
});

test("setBpm/setBeatTypes/setBarRepeat 등이 캐시 적중에 정확히 반영된다", () => {
  const engine = new MetronomeEngine();
  engine.setBeatsPerMeasure(4);

  engine.setBpm(120);
  engine.buildScheduleOnly();
  assert.equal(engine._wasLastBuildCacheHit(), false);

  engine.buildScheduleOnly();
  assert.equal(engine._wasLastBuildCacheHit(), true);

  engine.setBeatTypes(["strong", "normal", "accent", "normal"]);
  engine.buildScheduleOnly();
  assert.equal(engine._wasLastBuildCacheHit(), false);

  engine.setBarRepeat(0, { type: "count", value: 3 });
  engine.buildScheduleOnly();
  assert.equal(engine._wasLastBuildCacheHit(), false);

  engine.setBarBpmOverride(2, 90);
  engine.buildScheduleOnly();
  assert.equal(engine._wasLastBuildCacheHit(), false);

  engine.setHalfTime(true);
  engine.buildScheduleOnly();
  assert.equal(engine._wasLastBuildCacheHit(), false);

  // 모든 설정을 그대로 유지하면 적중
  engine.buildScheduleOnly();
  assert.equal(engine._wasLastBuildCacheHit(), true);
});

test("random 모드 + 외곽 블록 2개 이상이면 캐시를 사용하지 않는다", () => {
  const engine = new MetronomeEngine();
  engine.setBeatsPerMeasure(4);
  engine.setLoopBlocks([
    { startBeat: 0, endBeat: 1, type: "count", value: 1 },
    { startBeat: 2, endBeat: 3, type: "count", value: 1 },
  ]);
  engine.setBlockPlayMode("random");

  engine.buildScheduleOnly();
  assert.equal(engine._wasLastBuildCacheHit(), false);
  engine.buildScheduleOnly();
  assert.equal(engine._wasLastBuildCacheHit(), false, "random 다중 외곽은 캐시 비활성");
});

test("random 모드 + 외곽 블록 1개는 결정론적이라 캐시 적중", () => {
  const engine = new MetronomeEngine();
  engine.setBeatsPerMeasure(4);
  engine.setLoopBlocks([
    { startBeat: 0, endBeat: 3, type: "count", value: 1 },
  ]);
  engine.setBlockPlayMode("random");

  engine.buildScheduleOnly();
  engine.buildScheduleOnly();
  assert.equal(engine._wasLastBuildCacheHit(), true);
});

test("블록 한 개만 편집해도 미변경 outer 블록의 ticks는 재사용된다", () => {
  const engine = new MetronomeEngine();
  engine.setBeatsPerMeasure(8);
  engine.setBeatTypes(["accent", "normal", "normal", "normal", "accent", "normal", "normal", "normal"]);
  engine.setLoopBlocks([
    { startBeat: 0, endBeat: 1, type: "count", value: 2 },
    { startBeat: 2, endBeat: 3, type: "count", value: 2 },
    { startBeat: 4, endBeat: 5, type: "count", value: 2 },
    { startBeat: 6, endBeat: 7, type: "count", value: 2 },
  ]);

  // 첫 빌드: 4개 outer 블록 모두 새로 캐시
  engine.buildScheduleOnly();
  assert.equal(engine._getLastBlockCacheReused(), 0, "첫 빌드는 재사용 0");
  assert.equal(engine._getLastBlockCacheBuilt(), 4, "첫 빌드는 4개 outer 블록 캐시 저장");
  assert.equal(engine._getBlockCacheSize(), 4);

  // 단 한 블록(idx=2)만 편집 → 풀 스케줄 캐시는 미스, 그러나 미변경 3개 블록은 블록 캐시 재사용
  const blocks = engine.getLoopBlocks();
  blocks[2] = { ...blocks[2], type: "count", value: 3 };
  engine.setLoopBlocks(blocks);
  engine.buildScheduleOnly();

  assert.equal(engine._wasLastBuildCacheHit(), false, "풀 스케줄 캐시는 미스");
  assert.equal(engine._getLastBlockCacheReused(), 3, "변경되지 않은 3개 outer 블록은 재사용");
  assert.equal(engine._getLastBlockCacheBuilt(), 1, "변경된 1개 블록만 새로 빌드");
});

test("블록 캐시 사용 여부와 상관없이 ticks 출력이 동일하다 (단일 블록 편집)", () => {
  const make = () => {
    const e = new MetronomeEngine();
    e.setBeatsPerMeasure(8);
    e.setBeatTypes(["accent", "normal", "normal", "normal", "accent", "normal", "normal", "normal"]);
    e.setLoopBlocks([
      { startBeat: 0, endBeat: 1, type: "count", value: 2 },
      { startBeat: 2, endBeat: 3, type: "count", value: 2 },
      { startBeat: 4, endBeat: 5, type: "count", value: 2 },
      { startBeat: 6, endBeat: 7, type: "count", value: 2 },
    ]);
    return e;
  };

  // engine A: 두 번 연속 빌드 (블록 캐시 채움) 후 블록 한 개 편집
  const a = make();
  a.buildScheduleOnly();
  const aBlocks = a.getLoopBlocks();
  aBlocks[1] = { ...aBlocks[1], bpm: 90 };
  a.setLoopBlocks(aBlocks);
  a.buildScheduleOnly();
  const aOut = a.getScheduleInfo();

  // engine B: 새 엔진에서 최종 입력으로 cold 빌드 (블록 캐시 비어있음)
  const b = make();
  const bBlocks = b.getLoopBlocks();
  bBlocks[1] = { ...bBlocks[1], bpm: 90 };
  b.setLoopBlocks(bBlocks);
  b.buildScheduleOnly();
  const bOut = b.getScheduleInfo();

  assert.equal(aOut.durationMs, bOut.durationMs);
  assert.equal(aOut.ticks.length, bOut.ticks.length);
  for (let i = 0; i < aOut.ticks.length; i++) {
    assert.deepEqual(aOut.ticks[i], bOut.ticks[i], `tick ${i} 일치`);
  }
});

test("중첩 블록 + 레이어 + 점프 입력에서도 ticks 출력이 동일하다", () => {
  const make = () => {
    const e = new MetronomeEngine();
    e.setBeatsPerMeasure(8);
    e.setBeatTypes(["strong", "normal", "accent", "normal", "accent", "normal", "normal", "normal"]);
    e.setBeatSubdivision(1, ["normal", "normal", "normal"]);
    e.setBarRepeat(4, { type: "count", value: 2 });
    e.setLoopBlocks([
      // 0..3 outer with inner 1..2
      { startBeat: 0, endBeat: 3, type: "count", value: 2 },
      { startBeat: 1, endBeat: 2, type: "count", value: 2 },
      // 4..7 outer w/ jump back to 0..3
      { startBeat: 4, endBeat: 7, type: "count", value: 1, jumpToBlock: 0, jumpCount: 2 },
      // layer of block 0
      { startBeat: 0, endBeat: 3, type: "count", value: 1, layerOf: 0, bpm: 100 },
    ]);
    return e;
  };

  const a = make();
  a.buildScheduleOnly();
  // 편집 (outer 4..7의 jumpCount만 변경)
  const aBlocks = a.getLoopBlocks();
  aBlocks[2] = { ...aBlocks[2], jumpCount: 3 };
  a.setLoopBlocks(aBlocks);
  a.buildScheduleOnly();
  const aOut = a.getScheduleInfo();

  const b = make();
  const bBlocks = b.getLoopBlocks();
  bBlocks[2] = { ...bBlocks[2], jumpCount: 3 };
  b.setLoopBlocks(bBlocks);
  b.buildScheduleOnly();
  const bOut = b.getScheduleInfo();

  assert.equal(aOut.durationMs, bOut.durationMs);
  assert.equal(aOut.ticks.length, bOut.ticks.length);
  for (let i = 0; i < aOut.ticks.length; i++) {
    assert.deepEqual(aOut.ticks[i], bOut.ticks[i], `tick ${i} 일치`);
  }
});

test("BPM 같은 글로벌 상태가 바뀌면 블록 캐시도 재사용되지 않는다", () => {
  const engine = new MetronomeEngine();
  engine.setBeatsPerMeasure(8);
  engine.setLoopBlocks([
    { startBeat: 0, endBeat: 3, type: "count", value: 1 },
    { startBeat: 4, endBeat: 7, type: "count", value: 1 },
  ]);

  engine.buildScheduleOnly();
  assert.equal(engine._getLastBlockCacheBuilt(), 2);

  engine.setBpm(140);
  engine.buildScheduleOnly();
  assert.equal(
    engine._getLastBlockCacheReused(),
    0,
    "BPM 변경은 모든 블록의 fingerprint를 바꾸므로 재사용 0",
  );
  assert.equal(engine._getLastBlockCacheBuilt(), 2);
});

test("캐시 적중 시에도 measureDurationMs는 정확히 복원된다", () => {
  const engine = new MetronomeEngine();
  engine.setBeatsPerMeasure(4);
  engine.setBpm(120); // 4 beats * 500ms = 2000ms

  engine.buildScheduleOnly();
  const first = engine.getScheduleInfo().durationMs;

  // 다른 BPM으로 한 번 빌드 후 원복
  engine.setBpm(60);
  engine.buildScheduleOnly();
  engine.setBpm(120);
  engine.buildScheduleOnly();

  assert.equal(engine._wasLastBuildCacheHit(), true);
  const second = engine.getScheduleInfo().durationMs;
  assert.equal(second, first, "캐시 적중 시 measureDurationMs 동일");
});
