export type BarDropAreaLayout = {
  y: number;
  height: number;
};

export type PatternDropAction =
  | "add-bar"
  | "apply-all"
  | "apply-one"
  | "clear-one"
  | "none";

export function getPatternDropAction(
  dragMode: "bar" | "beat" | null,
  target: number | null,
  patternLength: number,
): PatternDropAction {
  if (target === null) return "none";
  if (dragMode === "bar") return "add-bar";
  if (target === -1) return "apply-all";
  return patternLength > 0 ? "apply-one" : "clear-one";
}

export function getBarRowDropTarget(
  pageY: number,
  layout: BarDropAreaLayout,
  scrollY: number,
  rowHeight: number,
  beatCount: number,
): number | null {
  if (layout.height <= 0 || rowHeight <= 0) return null;

  const relativeY = pageY - layout.y;
  if (relativeY < -60 || relativeY > layout.height) return null;
  if (relativeY < 0) return -1;

  const beat = Math.floor((relativeY + Math.max(0, scrollY)) / rowHeight);
  // The Bar editor intentionally starts with an empty list. Treat any unused
  // space inside the measured list as a valid list-level drop zone so the
  // first bar (and bars dropped below the last row) can still be added.
  return beat >= 0 && beat < beatCount ? beat : -1;
}

export function getBarRowDropTargetFromElement(
  element: Element | null,
  beatCount: number,
): number | null {
  const row = element?.closest?.('[data-testid^="bar-row-"]');
  const testId = row?.getAttribute("data-testid");
  const match = testId?.match(/^bar-row-(\d+)$/);
  if (!match) return null;

  const beat = Number(match[1]);
  return Number.isInteger(beat) && beat >= 0 && beat < beatCount ? beat : null;
}