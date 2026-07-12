import { Platform } from "react-native";
import { File, Paths } from "expo-file-system";
import { Asset } from "expo-asset";
import type { BeatType } from "./metronome-engine";
import { logger } from "./logger";
import type { SampleChannel, MetroChannel } from "./stereo-channel";

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

// Suppress "play() interrupted by pause()" unhandled rejections that expo-audio
// triggers on web during player initialization before user interaction. These
// are benign races from the internal buffering logic, but left unhandled they
// suspend the AudioContext and block metronome playback.
//
// We register the handler immediately at module load time (not inside a
// function) so it is in place before any useAudioPlayer hook runs.
export function installAudioPlayInterruptHandler(): void { /* no-op: installed at module init */ }

if (Platform.OS === "web" && typeof window !== "undefined") {
  const win = window as any;
  if (!win.__audioPlayInterruptHandlerInstalled) {
    win.__audioPlayInterruptHandlerInstalled = true;
    // Patch HTMLMediaElement.prototype.play so that the "interrupted by pause"
    // DOMException is caught at the source rather than bubbling up as an
    // unhandledRejection. This is necessary because Expo's own error-reporting
    // layer captures unhandledrejection events before our listener can call
    // event.preventDefault(). By catching the rejection inline we prevent the
    // AudioContext from being suspended by this benign race.
    const nativePlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function patchedPlay(this: HTMLMediaElement) {
      const result = nativePlay.call(this);
      if (result && typeof result.then === "function") {
        return result.catch((e: unknown) => {
          const msg: string = (e as any)?.message ?? "";
          const name: string = (e as any)?.name ?? "";
          if (
            msg.includes("interrupted by a call to pause") ||
            msg.includes("interrupted by a new load request") ||
            msg.includes("can only be initiated by a user gesture") ||
            name === "NotAllowedError"
          ) {
            // Benign — these come from expo-audio's pooled <audio> elements
            // (used only on native; on web all click audio goes through the
            // Web Audio API in playWebClick()). Swallow silently so an
            // unhandled rejection doesn't propagate to expo's global error
            // reporting and inadvertently suspend the shared AudioContext.
            if (sharedAudioCtx && sharedAudioCtx.state === "suspended") {
              sharedAudioCtx.resume().catch(() => {});
            }
            return;
          }
          throw e;
        });
      }
      return result;
    };
  }
}

