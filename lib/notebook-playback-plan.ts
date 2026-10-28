import type { NotebookRow } from "./staff-notebook-layout";

export type NotebookBar = { source: number; startMs: number; endMs: number; group?: string };
export type NotebookChunk = NotebookBar & { row: number };
export type NotebookPlan = { rows: NotebookRow[]; chunks: NotebookChunk[]; rowEnds: number[]; durationMs: number };

/** Shuffle whole paper units, joining units when a source block crosses their boundary. */
export function buildNotebookPlan(
  rows: NotebookRow[], bars: NotebookBar[], measuresPerRow: 1 | 4,
  random = false, rng: () => number = Math.random,
): NotebookPlan {
  if (!rows.length || !bars.length || bars.some((b) => !(b.endMs > b.startMs))) throw new Error("EMPTY_PATTERN");
  const barAt = (i: number) => ({ ...bars[i % bars.length], group: bars[i % bars.length].group === undefined
    ? undefined : `${Math.floor(i / bars.length)}:${bars[i % bars.length].group}` });
  const count = rows.length * measuresPerRow;
  const last = barAt(count - 1), next = barAt(count);
  if (last.group !== undefined && last.group === next.group) throw new Error("INCOMPLETE_BLOCK");
  const groups: number[][] = [];
  rows.forEach((_, i) => {
    const prior = i ? barAt(i * measuresPerRow - 1) : undefined;
    const first = barAt(i * measuresPerRow);
    if (prior?.group !== undefined && prior.group === first.group) groups[groups.length - 1].push(i);
    else groups.push([i]);
  });
  if (random) for (let i = groups.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(Math.max(0, rng()) * (i + 1)));
    [groups[i], groups[j]] = [groups[j], groups[i]];
  }
  const order = groups.flat(), chunks: NotebookChunk[] = [], rowEnds: number[] = [];
  let durationMs = 0;
  order.forEach((original, row) => {
    for (let j = 0; j < measuresPerRow; j++) {
      const bar = barAt(original * measuresPerRow + j);
      chunks.push({ ...bar, row });
      durationMs += bar.endMs - bar.startMs;
    }
    rowEnds.push(durationMs);
  });
  if (durationMs > 600_000) throw new Error("NOTEBOOK_TOO_LONG");
  return { rows: order.map((i) => rows[i]), chunks, rowEnds, durationMs };
}
export function notebookPosition(rowEnds: number[], timeMs: number) {
  let row = rowEnds.findIndex((end) => timeMs < end);
  if (row < 0) row = Math.max(0, rowEnds.length - 1);
  const start = row ? rowEnds[row - 1] : 0;
  return { row, progress: Math.max(0, Math.min(1, (timeMs - start) / ((rowEnds[row] ?? 1) - start))) };
}
