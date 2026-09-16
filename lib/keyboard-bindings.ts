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
  | "blockPlayModeNext"
  | "applySubdivision"
  | "barPrevious"
  | "barNext"
  | "barBlock"
  | "barRepeat"
  | "barJumpFrom"
  | "barJumpTo"
  | "barVolta"
  | "barEnd"
  | "barCopy"
  | "barPaste"
  | "barRepeatMode"
  | "barAddLayer"
  | "barQuickSave"
  | "barOpenAudio"
  | "barRemoveSubdivision"
  | "barConfirm"
  | "noteNext";

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
  applySubdivision: { code: "Enter", shift: true, label: "Shift+Enter" },
  barPrevious:      { code: "Minus",      label: "-" },
  barNext:          { code: "Equal",      label: "=" },
  barBlock:         { code: "BracketLeft", label: "[" },
  barRepeat:        { code: "KeyR",       label: "R" },
  barJumpFrom:      { code: "KeyJ",       label: "J" },
  barJumpTo:        { code: "KeyK",       label: "K" },
  barVolta:         { code: "KeyC",       label: "C" },
  barEnd:           { code: "KeyE",       label: "E" },
  barCopy:          { code: "KeyC", ctrl: true, label: "Ctrl+C" },
  barPaste:         { code: "KeyV", ctrl: true, label: "Ctrl+V" },
  barRepeatMode:    { code: "Tab",        label: "Tab" },
  barAddLayer:      { code: "Slash",      label: "/" },
  barQuickSave:     { code: "KeyS", ctrl: true, label: "Ctrl+S" },
  barOpenAudio:     { code: "KeyO",       label: "O" },
  barRemoveSubdivision: { code: "Backspace", label: "Backspace" },
  barConfirm:       { code: "Enter",      label: "Enter" },
  noteNext:         { code: "Enter",      label: "Enter" },
};

const STORAGE_KEY = "metronome_keyboard_bindings_v1";
const MODE_STORAGE_KEY = "metronome_keyboard_bindings_by_mode_v1";
export type KeyboardMode = "beat" | "bar" | "note" | "stage";
export const MODE_KEY_ACTIONS: Record<KeyboardMode, readonly KeyAction[]> = {
  beat: [
    "playPause", "tapTempo", "bpmUp", "bpmDown", "bpmLeft", "bpmRight",
    "addBeatNormal", "addBeatAccent", "addBeatStrong", "addBeatMute",
    "removeBeat", "cycleBeatTypes", "addSubNormal", "addSubAccent",
    "addSubStrong", "addSubMute", "removeSub", "applySubdivision",
  ],
  bar: [
    "playPause", "bpmUp", "bpmDown", "bpmLeft", "bpmRight",
    "addBeatNormal", "addBeatAccent", "addBeatStrong", "addBeatMute",
    "loopToggle", "blockPlayModeNext", "barPrevious", "barNext", "barBlock",
    "barRepeat", "barJumpFrom", "barJumpTo", "barVolta", "barEnd",
    "barCopy", "barPaste", "barRepeatMode", "barAddLayer", "barQuickSave",
    "barOpenAudio", "barRemoveSubdivision", "barConfirm",
  ],
  note: ["playPause", "noteNext"],
  stage: [],
};

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

export async function loadModeKeyBindings(mode: KeyboardMode): Promise<KeyBindingsMap> {
  try {
    const raw = await AsyncStorage.getItem(MODE_STORAGE_KEY);
    const saved = raw ? JSON.parse(raw) as Partial<Record<KeyboardMode, Partial<KeyBindingsMap>>> : {};
    // The legacy list is the initial value for each independent mode.
    const legacy = await loadKeyBindings();
    return { ...legacy, ...(saved[mode] ?? {}) } as KeyBindingsMap;
  } catch {
    return loadKeyBindings();
  }
}

export async function saveModeKeyBindings(mode: KeyboardMode, bindings: KeyBindingsMap): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(MODE_STORAGE_KEY);
    const saved = raw
      ? JSON.parse(raw) as Partial<Record<KeyboardMode, Partial<KeyBindingsMap>>>
      : {};
    const legacy = await loadKeyBindings();
    saved[mode] = Object.fromEntries(
      MODE_KEY_ACTIONS[mode]
        .filter((action) => !isConflicting(bindings[action], legacy[action]))
        .map((action) => [action, bindings[action]]),
    ) as Partial<KeyBindingsMap>;
    await AsyncStorage.setItem(MODE_STORAGE_KEY, JSON.stringify(saved));
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

