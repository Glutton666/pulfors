import storage from "@/lib/profile-storage";
import { buildLabel, isConflicting, matchesBinding, type KeyBinding, type NormalizedKeyEvent } from "@/lib/keyboard-bindings";
import { noteDurations } from "@/lib/notebook-note-picker";

export const NOTEBOOK_KEYBOARD_STORAGE_KEY = "lab_notebook_keyboard_v1";
export const symbolCategories = ["clef", "meter", "accidental", "articulation", "navigation", "instrument"] as const;
export type NotebookSymbolCategory = typeof symbolCategories[number];

const row = (id: string, code: string, ko: string, en: string, modifiers: Pick<KeyBinding, "shift" | "ctrl"> = {}, label?: string) => ({
  id, ko, en, binding: { code, ...modifiers, label: label ?? buildLabel({ code, ...modifiers }) },
});
const durationLabels = [["온", "Whole"], ["2분", "Half"], ["4분", "Quarter"], ["8분", "Eighth"], ["16분", "16th"], ["32분", "32nd"]];
export const notebookShortcutRows = [
  row("tool", "Backquote", "펜 → 지우개 → 화면 이동 → 선택", "Cycle pen, eraser, pan and selection"),
  row("strong", "KeyS", "스트롱 음표", "Strong note"),
  row("ghost", "KeyA", "고스트 음표", "Ghost note"),
  row("normal", "KeyN", "노말 음표", "Normal note"),
  row("rest", "KeyM", "쉼표", "Rest"),
  ...noteDurations.flatMap((glyph, i) => [
    row(`note:${glyph}`, `Digit${i + 1}`, `${durationLabels[i][0]}음표·쉼표 입력`, `Insert ${durationLabels[i][1]} note or rest`),
    row(`dot:${glyph}`, `Digit${i + 1}`, `점${durationLabels[i][0]}음표·쉼표 입력`, `Insert dotted ${durationLabels[i][1]} note or rest`, { shift: true }),
  ]),
  row("tupletOpen", "Digit9", "잇단음표 열기", "Open tuplet", { shift: true }, "("),
  row("tupletClose", "Digit0", "잇단음표 닫기", "Close tuplet", { shift: true }, ")"),
  row("rowUp", "ArrowUp", "위 줄로 이동", "Previous staff row"),
  row("rowDown", "ArrowDown", "아래 줄로 이동", "Next staff row"),
  row("previous", "ArrowLeft", "이전 객체 선택", "Select previous object"),
  row("next", "ArrowRight", "다음 객체 선택", "Select next object"),
  row("delete", "Delete", "선택한 객체 삭제", "Delete selected objects", {}, "Del"),
  row("play", "Space", "재생·정지", "Play or stop"),
  row("zoomOut", "Minus", "축소", "Zoom out"),
  row("zoomIn", "Equal", "확대", "Zoom in"),
  row("category:clef", "KeyQ", "음자리표", "Clefs", {}, "Q / ㅂ"),
  row("category:meter", "KeyW", "박자표", "Meters", {}, "W / ㅈ"),
  row("category:accidental", "KeyE", "임시표", "Accidentals", {}, "E / ㄷ"),
  row("category:articulation", "KeyR", "아티큘레이션", "Articulations", {}, "R / ㄱ"),
  row("category:navigation", "KeyT", "반복·이동 부호", "Repeats and navigation", {}, "T / ㅅ"),
  row("category:instrument", "KeyY", "악기 기호", "Instrument marks", {}, "Y / ㅛ"),
  row("symbols", "Semicolon", "선택한 기호 목록 열기", "Open selected symbol category", {}, ";"),
  row("undo", "KeyZ", "실행 취소", "Undo", { ctrl: true }),
  row("redo", "KeyZ", "다시 실행", "Redo", { ctrl: true, shift: true }),
  row("save", "KeyS", "현재 노트 저장", "Save notebook", { ctrl: true }),
  row("copy", "KeyC", "오선노트 클립보드에 복사", "Copy to notebook clipboard", { ctrl: true }),
  row("paste", "KeyV", "붙여넣기 미리보기", "Preview paste", { ctrl: true }),
  row("help", "Slash", "단축키 안내", "Shortcut guide", { shift: true }, "?"),
];
export type NotebookBindings = Record<string, KeyBinding>;
export const defaultNotebookBindings: NotebookBindings = Object.fromEntries(notebookShortcutRows.map(({ id, binding }) => [id, binding]));
type NotebookKey = NormalizedKeyEvent & { keyCode?: number };
const noModifiers = (e: NotebookKey) => !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey;
const aliases: NotebookBindings = { hanja: { code: "Hanja", label: "Hanja" }, backspace: { code: "Backspace", label: "Backspace" } };

export function notebookKeyAction(e: NotebookKey, bindings: NotebookBindings) {
  if (noModifiers(e)) {
    if (e.key === "HanjaMode" || e.code === "Lang2" || e.keyCode === 25 || e.code === "Hanja") return "symbols";
    if (e.code === "Backspace") return "delete";
  }
  return notebookShortcutRows.find(({ id }) => matchesBinding(e, bindings[id]))?.id;
}

export function notebookBindingProblem(bindings: NotebookBindings, action: string, binding: KeyBinding): "reserved" | "conflict" | null {
  if (!binding.code || /^(Unidentified|Escape|Tab|Enter|Lang[12]|Hanja|Control|Meta|Shift|Alt|OS|F\d+)/.test(binding.code) ||
      (!binding.ctrl && !binding.alt && isConflicting(binding, aliases.backspace))) return "reserved";
  if (notebookShortcutRows.some(({ id }) => id !== action && isConflicting(bindings[id], binding))) return "conflict";
  return null;
}

export async function loadNotebookBindings(): Promise<NotebookBindings> {
  const raw = await storage.getItem(NOTEBOOK_KEYBOARD_STORAGE_KEY);
  if (!raw) return defaultNotebookBindings;
  try {
    const saved = JSON.parse(raw);
    const bindings = { ...defaultNotebookBindings };
    for (const { id } of notebookShortcutRows) {
      const b = saved?.[id];
      if (typeof b?.code === "string" && ["shift", "ctrl", "alt"].every((k) => b[k] === undefined || typeof b[k] === "boolean")) {
        bindings[id] = { code: b.code, shift: b.shift, ctrl: b.ctrl, alt: b.alt, label: buildLabel(b) };
      }
    }
    return notebookShortcutRows.some(({ id }) => notebookBindingProblem(bindings, id, bindings[id])) ? defaultNotebookBindings : bindings;
  } catch { return defaultNotebookBindings; }
}

export async function saveNotebookBindings(bindings: NotebookBindings) {
  const changes = notebookShortcutRows.filter(({ id, binding }) => !isConflicting(bindings[id], binding));
  if (!changes.length) await storage.removeItem(NOTEBOOK_KEYBOARD_STORAGE_KEY);
  else await storage.setItem(NOTEBOOK_KEYBOARD_STORAGE_KEY, JSON.stringify(Object.fromEntries(changes.map(({ id }) => [id, bindings[id]]))));
}
