import type { NotebookSettings, StaffNotebook, StaffPage, StaffStamp, StaffTuplet } from "./staff-notebook";
import { ROW_HEIGHT, rowAt, inkInRow } from "./staff-notebook-layout";
import { NOTEBOOK_LEFT, NOTEBOOK_SPAN, isManualBar, measuresInRow, naturalPaperWidth, notebookMeasureRegions } from "./notebook-measures";
export { NOTEBOOK_LEFT, NOTEBOOK_SPAN, isManualBar, measuresInRow, naturalPaperWidth, notebookMeasureRegions } from "./notebook-measures";
export type { NotebookMeasureRegion } from "./notebook-measures";
export { notebookStampMeasure as notebookMeasureAt } from "./notebook-measures";

const EPS = 1e-7;
const values: Record<string, number> = { whole: 4, half: 2, quarter: 1, eighth: .5, sixteenth: .25, thirty_second: .125 };
export const isMusic = (s: StaffStamp) => /^(rest-)?(whole|half|quarter|eighth|sixteenth|thirty_second)$/.test(s.glyph);
export const notationMeter = (settings?: Partial<NotebookSettings>) => settings?.notationMeter ?? { beats: 4, unit: 4 as const };
export const measureDuration = (settings?: Partial<NotebookSettings>) => {
  const m = notationMeter(settings); return m.beats * 4 / m.unit;
};
export const writtenDuration = (s: StaffStamp) => s.durationBeats ?? (values[s.glyph.replace(/^rest-/, "")] ?? 0) * (s.dotted ? 1.5 : 1);
export function standardTupletRatio(count: number) {
  const actual = Math.max(2, count);
  return { actual, normal: actual === 2 ? 3 : (actual & (actual - 1)) === 0 ? actual * 3 / 4 : 2 ** Math.floor(Math.log2(actual)) };
}
export const tupletRatio = (t: StaffTuplet) => t.ratio ?? standardTupletRatio(t.stampIds.length);
export function musicalDuration(s: StaffStamp, groups: StaffTuplet[]) {
  return groups.filter((g) => g.stampIds.includes(s.id)).reduce((d, g) => {
    const r = tupletRatio(g); return d * r.normal / r.actual;
  }, writtenDuration(s));
}
type Unit = { stamps: StaffStamp[]; groups: StaffTuplet[]; duration: number; sourceRow: number; sourceMeasure?: number };
type Placed = { unit: Unit; row: number; measure: number; start: number; duration: number };
export type MusicLayoutOptions = { allowCrowded?: boolean; spillVisual?: boolean; openGroup?: StaffTuplet };
export type MusicLayoutResult = { note: StaffNotebook; reason: "changed" | "unchanged" | "crowded"; requiredScale: number };

function envelope(s: StaffStamp, attachments: StaffStamp[]) {
  const scale = s.size / 26;
  let left = 12 * scale, right = (s.dotted || s.role === "ghost" ? 29 : 23) * scale;
  for (const a of attachments.filter((a) => a.attachTo === s.id)) {
    const half = Math.max(15, a.glyph.length > 12 ? 40 : 15) * a.size / 26;
    left = Math.max(left, s.x - a.x + half); right = Math.max(right, a.x - s.x + half);
  }
  if (!isMusic(s)) left = right = Math.max(15, /^(da_|dal_)/.test(s.glyph) ? 55 : 18) * scale;
  return { left, right };
}
function unitWidth(unit: Unit, attachments: StaffStamp[]) {
  const chords = new Map<string, StaffStamp[]>();
  for (const s of unit.stamps) { const key = s.chordId ?? s.id; chords.set(key, [...(chords.get(key) ?? []), s]); }
  return [...chords.values()].reduce((sum, members) => sum + Math.max(...members.map((s) => {
    const e = envelope(s, attachments); return e.left + e.right + 12;
  })), 0);
}
function fragmentGlyph(duration: number, rest: boolean) {
  const candidates = Object.entries(values).flatMap(([glyph, value]) => [{ glyph, value, dotted: false }, { glyph, value: value * 1.5, dotted: true }]);
  const best = candidates.filter((c) => c.value <= duration + EPS).sort((a, b) => b.value - a.value)[0] ?? candidates.at(-2)!;
  return { glyph: (rest ? "rest-" : "") + best.glyph, dotted: best.dotted, duration: Math.min(duration, best.value) };
}

