import { test } from "node:test";
import assert from "node:assert/strict";

import {
  pureGetBeatDur,
  pureGetBarDur,
  pureGetSubPattern,
  pureFindInnerBlock,
  pureCalcSinglePassDur,
  pureAddBeatTicks,
  pureAddBarWithRepeat,
  pureEmitBeatsInRange,
  pureEmitStackedBlockTicks,
  toEngineBpm,
  type ScheduleInputs,
  type EmitState,
  type LoopBlockData,
  type BeatType,
} from "../lib/metronome-engine";

function makeInputs(overrides: Partial<ScheduleInputs> = {}): ScheduleInputs {
  const sortedBlocks: LoopBlockData[] = overrides.sortedBlocks ?? [];
  const origToSorted = overrides.origToSorted ?? new Map<number, number>();
  const sortedToOrig = overrides.sortedToOrig ?? new Map<number, number>();
  const startBeatToBlocks = overrides.startBeatToBlocks ?? new Map<number, number[]>();
  if (!overrides.startBeatToBlocks) {
    sortedBlocks.forEach((b, i) => {
      const arr = startBeatToBlocks.get(b.startBeat);
      if (arr) arr.push(i); else startBeatToBlocks.set(b.startBeat, [i]);
    });
  }
  if (!overrides.origToSorted) {
    sortedBlocks.forEach((_, i) => {
      origToSorted.set(i, i);
      sortedToOrig.set(i, i);
    });
  }
  return {
    bpm: 120,
    halfTime: false,
    beatsPerMeasure: 4,
    beatTypes: ["accent", "normal", "normal", "normal"],
    beatSubdivisions: new Map(),
    barRepeats: new Map(),
    barBpmOverrides: new Map(),
    sortedBlocks,
    origToSorted,
    sortedToOrig,
    startBeatToBlocks,
    loopBlocks: overrides.loopBlocks ?? sortedBlocks,
    ...overrides,
  };
}

function makeState(): EmitState {
  return { ticks: [], time: 0, jump: { iteration: 0, total: 0, sourceBlockIndex: -1 } };
}

test("pureGetBeatDur: 기본 BPM 120에서 500ms", () => {
  const inputs = makeInputs();
  assert.equal(pureGetBeatDur(inputs, 0), 500);
});

test("pureGetBeatDur: halfTime이면 길이가 2배", () => {
  const inputs = makeInputs({ halfTime: true });
  assert.equal(pureGetBeatDur(inputs, 0), 1000);
});

test("pureGetBeatDur: blockBpm 인자가 기본 bpm을 오버라이드", () => {
  const inputs = makeInputs();
  assert.equal(pureGetBeatDur(inputs, 0, 60), 1000);
});

test("pureGetBeatDur: barBpmOverrides가 blockBpm보다 우선", () => {
  const inputs = makeInputs({ barBpmOverrides: new Map([[2, 240]]) });
  assert.equal(pureGetBeatDur(inputs, 2, 60), 250);
});

test("pureGetBarDur: 바별 분자는 같은 BPM에서도 각 바의 전체 길이를 독립적으로 정한다", () => {
  const inputs = makeInputs({
    beatTypes: ["accent", "accent"],
    beatSubdivisions: new Map([
      [0, ["accent", "normal", "normal"]],
      [1, ["accent", "normal", "normal", "normal"]],
    ]),
    barRepeats: new Map([
      [0, { type: "count", value: 1, meterNumerator: 3, meterDenominator: 4 }],
      [1, { type: "count", value: 1, meterNumerator: 4, meterDenominator: 4 }],
    ]),
  });
  assert.equal(pureGetBarDur(inputs, 0), 1500);
  assert.equal(pureGetBarDur(inputs, 1), 2000);
});

test("pureGetSubPattern: 커스텀 없으면 비트 타입 단일 배열", () => {
  const r = pureGetSubPattern(["accent", "normal"], new Map(), 0);
  assert.deepEqual(r, ["accent"]);
});

test("pureGetSubPattern: mute 비트는 모든 서브가 mute", () => {
  const subs = new Map<number, BeatType[]>([[0, ["normal", "normal", "normal"]]]);
  const r = pureGetSubPattern(["mute"], subs, 0);
  assert.deepEqual(r, ["mute", "mute", "mute"]);
});

