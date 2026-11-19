import type { StaffNotebook, StaffPage, StaffPoint, StaffStamp, StaffStroke , NotebookSettings } from "./staff-notebook";
import { ROW_HEIGHT, snapStaffY, inkInRow, rowAt } from "./staff-notebook-layout";
import { erasedAt } from "./notebook-ink";
import { naturalPaperWidth, notebookMeasureRegions, standardTupletRatio } from "./notebook-music-layout";
import { indexNotebookSplits, notebookSourceId, restoreNotebookStamp } from "./notebook-splits";

export type NotebookSelection = { strokeIds: string[]; stampIds: string[] };
export type NotebookBounds = { x: number; y: number; width: number; height: number };
export type NotebookClipboard = { id: string; label: string; page: StaffPage; count: number };
export const emptySelection = (): NotebookSelection => ({ strokeIds: [], stampIds: [] });
export const selectionCount = (s: NotebookSelection) => s.strokeIds.length + s.stampIds.length;
export const isNotebookNote = (glyph: string) => /^(whole|half|quarter|eighth|sixteenth|thirty_second)$/.test(glyph);
export const isNotebookRest = (glyph: string) => /^rest-(whole|half|quarter|eighth|sixteenth|thirty_second)$/.test(glyph);
export const isTupletMember = (glyph: string) => isNotebookNote(glyph) || isNotebookRest(glyph);
const accidentals = new Set(["sharp", "flat", "natural", "double_sharp", "double_flat"]);
const articulation = new Set(["staccato", "tenuto", "accent", "fermata", "marcato", "staccatissimo", "portato", "snap_pizzicato", "left_hand_pizzicato"]);
export const isAttachedMark = (glyph: string) => accidentals.has(glyph) || articulation.has(glyph);
export function attachedPosition(page: StaffPage, glyph: string, noteId?: string): { point: StaffPoint; attachTo: string } | null {
  if (!isAttachedMark(glyph)) return null;
  const note = (noteId ? page.stamps?.find((stamp) => stamp.id === noteId && isNotebookNote(stamp.glyph)) : null)
    ?? [...(page.stamps ?? [])].reverse().find((stamp) => !stamp.split?.index && isNotebookNote(stamp.glyph));
  if (!note) return null;
  return { point: { x: note.x - (accidentals.has(glyph) ? note.size * 0.8 : 0), y: note.y - (accidentals.has(glyph) ? 0 : note.size * 1.65) }, attachTo: note.id };
}
export function rectangle(a: StaffPoint, b: StaffPoint): NotebookBounds {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}
const intersects = (a: NotebookBounds, b: NotebookBounds) =>
  a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y;
