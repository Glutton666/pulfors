export type ShakeDirection = "left" | "right";

export interface ShakeTrackerState {
  lastPosition: number | null;
  lastDirection: ShakeDirection | null;
  directionChanges: number[];
}

export const SUBDIVISION_SHAKE_WINDOW_MS = 2000;
export const SUBDIVISION_SHAKE_DIRECTION_THRESHOLD = 3;
export const SUBDIVISION_SHAKE_COUNT_TRIGGER = 4;

export function createShakeTracker(): ShakeTrackerState {
  return {
    lastPosition: null,
    lastDirection: null,
    directionChanges: [],
  };
}

export function resetShakeTracker(state: ShakeTrackerState): void {
  state.lastPosition = null;
  state.lastDirection = null;
  state.directionChanges = [];
}

/**
 * Starts a gesture measured as displacement from its own starting point.
 * Seeding zero makes the first meaningful left/right move establish direction.
 */
export function beginShakeTracking(state: ShakeTrackerState): void {
  resetShakeTracker(state);
  state.lastPosition = 0;
}

/**
 * Updates a tracker with the current horizontal position.
 *
 * The gesture event's dx is measured from the beginning of the gesture, so its
 * sign does not describe a reversal when the finger moves left and then right
 * without crossing the starting point. Comparing consecutive positions does.
 */
export function trackSubdivisionShake(
  state: ShakeTrackerState,
  position: number,
  now: number,
  windowMs = SUBDIVISION_SHAKE_WINDOW_MS,
  directionThreshold = SUBDIVISION_SHAKE_DIRECTION_THRESHOLD,
  countTrigger = SUBDIVISION_SHAKE_COUNT_TRIGGER,
): boolean {
  const previousPosition = state.lastPosition;
  state.lastPosition = position;
  if (previousPosition === null) return false;

  const delta = position - previousPosition;
  if (Math.abs(delta) < directionThreshold) return false;

  const direction: ShakeDirection = delta < 0 ? "left" : "right";
  if (state.lastDirection !== null && direction !== state.lastDirection) {
    state.directionChanges.push(now);
  }
  state.lastDirection = direction;
  state.directionChanges = state.directionChanges.filter(
    (timestamp) => now - timestamp < windowMs,
  );

  if (state.directionChanges.length >= countTrigger) {
    resetShakeTracker(state);
    return true;
  }
  return false;
}