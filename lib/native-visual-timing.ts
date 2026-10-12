import { alignVisualElapsedToAudio } from "./web-audio-timing";

/**
 * Native rendered audio owns the phase. This only aligns visual callbacks;
 * it never seeks, restarts, or changes the scheduled PCM output.
 * Read the active resource on each call so boundary replacements cannot leave
 * the display attached to a released player. Realtime/sparse paths keep their
 * existing clock when they do not expose a rendered position.
 */
export function createNativeVisualTimingProvider(readPosition: () => number | undefined) {
  let awaitingStart = false;
  let startupDelayMs = 0;
  return (elapsedMs: number, durationMs: number, rendered: boolean): number | null => {
    if (!rendered) return null;
    try {
      const position = readPosition();
      if (position === undefined || !Number.isFinite(position)) return null;
      if (position < 0) {
        awaitingStart = true;
        // A loading sentinel is not a loop phase. Hold even with the engine's
        // maximum visual offset; wrapping it could finish a silent measure.
        return Math.min(-1000, position * 1000);
      }
      if (awaitingStart) {
        startupDelayMs = elapsedMs - position * 1000;
        awaitingStart = false;
      }
      // Keep the initial preparation delay out of the phase comparison,
      // including after the engine advances its measure start timestamp.
      return alignVisualElapsedToAudio(elapsedMs - startupDelayMs, position * 1000, durationMs);
    } catch {
      // An output can be released between scheduling and this read.
      return null;
    }
  };
}
