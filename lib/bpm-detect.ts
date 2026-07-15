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

/**
 * Autocorrelation-based BPM candidate ranking from a precomputed onset-strength
 * envelope (e.g. energy-diff onset or spectral-flux onset). Mirrors the
 * scoring/tempo-bonus logic used by the server's detectBpmCandidatesFromSamples
 * so on-device and server-side detection produce comparable results.
 *
 * Returns candidates sorted by descending confidence score, deduplicated,
 * capped at 3 entries (best lag + half-tempo + double-tempo).
 */
export function detectBpmCandidatesFromOnset(onset: Float32Array, hopRate: number): number[] {
  if (onset.length < 8) return [];

  const lagMin = Math.max(1, Math.floor((hopRate * 60) / MAX_BPM));
  const lagMax = Math.min(onset.length - 1, Math.ceil((hopRate * 60) / MIN_BPM));
  if (lagMin >= lagMax) return [];

  const acf = new Float32Array(lagMax + 1);
  for (let lag = lagMin; lag <= lagMax; lag++) {
    const count = onset.length - lag;
    if (count <= 0) continue;
    let corr = 0;
    for (let i = 0; i < count; i++) corr += onset[i] * onset[i + lag];
    acf[lag] = corr / count;
  }

  let bestLag = lagMin;
  let bestCorr = 0;
  for (let lag = lagMin; lag <= lagMax; lag++) {
    if (acf[lag] > bestCorr) {
      bestCorr = acf[lag];
      bestLag = lag;
    }
  }
  if (bestCorr <= 0) return [];

  const candidates: { bpm: number; score: number }[] = [];
  const addCandidate = (lag: number) => {
    if (lag < lagMin || lag > lagMax) return;
    const bpm = Math.round((hopRate * 60) / lag);
    if (bpm < MIN_BPM || bpm > MAX_BPM) return;
    const corr = acf[lag] ?? 0;
    const tempoBonus = bpm >= 80 && bpm <= 160 ? 1.2 : 1.0;
    candidates.push({ bpm, score: (corr / bestCorr) * tempoBonus });
  };
  addCandidate(bestLag);
  addCandidate(Math.round(bestLag / 2));
  addCandidate(bestLag * 2);
  candidates.sort((a, b) => b.score - a.score);

  const seen = new Set<number>();
  const result: number[] = [];
  for (const c of candidates) {
    if (!seen.has(c.bpm)) {
      seen.add(c.bpm);
      result.push(c.bpm);
    }
  }
  return result;
}