test("pureGetSubPattern: strong 비트는 첫 서브를 strong으로 승격", () => {
  const subs = new Map<number, BeatType[]>([[0, ["normal", "normal"]]]);
  const r = pureGetSubPattern(["strong"], subs, 0);
  assert.deepEqual(r, ["strong", "normal"]);
});

test("pureGetSubPattern: accent 비트는 첫 normal을 accent로 승격", () => {
  const subs = new Map<number, BeatType[]>([[0, ["normal", "normal"]]]);
  const r = pureGetSubPattern(["accent"], subs, 0);
  assert.deepEqual(r, ["accent", "normal"]);
});

test("pureGetSubPattern: 6/8 복합박자 스케줄 - 그룹 시작(0,3)만 강세, 나머지는 그대로", () => {
  const beatTypes: BeatType[] = ["strong", "normal", "normal", "accent", "normal", "normal"];
  const empty = new Map<number, BeatType[]>();
  const schedule = beatTypes.map((_, beat) => pureGetSubPattern(beatTypes, empty, beat));
  assert.deepEqual(schedule, [
    ["strong"], ["normal"], ["normal"],
    ["accent"], ["normal"], ["normal"],
  ]);
});

test("pureGetSubPattern: 9/8 복합박자 스케줄 - 세 그룹(0,3,6) 모두 강세 반영", () => {
  const beatTypes: BeatType[] = [
    "strong", "normal", "normal",
    "accent", "normal", "normal",
    "accent", "normal", "normal",
  ];
  const empty = new Map<number, BeatType[]>();
  const schedule = beatTypes.map((_, beat) => pureGetSubPattern(beatTypes, empty, beat));
  assert.deepEqual(schedule, beatTypes.map((t) => [t]));
});

test("pureFindInnerBlock: layer 블록은 무시", () => {
  const sorted: LoopBlockData[] = [
    { startBeat: 0, endBeat: 3, type: "count", value: 1 },
    { startBeat: 1, endBeat: 1, type: "count", value: 1, layerOf: 0 },
  ];
  const m = new Map<number, number[]>([[0, [0]], [1, [1]]]);
  assert.equal(pureFindInnerBlock(sorted, m, 1, 3, 0), -1);
});

test("pureFindInnerBlock: 부모 인덱스 자신은 제외", () => {
  const sorted: LoopBlockData[] = [
    { startBeat: 0, endBeat: 3, type: "count", value: 1 },
  ];
  const m = new Map<number, number[]>([[0, [0]]]);
  assert.equal(pureFindInnerBlock(sorted, m, 0, 3, 0), -1);
});

test("pureFindInnerBlock: 범위 안 자식 블록 인덱스 반환", () => {
  const sorted: LoopBlockData[] = [
    { startBeat: 0, endBeat: 3, type: "count", value: 1 },
    { startBeat: 1, endBeat: 2, type: "count", value: 2 },
  ];
  const m = new Map<number, number[]>([[0, [0]], [1, [1]]]);
  assert.equal(pureFindInnerBlock(sorted, m, 1, 3, 0), 1);
});

test("pureCalcSinglePassDur: 자식 없는 단순 범위는 비트 합", () => {
  const inputs = makeInputs();
  const cache = new Map<string, number>();
  // 0..3 → 4 비트 × 500ms
  assert.equal(pureCalcSinglePassDur(inputs, cache, 0, 3, -1), 2000);
});

test("pureCalcSinglePassDur: barRepeat count가 길이를 곱한다", () => {
  const inputs = makeInputs({ barRepeats: new Map([[0, { type: "count", value: 3 }]]) });
  const cache = new Map<string, number>();
  // beat0 500ms × 3 + beat1..3 500×3 = 1500+1500 = 3000
  assert.equal(pureCalcSinglePassDur(inputs, cache, 0, 3, -1), 3000);
});

test("pureCalcSinglePassDur: 중첩 블록은 재귀+반복", () => {
  const sorted: LoopBlockData[] = [
    { startBeat: 0, endBeat: 3, type: "count", value: 1 },
    { startBeat: 1, endBeat: 2, type: "count", value: 2 },
  ];
  const inputs = makeInputs({ sortedBlocks: sorted });
  const cache = new Map<string, number>();
  // outer 0..3, inner 1..2 ×2 = (500+500)×2 = 2000; outer 외 비트 0(500)+3(500) = 1000; 합 3000
  assert.equal(pureCalcSinglePassDur(inputs, cache, 0, 3, 0), 3000);
});

