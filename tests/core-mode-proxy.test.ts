/**
 * core-mode-proxy.test.ts
 *
 * coreMode 리팩터링 후 barModeRef / noteModeRef 프록시의 조건부 setter가
 * 다른 모드를 덮어쓰지 않음을 검증한다 (stale cleanup 회귀 방지).
 *
 * 프록시 로직은 React hook 없이 순수 JS로 시뮬레이션한다:
 *   • activeModeRef    — { current: CoreMode }
 *   • coreModeLog      — setCoreMode() 호출 기록
 * 이 구조는 hooks/useMetronomeScreen.ts의 _barModeRefHolder / _noteModeRefHolder와
 * 동일한 로직을 반영한다.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

type CoreMode = "beat" | "bar" | "note" | "score";

/** useMetronomeScreen 안의 proxy setter 로직을 순수 JS로 재현 */
function makeProxies() {
  const activeModeRef = { current: "beat" as CoreMode };
  const coreModeLog: CoreMode[] = [];
  const setCoreMode = (m: CoreMode) => { coreModeLog.push(m); };

  const barModeRef = {
    get current(): boolean { return activeModeRef.current === "bar"; },
    set current(v: boolean) {
      if (v) {
        activeModeRef.current = "bar";
        setCoreMode("bar");
      } else if (activeModeRef.current === "bar") {
        activeModeRef.current = "beat";
        setCoreMode("beat");
      }
    },
  };

  const noteModeRef = {
    get current(): boolean { return activeModeRef.current === "note"; },
    set current(v: boolean) {
      if (v) {
        activeModeRef.current = "note";
        setCoreMode("note");
      } else if (activeModeRef.current === "note") {
        activeModeRef.current = "beat";
        setCoreMode("beat");
      }
    },
  };

  return { activeModeRef, coreModeLog, barModeRef, noteModeRef };
}

// ─── barModeRef setter ────────────────────────────────────────────────────────

describe("barModeRef proxy setter — conditional false", () => {
  test("bar 모드 활성 중 false → beat로 클리어", () => {
    const { activeModeRef, coreModeLog, barModeRef } = makeProxies();
    activeModeRef.current = "bar";
    barModeRef.current = false;
    assert.strictEqual(activeModeRef.current, "beat");
    assert.deepStrictEqual(coreModeLog, ["beat"]);
  });

  test("note 모드 활성 중 barModeRef.current = false → no-op (note 유지)", () => {
    const { activeModeRef, coreModeLog, barModeRef } = makeProxies();
    activeModeRef.current = "note";
    barModeRef.current = false;
    assert.strictEqual(activeModeRef.current, "note", "note mode must NOT be clobbered");
    assert.deepStrictEqual(coreModeLog, [], "setCoreMode must not be called");
  });

  test("score 모드 활성 중 barModeRef.current = false → no-op (score 유지)", () => {
    const { activeModeRef, coreModeLog, barModeRef } = makeProxies();
    activeModeRef.current = "score";
    barModeRef.current = false;
    assert.strictEqual(activeModeRef.current, "score", "score mode must NOT be clobbered");
    assert.deepStrictEqual(coreModeLog, []);
  });

  test("beat 모드에서 barModeRef.current = false → no-op (beat 유지, 중복 setCoreMode 없음)", () => {
    const { activeModeRef, coreModeLog, barModeRef } = makeProxies();
    // activeModeRef는 이미 "beat"
    barModeRef.current = false;
    assert.strictEqual(activeModeRef.current, "beat");
    assert.deepStrictEqual(coreModeLog, [], "setCoreMode must not fire when already beat");
  });

  test("barModeRef.current = true → 다른 모드에서도 무조건 bar로 전환", () => {
    const { activeModeRef, coreModeLog, barModeRef } = makeProxies();
    activeModeRef.current = "note";
    barModeRef.current = true;
    assert.strictEqual(activeModeRef.current, "bar");
    assert.deepStrictEqual(coreModeLog, ["bar"]);
  });
});

// ─── noteModeRef setter ───────────────────────────────────────────────────────

describe("noteModeRef proxy setter — conditional false", () => {
  test("note 모드 활성 중 false → beat로 클리어", () => {
    const { activeModeRef, coreModeLog, noteModeRef } = makeProxies();
    activeModeRef.current = "note";
    noteModeRef.current = false;
    assert.strictEqual(activeModeRef.current, "beat");
    assert.deepStrictEqual(coreModeLog, ["beat"]);
  });

  test("bar 모드 활성 중 noteModeRef.current = false → no-op (bar 유지)", () => {
    const { activeModeRef, coreModeLog, noteModeRef } = makeProxies();
    activeModeRef.current = "bar";
    noteModeRef.current = false;
    assert.strictEqual(activeModeRef.current, "bar", "bar mode must NOT be clobbered");
    assert.deepStrictEqual(coreModeLog, [], "setCoreMode must not be called");
  });

  test("score 모드 활성 중 noteModeRef.current = false → no-op (score 유지)", () => {
    const { activeModeRef, coreModeLog, noteModeRef } = makeProxies();
    activeModeRef.current = "score";
    noteModeRef.current = false;
    assert.strictEqual(activeModeRef.current, "score");
    assert.deepStrictEqual(coreModeLog, []);
  });

  test("noteModeRef.current = true → 다른 모드에서도 무조건 note로 전환", () => {
    const { activeModeRef, coreModeLog, noteModeRef } = makeProxies();
    activeModeRef.current = "bar";
    noteModeRef.current = true;
    assert.strictEqual(activeModeRef.current, "note");
    assert.deepStrictEqual(coreModeLog, ["note"]);
  });
});

// ─── 교차 모드 시나리오 ───────────────────────────────────────────────────────

describe("교차 모드 stale cleanup 시나리오", () => {
  test("bar→note 전환 후 barModeRef.current = false → note 유지", () => {
    const { activeModeRef, barModeRef, noteModeRef } = makeProxies();
    // 1. bar 진입
    barModeRef.current = true;
    assert.strictEqual(activeModeRef.current, "bar");
    // 2. note로 전환 (bar exit + note enter)
    barModeRef.current = false; // bar 종료
    noteModeRef.current = true; // note 진입
    assert.strictEqual(activeModeRef.current, "note");
    // 3. stale cleanup: 또 barModeRef.current = false 호출 → no-op
    barModeRef.current = false;
    assert.strictEqual(activeModeRef.current, "note", "stale bar cleanup must not overwrite note");
  });

  test("seamless entry entryIsBar=false: bar 모드에서 beat로 정상 전환", () => {
    const { activeModeRef, barModeRef } = makeProxies();
    activeModeRef.current = "bar";
    // seamless next entry: entryIsBar=false → beat로 전환
    barModeRef.current = false; // pre-sync ref update
    assert.strictEqual(activeModeRef.current, "beat");
  });

  test("seamless entry entryIsBar=true: beat 모드에서 bar로 전환", () => {
    const { activeModeRef, barModeRef } = makeProxies();
    // activeModeRef는 "beat"
    barModeRef.current = true;
    assert.strictEqual(activeModeRef.current, "bar");
  });
});
