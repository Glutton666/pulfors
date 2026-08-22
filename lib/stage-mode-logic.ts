/**
 * stage-mode-logic.ts
 *
 * Pure functions extracted from useMetronomeScreen and StageModeOverlay so
 * they can be unit-tested without React or a renderer.
 *
 * Consumers:
 *   hooks/useMetronomeScreen.ts  — applySwitchToMode
 *   components/StageModeOverlay.tsx — handleStageModeBackPress
 */

import type { ModeSlot } from "@/components/ModeSwitcherDial";

// ─── switchToMode ────────────────────────────────────────────────────────────

export interface ModeSwitchState {
  /** 전체 모드 슬롯 — "beat"|"bar"|"note"|"score"|"practice"|"stage"|"menu" */
  currentMode: ModeSlot;
  stageModeActive: boolean;
  showMenu: boolean;
  showPracticeBook: boolean;
  activeModal: string | null;
}

export interface ModeSwitchCallbacks {
  handleExitNoteMode: () => void;
  handleBarModeChange: (v: boolean) => void;
  setScoreMode: (m: string | null) => void;
  exitStageMode: () => void;
  setActiveModal: (m: string | null) => void;
  handleEnterNoteMode: () => Promise<void>;
  enterStageMode: () => void;
  openExclusive: (modal: string) => void;
}

/**
 * Core mode-switching logic.
 *
 * 1. Guards against a no-op same-mode selection.
 * 2. Exits the currently active mode (noteMode / barMode / scoreMode /
 *    stageModeActive / practiceBook / menu), in priority order.
 * 3. Enters the requested new mode.
 *
 * Extracted from useMetronomeScreen so it can be tested directly without
 * instantiating the full hook.
 */
export async function applySwitchToMode(
  mode: ModeSlot,
  state: ModeSwitchState,
  cb: ModeSwitchCallbacks,
): Promise<void> {
  const {
    currentMode,
    stageModeActive,
    showMenu,
    showPracticeBook,
    activeModal,
  } = state;

  // 같은 모드를 다시 선택 → no-op
  if (mode === currentMode) return;

  // 메뉴는 오버레이 — 진입 시 기존 모드를 종료하지 않고 위에 열기만 함
  if (mode === "menu") {
    cb.setActiveModal("menu");
    return;
  }

  // 열려 있는 모달이 있으면 모드 전환 전에 먼저 닫는다 (메뉴 제외 — 아래에서 별도 처리).
  // drumKit·settings·fadeOut 등 어떤 모달이든 열린 채로 모드가 바뀌면
  // 모달이 화면 위에 계속 남아 있어 메인 UI 조작이 막힌다.
  if (activeModal && activeModal !== "menu") cb.setActiveModal(null);

  // 메뉴에서 다른 모드로 이동 → 메뉴 먼저 닫기 (위에서 이미 처리됐지만 명시적으로 유지)
  if (showMenu) cb.setActiveModal(null);

  // 기존 모드 종료 — currentMode로 판단 (boolean triplet 불필요)
  if (currentMode === "note")     cb.handleExitNoteMode();
  else if (currentMode === "bar") cb.handleBarModeChange(false);
  else if (currentMode === "score") cb.setScoreMode(null);
  else if (stageModeActive)       cb.exitStageMode();
  else if (showPracticeBook)      cb.setActiveModal(null);

  // 새 모드 진입
  switch (mode) {
    case "beat":     break;
    case "bar":      cb.handleBarModeChange(true);   break;
    case "score":    cb.setScoreMode("list");         break;
    case "note":     await cb.handleEnterNoteMode();  break;
    case "practice": cb.openExclusive("practiceBook"); break;
    case "stage":    cb.enterStageMode();             break;
  }
}

// ─── StageModeOverlay — Android BackHandler ──────────────────────────────────

export interface StageModeBackState {
  settingsOpen: boolean;
  pickerOpen: boolean;
  contextEntryId: string | null;
}

/**
 * Handles Android hardware back-press inside stage mode.
 *
 * Priority:
 *   1. Settings panel open → close it
 *   2. Picker open         → close it
 *   3. Context menu open   → clear it
 *   4. None of the above   → show exit-confirmation overlay
 *
 * Always returns true (event consumed).
 */
export function handleStageModeBackPress(
  state: StageModeBackState,
  setSettingsOpen: (v: boolean) => void,
  setPickerOpen: (v: boolean) => void,
  setContextEntryId: (v: string | null) => void,
  setConfirmExit: (v: boolean) => void,
): true {
  if (state.settingsOpen)   { setSettingsOpen(false);   return true; }
  if (state.pickerOpen)     { setPickerOpen(false);     return true; }
  if (state.contextEntryId) { setContextEntryId(null);  return true; }
  setConfirmExit(true);
  return true;
}
