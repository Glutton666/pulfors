/**
 * stage-mode-exit.test.ts
 *
 * 무대 모드 종료 버튼 제거 후 탈출 흐름 검증 (Task #487)
 *
 * 종료 경로:
 *   A) 상단 "무대 모드" 텍스트 탭 → onOpenDial() 호출 → 팬 다이얼 열림
 *   B) 팬 다이얼에서 다른 모드 선택 → applySwitchToMode → exitStageMode() 호출
 *   C) Android 물리 뒤로가기 → handleStageModeBackPress → confirmExit → onExit 호출
 *
 * 경로 B/C는 lib/stage-mode-logic.ts의 실제 생산 함수를 직접 임포트해 검증한다.
 * 경로 A는 MetronomeScreenUI.tsx와 StageModeOverlay.tsx의 prop 연결을 코드 분석으로 확인한다.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  applySwitchToMode,
  handleStageModeBackPress,
  type ModeSwitchState,
  type ModeSwitchCallbacks,
  type StageModeBackState,
} from "../lib/stage-mode-logic";

// ─── 경로 B: 팬 다이얼 모드 선택 → applySwitchToMode → exitStageMode ─────────

describe("applySwitchToMode — 무대 모드 활성 상태에서 모드 전환", () => {
  /** 무대 모드 활성 기본 상태 */
  function stageState(overrides: Partial<ModeSwitchState> = {}): ModeSwitchState {
    return {
      currentMode: "stage",
      stageModeActive: true,
      showMenu: false,
      showPracticeBook: false,
      activeModal: null,
      ...overrides,
    };
  }

  /** spy 콜백 묶음 */
  function spyCbs(): ModeSwitchCallbacks & { log: string[] } {
    const log: string[] = [];
    return {
      log,
      handleExitNoteMode:  () => { log.push("exitNote"); },
      handleBarModeChange: (v: boolean) => { log.push(`barMode(${v})`); },
      setScoreMode:        (m: string | null) => { log.push(`scoreMode(${m})`); },
      exitStageMode:       () => { log.push("exitStageMode"); },
      setActiveModal:      (m: string | null) => { log.push(`modal(${m})`); },
      handleEnterNoteMode: async () => { log.push("enterNote"); },
      enterStageMode:      () => { log.push("enterStage"); },
      openExclusive:       (m: string) => { log.push(`exclusive(${m})`); },
    };
  }

  test("beat 선택 → exitStageMode 1회 호출, 새 모드 진입 콜백 없음", async () => {
    const cb = spyCbs();
    await applySwitchToMode("beat", stageState(), cb);
    assert.deepStrictEqual(cb.log, ["exitStageMode"]);
  });

  test("bar 선택 → exitStageMode 먼저, 그 다음 barMode(true)", async () => {
    const cb = spyCbs();
    await applySwitchToMode("bar", stageState(), cb);
    assert.deepStrictEqual(cb.log, ["exitStageMode", "barMode(true)"]);
  });

  test("note 선택 → exitStageMode 먼저, 그 다음 enterNote", async () => {
    const cb = spyCbs();
    await applySwitchToMode("note", stageState(), cb);
    assert.deepStrictEqual(cb.log, ["exitStageMode", "enterNote"]);
  });

  test("score 선택 → exitStageMode 먼저, 그 다음 scoreMode(list)", async () => {
    const cb = spyCbs();
    await applySwitchToMode("score", stageState(), cb);
    assert.deepStrictEqual(cb.log, ["exitStageMode", "scoreMode(list)"]);
  });

  test("practice 선택 → exitStageMode 먼저, 그 다음 exclusive(practiceBook)", async () => {
    const cb = spyCbs();
    await applySwitchToMode("practice", stageState(), cb);
    assert.deepStrictEqual(cb.log, ["exitStageMode", "exclusive(practiceBook)"]);
  });

  test("같은 stage 선택 → early return, 아무 콜백도 발생하지 않음", async () => {
    const cb = spyCbs();
    await applySwitchToMode("stage", stageState(), cb);
    assert.deepStrictEqual(cb.log, []);
  });

  test("note 모드에서 beat 선택 → exitNote만 호출, exitStageMode 없음", async () => {
    const cb = spyCbs();
    // currentMode="note"이면 stageModeActive와 무관하게 exitNote가 우선
    await applySwitchToMode("beat", stageState({ currentMode: "note" }), cb);
    assert.ok(cb.log.includes("exitNote"), "exitNote must fire");
    assert.ok(!cb.log.includes("exitStageMode"), "exitStageMode must NOT also fire");
  });

  test("bar 모드에서 beat 선택 → barMode(false)만 호출, exitStageMode 없음", async () => {
    const cb = spyCbs();
    await applySwitchToMode("beat", stageState({ currentMode: "bar" }), cb);
    assert.ok(cb.log.includes("barMode(false)"), "barMode(false) must fire");
    assert.ok(!cb.log.includes("exitStageMode"), "exitStageMode must NOT fire");
  });

  test("비-무대 상태에서 beat → beat: early return, 아무 콜백도 없음", async () => {
    const cb = spyCbs();
    const state: ModeSwitchState = {
      currentMode: "beat",
      stageModeActive: false, showMenu: false,
      showPracticeBook: false, activeModal: null,
    };
    await applySwitchToMode("beat", state, cb);
    assert.deepStrictEqual(cb.log, []);
  });
});

