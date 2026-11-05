import { notebookBeaming, notebookMeter, notebookStampDuration } from "@/lib/notebook-beaming";
import { notebookTupletSpans } from "@/lib/notebook-tuplet-layout";
import type { StaffPage, StaffStamp } from "@/lib/staff-notebook";

const note = (glyph: string, index: number, patch: Partial<StaffStamp> = {}): StaffStamp =>
  ({ id: `n${index}`, glyph, x: 100 + 45 * index, y: 114, size: 26, ...patch });
const paper = (glyphs: string[]): StaffPage =>
  ({ id: "p", strokes: [], staffCount: 4, stamps: glyphs.map((glyph, index) => note(glyph, index)) });
const meter = (beats: number, unit: 2 | 4 | 8 | 16) => ({ notationMeter: { beats, unit } });
const hooks = (page: StaffPage, beats = 4, unit: 2 | 4 | 8 | 16 = 4) =>
  notebookBeaming(page, meter(beats, unit)).groups.flatMap((group) => group.segments.filter((segment) => segment.hook));

test("quarter units include dots and all rest durations without consuming markings", () => {
  expect(notebookStampDuration(note("eighth", 0, { dotted: true }))).toBe(0.75);
  expect(notebookStampDuration(note("rest-thirty_second", 0, { dotted: true }))).toBe(0.1875);
  expect(notebookStampDuration(note("sharp", 0))).toBe(0);
});

test("eight eighths in 4/4 become four pairs, not a single proximity-based beam", () => {
  const p = paper(Array(8).fill("eighth"));
  const before = JSON.stringify(p);
  const result = notebookBeaming(p, meter(4, 4));
  expect(result.groups.map((group) => group.noteIds)).toEqual([
    ["n0", "n1"], ["n2", "n3"], ["n4", "n5"], ["n6", "n7"],
  ]);
  expect(result.stems.size).toBe(8);
  expect(JSON.stringify(p)).toBe(before);
});

test("four sixteenths share two complete beams; thirty-seconds add divided third beams", () => {
  const sixteenths = notebookBeaming(paper(Array(4).fill("sixteenth")), meter(4, 4));
  expect(sixteenths.groups).toHaveLength(1);
  expect(sixteenths.groups[0].segments.map((segment) => [segment.level, segment.hook])).toEqual([[1, false], [2, false]]);
  const tiny = notebookBeaming(paper(Array(8).fill("thirty_second")), meter(4, 4)).groups[0];
  expect(tiny.segments.filter((segment) => segment.level === 3)).toHaveLength(2);
});

test("compound 6/8 and 9/8 group eighths in threes, 3/4 keeps pairs", () => {
  for (const count of [6, 9]) {
    expect(notebookBeaming(paper(Array(count).fill("eighth")), meter(count, 8)).groups.map((g) => g.noteIds.length))
      .toEqual(Array(count / 3).fill(3));
  }
  expect(notebookBeaming(paper(Array(6).fill("eighth")), meter(3, 4)).groups.map((g) => g.noteIds.length)).toEqual([2, 2, 2]);
});

test("compound secondary beams respect the written eighth subdivisions", () => {
  const group = notebookBeaming(paper(Array(6).fill("sixteenth")), meter(6, 8)).groups[0];
  expect(group.noteIds).toHaveLength(6);
  expect(group.segments.filter((segment) => segment.level === 2)).toHaveLength(3);
});

test("isolated secondary beams point toward their metrical subdivision, not nearest x", () => {
  const left = paper(["eighth", "sixteenth", "eighth"]);
  left.stamps![0].dotted = true;
  left.stamps![1].x = 180; left.stamps![2].x = 200;
  const beam = notebookBeaming(left, meter(6, 8));
  const stem = beam.stems.get("n1")!;
  expect(hooks(left, 6, 8)[0].x2).toBe(stem.stemX);
  expect(hooks(left, 6, 8)[0].x1).toBeLessThan(stem.stemX);

  const right = paper(["sixteenth", "eighth"]);
  right.stamps![1].dotted = true;
  const rightStem = notebookBeaming(right).stems.get("n0")!;
  expect(hooks(right)[0].x1).toBe(rightStem.stemX);
  expect(hooks(right)[0].x2).toBeGreaterThan(rightStem.stemX);
});

test("third-level hook distinguishes dotted sixteenth before and after a thirty-second", () => {
  const before = paper(["sixteenth", "thirty_second", "eighth"]);
  before.stamps![0].dotted = true;
  const b = notebookBeaming(before);
  expect(hooks(before).find((segment) => segment.level === 3)!.x2).toBe(b.stems.get("n1")!.stemX);
  const after = paper(["eighth", "thirty_second", "sixteenth"]);
  after.stamps![2].dotted = true;
  const a = notebookBeaming(after);
  expect(hooks(after).find((segment) => segment.level === 3)!.x1).toBe(a.stems.get("n1")!.stemX);
});

test("rests advance the beat and break beams; long values remain independent", () => {
  const p = paper(["eighth", "rest-eighth", "eighth", "eighth", "quarter", "eighth", "eighth"]);
  expect(notebookBeaming(p).groups.map((g) => g.noteIds)).toEqual([["n2", "n3"], ["n5", "n6"]]);
  expect(notebookBeaming(paper(["whole", "half", "quarter"])).stems.size).toBe(0);
});

