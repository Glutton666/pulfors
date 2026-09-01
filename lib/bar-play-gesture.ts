export const BAR_PLAY_GESTURE_MIN_TRAVEL = 16;
export const BAR_PLAY_GESTURE_ROUND_TRIPS = 4;
export const BAR_PLAY_GESTURE_DIRECTION_CHANGES =
  BAR_PLAY_GESTURE_ROUND_TRIPS * 2;

export type BarPlayGestureDirection = "left" | "right";

export interface BarPlayGestureState {
  direction: BarPlayGestureDirection | null;
  turnX: number;
  lastX: number;
  directionChanges: number;
}

export interface BarPlayGestureUpdate {
  state: BarPlayGestureState;
  triggered: boolean;
}

export function createBarPlayGestureState(): BarPlayGestureState {
  return {
    direction: null,
    turnX: 0,
    lastX: 0,
    directionChanges: 0,
  };
}

/**
 * Feed the cumulative horizontal gesture position into the tracker.
 *
 * A direction must travel far enough from its previous turn before it can
 * count as a reversal. This keeps small touch jitter from creating a false
 * round trip while still allowing the finger to pause at either side.
 */
export function updateBarPlayGesture(
  state: BarPlayGestureState,
  x: number,
): BarPlayGestureUpdate {
  const next = { ...state, lastX: x };

  if (state.direction === null) {
    if (Math.abs(x) < BAR_PLAY_GESTURE_MIN_TRAVEL) {
      return { state: next, triggered: false };
    }
    next.direction = x < 0 ? "left" : "right";
    next.turnX = x;
    return { state: next, triggered: false };
  }

  const movement = x - state.lastX;
  if (movement === 0) {
    return { state: next, triggered: false };
  }

  const currentDirection: BarPlayGestureDirection =
    movement < 0 ? "left" : "right";

  if (currentDirection === state.direction) {
    next.turnX = x;
    return { state: next, triggered: false };
  }

  if (Math.abs(x - state.turnX) < BAR_PLAY_GESTURE_MIN_TRAVEL) {
    return { state: next, triggered: false };
  }

  next.direction = currentDirection;
  next.turnX = x;
  next.directionChanges += 1;

  return {
    state: next,
    triggered:
      next.directionChanges >= BAR_PLAY_GESTURE_DIRECTION_CHANGES,
  };
}