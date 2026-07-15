// Task #37: 엔진 호출 순서·인자까지 검증하는 라이브 라운드트립 테스트.
//
// applyEntryToState 만으로는 React state 라운드트립만 회귀 가드되고, 실제
// 엔진의 setter 호출 순서·인자가 어긋나도 잡지 못한다. 이 테스트는 fake
// MetronomeEngine spy를 주입해 다음을 검증한다:
//
//   1) 8단 setter가 정해진 순서로 호출되는지(시퀀스 스냅샷)
//   2) 5종 항목 패턴(빈/블록/바반복/BPM 오버라이드/노트샘플)에서 인자 정확성
//   3) 호출 시퀀스를 fake 엔진에 적용한 최종 상태가 applyEntryToState 결과와 일치
//
// 호출 순서가 바뀌면 사용자가 항목을 불러올 때 마지막 setter가 이전 값을
// 덮어써서 화면과 실제 재생이 어긋나는 회귀가 발생할 수 있다.
import { test } from "node:test";
import assert from "node:assert/strict";

import { applyEntryToEngine, applyEntryToState, type EntryEngineSetters } from "../app/index.helpers";
import type { PracticeEntry } from "../lib/storage";
import type { BeatType } from "../lib/metronome-engine";
import type { BarRepeat, LoopBlock } from "../components/beat-indicator.types";

type SpyCall =
  | { method: "setBpm"; args: [number] }
  | { method: "setBeatsPerMeasure"; args: [number] }
  | { method: "setBeatTypes"; args: [BeatType[]] }
  | { method: "setAllBeatSubdivisions"; args: [Record<string, BeatType[]>] }
  | { method: "setLoopBlocks"; args: [LoopBlock[]] }
  | { method: "setBlockPlayMode"; args: ["sequential" | "loop" | "random"] }
  | { method: "setAllBarRepeats"; args: [Record<number, BarRepeat>] }
  | { method: "setAllBarBpmOverrides"; args: [Record<number, number>] };

interface FakeEngine extends EntryEngineSetters {
  calls: SpyCall[];
  state: {
    bpm?: number;
    beatsPerMeasure?: number;
    beatTypes?: BeatType[];
    beatSubdivisions?: Record<string, BeatType[]>;
    loopBlocks?: LoopBlock[];
    blockPlayMode?: "sequential" | "loop" | "random";
    barRepeats?: Record<number, BarRepeat>;
    bpmOverrides?: Record<number, number>;
  };
}

function createFakeEngine(): FakeEngine {
  const calls: SpyCall[] = [];
  const state: FakeEngine["state"] = {};
  return {
    calls,
    state,
    setBpm(bpm) { calls.push({ method: "setBpm", args: [bpm] }); state.bpm = bpm; },
    setBeatsPerMeasure(b) { calls.push({ method: "setBeatsPerMeasure", args: [b] }); state.beatsPerMeasure = b; },
    setBeatTypes(t) { calls.push({ method: "setBeatTypes", args: [t] }); state.beatTypes = t; },
    setAllBeatSubdivisions(s) { calls.push({ method: "setAllBeatSubdivisions", args: [s] }); state.beatSubdivisions = s; },
    setLoopBlocks(b) { calls.push({ method: "setLoopBlocks", args: [b] }); state.loopBlocks = b; },
    setBlockPlayMode(m) { calls.push({ method: "setBlockPlayMode", args: [m] }); state.blockPlayMode = m; },
    setAllBarRepeats(r) { calls.push({ method: "setAllBarRepeats", args: [r] }); state.barRepeats = r; },
    setAllBarBpmOverrides(o) { calls.push({ method: "setAllBarBpmOverrides", args: [o] }); state.bpmOverrides = o; },
  };
}

const EXPECTED_SEQUENCE = [
  "setBpm",
  "setBeatsPerMeasure",
  "setBeatTypes",
  "setAllBeatSubdivisions",
  "setLoopBlocks",
  "setBlockPlayMode",
  "setAllBarRepeats",
  "setAllBarBpmOverrides",
] as const;

function assertCanonicalSequence(calls: SpyCall[]) {
  assert.deepEqual(calls.map((c) => c.method), [...EXPECTED_SEQUENCE]);
}

