import { getSubdivisionCellLayout } from "@/lib/subdivision-cell-layout";

describe("getSubdivisionCellLayout", () => {
  test("caps scaled controls so a single subdivision stays compact on large displays", () => {
    const layout = getSubdivisionCellLayout({
      containerWidth: 700,
      cellCount: 1,
      preferredCellSize: 46,
      preferredGap: 6,
    });

    expect(layout.cellSize).toBe(30);
    expect(layout.gap).toBe(4);
    expect(layout.fontSize).toBe(11);
  });

  test("shrinks dense subdivision patterns to their measured width", () => {
    const layout = getSubdivisionCellLayout({
      containerWidth: 176,
      cellCount: 8,
      preferredCellSize: 28,
      preferredGap: 3,
    });

    expect(layout.cellSize).toBe(15);
    expect(layout.gap).toBe(3);
  });

  test("uses a safe compact fallback before layout is measured", () => {
    const layout = getSubdivisionCellLayout({
      containerWidth: 0,
      cellCount: 1,
      preferredCellSize: 28,
      preferredGap: 3,
    });

    expect(layout.cellSize).toBe(28);
    expect(layout.fontSize).toBe(11);
  });
});