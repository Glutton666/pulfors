import { deleteNotebookBar, insertNotebookBarline, notebookInkCrossesBoundary, notebookInkWraps } from "../lib/notebook-measure-actions";
import { notebookMeasureRegions } from "../lib/notebook-measures";
import { notebookSections } from "../lib/notebook-sections";
import { layoutNotebookMusic, musicalDuration } from "../lib/notebook-music-layout";
import { DEFAULT_NOTEBOOK_SETTINGS, type StaffNotebook, type StaffPage, type StaffStamp } from "../lib/staff-notebook";

const settings = { ...DEFAULT_NOTEBOOK_SETTINGS, notationMeter: { beats: 4, unit: 4 as const }, measuresPerRow: 4 };
const stamp = (id: string, x: number, y = 102, glyph = "quarter"): StaffStamp => ({ id, x, y, glyph, size: 26 });
const page: StaffPage = { id: "page", staffCount: 2, strokes: [{ id: "memo", width: 3, points: [{ x: 470, y: 136 }, { x: 650, y: 139 }] }],
  stamps: [stamp("a", 100), stamp("b", 315), stamp("c", 500), stamp("d", 580), stamp("e", 770), stamp("later", 180, 257)] };
const doc = (p: StaffPage): StaffNotebook => ({ id: "score", title: "Score", updatedAt: 1, pages: [p], settings });
const firstRow = (p: StaffPage) => notebookMeasureRegions(p, settings).filter((r) => r.row === 0);

test("manual split retains the other automatic boundaries and fills each shorter bar with rests", () => {
  const result = insertNotebookBarline(page, settings, stamp("manual", 544, 102, "barline"));
  if (result.error) throw Error(result.error);
  expect(result.crossesInk).toBe(true);
  expect(firstRow(result.page).map((r) => r.left)).toEqual([38, 244, 450, 544, 656]);
  expect(result.page.strokes).toBe(page.strokes);
  const laidOut = layoutNotebookMusic(doc(result.page), { allowCrowded: true }).note;
  const output = laidOut.pages[0].stamps!;
  for (const [index, name] of [[2, "c"], [3, "d"]] as const) {
    const items = output.filter((s) => s.y < 155 && s.measure === index && s.glyph !== "barline");
    expect(items.map((s) => s.id)).toContain(name);
    expect(items.reduce((sum, s) => sum + musicalDuration(s, []), 0)).toBe(4);
  }
  expect(laidOut.settings?.measuresPerRow).toBe(4);
});

test("a barline cannot bisect a tuplet; ink-only splits do not generate rests", () => {
  const tupletPage = { ...page, tuplets: [{ id: "t", stampIds: ["c", "d"] }] };
  expect(insertNotebookBarline(tupletPage, settings, stamp("manual", 544, 102, "barline"))).toEqual({ error: "tuplet" });
  const result = insertNotebookBarline({ ...page, stamps: [] }, settings, stamp("manual", 544, 102, "barline"));
  expect(result.page?.completedRows).toBeUndefined();
});

test("removing either automatic neighbor keeps all other objects in their measures", () => {
  const regions = firstRow(page);
  for (const [index, wanted] of [[1, ["a", "c", "d", "e", "later"]], [2, ["a", "b", "e", "later"]]] as const) {
    const cut = deleteNotebookBar(page, settings, regions[index]);
    expect(cut.page.stamps?.map((s) => s.id)).toEqual(wanted);
    expect(firstRow(cut.page)).toHaveLength(3);
    expect(cut.page.stamps?.find((s) => s.id === "later")).toEqual(page.stamps?.at(-1));
  }
});

test("deleting a manual bar clips only the inside of a crossing stroke", () => {
  const result = insertNotebookBarline(page, settings, stamp("manual", 544, 102, "barline"));
  if (result.error) throw Error(result.error);
  const cut = deleteNotebookBar(result.page, settings, firstRow(result.page)[2]);
  expect(cut.crossesInk).toBe(true);
  expect(cut.page.strokes[0].points[0].x).toBe(544);
  expect(cut.page.strokes[0].points.at(-1)?.x).toBe(650);
  expect(cut.page.stamps?.some((s) => s.id === "c")).toBe(false);
  expect(cut.page.stamps?.some((s) => s.id === "d")).toBe(true);
  expect(firstRow(cut.page)).toHaveLength(4);
});

test("only newly wrapped boundaries trigger an ink warning", () => {
  const boundary = insertNotebookBarline(page, settings, stamp("manual", 544, 102, "barline"));
  if (boundary.error) throw Error(boundary.error);
  const regions = notebookSections(doc(boundary.page))[0];
  expect(notebookInkWraps(boundary.page, regions, 4, 3)).toBe(true);
  expect(notebookInkWraps(boundary.page, regions, 3, 3)).toBe(false);
  expect(notebookInkWraps(boundary.page, regions, 3, 4)).toBe(false);
  const touches = { ...page, strokes: [{ id: "touches", width: 2, points: [{ x: 510, y: 135 }, { x: 544, y: 135 }] }] };
  expect(notebookInkCrossesBoundary(touches, 0, 544)).toBe(false);
});