test("pureCalcSinglePassDur: 캐시 적중", () => {
  const inputs = makeInputs();
  const cache = new Map<string, number>();
  pureCalcSinglePassDur(inputs, cache, 0, 3, -1);
  const sizeBefore = cache.size;
  pureCalcSinglePassDur(inputs, cache, 0, 3, -1);
  assert.equal(cache.size, sizeBefore);
});

test("pureAddBeatTicks: 단일 비트 1틱 추가, time 전진", () => {
  const inputs = makeInputs();
  const state = makeState();
  pureAddBeatTicks(inputs, state, 0, 0, 0, 1, -1, 1);
  assert.equal(state.ticks.length, 1);
  assert.equal(state.ticks[0].type, "accent");
  assert.equal(state.ticks[0].isMainBeat, true);
  assert.equal(state.time, 500);
});

test("pureAddBeatTicks: 서브디비전 3개면 3틱, time = 1비트 분량", () => {
  const inputs = makeInputs({
    beatSubdivisions: new Map<number, BeatType[]>([[0, ["normal", "normal", "normal"]]]),
  });
  const state = makeState();
  pureAddBeatTicks(inputs, state, 0, 0, 0, 1, -1, 1);
  assert.equal(state.ticks.length, 3);
  assert.equal(state.ticks[0].isMainBeat, true);
  assert.equal(state.ticks[1].isMainBeat, false);
  assert.ok(Math.abs(state.time - 500) < 1e-6);
});

test("pureAddBeatTicks: jump 상태가 tick에 반영", () => {
  const inputs = makeInputs();
  const state = makeState();
  state.jump = { iteration: 1, total: 3, sourceBlockIndex: 7 };
  pureAddBeatTicks(inputs, state, 0, 0, 0, 1, -1, 1);
  assert.equal(state.ticks[0].jumpIteration, 1);
  assert.equal(state.ticks[0].jumpTotal, 3);
  assert.equal(state.ticks[0].jumpSourceBlockIndex, 7);
});

test("pureAddBarWithRepeat: barRepeats 없으면 1회", () => {
  const inputs = makeInputs();
  const state = makeState();
  pureAddBarWithRepeat(inputs, state, 0, 0, -1, 1);
  assert.equal(state.ticks.length, 1);
  assert.equal(state.ticks[0].barRepeatTotal, 1);
});

test("pureAddBarWithRepeat: count 타입은 횟수만큼 반복", () => {
  const inputs = makeInputs({ barRepeats: new Map([[0, { type: "count", value: 3 }]]) });
  const state = makeState();
  pureAddBarWithRepeat(inputs, state, 0, 0, -1, 1);
  assert.equal(state.ticks.length, 3);
  assert.equal(state.ticks[0].barRepeatIteration, 0);
  assert.equal(state.ticks[2].barRepeatIteration, 2);
  assert.equal(state.ticks[0].barRepeatTotal, 3);
  assert.equal(state.time, 1500);
});

test("pureAddBarWithRepeat: duration 타입은 시간 기반으로 횟수 계산", () => {
  // bpm=120 → 1박=500ms. duration value=1.5(초)면 round(1500/500)=3회
  const inputs = makeInputs({ barRepeats: new Map([[0, { type: "duration", value: 1.5 }]]) });
  const state = makeState();
  pureAddBarWithRepeat(inputs, state, 0, 0, -1, 1);
  assert.equal(state.ticks.length, 3);
  assert.equal(state.ticks[0].barRepeatTotal, 3);
  assert.ok(Math.abs(state.time - 1500) < 1e-6);
});

test("pureAddBarWithRepeat: blockBpm이 적용되어 비트 길이 변경", () => {
  const inputs = makeInputs();
  const state = makeState();
  pureAddBarWithRepeat(inputs, state, 0, 0, 5, 2, 60); // 60bpm → 1000ms/beat
  assert.equal(state.ticks.length, 1);
  assert.equal(state.ticks[0].blockIndex, 5);
  assert.equal(state.ticks[0].blockRepeatTotal, 2);
  assert.equal(state.time, 1000);
});

