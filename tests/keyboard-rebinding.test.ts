import { test } from "node:test";
import assert from "node:assert/strict";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DEFAULT_BINDINGS,
  applyRebinding,
  executeRebind,
  executeRebindReset,
  saveKeyBindings,
  loadKeyBindings,
  type KeyBinding,
  type KeyBindingsMap,
} from "../lib/keyboard-bindings";

// ── applyRebinding ────────────────────────────────────────────────────────────

test("applyRebinding: 정상 바인딩 → updated 맵 반환, conflict null", () => {
  const newB: KeyBinding = { code: "KeyQ", label: "Q" };
  const { updated, conflict } = applyRebinding({ ...DEFAULT_BINDINGS }, "playPause", newB);
  assert.equal(conflict, null);
  assert.deepEqual(updated.playPause, newB);
  assert.deepEqual(updated.tapTempo, DEFAULT_BINDINGS.tapTempo);
});

test("applyRebinding: 충돌 감지 → 기존 맵 반환, conflict action", () => {
  const tapBinding: KeyBinding = { ...DEFAULT_BINDINGS.tapTempo };
  const { updated, conflict } = applyRebinding({ ...DEFAULT_BINDINGS }, "playPause", tapBinding);
  assert.equal(conflict, "tapTempo");
  assert.deepEqual(updated.playPause, DEFAULT_BINDINGS.playPause);
});

test("applyRebinding: 자기 자신 재바인딩 → conflict 없음 (self-rebind 허용)", () => {
  const sameB: KeyBinding = { ...DEFAULT_BINDINGS.bpmUp };
  const { updated, conflict } = applyRebinding({ ...DEFAULT_BINDINGS }, "bpmUp", sameB);
  assert.equal(conflict, null);
  assert.deepEqual(updated.bpmUp, sameB);
});

test("applyRebinding: shift 변형 구분 → shift 없는 베이스와 충돌 없음", () => {
  const shiftQ: KeyBinding = { code: "KeyQ", shift: true, label: "Shift+Q" };
  const { conflict } = applyRebinding({ ...DEFAULT_BINDINGS }, "playPause", shiftQ);
  assert.equal(conflict, null);
});

test("applyRebinding: shift 없는 KeyS → addBeatStrong과 충돌", () => {
  const plainS: KeyBinding = { code: "KeyS", label: "S" };
  const { conflict } = applyRebinding({ ...DEFAULT_BINDINGS }, "playPause", plainS);
  assert.equal(conflict, "addBeatStrong");
});

test("applyRebinding: Shift+S → addSubStrong과 충돌", () => {
  const shiftS: KeyBinding = { code: "KeyS", shift: true, label: "Shift+S" };
  const { conflict } = applyRebinding({ ...DEFAULT_BINDINGS }, "playPause", shiftS);
  assert.equal(conflict, "addSubStrong");
});

test("applyRebinding: 반환된 맵은 입력 맵의 복사본 (불변)", () => {
  const current = { ...DEFAULT_BINDINGS };
  const newB: KeyBinding = { code: "KeyQ", label: "Q" };
  const { updated } = applyRebinding(current, "playPause", newB);
  assert.notEqual(updated, current);
  assert.deepEqual(current.playPause, DEFAULT_BINDINGS.playPause);
});

test("applyRebinding: 충돌 시 반환된 맵은 current와 동일 참조 (복사 없음)", () => {
  const current = { ...DEFAULT_BINDINGS };
  const tapBinding: KeyBinding = { ...DEFAULT_BINDINGS.tapTempo };
  const { updated } = applyRebinding(current, "playPause", tapBinding);
  assert.equal(updated, current);
});

test("applyRebinding: ctrl 변형 충돌 감지", () => {
  const current: KeyBindingsMap = {
    ...DEFAULT_BINDINGS,
    toggleMenu: { code: "KeyZ", ctrl: true, label: "Ctrl+Z" },
  };
  const ctrlZ: KeyBinding = { code: "KeyZ", ctrl: true, label: "Ctrl+Z" };
  const { conflict } = applyRebinding(current, "playPause", ctrlZ);
  assert.equal(conflict, "toggleMenu");
});

// ── executeRebind: 정상 바인딩 흐름 ─────────────────────────────────────────

