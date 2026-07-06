import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import { execFile } from "node:child_process";
import { writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";

// ---------------------------------------------------------------------------
// Audio-analysis worker code (plain JS, runs off the main event loop)
// ---------------------------------------------------------------------------
// autoCorrelate is defined once below (single source of truth, main-thread
// TypeScript implementation) and its compiled function body is injected
// verbatim into the worker script via .toString(). This keeps the worker
// thread's eval'd JS context (which cannot `require()` this module directly
// once esbuild-bundled for production) in lockstep with the main-thread
// implementation used by the ffmpeg path, without hand-copying the algorithm.
const WAV_WORKER_CODE = `
const { workerData, parentPort } = require('worker_threads');

const MAX_ANALYSIS_SECONDS = 3;
const FFMPEG_SAMPLE_RATE = 48000;
const MAX_AUDIO_SAMPLES = MAX_ANALYSIS_SECONDS * FFMPEG_SAMPLE_RATE;
const MAX_ANALYSIS_WINDOWS = 5;

${autoCorrelate.toString()}

function frequencyToNote(freq) {
  const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const semitones = 12 * Math.log2(freq / 440);
  const rounded = Math.round(semitones);
  const noteIndex = ((rounded % 12) + 12 + 9) % 12;
  const octave = Math.floor((rounded + 9) / 12) + 4;
  return { name: NOTE_NAMES[noteIndex], octave };
}

function pickDominantFreq(readings) {
  if (readings.length === 0) return null;
  const noteMap = new Map();
  for (const f of readings) {
    const info = frequencyToNote(f);
    const key = info.name + info.octave;
    if (!noteMap.has(key)) noteMap.set(key, []);
    noteMap.get(key).push(f);
  }
  let bestKey = '';
  let bestCount = 0;
  for (const [key, freqs] of noteMap) {
    if (freqs.length > bestCount) { bestCount = freqs.length; bestKey = key; }
  }
  if (!bestKey) return null;
  const freqs = noteMap.get(bestKey);
  freqs.sort((a, b) => a - b);
  return freqs[Math.floor(freqs.length / 2)];
}

function decodeWavBuffer(buf) {
  try {
    if (buf.length < 44) return null;
    if (buf.toString('ascii', 0, 4) !== 'RIFF') return null;
    const audioFormat  = buf.readUInt16LE(20);
    const numChannels  = buf.readUInt16LE(22);
    const sampleRate   = buf.readUInt32LE(24);
    const bitsPerSample = buf.readUInt16LE(34);
    let offset = 12;
    while (offset < buf.length - 8) {
      const tag       = buf.toString('ascii', offset, offset + 4);
      const chunkSize = buf.readUInt32LE(offset + 4);
      if (tag === 'data') {
        offset += 8;
        const bytesPerSample   = bitsPerSample / 8;
        const availableBytes   = buf.length - offset;
        const samplesFromHdr   = Math.floor(chunkSize / (bytesPerSample * numChannels));
        const samplesFromBuf   = Math.floor(availableBytes / (bytesPerSample * numChannels));
        const numSamples       = Math.min(samplesFromHdr, samplesFromBuf, MAX_AUDIO_SAMPLES);
        if (numSamples <= 0) return null;
        const samples = new Float32Array(numSamples);
        for (let i = 0; i < numSamples; i++) {
          const off = offset + i * bytesPerSample * numChannels;
          if (off + bytesPerSample > buf.length) break;
          if (audioFormat === 3 && bitsPerSample === 32) {
            samples[i] = buf.readFloatLE(off);
          } else if (bitsPerSample === 16) {
            samples[i] = buf.readInt16LE(off) / 32768;
          } else if (bitsPerSample === 24) {
            const lo  = buf[off] | (buf[off + 1] << 8);
            const hi  = buf[off + 2];
            const val = (hi & 0x80) ? (lo | (hi << 16) | 0xff000000) : (lo | (hi << 16));
            samples[i] = val / 8388608;
          } else if (bitsPerSample === 8) {
            samples[i] = (buf[off] - 128) / 128;
          }
        }
        return { samples, rate: sampleRate };
      }
      offset += 8 + (chunkSize % 2 === 1 ? chunkSize + 1 : chunkSize);
    }
    return null;
  } catch { return null; }
}

function detectBpmCandidates(samples, sampleRate) {
  const FRAME = 512;
  const MIN_BPM = 50;
  const MAX_BPM = 250;
  const numFrames = Math.floor(samples.length / FRAME);
  if (numFrames < 8) return [];
  const energy = new Float32Array(numFrames);
  for (let f = 0; f < numFrames; f++) {
    let sum = 0;
    for (let i = 0; i < FRAME; i++) { const s = samples[f * FRAME + i]; sum += s * s; }
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
  let bestLag = lagMin, bestCorr = 0;
  for (let lag = lagMin; lag <= lagMax; lag++) {
    if (acf[lag] > bestCorr) { bestCorr = acf[lag]; bestLag = lag; }
  }
  if (bestCorr <= 0) return [];
  const candidates = [];
  const addCandidate = (lag) => {
    if (lag < lagMin || lag > lagMax) return;
    const bpm = Math.round(fps * 60 / lag);
    if (bpm < MIN_BPM || bpm > MAX_BPM) return;
    const corr = acf[lag] || 0;
    const tempoBonus = (bpm >= 80 && bpm <= 160) ? 1.2 : 1.0;
    candidates.push({ bpm, score: (corr / bestCorr) * tempoBonus });
  };
  addCandidate(bestLag);
  addCandidate(Math.round(bestLag / 2));
  addCandidate(bestLag * 2);
  candidates.sort((a, b) => b.score - a.score);
  const seen = new Set();
  const result = [];
  for (const c of candidates) {
    if (!seen.has(c.bpm)) { seen.add(c.bpm); result.push(c.bpm); }
  }
  return result;
}

function analyzeWavDirect(audioBuffer) {
  const decoded = decodeWavBuffer(audioBuffer);
  if (!decoded) return { frequency: null, note: null, bpm: null, bpmCandidates: [] };
  const { rate } = decoded;
  const samples = decoded.samples.length > MAX_AUDIO_SAMPLES
    ? decoded.samples.slice(0, MAX_AUDIO_SAMPLES)
    : decoded.samples;
  const WINDOW_SIZE = 8192;
  const MIC_GATE = 0.02;
  if (samples.length < WINDOW_SIZE) return { frequency: null, note: null, bpm: null, bpmCandidates: [] };
  const readings = [];
  const step = Math.floor(WINDOW_SIZE / 2);
  let windowCount = 0;
  for (let offset = 0; offset + WINDOW_SIZE <= samples.length; offset += step) {
    if (windowCount >= MAX_ANALYSIS_WINDOWS) break;
    const win = samples.slice(offset, offset + WINDOW_SIZE);
    const freq = autoCorrelate(win, rate, MIC_GATE);
    if (freq > 20 && freq <= 20000) readings.push(freq);
    windowCount++;
  }
  const dominant = pickDominantFreq(readings);
  const bpmCandidates = detectBpmCandidates(samples, rate);
  const bpm = bpmCandidates.length > 0 ? bpmCandidates[0] : null;
  if (!dominant) return { frequency: null, note: null, bpm, bpmCandidates };
  const rounded = Math.round(dominant * 10) / 10;
  const noteInfo = frequencyToNote(dominant);
  return { frequency: rounded, note: noteInfo.name + noteInfo.octave, bpm, bpmCandidates };
}

const buf = Buffer.from(workerData.audioData);
const result = analyzeWavDirect(buf);
parentPort.postMessage(result);
`;

function analyzeWavInWorker(
  audioBuffer: Buffer,
): Promise<{ frequency: number | null; note: string | null; bpm: number | null }> {
  return new Promise((resolve, reject) => {
    const ab = audioBuffer.buffer.slice(
      audioBuffer.byteOffset,
      audioBuffer.byteOffset + audioBuffer.byteLength,
    ) as ArrayBuffer;
    const worker = new Worker(WAV_WORKER_CODE, {
      eval: true,
      workerData: { audioData: ab },
      transferList: [ab],
    });
    const timeout = setTimeout(() => {
      worker.terminate();
      reject(new Error("WAV analysis timed out"));
    }, 8000);
    worker.once("message", (result) => {
      clearTimeout(timeout);
      resolve(result);
    });
    worker.once("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

// ---------------------------------------------------------------------------
// Helpers used only by the ffmpeg path (main thread)
// ---------------------------------------------------------------------------
function frequencyToNote(freq: number): { name: string; octave: number; cents: number } {
  const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const semitones = 12 * Math.log2(freq / 440);
  const rounded = Math.round(semitones);
  const cents = Math.round((semitones - rounded) * 100);
  const noteIndex = ((rounded % 12) + 12 + 9) % 12;
  const octave = Math.floor((rounded + 9) / 12) + 4;
  return { name: NOTE_NAMES[noteIndex], octave, cents };
}

function autoCorrelate(buffer: Float32Array, sampleRate: number, rmsThreshold: number = 0.03): number {
  const SIZE = buffer.length;
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < rmsThreshold) return -1;
  let r1 = 0;
  let r2 = SIZE - 1;
  const thresh = 0.2;
  for (let i = 0; i < SIZE / 2; i++) {
    if (Math.abs(buffer[i]) < thresh) { r1 = i; break; }
  }
  for (let i = 1; i < SIZE / 2; i++) {
    if (Math.abs(buffer[SIZE - i]) < thresh) { r2 = SIZE - i; break; }
  }
  const buf = buffer.slice(r1, r2);
  if (buf.length < 2) return -1;
  const c = new Float32Array(buf.length);
  for (let i = 0; i < buf.length; i++) {
    for (let j = 0; j < buf.length - i; j++) c[i] += buf[j] * buf[j + i];
  }
  let d = 0;
  while (d < buf.length - 1 && c[d] > c[d + 1]) d++;
  let maxval = -1;
  let maxpos = -1;
  for (let i = d; i < buf.length; i++) {
    if (c[i] > maxval) { maxval = c[i]; maxpos = i; }
  }
  if (maxpos < 0 || maxval < 0) return -1;
  const clarity = c[0] > 0 ? maxval / c[0] : 0;
  if (clarity < 0.5) return -1;
  let T0 = maxpos;
  const x1 = c[T0 - 1] ?? 0;
  const x2 = c[T0];
  const x3 = c[T0 + 1] ?? 0;
  const a = (x1 + x3 - 2 * x2) / 2;
  const b = (x3 - x1) / 2;
  if (a) T0 = T0 - b / (2 * a);
  return sampleRate / T0;
}

function pickDominantFreq(readings: number[]): number | null {
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
  for (const [key, freqs] of noteMap) {
    if (freqs.length > bestCount) {
      bestCount = freqs.length;
      bestKey = key;
    }
  }
  if (!bestKey) return null;
  const freqs = noteMap.get(bestKey)!;
  freqs.sort((a, b) => a - b);
  return freqs[Math.floor(freqs.length / 2)];
}

export function detectBpmCandidatesFromSamples(samples: Float32Array, sampleRate: number): number[] {
  const FRAME = 512;
  const MIN_BPM = 50;
  const MAX_BPM = 250;
  const numFrames = Math.floor(samples.length / FRAME);
  if (numFrames < 8) return [];
  const energy = new Float32Array(numFrames);
  for (let f = 0; f < numFrames; f++) {
    let sum = 0;
    for (let i = 0; i < FRAME; i++) { const s = samples[f * FRAME + i]; sum += s * s; }
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
  let bestLag = lagMin, bestCorr = 0;
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

// ---------------------------------------------------------------------------
// Concurrency guards
// ---------------------------------------------------------------------------
const MAX_ANALYSIS_SECONDS = 3;
const FFMPEG_SAMPLE_RATE = 48000;
const MAX_PCM_BYTES = MAX_ANALYSIS_SECONDS * FFMPEG_SAMPLE_RATE * 2;
const MAX_AUDIO_SAMPLES = MAX_ANALYSIS_SECONDS * FFMPEG_SAMPLE_RATE;
const MAX_ANALYSIS_WINDOWS = 5;

let activeFfmpegCount = 0;
const MAX_CONCURRENT_FFMPEG = 2;

let activeWavCount = 0;
export const MAX_CONCURRENT_WAV = 2;

// ---------------------------------------------------------------------------
// Per-IP rate limiter: max 20 requests per 60-second sliding window.
// Uses req.ip which is correctly populated when Express trust proxy is set.
// ---------------------------------------------------------------------------
const RATE_LIMIT_WINDOW_MS = 60_000;
export const RATE_LIMIT_MAX_REQUESTS = 20;
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }
  entry.count++;
  return true;
}

// ---------------------------------------------------------------------------
// ffmpeg helper
// ---------------------------------------------------------------------------
function ffmpegConvertToPcm(
  inputPath: string,
  outputPath: string,
  trimStartSec?: number,
  trimEndSec?: number,
): Promise<void> {
  if (activeFfmpegCount >= MAX_CONCURRENT_FFMPEG) {
    return Promise.reject(new Error("Server busy: too many concurrent audio conversions"));
  }
  activeFfmpegCount++;

  const hasValidStart = typeof trimStartSec === "number" && Number.isFinite(trimStartSec) && trimStartSec > 0;
  const hasValidEnd = typeof trimEndSec === "number" && Number.isFinite(trimEndSec) && trimEndSec > 0
    && (!hasValidStart || trimEndSec > trimStartSec);
  const clampedDuration = hasValidEnd
    ? Math.min(MAX_ANALYSIS_SECONDS, trimEndSec - (hasValidStart ? trimStartSec : 0))
    : MAX_ANALYSIS_SECONDS;

  const args = ["-y"];
  if (hasValidStart) {
    args.push("-ss", String(trimStartSec));
  }
  args.push("-i", inputPath);
  args.push("-t", String(clampedDuration));
  args.push("-f", "s16le", "-acodec", "pcm_s16le", "-ar", String(FFMPEG_SAMPLE_RATE), "-ac", "1");
  args.push(outputPath);

  return new Promise((resolve, reject) => {
    execFile("ffmpeg", args, { timeout: 10000 }, (err, _stdout, stderr) => {
      activeFfmpegCount--;
      if (err) {
        reject(new Error(`FFmpeg error: ${stderr || err.message}`));
      } else {
        resolve();
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Request handler
// ---------------------------------------------------------------------------

// Max base64 length for a 5 MB binary payload — reject early before decoding
const MAX_BASE64_AUDIO_CHARS = Math.ceil((5 * 1024 * 1024) / 3) * 4;

export async function analyzeAudioHandler(req: Request, res: Response) {
  const ip = req.ip ?? "unknown";
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: "Too many requests. Please try again later." });
  }

  const { audio, format, trimStartSec: rawTrimStartSec, trimEndSec: rawTrimEndSec } = req.body;
  if (!audio || typeof audio !== "string") {
    return res.status(400).json({ error: "Missing audio data" });
  }
  if (audio.length > MAX_BASE64_AUDIO_CHARS) {
    return res.status(413).json({ error: "Audio data exceeds maximum allowed size" });
  }

  const trimStartSec = typeof rawTrimStartSec === "number" && Number.isFinite(rawTrimStartSec) && rawTrimStartSec >= 0
    ? rawTrimStartSec
    : undefined;
  const trimEndSec = typeof rawTrimEndSec === "number" && Number.isFinite(rawTrimEndSec) && rawTrimEndSec > 0
    ? rawTrimEndSec
    : undefined;

  const ALLOWED_EXTS = [".wav", ".m4a", ".3gp", ".mp4", ".aac", ".webm"];
  const rawExt = typeof format === "string" ? format.replace(/[^a-zA-Z0-9.]/g, "") : ".wav";
  const ext = ALLOWED_EXTS.includes(rawExt) ? rawExt : ".wav";
  const audioBuffer = Buffer.from(audio, "base64");

  // WAV: run analysis in a worker thread so the main event loop stays free
  if (ext === ".wav") {
    if (activeWavCount >= MAX_CONCURRENT_WAV) {
      return res.status(503).json({ error: "Server busy: too many concurrent audio analyses" });
    }
    activeWavCount++;
    try {
      const result = await analyzeWavInWorker(audioBuffer);
      return res.json(result);
    } catch (e: any) {
      console.error("[analyze-audio] WAV worker error:", e.message);
      return res.status(500).json({ error: e.message });
    } finally {
      activeWavCount--;
    }
  }

  // Other formats: use ffmpeg
  let tmpDir: string | null = null;
  try {
    tmpDir = await mkdtemp(join(tmpdir(), "mic-"));
    const inputPath = join(tmpDir, `input${ext}`);
    const pcmPath = join(tmpDir, "output.pcm");

    await writeFile(inputPath, audioBuffer);
    await ffmpegConvertToPcm(inputPath, pcmPath, trimStartSec, trimEndSec);

    const { readFile, stat } = await import("node:fs/promises");
    const pcmStat = await stat(pcmPath);
    if (pcmStat.size > MAX_PCM_BYTES) {
      return res.status(413).json({ error: "Decoded audio exceeds maximum allowed size" });
    }
    const pcmData = await readFile(pcmPath);

    const SAMPLE_RATE = 48000;
    const MIC_GATE = 0.03;
    const WINDOW_SIZE = 8192;
    const numSamples = Math.min(Math.floor(pcmData.length / 2), MAX_AUDIO_SAMPLES);

    if (numSamples < WINDOW_SIZE) {
      return res.json({ frequency: null, note: null, bpm: null });
    }

    const samples = new Float32Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
      samples[i] = pcmData.readInt16LE(i * 2) / 32768;
    }

    const readings: number[] = [];
    const step = Math.floor(WINDOW_SIZE / 2);
    let windowCount = 0;
    for (let offset = 0; offset + WINDOW_SIZE <= numSamples; offset += step) {
      if (windowCount >= MAX_ANALYSIS_WINDOWS) break;
      const win = samples.slice(offset, offset + WINDOW_SIZE);
      const freq = autoCorrelate(win, SAMPLE_RATE, MIC_GATE);
      if (freq > 20 && freq <= 20000) {
        readings.push(freq);
      }
      windowCount++;
    }

    const bpmCandidates = detectBpmCandidatesFromSamples(samples, SAMPLE_RATE);
    const bpm = bpmCandidates.length > 0 ? bpmCandidates[0] : null;
    const dominant = pickDominantFreq(readings);
    if (dominant) {
      const rounded = Math.round(dominant * 10) / 10;
      const noteInfo = frequencyToNote(dominant);
      return res.json({
        frequency: rounded,
        note: `${noteInfo.name}${noteInfo.octave}`,
        bpm,
        bpmCandidates,
      });
    }
    return res.json({ frequency: null, note: null, bpm, bpmCandidates });
  } catch (e: any) {
    console.error("[analyze-audio] Error:", e.message);
    const status = typeof e.message === "string" && e.message.startsWith("Server busy") ? 503 : 500;
    return res.status(status).json({ error: e.message });
  } finally {
    if (tmpDir) {
      try {
        const { rm } = await import("node:fs/promises");
        await rm(tmpDir, { recursive: true, force: true });
      } catch {}
    }
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.post("/api/analyze-audio", analyzeAudioHandler);
  app.get("/api/time", (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ now: Date.now() });
  });

  const httpServer = createServer(app);
  return httpServer;
}