// ---- 5종 항목 패턴 ---------------------------------------------------------

const emptyEntry: PracticeEntry = {
  id: "empty",
  label: "빈 항목",
  createdAt: 0,
  bpm: 90,
  beatsPerMeasure: 4,
  beatTypes: ["accent", "normal", "normal", "normal"],
  beatSubdivisions: {},
  barRepeats: {},
  barLoopMode: "once",
  subdivisionPattern: ["accent"],
};

const blockEntry: PracticeEntry = {
  id: "block",
  label: "블록 있음",
  createdAt: 1,
  bpm: 120,
  beatsPerMeasure: 6,
  beatTypes: ["accent", "normal", "normal", "accent", "normal", "normal"],
  beatSubdivisions: { "0": ["accent", "normal"] },
  barRepeats: {},
  loopBlocks: [
    { startBeat: 0, endBeat: 5, type: "count", value: 2 },
    { startBeat: 0, endBeat: 5, type: "count", value: 1 },
  ],
  barLoopMode: "once",
  blockPlayMode: "sequential",
  subdivisionPattern: ["accent"],
};

const barRepeatEntry: PracticeEntry = {
  id: "barRepeat",
  label: "바 반복",
  createdAt: 2,
  bpm: 100,
  beatsPerMeasure: 4,
  beatTypes: ["accent", "normal", "normal", "normal"],
  beatSubdivisions: {},
  barRepeats: {
    0: { type: "count", value: 4 },
    2: { type: "duration", value: 8 },
  },
  barLoopMode: "loop",
  subdivisionPattern: ["accent"],
};

const bpmOverrideEntry: PracticeEntry = {
  id: "bpmOverride",
  label: "BPM 오버라이드",
  createdAt: 3,
  bpm: 144,
  beatsPerMeasure: 5,
  beatTypes: ["accent", "normal", "normal", "accent", "normal"],
  beatSubdivisions: { "1": ["accent"] },
  barRepeats: {
    0: { type: "count", value: 2, bpm: 90 },
    2: { type: "duration", value: 4, bpm: 160 },
    3: { type: "count", value: 1 },
  },
  barLoopMode: "once",
  blockPlayMode: "loop",
  subdivisionPattern: ["accent", "normal"],
};

const noteSampleEntry: PracticeEntry = {
  id: "noteSample",
  label: "노트 샘플",
  createdAt: 4,
  bpm: 80,
  beatsPerMeasure: 3,
  beatTypes: ["accent", "normal", "normal"],
  beatSubdivisions: {},
  barRepeats: {},
  barLoopMode: "once",
  subdivisionPattern: ["accent"],
  noteSamples: { "0": "file:///s0.wav", "2": "file:///s2.wav" },
  noteSampleNames: { "0": "S0", "2": "S2" },
  noteSampleSources: { "0": "recording", "2": "import" },
  noteSampleChannels: { "0": "left", "2": "right" },
};

// ---- 시퀀스 검증 ----------------------------------------------------------

test("[apply-engine] 빈 항목: 8단 setter가 정해진 순서로 호출", () => {
  const fake = createFakeEngine();
  applyEntryToEngine(fake, emptyEntry);
  assertCanonicalSequence(fake.calls);
  assert.equal(fake.state.bpm, 90);
  assert.equal(fake.state.beatsPerMeasure, 4);
  assert.deepEqual(fake.state.loopBlocks, []);
  assert.deepEqual(fake.state.barRepeats, {});
  assert.deepEqual(fake.state.bpmOverrides, {});
  assert.equal(fake.state.blockPlayMode, "loop");
});

test("[apply-engine] 블록 있음: loopBlocks/blockPlayMode 인자가 정확", () => {
  const fake = createFakeEngine();
  applyEntryToEngine(fake, blockEntry);
  assertCanonicalSequence(fake.calls);
  assert.deepEqual(fake.state.loopBlocks, blockEntry.loopBlocks);
  assert.equal(fake.state.blockPlayMode, "sequential");
  assert.deepEqual(fake.state.beatSubdivisions, { "0": ["accent", "normal"] });
  // loopBlocks 인자는 entry와 격리(얕은 복사)
  fake.state.loopBlocks!.push({ startBeat: 0, endBeat: 0, type: "count", value: 1 });
  assert.equal(blockEntry.loopBlocks!.length, 2);
});