test("executeRebind: 정상 바인딩 → setLocalKeyBindings 즉시 호출", () => {
  let captured: KeyBindingsMap | null = null;
  const newB: KeyBinding = { code: "KeyQ", label: "Q" };
  executeRebind({ ...DEFAULT_BINDINGS }, "playPause", newB, {
    setLocalKeyBindings: (kb) => { captured = kb; },
    setRebindingAction: () => {},
    setRebindConflict: () => {},
    showKbSaved: () => {},
    conflictMessage: "conflict",
  });
  assert.ok(captured !== null, "setLocalKeyBindings 가 호출되지 않음");
  assert.deepEqual((captured as KeyBindingsMap).playPause, newB);
});

test("executeRebind: 정상 바인딩 → onKeyBindingsChange 즉시 호출", () => {
  let cbCalled = 0;
  let cbArg: KeyBindingsMap | null = null;
  const newB: KeyBinding = { code: "KeyQ", label: "Q" };
  executeRebind({ ...DEFAULT_BINDINGS }, "playPause", newB, {
    setLocalKeyBindings: () => {},
    setRebindingAction: () => {},
    setRebindConflict: () => {},
    onKeyBindingsChange: (kb) => { cbCalled++; cbArg = kb; },
    showKbSaved: () => {},
    conflictMessage: "conflict",
  });
  assert.equal(cbCalled, 1, "onKeyBindingsChange 가 1회 호출되어야 함");
  assert.deepEqual((cbArg as unknown as KeyBindingsMap)?.playPause, newB);
});

test("executeRebind: 정상 바인딩 → showKbSaved 호출 (kbSavedToast 표시)", () => {
  let toastCalled = 0;
  const newB: KeyBinding = { code: "KeyQ", label: "Q" };
  executeRebind({ ...DEFAULT_BINDINGS }, "playPause", newB, {
    setLocalKeyBindings: () => {},
    setRebindingAction: () => {},
    setRebindConflict: () => {},
    showKbSaved: () => { toastCalled++; },
    conflictMessage: "conflict",
  });
  assert.equal(toastCalled, 1, "showKbSaved 가 1회 호출되어야 함");
});

test("executeRebind: 정상 바인딩 → setRebindingAction(null) 호출", () => {
  let rebindActionArg: unknown = "UNCALLED";
  const newB: KeyBinding = { code: "KeyQ", label: "Q" };
  executeRebind({ ...DEFAULT_BINDINGS }, "playPause", newB, {
    setLocalKeyBindings: () => {},
    setRebindingAction: (a) => { rebindActionArg = a; },
    setRebindConflict: () => {},
    showKbSaved: () => {},
    conflictMessage: "conflict",
  });
  assert.equal(rebindActionArg, null);
});

test("executeRebind: 정상 바인딩 → setRebindConflict(null) 호출", () => {
  let conflictArg: unknown = "UNCALLED";
  const newB: KeyBinding = { code: "KeyQ", label: "Q" };
  executeRebind({ ...DEFAULT_BINDINGS }, "playPause", newB, {
    setLocalKeyBindings: () => {},
    setRebindingAction: () => {},
    setRebindConflict: (m) => { conflictArg = m; },
    showKbSaved: () => {},
    conflictMessage: "conflict",
  });
  assert.equal(conflictArg, null);
});

test("executeRebind: 정상 바인딩 → true 반환", () => {
  const newB: KeyBinding = { code: "KeyQ", label: "Q" };
  const result = executeRebind({ ...DEFAULT_BINDINGS }, "playPause", newB, {
    setLocalKeyBindings: () => {},
    setRebindingAction: () => {},
    setRebindConflict: () => {},
    showKbSaved: () => {},
    conflictMessage: "conflict",
  });
  assert.equal(result, true);
});

// ── executeRebind: 충돌 감지 흐름 ────────────────────────────────────────────

test("executeRebind: 충돌 → setRebindConflict(conflictMessage) 호출", () => {
  let capturedMsg: string | null = null;
  const conflicting: KeyBinding = { ...DEFAULT_BINDINGS.tapTempo };
  executeRebind({ ...DEFAULT_BINDINGS }, "playPause", conflicting, {
    setLocalKeyBindings: () => {},
    setRebindingAction: () => {},
    setRebindConflict: (m) => { capturedMsg = m; },
    showKbSaved: () => {},
    conflictMessage: "이미 사용 중인 키입니다",
  });
  assert.equal(capturedMsg, "이미 사용 중인 키입니다");
});

