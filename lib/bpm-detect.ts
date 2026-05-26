/**
 * BPM detection from raw PCM samples.
 * Algorithm: energy envelope → half-wave rectification of differences (onset strength) → autocorrelation.
 * Range: 50–250 BPM. Returns null if signal is too quiet or data is insufficient.
 */

const WINDOW_SIZE = 1024;
const HOP_SIZE = 512;
const MIN_BPM = 50;
const MAX_BPM = 250;
const MIN_ONSET_RMS = 0.001;

export function detectBpm(samples: Float32Array, sampleRate: number): number | null {
  if (samples.length < sampleRate * 2) return null;

  // Step 1: RMS energy per hop
  const frames: number[] = [];
  for (let i = 0; i + WINDOW_SIZE <= samples.length; i += HOP_SIZE) {
    let e = 0;
    for (let j = 0; j < WINDOW_SIZE; j++) e += samples[i + j] ** 2;
    frames.push(Math.sqrt(e / WINDOW_SIZE));
  }
  if (frames.length < 8) return null;

  const maxEnergy = Math.max(...frames);
  if (maxEnergy < MIN_ONSET_RMS) return null;

  // Step 2: Onset strength = HWR of first-difference
  const onset: number[] = [0];
  for (let i = 1; i < frames.length; i++) {
    onset.push(Math.max(0, frames[i] - frames[i - 1]));
  }

  // Step 3: Autocorrelation over lag range for 50–250 BPM
  const hopRate = sampleRate / HOP_SIZE;
  const minLag = Math.round((60 / MAX_BPM) * hopRate);
  const maxLag = Math.round((60 / MIN_BPM) * hopRate);
  if (maxLag >= onset.length) return null;

  let bestVal = -Infinity;
  let bestLag = minLag;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    const n = onset.length - lag;
    for (let i = 0; i < n; i++) sum += onset[i] * onset[i + lag];
    const acf = sum / n;
    if (acf > bestVal) { bestVal = acf; bestLag = lag; }
  }
  if (bestVal <= 0) return null;

  const bpm = Math.round((60 * hopRate) / bestLag);
  return bpm >= MIN_BPM && bpm <= MAX_BPM ? bpm : null;
}
