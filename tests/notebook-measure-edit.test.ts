import { DEFAULT_NOTEBOOK_SETTINGS, type StaffNotebook, type StaffStamp, saveStaffNotebook, listStaffNotebooks } from "../lib/staff-notebook";
import { prepareNotebookMeasureEdit } from "../lib/notebook-measure-edit";
import { layoutNotebookMusic, notebookMeasureRegions, writtenDuration } from "../lib/notebook-music-layout";
import { selectNotebookUnits, transformSelection } from "../lib/notebook-editing";
import { randomizeNotebook } from "../lib/notebook-random";
import { buildNotebookNotationPlan } from "../lib/notebook-playback-plan";

const stamp = (id: string, x: number, measure?: number, glyph = "quarter"): StaffStamp => ({ id, x, y: 102, measure, glyph, size: 26 });
const note = (autoSpacing = false): StaffNotebook => ({
  id: "ownership", title: "Ownership", updatedAt: 1,
  settings: { ...DEFAULT_NOTEBOOK_SETTINGS, measuresPerRow: 4, rowsPerPage: 1, autoSpacing },
  pages: [{ id: "p", staffCount: 1, strokes: [], stamps: [stamp("a", 150, 0), stamp("b", 330, 1), stamp("c", 550, 2), stamp("d", 760, 3)] }],
});
const stamps = (n: StaffNotebook) => n.pages.flatMap((p) => p.stamps ?? []);
const withStamps = (n: StaffNotebook, s: StaffStamp[]) => ({ ...n, pages: [{ ...n.pages[0], stamps: s }] });
const addBar = (n: StaffNotebook, x: number) => prepareNotebookMeasureEdit(n, withStamps(n, [...stamps(n), stamp("bar", x, undefined, "barline")]));

