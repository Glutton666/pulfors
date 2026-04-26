import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import { execFile } from "node:child_process";
import { writeFile, unlink, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

function frequencyToNote(freq: number): { name: string; octave: number; cents: number } {
  const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const semitones = 12 * Math.log2(freq / 440);
  const rounded = Math.round(semitones);
  const cents = Math.round((semitones - rounded) * 100);
  const noteIndex = ((rounded % 12) + 12 + 9) % 12;
  const octave = Math.floor((rounded + 9) / 12) + 4;
  return { name: NOTE_NAMES[noteIndex], octave, cents };
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

const MAX_ANALYSIS_SECONDS = 3;
const FFMPEG_SAMPLE_RATE = 48000;
const MAX_PCM_BYTES = MAX_ANALYSIS_SECONDS * FFMPEG_SAMPLE_RATE * 2;
const MAX_AUDIO_SAMPLES = MAX_ANALYSIS_SECONDS * FFMPEG_SAMPLE_RATE;
const MAX_ANALYSIS_WINDOWS = 5;

let activeFfmpegCount = 0;
const MAX_CONCURRENT_FFMPEG = 2;

function ffmpegConvertToPcm(inputPath: string, outputPath: string): Promise<void> {
  if (activeFfmpegCount >= MAX_CONCURRENT_FFMPEG) {
    return Promise.reject(new Error("Server busy: too many concurrent audio conversions"));
  }
  activeFfmpegCount++;
  return new Promise((resolve, reject) => {
    execFile("ffmpeg", [
      "-y", "-i", inputPath,
      "-t", String(MAX_ANALYSIS_SECONDS),
      "-f", "s16le", "-acodec", "pcm_s16le",
      "-ar", String(FFMPEG_SAMPLE_RATE), "-ac", "1",
      outputPath
    ], { timeout: 10000 }, (err, _stdout, stderr) => {
      activeFfmpegCount--;
      if (err) {
        reject(new Error(`FFmpeg error: ${stderr || err.message}`));
      } else {
        resolve();
      }
    });
  });
}

// WAV 파일을 ffmpeg 없이 직접 디코딩 (PCM 16/24/32비트 지원)
function decodeWavBuffer(buf: Buffer): { samples: Float32Array; rate: number } | null {
  try {
    if (buf.length < 44) return null;
    const riff = buf.toString("ascii", 0, 4);
    if (riff !== "RIFF") return null;
    const audioFormat = buf.readUInt16LE(20); // 1=PCM, 3=IEEE float
    const numChannels = buf.readUInt16LE(22);
    const sampleRate = buf.readUInt32LE(24);
    const bitsPerSample = buf.readUInt16LE(34);
    let offset = 12;
    while (offset < buf.length - 8) {
      const tag = buf.toString("ascii", offset, offset + 4);
      const chunkSize = buf.readUInt32LE(offset + 4);
      if (tag === "data") {
        offset += 8;
        const bytesPerSample = bitsPerSample / 8;
        const availableBytes = buf.length - offset;
        const samplesFromHeader = Math.floor(chunkSize / (bytesPerSample * numChannels));
        const samplesFromBuffer = Math.floor(availableBytes / (bytesPerSample * numChannels));
        const numSamples = Math.min(samplesFromHeader, samplesFromBuffer, MAX_AUDIO_SAMPLES);
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
            const lo = buf[off] | (buf[off + 1] << 8);
            const hi = buf[off + 2];
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
  } catch {
    return null;
  }
}

const WAV_MAX_ANALYSIS_SAMPLES = MAX_AUDIO_SAMPLES;

function analyzeWavDirect(audioBuffer: Buffer): { frequency: number | null; note: string | null } {
  const decoded = decodeWavBuffer(audioBuffer);
  if (!decoded) return { frequency: null, note: null };
  const { rate } = decoded;
  const samples = decoded.samples.length > WAV_MAX_ANALYSIS_SAMPLES
    ? decoded.samples.slice(0, WAV_MAX_ANALYSIS_SAMPLES)
    : decoded.samples;
  const WINDOW_SIZE = 8192;
  const MIC_GATE = 0.02;
  if (samples.length < WINDOW_SIZE) return { frequency: null, note: null };
  const readings: number[] = [];
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
  if (!dominant) return { frequency: null, note: null };
  const rounded = Math.round(dominant * 10) / 10;
  const noteInfo = frequencyToNote(dominant);
  return { frequency: rounded, note: `${noteInfo.name}${noteInfo.octave}` };
}

async function analyzeAudioHandler(req: Request, res: Response) {
  const { audio, format } = req.body;
  if (!audio || typeof audio !== "string") {
    return res.status(400).json({ error: "Missing audio data" });
  }

  const ALLOWED_EXTS = [".wav", ".m4a", ".3gp", ".mp4", ".aac", ".webm"];
  const rawExt = typeof format === "string" ? format.replace(/[^a-zA-Z0-9.]/g, "") : ".wav";
  const ext = ALLOWED_EXTS.includes(rawExt) ? rawExt : ".wav";
  const audioBuffer = Buffer.from(audio, "base64");

  // WAV는 ffmpeg 없이 직접 디코딩 (Cloud Run 등 ffmpeg 미설치 환경 호환)
  if (ext === ".wav") {
    try {
      const result = analyzeWavDirect(audioBuffer);
      return res.json(result);
    } catch (e: any) {
      console.error("[analyze-audio] WAV direct decode error:", e.message);
      return res.status(500).json({ error: e.message });
    }
  }

  // 다른 포맷은 ffmpeg 사용
  let tmpDir: string | null = null;
  try {
    tmpDir = await mkdtemp(join(tmpdir(), "mic-"));
    const inputPath = join(tmpDir, `input${ext}`);
    const pcmPath = join(tmpDir, "output.pcm");

    await writeFile(inputPath, audioBuffer);
    await ffmpegConvertToPcm(inputPath, pcmPath);

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
      return res.json({ frequency: null, note: null });
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

    const dominant = pickDominantFreq(readings);
    if (dominant) {
      const rounded = Math.round(dominant * 10) / 10;
      const noteInfo = frequencyToNote(dominant);
      return res.json({
        frequency: rounded,
        note: `${noteInfo.name}${noteInfo.octave}`,
      });
    }
    return res.json({ frequency: null, note: null });
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

  const httpServer = createServer(app);
  return httpServer;
}
