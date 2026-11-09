import type { NotebookSettings, StaffNotebook, StaffPage, StaffPoint, StaffStroke, StaffStamp } from "./staff-notebook";

export const PAPER_WIDTH = 900;
export const ROW_HEIGHT = 155;
export const STAFF_TOP = 78;
export const STAFF_GAP = 12;
export type NotebookRow = { pageIndex: number; rowIndex: number; id: string; keepWithNext?: boolean };
/** Project viewport-filling rows into the editable document, without mutating the original. */
export function fitNotebookPage(note: StaffNotebook, pageIndex: number, minimumRows: number): StaffNotebook {
  const page = note.pages[pageIndex];
  const count = Math.min(200, Math.max(1, Math.ceil(minimumRows)));
  if (!page || note.settings?.rowsPerPage !== undefined || (page.staffCount ?? 7) >= count) return note;
  return { ...note, pages: note.pages.map((item, index) => index === pageIndex ? { ...item, staffCount: count } : item) };
}
export function notebookRows(note: StaffNotebook): NotebookRow[] {
  return note.pages.flatMap((page, pageIndex) => {
    const spans = (page.tuplets ?? []).map((group) => group.stampIds.map((id) => page.stamps?.find((s) => s.id === id)?.y ?? 0));
    (page.stamps ?? []).forEach((stamp) => { const parent = page.stamps?.find((s) => s.id === stamp.attachTo); if (parent) spans.push([parent.y, stamp.y]); });
    return Array.from({ length: page.staffCount ?? 7 }, (_, rowIndex) => ({
      pageIndex, rowIndex, id: `${page.id}:${rowIndex}`,
      ...(spans.some((ys) => rowAt(Math.min(...ys), page.staffCount ?? 7) <= rowIndex && rowAt(Math.max(...ys), page.staffCount ?? 7) > rowIndex) ? { keepWithNext: true } : {}),
    }));
  });
}
export function shuffledRows(rows: NotebookRow[], random: () => number = Math.random): NotebookRow[] {
  const copy = [...rows];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(Math.max(0, random()) * (i + 1)));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
