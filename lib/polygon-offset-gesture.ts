import { clampPolygonOffsetMs } from "./polygon-offset";

const TAP_SLOP = 6;
const SHAKE_STROKE = 12;
const SHAKE_WINDOW_MS = 1800;
const TURNS_TO_UNLOCK = 4;

export function createPolygonOffsetGesture(baseOffset: number, slotMs: number) {
  let moved = false;
  let extremeX = 0;
  let direction = 0;
  let turns: number[] = [];
  let unlockX: number | null = null;
  return {
    get moved() { return moved; },
    update(dx: number, dy: number, now: number): { ms: number; offset: number } | null {
      if (Math.hypot(dx, dy) > TAP_SLOP) moved = true;
      if (unlockX === null) {
        if (Math.abs(dy) > 32) {
          turns = [];
          direction = 0;
          extremeX = dx;
          return null;
        }
        const distance = dx - extremeX;
        if (direction !== 0 && Math.sign(distance) === direction) extremeX = dx;
        else if (Math.abs(distance) >= SHAKE_STROKE) {
          if (direction !== 0) turns.push(now);
          direction = Math.sign(distance);
          extremeX = dx;
        }
        turns = turns.filter(time => now - time <= SHAKE_WINDOW_MS);
        if (turns.length < TURNS_TO_UNLOCK) return null;
        // Start adjusting from the position at unlock, not from the
        // shake's initial down point. Unlocking itself never changes timing.
        unlockX = dx;
      }
      const shift = dx - unlockX;
      const ms = clampPolygonOffsetMs(baseOffset * slotMs + shift * Math.max(1, slotMs / 440), slotMs);
      return { ms, offset: shift === 0 ? baseOffset : ms / slotMs };
    },
  };
}
