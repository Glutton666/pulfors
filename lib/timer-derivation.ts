export type TimerStateName =
  | "idle"
  | "running"
  | "paused"
  | "finishing"
  | "countdown";

export type TimerMode = "stopwatch" | "timer";

export function computeStopwatchElapsedMs(
  state: TimerStateName,
  startTime: number,
  elapsedAtPause: number,
  now: number
): number {
  if (state === "running" || state === "finishing") {
    return Math.max(0, now - startTime);
  }
  if (state === "paused") {
    return Math.max(0, elapsedAtPause);
  }
  return 0;
}

export function computeTimerRemaining(
  state: TimerStateName,
  startTime: number,
  startRemainingSec: number,
  pausedRemainingSec: number,
  totalDurationSec: number,
  now: number
): { sec: number; smooth: number } {
  if (state === "running") {
    const elapsedMs = Math.max(0, now - startTime);
    const sec = Math.max(0, startRemainingSec - Math.floor(elapsedMs / 1000));
    const smooth = Math.max(0, startRemainingSec - elapsedMs / 1000);
    return { sec, smooth };
  }
  if (state === "finishing" || state === "paused") {
    const safe = Math.max(0, pausedRemainingSec);
    return { sec: safe, smooth: safe };
  }
  return { sec: totalDurationSec, smooth: totalDurationSec };
}

export function computeTimerThermoFraction(
  state: TimerStateName,
  startTime: number,
  startRemainingSec: number,
  totalDurationSec: number,
  now: number
): number {
  if (totalDurationSec <= 0) return 0;
  if (state === "running") {
    const elapsedMs = Math.max(0, now - startTime);
    const smooth = Math.max(0, startRemainingSec - elapsedMs / 1000);
    return Math.max(0, Math.min(1, smooth / totalDurationSec));
  }
  if (state === "finishing" || state === "paused") {
    return Math.max(0, Math.min(1, startRemainingSec / totalDurationSec));
  }
  return 1;
}

export function isTimerExpired(
  startTime: number,
  startRemainingSec: number,
  now: number
): boolean {
  const elapsedMs = Math.max(0, now - startTime);
  return startRemainingSec - Math.floor(elapsedMs / 1000) <= 0;
}
