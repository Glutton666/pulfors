import { signalGateFloor } from "./signal-noise-gate";

interface SpectralPeak { freq: number; db: number; peakBin: number }
const centsApart = (a: number, b: number) => Math.abs(1200 * Math.log2(a / b));

/** Track the loudest real partial, never an HPS-inferred subharmonic.
 * Both Web Audio and native FFT dB offsets work because comparisons are relative.
 */
export function createDominantTuner() {
  let held: SpectralPeak | null = null;
  let candidate: SpectralPeak | null = null;
  let candidateSince = 0;
  let candidateCount = 0;
  let lastSignalAt = -Infinity;
  let previousSensitivity = 1;

  function reset() {
    held = null;
    candidate = null;
    candidateCount = 0;
    lastSignalAt = -Infinity;
  }

  function update(
    magnitude: Float32Array,
    sampleRate: number,
    fftSize: number,
    rms: number,
    nowMs: number,
    sensitivity = 1,
  ): SpectralPeak | null {
    if (sensitivity !== previousSensitivity) {
      reset();
      previousSensitivity = sensitivity;
    }
    const floor = signalGateFloor(magnitude, sampleRate, fftSize, rms, sensitivity);
    if (floor === null) {
      candidate = null;
      candidateCount = 0;
      // Do not keep a gated/noisy frame looking like a fresh live measurement.
      if (sensitivity === 0 || nowMs - lastSignalAt > 350) held = null;
      return held;
    }
    const binHz = sampleRate / fftSize;
    const from = Math.max(2, Math.ceil(27.5 / binHz));
    const to = Math.min(magnitude.length - 2, Math.floor(4200 / binHz));
    let strongest: SpectralPeak | null = null;
    let nearHeld: SpectralPeak | null = null;
    for (let bin = from; bin <= to; bin++) {
      const db = magnitude[bin];
      if (db < floor || db <= magnitude[bin - 1] || db < magnitude[bin + 1]) continue;
      const left = magnitude[bin - 1];
      const right = magnitude[bin + 1];
      const denominator = left - 2 * db + right;
      const offset = Number.isFinite(denominator) && denominator !== 0
        ? Math.max(-0.5, Math.min(0.5, 0.5 * (left - right) / denominator)) : 0;
      const peak = { freq: (bin + offset) * binHz, db, peakBin: bin };
      if (!strongest || db > strongest.db) strongest = peak;
      if (held && centsApart(held.freq, peak.freq) < 70 && (!nearHeld || db > nearHeld.db)) nearHeld = peak;
    }
    if (!strongest) {
      if (nowMs - lastSignalAt > 350) reset();
      return held;
    }
    lastSignalAt = nowMs;
    // A tiny amplitude crossover between neighboring drum modes should not
    // make the display jump. A sustained >4dB dominant partial can replace it.
    const chosen = nearHeld && nearHeld.db >= strongest.db - 4 ? nearHeld : strongest;
    if (!held) {
      held = chosen;
    } else if (centsApart(held.freq, chosen.freq) < 70) {
      held = { ...chosen, freq: held.freq * 0.65 + chosen.freq * 0.35 };
      candidate = null;
      candidateCount = 0;
    } else {
      if (!candidate || centsApart(candidate.freq, chosen.freq) >= 70) {
        candidate = chosen;
        candidateSince = nowMs;
        candidateCount = 1;
      } else {
        candidate = chosen;
        candidateCount++;
      }
      if (candidateCount >= 2 && nowMs - candidateSince >= 100) {
        held = candidate;
        candidate = null;
        candidateCount = 0;
      }
    }
    return held;
  }
  return { update, reset };
}