test("pureEmitStackedBlockTicks: 부모에 layer 블록 없으면 no-op", () => {
  const inputs = makeInputs();
  const state = makeState();
  pureEmitStackedBlockTicks(inputs, state, 0, 0, 1000, 0, 1);
  assert.equal(state.ticks.length, 0);
});

test("pureEmitStackedBlockTicks: layer 블록은 layerIndex>=1 ticks 생성", () => {
  const sorted: LoopBlockData[] = [
    { startBeat: 0, endBeat: 1, type: "count", value: 1 },
    { startBeat: 0, endBeat: 1, type: "count", value: 1, layerOf: 0 },
  ];
  const origToSorted = new Map<number, number>([[0, 0], [1, 1]]);
  const sortedToOrig = new Map<number, number>([[0, 0], [1, 1]]);
  const startBeatToBlocks = new Map<number, number[]>([[0, [0, 1]]]);
  const inputs = makeInputs({
    sortedBlocks: sorted,
    loopBlocks: sorted,
    origToSorted,
    sortedToOrig,
    startBeatToBlocks,
  });
  const state = makeState();
  // 부모 origIdx=0, blockStartTime=0, blockDurMs=1000 (2비트 분량 @ 120bpm)
  pureEmitStackedBlockTicks(inputs, state, 0, 0, 1000, 0, 1);
  assert.ok(state.ticks.length >= 1, `생성된 layer ticks가 있어야 함 (실제 ${state.ticks.length})`);
  assert.equal(state.ticks[0].layerIndex, 1);
  assert.equal(state.ticks[0].blockIndex, 1);
});

test("pureEmitStackedBlockTicks: ownBeatTypes가 첫 서브의 타입을 결정", () => {
  const sorted: LoopBlockData[] = [
    { startBeat: 0, endBeat: 1, type: "count", value: 1 },
    { startBeat: 0, endBeat: 0, type: "count", value: 1, layerOf: 0, ownBeatTypes: { 0: "strong" } },
  ];
  const inputs = makeInputs({ sortedBlocks: sorted, loopBlocks: sorted });
  const state = makeState();
  pureEmitStackedBlockTicks(inputs, state, 0, 0, 500, 0, 1);
  assert.ok(state.ticks.length >= 1);
  assert.equal(state.ticks[0].type, "strong");
  assert.equal(state.ticks[0].layerIndex, 1);
});

test("pureEmitStackedBlockTicks: 다중 layer(2개) 동시 emit 시 layerIndex 1,2 부여 + 서브디비전 적용", () => {
  // 부모(0..1) 위에 layer1(0..1), layer2(0..1) 두 개. layer2는 서브디비전 [normal, normal] 적용.
  const sorted: LoopBlockData[] = [
    { startBeat: 0, endBeat: 1, type: "count", value: 1 },
    { startBeat: 0, endBeat: 1, type: "count", value: 1, layerOf: 0, bpm: 120 },
    {
      startBeat: 0,
      endBeat: 1,
      type: "count",
      value: 1,
      layerOf: 0,
      bpm: 120,
      ownSubdivisions: { "0": ["normal", "normal"], "1": ["normal", "normal"] },
    },
  ];
  const inputs = makeInputs({ sortedBlocks: sorted, loopBlocks: sorted, beatsPerMeasure: 2 });
  const state = makeState();
  // 부모 길이 = 2박 × 500ms = 1000ms
  pureEmitStackedBlockTicks(inputs, state, 0, 0, 1000, 0, 1);

  const layer1 = state.ticks.filter(t => t.layerIndex === 1);
  const layer2 = state.ticks.filter(t => t.layerIndex === 2);
  // layer1: 2박 (서브 없음) → 2틱
  assert.equal(layer1.length, 2, "layer1은 비트당 1틱 = 2틱");
  // layer2: 2박 × 2서브 = 4틱
  assert.equal(layer2.length, 4, "layer2는 ownSubdivisions 적용으로 4틱");
  // 각 layer의 blockIndex가 다르며 layer 블록 origIdx와 일치
  assert.equal(layer1[0].blockIndex, 1);
  assert.equal(layer2[0].blockIndex, 2);
  // layer1 시간: 0, 500
  assert.equal(layer1[0].time, 0);
  assert.equal(layer1[1].time, 500);
  // layer2 시간: 0, 250, 500, 750 (서브 분할)
  assert.deepEqual(
    layer2.map(t => t.time),
    [0, 250, 500, 750],
  );
  // layer2의 첫 서브는 isMainBeat=true, 두번째는 false
  assert.equal(layer2[0].isMainBeat, true);
  assert.equal(layer2[1].isMainBeat, false);
  // type도 검증: 부모의 beatTypes를 기본 사용 (beat 0=accent, beat 1=normal)
  assert.equal(layer1[0].type, "accent");
  assert.equal(layer1[1].type, "normal");
  assert.equal(layer2[0].type, "normal");
  assert.equal(layer2[2].type, "normal");
});