const stampBounds = (stamp: StaffStamp): NotebookBounds => ({ x: stamp.x - stamp.size * 0.75, y: stamp.y - stamp.size * 1.4, width: stamp.size * 1.5, height: stamp.size * 1.9 });
const pointIn = (p: StaffPoint, r: NotebookBounds) => p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
function segmentHits(a: StaffPoint, b: StaffPoint, r: NotebookBounds) {
  let low = 0, high = 1;
  for (const [p, q] of [[a.x - b.x, a.x - r.x], [b.x - a.x, r.x + r.width - a.x], [a.y - b.y, a.y - r.y], [b.y - a.y, r.y + r.height - a.y]]) {
    if (!p) { if (q < 0) return false; }
    else if (p < 0) low = Math.max(low, q / p);
    else high = Math.min(high, q / p);
  }
  return low <= high;
}
export function strokeIntersects(stroke: StaffStroke, r: NotebookBounds) {
  const area = { x: r.x - stroke.width / 2, y: r.y - stroke.width / 2, width: r.width + stroke.width, height: r.height + stroke.width };
  return stroke.points.some((p) => pointIn(p, area)) || stroke.points.slice(1).some((b, i) => segmentHits(stroke.points[i], b, area));
}
export function includeAttached(page: StaffPage, selection: NotebookSelection, includeGroups = true): NotebookSelection {
  const stamps = new Set(selection.stampIds);
  const sources = new Set((page.stamps ?? []).filter((s) => stamps.has(s.id)).map(notebookSourceId));
  for (const stamp of page.stamps ?? []) if (stamp.split && sources.has(stamp.split.sourceId)) stamps.add(stamp.id);
  if (includeGroups) {
    let changed = true;
    while (changed) {
      changed = false;
      for (const group of page.tuplets ?? []) if (group.stampIds.some((id) => stamps.has(id)))
        for (const id of group.stampIds) if (!stamps.has(id)) { stamps.add(id); changed = true; }
    }
  }
  (page.stamps ?? []).forEach((stamp) => { if (stamp.attachTo && stamps.has(stamp.attachTo)) stamps.add(stamp.id); });
  return { ...selection, stampIds: [...stamps] };
}
export function selectRectangle(page: StaffPage, bounds: NotebookBounds): NotebookSelection {
  return includeAttached(page, {
    strokeIds: page.strokes.filter((s) => strokeIntersects(s, bounds)).map((s) => s.id),
    stampIds: (page.stamps ?? []).filter((s) => intersects(stampBounds(s), bounds)).map((s) => s.id),
  });
}
export function hitObject(page: StaffPage, point: StaffPoint): { kind: "stroke" | "stamp"; id: string } | null {
  const stamp = [...(page.stamps ?? [])].reverse().filter((s) => !erasedAt(s, point) && pointIn(point, stampBounds(s)))
    .sort((a, b) => Math.hypot(point.x - a.x, point.y - a.y) - Math.hypot(point.x - b.x, point.y - b.y))[0];
  if (stamp) return { kind: "stamp", id: stamp.id };
  const stroke = [...page.strokes].reverse().find((s) => !erasedAt(s, point) && strokeIntersects(s, { x: point.x - 7, y: point.y - 7, width: 14, height: 14 }));
  return stroke ? { kind: "stroke", id: stroke.id } : null;
}
export function selectionBounds(page: StaffPage, selection: NotebookSelection): NotebookBounds | null {
  const regions = (page.stamps ?? []).filter((s) => selection.stampIds.includes(s.id)).map(stampBounds);
  page.strokes.filter((s) => selection.strokeIds.includes(s.id)).forEach((s) => s.points.forEach((p) =>
    regions.push({ x: p.x - s.width / 2, y: p.y - s.width / 2, width: s.width, height: s.width })));
  if (!regions.length) return null;
  const x = Math.min(...regions.map((r) => r.x)), y = Math.min(...regions.map((r) => r.y));
  return { x, y, width: Math.max(...regions.map((r) => r.x + r.width)) - x, height: Math.max(...regions.map((r) => r.y + r.height)) - y };
}
export function selectionDelta(page: StaffPage, selection: NotebookSelection, delta: StaffPoint, snap: boolean): StaffPoint {
  const representativeIds = new Set(notebookSelectionRepresentatives(page, selection).map((s) => s.id));
  page = { ...page, stamps: page.stamps?.filter((s) => !s.split || representativeIds.has(s.id)) };
  const bounds = selectionBounds(page, selection);
  if (!bounds) return delta;
  const reference = page.stamps?.find((s) => selection.stampIds.includes(s.id) && isNotebookNote(s.glyph))
    ?? page.stamps?.find((s) => selection.stampIds.includes(s.id) && isNotebookRest(s.glyph));
  let dy = delta.y;
  if (snap && reference) {
    dy = snapStaffY(reference.y + dy, page.staffCount ?? 7, reference.y - bounds.y,
      (page.staffCount ?? 7) * ROW_HEIGHT - bounds.height + reference.y - bounds.y) - reference.y;
  }
  return { x: Math.max(-bounds.x, Math.min(naturalPaperWidth(page) - bounds.x - bounds.width, delta.x)),
    y: Math.max(-bounds.y, Math.min((page.staffCount ?? 7) * ROW_HEIGHT - bounds.y - bounds.height, dy)) };
}
export function transformSelection(page: StaffPage, selection: NotebookSelection, delta: StaffPoint, copy = false, makeId: () => string = () => `${Date.now()}_${Math.random()}`, note?: StaffNotebook): { page: StaffPage; selection: NotebookSelection } {
  const chosen = includeAttached(page, selection);
  const sources = copy ? copyableStamps(page, chosen, note) : (page.stamps ?? []).filter((s) => chosen.stampIds.includes(s.id));
  const ids = new Map(sources.map(({ id }) => [id, copy ? makeId() : id]));
  const chordIds = new Map(sources.filter((s) => s.chordId).map((s) => [s.chordId!, copy ? makeId() : s.chordId!]));
  const strokes = page.strokes.filter((s) => chosen.strokeIds.includes(s.id)).map((s) => ({ ...s, id: copy ? makeId() : s.id, points: s.points.map((p) => ({ x: p.x + delta.x, y: p.y + delta.y })) }));
  const stamps = sources.map((s) => ({ ...s, id: ids.get(s.id)!, x: s.x + delta.x, y: s.y + delta.y,
    measure: delta.x || delta.y ? undefined : s.measure,
    tieTo: s.tieTo ? ids.get(s.tieTo) ?? (copy ? undefined : s.tieTo) : undefined,
    tieFrom: s.tieFrom ? ids.get(s.tieFrom) ?? (copy ? undefined : s.tieFrom) : undefined,
    chordId: s.chordId ? chordIds.get(s.chordId) : undefined,
    generated: copy && s.generated ? false : s.generated,
    attachTo: s.attachTo ? ids.get(s.attachTo) ?? (copy ? undefined : s.attachTo) : undefined }));
  const movedTuplets = (page.tuplets ?? []).filter((t) => t.stampIds.every((id) => ids.has(id)))
    .map((t) => ({ ...t, id: copy ? makeId() : t.id, stampIds: t.stampIds.map((id) => ids.get(id)!) }));
  return { page: { ...page,
    strokes: copy ? [...page.strokes, ...strokes] : page.strokes.map((s) => strokes.find((next) => next.id === s.id) ?? s),
    stamps: copy ? [...(page.stamps ?? []), ...stamps] : (page.stamps ?? []).map((s) => stamps.find((next) => next.id === s.id) ?? s),
    tuplets: copy ? [...(page.tuplets ?? []), ...movedTuplets] : page.tuplets,
  }, selection: { strokeIds: strokes.map((s) => s.id), stampIds: stamps.map((s) => s.id) } };
}
export function removeSelection(page: StaffPage, selection: NotebookSelection, includeGroups = true): StaffPage {
  const chosen = includeAttached(page, selection, includeGroups);
  const stamps = (page.stamps ?? []).filter((s) => !chosen.stampIds.includes(s.id))
    .map((s) => ({ ...s, tieTo: s.tieTo && chosen.stampIds.includes(s.tieTo) ? undefined : s.tieTo,
      tieFrom: s.tieFrom && chosen.stampIds.includes(s.tieFrom) ? undefined : s.tieFrom }));
  return { ...page, strokes: page.strokes.filter((s) => !chosen.strokeIds.includes(s.id)), stamps,
    tuplets: (page.tuplets ?? []).map((t) => {
      const stampIds = t.stampIds.filter((id) => stamps.some((s) => s.id === id));
      return { ...t, stampIds, ...(stampIds.length !== t.stampIds.length ? { ratio: standardTupletRatio(stampIds.length) } : {}) };
    }).filter((t) => t.stampIds.length >= 2) };
}

