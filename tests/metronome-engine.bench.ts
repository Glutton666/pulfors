import { test } from "node:test";
import assert from "node:assert/strict";
import { MetronomeEngine } from "../lib/metronome-engine";

type LoopBlock = Parameters<MetronomeEngine["setLoopBlocks"]>[0][number];

function buildHeavyConfig(): {
  beatsPerMeasure: number;
  loopBlocks: LoopBlock[];
  barRepeats: Record<number, { type: "count" | "duration"; value: number }>;
} {
  const beatsPerMeasure = 32;
  const loopBlocks: LoopBlock[] = [];
  for (let g = 0; g < 16; g++) {
    const start = g * 2;
    const end = start + 1;
    loopBlocks.push({ startBeat: start, endBeat: end, type: "count", value: 2 });
    loopBlocks.push({ startBeat: start, endBeat: end, type: "count", value: 2 });
    loopBlocks.push({ startBeat: start, endBeat: start, type: "count", value: 2 });
    loopBlocks.push({ startBeat: end, endBeat: end, type: "count", value: 2 });
  }
  const barRepeats: Record<number, { type: "count" | "duration"; value: number }> = {};
  for (let b = 0; b < beatsPerMeasure; b += 4) {
    barRepeats[b] = { type: "count", value: 2 };
  }
  return { beatsPerMeasure, loopBlocks, barRepeats };
}

function applyConfig(engine: MetronomeEngine) {
  const cfg = buildHeavyConfig();
  engine.setBeatsPerMeasure(cfg.beatsPerMeasure);
  engine.setBeatTypes(Array.from({ length: cfg.beatsPerMeasure }, (_, i) =>
    i % 4 === 0 ? "accent" : "normal",
  ));
  engine.setLoopBlocks(cfg.loopBlocks);
  engine.setAllBarRepeats(cfg.barRepeats);
}

function measureBuild(engine: MetronomeEngine, runs: number): number {
  const samples: number[] = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    engine.buildScheduleOnly();
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)];
}

test("benchmark: 64 블록 + 중첩 입력 빌드 시간(첫 빌드 vs 캐시 적중)", () => {
  const engine = new MetronomeEngine();
  applyConfig(engine);

  const coldStart = performance.now();
  engine.buildScheduleOnly();
  const coldMs = performance.now() - coldStart;
  assert.equal(engine._wasLastBuildCacheHit(), false, "첫 빌드는 미스여야 한다");

  const warmMedian = measureBuild(engine, 21);
  assert.equal(engine._wasLastBuildCacheHit(), true, "동일 입력 재빌드는 적중이어야 한다");

  console.log(
    `[bench] 64블록 cold=${coldMs.toFixed(2)}ms, warm(median of 21)=${warmMedian.toFixed(4)}ms, speedup≈${(coldMs / Math.max(warmMedian, 0.0001)).toFixed(1)}x`,
  );

  assert.ok(warmMedian < coldMs, "캐시 적중이 cold 빌드보다 빨라야 한다");
});

function applyOuterHeavyConfig(engine: MetronomeEngine) {
  // 64 outer 블록 (각 1박)에 + 인접 블록을 중첩(2박 outer 안에 1박 inner)
  const beatsPerMeasure = 64;
  const loopBlocks: LoopBlock[] = [];
  for (let g = 0; g < 32; g++) {
    const start = g * 2;
    // 2박 outer
    loopBlocks.push({ startBeat: start, endBeat: start + 1, type: "count", value: 2 });
    // 그 안의 1박 inner
    loopBlocks.push({ startBeat: start + 1, endBeat: start + 1, type: "count", value: 2 });
  }
  engine.setBeatsPerMeasure(beatsPerMeasure);
  engine.setBeatTypes(
    Array.from({ length: beatsPerMeasure }, (_, i) => (i % 4 === 0 ? "accent" : "normal")),
  );
  engine.setLoopBlocks(loopBlocks);
}

test("benchmark: 64 outer 블록 + 중첩 입력에서 단일 블록 편집 후 빌드(부분 캐시) vs cold 빌드", () => {
  // 워밍업: JIT 안정화
  for (let i = 0; i < 3; i++) {
    const e = new MetronomeEngine();
    applyOuterHeavyConfig(e);
    e.buildScheduleOnly();
  }

  // cold: 매번 새 엔진 (블록 캐시 비어있음 + 풀 스케줄 캐시 비어있음)
  const coldSamples: number[] = [];
  for (let i = 0; i < 21; i++) {
    const e = new MetronomeEngine();
    applyOuterHeavyConfig(e);
    const lb = e.getLoopBlocks();
    lb[10] = { ...lb[10], bpm: 100 + i };
    e.setLoopBlocks(lb);
    const start = performance.now();
    e.buildScheduleOnly();
    coldSamples.push(performance.now() - start);
  }
  coldSamples.sort((a, b) => a - b);
  const coldMedian = coldSamples[Math.floor(coldSamples.length / 2)];

  // partial-cache: 같은 엔진에 단일 블록만 반복 편집
  const engine = new MetronomeEngine();
  applyOuterHeavyConfig(engine);
  engine.buildScheduleOnly(); // warm up: outer 블록들을 블록 캐시에 등록
  const reusedFirst = engine._getLastBlockCacheReused();
  const builtFirst = engine._getLastBlockCacheBuilt();

  const partialSamples: number[] = [];
  let totalReused = 0;
  let totalBuilt = 0;
  for (let i = 0; i < 21; i++) {
    const lb = engine.getLoopBlocks();
    lb[10] = { ...lb[10], bpm: 100 + i };
    engine.setLoopBlocks(lb);
    const start = performance.now();
    engine.buildScheduleOnly();
    partialSamples.push(performance.now() - start);
    totalReused += engine._getLastBlockCacheReused();
    totalBuilt += engine._getLastBlockCacheBuilt();
  }
  partialSamples.sort((a, b) => a - b);
  const partialMedian = partialSamples[Math.floor(partialSamples.length / 2)];

  console.log(
    `[bench] 단일 블록 편집: cold(median of 21)=${coldMedian.toFixed(3)}ms, partial-cache(median of 21)=${partialMedian.toFixed(3)}ms, speedup≈${(coldMedian / Math.max(partialMedian, 0.0001)).toFixed(1)}x (warm-up reused=${reusedFirst} built=${builtFirst}; loop avg reused=${(totalReused / 21).toFixed(1)} built=${(totalBuilt / 21).toFixed(1)})`,
  );

  assert.ok(
    totalReused / 21 >= 1,
    `편집 루프 평균 재사용 outer 블록 수가 1 이상이어야 한다 (실제: ${(totalReused / 21).toFixed(2)})`,
  );
  assert.ok(
    partialMedian < coldMedian,
    `부분 캐시 빌드(${partialMedian.toFixed(3)}ms)가 cold(${coldMedian.toFixed(3)}ms)보다 빨라야 한다`,
  );
});

test("벤치마크: 입력 변경 후 빌드는 캐시 미스, 원복 시 재적중", () => {
  const engine = new MetronomeEngine();
  applyConfig(engine);
  engine.buildScheduleOnly();
  engine.buildScheduleOnly();
  assert.equal(engine._wasLastBuildCacheHit(), true);

  engine.setBpm(140);
  engine.buildScheduleOnly();
  assert.equal(engine._wasLastBuildCacheHit(), false, "BPM 변경 후 미스");

  engine.setBpm(120);
  engine.buildScheduleOnly();
  assert.equal(engine._wasLastBuildCacheHit(), true, "원래 BPM 복귀 시 캐시 적중");
});
