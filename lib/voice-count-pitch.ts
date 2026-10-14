const SEMITONE_RATIO = 2 ** (1 / 12);
const WINDOW_SIZE = 1024;
const SEARCH_RADIUS = 96;

/**
 * Raises a count clip slightly while keeping its sample count and onset intact.
 * A small resample raises pitch, then WSOLA restores the original duration.
 */
export function raiseVoiceCountPitch(source: Float32Array): Float32Array {
  if (source.length < 1024) return new Float32Array(source);

  const ratio = SEMITONE_RATIO;
  const resampledLength = Math.max(1, Math.round(source.length / ratio));
  const resampled = new Float32Array(resampledLength);
  for (let i = 0; i < resampledLength; i++) {
    const position = i * ratio;
    const index = Math.floor(position);
    const fraction = position - index;
    const a = source[Math.min(index, source.length - 1)];
    const b = source[Math.min(index + 1, source.length - 1)];
    resampled[i] = a + (b - a) * fraction;
  }

  return stretchWithWsola(resampled, source.length);
}

function stretchWithWsola(source: Float32Array, outputLength: number): Float32Array {
  const window = Math.min(WINDOW_SIZE, 2 ** Math.floor(Math.log2(source.length)));
  if (window < 128) {
    const output = new Float32Array(outputLength);
    for (let i = 0; i < outputLength; i++) {
      output[i] = source[Math.min(source.length - 1, Math.floor(i * source.length / outputLength))] ?? 0;
    }
    return output;
  }

  const hop = window >> 1;
  const overlap = window - hop;
  const padded = new Float32Array(source.length + window + SEARCH_RADIUS);
  padded.set(source);
  const output = new Float32Array(outputLength + window);
  output.set(padded.subarray(0, Math.min(window, output.length)));
  const stretch = outputLength / source.length;

  for (let synthesisPosition = hop; synthesisPosition < outputLength; synthesisPosition += hop) {
    const expected = Math.round(synthesisPosition / stretch);
    const minCandidate = Math.max(0, expected - SEARCH_RADIUS);
    const maxCandidate = Math.min(source.length - 1, expected + SEARCH_RADIUS);
    let bestCandidate = Math.min(source.length - 1, Math.max(0, expected));
    let bestScore = -Infinity;

    for (let candidate = minCandidate; candidate <= maxCandidate; candidate += 2) {
      let dot = 0;
      let outputEnergy = 0;
      let inputEnergy = 0;
      for (let i = 0; i < overlap; i += 2) {
        const previous = output[synthesisPosition + i];
        const next = padded[candidate + i];
        dot += previous * next;
        outputEnergy += previous * previous;
        inputEnergy += next * next;
      }
      const denominator = Math.sqrt(outputEnergy * inputEnergy);
      const score = denominator > 1e-8 ? dot / denominator : -1;
      if (score > bestScore) {
        bestScore = score;
        bestCandidate = candidate;
      }
    }

    for (let i = 0; i < overlap && synthesisPosition + i < output.length; i++) {
      const blend = (i + 1) / (overlap + 1);
      output[synthesisPosition + i] =
        output[synthesisPosition + i] * (1 - blend) + padded[bestCandidate + i] * blend;
    }
    for (let i = overlap; i < window && synthesisPosition + i < output.length; i++) {
      output[synthesisPosition + i] = padded[bestCandidate + i];
    }
  }

  return output.slice(0, outputLength);
}
