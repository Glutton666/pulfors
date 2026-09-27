export type RenderedMeasurePCM =
  | Float32Array
  | { left: Float32Array; right: Float32Array };

export interface AudibleInterval {
  /** Inclusive frame offset from the start of the measure. */
  startFrame: number;
  /** Exclusive frame offset; may exceed periodFrames for an interval wrapping the measure boundary. */
  endFrame: number;
}

export interface SparseAudibleIntervals {
  intervals: AudibleInterval[];
  periodFrames: number;
}

const RENDER_SAMPLE_RATE = 44100;
const MIN_EXACT_ZERO_GAP_FRAMES = Math.ceil(RENDER_SAMPLE_RATE * 0.005);

/**
 * Finds audible regions in the complete rendered PCM loop. renderMeasure
 * returns two distinct measure copies, and both copies are retained as part
 * of that loop rather than folded into one measure. A frame is audible if
 * either channel is exactly nonzero. Short exact-zero gaps are joined to avoid
 * splitting on zero crossings; nonzero samples are never thresholded away.
 *
 * Wrapping regions use an endFrame greater than periodFrames, so their
 * exclusive end remains unambiguous (and the interval can be copied modulo
 * periodFrames). Intervals are returned in ascending startFrame order.
 */
export function extractSparseAudibleIntervals(
  pcm: RenderedMeasurePCM,
): SparseAudibleIntervals {
  const channels = pcm instanceof Float32Array ? [pcm] : [pcm.left, pcm.right];
  const periodFrames = channels[0].length;

  if (channels.some((channel) => channel.length !== periodFrames)) {
    throw new RangeError("Stereo PCM channels must have matching lengths");
  }
  if (periodFrames === 0) return { intervals: [], periodFrames };

  // Preserve the exact rendered loop frame-for-frame; only stereo channels
  // are unioned to produce one interval list.
  const audible = new Uint8Array(periodFrames);
  for (let frame = 0; frame < periodFrames; frame++) {
    for (const channel of channels) {
      if (channel[frame] !== 0) {
        audible[frame] = 1;
        break;
      }
    }
  }

  if (!audible.some(Boolean)) return { intervals: [], periodFrames };

  // Fill only short runs of exact zeros. The loop is circular so gaps that
  // straddle the measure boundary are treated exactly like interior gaps.
  for (let frame = 0; frame < periodFrames; frame++) {
    const previous = (frame + periodFrames - 1) % periodFrames;
    if (!audible[previous] || audible[frame]) continue;

    let gapLength = 0;
    while (gapLength < periodFrames && !audible[(frame + gapLength) % periodFrames]) {
      gapLength++;
    }
    if (gapLength < MIN_EXACT_ZERO_GAP_FRAMES) {
      for (let offset = 0; offset < gapLength; offset++) {
        audible[(frame + offset) % periodFrames] = 1;
      }
    }
  }

  if (audible.every(Boolean)) {
    return { intervals: [{ startFrame: 0, endFrame: periodFrames }], periodFrames };
  }

  const intervals: AudibleInterval[] = [];
  for (let frame = 0; frame < periodFrames; frame++) {
    const previous = (frame + periodFrames - 1) % periodFrames;
    if (!audible[frame] || audible[previous]) continue;

    let length = 0;
    while (length < periodFrames && audible[(frame + length) % periodFrames]) {
      length++;
    }
    intervals.push({ startFrame: frame, endFrame: frame + length });
  }

  return { intervals, periodFrames };
}