test("[apply-engine] 바 반복: barRepeats 전체가 setAllBarRepeats로 전달", () => {
  const fake = createFakeEngine();
  applyEntryToEngine(fake, barRepeatEntry);
  assertCanonicalSequence(fake.calls);
  assert.deepEqual(fake.state.barRepeats, barRepeatEntry.barRepeats);
  // bpm 오버라이드가 없으므로 빈 객체
  assert.deepEqual(fake.state.bpmOverrides, {});
});

test("[apply-engine] BPM 오버라이드: barRepeats.bpm만 추출되어 setAllBarBpmOverrides로", () => {
  const fake = createFakeEngine();
  applyEntryToEngine(fake, bpmOverrideEntry);
  assertCanonicalSequence(fake.calls);
  assert.deepEqual(fake.state.bpmOverrides, { 0: 90, 2: 160 });
  // setAllBarRepeats는 모든 항목을 통째로 받음(bpm 필드 포함)
  assert.deepEqual(fake.state.barRepeats, bpmOverrideEntry.barRepeats);
  // setAllBarBpmOverrides는 setAllBarRepeats보다 뒤에 호출되어야 한다
  // (마지막에 적용된 값이 살아남도록)
  const repeatsIdx = fake.calls.findIndex((c) => c.method === "setAllBarRepeats");
  const overridesIdx = fake.calls.findIndex((c) => c.method === "setAllBarBpmOverrides");
  assert.ok(overridesIdx > repeatsIdx, "BPM 오버라이드는 barRepeats 뒤에 적용");
});

test("[apply-engine] 노트 샘플 항목도 동일 8단 시퀀스(샘플은 엔진 외부)", () => {
  const fake = createFakeEngine();
  applyEntryToEngine(fake, noteSampleEntry);
  // 노트 샘플은 엔진 setter로 흐르지 않으므로, 시퀀스 자체는 변하지 않는다.
  assertCanonicalSequence(fake.calls);
  assert.equal(fake.state.bpm, 80);
  assert.equal(fake.state.beatsPerMeasure, 3);
});

// ---- applyEntryToState와 fake 엔진 최종 상태가 일치하는지 ---------------

test("[apply-engine] fake 엔진 최종 상태가 applyEntryToState 결과와 일치(BPM 오버라이드)", () => {
  const fake = createFakeEngine();
  applyEntryToEngine(fake, bpmOverrideEntry);
  const expected = applyEntryToState(bpmOverrideEntry);
  assert.equal(fake.state.bpm, expected.bpm);
  assert.equal(fake.state.beatsPerMeasure, expected.beatsPerMeasure);
  assert.deepEqual(fake.state.beatTypes, expected.beatTypes);
  assert.deepEqual(fake.state.beatSubdivisions, expected.beatSubdivisions);
  assert.deepEqual(fake.state.loopBlocks, expected.loopBlocks);
  assert.deepEqual(fake.state.barRepeats, expected.barRepeats);
  assert.deepEqual(fake.state.bpmOverrides, expected.bpmOverrides);
  assert.equal(fake.state.blockPlayMode, expected.blockPlayMode);
});

test("[apply-engine] 입력 entry는 setter 인자 변형으로부터 격리(얕은 복사)", () => {
  const fake = createFakeEngine();
  applyEntryToEngine(fake, blockEntry);
  // setter들이 받은 인자를 변형해도 원본 entry는 그대로
  fake.state.beatTypes!.push("strong");
  (fake.state.beatSubdivisions as Record<string, BeatType[]>)["99"] = ["accent"];
  fake.state.loopBlocks!.length = 0;
  assert.equal(blockEntry.beatTypes.length, 6);
  assert.equal((blockEntry.beatSubdivisions as Record<string, BeatType[]>)["99"], undefined);
  assert.equal(blockEntry.loopBlocks!.length, 2);
});

