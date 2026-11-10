import { DEFAULT_NOTEBOOK_SETTINGS, type StaffNotebook, type StaffStamp } from "../lib/staff-notebook";
import { layoutNotebookMusic, musicalDuration, measuresInRow, notebookMeasureRegions, notationMeter, standardTupletRatio, writtenDuration } from "../lib/notebook-music-layout";
import { includeAttached, removeSelection, selectNotebookUnits, reorderNotebookRows, transformSelection, notebookWritingTail } from "../lib/notebook-editing";
import { randomizeNotebook } from "../lib/notebook-random";
import { ROW_HEIGHT } from "../lib/staff-notebook-layout";

const stamp = (id: string, glyph = "quarter", x = 80, y = 102): StaffStamp => ({ id, glyph, x, y, size: 26 });
const notebook = (stamps: StaffStamp[], settings: Partial<StaffNotebook["settings"]> = {}): StaffNotebook => ({
  id: "test", title: "Test", updatedAt: 1,
  settings: { ...DEFAULT_NOTEBOOK_SETTINGS, notationMeter: { beats: 4, unit: 4 }, measuresPerRow: 1, rowsPerPage: 3, autoSpacing: true, ...settings },
  pages: [{ id: "p", staffCount: 3, stamps, strokes: [] }],
});
const all = (n: StaffNotebook) => n.pages.flatMap((p) => p.stamps ?? []);
const user = (n: StaffNotebook) => all(n).filter((s) => !s.generated);

