import { alignVisualElapsedToAudio } from "./web-audio-timing";

/**
 * Native rendered audio owns the phase. This only aligns visual callbacks;
 * it never seeks, restarts, or changes the scheduled PCM output.
 * Read the active resource on each call so boundary replacements cannot leave
 * the display attached to a released player. Realtime/sparse paths keep their
 * existing clock when they do not expose a rendered position.
 */
export function createNativeVisualTimingProvider(readPosition: () => number | undefined) {
  return (elapsedMs: number, durationMs: number, rendered: boolean): number | null => {
    if (!rendered) return null;
    try {
      const position = readPosition();
      if (position === undefined || !Number.isFinite(position)) return null;
      return alignVisualElapsedToAudio(elapsedMs, position * 1000, durationMs);
    } catch {
      // An output can be released between scheduling and this read.
      return null;
    }
  };
}
