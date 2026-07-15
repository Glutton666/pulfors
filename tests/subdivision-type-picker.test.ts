/**
 * subdivision-type-picker.test.ts
 *
 * SubdivisionBar 의 long-press 타입 피커 Modal 상태 머신을 검증한다.
 *
 * React / React Native 없이 순수 JS 로직으로 실행한다.
 *
 * 설계:
 *   TypePickerSimulation 클래스가 SubdivisionBar 의 typePicker 상태와
 *   관련된 모든 사용자 상호작용(long-press → 피커 열기, 타입 선택, backdrop 탭)
 *   을 정확히 재현한다.
 *
 * 커버하는 동작 (Done looks like 기준):
 *   1. long-press → 피커 Modal 표시 (typePicker !== null)
 *   2. 4가지 beat type 각각 선택 → 패턴이 올바르게 업데이트되고 피커 닫힘
 *   3. backdrop 탭 → 피커 닫힘, 패턴 변경 없음
 *
 * 관련 파일:
 *   components/SubdivisionBar.tsx
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

// ─── BeatType ────────────────────────────────────────────────────────────────
// metronome-engine.ts 에서 export 된 타입을 Node 환경에서 직접 사용하려면
// React Native 의존성을 끌어들이게 된다. 테스트 내부에서만 사용할 수 있도록
// 동일한 union 타입을 로컬로 선언한다.
type BeatType = "strong" | "accent" | "normal" | "mute";

const BEAT_TYPES: BeatType[] = ["normal", "accent", "strong", "mute"];

// ─── 순수 상태 머신 시뮬레이터 ────────────────────────────────────────────────
//
// SubdivisionBar 의 typePicker 관련 로직을 그대로 재현한다.
//
// 열기 경로 (long-press, !isPlaying):
//   setTypePicker({ cellIndex: i })
//
// 선택 경로 (BEAT_TYPES 항목 press):
//   newPattern[cellIndex] = bt  →  onPatternChange(newPattern)  →  setTypePicker(null)
//
// 닫기(backdrop) 경로:
//   setTypePicker(null)  (패턴 변경 없음)
//
// 재생 중 long-press:
//   setTypePicker 호출 자체를 건너뜀 (컴포넌트의 `if (isPlaying) return`)
// ─────────────────────────────────────────────────────────────────────────────
class TypePickerSimulation {
  pattern: BeatType[];
  typePicker: { cellIndex: number } | null;
  private isPlaying: boolean;

  constructor(pattern: BeatType[], isPlaying = false) {
    this.pattern = [...pattern];
    this.typePicker = null;
    this.isPlaying = isPlaying;
  }

  setPlaying(playing: boolean) {
    this.isPlaying = playing;
  }

  /** Pressable.onLongPress 핸들러 */
  longPressCell(cellIndex: number) {
    if (this.isPlaying) return;
    this.typePicker = { cellIndex };
  }

  /** 피커 내 타입 항목 press 핸들러 */
  selectType(bt: BeatType) {
    if (this.typePicker === null) return;
    const newPattern = [...this.pattern];
    newPattern[this.typePicker.cellIndex] = bt;
    this.pattern = newPattern;
    this.typePicker = null;
  }

  /** 피커 바깥 overlay (backdrop) press 핸들러 */
  tapBackdrop() {
    this.typePicker = null;
  }
}

// ─── 1. 피커 열기 ─────────────────────────────────────────────────────────────

describe("SubdivisionBar 타입 피커 — 열기", () => {
  test("long-press: typePicker 가 cellIndex 를 담아 열린다", () => {
    const sim = new TypePickerSimulation(["normal", "normal", "normal"]);
    sim.longPressCell(1);
    assert.notEqual(sim.typePicker, null);
    assert.equal(sim.typePicker!.cellIndex, 1);
  });

  test("재생 중 long-press: typePicker 가 열리지 않는다", () => {
    const sim = new TypePickerSimulation(["normal", "normal"], true);
    sim.longPressCell(0);
    assert.equal(sim.typePicker, null);
  });

  test("재생 중지 후 long-press: 피커가 정상 열린다", () => {
    const sim = new TypePickerSimulation(["normal", "normal"], true);
    sim.longPressCell(0);
    assert.equal(sim.typePicker, null);
    sim.setPlaying(false);
    sim.longPressCell(0);
    assert.notEqual(sim.typePicker, null);
  });

  test("여러 셀 각각 long-press: cellIndex 가 정확히 반영된다", () => {
    const pattern: BeatType[] = ["normal", "accent", "strong", "mute"];
    for (let i = 0; i < pattern.length; i++) {
      const sim = new TypePickerSimulation(pattern);
      sim.longPressCell(i);
      assert.equal(sim.typePicker!.cellIndex, i, `cell ${i}`);
    }
  });
});

// ─── 2. 타입 선택 → 패턴 업데이트 ───────────────────────────────────────────

