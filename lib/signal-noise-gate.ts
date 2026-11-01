/** Shared microphone gate. Spectrum thresholds are relative because Web Audio
 * and the native FFT use different magnitude scales. Raw replay audio is kept. */
export const SIGNAL_GATE_RMS = 0.02;
export const SIGNAL_SENSITIVITY_KEY = "metronome_signal_sensitivity_v1";

export function parseSignalSensitivity(input: string): number | null {
  const text = input.trim();
  if (!/^\d+(?:\.\d)?$/.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 && value <= 5 ? value : null;
}

export function signalGateRms(sensitivity = 1): number {
  return !Number.isFinite(sensitivity) || sensitivity <= 0 ? Infinity : SIGNAL_GATE_RMS / Math.min(5, sensitivity);
}

export function signalGateFloor(
  magnitude: Float32Array,
  sampleRate: number,
  fftSize: number,
  rms: number,
  sensitivity = 1,
): number | null {
  if (!Number.isFinite(rms) || rms < signalGateRms(sensitivity) ||
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
  const contrast = 18;
  if (strongest - background < contrast) return null;
  // Reject weak residual peaks while retaining independently played chord tones.
  return Math.max(background + contrast, strongest - 24);
}
