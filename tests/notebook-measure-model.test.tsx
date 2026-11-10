/** @jest-environment jsdom */
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { NotebookPaper } from "../components/lab-score/notebook/NotebookPaper";
import { DEFAULT_NOTEBOOK_SETTINGS, type StaffNotebook, type StaffStamp } from "../lib/staff-notebook";
import { notebookMeasureRegions, notebookRowMeasureCounts, notebookStampMeasure } from "../lib/notebook-measures";
import { layoutNotebookMusic, writtenDuration } from "../lib/notebook-music-layout";
import { selectNotebookUnits } from "../lib/notebook-editing";
import { buildNotebookNotationPlan } from "../lib/notebook-playback-plan";
import { randomizeNotebook } from "../lib/notebook-random";
import { followNotebookSigns } from "../lib/notebook-navigation";
import { materializeRows, notebookRows, ROW_HEIGHT } from "../lib/staff-notebook-layout";

jest.mock("../components/ScorePalette", () => ({ ALL_INSTR_SYMBOLS: [], ARTICULATIONS: [] }));
jest.mock("react-native-svg", () => {
  const React = require("react");
  return { __esModule: true, ...Object.fromEntries([
    ["default", "svg"], ["G", "g"], ["Path", "path"], ["Text", "text"], ["Ellipse", "ellipse"],
    ["Polygon", "polygon"], ["Line", "line"], ["Rect", "rect"], ["Defs", "defs"], ["Mask", "mask"], ["Circle", "circle"],
  ].map(([key, tag]) => [key, ({ children, testID, ...props }: any) =>
    React.createElement(tag, { ...props, "data-testid": testID }, children)])) };
});
afterEach(cleanup);
const stamp = (id: string, x: number, glyph = "quarter", measure = 3): StaffStamp => ({ id, x, y: 102, glyph, size: 26, measure });
function fixture(x: number | null, showBarlines = true): StaffNotebook {
  return {
    id: "manual", title: "", updatedAt: 0,
    settings: { ...DEFAULT_NOTEBOOK_SETTINGS, measuresPerRow: 4, rowsPerPage: 1,
      notationMeter: { beats: 4, unit: 4 }, bpm: 60, showBarlines, autoSpacing: true },
    pages: [{ id: "p", staffCount: 1, measureCounts: [4], strokes: [],
      stamps: [stamp("a", 100), stamp("b", 450), stamp("c", 750), ...(x === null ? [] : [stamp("bar", x, "barline")])] }],
  };
}
const regions = (note: StaffNotebook) => notebookMeasureRegions(note.pages[0], note.settings);
const count = (note: StaffNotebook) => notebookRowMeasureCounts(note.pages[0], note.settings)[0];
function paper(note: StaffNotebook) {
  return render(<NotebookPaper page={note.pages[0]} settings={note.settings} width={900} height={155}
    paperScale={1} zoom={1} offset={{ x: 0, y: 0 }} tool="select" lineWidth={2}
    drawing={[]} pendingGlyph={null} preview={null} />);
}

test.each([true, false])("add/move/delete uses the same regions for layout, selection, display and time (show=%s)", (show) => {
  // These are successive document states; stale measure=3 must not override x.
  for (const x of [null, 300, 600, null]) {
    const note = fixture(x, show), saved = JSON.stringify(note), expectedCount = x === null ? 4 : 2;
    expect(count(note)).toBe(expectedCount);
    expect(regions(note).map((r) => [r.left, r.right])).toEqual(x === null
      ? [[38, 244], [244, 450], [450, 656], [656, 862]] : [[38, x], [x, 862]]);
    const plan = buildNotebookNotationPlan(note);
    expect(plan.chunks).toHaveLength(expectedCount);
    expect(plan.rowEnds).toEqual([expectedCount * 4000]);
    for (const r of regions(note)) {
      const p = { x: (r.left + r.right) / 2, y: 102 };
      const selection = selectNotebookUnits(note.pages[0], p, p, "measure", note.settings);
      for (const s of note.pages[0].stamps!.filter((s) => s.glyph === "quarter" && s.x > r.left + 26 && s.x < r.right - 26))
        expect(selection.stampIds).toContain(s.id);
    }
    const laid = layoutNotebookMusic(note).note;
    expect(count(laid)).toBe(expectedCount);
    expect(laid.pages[0].measureCounts).toEqual([4]);
    expect(laid.settings!.measuresPerRow).toBe(4);
    expect(buildNotebookNotationPlan(laid).durationMs).toBe(plan.durationMs);
    if (x !== null) {
      expect(laid.pages[0].stamps!.find((s) => s.id === "bar")!.x).toBeCloseTo(x);
      for (const s of laid.pages[0].stamps!.filter((s) => s.glyph === "quarter")) {
        expect(s.measure).toBe(notebookStampMeasure(note.pages[0], note.pages[0].stamps!.find((v) => v.id === s.id)!, note.settings));
        expect(s.measure).toBe(notebookStampMeasure(laid.pages[0], s, laid.settings));
        expect(writtenDuration(s)).toBe(1);
      }
      const again = layoutNotebookMusic(laid).note;
      expect(regions(again)).toEqual(regions(laid));
      const removed = { ...laid, pages: laid.pages.map((p) => ({ ...p, stamps: p.stamps!.filter((s) => s.id !== "bar") })) };
      expect(count(removed)).toBe(4);
      expect(buildNotebookNotationPlan(removed).durationMs).toBe(16000);
    }
    const view = paper(laid);
    expect(view.queryAllByTestId("notebook-auto-barline")).toHaveLength(show && x === null ? 3 : 0);
    expect(view.queryAllByTestId("notebook-stamp-bar")).toHaveLength(x === null ? 0 : 1);
    view.unmount();
    expect(JSON.stringify(note)).toBe(saved);
  }
});

