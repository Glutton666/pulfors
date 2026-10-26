import { calibrateOffset } from "./practice";

/** Match each tap to its explicit beat, not its ordinal position. Missing or
 * duplicate beats cannot masquerade as a one-beat device latency. */
export function calibrationResult(taps: number[], reference: number[], interval: number) {
  if (reference.length !== 16 || taps.length !== 16 || !(interval > 0) ||
      [...reference, ...taps].some((time) => !Number.isFinite(time))) throw new Error("Complete all 16 beats");
  const pairs = new Map<number, number>();
  taps.forEach((tap) => {
    let nearest = 0;
    reference.forEach((time, i) => { if (Math.abs(time - tap) < Math.abs(reference[nearest] - tap)) nearest = i; });
    if (pairs.has(nearest) || Math.abs(tap - reference[nearest]) > interval * 0.4) throw new Error("Missed or duplicate beat");
    pairs.set(nearest, tap);
  });
  const ordered = reference.map((_, i) => pairs.get(i)!);
  const offset = calibrateOffset(ordered, reference);
  const errors = ordered.map((tap, i) => tap - reference[i] - offset);
  const rms = Math.sqrt(errors.reduce((sum, error) => sum + error * error, 0) / errors.length);
  if (rms > Math.min(60, interval * 0.12) || reference.some((time, i) => i > 0 && Math.abs(time - reference[i - 1] - interval) > Math.min(40, interval * 0.1))) {
    throw new Error("Unstable timing; retry calibration");
  }
  return offset;
}
