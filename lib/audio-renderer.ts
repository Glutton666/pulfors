import { Platform } from "react-native";
import { File, Paths } from "expo-file-system";
import { Asset } from "expo-asset";
import type { BeatType } from "./metronome-engine";

const RENDER_SR = 44100;

let sharedAudioCtx: AudioContext | null = null;
function getSharedAudioContext(): AudioContext | null {
  if (Platform.OS !== "web") return null;
  if (sharedAudioCtx && sharedAudioCtx.state !== "closed") return sharedAudioCtx;
  const AC = (globalThis as any).AudioContext || (globalThis as any).webkitAudioContext;
  if (!AC) return null;
  sharedAudioCtx = new AC();
  return sharedAudioCtx;
}

export interface TickInfo {
  time: number;
  type: BeatType;
  beat: number;
  subBeat: number;
  repeatIteration: number;
  barRepeatIteration: number;
}

export interface DecodedSample {
  pcm: Float32Array;
  trimStartSamples: number;
  trimLenSamples: number;
}

function writeStr(v: DataView, off: number, s: string) {
  for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
}

export function parseWav(buf: ArrayBuffer): {
  pcm: Float32Array;
  sampleRate: number;
} {
  const v = new DataView(buf);
  let off = 12;
  let fmtOff = -1;
  let dataOff = -1;
  let dataSz = 0;

  while (off < v.byteLength - 8) {
    const id =
      String.fromCharCode(v.getUint8(off)) +
      String.fromCharCode(v.getUint8(off + 1)) +
      String.fromCharCode(v.getUint8(off + 2)) +
      String.fromCharCode(v.getUint8(off + 3));
    const sz = v.getUint32(off + 4, true);
    if (id === "fmt ") fmtOff = off + 8;
    else if (id === "data") {
      dataOff = off + 8;
      dataSz = sz;
      break;
    }
    off += 8 + sz;
    if (sz % 2 !== 0) off++;
  }

  if (fmtOff < 0 || dataOff < 0) throw new Error("Invalid WAV");

  const fmt = v.getUint16(fmtOff, true);
  const ch = v.getUint16(fmtOff + 2, true);
  const sr = v.getUint32(fmtOff + 4, true);
  const bps = v.getUint16(fmtOff + 14, true);

  if (fmt !== 1 && fmt !== 3) throw new Error("Only PCM/Float WAV supported");

  const bytesPerSample = bps / 8;
  const frameSize = ch * bytesPerSample;
  const numFrames = Math.floor(dataSz / frameSize);
  const pcm = new Float32Array(numFrames);

  for (let i = 0; i < numFrames; i++) {
    const sOff = dataOff + i * frameSize;
    if (sOff + bytesPerSample > v.byteLength) break;
    if (bps === 16) {
      pcm[i] = v.getInt16(sOff, true) / 32768;
    } else if (bps === 8) {
      pcm[i] = (v.getUint8(sOff) - 128) / 128;
    } else if (bps === 32 && fmt === 3) {
      pcm[i] = v.getFloat32(sOff, true);
    } else if (bps === 32) {
      pcm[i] = v.getInt32(sOff, true) / 2147483648;
    } else if (bps === 24) {
      const b0 = v.getUint8(sOff);
      const b1 = v.getUint8(sOff + 1);
      const b2 = v.getUint8(sOff + 2);
      let val = (b2 << 16) | (b1 << 8) | b0;
      if (val >= 0x800000) val -= 0x1000000;
      pcm[i] = val / 8388608;
    }
  }

  return { pcm, sampleRate: sr };
}

export function encodeWav(pcm: Float32Array, sr: number, preClamped = false): ArrayBuffer {
  const n = pcm.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  writeStr(v, 0, "RIFF");
  v.setUint32(4, 36 + n * 2, true);
  writeStr(v, 8, "WAVE");
  writeStr(v, 12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  writeStr(v, 36, "data");
  v.setUint32(40, n * 2, true);
  if (preClamped) {
    for (let i = 0; i < n; i++) {
      const s = pcm[i];
      v.setInt16(44 + i * 2, s < 0 ? s * 32768 : s * 32767, true);
    }
  } else {
    for (let i = 0; i < n; i++) {
      const s = Math.max(-1, Math.min(1, pcm[i]));
      v.setInt16(44 + i * 2, s < 0 ? s * 32768 : s * 32767, true);
    }
  }
  return buf;
}

function resample(
  pcm: Float32Array,
  from: number,
  to: number
): Float32Array {
  if (from === to) return pcm;
  const ratio = from / to;
  const len = Math.floor(pcm.length / ratio);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const idx = i * ratio;
    const lo = Math.floor(idx);
    const frac = idx - lo;
    out[i] =
      lo + 1 < pcm.length
        ? pcm[lo] * (1 - frac) + pcm[lo + 1] * frac
        : pcm[lo] ?? 0;
  }
  return out;
}