// ─── 경로 C: Android BackHandler → handleStageModeBackPress ─────────────────

describe("handleStageModeBackPress — 안드로이드 백 버튼 우선순위", () => {
  test("모든 패널 닫혀 있을 때 → confirmExit(true) 호출, true 반환", () => {
    let confirmVal: boolean | undefined;
    const state: StageModeBackState = { pickerOpen: false, contextEntryId: null };
    const result = handleStageModeBackPress(state, () => {}, () => {}, (v) => { confirmVal = v; });
    assert.strictEqual(result, true);
    assert.strictEqual(confirmVal, true);
  });

  test("공유 설정 모달은 Stage 백 핸들러가 가로채지 않음", () => {
    let confirmCalled = false;
    const state: StageModeBackState = { pickerOpen: false, contextEntryId: null };
    handleStageModeBackPress(
      state,
      () => {},
      () => {},
      () => { confirmCalled = true; },
    );
    assert.strictEqual(confirmCalled, true, "shared modal owns its own dismissal");
  });

  test("피커 열려 있을 때 → pickerOpen(false) 호출, confirmExit 미호출", () => {
    let pickerVal: boolean | undefined;
    let confirmCalled = false;
    const state: StageModeBackState = { pickerOpen: true, contextEntryId: null };
    handleStageModeBackPress(
      state,
      (v) => { pickerVal = v; },
      () => {},
      () => { confirmCalled = true; },
    );
    assert.strictEqual(pickerVal, false, "picker must close");
    assert.strictEqual(confirmCalled, false, "confirmExit must NOT fire");
  });

  test("컨텍스트 항목 있을 때 → contextEntryId(null) 호출, confirmExit 미호출", () => {
    let contextVal: string | null | undefined;
    let confirmCalled = false;
    const state: StageModeBackState = { pickerOpen: false, contextEntryId: "entry-1" };
    handleStageModeBackPress(
      state,
      () => {},
      (v) => { contextVal = v; },
      () => { confirmCalled = true; },
    );
    assert.strictEqual(contextVal, null, "contextEntryId must clear");
    assert.strictEqual(confirmCalled, false, "confirmExit must NOT fire");
  });

  test("피커 > 컨텍스트: pickerOpen 이 contextEntryId 보다 우선", () => {
    const fired: string[] = [];
    const state: StageModeBackState = { pickerOpen: true, contextEntryId: "e" };
    handleStageModeBackPress(
      state,
      () => { fired.push("picker"); },
      () => { fired.push("context"); },
      () => { fired.push("confirm"); },
    );
    assert.deepStrictEqual(fired, ["picker"]);
  });
});

