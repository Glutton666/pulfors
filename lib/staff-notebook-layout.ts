import type { NotebookSettings, StaffNotebook, StaffPage, StaffPoint } from "./staff-notebook";

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
  const previous = anchor ?? (last ? { x: last.x + last.size * 0.8, y: last.y }
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
/** A source row is a complete unit. Ink and stamps travel together without changing the original. */
export function materializeRows(note: StaffNotebook, rows: NotebookRow[]): StaffPage {
  return {
    id: "playback-view", staffCount: rows.length,
    strokes: rows.flatMap((row, index) => {
      const page = note.pages[row.pageIndex];
      const shift = (index - row.rowIndex) * ROW_HEIGHT;
      return page.strokes.filter((stroke) => stroke.points[0] && rowAt(stroke.points[0].y, page.staffCount ?? 7) === row.rowIndex)
        .map((stroke) => ({ ...stroke, id: `${index}:${stroke.id}`, points: stroke.points.map((p) => ({ x: p.x, y: p.y + shift })) }));
    }),
    stamps: rows.flatMap((row, index) => (note.pages[row.pageIndex].stamps ?? [])
      .filter((stamp) => rowAt(stamp.y, note.pages[row.pageIndex].staffCount ?? 7) === row.rowIndex)
      .map((stamp) => ({ ...stamp, id: `${index}:${stamp.id}`, y: stamp.y + (index - row.rowIndex) * ROW_HEIGHT }))),
  };
}
