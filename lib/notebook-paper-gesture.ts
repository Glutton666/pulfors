import type { StaffPoint } from "./staff-notebook";
type Phase = "start" | "move" | "end" | "cancel";
type Finger = { pageX: number; pageY: number; locationX?: number; locationY?: number };
/** A multi-touch gesture stays navigation-only until every finger is lifted. */
export function createNotebookPaperGesture(callbacks: {
  edit: (point: StaffPoint, phase: Phase) => void;
  pan: (delta: StaffPoint) => void;
  zoom?: (ratio: number) => void;
}) {
  let active = false, navigating = false;
  let center: StaffPoint | null = null;
  let distance: number | null = null;
  const reset = () => { active = false; navigating = false; center = null; distance = null; };
  return {
    update(fingers: Finger[], point: StaffPoint, phase: Phase) {
      if (phase === "cancel") {
        if (active && !navigating) callbacks.edit(point, "cancel");
        reset(); return;
      }
      if (phase === "start") { active = true; navigating = false; center = null; distance = null; }
      if (!active) return;
      if (fingers.length >= 2) {
        if (!navigating) { callbacks.edit(point, "cancel"); navigating = true; }
        const next = { x: (fingers[0].pageX + fingers[1].pageX) / 2, y: (fingers[0].pageY + fingers[1].pageY) / 2 };
        const nextDistance = Math.hypot(fingers[1].pageX - fingers[0].pageX, fingers[1].pageY - fingers[0].pageY);
        if (distance && nextDistance > 0 && phase === "move") callbacks.zoom?.(nextDistance / distance);
        distance = nextDistance;
        if (center && phase === "move") callbacks.pan({ x: next.x - center.x, y: next.y - center.y });
        center = next;
      } else if (navigating) { center = null; distance = null; }
      else callbacks.edit(point, phase);
      if (phase === "end") reset();
    },
  };
}
