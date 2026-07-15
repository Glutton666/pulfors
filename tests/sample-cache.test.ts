import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  syncStereoArtifact,
  releaseStereoArtifact,
  releaseAll,
  _getCacheSize,
  _getCacheEntry,
  _resetCacheForTests,
  _getCacheKeysInOrder,
  _defaultDeleteArtifactForTests,
} from "../lib/sample-cache";
import { Platform } from "react-native";

function makeDeps(opts: {
  saveCounter?: { n: number };
  decodeCounter?: { n: number };
  deletes?: string[];
  failDecode?: boolean;
  emptyDecode?: boolean;
} = {}) {
  let ts = 1000;
  return {
    decode: async () => {
      if (opts.decodeCounter) opts.decodeCounter.n += 1;
      if (opts.failDecode) throw new Error("boom");
      if (opts.emptyDecode) return new Float32Array(0);
      return new Float32Array([0.1, 0.2]);
    },
    save: async (_m: Float32Array, ch: "left" | "right", filename: string) => {
      if (opts.saveCounter) opts.saveCounter.n += 1;
      return `file:///cache/${filename}`;
    },
    deleteArtifact: (path: string) => {
      if (opts.deletes) opts.deletes.push(path);
    },
    now: () => ts++,
  };
}

beforeEach(() => {
  _resetCacheForTests();
});

test("channel='both'은 raw uri를 그대로 반환하고 decode/save를 호출하지 않는다", async () => {
  const decodeCounter = { n: 0 };
  const saveCounter = { n: 0 };
  const r = await syncStereoArtifact("0-0", "file:///rec.m4a#t=0,500", "both", makeDeps({ decodeCounter, saveCounter }));
  assert.equal(r.uri, "file:///rec.m4a#t=0,500");
  assert.equal(r.changed, true);
  assert.equal(decodeCounter.n, 0);
  assert.equal(saveCounter.n, 0);
  assert.equal(_getCacheSize(), 1);
});

test("동일 uri/채널 재호출은 cache hit이고 changed=false", async () => {
  const decodeCounter = { n: 0 };
  const deps1 = makeDeps({ decodeCounter });
  await syncStereoArtifact("0-0", "file:///a.wav", "left", deps1);
  const r2 = await syncStereoArtifact("0-0", "file:///a.wav", "left", makeDeps({ decodeCounter }));
  assert.equal(r2.changed, false);
  assert.equal(decodeCounter.n, 1, "두 번째 호출은 decode를 다시 부르지 않아야 함");
});

test("채널 변경 시 직전 stereo 파일이 삭제된다", async () => {
  const deletes: string[] = [];
  await syncStereoArtifact("1-0", "file:///b.wav", "left", makeDeps({ deletes }));
  const firstPath = _getCacheEntry("1-0")?.artifactPath;
  assert.ok(firstPath);
  const r2 = await syncStereoArtifact("1-0", "file:///b.wav", "right", makeDeps({ deletes }));
  assert.equal(r2.changed, true);
  assert.deepEqual(deletes, [firstPath]);
});

test("uri 변경 시에도 직전 artifact 삭제", async () => {
  const deletes: string[] = [];
  await syncStereoArtifact("2-0", "file:///old.wav", "left", makeDeps({ deletes }));
  const oldPath = _getCacheEntry("2-0")?.artifactPath!;
  await syncStereoArtifact("2-0", "file:///new.wav", "left", makeDeps({ deletes }));
  assert.deepEqual(deletes, [oldPath]);
});

test("releaseStereoArtifact는 항목과 파일을 함께 정리", async () => {
  const deletes: string[] = [];
  await syncStereoArtifact("3-0", "file:///c.wav", "left", makeDeps({ deletes }));
  const path = _getCacheEntry("3-0")?.artifactPath!;
  await releaseStereoArtifact("3-0", { deleteArtifact: (p) => { deletes.push(p); } });
  assert.equal(_getCacheEntry("3-0"), undefined);
  assert.deepEqual(deletes, [path]);
});

test("releaseAll은 모든 항목과 artifact 정리", async () => {
  const deletes: string[] = [];
  await syncStereoArtifact("a", "file:///a.wav", "left", makeDeps({ deletes }));
  await syncStereoArtifact("b", "file:///b.wav", "right", makeDeps({ deletes }));
  await syncStereoArtifact("c", "file:///c.wav", "both", makeDeps({ deletes }));
  assert.equal(_getCacheSize(), 3);
  await releaseAll({ deleteArtifact: (p) => { deletes.push(p); } });
  assert.equal(_getCacheSize(), 0);
  assert.equal(deletes.length, 2, "both 채널은 artifact가 없으므로 삭제 호출 0번");
});

