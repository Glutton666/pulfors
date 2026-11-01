import { createDominantTuner } from "@/lib/signal-dominant-tuner";
import { realFFT } from "@/lib/signal-analysis";
import { analyzePcmFrame } from "@/lib/signal-analysis-session";
import { parseSignalSensitivity, signalGateRms } from "@/lib/signal-noise-gate";

const rate = 44100;
const size = 8192;
function spectrum(peaks: [number, number][]) {
  const bins = new Float32Array(size / 2).fill(-95);
  for (const [freq, db] of peaks) {
    const bin = Math.round(freq * size / rate);
    bins[bin - 1] = db - 15; bins[bin] = db; bins[bin + 1] = db - 15;
  }
  return bins;
}
test("drum tuning follows the loudest partial, not a quieter fundamental", () => {
  const tracker = createDominantTuner();
  const result = tracker.update(spectrum([[110, -35], [220, -10], [330, -28]]), rate, size, 0.2, 0);
  expect(result?.freq).toBeCloseTo(220, -1);
});
test("small partial crossovers do not flicker, sustained louder peaks do switch", () => {
  const tracker = createDominantTuner();
  tracker.update(spectrum([[220, -10], [330, -12]]), rate, size, 0.2, 0);
  expect(tracker.update(spectrum([[220, -12], [330, -10]]), rate, size, 0.2, 50)?.freq).toBeCloseTo(220, -1);
  tracker.update(spectrum([[220, -20], [330, -8]]), rate, size, 0.2, 100);
  expect(tracker.update(spectrum([[220, -20], [330, -8]]), rate, size, 0.2, 250)?.freq).toBeCloseTo(330, -1);
});
test("a transient or hiss cannot permanently replace a stable target; silence expires it", () => {
  const tracker = createDominantTuner();
  const tone = spectrum([[440, -10]]);
  tracker.update(tone, rate, size, 0.2, 0);
  tracker.update(spectrum([[880, -5]]), rate, size, 0.2, 50);
  expect(tracker.update(tone, rate, size, 0.2, 100)?.freq).toBeCloseTo(440, -1);
  expect(tracker.update(new Float32Array(size / 2).fill(-35), rate, size, 0.3, 500)).toBeNull();
});
test("sensitivity changes invalidate held data and work in analysis as well as live detection", () => {
  const tracker = createDominantTuner();
  const tone = spectrum([[440, -10]]);
  expect(tracker.update(tone, rate, size, 0.03, 0, 1)).not.toBeNull();
  expect(tracker.update(tone, rate, size, 0.03, 10, 0.5)).toBeNull();
  expect(tracker.update(tone, rate, size, 0.3, 20, 0)).toBeNull();
  const samples = Float32Array.from({ length: size }, (_, i) => 0.02 * Math.sin(2 * Math.PI * 440 * i / rate));
  expect(analyzePcmFrame(samples, rate, 0, 100, 1).peaks).toEqual([]);
  expect(analyzePcmFrame(samples, rate, 0, 100, 2).peaks.length).toBeGreaterThan(0);
  expect(analyzePcmFrame(samples, rate, 0, 100, 0).peaks).toEqual([]);
});
test("native PCM dominant partial and web offset dB spectra give the same answer", () => {
  const samples = Float32Array.from({ length: size }, (_, i) => {
    const t = i / rate;
    return (0.05 * Math.sin(2 * Math.PI * 120 * t) + 0.3 * Math.sin(2 * Math.PI * 240 * t))
      * 0.5 * (1 - Math.cos(2 * Math.PI * i / (size - 1)));
  });
  const native = realFFT(samples);
  const a = createDominantTuner().update(native, rate, size, 0.2, 0)!;
  const b = createDominantTuner().update(native.map(db => db - 70), rate, size, 0.2, 0)!;
  expect(a.freq).toBeCloseTo(240, 0);
  expect(b.freq).toBeCloseTo(a.freq, 5);
});
test("sensitivity accepts tenths only, defaults to 1.0 behavior, and zero disables detection", () => {
  for (const input of ["0.0", "0.1", "1.0", "5.0"]) expect(parseSignalSensitivity(input)).toBe(Number(input));
  for (const input of ["", "NaN", "-1", "5.1", "0.01", "1e1"]) expect(parseSignalSensitivity(input)).toBeNull();
  expect(signalGateRms()).toBe(0.02);
  expect(signalGateRms(0.5)).toBe(0.04);
  expect(signalGateRms(0)).toBe(Infinity);
});
