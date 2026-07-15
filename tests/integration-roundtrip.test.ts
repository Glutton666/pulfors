// Integration roundtrip guards (Task #32).
// app/index.tsx 도메인 훅 분리는 회귀 위험이 커 별도 단계로 미루되, 그 전에
// 핵심 라운드트립 회귀 가드를 친다:
//   1) 모드 전환: dial -> bar -> dial 시 모든 맵이 보존되는지
//   2) 연습 항목: PracticeEntry -> entryToBarConfig -> selectCurrentBarConfig
//      라운드트립이 동일한 라이브 출력을 만들어내는지
//   3) 백업: 데이터 sanitize + remap + JSON 직렬화 라운드트립이 손실 없는지
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  createInitialDialConfig,
  createInitialBarConfig,
  entryToBarConfig,
  applyEntryToState,
  selectCurrentBarConfig,
  type DialConfig,
  type BarConfig,
} from "../app/index.helpers";
import type { PracticeEntry } from "../lib/storage";
import {
  sanitizeBackupData,
  collectAllAudioUris,
  remapDataUris,
  remapSampleMap,
} from "../lib/backup/shared";

function makeDialState(): DialConfig {
  return {
    beatsPerMeasure: 5,
    beatTypes: ["accent", "normal", "normal", "accent", "normal"],
    beatSubdivisions: { "0": ["accent"], "3": ["accent", "normal"] },
    noteSamples: { "0": "file:///dial0.wav", "3": "file:///dial3.wav" },
    noteSampleNames: { "0": "Dial0", "3": "Dial3" },
    noteSampleSources: { "0": "recording", "3": "import" },
    noteSampleChannels: { "0": "left", "3": "right" },
  };
}

function makeBarState(): BarConfig {
  return {
    beatsPerMeasure: 7,
    beatTypes: ["accent", "normal", "normal", "accent", "normal", "normal", "normal"],
    beatSubdivisions: { "0": ["accent", "normal"] },
    barRepeats: { 0: { type: "count", value: 3 }, 1: { type: "duration", value: 5 } },
    loopBlocks: [{ startBeat: 0, endBeat: 3, type: "count", value: 2 }],
    barClockMode: "timer",
    barTimerDuration: 240,
    noteSamples: { "1": "file:///bar1.wav" },
    noteSampleNames: { "1": "Bar1" },
    noteSampleSources: { "1": "recording" },
    noteSampleChannels: { "1": "both" },
    barLoopMode: "loop",
    blockPlayMode: "random",
    hasBeenConfigured: true,
  };
}

