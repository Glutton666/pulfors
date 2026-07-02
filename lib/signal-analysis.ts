import { logger } from "@/lib/logger";

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function base64ToBytes(base64: string): Uint8Array {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, "");
  const len = clean.length;
  let outLen = Math.floor(len * 3 / 4);
  if (clean[len - 1] === "=") outLen--;
  if (clean[len - 2] === "=") outLen--;
  const bytes = new Uint8Array(outLen);
  let idx = 0;
  for (let i = 0; i < len; i += 4) {
    const a = lookup[clean.charCodeAt(i)] ?? 0;
    const b = lookup[clean.charCodeAt(i + 1)] ?? 0;
    const c = lookup[clean.charCodeAt(i + 2)] ?? 0;
    const d = lookup[clean.charCodeAt(i + 3)] ?? 0;
    if (idx < outLen) bytes[idx++] = (a << 2) | (b >> 4);
    if (idx < outLen) bytes[idx++] = ((b & 0xf) << 4) | (c >> 2);
    if (idx < outLen) bytes[idx++] = ((c & 0x03) << 6) | d;
  }
  return bytes;
}

export function decodeWavBase64(
  base64: string,
  sampleRate: number,
): { samples: Float32Array; rate: number } | null {
  try {
    const bytes = base64ToBytes(base64);
    if (bytes.length < 44) {
      logger.warn("[MicTuner] decodeWav: file too small:", bytes.length);
      return null;
    }
    const view = new DataView(bytes.buffer);
    const riffTag = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    if (riffTag !== "RIFF") {
      logger.warn("[MicTuner] decodeWav: not a WAV file, header:", riffTag, "size:", bytes.length);
      return null;
    }
    const audioFormat = view.getUint16(20, true);
    const numChannels = view.getUint16(22, true);
    const wavSampleRate = view.getUint32(24, true);
    const bitsPerSample = view.getUint16(34, true);
    logger.log("[MicTuner] WAV: fmt=", audioFormat, "ch=", numChannels, "rate=", wavSampleRate, "bits=", bitsPerSample, "size=", bytes.length);
    let dataOffset = 12;
    while (dataOffset < bytes.length - 8) {
      const tag = String.fromCharCode(bytes[dataOffset], bytes[dataOffset + 1], bytes[dataOffset + 2], bytes[dataOffset + 3]);
      const chunkSize = view.getUint32(dataOffset + 4, true);
      if (tag === "data") {
        dataOffset += 8;
        const bytesPerSample = bitsPerSample / 8;
        const numSamples = Math.floor(chunkSize / (bytesPerSample * numChannels));
        const samples = new Float32Array(numSamples);
        for (let i = 0; i < numSamples; i++) {
          const offset = dataOffset + i * bytesPerSample * numChannels;
          if (offset + bytesPerSample > bytes.length) break;
          if (audioFormat === 3 && bitsPerSample === 32) {
            samples[i] = view.getFloat32(offset, true);
          } else if (bitsPerSample === 16) {
            samples[i] = view.getInt16(offset, true) / 32768;
          } else if (bitsPerSample === 24) {
            const lo = bytes[offset] | (bytes[offset + 1] << 8);
            const hi = bytes[offset + 2];
            const val = (hi & 0x80) ? (lo | (hi << 16) | 0xff000000) : (lo | (hi << 16));
            samples[i] = val / 8388608;
          } else if (bitsPerSample === 8) {
            samples[i] = (bytes[offset] - 128) / 128;
          }
        }
        return { samples, rate: wavSampleRate || sampleRate };
      }
      dataOffset += 8 + (chunkSize % 2 === 1 ? chunkSize + 1 : chunkSize);
    }
    logger.warn("[MicTuner] decodeWav: no data chunk found");
    return null;
  } catch (e) {
    logger.warn("[MicTuner] decodeWav exception:", e);
    return null;
  }
}