test("executeRebind: 충돌 → onKeyBindingsChange 미호출", () => {
  let cbCalled = 0;
  const conflicting: KeyBinding = { ...DEFAULT_BINDINGS.tapTempo };
  executeRebind({ ...DEFAULT_BINDINGS }, "playPause", conflicting, {
    setLocalKeyBindings: () => {},
    setRebindingAction: () => {},
    setRebindConflict: () => {},
    onKeyBindingsChange: () => { cbCalled++; },
    showKbSaved: () => {},
    conflictMessage: "conflict",
  });
  assert.equal(cbCalled, 0, "충돌 시 onKeyBindingsChange 호출 금지");
});

test("executeRebind: 충돌 → setLocalKeyBindings 미호출", () => {
  let called = 0;
  const conflicting: KeyBinding = { ...DEFAULT_BINDINGS.tapTempo };
  executeRebind({ ...DEFAULT_BINDINGS }, "playPause", conflicting, {
    setLocalKeyBindings: () => { called++; },
    setRebindingAction: () => {},
    setRebindConflict: () => {},
    showKbSaved: () => {},
    conflictMessage: "conflict",
  });
  assert.equal(called, 0, "충돌 시 setLocalKeyBindings 호출 금지");
});

test("executeRebind: 충돌 → showKbSaved 미호출 (토스트 표시 안 함)", () => {
  let called = 0;
  const conflicting: KeyBinding = { ...DEFAULT_BINDINGS.tapTempo };
  executeRebind({ ...DEFAULT_BINDINGS }, "playPause", conflicting, {
    setLocalKeyBindings: () => {},
    setRebindingAction: () => {},
    setRebindConflict: () => {},
    showKbSaved: () => { called++; },
    conflictMessage: "conflict",
  });
  assert.equal(called, 0, "충돌 시 showKbSaved 호출 금지");
});

test("executeRebind: 충돌 → false 반환", () => {
  const conflicting: KeyBinding = { ...DEFAULT_BINDINGS.tapTempo };
  const result = executeRebind({ ...DEFAULT_BINDINGS }, "playPause", conflicting, {
    setLocalKeyBindings: () => {},
    setRebindingAction: () => {},
    setRebindConflict: () => {},
    showKbSaved: () => {},
    conflictMessage: "conflict",
  });
  assert.equal(result, false);
});

// ── executeRebindReset: 초기화 흐름 ──────────────────────────────────────────

test("executeRebindReset: setLocalKeyBindings(DEFAULT_BINDINGS) 즉시 호출", () => {
  let captured: KeyBindingsMap | null = null;
  executeRebindReset({
    setLocalKeyBindings: (kb) => { captured = kb; },
    showKbSaved: () => {},
  });
  assert.ok(captured !== null, "setLocalKeyBindings 가 호출되지 않음");
  assert.deepEqual(captured, DEFAULT_BINDINGS);
});

test("executeRebindReset: onKeyBindingsChange(DEFAULT_BINDINGS) 즉시 호출", () => {
  let cbCalled = 0;
  let cbArg: KeyBindingsMap | null = null;
  executeRebindReset({
    setLocalKeyBindings: () => {},
    onKeyBindingsChange: (kb) => { cbCalled++; cbArg = kb; },
    showKbSaved: () => {},
  });
  assert.equal(cbCalled, 1, "onKeyBindingsChange 가 1회 호출되어야 함");
  assert.deepEqual(cbArg, DEFAULT_BINDINGS);
});

test("executeRebindReset: showKbSaved 호출 (kbSavedToast 표시)", () => {
  let toastCalled = 0;
  executeRebindReset({
    setLocalKeyBindings: () => {},
    showKbSaved: () => { toastCalled++; },
  });
  assert.equal(toastCalled, 1, "showKbSaved 가 1회 호출되어야 함");
});

test("executeRebindReset: onKeyBindingsChange 미등록 시 오류 없음", () => {
  assert.doesNotThrow(() => {
    executeRebindReset({
      setLocalKeyBindings: () => {},
      showKbSaved: () => {},
    });
  });
});

