import { test } from "node:test";
import assert from "node:assert/strict";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DEFAULT_BINDINGS,
  applyRebinding,
  saveKeyBindings,
  loadKeyBindings,
  isConflicting,
  type KeyBinding,
  type KeyBindingsMap,
} from "../lib/keyboard-bindings";

const KB = "metronome_keyboard_bindings_v1";

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

test("applyRebinding: 여러 액션 순회 — 두 번째 충돌도 감지", () => {
  const bpmUpBinding: KeyBinding = { ...DEFAULT_BINDINGS.bpmUp };
  const { conflict } = applyRebinding({ ...DEFAULT_BINDINGS }, "playPause", bpmUpBinding);
  assert.equal(conflict, "bpmUp");
});

// ── applyRebinding + isConflicting 통합 ──────────────────────────────────────

test("applyRebinding + isConflicting: ctrl 변형 충돌 감지", () => {
  const current: KeyBindingsMap = {
    ...DEFAULT_BINDINGS,
    toggleMenu: { code: "KeyZ", ctrl: true, label: "Ctrl+Z" },
  };
  const ctrlZ: KeyBinding = { code: "KeyZ", ctrl: true, label: "Ctrl+Z" };
  const { conflict } = applyRebinding(current, "playPause", ctrlZ);
  assert.equal(conflict, "toggleMenu");
});

// ── 기본값 초기화 흐름 ────────────────────────────────────────────────────────

test("기본값 초기화: DEFAULT_BINDINGS → saveKeyBindings → loadKeyBindings 왕복", async () => {
  await saveKeyBindings({ ...DEFAULT_BINDINGS });
  const loaded = await loadKeyBindings();
  for (const key of Object.keys(DEFAULT_BINDINGS) as (keyof typeof DEFAULT_BINDINGS)[]) {
    assert.deepEqual(loaded[key], DEFAULT_BINDINGS[key], `키 불일치: ${key}`);
  }
  await (AsyncStorage as unknown as { __reset: () => void }).__reset();
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

test("saveKeyBindings + loadKeyBindings: 부분 저장 → 나머지는 DEFAULT_BINDINGS", async () => {
  const partial: KeyBindingsMap = {
    ...DEFAULT_BINDINGS,
    escape: { code: "KeyBackspace", label: "Backspace" },
  };
  await saveKeyBindings(partial);
  const loaded = await loadKeyBindings();
  assert.deepEqual(loaded.escape, { code: "KeyBackspace", label: "Backspace" });
  assert.deepEqual(loaded.loopToggle, DEFAULT_BINDINGS.loopToggle);
  await (AsyncStorage as unknown as { __reset: () => void }).__reset();
});

test("saveKeyBindings + loadKeyBindings: 저장 후 다시 DEFAULT_BINDINGS로 초기화", async () => {
  await saveKeyBindings({ ...DEFAULT_BINDINGS, playPause: { code: "KeyQ", label: "Q" } });
  await saveKeyBindings({ ...DEFAULT_BINDINGS });
  const loaded = await loadKeyBindings();
  assert.deepEqual(loaded.playPause, DEFAULT_BINDINGS.playPause);
  await (AsyncStorage as unknown as { __reset: () => void }).__reset();
});

// ── nativeKeyToCode 추가 (Task #132 머지 후) ──────────────────────────────────

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
