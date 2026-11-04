import { attachedPosition, captureSelection, hitObject, paginateNotebook, removeSelection, selectRectangle, selectionDelta, transformSelection } from "../lib/notebook-editing";
import { DEFAULT_NOTEBOOK_SETTINGS, type StaffNotebook, type StaffPage } from "../lib/staff-notebook";
import { constrainStaffPoint, snapStaffY, fitNotebookPage, ROW_HEIGHT, notebookRows, materializeRows } from "../lib/staff-notebook-layout";
import { buildNotebookPlan } from "../lib/notebook-playback-plan";

function page(): StaffPage {
  return { id: "p", staffCount: 4, strokes: [
    { id: "ink", width: 3, points: [{ x: 80, y: 90 }, { x: 160, y: 110 }] },
    { id: "unselected", width: 2, points: [{ x: 500, y: 300 }] }],
    stamps: [{ id: "n", glyph: "quarter", x: 140, y: 102, size: 26, role: "strong", dotted: true },
      { id: "r", glyph: "rest-eighth", x: 200, y: 102, size: 26 },
      { id: "a", glyph: "sharp", x: 119, y: 102, size: 26, attachTo: "n" }],
    tuplets: [{ id: "t", stampIds: ["n", "r"] }] };
}
let counter = 0;
const uid = () => `fresh${++counter}`;
const chosen = { strokeIds: ["ink"], stampIds: ["n", "r"] };

test("notehead vertical snapping preserves x, follows each staff and stays aligned at page edges", () => {
  const p = page();
  expect(constrainStaffPoint(p, { x: 123.7, y: 106 }, true)).toEqual({ x: 123.7, y: 108 });
  expect(constrainStaffPoint(p, { x: 123.7, y: 106 }, false)).toEqual({ x: 123.7, y: 106 });
  expect(constrainStaffPoint(p, { x: 123.7, y: 155 + 106 }, true)).toEqual({ x: 123.7, y: 155 + 108 });
  expect(constrainStaffPoint(p, { x: 123.7, y: 619 }, true).y).toBe(603);
  expect(snapStaffY(106, 4, 103, 107)).toBe(106); // no grid slot fits the allowed bounds
});

test("bounded mixed-note movement still snaps while preserving every relative offset", () => {
  const p = page();
  const delta = selectionDelta(p, chosen, { x: 19.25, y: 10000 }, true);
  const moved = transformSelection(p, chosen, delta).page;
  const note = moved.stamps!.find((s) => s.id === "n")!;
  const top = Math.floor(note.y / ROW_HEIGHT) * ROW_HEIGHT + 78;
  expect((note.y - top) % 6).toBe(0);
  expect(note.x).toBe(159.25);
  expect(moved.stamps!.find((s) => s.id === "a")!.y - note.y).toBe(0);
  expect(moved.strokes[0].points[0].y - note.y).toBe(-12);
});