test("[mode-switch] dial -> bar -> dial 라운드트립에서 모든 맵이 보존된다", () => {
  const dial0 = makeDialState();
  const bar0 = makeBarState();
  // beat 모드(barMode=false) → selectCurrentBarConfig는 dial 상태를 반환
  const beatView = selectCurrentBarConfig({
    barMode: false,
    bpm: 120,
    beatsPerMeasure: 4,
    beatTypes: ["accent", "normal", "normal", "normal"],
    beatSubdivisions: {},
    barRepeats: {},
    loopBlocks: [],
    barLoopMode: "once",
    blockPlayMode: "loop",
    subdivisionPattern: ["accent"],
    noteSamples: {},
    noteSampleNames: {},
    noteSampleSources: {},
    noteSampleChannels: {},
    dialConfig: dial0,
    barClockMode: "stopwatch",
    barTimerDuration: 180,
  });
  assert.equal(beatView.mode, "beat");
  assert.deepEqual(beatView.noteSamples, dial0.noteSamples);
  assert.deepEqual(beatView.noteSampleNames, dial0.noteSampleNames);
  assert.deepEqual(beatView.noteSampleSources, dial0.noteSampleSources);
  assert.deepEqual(beatView.noteSampleChannels, dial0.noteSampleChannels);
  assert.equal(beatView.beatsPerMeasure, dial0.beatsPerMeasure);

  // bar 모드 → live bar 상태를 반환
  const barView = selectCurrentBarConfig({
    barMode: true,
    bpm: 100,
    beatsPerMeasure: bar0.beatsPerMeasure,
    beatTypes: bar0.beatTypes,
    beatSubdivisions: bar0.beatSubdivisions,
    barRepeats: bar0.barRepeats,
    loopBlocks: bar0.loopBlocks,
    barLoopMode: bar0.barLoopMode,
    blockPlayMode: bar0.blockPlayMode,
    subdivisionPattern: ["accent"],
    noteSamples: bar0.noteSamples,
    noteSampleNames: bar0.noteSampleNames,
    noteSampleSources: bar0.noteSampleSources,
    noteSampleChannels: bar0.noteSampleChannels,
    dialConfig: dial0,
    barClockMode: bar0.barClockMode,
    barTimerDuration: bar0.barTimerDuration,
  });
  assert.equal(barView.mode, "bar");
  assert.deepEqual(barView.noteSamples, bar0.noteSamples);
  assert.deepEqual(barView.noteSampleChannels, bar0.noteSampleChannels);
  assert.deepEqual(barView.barRepeats, bar0.barRepeats);
  assert.deepEqual(barView.loopBlocks, bar0.loopBlocks);

  // 다시 beat 모드로 → 원본 dial 상태가 그대로 보존되어야 함
  const beatView2 = selectCurrentBarConfig({
    barMode: false,
    bpm: 100,
    beatsPerMeasure: 4,
    beatTypes: ["accent", "normal", "normal", "normal"],
    beatSubdivisions: {},
    barRepeats: {},
    loopBlocks: [],
    barLoopMode: "once",
    blockPlayMode: "loop",
    subdivisionPattern: ["accent"],
    noteSamples: {},
    noteSampleNames: {},
    noteSampleSources: {},
    noteSampleChannels: {},
    dialConfig: dial0,
    barClockMode: "stopwatch",
    barTimerDuration: 180,
  });
  assert.deepEqual(beatView2.noteSamples, dial0.noteSamples);
  assert.deepEqual(beatView2.noteSampleNames, dial0.noteSampleNames);
  assert.deepEqual(beatView2.noteSampleSources, dial0.noteSampleSources);
  assert.deepEqual(beatView2.noteSampleChannels, dial0.noteSampleChannels);
  assert.deepEqual(beatView2.beatTypes, dial0.beatTypes);
  assert.deepEqual(beatView2.beatSubdivisions, dial0.beatSubdivisions);
});

test("[mode-switch] 빈 dial/bar 초기 상태도 라운드트립에서 손실 없음", () => {
  const dial = createInitialDialConfig(3);
  const bar = createInitialBarConfig(3);
  const view = selectCurrentBarConfig({
    barMode: true,
    bpm: 90,
    beatsPerMeasure: bar.beatsPerMeasure,
    beatTypes: bar.beatTypes,
    beatSubdivisions: bar.beatSubdivisions,
    barRepeats: bar.barRepeats,
    loopBlocks: bar.loopBlocks,
    barLoopMode: bar.barLoopMode,
    blockPlayMode: bar.blockPlayMode,
    subdivisionPattern: ["accent"],
    noteSamples: bar.noteSamples,
    noteSampleNames: bar.noteSampleNames,
    noteSampleSources: bar.noteSampleSources,
    noteSampleChannels: bar.noteSampleChannels,
    dialConfig: dial,
    barClockMode: bar.barClockMode,
    barTimerDuration: bar.barTimerDuration,
  });
  assert.equal(view.mode, "bar");
  assert.deepEqual(view.noteSamples, {});
  assert.deepEqual(view.barRepeats, {});
});

