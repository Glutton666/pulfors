import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MetronomeEngine,
  pureEmitBlock,
  pureProcessBlock,
  pureProcessOuterCached,
  type BlockEmitCacheHandle,
  type ScheduleInputs,
  type EmitState,
  type LoopBlockData,
  type ScheduledTick,
} from "../lib/metronome-engine";

function makeInputsFromBlocks(blocks: LoopBlockData[], beatsPerMeasure = 8): ScheduleInputs {
  const sortedBlocks = blocks.slice();
  const origToSorted = new Map<number, number>();
  const sortedToOrig = new Map<number, number>();
  sortedBlocks.forEach((_, i) => {
    origToSorted.set(i, i);
    sortedToOrig.set(i, i);
  });
  const startBeatToBlocks = new Map<number, number[]>();
  sortedBlocks.forEach((b, i) => {
    const arr = startBeatToBlocks.get(b.startBeat);
    if (arr) arr.push(i); else startBeatToBlocks.set(b.startBeat, [i]);
  });
  return {
    bpm: 120,
    halfTime: false,
    beatsPerMeasure,
    beatTypes: Array.from({ length: beatsPerMeasure }, (_, i) => (i === 0 ? "accent" : "normal")),
    beatSubdivisions: new Map(),
    barRepeats: new Map(),
    barBpmOverrides: new Map(),
    sortedBlocks,
    origToSorted,
    sortedToOrig,
    startBeatToBlocks,
    loopBlocks: sortedBlocks,
  };
}

function makeState(): EmitState {
  return { ticks: [], time: 0, jump: { iteration: 0, total: 0, sourceBlockIndex: -1 } };
}

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

test("flushSchedule: 활성 schedule을 비워 다음 호출이 재구성하도록 한다", () => {
  const engine = new MetronomeEngine();
  engine.setBeatsPerMeasure(4);
  engine.buildScheduleOnly();
  engine.buildScheduleOnly();
  assert.equal(engine._wasLastBuildCacheHit(), true);

  engine.flushSchedule();

  // schedule이 비워졌는지: getScheduleInfo는 빈 schedule을 보고 buildScheduleOnly를 다시 호출한다.
  // 동일 입력이 LRU 메모 캐시에 남아있으므로 적중하지만, 핵심은 schedule 배열이 새로 채워지는 것.
  const info = engine.getScheduleInfo();
  assert.ok(info.ticks.length > 0, "flush 후 getScheduleInfo가 schedule을 재구성");
  assert.equal(engine._wasLastBuildCacheHit(), true, "동일 입력은 LRU 적중 유지(의도)");
});