test("executeRebindReset: 전달된 맵은 DEFAULT_BINDINGS 복사본 (원본 변경 불가)", () => {
  let captured: KeyBindingsMap | null = null;
  executeRebindReset({
    setLocalKeyBindings: (kb) => { captured = kb; },
    onKeyBindingsChange: () => {},
    showKbSaved: () => {},
  });
  assert.ok(captured !== null);
  (captured as KeyBindingsMap).playPause = { code: "KeyX", label: "X" };
  assert.deepEqual(DEFAULT_BINDINGS.playPause, { code: "Space", label: "Space" });
});

// ── saveKeyBindings + loadKeyBindings 왕복 ────────────────────────────────────

test("saveKeyBindings + loadKeyBindings: 커스텀 바인딩 왕복 저장", async () => {
  const custom: KeyBindingsMap = {
    ...DEFAULT_BINDINGS,
    playPause: { code: "KeyQ", label: "Q" },
    bpmUp: { code: "KeyR", shift: true, label: "Shift+R" },
  };
  await saveKeyBindings(custom);
  const loaded = await loadKeyBindings();
  assert.deepEqual(loaded.playPause, { code: "KeyQ", label: "Q" });
  assert.deepEqual(loaded.bpmUp, { code: "KeyR", shift: true, label: "Shift+R" });
  assert.deepEqual(loaded.tapTempo, DEFAULT_BINDINGS.tapTempo);
  await (AsyncStorage as unknown as { __reset: () => void }).__reset();
});

test("saveKeyBindings + loadKeyBindings: DEFAULT_BINDINGS로 초기화 후 왕복", async () => {
  await saveKeyBindings({ ...DEFAULT_BINDINGS, playPause: { code: "KeyQ", label: "Q" } });
  await saveKeyBindings({ ...DEFAULT_BINDINGS });
  const loaded = await loadKeyBindings();
  assert.deepEqual(loaded.playPause, DEFAULT_BINDINGS.playPause);
  await (AsyncStorage as unknown as { __reset: () => void }).__reset();
});

test("saveKeyBindings + loadKeyBindings: 부분 저장 → 나머지는 DEFAULT_BINDINGS", async () => {
  const partial: KeyBindingsMap = {
    ...DEFAULT_BINDINGS,
    escape: { code: "Backspace", label: "Backspace" },
  };
  await saveKeyBindings(partial);
  const loaded = await loadKeyBindings();
  assert.deepEqual(loaded.escape, { code: "Backspace", label: "Backspace" });
  assert.deepEqual(loaded.loopToggle, DEFAULT_BINDINGS.loopToggle);
  await (AsyncStorage as unknown as { __reset: () => void }).__reset();
});

// ── nativeKeyToCode ───────────────────────────────────────────────────────────

test("nativeKeyToCode: 알파벳 소문자 → KeyX 코드", async () => {
  const { nativeKeyToCode } = await import("../lib/keyboard-bindings");
  assert.equal(nativeKeyToCode("a"), "KeyA");
  assert.equal(nativeKeyToCode("z"), "KeyZ");
});

test("nativeKeyToCode: 알파벳 대문자 → KeyX 코드", async () => {
  const { nativeKeyToCode } = await import("../lib/keyboard-bindings");
  assert.equal(nativeKeyToCode("A"), "KeyA");
  assert.equal(nativeKeyToCode("S"), "KeyS");
});

test("nativeKeyToCode: 숫자 → Digit 코드", async () => {
  const { nativeKeyToCode } = await import("../lib/keyboard-bindings");
  assert.equal(nativeKeyToCode("0"), "Digit0");
  assert.equal(nativeKeyToCode("5"), "Digit5");
});

test("nativeKeyToCode: 특수 키 매핑", async () => {
  const { nativeKeyToCode } = await import("../lib/keyboard-bindings");
  assert.equal(nativeKeyToCode(" "), "Space");
  assert.equal(nativeKeyToCode("Enter"), "Enter");
  assert.equal(nativeKeyToCode("Escape"), "Escape");
  assert.equal(nativeKeyToCode("?"), "Slash");
});

test("nativeKeyToCode: 알 수 없는 키 → 그대로 반환", async () => {
  const { nativeKeyToCode } = await import("../lib/keyboard-bindings");
  assert.equal(nativeKeyToCode("F1"), "F1");
});
