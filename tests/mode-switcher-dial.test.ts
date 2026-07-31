/**
 * mode-switcher-dial.test.ts
 *
 * 새 모드 전환 방식(상단 텍스트 탭 → 팬 다이얼) 핵심 로직 검증.
 *
 * ModeSwitcherDial.tsx의 순수 기하 함수와 레이블 가시성 규칙을
 * React/렌더러 없이 JS 로직으로 검증한다.
 *
 * 검증 항목:
 *   1. wrapScroll / snapWrap — 원형 스크롤 랩핑
 *   2. safeT — 상/하단 벽 카메라 안전 구역 (t ∈ [0.28, 0.72] 이탈)
 *   3. hideHandle 앵커 — safeT 우회, 정확히 top-center(winW/2, topInset) 고정
 *   4. snapToWall — 드래그 해제 후 가장 가까운 벽으로 스냅
 *   5. 레이블 가시성 — 무대 모드 또는 악보 에디터 진입 시 숨김
 *   6. i18n switcher 네임스페이스 — 각 모드명과 openDial 키 존재 확인
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createT } from "../lib/i18n";

// ─── 1. 기하 순수 함수 (컴포넌트에서 재현) ───────────────────────────────────

const N_MODES = 7; // MODES.length

function wrapScroll(v: number): number {
  return ((v % N_MODES) + N_MODES) % N_MODES;
}

function snapWrap(v: number): number {
  return ((Math.round(wrapScroll(v)) % N_MODES) + N_MODES) % N_MODES;
}

type Wall = "top" | "right" | "bottom" | "left";

function safeT(wall: Wall, t: number): number {
  if (wall === "top" || wall === "bottom") {
    if (t > 0.28 && t < 0.72) return t < 0.5 ? 0.25 : 0.75;
  }
  return t;
}

function anchorPos(
  wall: Wall, t: number,
  winW: number, winH: number, topInset: number,
): { x: number; y: number } {
  const st = safeT(wall, t);
  switch (wall) {
    case "top":    return { x: Math.max(0, Math.min(winW, st * winW)), y: topInset };
    case "bottom": return { x: Math.max(0, Math.min(winW, st * winW)), y: winH };
    case "left":   return { x: 0,    y: Math.max(topInset, Math.min(winH, topInset + st * (winH - topInset))) };
    case "right":  return { x: winW, y: Math.max(topInset, Math.min(winH, topInset + st * (winH - topInset))) };
  }
}

/** hideHandle=true 시 앵커 계산 (safeT 완전 우회) */
function hideHandleAnchor(winW: number, topInset: number): { x: number; y: number } {
  return { x: winW / 2, y: topInset };
}

function snapToWall(
  tx: number, ty: number,
  winW: number, winH: number, topInset: number,
): { wall: Wall; t: number } {
  const dT = ty - topInset, dB = winH - ty, dL = tx, dR = winW - tx;
  const m  = Math.min(dT, dB, dL, dR);
  const cl = (v: number) => Math.min(1, Math.max(0, v));
  if (m === dT) { const wall: Wall = "top";    return { wall, t: safeT(wall, cl(tx / winW)) }; }
  if (m === dB) { const wall: Wall = "bottom"; return { wall, t: safeT(wall, cl(tx / winW)) }; }
  if (m === dL) return { wall: "left",  t: cl((ty - topInset) / (winH - topInset)) };
  return               { wall: "right", t: cl((ty - topInset) / (winH - topInset)) };
}

/** 레이블 가시성: stageModeActive=true 또는 scoreMode="editor" 이면 숨김 */
function isLabelVisible(stageModeActive: boolean, scoreMode: string | null): boolean {
  return !stageModeActive && scoreMode !== "editor";
}

// ─── 2. 테스트 ────────────────────────────────────────────────────────────────