export type NotebookSelectionUnit = "object" | "measure" | "row";
/** A split note is still one authored input: continue after its final tied fragment. */
export function notebookWritingTail(note: StaffNotebook, pageIndex: number) {
  const owner = note.pages[pageIndex];
  const stamp = owner?.anchor && owner.stamps?.find((s) => !s.attachTo && Math.abs(s.x - owner.anchor!.x) < 1 && Math.abs(s.y - owner.anchor!.y) < 1);
  return stamp?.split ? indexNotebookSplits(note).get(stamp.split.sourceId)?.at(-1) : undefined;
}
/** Keep a pasted/copied selection contiguous in insertion order before reflow. */
export function insertSelectionBeforeFollowing(page: StaffPage, selection: NotebookSelection): StaffPage {
  const ids = new Set(selection.stampIds), moved = new Map<string, number>();
  const roots = (page.stamps ?? []).filter((s) => ids.has(s.id) && !s.attachTo).sort((a, b) => a.x - b.x);
  for (let row = 0; row < (page.staffCount ?? 7); row++) {
    const members = roots.filter((s) => rowAt(s.y, page.staffCount ?? 7) === row);
    if (!members.length) continue;
    const start = members[0].x;
    const next = (page.stamps ?? []).filter((s) => !ids.has(s.id) && !s.attachTo && !s.generated && !s.split?.index && rowAt(s.y, page.staffCount ?? 7) === row && s.x >= start).sort((a, b) => a.x - b.x)[0];
    if (!next) continue;
    const gap = Math.max(.001, (next.x - start) / (members.length + 1));
    members.forEach((s, i) => moved.set(s.id, next.x === start ? start - (members.length - i) * .001 : start + i * gap));
  }
  return { ...page, stamps: page.stamps?.map((s) => {
    const x = moved.get(s.id), parentX = s.attachTo ? moved.get(s.attachTo) : undefined, parent = s.attachTo && page.stamps?.find((p) => p.id === s.attachTo);
    return x !== undefined ? { ...s, x } : parentX !== undefined && parent ? { ...s, x: s.x + parentX - parent.x } : s;
  }) };
}
/** Reorder whole rows, including their empty space. Ink follows only with explicit consent. */
export function reorderNotebookRows(page: StaffPage, from: number, to: number, target: number, includeInk: boolean): StaffPage {
  const count = page.staffCount ?? 7;
  const low = Math.max(0, Math.min(from, to)), high = Math.min(count - 1, Math.max(from, to));
  const order = Array.from({ length: count }, (_, i) => i);
  const moved = order.splice(low, high - low + 1);
  order.splice(Math.max(0, Math.min(order.length, target)), 0, ...moved);
  const destination = new Map(order.map((source, index) => [source, index]));
  const shifted = (y: number) => y + (destination.get(rowAt(y, count))! - rowAt(y, count)) * ROW_HEIGHT;
  return { ...page,
    stamps: page.stamps?.map((s) => ({ ...s, y: shifted(s.y) })),
    strokes: includeInk ? page.strokes.map((s) => {
      const r = rowAt(s.points[0]?.y ?? 0, count), dy = (destination.get(r)! - r) * ROW_HEIGHT;
      return { ...s, points: s.points.map((p) => ({ ...p, y: p.y + dy })) };
    }) : page.strokes,
    completedRows: page.completedRows?.map((r) => destination.get(r)!),
    measureCounts: page.measureCounts ? order.map((r) => page.measureCounts![r]) : undefined,
    blankRows: [...new Set([...(page.blankRows ?? []).map((r) => destination.get(r)!),
      ...moved.filter((r) => !(page.stamps ?? []).some((s) => rowAt(s.y, count) === r) && !page.strokes.some((s) => s.points.some((p) => rowAt(p.y, count) === r))).map((r) => destination.get(r)!)])],
    anchor: page.anchor ? { ...page.anchor, y: shifted(page.anchor.y) } : undefined,
  };
}
/** Select a contiguous musical range, including whole intersecting strokes/groups. */
export function selectNotebookUnits(page: StaffPage, start: StaffPoint, end: StaffPoint, unit: NotebookSelectionUnit, settings?: Partial<NotebookSettings>): NotebookSelection {
  if (unit === "object") return selectRectangle(page, rectangle(start, end));
  const regions = notebookMeasureRegions(page, settings);
  const count = page.staffCount ?? 7;
  const locate = (p: StaffPoint) => {
    const row = rowAt(p.y, count);
    return regions.findIndex((r) => r.row === row && p.x >= r.left && p.x < r.right);
  };
  const nearest = (p: StaffPoint) => {
    const i = locate(p);
    if (i >= 0) return i;
    return regions.findIndex((r) => r.row === rowAt(p.y, count));
  };
  const a = nearest(start), b = nearest(end);
  const rows = [rowAt(start.y, count), rowAt(end.y, count)].sort((a, b) => a - b);
  const picked = unit === "row" ? regions.filter((r) => r.row >= rows[0] && r.row <= rows[1])
    : regions.slice(Math.min(a, b), Math.max(a, b) + 1);
  const selections = picked.map((r) => selectRectangle(page, { x: r.left, y: r.row * ROW_HEIGHT, width: r.right - r.left, height: ROW_HEIGHT }));
  return includeAttached(page, { stampIds: [...new Set(selections.flatMap((s) => s.stampIds))], strokeIds: [...new Set(selections.flatMap((s) => s.strokeIds))] });
}
export function captureSelection(page: StaffPage, selection: NotebookSelection, note?: StaffNotebook): StaffPage {
  const chosen = includeAttached(page, selection);
  const stamps = copyableStamps(page, chosen, note);
  const canonical = { ...chosen, stampIds: stamps.map((s) => s.id) };
  const extracted: StaffPage = { id: "clipboard", staffCount: page.staffCount,
    strokes: page.strokes.filter((s) => chosen.strokeIds.includes(s.id)),
    stamps: stamps.map((s) => ({ ...s, attachTo: s.attachTo && canonical.stampIds.includes(s.attachTo) ? s.attachTo : undefined })),
    tuplets: page.tuplets?.filter((t) => t.stampIds.every((id) => chosen.stampIds.includes(id))) };
  const bounds = selectionBounds(extracted, canonical);
  const result = transformSelection(extracted, canonical, { x: -(bounds?.x ?? 0), y: -(bounds?.y ?? 0) }).page;
  return JSON.parse(JSON.stringify(result));
}

