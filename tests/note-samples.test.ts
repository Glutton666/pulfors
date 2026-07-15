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

test("saveNoteSamples: 디바운스 윈도우 내 빠른 연속 호출은 1회 write로 합쳐진다", async () => {
  const original = AsyncStorage.setItem;
  let writeCount = 0;
  AsyncStorage.setItem = async (k: string, v: string) => {
    if (k === "@note_samples") writeCount++;
    return original(k, v);
  };
  try {
    // 동기적으로 50회 호출 → 모두 디바운스 윈도우(50ms) 안에 들어와야 함.
    const promises: Promise<void>[] = [];
    for (let i = 0; i < 50; i++) {
      promises.push(saveNoteSamples({ "0-0": `d${i}` }));
    }
    await Promise.all(promises);
    assert.equal(writeCount, 1, `debounced writes == 1, actual=${writeCount}`);
    const loaded = await loadNoteSamples();
    assert.deepEqual(loaded, { "0-0": "d49" });
  } finally {
    AsyncStorage.setItem = original;
  }
});

test("saveNoteSamples: in-flight write 실패 + 동시 호출 모두 settle (hang 없음)", async () => {
  const original = AsyncStorage.setItem;
  let callCount = 0;
  let release: ((ok: boolean) => void) | null = null;
  AsyncStorage.setItem = async (k: string, v: string) => {
    if (k !== "@note_samples") return original(k, v);
    callCount++;
    if (callCount === 1) {
      // 첫 write는 외부에서 명시적으로 실패시킴.
      await new Promise<void>((resolve, reject) => {
        release = (ok) => (ok ? resolve() : reject(new Error("disk full")));
      });
      return;
    }
    return original(k, v);
  };
  try {
    // 1) 첫 호출 → 50ms 후 첫 write가 시작되고 await에 갇힘.
    const p1 = saveNoteSamples({ "0-0": "a" });
    await new Promise((r) => setTimeout(r, 60));
    // 2) in-flight 동안 추가 호출 5건 — 다음 사이클에서 settle 되어야 함.
    const others = [1, 2, 3, 4, 5].map((i) => saveNoteSamples({ "0-0": `b${i}` }));
    // 3) 첫 write 실패. 모든 호출자(p1 + 5건)가 hang 없이 settle 되어야 한다.
    //    saveNoteSamples는 에러를 try/catch로 삼키므로 외부에서 본 Promise는
    //    항상 resolve 되지만, 핵심은 "절대 hang 하지 않음" + "마지막 값 저장".
    release!(false);
    const settled = await Promise.allSettled([p1, ...others]);
    assert.equal(settled.length, 6);
    const fulfilled = settled.filter((s) => s.status === "fulfilled").length;
    assert.equal(fulfilled, 6, "모든 호출이 hang 없이 settle 되어야 함");
    // in-flight 동안 도착한 호출들의 마지막 값이 다음 사이클에서 디스크에 안착.
    const loaded = await loadNoteSamples();
    assert.deepEqual(loaded, { "0-0": "b5" });
  } finally {
    AsyncStorage.setItem = original;
  }
});

test("saveNoteSamples: 늦게 실패하는 in-flight write 도중 도착한 호출도 모두 settle (race regression)", async () => {
  const original = AsyncStorage.setItem;
  let callCount = 0;
  AsyncStorage.setItem = async (k: string, v: string) => {
    if (k !== "@note_samples") return original(k, v);
    callCount++;
    if (callCount === 1) {
      // 첫 write는 200ms 후 실패 → 그동안 B의 디바운스 타이머가 writing=true
      // 시점에서 소진되도록 만든다.
      await new Promise((r) => setTimeout(r, 200));
      throw new Error("disk full");
    }
    return original(k, v);
  };
  try {
    const p1 = saveNoteSamples({ "0-0": "a" });
    // ~60ms 시점에 B 호출: 첫 write가 이미 in-flight, B의 50ms debounce
    // 타이머는 ~110ms에 fire → flushNow는 writing=true라 early return → B의
    // pending 값이 디바운스 큐에 묶임. 첫 write 실패 후 자동 후속 cycle이
    // 돌아야 hang 없이 settle된다.
    await new Promise((r) => setTimeout(r, 60));
    const p2 = saveNoteSamples({ "0-0": "b" });
    // 모두 hang 없이 settle 되어야 함 (saveNoteSamples는 에러 삼킴).
    const settled = await Promise.allSettled([p1, p2]);
    assert.equal(settled.length, 2);
    for (const s of settled) assert.equal(s.status, "fulfilled");
    const loaded = await loadNoteSamples();
    assert.deepEqual(loaded, { "0-0": "b" });
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