test("[entry-roundtrip] PracticeEntry -> entryToBarConfig -> selectCurrentBarConfig 동치", () => {
  const entry: PracticeEntry = {
    id: "e1",
    label: "Test",
    createdAt: 1,
    mode: "bar",
    bpm: 110,
    beatsPerMeasure: 6,
    beatTypes: ["accent", "normal", "normal", "accent", "normal", "normal"],
    beatSubdivisions: { "0": ["accent", "normal"] },
    barRepeats: { 0: { type: "count", value: 4 } },
    loopBlocks: [{ startBeat: 0, endBeat: 5, type: "count", value: 2 }],
    barLoopMode: "once",
    subdivisionPattern: ["accent"],
    barClockMode: "timer",
    barTimerDuration: 300,
    noteSamples: { "2": "file:///entry2.wav" },
    noteSampleNames: { "2": "E2" },
    noteSampleSources: { "2": "recording" },
    noteSampleChannels: { "2": "left" },
  };
  const bar = entryToBarConfig(entry);
  // entryToBarConfig가 entry의 모든 의미 있는 필드를 보존
  assert.equal(bar.beatsPerMeasure, entry.beatsPerMeasure);
  assert.deepEqual(bar.beatTypes, entry.beatTypes);
  assert.deepEqual(bar.beatSubdivisions, entry.beatSubdivisions);
  assert.deepEqual(bar.barRepeats, entry.barRepeats);
  assert.deepEqual(bar.loopBlocks, entry.loopBlocks);
  assert.equal(bar.barClockMode, "timer");
  assert.equal(bar.barTimerDuration, 300);
  assert.deepEqual(bar.noteSamples, entry.noteSamples);
  assert.deepEqual(bar.noteSampleChannels, entry.noteSampleChannels);
  assert.equal(bar.hasBeenConfigured, true);
  // selectCurrentBarConfig (bar 모드)로 라이브 출력 도출 → entry와 동일
  const live = selectCurrentBarConfig({
    barMode: true,
    bpm: entry.bpm,
    beatsPerMeasure: bar.beatsPerMeasure,
    beatTypes: bar.beatTypes,
    beatSubdivisions: bar.beatSubdivisions,
    barRepeats: bar.barRepeats,
    loopBlocks: bar.loopBlocks,
    barLoopMode: bar.barLoopMode,
    blockPlayMode: bar.blockPlayMode,
    subdivisionPattern: entry.subdivisionPattern || ["accent"],
    noteSamples: bar.noteSamples,
    noteSampleNames: bar.noteSampleNames,
    noteSampleSources: bar.noteSampleSources,
    noteSampleChannels: bar.noteSampleChannels,
    dialConfig: createInitialDialConfig(),
    barClockMode: bar.barClockMode,
    barTimerDuration: bar.barTimerDuration,
  });
  assert.equal(live.bpm, entry.bpm);
  assert.equal(live.beatsPerMeasure, entry.beatsPerMeasure);
  assert.deepEqual(live.beatTypes, entry.beatTypes);
  assert.deepEqual(live.barRepeats, entry.barRepeats);
  assert.deepEqual(live.loopBlocks, entry.loopBlocks);
  assert.deepEqual(live.noteSamples, entry.noteSamples);
  assert.deepEqual(live.noteSampleChannels, entry.noteSampleChannels);
});

