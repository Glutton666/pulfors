import type { BeatType, ScheduledTick } from "./metronome-engine-pure";

export interface PlaybackVisual {
  beat: number;
  subBeat: number;
  type: BeatType;
  intervalMs: number;
  ageMs: number;
  pulseId: string;
  /** Diagnostic timestamps on the existing performance clock, not audio deadlines. */
  sampledAtMs?: number;
  deliveredAtMs?: number;
}

/** Read the latest base-layer position, never replay an audio callback. */
export function findVisualTick(schedule: readonly ScheduledTick[], elapsedMs: number): number {
  let lo = 0, hi = schedule.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (schedule[mid].time <= elapsedMs) lo = mid + 1;
    else hi = mid;
  }
  for (let i = lo - 1; i >= 0; i--) if (schedule[i].layerIndex === 0) return i;
  return -1;
}

export function visualTickInterval(schedule: readonly ScheduledTick[], index: number, durationMs: number): number {
  for (let i = index + 1; i < schedule.length; i++) {
    if (schedule[i].layerIndex === 0 && schedule[i].time > schedule[index].time) {
      return Math.max(1, schedule[i].time - schedule[index].time);
    }
  }
  return Math.max(1, durationMs - schedule[index].time);
}

/** Immediate onset; expire an old pulse rather than restart it after a late frame. */
export function playbackPulseEnvelope(intervalMs: number, ageMs = 0) {
  "worklet";
  const interval = Number.isFinite(intervalMs) ? Math.max(1, intervalMs) : 500;
  const releaseMs = Math.min(200, interval * 0.8);
  const age = Number.isFinite(ageMs) ? Math.max(0, ageMs) : 0;
  const remainingMs = Math.max(0, releaseMs - age);
  return { initial: remainingMs / releaseMs, remainingMs };
}