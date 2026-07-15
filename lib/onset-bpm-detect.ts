/**
 * On-device BPM detection for WAV audio via FFT-based spectral onset detection.
 *
 * Pipeline: sliding-window FFT (Hann-windowed) -> spectral flux onset envelope
 * (restricted to a click-relevant frequency band) -> autocorrelation-based BPM
 * candidate ranking (lib/bpm-detect.ts).
 *
 * This intentionally avoids any network call so it works for recorded/imported
 * WAV audio without depending on the server's ffmpeg-based analysis path.
 */

import { realFFT } from "@/lib/signal-analysis";
import { detectBpmCandidatesFromOnset } from "@/lib/bpm-detect";

const FFT_SIZE = 1024;
const HOP_SIZE = 512;
const MIN_FREQ_HZ = 150;
const MAX_FREQ_HZ = 8000;
const MIN_ANALYSIS_SECONDS = 0.5;

export type BpmDetectFailureReason =
  | "insufficient_data"
  | "no_signal"
  | "no_candidates";

export interface OnDeviceBpmResult {
  candidates: number[];
  failureReason?: BpmDetectFailureReason;
}

function buildHannWindow(size: number): Float32Array {
  const w = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  return w;
}

const HANN_WINDOW = buildHannWindow(FFT_SIZE);

/**
 * Computes a spectral-flux onset-strength envelope from raw PCM samples.
 * Returns null if there isn't enough audio for at least a handful of frames.
 */
export function computeSpectralOnsetEnvelope(
  samples: Float32Array,
  sampleRate: number,
): { onset: Float32Array; hopRate: number } | null {
  if (!samples || samples.length < FFT_SIZE * 2) return null;

  const numFrames = Math.floor((samples.length - FFT_SIZE) / HOP_SIZE) + 1;
  if (numFrames < 8) return null;

  const binRes = sampleRate / FFT_SIZE;
  const minBin = Math.max(1, Math.floor(MIN_FREQ_HZ / binRes));
  const maxBin = Math.min(FFT_SIZE / 2 - 1, Math.ceil(MAX_FREQ_HZ / binRes));
  if (minBin >= maxBin) return null;

  const onset = new Float32Array(numFrames);
  const frame = new Float32Array(FFT_SIZE);
  let prevLin: Float32Array | null = null;

  for (let f = 0; f < numFrames; f++) {
    const offset = f * HOP_SIZE;
    for (let i = 0; i < FFT_SIZE; i++) {
      frame[i] = (samples[offset + i] ?? 0) * HANN_WINDOW[i];
    }
    const magDb = realFFT(frame);

    const curLin = new Float32Array(maxBin - minBin + 1);
    for (let b = minBin; b <= maxBin; b++) {
      curLin[b - minBin] = Math.pow(10, magDb[b] / 20);
    }

    if (prevLin) {
      let flux = 0;
      for (let i = 0; i < curLin.length; i++) {
        const diff = curLin[i] - prevLin[i];
        if (diff > 0) flux += diff;
      }
      onset[f] = flux;
    }
    prevLin = curLin;
  }

  const hopRate = sampleRate / HOP_SIZE;
  return { onset, hopRate };
}

/**
 * Full on-device BPM candidate detection for a (possibly trimmed) slice of
 * decoded PCM samples. Distinguishes failure reasons so callers can surface
 * and log meaningful diagnostics instead of a silent null.
 */
export function detectBpmCandidatesOnDevice(
  samples: Float32Array,
  sampleRate: number,
): OnDeviceBpmResult {
  if (!samples || samples.length < sampleRate * MIN_ANALYSIS_SECONDS) {
    return { candidates: [], failureReason: "insufficient_data" };
  }

  const env = computeSpectralOnsetEnvelope(samples, sampleRate);
  if (!env) {
    return { candidates: [], failureReason: "insufficient_data" };
  }

  let maxOnset = 0;
  for (let i = 0; i < env.onset.length; i++) {
    if (env.onset[i] > maxOnset) maxOnset = env.onset[i];
  }
  if (!isFinite(maxOnset) || maxOnset <= 0) {
    return { candidates: [], failureReason: "no_signal" };
  }

  const candidates = detectBpmCandidatesFromOnset(env.onset, env.hopRate);
  if (candidates.length === 0) {
    return { candidates: [], failureReason: "no_candidates" };
  }

  return { candidates };
}