test("[entry-roundtrip] applyEntryToState는 entry의 모든 React-state 변경을 결정론적으로 반환", () => {
  const entry: PracticeEntry = {
    id: "e3",
    label: "Apply",
    createdAt: 2,
    bpm: 144,
    beatsPerMeasure: 5,
    beatTypes: ["accent", "normal", "normal", "accent", "normal"],
    beatSubdivisions: { "1": ["accent"] },
    barRepeats: {
      0: { type: "count", value: 2, bpm: 90 },
      2: { type: "duration", value: 8 },
    },
    loopBlocks: [{ startBeat: 0, endBeat: 4, type: "count", value: 1 }],
    barLoopMode: "loop",
    blockPlayMode: "loop",
    subdivisionPattern: ["accent", "normal"],
    barClockMode: "stopwatch",
    barTimerDuration: 180,
    noteSamples: { "0": "file:///a0.wav", "3": "file:///a3.wav" },
    noteSampleNames: { "0": "A0" },
    noteSampleSources: { "0": "import" },
    noteSampleChannels: { "0": "left", "3": "right" },
  };
  const state = applyEntryToState(entry);
  // 1차 효과: 라이브 setX 호출과 1:1 대응
  assert.equal(state.bpm, 144);
  assert.equal(state.beatsPerMeasure, 5);
  assert.deepEqual(state.beatTypes, entry.beatTypes);
  assert.deepEqual(state.beatSubdivisions, entry.beatSubdivisions);
  assert.deepEqual(state.barRepeats, entry.barRepeats);
  assert.deepEqual(state.loopBlocks, entry.loopBlocks);
  assert.equal(state.barLoopMode, "loop");
  assert.equal(state.blockPlayMode, "loop");
  assert.deepEqual(state.subdivisionPattern, ["accent", "normal"]);
  // 2차 효과: 4개 노트맵이 모두 채워짐(setNoteSamples + ref dual update의 입력)
  assert.deepEqual(state.noteSamples, entry.noteSamples);
  assert.deepEqual(state.noteSampleNames, entry.noteSampleNames);
  assert.deepEqual(state.noteSampleSources, entry.noteSampleSources);
  assert.deepEqual(state.noteSampleChannels, entry.noteSampleChannels);
  // 3차 효과: barRepeats에서 bpm 오버라이드 추출(engine.setAllBarBpmOverrides)
  assert.deepEqual(state.bpmOverrides, { 0: 90 });
  // 입력 entry는 격리(얕은 복사)
  state.beatTypes.push("accent");
  state.noteSamples["99"] = "file:///mut.wav";
  assert.equal(entry.beatTypes.length, 5);
  assert.equal(entry.noteSamples?.["99"], undefined);
});

test("[entry-roundtrip] applyEntryToState defaults: 빈 barRepeats/누락 필드 fallback", () => {
  const entry: PracticeEntry = {
    id: "e4",
    label: "Default",
    createdAt: 3,
    bpm: 80,
    beatsPerMeasure: 4,
    beatTypes: ["accent", "normal", "normal", "normal"],
    beatSubdivisions: {},
    barRepeats: {},
    barLoopMode: "once",
    subdivisionPattern: ["accent"],
  };
  const state = applyEntryToState(entry);
  assert.deepEqual(state.bpmOverrides, {});
  assert.deepEqual(state.loopBlocks, []);
  assert.equal(state.blockPlayMode, "loop");
  assert.equal(state.barLoopMode, "once");
  assert.deepEqual(state.noteSamples, {});
  assert.deepEqual(state.noteSampleChannels, {});
});

test("[entry-roundtrip] entryToBarConfig는 결과가 입력 entry와 격리됨(얕은 복사)", () => {
  const entry: PracticeEntry = {
    id: "e2",
    label: "Test",
    createdAt: 1,
    bpm: 120,
    beatsPerMeasure: 4,
    beatTypes: ["accent", "normal", "normal", "normal"],
    beatSubdivisions: { "0": ["accent"] },
    barRepeats: {},
    barLoopMode: "once",
    subdivisionPattern: ["accent"],
    noteSamples: { "0": "file:///x.wav" },
  };
  const bar = entryToBarConfig(entry);
  bar.noteSamples["1"] = "file:///mutated.wav";
  bar.beatTypes.push("accent");
  assert.deepEqual(entry.noteSamples, { "0": "file:///x.wav" }, "원본 entry 변경 금지");
  assert.equal(entry.beatTypes.length, 4, "원본 beatTypes 변경 금지");
});

