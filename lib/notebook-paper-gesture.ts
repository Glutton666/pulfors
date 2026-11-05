import type { StaffPoint } from "./staff-notebook";
type Phase = "start" | "move" | "end" | "cancel";
type Finger = { pageX: number; pageY: number; locationX?: number; locationY?: number };
/** A multi-touch gesture stays navigation-only until every finger is lifted. */
export function createNotebookPaperGesture(callbacks: {
  edit: (point: StaffPoint, phase: Phase) => void;
  pan: (delta: StaffPoint) => void;
}) {
  let active = false, navigating = false;
  let center: StaffPoint | null = null;
  const reset = () => { active = false; navigating = false; center = null; };
  return {
    update(fingers: Finger[], point: StaffPoint, phase: Phase) {
      if (phase === "cancel") {
        if (active && !navigating) callbacks.edit(point, "cancel");
        reset(); return;
      }
      if (phase === "start") { active = true; navigating = false; center = null; }
      if (!active) return;
      if (fingers.length >= 2) {
        if (!navigating) { callbacks.edit(point, "cancel"); navigating = true; }
        const next = { x: (fingers[0].pageX + fingers[1].pageX) / 2, y: (fingers[0].pageY + fingers[1].pageY) / 2 };
        if (center && phase === "move") callbacks.pan({ x: next.x - center.x, y: next.y - center.y });
        center = next;
      } else if (navigating) center = null;
      else callbacks.edit(point, phase);
      if (phase === "end") reset();
    },
  };
}
