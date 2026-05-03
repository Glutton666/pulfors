import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { setPendingImport, consumePendingImport } from "../lib/pending-import";

const RN = require("./_stubs/react-native");
const origOS = RN.Platform.OS;
const origWindow = (globalThis as any).window;

function makeSessionStorage() {
  const store: Record<string, string> = {};
  return {
    setItem: (k: string, v: string) => { store[k] = v; },
    getItem: (k: string) => (k in store ? store[k] : null),
    removeItem: (k: string) => { delete store[k]; },
    __store: store,
  };
}

afterEach(() => {
  RN.Platform.OS = origOS;
  if (origWindow === undefined) delete (globalThis as any).window;
  else (globalThis as any).window = origWindow;
});

test("native(ios)에서 set은 no-op, consume은 null", () => {
  RN.Platform.OS = "ios";
  setPendingImport({ x: 1 });
  assert.equal(consumePendingImport(), null);
});

test("web + window 미정의 시 안전", () => {
  RN.Platform.OS = "web";
  delete (globalThis as any).window;
  setPendingImport({ x: 1 });
  assert.equal(consumePendingImport(), null);
});

test("web + sessionStorage 라운드트립", () => {
  RN.Platform.OS = "web";
  const ss = makeSessionStorage();
  (globalThis as any).window = { sessionStorage: ss };
  setPendingImport({ id: "abc", bpm: 120 });
  assert.equal(ss.__store["@practice_pending_import"], JSON.stringify({ id: "abc", bpm: 120 }));
  const r = consumePendingImport();
  assert.deepEqual(r, { id: "abc", bpm: 120 });
  // consume 후 키 제거
  assert.equal(ss.__store["@practice_pending_import"], undefined);
});

test("consumePendingImport: 손상된 JSON → null + 키 제거", () => {
  RN.Platform.OS = "web";
  const ss = makeSessionStorage();
  ss.setItem("@practice_pending_import", "}}}");
  (globalThis as any).window = { sessionStorage: ss };
  assert.equal(consumePendingImport(), null);
});

test("consumePendingImport: 데이터 없으면 null", () => {
  RN.Platform.OS = "web";
  const ss = makeSessionStorage();
  (globalThis as any).window = { sessionStorage: ss };
  assert.equal(consumePendingImport(), null);
});

test("setPendingImport: sessionStorage throw 해도 안전", () => {
  RN.Platform.OS = "web";
  (globalThis as any).window = {
    sessionStorage: {
      setItem: () => { throw new Error("quota"); },
      getItem: () => null,
      removeItem: () => {},
    },
  };
  setPendingImport({ x: 1 });
  assert.ok(true);
});
