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

test("loadNoteSampleNames/saveNoteSampleNames: 라운드트립", async () => {
  await saveNoteSampleNames({ "1-0": "kick" });
  assert.deepEqual(await loadNoteSampleNames(), { "1-0": "kick" });
});

test("loadNoteSampleSources/saveNoteSampleSources: 라운드트립", async () => {
  await saveNoteSampleSources({ "0-0": "recording" });
  assert.deepEqual(await loadNoteSampleSources(), { "0-0": "recording" });
});