test("[backup-roundtrip] sanitize + remap + JSON 라운드트립이 정상 데이터를 보존", () => {
  const sample = "file:///stub/cache/note_samples/abc.wav#trim=0.1,0.9";
  const data: Record<string, string | null> = {
    "@note_samples": JSON.stringify({ "0": sample, "1": "file:///stub/cache/note_samples/def.wav" }),
    "@note_sample_channels": JSON.stringify({ "0": "left", "1": "right" }),
    "practice_book": JSON.stringify([
      {
        id: "p1",
        label: "P1",
        createdAt: 0,
        bpm: 100,
        beatsPerMeasure: 4,
        beatTypes: ["accent", "normal", "normal", "normal"],
        beatSubdivisions: {},
        barRepeats: {},
        barLoopMode: "once",
        subdivisionPattern: ["accent"],
        noteSamples: { "0": sample },
        noteSampleChannels: { "0": "both" },
      },
    ]),
  };

  // 정상 데이터는 sanitize 후에도 같은 의미를 유지
  const sanitized = sanitizeBackupData(data);
  const samplesAfter = JSON.parse(sanitized["@note_samples"]!);
  assert.deepEqual(samplesAfter, { "0": sample, "1": "file:///stub/cache/note_samples/def.wav" });
  const channelsAfter = JSON.parse(sanitized["@note_sample_channels"]!);
  assert.deepEqual(channelsAfter, { "0": "left", "1": "right" });

  // 모든 audio URI 수집은 fragment(#trim=...)를 떼고 base만 남긴다
  const collected = collectAllAudioUris(sanitized);
  assert.equal(collected.size, 2);
  for (const [, baseUri] of collected) {
    assert.equal(baseUri.includes("#"), false, "fragment 제거 확인");
  }

  // remapDataUris로 새 위치로 옮긴 뒤 다시 collect → 새 URI만 등장
  const mapping = new Map<string, string>([
    ["abc.wav", "file:///stub/cache/note_samples/abc-restored.wav"],
    ["def.wav", "file:///stub/cache/note_samples/def-restored.wav"],
  ]);
  const remapped = remapDataUris(sanitized, mapping);
  const samplesRemapped = JSON.parse(remapped["@note_samples"]!);
  assert.equal(samplesRemapped["0"].startsWith("file:///stub/cache/note_samples/abc-restored.wav"), true);
  assert.equal(samplesRemapped["0"].includes("#trim=0.1,0.9"), true, "fragment 보존");
  assert.equal(samplesRemapped["1"], "file:///stub/cache/note_samples/def-restored.wav");

  // JSON 직렬화 라운드트립으로 객체 동치성도 확인
  const reparsed = JSON.parse(JSON.stringify(remapped));
  assert.deepEqual(reparsed, remapped);
});

test("[backup-roundtrip] 악성 http(s) URI는 sanitize 단계에서 제거된다", () => {
  const data: Record<string, string | null> = {
    "@note_samples": JSON.stringify({
      "0": "file:///stub/cache/note_samples/ok.wav",
      "1": "https://evil.example/leak.wav",
      "2": "http://evil.example/leak2.wav",
    }),
  };
  const sanitized = sanitizeBackupData(data);
  const samples = JSON.parse(sanitized["@note_samples"]!);
  assert.equal(samples["0"], "file:///stub/cache/note_samples/ok.wav");
  assert.equal(samples["1"], undefined, "https URI는 제거");
  assert.equal(samples["2"], undefined, "http URI는 제거");
});

test("[backup-roundtrip] remapSampleMap은 매핑 없는 URI는 그대로 둔다", () => {
  const samples = {
    "0": "file:///stub/cache/note_samples/known.wav",
    "1": "file:///stub/cache/note_samples/unknown.wav",
  };
  const mapping = new Map<string, string>([
    ["known.wav", "file:///stub/cache/note_samples/known-new.wav"],
  ]);
  const out = remapSampleMap(samples, mapping);
  assert.equal(out["0"], "file:///stub/cache/note_samples/known-new.wav");
  assert.equal(out["1"], "file:///stub/cache/note_samples/unknown.wav");
});
