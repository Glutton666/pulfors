export type ModeSlot =
  | "beat"
  | "bar"
  | "score"
  | "note"
  | "practice"
  | "stage"
  | "menu";

export type ModeDialWall = "top" | "right" | "bottom" | "left";

export const MODE_DIAL_SLOTS: ModeSlot[] = [
  "beat",
  "bar",
  "note",
  "stage",
  "practice",
  "menu",
];

/**
 * Pointer movement -> logical scroll direction for each wall.
 *
 * A positive scroll position moves the next slot toward the dial centre. The
 * signs are intentionally kept here with the slot math rather than beside
 * gesture code so a wall-specific input adapter cannot silently invert mode
 * selection at a screen edge.
 */
export const MODE_DIAL_SWIPE_SIGN: Record<ModeDialWall, 1 | -1> = {
  top: -1,
  right: -1,
  bottom: 1,
  left: 1,
};

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

/**
 * Direction used by the content transition.
 *
 * "right" means the selected content enters from the right and settles left;
 * "left" is its mirror image. It is derived from the same shortest-path
 * target used by the dial, including the 5→0 and 0→5 wrap seams.
 */
export function modeDialTransitionDirection(
  currentPosition: number,
  targetIndex: number,
): "left" | "right" {
  return shortestModeDialTarget(currentPosition, targetIndex) < currentPosition
    ? "left"
    : "right";
}

/**
 * Coordinates asynchronous mode work with React's independently committed
 * renders. A committed earlier synchronous mode (for example stage) is still
 * recognised while a newer async request (for example note) is loading.
 */
export function createModeTransitionCoordinator() {
  let generation = 0;
  const expectedCommits = new Map<ModeSlot, number>();
  const activeTokens = new Set<number>();
  return {
    begin(): number {
      generation += 1;
      activeTokens.add(generation);
      return generation;
    },
    isCurrent(token: number): boolean {
      return token === generation && activeTokens.has(token);
    },
    /** Mark a state write that is explicitly owned by a dial transition. */
    expectModeCommit(mode: ModeSlot, token: number): void {
      if (this.isCurrent(token)) expectedCommits.set(mode, token);
    },
    /** Acknowledge a React commit caused by a tagged mode transition. */
    acknowledgeModeCommit(mode: ModeSlot): boolean {
      if (expectedCommits.has(mode)) {
        expectedCommits.delete(mode);
        return true;
      }
      // No pending requests means this is the initial render or an already
      // settled mode update. It cannot invalidate anything.
      if (activeTokens.size === 0) return true;

      // A different UI path changed the mode while async work was pending.
      generation += 1;
      expectedCommits.clear();
      activeTokens.clear();
      return false;
    },
    /** Clear an async transition after all of its work settles. */
    finish(token: number): void {
      activeTokens.delete(token);
      for (const [mode, owner] of expectedCommits) {
        if (owner === token) expectedCommits.delete(mode);
      }
    },
    /** A non-dial writer wins immediately, even if it selects the same mode. */
    invalidateForExternalModeChange(): void {
      if (activeTokens.size === 0) return;
      generation += 1;
      expectedCommits.clear();
      activeTokens.clear();
    },
  };
}

/** Optional guards must not block direct, non-dial note-mode entry. */
export function modeTransitionMayApply(isCurrentTransition?: () => boolean): boolean {
  return !isCurrentTransition || isCurrentTransition();
}

/** Stage overlays, rather than replaces, the core content mode. */
export function stageExitRevealMode(
  coreMode: "beat" | "bar" | "note" | "score",
): ModeSlot {
  return coreMode;
}
