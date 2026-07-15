import { test } from "node:test";
import assert from "node:assert/strict";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DEFAULT_BINDINGS,
  matchesBinding,
  isConflicting,
  buildLabel,
  loadKeyBindings,
  isEditableTarget,
  type KeyBinding,
} from "../lib/keyboard-bindings";

function makeEvent(code: string, opts: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return { code, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...opts } as KeyboardEvent;
}

// matchesBinding

test("matchesBinding: 정확히 일치하면 true", () => {
  const b: KeyBinding = { code: "Space", label: "Space" };
  assert.ok(matchesBinding(makeEvent("Space"), b));
});

test("matchesBinding: code 불일치 시 false", () => {
  const b: KeyBinding = { code: "Enter", label: "Enter" };
  assert.ok(!matchesBinding(makeEvent("Space"), b));
});

test("matchesBinding: shift 필요하지만 미누름 → false", () => {
  const b: KeyBinding = { code: "KeyS", shift: true, label: "Shift+S" };
  assert.ok(!matchesBinding(makeEvent("KeyS", { shiftKey: false } as Partial<KeyboardEvent>), b));
});

test("matchesBinding: shift 필요하고 눌림 → true", () => {
  const b: KeyBinding = { code: "KeyS", shift: true, label: "Shift+S" };
  assert.ok(matchesBinding(makeEvent("KeyS", { shiftKey: true } as Partial<KeyboardEvent>), b));
});

test("matchesBinding: ctrl=true이고 ctrlKey 누름 → true", () => {
  const b: KeyBinding = { code: "KeyZ", ctrl: true, label: "Ctrl+Z" };
  assert.ok(matchesBinding(makeEvent("KeyZ", { ctrlKey: true } as Partial<KeyboardEvent>), b));
});

test("matchesBinding: ctrl=true이고 metaKey 누름 → true (Mac Cmd)", () => {
  const b: KeyBinding = { code: "KeyZ", ctrl: true, label: "Ctrl+Z" };
  assert.ok(matchesBinding(makeEvent("KeyZ", { metaKey: true } as Partial<KeyboardEvent>), b));
});

test("matchesBinding: alt 불일치 → false", () => {
  const b: KeyBinding = { code: "KeyA", alt: true, label: "Alt+A" };
  assert.ok(!matchesBinding(makeEvent("KeyA"), b));
});

// isConflicting

test("isConflicting: 동일 바인딩 → true", () => {
  const b: KeyBinding = { code: "Space", label: "Space" };
  assert.ok(isConflicting(b, b));
});

test("isConflicting: code 다름 → false", () => {
  const a: KeyBinding = { code: "Space", label: "Space" };
  const b: KeyBinding = { code: "Enter", label: "Enter" };
  assert.ok(!isConflicting(a, b));
});

test("isConflicting: shift 차이 → false", () => {
  const a: KeyBinding = { code: "KeyS", label: "S" };
  const b: KeyBinding = { code: "KeyS", shift: true, label: "Shift+S" };
  assert.ok(!isConflicting(a, b));
});

test("isConflicting: shift 동일(true) → true", () => {
  const a: KeyBinding = { code: "KeyN", shift: true, label: "Shift+N" };
  const b: KeyBinding = { code: "KeyN", shift: true, label: "Shift+N" };
  assert.ok(isConflicting(a, b));
});

// buildLabel

test("buildLabel: 단일 키 → 문자만", () => {
  assert.equal(buildLabel({ code: "KeyS" }), "S");
});

test("buildLabel: Shift+S", () => {
  assert.equal(buildLabel({ code: "KeyS", shift: true }), "Shift+S");
});

test("buildLabel: Ctrl+Z", () => {
  assert.equal(buildLabel({ code: "KeyZ", ctrl: true }), "Ctrl+Z");
});

test("buildLabel: Space/Enter/Escape 표시", () => {
  assert.equal(buildLabel({ code: "Space" }), "Space");
  assert.equal(buildLabel({ code: "Enter" }), "Enter");
  assert.equal(buildLabel({ code: "Escape" }), "Esc");
});

test("buildLabel: 화살표 키 유니코드", () => {
  assert.equal(buildLabel({ code: "ArrowUp" }), "↑");
  assert.equal(buildLabel({ code: "ArrowDown" }), "↓");
  assert.equal(buildLabel({ code: "ArrowLeft" }), "←");
  assert.equal(buildLabel({ code: "ArrowRight" }), "→");
});

test("buildLabel: Digit → 숫자 문자", () => {
  assert.equal(buildLabel({ code: "Digit0" }), "0");
  assert.equal(buildLabel({ code: "Digit5" }), "5");
});

// loadKeyBindings: AsyncStorage stub 기반

test("loadKeyBindings: AsyncStorage null → DEFAULT_BINDINGS 반환", async () => {
  const result = await loadKeyBindings();
  for (const key of Object.keys(DEFAULT_BINDINGS) as (keyof typeof DEFAULT_BINDINGS)[]) {
    assert.deepEqual(result[key], DEFAULT_BINDINGS[key]);
  }
});

