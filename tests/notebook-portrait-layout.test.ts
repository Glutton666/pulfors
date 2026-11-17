import { notebookPortraitPolicy, projectNotebookPortrait } from "../lib/notebook-portrait-layout";
import { naturalPaperWidth, notebookMeasureRegions } from "../lib/notebook-measures";
import { createNotebookPaperGesture } from "../lib/notebook-paper-gesture";
import type { StaffPage } from "../lib/staff-notebook";

const page = (): StaffPage => ({
  id: "page", staffCount: 2,
  stamps: Array.from({ length: 8 }, (_, i) => ({
    id: `note-${i}`, glyph: "quarter", x: 60 + i % 4 * 206, y: Math.floor(i / 4) * 155 + 102, size: 26,
  })),
  strokes: [{ id: "ink", width: 3, color: "#123456", points: [{ x: 100, y: 100 }, { x: 350, y: 100 }] }],
  tuplets: [{ id: "group", stampIds: ["note-0", "note-1"], ratio: { actual: 2, normal: 1 } }],
});

test("only phone portrait gets one bar at 100%, two at 50%, with a 50% lower limit", () => {
  expect(notebookPortraitPolicy(390, 844, 1)).toEqual({ portrait: true, zoom: 1, columns: 1 });
  expect(notebookPortraitPolicy(390, 844, 0.5)).toEqual({ portrait: true, zoom: 0.5, columns: 2 });
  expect(notebookPortraitPolicy(390, 844, 0.1).zoom).toBe(0.5);
  for (const [width, height] of [[844, 390], [768, 1024], [1024, 768]]) {
    expect(notebookPortraitPolicy(width, height, 0.35)).toEqual({ portrait: false, zoom: 0.35, columns: undefined });
  }
});

test.each([1, 2])("folding four source bars into %i-column rows never changes saved content or time", (columns) => {
  const source = page(), before = JSON.stringify(source);
  const view = projectNotebookPortrait(source, { measuresPerRow: 4 }, columns, columns === 2 ? 0.5 : 1);
  expect(view.page.staffCount).toBe(8 / columns);
  expect(view.page.measureCounts).toEqual(Array(8 / columns).fill(columns));
  expect(view.page.stamps!.map((s) => s.id)).toEqual(source.stamps!.map((s) => s.id));
  expect(view.page.tuplets).toEqual(source.tuplets);
  expect(notebookMeasureRegions(view.page, { measuresPerRow: 4 })).toHaveLength(8);
  expect(view.page.strokes).toHaveLength(2);
  expect([...view.strokeOwners.values()]).toEqual(["ink", "ink"]);
  for (const stamp of source.stamps!) {
    const back = view.inverse(view.forward(stamp));
    expect(back.x).toBeCloseTo(stamp.x);
    expect(back.y).toBeCloseTo(stamp.y);
  }
  expect(JSON.stringify(source)).toBe(before);
});

test("manual boundaries and partly erased handwriting survive a view fold", () => {
  const source = page();
  source.stamps!.push({ id: "manual", glyph: "barline", x: 300, y: 102, size: 26 });
  source.strokes[0].erasures = [{ width: 2, points: [{ x: 2, y: 0 }] }];
  const view = projectNotebookPortrait(source, { measuresPerRow: 4 }, 1);
  expect(view.page.staffCount).toBe(6); // two manual bars in row one, four automatic in row two.
  expect(view.page.stamps!.find((s) => s.id === "manual")).toBeDefined();
  expect(view.page.strokes.every((s) => s.erasures?.length === 1)).toBe(true);
  const note = source.stamps![1];
  expect(view.inverse(view.forward(note)).x).toBeCloseTo(note.x);
});

test("phone rendering keeps full-sized glyphs at 100% and round-trips touch coordinates with its readable scale", () => {
  const source = page(), paperScale = 390 / 900, boost = 1 / paperScale;
  const view = projectNotebookPortrait(source, { measuresPerRow: 4 }, 1, 1, boost);
  expect(26 * paperScale * boost).toBeCloseTo(26);
  expect(naturalPaperWidth(view.page) * paperScale * boost).toBeCloseTo(390);
  const half = projectNotebookPortrait(source, { measuresPerRow: 4 }, 2, 0.5, boost);
  expect(naturalPaperWidth(half.page) * paperScale * boost * 0.5).toBeCloseTo(390);
  for (const s of source.stamps!) {
    const doc = view.inverse(view.forward(s));
    expect(doc.x).toBeCloseTo(s.x);
    expect(doc.y).toBeCloseTo(s.y);
  }
});

test("pinching cancels ink once and stays navigation-only until all fingers leave", () => {
  const edit = jest.fn(), pan = jest.fn(), zoom = jest.fn();
  const gesture = createNotebookPaperGesture({ edit, pan, zoom });
  gesture.update([{ pageX: 0, pageY: 0 }], { x: 0, y: 0 }, "start");
  gesture.update([{ pageX: 0, pageY: 0 }, { pageX: 100, pageY: 0 }], { x: 0, y: 0 }, "move");
  gesture.update([{ pageX: 0, pageY: 0 }, { pageX: 150, pageY: 0 }], { x: 0, y: 0 }, "move");
  expect(zoom).toHaveBeenCalledWith(1.5);
  gesture.update([{ pageX: 0, pageY: 0 }], { x: 10, y: 10 }, "move");
  gesture.update([], { x: 10, y: 10 }, "end");
  expect(edit.mock.calls.map(([, phase]) => phase)).toEqual(["start", "cancel"]);
});
