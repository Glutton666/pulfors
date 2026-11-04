import { followNotebookSigns } from "../lib/notebook-navigation";
import { buildNotebookPlan, notebookPosition } from "../lib/notebook-playback-plan";
import { notebookRows, ROW_HEIGHT } from "../lib/staff-notebook-layout";
import { type StaffNotebook, DEFAULT_NOTEBOOK_SETTINGS } from "../lib/staff-notebook";

function fixture(signs: Array<[number, string]>, count = 6, phrase = false) {
  const note: StaffNotebook = { id: "n", title: "", updatedAt: 0, settings: { ...DEFAULT_NOTEBOOK_SETTINGS }, pages: [{
    id: "p", staffCount: count, strokes: [], stamps: signs.map(([unit, glyph], i) => ({
      id: `sign${i}`, glyph, x: phrase ? 38 + (unit % 4 + 0.5) * 206 : 400,
      y: Math.floor(unit / (phrase ? 4 : 1)) * ROW_HEIGHT + 102, size: 26,
    })),
  }] };
  const perRow = phrase ? 4 : 1;
  const bars = Array.from({ length: count * perRow }, (_, i) => ({ source: 0, startMs: i * 100, endMs: (i + 1) * 100 }));
  const base = buildNotebookPlan(notebookRows(note), bars, perRow);
  return { note, base, perRow: perRow as 1 | 4 };
}
const order = (plan: ReturnType<typeof followNotebookSigns>) => plan.chunks.map((c) => c.startMs / 100);
test("repeat returns vertically to original rows; source audio and presentation use the same visits", () => {
  const { note, base } = fixture([[1, "repeat_start"], [3, "repeat_end"]]);
  const original = JSON.stringify(note), plan = followNotebookSigns(note, base, 1);
  expect(order(plan)).toEqual([0, 1, 2, 3, 1, 2, 3, 4, 5]);
  expect(plan.positionRows).toEqual(order(plan));
  expect(plan.rows).toEqual(base.rows);
  expect(notebookPosition(plan.rowEnds, 400, plan.positionRows).row).toBe(1);
  expect(JSON.stringify(note)).toBe(original);
});
test("a repeat end without a start returns to the document beginning", () => {
  const { note, base } = fixture([[1, "repeat_end"]], 3);
  expect(order(followNotebookSigns(note, base, 1))).toEqual([0, 1, 0, 1, 2]);
});
test("first and second endings use the same repeat pass, skipping the first ending on return", () => {
  const { note, base } = fixture([[0, "repeat_start"], [2, "volta1"], [3, "repeat_end"], [4, "volta2"]]);
  expect(order(followNotebookSigns(note, base, 1))).toEqual([0, 1, 2, 3, 0, 1, 4, 5]);
});
test("D.C. returns once, ignores repeats on the return and stops at Fine", () => {
  const { note, base } = fixture([[1, "repeat_end"], [2, "fine"], [4, "da_capo"]]);
  expect(order(followNotebookSigns(note, base, 1))).toEqual([0, 1, 0, 1, 2, 3, 4, 0, 1, 2]);
});
test("D.S. targets Segno rather than page zero", () => {
  const { note, base } = fixture([[1, "segno"], [2, "fine"], [4, "dal_segno"]]);
  expect(order(followNotebookSigns(note, base, 1))).toEqual([0, 1, 2, 3, 4, 1, 2]);
});
test.each(["dal_segno_coda", "da_capo_coda"])("%s follows the second-pass Coda route", (glyph) => {
  const { note, base } = fixture([[0, "segno"], [1, "coda"], [3, glyph], [4, "coda"], [5, "fine"]]);
  expect(order(followNotebookSigns(note, base, 1))).toEqual([0, 1, 2, 3, 0, 1, 4, 5]);
});
test("phrase mode resolves four measures within a line without horizontal tracking", () => {
  const { note, base } = fixture([[0, "repeat_start"], [1, "repeat_end"]], 2, true);
  const plan = followNotebookSigns(note, base, 4);
  expect(order(plan)).toEqual([0, 1, 0, 1, 2, 3, 4, 5, 6, 7]);
  expect(plan.positionRows).toEqual([0, 0, 0, 0, 0, 0, 1, 1, 1, 1]);
});
test("random prepares closed repeated sections on paper and uses that order for sound", () => {
  const { note, base } = fixture([[1, "repeat_start"], [2, "repeat_end"]]);
  const plan = followNotebookSigns(note, base, 1, true, () => 0);
  expect(plan.rows.map((r) => r.rowIndex)).toEqual(order(plan));
  expect(plan.positionRows).toEqual(order(plan).map((_, i) => i));
  const at = order(plan).indexOf(1);
  expect(order(plan).slice(at, at + 4)).toEqual([1, 2, 1, 2]);
});
test("random phrase mode prints a row once per visit, not once per measure", () => {
  const { note, base } = fixture([], 3, true);
  const plan = followNotebookSigns(note, base, 4, true, () => 0);
  expect(plan.rows).toHaveLength(3);
  expect(plan.chunks).toHaveLength(12);
  expect(plan.positionRows).toEqual([0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2]);
});
test.each([
  [[1, "dal_segno"]],
  [[1, "repeat_start"]],
  [[1, "volta1"]],
  [[1, "da_capo_coda"], [2, "coda"]],
  [[1, "repeat_start"], [1, "repeat_start"]],
] as Array<Array<[number, string]>>) ("invalid or ambiguous signs refuse playback with an actionable message", (...signs) => {
  const { note, base } = fixture(signs as Array<[number, string]>);
  expect(() => followNotebookSigns(note, base, 1)).toThrow(/Check navigation signs/);
});
test("ordinary marks never become navigation commands", () => {
  const { note, base } = fixture([[0, "accent"], [1, "sharp"], [2, "fermata"]]);
  expect(order(followNotebookSigns(note, base, 1))).toEqual([0, 1, 2, 3, 4, 5]);
});
