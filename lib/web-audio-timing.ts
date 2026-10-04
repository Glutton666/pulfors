/** Browser output time, distinct from the audio graph's render-ahead clock. */
export interface WebPresentationClock {
  currentTime: number;
  baseLatency?: number;
  outputLatency?: number;
  getOutputTimestamp?: () => { contextTime?: number; performanceTime?: number };
}

export function getWebAudioPresentationTime(
  clock: WebPresentationClock,
  nowPerformanceMs = performance.now(),
): number {
  if (clock.getOutputTimestamp) {
    try {
      const stamp = clock.getOutputTimestamp();
      if (
        typeof stamp.contextTime === "number" &&
        typeof stamp.performanceTime === "number" &&
        Number.isFinite(stamp.contextTime) &&
        Number.isFinite(stamp.performanceTime) &&
        (stamp.contextTime > 0 || stamp.performanceTime > 0)
      ) {
        return Math.max(0, Math.min(
          clock.currentTime,
          stamp.contextTime + (nowPerformanceMs - stamp.performanceTime) / 1000,
        ));
      }
    } catch {
      // Older browsers may expose the method without supporting it.
    }
  }
  const latency = [clock.baseLatency, clock.outputLatency]
    .reduce<number>((sum, value) =>
      sum + (value !== undefined && Number.isFinite(value) ? Math.max(0, value) : 0), 0);
  return Math.max(0, clock.currentTime - latency);
}

/**
 * Preserve the engine's measure count while following the audible phase.
 * Negative elapsed values are intentional before a scheduled source is audible.
 */
export function alignVisualElapsedToAudio(
  wallElapsedMs: number,
  audioPositionMs: number,
  measureDurationMs: number,
): number {
  if (!Number.isFinite(audioPositionMs) || !Number.isFinite(measureDurationMs) || measureDurationMs <= 0) {
    return wallElapsedMs;
  }
  const wrap = (value: number) => ((value % measureDurationMs) + measureDurationMs) % measureDurationMs;
  let delta = wrap(audioPositionMs) - wrap(wallElapsedMs);
  if (delta > measureDurationMs / 2) delta -= measureDurationMs;
  if (delta < -measureDurationMs / 2) delta += measureDurationMs;
  return wallElapsedMs + delta;
}