/** @jest-environment jsdom */
import React from "react";
import { act, render, cleanup } from "@testing-library/react";
import { StaffNotebookWorkspace } from "../components/lab-score/StaffNotebookWorkspace";
import { erasedAt } from "../lib/notebook-ink";

let mockPaper: any, mockTools: any;
jest.mock("@/contexts/ThemeContext", () => ({ useTheme: () => ({ colors: {} }) }));
jest.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "ko" }) }));
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("@/hooks/useLabScoreNotebook", () => ({
  useLabScoreNotebook: () => ({ notebooks: [], create: () => require("../lib/staff-notebook").createStaffNotebook(), save: jest.fn(), remove: jest.fn(), refresh: jest.fn() }),
}));
jest.mock("@/hooks/useNotebookPlayback", () => {
  const stop = jest.fn();
  return { useNotebookPlayback: () => ({ running: false, preparing: false, stop, rows: [] }) };
});
jest.mock("@/lib/storage", () => ({ loadPracticeBook: () => Promise.resolve([]) }));
jest.mock("@/components/lab-score/notebook/NotebookPaper", () => ({ NotebookPaper: (props: any) => { mockPaper = props; return null; } }));
jest.mock("@/components/lab-score/notebook/NotebookBottomTools", () => ({ NotebookBottomTools: (props: any) => { mockTools = props; return null; } }));
jest.mock("@/components/lab-score/notebook/NotebookPlaybackBar", () => ({ NotebookPlaybackBar: () => null }));
jest.mock("@/components/lab-score/notebook/NotebookSettingsPanel", () => ({ NotebookSettingsPanel: () => null }));
jest.mock("@/components/lab-score/notebook/NotebookModeMenu", () => ({ NotebookModeMenu: () => null }));
afterEach(cleanup);
const originalMeasure = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "measureInWindow");
beforeAll(() => Object.defineProperty(HTMLElement.prototype, "measureInWindow", {
  configurable: true,
  value(callback: (x: number, y: number, width: number, height: number) => void) { callback(0, 0, 0, 0); },
}));
afterAll(() => {
  if (originalMeasure) Object.defineProperty(HTMLElement.prototype, "measureInWindow", originalMeasure);
  else delete (HTMLElement.prototype as any).measureInWindow;
});
const touch = (x: number, y: number, phase: string) => act(() => mockPaper.onTouch({ x, y }, phase));
const draw = () => { touch(100, 110, "start"); touch(200, 110, "move"); touch(300, 110, "end"); };
async function mount() { await act(async () => { render(<StaffNotebookWorkspace />); }); }

test("one writing/erasing gesture is one undo; redo exactly restores style and partial masks", async () => {
  await mount();
  act(() => { mockTools.onColor("#d13b35"); mockTools.onWidth(6); });
  draw();
  const written = mockPaper.page;
  expect(written.strokes[0]).toMatchObject({ color: "#d13b35", width: 6 });
  act(() => { mockTools.onTool("erase"); mockTools.onEraserMode("partial"); });
  touch(200, 80, "start"); touch(200, 100, "move"); touch(200, 140, "end");
  const erased = mockPaper.page;
  expect(erasedAt(erased.strokes[0], { x: 200, y: 110 })).toBe(true);
  expect(erased.strokes[0].erasures).toHaveLength(1);
  act(() => mockTools.onUndo());
  expect(mockPaper.page).toEqual(written);
  act(() => mockTools.onUndo());
  expect(mockPaper.page.strokes).toHaveLength(0);
  act(() => mockTools.onRedo());
  expect(mockPaper.page).toEqual(written);
  act(() => mockTools.onRedo());
  expect(mockPaper.page).toEqual(erased);
});

test("cancelling an erase or pen before two-finger navigation leaves document and history untouched", async () => {
  await mount(); draw();
  const written = mockPaper.page;
  act(() => mockTools.onTool("erase"));
  touch(200, 110, "start");
  expect(mockPaper.page.strokes).toHaveLength(0); // live draft only
  touch(0, 0, "cancel");
  expect(mockPaper.page).toEqual(written);
  act(() => mockTools.onTool("pen"));
  touch(300, 220, "start"); touch(400, 220, "move"); touch(0, 0, "cancel");
  expect(mockPaper.drawing).toEqual([]);
  expect(mockPaper.page).toEqual(written);
  act(() => mockTools.onUndo());
  expect(mockPaper.page.strokes).toHaveLength(0);
  expect(mockTools.canUndo).toBe(false);
});

test("popup blocks paper callbacks and its changes do not create document history", async () => {
  await mount();
  act(() => mockTools.onToolPopup("pen"));
  expect(mockPaper.onTouch).toBeUndefined();
  act(() => { mockTools.onColor("#854ab0"); mockTools.onWidth(4); mockTools.onToolPopup(null); });
  expect(mockTools.canUndo).toBe(false);
  draw();
  expect(mockPaper.page.strokes[0]).toMatchObject({ color: "#854ab0", width: 4 });
});

test("spacing is one undo/redo edit and repeat/empty spacing adds no history", async () => {
  await mount();
  act(() => mockTools.onAutoSpace());
  expect(mockTools.canUndo).toBe(false);
  for (const glyph of ["quarter", "rest-eighth", "sixteenth"]) {
    act(() => mockTools.onChoose({ glyph, role: "normal", dotted: false }));
  }
  const before = mockPaper.page;
  act(() => mockTools.onAutoSpace());
  const corrected = mockPaper.page;
  expect(corrected.stamps[1].x - corrected.stamps[0].x).toBeGreaterThan(corrected.stamps[2].x - corrected.stamps[1].x);
  act(() => mockTools.onAutoSpace());
  expect(mockPaper.page).toBe(corrected);
  act(() => mockTools.onUndo());
  expect(mockPaper.page).toEqual(before);
  act(() => mockTools.onRedo());
  expect(mockPaper.page).toEqual(corrected);
  act(() => mockTools.onUndo());
  act(() => mockTools.onUndo());
  expect(mockPaper.page.stamps).toHaveLength(2);
});