test("rectangle selects crossing ink segments and individual mixed objects, not a whole page", () => {
  const selected = selectRectangle(page(), { x: 100, y: 60, width: 120, height: 80 });
  expect(selected.strokeIds).toEqual(["ink"]);
  expect(selected.stampIds.sort()).toEqual(["a", "n", "r"]);
  expect(hitObject(page(), { x: 500, y: 300 })).toEqual({ kind: "stroke", id: "unselected" });
  expect(hitObject(page(), { x: 140, y: 70 })).toEqual({ kind: "stamp", id: "n" });
  expect(hitObject(page(), { x: 139, y: 102 })).toEqual({ kind: "stamp", id: "n" });
  expect(hitObject(page(), { x: 119, y: 102 })).toEqual({ kind: "stamp", id: "a" });
});
test("rectangle intersection does not select a diagonal merely because its bounding box overlaps", () => {
  const p = { ...page(), stamps: [], strokes: [{ id: "s", width: 1, points: [{ x: 0, y: 0 }, { x: 100, y: 100 }] }] };
  expect(selectRectangle(p, { x: 0, y: 90, width: 10, height: 10 }).strokeIds).toEqual([]);
  expect(selectRectangle(p, { x: 40, y: 40, width: 10, height: 10 }).strokeIds).toEqual(["s"]);
});
test("move is immutable, preserves order/geometry and carries attached marks", () => {
  const original = page(), before = JSON.stringify(original);
  const moved = transformSelection(original, chosen, { x: 50, y: 12 }).page;
  expect(JSON.stringify(original)).toBe(before);
  expect(moved.stamps?.map((s) => s.id)).toEqual(["n", "r", "a"]);
  expect(moved.stamps?.[0]).toMatchObject({ x: 190, y: 114, role: "strong", dotted: true, size: 26 });
  expect(moved.stamps?.[2]).toMatchObject({ x: 169, y: 114, attachTo: "n" });
  expect(moved.strokes[0]).toEqual({ id: "ink", width: 3, points: [{ x: 130, y: 102 }, { x: 210, y: 122 }] });
  expect(moved.strokes[1]).toEqual(original.strokes[1]);
  expect(moved.tuplets).toEqual(original.tuplets);
});
test("copy gives fresh IDs to ink, stamps, attachment references and complete tuplets", () => {
  const original = page(), copied = transformSelection(original, chosen, { x: 200, y: 155 }, true, uid);
  expect(copied.page.strokes).toHaveLength(3);
  expect(copied.page.stamps).toHaveLength(6);
  expect(copied.page.stamps?.slice(0, 3)).toEqual(original.stamps);
  expect(new Set(copied.page.stamps?.map((s) => s.id)).size).toBe(6);
  const newNote = copied.page.stamps![3], newMark = copied.page.stamps![5];
  expect(newMark.attachTo).toBe(newNote.id);
  expect(copied.page.tuplets![1].stampIds).toEqual(copied.page.stamps!.slice(3, 5).map((s) => s.id));
  expect(copied.page.tuplets![1].id).not.toBe("t");
});
test("clipboard is an independent snapshot; a partial tuplet has no dangling bracket", () => {
  const original = page(), clipboard = captureSelection(original, chosen);
  const snapshot = JSON.stringify(clipboard);
  original.strokes[0].points[0].x = 999;
  original.stamps![0].size = 100;
  expect(JSON.stringify(clipboard)).toBe(snapshot);
  const partial = captureSelection(page(), { strokeIds: [], stampIds: ["r"] });
  expect(partial.tuplets).toEqual([]);
  expect(partial.stamps).toHaveLength(1);
});
test("deleting a note removes its attached marks and incomplete tuplet without affecting others", () => {
  const next = removeSelection(page(), { strokeIds: [], stampIds: ["n"] });
  expect(next.stamps?.map((s) => s.id)).toEqual(["r"]);
  expect(next.tuplets).toEqual([]);
  expect(next.strokes).toHaveLength(2);
});
test("snap changes only a shared vertical delta, preserves free x and never snaps ink-only selections", () => {
  const p = page();
  expect(selectionDelta(p, chosen, { x: 17, y: 8 }, true)).toEqual({ x: 17, y: 6 });
  expect(selectionDelta(p, chosen, { x: 17, y: 8 }, false)).toEqual({ x: 17, y: 8 });
  expect(selectionDelta(p, { strokeIds: ["ink"], stampIds: [] }, { x: 17, y: 8 }, true)).toEqual({ x: 17, y: 8 });
});
test("attached marks start at the last actual note, not a following rest or other mark", () => {
  const p = page();
  expect(attachedPosition(p, "sharp")).toEqual({ attachTo: "n", point: { x: 119.2, y: 102 } });
  expect(attachedPosition(p, "accent")?.point.y).toBeCloseTo(59.1);
  expect(attachedPosition(p, "repeat_end")).toBeNull();
  expect(attachedPosition({ id: "blank", strokes: [] }, "sharp")).toBeNull();
});
test("explicit page rows are not overwritten by a tall viewport or rotation", () => {
  const note: StaffNotebook = { id: "n", title: "", updatedAt: 0, settings: { ...DEFAULT_NOTEBOOK_SETTINGS, rowsPerPage: 2 }, pages: [{ id: "p", staffCount: 2, strokes: [] }] };
  expect(fitNotebookPage(note, 0, 15)).toBe(note);
});
test("reducing page rows re-paginates all old ink, stamps and groups without clipping at page edges", () => {
  const note: StaffNotebook = { id: "n", title: "", updatedAt: 0, settings: { ...DEFAULT_NOTEBOOK_SETTINGS }, pages: [page()] };
  note.pages[0].strokes.push({ id: "cross", width: 2, points: [{ x: 300, y: 300 }, { x: 320, y: 320 }] });
  const before = JSON.stringify(note), next = paginateNotebook(note, 2, uid);
  expect(JSON.stringify(note)).toBe(before);
  expect(next.settings?.rowsPerPage).toBe(2);
  expect(next.pages).toHaveLength(2);
  expect(next.pages.every((p) => p.staffCount === 2)).toBe(true);
  expect(next.pages.flatMap((p) => p.stamps ?? [])).toHaveLength(3);
  expect(next.pages[0].tuplets).toEqual(note.pages[0].tuplets);
  expect(next.pages[0].strokes.find((s) => s.id.startsWith("cross"))?.points.at(-1)).toEqual({ x: 310, y: 310 });
  expect(next.pages[1].strokes.find((s) => s.id.startsWith("cross"))?.points[0]).toEqual({ x: 310, y: 0 });
  expect(next.pages[1].strokes.find((s) => s.id.startsWith("cross"))?.points.at(-1)).toEqual({ x: 320, y: 10 });
});
test("page layout refuses to split a linked group rather than destroying references", () => {
  const p = page(); p.stamps![1].y = ROW_HEIGHT * 2 + 102;
  expect(() => paginateNotebook({ id: "n", title: "", updatedAt: 0, settings: { ...DEFAULT_NOTEBOOK_SETTINGS }, pages: [p] }, 2, uid)).toThrow(/tuplet/);
});
test("random sheets preserve multirow tuplets and display their complete membership", () => {
  const p = page(); p.stamps![1].y = ROW_HEIGHT + 102;
  const note: StaffNotebook = { id: "n", title: "", updatedAt: 0, pages: [p] };
  const rows = notebookRows(note);
  expect(rows[0].keepWithNext).toBe(true);
  const plan = buildNotebookPlan(rows, [{ source: 0, startMs: 0, endMs: 100 }], 1, true, () => 0);
  const index = plan.rows.findIndex((row) => row.rowIndex === 0);
  expect(plan.rows[index + 1].rowIndex).toBe(1);
  const display = materializeRows(note, plan.rows);
  expect(display.tuplets).toHaveLength(1);
  expect(display.tuplets![0].stampIds).toEqual([`${index}:n`, `${index + 1}:r`]);
});
