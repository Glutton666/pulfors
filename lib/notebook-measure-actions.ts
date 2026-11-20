import type { NotebookSettings, StaffPage, StaffPoint, StaffStamp, StaffStroke } from "./staff-notebook";
import { isManualBar, measuresInRow, notebookMeasureRegions, type NotebookMeasureRegion } from "./notebook-measures";
import { inkInRow, ROW_HEIGHT, rowAt, STAFF_TOP, STAFF_GAP } from "./staff-notebook-layout";
import { removeSelection, isTupletMember } from "./notebook-editing";
import { measureAtPoint, type SectionMeasure } from "./notebook-sections";

export function notebookInkCrossesBoundary(page: StaffPage, row: number, x: number) {
  return page.strokes.some((stroke) => inkInRow(stroke, row).some(({ points }) =>
    points.some((p) => p.x < x - .001) && points.some((p) => p.x > x + .001)));
}

/** Only count new visual row breaks through an authored stroke, not ordinary scaling. */
export function notebookInkWraps(page: StaffPage, regions: SectionMeasure[], before: number | null, after: number | null) {
  if (!page.strokes.length || before === after) return false;
  const breaks = (columns: number | null) => {
    const wrapped = new Set<SectionMeasure>();
    let col = 0;
    regions.forEach((r) => {
      if (columns === null) return;
      if (col >= columns || r.clefChange || r.meterChange) {
        if (r.index > 0 && col) wrapped.add(r);
        col = 0;
      }
      col++;
    });
    return wrapped;
  };
  const prior = breaks(before);
  return [...breaks(after)].some((r) => !prior.has(r) && notebookInkCrossesBoundary(page, r.row, r.left));
}

/** Inserting a boundary splits one bar, not every automatically divided bar on the row. */
export function insertNotebookBarline(page: StaffPage, settings: Partial<NotebookSettings>, stamp: StaffStamp) {
  const count = page.staffCount ?? 7, row = rowAt(stamp.y, count);
  const regions = notebookMeasureRegions(page, settings).filter((r) => r.row === row);
  const target = measureAtPoint(regions, stamp, count);
  if (regions.length >= 32 || stamp.x <= target.left + 1 || stamp.x >= target.right - 1)
    return { error: "boundary" } as const;
  const stamps = page.stamps ?? [];
  const lookup = new Map(stamps.map((s) => [s.id, s]));
  if (page.tuplets?.some((group) => {
    const xs = group.stampIds.map((id) => lookup.get(id)).filter((s): s is StaffStamp =>
      !!s && rowAt(s.y, count) === row).map((s) => s.x);
    return xs.some((x) => x < stamp.x) && xs.some((x) => x >= stamp.x);
  })) return { error: "tuplet" } as const;
  const persisted = regions.slice(1).flatMap((r): StaffStamp[] => stamps.some((s) =>
    isManualBar(s) && rowAt(s.y, count) === row && Math.abs(s.x - r.left) <= 1) ? [] : [{
    id: `${stamp.id}:boundary:${r.index}`, glyph: "barline", x: r.left, y: row * ROW_HEIGHT + STAFF_TOP + 2 * STAFF_GAP,
    size: stamp.size, generated: true,
  }]);
  const hasNotes = stamps.some((s) => !s.generated && isTupletMember(s.glyph) && rowAt(s.y, count) === row);
  const updated: StaffPage = { ...page, stamps: [...stamps, ...persisted, stamp],
    completedRows: hasNotes ? [...new Set([...(page.completedRows ?? []), row])] : page.completedRows };
  return { page: updated,
    crossesInk: notebookInkCrossesBoundary(page, row, stamp.x) } as const;
}

/** Keep the untouched portions of handwriting, including normalized eraser masks. */
function remapInk(stroke: StaffStroke, xCuts: number[], yCuts: number[],
  transformAt: (p: StaffPoint) => ((p: StaffPoint) => StaffPoint) | undefined,
  allocate: (preferred: string) => string) {
  type Piece = { map: (p: StaffPoint) => StaffPoint; points: StaffPoint[] };
  const pieces: Piece[] = [];
  let prior: Piece | undefined;
  const append = (map: Piece["map"] | undefined, a: StaffPoint, b?: StaffPoint) => {
    if (!map) { prior = undefined; return; }
    if (prior?.map !== map) { prior = { map, points: [map(a)] }; pieces.push(prior); }
    if (b) prior.points.push(map(b));
  };
  if (stroke.points.length === 1) append(transformAt(stroke.points[0]), stroke.points[0]);
  for (let i = 1; i < stroke.points.length; ++i) {
    const a = stroke.points[i - 1], b = stroke.points[i], dx = b.x - a.x, dy = b.y - a.y;
    const cuts = [0, 1, ...xCuts.map((x) => (x - a.x) / dx), ...yCuts.map((y) => (y - a.y) / dy)]
      .filter((t) => t >= 0 && t <= 1).sort((u, v) => u - v);
    const at = (t: number) => ({ x: a.x + dx * t, y: a.y + dy * t });
    cuts.forEach((t, j) => { if (j && t > cuts[j - 1]) append(transformAt(at((t + cuts[j - 1]) / 2)), at(cuts[j - 1]), at(t)); });
  }
  const origin = stroke.points[0];
  return pieces.map(({ points, map }, index) => ({ ...stroke, id: index ? allocate(`${stroke.id}:measure-cut:${index}`) : stroke.id, points,
    erasures: stroke.erasures?.map((cut) => ({ ...cut, points: cut.points.map((p) => {
      const to = map({ x: origin.x + p.x * stroke.width, y: origin.y + p.y * stroke.width });
      return { x: (to.x - points[0].x) / stroke.width, y: (to.y - points[0].y) / stroke.width };
    }) })),
  }));
}