export function rowAt(y: number, count: number): number {
  return Math.max(0, Math.min(count - 1, Math.floor(y / ROW_HEIGHT)));
}
/** Quantize notehead centers, not stems, to a line or space of the nearest staff. */
export function snapStaffY(y: number, count: number, low = 12, high = count * ROW_HEIGHT - 12): number {
  const clamped = Math.max(low, Math.min(high, y));
  const row = rowAt(clamped, count);
  const step = STAFF_GAP / 2;
  let best = clamped, distance = Infinity;
  for (let r = Math.max(0, row - 1); r <= Math.min(count - 1, row + 1); r++) {
    const top = r * ROW_HEIGHT + STAFF_TOP;
    const first = Math.ceil((Math.max(low, r * ROW_HEIGHT) - top) / step);
    const last = Math.floor((Math.min(high, (r + 1) * ROW_HEIGHT - 0.001) - top) / step);
    if (first > last) continue;
    const candidate = top + Math.max(first, Math.min(last, Math.round((clamped - top) / step))) * step;
    if (Math.abs(candidate - clamped) < distance) { best = candidate; distance = Math.abs(candidate - clamped); }
  }
  return best;
}
export function constrainStaffPoint(page: StaffPage, point: StaffPoint, snap: boolean): StaffPoint {
  const count = page.staffCount ?? 7;
  return {
    x: Math.max(22, Math.min(76 + 824 / (page.layoutScale ?? 1) - 22, point.x)),
    y: snap ? snapStaffY(point.y, count) : Math.max(12, Math.min(count * ROW_HEIGHT - 12, point.y)),
  };
}
/** Values and anchors are always paper coordinates, never screen pixels. */
export function stampPosition(page: StaffPage, settings: NotebookSettings, anchor?: StaffPoint): StaffPoint {
  const last = page.stamps?.at(-1);
  const stroke = page.strokes.at(-1);
  const previous = anchor ?? page.anchor ?? (last ? { x: last.x + last.size * 0.8, y: last.y }
    : stroke?.points.at(-1));
  let x = previous ? previous.x + 22 : 55;
  let y = previous?.y ?? STAFF_TOP + STAFF_GAP * 2;
  const paperWidth = 76 + 824 / (page.layoutScale ?? 1);
  if (x > paperWidth - 55) { x = 55; y = (rowAt(y, page.staffCount ?? 7) + 1) * ROW_HEIGHT + STAFF_TOP + STAFF_GAP * 2; }
  // Legacy offsets remain readable, but never silently shift new placements.
  x = Math.max(38, Math.min(paperWidth - 38, x));
  y = Math.max(12, Math.min((page.staffCount ?? 7) * ROW_HEIGHT - 12, y));
  return constrainStaffPoint(page, { x, y }, settings.snap);
}
export function screenToPaper(point: StaffPoint, offset: StaffPoint, scale: number): StaffPoint {
  return { x: (point.x - offset.x) / scale, y: (point.y - offset.y) / scale };
}
export function inkInRow(stroke: StaffStroke, row: number, height = ROW_HEIGHT): StaffStroke[] {
  const low = row * height, high = low + height;
  if (stroke.points.every((point) => point.y >= low && point.y < high)) return [stroke];
  if (stroke.points.length === 1) return stroke.points[0].y >= low && stroke.points[0].y < high ? [stroke] : [];
  const pieces: StaffPoint[][] = [];
  let current: StaffPoint[] = [];
  for (let i = 1; i < stroke.points.length; i++) {
    const a = stroke.points[i - 1], b = stroke.points[i], dy = b.y - a.y;
    let from = 0, to = 1;
    if (dy === 0) { if (a.y < low || a.y >= high) { current = []; continue; } }
    else { from = Math.max(0, Math.min((low - a.y) / dy, (high - a.y) / dy)); to = Math.min(1, Math.max((low - a.y) / dy, (high - a.y) / dy)); }
    if (from > to) { current = []; continue; }
    const start = { x: a.x + (b.x - a.x) * from, y: a.y + dy * from };
    const end = { x: a.x + (b.x - a.x) * to, y: a.y + dy * to };
    if (!current.length || Math.hypot(current[current.length - 1].x - start.x, current[current.length - 1].y - start.y) > 0.001) {
      current = [start]; pieces.push(current);
    }
    current.push(end);
    if (to < 1) current = [];
  }
  return pieces.map((points, index) => ({ ...stroke, id: `${stroke.id}:fragment:${index}`, points,
    ...(stroke.erasures ? { erasures: stroke.erasures.map((cut) => ({ ...cut, points: cut.points.map((p) => ({
      x: p.x + (stroke.points[0].x - points[0].x) / stroke.width,
      y: p.y + (stroke.points[0].y - points[0].y) / stroke.width,
    })) })) } : {}) }));
}
/** A source row is a complete unit. Ink and stamps travel together without changing the original. */
export function materializeRows(note: StaffNotebook, rows: NotebookRow[]): StaffPage {
  const commonScale = Math.min(1, ...rows.map((r) => note.pages[r.pageIndex].layoutScale ?? 1));
  const factor = (page: StaffPage) => (page.layoutScale ?? 1) / commonScale;
  const linkedId = (id: string | undefined, index: number, forward: boolean) => {
    if (!id) return undefined;
    const positions = rows.flatMap((r, i) => note.pages[r.pageIndex].stamps?.some((s) => s.id === id && rowAt(s.y, note.pages[r.pageIndex].staffCount ?? 7) === r.rowIndex) ? [i] : []);
    const target = forward ? positions.find((i) => i >= index) : positions.filter((i) => i <= index).at(-1);
    return target === undefined ? undefined : `${target}:${id}`;
  };
  return {
    id: "playback-view", staffCount: rows.length, layoutScale: commonScale,
    measureCounts: rows.map((r) => note.pages[r.pageIndex].measureCounts?.[r.rowIndex] ?? note.settings?.measuresPerRow ?? (note.settings?.lineUnit === "phrase" ? 4 : 1)),
    strokes: rows.flatMap((row, index) => {
      const page = note.pages[row.pageIndex];
      const shift = (index - row.rowIndex) * ROW_HEIGHT;
      return page.strokes.flatMap((stroke) => inkInRow(stroke, row.rowIndex))
        .map((stroke) => ({ ...stroke, id: `${index}:${stroke.id}`, points: stroke.points.map((p) => ({ x: 38 + (p.x - 38) * factor(page), y: p.y + shift })) }));
    }),
    stamps: rows.flatMap((row, index) => (note.pages[row.pageIndex].stamps ?? [])
      .filter((stamp) => rowAt(stamp.y, note.pages[row.pageIndex].staffCount ?? 7) === row.rowIndex)
      .map((stamp) => ({ ...stamp, id: `${index}:${stamp.id}`, attachTo: stamp.attachTo ? `${index}:${stamp.attachTo}` : undefined,
        tieTo: linkedId(stamp.tieTo, index, true), tieFrom: linkedId(stamp.tieFrom, index, false),
        x: 38 + (stamp.x - 38) * factor(note.pages[row.pageIndex]), y: stamp.y + (index - row.rowIndex) * ROW_HEIGHT }))),
    tuplets: rows.flatMap((row, index) => {
      const page = note.pages[row.pageIndex];
      return (page.tuplets ?? []).flatMap((group) => {
        const members = group.stampIds.map((id) => page.stamps?.find((s) => s.id === id)).filter((s): s is StaffStamp => !!s);
        const firstRow = Math.min(...members.map((s) => rowAt(s.y, page.staffCount ?? 7)));
        if (row.rowIndex !== firstRow) return [];
        const positions = members.map((stamp) => {
          const sourceRow = rowAt(stamp.y, page.staffCount ?? 7), target = index + sourceRow - firstRow;
          return rows[target]?.pageIndex === row.pageIndex && rows[target]?.rowIndex === sourceRow ? `${target}:${stamp.id}` : null;
        });
        return positions.every(Boolean) ? [{ ...group, id: `${index}:${group.id}`, stampIds: positions as string[] }] : [];
      });
    }),
  };
}
