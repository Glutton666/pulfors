import type { StaffNotebook, StaffPage, StaffStamp, StaffTuplet, StaffStroke } from "./staff-notebook";
import { notebookRows, ROW_HEIGHT, rowAt } from "./staff-notebook-layout";
import { measuresInRow, naturalPaperWidth, notebookMeasureRegions, notebookMeasureAt } from "./notebook-music-layout";
import { buildNotebookPlan } from "./notebook-playback-plan";
import { followNotebookSigns } from "./notebook-navigation";

export const isNavigationSign = (s: StaffStamp) => /^(repeat_start|repeat_end|repeat_both|volta1|volta2|segno|coda|da_capo|dal_segno|dal_segno_coda|da_capo_coda|fine)$/.test(s.glyph);
function seeded(seed: number) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296; };
}
function shuffle<T>(items: T[], rng: () => number) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
type Packet = { stamps: StaffStamp[]; strokes: StaffStroke[]; groups: StaffTuplet[]; left: number; width: number; y: number; origin: number; measureCount: number };
function validate(note: StaffNotebook) {
  const perRow = measuresInRow(note.settings);
  const rows = notebookRows(note);
  const base = buildNotebookPlan(rows, [{ source: 0, startMs: 0, endMs: 1 }], perRow, false, Math.random, rows.map((r) => note.pages[r.pageIndex].measureCounts?.[r.rowIndex] ?? perRow));
  followNotebookSigns(note, base, perRow);
}
/** Stable for a seed. The original notebook is never mutated or used as a shuffle buffer. */
export function randomizeNotebook(note: StaffNotebook): StaffNotebook {
  if (!note.settings?.random) return note;
  const settings = note.settings, perRow = measuresInRow(settings), rowMode = settings.randomUnit !== "measure";
  const rng = seeded(settings.randomSeed ?? 1);
  const packets: Packet[] = [];
  note.pages.forEach((page) => {
    const regions = notebookMeasureRegions(page, settings);
    const regionsToUse = rowMode ? Array.from({ length: page.staffCount ?? 7 }, (_, row) => ({ row, index: 0, left: 38, right: naturalPaperWidth(page) - 38 })) : regions;
    regionsToUse.forEach((r) => {
      const stamps = (page.stamps ?? []).filter((s) => rowAt(s.y, page.staffCount ?? 7) === r.row && (rowMode || notebookMeasureAt(page, s, settings) === r.index));
      const ids = new Set(stamps.map((s) => s.id));
      packets.push({ stamps, strokes: page.strokes.filter((s) => {
        const p = s.points[0]; return p && rowAt(p.y, page.staffCount ?? 7) === r.row && (rowMode || p.x >= r.left && p.x < r.right);
      }), groups: (page.tuplets ?? []).filter((g) => g.stampIds.every((id) => ids.has(id))), left: r.left, width: r.right - r.left, y: r.row * ROW_HEIGHT, origin: packets.length, measureCount: page.measureCounts?.[r.row] ?? perRow });
    });
  });
  const allGroups = note.pages.flatMap((p) => p.tuplets ?? []);
  const packetOf = new Map(packets.flatMap((p, i) => p.stamps.map((s) => [s.id, i] as const)));
  const signs = packets.flatMap((p, index) => p.stamps.filter(isNavigationSign).sort((a, b) => a.x - b.x).map((s) => ({ stamp: s, index })));
  if (signs.length) validate(note);
  const spans: [number, number][] = [];
  const stack: number[] = [];
  const pairStack: number[] = [], signPairs: [number, number][] = [];
  signs.forEach(({ stamp: s, index }, signIndex) => {
    if (s.glyph === "repeat_start") stack.push(index);
    if (s.glyph === "repeat_start") pairStack.push(signIndex);
    if (s.glyph === "repeat_end" || s.glyph === "repeat_both") {
      spans.push([stack.pop() ?? 0, index]); signPairs.push([pairStack.pop() ?? -1, signIndex]);
      if (s.glyph === "repeat_both") { stack.push(Math.min(packets.length - 1, index + 1)); pairStack.push(signIndex); }
    }
    if (/^(da_capo|dal_segno)/.test(s.glyph)) {
      const target = s.glyph.startsWith("dal_segno") ? signs.find((x) => x.stamp.glyph === "segno")?.index ?? 0 : 0;
      spans.push([target, index]);
      if (s.glyph.endsWith("_coda")) {
        const coda = signs.filter((x) => x.stamp.glyph === "coda").map((x) => x.index);
        if (coda.length) spans.push([Math.min(target, ...coda), Math.max(index, ...coda)]);
      }
    }
  });
  // Alternative endings belong to the same protected repeat block.
  for (const first of signs.filter((s) => s.stamp.glyph === "volta1")) {
    const pair = spans.filter(([start, end]) => start <= first.index && end >= first.index).sort((a, b) => a[1] - b[1])[0];
    const second = pair && signs.find((s) => s.stamp.glyph === "volta2" && s.index >= pair[1] && s.index <= pair[1] + 1);
    if (pair && second) pair[1] = Math.min(packets.length - 1, second.index + pair[1] - first.index);
  }
  const atomicSpans: [number, number][] = allGroups.flatMap((g) => {
    const positions = g.stampIds.map((id) => packetOf.get(id)).filter((n): n is number => n !== undefined);
    return positions.length ? [[Math.min(...positions), Math.max(...positions)] as [number, number]] : [];
  });
  for (const packet of packets) for (const s of packet.stamps) if (s.tieTo && packetOf.has(s.tieTo))
    atomicSpans.push([Math.min(packetOf.get(s.id)!, packetOf.get(s.tieTo)!), Math.max(packetOf.get(s.id)!, packetOf.get(s.tieTo)!)]);
  const protectedSpans = [...atomicSpans, ...(!settings.randomSigns ? spans : [])];
  protectedSpans.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const span of protectedSpans) {
    const last = merged.at(-1);
    if (last && span[0] <= last[1]) last[1] = Math.max(last[1], span[1]); else merged.push([...span]);
  }
  const blocks: Packet[][] = [];
  for (let i = 0; i < packets.length;) {
    const span = merged.find(([start]) => start === i);
    const end = span?.[1] ?? i;
    let block = packets.slice(i, end + 1);
    if (span && settings.randomInside && !settings.randomSigns) {
      // Signs define control-flow boundaries. Only unsigned interiors are permuted.
      const parts: { items: Packet[]; fixed: boolean }[] = [];
      for (let at = i; at <= end;) {
        const inner = protectedSpans.filter(([a, b]) => a === at && (a > i || b < end) && b <= end).sort((a, b) => b[1] - a[1])[0];
        const last = inner?.[1] ?? at;
        const items = packets.slice(at, last + 1);
        const fixed = !inner && items.some((p) => p.stamps.some(isNavigationSign));
        parts.push({ items, fixed }); at = last + 1;
      }
      const reordered = shuffle(parts.filter((p) => !p.fixed).map((p) => p.items), rng);
      let cursor = 0;
      block = parts.flatMap((p) => p.fixed ? p.items : reordered[cursor++]);
    }
    blocks.push(block); i = end + 1;
  }
  const order = shuffle(blocks, rng).flat();
  const build = (signDestinations?: number[]): StaffNotebook => {
    const pages = note.pages.map((p) => ({ ...p, measureCounts: [...(p.measureCounts ?? Array(p.staffCount ?? 7).fill(perRow))], stamps: [] as StaffStamp[], strokes: [] as StaffStroke[], tuplets: [] as StaffTuplet[] }));
    const targets: { page: StaffPage; row: number; measure: number; left: number; width: number }[] = [];
    pages.forEach((p) => {
      const rs = rowMode ? Array.from({ length: p.staffCount ?? 7 }, (_, row) => ({ row, index: 0, left: 38, right: naturalPaperWidth(p) - 38 })) : notebookMeasureRegions(p, settings);
      rs.forEach((r) => targets.push({ page: p, row: r.row, measure: r.index, left: r.left, width: r.right - r.left }));
    });
    order.forEach((packet, index) => {
      const target = targets[index], factor = target.width / packet.width;
      if (rowMode) target.page.measureCounts![target.row] = packet.measureCount;
      const point = (x: number, y: number) => ({ x: target.left + (x - packet.left) * factor, y: y - packet.y + target.row * ROW_HEIGHT });
      target.page.stamps!.push(...packet.stamps.filter((s) => !settings.randomSigns || !isNavigationSign(s)).map((s) => ({ ...s, ...point(s.x, s.y), measure: rowMode ? s.measure : target.measure })));
      target.page.strokes.push(...packet.strokes.map((s) => ({ ...s, points: s.points.map((p) => point(p.x, p.y)) })));
    });
    if (signDestinations) signs.forEach(({ stamp }, i) => {
      const t = targets[signDestinations[i]], startSign = /^(repeat_start|segno|coda|volta)/.test(stamp.glyph);
      t.page.stamps!.push({ ...stamp, x: t.left + t.width * (startSign ? .06 : .9), y: t.row * ROW_HEIGHT + 102, measure: rowMode ? startSign ? 0 : perRow - 1 : t.measure });
    });
    for (const group of allGroups) {
      const page = pages.find((p) => group.stampIds.every((id) => p.stamps.some((s) => s.id === id)));
      if (!page) throw new Error("RANDOM_GROUP_PAGE_BOUNDARY");
      page.tuplets.push(group);
    }
    pages.forEach((p) => { const s = p.stamps.filter((s) => !s.generated).at(-1); p.anchor = s ? { x: s.x, y: s.y } : undefined; });
    const owner = note.lastNote && pages.find((p) => p.stamps.some((s) => s.id === note.lastNote!.stampId));
    return { ...note, pages, lastNote: owner && note.lastNote ? { ...note.lastNote, pageId: owner.id } : undefined };
  };
  if (!settings.randomSigns || !signs.length) { const result = build(); if (signs.length) validate(result); return result; }
  // Shuffle sign locations independently of music, preserving valid control flow.
  for (let attempt = 0; attempt < 128; attempt++) {
    const destinations = signs.map(() => Math.floor(rng() * packets.length));
    const pairs = signPairs.map(([a, b]) => [a < 0 ? 0 : destinations[a], destinations[b]]);
    if (pairs.some(([a, b]) => a > b) || pairs.some(([a, b], i) => pairs.slice(i + 1).some(([c, d]) => a < c && c <= b && b < d || c < a && a <= d && d < b))) continue;
    const codas = signs.map(({ stamp }, i) => stamp.glyph === "coda" ? i : -1).filter((i) => i >= 0);
    if (codas.length === 2 && destinations[codas[0]] >= destinations[codas[1]]) continue;
    try { const result = build(destinations); validate(result); return result; } catch { /* bounded rejection sampling */ }
  }
  throw new Error("RANDOM_NAVIGATION_UNAVAILABLE");
}