test("loadKeyBindings: 손상된 JSON → DEFAULT_BINDINGS 반환", async () => {
  await AsyncStorage.setItem("metronome_keyboard_bindings_v1", "!!!invalid json");
  const result = await loadKeyBindings();
  assert.deepEqual(result.playPause, DEFAULT_BINDINGS.playPause);
  await AsyncStorage.removeItem("metronome_keyboard_bindings_v1");
});

test("loadKeyBindings: 알 수 없는 키 무시", async () => {
  await AsyncStorage.setItem("metronome_keyboard_bindings_v1", JSON.stringify({ unknownKey: { code: "KeyX", label: "X" } }));
  const result = await loadKeyBindings();
  assert.deepEqual(result.playPause, DEFAULT_BINDINGS.playPause);
  await AsyncStorage.removeItem("metronome_keyboard_bindings_v1");
});

test("loadKeyBindings: 유효한 저장값 → 병합", async () => {
  const custom = { playPause: { code: "KeyQ", label: "Q" } };
  await AsyncStorage.setItem("metronome_keyboard_bindings_v1", JSON.stringify(custom));
  const result = await loadKeyBindings();
  assert.deepEqual(result.playPause, { code: "KeyQ", label: "Q" });
  assert.deepEqual(result.tapTempo, DEFAULT_BINDINGS.tapTempo);
  await AsyncStorage.removeItem("metronome_keyboard_bindings_v1");
});

// DEFAULT_BINDINGS 완성도

test("DEFAULT_BINDINGS: 모든 KeyAction 키가 존재함", () => {
  const required = [
    "playPause", "tapTempo", "bpmUp", "bpmDown", "bpmLeft", "bpmRight",
    "addBeatNormal", "addBeatAccent", "addBeatStrong", "addBeatMute", "removeBeat",
    "addSubNormal", "addSubAccent", "addSubStrong", "addSubMute", "removeSub",
    "cycleBeatTypes", "toggleMenu", "toggleStopwatch", "toggleTimer",
    "openPracticeBook", "showShortcuts", "escape", "loopToggle", "blockPlayModeNext",
  ];
  for (const key of required) {
    assert.ok(key in DEFAULT_BINDINGS, `누락된 DEFAULT_BINDINGS 키: ${key}`);
    const b = DEFAULT_BINDINGS[key as keyof typeof DEFAULT_BINDINGS];
    assert.ok(typeof b.code === "string" && b.code.length > 0, `${key}: code가 비어 있음`);
    assert.ok(typeof b.label === "string" && b.label.length > 0, `${key}: label이 비어 있음`);
  }
});

test("DEFAULT_BINDINGS: 비트/서브디비전 쌍 shift 분리", () => {
  assert.ok(!DEFAULT_BINDINGS.addBeatStrong.shift);
  assert.ok(DEFAULT_BINDINGS.addSubStrong.shift);
  assert.equal(DEFAULT_BINDINGS.addBeatStrong.code, DEFAULT_BINDINGS.addSubStrong.code);
});

// isEditableTarget

function makeEventWithTarget(code: string, target: Partial<HTMLElement>): KeyboardEvent {
  return { code, target, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false } as unknown as KeyboardEvent;
}

test("isEditableTarget: INPUT 태그 → true", () => {
  const e = makeEventWithTarget("Space", { tagName: "INPUT" } as Partial<HTMLElement>);
  assert.ok(isEditableTarget(e));
});

test("isEditableTarget: TEXTAREA 태그 → true", () => {
  const e = makeEventWithTarget("Space", { tagName: "TEXTAREA" } as Partial<HTMLElement>);
  assert.ok(isEditableTarget(e));
});

test("isEditableTarget: SELECT 태그 → true", () => {
  const e = makeEventWithTarget("Space", { tagName: "SELECT" } as Partial<HTMLElement>);
  assert.ok(isEditableTarget(e));
});

test("isEditableTarget: contentEditable 요소 → true", () => {
  const e = makeEventWithTarget("Space", { tagName: "DIV", isContentEditable: true } as Partial<HTMLElement>);
  assert.ok(isEditableTarget(e));
});

test("isEditableTarget: data-captures-keys 조상이 있을 때 → true", () => {
  const ancestor = { getAttribute: (a: string) => a === "data-captures-keys" ? "true" : null };
  const el = {
    tagName: "DIV",
    isContentEditable: false,
    closest: (sel: string) => sel === '[data-captures-keys="true"]' ? ancestor : null,
  };
  const e = makeEventWithTarget("ArrowUp", el as unknown as Partial<HTMLElement>);
  assert.ok(isEditableTarget(e));
});

test("isEditableTarget: 일반 DIV → false", () => {
  const el = {
    tagName: "DIV",
    isContentEditable: false,
    closest: () => null,
  };
  const e = makeEventWithTarget("Space", el as unknown as Partial<HTMLElement>);
  assert.ok(!isEditableTarget(e));
});

test("isEditableTarget: target 없음 → false", () => {
  const e = { code: "Space", target: null } as unknown as KeyboardEvent;
  assert.ok(!isEditableTarget(e));
});