test("pureEmitStackedBlockTicks: 3개 layer가 같은 부모에 layerIndex 1..3 순서로 부여", () => {
  const sorted: LoopBlockData[] = [
    { startBeat: 0, endBeat: 0, type: "count", value: 1 },
    { startBeat: 0, endBeat: 0, type: "count", value: 1, layerOf: 0, bpm: 120 },
    { startBeat: 0, endBeat: 0, type: "count", value: 1, layerOf: 0, bpm: 120 },
    { startBeat: 0, endBeat: 0, type: "count", value: 1, layerOf: 0, bpm: 120 },
  ];
  const inputs = makeInputs({ sortedBlocks: sorted, loopBlocks: sorted, beatsPerMeasure: 1 });
  const state = makeState();
  pureEmitStackedBlockTicks(inputs, state, 0, 0, 500, 0, 1);

  // 각 layer 1틱씩 = 3틱
  assert.equal(state.ticks.length, 3);
  // layerOf=0인 블록 등장 순서대로 layerIndex 1,2,3
  const byLayer = [...state.ticks].sort((a, b) => a.layerIndex - b.layerIndex);
  assert.equal(byLayer[0].layerIndex, 1);
  assert.equal(byLayer[0].blockIndex, 1);
  assert.equal(byLayer[1].layerIndex, 2);
  assert.equal(byLayer[1].blockIndex, 2);
  assert.equal(byLayer[2].layerIndex, 3);
  assert.equal(byLayer[2].blockIndex, 3);
});

test("pureAddBarWithRepeat: barRepeat duration 타입에서 부동소수점 누적 오차가 박 길이 합에 비례한 범위 내", () => {
  // bpm=180 → 1박 = 60000/180 = 333.333... ms
  // duration 2초 → round(2000/333.333) = 6회
  const inputs = makeInputs({
    bpm: 180,
    barRepeats: new Map([[0, { type: "duration", value: 2 }]]),
  });
  const state = makeState();
  pureAddBarWithRepeat(inputs, state, 0, 0, -1, 1);

  const beatDur = 60000 / 180;
  assert.equal(state.ticks.length, 6, "6회 반복");
  // 각 tick의 time이 i*beatDur과 정확히 일치(누적 + 가 아닌 i*subDur로 계산되는지)
  for (let i = 0; i < 6; i++) {
    const expected = i * beatDur;
    const actual = state.ticks[i].time;
    assert.ok(
      Math.abs(actual - expected) < 1e-9,
      `tick[${i}].time=${actual} ~ ${expected} (drift ${actual - expected})`,
    );
  }
  // state.time = 6 박 길이. 누적 오차가 1e-9 이내.
  const expectedTotal = 6 * beatDur;
  assert.ok(
    Math.abs(state.time - expectedTotal) < 1e-9,
    `state.time=${state.time} ~ ${expectedTotal}`,
  );
});

test("pureCalcSinglePassDur: barRepeat duration의 시간 누적도 round 기반이라 안정적", () => {
  // bpm=130 → 1박 = 60000/130 = 461.538... ms
  // 4박, 비트0에 duration 1초 barRepeat: round(1000/461.538) = 2회
  // 총 길이 = 비트0 ×2 + 비트1..3 = 2*461.538 + 3*461.538 = 5*461.538
  const inputs = makeInputs({
    bpm: 130,
    barRepeats: new Map([[0, { type: "duration", value: 1 }]]),
  });
  const cache = new Map<string, number>();
  const dur = pureCalcSinglePassDur(inputs, cache, 0, 3, -1);
  const beatDur = 60000 / 130;
  const expected = 5 * beatDur;
  assert.ok(Math.abs(dur - expected) < 1e-9, `dur=${dur} ~ ${expected}`);
});

