import { eraseNotebookGesture } from "../lib/notebook-erasing";
import { erasedAt, paperErasures, strokeTouchesEraser } from "../lib/notebook-ink";
import { captureSelection, hitObject, paginateNotebook, transformSelection } from "../lib/notebook-editing";
import { materializeRows } from "../lib/staff-notebook-layout";
import { notebookBeaming } from "../lib/notebook-beaming";
import { notebookTupletSpans } from "../lib/notebook-tuplet-layout";
import { createNotebookPaperGesture } from "../lib/notebook-paper-gesture";
import type { StaffPage } from "../lib/staff-notebook";

const page = (): StaffPage => ({ id: "p", staffCount: 4,
  strokes: [{ id: "ink", points: [{ x: 100, y: 100 }, { x: 300, y: 100 }], color: "#2468c4", width: 6 }],
  stamps: [0, 1, 2].map((i) => ({ id: `n${i}`, glyph: "eighth", x: 400 + 60 * i, y: 110, size: 26 })),
  tuplets: [{ id: "triplet", stampIds: ["n0", "n1", "n2"] }] });

test("partial ink erasing keeps both sides, color, width and object identity; whole mode removes it", () => {
  const original = page(), before = JSON.stringify(original);
  const next = eraseNotebookGesture(original, [{ x: 200, y: 60 }, { x: 200, y: 140 }], "partial");
  expect(JSON.stringify(original)).toBe(before);
  expect(next.strokes[0]).toMatchObject({ id: "ink", width: 6, color: "#2468c4", points: original.strokes[0].points });
  expect(erasedAt(next.strokes[0], { x: 200, y: 100 })).toBe(true);
  expect(erasedAt(next.strokes[0], { x: 150, y: 100 })).toBe(false);
  expect(erasedAt(next.strokes[0], { x: 250, y: 100 })).toBe(false);
  expect(hitObject(next, { x: 200, y: 100 })).toBeNull();
  expect(hitObject(next, { x: 150, y: 100 })).toEqual({ kind: "stroke", id: "ink" });
  expect(eraseNotebookGesture(original, [{ x: 200, y: 100 }], "object").strokes).toEqual([]);
});

test("vector cuts retain notes, attached marks, tuplets and exactly the same derived beams", () => {
  const original = page();
  const beams = notebookBeaming(original);
  const next = eraseNotebookGesture(original, [{ x: 400, y: 110 }], "partial", 8);
  expect(next.stamps!.map((s) => s.id)).toEqual(original.stamps!.map((s) => s.id));
  expect(next.tuplets).toEqual(original.tuplets);
  expect(notebookBeaming(next)).toEqual(beams);
  expect(erasedAt(next.stamps![0], { x: 400, y: 110 })).toBe(true);
  expect(erasedAt(next.stamps![0], { x: 405, y: 90 })).toBe(false);
  expect(next.stamps![1]).toBe(original.stamps![1]);
  const beam = beams.groups[0].segments[0];
  const beamCut = eraseNotebookGesture(original, [{ x: (beam.x1 + beam.x2) / 2, y: (beam.y1 + beam.y2) / 2 }], "partial", 6);
  expect(beamCut.stamps!.filter((s) => s.erasures?.length).length).toBeGreaterThan(0);
  expect(notebookBeaming(beamCut)).toEqual(beams);
});

test("cuts travel through copy, clipboard, resize coordinates, row splitting and playback", () => {
  const original = eraseNotebookGesture(page(), [{ x: 200, y: 100 }], "partial");
  const chosen = { strokeIds: ["ink"], stampIds: [] };
  const copied = transformSelection(original, chosen, { x: 20, y: 155 }, true, () => "copy");
  expect(paperErasures(copied.page.strokes.at(-1)!)[0].points[0]).toEqual({ x: 220, y: 255 });
  const clip = captureSelection(original, chosen);
  expect(clip.strokes[0].color).toBe("#2468c4");
  expect(clip.strokes[0].erasures).toEqual(original.strokes[0].erasures);
  const cross = { id: "cross", strokes: [{ ...original.strokes[0], erasures: undefined, points: [{ x: 100, y: 140 }, { x: 300, y: 180 }] }] };
  const note = { id: "n", title: "", updatedAt: 0, pages: [cross] };
  const cutCross = eraseNotebookGesture(cross, [{ x: 200, y: 160 }], "partial");
  const split = paginateNotebook({ ...note, pages: [cutCross] }, 1, () => "new");
  expect(paperErasures(split.pages[1].strokes[0])[0].points[0].x).toBeCloseTo(200);
  expect(paperErasures(split.pages[1].strokes[0])[0].points[0].y).toBeCloseTo(5);
  const display = materializeRows({ ...note, pages: [cutCross] }, [{ pageIndex: 0, rowIndex: 1, id: "r" }]);
  expect(paperErasures(display.strokes[0])[0].points[0].x).toBeCloseTo(200);
  expect(paperErasures(display.strokes[0])[0].points[0].y).toBeCloseTo(5);
  const stamp = eraseNotebookGesture(page(), [{ x: 400, y: 110 }], "partial").stamps![0];
  const grown = { ...stamp, x: 500, size: 52 };
  expect(paperErasures(grown)[0].points[0]).toEqual({ x: 500, y: 110 });
  expect(paperErasures(grown)[0].width).toBe(44);
});

