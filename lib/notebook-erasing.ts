import type { NotebookSettings, StaffPage, StaffPoint, StaffStamp, StaffStroke } from "./staff-notebook";
import { removeSelection, strokeIntersects, type NotebookBounds } from "./notebook-editing";
import { notebookBeaming, type NotebookBeamStem } from "./notebook-beaming";
import { notebookTupletSpans } from "./notebook-tuplet-layout";
import { objectFrame, strokeTouchesEraser, type NotebookInkObject } from "./notebook-ink";
import { notebookRestEngraving } from "./notebook-rest-engraving";
export { paperErasures, inkPath } from "./notebook-ink";

export type NotebookEraserMode = "object" | "partial";
/** Always derive a gesture from its immutable starting page. One cut per object,
 * not one undo entry (or saved mask) per pointer event. */
export function eraseNotebookGesture(page: StaffPage, points: StaffPoint[], mode: NotebookEraserMode,
  width = 22, settings?: Partial<NotebookSettings>): StaffPage {
  if (!points.length) return page;
  const hitStroke = (s: StaffStroke) => strokeTouchesEraser(s, points, width);
  const stampAreas = new Map((page.stamps ?? []).map((s) => [s.id, [notebookRestEngraving(s)?.bounds ?? {
    x: s.x - s.size * 0.8, y: s.y - s.size * 2.1, width: s.size * 1.6, height: s.size * 2.8,
  }]]));
  // Derived beams and brackets are visual parts of their members, not new notes.
  const beams = notebookBeaming(page, settings);
  const tuplets = notebookTupletSpans(page, undefined, beams);
  const addStem = (stem: NotebookBeamStem) => stampAreas.get(stem.id)?.push({
    x: stem.stemX - 2, y: Math.min(stem.headY, stem.stemY), width: 4, height: Math.abs(stem.headY - stem.stemY),
  });
  beams.stems.forEach(addStem);
  tuplets.forEach((span) => span.stemJoins?.forEach(addStem));
  // A shared beam/bracket is NOT a whole-object deletion target. Only a
  // member's own glyph/stem can delete that note. Partial cuts, in contrast,
  // must cover the shared decoration without changing musical membership.
  if (mode === "partial") {
    beams.groups.forEach((group) => group.segments.forEach((segment) => {
      const area = { x: Math.min(segment.x1, segment.x2) - segment.thickness,
        y: Math.min(segment.y1, segment.y2) - segment.thickness,
        width: Math.abs(segment.x2 - segment.x1) + 2 * segment.thickness,
        height: Math.abs(segment.y2 - segment.y1) + 2 * segment.thickness };
      group.memberIds.forEach((key) => stampAreas.get(key)?.push(area));
    }));
    tuplets.forEach((span) => {
      const group = page.tuplets?.find((t) => t.id === span.id);
      const labelY = span.numberY ?? span.y;
      group?.stampIds.forEach((key) => stampAreas.get(key)?.push({
        x: span.left, y: Math.min(labelY, span.y) - span.fontSize, width: span.right - span.left,
        height: Math.abs(labelY - span.y) + span.fontSize * 2,
      }));
    });
  }
  const hitStamp = (s: StaffStamp) => stampAreas.get(s.id)!.some((area: NotebookBounds) => strokeIntersects({ id: "eraser", points, width }, area));
  const strokeIds = page.strokes.filter(hitStroke).map((s) => s.id);
  const stampIds = (page.stamps ?? []).filter(hitStamp).map((s) => s.id);
  if (!strokeIds.length && !stampIds.length) return page;
  if (mode === "object") return removeSelection(page, { strokeIds, stampIds }, false);
  const cut = <T extends NotebookInkObject>(object: T): T => {
    const frame = objectFrame(object);
    return { ...object, erasures: [...(object.erasures ?? []), { width: width / frame.unit,
      points: points.map((p) => ({ x: (p.x - frame.x) / frame.unit, y: (p.y - frame.y) / frame.unit })) }] };
  };
  return { ...page, strokes: page.strokes.map((s) => strokeIds.includes(s.id) ? cut(s) : s),
    stamps: page.stamps?.map((s) => stampIds.includes(s.id) ? cut(s) : s) };
}
