import { getBeatStaffCellHeight, getBeatStaffRows } from "@/lib/beat-staff-logic";
import { computeScoreLayout } from "@/lib/score-layout";
import { getSubdivisionCellLayout } from "@/lib/subdivision-cell-layout";
import type { ScoreDocument } from "@/lib/score-types";

const BREAKPOINTS = [
  { name: "phone portrait", width: 320, height: 568 },
  { name: "phone portrait wide", width: 375, height: 667 },
  { name: "phone landscape", width: 667, height: 375 },
  { name: "tablet portrait", width: 768, height: 1024 },
  { name: "web", width: 1280, height: 800 },
] as const;

const emptyDocument: ScoreDocument = {
  id: "responsive-fixture",
  metadata: { title: "Responsive fixture", createdAt: 0, updatedAt: 0 },
  parts: [{
    id: "part-1",
    instrumentId: "piano",
    clef: "treble",
    measures: Array.from({ length: 8 }, (_, index) => ({ id: `m-${index}`, elements: [] })),
  }],
  keySignature: { sharps: 0 },
  timeSignature: { numerator: 4, denominator: 4 },
  bpm: 100,
};

describe("responsive breakpoint layout matrix", () => {
  test.each(BREAKPOINTS)("$name ($width x $height) stays within its viewport budget", ({
    width,
    height,
  }) => {
    const subdivision = getSubdivisionCellLayout({
      containerWidth: width - 32,
      cellCount: 9,
      preferredCellSize: 28,
      preferredGap: 3,
    });
    expect(subdivision.cellSize * 9 + subdivision.gap * 8 + 32).toBeLessThanOrEqual(width);

    const rows = getBeatStaffRows(8);
    const cellHeight = getBeatStaffCellHeight(width, height, rows.length);
    expect(cellHeight * rows.length + 8 * (rows.length - 1)).toBeLessThanOrEqual(
      height * (width > height ? 0.46 : 0.5) + 1,
    );

    const score = computeScoreLayout(emptyDocument, width);
    expect(score.rows.length).toBeGreaterThan(0);
    for (const row of score.rows) {
      expect(row.rowWidth).toBe(width);
      const rowContentWidth = row.measureWidths.reduce((sum, value) => sum + value, 0);
      expect(rowContentWidth).toBeGreaterThan(0);
      expect(rowContentWidth).toBeLessThanOrEqual(width);
    }
  });

  test("breakpoint classification is deterministic at the tablet and orientation boundaries", () => {
    expect(BREAKPOINTS.map(({ width, height }) => ({
      tablet: Math.min(width, height) >= 600,
      landscape: width > height,
    }))).toEqual([
      { tablet: false, landscape: false },
      { tablet: false, landscape: false },
      { tablet: false, landscape: true },
      { tablet: true, landscape: false },
      { tablet: true, landscape: true },
    ]);
  });
});