import type { BeatType } from "./metronome-engine";
import { MAX_SUBDIVISION_CELLS } from "./subdivision-limits";

export const CIRCULAR_TYPES: BeatType[] = ["strong", "accent", "normal", "mute"];
export const CIRCULAR_STEP = Math.PI / 5; // 36°; nine notes fit before returning to start.
export interface CircularGeometry { x: number; y: number; radius: number; size: number }
export interface CircularDraft {
  beatIndex: number;
  geometry: CircularGeometry;
  startAngle: number;
  cursorAngle: number;
  previousAngle: number;
  accumulated: number;
  direction: 0 | 1 | -1;
  frontier: number;
  notes: BeatType[];
  noteAngles: number[];
  atLimit: boolean;
}
export function candidateRadii(radius: number): number[] {
  return [radius, radius * 0.78, radius * 0.56, radius * 0.34];
}
export function beginCircularDraft(beatIndex: number, geometry: CircularGeometry, angle: number, type: BeatType): CircularDraft {
  return { beatIndex, geometry, startAngle: angle, cursorAngle: angle, previousAngle: angle,
    accumulated: 0, direction: 0, frontier: 0, notes: [type], noteAngles: [angle], atLimit: false };
}
export function moveCircularDraft(draft: CircularDraft, x: number, y: number): CircularDraft {
  const dx = x - draft.geometry.x, dy = y - draft.geometry.y;
  const distance = Math.hypot(dx, dy);
  // Near the hub atan2 becomes unstable; crossing it is not a new note.
  if (distance < draft.geometry.radius * 0.2) return draft;
  const angle = Math.atan2(dy, dx);
  const delta = Math.atan2(Math.sin(angle - draft.previousAngle), Math.cos(angle - draft.previousAngle));
  const accumulated = draft.accumulated + delta;
  const direction = draft.direction || (Math.abs(accumulated) >= CIRCULAR_STEP ? (accumulated > 0 ? 1 : -1) : 0);
  const notes = [...draft.notes], noteAngles = [...draft.noteAngles];
  let frontier = draft.frontier;
  // One-way frontier: reversing over a boundary cannot repeatedly create notes.
  const progress = direction * accumulated;
  while (direction && progress >= frontier + CIRCULAR_STEP && notes.length < MAX_SUBDIVISION_CELLS) {
    frontier += CIRCULAR_STEP;
    notes.push(notes[notes.length - 1]);
    noteAngles.push(draft.startAngle + direction * frontier);
  }
  const current = CIRCULAR_TYPES.indexOf(notes[notes.length - 1]);
  const radii = candidateRadii(draft.geometry.radius);
  let nearest = current;
  for (let i = 0; i < radii.length; i++) {
    // Radial hysteresis prevents flickering between adjacent candidates.
    if (Math.abs(distance - radii[i]) + draft.geometry.radius * 0.025 < Math.abs(distance - radii[nearest])) nearest = i;
  }
  notes[notes.length - 1] = CIRCULAR_TYPES[nearest];
  return { ...draft, notes, noteAngles, direction, frontier, accumulated, previousAngle: angle,
    cursorAngle: draft.startAngle + (direction ? direction * frontier : 0), atLimit: notes.length === MAX_SUBDIVISION_CELLS };
}

/** A mute first slot must not mute every slot through the legacy beat override. */
export function circularPatternBeatType(pattern: BeatType[]): BeatType {
  return pattern.length > 1 && pattern[0] === "mute" ? "normal" : pattern[0];
}