describe("wrapScroll", () => {
  test("양수 범위 내 값은 그대로 반환", () => {
    assert.equal(wrapScroll(0), 0);
    assert.equal(wrapScroll(3), 3);
    assert.equal(wrapScroll(6), 6);
  });

  test("N_MODES는 0으로 랩핑", () => {
    assert.equal(wrapScroll(7), 0);
    assert.equal(wrapScroll(14), 0);
  });

  test("음수 값 정상 랩핑", () => {
    assert.equal(wrapScroll(-1), 6);
    assert.equal(wrapScroll(-7), 0);
    assert.equal(wrapScroll(-8), 6);
  });

  test("소수점 스크롤 값 유지", () => {
    const v = wrapScroll(6.5);
    assert.ok(v > 6 && v < 7, `expected 6<v<7, got ${v}`);
  });
});

describe("snapWrap", () => {
  test("가장 가까운 정수 인덱스로 스냅", () => {
    assert.equal(snapWrap(2.3), 2);
    assert.equal(snapWrap(2.7), 3);
  });

  test("경계 랩핑: 6.6 → 0 (N_MODES=7)", () => {
    assert.equal(snapWrap(6.6), 0);
  });

  test("음수 스크롤 스냅", () => {
    assert.equal(snapWrap(-0.4), 0);
    assert.equal(snapWrap(-0.6), 6);
  });
});

describe("safeT — 카메라 안전 구역", () => {
  test("top/bottom 벽: 중앙 구역(0.28~0.72) 이탈 — t<0.5는 0.25, t≥0.5는 0.75", () => {
    // t < 0.5 in the unsafe zone → clamped to 0.25
    assert.equal(safeT("top",    0.4),  0.25);
    assert.equal(safeT("bottom", 0.4),  0.25);
    assert.equal(safeT("top",    0.35), 0.25);
    // t >= 0.5 in the unsafe zone → clamped to 0.75
    assert.equal(safeT("top",    0.5),  0.75);
    assert.equal(safeT("bottom", 0.5),  0.75);
    assert.equal(safeT("top",    0.6),  0.75);
    assert.equal(safeT("bottom", 0.65), 0.75);
  });

  test("top/bottom 벽: 안전 구역 바깥(≤0.28, ≥0.72)은 그대로", () => {
    assert.equal(safeT("top", 0.1), 0.1);
    assert.equal(safeT("top", 0.28), 0.28);
    assert.equal(safeT("top", 0.72), 0.72);
    assert.equal(safeT("top", 0.9), 0.9);
  });

  test("left/right 벽: safeT 영향 없음", () => {
    assert.equal(safeT("left",  0.5), 0.5);
    assert.equal(safeT("right", 0.5), 0.5);
    assert.equal(safeT("right", 0.4), 0.4);
  });
});

describe("hideHandle 앵커 — safeT 완전 우회", () => {
  const WIN_W = 390, TOP_INSET = 47;

  test("앵커가 정확히 (winW/2, topInset)에 고정", () => {
    const a = hideHandleAnchor(WIN_W, TOP_INSET);
    assert.equal(a.x, WIN_W / 2);
    assert.equal(a.y, TOP_INSET);
  });

  test("safeT를 거치면 t=0.5 top-center가 0.25로 밀림 → hideHandle이 이를 우회해야 함", () => {
    // safeT를 거치는 일반 앵커: t=0.5 top 벽은 카메라 안전 구역에 의해 0.25로 이동
    const normalAnchor = anchorPos("top", 0.5, WIN_W, 800, TOP_INSET);
    assert.notEqual(normalAnchor.x, WIN_W / 2, "일반 앵커는 중앙이 아님(safeT가 밀어냄)");

    // hideHandle 앵커: 항상 정중앙
    const hiddenAnchor = hideHandleAnchor(WIN_W, TOP_INSET);
    assert.equal(hiddenAnchor.x, WIN_W / 2, "hideHandle 앵커는 항상 정중앙");
  });

  test("다양한 화면 너비에서 정중앙 보장", () => {
    for (const w of [320, 390, 428, 768, 1024]) {
      const a = hideHandleAnchor(w, TOP_INSET);
      assert.equal(a.x, w / 2, `winW=${w}에서 정중앙 아님`);
    }
  });
});

