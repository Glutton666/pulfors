/** Shared microphone gate. Spectrum thresholds are relative because Web Audio
 * and the native FFT use different magnitude scales. Raw replay audio is kept. */
export const SIGNAL_GATE_RMS = 0.018;

export function signalGateFloor(
  magnitude: Float32Array,
  sampleRate: number,
  fftSize: number,
  rms: number,
): number | null {
  if (!Number.isFinite(rms) || rms < SIGNAL_GATE_RMS ||
      !Number.isFinite(sampleRate) || sampleRate <= 0 ||
      !Number.isFinite(fftSize) || fftSize <= 0) return null;
  const binHz = sampleRate / fftSize;
  const from = Math.max(2, Math.ceil(27.5 / binHz));
  const to = Math.min(magnitude.length - 2, Math.floor(4200 / binHz));
  if (from >= to) return null;
  const levels: number[] = [];
  let strongest = -Infinity;
  for (let bin = from; bin <= to; bin++) {
    const db = magnitude[bin];
    if (Number.isNaN(db) || db === Infinity) return null;
    strongest = Math.max(strongest, db);
    levels.push(db);
  }
  if (!Number.isFinite(strongest)) return null;
  levels.sort((a, b) => a - b);
  const background = levels[Math.floor(levels.length / 2)];
  // Broadband hiss must not become a note just because it is loud.
  if (strongest - background < 16) return null;
  // Reject weak residual peaks while retaining independently played chord tones.
  return Math.max(background + 16, strongest - 24);
}
