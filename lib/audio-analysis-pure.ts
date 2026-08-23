/**
 * Pure audio-analysis helpers shared between the server main thread and the
 * eval-mode Worker that runs WAV analysis off the main event loop.
 *
 * Rules for this file:
 *  - NO React Native imports (no @/lib/logger, no native modules, etc.)
 *  - NO side-effects at module load time
 *  - All functions must be serialisable via .toString() so they can be
 *    injected verbatim into the worker's eval'd JS context.
 *
 * The worker cannot `require()` this module after esbuild bundles the server
 * for production, so server/routes.ts injects these function bodies into the
 * worker string using the same .toString() injection already used for
 * `autoCorrelate`.  The TypeScript versions here remain the single source of
 * truth – the worker just runs the compiled JS form.
 */

export const NOTE_NAMES_PURE = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
] as const;

/**
 * Convert a frequency (Hz) to a note name, octave, and cent offset.
 *
 * Identical algorithm to lib/signal-analysis.ts `frequencyToNote`, kept here
 * so server/routes.ts can import a single definition instead of duplicating.
 *
 * IMPORTANT: The note-names array is declared INSIDE the function body so
 * that this function is self-contained when injected into the eval Worker via
 * .toString(). Do NOT reference module-level constants from this function.
 */
export function frequencyToNote(freq: number): { name: string; octave: number; cents: number } {
  const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const semitones = 12 * Math.log2(freq / 440);
  const rounded = Math.round(semitones);
  const cents = Math.round((semitones - rounded) * 100);
  const noteIndex = ((rounded % 12) + 12 + 9) % 12;
  const octave = Math.floor((rounded + 9) / 12) + 4;
  return { name: NOTE_NAMES[noteIndex], octave, cents };
}

/**
 * Given a list of raw frequency readings (one per analysis window), return
 * the single representative frequency by:
 *   1. Grouping readings by quantised note name+octave
 *   2. Picking the group that appears most often (modal note)
 *   3. Returning the median frequency within that group
 *
 * Returns null when the readings array is empty.
 */
export function pickDominantFreq(readings: number[]): number | null {
  if (readings.length === 0) return null;
  const noteMap = new Map<string, number[]>();
  for (const f of readings) {
    const info = frequencyToNote(f);
    const key = `${info.name}${info.octave}`;
    if (!noteMap.has(key)) noteMap.set(key, []);
    noteMap.get(key)!.push(f);
  }
  let bestKey = "";
  let bestCount = 0;
  noteMap.forEach((freqs, key) => {
    if (freqs.length > bestCount) {
      bestCount = freqs.length;
      bestKey = key;
    }
  });
  if (!bestKey) return null;
  const freqs = noteMap.get(bestKey)!;
  freqs.sort((a, b) => a - b);
  return freqs[Math.floor(freqs.length / 2)];
}

/**
 * Energy-envelope autocorrelation BPM candidate detector.
 *
 * Algorithm: RMS energy per 512-sample frame → half-wave rectified first
 * differences (onset strength) → autocorrelation over the lag range that
 * corresponds to 50–250 BPM → score best lag plus half-tempo and double-tempo
 * variants with a 1.2× bonus for the 80–160 BPM range.
 *
 * This is the single source of truth for both the server main thread
 * (exported as `detectBpmCandidatesFromSamples`) and the eval Worker
 * (injected via .toString()).
 */
export function detectBpmCandidatesFromSamples(
  samples: Float32Array,
  sampleRate: number,
): number[] {
  const FRAME = 512;
  const MIN_BPM = 50;
  const MAX_BPM = 250;
  const numFrames = Math.floor(samples.length / FRAME);
  if (numFrames < 8) return [];

  const energy = new Float32Array(numFrames);
  for (let f = 0; f < numFrames; f++) {
    let sum = 0;
    for (let i = 0; i < FRAME; i++) {
      const s = samples[f * FRAME + i];
      sum += s * s;
    }
    energy[f] = Math.sqrt(sum / FRAME);
  }

  const onset = new Float32Array(numFrames);
  for (let f = 1; f < numFrames; f++) {
    const d = energy[f] - energy[f - 1];
    onset[f] = d > 0 ? d : 0;
  }

  const fps = sampleRate / FRAME;
  const lagMin = Math.max(1, Math.floor(fps * 60 / MAX_BPM));
  const lagMax = Math.min(numFrames - 1, Math.ceil(fps * 60 / MIN_BPM));
  if (lagMin >= lagMax) return [];

  const acf = new Float32Array(lagMax + 1);
  for (let lag = lagMin; lag <= lagMax; lag++) {
    const count = numFrames - lag;
    if (count <= 0) continue;
    let corr = 0;
    for (let i = 0; i < count; i++) corr += onset[i] * onset[i + lag];
    acf[lag] = corr / count;
  }

  let bestLag = lagMin;
  let bestCorr = 0;
  for (let lag = lagMin; lag <= lagMax; lag++) {
    if (acf[lag] > bestCorr) { bestCorr = acf[lag]; bestLag = lag; }
  }
  if (bestCorr <= 0) return [];

  const candidates: { bpm: number; score: number }[] = [];
  const addCandidate = (lag: number) => {
    if (lag < lagMin || lag > lagMax) return;
    const bpm = Math.round(fps * 60 / lag);
    if (bpm < MIN_BPM || bpm > MAX_BPM) return;
    const corr = acf[lag] ?? 0;
    const tempoBonus = (bpm >= 80 && bpm <= 160) ? 1.2 : 1.0;
    candidates.push({ bpm, score: (corr / bestCorr) * tempoBonus });
  };
  addCandidate(bestLag);
  addCandidate(Math.round(bestLag / 2));
  addCandidate(bestLag * 2);
  candidates.sort((a, b) => b.score - a.score);

  const seen = new Set<number>();
  const result: number[] = [];
  for (const c of candidates) {
    if (!seen.has(c.bpm)) { seen.add(c.bpm); result.push(c.bpm); }
  }
  return result;
}