export interface TickInfo {
  time: number;
  type: BeatType;
  beat: number;
  subBeat: number;
  repeatIteration: number;
  barRepeatIteration: number;
  layerIndex?: number;
  layerSoundSet?: string;
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

export function applySoftClip(pcm: Float32Array): void {
  for (let i = 0; i < pcm.length; i++) {
    pcm[i] = Math.tanh(pcm[i]);
  }
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
    const url = resolveWebAssetUrl(assetModule);
    if (!url) throw new Error("[AudioRenderer] Could not resolve URL for asset");
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
      // Strict allowlist: only fetch local URIs created by this app.
      // Blocks http/https and any other scheme that would make an outbound request.
      const isLocalWebUri =
        rawUri.startsWith("blob:") ||
        rawUri.startsWith("data:") ||
        rawUri.startsWith("file://");
      if (!isLocalWebUri) {
        logger.warn("[AudioRenderer] Non-local URI blocked:", rawUri.slice(0, 80));
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
        logger.warn("[AudioRenderer] Non-WAV on native, trying raw decode");
        return null;
      }
    }
  } catch (e) {
    logger.warn("[AudioRenderer] decode failed:", uri, e);
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
  metronomeChannel?: SampleChannel;
  sampleChannels?: Record<string, SampleChannel>;
  layerClickPCMs?: Map<string, ClickPCMs>;
  metroChannelsByBeat?: Record<string, MetroChannel>;
}): Float32Array | { left: Float32Array; right: Float32Array } {
  const {
    schedule,
    measureDurationMs,
    clickPCMs,
    samplePCMs,
    clickVolume,
    sampleVolume,
    metronomeChannel = "both",
    sampleChannels = {},
    layerClickPCMs,
    metroChannelsByBeat,
  } = params;
  const stereoMode =
    metronomeChannel !== "both" ||
    Object.values(sampleChannels).some((c) => c !== "both") ||
    (metroChannelsByBeat
      ? Object.values(metroChannelsByBeat).some((c) => c !== "both")
      : false);

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

  const mixToChannel = (
    bufL: Float32Array,
    bufR: Float32Array,
    src: Float32Array,
    offset: number,
    vol: number,
    channel: SampleChannel,
  ) => {
    if (channel === "both") {
      mixInto(bufL, src, offset, vol);
      mixInto(bufR, src, offset, vol);
    } else if (channel === "left") {
      mixInto(bufL, src, offset, vol);
    } else {
      mixInto(bufR, src, offset, vol);
    }
  };

  const renderInto = (left: Float32Array, right: Float32Array | null) => {
    for (let copy = 0; copy < COPIES; copy++) {
      const copyOffset = copy * measureSamples;
      for (const tick of schedule) {
        if (tick.type === "mute") continue;
        const offsetSamples = copyOffset + Math.round((tick.time / 1000) * RENDER_SR);
        const key = `${tick.beat}-${tick.subBeat}`;

        const isLayerTick = (tick.layerIndex ?? 0) > 0;
        let effectiveClickPCMs = clickPCMs;
        if (isLayerTick && layerClickPCMs) {
          const bySet = tick.layerSoundSet ? layerClickPCMs.get(tick.layerSoundSet) : undefined;
          const byIdx = layerClickPCMs.get(`#${tick.layerIndex ?? 0}`);
          effectiveClickPCMs = bySet ?? byIdx ?? clickPCMs;
        }

        const effectiveMetroChannel: MetroChannel =
          metroChannelsByBeat?.[String(tick.beat)] ?? metronomeChannel;
        if (effectiveMetroChannel !== "off") {
          let clickPCM: Float32Array;
          if (tick.type === "strong") clickPCM = effectiveClickPCMs.strong;
          else if (tick.type === "accent") clickPCM = effectiveClickPCMs.high;
          else clickPCM = effectiveClickPCMs.low;
          if (right) {
            mixToChannel(left, right, clickPCM, offsetSamples, clickVolume, effectiveMetroChannel as SampleChannel);
          } else {
            mixInto(left, clickPCM, offsetSamples, clickVolume);
          }
        }

        if (tick.repeatIteration === 0 && tick.barRepeatIteration === 0 && samplePCMs.has(key)) {
          const sample = samplePCMs.get(key)!;
          const trimStart = Math.round((sample.trimStartMs / 1000) * RENDER_SR);
          const trimLen =
            sample.trimDurationMs > 0
              ? Math.round((sample.trimDurationMs / 1000) * RENDER_SR)
              : sample.pcm.length - trimStart;
          const trimmed = sample.pcm.subarray(
            trimStart,
            Math.min(trimStart + trimLen, sample.pcm.length),
          );
          if (right) {
            const ch = sampleChannels[key] ?? "both";
            mixToChannel(left, right, trimmed, offsetSamples, sampleVolume, ch);
          } else {
            mixInto(left, trimmed, offsetSamples, sampleVolume);
          }
        }
      }
    }
  };

  const finalize = (buf: Float32Array): Float32Array => {
    for (let i = loopSamples; i < totalSamples; i++) {
      buf[i - loopSamples] += buf[i];
    }
    const out = buf.subarray(0, loopSamples);
    for (let i = 0; i < out.length; i++) {
      out[i] = Math.max(-1, Math.min(1, out[i]));
    }
    return out;
  };

  if (!stereoMode) {
    const buffer = new Float32Array(totalSamples);
    renderInto(buffer, null);
    return finalize(buffer);
  }

  const leftBuf = new Float32Array(totalSamples);
  const rightBuf = new Float32Array(totalSamples);
  renderInto(leftBuf, rightBuf);
  return { left: finalize(leftBuf), right: finalize(rightBuf) };
}

type StereoPCM = { left: Float32Array; right: Float32Array };

function isStereoPCM(pcm: Float32Array | StereoPCM): pcm is StereoPCM {
  return !(pcm instanceof Float32Array) && pcm.left instanceof Float32Array;
}

interface StereoPannerCapableContext extends AudioContext {
  createStereoPanner(): StereoPannerNode;
}

function hasStereoPanner(ctx: AudioContext): ctx is StereoPannerCapableContext {
  return typeof (ctx as Partial<StereoPannerCapableContext>).createStereoPanner === "function";
}

export async function saveRenderedWav(
  pcm: Float32Array | StereoPCM,
): Promise<string> {
  if (isStereoPCM(pcm)) {
    return saveRenderedWavStereo(pcm.left, pcm.right);
  }
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

function writeStereoWavBytes(left: Float32Array, right: Float32Array, sr: number): Uint8Array {
  const n = Math.min(left.length, right.length);
  const dataSize = n * 4;
  const buf = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buf);
  writeStr(v, 0, "RIFF");
  v.setUint32(4, 36 + dataSize, true);
  writeStr(v, 8, "WAVE");
  writeStr(v, 12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 2, true);
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * 4, true);
  v.setUint16(32, 4, true);
  v.setUint16(34, 16, true);
  writeStr(v, 36, "data");
  v.setUint32(40, dataSize, true);
  for (let i = 0; i < n; i++) {
    const l = Math.max(-1, Math.min(1, left[i]));
    const r = Math.max(-1, Math.min(1, right[i]));
    v.setInt16(44 + i * 4, l < 0 ? l * 32768 : l * 32767, true);
    v.setInt16(44 + i * 4 + 2, r < 0 ? r * 32768 : r * 32767, true);
  }
  return new Uint8Array(buf);
}

export function pcmToStereoBuffers(
  pcm: Float32Array,
  channel: SampleChannel,
): { left: Float32Array; right: Float32Array } {
  const zeros = new Float32Array(pcm.length);
  if (channel === "left") return { left: pcm, right: zeros };
  if (channel === "right") return { left: zeros, right: pcm };
  return { left: pcm, right: pcm };
}

