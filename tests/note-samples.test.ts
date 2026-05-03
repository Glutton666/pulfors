import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  sampleKey,
  hasNoteSample,
  getNoteSampleUri,
  setNoteSample,
  removeNoteSample,
  setNoteSampleName,
  removeNoteSampleName,
  setNoteSampleSource,
  removeNoteSampleSource,
  loadNoteSamples,
  saveNoteSamples,
  loadNoteSampleNames,
  saveNoteSampleNames,
  loadNoteSampleSources,
  saveNoteSampleSources,
} from "../lib/note-samples";

const AsyncStorage = require("./_stubs/async-storage");

beforeEach(() => {
  AsyncStorage.__reset();
});

test("sampleKey: beat-sub 형식", () => {
  assert.equal(sampleKey(0, 0), "0-0");
  assert.equal(sampleKey(3, 2), "3-2");
});

test("hasNoteSample: 키 존재 여부", () => {
  assert.equal(hasNoteSample(0, 0, { "0-0": "uri" }), true);
  assert.equal(hasNoteSample(1, 0, { "0-0": "uri" }), false);
  assert.equal(hasNoteSample(0, 0, {}), false);
});

test("getNoteSampleUri: URI 반환 또는 null", () => {
  assert.equal(getNoteSampleUri(0, 0, { "0-0": "file:///a.wav" }), "file:///a.wav");
  assert.equal(getNoteSampleUri(1, 0, {}), null);
  assert.equal(getNoteSampleUri(0, 0, { "0-0": "" }), null);
});

test("setNoteSample: 추가 후 새 객체 반환 + AsyncStorage 저장", async () => {
  const before = { "1-0": "x" };
  const after = await setNoteSample(0, 0, "file:///new.wav", before);
  assert.deepEqual(after, { "1-0": "x", "0-0": "file:///new.wav" });
  assert.notEqual(after, before);
  const stored = JSON.parse((await AsyncStorage.getItem("@note_samples"))!);
  assert.deepEqual(stored, after);
});

test("removeNoteSample: 존재 시 삭제, 미존재 시 동일 객체", async () => {
  const before = { "0-0": "a", "1-0": "b" };
  const after = await removeNoteSample(0, 0, before);
  assert.deepEqual(after, { "1-0": "b" });
  assert.notEqual(after, before);
  const same = await removeNoteSample(2, 0, after);
  assert.equal(same, after);
});

test("setNoteSampleName: 빈/공백 문자열은 키 삭제", async () => {
  const before = { "0-0": "drum" };
  const trimmed = await setNoteSampleName(0, 0, "  drum2  ", before);
  assert.equal(trimmed["0-0"], "drum2");
  const cleared = await setNoteSampleName(0, 0, "   ", trimmed);
  assert.equal(cleared["0-0"], undefined);
});

test("removeNoteSampleName: 존재 시 삭제", async () => {
  const before = { "0-0": "n" };
  const after = await removeNoteSampleName(0, 0, before);
  assert.deepEqual(after, {});
  const same = await removeNoteSampleName(0, 0, after);
  assert.equal(same, after);
});

test("setNoteSampleSource: source 기록 + 저장", async () => {
  const after = await setNoteSampleSource(2, 1, "recording", {});
  assert.equal(after["2-1"], "recording");
  const stored = JSON.parse((await AsyncStorage.getItem("@note_sample_sources"))!);
  assert.deepEqual(stored, after);
});

test("removeNoteSampleSource: 존재 시 삭제", async () => {
  const before = { "0-0": "import" as const };
  const after = await removeNoteSampleSource(0, 0, before);
  assert.deepEqual(after, {});
});

test("loadNoteSamples: 빈 storage → {}", async () => {
  const r = await loadNoteSamples();
  assert.deepEqual(r, {});
});

test("loadNoteSamples/saveNoteSamples: 라운드트립", async () => {
  await saveNoteSamples({ "0-0": "u" });
  assert.deepEqual(await loadNoteSamples(), { "0-0": "u" });
});

