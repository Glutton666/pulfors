import type { NotebookNoteRole, StaffPoint } from "./staff-notebook";

export const noteDurations = ["whole", "half", "quarter", "eighth", "sixteenth", "thirty_second"] as const;
export const noteRoles = ["ghost", "normal", "strong"] as const;
export type NotationPickerKind = "note" | "rest";
type Duration = typeof noteDurations[number];
export type NotePickerChoice = { glyph: Duration; role: NotebookNoteRole; dotted: boolean };
const ascending = [...noteDurations].reverse();
const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(lo, hi), Math.max(lo, n));

/** The display and hit test both read these window-space points. */
export function layoutNotePicker(anchor: StaffPoint, width: number, top: number, bottom: number, kind: NotationPickerKind = "note") {
  const up = anchor.y - top, down = bottom - anchor.y;
  const direction = up >= 315 || up >= down ? -1 : 1;
  const room = Math.max(20, (direction === -1 ? up : down) - 4);
  const near = clamp(room * .12, 16, 34);
  const radius = clamp((room - near - 20) / 11, 2, Math.min(23, width / 8));
  const step = clamp((room - near - radius) / 5, 1, 52);
  const roleRadius = Math.min(23, width / 8);
  const roleSpace = roleRadius * 2 + 7;
  const branchSpace = radius * 2 + 7;
  const x = clamp(anchor.x, roleSpace + roleRadius + 4, width - roleSpace - roleRadius - 4);
  const roles = noteRoles.map((role, i) => ({ role, x: x + (i - 1) * roleSpace, y: anchor.y }));
  const durations = ascending.map((glyph, i) => ({
    glyph, x,
    y: anchor.y + direction * (near + step * i),
  }));
  return { anchor, kind, roles, durations, direction, radius, roleRadius, step, branchSpace, near };
}
export type NotePickerLayout = ReturnType<typeof layoutNotePicker>;
export type NotePickerDrag = {
  choice: NotePickerChoice; phase: "role" | "duration";
  last: StaffPoint; roleX: number; branchArmed: boolean; enteredLane: boolean;
  furthest: number; peakChoice: NotePickerChoice;
  focus: "glyph" | "variant";
};

export const startNotePickerDrag = (choice: NotePickerChoice, start: StaffPoint): NotePickerDrag => ({
  choice, phase: "role", last: start, roleX: start.x, branchArmed: false, enteredLane: false, furthest: 0, peakChoice: choice, focus: "glyph",
});

export function moveNotePickerDrag(state: NotePickerDrag, layout: NotePickerLayout, point: StaffPoint): NotePickerDrag {
  const { anchor, direction, near, step, branchSpace } = layout;
  const travel = (point.y - anchor.y) * direction;
  const enter = clamp(near * .58, 10, 18);
  const next = { ...state, last: point };
  if (state.phase === "role") {
    if (travel >= enter || (direction === 1 && point.y < anchor.y - enter)) {
      Object.assign(next, { phase: "duration", branchArmed: false, enteredLane: false, furthest: 0, peakChoice: state.choice, focus: "glyph" });
    } else if (layout.kind === "note" && Math.abs(point.x - state.roleX) >= 8 && Math.abs(point.y - anchor.y) <= 20) {
      const closest = layout.roles.reduce((a, b) => Math.abs(point.x - a.x) <= Math.abs(point.x - b.x) ? a : b);
      next.choice = { ...state.choice, role: closest.role };
    }
  } else if (Math.abs(point.y - anchor.y) < enter * .6 && (state.enteredLane || Math.abs(point.x - anchor.x) > branchSpace)) {
    return { ...next, phase: "role", roleX: point.x, choice: state.peakChoice, branchArmed: false, enteredLane: false };
  }
  if (next.phase !== "duration" || travel < Math.max(enter, near - step * .5)) return next;
  const target = layout.durations[clamp(Math.round((travel - near) / step), 0, layout.durations.length - 1)];
  const dx = point.x - target.x;
  const horizontal = Math.abs(point.x - state.last.x) >= Math.abs(point.y - state.last.y);
  const inLane = Math.abs(dx) <= branchSpace + layout.radius;
  if (inLane) {
    const previousDuration = next.choice.glyph;
    next.enteredLane = true;
    next.choice = { ...next.choice, glyph: target.glyph };
    if (previousDuration !== target.glyph) { next.branchArmed = false; next.focus = "glyph"; }
    if (Math.abs(dx) <= branchSpace * .33) { next.branchArmed = true; next.focus = "glyph"; }
    if (next.branchArmed && horizontal && Math.abs(dx) >= branchSpace * .43) {
      next.choice.dotted = dx < 0;
      next.focus = "variant";
      // A deliberate sideways variant selection is also a new return point.
      next.peakChoice = next.choice;
      next.furthest = travel;
    } else if (travel >= state.furthest) {
      next.peakChoice = next.choice;
      next.furthest = travel;
    }
  }
  return next;
}
