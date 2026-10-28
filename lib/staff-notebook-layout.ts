import type { NotebookSettings, StaffNotebook, StaffPage, StaffPoint, StaffStroke } from "./staff-notebook";

export const PAPER_WIDTH = 900;
export const ROW_HEIGHT = 155;
export const STAFF_TOP = 78;
export const STAFF_GAP = 12;
export type NotebookRow = { pageIndex: number; rowIndex: number; id: string };
export function notebookRows(note: StaffNotebook): NotebookRow[] {
  return note.pages.flatMap((page, pageIndex) =>
    Array.from({ length: page.staffCount ?? 7 }, (_, rowIndex) => ({ pageIndex, rowIndex, id: `${page.id}:${rowIndex}` })));
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
/** Values and anchors are always paper coordinates, never screen pixels. */
export function stampPosition(page: StaffPage, settings: NotebookSettings, anchor?: StaffPoint): StaffPoint {
  const last = page.stamps?.at(-1);
  const stroke = page.strokes.at(-1);
  const previous = anchor ?? page.anchor ?? (last ? { x: last.x + last.size * 0.8, y: last.y }
    : stroke?.points.at(-1));
  let x = previous ? previous.x + 22 : 55;
  let y = previous?.y ?? STAFF_TOP + STAFF_GAP * 2;
  if (x > PAPER_WIDTH - 55) { x = 55; y = (rowAt(y, page.staffCount ?? 7) + 1) * ROW_HEIGHT + STAFF_TOP + STAFF_GAP * 2; }
  x = Math.max(38, Math.min(862, x + settings.offsetX));
  y = Math.max(12, Math.min((page.staffCount ?? 7) * ROW_HEIGHT - 12, y + settings.offsetY));
  if (settings.snap) {
    const top = rowAt(y, page.staffCount ?? 7) * ROW_HEIGHT + STAFF_TOP;
    y = top + Math.round((y - top) / (STAFF_GAP / 2)) * STAFF_GAP / 2;
  }
  return { x, y };
}
export function screenToPaper(point: StaffPoint, offset: StaffPoint, scale: number): StaffPoint {
  return { x: (point.x - offset.x) / scale, y: (point.y - offset.y) / scale };
}
function inkInRow(stroke: StaffStroke, row: number): StaffStroke[] {
  const low = row * ROW_HEIGHT, high = low + ROW_HEIGHT;
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
  return pieces.map((points, index) => ({ ...stroke, id: `${stroke.id}:fragment:${index}`, points }));
}
/** A source row is a complete unit. Ink and stamps travel together without changing the original. */
export function materializeRows(note: StaffNotebook, rows: NotebookRow[]): StaffPage {
  return {
    id: "playback-view", staffCount: rows.length,
    strokes: rows.flatMap((row, index) => {
      const page = note.pages[row.pageIndex];
      const shift = (index - row.rowIndex) * ROW_HEIGHT;
      return page.strokes.flatMap((stroke) => inkInRow(stroke, row.rowIndex))
        .map((stroke) => ({ ...stroke, id: `${index}:${stroke.id}`, points: stroke.points.map((p) => ({ x: p.x, y: p.y + shift })) }));
    }),
    stamps: rows.flatMap((row, index) => (note.pages[row.pageIndex].stamps ?? [])
      .filter((stamp) => rowAt(stamp.y, note.pages[row.pageIndex].staffCount ?? 7) === row.rowIndex)
      .map((stamp) => ({ ...stamp, id: `${index}:${stamp.id}`, y: stamp.y + (index - row.rowIndex) * ROW_HEIGHT }))),
  };
}