/** Transactional, duration-aware reflow. No mutation on an unaccepted visual overflow. */
export function layoutNotebookMusic(input: StaffNotebook, options: MusicLayoutOptions = {}): MusicLayoutResult {
  const settings = input.settings, capacity = measureDuration(settings), perRow = measuresInRow(settings);
  const rowsPerPage = settings?.rowsPerPage ?? input.pages[0]?.staffCount ?? 7;
  const rowOffsets: number[] = []; let totalRows = 0;
  input.pages.forEach((p) => { rowOffsets.push(totalRows); totalRows += p.staffCount ?? 7; });
  const originals = input.pages.flatMap((p) => p.stamps ?? []);
  if (!originals.length) return { note: input, reason: "unchanged", requiredScale: 1 };
  const attachments = originals.filter((s) => !!s.attachTo);
  const allGroups = [...input.pages.flatMap((p) => p.tuplets ?? []), ...(options.openGroup ? [options.openGroup] : [])];
  const unitsByRow = new Map<number, Unit[]>();
  const completed = new Set<number>(), blank = new Set<number>();
  const rowCounts = new Map<number, number>();
  const configuredCounts = new Map<number, number>();
  // Normalized geometry survives page scaling without moving an intentional
  // boundary relative to its row. The saved count remains a separate fallback.
  const manualRows = new Map<number, { bounds: number[]; bars: StaffStamp[] }>();
  input.pages.forEach((p, pi) => {
    const regions = notebookMeasureRegions(p, settings);
    for (let r = 0; r < (p.staffCount ?? 7); r++) {
      const global = rowOffsets[pi] + r, rs = regions.filter((v) => v.row === r);
      const bars = (p.stamps ?? []).filter((s) => isManualBar(s) && rowAt(s.y, p.staffCount ?? 7) === r);
      configuredCounts.set(global, p.measureCounts?.[r] ?? perRow);
      rowCounts.set(global, rs.length);
      if (bars.length) manualRows.set(global, {
        bounds: [...rs.map((v) => (v.left - NOTEBOOK_LEFT) / (naturalPaperWidth(p) - 76)), 1],
        bars: bars.map((s) => ({ ...s, x: (s.x - NOTEBOOK_LEFT) / (naturalPaperWidth(p) - 76) })),
      });
    }
    p.completedRows?.forEach((r) => completed.add(rowOffsets[pi] + r));
    p.blankRows?.forEach((r) => blank.add(rowOffsets[pi] + r));
    const stamps = (p.stamps ?? []).filter((s) => !s.generated && !s.attachTo && !isManualBar(s));
    const byId = new Map(stamps.map((s) => [s.id, s]));
    const consumed = new Set<string>();
    for (const s of [...stamps].sort((a, b) => rowAt(a.y, p.staffCount ?? 7) - rowAt(b.y, p.staffCount ?? 7) || a.x - b.x || (a.order ?? 0) - (b.order ?? 0))) {
      if (consumed.has(s.id)) continue;
      const group = allGroups.filter((g) => g.stampIds.includes(s.id)).sort((a, b) => b.stampIds.length - a.stampIds.length)[0];
      const members = group ? group.stampIds.map((id) => byId.get(id)).filter((s): s is StaffStamp => !!s).sort((a, b) => a.x - b.x)
        : s.chordId ? stamps.filter((x) => x.chordId === s.chordId) : [s];
      members.forEach((x) => consumed.add(x.id));
      const sourceRow = rowOffsets[pi] + rowAt(s.y, p.staffCount ?? 7);
      const groups = group ? allGroups.filter((g) => g.stampIds.every((id) => members.some((m) => m.id === id))) : [];
      const chordDurations = new Map<string, number>();
      members.forEach((m) => chordDurations.set(m.chordId ?? m.id, Math.max(chordDurations.get(m.chordId ?? m.id) ?? 0, musicalDuration(m, groups))));
      const localRow = sourceRow - rowOffsets[pi];
      const sourceMeasure = manualRows.get(sourceRow)?.bars.some((s) => s.x > 1 / (naturalPaperWidth(p) - 76) && s.x < 1 - 1 / (naturalPaperWidth(p) - 76))
        ? regions.find((r) => r.row === localRow && s.x < r.right)?.index ?? rowCounts.get(sourceRow)! - 1
        : undefined;
      const unit: Unit = { stamps: members, groups, sourceRow, sourceMeasure, duration: [...chordDurations.values()].reduce((a, b) => a + b, 0) };
      if (group && unit.duration > capacity + EPS) throw new Error("TUPLET_EXCEEDS_MEASURE");
      unitsByRow.set(sourceRow, [...(unitsByRow.get(sourceRow) ?? []), unit]);
    }
  });
  const placed: Placed[] = [];
  let carry: Unit[] = [], row = 0;
  // A malicious/imported document cannot cause unbounded row generation.
  for (; row < totalRows || carry.length; row++) {
    const rowBars = rowCounts.get(row) ?? perRow;
    if (row >= 4000) throw new Error("NOTEBOOK_LAYOUT_LIMIT");
    if (blank.has(row)) {
      if (unitsByRow.get(row)?.length) carry.push(...unitsByRow.get(row)!);
      continue;
    }
    const queue = [...carry, ...(unitsByRow.get(row) ?? [])]; carry = [];
    let measure = 0, at = 0;
    while (queue.length) {
      const unit = queue.shift()!;
      if (unit.sourceRow === row && unit.sourceMeasure !== undefined && unit.sourceMeasure > measure) {
        measure = unit.sourceMeasure; at = 0;
      }
      const startsBoundary = /^(repeat_start|segno|volta1|volta2)$/.test(unit.stamps[0].glyph);
      if (at >= capacity - EPS && (unit.duration > 0 || startsBoundary)) { at = 0; measure++; }
      if (measure >= rowBars) { carry = [unit, ...queue]; break; }
      if (unit.groups.length && at + unit.duration > capacity + EPS) {
        measure++; at = 0;
        if (measure >= rowBars) { carry = [unit, ...queue]; break; }
      }
      if (unit.duration > capacity - at + EPS && !unit.groups.length && unit.stamps.length === 1 && isMusic(unit.stamps[0])) {
        const original = unit.stamps[0], rest = original.glyph.startsWith("rest-");
        let remaining = unit.duration, offset = 0;
        const pieces: { stamp: StaffStamp; duration: number }[] = [];
        while (remaining > EPS) {
          const available = offset ? capacity : capacity - at;
          const part = fragmentGlyph(Math.min(remaining, available), rest);
          const partId = offset ? `${original.id}:split:${offset}` : original.id;
          pieces.push({ stamp: { ...original, glyph: part.glyph, dotted: part.dotted, durationBeats: part.duration, id: partId, tieTo: undefined }, duration: part.duration });
          remaining -= part.duration; offset++;
        }
        pieces.forEach((p, i) => { if (!rest) {
          p.stamp.tieTo = pieces[i + 1]?.stamp.id ?? original.tieTo;
          p.stamp.tieFrom = pieces[i - 1]?.stamp.id ?? original.tieFrom;
        } });
        queue.unshift(...pieces.map((p) => ({ ...unit, stamps: [p.stamp], duration: p.duration })));
        continue;
      }
      const record = { unit, row, measure, start: at, duration: unit.duration };
      placed.push(record); at += unit.duration;
    }
    if (carry.length) completed.add(row);
    if (completed.has(row)) {
      for (let m = 0; m < rowBars; m++) {
        const used = placed.filter((p) => p.row === row && p.measure === m).reduce((max, p) => Math.max(max, p.start + p.duration), 0);
        let remaining = capacity - used, start = used, i = 0;
        while (remaining > EPS) {
          const f = fragmentGlyph(remaining, true);
          const stamp: StaffStamp = { id: `auto-rest:${input.id}:${row}:${m}:${i++}`, glyph: f.glyph, dotted: f.dotted, durationBeats: f.duration, generated: true, x: 0, y: 102 + row * ROW_HEIGHT, size: 26 };
          placed.push({ unit: { stamps: [stamp], groups: [], duration: f.duration, sourceRow: row }, row, measure: m, start, duration: f.duration });
          remaining -= f.duration; start += f.duration;
        }
      }
    }
  }
  let rowCount = Math.max(totalRows, row);
  // Ordinary musical reflow leaves ink fixed. Visual spill inserts physical rows,
  // so the later original rows (including ink-only/blank rows) move as units.
  const structuralRows = new Map(Array.from({ length: rowCount }, (_, r) => [r, { first: r, last: r }]));
  const regionFraction = (r: number, m: number) => {
    const bounds = manualRows.get(r)?.bounds;
    return bounds ? bounds[m + 1] - bounds[m] : 1 / (rowCounts.get(r) ?? perRow);
  };
  if (options.spillVisual) {
    let extraRows = 0;
    const updatedCounts = new Map<number, number>();
    const updatedConfigured = new Map<number, number>();
    const updatedManual = new Map<number, { bounds: number[]; bars: StaffStamp[] }>();
    const sourceEntries = Array.from({ length: rowCount }, (_, r) => placed.filter((e) => e.row === r));
    for (let oldRow = 0; oldRow < rowCount; oldRow++) {
      const entries = sourceEntries[oldRow];
      let targetRow = oldRow + extraRows, maximumWidth = 0, bars = 0;
      structuralRows.set(oldRow, { first: targetRow, last: targetRow });
      if (!entries.length) {
        updatedCounts.set(targetRow, rowCounts.get(oldRow) ?? perRow);
        updatedConfigured.set(targetRow, configuredCounts.get(oldRow) ?? perRow);
        const manual = manualRows.get(oldRow);
        if (manual) updatedManual.set(targetRow, manual);
        continue;
      }
      const sourcePage = input.pages.find((_, i) => rowOffsets[i] <= oldRow && rowOffsets[i] + (input.pages[i].staffCount ?? 7) > oldRow);
      const scale = settings?.autoScale ? settings.minScale ?? .65 : sourcePage?.layoutScale ?? 1;
      const available = NOTEBOOK_SPAN / scale;
      const maxBars = rowCounts.get(oldRow) ?? perRow;
      const manual = manualRows.get(oldRow);
      let firstMeasure = 0;
      const finishRow = (lastMeasure: number) => {
        updatedCounts.set(targetRow, bars);
        updatedConfigured.set(targetRow, firstMeasure === 0 && lastMeasure === maxBars
          ? configuredCounts.get(oldRow) ?? perRow : bars);
        if (manual) {
          const left = manual.bounds[firstMeasure], right = manual.bounds[lastMeasure];
          updatedManual.set(targetRow, {
            bounds: manual.bounds.slice(firstMeasure, lastMeasure + 1).map((x) => (x - left) / (right - left)),
            bars: manual.bars.filter((s) => s.x >= left && (s.x < right || lastMeasure === maxBars))
              .map((s) => ({ ...s, x: (s.x - left) / (right - left) })),
          });
        }
        firstMeasure = lastMeasure;
      };
      for (let m = 0; m < maxBars; m++) {
        const bar = entries.filter((e) => e.measure === m);
        const width = bar.reduce((sum, e) => sum + unitWidth(e.unit, attachments), 0) + 24;
        if (width > available) return { note: input, reason: "crowded", requiredScale: NOTEBOOK_SPAN / width };
        const fraction = manual ? regionFraction(oldRow, m) : 1;
        const segment = manual ? manual.bounds[m + 1] - manual.bounds[firstMeasure] : bars + 1;
        if (bars && (Math.max(maximumWidth, width / fraction) * segment > available || bars >= maxBars)) {
          finishRow(m); targetRow++; extraRows++; bars = 0; maximumWidth = 0;
        }
        bar.forEach((e) => { e.row = targetRow; e.measure = bars; });
        bars++; maximumWidth = Math.max(maximumWidth, width / fraction);
      }
      finishRow(maxBars);
      structuralRows.get(oldRow)!.last = targetRow;
    }
    rowCounts.clear();
    updatedCounts.forEach((n, r) => rowCounts.set(r, n));
    configuredCounts.clear(); updatedConfigured.forEach((n, r) => configuredCounts.set(r, n));
    manualRows.clear(); updatedManual.forEach((v, r) => manualRows.set(r, v));
    rowCount += extraRows;
  }
  const pageCount = Math.ceil(rowCount / rowsPerPage);
  const layouts = Array.from({ length: pageCount }, (_, i) => ({
    id: input.pages[i]?.id ?? `${input.id}:page:${i}`, staffCount: rowsPerPage, strokes: [] as StaffPage["strokes"],
    stamps: [] as StaffStamp[], tuplets: [] as StaffTuplet[], layoutScale: 1, completedRows: [] as number[], blankRows: [] as number[],
    anchor: undefined as StaffPage["anchor"],
    measureCounts: Array.from({ length: rowsPerPage }, (_, r) => configuredCounts.get(i * rowsPerPage + r) ?? perRow),
  }));
  const mappedRow = (r: number) => structuralRows.get(r)?.first ?? r;
  // Preserve ink geometry within each original row. If a stroke crosses a newly
  // inserted row or page boundary, keep its row fragments rather than stranding
  // part of it on an unrelated staff or dropping off-page points.
  input.pages.forEach((p, pi) => p.strokes.forEach((s) => {
    const sourceCount = p.staffCount ?? 7;
    const ys = s.points.map((point) => point.y);
    const first = rowAt(ys.length ? Math.min(...ys) : 0, sourceCount);
    const last = rowAt(ys.length ? Math.max(...ys) : 0, sourceCount);
    const touched = Array.from({ length: last - first + 1 }, (_, i) => first + i);
    const targets = touched.map((r) => mappedRow(rowOffsets[pi] + r));
    const shifts = targets.map((r, i) => r - touched[i]);
    const pages = targets.map((r) => Math.floor(r / rowsPerPage));
    const put = (stroke: typeof s, sourceRow: number, target: number) => {
      const pageIndex = Math.floor(target / rowsPerPage), shift = (target - sourceRow - pageIndex * rowsPerPage) * ROW_HEIGHT;
      layouts[pageIndex].strokes.push({ ...stroke, points: stroke.points.map((pt) => ({ x: pt.x, y: pt.y + shift })) });
    };
    if (new Set(shifts).size === 1 && new Set(pages).size === 1) put(s, first, targets[0]);
    else touched.forEach((r, index) => inkInRow(s, r).forEach((fragment) =>
      put({ ...fragment, id: `${fragment.id}:row:${rowOffsets[pi] + r}` }, r, targets[index])));
  }));
  completed.forEach((r) => {
    const span = structuralRows.get(r) ?? { first: r, last: r };
    for (let target = span.first; target <= span.last; target++) layouts[Math.floor(target / rowsPerPage)]?.completedRows.push(target % rowsPerPage);
  });
  blank.forEach((r) => { const target = mappedRow(r); layouts[Math.floor(target / rowsPerPage)]?.blankRows.push(target % rowsPerPage); });
  // A free writing anchor belongs to its original row just like handwriting.
  // Anchors attached to a stamp are resolved by identity after musical placement.
  input.pages.forEach((p, pi) => {
    if (!p.anchor || p.stamps?.some((s) => Math.abs(s.x - p.anchor!.x) < 1 && Math.abs(s.y - p.anchor!.y) < 1)) return;
    const sourceRow = rowAt(p.anchor.y, p.staffCount ?? 7), target = mappedRow(rowOffsets[pi] + sourceRow);
    layouts[Math.floor(target / rowsPerPage)].anchor = { x: p.anchor.x, y: p.anchor.y + (target % rowsPerPage - sourceRow) * ROW_HEIGHT };
  });
  let requiredScale = 1;
  // Determine one scale per page. Every row retains its musical bar count.
  layouts.forEach((p, pi) => {
    let needed = 1;
    for (let r = pi * rowsPerPage; r < (pi + 1) * rowsPerPage; r++) for (let m = 0; m < (rowCounts.get(r) ?? perRow); m++) {
      const entries = placed.filter((x) => x.row === r && x.measure === m);
      const width = entries.reduce((sum, x) => sum + unitWidth(x.unit, attachments), 0) + 24;
      needed = Math.min(needed, NOTEBOOK_SPAN * regionFraction(r, m) / Math.max(1, width));
    }
    requiredScale = Math.min(requiredScale, needed);
    p.layoutScale = settings?.autoScale ? Math.max(settings.minScale ?? .65, needed) : (input.pages[pi]?.layoutScale ?? 1);
    if (options.allowCrowded) p.layoutScale = Math.max(.2, Math.min(p.layoutScale, needed));
  });
  const crowded = layouts.some((p, pi) => {
    for (let r = pi * rowsPerPage; r < (pi + 1) * rowsPerPage; r++) for (let m = 0; m < (rowCounts.get(r) ?? perRow); m++) {
      const width = placed.filter((x) => x.row === r && x.measure === m).reduce((s, x) => s + unitWidth(x.unit, attachments), 0) + 24;
      if (width > NOTEBOOK_SPAN / p.layoutScale * regionFraction(r, m) + EPS) return true;
    }
    return false;
  });
  if (crowded && !options.allowCrowded && !options.spillVisual) return { note: input, reason: "crowded", requiredScale };
  if (crowded && options.spillVisual) return { note: input, reason: "crowded", requiredScale };
  for (let r = 0; r < rowCount; r++) {
    const pi = Math.floor(r / rowsPerPage), page = layouts[pi], localRow = r % rowsPerPage;
    const rowBars = rowCounts.get(r) ?? perRow;
    const span = NOTEBOOK_SPAN / page.layoutScale;
    const manual = manualRows.get(r);
    manual?.bars.forEach((s) => page.stamps.push({ ...s, x: NOTEBOOK_LEFT + s.x * span,
      y: localRow * ROW_HEIGHT + 102, measure: manual.bounds.findIndex((b) => Math.abs(b - s.x) < EPS) }));
    for (let m = 0; m < rowBars; m++) {
      const regionWidth = span * regionFraction(r, m);
      const regionLeft = NOTEBOOK_LEFT + span * (manual?.bounds[m] ?? m / rowBars);
      const entries = placed.filter((x) => x.row === r && x.measure === m).sort((a, b) => a.start - b.start);
      const widths = entries.map((e) => unitWidth(e.unit, attachments));
      const slack = Math.max(0, regionWidth - 24 - widths.reduce((a, b) => a + b, 0));
      const weights = entries.map((e) => e.duration > 0 ? Math.sqrt(e.duration) : .25);
      const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;
      let cursor = regionLeft + 12;
      entries.forEach((entry, index) => {
        const unit = entry.unit;
        const units = new Map<string, StaffStamp[]>();
        unit.stamps.forEach((s) => units.set(s.chordId ?? s.id, [...(units.get(s.chordId ?? s.id) ?? []), s]));
        const durationWeight = [...units.values()].map((items) => Math.sqrt(Math.max(.125, musicalDuration(items[0], unit.groups))));
        const weightSum = durationWeight.reduce((a, b) => a + b, 0);
        const extra = slack * weights[index] / totalWeight;
        [...units.values()].forEach((members, memberIndex) => {
          const ink = members.map((s) => envelope(s, attachments));
          const left = Math.max(...ink.map((e) => e.left)), right = Math.max(...ink.map((e) => e.right));
          const x = cursor + left;
          members.forEach((s) => {
            const oldPage = input.pages.find((p) => p.stamps?.some((v) => v.id === s.id)) ?? input.pages[0];
            const oldRow = rowAt(s.y, oldPage.staffCount ?? 7);
            const y = localRow * ROW_HEIGHT + (s.generated ? 102 : s.y - oldRow * ROW_HEIGHT);
            page.stamps.push({ ...s, x, y, measure: m, order: entry.start });
            for (const a of attachments.filter((a) => a.attachTo === s.id)) page.stamps.push({ ...a, x: x + a.x - s.x, y: y + a.y - s.y, measure: m });
          });
          cursor += left + right + 12 + extra * durationWeight[memberIndex] / weightSum;
        });
        unit.groups.filter((g) => g.id !== options.openGroup?.id).forEach((g) => { if (!page.tuplets.some((t) => t.id === g.id)) page.tuplets.push({ ...g }); });
      });
    }
  }
  const pages: StaffPage[] = layouts;
  const lastId = input.lastNote?.stampId, lastPage = pages.find((p) => p.stamps?.some((s) => s.id === lastId));
  const anchorIds = input.pages.flatMap((p) => {
    const a = p.anchor && p.stamps?.find((s) => Math.abs(s.x - p.anchor!.x) < 1 && Math.abs(s.y - p.anchor!.y) < 1);
    return a ? [a.id] : [];
  });
  pages.forEach((p) => {
    const a = p.stamps?.find((s) => anchorIds.includes(s.id));
    if (a) p.anchor = { x: a.x, y: a.y };
  });
  const note = { ...input, pages, lastNote: lastPage && lastId ? { pageId: lastPage.id, stampId: lastId } : undefined };
  return { note, reason: JSON.stringify(note) === JSON.stringify(input) ? "unchanged" : "changed", requiredScale };
}