test("empty erasing does not create a changed page", () => {
  const p = page();
  expect(eraseNotebookGesture(p, [{ x: 800, y: 500 }], "partial")).toBe(p);
  expect(eraseNotebookGesture(p, [], "object")).toBe(p);
});
test("diagonal whole-object erasing preserves untouched ink inside the drag's bounding rectangle", () => {
  const p: StaffPage = { id: "p", strokes: [
    { id: "untouched", width: 6, points: [{ x: 110, y: 270 }, { x: 150, y: 280 }] },
    { id: "crossed", width: 6, points: [{ x: 180, y: 200 }, { x: 220, y: 200 }] },
  ] };
  const before = JSON.stringify(p);
  const diagonal = [{ x: 100, y: 100 }, { x: 300, y: 300 }];
  const next = eraseNotebookGesture(p, diagonal, "object", 22);
  expect(next.strokes.map((s) => s.id)).toEqual(["untouched"]);
  expect(JSON.stringify(p)).toBe(before);
  const partial = eraseNotebookGesture(p, diagonal, "partial", 22);
  expect(partial.strokes[0]).toBe(p.strokes[0]);
  expect(partial.strokes[1].erasures).toHaveLength(1);
});
test("swept ink hits include line thickness, taps, collinear overlaps and sparse crossing segments", () => {
  const stroke = { id: "s", width: 6, points: [{ x: 100, y: 100 }, { x: 300, y: 100 }] };
  expect(strokeTouchesEraser(stroke, [{ x: 200, y: 113 }], 22)).toBe(true);
  expect(strokeTouchesEraser(stroke, [{ x: 200, y: 115 }], 22)).toBe(false);
  expect(strokeTouchesEraser(stroke, [{ x: 150, y: 100 }, { x: 250, y: 100 }], 22)).toBe(true);
  expect(strokeTouchesEraser(stroke, [{ x: 150, y: 150 }, { x: 250, y: 150 }], 22)).toBe(false);
  expect(strokeTouchesEraser(stroke, [{ x: 200, y: 0 }, { x: 200, y: 200 }], 22)).toBe(true);
  expect(strokeTouchesEraser({ ...stroke, points: [{ x: 200, y: 100 }] }, [{ x: 200, y: 100 }], 22)).toBe(true);
  expect(strokeTouchesEraser({ ...stroke, points: [] }, [{ x: 200, y: 100 }], 22)).toBe(false);
});
test("touching a shared beam or tuplet bracket cannot delete its member notes in whole-object mode", () => {
  const p = page();
  p.stamps = p.stamps!.map((s, i) => ({ ...s, x: 100 + i * 250 }));
  const beams = notebookBeaming(p);
  const segment = beams.groups[0].segments[0];
  const beamPoint = { x: segment.x1 + (segment.x2 - segment.x1) / 4, y: segment.y1 + (segment.y2 - segment.y1) / 4 };
  expect(eraseNotebookGesture(p, [beamPoint], "object")).toBe(p);
  const partial = eraseNotebookGesture(p, [beamPoint], "partial");
  expect(partial.stamps!.some((s) => s.erasures?.length)).toBe(true);
  expect(partial.stamps!.map((s) => s.id)).toEqual(["n0", "n1", "n2"]);
  const middleStem = beams.stems.get("n1")!;
  const stemTouch = eraseNotebookGesture(p, [{ x: middleStem.stemX, y: middleStem.stemY }], "object");
  expect(stemTouch.stamps!.map((s) => s.id)).toEqual(["n0", "n2"]);
  const quarter = { ...p, stamps: p.stamps!.map((s) => ({ ...s, glyph: "quarter" })) };
  const span = notebookTupletSpans(quarter)[0];
  expect(eraseNotebookGesture(quarter, [{ x: 220, y: span.y }], "object")).toBe(quarter);
  const directlyTouched = eraseNotebookGesture(p, [{ x: 100, y: 110 }], "object");
  expect(directlyTouched.stamps!.map((s) => s.id)).toEqual(["n1", "n2"]);
  expect(directlyTouched.tuplets![0].stampIds).toEqual(["n1", "n2"]);
});

for (const label of ["pen", "erase", "select", "notes"]) {
  test(`${label}: adding a second finger cancels editing once and latches navigation until all lift`, () => {
    const edit = jest.fn(), pan = jest.fn();
    const gesture = createNotebookPaperGesture({ edit, pan });
    const one = [{ pageX: 100, pageY: 100 }], two = [...one, { pageX: 200, pageY: 100 }];
    gesture.update(one, { x: 100, y: 100 }, "start");
    gesture.update(one, { x: 110, y: 110 }, "move");
    gesture.update(two, { x: 110, y: 110 }, "move");
    gesture.update(two.map((p) => ({ pageX: p.pageX + 30, pageY: p.pageY - 20 })), { x: 140, y: 90 }, "move");
    gesture.update(one, { x: 140, y: 90 }, "move");
    gesture.update([], { x: 140, y: 90 }, "end");
    expect(edit.mock.calls.map((call) => call[1])).toEqual(["start", "move", "cancel"]);
    expect(pan).toHaveBeenCalledWith({ x: 30, y: -20 });
    gesture.update(one, { x: 100, y: 100 }, "start");
    gesture.update([], { x: 100, y: 100 }, "end");
    expect(edit.mock.calls.slice(-2).map((call) => call[1])).toEqual(["start", "end"]);
  });
}
test("two-finger start and interrupted navigation never send edit start/end", () => {
  const edit = jest.fn(), pan = jest.fn(), gesture = createNotebookPaperGesture({ edit, pan });
  gesture.update([{ pageX: 10, pageY: 20 }, { pageX: 30, pageY: 40 }], { x: 10, y: 20 }, "start");
  gesture.update([], { x: 0, y: 0 }, "cancel");
  expect(edit.mock.calls.map((call) => call[1])).toEqual(["cancel"]);
  expect(pan).not.toHaveBeenCalled();
});
