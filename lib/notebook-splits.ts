import type { NotebookSplit, StaffNotebook, StaffStamp } from "./staff-notebook";
import { notebookStampMeasure } from "./notebook-measures";
import { ROW_HEIGHT, rowAt } from "./staff-notebook-layout";

export const NOTEBOOK_VALUES = { whole: 4, half: 2, quarter: 1, eighth: .5, sixteenth: .25, thirty_second: .125 } as Record<string, number>;
export const notebookSourceId = (s: StaffStamp) => s.split?.sourceId ?? s.id;
export const restoreNotebookStamp = (s: StaffStamp): StaffStamp => !s.split ? s : {
  ...s, id: s.split.sourceId, split: undefined,
  // Clear the display-only duration and ties even when absent in the original.
  glyph: s.split.original.glyph, dotted: s.split.original.dotted,
  durationBeats: s.split.original.durationBeats, tieTo: s.split.original.tieTo, tieFrom: s.split.original.tieFrom,
};

export function indexNotebookSplits(note: StaffNotebook) {
  const groups = new Map<string, { stamp: StaffStamp; pageIndex: number }[]>();
  note.pages.forEach((page, pageIndex) => page.stamps?.forEach((stamp) => {
    if (!stamp.split) return;
    const group = groups.get(stamp.split.sourceId) ?? [];
    group.push({ stamp, pageIndex });
    groups.set(stamp.split.sourceId, group);
  }));
  for (const group of groups.values()) group.sort((a, b) => a.stamp.split!.index - b.stamp.split!.index);
  return groups;
}

const legacyId = /^(.*):split:([1-9]\d*)$/;
const nearly = (a: number, b: number) => Math.abs(a - b) < 1e-7;

/** Recognize only intact output from the old splitter. Never write on load. */
export function identifyLegacyNotebookSplits(note: StaffNotebook): StaffNotebook {
  const splitIds = new Map<string, Map<number, StaffStamp[]>>();
  const owners = new Map<StaffStamp, number>();
  const byId = new Map<string, StaffStamp[]>();
  const references = new Set<string>();
  note.pages.forEach((page, pi) => {
    page.tuplets?.forEach((group) => group.stampIds.forEach((id) => references.add(id)));
    page.stamps?.forEach((s) => {
      byId.set(s.id, [...(byId.get(s.id) ?? []), s]);
      owners.set(s, pi);
      if (s.split) return;
      const match = legacyId.exec(s.id);
      if (!match) return;
      const group = splitIds.get(match[1]) ?? new Map<number, StaffStamp[]>();
      const index = Number(match[2]);
      group.set(index, [...(group.get(index) ?? []), s]);
      splitIds.set(match[1], group);
    });
  });
  if (!splitIds.size) return note;
  for (const s of owners.keys()) if (s.attachTo && legacyId.test(s.attachTo)) references.add(s.attachTo);
  const recovered = new Map<StaffStamp, NotebookSplit>();
  const meter = note.settings?.notationMeter ?? { beats: 4, unit: 4 };
  const capacity = meter.beats * 4 / meter.unit;
  const measureOf = (s: StaffStamp) => {
    const page = note.pages[owners.get(s)!];
    return notebookStampMeasure(page, s, note.settings);
  };
  for (const [sourceId, fragments] of splitIds) {
    const roots = byId.get(sourceId);
    if (legacyId.test(sourceId) || roots?.length !== 1 || roots[0].split) continue;
    const head = roots[0], rest = head.glyph.startsWith("rest-");
    const chain = [head];
    for (let i = 1; i <= fragments.size; i++) {
      const piece = fragments.get(i);
      if (piece?.length !== 1 || byId.get(piece[0].id)?.length !== 1 || splitIds.has(piece[0].id)) break;
      chain.push(piece[0]);
    }
    if (chain.length !== fragments.size + 1 || chain.some((s, i) =>
      s.attachTo || s.generated || s.chordId || references.has(s.id) ||
      s.role !== head.role || s.size !== head.size || (i > 0 && s.erasures?.length) ||
      !nearly(s.y % ROW_HEIGHT, head.y % ROW_HEIGHT) || s.glyph.startsWith("rest-") !== rest ||
      !s.durationBeats || !nearly(s.durationBeats, (NOTEBOOK_VALUES[s.glyph.replace(/^rest-/, "")] ?? 0) * (s.dotted ? 1.5 : 1)) ||
      (rest ? !!(s.tieTo || s.tieFrom) : s.tieTo !== chain[i + 1]?.id || s.tieFrom !== chain[i - 1]?.id))) continue;
    // Legacy rests have no ties: require adjacent, uninterrupted time slots
    // across a real boundary in addition to the old splitter's ID pattern.
    if (rest && !chain.slice(1).every((s, i) => {
      const prev = chain[i];
      const pi = owners.get(s)!, priorPi = owners.get(prev)!;
      const r = rowAt(s.y, note.pages[pi].staffCount ?? 7), priorR = rowAt(prev.y, note.pages[priorPi].staffCount ?? 7);
      if (s.order === undefined || prev.order === undefined) return false;
      if (pi === priorPi && r === priorR && measureOf(s) === measureOf(prev)) return nearly(s.order, prev.order + prev.durationBeats!);
      const nextBar = pi === priorPi && r === priorR && measureOf(s) === measureOf(prev) + 1;
      const priorPage = note.pages[priorPi];
      const nextRow = pi === priorPi && r === priorR + 1 ||
        pi === priorPi + 1 && priorR === (priorPage.staffCount ?? 7) - 1 && r === 0;
      return (nextBar || nextRow && measureOf(s) === 0) && nearly(s.order, 0) && nearly(prev.order + prev.durationBeats!, capacity);
    })) continue;
    const total = chain.reduce((sum, s) => sum + s.durationBeats!, 0);
    const original = Object.entries(NOTEBOOK_VALUES).flatMap(([glyph, value]) => [
      { glyph, dotted: false, value }, { glyph, dotted: true, value: value * 1.5 },
    ]).find((candidate) => nearly(candidate.value, total));
    if (!original) continue;
    chain.forEach((s, index) => recovered.set(s, { sourceId, index, original: { glyph: (rest ? "rest-" : "") + original.glyph, dotted: original.dotted } }));
  }
  return recovered.size ? { ...note, pages: note.pages.map((p) => ({ ...p,
    stamps: p.stamps?.map((s) => recovered.has(s) ? { ...s, split: recovered.get(s)! } : s),
  })) } : note;
}

/** Refuse to rearrange ambiguous old data rather than deduplicating it or guessing the original. */
export function assertNotebookSplitsReflowable(note: StaffNotebook) {
  const ids = new Set<string>();
  for (const page of note.pages) for (const s of page.stamps ?? []) {
    if (ids.has(s.id) || !s.split && (legacyId.test(s.id) ||
      s.tieTo?.startsWith(`${s.id}:split:`) && !note.pages.some((p) => p.stamps?.some((target) => target.id === s.tieTo && target.split))))
      throw new Error("NOTEBOOK_AMBIGUOUS_SPLIT");
    ids.add(s.id);
  }
  for (const [sourceId, parts] of indexNotebookSplits(note)) {
    if (parts.length < 2 || parts[0].stamp.id !== sourceId ||
      parts.some(({ stamp }, index) => stamp.split!.index !== index)) throw new Error("NOTEBOOK_AMBIGUOUS_SPLIT");
  }
}
