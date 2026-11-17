/**
 * Polygon's virtual beats share the engine's pulse anchor without changing the
 * engine BPM (or inheriting its denominator). Effective BPM may be 10..600;
 * it must never pass through the ordinary 20..300 BPM clamp.
 */
export type PolygonPlaybackRate = 0.5 | 1 | 2;

export interface PolygonClockSettings {
  bpm: number;
  clockBpm: number;
  playbackRate: PolygonPlaybackRate;
}

export function polygonEffectiveBpm(bpm: number, playbackRate: PolygonPlaybackRate): number {
  if (!Number.isFinite(bpm) || bpm < 20 || bpm > 300) {
    throw new RangeError("Polygon display BPM must be between 20 and 300");
  }
  if (playbackRate !== 0.5 && playbackRate !== 1 && playbackRate !== 2) {
    throw new RangeError("Unsupported Polygon playback rate");
  }
  return bpm * playbackRate;
}

/**
 * A requested rate is committed on pulse(), never midway through an engine
 * beat. Fractional virtual beats carry across pulses (including a denominator-
 * adjusted/clamped engine clock). Every delayed callback owns a generation.
 */
export function createPolygonClock(callbacks: {
  onBoundary: (settings: PolygonClockSettings) => void;
  onBeat: (absoluteBeat: number, effectiveBpm: number) => void;
}) {
  let settings: PolygonClockSettings | null = null;
  let nextBeatMs = 0;
  let absoluteBeat = 0;
  let generation = 0;
  let disposed = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const clearTimers = () => {
    generation++;
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
  };
  return {
    pulse(next: PolygonClockSettings) {
      if (disposed) return;
      const effectiveBpm = polygonEffectiveBpm(next.bpm, next.playbackRate);
      if (!Number.isFinite(next.clockBpm) || next.clockBpm <= 0) {
        throw new RangeError("Invalid Polygon engine clock");
      }
      // An overdue previous subdivision must not burst after a newer pulse.
      clearTimers();
      if (!settings || settings.bpm !== next.bpm ||
          settings.playbackRate !== next.playbackRate ||
          settings.clockBpm !== next.clockBpm) {
        // Rate changes start a new shared phase. Ordinary tempo edits retain
        // the next musical beat, as they did before rate selection existed.
        if (settings && settings.playbackRate !== next.playbackRate) absoluteBeat = 0;
        settings = { ...next };
        nextBeatMs = 0;
        callbacks.onBoundary(settings);
      }
      const beatMs = 60000 / effectiveBpm;
      const spanMs = 60000 / next.clockBpm;
      const owner = generation;
      while (nextBeatMs < spanMs - 0.0001) {
        const beat = absoluteBeat++;
        const delay = Math.max(0, nextBeatMs);
        const deliver = () => {
          if (!disposed && owner === generation) callbacks.onBeat(beat, effectiveBpm);
        };
        if (delay < 0.0001) deliver();
        else {
          const timer = setTimeout(() => {
            timers.delete(timer);
            deliver();
          }, delay);
          timers.add(timer);
        }
        nextBeatMs += beatMs;
      }
      nextBeatMs = Math.max(0, nextBeatMs - spanMs);
    },
    reset() {
      clearTimers();
      settings = null;
      nextBeatMs = 0;
      absoluteBeat = 0;
    },
    reanchor() {
      clearTimers();
      nextBeatMs = 0;
    },
    dispose() {
      clearTimers();
      disposed = true;
    },
  };
}
