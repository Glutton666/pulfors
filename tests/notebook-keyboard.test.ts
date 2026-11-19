import {
  defaultNotebookBindings, loadNotebookBindings, NOTEBOOK_KEYBOARD_STORAGE_KEY,
  notebookBindingProblem, notebookKeyAction, saveNotebookBindings,
} from "../lib/notebook-keyboard";
import { layoutNotePicker, moveNotePickerDrag, startNotePickerDrag } from "../lib/notebook-note-picker";
import type { NormalizedKeyEvent } from "../lib/keyboard-bindings";

const mockProfileData = new Map<string, string>();
let mockProfile = "first";
jest.mock("@/lib/profile-storage", () => ({
  __esModule: true,
  default: {
    getItem: async (key: string) => mockProfileData.get(`${mockProfile}:${key}`) ?? null,
    setItem: async (key: string, value: string) => { mockProfileData.set(`${mockProfile}:${key}`, value); },
    removeItem: async (key: string) => { mockProfileData.delete(`${mockProfile}:${key}`); },
  },
}));

const key = (code: string, overrides: Partial<NormalizedKeyEvent> & { keyCode?: number } = {}) => ({
  code, key: "", altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, preventDefault: jest.fn(), ...overrides,
});

test.each([
  [key("Digit9", { key: "(", shiftKey: true }), "tupletOpen"],
  [key("Digit0", { key: ")", shiftKey: true }), "tupletClose"],
  [key("Digit6", { key: "^", shiftKey: true }), "dot:thirty_second"],
  [key("Digit6"), "note:thirty_second"],
  [key("KeyQ", { key: "ㅂ" }), "category:clef"],
  [key("KeyW", { key: "ㅈ" }), "category:meter"],
  [key("KeyE", { key: "ㄷ" }), "category:accidental"],
  [key("KeyR", { key: "ㄱ" }), "category:articulation"],
  [key("KeyT", { key: "ㅅ" }), "category:navigation"],
  [key("KeyY", { key: "ㅛ" }), "category:instrument"],
  [key("Lang2", { key: "HanjaMode" }), "symbols"],
  [key("Unidentified", { keyCode: 25 }), "symbols"],
  [key("Semicolon"), "symbols"],
  [key("Backspace"), "delete"],
  [key("KeyZ", { metaKey: true, shiftKey: true }), "redo"],
  [key("KeyS", { ctrlKey: true }), "save"],
  [key("KeyS"), "strong"],
])("matches only one notebook action for $code", (event, action) => {
  expect(notebookKeyAction(event, defaultNotebookBindings)).toBe(action);
});

test("notebook keys save only differences in one profile and restore its defaults", async () => {
  mockProfileData.clear();
  mockProfile = "first";
  const reusable = { code: "KeyP", label: "P" };
  expect(notebookBindingProblem(defaultNotebookBindings, "tool", reusable)).toBeNull();
  expect(notebookBindingProblem(defaultNotebookBindings, "tool", { code: "KeyS", label: "S" })).toBe("conflict");
  expect(notebookBindingProblem(defaultNotebookBindings, "tool", { code: "Backspace", label: "Backspace" })).toBe("reserved");
  expect(notebookBindingProblem(defaultNotebookBindings, "tool", { code: "Tab", label: "Tab" })).toBe("reserved");
  await saveNotebookBindings({ ...defaultNotebookBindings, tool: reusable });
  expect(JSON.parse(mockProfileData.get(`first:${NOTEBOOK_KEYBOARD_STORAGE_KEY}`)!)).toEqual({ tool: reusable });
  expect(notebookKeyAction(key("KeyP"), await loadNotebookBindings())).toBe("tool");
  mockProfile = "second";
  expect(notebookKeyAction(key("KeyP"), await loadNotebookBindings())).toBeUndefined();
  expect(notebookKeyAction(key("Backquote"), await loadNotebookBindings())).toBe("tool");
  mockProfile = "first";
  await saveNotebookBindings(defaultNotebookBindings);
  expect(mockProfileData.size).toBe(0);
  expect(await loadNotebookBindings()).toEqual(defaultNotebookBindings);
});

test.each(["note", "rest"] as const)("the %s drag cancel band does not capture a quick tap or overlap the role row", (kind) => {
  const choice = { glyph: "quarter", role: "normal", dotted: false } as const;
  for (const y of [80, 720]) {
    const layout = layoutNotePicker({ x: 70, y }, 390, 68, 810, kind);
    const cancel = { x: layout.cancel.x, y: layout.cancel.y + layout.cancel.height / 2 };
    const drag = startNotePickerDrag(choice, layout.anchor);
    expect(moveNotePickerDrag(drag, layout, cancel).cancelHovered).toBe(false);
    const choosing = moveNotePickerDrag(drag, layout, layout.durations[2]);
    expect(choosing.visitedDurations).toBe(true);
    expect(moveNotePickerDrag(choosing, layout, layout.roles[1]).cancelHovered).toBe(false);
    expect(moveNotePickerDrag(choosing, layout, cancel).cancelHovered).toBe(true);
  }
});
