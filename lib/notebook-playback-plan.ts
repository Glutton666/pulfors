import type { NotebookRow } from "./staff-notebook-layout";
import { notebookRows } from "./staff-notebook-layout";
import type { StaffNotebook } from "./staff-notebook";
import { meterLength, notebookSections } from "./notebook-sections";

export type NotebookBar = { source: number; startMs: number; endMs: number; group?: string };
export type NotebookChunk = NotebookBar & { row: number; measure?: number };
export type NotebookPlan = { rows: NotebookRow[]; chunks: NotebookChunk[]; rowEnds: number[]; durationMs: number; positionRows?: number[]; chunkEnds?: number[] };

/** Paper duration always comes from the same regions used by selection/layout. */
export function buildNotebookNotationPlan(note: StaffNotebook, barMs?: number): NotebookPlan {
  const rows = notebookRows(note);
  const sectionsByPage = notebookSections(note);
  if (!rows.length || !sectionsByPage.some((p) => p.length) || barMs !== undefined && !(barMs > 0)) throw new Error("EMPTY_PATTERN");
  const chunks: NotebookChunk[] = [], rowEnds: number[] = [];
  let durationMs = 0, row = -1;
  note.pages.forEach((page, pi) => {
    const source = sectionsByPage[pi];
    let cursor = 0;
    for (let r = 0; r < (page.staffCount ?? 7); r++) {
      row++;
      while (cursor < source.length && source[cursor].row === r) {
        const region = source[cursor++];
        const length = barMs ?? meterLength(region.meter) * 60_000 / (note.settings?.bpm ?? 120);
        chunks.push({ row, measure: region.index, source: 0, startMs: 0, endMs: length });
        durationMs += length;
      }
      rowEnds.push(durationMs);
    }
  });
  if (durationMs > 600_000) throw new Error("NOTEBOOK_TOO_LONG");
  return { rows, chunks, rowEnds, durationMs };
}

/** Shuffle whole paper units, joining units when a source block crosses their boundary. */
export function buildNotebookPlan(
  rows: NotebookRow[], bars: NotebookBar[], measuresPerRow: number,
  random = false, rng: () => number = Math.random, rowCounts?: number[],
): NotebookPlan {
  if (!rows.length || !bars.length || bars.some((b) => !(b.endMs > b.startMs))) throw new Error("EMPTY_PATTERN");
  const barAt = (i: number) => ({ ...bars[i % bars.length], group: bars[i % bars.length].group === undefined
    ? undefined : `${Math.floor(i / bars.length)}:${bars[i % bars.length].group}` });
  const counts = rows.map((_, i) => rowCounts?.[i] ?? measuresPerRow);
  const starts: number[] = []; let count = 0;
  counts.forEach((n) => { starts.push(count); count += n; });
  const last = barAt(count - 1), next = barAt(count);
  if (last.group !== undefined && last.group === next.group) throw new Error("INCOMPLETE_BLOCK");
  const groups: number[][] = [];
  rows.forEach((_, i) => {
    const prior = i ? barAt(starts[i] - 1) : undefined;
    const first = barAt(starts[i]);
    if (rows[i - 1]?.keepWithNext || (prior?.group !== undefined && prior.group === first.group)) groups[groups.length - 1].push(i);
    else groups.push([i]);
  });
  if (random) for (let i = groups.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(Math.max(0, rng()) * (i + 1)));
    [groups[i], groups[j]] = [groups[j], groups[i]];
  }
  const order = groups.flat(), chunks: NotebookChunk[] = [], rowEnds: number[] = [];
  let durationMs = 0;
  order.forEach((original, row) => {
    for (let j = 0; j < counts[original]; j++) {
      const bar = barAt(starts[original] + j);
      chunks.push({ ...bar, row });
      durationMs += bar.endMs - bar.startMs;
    }
    rowEnds.push(durationMs);
  });
  if (durationMs > 600_000) throw new Error("NOTEBOOK_TOO_LONG");
  return { rows: order.map((i) => rows[i]), chunks, rowEnds, durationMs };
}
export function notebookPosition(rowEnds: number[], timeMs: number, positionRows?: number[]) {
  let row = rowEnds.findIndex((end) => timeMs < end);
  if (row < 0) row = Math.max(0, rowEnds.length - 1);
  const start = row ? rowEnds[row - 1] : 0;
  return { row: positionRows?.[row] ?? row, progress: Math.max(0, Math.min(1, (timeMs - start) / ((rowEnds[row] ?? 1) - start))) };
}

/** A row can contain unequally timed measures or be visited with a repeat jump. */
export function notebookMeasurePosition(plan: NotebookPlan, timeMs: number) {
  let low = 0, high = plan.chunks.length;
  const ends = plan.chunkEnds ?? notebookChunkEnds(plan.chunks);
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (timeMs < ends[mid]) high = mid; else low = mid + 1;
  }
  const chunk = plan.chunks[Math.min(low, plan.chunks.length - 1)];
  return { ...notebookPosition(plan.rowEnds, timeMs, plan.positionRows), measure: chunk?.measure ?? 0 };
}
export function notebookChunkEnds(chunks: NotebookChunk[]) {
  let end = 0;
  return chunks.map((c) => end += c.endMs - c.startMs);
}