test("pureAddBarWithRepeat: barRep.layers가 있으면 layerIndex>0 tick 추가 생성", () => {
  const inputs = makeInputs({
    barRepeats: new Map([[0, {
      type: "count",
      value: 1,
      layers: [{ beatType: "normal", subdivisions: ["normal", "normal"] }],
    }]]),
  });
  const state = makeState();
  pureAddBarWithRepeat(inputs, state, 0, 0, -1, 1);
  const mainTicks = state.ticks.filter(t => t.layerIndex === 0);
  const layerTicks = state.ticks.filter(t => t.layerIndex === 1);
  assert.equal(mainTicks.length, 1, "메인 비트 1회");
  assert.equal(layerTicks.length, 2, "레이어 서브디비전 2개 tick");
  assert.equal(layerTicks[0].beat, 0);
  assert.equal(layerTicks[0].subBeat, 0);
  assert.equal(layerTicks[1].subBeat, 1);
  assert.equal(layerTicks[0].time, 0, "레이어 첫 tick은 비트 시작 시각과 동일");
});

test("pureAddBarWithRepeat: 여러 레이어가 있을 때 각 레이어에 다른 layerIndex 부여", () => {
  const inputs = makeInputs({
    barRepeats: new Map([[0, {
      type: "count",
      value: 1,
      layers: [
        { beatType: "normal" },
        { beatType: "accent", soundSet: "cowbell" },
      ],
    }]]),
  });
  const state = makeState();
  pureAddBarWithRepeat(inputs, state, 0, 0, -1, 1);
  const l1 = state.ticks.filter(t => t.layerIndex === 1);
  const l2 = state.ticks.filter(t => t.layerIndex === 2);
  assert.equal(l1.length, 1, "레이어 1 tick 1개");
  assert.equal(l2.length, 1, "레이어 2 tick 1개");
  assert.equal(l2[0].layerSoundSet, "cowbell", "레이어 2 soundSet 전달");
});

test("pureAddBarWithRepeat: 레이어 없는 바는 기존 글로벌 서브디비전만 사용", () => {
  const inputs = makeInputs({
    beatSubdivisions: new Map([[0, ["accent", "normal", "normal"]]]),
    barRepeats: new Map([[0, { type: "count", value: 1 }]]),
  });
  const state = makeState();
  pureAddBarWithRepeat(inputs, state, 0, 0, -1, 1);
  assert.ok(state.ticks.every(t => t.layerIndex === 0), "레이어 tick 없음");
  assert.equal(state.ticks.length, 3, "글로벌 서브디비전 3개 tick");
});

test("pureAddBarWithRepeat: count 반복 + layers — 각 반복마다 레이어 tick 생성", () => {
  const inputs = makeInputs({
    barRepeats: new Map([[0, {
      type: "count",
      value: 2,
      layers: [{ beatType: "normal" }],
    }]]),
  });
  const state = makeState();
  pureAddBarWithRepeat(inputs, state, 0, 0, -1, 1);
  const layerTicks = state.ticks.filter(t => t.layerIndex === 1);
  assert.equal(layerTicks.length, 2, "2회 반복 × 레이어 1 = 2 tick");
});

// ─── 루프 부호(voltaMax / isEnd / jumpFromId-jumpToId) 테스트 ───────────────

test("pureAddBarWithRepeat: voltaMax — blockIteration < voltaMax 이면 바를 재생", () => {
  const inputs = makeInputs({
    barRepeats: new Map([[0, { type: "count", value: 1, voltaMax: 2 }]]),
  });
  const state = makeState();
  pureAddBarWithRepeat(inputs, state, 0, 1, -1, 3);
  assert.equal(state.ticks.length, 1, "iteration 1 < voltaMax 2 → 재생");
});

test("pureAddBarWithRepeat: voltaMax — blockIteration >= voltaMax 이면 바를 건너뜀", () => {
  const inputs = makeInputs({
    barRepeats: new Map([[0, { type: "count", value: 1, voltaMax: 2 }]]),
  });
  const state = makeState();
  pureAddBarWithRepeat(inputs, state, 0, 2, -1, 3);
  assert.equal(state.ticks.length, 0, "iteration 2 >= voltaMax 2 → 건너뜀, tick 없음");
});

