import type { NotebookSettings, StaffNotebook, StaffPage, StaffStamp } from "./staff-notebook";
import { rowAt } from "./staff-notebook-layout";

export const NOTEBOOK_LEFT = 38;
export const NOTEBOOK_SPAN = 824;
export const isManualBar = (s: StaffStamp) => s.glyph === "barline" || s.glyph === "bar_line";
export const measuresInRow = (settings?: Partial<NotebookSettings>) => settings?.measuresPerRow ?? (settings?.lineUnit === "phrase" ? 4 : 1);
export function naturalPaperWidth(page: StaffPage) { return NOTEBOOK_LEFT + NOTEBOOK_SPAN / (page.layoutScale ?? 1) + 38; }

export type NotebookMeasureRegion = { row: number; index: number; left: number; right: number };
/** Manual boundaries replace automatic divisions, not the saved fallback count.
 * showBarlines is presentation-only. Cached stamp.measure is never authoritative.
 */
export function notebookMeasureRegions(page: StaffPage, settings?: Partial<NotebookSettings>): NotebookMeasureRegion[] {
  const end = naturalPaperWidth(page) - 38;
  return Array.from({ length: page.staffCount ?? 7 }, (_, row) => {
    const n = page.measureCounts?.[row] ?? measuresInRow(settings);
    const bars = (page.stamps ?? []).filter((s) => isManualBar(s) && rowAt(s.y, page.staffCount ?? 7) === row)
      .map((s) => s.x).filter((x) => x > NOTEBOOK_LEFT + 1 && x < end - 1).sort((a, b) => a - b);
    const unique: number[] = [];
    bars.forEach((x) => { if (!unique.length || x - unique[unique.length - 1] > 1) unique.push(x); });
    const bounds = unique.length ? [NOTEBOOK_LEFT, ...unique, end]
      : Array.from({ length: n + 1 }, (_, i) => NOTEBOOK_LEFT + (end - NOTEBOOK_LEFT) * i / n);
    return bounds.slice(0, -1).map((left, index) => ({ row, index, left, right: bounds[index + 1] }));
  }).flat();
}

export function notebookStampMeasure(page: StaffPage, stamp: Pick<StaffStamp, "x" | "y">, settings?: Partial<NotebookSettings>) {
  const row = rowAt(stamp.y, page.staffCount ?? 7);
  const regions = notebookMeasureRegions(page, settings).filter((r) => r.row === row);
  return regions.find((r) => stamp.x < r.right)?.index ?? regions.length - 1;
}

export function notebookRowMeasureCounts(page: StaffPage, settings?: Partial<NotebookSettings>) {
  const counts = Array<number>(page.staffCount ?? 7).fill(0);
  notebookMeasureRegions(page, settings).forEach((r) => counts[r.row]++);
  return counts;
}

export function notebookPlaybackRowCounts(note: StaffNotebook, rows: { pageIndex: number; rowIndex: number }[]) {
  const counts = note.pages.map((p) => notebookRowMeasureCounts(p, note.settings));
  return rows.map((r) => counts[r.pageIndex][r.rowIndex]);
}
