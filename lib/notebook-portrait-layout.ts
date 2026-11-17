import type { NotebookSettings, StaffPage, StaffPoint } from "./staff-notebook";
import { PAPER_WIDTH, ROW_HEIGHT, rowAt } from "./staff-notebook-layout";
import { NOTEBOOK_LEFT, NOTEBOOK_SPAN, notebookMeasureRegions } from "./notebook-measures";

/** A view projection only: resizing never rewrites the saved score or its meter. */
export function notebookPortraitPolicy(width: number, height: number, requestedZoom: number) {
  const portrait = width > 0 && width < 600 && height > width;
  const zoom = Math.max(portrait ? 0.5 : 0.35, Math.min(2.5, requestedZoom));
  return { portrait, zoom, columns: portrait ? Math.min(2, Math.max(1, Math.floor(1 / zoom + 1e-7))) : undefined };
}

export function projectNotebookPortrait(page: StaffPage, settings: Partial<NotebookSettings>, columns: number, zoom = 1, boost = 1) {
  const regions = notebookMeasureRegions(page, settings);
  const byRow = new Map<number, { region: (typeof regions)[number]; index: number }[]>();
  regions.forEach((region, index) => {
    const group = byRow.get(region.row) ?? [];
    group.push({ region, index }); byRow.set(region.row, group);
  });
  const count = Math.max(1, Math.min(2, columns));
  const span = PAPER_WIDTH / (Math.min(1, zoom) * boost) - NOTEBOOK_LEFT * 2;
  const cellWidth = span / count;
  const rows = Math.ceil(regions.length / count);
  const sourceIndex = (point: StaffPoint) => {
    const row = rowAt(point.y, page.staffCount ?? 7);
    const candidates = byRow.get(row)!;
    return (candidates.find(({ region }) => point.x < region.right) ?? candidates[candidates.length - 1]).index;
  };
  const inCell = (point: StaffPoint, index: number) => {
    const r = regions[index];
    return {
      x: NOTEBOOK_LEFT + index % count * cellWidth + (point.x - r.left) * cellWidth / (r.right - r.left),
      y: Math.floor(index / count) * ROW_HEIGHT + point.y - r.row * ROW_HEIGHT,
    };
  };
  const forward = (point: StaffPoint) => inCell(point, sourceIndex(point));
  const inverse = (point: StaffPoint): StaffPoint => {
    const row = Math.max(0, Math.min(rows - 1, Math.floor(point.y / ROW_HEIGHT)));
    const col = Math.max(0, Math.min(count - 1, Math.floor((point.x - NOTEBOOK_LEFT) / cellWidth)));
    const index = Math.min(regions.length - 1, row * count + col);
    const r = regions[index];
    return {
      x: r.left + (point.x - NOTEBOOK_LEFT - col * cellWidth) * (r.right - r.left) / cellWidth,
      y: r.row * ROW_HEIGHT + point.y - row * ROW_HEIGHT,
    };
  };
  const strokeOwners = new Map<string, string>();
  // Split only the displayed path at fold boundaries. The original stroke,
  // including its id, masks, and coordinates, remains untouched in the document.
  const strokes = page.strokes.flatMap((stroke) => {
    const pieces: { cell: number; points: StaffPoint[] }[] = [];
    const append = (cell: number, a: StaffPoint, b: StaffPoint) => {
      const last = pieces[pieces.length - 1];
      if (last?.cell === cell) last.points.push(inCell(b, cell));
      else pieces.push({ cell, points: [inCell(a, cell), inCell(b, cell)] });
    };
    if (stroke.points.length === 1) append(sourceIndex(stroke.points[0]), stroke.points[0], stroke.points[0]);
    for (let i = 1; i < stroke.points.length; i++) {
      const a = stroke.points[i - 1], b = stroke.points[i];
      const ts = [0, 1];
      const firstRow = rowAt(Math.min(a.y, b.y), page.staffCount ?? 7), lastRow = rowAt(Math.max(a.y, b.y), page.staffCount ?? 7);
      for (let row = firstRow; row <= lastRow; row++) for (const { region: r } of byRow.get(row) ?? []) {
        if (b.x !== a.x) {
          const t = (r.left - a.x) / (b.x - a.x), y = a.y + (b.y - a.y) * t;
          if (t > 0 && t < 1 && y >= r.row * ROW_HEIGHT && y < (r.row + 1) * ROW_HEIGHT) ts.push(t);
        }
        if (b.y !== a.y) {
          const t = (r.row * ROW_HEIGHT - a.y) / (b.y - a.y);
          if (t > 0 && t < 1) ts.push(t);
        }
      }
      const sorted = [...new Set(ts)].sort((x, y) => x - y);
      const at = (t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      for (let j = 1; j < sorted.length; j++) append(sourceIndex(at((sorted[j - 1] + sorted[j]) / 2)), at(sorted[j - 1]), at(sorted[j]));
    }
    return pieces.map((piece, index) => {
      const id = `${stroke.id}:portrait:${index}`;
      strokeOwners.set(id, stroke.id);
      const origin = stroke.points[0], projectedOrigin = piece.points[0];
      return { ...stroke, id, points: piece.points, erasures: stroke.erasures?.map((cut) => ({
        ...cut, points: cut.points.map((p) => {
          const mapped = inCell({ x: origin.x + p.x * stroke.width, y: origin.y + p.y * stroke.width }, piece.cell);
          return { x: (mapped.x - projectedOrigin.x) / stroke.width, y: (mapped.y - projectedOrigin.y) / stroke.width };
        }),
      })) };
    });
  });
  const projected: StaffPage = {
    ...page, staffCount: rows, strokes, layoutScale: NOTEBOOK_SPAN / span,
    stamps: page.stamps?.map((s) => ({ ...s, ...forward(s), measure: sourceIndex(s) % count })),
    anchor: page.anchor && forward(page.anchor),
    measureCounts: Array.from({ length: rows }, (_, row) => Math.min(count, regions.length - row * count)),
  };
  return { page: projected, forward, inverse, strokeOwners };
}