test("[apply-engine] BPM 오버라이드 정책: 0/음수/누락은 무시, 양수만 통과", () => {
  // 사용자가 BPM 입력란을 비웠을 때 0이 흘러올 수 있다. 엔진은 20~300으로
  // 클램프하므로 0을 그대로 넘기면 20으로 잘못 강제된다. 헬퍼에서 막아야 한다.
  const entry: PracticeEntry = {
    ...emptyEntry,
    barRepeats: {
      0: { type: "count", value: 2, bpm: 0 },
      1: { type: "count", value: 2, bpm: -10 },
      2: { type: "count", value: 2 },
      3: { type: "count", value: 2, bpm: 140 },
    } as Record<number, BarRepeat>,
  };
  const fake = createFakeEngine();
  applyEntryToEngine(fake, entry);
  assert.deepEqual(fake.state.bpmOverrides, { 3: 140 });
});

test("[apply-engine] BPM 오버라이드 정책 패리티: applyEntryToState와 동일한 필터링", () => {
  // 두 헬퍼가 같은 의미를 가져야 한다. 한 쪽만 0/음수를 거르면
  // 화면(state)과 엔진이 서로 다른 BPM 맵으로 동작하는 사고가 가능.
  const entry: PracticeEntry = {
    ...emptyEntry,
    barRepeats: {
      0: { type: "count", value: 2, bpm: 0 },
      1: { type: "count", value: 2, bpm: -10 },
      2: { type: "count", value: 2 },
      3: { type: "count", value: 2, bpm: 140 },
    } as Record<number, BarRepeat>,
  };
  const fake = createFakeEngine();
  applyEntryToEngine(fake, entry);
  const state = applyEntryToState(entry);
  assert.deepEqual(fake.state.bpmOverrides, state.bpmOverrides);
  assert.deepEqual(state.bpmOverrides, { 3: 140 });
});

test("[apply-engine] layers: barRepeats.layers 필드가 setAllBarRepeats 인자에 그대로 전달", () => {
  const layersEntry: PracticeEntry = {
    ...emptyEntry,
    barRepeats: {
      0: {
        type: "count",
        value: 3,
        layers: [
          { beatType: "normal", subdivisions: ["normal", "normal"], soundSet: "rimshot" },
          { beatType: "accent" },
        ],
      } as BarRepeat,
      2: { type: "duration", value: 2 },
    },
  };
  const fake = createFakeEngine();
  applyEntryToEngine(fake, layersEntry);
  assertCanonicalSequence(fake.calls);
  const r0 = fake.state.barRepeats![0] as BarRepeat;
  assert.ok(Array.isArray(r0.layers), "beat 0에 layers 배열 존재");
  assert.equal(r0.layers!.length, 2, "2개 레이어");
  assert.equal(r0.layers![0].soundSet, "rimshot", "레이어 0 soundSet 보존");
  assert.deepEqual(r0.layers![0].subdivisions, ["normal", "normal"], "레이어 0 subdivisions 보존");
  assert.equal(r0.layers![1].beatType, "accent", "레이어 1 beatType 보존");
  assert.ok(!("layers" in (fake.state.barRepeats![2] as BarRepeat) && (fake.state.barRepeats![2] as BarRepeat).layers?.length), "layers 없는 바는 영향 없음");
});

test("[apply-engine] layers: applyEntryToState도 동일하게 layers 보존", () => {
  const layersEntry: PracticeEntry = {
    ...emptyEntry,
    barRepeats: {
      1: {
        type: "count",
        value: 2,
        layers: [{ beatType: "normal", soundSet: "hihat" }],
      } as BarRepeat,
    },
  };
  const state = applyEntryToState(layersEntry);
  const r1 = state.barRepeats[1] as BarRepeat;
  assert.ok(Array.isArray(r1.layers), "state.barRepeats[1].layers가 배열");
  assert.equal(r1.layers![0].soundSet, "hihat", "soundSet 보존");
});

test("[apply-engine] blockPlayMode 누락 시 'loop' 폴백, barRepeats 누락 시 빈 객체", () => {
  const noBlocksEntry: PracticeEntry = {
    ...emptyEntry,
    barRepeats: undefined as unknown as Record<number, BarRepeat>,
    blockPlayMode: undefined,
  };
  const fake = createFakeEngine();
  applyEntryToEngine(fake, noBlocksEntry);
  assert.equal(fake.state.blockPlayMode, "loop");
  assert.deepEqual(fake.state.barRepeats, {});
  assert.deepEqual(fake.state.bpmOverrides, {});
  assert.deepEqual(fake.state.loopBlocks, []);
});
