import { spaceNotebookRow } from "../lib/notebook-spacing";
import { createStaffNotebook, saveStaffNotebook, listStaffNotebooks, type StaffPage } from "../lib/staff-notebook";
import { paperErasures } from "../lib/notebook-ink";
import { stampPosition } from "../lib/staff-notebook-layout";
import { DEFAULT_NOTEBOOK_SETTINGS } from "../lib/staff-notebook";

function fixture(): StaffPage {
  return {
    id: "p", staffCount: 7, anchor: { x: 290, y: 263 },
    strokes: [{ id: "ink", width: 3, color: "#2468c4", points: [{ x: 150, y: 260 }, { x: 400, y: 270 }] }],
    stamps: [
      { id: "outside", glyph: "quarter", x: 60, y: 102, size: 26 },
      { id: "b", glyph: "rest-eighth", x: 180, y: 262, size: 26 },
      { id: "a", glyph: "whole", x: 110, y: 257, size: 26, dotted: true, role: "ghost",
        erasures: [{ width: 0.2, points: [{ x: 0, y: 0 }] }] },
      { id: "mark", glyph: "sharp", x: 86, y: 257, size: 26, attachTo: "a" },
      { id: "c", glyph: "sixteenth", x: 290, y: 263, size: 26, role: "strong" },
      { id: "far-mark", glyph: "accent", x: 290, y: 145, size: 26, attachTo: "c" },
      { id: "repeat", glyph: "repeat_end", x: 410, y: 280, size: 26 },
    ],
    tuplets: [{ id: "t", stampIds: ["a", "b", "c"] }],
  };
}

test("only current writing row is equally spaced in x regardless of duration and original insertion order", () => {
  const original = fixture(), before = JSON.stringify(original);
  const { page, reason } = spaceNotebookRow(original);
  expect(reason).toBe("changed");
  expect(JSON.stringify(original)).toBe(before);
  const slots = ["a", "b", "c", "repeat"].map((id) => page.stamps!.find((s) => s.id === id)!);
  const gaps = slots.slice(1).map((s, i) => s.x - slots[i].x);
  gaps.forEach((gap) => expect(gap).toBeCloseTo(gaps[0]));
  page.stamps!.forEach((s, i) => expect({ ...s, x: original.stamps![i].x }).toEqual(original.stamps![i]));
  expect(page.stamps![0]).toBe(original.stamps![0]);
  expect(page.strokes).toBe(original.strokes);
  expect(page.tuplets).toBe(original.tuplets);
});

test("attachments even above row travel by parent dx; masks stay in local coordinates", () => {
  const original = fixture(), next = spaceNotebookRow(original).page;
  const a = next.stamps!.find((s) => s.id === "a")!;
  const mark = next.stamps!.find((s) => s.id === "mark")!;
  expect(mark.x - a.x).toBe(-24);
  expect(mark.y).toBe(257);
  const c = next.stamps!.find((s) => s.id === "c")!;
  expect(next.stamps!.find((s) => s.id === "far-mark")).toMatchObject({ x: c.x, y: 145, attachTo: "c" });
  expect(a.erasures).toBe(original.stamps![2].erasures);
  expect(paperErasures(a)[0].points[0]).toEqual({ x: a.x, y: a.y });
});

test("anchor moves with edited object, next placement continues there, repeated spacing makes no extra edit", () => {
  const original = fixture(), next = spaceNotebookRow(original).page;
  const c = next.stamps!.find((s) => s.id === "c")!;
  expect(next.anchor).toEqual({ x: c.x, y: c.y });
  expect(stampPosition(next, { ...DEFAULT_NOTEBOOK_SETTINGS, snap: false })).toEqual({ x: c.x + 22, y: c.y });
  expect(spaceNotebookRow(next)).toEqual({ page: next, reason: "unchanged" });
  expect(spaceNotebookRow(next).page).toBe(next);
});

test("empty/single-object row has no edit and no writing position starts with the first row", () => {
  for (const page of [
    { id: "empty", strokes: [] },
    { ...fixture(), anchor: { x: 55, y: 450 } },
    { id: "single", strokes: [], stamps: [{ id: "only", glyph: "whole", x: 55, y: 102, size: 26 }] },
  ] satisfies StaffPage[]) {
    expect(spaceNotebookRow(page)).toEqual({ page, reason: "unchanged" });
    expect(spaceNotebookRow(page).page).toBe(page);
  }
  const first: StaffPage = { id: "p", strokes: [], stamps: [
    { id: "a", glyph: "quarter", x: 90, y: 102, size: 26 },
    { id: "b", glyph: "quarter", x: 160, y: 102, size: 26 },
  ] };
  expect(spaceNotebookRow(first).reason).toBe("changed");
});

test("oversized/crowded row is explicitly refused without changing ink, objects, or row count", () => {
  const page: StaffPage = { id: "crowded", strokes: [], staffCount: 3, stamps: Array.from({ length: 35 }, (_, i) => ({
    id: `n${i}`, glyph: "thirty_second", x: 40 + i * 22, y: 102, size: 26,
  })) };
  expect(spaceNotebookRow(page)).toEqual({ page, reason: "crowded" });
  expect(spaceNotebookRow(page).page).toBe(page);
  const wide = { ...page, stamps: page.stamps!.slice(0, 2).map((s) => ({ ...s, size: 120, glyph: "dal_segno_coda" })) };
  expect(spaceNotebookRow(wide).reason).toBe("crowded");
});

test("large/dotted/attached groups fit horizontal inner bounds without overlap", () => {
  const page = fixture();
  page.stamps![4].size = 50;
  const next = spaceNotebookRow(page).page;
  const slots = ["a", "b", "c", "repeat"].map((id) => next.stamps!.find((s) => s.id === id)!);
  for (const s of next.stamps!.slice(1)) {
    expect(s.x - 28 * s.size / 26).toBeGreaterThanOrEqual(38 - 0.00001);
    expect(s.x + 28 * s.size / 26).toBeLessThanOrEqual(862 + 0.00001);
  }
  slots.slice(1).forEach((s, i) =>
    expect(s.x - slots[i].x).toBeGreaterThan(28 * (s.size + slots[i].size) / 26));
});

test("same-x objects get stable distinct slots; dangling attachments are retained", () => {
  const page: StaffPage = { id: "p", strokes: [], anchor: { x: 60, y: 102 }, stamps: [
    { id: "one", glyph: "eighth", x: 60, y: 102, size: 26 },
    { id: "two", glyph: "eighth", x: 60, y: 102, size: 26 },
    { id: "orphan", glyph: "sharp", x: 60, y: 102, size: 26, attachTo: "missing" },
  ] };
  const next = spaceNotebookRow(page).page;
  expect(next.stamps!.map((s) => s.id)).toEqual(["one", "two", "orphan"]);
  expect(next.stamps![0].x).toBeLessThan(next.stamps![1].x);
  expect(next.stamps![1].x).toBeLessThan(next.stamps![2].x);
  expect(next.stamps![2].attachTo).toBe("missing");
  expect(spaceNotebookRow(next).reason).toBe("unchanged");
});

test("corrected row saves and reopens with masks, tuplets, anchor and other rows intact", async () => {
  const note = createStaffNotebook("Spacing persistence");
  note.pages = [spaceNotebookRow(fixture()).page];
  await saveStaffNotebook(note);
  const reopened = (await listStaffNotebooks()).find((item) => item.id === note.id)!;
  expect(reopened.pages).toEqual(note.pages);
});