function b64ToAB(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

function abToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const chunkSize = 8192;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

export async function loadAssetPCM(
  assetModule: number | string
): Promise<Float32Array> {
  if (Platform.OS === "web") {
    const url =
      typeof assetModule === "string"
        ? assetModule
        : Asset.fromModule(assetModule).uri;
    const resp = await fetch(url);
    const ab = await resp.arrayBuffer();
    try {
      const ctx = getSharedAudioContext();
      if (ctx) {
        const audioBuf = await ctx.decodeAudioData(ab.slice(0));
        const pcm = audioBuf.getChannelData(0);
        return resample(new Float32Array(pcm), audioBuf.sampleRate, RENDER_SR);
      }
    } catch {}
    const { pcm, sampleRate } = parseWav(ab);
    return resample(pcm, sampleRate, RENDER_SR);
  } else {
    const asset = Asset.fromModule(assetModule as number);
    await asset.downloadAsync();
    if (!asset.localUri) throw new Error("Failed to load asset");
    const file = new File(asset.localUri);
    const ab = await file.arrayBuffer();
    const { pcm, sampleRate } = parseWav(ab);
    return resample(pcm, sampleRate, RENDER_SR);
  }
}

export async function decodeSampleFile(
  uri: string
): Promise<Float32Array | null> {
  try {
    const rawUri = uri.split("#")[0];

    if (Platform.OS === "web") {
      // Only fetch local URIs; reject external http/https to prevent SSRF
      if (rawUri.startsWith("http://") || rawUri.startsWith("https://")) {
        console.warn("[AudioRenderer] External URI blocked:", rawUri.slice(0, 80));
        return null;
      }
      const resp = await fetch(rawUri);
      const ab = await resp.arrayBuffer();
      try {
        const ctx = getSharedAudioContext();
        if (ctx) {
          const audioBuf = await ctx.decodeAudioData(ab.slice(0));
          const pcm = audioBuf.getChannelData(0);
          return resample(new Float32Array(pcm), audioBuf.sampleRate, RENDER_SR);
        }
      } catch {}
      const { pcm, sampleRate } = parseWav(ab);
      return resample(pcm, sampleRate, RENDER_SR);
    } else {
      const fileUri = rawUri.startsWith("file://") ? rawUri : "file://" + rawUri;
      const file = new File(fileUri);
      const ab = await file.arrayBuffer();
      try {
        const { pcm, sampleRate } = parseWav(ab);
        return resample(pcm, sampleRate, RENDER_SR);
      } catch {
        console.warn("[AudioRenderer] Non-WAV on native, trying raw decode");
        return null;
      }
    }
  } catch (e) {
    console.warn("[AudioRenderer] decode failed:", uri, e);
    return null;
  }
}

export function parseTrimInfo(uri: string): {
  trimStartMs: number;
  trimDurationMs: number;
} {
  const h = uri.split("#t=")[1];
  let s = 0,
    e = 0;
  if (h) {
    const p = h.split(",").map(Number);
    if (!isNaN(p[0])) s = p[0];
    if (p.length > 1 && !isNaN(p[1])) e = p[1];
  }
  return { trimStartMs: s, trimDurationMs: e > s ? e - s : 0 };
}

function mixInto(
  dest: Float32Array,
  src: Float32Array,
  offset: number,
  vol: number
) {
  const start = offset < 0 ? -offset : 0;
  const end = Math.min(src.length, dest.length - offset);
  for (let i = start; i < end; i++) {
    dest[offset + i] += src[i] * vol;
  }
}

export interface ClickPCMs {
  strong: Float32Array;
  high: Float32Array;
  low: Float32Array;
}

export interface SamplePCMEntry {
  pcm: Float32Array;
  trimStartMs: number;
  trimDurationMs: number;
}

export function renderMeasure(params: {
  schedule: TickInfo[];
  measureDurationMs: number;
  clickPCMs: ClickPCMs;
  samplePCMs: Map<string, SamplePCMEntry>;
  clickVolume: number;
  sampleVolume: number;
}): Float32Array {
  const {
    schedule,
    measureDurationMs,
    clickPCMs,
    samplePCMs,
    clickVolume,
    sampleVolume,
  } = params;

  const COPIES = 2;
  const measureSamples = Math.ceil((measureDurationMs / 1000) * RENDER_SR);
  const loopSamples = measureSamples * COPIES;
  const maxClickLen = Math.max(
    clickPCMs.strong.length,
    clickPCMs.high.length,
    clickPCMs.low.length,
    Math.ceil(RENDER_SR * 0.15),
  );
  const totalSamples = loopSamples + maxClickLen;
  const buffer = new Float32Array(totalSamples);

  for (let copy = 0; copy < COPIES; copy++) {
    const copyOffset = copy * measureSamples;
    for (const tick of schedule) {
      if (tick.type === "mute") continue;
      const offsetSamples = copyOffset + Math.round((tick.time / 1000) * RENDER_SR);
      const key = `${tick.beat}-${tick.subBeat}`;

      let clickPCM: Float32Array;
      if (tick.type === "strong") clickPCM = clickPCMs.strong;
      else if (tick.type === "accent") clickPCM = clickPCMs.high;
      else clickPCM = clickPCMs.low;
      mixInto(buffer, clickPCM, offsetSamples, clickVolume);

      if (tick.repeatIteration === 0 && tick.barRepeatIteration === 0 && samplePCMs.has(key)) {
        const sample = samplePCMs.get(key)!;
        const trimStart = Math.round(
          (sample.trimStartMs / 1000) * RENDER_SR
        );
        const trimLen =
          sample.trimDurationMs > 0
            ? Math.round((sample.trimDurationMs / 1000) * RENDER_SR)
            : sample.pcm.length - trimStart;
        const trimmed = sample.pcm.subarray(
          trimStart,
          Math.min(trimStart + trimLen, sample.pcm.length)
        );
        mixInto(buffer, trimmed, offsetSamples, sampleVolume);
      }
    }
  }

  for (let i = loopSamples; i < totalSamples; i++) {
    buffer[i - loopSamples] += buffer[i];
  }

  const out = buffer.subarray(0, loopSamples);
  for (let i = 0; i < out.length; i++) {
    out[i] = Math.max(-1, Math.min(1, out[i]));
  }
  return out;
}

export async function saveRenderedWav(pcm: Float32Array): Promise<string> {
  const wav = encodeWav(pcm, RENDER_SR, true);

  if (Platform.OS === "web") {
    const blob = new Blob([wav], { type: "audio/wav" });
    return URL.createObjectURL(blob);
  } else {
    const cacheDir = Paths.cache;
    const file = new File(cacheDir, "rendered_measure.wav");
    const bytes = new Uint8Array(wav);
    file.write(bytes);
    return file.uri;
  }
}

export function getRenderSampleRate(): number {
  return RENDER_SR;
}

let webClickBuffers: { strong: AudioBuffer; high: AudioBuffer; low: AudioBuffer } | null = null;

export function getWebAudioContext(): AudioContext | null {
  return getSharedAudioContext();
}

export async function ensureWebClickBuffers(
  soundSet: Record<string, number | string>
): Promise<boolean> {
  if (Platform.OS !== "web") return false;
  const ctx = getSharedAudioContext();
  if (!ctx) return false;

  if (webClickBuffers) return true;

  try {
    const loadOne = async (src: number | string): Promise<AudioBuffer> => {
      const url = typeof src === "string" ? src : Asset.fromModule(src).uri;
      const resp = await fetch(url);
      const ab = await resp.arrayBuffer();
      return ctx.decodeAudioData(ab.slice(0));
    };
    const [strong, high, low] = await Promise.all([
      loadOne(soundSet.strong),
      loadOne(soundSet.high),
      loadOne(soundSet.low),
    ]);
    webClickBuffers = { strong, high, low };
    return true;
  } catch (e) {
    console.warn("[WebAudio] Failed to load click buffers:", e);
    return false;
  }
}

export function playWebClick(role: "strong" | "high" | "low"): void {
  if (Platform.OS !== "web" || !webClickBuffers) return;
  const ctx = getSharedAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
  const buffer = webClickBuffers[role];
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start(0);
}

export function clearWebClickBuffers(): void {
  webClickBuffers = null;
}

export function playWebRenderedLoop(pcm: Float32Array, onEnded?: () => void): { stop: () => void } {
  if (Platform.OS !== "web") return { stop: () => {} };
  const ctx = getSharedAudioContext();
  if (!ctx) return { stop: () => {} };
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }

  const audioBuffer = ctx.createBuffer(1, pcm.length, RENDER_SR);
  audioBuffer.getChannelData(0).set(pcm);

  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  source.loop = true;
  source.connect(ctx.destination);
  source.start(0);

  let stopped = false;
  source.onended = () => {
    if (!stopped) onEnded?.();
  };

  return {
    stop: () => {
      stopped = true;
      try { source.stop(); } catch {}
      try { source.disconnect(); } catch {}
    },
  };
}