export async function saveRenderedWavStereo(
  left: Float32Array,
  right: Float32Array,
  filename: string = "rendered_measure_stereo.wav",
): Promise<string> {
  const bytes = writeStereoWavBytes(left, right, RENDER_SR);
  if (Platform.OS === "web") {
    const blob = new Blob([bytes as BlobPart], { type: "audio/wav" });
    return URL.createObjectURL(blob);
  } else {
    const cacheDir = Paths.cache;
    const file = new File(cacheDir, filename);
    file.write(bytes);
    return file.uri;
  }
}

export async function saveStereoSampleWav(
  monoPcm: Float32Array,
  channel: "left" | "right",
  filename: string,
): Promise<string> {
  const { left, right } = pcmToStereoBuffers(monoPcm, channel);
  return saveRenderedWavStereo(left, right, filename);
}

let webClickBuffers: { strong: AudioBuffer; high: AudioBuffer; low: AudioBuffer } | null = null;

export function getWebAudioContext(): AudioContext | null {
  return getSharedAudioContext();
}

/**
 * Resolves a require() asset module to a fetchable URL on web.
 * In Expo web dev mode Asset.fromModule().uri is often an empty string because
 * the manifest2 devServerUrl path is not populated outside of Expo Go.
 * Metro in SDK 54 reliably serves assets via the unstable_path query API:
 *   /assets?unstable_path=assets%2Fsounds%2Fclick-strong.wav
 * We construct that URL from the asset's httpServerLocation / name / type metadata
 * as a fallback whenever uri is empty.
 */
export function resolveWebAssetUrl(src: number | string): string {
  if (typeof src === "string") return src;
  const asset = Asset.fromModule(src);
  if (asset.uri) return asset.uri;
  const loc: string = (asset as any).httpServerLocation || "";
  const name: string = (asset as any).name || "";
  const type: string = (asset as any).type || "";
  if (loc && name && type) {
    const relPath = `${loc.replace(/^\//, "")}/${name}.${type}`;
    return `/assets?unstable_path=${encodeURIComponent(relPath)}`;
  }
  return "";
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
      const url = resolveWebAssetUrl(src);
      if (!url) throw new Error("[WebAudio] Could not resolve URL for asset");
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`[WebAudio] HTTP ${resp.status} fetching ${url}`);
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
    logger.warn("[WebAudio] Failed to load click buffers:", e);
    return false;
  }
}

export function playWebClick(
  role: "strong" | "high" | "low",
  channel: MetroChannel = "both",
): boolean {
  if (channel === "off") return false;
  if (Platform.OS !== "web" || !webClickBuffers) return false;
  const ctx = getSharedAudioContext();
  if (!ctx) return false;
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
  const buffer = webClickBuffers[role];
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  if (channel !== "both" && hasStereoPanner(ctx)) {
    const panner = ctx.createStereoPanner();
    panner.pan.value = channel === "left" ? -1 : 1;
    source.connect(panner);
    panner.connect(ctx.destination);
  } else {
    source.connect(ctx.destination);
  }
  source.start(0);
  return true;
}

export function clearWebClickBuffers(): void {
  webClickBuffers = null;
}

const previewAudioCache = new Map<string, AudioBuffer>();

export async function previewClickOnWeb(
  soundSetKey: string,
  strongAsset: number | string,
): Promise<void> {
  if (Platform.OS !== "web") return;
  const ctx = getSharedAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    try { await ctx.resume(); } catch {}
  }
  let buf = previewAudioCache.get(soundSetKey);
  if (!buf) {
    try {
      const url = resolveWebAssetUrl(strongAsset);
      if (!url) return;
      const resp = await fetch(url);
      if (!resp.ok) return;
      const ab = await resp.arrayBuffer();
      buf = await ctx.decodeAudioData(ab.slice(0));
      previewAudioCache.set(soundSetKey, buf);
    } catch { return; }
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  src.start(0);
}

export function playWebRenderedLoop(
  pcm: Float32Array | StereoPCM,
  onEnded?: () => void,
  channel: SampleChannel = "both",
): { stop: () => void } {
  if (Platform.OS !== "web") return { stop: () => {} };
  const ctx = getSharedAudioContext();
  if (!ctx) return { stop: () => {} };
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }

  const stereo = isStereoPCM(pcm);
  let audioBuffer: AudioBuffer;
  if (stereo) {
    const n = Math.min(pcm.left.length, pcm.right.length);
    audioBuffer = ctx.createBuffer(2, n, RENDER_SR);
    audioBuffer.getChannelData(0).set(pcm.left.subarray(0, n));
    audioBuffer.getChannelData(1).set(pcm.right.subarray(0, n));
  } else {
    audioBuffer = ctx.createBuffer(1, pcm.length, RENDER_SR);
    audioBuffer.getChannelData(0).set(pcm);
  }

  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  source.loop = true;
  if (!stereo && channel !== "both" && hasStereoPanner(ctx)) {
    const panner = ctx.createStereoPanner();
    panner.pan.value = channel === "left" ? -1 : 1;
    source.connect(panner);
    panner.connect(ctx.destination);
  } else {
    source.connect(ctx.destination);
  }
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
