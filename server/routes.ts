import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import { execFile } from "node:child_process";
import { writeFile, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import {
  frequencyToNote,
  pickDominantFreq,
  detectBpmCandidatesFromSamples,
} from "../lib/audio-analysis-pure";
// Re-export so existing tests that import detectBpmCandidatesFromSamples from
// this module continue to work without modification.
export { detectBpmCandidatesFromSamples } from "../lib/audio-analysis-pure";

// ---------------------------------------------------------------------------
// Audio-analysis worker code (plain JS, runs off the main event loop)
// ---------------------------------------------------------------------------
// frequencyToNote, pickDominantFreq, detectBpmCandidatesFromSamples, and
// autoCorrelate are each defined once (in lib/audio-analysis-pure.ts or
// below on the main thread) and their compiled function bodies are injected
// verbatim into the worker script via .toString().  This keeps the worker's
// eval'd JS context (which cannot `require()` this module directly once
// esbuild-bundled for production) in lockstep with the main-thread
// implementations, without hand-copying any algorithm.
const WAV_WORKER_CODE = `
const { workerData, parentPort } = require('worker_threads');

const MAX_ANALYSIS_SECONDS = 3;
const FFMPEG_SAMPLE_RATE = 48000;
const MAX_AUDIO_SAMPLES = MAX_ANALYSIS_SECONDS * FFMPEG_SAMPLE_RATE;
const MAX_ANALYSIS_WINDOWS = 5;

${autoCorrelate.toString()}

${frequencyToNote.toString()}

${pickDominantFreq.toString()}

${detectBpmCandidatesFromSamples.toString()}

function decodeWavBuffer(buf) {
  try {
    if (buf.length < 44) return null;
    if (buf.toString('ascii', 0, 4) !== 'RIFF') return null;
    if (buf.toString('ascii', 8, 12) !== 'WAVE') return null;
    const audioFormat  = buf.readUInt16LE(20);
    const numChannels  = buf.readUInt16LE(22);
    const sampleRate   = buf.readUInt32LE(24);
    const bitsPerSample = buf.readUInt16LE(34);
    if (!((audioFormat === 1 && [8, 16, 24].includes(bitsPerSample)) || (audioFormat === 3 && bitsPerSample === 32))) return null;
    if (numChannels < 1 || numChannels > 2) return null;
    if (sampleRate < 8000 || sampleRate > 192000) return null;
    if (![8, 16, 24, 32].includes(bitsPerSample)) return null;
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
  const bpmCandidates = detectBpmCandidatesFromSamples(samples, rate);
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
      reject(Object.assign(new Error("WAV analysis timed out"), { code: "TIMEOUT" }));
    }, ANALYSIS_TIMEOUT_MS);
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
// autoCorrelate: pitch-detection helper (main thread + injected into worker)
// frequencyToNote / pickDominantFreq / detectBpmCandidatesFromSamples are
// imported from lib/audio-analysis-pure and also injected into the worker.
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Concurrency guards
// ---------------------------------------------------------------------------
export const MAX_ANALYSIS_SECONDS = 3;
const FFMPEG_SAMPLE_RATE = 48000;
const MAX_PCM_BYTES = MAX_ANALYSIS_SECONDS * FFMPEG_SAMPLE_RATE * 2;
const MAX_AUDIO_SAMPLES = MAX_ANALYSIS_SECONDS * FFMPEG_SAMPLE_RATE;
const MAX_ANALYSIS_WINDOWS = 5;
export const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
export const MAX_TRIM_SECONDS = 60 * 60;
export const ANALYSIS_TIMEOUT_MS = 12_000;

let activeFfmpegCount = 0;
const MAX_CONCURRENT_FFMPEG = 2;

let activeWavCount = 0;
export const MAX_CONCURRENT_WAV = 2;

// ---------------------------------------------------------------------------
// Per-IP rate limiter: max 20 requests in each fixed 60-second window.
// Uses req.ip which is correctly populated when Express trust proxy is set.
// ---------------------------------------------------------------------------
const RATE_LIMIT_WINDOW_MS = 60_000;
export const RATE_LIMIT_MAX_REQUESTS = 20;
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
// Exported for tests so they can reset state between test runs.
// Type alias: tests import as Map<string, number[]> but only call .clear().
export const _ipRequestLog: Map<unknown, unknown> = rateLimitMap as unknown as Map<unknown, unknown>;

// 만료된 IP 항목을 주기적으로 정리해 Map 무한 증가 방지.
// 창 크기의 2배 간격으로 실행 — 너무 잦으면 CPU 낭비, 너무 드물면 메모리 증가.
const _rateLimitSweep = setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
      rateLimitMap.delete(ip);
    }
  }
}, RATE_LIMIT_WINDOW_MS * 2);
// unref: 이 타이머 때문에 프로세스 종료가 막히지 않도록
(_rateLimitSweep as unknown as NodeJS.Timeout).unref?.();

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

/** Exported for tests: returns true when an IP has exceeded its rate limit. */
export function isRateLimited(ip: string): boolean {
  return !checkRateLimit(ip);
}

// ---------------------------------------------------------------------------
// ffmpeg helper
// ---------------------------------------------------------------------------
function ffmpegConvertToPcm(
  inputPath: string,
  outputPath: string,
  trimStartSec?: number,
  trimEndSec?: number,
  inputFormat?: string,
): Promise<void> {
  if (activeFfmpegCount >= MAX_CONCURRENT_FFMPEG) {
    return Promise.reject(Object.assign(new Error("Audio conversion capacity reached"), { code: "BUSY" }));
  }
  activeFfmpegCount++;

  const hasValidStart = typeof trimStartSec === "number" && Number.isFinite(trimStartSec) && trimStartSec > 0;
  const hasValidEnd = typeof trimEndSec === "number" && Number.isFinite(trimEndSec) && trimEndSec > 0
    && (!hasValidStart || trimEndSec > trimStartSec);
  const clampedDuration = hasValidEnd
    ? Math.min(MAX_ANALYSIS_SECONDS, trimEndSec - (hasValidStart ? trimStartSec : 0))
    : MAX_ANALYSIS_SECONDS;

  const args = ["-y"];
  if (inputFormat) {
    args.push("-f", inputFormat);
  }
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
        const code = err.killed || (err as NodeJS.ErrnoException).code === "ETIMEDOUT"
          ? "TIMEOUT"
          : "INVALID_AUDIO";
        void stderr;
        reject(Object.assign(new Error("Audio conversion failed"), { code }));
      } else {
        resolve();
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Request handler
// ---------------------------------------------------------------------------

// Max base64 length for a 5 MB binary payload — reject early before decoding.
const MAX_BASE64_AUDIO_CHARS = Math.ceil(MAX_AUDIO_BYTES / 3) * 4;
const ALLOWED_AUDIO_EXTS = [".wav", ".m4a", ".3gp", ".mp4", ".aac", ".webm"] as const;
type AudioExtension = (typeof ALLOWED_AUDIO_EXTS)[number];
const FFMPEG_INPUT_FORMAT: Record<Exclude<AudioExtension, ".wav">, string> = {
  ".m4a": "mov",
  ".3gp": "mov,mp4,m4a,3gp,3g2,mj2",
  ".mp4": "mov",
  ".aac": "aac",
  ".webm": "matroska,webm",
};

function isValidBase64(value: string): boolean {
  if (value.length === 0 || value.length % 4 === 1) return false;
  return /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value);
}

function isRiffWave(buffer: Buffer): boolean {
  return buffer.length >= 12
    && buffer.toString("ascii", 0, 4) === "RIFF"
    && buffer.toString("ascii", 8, 12) === "WAVE";
}

function isDeclaredContainer(buffer: Buffer, extension: AudioExtension): boolean {
  if (extension === ".wav") return isRiffWave(buffer);
  if (extension === ".aac") {
    return buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xf6) === 0xf0;
  }
  if (extension === ".webm") {
    return buffer.length >= 8
      && buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
      && buffer.subarray(0, Math.min(buffer.length, 4096)).includes(Buffer.from("webm"));
  }
  if (buffer.length < 12 || buffer.toString("ascii", 4, 8) !== "ftyp") return false;
  const brand = buffer.toString("ascii", 8, 12).toLowerCase();
  if (extension === ".3gp") return brand.startsWith("3gp");
  return ["m4a ", "m4b ", "isom", "iso2", "mp41", "mp42", "avc1", "dash"].includes(brand);
}

function getAudioExtension(format: unknown): AudioExtension | null {
  if (format === undefined) return ".wav";
  if (typeof format !== "string") return null;
  const normalized = format.toLowerCase().startsWith(".")
    ? format.toLowerCase()
    : `.${format.toLowerCase()}`;
  return (ALLOWED_AUDIO_EXTS as readonly string[]).includes(normalized)
    ? normalized as AudioExtension
    : null;
}

function getOptionalTrim(
  value: unknown,
  fieldName: "trimStartSec" | "trimEndSec",
): { value?: number; error?: string } {
  if (value === undefined) return {};
  if (
    typeof value !== "number"
    || !Number.isFinite(value)
    || value < 0
    || value > MAX_TRIM_SECONDS
    || (fieldName === "trimEndSec" && value === 0)
  ) {
    return { error: `${fieldName} must be a finite value between 0 and ${MAX_TRIM_SECONDS} seconds` };
  }
  return { value };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function analyzeAudioHandler(req: Request, res: Response) {
  const ip = req.ip ?? "unknown";
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: "Too many requests. Please try again later." });
  }

  if (!isRecord(req.body)) {
    return res.status(400).json({ error: "Request body must be a JSON object" });
  }

  const { audio, format, trimStartSec: rawTrimStartSec, trimEndSec: rawTrimEndSec } = req.body;
  if (typeof audio !== "string" || audio.length === 0) {
    return res.status(400).json({ error: "Missing audio data" });
  }
  const cleanAudio = audio.replace(/\s/g, "");
  if (cleanAudio.length > MAX_BASE64_AUDIO_CHARS) {
    return res.status(413).json({ error: "Audio data exceeds maximum allowed size" });
  }
  if (!isValidBase64(cleanAudio)) {
    return res.status(400).json({ error: "Audio data must be valid base64" });
  }

  const trimStart = getOptionalTrim(rawTrimStartSec, "trimStartSec");
  const trimEnd = getOptionalTrim(rawTrimEndSec, "trimEndSec");
  if (trimStart.error || trimEnd.error) {
    return res.status(400).json({ error: trimStart.error ?? trimEnd.error });
  }
  if (trimStart.value !== undefined && trimEnd.value !== undefined && trimEnd.value <= trimStart.value) {
    return res.status(400).json({ error: "trimEndSec must be greater than trimStartSec" });
  }

  const ext = getAudioExtension(format);
  if (!ext) {
    return res.status(415).json({ error: "Unsupported audio format" });
  }
  const audioBuffer = Buffer.from(cleanAudio, "base64");
  if (audioBuffer.length === 0) {
    return res.status(400).json({ error: "Audio data is empty" });
  }
  if (audioBuffer.length > MAX_AUDIO_BYTES) {
    return res.status(413).json({ error: "Audio data exceeds maximum allowed size" });
  }
  if (!isDeclaredContainer(audioBuffer, ext)) {
    return res.status(415).json({
      error: ext === ".wav"
        ? "Audio data does not match the WAV format"
        : "Audio data does not match the declared format",
    });
  }

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
      console.error("[analyze-audio] WAV worker failed:", { code: e.code ?? "INVALID_AUDIO" });
      const status = e.code === "TIMEOUT" ? 504 : 422;
      return res.status(status).json({ error: status === 504 ? "Audio analysis timed out" : "Audio data could not be analyzed" });
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
    await ffmpegConvertToPcm(
      inputPath,
      pcmPath,
      trimStart.value,
      trimEnd.value,
      FFMPEG_INPUT_FORMAT[ext],
    );

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
    console.error("[analyze-audio] analysis failed:", { code: e.code ?? "INVALID_AUDIO" });
    const status = e.code === "BUSY" ? 503 : e.code === "TIMEOUT" ? 504 : 422;
    const error = status === 503
      ? "Server busy. Please try again later."
      : status === 504
        ? "Audio analysis timed out"
        : "Audio data could not be analyzed";
    return res.status(status).json({ error });
  } finally {
    if (tmpDir) {
      try {
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
