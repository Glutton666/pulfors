import { DEFAULT_NOTEBOOK_SETTINGS, type StaffNotebook, type StaffStamp } from "../lib/staff-notebook";
import { meterFromGlyph, notebookSections, placeSectionStamp, sectionStaffY } from "../lib/notebook-sections";
import { buildNotebookNotationPlan, notebookMeasurePosition } from "../lib/notebook-playback-plan";
import { layoutNotebookMusic, writtenDuration } from "../lib/notebook-music-layout";
import { notebookDisplayColumns, projectNotebookPortrait } from "../lib/notebook-portrait-layout";
import { prepareNotebookMeasureEdit } from "../lib/notebook-measure-edit";
import { paginateNotebook } from "../lib/notebook-editing";

const symbol = (id: string, glyph: string, row: number, section = false, x = 90): StaffStamp =>
  ({ id, glyph, x, y: row * 155 + 102, size: 26, ...(section ? { sectionStart: true } : {}) });
const sample = (): StaffNotebook => ({
  id: "mixed", title: "Mixed meter", updatedAt: 1,
  settings: { ...DEFAULT_NOTEBOOK_SETTINGS, bpm: 120, beatsPerMeasure: 2, rowsPerPage: 2 },
  pages: [
    { id: "intro", staffCount: 2, strokes: [], stamps: [symbol("old", "time-9-8", 0), symbol("g", "clef-treble", 0, true), symbol("seven", "time-7-8", 1, true)] },
    { id: "end", staffCount: 2, strokes: [], stamps: [symbol("c", "clef-tenor", 0, true), symbol("three", "time-3-4", 1, true)] },
  ],
});

test("authored changes persist independently across pages; legacy stamps have no effect", () => {
  const note = sample();
  expect(notebookSections(JSON.parse(JSON.stringify(note))).flat().map(({ clef, meter }) => [clef, meter.beats, meter.unit])).toEqual([
    ["clef-treble", 4, 4], ["clef-treble", 7, 8], ["clef-tenor", 7, 8], ["clef-tenor", 3, 4],
  ]);
  expect(meterFromGlyph("time-12-16")).toEqual({ beats: 12, unit: 16 });
  for (const glyph of ["time-0-4", "time-13-4", "time-3-32", "time-02-4"]) expect(meterFromGlyph(glyph)).toBeUndefined();
  expect([sectionStaffY("clef-treble", 0), sectionStaffY("clef-alto", 0), sectionStaffY("clef-tenor", 0)]).toEqual([114, 102, 90]);
});

test("replacing, moving and removing a signature recomputes sections without promoting a legacy glyph", () => {
  const note = sample();
  const edit = (n: StaffNotebook, stamps: StaffStamp[]) => prepareNotebookMeasureEdit(n, { ...n, pages: [{ ...n.pages[0], stamps }, n.pages[1]] });
  const replacement = edit(note, [...note.pages[0].stamps!, symbol("five", "time-5-8", 1, true)]);
  expect(replacement.pages[0].stamps!.map((s) => s.id)).toEqual(["old", "g", "five"]);
  const moved = edit(replacement, replacement.pages[0].stamps!.map((s) => s.id === "five" ? { ...s, y: 102 } : s));
  expect(notebookSections(moved)[0].map((r) => r.meter.beats)).toEqual([5, 5]);
  const deleted = edit(moved, moved.pages[0].stamps!.filter((s) => s.id !== "five"));
  expect(notebookSections(deleted).flat().map((r) => r.meter.beats)).toEqual([4, 4, 4, 3]);
  expect(notebookSections(replacement)[0][1].meter.beats).toBe(5); // Undo can restore the original snapshot.
});

test("rational-length mixed bars follow the right measure inside a row, independent from the click meter", () => {
  const note = sample();
  note.pages[0].measureCounts = [2, 1];
  note.pages[0].stamps!.find((s) => s.id === "seven")!.y = 102;
  note.pages[0].stamps!.find((s) => s.id === "seven")!.x = 520;
  const plan = buildNotebookNotationPlan(note);
  expect(plan.chunks.map((c) => c.endMs - c.startMs)).toEqual([2000, 1750, 1750, 1750, 1500]);
  expect(notebookMeasurePosition(plan, 1850)).toMatchObject({ row: 0, measure: 0 });
  expect(notebookMeasurePosition(plan, 2000)).toMatchObject({ row: 0, measure: 1 });
  expect(notebookMeasurePosition(plan, 3750)).toMatchObject({ row: 1, measure: 0 });
  expect(note.settings!.beatsPerMeasure).toBe(2);
});

test("automatic spacing splits at the active meter across pages and retains the authored marks", () => {
  const note = sample();
  note.pages[0].stamps!.push(symbol("w", "whole", 1, false, 180));
  const { note: arranged } = layoutNotebookMusic(note);
  const portions = arranged.pages.flatMap((p) => p.stamps ?? []).filter((s) => s.split?.sourceId === "w");
  expect(portions.map(writtenDuration).reduce((a, b) => a + b)).toBe(4);
  expect(portions.slice(0, -1).map(writtenDuration).reduce((a, b) => a + b)).toBe(3.5);
  expect(notebookSections(arranged).flat().map((r) => r.meter.beats)).toEqual([4, 7, 7, 3]);
  expect(arranged.pages[1].stamps!.some((s) => s.tieFrom)).toBe(true);
});

test("folding, resizing and repagination leave a change tied to the same measure and keep the source ink", () => {
  const note = sample();
  const [page] = note.pages;
  page.measureCounts = [4, 2];
  page.stamps!.push(symbol("line", "barline", 0, false, 300), symbol("quarter", "quarter", 0, false, 420));
  page.strokes.push({ id: "ink", width: 2, points: [{ x: 260, y: 109 }, { x: 410, y: 109 }] });
  const regions = notebookSections(note)[0];
  const second = regions[1];
  page.stamps!.push(placeSectionStamp(symbol("at-second", "time-5-8", 0, true), second));
  const sections = notebookSections(note);
  const before = JSON.stringify(note);
  for (const count of [1, 2, 4, 8]) {
    const p = projectNotebookPortrait(page, note.settings!, count, .5, 1, sections[0]);
    expect(p.regions.find((r) => r.meterChange?.id === "at-second")?.meter.beats).toBe(5);
    const quarter = page.stamps!.find((s) => s.id === "quarter")!;
    const sourcePoint = p.inverse(p.forward(quarter));
    expect(sourcePoint.x).toBeCloseTo(quarter.x);
    expect(sourcePoint.y).toBeCloseTo(quarter.y);
    expect(p.page.stamps!.some((s) => s.id === "line")).toBe(true);
    expect([...p.strokeOwners.values()]).toContain("ink");
  }
  expect(JSON.stringify(note)).toBe(before);
  let id = 0;
  const paginated = paginateNotebook(note, 1, () => `new-page-${++id}`);
  expect(notebookSections(paginated).flat().slice(0, sections.flat().length).map((r) => r.meter.beats)).toEqual(sections.flat().map((r) => r.meter.beats));
  expect([0.5, 1, 2].map((zoom) => notebookDisplayColumns(zoom, 4))).toEqual([8, 4, 2]);
});
