export type DockPoint = { x: number; y: number };
export type DockSize = { width: number; height: number };

/** Positions are workspace-local, independent of paper zoom/pan/scroll. */
export function clampNotebookDock(point: DockPoint, bounds: DockSize, size: DockSize): DockPoint {
  const margin = 8;
  const limit = (value: number, available: number, length: number) => {
    const low = Math.min(margin, Math.max(0, (available - length) / 2));
    return Math.max(low, Math.min(Math.max(low, available - length - margin), value));
  };
  return { x: limit(point.x, bounds.width, size.width), y: limit(point.y, bounds.height, size.height) };
}

export function initialNotebookDock(bounds: DockSize, size: DockSize, edge: "top" | "bottom"): DockPoint {
  return clampNotebookDock({ x: (bounds.width - size.width) / 2,
    y: edge === "top" ? 8 : bounds.height - size.height - 8 }, bounds, size);
}