test("pureAddBarWithRepeat: voltaMax=0 이면 건너뜀 없음 (비활성)", () => {
  const inputs = makeInputs({
    barRepeats: new Map([[0, { type: "count", value: 1, voltaMax: 0 }]]),
  });
  const state = makeState();
  pureAddBarWithRepeat(inputs, state, 0, 0, -1, 1);
  assert.equal(state.ticks.length, 1, "voltaMax=0 → 조건 비활성, 바 재생");
});

test("pureEmitBeatsInRange: isEnd — 마지막 반복에서 마지막 tick에 stopAfterThis 설정", () => {
  // 블록 3회 반복, beat 1에 isEnd 부호 → outerIter=2(last) 에서 stopAfterThis=true
  const inputs = makeInputs({
    beatsPerMeasure: 3,
    beatTypes: ["accent", "normal", "normal"] as BeatType[],
    barRepeats: new Map([[1, { type: "count", value: 1, isEnd: true }]]),
  });
  const state = makeState();
  pureEmitBeatsInRange(inputs, state, new Map(), 0, 2, -1, 2, 3, undefined);
  const stopTick = state.ticks.find(t => t.stopAfterThis);
  assert.ok(stopTick !== undefined, "마지막 반복에서 stopAfterThis tick 존재");
});

test("pureEmitBeatsInRange: isEnd — 마지막 반복이 아닐 때는 stopAfterThis 없음", () => {
  const inputs = makeInputs({
    beatsPerMeasure: 3,
    beatTypes: ["accent", "normal", "normal"] as BeatType[],
    barRepeats: new Map([[1, { type: "count", value: 1, isEnd: true }]]),
  });
  // outerIter=0, outerRepTotal=3 → 마지막 아님
  const state = makeState();
  pureEmitBeatsInRange(inputs, state, new Map(), 0, 2, -1, 0, 3, undefined);
  const stopTick = state.ticks.find(t => t.stopAfterThis);
  assert.equal(stopTick, undefined, "마지막 반복 아닐 때 stopAfterThis 없음");
});

test("pureEmitBeatsInRange: isEnd + voltaMax — voltaMax-1번째 반복에서 stopAfterThis 설정", () => {
  // voltaMax=2 → outerIter >= voltaMax-1 = 1 이면 마지막 허용 반복
  const inputs = makeInputs({
    beatsPerMeasure: 3,
    beatTypes: ["accent", "normal", "normal"] as BeatType[],
    barRepeats: new Map([[1, { type: "count", value: 1, isEnd: true, voltaMax: 2 }]]),
  });
  const state = makeState();
  pureEmitBeatsInRange(inputs, state, new Map(), 0, 2, -1, 1, 5, undefined);
  const stopTick = state.ticks.find(t => t.stopAfterThis);
  assert.ok(stopTick !== undefined, "outerIter=voltaMax-1 → stopAfterThis 설정");
});

test("pureEmitBeatsInRange: jumpFromId/jumpToId — 1회 점프 후 나머지 진행", () => {
  // beat 0: jumpToId=1(목적지), beat 2: jumpFromId=1(출발지)
  // 예상 순서: 0,1,2 → 점프→0,1,2 (총 6 tick, jumpFromId는 1회만 동작)
  const inputs = makeInputs({
    beatsPerMeasure: 3,
    beatTypes: ["accent", "normal", "normal"] as BeatType[],
    barRepeats: new Map([
      [0, { type: "count", value: 1, jumpToId: 1 }],
      [2, { type: "count", value: 1, jumpFromId: 1 }],
    ]),
  });
  const state = makeState();
  pureEmitBeatsInRange(inputs, state, new Map(), 0, 2, -1, 0, 1, undefined);
  const beatNums = state.ticks.filter(t => t.layerIndex === 0).map(t => t.beat);
  assert.deepEqual(beatNums, [0, 1, 2, 0, 1, 2], "점프 후 beat 0부터 재개, 총 6 tick");
});

