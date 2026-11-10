import type { StaffNotebook, StaffPage } from "./staff-notebook";
import { rowAt } from "./staff-notebook-layout";
import { isManualBar, measuresInRow, naturalPaperWidth, notebookMeasureAt, notebookMeasureRegions } from "./notebook-music-layout";

/**
 * Materialize legacy ownership before changing geometry. Moving a bar preserves
 * existing membership; moving/adding a musical object chooses a destination.
 * No coordinates, durations, generated rests or ties change in this transaction.
 */
export function prepareNotebookMeasureEdit(before: StaffNotebook, next: StaffNotebook): StaffNotebook {
  const old = new Map(before.pages.flatMap((page) => (page.stamps ?? []).map((s) =>
    [s.id, { stamp: s, page, measure: notebookMeasureAt(page, s, before.settings) }] as const)));
  const pages = next.pages.map((page): StaffPage => {
    let stamps = (page.stamps ?? []).map((s) => {
      const prior = old.get(s.id);
      const samePosition = prior && prior.stamp.x === s.x && prior.stamp.y === s.y;
      const count = page.measureCounts?.[rowAt(s.y, page.staffCount ?? 7)] ?? measuresInRow(next.settings);
      const measure = isManualBar(s)
        ? prior?.stamp.measure ?? (prior
          ? notebookMeasureRegions(prior.page, before.settings).find((r) => r.row === rowAt(prior.stamp.y, prior.page.staffCount ?? 7) && Math.abs(r.left - prior.stamp.x) < 1)?.index
          : undefined)
        : samePosition ? prior.measure : s.measure;
      return { ...s, measure: measure === undefined ? undefined : Math.max(0, Math.min(count - 1, measure)) };
    });
    // Resolve new pins against the old grid, not against a grid altered by the
    // insertion itself. Moving a pin cannot cross another pinned boundary.
    for (let row = 0; row < (page.staffCount ?? 7); row++) {
      const count = page.measureCounts?.[row] ?? measuresInRow(next.settings);
      const bars = stamps.filter((s) => isManualBar(s) && rowAt(s.y, page.staffCount ?? 7) === row &&
        s.x > 39 && s.x < naturalPaperWidth(page) - 39);
      if (bars.length > count - 1) throw new Error("MANUAL_BAR_LIMIT");
      const used = new Set(bars.filter((s) => s.measure !== undefined).map((s) => s.measure!));
      for (const bar of bars.filter((s) => s.measure === undefined)) {
        const available = Array.from({ length: count - 1 }, (_, i) => i + 1).filter((i) => !used.has(i));
        const index = available.sort((a, b) => Math.abs(38 + (naturalPaperWidth(page) - 76) * a / count - bar.x) -
          Math.abs(38 + (naturalPaperWidth(page) - 76) * b / count - bar.x))[0];
        bar.measure = index; used.add(index);
      }
      if (used.size !== bars.length || used.has(0)) throw new Error("MANUAL_BAR_LIMIT");
      bars.sort((a, b) => a.measure! - b.measure!);
      let left = 38;
      bars.forEach((bar, i) => {
        const right = Math.min(...bars.slice(i + 1).map((b) => b.x), naturalPaperWidth(page) - 38);
        bar.x = Math.max(left + 2, Math.min(right - 2, bar.x));
        left = bar.x;
      });
    }
    const grid = { ...page, stamps };
    stamps = stamps.map((s) => ({ ...s, measure: notebookMeasureAt(grid, s, next.settings) }));
    // Attachments and tuplets share their owning object's measure, even while
    // freehand geometry temporarily overlaps a visual boundary.
    for (const group of page.tuplets ?? []) {
      const leader = stamps.find((s) => group.stampIds.includes(s.id));
      if (leader) stamps = stamps.map((s) => group.stampIds.includes(s.id) ? { ...s, measure: leader.measure } : s);
    }
    stamps = stamps.map((s) => s.attachTo ? { ...s, measure: stamps.find((p) => p.id === s.attachTo)?.measure ?? s.measure } : s);
    return { ...page, stamps };
  });
  return { ...next, pages };
}