export function realFFT(samples: Float32Array): Float32Array {
  const N = samples.length;
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  for (let i = 0; i < N; i++) re[i] = samples[i];

  let j = 0;
  for (let i = 0; i < N - 1; i++) {
    if (i < j) {
      let tmp = re[i]; re[i] = re[j]; re[j] = tmp;
      tmp = im[i]; im[i] = im[j]; im[j] = tmp;
    }
    let k = N >> 1;
    while (k <= j) { j -= k; k >>= 1; }
    j += k;
  }

  for (let len = 2; len <= N; len <<= 1) {
    const halfLen = len >> 1;
    const angle = -2 * Math.PI / len;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);
    for (let i = 0; i < N; i += len) {
      let curRe = 1, curIm = 0;
      for (let jj = 0; jj < halfLen; jj++) {
        const tRe = curRe * re[i + jj + halfLen] - curIm * im[i + jj + halfLen];
        const tIm = curRe * im[i + jj + halfLen] + curIm * re[i + jj + halfLen];
        re[i + jj + halfLen] = re[i + jj] - tRe;
        im[i + jj + halfLen] = im[i + jj] - tIm;
        re[i + jj] += tRe;
        im[i + jj] += tIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }

  const mag = new Float32Array(N >> 1);
  for (let i = 0; i < mag.length; i++) {
    const power = re[i] * re[i] + im[i] * im[i];
    mag[i] = power > 0 ? 10 * Math.log10(power / N) : -100;
  }
  return mag;
}

export function frequencyToNote(freq: number): { name: string; octave: number; cents: number } {
  const semitones = 12 * Math.log2(freq / 440);
  const rounded = Math.round(semitones);
  const cents = Math.round((semitones - rounded) * 100);
  const noteIndex = ((rounded % 12) + 12 + 9) % 12;
  const octave = Math.floor((rounded + 9) / 12) + 4;
  return { name: NOTE_NAMES[noteIndex], octave, cents };
}

export function noteToFreq(name: string, octave: number): number {
  const idx = NOTE_NAMES.indexOf(name);
  if (idx < 0) return 440;
  const semitones = (octave - 4) * 12 + (idx - 9);
  return Math.round(440 * Math.pow(2, semitones / 12) * 100) / 100;
}

/**
 * HPS(Harmonic Product Spectrum) 기반 기음 탐지.
 * 단순 FFT 최대값 탐색은 배음이 기음보다 클 때 옥타브 오류를 일으킴.
 * HPS는 기음 주파수에서 여러 배음의 스펙트럼을 곱해 기음을 강화함.
 */
export function fftPeakDetect(
  freqData: Float32Array,
  sampleRate: number,
  fftSize: number,
  minFreq: number = 27.5,
  maxFreq: number = 4200,
  noiseFloor: number = -80,
): { freq: number; peakBin: number } | null {
  const binRes = sampleRate / fftSize;
  const minBin = Math.max(2, Math.ceil(minFreq / binRes));
  const maxBin = Math.min(
    Math.floor(freqData.length / 5),
    Math.floor(maxFreq / binRes),
  );
  if (minBin >= maxBin) return null;

  const linMag = new Float32Array(freqData.length);
  let hasSignal = false;
  for (let i = 0; i < freqData.length; i++) {
    if (freqData[i] > noiseFloor) {
      linMag[i] = Math.pow(10, freqData[i] / 20);
      hasSignal = true;
    }
  }
  if (!hasSignal) return null;

  let peakHps = -Infinity;
  let peakIdx = -1;
  for (let i = minBin; i <= maxBin; i++) {
    if (linMag[i] === 0) continue;
    let hps = linMag[i];
    for (let h = 2; h <= 5; h++) {
      const hBin = Math.min(Math.round(i * h), linMag.length - 1);
      hps *= linMag[hBin] > 0 ? linMag[hBin] : 1e-10;
    }
    if (hps > peakHps) { peakHps = hps; peakIdx = i; }
  }
  if (peakIdx < 1) return null;

  const al = linMag[peakIdx - 1] || 0;
  const bl = linMag[peakIdx];
  const cl = peakIdx < linMag.length - 1 ? linMag[peakIdx + 1] : 0;
  const denom = al - 2 * bl + cl;
  const refined = denom !== 0 ? peakIdx + 0.5 * (al - cl) / denom : peakIdx;
  const freq = refined * binRes;
  if (freq < minFreq || freq > maxFreq) return null;
  return { freq, peakBin: peakIdx };
}

export function analyzeWavLocally(
  base64: string,
  sampleRate: number,
): { frequency: number | null; note: string | null } {
  const decoded = decodeWavBase64(base64, sampleRate);
  const WINDOW_SIZE = 8192;
  if (!decoded || decoded.samples.length <= WINDOW_SIZE) return { frequency: null, note: null };
  const readings: number[] = [];
  const step = Math.floor(WINDOW_SIZE / 2);
  const startOffset = Math.min(Math.floor(decoded.rate * 0.05), decoded.samples.length - WINDOW_SIZE);
  for (let offset = Math.max(0, startOffset); offset + WINDOW_SIZE <= decoded.samples.length; offset += step) {
    const win = decoded.samples.slice(offset, offset + WINDOW_SIZE);
    let rms = 0;
    for (let i = 0; i < win.length; i++) rms += win[i] * win[i];
    rms = Math.sqrt(rms / win.length);
    if (rms < 0.015) continue;

    for (let i = 0; i < WINDOW_SIZE; i++) {
      win[i] *= 0.5 * (1 - Math.cos(2 * Math.PI * i / (WINDOW_SIZE - 1)));
    }
    const mag = realFFT(win);
    const result = fftPeakDetect(mag, decoded.rate, WINDOW_SIZE, 27.5, 4200, -120);
    if (result && result.freq > 20 && result.freq <= 4200) {
      readings.push(result.freq);
    }
  }
  if (readings.length === 0) return { frequency: null, note: null };
  const noteMap = new Map<string, number[]>();
  for (const f of readings) {
    const info = frequencyToNote(f);
    const key = `${info.name}${info.octave}`;
    if (!noteMap.has(key)) noteMap.set(key, []);
    noteMap.get(key)!.push(f);
  }
  let bestKey = "";
  let bestCount = 0;
  for (const [key, freqs] of noteMap) {
    if (freqs.length > bestCount) { bestCount = freqs.length; bestKey = key; }
  }
  if (!bestKey) return { frequency: null, note: null };
  const freqs = noteMap.get(bestKey)!;
  freqs.sort((a, b) => a - b);
  const dominant = freqs[Math.floor(freqs.length / 2)];
  const rounded = Math.round(dominant * 10) / 10;
  const noteInfo = frequencyToNote(dominant);
  return { frequency: rounded, note: `${noteInfo.name}${noteInfo.octave}` };
}
