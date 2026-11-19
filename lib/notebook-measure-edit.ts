import type { StaffNotebook, StaffStamp } from "./staff-notebook";
import { notebookStampMeasure } from "./notebook-measures";
import { indexNotebookSplits, restoreNotebookStamp } from "./notebook-splits";
import { normalizeNotebookSections } from "./notebook-sections";

/**
 * Refresh derived measure metadata against the edited geometry. Manual lines
 * define the effective measures; old stamp.measure values cannot pin ownership
 * across a moved boundary. This step never moves objects or changes durations.
 * Automatic spacing, if requested, is a separate document transaction.
 */
export function prepareNotebookMeasureEdit(before: StaffNotebook, next: StaffNotebook): StaffNotebook {
  const splits = indexNotebookSplits(before);
  if (splits.size) {
    const locations = new Map(next.pages.flatMap((page, pageIndex) => (page.stamps ?? []).map((stamp) => [stamp.id, { stamp, pageIndex }] as const)));
    const removed = new Set<string>();
    const replacements = new Map<string, StaffStamp>();
    const anchorShifts = new Map<number, StaffStamp>();
    let lastNote = next.lastNote;
    for (const [sourceId, pieces] of splits) {
      const head = pieces[0];
      if (!head || head.stamp.id !== sourceId) continue;
      const current = locations.get(sourceId);
      const missing = pieces.some(({ stamp }) => !locations.has(stamp.id));
      const moved = pieces.flatMap(({ stamp, pageIndex }) => {
        const candidate = locations.get(stamp.id);
        return candidate && (candidate.pageIndex !== pageIndex || candidate.stamp.x !== stamp.x || candidate.stamp.y !== stamp.y ||
          candidate.stamp.size !== stamp.size || candidate.stamp.chordId !== stamp.chordId || candidate.stamp.role !== stamp.role ||
          JSON.stringify(candidate.stamp.split?.original) !== JSON.stringify(stamp.split?.original)) ? [candidate] : [];
      });
      if (!missing && !moved.length) continue;
      pieces.forEach(({ stamp }) => removed.add(stamp.id));
      if (missing || !current) {
        next.pages.forEach((page) => page.stamps?.forEach((s) => { if (s.attachTo === sourceId) removed.add(s.id); }));
        if (lastNote?.stampId === sourceId) lastNote = undefined;
      }
      const target = !missing && current ? moved[0] : undefined;
      const restored = target && current ? {
        ...restoreNotebookStamp(current.stamp), x: target.stamp.x, y: target.stamp.y, size: target.stamp.size,
        chordId: target.stamp.chordId, role: target.stamp.role,
      } : undefined;
      if (target && restored && current) {
        replacements.set(target.stamp.id, restored);
        if (lastNote?.stampId === sourceId) lastNote = { ...lastNote, pageId: next.pages[target.pageIndex].id };
        if (target.pageIndex !== current.pageIndex) {
          const marks = next.pages[current.pageIndex].stamps?.filter((s) => s.attachTo === sourceId) ?? [];
          if (marks.length) next = { ...next, pages: next.pages.map((p, i) => i === target.pageIndex ? {
            ...p, stamps: [...(p.stamps ?? []), ...marks.map((s) => ({ ...s, x: s.x - current.stamp.x + restored.x, y: s.y - current.stamp.y + restored.y }))],
          } : i === current.pageIndex ? { ...p, stamps: p.stamps?.filter((s) => s.attachTo !== sourceId) } : p) };
        }
      }
      for (const { stamp, pageIndex } of pieces) {
        const candidate = locations.get(stamp.id);
        const pi = candidate?.pageIndex ?? pageIndex, existing = next.pages[pi]?.anchor;
        const position = candidate?.stamp ?? stamp;
        if (restored && pi === target?.pageIndex && existing && Math.abs(existing.x - position.x) < 1 && Math.abs(existing.y - position.y) < 1)
          anchorShifts.set(pi, restored);
      }
    }
    if (removed.size) next = { ...next, lastNote, pages: next.pages.map((p, index) => {
      const shift = anchorShifts.get(index);
      return { ...p, anchor: shift ? { x: shift.x, y: shift.y } : p.anchor,
        stamps: p.stamps?.flatMap((s) => {
          const replacement = replacements.get(s.id);
          if (replacement) return [replacement];
          if (removed.has(s.id)) return [];
          return [{ ...s, tieTo: s.tieTo && removed.has(s.tieTo) ? undefined : s.tieTo,
            tieFrom: s.tieFrom && removed.has(s.tieFrom) ? undefined : s.tieFrom }];
        }),
      };
    }) };
  }
  next = normalizeNotebookSections(before, next);
  return {
    ...next,
    pages: next.pages.map((page) => ({
      ...page,
      stamps: page.stamps?.map((s) => ({ ...s, measure: notebookStampMeasure(page, s, next.settings) })),
    })),
  };
}