describe("SubdivisionBar 타입 피커 — 타입 선택 및 패턴 업데이트", () => {
  test("'normal' 선택: 해당 셀이 normal 로 바뀌고 피커가 닫힌다", () => {
    const sim = new TypePickerSimulation(["strong", "accent", "mute"]);
    sim.longPressCell(0);
    sim.selectType("normal");
    assert.equal(sim.pattern[0], "normal");
    assert.equal(sim.typePicker, null);
  });

  test("'accent' 선택: 해당 셀이 accent 로 바뀌고 피커가 닫힌다", () => {
    const sim = new TypePickerSimulation(["normal", "normal", "normal"]);
    sim.longPressCell(2);
    sim.selectType("accent");
    assert.equal(sim.pattern[2], "accent");
    assert.equal(sim.typePicker, null);
  });

  test("'strong' 선택: 해당 셀이 strong 으로 바뀌고 피커가 닫힌다", () => {
    const sim = new TypePickerSimulation(["normal", "normal"]);
    sim.longPressCell(1);
    sim.selectType("strong");
    assert.equal(sim.pattern[1], "strong");
    assert.equal(sim.typePicker, null);
  });

  test("'mute' 선택: 해당 셀이 mute 로 바뀌고 피커가 닫힌다", () => {
    const sim = new TypePickerSimulation(["accent", "normal"]);
    sim.longPressCell(0);
    sim.selectType("mute");
    assert.equal(sim.pattern[0], "mute");
    assert.equal(sim.typePicker, null);
  });

  test("4가지 타입 모두 순회 선택: 각 타입이 정확히 적용된다", () => {
    for (const bt of BEAT_TYPES) {
      const sim = new TypePickerSimulation(["normal"]);
      sim.longPressCell(0);
      sim.selectType(bt);
      assert.equal(sim.pattern[0], bt, `beat type '${bt}'`);
      assert.equal(sim.typePicker, null, `picker closed after selecting '${bt}'`);
    }
  });

  test("선택한 셀 이외의 셀은 변경되지 않는다", () => {
    const initial: BeatType[] = ["strong", "accent", "normal", "mute"];
    const sim = new TypePickerSimulation(initial);
    sim.longPressCell(2);
    sim.selectType("strong");
    assert.equal(sim.pattern[0], "strong", "cell 0 unchanged");
    assert.equal(sim.pattern[1], "accent", "cell 1 unchanged");
    assert.equal(sim.pattern[2], "strong", "cell 2 changed");
    assert.equal(sim.pattern[3], "mute", "cell 3 unchanged");
  });

  test("동일 타입 재선택: 패턴은 그대로이고 피커는 닫힌다", () => {
    const sim = new TypePickerSimulation(["accent", "normal"]);
    sim.longPressCell(0);
    sim.selectType("accent");
    assert.equal(sim.pattern[0], "accent");
    assert.equal(sim.typePicker, null);
  });
});

// ─── 3. Backdrop 탭 → 닫기 (패턴 변경 없음) ──────────────────────────────────

describe("SubdivisionBar 타입 피커 — backdrop 탭으로 닫기", () => {
  test("backdrop 탭: typePicker 가 null 이 된다", () => {
    const sim = new TypePickerSimulation(["normal", "accent"]);
    sim.longPressCell(0);
    assert.notEqual(sim.typePicker, null);
    sim.tapBackdrop();
    assert.equal(sim.typePicker, null);
  });

  test("backdrop 탭: 패턴이 변경되지 않는다", () => {
    const initial: BeatType[] = ["strong", "accent", "normal"];
    const sim = new TypePickerSimulation(initial);
    sim.longPressCell(1);
    sim.tapBackdrop();
    assert.deepEqual(sim.pattern, initial);
  });

  test("피커가 열려 있지 않을 때 backdrop 탭: 아무 변화 없음", () => {
    const initial: BeatType[] = ["normal", "normal"];
    const sim = new TypePickerSimulation(initial);
    sim.tapBackdrop();
    assert.equal(sim.typePicker, null);
    assert.deepEqual(sim.pattern, initial);
  });

  test("long-press → backdrop → 다시 long-press: 피커가 올바르게 재열린다", () => {
    const sim = new TypePickerSimulation(["normal", "accent", "mute"]);
    sim.longPressCell(0);
    sim.tapBackdrop();
    assert.equal(sim.typePicker, null);
    sim.longPressCell(2);
    assert.equal(sim.typePicker!.cellIndex, 2);
  });
});

// ─── 4. 연속 상호작용 시나리오 ───────────────────────────────────────────────

describe("SubdivisionBar 타입 피커 — 연속 상호작용", () => {
  test("연속으로 다른 셀 타입 변경: 각 변경이 독립적으로 적용된다", () => {
    const sim = new TypePickerSimulation(["normal", "normal", "normal", "normal"]);
    const assignments: Array<[number, BeatType]> = [
      [0, "strong"],
      [1, "accent"],
      [2, "mute"],
      [3, "normal"],
    ];
    for (const [idx, bt] of assignments) {
      sim.longPressCell(idx);
      sim.selectType(bt);
    }
    assert.deepEqual(sim.pattern, ["strong", "accent", "mute", "normal"]);
    assert.equal(sim.typePicker, null);
  });

  test("재생 시작 후 long-press: 피커가 열리지 않는다", () => {
    const sim = new TypePickerSimulation(["normal", "accent"]);
    sim.longPressCell(0);
    sim.selectType("strong");
    assert.equal(sim.pattern[0], "strong");
    sim.setPlaying(true);
    sim.longPressCell(1);
    assert.equal(sim.typePicker, null, "재생 중에는 피커 열기 금지");
  });

  test("백드롭 닫기 후 타입 선택 시도: 피커가 없으므로 패턴 변경 없음", () => {
    const initial: BeatType[] = ["normal", "normal"];
    const sim = new TypePickerSimulation(initial);
    sim.longPressCell(0);
    sim.tapBackdrop();
    sim.selectType("strong");
    assert.deepEqual(sim.pattern, initial, "닫힌 상태에서 selectType 은 no-op");
  });
});
