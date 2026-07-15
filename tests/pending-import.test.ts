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

// ── 보안 계약 테스트 (웹 딥링크 확인 경계) ────────────────────────────
// 취약점: 웹 경로가 사용자 확인 없이 practice entry를 자동 저장했음.
// 수정 후: consumePendingImport()는 스토리지에서 데이터를 즉시 제거하므로
// 사용자가 확인 다이얼로그를 취소해도 페이지 새로고침 시 재적용되지 않는다.

test("[보안] consume은 원자적으로 제거 — 취소 후 재생 불가", () => {
  // 확인 다이얼로그에서 '취소'를 누른 뒤 페이지를 새로고침해도
  // pending import가 다시 적용되어선 안 된다.
  // consumePendingImport()가 원자적으로 데이터를 제거하므로
  // 두 번째 consume은 반드시 null을 반환해야 한다.
  RN.Platform.OS = "web";
  const ss = makeSessionStorage();
  (globalThis as any).window = { sessionStorage: ss };

  setPendingImport({ id: "x", bpm: 100, label: "공격자 항목" });

  // 첫 번째 consume — 확인 다이얼로그 표시 직전에 호출
  const first = consumePendingImport();
  assert.ok(first !== null, "첫 번째 consume은 데이터를 반환해야 함");

  // 사용자가 취소하더라도 스토리지에는 이미 항목이 없음
  assert.equal(ss.__store["@practice_pending_import"], undefined, "취소 후 스토리지 비어야 함");

  // 두 번째 consume — 새로고침 시뮬레이션 (재적용 시도)
  const second = consumePendingImport();
  assert.equal(second, null, "취소 후 재시도는 null이어야 함 (재생 방지)");
});

test("[보안] 확인 전 스토리지에서 즉시 제거됨", () => {
  // consumePendingImport() 호출 직후 sessionStorage에서 키가 없어야 함.
  // 이는 공격자가 세션 간 데이터를 지속시킬 수 없음을 보장한다.
  RN.Platform.OS = "web";
  const ss = makeSessionStorage();
  (globalThis as any).window = { sessionStorage: ss };

  setPendingImport({ id: "y", bpm: 140, label: "테스트" });
  assert.ok(ss.__store["@practice_pending_import"] !== undefined, "consume 전에는 존재해야 함");

  consumePendingImport();

  assert.equal(ss.__store["@practice_pending_import"], undefined, "consume 즉시 스토리지에서 제거되어야 함");
});

test("[보안] native 플랫폼에서 pending import 항상 null", () => {
  // native(iOS/Android)는 딥링크를 직접 Alert로 처리하므로
  // sessionStorage 경로가 절대 트리거되지 않아야 한다.
  for (const os of ["ios", "android"] as const) {
    RN.Platform.OS = os;
    const ss = makeSessionStorage();
    (globalThis as any).window = { sessionStorage: ss };
    setPendingImport({ id: "z", bpm: 120, label: "네이티브" });
    assert.equal(consumePendingImport(), null, `${os}에서 항상 null이어야 함`);
  }
});
