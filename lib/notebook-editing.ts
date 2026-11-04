import type { StaffNotebook, StaffPage, StaffPoint, StaffStamp, StaffStroke } from "./staff-notebook";
import { ROW_HEIGHT, STAFF_GAP, STAFF_TOP, rowAt, inkInRow } from "./staff-notebook-layout";

export type NotebookSelection = { strokeIds: string[]; stampIds: string[] };
export type NotebookBounds = { x: number; y: number; width: number; height: number };
export type NotebookClipboard = { id: string; label: string; page: StaffPage; count: number };
export const emptySelection = (): NotebookSelection => ({ strokeIds: [], stampIds: [] });
export const selectionCount = (s: NotebookSelection) => s.strokeIds.length + s.stampIds.length;
export const isNotebookNote = (glyph: string) => /^(whole|half|quarter|eighth|sixteenth|thirty_second)$/.test(glyph);
export const isTupletMember = (glyph: string) => isNotebookNote(glyph) || glyph.startsWith("rest-");
const accidentals = new Set(["sharp", "flat", "natural", "double_sharp", "double_flat"]);
const articulation = new Set(["staccato", "tenuto", "accent", "fermata", "marcato", "staccatissimo", "portato", "snap_pizzicato", "left_hand_pizzicato"]);
export const isAttachedMark = (glyph: string) => accidentals.has(glyph) || articulation.has(glyph);
export function attachedPosition(page: StaffPage, glyph: string, noteId?: string): { point: StaffPoint; attachTo: string } | null {
  if (!isAttachedMark(glyph)) return null;
  const note = (noteId ? page.stamps?.find((stamp) => stamp.id === noteId && isNotebookNote(stamp.glyph)) : null)
    ?? [...(page.stamps ?? [])].reverse().find((stamp) => isNotebookNote(stamp.glyph));
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
export function includeAttached(page: StaffPage, selection: NotebookSelection): NotebookSelection {
  const stamps = new Set(selection.stampIds);
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
  const stamp = [...(page.stamps ?? [])].reverse().filter((s) => pointIn(point, stampBounds(s)))
    .sort((a, b) => Math.hypot(point.x - a.x, point.y - a.y) - Math.hypot(point.x - b.x, point.y - b.y))[0];
  if (stamp) return { kind: "stamp", id: stamp.id };
  const stroke = [...page.strokes].reverse().find((s) => strokeIntersects(s, { x: point.x - 7, y: point.y - 7, width: 14, height: 14 }));
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
  const bounds = selectionBounds(page, selection);
  if (!bounds) return delta;
  const reference = page.stamps?.find((s) => selection.stampIds.includes(s.id) && isNotebookNote(s.glyph));
  let dy = delta.y;
  if (snap && reference) {
    const y = reference.y + dy, top = rowAt(y, page.staffCount ?? 7) * ROW_HEIGHT + STAFF_TOP;
    dy = top + Math.round((y - top) / (STAFF_GAP / 2)) * STAFF_GAP / 2 - reference.y;
  }
  return { x: Math.max(-bounds.x, Math.min(900 - bounds.x - bounds.width, delta.x)),
    y: Math.max(-bounds.y, Math.min((page.staffCount ?? 7) * ROW_HEIGHT - bounds.y - bounds.height, dy)) };
}
export function transformSelection(page: StaffPage, selection: NotebookSelection, delta: StaffPoint, copy = false, makeId: () => string = () => `${Date.now()}_${Math.random()}`): { page: StaffPage; selection: NotebookSelection } {
  const chosen = includeAttached(page, selection);
  const ids = new Map(chosen.stampIds.map((old) => [old, copy ? makeId() : old]));
  const strokes = page.strokes.filter((s) => chosen.strokeIds.includes(s.id)).map((s) => ({ ...s, id: copy ? makeId() : s.id, points: s.points.map((p) => ({ x: p.x + delta.x, y: p.y + delta.y })) }));
  const stamps = (page.stamps ?? []).filter((s) => chosen.stampIds.includes(s.id)).map((s) => ({ ...s, id: ids.get(s.id)!, x: s.x + delta.x, y: s.y + delta.y,
    attachTo: s.attachTo ? ids.get(s.attachTo) ?? (copy ? undefined : s.attachTo) : undefined }));
  const movedTuplets = (page.tuplets ?? []).filter((t) => t.stampIds.every((id) => ids.has(id)))
    .map((t) => ({ id: copy ? makeId() : t.id, stampIds: t.stampIds.map((id) => ids.get(id)!) }));
  return { page: { ...page,
    strokes: copy ? [...page.strokes, ...strokes] : page.strokes.map((s) => strokes.find((next) => next.id === s.id) ?? s),
    stamps: copy ? [...(page.stamps ?? []), ...stamps] : (page.stamps ?? []).map((s) => stamps.find((next) => next.id === s.id) ?? s),
    tuplets: copy ? [...(page.tuplets ?? []), ...movedTuplets] : page.tuplets,
  }, selection: { strokeIds: strokes.map((s) => s.id), stampIds: stamps.map((s) => s.id) } };
}
export function removeSelection(page: StaffPage, selection: NotebookSelection): StaffPage {
  const chosen = includeAttached(page, selection);
  const stamps = (page.stamps ?? []).filter((s) => !chosen.stampIds.includes(s.id));
  return { ...page, strokes: page.strokes.filter((s) => !chosen.strokeIds.includes(s.id)), stamps,
    tuplets: (page.tuplets ?? []).map((t) => ({ ...t, stampIds: t.stampIds.filter((id) => stamps.some((s) => s.id === id)) })).filter((t) => t.stampIds.length >= 2) };
}
export function captureSelection(page: StaffPage, selection: NotebookSelection): StaffPage {
  const chosen = includeAttached(page, selection);
  const bounds = selectionBounds(page, chosen);
  const extracted: StaffPage = { id: "clipboard", staffCount: page.staffCount,
    strokes: page.strokes.filter((s) => chosen.strokeIds.includes(s.id)),
    stamps: (page.stamps ?? []).filter((s) => chosen.stampIds.includes(s.id)).map((s) => ({ ...s, attachTo: s.attachTo && chosen.stampIds.includes(s.attachTo) ? s.attachTo : undefined })),
    tuplets: page.tuplets?.filter((t) => t.stampIds.every((id) => chosen.stampIds.includes(id))) };
  const result = transformSelection(extracted, chosen, { x: -(bounds?.x ?? 0), y: -(bounds?.y ?? 0) }).page;
  return JSON.parse(JSON.stringify(result));
}
/** Re-paginate whole rows; never crop existing ink when reducing page capacity. */
export function paginateNotebook(note: StaffNotebook, count: number, makeId: () => string): StaffNotebook {
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
      pages.push({ id: pageId, staffCount: rows, strokes,
        stamps: stamps.map((s) => ({ ...s, attachTo: s.attachTo && ids.has(s.attachTo) ? s.attachTo : undefined })),
        tuplets: page.tuplets?.map((t) => ({ ...t, id: part ? makeId() : t.id, stampIds: t.stampIds.filter((id) => ids.has(id)) })).filter((t) => t.stampIds.length >= 2),
        anchor: page.anchor && page.anchor.y >= start && page.anchor.y < end ? { x: page.anchor.x, y: page.anchor.y - start } : undefined });
    }
  }
  return { ...note, pages, lastNote, settings: note.settings ? { ...note.settings, rowsPerPage: rows } : undefined };
}