const identity = (p: StaffPoint) => p;

export function deleteNotebookBar(page: StaffPage, settings: Partial<NotebookSettings>, target: NotebookMeasureRegion) {
  const count = page.staffCount ?? 7;
  const regions = notebookMeasureRegions(page, settings).filter((r) => r.row === target.row);
  const configured = Array.from({ length: count }, (_, row) => page.measureCounts?.[row] ?? measuresInRow(settings));
  const remaining = regions.filter((r) => r.index !== target.index);
  const removeRow = !remaining.length && count > 1;
  const row = target.row;
  const y0 = row * ROW_HEIGHT, y1 = y0 + ROW_HEIGHT;
  const first = regions[0].left, end = regions.at(-1)!.right;
  const removedLine = target.index === regions.length - 1 ? target.left : target.right;
  const hasManual = page.stamps?.some((s) => isManualBar(s) && rowAt(s.y, count) === row);
  const shiftRow = (p: StaffPoint) => ({ ...p, y: p.y - ROW_HEIGHT });
  const width = (end - first) / Math.max(1, remaining.length);
  const transforms = new Map(remaining.map((r, i) => [r.index, hasManual ? identity : (p: StaffPoint) => ({
    x: first + i * width + (p.x - r.left) * width / (r.right - r.left), y: p.y,
  })]));
  const own = (point: StaffPoint) => rowAt(point.y, count) === row ? measureAtPoint(regions, point, count).index : undefined;
  const transformAt = (p: StaffPoint) => {
    const index = own(p);
    return index === undefined ? removeRow && p.y >= y1 ? shiftRow : identity : transforms.get(index);
  };
  const stamps = page.stamps ?? [];
  const lookup = new Map(stamps.map((s) => [s.id, s]));
  const chosen = stamps.filter((s) => isManualBar(s)
    ? rowAt(s.y, count) === row && (removeRow || !remaining.length || Math.abs(s.x - removedLine) <= 1)
    : own((s.attachTo && lookup.get(s.attachTo)) || s) === target.index).map((s) => s.id);
  const edited = removeSelection(page, { stampIds: chosen, strokeIds: [] });
  if (removeRow) configured.splice(row, 1);
  else if (remaining.length) configured[row] = remaining.length;
  const rowList = (values?: number[]) => values?.filter((r) => r !== row || remaining.length).map((r) => r > row && removeRow ? r - 1 : r);
  const crossingInk = [target.left, target.right].some((x) => x > first && x < end && notebookInkCrossesBoundary(page, row, x));
  const strokeIds = new Set(page.strokes.map((s) => s.id));
  const allocate = (preferred: string) => {
    let id = preferred, suffix = 0;
    while (strokeIds.has(id)) id = `${preferred}:${++suffix}`;
    strokeIds.add(id); return id;
  };
  return {
    crossesInk: crossingInk,
    page: { ...edited, staffCount: removeRow ? count - 1 : count, measureCounts: configured,
      completedRows: rowList(page.completedRows), blankRows: rowList(page.blankRows),
      anchor: page.anchor && transformAt(page.anchor)?.(page.anchor),
      stamps: edited.stamps?.map((s) => {
        if (isManualBar(s)) return removeRow && s.y >= y1 ? { ...s, ...shiftRow(s) } : s;
        const parent = s.attachTo && lookup.get(s.attachTo);
        const map = transformAt(parent || s) ?? identity;
        if (parent) {
          const p = map(parent);
          return { ...s, x: s.x + p.x - parent.x, y: s.y + p.y - parent.y };
        }
        return { ...s, ...map(s) };
      }),
      strokes: edited.strokes.flatMap((stroke) => {
        if (stroke.points.every((p) => transformAt(p) === identity) &&
          (stroke.points.every((p) => p.y < y0) || stroke.points.every((p) => p.y >= y1) && !removeRow)) return [stroke];
        return remapInk(stroke, regions.slice(1).map((r) => r.left), [y0, y1], transformAt, allocate);
      }),
    },
  };
}
