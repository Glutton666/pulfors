import AsyncStorage from "@react-native-async-storage/async-storage";

export type KeyAction =
  | "playPause"
  | "tapTempo"
  | "bpmUp"
  | "bpmDown"
  | "bpmLeft"
  | "bpmRight"
  | "addBeatNormal"
  | "addBeatAccent"
  | "addBeatStrong"
  | "addBeatMute"
  | "removeBeat"
  | "addSubNormal"
  | "addSubAccent"
  | "addSubStrong"
  | "addSubMute"
  | "removeSub"
  | "cycleBeatTypes"
  | "toggleMenu"
  | "toggleStopwatch"
  | "toggleTimer"
  | "openPracticeBook"
  | "showShortcuts"
  | "escape"
  | "loopToggle"
  | "blockPlayModeNext";

export interface KeyBinding {
  code: string;
  shift?: boolean;
  ctrl?: boolean;
  alt?: boolean;
  label: string;
}

export type KeyBindingsMap = Record<KeyAction, KeyBinding>;

export const DEFAULT_BINDINGS: KeyBindingsMap = {
  playPause:        { code: "Space",     label: "Space" },
  tapTempo:         { code: "Enter",     label: "Enter" },
  bpmUp:            { code: "ArrowUp",   label: "↑" },
  bpmDown:          { code: "ArrowDown", label: "↓" },
  bpmLeft:          { code: "ArrowLeft", label: "←" },
  bpmRight:         { code: "ArrowRight",label: "→" },
  addBeatStrong:    { code: "KeyS",      label: "S" },
  addBeatAccent:    { code: "KeyA",      label: "A" },
  addBeatNormal:    { code: "KeyN",      label: "N" },
  addBeatMute:      { code: "KeyM",      label: "M" },
  removeBeat:       { code: "KeyD",      label: "D" },
  addSubStrong:     { code: "KeyS", shift: true, label: "Shift+S" },
  addSubAccent:     { code: "KeyA", shift: true, label: "Shift+A" },
  addSubNormal:     { code: "KeyN", shift: true, label: "Shift+N" },
  addSubMute:       { code: "KeyM", shift: true, label: "Shift+M" },
  removeSub:        { code: "KeyD", shift: true, label: "Shift+D" },
  cycleBeatTypes:   { code: "Digit0",    label: "0" },
  toggleMenu:       { code: "Tab",       label: "Tab" },
  toggleStopwatch:  { code: "KeyW",      label: "W" },
  toggleTimer:      { code: "KeyT",      label: "T" },
  openPracticeBook: { code: "KeyP",      label: "P" },
  showShortcuts:    { code: "Slash", shift: true, label: "?" },
  escape:           { code: "Escape",    label: "Esc" },
  loopToggle:       { code: "KeyL",      label: "L" },
  blockPlayModeNext:{ code: "KeyG",      label: "G" },
};

const STORAGE_KEY = "metronome_keyboard_bindings_v1";

export async function loadKeyBindings(): Promise<KeyBindingsMap> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_BINDINGS };
    const saved = JSON.parse(raw) as Partial<KeyBindingsMap>;
    const merged = { ...DEFAULT_BINDINGS };
    for (const k of Object.keys(saved) as KeyAction[]) {
      if (k in DEFAULT_BINDINGS && saved[k]) {
        (merged as Record<string, KeyBinding>)[k] = saved[k]!;
      }
    }
    return merged;
  } catch {
    return { ...DEFAULT_BINDINGS };
  }
}

export async function saveKeyBindings(bindings: KeyBindingsMap): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(bindings));
  } catch {}
}

/**
 * Platform-neutral keyboard event interface.
 * Web passes the native KeyboardEvent (which satisfies this shape); native
 * Bluetooth-keyboard paths build a plain object that matches it.
 */
export interface NormalizedKeyEvent {
  readonly code: string;
  readonly key: string;
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly metaKey: boolean;
  preventDefault(): void;
  /** Web: EventTarget | null. Native: null. Typed as unknown so both KeyboardEvent and plain objects satisfy this interface. */
  readonly target?: unknown;
}

/**
 * Returns true when the keyboard event originates from an element that
 * captures text input and therefore should NOT trigger metronome shortcuts.
 *
 * Covers:
 *  - Standard form fields: INPUT, TEXTAREA, SELECT
 *  - contentEditable elements
 *  - Any element (or ancestor) with data-captures-keys="true"
 *    — use this attribute on custom components such as BpmInput or
 *      SliderModal that intercept key events for their own purposes.
 *
 * On native the target is always null, so the function returns false quickly.
 */
export function isEditableTarget(e: NormalizedKeyEvent): boolean {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  if (el.closest?.('[data-captures-keys="true"]')) return true;
  return false;
}

export function matchesBinding(e: NormalizedKeyEvent, binding: KeyBinding): boolean {
  if (e.code !== binding.code) return false;
  if ((binding.shift ?? false) !== e.shiftKey) return false;
  if ((binding.ctrl ?? false) !== (e.ctrlKey || e.metaKey)) return false;
  if ((binding.alt ?? false) !== e.altKey) return false;
  return true;
}

