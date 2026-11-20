import type { StaffNotebook, StaffPoint, StaffStamp } from "./staff-notebook";
import { rowAt } from "./staff-notebook-layout";

export type NotebookSticking = { lines: [string, string]; size: number };
export type NotebookFlam = { offset: number; sticking?: NotebookSticking };
export type PercussionTarget = { id: string; part: "note" | "flam" };

export const stickingLetters = ["R", "L", "K", "U", "D", "T"] as const;
export const stickingSizes = [10, 12, 14, 16, 18, 20, 22] as const;
export const defaultSticking: NotebookSticking = { lines: ["", ""], size: 14 };
export const defaultFlam: NotebookFlam = { offset: -21 };

export function stickingCharacter(text: string): string | null {
  const value = text.normalize("NFC").trim();
  return Array.from(value).length === 1 && !/[\s\p{C}\p{M}]/u.test(value) ? value : null;
}

export function validNotebookSticking(value?: NotebookSticking): boolean {
  return value === undefined || !!value && Array.isArray(value.lines) && value.lines.length === 2
    && value.lines.every((line) => typeof line === "string" && (line === "" || stickingCharacter(line) === line))
    && stickingSizes.some((size) => size === value.size);
}

export function validNotebookFlam(value?: NotebookFlam): boolean {
  return value === undefined || !!value && Number.isInteger(value.offset) && Math.abs(value.offset) >= 16
    && Math.abs(value.offset) <= 60 && validNotebookSticking(value.sticking);
}

export function flamOffset(value: number, previous: number): number {
  const side = Math.abs(value) < 4 ? Math.sign(previous) : Math.sign(value);
  return side * Math.max(16, Math.min(60, Math.round(Math.abs(value))));
}

export function flamPosition(note: StaffStamp, flam: NotebookFlam, width: number): StaffPoint {
  const scale = note.size / 26;
  const edge = 9 * scale;
  return { x: Math.max(edge, Math.min(width - edge, note.x + flam.offset * scale)), y: note.y - 2 * scale };
}

export function updateSticking(stamp: StaffStamp, part: PercussionTarget["part"], next: NotebookSticking): StaffStamp {
  if (part === "flam") return stamp.flam ? { ...stamp, flam: { ...stamp.flam, sticking: next } } : stamp;
  return { ...stamp, sticking: next };
}

// The traversal uses the authored score, not the zoomed page or the playback
// plan. A tie continuation is not a new hit, and a flam is not a timed stamp.
export function notebookPercussionOrder(note: StaffNotebook) {
  return note.pages.flatMap((page, pageIndex) => (page.stamps ?? [])
    .filter((s) => !s.generated && !s.split?.index && /^(whole|half|quarter|eighth|sixteenth|thirty_second)$/.test(s.glyph))
    .sort((a, b) => rowAt(a.y, page.staffCount ?? 7) - rowAt(b.y, page.staffCount ?? 7) || a.x - b.x || (a.order ?? 0) - (b.order ?? 0) || a.y - b.y)
    .flatMap((stamp) => {
      const main = { id: stamp.id, part: "note" as const, stamp, pageIndex };
      if (!stamp.flam) return [main];
      const small = { ...main, part: "flam" as const };
      return stamp.flam.offset < 0 ? [small, main] : [main, small];
    }));
}

export function samePercussionTarget(a: PercussionTarget, b: PercussionTarget) {
  return a.id === b.id && a.part === b.part;
}
