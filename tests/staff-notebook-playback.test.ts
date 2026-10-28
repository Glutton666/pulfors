import { test } from "node:test";
import assert from "node:assert/strict";
import { buildNotebookPlan, notebookPosition } from "../lib/notebook-playback-plan";
import { materializeRows, notebookRows, screenToPaper, stampPosition } from "../lib/staff-notebook-layout";
import type { NotebookSettings, StaffNotebook } from "../lib/staff-notebook";

const rows = Array.from({ length: 4 }, (_, i) => ({ pageIndex: 0, rowIndex: i, id: String(i) }));
const settings: NotebookSettings = { follow: true, lineUnit: "measure", playbackZoom: 1, bpm: 60, random: false, offsetX: 0, offsetY: 0, snap: true };

for (const bpm of [60, 120]) {
  for (const unit of [1, 4] as const) test(`4/4 at BPM ${bpm}, ${unit} measure(s) per paper row`, () => {
    const measureMs = 4 * 60000 / bpm;
    const plan = buildNotebookPlan(rows, [{ source: 0, startMs: 0, endMs: measureMs }], unit);
    assert.equal(plan.rowEnds[0], bpm === 60 ? unit === 1 ? 4000 : 16000 : unit === 1 ? 2000 : 8000);
    assert.equal(plan.durationMs, measureMs * unit * rows.length);
    assert.deepEqual(plan.rows, rows);
  });
}

test("simple 1/4 click uses one pulse per measure, not an implicit 4/4 meter", () => {
  assert.equal(buildNotebookPlan(rows, [{ source: 0, startMs: 0, endMs: 1000 }], 4).rowEnds[0], 4000);
});
test("variable Bar meter/tempo durations are accumulated, not replaced by fixed seconds", () => {
  const plan = buildNotebookPlan(rows, [
    { source: 0, startMs: 0, endMs: 1500 },
    { source: 0, startMs: 1500, endMs: 5500 },
  ], 1);
  assert.deepEqual(plan.rowEnds, [1500, 5500, 7000, 11000]);
  assert.deepEqual(notebookPosition(plan.rowEnds, 3500), { row: 1, progress: 0.5 });
});
test("random sheet and audio chunks use exactly the same precomputed order", () => {
  const original = JSON.stringify(rows);
  const plan = buildNotebookPlan(rows, [
    { source: 0, startMs: 0, endMs: 1000 },
    { source: 0, startMs: 1000, endMs: 3000 },
    { source: 0, startMs: 3000, endMs: 6000 },
    { source: 0, startMs: 6000, endMs: 10000 },
  ], 1, true, () => 0);
  assert.notDeepEqual(plan.rows, rows);
  plan.rows.forEach((row, i) => assert.equal(plan.chunks[i].startMs, [0, 1000, 3000, 6000][row.rowIndex]));
  assert.equal(JSON.stringify(rows), original);
});
test("four-measure phrases preserve their internal source order", () => {
  const bars = Array.from({ length: 16 }, (_, i) => ({ source: 0, startMs: i * 1000, endMs: (i + 1) * 1000 }));
  const plan = buildNotebookPlan(rows, bars, 4, true, () => 0);
  for (let i = 0; i < rows.length; i++) {
    assert.deepEqual(plan.chunks.slice(i * 4, i * 4 + 4).map((chunk) => chunk.startMs),
      Array.from({ length: 4 }, (_, j) => (plan.rows[i].rowIndex * 4 + j) * 1000));
  }
});
test("blocks crossing row boundaries remain adjacent and in source order", () => {
  const bars = Array.from({ length: 4 }, (_, i) => ({ source: 0, startMs: i * 1000, endMs: (i + 1) * 1000, group: i < 2 ? "block-A" : undefined }));
  const plan = buildNotebookPlan(rows, bars, 1, true, () => 0);
  const first = plan.rows.findIndex((row) => row.rowIndex === 0);
  assert.equal(plan.rows[first + 1].rowIndex, 1);
});
test("a partial final repeat block is refused rather than cut or silently reordered", () => {
  assert.throws(() => buildNotebookPlan(rows.slice(0, 3), [
    { source: 0, startMs: 0, endMs: 1000, group: "repeat" },
    { source: 0, startMs: 1000, endMs: 2000, group: "repeat" },
  ], 1, true), /INCOMPLETE_BLOCK/);
});
test("position handles exact row boundaries and the end without out-of-range indices", () => {
  assert.deepEqual(notebookPosition([4000, 8000], 4000), { row: 1, progress: 0 });
  assert.deepEqual(notebookPosition([4000, 8000], 9000), { row: 1, progress: 1 });
});
test("empty paper starts at first staff; new marks follow the last written part", () => {
  assert.deepEqual(stampPosition({ id: "p", strokes: [] }, settings), { x: 55, y: 102 });
  const p = { id: "p", strokes: [], stamps: [{ id: "old", glyph: "sharp", x: 55, y: 102, size: 26 }], anchor: { x: 400, y: 257 } };
  assert.deepEqual(stampPosition(p, settings), { x: 422, y: 257 });
  assert.deepEqual(stampPosition(p, { ...settings, snap: false, offsetX: 3, offsetY: 2 }), { x: 425, y: 259 });
});
test("screen transforms invert paper pan and scale without adding scroll a second time", () => {
  assert.deepEqual(screenToPaper({ x: 220, y: 420 }, { x: 20, y: 20 }, 2), { x: 100, y: 200 });
});
test("random playback moves ink and stamps together, across pages, without mutating originals", () => {
  const note: StaffNotebook = { id: "n", title: "original", updatedAt: 0, pages: [
    { id: "p1", staffCount: 1, strokes: [{ id: "ink", width: 2, points: [{ x: 60, y: 102 }] }], stamps: [{ id: "sign", glyph: "sharp", x: 90, y: 102, size: 26 }] },
    { id: "p2", staffCount: 1, strokes: [{ id: "ink2", width: 2, points: [{ x: 160, y: 102 }] }] },
  ] };
  const before = JSON.stringify(note);
  const flattened = notebookRows(note);
  const playback = materializeRows(note, [...flattened].reverse());
  assert.equal(playback.strokes[0].points[0].x, 160);
  assert.equal(playback.strokes[1].points[0].y, 257);
  assert.equal(playback.stamps![0].y, 257);
  assert.equal(JSON.stringify(note), before);
});
test("ink crossing a row boundary is clipped into its corresponding playback rows", () => {
  const note: StaffNotebook = { id: "n", title: "", updatedAt: 0, pages: [{
    id: "p", staffCount: 2, strokes: [{ id: "s", width: 2, points: [{ x: 100, y: 140 }, { x: 130, y: 170 }] }],
  }] };
  const view = materializeRows(note, notebookRows(note).reverse());
  assert.equal(view.strokes.length, 2);
  assert.deepEqual(view.strokes[0].points, [{ x: 115, y: 0 }, { x: 130, y: 15 }]);
  assert.deepEqual(view.strokes[1].points, [{ x: 100, y: 295 }, { x: 115, y: 310 }]);
});
