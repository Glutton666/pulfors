import { clampNotebookDock, initialNotebookDock } from "../lib/notebook-floating-dock";

test("both bars start centered at independent top/bottom edges", () => {
  const bounds = { width: 768, height: 956 }, size = { width: 380, height: 50 };
  expect(initialNotebookDock(bounds, size, "top")).toEqual({ x: 194, y: 8 });
  expect(initialNotebookDock(bounds, size, "bottom")).toEqual({ x: 194, y: 898 });
});
test("dragging outside the workspace clamps the whole bar, not just its handle", () => {
  expect(clampNotebookDock({ x: -9999, y: 9999 }, { width: 768, height: 956 }, { width: 480, height: 128 }))
    .toEqual({ x: 8, y: 820 });
  expect(clampNotebookDock({ x: 9999, y: -9999 }, { width: 768, height: 956 }, { width: 380, height: 50 }))
    .toEqual({ x: 380, y: 8 });
});
test("resize and content-height changes reclamp a manually moved bar", () => {
  const bounds = { width: 320, height: 320 };
  expect(clampNotebookDock({ x: 700, y: 700 }, bounds, { width: 304, height: 128 }))
    .toEqual({ x: 8, y: 184 });
  expect(clampNotebookDock({ x: 8, y: 184 }, bounds, { width: 304, height: 160 }))
    .toEqual({ x: 8, y: 152 });
});
test("initial and transient unmeasured layouts never create negative positions", () => {
  for (const bounds of [{ width: 0, height: 0 }, { width: 240, height: 60 }]) {
    const result = initialNotebookDock(bounds, { width: 304, height: 128 }, "bottom");
    expect(result.x).toBeGreaterThanOrEqual(0);
    expect(result.y).toBeGreaterThanOrEqual(0);
  }
});
