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

/** Resamples PCM for ordinary speed playback: a higher speed shortens the clip
 * and raises pitch, matching expo-audio with pitch correction disabled. */
export function resampleForPlaybackSpeed(pcm: Float32Array, speed = 1): Float32Array {
  const clamped = Math.max(0.5, Math.min(2, speed));
  if (clamped === 1) return pcm;
  const len = Math.max(1, Math.floor(pcm.length / clamped));
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const pos = i * clamped;
    const low = Math.floor(pos);
    const fraction = pos - low;
    out[i] = low + 1 < pcm.length
      ? pcm[low] * (1 - fraction) + pcm[low + 1] * fraction
      : pcm[low] ?? 0;
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
  assetModule: number | string,
  signal?: AbortSignal,
): Promise<Float32Array> {
  if (signal?.aborted) throw new Error("RENDER_ABORTED");
  if (Platform.OS === "web") {
    const url = resolveWebAssetUrl(assetModule);
    if (!url) throw new Error("[AudioRenderer] Could not resolve URL for asset");
    const resp = await fetch(url, { signal });
    const ab = await resp.arrayBuffer();
    if (signal?.aborted) throw new Error("RENDER_ABORTED");
    try {
      const ctx = getSharedAudioContext();
      if (ctx) {
        const audioBuf = await ctx.decodeAudioData(ab.slice(0));
        if (signal?.aborted) throw new Error("RENDER_ABORTED");
        const pcm = audioBuf.getChannelData(0);
        return resample(new Float32Array(pcm), audioBuf.sampleRate, RENDER_SR);
      }
    } catch (error) {
      if (signal?.aborted || (error as Error)?.name === "AbortError") throw new Error("RENDER_ABORTED");
    }
    const { pcm, sampleRate } = parseWav(ab);
    return resample(pcm, sampleRate, RENDER_SR);
  } else {
    const asset = Asset.fromModule(assetModule as number);
    await asset.downloadAsync();
    if (signal?.aborted) throw new Error("RENDER_ABORTED");
    if (!asset.localUri) throw new Error("Failed to load asset");
    const file = new File(asset.localUri);
    const ab = await file.arrayBuffer();
    const { pcm, sampleRate } = parseWav(ab);
    return resample(pcm, sampleRate, RENDER_SR);
  }
}

export async function decodeSampleFile(
  uri: string,
  signal?: AbortSignal,
): Promise<Float32Array | null> {
  try {
    if (signal?.aborted) throw new Error("RENDER_ABORTED");
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
      const resp = await fetch(rawUri, { signal });
      const ab = await resp.arrayBuffer();
      if (signal?.aborted) throw new Error("RENDER_ABORTED");
      try {
        const ctx = getSharedAudioContext();
        if (ctx) {
          const audioBuf = await ctx.decodeAudioData(ab.slice(0));
          if (signal?.aborted) throw new Error("RENDER_ABORTED");
          const pcm = audioBuf.getChannelData(0);
          return resample(new Float32Array(pcm), audioBuf.sampleRate, RENDER_SR);
        }
      } catch (error) {
        if (signal?.aborted || (error as Error)?.name === "AbortError") throw new Error("RENDER_ABORTED");
      }
      const { pcm, sampleRate } = parseWav(ab);
      return resample(pcm, sampleRate, RENDER_SR);
    } else {
      const fileUri = rawUri.startsWith("file://") ? rawUri : "file://" + rawUri;
      try {
        // The native decoder operates entirely on-device and supports WAV, MP3,
        // FLAC/OGG/Opus plus AAC/M4A/MP4. It avoids the former server ffmpeg path.
        // Lazy require keeps Node-only render tests from evaluating the package's
        // ESM entry and keeps the web bundle on the browser decoder path.
        const { decodeAudioData: decodeNativeAudioData } = require("react-native-audio-api") as {
          decodeAudioData: (input: string, sampleRate?: number) => Promise<{
            getChannelData(channel: number): Float32Array;
          }>;
        };
        const audioBuffer = await decodeNativeAudioData(fileUri, RENDER_SR);
        if (signal?.aborted) throw new Error("RENDER_ABORTED");
        const pcm = audioBuffer.getChannelData(0);
        return new Float32Array(pcm);
      } catch {
        if (signal?.aborted) throw new Error("RENDER_ABORTED");
        logger.warn("[AudioRenderer] Unsupported local audio codec:", rawUri.slice(0, 80));
        return null;
      }
    }
  } catch (e) {
    if (signal?.aborted || (e as Error)?.name === "AbortError" || (e as Error)?.message === "RENDER_ABORTED") {
      throw new Error("RENDER_ABORTED");
    }
    logger.warn("[AudioRenderer] decode failed:", uri, e);
    return null;
  }
}

