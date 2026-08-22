export type ModeSlot =
  | "beat"
  | "bar"
  | "score"
  | "note"
  | "practice"
  | "stage"
  | "menu";

export const MODE_DIAL_SLOTS: ModeSlot[] = [
  "beat",
  "bar",
  "note",
  "stage",
  "practice",
  "menu",
];

export interface ModeDialSession {
  selectedIndex: number;
  scrollPosition: number;
}

/** Build the canonical starting point for a newly opened dial session. */
export function modeDialSessionForMode(mode: ModeSlot): ModeDialSession {
  const index = Math.max(0, MODE_DIAL_SLOTS.indexOf(mode));
  return { selectedIndex: index, scrollPosition: index };
}

export function wrapModeDialPosition(value: number): number {
  const count = MODE_DIAL_SLOTS.length;
  return ((value % count) + count) % count;
}

export function snapModeDialPosition(value: number): number {
  const count = MODE_DIAL_SLOTS.length;
  return ((Math.round(wrapModeDialPosition(value)) % count) + count) % count;
}

/**
 * Returns the equivalent integer slot nearest to a wrapped visual position.
 * The canonical snapped index remains suitable for state, while this value
 * prevents a spring from travelling across the whole dial at its wrap seam.
 */
export function nearestModeDialSnapTarget(value: number): number {
  const count = MODE_DIAL_SLOTS.length;
  const snapped = snapModeDialPosition(value);
  return snapped + Math.round((value - snapped) / count) * count;
}

/**
 * Returns the equivalent visual position for a tapped slot using the shortest
 * path from the current dial position.
 *
 * The tie-break intentionally mirrors DialIconSlot's circular offset math:
 * when an even-slot dial has an icon exactly three slots away, it follows the
 * side where that icon is actually rendered instead of always forcing a
 * positive ("forward") turn.
 */
export function shortestModeDialTarget(currentPosition: number, targetIndex: number): number {
  const count = MODE_DIAL_SLOTS.length;
  const target = snapModeDialPosition(targetIndex);
  const rawDelta = target - currentPosition;
  const visualDelta = rawDelta - Math.round(rawDelta / count) * count;
  return currentPosition + visualDelta;
}
