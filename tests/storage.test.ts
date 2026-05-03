import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  loadSettings,
  saveSettings,
  saveSettingsDebounced,
  flushPendingSettings,
  loadCustomSoundSets,
  saveCustomSoundSets,
  loadPracticeBook,
  savePracticeBook,
  createPracticeEntry,
  type MetronomeSettings,
} from "../lib/storage";

const AsyncStorage = require("./_stubs/async-storage");

beforeEach(() => {
  AsyncStorage.__reset();
});

test("loadSettings: 기본값 반환", async () => {
  const s = await loadSettings();
  assert.equal(s.bpm, 120);
  assert.equal(s.beatsPerMeasure, 4);
  assert.equal(s.themeColor, "gold");
});

test("saveSettings + loadSettings: 라운드트립 + 기본값 병합", async () => {
  await saveSettings({
    bpm: 90,
    beatsPerMeasure: 3,
    subdivisions: 2,
  } as MetronomeSettings);
  const s = await loadSettings();
  assert.equal(s.bpm, 90);
  assert.equal(s.beatsPerMeasure, 3);
  assert.equal(s.themeColor, "gold");
  assert.equal(s.flashMode, "accent");
});

test("loadSettings: 손상된 JSON → 기본값", async () => {
  await AsyncStorage.setItem("metronome_settings", "}}}");
  const s = await loadSettings();
  assert.equal(s.bpm, 120);
});

test("loadSettings: 잘못된 형태(배열/숫자/null) → 기본값", async () => {
  await AsyncStorage.setItem("metronome_settings", "[1,2,3]");
  assert.equal((await loadSettings()).bpm, 120);
  await AsyncStorage.setItem("metronome_settings", "42");
  assert.equal((await loadSettings()).bpm, 120);
  await AsyncStorage.setItem("metronome_settings", "null");
  assert.equal((await loadSettings()).bpm, 120);
});

test("loadCustomSoundSets: 잘못된 형태 → {}", async () => {
  await AsyncStorage.setItem("metronome_custom_sound_sets", "[1,2]");
  assert.deepEqual(await loadCustomSoundSets(), {});
  await AsyncStorage.setItem("metronome_custom_sound_sets", "\"abc\"");
  assert.deepEqual(await loadCustomSoundSets(), {});
});

test("loadPracticeBook: 손상/비배열 → []", async () => {
  await AsyncStorage.setItem("practice_book", "}}}");
  assert.deepEqual(await loadPracticeBook(), []);
  await AsyncStorage.setItem("practice_book", "{\"oops\":1}");
  assert.deepEqual(await loadPracticeBook(), []);
});

test("loadPracticeBook: 배열 안 비객체 항목은 필터링", async () => {
  await AsyncStorage.setItem("practice_book", JSON.stringify([
    { id: "ok", label: "x" },
    "junk",
    null,
    42,
  ]));
  const out = await loadPracticeBook();
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "ok");
});

test("saveSettingsDebounced: 디바운스 후 1회만 저장", async () => {
  saveSettingsDebounced({ bpm: 100 } as MetronomeSettings);
  saveSettingsDebounced({ bpm: 110 } as MetronomeSettings);
  saveSettingsDebounced({ bpm: 130 } as MetronomeSettings);
  await new Promise((r) => setTimeout(r, 500));
  const s = await loadSettings();
  assert.equal(s.bpm, 130);
});

test("flushPendingSettings: 즉시 플러시", async () => {
  saveSettingsDebounced({ bpm: 77 } as MetronomeSettings);
  await flushPendingSettings();
  const s = await loadSettings();
  assert.equal(s.bpm, 77);
});

test("flushPendingSettings: 보류 없음일 때 안전", async () => {
  await flushPendingSettings();
  assert.ok(true);
});

test("loadCustomSoundSets: 빈 storage → {}", async () => {
  assert.deepEqual(await loadCustomSoundSets(), {});
});

test("saveCustomSoundSets/loadCustomSoundSets: 라운드트립", async () => {
  const cfg = {
    custom1: {
      name: "내 사운드",
      strong: { type: "builtin" as const, sourceSet: "classic" as const, sourceRole: "strong" as const, duration: 0.1 },
      accent: { type: "builtin" as const, sourceSet: "classic" as const, sourceRole: "high" as const, duration: 0.1 },
      normal: { type: "builtin" as const, sourceSet: "classic" as const, sourceRole: "low" as const, duration: 0.1 },
    },
  };
  await saveCustomSoundSets(cfg);
  assert.deepEqual(await loadCustomSoundSets(), cfg);
});

test("loadPracticeBook: 빈 storage → []", async () => {
  assert.deepEqual(await loadPracticeBook(), []);
});

test("savePracticeBook/loadPracticeBook: 라운드트립", async () => {
  const entries = [
    {
      id: "x",
      label: "곡 1",
      createdAt: 1,
      bpm: 120,
      beatsPerMeasure: 4,
      beatTypes: ["strong", "normal", "normal", "normal"] as any,
      beatSubdivisions: {},
      barRepeats: {},
      barLoopMode: "loop" as const,
      subdivisionPattern: ["accent"] as any,
    },
  ];
  await savePracticeBook(entries);
  assert.deepEqual(await loadPracticeBook(), entries);
});

test("createPracticeEntry: id/createdAt 자동 생성", () => {
  const e = createPracticeEntry("곡", {
    bpm: 100,
    beatsPerMeasure: 4,
    beatTypes: [],
    beatSubdivisions: {},
    barRepeats: {},
    barLoopMode: "once",
    subdivisionPattern: [],
  });
  assert.ok(e.id);
  assert.ok(e.createdAt > 0);
  assert.equal(e.label, "곡");
  assert.equal(e.bpm, 100);
  assert.equal(e.createdBy, undefined);
});

test("createPracticeEntry: createdBy 옵션 보존", () => {
  const e = createPracticeEntry("t", {
    bpm: 90,
    beatsPerMeasure: 3,
    beatTypes: [],
    beatSubdivisions: {},
    barRepeats: {},
    barLoopMode: "loop",
    subdivisionPattern: [],
  }, "alice");
  assert.equal(e.createdBy, "alice");
});

test("createPracticeEntry: 매번 다른 id", () => {
  const a = createPracticeEntry("a", {
    bpm: 1, beatsPerMeasure: 1, beatTypes: [], beatSubdivisions: {},
    barRepeats: {}, barLoopMode: "once", subdivisionPattern: [],
  });
  const b = createPracticeEntry("b", {
    bpm: 1, beatsPerMeasure: 1, beatTypes: [], beatSubdivisions: {},
    barRepeats: {}, barLoopMode: "once", subdivisionPattern: [],
  });
  assert.notEqual(a.id, b.id);
});
