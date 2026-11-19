import type { NotebookNoteRole, StaffPoint } from "./staff-notebook";

export const noteDurations = ["whole", "half", "quarter", "eighth", "sixteenth", "thirty_second"] as const;
export const noteRoles = ["ghost", "normal", "strong"] as const;
type Duration = typeof noteDurations[number];
export type NotePickerChoice = { glyph: Duration; role: NotebookNoteRole; dotted: boolean };
const ascending = [...noteDurations].reverse();
const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(lo, hi), Math.max(lo, n));

/** The display and hit test both read these window-space points. */
export function layoutNotePicker(anchor: StaffPoint, width: number, top: number, bottom: number) {
  const up = anchor.y - top, down = bottom - anchor.y;
  const direction = up >= 150 || up >= down ? -1 : 1;
  const room = Math.max(20, direction === -1 ? up : down);
  const radius = clamp(room / 13, 6, 14);
  const step = clamp((room - radius - 47) / 5, 4, 32);
  const near = Math.min(48, room - radius - 5 * step);
  const roleSpace = Math.min(46, Math.max(16, (width - 36) / 4));
  const branchSpace = Math.min(36, roleSpace);
  const x = clamp(anchor.x, roleSpace + 18, width - roleSpace - 18);
  const curve = x < width / 2 ? 1 : -1;
  const roles = noteRoles.map((role, i) => ({ role, x: x + (i - 1) * roleSpace, y: anchor.y - 6 * Math.abs(i - 1) }));
  const durations = ascending.map((glyph, i) => ({
    glyph, x: clamp(x + curve * (10 + 20 * Math.sin(i / 5 * Math.PI)), branchSpace + radius + 3, width - branchSpace - radius - 3),
    y: anchor.y + direction * (near + step * i),
  }));
  return { anchor, roles, durations, direction, radius, step, branchSpace, near };
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
    } else if (Math.abs(point.x - state.roleX) >= 8 && Math.abs(point.y - anchor.y) <= 20) {
      const closest = layout.roles.reduce((a, b) => Math.abs(point.x - a.x) <= Math.abs(point.x - b.x) ? a : b);
      next.choice = { ...state.choice, role: closest.role };
    }
  } else if (travel < enter * .6 && (state.enteredLane || Math.abs(point.x - anchor.x) > branchSpace)) {
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
