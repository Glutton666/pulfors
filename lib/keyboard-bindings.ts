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

export function matchesBinding(e: KeyboardEvent, binding: KeyBinding): boolean {
  if (e.code !== binding.code) return false;
  if ((binding.shift ?? false) !== e.shiftKey) return false;
  if ((binding.ctrl ?? false) !== (e.ctrlKey || e.metaKey)) return false;
  if ((binding.alt ?? false) !== e.altKey) return false;
  return true;
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