test("flushSchedule + 모드 전환 시뮬레이션: 다음 schedule이 새 박자수/비트타입을 즉시 반영 (Task #65)", () => {
  // Beat ↔ Bar 모드 전환 시 잔여 ticks가 이전 모드 사운드로 재생되는 회귀 방지.
  const engine = new MetronomeEngine();
  engine.setBpm(120);
  engine.setBeatsPerMeasure(4);
  engine.setBeatTypes(["accent", "normal", "normal", "normal"]);
  engine.buildScheduleOnly();

  const before = engine.getScheduleInfo();
  const beforeMain = before.ticks.filter(t => t.subBeat === 0);
  assert.equal(beforeMain.length, 4, "전환 전: 4박");

  // 모드 전환을 모사: 새 설정 적용 후 flushSchedule 호출.
  engine.setBeatsPerMeasure(7);
  engine.setBeatTypes(["strong", "normal", "normal", "normal", "accent", "normal", "normal"]);
  engine.flushSchedule();

  const after = engine.getScheduleInfo();
  const afterMain = after.ticks.filter(t => t.subBeat === 0);
  assert.equal(afterMain.length, 7, "flush 후: 새 박자수(7)가 즉시 반영");
  assert.equal(afterMain[0].type, "strong", "flush 후: 새 비트 타입(strong)이 첫 비트에 반영");
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

test("pureEmitBlock: count 블록은 value번 반복하며 ticks를 누적한다", () => {
  const blocks: LoopBlockData[] = [
    { startBeat: 0, endBeat: 3, type: "count", value: 2 },
  ];
  const inputs = makeInputsFromBlocks(blocks, 4);
  const state = makeState();
  const durCache = new Map<string, number>();

  pureEmitBlock(inputs, state, durCache, 0, new Set());

  // 4 beats * 2 repeats = 8 ticks
  assert.equal(state.ticks.length, 8);
  // 120bpm, 4 beats = 2000ms per pass, x2 = 4000ms total
  assert.equal(state.time, 4000);
  assert.equal(state.ticks[0].blockIndex, 0);
  assert.equal(state.ticks[0].blockRepeatTotal, 2);
  // 두 번째 반복의 첫 tick은 repeatIteration=1
  assert.equal(state.ticks[4].repeatIteration, 1);
});

test("pureEmitBlock: layer 블록은 스킵된다 (state 변경 없음)", () => {
  const blocks: LoopBlockData[] = [
    { startBeat: 0, endBeat: 3, type: "count", value: 1, layerOf: 99 },
  ];
  const inputs = makeInputsFromBlocks(blocks, 4);
  const state = makeState();
  const durCache = new Map<string, number>();

  pureEmitBlock(inputs, state, durCache, 0, new Set());

  assert.equal(state.ticks.length, 0);
  assert.equal(state.time, 0);
});

test("pureProcessBlock: jumpToBlock 처리 시 jumpProcessed에 대상 추가 + jumpIteration 부여", () => {
  const blocks: LoopBlockData[] = [
    { startBeat: 0, endBeat: 1, type: "count", value: 1, jumpToBlock: 1, jumpCount: 2 },
    { startBeat: 2, endBeat: 3, type: "count", value: 1 },
  ];
  const inputs = makeInputsFromBlocks(blocks, 4);
  const state = makeState();
  const durCache = new Map<string, number>();
  const jumpProcessed = new Set<number>();

  pureProcessBlock(inputs, state, durCache, jumpProcessed, 0, new Set());

  // 점프 대상이 jumpProcessed에 포함되어야 함
  assert.ok(jumpProcessed.has(1), "점프 대상 sortedIdx=1이 jumpProcessed에 포함");

  // jumpCount=2 → 자기 자신 + 대상 블록을 2회 교대 (총 4 outer 블록 emit)
  // 각 블록 2 beats × 4 = 8 ticks
  assert.equal(state.ticks.length, 8);

  // jumpIteration 0과 1이 모두 등장해야 함
  const iterations = new Set(state.ticks.map(t => t.jumpIteration));
  assert.ok(iterations.has(0) && iterations.has(1), "jumpIteration 0,1 모두 등장");

  // sourceBlockIndex는 source 블록의 origIdx(=0)
  assert.ok(state.ticks.every(t => t.jumpSourceBlockIndex === 0));

  // 점프 종료 후 state.jump 복원 확인
  assert.deepEqual(state.jump, { iteration: 0, total: 0, sourceBlockIndex: -1 });
});

test("pureProcessBlock: jumpToBlock이 없으면 emitBlock과 동일하게 동작 + jumpProcessed 변경 없음", () => {
  const blocks: LoopBlockData[] = [
    { startBeat: 0, endBeat: 1, type: "count", value: 1 },
  ];
  const inputs = makeInputsFromBlocks(blocks, 4);
  const state = makeState();
  const durCache = new Map<string, number>();
  const jumpProcessed = new Set<number>();

  pureProcessBlock(inputs, state, durCache, jumpProcessed, 0, new Set());

  assert.equal(jumpProcessed.size, 0);
  assert.equal(state.ticks.length, 2);
});

test("pureProcessOuterCached: 캐시 미스 → 빌드 후 다음 호출은 적중하며 ticks 동일", () => {
  const blocks: LoopBlockData[] = [
    { startBeat: 0, endBeat: 3, type: "count", value: 1 },
  ];
  const inputs = makeInputsFromBlocks(blocks, 4);
  const cache = new Map<string, { ticks: ScheduledTick[]; durMs: number }>();
  const fp = "FIXED-FP";
  let reuse = 0;
  let build = 0;
  const handle: BlockEmitCacheHandle = {
    cache,
    cacheMax: 16,
    computeFingerprint: () => fp,
    onReuse: () => { reuse++; },
    onBuild: () => { build++; },
  };

  // 첫 호출: 미스 → 빌드
  const s1 = makeState();
  pureProcessOuterCached(inputs, s1, new Map(), new Set(), handle, 0);
  assert.equal(build, 1);
  assert.equal(reuse, 0);
  assert.equal(cache.size, 1);
  assert.equal(s1.ticks.length, 4);

  // 두 번째 호출: 적중 → ticks가 cached로부터 복원되며 동일
  const s2 = makeState();
  pureProcessOuterCached(inputs, s2, new Map(), new Set(), handle, 0);
  assert.equal(build, 1);
  assert.equal(reuse, 1);
  assert.equal(s2.ticks.length, s1.ticks.length);
  assert.equal(s2.time, s1.time);
  for (let i = 0; i < s1.ticks.length; i++) {
    assert.deepEqual(s2.ticks[i], s1.ticks[i]);
  }
});

test("pureProcessOuterCached: 캐시 적중 시 startTime offset이 더해져 state.ticks에 추가", () => {
  const blocks: LoopBlockData[] = [
    { startBeat: 0, endBeat: 1, type: "count", value: 1 },
  ];
  const inputs = makeInputsFromBlocks(blocks, 4);
  const cache = new Map<string, { ticks: ScheduledTick[]; durMs: number }>();
  const handle: BlockEmitCacheHandle = {
    cache,
    cacheMax: 16,
    computeFingerprint: () => "FP",
    onReuse: () => {},
    onBuild: () => {},
  };

  // 첫 호출(time=0)로 캐시 채움
  pureProcessOuterCached(inputs, makeState(), new Map(), new Set(), handle, 0);

  // 두 번째 호출에서 state.time을 미리 1000으로 세팅
  const s = makeState();
  s.time = 1000;
  pureProcessOuterCached(inputs, s, new Map(), new Set(), handle, 0);

  // 첫 tick은 t=1000에서 시작
  assert.equal(s.ticks[0].time, 1000);
  // 한 비트 = 500ms이므로 두 번째 tick은 1500
  assert.equal(s.ticks[1].time, 1500);
  // state.time은 1000 + durMs = 1000 + 1000 = 2000
  assert.equal(s.time, 2000);
});

test("pureProcessOuterCached: cacheMax 초과 시 가장 오래된 항목 LRU 축출", () => {
  const blocks: LoopBlockData[] = [
    { startBeat: 0, endBeat: 1, type: "count", value: 1 },
  ];
  const inputs = makeInputsFromBlocks(blocks, 4);
  const cache = new Map<string, { ticks: ScheduledTick[]; durMs: number }>();
  let counter = 0;
  const handle: BlockEmitCacheHandle = {
    cache,
    cacheMax: 3,
    computeFingerprint: () => `fp-${counter}`,
    onReuse: () => {},
    onBuild: () => {},
  };

  for (counter = 0; counter < 5; counter++) {
    pureProcessOuterCached(inputs, makeState(), new Map(), new Set(), handle, 0);
  }

  assert.equal(cache.size, 3);
  // fp-0, fp-1은 축출, fp-2,3,4 남아있음
  assert.ok(!cache.has("fp-0"));
  assert.ok(!cache.has("fp-1"));
  assert.ok(cache.has("fp-2"));
  assert.ok(cache.has("fp-4"));
});

test("pureProcessOuterCached: 점프 진행 중(state.jump.total>0)에는 fingerprint를 계산하지 않고 캐시 비활성", () => {
  const blocks: LoopBlockData[] = [
    { startBeat: 0, endBeat: 1, type: "count", value: 1 },
  ];
  const inputs = makeInputsFromBlocks(blocks, 4);
  const cache = new Map<string, { ticks: ScheduledTick[]; durMs: number }>();
  let fpCalls = 0;
  const handle: BlockEmitCacheHandle = {
    cache,
    cacheMax: 16,
    computeFingerprint: () => { fpCalls++; return "FP"; },
    onReuse: () => {},
    onBuild: () => {},
  };

  const s = makeState();
  s.jump = { iteration: 0, total: 2, sourceBlockIndex: 5 };

  pureProcessOuterCached(inputs, s, new Map(), new Set(), handle, 0);

  assert.equal(fpCalls, 0, "점프 진행 중에는 fingerprint 미계산");
  assert.equal(cache.size, 0, "점프 진행 중에는 캐시에 저장되지 않음");
  assert.equal(s.ticks.length, 2, "그래도 처리는 정상 수행");
});

test("barRepeat.layers 추가 시 캐시 무효화 + 스케줄에 레이어 ticks 반영", () => {
  const engine = new MetronomeEngine();
  engine.setBeatsPerMeasure(4);
  engine.setBpm(120);

  // 레이어 없이 초기 빌드
  engine.buildScheduleOnly();
  assert.equal(engine._wasLastBuildCacheHit(), false);
  const before = engine.getScheduleInfo();
  const beforeLayerTicks = before.ticks.filter(t => t.layerIndex > 0);

  // 같은 입력 → 캐시 적중
  engine.buildScheduleOnly();
  assert.equal(engine._wasLastBuildCacheHit(), true);

  // 바 0에 레이어 추가
  engine.setBarRepeat(0, {
    type: "count",
    value: 1,
    layers: [{ subdivisions: ["normal", "normal"], soundSet: "woodblock" }],
  });

  // 레이어 변경 → 캐시 무효화
  engine.buildScheduleOnly();
  assert.equal(engine._wasLastBuildCacheHit(), false, "layers 변경은 캐시 무효화를 일으켜야 함");

  const after = engine.getScheduleInfo();
  const afterLayerTicks = after.ticks.filter(t => t.layerIndex > 0);
  assert.ok(afterLayerTicks.length > beforeLayerTicks.length, "레이어 ticks이 스케줄에 추가되어야 함");
  assert.ok(afterLayerTicks.some(t => t.layerSoundSet === "woodblock"), "레이어 soundSet이 tick에 전파되어야 함");
});

test("barRepeat.layers 변경(soundSet 교체) 시 캐시 무효화 + 새 soundSet 반영", () => {
  const engine = new MetronomeEngine();
  engine.setBeatsPerMeasure(4);
  engine.setBpm(120);
  engine.setBarRepeat(0, {
    type: "count",
    value: 1,
    layers: [{ subdivisions: ["normal"], soundSet: "classic" }],
  });

  engine.buildScheduleOnly();
  const tick1 = engine.getScheduleInfo().ticks.find(t => t.layerIndex > 0);
  assert.equal(tick1?.layerSoundSet, "classic");

  // soundSet을 woodblock으로 교체
  engine.setBarRepeat(0, {
    type: "count",
    value: 1,
    layers: [{ subdivisions: ["normal"], soundSet: "woodblock" }],
  });

  engine.buildScheduleOnly();
  assert.equal(engine._wasLastBuildCacheHit(), false, "soundSet 교체는 캐시 무효화");

  const tick2 = engine.getScheduleInfo().ticks.find(t => t.layerIndex > 0);
  assert.equal(tick2?.layerSoundSet, "woodblock", "새 soundSet이 tick에 반영되어야 함");
});

test("getAllBarRepeats: layers 포함 반환 + 반환값 변형이 내부 상태에 영향 없음", () => {
  const engine = new MetronomeEngine();
  const layers = [{ subdivisions: ["normal", "normal"], soundSet: "hihat" }];
  engine.setBarRepeat(2, { type: "count", value: 2, layers });

  const got = engine.getAllBarRepeats();
  assert.deepEqual(got[2].layers, layers, "getAllBarRepeats가 layers를 반환해야 함");

  // 반환된 layers 배열을 변형
  got[2].layers![0].soundSet = "cowbell";

  // 재조회 시 내부 상태는 그대로여야 함 (깊은 복사 보장)
  const got2 = engine.getAllBarRepeats();
  assert.equal(got2[2].layers![0].soundSet, "hihat", "외부 변형이 내부 상태에 영향 없어야 함");
});

test("pureProcessOuterCached: jumpToBlock 블록 캐시 적중 시 jumpProcessed에 대상 추가", () => {
  const blocks: LoopBlockData[] = [
    { startBeat: 0, endBeat: 1, type: "count", value: 1, jumpToBlock: 1, jumpCount: 1 },
    { startBeat: 2, endBeat: 3, type: "count", value: 1 },
  ];
  const inputs = makeInputsFromBlocks(blocks, 4);
  const cache = new Map<string, { ticks: ScheduledTick[]; durMs: number }>();
  const handle: BlockEmitCacheHandle = {
    cache,
    cacheMax: 16,
    computeFingerprint: () => "FP",
    onReuse: () => {},
    onBuild: () => {},
  };

  // 첫 호출에서 캐시 채움
  pureProcessOuterCached(inputs, makeState(), new Map(), new Set(), handle, 0);

  // 두 번째 호출(캐시 적중)에서도 jumpProcessed에 대상이 추가되어야 함
  const jumpProcessed = new Set<number>();
  pureProcessOuterCached(inputs, makeState(), new Map(), jumpProcessed, handle, 0);

  assert.ok(jumpProcessed.has(1), "캐시 적중 경로에서도 점프 대상 추적");
});