/** One editable object per authored stamp, even on a continuation-only page. */
function notebookSelectionRepresentatives(page: StaffPage, selection: NotebookSelection) {
  const representatives = new Map<string, StaffStamp>();
  const chosen = new Set(selection.stampIds);
  for (const s of page.stamps ?? []) if (chosen.has(s.id)) {
    const source = notebookSourceId(s), existing = representatives.get(source);
    if (!existing || (s.split?.index ?? 0) < (existing.split?.index ?? 0)) representatives.set(source, s);
  }
  return [...representatives.values()];
}
export const selectedNotebookStamps = (page: StaffPage, selection: NotebookSelection) =>
  notebookSelectionRepresentatives(page, selection).map(restoreNotebookStamp);

function copyableStamps(page: StaffPage, selection: NotebookSelection, note?: StaffNotebook) {
  const representatives = notebookSelectionRepresentatives(page, selection);
  const stamps = representatives.map(restoreNotebookStamp);
  if (!note || !representatives.some((s) => s.split?.index)) return stamps;
  const splits = indexNotebookSplits(note);
  for (const continuation of representatives) if (continuation.split?.index) {
    const source = splits.get(continuation.split.sourceId)?.[0];
    if (source?.stamp.id !== continuation.split.sourceId) continue;
    for (const mark of note.pages[source.pageIndex].stamps ?? []) if (mark.attachTo === source.stamp.id) {
      stamps.push({ ...mark, x: continuation.x + mark.x - source.stamp.x, y: continuation.y + mark.y - source.stamp.y });
    }
  }
  return stamps;
}
/** Re-paginate whole rows; never crop existing ink when reducing page capacity. */
export function paginateNotebook(note: StaffNotebook, count: number, makeId: () => string): StaffNotebook {
  const scale = Math.min(1, ...note.pages.map((p) => p.layoutScale ?? 1));
  let rowOffset = 0;
  const anchors: { point: StaffPoint; preferred: boolean }[] = [];
  const joined: StaffPage = { id: note.pages[0].id, staffCount: 0, strokes: [], stamps: [], tuplets: [], layoutScale: scale, completedRows: [], blankRows: [], measureCounts: [] };
  for (const page of note.pages) {
    const dy = rowOffset * ROW_HEIGHT, factor = (page.layoutScale ?? 1) / scale;
    joined.stamps!.push(...(page.stamps ?? []).map((s) => ({ ...s, x: 38 + (s.x - 38) * factor, y: s.y + dy })));
    joined.strokes.push(...page.strokes.map((s) => ({ ...s, points: s.points.map((p) => ({ x: 38 + (p.x - 38) * factor, y: p.y + dy })) })));
    joined.tuplets!.push(...(page.tuplets ?? []));
    if (page.anchor) anchors.push({ point: { x: 38 + (page.anchor.x - 38) * factor, y: page.anchor.y + dy }, preferred: page.id === note.lastNote?.pageId });
    joined.completedRows!.push(...(page.completedRows ?? []).map((r) => r + rowOffset));
    joined.blankRows!.push(...(page.blankRows ?? []).map((r) => r + rowOffset));
    joined.measureCounts!.push(...Array.from({ length: page.staffCount ?? 7 }, (_, r) => page.measureCounts?.[r] ?? note.settings?.measuresPerRow ?? (note.settings?.lineUnit === "phrase" ? 4 : 1)));
    rowOffset += page.staffCount ?? 7;
  }
  joined.staffCount = rowOffset;
  const lastNote = note.lastNote ? { ...note.lastNote, pageId: joined.id } : undefined;
  return paginateJoinedNotebook({ ...note, pages: [joined], lastNote }, count, makeId, anchors);
}
function paginateJoinedNotebook(note: StaffNotebook, count: number, makeId: () => string, anchors: { point: StaffPoint; preferred: boolean }[]): StaffNotebook {
  const rows = Math.max(1, Math.min(200, Math.round(count)));
  const pages: StaffPage[] = [];
  let lastNote = note.lastNote;
  for (const page of note.pages) {
    const partOf = (stamp: StaffStamp) => Math.floor(Math.max(0, stamp.y) / (rows * ROW_HEIGHT));
    for (const stamp of page.stamps ?? []) {
      const parent = page.stamps?.find((target) => target.id === stamp.attachTo);
      if (parent && partOf(parent) !== partOf(stamp)) throw new Error("연결된 음표와 기호가 페이지 경계에 걸립니다. 위치를 조정한 뒤 줄 수를 변경해 주세요. / An attached mark crosses the new page boundary.");
    }
    if (page.tuplets?.some((group) => new Set(group.stampIds.map((id) => partOf(page.stamps!.find((stamp) => stamp.id === id)!))).size > 1))
      throw new Error("잇단음표 묶음이 페이지 경계에 걸립니다. 묶음의 위치를 조정하거나 줄 수를 늘려 주세요. / A tuplet crosses the new page boundary.");
    const maximumY = Math.max(0, ...page.strokes.flatMap((s) => s.points.map((p) => p.y)), ...(page.stamps ?? []).map((s) => s.y));
    const occupied = Math.ceil((maximumY + 1) / ROW_HEIGHT);
    const pieces = Math.max(1, Math.ceil(Math.max(occupied, page.staffCount ?? 7) / rows));
    for (let part = 0; part < pieces; part++) {
      const start = part * rows * ROW_HEIGHT, end = start + rows * ROW_HEIGHT;
      const strokes = page.strokes.flatMap((s) => inkInRow(s, part, rows * ROW_HEIGHT))
        .map((s) => ({ ...s, points: s.points.map((p) => ({ x: p.x, y: p.y - start })) }));
      const stamps = (page.stamps ?? []).filter((s) => s.y >= start && s.y < end).map((s) => ({ ...s, y: s.y - start }));
      const ids = new Set(stamps.map((s) => s.id));
      const pageId = part ? makeId() : page.id;
      if (note.lastNote?.pageId === page.id && stamps.some((s) => s.id === note.lastNote!.stampId)) lastNote = { pageId, stampId: note.lastNote.stampId };
      const candidates = anchors.filter(({ point }) => point.y >= start && point.y < end);
      const anchor = (candidates.find((item) => item.preferred) ?? candidates.at(-1))?.point;
      pages.push({ id: pageId, staffCount: rows, strokes,
        stamps: stamps.map((s) => ({ ...s, attachTo: s.attachTo && ids.has(s.attachTo) ? s.attachTo : undefined })),
        tuplets: page.tuplets?.map((t) => ({ ...t, id: part ? makeId() : t.id, stampIds: t.stampIds.filter((id) => ids.has(id)) })).filter((t) => t.stampIds.length >= 2),
        layoutScale: page.layoutScale,
        measureCounts: page.measureCounts ? Array.from({ length: rows }, (_, r) => page.measureCounts?.[part * rows + r] ?? note.settings?.measuresPerRow ?? (note.settings?.lineUnit === "phrase" ? 4 : 1)) : undefined,
        completedRows: page.completedRows?.filter((r) => r >= part * rows && r < (part + 1) * rows).map((r) => r - part * rows),
        blankRows: page.blankRows?.filter((r) => r >= part * rows && r < (part + 1) * rows).map((r) => r - part * rows),
        anchor: anchor && { x: anchor.x, y: anchor.y - start } });
    }
  }
  return { ...note, pages, lastNote, settings: note.settings ? { ...note.settings, rowsPerPage: rows } : undefined };
}