test.each([false, true])("moving a boundary refreshes effective membership while preserving note values (auto=%s)", (auto) => {
  const initial = note(auto), pinned = addBar(initial, 244);
  const moved = prepareNotebookMeasureEdit(pinned, withStamps(pinned, stamps(pinned).map((s) => s.id === "bar" ? { ...s, x: 500, measure: undefined } : s)));
  expect(stamps(moved).find((s) => s.id === "bar")).toMatchObject({ x: 500, measure: 1 });
  expect(stamps(moved).filter((s) => s.id !== "bar")).toEqual(stamps(initial).map((s, i) => ({ ...s, measure: i < 2 ? 0 : 1 })));
  const result = auto ? layoutNotebookMusic(moved).note : moved;
  expect(stamps(result).filter((s) => s.id !== "bar").map((s) => [s.id, s.measure, writtenDuration(s)])).toEqual([
    ["a", 0, 1], ["b", 0, 1], ["c", 1, 1], ["d", 1, 1],
  ]);
  if (!auto) {
    // Moving the boundary past b makes it part of the first effective measure.
    const picked = selectNotebookUnits(result.pages[0], { x: 530, y: 102 }, { x: 530, y: 102 }, "measure", result.settings);
    expect(picked.stampIds).not.toContain("b");
    expect(picked.stampIds).toContain("c");
    expect(picked.stampIds).not.toContain("a");
  }
  expect(buildNotebookNotationPlan(result, 4000).durationMs).toBe(8000);
  expect(result.pages[0].measureCounts?.[0] ?? result.settings!.measuresPerRow).toBe(4);
});
test("legacy measure metadata follows the new boundaries without changing coordinates or values", () => {
  const initial = withStamps(note(), stamps(note()).map((s) => ({ ...s, measure: undefined })));
  const before = JSON.stringify(initial), result = addBar(initial, 500);
  expect(JSON.stringify(initial)).toBe(before);
  expect(stamps(result).filter((s) => s.id !== "bar").map((s) => s.measure)).toEqual([0, 0, 1, 1]);
  expect(stamps(result).filter((s) => s.id !== "bar").map((s) => s.x)).toEqual([150, 330, 550, 760]);
});
test("moving a note across a manual boundary uses the same effective measure model", () => {
  const initial = addBar(note(), 244);
  const transformed = transformSelection(initial.pages[0], { stampIds: ["a"], strokeIds: [] }, { x: 400, y: 0 });
  const result = prepareNotebookMeasureEdit(initial, { ...initial, pages: [transformed.page] });
  expect(stamps(result).find((s) => s.id === "a")).toMatchObject({ x: 550, measure: 1 });
  expect(stamps(result).find((s) => s.id === "b")).toEqual(stamps(initial).find((s) => s.id === "b"));
});
test("deleting the last boundary restores configured ownership without changing coordinates or values", () => {
  const initial = addBar(note(), 500);
  const result = prepareNotebookMeasureEdit(initial, withStamps(initial, stamps(initial).filter((s) => s.id !== "bar")));
  expect(stamps(result)).toEqual(stamps(note()));
  expect(notebookMeasureRegions(result.pages[0], result.settings).map((r) => r.left)).toEqual([38, 244, 450, 656]);
  expect(buildNotebookNotationPlan(result, 4000).durationMs).toBe(16000);
});
test("auto OFF keeps overfull values intact; arranging later splits ties without changing total duration", () => {
  const initial = withStamps(note(), [stamp("q", 100, 0), stamp("whole", 180, 0, "whole")]);
  const saved = prepareNotebookMeasureEdit(initial, initial);
  expect(stamps(saved)).toEqual(stamps(initial));
  const laid = layoutNotebookMusic(saved).note;
  expect(stamps(laid).reduce((sum, s) => sum + writtenDuration(s), 0)).toBe(5);
  expect(stamps(laid).find((s) => s.id === "whole")!.tieTo).toBeDefined();
});
test("a manual line between notes is a real measure boundary", () => {
  const initial = withStamps(note(true), [stamp("a", 100, 0), stamp("b", 300, 0)]);
  const pinned = addBar(initial, 244), result = layoutNotebookMusic(pinned).note;
  expect(stamps(result).filter((s) => s.id !== "bar").map((s) => s.measure)).toEqual([0, 1]);
  expect(stamps(result).find((s) => s.id === "bar")!.measure).toBe(1);
});
test("effective measures survive save/reopen and randomization after a boundary moves", async () => {
  const initial = addBar(note(), 244);
  const moved = prepareNotebookMeasureEdit(initial, withStamps(initial, stamps(initial).map((s) => s.id === "bar" ? { ...s, x: 500 } : s)));
  await saveStaffNotebook(moved);
  const reopened = (await listStaffNotebooks()).find((n) => n.id === moved.id)!;
  expect(reopened).toBeDefined();
  expect(stamps(reopened).filter((s) => s.id !== "bar").map((s) => s.measure)).toEqual([0, 0, 1, 1]);
  expect(buildNotebookNotationPlan(reopened, 4000).durationMs).toBe(8000);
  const shuffled = randomizeNotebook({ ...reopened, settings: { ...reopened.settings!, random: true, randomUnit: "measure", randomSeed: 32 } });
  expect(stamps(shuffled).filter((s) => s.id !== "bar").map((s) => s.id).sort()).toEqual(["a", "b", "c", "d"]);
  expect(buildNotebookNotationPlan(shuffled, 4000).durationMs).toBe(8000);
});

test("editing never caps manual boundaries to the fallback count or moves the user's lines", () => {
  const initial = note(), input = withStamps(initial, [...stamps(initial),
    ...[200, 300, 400, 500].map((x, i) => stamp(`bar${i}`, x, undefined, "barline"))]);
  const before = JSON.stringify(input), result = prepareNotebookMeasureEdit(initial, input);
  expect(JSON.stringify(input)).toBe(before);
  expect(stamps(result).filter((s) => s.glyph === "barline").map((s) => s.x)).toEqual([200, 300, 400, 500]);
  expect(notebookMeasureRegions(result.pages[0], result.settings)).toHaveLength(5);
  expect(buildNotebookNotationPlan(result, 4000).durationMs).toBe(20000);
  expect(result.settings!.measuresPerRow).toBe(4);
});