/** Map a React Native hardware-keyboard `key` string to a standard `code`. */
export function nativeKeyToCode(key: string): string {
  const map: Record<string, string> = {
    " ": "Space",
    "ArrowUp": "ArrowUp", "ArrowDown": "ArrowDown",
    "ArrowLeft": "ArrowLeft", "ArrowRight": "ArrowRight",
    "Enter": "Enter", "Escape": "Escape", "Tab": "Tab",
    "Backspace": "Backspace", "Delete": "Delete",
    "?": "Slash", "/": "Slash", "`": "Backquote",
  };
  if (key in map) return map[key];
  if (key.length === 1) {
    if (/[0-9]/.test(key)) return `Digit${key}`;
    if (/[a-zA-Z]/.test(key)) return `Key${key.toUpperCase()}`;
  }
  return key;
}

/**
 * Apply a rebinding to the current bindings map.
 * Returns the updated map and null if no conflict,
 * or the current map unchanged and the conflicting action if a conflict exists.
 * `action` is excluded from the conflict check (self-rebind is always safe).
 */
export function applyRebinding(
  current: KeyBindingsMap,
  action: KeyAction,
  newBinding: KeyBinding
): { updated: KeyBindingsMap; conflict: KeyAction | null } {
  for (const [act, binding] of Object.entries(current) as [KeyAction, KeyBinding][]) {
    if (act !== action && isConflicting(binding, newBinding)) {
      return { updated: current, conflict: act };
    }
  }
  return { updated: { ...current, [action]: newBinding }, conflict: null };
}

/** Side-effect callbacks injected into executeRebind for testability. */
export interface RebindFx {
  setLocalKeyBindings: (kb: KeyBindingsMap) => void;
  setRebindingAction: (action: KeyAction | null) => void;
  setRebindConflict: (msg: string | null) => void;
  onKeyBindingsChange?: (kb: KeyBindingsMap) => void;
  showKbSaved: () => void;
  conflictMessage: string;
}

/**
 * Core logic of handleRebindKeyDown's save/conflict branch.
 * Calls applyRebinding, then either sets the conflict message or
 * commits the change (setLocalKeyBindings + onKeyBindingsChange + saveKeyBindings
 * + clear rebind state + showKbSaved).
 * Returns true when the rebind succeeded, false when a conflict was found.
 */
export function executeRebind(
  current: KeyBindingsMap,
  action: KeyAction,
  newBinding: KeyBinding,
  fx: RebindFx
): boolean {
  const { updated, conflict } = applyRebinding(current, action, newBinding);
  if (conflict) {
    fx.setRebindConflict(fx.conflictMessage);
    return false;
  }
  fx.setLocalKeyBindings(updated);
  fx.onKeyBindingsChange?.(updated);
  saveKeyBindings(updated);
  fx.setRebindingAction(null);
  fx.setRebindConflict(null);
  fx.showKbSaved();
  return true;
}

/** Side-effect callbacks injected into executeRebindReset for testability. */
export interface ResetFx {
  setLocalKeyBindings: (kb: KeyBindingsMap) => void;
  onKeyBindingsChange?: (kb: KeyBindingsMap) => void;
  showKbSaved: () => void;
}

/**
 * Core logic of the reset-to-defaults button in the keyboard settings tab.
 * Applies DEFAULT_BINDINGS and calls saveKeyBindings in the background.
 */
export function executeRebindReset(fx: ResetFx): void {
  const def = { ...DEFAULT_BINDINGS };
  fx.setLocalKeyBindings(def);
  fx.onKeyBindingsChange?.(def);
  saveKeyBindings(def);
  fx.showKbSaved();
}

export function isConflicting(a: KeyBinding, b: KeyBinding): boolean {
  return (
    a.code === b.code &&
    (a.shift ?? false) === (b.shift ?? false) &&
    (a.ctrl ?? false) === (b.ctrl ?? false) &&
    (a.alt ?? false) === (b.alt ?? false)
  );
}

export function buildLabel(b: Pick<KeyBinding, "code" | "shift" | "ctrl" | "alt">): string {
  const parts: string[] = [];
  if (b.ctrl) parts.push("Ctrl");
  if (b.shift) parts.push("Shift");
  if (b.alt) parts.push("Alt");
  parts.push(codeToDisplay(b.code));
  return parts.join("+");
}

function codeToDisplay(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code === "Space") return "Space";
  if (code === "Enter") return "Enter";
  if (code === "Escape") return "Esc";
  if (code === "ArrowUp") return "↑";
  if (code === "ArrowDown") return "↓";
  if (code === "ArrowLeft") return "←";
  if (code === "ArrowRight") return "→";
  if (code === "Tab") return "Tab";
  if (code === "Slash") return "/";
  if (code === "Backquote") return "`";
  if (code === "Backspace") return "Backspace";
  if (code === "Delete") return "Del";
  return code;
}