describe("anchorPos — 일반 D-탭 모드", () => {
  const W = 390, H = 844, T = 44;

  test("top 벽: y=topInset, x는 safeT 적용 결과", () => {
    const a = anchorPos("top", 0.1, W, H, T);
    assert.equal(a.y, T);
    assert.equal(a.x, 0.1 * W);
  });

  test("right 벽: x=winW", () => {
    const a = anchorPos("right", 0.5, W, H, T);
    assert.equal(a.x, W);
  });

  test("left 벽: x=0", () => {
    const a = anchorPos("left", 0.5, W, H, T);
    assert.equal(a.x, 0);
  });

  test("bottom 벽: y=winH", () => {
    const a = anchorPos("bottom", 0.1, W, H, T);
    assert.equal(a.y, H);
  });
});

describe("snapToWall", () => {
  const W = 390, H = 844, T = 44;

  test("화면 상단 중앙 → top 벽", () => {
    const r = snapToWall(W / 2, T + 5, W, H, T);
    assert.equal(r.wall, "top");
  });

  test("화면 우측 중앙 → right 벽", () => {
    const r = snapToWall(W - 5, H / 2, W, H, T);
    assert.equal(r.wall, "right");
  });

  test("화면 좌측 중앙 → left 벽", () => {
    const r = snapToWall(5, H / 2, W, H, T);
    assert.equal(r.wall, "left");
  });

  test("화면 하단 중앙 → bottom 벽", () => {
    const r = snapToWall(W / 2, H - 5, W, H, T);
    assert.equal(r.wall, "bottom");
  });

  test("top 벽 스냅 시 t ∈ [0,1]", () => {
    const r = snapToWall(100, T + 2, W, H, T);
    assert.ok(r.t >= 0 && r.t <= 1);
  });

  test("top 벽 중앙 근처 t가 safeT에 의해 0.75로 이동 (t=0.5는 ≥0.5이므로 0.75)", () => {
    const r = snapToWall(W / 2, T + 2, W, H, T);
    // t = 0.5 → safeT: 0.5 is NOT < 0.5 → clamped to 0.75
    assert.equal(r.t, 0.75);
  });
});

describe("레이블 가시성 규칙", () => {
  test("기본 상태(비트/바/악보/노트/연습장 모드): 레이블 표시", () => {
    assert.ok(isLabelVisible(false, null));
    assert.ok(isLabelVisible(false, "list"));
    assert.ok(isLabelVisible(false, "beat"));
  });

  test("무대 모드 진입 시 레이블 숨김", () => {
    assert.ok(!isLabelVisible(true, null));
    assert.ok(!isLabelVisible(true, "list"));
  });

  test("악보 에디터 모드 진입 시 레이블 숨김", () => {
    assert.ok(!isLabelVisible(false, "editor"));
  });

  test("무대 모드 해제 + 악보 목록 = 레이블 복귀", () => {
    assert.ok(isLabelVisible(false, "list"));
  });

  test("무대 모드 중 악보 에디터도 숨김", () => {
    assert.ok(!isLabelVisible(true, "editor"));
  });
});

describe("i18n switcher 네임스페이스", () => {
  const MODES = ["beat", "bar", "score", "note", "practice", "stage", "menu"] as const;

  for (const lang of ["ko", "en"] as const) {
    test(`[${lang}] 각 모드 이름 키가 비어있지 않음`, () => {
      const t = createT(lang);
      for (const mode of MODES) {
        const v = t("switcher", mode);
        assert.ok(typeof v === "string" && v.length > 0, `${lang} switcher.${mode} 누락`);
      }
    });

    test(`[${lang}] openDial 키 존재`, () => {
      const t = createT(lang);
      const v = t("switcher", "openDial");
      assert.ok(typeof v === "string" && v.length > 0);
    });
  }
});
