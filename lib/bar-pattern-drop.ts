export type BarDropAreaLayout = {
  y: number;
  height: number;
};

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
  return beat >= 0 && beat < beatCount ? beat : null;
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