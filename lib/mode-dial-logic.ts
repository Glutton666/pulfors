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
 * path from the current slot. With an even number of slots, the half-way move
 * stays forward (3 steps for a six-slot dial); only longer moves wrap back.
 */
export function shortestModeDialTarget(currentPosition: number, targetIndex: number): number {
  const count = MODE_DIAL_SLOTS.length;
  const current = snapModeDialPosition(currentPosition);
  const target = snapModeDialPosition(targetIndex);
  let delta = target - current;

  if (delta > count / 2) delta -= count;
  if (delta < -count / 2) delta += count;

  return current + delta;
}