test("loadNoteSamples: 손상된 JSON → {}", async () => {
  await AsyncStorage.setItem("@note_samples", "}}}");
  assert.deepEqual(await loadNoteSamples(), {});
});

test("saveNoteSamples: 50회 빠른 연속 호출 후 마지막 값이 결정적으로 저장", async () => {
  const promises: Promise<void>[] = [];
  for (let i = 0; i < 50; i++) {
    promises.push(saveNoteSamples({ "0-0": `v${i}` }));
  }
  await Promise.all(promises);
  const loaded = await loadNoteSamples();
  assert.deepEqual(loaded, { "0-0": "v49" });
});

test("saveNoteSampleNames: 50회 빠른 연속 호출 직렬화", async () => {
  const promises: Promise<void>[] = [];
  for (let i = 0; i < 50; i++) {
    promises.push(saveNoteSampleNames({ "1-0": `n${i}` }));
  }
  await Promise.all(promises);
  const loaded = await loadNoteSampleNames();
  assert.deepEqual(loaded, { "1-0": "n49" });
});

test("saveNoteSampleSources: 50회 빠른 연속 호출 직렬화", async () => {
  const promises: Promise<void>[] = [];
  for (let i = 0; i < 50; i++) {
    const v: "recording" | "import" = i % 2 === 0 ? "recording" : "import";
    promises.push(saveNoteSampleSources({ "0-0": v }));
  }
  await Promise.all(promises);
  const loaded = await loadNoteSampleSources();
  assert.deepEqual(loaded, { "0-0": "import" });
});

test("saveNoteSampleChannels: 50회 빠른 연속 호출 직렬화", async () => {
  const { saveNoteSampleChannels, loadNoteSampleChannels } = require("../lib/note-samples");
  const promises: Promise<void>[] = [];
  for (let i = 0; i < 50; i++) {
    const v = i % 2 === 0 ? "left" : "right";
    promises.push(saveNoteSampleChannels({ "0-0": v }));
  }
  await Promise.all(promises);
  const loaded = await loadNoteSampleChannels();
  assert.deepEqual(loaded, { "0-0": "right" });
});

test("saveNoteSamples: 진행 중 write가 후속 호출을 1회 쓰기로 합친다", async () => {
  const original = AsyncStorage.setItem;
  let writeCount = 0;
  AsyncStorage.setItem = async (k: string, v: string) => {
    if (k === "@note_samples") writeCount++;
    return original(k, v);
  };
  try {
    // 첫 호출이 in-flight 중일 때 49건이 들어와 1회로 합쳐져야 한다 → 총 2회
    const promises: Promise<void>[] = [];
    for (let i = 0; i < 50; i++) {
      promises.push(saveNoteSamples({ "0-0": `c${i}` }));
    }
    await Promise.all(promises);
    assert.ok(writeCount <= 2, `coalesced writes ≤ 2, actual=${writeCount}`);
    const loaded = await loadNoteSamples();
    assert.deepEqual(loaded, { "0-0": "c49" });
  } finally {
    AsyncStorage.setItem = original;
  }
});

test("saveNoteSamples: 서로 다른 호출자 모두 resolve된다", async () => {
  let resolved = 0;
  const promises = Array.from({ length: 30 }, (_, i) =>
    saveNoteSamples({ "0-0": `x${i}` }).then(() => { resolved++; }),
  );
  await Promise.all(promises);
  assert.equal(resolved, 30);
});

test("loadNoteSampleNames/saveNoteSampleNames: 라운드트립", async () => {
  await saveNoteSampleNames({ "1-0": "kick" });
  assert.deepEqual(await loadNoteSampleNames(), { "1-0": "kick" });
});

test("loadNoteSampleSources/saveNoteSampleSources: 라운드트립", async () => {
  await saveNoteSampleSources({ "0-0": "recording" });
  assert.deepEqual(await loadNoteSampleSources(), { "0-0": "recording" });
});