// ─── 경로 A: 상단 나가기와 타이틀 다이얼 연결 확인 (정적 분석) ───────────

describe("경로 A: 상단 '무대 모드' 텍스트가 onOpenDial에 연결됨", () => {
  const fs = require("node:fs") as typeof import("fs");

  test("StageModeOverlay 상단 타이틀 Pressable이 onOpenDial을 onPress로 사용", () => {
    const src = fs.readFileSync("components/StageModeOverlay.tsx", "utf8");
    // The top bar Pressable must wire onPress={onOpenDial}
    assert.ok(
      src.includes("onPress={onOpenDial}"),
      "StageModeOverlay top-bar title must have onPress={onOpenDial}",
    );
  });

  test("StageModeOverlay 상단에 종료 확인창을 여는 나가기 버튼이 있음", () => {
    const src = fs.readFileSync("components/StageModeOverlay.tsx", "utf8");
    assert.match(
      src,
      /testID="stage-exit-button"[\s\S]*?onPress=\{\(\) => setConfirmExit\(true\)\}/,
    );
  });

  test("chevron-down 종료 버튼이 제거되었음", () => {
    const src = fs.readFileSync("components/StageModeOverlay.tsx", "utf8");
    assert.ok(
      !src.includes("chevron-down"),
      "chevron-down exit button must have been removed from StageModeOverlay",
    );
  });

  test("무대 모드 다이얼을 열면 실험실 복귀 상태를 먼저 해제함", () => {
    const src = fs.readFileSync("components/MetronomeScreenUI.tsx", "utf8");
    assert.match(
      src,
      /<StageModeOverlay[\s\S]*?onOpenDial=\{\(\) => \{[\s\S]*?setShowLabMenu\(false\);[\s\S]*?clearMenuItemReturn\(\);[\s\S]*?modeSwitcherDialRef\.current\?\.open\(\);/,
    );
  });

  test("무대 모드 종료는 취소 가능한 실험실 복귀 lease를 사용함", () => {
    const src = fs.readFileSync("hooks/useMetronomeScreen.ts", "utf8");
    assert.match(
      src,
      /const returnLease = \{[\s\S]*?openedFromMenu: menuItemReturnRef\.current,[\s\S]*?generation: menuItemReturnGenerationRef\.current,[\s\S]*?await exitStageWithMenuReturn\(/,
    );
  });

  test("모든 무대 진입 경로에서 통합 연습장을 다시 불러옴", () => {
    const src = fs.readFileSync("hooks/useMetronomeScreen.ts", "utf8");
    assert.match(
      src,
      /useEffect\(\(\) => \{\s*if \(!stageModeActive\) return;[\s\S]*?loadPracticeBook\(\)[\s\S]*?setStagePracticeEntries\(entries\);[\s\S]*?\}, \[stageModeActive\]\);/,
    );
  });

  test("ModeSwitcherDial이 tutorialSwitchToMode를 통해 switchToMode로 연결됨", () => {
    const src = fs.readFileSync("components/MetronomeScreenUI.tsx", "utf8");
    assert.ok(
      src.includes("onSelectMode={tutorialSwitchToMode}"),
      "ModeSwitcherDial must receive the tutorial wrapper around switchToMode as its onSelectMode handler",
    );
  });

  test("useMetronomeScreen이 applySwitchToMode를 사용해 switchToMode 위임", () => {
    const src = fs.readFileSync("hooks/useMetronomeScreen.ts", "utf8");
    assert.ok(
      src.includes("applySwitchToMode(mode, state, cb)"),
      "switchToMode in useMetronomeScreen must delegate to applySwitchToMode",
    );
  });

  test("StageModeOverlay BackHandler가 handleStageModeBackPress를 위임 호출", () => {
    const src = fs.readFileSync("components/StageModeOverlay.tsx", "utf8");
    assert.ok(
      src.includes("handleStageModeBackPress("),
      "StageModeOverlay BackHandler must delegate to handleStageModeBackPress",
    );
  });

  test("StageModeOverlay에 레거시 설정 패널 경로가 없음", () => {
    const src = fs.readFileSync("components/StageModeOverlay.tsx", "utf8");
    assert.ok(!src.includes("stageOptionsRequest"), "legacy stage options request must be removed");
    assert.ok(!src.includes("settingsOpen"), "legacy settings panel state must be removed");
    assert.ok(!src.includes("keyPickerTarget"), "legacy key picker state must be removed");
  });
});

// ─── 모드 전환 회귀 — currentMode string 비교 경로 검증 ──────────────────────
// coreMode 리팩터링 후 exit-branch가 noteMode/barMode boolean 대신
// currentMode ModeSlot 문자열 비교로 동작하는 것을 보장한다.

describe("applySwitchToMode — 비-무대 모드 전환 exit 콜백", () => {
  function beatState(overrides: Partial<ModeSwitchState> = {}): ModeSwitchState {
    return {
      currentMode: "beat",
      stageModeActive: false,
      showMenu: false,
      showPracticeBook: false,
      activeModal: null,
      ...overrides,
    };
  }

  function spyCbs(): ModeSwitchCallbacks & { log: string[] } {
    const log: string[] = [];
    return {
      log,
      handleExitNoteMode:  () => { log.push("exitNote"); },
      handleBarModeChange: (v: boolean) => { log.push(`barMode(${v})`); },
      setScoreMode:        (m: string | null) => { log.push(`scoreMode(${m})`); },
      exitStageMode:       () => { log.push("exitStageMode"); },
      setActiveModal:      (m: string | null) => { log.push(`modal(${m})`); },
      handleEnterNoteMode: async () => { log.push("enterNote"); },
      enterStageMode:      () => { log.push("enterStage"); },
      openExclusive:       (m: string) => { log.push(`exclusive(${m})`); },
    };
  }

  test("beat→bar: handleBarModeChange(true) 한 번만 호출", async () => {
    const cb = spyCbs();
    await applySwitchToMode("bar", beatState(), cb);
    assert.deepStrictEqual(cb.log, ["barMode(true)"]);
  });

  test("beat→note: handleEnterNoteMode 한 번만 호출", async () => {
    const cb = spyCbs();
    await applySwitchToMode("note", beatState(), cb);
    assert.deepStrictEqual(cb.log, ["enterNote"]);
  });

  test("bar→beat: handleBarModeChange(false) 한 번만 호출", async () => {
    const cb = spyCbs();
    await applySwitchToMode("beat", beatState({ currentMode: "bar" }), cb);
    assert.deepStrictEqual(cb.log, ["barMode(false)"]);
  });

  test("note→beat: handleExitNoteMode 한 번만 호출", async () => {
    const cb = spyCbs();
    await applySwitchToMode("beat", beatState({ currentMode: "note" }), cb);
    assert.deepStrictEqual(cb.log, ["exitNote"]);
  });

  test("score→beat: setScoreMode(null) 한 번만 호출", async () => {
    const cb = spyCbs();
    await applySwitchToMode("beat", beatState({ currentMode: "score" }), cb);
    assert.deepStrictEqual(cb.log, ["scoreMode(null)"]);
  });

  test("bar→note: barMode(false) 종료 후 enterNote 진입", async () => {
    const cb = spyCbs();
    await applySwitchToMode("note", beatState({ currentMode: "bar" }), cb);
    assert.deepStrictEqual(cb.log, ["barMode(false)", "enterNote"]);
  });

  test("note→bar: exitNote 종료 후 barMode(true) 진입", async () => {
    const cb = spyCbs();
    await applySwitchToMode("bar", beatState({ currentMode: "note" }), cb);
    assert.deepStrictEqual(cb.log, ["exitNote", "barMode(true)"]);
  });

  test("beat→beat: early return, 아무 콜백도 없음", async () => {
    const cb = spyCbs();
    await applySwitchToMode("beat", beatState(), cb);
    assert.deepStrictEqual(cb.log, []);
  });
});