test.each(["row", "measure"] as const)("random %s preserves all content, boundaries and total playback time", (unit) => {
  const note = fixture(300, false);
  note.pages[0].staffCount = 2;
  note.pages[0].measureCounts = [4, 3];
  note.pages[0].stamps!.push({ ...stamp("other", 140), y: 102 + ROW_HEIGHT });
  note.settings = { ...note.settings!, random: true, randomUnit: unit, randomSeed: 2 };
  const before = JSON.stringify(note), output = randomizeNotebook(note);
  expect(output.pages.flatMap((p) => p.stamps!.map((s) => s.id)).sort()).toEqual(["a", "b", "bar", "c", "other"]);
  expect(buildNotebookNotationPlan(output).chunks).toHaveLength(5);
  expect(buildNotebookNotationPlan(output).durationMs).toBe(20000);
  for (const p of output.pages) for (const s of p.stamps!)
    expect(s.measure).toBe(notebookStampMeasure(p, s, output.settings));
  if (unit === "measure") expect(regions(output)).toEqual(regions(note));
  const displayed = materializeRows(output, notebookRows(output));
  expect(notebookRowMeasureCounts(displayed, output.settings).reduce((a, b) => a + b, 0)).toBe(5);
  expect(JSON.stringify(note)).toBe(before);
  expect(randomizeNotebook(note)).toEqual(output);
});

test("repeat signs use the uneven manual regions, ignoring stale saved measure indices", () => {
  const note = fixture(600, false);
  note.pages[0].stamps!.push(stamp("start", 70, "repeat_start", 3), stamp("end", 750, "repeat_end", 0));
  const plan = followNotebookSigns(note, buildNotebookNotationPlan(note), 4);
  expect(plan.chunks).toHaveLength(4);
  expect(plan.durationMs).toBe(16000);
});

test("duplicate/edge bars and scaled pages have one consistent effective count", () => {
  const note = fixture(600);
  note.pages[0].layoutScale = .5;
  note.pages[0].stamps!.push(stamp("duplicate", 600.5, "bar_line"), stamp("edge", 38, "barline"));
  expect(regions(note).map((r) => [r.left, r.right])).toEqual([[38, 600], [600, 1686]]);
  expect(buildNotebookNotationPlan(note).durationMs).toBe(8000);
  expect(count(layoutNotebookMusic(note).note)).toBe(2);
});

test("manual empty measures retain their full duration and generated rest capacity", () => {
  const note = fixture(300);
  note.pages[0].stamps = [stamp("bar", 300, "barline"), stamp("last", 700)];
  note.pages[0].completedRows = [0];
  const out = layoutNotebookMusic(note).note;
  const rests = out.pages[0].stamps!.filter((s) => s.generated);
  expect(rests.reduce((sum, s) => sum + writtenDuration(s), 0)).toBe(7);
  expect(rests.filter((s) => s.measure === 0).reduce((sum, s) => sum + writtenDuration(s), 0)).toBe(4);
  expect(buildNotebookNotationPlan(out).durationMs).toBe(8000);
  expect(out.pages[0].measureCounts).toEqual([4]);
});

test("manual row overflow respects two-measure capacity, keeping boundary and exact note durations", () => {
  const note = fixture(500, false);
  note.pages[0].stamps = [stamp("bar", 500, "barline"),
    ...Array.from({ length: 9 }, (_, i) => stamp(`q${i}`, 70 + i * 40))];
  const out = layoutNotebookMusic(note).note;
  const music = out.pages.flatMap((p) => p.stamps!.filter((s) => s.glyph === "quarter"));
  expect(music).toHaveLength(9);
  expect(music.filter((s) => out.pages[0].stamps!.includes(s))).toHaveLength(8);
  expect(music.reduce((sum, s) => sum + writtenDuration(s), 0)).toBe(9);
  expect(count(out)).toBe(2);
  expect(out.pages[0].stamps!.find((s) => s.id === "bar")!.x).toBe(500);
  expect(buildNotebookNotationPlan(out).chunks).toHaveLength(6); // two manual + four on the new row
});

test("visual spill preserves manual measure time when inserting physical rows/pages", () => {
  const note = fixture(300, false);
  note.pages[0].stamps = [stamp("bar", 300, "barline"),
    ...Array.from({ length: 8 }, (_, i) => stamp(`left${i}`, 55 + i * 28, "eighth")),
    ...Array.from({ length: 8 }, (_, i) => stamp(`right${i}`, 340 + i * 40, "eighth"))];
  const out = layoutNotebookMusic(note, { spillVisual: true });
  expect(out.reason).toBe("changed");
  expect(out.note.pages).toHaveLength(2);
  expect(buildNotebookNotationPlan(out.note).chunks).toHaveLength(2);
  expect(buildNotebookNotationPlan(out.note).durationMs).toBe(8000);
  const music = out.note.pages.flatMap((p) => p.stamps!.filter((s) => s.glyph === "eighth"));
  expect(music).toHaveLength(16);
  expect(music.reduce((sum, s) => sum + writtenDuration(s), 0)).toBe(8);
  expect(out.note.pages.flatMap((p) => p.stamps!).filter((s) => s.id === "bar")).toHaveLength(1);
});