export interface RecorderKeyboardActions {
  isActive: () => boolean;
  moveSelection: (direction: -1 | 1) => void;
  confirm: () => void;
  cancel: () => void;
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
    "-": "Minus", "_": "Minus", "=": "Equal", "+": "Equal",
    "[": "BracketLeft", "{": "BracketLeft",
    "!": "Digit1", "@": "Digit2", "#": "Digit3", "$": "Digit4",
    "%": "Digit5", "^": "Digit6", "&": "Digit7", "*": "Digit8",
    "(": "Digit9", ")": "Digit0",
  };
  if (key in map) return map[key];
  if (key.length === 1) {
    if (/[0-9]/.test(key)) return `Digit${key}`;
    if (/[a-zA-Z]/.test(key)) return `Key${key.toUpperCase()}`;
  }
  return key;
}

export function nativeKeyImpliesShift(key: string): boolean {
  return /[?~_+{}|:<>!@#$%^&*()]/.test(key);
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
    if (
      act !== action &&
      isConflicting(binding, newBinding) &&
      !areModeExclusiveActions(act, action)
    ) {
      return { updated: current, conflict: act };
    }
  }
  return { updated: { ...current, [action]: newBinding }, conflict: null };
}

const BEAT_ONLY_ACTIONS = new Set<KeyAction>([
  "tapTempo",
  "toggleMenu",
  "removeBeat",
  "addSubNormal",
  "addSubAccent",
  "addSubStrong",
  "addSubMute",
  "removeSub",
  "cycleBeatTypes",
  "applySubdivision",
]);

const BAR_ONLY_ACTIONS = new Set<KeyAction>([
  "loopToggle",
  "blockPlayModeNext",
  "barPrevious",
  "barNext",
  "barBlock",
  "barRepeat",
  "barJumpFrom",
  "barJumpTo",
  "barVolta",
  "barEnd",
  "barCopy",
  "barPaste",
  "barRepeatMode",
  "barAddLayer",
  "barQuickSave",
  "barOpenAudio",
  "barRemoveSubdivision",
  "barConfirm",
]);

const NOTE_ONLY_ACTIONS = new Set<KeyAction>(["noteNext"]);

function areModeExclusiveActions(a: KeyAction, b: KeyAction): boolean {
  const groups = [BEAT_ONLY_ACTIONS, BAR_ONLY_ACTIONS, NOTE_ONLY_ACTIONS];
  const aGroup = groups.findIndex((group) => group.has(a));
  const bGroup = groups.findIndex((group) => group.has(b));
  return aGroup >= 0 && bGroup >= 0 && aGroup !== bGroup;
}

/** Side-effect callbacks injected into executeRebind for testability. */
export interface RebindFx {
  setLocalKeyBindings: (kb: KeyBindingsMap) => void;
  setRebindingAction: (action: KeyAction | null) => void;
  setRebindConflict: (msg: string | null) => void;
  onKeyBindingsChange?: (kb: KeyBindingsMap) => void;
  showKbSaved: () => void;
  conflictMessage: string;
  /** Scoped editors persist through their owner and must not overwrite legacy bindings. */
  persistLegacy?: boolean;
}

/**
 * Core logic of handleRebindKeyDown's save/conflict branch.
 * Calls applyRebinding, then either sets the conflict message or
 * commits the change (setLocalKeyBindings + onKeyBindingsChange + optional legacy
 * persistence + clear rebind state + showKbSaved).
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
  if (fx.persistLegacy !== false) saveKeyBindings(updated);
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
  bindings?: KeyBindingsMap;
  persistLegacy?: boolean;
}

/**
 * Core logic of the reset-to-defaults button in the keyboard settings tab.
 * Applies the provided bindings (or DEFAULT_BINDINGS) and optionally persists
 * them to the legacy global storage.
 */
export function executeRebindReset(fx: ResetFx): void {
  const def = fx.bindings ?? { ...DEFAULT_BINDINGS };
  fx.setLocalKeyBindings(def);
  fx.onKeyBindingsChange?.(def);
  if (fx.persistLegacy !== false) saveKeyBindings(def);
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
  if (code === "Minus") return "-";
  if (code === "Equal") return "=";
  if (code === "BracketLeft") return "[";
  return code;
}