test("pureEmitBeatsInRange: jumpFromId — 매칭 jumpToId 없으면 점프 없이 진행", () => {
  // beat 2에 jumpFromId=99 있지만 jumpToId=99인 바가 없음
  const inputs = makeInputs({
    beatsPerMeasure: 3,
    beatTypes: ["accent", "normal", "normal"] as BeatType[],
    barRepeats: new Map([[2, { type: "count", value: 1, jumpFromId: 99 }]]),
  });
  const state = makeState();
  pureEmitBeatsInRange(inputs, state, new Map(), 0, 2, -1, 0, 1, undefined);
  const beatNums = state.ticks.filter(t => t.layerIndex === 0).map(t => t.beat);
  assert.deepEqual(beatNums, [0, 1, 2], "매칭 없으면 정상 진행");
});

// ── toEngineBpm + 바 BPM 오버라이드 denominator 정규화 회귀 테스트 ──────────
// 버그: 6/8 박자에서 메인 BPM 120은 engine.setBpm(60) [1000ms/beat]로 정규화되지만
// 바 오버라이드 BPM 120은 미정규화 시 60000/120 = 500ms/beat로 재생 → 2배 차이.
// 수정 후: toEngineBpm을 통해 동일 엔진 단위로 통일되어야 한다.

test("toEngineBpm: denominator=4 시 항등 변환", () => {
  assert.equal(toEngineBpm(120, 4), 120, "4/4 박자에서는 displayBpm과 동일");
});

test("toEngineBpm: denominator=8 시 절반값 반환 (quarter-note 단위)", () => {
  assert.equal(toEngineBpm(120, 8), 60, "6/8 박자에서 120 → 60");
});

test("toEngineBpm: denominator=2 시 두 배값 반환", () => {
  assert.equal(toEngineBpm(120, 2), 240, "2/2 박자에서 120 → 240");
});

test("[denominator 회귀] 6/8 박자에서 main BPM과 바 오버라이드 BPM이 동일 beat duration 생성", () => {
  const denominator = 8;
  const displayBpm = 120;

  // 메인 BPM 경로: updateBpm → engine.setBpm(displayBpm * (4/denominator))
  const mainEngineBpm = toEngineBpm(displayBpm, denominator); // 60

  // 바 오버라이드 경로: toEngineBpm 적용 후 setBarBpmOverride에 전달
  const overrideEngineBpm = toEngineBpm(displayBpm, denominator); // 60

  // pureGetBeatDur가 두 경로에서 동일한 duration을 반환해야 한다
  const mainInputs = makeInputs({ bpm: mainEngineBpm });
  const overrideInputs = makeInputs({
    bpm: 999, // 덮어쓰이게 의도적으로 다른 값
    barBpmOverrides: new Map([[0, overrideEngineBpm]]),
  });

  const mainDur = pureGetBeatDur(mainInputs, 0);
  const overrideDur = pureGetBeatDur(overrideInputs, 0);

  assert.equal(mainDur, 1000, "6/8 BPM 120의 메인 beat duration은 1000ms");
  assert.equal(overrideDur, 1000, "6/8 BPM 120의 바 오버라이드 beat duration도 1000ms");
  assert.equal(mainDur, overrideDur, "두 경로의 beat duration이 일치해야 함");
});

test("pureEmitStackedBlockTicks: blockDurMs 경계를 벗어난 tick은 잘려나감", () => {
  // stackBpm=120 → 500ms/beat, 4박 layer지만 부모 dur=600ms면 2번째 비트(@500ms)는 들어가고 3번째(@1000ms)는 잘림
  const sorted: LoopBlockData[] = [
    { startBeat: 0, endBeat: 3, type: "count", value: 1 },
    { startBeat: 0, endBeat: 3, type: "count", value: 1, layerOf: 0, bpm: 120 },
  ];
  const inputs = makeInputs({ sortedBlocks: sorted, loopBlocks: sorted, beatsPerMeasure: 4 });
  const state = makeState();
  pureEmitStackedBlockTicks(inputs, state, 0, 1000, 600, 0, 1);
  // 비트 0(@1000ms) + 비트 1(@1500ms)만 들어감, 비트 2(@2000>=1600) 차단
  assert.equal(state.ticks.length, 2);
  assert.equal(state.ticks[0].time, 1000);
  assert.equal(state.ticks[1].time, 1500);
});
