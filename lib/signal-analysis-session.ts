import {
  fftMultiPeakDetect,
  frequencyToNote,
  realFFT,
  type MultiPeak,
} from "./signal-analysis";

export const ANALYSIS_DURATION_MS = 10_000;
export const ANALYSIS_BUCKET_MS = 500;

export interface AnalysisFrame {
  timeMs: number;
  durationMs: number;
  rms: number;
  peaks: MultiPeak[];
}

export interface AnalysisNoteSummary {
  note: string;
  frequency: number;
  share: number;
  energy: number;
}

export interface AnalysisBucket {
  startMs: number;
  endMs: number;
  notes: string[];
  dominantNote: string | null;
  rms: number;
  noteShares: Array<{ note: string; share: number }>;
}

export interface AnalysisSummary {
  durationMs: number;
  frames: AnalysisFrame[];
  notes: AnalysisNoteSummary[];
  buckets: AnalysisBucket[];
}

export function analyzePcmFrame(
  samples: Float32Array,
  sampleRate: number,
  timeMs: number,
  durationMs: number,
): AnalysisFrame {
  let power = 0;
  for (let i = 0; i < samples.length; i++) power += samples[i] * samples[i];
  const rms = Math.sqrt(power / Math.max(1, samples.length));
  if (rms < 0.01) return { timeMs, durationMs, rms, peaks: [] };

  const windowed = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    windowed[i] = samples[i] * 0.5 * (1 - Math.cos(2 * Math.PI * i / Math.max(1, samples.length - 1)));
  }
  const magnitude = realFFT(windowed);
  const peaks = fftMultiPeakDetect(magnitude, sampleRate, samples.length);
  return { timeMs, durationMs, rms, peaks };
}

export function analyzeSpectrumFrame(
  magnitude: Float32Array,
  sampleRate: number,
  fftSize: number,
  timeMs: number,
  durationMs: number,
  rms: number,
): AnalysisFrame {
  const peaks = rms < 0.018
    ? []
    : fftMultiPeakDetect(magnitude, sampleRate, fftSize);
  return { timeMs, durationMs, rms, peaks };
}

export function buildAnalysisSummary(
  frames: AnalysisFrame[],
  durationMs: number,
  bucketMs: number = ANALYSIS_BUCKET_MS,
): AnalysisSummary {
  const noteStats = new Map<string, { frequencyTotal: number; count: number; energy: number }>();
  for (const frame of frames) {
    for (const peak of frame.peaks) {
      const info = frequencyToNote(peak.freq);
      const note = `${info.name}${info.octave}`;
      const existing = noteStats.get(note) ?? { frequencyTotal: 0, count: 0, energy: 0 };
      existing.frequencyTotal += peak.freq;
      existing.count += 1;
      existing.energy += Math.max(0.001, peak.db + 100);
      noteStats.set(note, existing);
    }
  }

  const totalEnergy = Array.from(noteStats.values()).reduce((sum, item) => sum + item.energy, 0);
  const notes = Array.from(noteStats.entries())
    .map(([note, stats]) => ({
      note,
      frequency: Math.round((stats.frequencyTotal / stats.count) * 10) / 10,
      share: totalEnergy > 0 ? stats.energy / totalEnergy : 0,
      energy: stats.energy,
    }))
    .sort((a, b) => b.share - a.share);

  const bucketCount = Math.max(1, Math.ceil(Math.max(0, durationMs) / bucketMs));
  const buckets: AnalysisBucket[] = Array.from({ length: bucketCount }, (_, index) => {
    const startMs = index * bucketMs;
    const endMs = Math.min(Math.max(durationMs, startMs + bucketMs), startMs + bucketMs);
    const bucketFrames = frames.filter((frame) => frame.timeMs >= startMs && frame.timeMs < endMs);
    const noteCounts = new Map<string, number>();
    const noteEnergy = new Map<string, number>();
    for (const frame of bucketFrames) {
      for (const peak of frame.peaks) {
        const info = frequencyToNote(peak.freq);
        const note = `${info.name}${info.octave}`;
        noteCounts.set(note, (noteCounts.get(note) ?? 0) + 1);
        noteEnergy.set(note, (noteEnergy.get(note) ?? 0) + Math.max(0.001, peak.db + 100));
      }
    }
    const orderedNotes = Array.from(noteCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([note]) => note);
    const bucketTotalEnergy = Array.from(noteEnergy.values()).reduce((sum, energy) => sum + energy, 0);
    const noteShares = Array.from(noteEnergy.entries())
      .map(([note, energy]) => ({
        note,
        share: bucketTotalEnergy > 0 ? energy / bucketTotalEnergy : 0,
      }))
      .sort((a, b) => b.share - a.share);
    return {
      startMs,
      endMs,
      notes: orderedNotes,
      dominantNote: orderedNotes[0] ?? null,
      noteShares,
      rms: bucketFrames.length > 0
        ? bucketFrames.reduce((sum, frame) => sum + frame.rms, 0) / bucketFrames.length
        : 0,
    };
  });

  return { durationMs, frames, notes, buckets };
}

export function encodePcm16WavBase64(samples: Float32Array, sampleRate: number): string {
  const dataBytes = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const writeText = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeText(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, dataBytes, true);
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, Math.round(sample * 32767), true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(bytes.length, i + chunkSize)));
  }
  return typeof btoa === "function"
    ? btoa(binary)
    : Buffer.from(bytes).toString("base64");
}