test("notation meter is independent of a loaded pattern and simple metronome", () => {
  const settings = { ...DEFAULT_NOTEBOOK_SETTINGS, beatsPerMeasure: 1, source: { beatsPerMeasure: 7 } as any };
  expect(notationMeter(settings)).toEqual({ beats: 4, unit: 4 });
  expect(measuresInRow({ ...settings, measuresPerRow: 5 })).toBe(5);
});
test("music overflow moves to subsequent rows without changing durations or ink", () => {
  const source = notebook(Array.from({ length: 9 }, (_, i) => stamp(`${i}`, "quarter", 80 + i * 30)));
  source.pages[0].strokes = [{ id: "ink", width: 2, points: [{ x: 100, y: 105 }] }];
  const saved = JSON.stringify(source);
  const result = layoutNotebookMusic(source);
  expect(result.reason).toBe("changed");
  expect(JSON.stringify(source)).toBe(saved);
  expect(user(result.note).map((s) => Math.floor(s.y / ROW_HEIGHT))).toEqual([0, 0, 0, 0, 1, 1, 1, 1, 2]);
  expect(user(result.note).map(writtenDuration)).toEqual(Array(9).fill(1));
  expect(result.note.pages[0].strokes).toEqual(source.pages[0].strokes);
});
test("single notes crossing bars split into tied values, conserving exact total", () => {
  const result = layoutNotebookMusic(notebook([stamp("q"), stamp("w", "whole", 170)]));
  const pieces = user(result.note).filter((s) => s.id === "w" || s.id.startsWith("w:split:"));
  expect(pieces.length).toBeGreaterThan(1);
  expect(pieces.reduce((sum, s) => sum + writtenDuration(s), 0)).toBe(4);
  expect(pieces[0].tieTo).toBe(pieces[1].id);
  expect(pieces.at(-1)!.tieTo).toBeUndefined();
});
test("the next authored object follows the final tied fragment even on another page", () => {
  const source = notebook([stamp("q"), stamp("w", "whole", 170)], { rowsPerPage: 1 });
  source.pages[0].staffCount = 1; source.pages[0].anchor = { x: 170, y: 102 };
  const result = layoutNotebookMusic(source).note;
  const tail = notebookWritingTail(result, 0)!;
  expect(tail.pageIndex).toBe(1);
  expect(tail.stamp.id).toMatch(/^w:split:/);
  expect(tail.stamp.tieFrom).toBe("w");
  expect(tail.stamp.tieTo).toBeUndefined();
});
test("an explicit tuplet is atomic across a bar boundary, including its rest", () => {
  const source = notebook([stamp("h", "half"), stamp("q", "quarter", 130),
    stamp("a", "quarter", 180), stamp("r", "rest-quarter", 230), stamp("b", "quarter", 280)]);
  source.pages[0].tuplets = [{ id: "t", stampIds: ["a", "r", "b"], ratio: { actual: 3, normal: 2 } }];
  const result = layoutNotebookMusic(source).note;
  const members = all(result).filter((s) => ["a", "r", "b"].includes(s.id));
  expect(new Set(members.map((s) => Math.floor(s.y / ROW_HEIGHT))).size).toBe(1);
  expect(members[0].y).toBeGreaterThan(ROW_HEIGHT);
  expect(members[1].x - members[0].x).toBeGreaterThan(30);
  expect(result.pages[0].tuplets).toEqual(source.pages[0].tuplets);
});
test("a tuplet longer than the measure is rejected, never time-compressed", () => {
  const source = notebook([stamp("a", "whole"), stamp("b", "whole", 180)]);
  source.pages[0].tuplets = [{ id: "t", stampIds: ["a", "b"], ratio: { actual: 2, normal: 3 } }];
  expect(() => layoutNotebookMusic(source)).toThrow("TUPLET_EXCEEDS_MEASURE");
});
test("explicit ratio applies to actual duration without changing written glyphs", () => {
  const members = [stamp("a", "eighth"), stamp("b", "eighth"), stamp("c", "eighth")];
  const group = { id: "t", stampIds: members.map((s) => s.id), ratio: { actual: 3, normal: 2 } };
  expect(members.reduce((sum, s) => sum + musicalDuration(s, [group]), 0)).toBe(1);
  expect(standardTupletRatio(5)).toEqual({ actual: 5, normal: 4 });
});
test("completed-row rests refresh without accumulating duplicates and disappear as filled", () => {
  const source = notebook([stamp("a")]); source.pages[0].completedRows = [0];
  const first = layoutNotebookMusic(source).note;
  const second = layoutNotebookMusic(first).note;
  expect(all(first).filter((s) => s.generated).reduce((sum, s) => sum + writtenDuration(s), 0)).toBe(3);
  expect(all(second).filter((s) => s.generated)).toEqual(all(first).filter((s) => s.generated));
  source.pages[0].stamps!.push(stamp("b", "quarter", 140));
  expect(all(layoutNotebookMusic(source).note).filter((s) => s.generated).reduce((sum, s) => sum + writtenDuration(s), 0)).toBe(2);
});
test("crowded result is transactional, while page-wide scale or explicit extra shrink can fit", () => {
  const source = notebook(Array.from({ length: 32 }, (_, i) => stamp(`${i}`, "thirty_second", 45 + i * 24)), { autoScale: true, minScale: .65 });
  const result = layoutNotebookMusic(source);
  expect(result.reason).toBe("crowded");
  expect(result.note).toBe(source);
  const accepted = layoutNotebookMusic(source, { allowCrowded: true });
  expect(accepted.note.pages[0].layoutScale).toBeLessThan(.65);
  expect(user(accepted.note).length).toBe(32);
  expect(user(accepted.note).reduce((sum, s) => sum + writtenDuration(s), 0)).toBe(4);
});
test("auto scale restores to 100% when the page has room", () => {
  const source = notebook([stamp("a")], { autoScale: true }); source.pages[0].layoutScale = .65;
  expect(layoutNotebookMusic(source).note.pages[0].layoutScale).toBe(1);
});
test("visual spill moves whole bars without changing meter, time ratios or the user's maximum bar count", () => {
  const source = notebook(Array.from({ length: 16 }, (_, i) => stamp(`${i}`, "sixteenth", 50 + i * 30)), { measuresPerRow: 2, autoScale: false });
  const result = layoutNotebookMusic(source, { spillVisual: true });
  expect(result.reason).toBe("changed");
  expect(result.note.settings!.measuresPerRow).toBe(2);
  expect(result.note.pages[0].measureCounts![0]).toBe(1);
  expect(user(result.note).map(writtenDuration)).toEqual(Array(16).fill(.25));
  expect(user(result.note).every((s) => Math.floor(s.y / ROW_HEIGHT) === 0)).toBe(true);
});
test("visual spill carries subsequent rows' ink, anchors and row metadata across a page boundary", () => {
  const source = notebook([
    ...Array.from({ length: 16 }, (_, i) => stamp(`dense${i}`, "sixteenth", 50 + i * 30)),
    stamp("after", "quarter", 100, 257),
  ], { measuresPerRow: 2, rowsPerPage: 2, autoScale: false });
  const ink = { id: "after-ink", width: 3, color: "#2468c4", points: [{ x: 100, y: 257 }, { x: 140, y: 264 }],
    erasures: [{ width: .2, points: [{ x: 0, y: 0 }] }] };
  source.pages[0] = { ...source.pages[0], staffCount: 2, strokes: [ink], completedRows: [1], anchor: { x: 140, y: 264 } };
  source.pages.push({ id: "second", staffCount: 2, strokes: [], stamps: [stamp("later", "quarter", 120, 257)], blankRows: [0], anchor: { x: 120, y: 257 } });
  source.lastNote = { pageId: "p", stampId: "after" };
  const before = JSON.stringify(source);
  const result = layoutNotebookMusic(source, { spillVisual: true });
  expect(result.reason).toBe("changed");
  expect(JSON.stringify(source)).toBe(before);
  expect(result.note.pages).toHaveLength(3);
  const afterPage = result.note.pages.find((p) => p.stamps?.some((s) => s.id === "after"))!;
  const after = afterPage.stamps!.find((s) => s.id === "after")!, movedInk = afterPage.strokes.find((s) => s.id === ink.id)!;
  expect(afterPage).toBe(result.note.pages[1]);
  expect(after.y).toBe(102);
  expect(movedInk.points).toEqual([{ x: 100, y: 102 }, { x: 140, y: 109 }]);
  expect(movedInk.erasures).toEqual(ink.erasures);
  expect(movedInk.color).toBe(ink.color);
  expect(afterPage.anchor).toEqual({ x: 140, y: 109 });
  expect(afterPage.completedRows).toContain(0);
  expect(afterPage.blankRows).toEqual([1]);
  expect(result.note.lastNote).toEqual({ pageId: afterPage.id, stampId: "after" });
  const laterPage = result.note.pages.find((p) => p.stamps?.some((s) => s.id === "later"))!;
  const later = laterPage.stamps!.find((s) => s.id === "later")!;
  expect(laterPage).toBe(result.note.pages[2]);
  expect(laterPage.anchor).toEqual({ x: later.x, y: later.y });
});
test("ink crossing a structurally inserted row is preserved as unique row fragments", () => {
  const source = notebook([
    stamp("before"),
    ...Array.from({ length: 16 }, (_, i) => stamp(`dense${i}`, "sixteenth", 50 + i * 30, 257)),
    stamp("after", "quarter", 100, 412),
  ], { measuresPerRow: 2, rowsPerPage: 2, autoScale: false });
  source.pages[0].strokes = [{ id: "crossing", width: 2, points: [{ x: 120, y: 300 }, { x: 140, y: 330 }] }];
  const result = layoutNotebookMusic(source, { spillVisual: true });
  expect(result.reason).toBe("changed");
  const fragments = result.note.pages.flatMap((p) => p.strokes);
  expect(fragments).toHaveLength(2);
  expect(new Set(fragments.map((s) => s.id)).size).toBe(2);
  expect(result.note.pages[0].strokes[0].points.at(-1)!.y).toBe(310);
  expect(result.note.pages[1].strokes[0].points[0].y).toBe(155);
  expect(result.note.pages[1].strokes[0].points.at(-1)!.y).toBe(175);
  expect(result.note.pages[1].stamps!.find((s) => s.id === "after")!.y).toBe(257);
});
test("repartitioning pages packs existing rows across old page boundaries and retains ink and ratios", () => {
  const source = notebook([stamp("a")]); source.pages[0].staffCount = 1;
  source.pages.push({ id: "p2", staffCount: 1, stamps: [stamp("b")], strokes: [{ id: "ink2", width: 2, points: [{ x: 100, y: 100 }] }] });
  const { paginateNotebook } = require("../lib/notebook-editing");
  const result = paginateNotebook(source, 2, () => "new-page");
  expect(result.pages).toHaveLength(1);
  expect(result.pages[0].stamps.map((s: StaffStamp) => s.y)).toEqual([102, 257]);
  expect(result.pages[0].strokes[0].points[0].y).toBe(255);
});
test("page overflow creates pages and keeps unique stamps and membership", () => {
  const source = notebook(Array.from({ length: 15 }, (_, i) => stamp(`${i}`, "quarter", 50 + i * 30)), { rowsPerPage: 1 });
  source.pages[0].staffCount = 1;
  const result = layoutNotebookMusic(source).note;
  expect(result.pages).toHaveLength(4);
  expect(new Set(user(result).map((s) => s.id)).size).toBe(15);
});
test("attachments stay owned and preserve relative geometry through reflow", () => {
  const source = notebook([stamp("a"), { ...stamp("sharp", "sharp", 60), attachTo: "a" }]);
  const result = layoutNotebookMusic(source).note;
  const a = all(result).find((s) => s.id === "a")!, b = all(result).find((s) => s.id === "sharp")!;
  expect(b.x - a.x).toBe(-20); expect(b.attachTo).toBe("a");
});
test("selecting part of a tuplet expands membership; internal deletion is explicitly different", () => {
  const source = notebook([stamp("a"), stamp("b", "eighth", 140), stamp("c", "rest-eighth", 200)]);
  source.pages[0].tuplets = [{ id: "t", stampIds: ["a", "b", "c"] }];
  const page = source.pages[0];
  expect(includeAttached(page, { stampIds: ["b"], strokeIds: [] }).stampIds).toEqual(["b", "a", "c"]);
  const edited = removeSelection(page, { stampIds: ["b"], strokeIds: [] }, false);
  expect(edited.tuplets![0].ratio).toEqual({ actual: 2, normal: 3 });
  expect(removeSelection(edited, { stampIds: ["a"], strokeIds: [] }, false).tuplets).toEqual([]);
});
test("row/measure selection is a contiguous range and includes intersecting whole ink", () => {
  const source = notebook([stamp("a"), stamp("b", "quarter", 600), stamp("c", "quarter", 100, 257)], { measuresPerRow: 2 });
  source.pages[0].strokes = [{ id: "cross", width: 2, points: [{ x: 400, y: 90 }, { x: 500, y: 90 }] }];
  const picked = selectNotebookUnits(source.pages[0], { x: 100, y: 100 }, { x: 600, y: 100 }, "measure", source.settings);
  expect(picked.stampIds.sort()).toEqual(["a", "b"]);
  expect(picked.strokeIds).toEqual(["cross"]);
  expect(selectNotebookUnits(source.pages[0], { x: 100, y: 100 }, { x: 100, y: 260 }, "row", source.settings).stampIds.sort()).toEqual(["a", "b", "c"]);
});
test("manual barlines define actual selection boundaries", () => {
  const source = notebook([stamp("bar", "barline", 300)], { measuresPerRow: 2 });
  expect(notebookMeasureRegions(source.pages[0], source.settings).filter((r) => r.row === 0).map((r) => [r.left, r.right])).toEqual([[38, 300], [300, 862]]);
});
test.each([true, false])("four measures stay consistent after adding, moving and deleting a manual bar (visible=%s)", (showBarlines) => {
  const source = notebook([{ ...stamp("before", "quarter", 80), measure: 0 }, stamp("bar", "barline", 300), { ...stamp("after", "quarter", 340), measure: 1 }],
    { measuresPerRow: 4, showBarlines });
  const { buildNotebookPlan } = require("../lib/notebook-playback-plan");
  const { notebookRows } = require("../lib/staff-notebook-layout");
  const check = (note: StaffNotebook, manualX?: number) => {
    const page = note.pages[0], regions = notebookMeasureRegions(page, note.settings).filter((r) => r.row === 0);
    expect(regions).toHaveLength(4);
    if (manualX !== undefined) expect(regions.some((r) => r.left === manualX)).toBe(true);
    const rows = notebookRows(note);
    const plan = buildNotebookPlan(rows, [{ source: 0, startMs: 0, endMs: 4000 }], 4, false, Math.random,
      rows.map((r: { pageIndex: number; rowIndex: number }) => note.pages[r.pageIndex].measureCounts?.[r.rowIndex] ?? measuresInRow(note.settings)));
    expect(plan.rowEnds[0]).toBe(16000);
    expect(plan.chunks.filter((c: { row: number }) => c.row === 0)).toHaveLength(regions.length);
    return regions;
  };
  check(source, 300);
  const laid = layoutNotebookMusic(source).note;
  check(laid, 300);
  expect(all(laid).find((s) => s.id === "after")!.measure).toBe(1);
  expect(selectNotebookUnits(laid.pages[0], { x: 320, y: 102 }, { x: 320, y: 102 }, "measure", laid.settings).stampIds).toContain("after");
  const moved = { ...laid, pages: laid.pages.map((p) => ({ ...p, stamps: p.stamps!.map((s) => s.id === "bar" ? { ...s, x: 500 } : s) })) };
  check(layoutNotebookMusic(moved).note, 500);
  const removed = { ...source, pages: source.pages.map((p) => ({ ...p, stamps: p.stamps!.filter((s) => s.id !== "bar") })) };
  expect(check(layoutNotebookMusic(removed).note).map((r) => r.left)).toEqual([38, 244, 450, 656]);
});
test("multiple manual pins replace distinct boundaries and preserve positions through repeated reflow", () => {
  const source = notebook([stamp("a", "barline", 280), stamp("b", "barline", 310)], { measuresPerRow: 4 });
  const first = layoutNotebookMusic(source).note;
  expect(notebookMeasureRegions(first.pages[0], first.settings).filter((r) => r.row === 0).map((r) => r.left)).toEqual([38, 280, 310, 586]);
  expect(layoutNotebookMusic(first).note.pages[0].stamps).toEqual(first.pages[0].stamps);
});
test("extra manual boundaries are rejected transactionally rather than changing the configured count", () => {
  const source = notebook([stamp("a", "barline", 250), stamp("b", "barline", 500)], { measuresPerRow: 2 });
  const before = JSON.stringify(source);
  expect(() => layoutNotebookMusic(source)).toThrow("MANUAL_BAR_LIMIT");
  expect(JSON.stringify(source)).toBe(before);
  expect(notebookMeasureRegions(source.pages[0], source.settings).filter((r) => r.row === 0)).toHaveLength(2);
});
test("measure randomization keeps all four packets when a row has a manual boundary", () => {
  const source = notebook([stamp("bar", "barline", 300),
    ...Array.from({ length: 4 }, (_, i) => stamp(`n${i}`, "quarter", [80, 340, 560, 760][i]))],
    { measuresPerRow: 4, random: true, randomUnit: "measure", randomSeed: 32 });
  const result = randomizeNotebook(layoutNotebookMusic(source).note);
  expect(all(result).filter((s) => /^n\d$/.test(s.id)).map((s) => s.id).sort()).toEqual(["n0", "n1", "n2", "n3"]);
  expect(notebookMeasureRegions(result.pages[0], result.settings).filter((r) => r.row === 0)).toHaveLength(4);
});
test("whole-row reorder preserves empty space and conditionally carries ink", () => {
  const source = notebook([stamp("a"), stamp("b", "quarter", 100, 412)]);
  source.pages[0].strokes = [{ id: "ink", width: 2, points: [{ x: 100, y: 100 }] }];
  const moved = reorderNotebookRows(source.pages[0], 0, 0, 2, true);
  expect(moved.stamps!.find((s) => s.id === "a")!.y).toBe(412);
  expect(moved.stamps!.find((s) => s.id === "b")!.y).toBe(257);
  expect(moved.strokes[0].points[0].y).toBe(410);
  expect(reorderNotebookRows(source.pages[0], 0, 0, 2, false).strokes).toBe(source.pages[0].strokes);
});
test("copy remaps ties and chord identity rather than linking back to original", () => {
  const source = notebook([{ ...stamp("a"), tieTo: "b", chordId: "old" }, { ...stamp("b", "quarter", 150), chordId: "old" }]);
  let i = 0;
  const copied = transformSelection(source.pages[0], { stampIds: ["a", "b"], strokeIds: [] }, { x: 100, y: 0 }, true, () => `new${++i}`);
  const fresh = copied.page.stamps!.filter((s) => copied.selection.stampIds.includes(s.id));
  expect(fresh[0].tieTo).toBe(fresh[1].id);
  expect(fresh[0].chordId).toBe(fresh[1].chordId);
  expect(fresh[0].chordId).not.toBe("old");
});
test("random order is stable for a seed, immutable, and independent of playback starts", () => {
  const source = notebook([stamp("a"), stamp("b", "quarter", 100, 257), stamp("c", "quarter", 100, 412)], { random: true, randomSeed: 71, randomUnit: "row" });
  const before = JSON.stringify(source);
  expect(randomizeNotebook(source)).toEqual(randomizeNotebook(source));
  expect(JSON.stringify(source)).toBe(before);
  expect(user(randomizeNotebook(source)).map((s) => s.id).sort()).toEqual(["a", "b", "c"]);
});
test("random OFF protects the sign span as one movable block", () => {
  const source = notebook([stamp("a"), stamp("start", "repeat_start", 60), stamp("b", "quarter", 100, 257), stamp("end", "repeat_end", 800, 257), stamp("c", "quarter", 100, 412)], { random: true, randomSeed: 28, randomSigns: false });
  const result = randomizeNotebook(source);
  const a = all(result).find((s) => s.id === "a")!, b = all(result).find((s) => s.id === "b")!;
  expect(b.y - a.y).toBe(155);
});
test("random ON moves signs separately but produces a valid repeat route", () => {
  const source = notebook([stamp("a"), stamp("start", "repeat_start", 60), stamp("b", "quarter", 100, 257), stamp("end", "repeat_end", 800, 257), stamp("c", "quarter", 100, 412)], { random: true, randomSeed: 45, randomSigns: true });
  const result = randomizeNotebook(source);
  expect(all(result).filter((s) => s.id === "start" || s.id === "end")).toHaveLength(2);
  expect(all(result).find((s) => s.id === "start")!.y).toBeLessThanOrEqual(all(result).find((s) => s.id === "end")!.y);
});
test("a fully protected score stays unchanged without inner shuffle; enabling it only permutes safe interiors", () => {
  const source = notebook(Array.from({ length: 5 }, (_, i) => stamp(`note${i}`, "quarter", 100, 102 + i * ROW_HEIGHT)),
    { rowsPerPage: 5, random: true, randomSeed: 42, randomSigns: false, randomInside: false });
  source.pages[0].staffCount = 5;
  source.pages[0].stamps!.push(stamp("start", "repeat_start", 55), stamp("end", "repeat_end", 800, 102 + 4 * ROW_HEIGHT));
  const off = randomizeNotebook(source);
  expect(all(off).filter((s) => s.id.startsWith("note")).map((s) => s.id)).toEqual(["note0", "note1", "note2", "note3", "note4"]);
  const inside = randomizeNotebook({ ...source, settings: { ...source.settings!, randomInside: true } });
  expect(all(inside).filter((s) => s.id.startsWith("note")).map((s) => s.id)).not.toEqual(["note0", "note1", "note2", "note3", "note4"]);
  expect(all(inside).find((s) => s.id === "start")!.y).toBe(102);
  expect(all(inside).find((s) => s.id === "end")!.y).toBe(102 + 4 * ROW_HEIGHT);
});
test("nested repeat intervals remain intact during safe interior shuffle", () => {
  const source = notebook(Array.from({ length: 6 }, (_, i) => stamp(`note${i}`, "quarter", 100, 102 + i * ROW_HEIGHT)),
    { rowsPerPage: 6, random: true, randomSeed: 42, randomSigns: false, randomInside: true });
  source.pages[0].staffCount = 6;
  source.pages[0].stamps!.push(stamp("outer-start", "repeat_start", 55), stamp("outer-end", "repeat_end", 800, 102 + 5 * ROW_HEIGHT),
    stamp("inner-start", "repeat_start", 55, 102 + ROW_HEIGHT), stamp("inner-end", "repeat_end", 800, 102 + 3 * ROW_HEIGHT));
  const result = randomizeNotebook(source);
  const start = all(result).find((s) => s.id === "inner-start")!, end = all(result).find((s) => s.id === "inner-end")!;
  expect(end.y - start.y).toBe(2 * ROW_HEIGHT);
});
test("randomization preserves ownership when the last written note moves to another page", () => {
  const source = notebook([stamp("a")], { random: true, randomSeed: 1, rowsPerPage: 1 });
  source.pages[0].staffCount = 1;
  source.pages.push({ id: "other-page", staffCount: 1, strokes: [], stamps: [stamp("b")] });
  source.lastNote = { pageId: "p", stampId: "a" };
  const result = randomizeNotebook(source);
  expect(result.pages.find((p) => p.id === result.lastNote!.pageId)!.stamps!.some((s) => s.id === "a")).toBe(true);
  expect(source.lastNote.pageId).toBe("p");
});
test("invalid navigation fails explicitly instead of quietly changing shuffle policy", () => {
  const source = notebook([stamp("bad", "dal_segno")], { random: true, randomSigns: true });
  expect(() => randomizeNotebook(source)).toThrow("Check navigation signs");
});