const activeRenderControllers = new WeakMap<object, AbortController>();

export function beginAbortableRender(owner: object): AbortSignal | undefined {
  activeRenderControllers.get(owner)?.abort();
  if (typeof AbortController === "undefined") return undefined;
  const controller = new AbortController();
  activeRenderControllers.set(owner, controller);
  return controller.signal;
}

export function abortActiveRender(owner: object): void {
  activeRenderControllers.get(owner)?.abort();
  activeRenderControllers.delete(owner);
}

export function finishAbortableRender(owner: object, signal?: AbortSignal): void {
  const current = activeRenderControllers.get(owner);
  if (current && current.signal === signal) activeRenderControllers.delete(owner);
}

export function isRenderAborted(error: unknown): boolean {
  return (error as Error)?.name === "AbortError"
    || (error as Error)?.message === "RENDER_ABORTED"
    || (error as Error)?.message === "EXPORT_ABORTED";
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
  vol: number,
  shouldAbort?: () => boolean,
) {
  const start = offset < 0 ? -offset : 0;
  const end = Math.min(src.length, dest.length - offset);
  for (let i = start; i < end; i++) {
    if ((i & 1023) === 0 && shouldAbort?.()) throw new Error("EXPORT_ABORTED");
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

export interface RenderMeasureParams {
  schedule: TickInfo[];
  measureDurationMs: number;
  clickPCMs: ClickPCMs;
  samplePCMs: Map<string, SamplePCMEntry>;
  clickVolume: number;
  sampleVolume: number;
  /** Per-sample gain values. Missing keys preserve the historic 100% level. */
  sampleVolumes?: Record<string, number>;
  /** Per-sample playback rates. Missing keys preserve original speed. */
  sampleSpeeds?: Record<string, number>;
  metronomeChannel?: SampleChannel;
  sampleChannels?: Record<string, SampleChannel>;
  layerClickPCMs?: Map<string, ClickPCMs>;
  metroChannelsByBeat?: Record<string, MetroChannel>;
  shouldAbort?: () => boolean;
}

export function renderMeasure(params: RenderMeasureParams): Float32Array | { left: Float32Array; right: Float32Array } {
  const {
    schedule,
    measureDurationMs,
    clickPCMs,
    samplePCMs,
    clickVolume,
    sampleVolume,
    sampleVolumes = {},
    sampleSpeeds = {},
    metronomeChannel = "both",
    sampleChannels = {},
    layerClickPCMs,
    metroChannelsByBeat,
    shouldAbort,
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
      mixInto(bufL, src, offset, vol, shouldAbort);
      mixInto(bufR, src, offset, vol, shouldAbort);
    } else if (channel === "left") {
      mixInto(bufL, src, offset, vol, shouldAbort);
    } else {
      mixInto(bufR, src, offset, vol, shouldAbort);
    }
  };

  const renderInto = (left: Float32Array, right: Float32Array | null) => {
    for (let copy = 0; copy < COPIES; copy++) {
      const copyOffset = copy * measureSamples;
      for (const tick of schedule) {
        if (shouldAbort?.()) throw new Error("EXPORT_ABORTED");
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
            mixInto(left, clickPCM, offsetSamples, clickVolume, shouldAbort);
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
          const speedAdjusted = resampleForPlaybackSpeed(trimmed, sampleSpeeds[key] ?? 1);
          if (right) {
            const ch = sampleChannels[key] ?? "both";
            mixToChannel(left, right, speedAdjusted, offsetSamples, sampleVolume * (sampleVolumes[key] ?? 1), ch);
          } else {
            mixInto(left, speedAdjusted, offsetSamples, sampleVolume * (sampleVolumes[key] ?? 1), shouldAbort);
          }
        }
      }
    }
  };

  const finalize = (buf: Float32Array): Float32Array => {
    for (let i = loopSamples; i < totalSamples; i++) {
      if ((i & 8191) === 0 && shouldAbort?.()) throw new Error("EXPORT_ABORTED");
      buf[i - loopSamples] += buf[i];
    }
    const out = buf.subarray(0, loopSamples);
    for (let i = 0; i < out.length; i++) {
      if ((i & 8191) === 0 && shouldAbort?.()) throw new Error("EXPORT_ABORTED");
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

async function renderYield(signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw new Error("EXPORT_ABORTED");
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  if (signal?.aborted) throw new Error("EXPORT_ABORTED");
}

async function mixIntoAbortable(
  dest: Float32Array,
  src: Float32Array,
  offset: number,
  vol: number,
  signal?: AbortSignal,
): Promise<void> {
  const start = offset < 0 ? -offset : 0;
  const end = Math.min(src.length, dest.length - offset);
  const chunkSize = 4096;
  for (let chunkStart = start; chunkStart < end; chunkStart += chunkSize) {
    const chunkEnd = Math.min(chunkStart + chunkSize, end);
    for (let i = chunkStart; i < chunkEnd; i++) {
      dest[offset + i] += src[i] * vol;
    }
    await renderYield(signal);
  }
}

/**
 * Cooperative export renderer. The interactive renderer stays synchronous for
 * normal playback; this variant yields between bounded audio chunks so export
 * cancellation can be observed while a large sample is being mixed.
 */
export async function renderMeasureAbortable(
  params: RenderMeasureParams,
  signal?: AbortSignal,
): Promise<Float32Array | { left: Float32Array; right: Float32Array }> {
  const {
    schedule,
    measureDurationMs,
    clickPCMs,
    samplePCMs,
    clickVolume,
    sampleVolume,
    sampleVolumes = {},
    sampleSpeeds = {},
    metronomeChannel = "both",
    sampleChannels = {},
    layerClickPCMs,
    metroChannelsByBeat,
  } = params;
  await renderYield(signal);
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

  const mixToChannel = async (
    left: Float32Array,
    right: Float32Array,
    src: Float32Array,
    offset: number,
    volume: number,
    channel: SampleChannel,
  ) => {
    if (channel === "both") {
      await mixIntoAbortable(left, src, offset, volume, signal);
      await mixIntoAbortable(right, src, offset, volume, signal);
    } else if (channel === "left") {
      await mixIntoAbortable(left, src, offset, volume, signal);
    } else {
      await mixIntoAbortable(right, src, offset, volume, signal);
    }
  };

  const renderInto = async (left: Float32Array, right: Float32Array | null) => {
    for (let copy = 0; copy < COPIES; copy++) {
      const copyOffset = copy * measureSamples;
      for (const tick of schedule) {
        await renderYield(signal);
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
          const clickPCM = tick.type === "strong"
            ? effectiveClickPCMs.strong
            : tick.type === "accent"
              ? effectiveClickPCMs.high
              : effectiveClickPCMs.low;
          if (right) {
            await mixToChannel(left, right, clickPCM, offsetSamples, clickVolume, effectiveMetroChannel as SampleChannel);
          } else {
            await mixIntoAbortable(left, clickPCM, offsetSamples, clickVolume, signal);
          }
        }
        if (tick.repeatIteration === 0 && tick.barRepeatIteration === 0 && samplePCMs.has(key)) {
          const sample = samplePCMs.get(key)!;
          const trimStart = Math.round((sample.trimStartMs / 1000) * RENDER_SR);
          const trimLen = sample.trimDurationMs > 0
            ? Math.round((sample.trimDurationMs / 1000) * RENDER_SR)
            : sample.pcm.length - trimStart;
          const trimmed = sample.pcm.subarray(trimStart, Math.min(trimStart + trimLen, sample.pcm.length));
          const speedAdjusted = resampleForPlaybackSpeed(trimmed, sampleSpeeds[key] ?? 1);
          if (right) {
            await mixToChannel(left, right, speedAdjusted, offsetSamples, sampleVolume * (sampleVolumes[key] ?? 1), sampleChannels[key] ?? "both");
          } else {
            await mixIntoAbortable(left, speedAdjusted, offsetSamples, sampleVolume * (sampleVolumes[key] ?? 1), signal);
          }
        }
      }
    }
  };

  const finalize = async (buffer: Float32Array): Promise<Float32Array> => {
    const chunkSize = 8192;
    for (let start = loopSamples; start < totalSamples; start += chunkSize) {
      const end = Math.min(start + chunkSize, totalSamples);
      for (let i = start; i < end; i++) buffer[i - loopSamples] += buffer[i];
      await renderYield(signal);
    }
    const out = buffer.subarray(0, loopSamples);
    for (let start = 0; start < out.length; start += chunkSize) {
      const end = Math.min(start + chunkSize, out.length);
      for (let i = start; i < end; i++) out[i] = Math.max(-1, Math.min(1, out[i]));
      await renderYield(signal);
    }
    return out;
  };

  if (!stereoMode) {
    const buffer = new Float32Array(totalSamples);
    await renderInto(buffer, null);
    return finalize(buffer);
  }
  const leftBuf = new Float32Array(totalSamples);
  const rightBuf = new Float32Array(totalSamples);
  await renderInto(leftBuf, rightBuf);
  return { left: await finalize(leftBuf), right: await finalize(rightBuf) };
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
let webClickBufferKey: string | null = null;
let webClickLoadGeneration = 0;

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

  const sources = [soundSet.strong, soundSet.high, soundSet.low];
  const urls = sources.map(resolveWebAssetUrl);
  const bufferKey = urls.join("\u0000");
  if (webClickBuffers && webClickBufferKey === bufferKey) return true;
  const generation = ++webClickLoadGeneration;

  try {
    const loadOne = async (url: string): Promise<AudioBuffer> => {
      if (!url) throw new Error("[WebAudio] Could not resolve URL for asset");
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`[WebAudio] HTTP ${resp.status} fetching ${url}`);
      const ab = await resp.arrayBuffer();
      return ctx.decodeAudioData(ab.slice(0));
    };
    const [strong, high, low] = await Promise.all([
      loadOne(urls[0]),
      loadOne(urls[1]),
      loadOne(urls[2]),
    ]);
    if (generation !== webClickLoadGeneration) return false;
    webClickBuffers = { strong, high, low };
    webClickBufferKey = bufferKey;
    return true;
  } catch (e) {
    logger.warn("[WebAudio] Failed to load click buffers:", e);
    return false;
  }
}

export interface ScheduledWebAudio {
  cancel: () => void;
  onEnded?: (listener: () => void) => void;
}

/**
 * Schedule a built-in click on the Web Audio clock.
 *
 * Unlike playWebClick, this function deliberately does not resume the
 * AudioContext. Callers should unlock audio from a user gesture before
 * scheduling. `when` is an AudioContext time, not a wall-clock timestamp.
 */
export function scheduleWebClickAt(
  role: "strong" | "high" | "low",
  channel: MetroChannel = "both",
  gain: number = 1.0,
  when?: number,
): ScheduledWebAudio | null {
  if (channel === "off" || Platform.OS !== "web" || !webClickBuffers) return null;
  const ctx = getSharedAudioContext();
  if (!ctx) return null;
  const buffer = webClickBuffers[role];
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gainNode = ctx.createGain();
  gainNode.gain.value = Math.max(0, Math.min(2, gain));
  source.connect(gainNode);
  if (channel !== "both" && hasStereoPanner(ctx)) {
    const panner = ctx.createStereoPanner();
    panner.pan.value = channel === "left" ? -1 : 1;
    gainNode.connect(panner);
    panner.connect(ctx.destination);
  } else {
    gainNode.connect(ctx.destination);
  }
  const startAt = Math.max(ctx.currentTime, when ?? ctx.currentTime);
  source.start(startAt);
  let cancelled = false;
  let endedListener: (() => void) | null = null;
  source.onended = () => {
    endedListener?.();
    try { source.disconnect(); } catch {}
    try { gainNode.disconnect(); } catch {}
  };
  return {
    cancel: () => {
      if (cancelled) return;
      cancelled = true;
      try { source.stop(); } catch {}
      try { source.disconnect(); } catch {}
      try { gainNode.disconnect(); } catch {}
    },
    onEnded: (listener) => { endedListener = listener; },
  };
}

export function playWebClick(
  role: "strong" | "high" | "low",
  channel: MetroChannel = "both",
  gain: number = 1.0,
): boolean {
  if (channel === "off") return false;
  if (Platform.OS !== "web" || !webClickBuffers) return false;
  const ctx = getSharedAudioContext();
  if (!ctx) return false;
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
  return scheduleWebClickAt(role, channel, gain, ctx.currentTime) !== null;
}

export function clearWebClickBuffers(): void {
  webClickLoadGeneration += 1;
  webClickBuffers = null;
  webClickBufferKey = null;
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

export interface WebRenderedLoop {
  stop: (atAudioTime?: number) => void;
  isRunning: () => boolean;
  setVolume?: (volume: number, atAudioTime?: number) => void;
  getStartTime?: () => number;
  getPositionSeconds?: () => number;
  getNextBoundaryTime?: () => number;
  getDurationSeconds?: () => number;
}

export function playWebRenderedLoop(
  pcm: Float32Array | StereoPCM,
  onEnded?: () => void,
  channel: SampleChannel = "both",
  volume: number = 1,
  startAtAudioTime?: number,
): WebRenderedLoop {
  const unavailable = {
    stop: () => {},
    isRunning: () => false,
    setVolume: () => {},
    getStartTime: () => 0,
    getPositionSeconds: () => 0,
    getNextBoundaryTime: () => 0,
    getDurationSeconds: () => 0,
  };
  if (Platform.OS !== "web") return unavailable;
  const ctx = getSharedAudioContext();
  if (!ctx) return unavailable;
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
  const gain = ctx.createGain();
  gain.gain.value = Math.max(0, Math.min(1, volume));
  if (!stereo && channel !== "both" && hasStereoPanner(ctx)) {
    const panner = ctx.createStereoPanner();
    panner.pan.value = channel === "left" ? -1 : 1;
    source.connect(panner);
    panner.connect(gain);
  } else {
    source.connect(gain);
  }
  gain.connect(ctx.destination);
  const startTime = Math.max(ctx.currentTime, startAtAudioTime ?? ctx.currentTime);
  const durationSeconds = audioBuffer.duration;
  source.start(startTime);

  let stopped = false;
  let ended = false;
  source.onended = () => {
    ended = true;
    if (!stopped) onEnded?.();
  };

  return {
    // A source scheduled on a running AudioContext is healthy while it waits
    // for its absolute start time; watchdogs must not treat that queueing as silence.
    isRunning: () => !stopped && !ended && ctx.state === "running",
    setVolume: (nextVolume, atAudioTime) => {
      const next = Math.max(0, Math.min(1, nextVolume));
      const at = Math.max(ctx.currentTime, atAudioTime ?? ctx.currentTime);
      if (typeof gain.gain.setValueAtTime === "function") gain.gain.setValueAtTime(next, at);
      else gain.gain.value = next;
    },
    getStartTime: () => startTime,
    getPositionSeconds: () => Math.max(0, ctx.currentTime - startTime),
    getDurationSeconds: () => durationSeconds,
    getNextBoundaryTime: () => {
      if (durationSeconds <= 0) return ctx.currentTime;
      const elapsed = Math.max(0, ctx.currentTime - startTime);
      return startTime + (Math.floor(elapsed / durationSeconds) + 1) * durationSeconds;
    },
    stop: (atAudioTime) => {
      stopped = true;
      const stopAt = Math.max(ctx.currentTime, atAudioTime ?? ctx.currentTime);
      try { source.stop(stopAt); } catch {}
      if (stopAt <= ctx.currentTime) {
        try { source.disconnect(); } catch {}
        try { gain.disconnect(); } catch {}
      }
    },
  };
}
