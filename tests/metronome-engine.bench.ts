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
