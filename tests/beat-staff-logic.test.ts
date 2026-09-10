import { addBeatStaffBeat, deleteBeatStaffBeat, findBeatStaffCellTarget, getBeatStaffCellHeight, getBeatStaffRows, nextBeatCountForStaffAdd } from "@/lib/beat-staff-logic";

describe("beat staff presentation logic", () => {
  test("lays out one to four in one row and five to eight in balanced rows", () => {
    expect(getBeatStaffRows(1)).toEqual([[0]]);
    expect(getBeatStaffRows(4)).toEqual([[0, 1, 2, 3]]);
    expect(getBeatStaffRows(5)).toEqual([[0, 1, 2, 3], [4]]);
    expect(getBeatStaffRows(7)).toEqual([[0, 1, 2, 3], [4, 5, 6]]);
    expect(getBeatStaffRows(8)).toEqual([[0, 1, 2, 3], [4, 5, 6, 7]]);
  });

  test("keeps existing 9-16 beat meters fully visible", () => {
    expect(getBeatStaffRows(10)).toEqual([[0, 1, 2, 3], [4, 5, 6, 7], [8, 9]]);
    expect(getBeatStaffRows(16)).toEqual([
      [0, 1, 2, 3],
      [4, 5, 6, 7],
      [8, 9, 10, 11],
      [12, 13, 14, 15],
    ]);
  });

  test("adds at eight and deletes with subdivision index shifting", () => {
    const added = addBeatStaffBeat(4, ["strong", "normal", "accent", "normal"], { "2": ["accent", "normal"] });
    expect(added.beatsPerMeasure).toBe(5);
    expect(added.beatTypes).toHaveLength(5);
    const deleted = deleteBeatStaffBeat(1, added.beatTypes, { "0": ["strong"], "2": ["accent"], "4": ["normal"] });
    expect(deleted.beatTypes).toEqual(["strong", "accent", "normal", "normal"]);
    expect(deleted.beatSubdivisions).toEqual({ "0": ["strong"], "1": ["accent"], "3": ["normal"] });
    expect(addBeatStaffBeat(8, [], {}).beatsPerMeasure).toBe(8);
  });

  test("never resets or truncates an existing meter at the staff add cap", () => {
    expect(nextBeatCountForStaffAdd(7)).toBe(8);
    expect(nextBeatCountForStaffAdd(8)).toBeNull();
    expect(nextBeatCountForStaffAdd(12)).toBeNull();
  });

  test("adds and deletes every editable meter size from one through eight", () => {
    for (let count = 1; count < 8; count += 1) {
      expect(nextBeatCountForStaffAdd(count)).toBe(count + 1);
    }
    for (let count = 2; count <= 8; count += 1) {
      const beatTypes = Array.from({ length: count }, (_, index) =>
        index === 0 ? "strong" as const : "normal" as const,
      );
      expect(deleteBeatStaffBeat(count - 1, beatTypes, {}).beatTypes).toHaveLength(count - 1);
    }
  });

  test("fits four rows inside the grid budget on a small landscape phone", () => {
    const cellHeight = getBeatStaffCellHeight(667, 320, 4);
    expect(cellHeight * 4 + 8 * 3).toBeLessThanOrEqual(320 * 0.46);
    expect(cellHeight).toBeGreaterThanOrEqual(30);
  });

  test("targets measured rectangular cells, including a refreshed rect map", () => {
    const rects = { 0: { x: 10, y: 20, w: 100, h: 60 }, 1: { x: 120, y: 20, w: 100, h: 60 } };
    expect(findBeatStaffCellTarget(150, 50, rects)).toBe(1);
    rects[1] = { x: 240, y: 90, w: 100, h: 60 };
    expect(findBeatStaffCellTarget(150, 50, rects)).toBeNull();
    expect(findBeatStaffCellTarget(250, 100, rects)).toBe(1);
  });
});