import type { StaffErasure, StaffPoint, StaffStamp, StaffStroke } from "./staff-notebook";
export type NotebookInkObject = StaffStamp | StaffStroke;
export function objectFrame(object: NotebookInkObject) {
  return "glyph" in object ? { x: object.x, y: object.y, unit: object.size }
    : { x: object.points[0]?.x ?? 0, y: object.points[0]?.y ?? 0, unit: object.width };
}
export function paperErasures(object: NotebookInkObject): StaffErasure[] {
  const frame = objectFrame(object);
  return (object.erasures ?? []).map((cut) => ({ width: cut.width * frame.unit,
    points: cut.points.map((p) => ({ x: frame.x + p.x * frame.unit, y: frame.y + p.y * frame.unit })) }));
}
export const inkPath = (points: StaffPoint[]) => points.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ") + (points.length === 1 ? " l0.01,0.01" : "");
export function erasedAt(object: NotebookInkObject, point: StaffPoint): boolean {
  return paperErasures(object).some((cut) => {
    const points = cut.points.length === 1 ? [cut.points[0], cut.points[0]] : cut.points;
    return points.slice(1).some((b, i) => {
      const a = points[i], dx = b.x - a.x, dy = b.y - a.y;
      const t = dx || dy ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy))) : 0;
      return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy) <= cut.width / 2;
    });
  });
}

const pointSegmentDistance = (point: StaffPoint, a: StaffPoint, b: StaffPoint) => {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = dx || dy ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
};
function segmentDistance(a: StaffPoint, b: StaffPoint, c: StaffPoint, d: StaffPoint) {
  const ax = b.x - a.x, ay = b.y - a.y, bx = d.x - c.x, by = d.y - c.y;
  const cross = ax * by - ay * bx;
  if (cross !== 0) {
    const cx = c.x - a.x, cy = c.y - a.y;
    const t = (cx * by - cy * bx) / cross, u = (cx * ay - cy * ax) / cross;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0;
  }
  return Math.min(pointSegmentDistance(a, c, d), pointSegmentDistance(b, c, d),
    pointSegmentDistance(c, a, b), pointSegmentDistance(d, a, b));
}
/** Intersect swept round paths, not their bounding boxes. Handles taps,
 * parallel/collinear segments, and crossings between sparse pointer samples. */
export function strokeTouchesEraser(stroke: StaffStroke, points: StaffPoint[], width: number): boolean {
  if (!points.length || !stroke.points.length) return false;
  const threshold = (width + stroke.width) / 2;
  for (let i = 0; i < Math.max(1, points.length - 1); i++) {
    const a = points[i], b = points[Math.min(i + 1, points.length - 1)];
    for (let j = 0; j < Math.max(1, stroke.points.length - 1); j++) {
      if (segmentDistance(a, b, stroke.points[j], stroke.points[Math.min(j + 1, stroke.points.length - 1)]) <= threshold) return true;
    }
  }
  return false;
}
