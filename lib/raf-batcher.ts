/**
 * rAF batcher: coalesces rapid `schedule()` calls into a single `flush()` per
 * animation frame. Used to throttle metronome engine progress callbacks
 * (onBeat/onSubBeat/onProgress) so React state setters fire at most once per
 * frame even when the engine ticks at sub-beat rates (e.g. BPM 200 + 16
 * subdivisions).
 *
 * Why a wrapper instead of inline rAF?
 * - Lets us inject a fake raf in tests to verify the 60Hz cap.
 * - Provides a setTimeout(16ms) fallback when `requestAnimationFrame` is not
 *   available (older React Native runtime, headless tests, edge web cases).
 *
 * Audio/scheduling timing is unaffected — the engine still calls callbacks
 * synchronously at every tick. Only the *visual* state setter is throttled.
 */
export interface RafBatcher {
  /** Request a flush on the next frame. Subsequent calls before the frame are coalesced. */
  schedule(): void;
  /** Cancel any pending flush (does not run `flush`). */
  cancel(): void;
  /** Run `flush` immediately and clear the pending flag. Useful on teardown. */
  flushNow(): void;
}

export type RafLike = (cb: () => void) => number;
export type CancelRafLike = (handle: number) => void;

const FALLBACK_FRAME_MS = 16;

function pickRaf(): { raf: RafLike; cancel: CancelRafLike | null } {
  const g = globalThis as unknown as {
    requestAnimationFrame?: RafLike;
    cancelAnimationFrame?: CancelRafLike;
  };
  if (typeof g.requestAnimationFrame === "function") {
    return { raf: g.requestAnimationFrame, cancel: g.cancelAnimationFrame ?? null };
  }
  // Fallback: setTimeout @ ~60Hz. cast handles Node `Timeout` vs browser number.
  return {
    raf: (cb) => setTimeout(cb, FALLBACK_FRAME_MS) as unknown as number,
    cancel: ((h) => clearTimeout(h as unknown as ReturnType<typeof setTimeout>)) as CancelRafLike,
  };
}

export function createRafBatcher(
  flush: () => void,
  options: { raf?: RafLike; cancelRaf?: CancelRafLike | null } = {},
): RafBatcher {
  const picked = pickRaf();
  const raf = options.raf ?? picked.raf;
  const cancelRaf = options.cancelRaf === undefined ? picked.cancel : options.cancelRaf;

  let handle: number | null = null;

  const run = () => {
    handle = null;
    flush();
  };

  return {
    schedule() {
      if (handle !== null) return;
      handle = raf(run);
    },
    cancel() {
      if (handle !== null && cancelRaf) {
        try { cancelRaf(handle); } catch {}
      }
      handle = null;
    },
    flushNow() {
      if (handle !== null && cancelRaf) {
        try { cancelRaf(handle); } catch {}
      }
      handle = null;
      flush();
    },
  };
}