test("LRU 32 초과 시 가장 오래된 항목이 정리된다", async () => {
  const deletes: string[] = [];
  for (let i = 0; i < 32; i++) {
    await syncStereoArtifact(`k${i}`, `file:///s${i}.wav`, "left", makeDeps({ deletes }));
  }
  assert.equal(_getCacheSize(), 32);
  const oldestPath = _getCacheEntry("k0")?.artifactPath!;
  await syncStereoArtifact("k32", "file:///s32.wav", "left", makeDeps({ deletes }));
  assert.equal(_getCacheSize(), 32);
  assert.equal(_getCacheEntry("k0"), undefined, "가장 오래된 k0이 evict 되어야 함");
  assert.ok(_getCacheEntry("k32"));
  assert.ok(deletes.includes(oldestPath));
});

test("같은 키 재히트는 LRU 순서를 갱신한다", async () => {
  const deletes: string[] = [];
  for (let i = 0; i < 3; i++) {
    await syncStereoArtifact(`x${i}`, `file:///x${i}.wav`, "left", makeDeps({ deletes }));
  }
  assert.deepEqual(_getCacheKeysInOrder(), ["x0", "x1", "x2"]);
  await syncStereoArtifact("x0", "file:///x0.wav", "left", makeDeps({ deletes }));
  assert.deepEqual(_getCacheKeysInOrder(), ["x1", "x2", "x0"]);
});

test("decode 실패 시 raw uri 폴백, 캐시에 저장 안 함", async () => {
  const deletes: string[] = [];
  const r = await syncStereoArtifact("e-0", "file:///bad.wav", "left", makeDeps({ deletes, failDecode: true }));
  assert.equal(r.uri, "file:///bad.wav");
  assert.equal(_getCacheEntry("e-0"), undefined);
});

test("동일 key 동시 호출은 직렬화되어 orphan artifact가 남지 않는다", async () => {
  const deletes: string[] = [];
  let saveSeq = 0;
  const slow = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const deps = {
    decode: async () => new Float32Array([0.1]),
    save: async (_m: Float32Array, ch: "left" | "right") => {
      saveSeq += 1;
      const id = saveSeq;
      await slow(20);
      return `file:///cache/parallel_${ch}_${id}.wav`;
    },
    deleteArtifact: (p: string) => { deletes.push(p); },
    now: () => 9000 + saveSeq,
  };
  const [a, b] = await Promise.all([
    syncStereoArtifact("p-0", "file:///rec.wav", "left", deps),
    syncStereoArtifact("p-0", "file:///rec.wav", "right", deps),
  ]);
  // 두 번째 호출이 첫 번째를 대체 — 첫 artifact는 반드시 삭제됨
  const final = _getCacheEntry("p-0");
  assert.equal(final?.channel, "right");
  assert.equal(final?.effectiveUri, b.uri);
  assert.equal(final?.effectiveUri.includes("right"), true);
  // 첫 호출의 artifact가 deletes에 포함돼야 함
  assert.ok(deletes.includes(a.uri), "직렬화된 두 번째 호출이 첫 artifact를 삭제해야 함");
});

test("web 환경에서 blob: URL은 URL.revokeObjectURL로 해제된다", async () => {
  const originalOS = Platform.OS;
  const originalURL = (globalThis as { URL?: unknown }).URL;
  const revoked: string[] = [];
  (Platform as { OS: string }).OS = "web";
  (globalThis as { URL?: unknown }).URL = { revokeObjectURL: (u: string) => { revoked.push(u); } };
  try {
    await _defaultDeleteArtifactForTests("blob:http://x/abc");
    await _defaultDeleteArtifactForTests("not-a-blob://y");
    assert.deepEqual(revoked, ["blob:http://x/abc"], "blob: 만 revokeObjectURL 호출");
  } finally {
    (Platform as { OS: string }).OS = originalOS;
    (globalThis as { URL?: unknown }).URL = originalURL;
  }
});

test("decode가 빈 PCM 반환하면 폴백, save 호출 없음", async () => {
  const saveCounter = { n: 0 };
  const r = await syncStereoArtifact("e-1", "file:///empty.wav", "right", makeDeps({ saveCounter, emptyDecode: true }));
  assert.equal(r.uri, "file:///empty.wav");
  assert.equal(saveCounter.n, 0);
});
