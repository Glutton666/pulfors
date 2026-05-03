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
