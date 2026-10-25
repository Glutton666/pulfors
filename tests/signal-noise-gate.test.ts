import { analyzePcmFrame, analyzeSpectrumFrame, buildAnalysisSummary } from "../lib/signal-analysis-session";
import { SIGNAL_GATE_RMS, signalGateFloor } from "../lib/signal-noise-gate";

const RATE = 44100;
const SIZE = 8192;
function pcm(tones: [number, number][], noise = 0) {
  let seed = 1789;
  return Float32Array.from({ length: SIZE }, (_, index) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return tones.reduce((sum, [frequency, amplitude]) =>
      sum + Math.sin(2 * Math.PI * frequency * index / RATE) * amplitude, 0) +
      (seed / 0xffffffff * 2 - 1) * noise;
  });
}

test("quiet tones, silence and low-level hiss do not create analysis notes", () => {
  for (const samples of [pcm([]), pcm([[440, 0.01]]), pcm([], 0.01)]) {
    expect(analyzePcmFrame(samples, RATE, 0, 100).peaks).toEqual([]);
  }
});

test("loud broadband noise is not mistaken for a pitched performance", () => {
  const frame = analyzePcmFrame(pcm([], 0.3), RATE, 0, 100);
  expect(frame.rms).toBeGreaterThan(SIGNAL_GATE_RMS);
  expect(frame.peaks).toEqual([]);
  expect(buildAnalysisSummary([frame], 100).notes).toEqual([]);
});

test("a quiet but distinct instrument tone survives above the gate", () => {
  const frame = analyzePcmFrame(pcm([[440, 0.03]]), RATE, 0, 100);
  expect(frame.peaks.some((peak) => Math.abs(peak.freq - 440) < 3)).toBe(true);
});

test("gate retains genuine chord tones without including very weak residual notes", () => {
  const frame = analyzePcmFrame(pcm([[440, 0.3], [660, 0.2], [1100, 0.001]]), RATE, 0, 100);
  expect(frame.peaks.some((peak) => Math.abs(peak.freq - 440) < 3)).toBe(true);
  expect(frame.peaks.some((peak) => Math.abs(peak.freq - 660) < 3)).toBe(true);
  expect(frame.peaks.some((peak) => Math.abs(peak.freq - 1100) < 5)).toBe(false);
});

test("instrument signal with background hiss remains analyzable without modifying PCM", () => {
  const samples = pcm([[330, 0.25]], 0.015);
  const original = samples.slice();
  const frame = analyzePcmFrame(samples, RATE, 300, 100);
  expect(frame.peaks.some((peak) => Math.abs(peak.freq - 330) < 3)).toBe(true);
  expect(samples).toEqual(original);
  expect(frame.timeMs).toBe(300);
  expect(frame.durationMs).toBe(100);
});

test("web spectrum rejects loud flat noise and stale spectrum during silence", () => {
  const spectrum = new Float32Array(SIZE / 2).fill(-35);
  expect(analyzeSpectrumFrame(spectrum, RATE, SIZE, 0, 100, 0.25).peaks).toEqual([]);
  spectrum[82] = -10;
  expect(analyzeSpectrumFrame(spectrum, RATE, SIZE, 0, 100, 0).peaks).toEqual([]);
});

test("relative spectrum gate works across native and Web Audio magnitude scales", () => {
  const spectrum = new Float32Array(SIZE / 2).fill(-90);
  spectrum[81] = -35;
  spectrum[82] = -15;
  spectrum[83] = -35;
  const web = analyzeSpectrumFrame(spectrum, RATE, SIZE, 0, 100, 0.2);
  const native = analyzeSpectrumFrame(spectrum.map((db) => db + 70), RATE, SIZE, 0, 100, 0.2);
  expect(web.peaks).toHaveLength(1);
  expect(native.peaks).toHaveLength(1);
  expect(web.peaks[0].freq).toBeCloseTo(native.peaks[0].freq, 5);
});

test("gated silence preserves timeline gaps rather than inventing a sustained note", () => {
  const first = analyzePcmFrame(pcm([[440, 0.3]]), RATE, 0, 500);
  const silence = analyzePcmFrame(pcm([]), RATE, 500, 500);
  const summary = buildAnalysisSummary([first, silence], 1000);
  expect(summary.buckets[0].dominantNote).toBe("A4");
  expect(summary.buckets[1].notes).toEqual([]);
  expect(summary.buckets[1].dominantNote).toBeNull();
});

test("invalid signal values are rejected rather than producing phantom notes", () => {
  const spectrum = new Float32Array(SIZE / 2).fill(-90);
  spectrum[82] = NaN;
  expect(signalGateFloor(spectrum, RATE, SIZE, 0.2)).toBeNull();
  expect(signalGateFloor(spectrum, RATE, SIZE, NaN)).toBeNull();
  expect(analyzePcmFrame(new Float32Array([NaN, Infinity]), RATE, 0, 100).peaks).toEqual([]);
});
