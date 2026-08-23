import { test } from "node:test";
import assert from "node:assert/strict";

import {
  completeEasterEggBarSession,
  prepareEasterEggEngine,
  restoreEasterEggBarEngine,
} from "../lib/easter-egg-engine-session";

function createEngine() {
  const state: {
    bpm: number;
    beatsPerMeasure: number;
    beatTypes: any[];
    beatSubdivisions: Record<string, any[]>;
    loopBlocks: Array<{ startBeat: number; endBeat: number; type: "count"; value: number }>;
    blockPlayMode: "loop";
    barRepeats: Record<number, any>;
    barBpmOverrides: Record<number, number>;
  } = {
    bpm: 132,
    beatsPerMeasure: 3,
    beatTypes: ["strong", "normal", "accent"] as any[],
    beatSubdivisions: { "1": ["normal", "normal"] as any[] },
    loopBlocks: [{ startBeat: 0, endBeat: 2, type: "count" as const, value: 2 }],
    blockPlayMode: "loop" as const,
    barRepeats: { 1: { type: "count" as const, value: 3, bpm: 150 } },
    barBpmOverrides: { 1: 150 },
  };

  return {
    state,
    getBpm: () => state.bpm,
    getBeatsPerMeasure: () => state.beatsPerMeasure,
    getBeatTypes: () => [...state.beatTypes],
    getAllBeatSubdivisions: () => ({ ...state.beatSubdivisions }),
    getLoopBlocks: () => state.loopBlocks.map((block) => ({ ...block })),
    getBlockPlayMode: () => state.blockPlayMode,
    getAllBarRepeats: () => ({ ...state.barRepeats }),
    getBarBpmOverrides: () => ({ ...state.barBpmOverrides }),
    setBpm: (bpm: number) => { state.bpm = bpm; },
    setBeatsPerMeasure: (beats: number) => { state.beatsPerMeasure = beats; },
    setBeatTypes: (types: any[]) => { state.beatTypes = [...types]; },
    setAllBeatSubdivisions: (subdivisions: Record<string, any[]>) => { state.beatSubdivisions = { ...subdivisions }; },
    setLoopBlocks: (blocks: any[]) => { state.loopBlocks = blocks.map((block) => ({ ...block })); },
    setBlockPlayMode: (mode: "loop") => { state.blockPlayMode = mode; },
    setAllBarRepeats: (repeats: Record<number, any>) => { state.barRepeats = { ...repeats }; },
    setAllBarBpmOverrides: (overrides: Record<number, number>) => { state.barBpmOverrides = { ...overrides }; },
    clearLoopBlocks: () => { state.loopBlocks = []; },
    clearBarRepeats: () => { state.barRepeats = {}; },
    clearBarBpmOverrides: () => { state.barBpmOverrides = {}; },
  };
}

test("바 모드 이스터 에그는 단순 퀴즈 패턴을 재생한 뒤 기존 바 엔진 상태를 복원한다", () => {
  const engine = createEngine();
  const original = JSON.parse(JSON.stringify(engine.state));

  const snapshot = prepareEasterEggEngine(engine as any, 88, ["strong"], true);

  assert.ok(snapshot);
  assert.equal(engine.state.bpm, 88);
  assert.equal(engine.state.beatsPerMeasure, 1);
  assert.deepEqual(engine.state.beatTypes, ["strong"]);
  assert.deepEqual(engine.state.beatSubdivisions, {});
  assert.deepEqual(engine.state.loopBlocks, []);
  assert.deepEqual(engine.state.barRepeats, {});
  assert.deepEqual(engine.state.barBpmOverrides, {});

  restoreEasterEggBarEngine(engine as any, snapshot!);
  assert.deepEqual(engine.state, original);
});

test("비트 모드 이스터 에그는 바 스케줄을 초기화하지 않는다", () => {
  const engine = createEngine();

  const snapshot = prepareEasterEggEngine(engine as any, 88, ["strong"], false);

  assert.equal(snapshot, null);
  assert.deepEqual(engine.state.loopBlocks, [{ startBeat: 0, endBeat: 2, type: "count", value: 2 }]);
  assert.deepEqual(engine.state.barRepeats, { 1: { type: "count", value: 3, bpm: 150 } });
});

test("바 모드에서 적용을 선택하면 비트 모드 BPM을 저장하면서 바 상태를 복원한다", () => {
  const engine = createEngine();
  const original = JSON.parse(JSON.stringify(engine.state));
  const snapshot = prepareEasterEggEngine(engine as any, 88, ["strong"], true);
  const appliedBpms: number[] = [];

  completeEasterEggBarSession(
    engine as any,
    snapshot!,
    88,
    true,
    (bpm) => appliedBpms.push(bpm),
  );

  assert.deepEqual(appliedBpms, [88]);
  assert.deepEqual(engine.state, original);
});