test("marks and drawing do not affect timing, but moving note order recalculates beams", () => {
  const p = paper(["eighth", "eighth", "eighth", "eighth"]);
  p.stamps!.push(note("sharp", 10, { x: 120, attachTo: "n0" }));
  expect(notebookBeaming(p).groups.map((g) => g.noteIds)).toEqual([["n0", "n1"], ["n2", "n3"]]);
  p.stamps![0].x = 190;
  expect(notebookBeaming(p).groups.map((g) => g.noteIds)).toEqual([["n1", "n0"], ["n2", "n3"]]);
  p.stamps![0].glyph = "quarter";
  expect(notebookBeaming(p).stems.has("n0")).toBe(false);
});

test("row changes reset the meter and never draw diagonal connections between rows", () => {
  const p = paper(Array(4).fill("eighth"));
  p.stamps![2].x = 100; p.stamps![3].x = 145;
  p.stamps![2].y += 155; p.stamps![3].y += 155;
  expect(notebookBeaming(p).groups.map((g) => [g.row, g.noteIds])).toEqual([[0, ["n0", "n1"]], [1, ["n2", "n3"]]]);
});

test("overlapping heads remain separate instead of getting vertical or reversed beams", () => {
  const p = paper(["eighth", "eighth"]);
  p.stamps![1].x = p.stamps![0].x;
  expect(notebookBeaming(p).groups).toHaveLength(0);
});

test("beam direction and slope follow pitch without shortening any stem", () => {
  for (const down of [false, true]) {
    const p = paper(Array(4).fill("sixteenth"));
    p.stamps!.forEach((stamp, i) => { stamp.y = down ? 90 - i * 9 : 110 + i * 9; });
    const group = notebookBeaming(p).groups[0];
    expect(group.direction).toBe(down ? "down" : "up");
    expect(Math.abs(group.slope * (group.stems[3].stemX - group.stems[0].stemX))).toBeLessThanOrEqual(12.001);
    for (const stem of group.stems) {
      expect(Math.abs(stem.stemY - stem.headY)).toBeGreaterThanOrEqual(41.99);
      expect(stem.stemY).toBeCloseTo(group.anchorY + group.slope * (stem.stemX - group.anchorX));
    }
  }
});

test("closed tuplets form their own beams with number-only labels; normal notes stay outside", () => {
  const p = paper(Array(6).fill("eighth"));
  p.tuplets = [{ id: "t", stampIds: ["n0", "n1", "n2"] }];
  const b = notebookBeaming(p);
  expect(b.groups[0].noteIds).toEqual(["n0", "n1", "n2"]);
  expect(b.groups[0].noteIds).not.toContain("n3");
  expect(notebookTupletSpans(p, undefined, b)[0]).toMatchObject({ count: 3, numberOnly: true, below: false });
  const up = b.groups[0];
  expect(notebookTupletSpans(p, undefined, b)[0].y).toBeLessThan(Math.min(...up.stems.map((s) => s.stemY)));
});

test("down-beamed tuplets put the number below the beam, not on top of heads", () => {
  const p = paper(Array(3).fill("eighth"));
  p.stamps!.forEach((stamp) => { stamp.y = 90; });
  p.tuplets = [{ id: "t", stampIds: ["n0", "n1", "n2"] }];
  const b = notebookBeaming(p);
  const span = notebookTupletSpans(p, undefined, b)[0];
  expect(span).toMatchObject({ below: true, numberOnly: true });
  expect(span.y).toBeGreaterThan(Math.max(...b.groups[0].stems.map((s) => s.stemY)));
});

test("triplet and quintuplet engraving ends at its usual span before ordinary notes resume", () => {
  for (const count of [3, 5, 6]) {
    const p = paper(Array(count + 2).fill(count === 3 ? "eighth" : "sixteenth"));
    p.stamps![count].glyph = "eighth";
    p.stamps![count + 1].glyph = "eighth";
    p.tuplets = [{ id: "t", stampIds: p.stamps!.slice(0, count).map((stamp) => stamp.id) }];
    const before = JSON.stringify(p);
    const groups = notebookBeaming(p).groups;
    expect(groups.map((group) => group.noteIds.length)).toEqual([count, 2]);
    expect(JSON.stringify(p)).toBe(before);
  }
});

test("rests, long values, cross-row fragments and open tuplets retain visible brackets", () => {
  for (const glyphs of [["eighth", "rest-eighth", "eighth"], ["quarter", "quarter", "quarter"]]) {
    const p = paper(glyphs);
    p.tuplets = [{ id: "t", stampIds: ["n0", "n1", "n2"] }];
    expect(notebookTupletSpans(p, undefined, notebookBeaming(p))[0].numberOnly).toBe(false);
  }
  const p = paper(Array(3).fill("eighth"));
  expect(notebookTupletSpans(p, ["n0", "n1", "n2"], notebookBeaming(p, undefined, ["n0", "n1", "n2"]))[0])
    .toMatchObject({ open: true, numberOnly: false });
});

test("empty pages are safe and legacy settings fall back to the playback source meter", () => {
  expect(notebookBeaming(paper([])).groups).toEqual([]);
  expect(notebookMeter()).toEqual({ beats: 4, unit: 4 });
  expect(notebookMeter({ beatsPerMeasure: 3 })).toEqual({ beats: 3, unit: 4 });
  expect(notebookMeter({ source: { beatsPerMeasure: 6 } as any })).toEqual({ beats: 6, unit: 4 });
  expect(notebookMeter({ beatsPerMeasure: 3, ...meter(6, 8) })).toEqual({ beats: 6, unit: 8 });
});
