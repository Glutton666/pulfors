export type ExportFormat = "wav" | "mp3";

interface LameMp3Encoder {
  encodeBuffer(left: Int16Array, right?: Int16Array): Uint8Array;
  flush(): Uint8Array;
}
interface LameModule {
  Mp3Encoder: new (channels: number, sampleRate: number, kbps: number) => LameMp3Encoder;
}

function isLameModule(v: unknown): v is LameModule {
  return typeof v === "object" && v !== null
    && typeof (v as { Mp3Encoder?: unknown }).Mp3Encoder === "function";
}

let lameCache: LameModule | null = null;
async function loadLame(): Promise<LameModule> {
  if (lameCache) return lameCache;
  // Use require() so that Jest's moduleNameMapper can intercept this module
  // in tests (dynamic import() is not intercepted by moduleNameMapper in CJS
  // Jest without --experimental-vm-modules). In the React Native bundle,
  // Metro/Expo treats require() just like import() for code splitting.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod: unknown = typeof require === "function"
    ? require("@breezystack/lamejs")
    : await import("@breezystack/lamejs");
  let lib: unknown = mod;
  if (!isLameModule(lib)) {
    const inner = (mod as { default?: unknown } | null)?.default;
    if (isLameModule(inner)) lib = inner;
  }
  if (!isLameModule(lib)) {
    throw new Error("LAME_MODULE_INVALID");
  }
  lameCache = lib;
  return lib;
}

const REPEATS_MIN = 1;
const REPEATS_MAX = 99;
const FADE_MIN = 0;
const FADE_MAX = 60;

export function clampRepeats(n: number): number {
  if (!Number.isFinite(n)) return REPEATS_MIN;
  return Math.max(REPEATS_MIN, Math.min(REPEATS_MAX, Math.floor(n)));
}

export function clampFadeOutSec(n: number): number {
  if (!Number.isFinite(n)) return FADE_MIN;
  return Math.max(FADE_MIN, Math.min(FADE_MAX, n));
}

export function repeatAndFadeMono(
  loop: Float32Array,
  repeats: number,
  fadeOutSec: number,
  sampleRate: number,
): Float32Array {
  const n = loop.length;
  const r = clampRepeats(repeats);
  const total = n * r;
  const out = new Float32Array(total);
  for (let i = 0; i < r; i++) out.set(loop, i * n);
  applyLinearFadeOut(out, fadeOutSec, sampleRate);
  return out;
}

export function repeatAndFadeStereo(
  loop: { left: Float32Array; right: Float32Array },
  repeats: number,
  fadeOutSec: number,
  sampleRate: number,
): { left: Float32Array; right: Float32Array } {
  return {
    left: repeatAndFadeMono(loop.left, repeats, fadeOutSec, sampleRate),
    right: repeatAndFadeMono(loop.right, repeats, fadeOutSec, sampleRate),
  };
}

export function applyLinearFadeOut(
  buf: Float32Array,
  fadeOutSec: number,
  sampleRate: number,
): void {
  const fadeSamples = Math.min(buf.length, Math.floor(clampFadeOutSec(fadeOutSec) * sampleRate));
  if (fadeSamples <= 0) return;
  const start = buf.length - fadeSamples;
  for (let i = 0; i < fadeSamples; i++) {
    const gain = 1 - i / fadeSamples;
    buf[start + i] *= gain;
  }
}

export function f32ToInt16(pcm: Float32Array): Int16Array {
  const out = new Int16Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

export async function encodeMp3Mono(pcm: Float32Array, sampleRate: number, kbps: number = 128): Promise<Uint8Array> {
  const lame = await loadLame();
  const enc = new lame.Mp3Encoder(1, sampleRate, kbps);
  const samples = f32ToInt16(pcm);
  const blockSize = 1152;
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < samples.length; i += blockSize) {
    const slice = samples.subarray(i, Math.min(i + blockSize, samples.length));
    const buf = enc.encodeBuffer(slice);
    if (buf.length > 0) chunks.push(buf);
  }
  const tail = enc.flush();
  if (tail.length > 0) chunks.push(tail);
  return concatU8(chunks);
}

export async function encodeMp3Stereo(
  pcm: { left: Float32Array; right: Float32Array },
  sampleRate: number,
  kbps: number = 192,
): Promise<Uint8Array> {
  const lame = await loadLame();
  const enc = new lame.Mp3Encoder(2, sampleRate, kbps);
  const L = f32ToInt16(pcm.left);
  const R = f32ToInt16(pcm.right);
  const n = Math.min(L.length, R.length);
  const blockSize = 1152;
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < n; i += blockSize) {
    const sliceL = L.subarray(i, Math.min(i + blockSize, n));
    const sliceR = R.subarray(i, Math.min(i + blockSize, n));
    const buf = enc.encodeBuffer(sliceL, sliceR);
    if (buf.length > 0) chunks.push(buf);
  }
  const tail = enc.flush();
  if (tail.length > 0) chunks.push(tail);
  return concatU8(chunks);
}

export function encodeWavStereoBytes(
  pcm: { left: Float32Array; right: Float32Array },
  sampleRate: number,
): Uint8Array {
  const n = Math.min(pcm.left.length, pcm.right.length);
  const dataSize = n * 4;
  const buf = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buf);
  const ws = (off: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };
  ws(0, "RIFF");
  v.setUint32(4, 36 + dataSize, true);
  ws(8, "WAVE");
  ws(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 2, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 4, true);
  v.setUint16(32, 4, true);
  v.setUint16(34, 16, true);
  ws(36, "data");
  v.setUint32(40, dataSize, true);
  const L = pcm.left;
  const R = pcm.right;
  for (let i = 0; i < n; i++) {
    const l = Math.max(-1, Math.min(1, L[i]));
    const r = Math.max(-1, Math.min(1, R[i]));
    v.setInt16(44 + i * 4, l < 0 ? l * 0x8000 : l * 0x7fff, true);
    v.setInt16(44 + i * 4 + 2, r < 0 ? r * 0x8000 : r * 0x7fff, true);
  }
  return new Uint8Array(buf);
}

/**
 * Compute fade gain for a sample at global index `g` in a buffer of `total`
 * samples with a fade region of `fadeSamples` at the end.
 * Inlined for hot-loop use.
 */
function fadeGain(g: number, fadeStart: number, fadeSamples: number): number {
  if (fadeSamples <= 0 || g < fadeStart) return 1.0;
  return 1.0 - (g - fadeStart) / fadeSamples;
}

/**
 * Chunked WAV encoder — repeats `loop` `repeats` times with linear fade-out,
 * writing directly into a pre-allocated Int16 output buffer.
 *
 * Peak memory: 44-byte header + totalSamples × 2 bytes (Int16 output only).
 * No full Float32 tiled buffer is ever allocated.
 */
export function encodeWavMonoChunked(
  loop: Float32Array,
  repeats: number,
  fadeOutSec: number,
  sampleRate: number,
): Uint8Array {
  const r = clampRepeats(repeats);
  const n = loop.length;
  const totalSamples = n * r;
  const dataSize = totalSamples * 2;
  const buf = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buf);
  const ws = (off: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };
  ws(0, "RIFF");
  v.setUint32(4, 36 + dataSize, true);
  ws(8, "WAVE");
  ws(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  ws(36, "data");
  v.setUint32(40, dataSize, true);

  const fadeSamples = Math.min(totalSamples, Math.floor(clampFadeOutSec(fadeOutSec) * sampleRate));
  const fadeStart = totalSamples - fadeSamples;

  let g = 0;
  for (let rep = 0; rep < r; rep++) {
    for (let i = 0; i < n; i++, g++) {
      const gain = fadeGain(g, fadeStart, fadeSamples);
      const s = Math.max(-1, Math.min(1, loop[i] * gain));
      v.setInt16(44 + g * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
  }

  return new Uint8Array(buf);
}

/**
 * Chunked MP3 encoder — repeats `loop` `repeats` times with linear fade-out,
 * feeding the LAME encoder block-by-block (1152 samples at a time).
 *
 * Peak memory: one loop Float32 buffer + one 1152-sample Int16 work buffer.
 * No full tiled Float32 or Int16 buffer is ever allocated.
 */
export async function encodeMp3MonoChunked(
  loop: Float32Array,
  repeats: number,
  fadeOutSec: number,
  sampleRate: number,
  kbps: number = 128,
): Promise<Uint8Array> {
  const lame = await loadLame();
  const enc = new lame.Mp3Encoder(1, sampleRate, kbps);
  const r = clampRepeats(repeats);
  const n = loop.length;
  const totalSamples = n * r;
  const fadeSamples = Math.min(totalSamples, Math.floor(clampFadeOutSec(fadeOutSec) * sampleRate));
  const fadeStart = totalSamples - fadeSamples;
  const blockSize = 1152;
  const work = new Int16Array(blockSize);
  const chunks: Uint8Array[] = [];

  let g = 0;
  let workLen = 0;

  function flush_work() {
    const slice = work.subarray(0, workLen);
    const out = enc.encodeBuffer(slice);
    if (out.length > 0) chunks.push(out);
    workLen = 0;
  }

  for (let rep = 0; rep < r; rep++) {
    for (let i = 0; i < n; i++, g++) {
      const gain = fadeGain(g, fadeStart, fadeSamples);
      const s = Math.max(-1, Math.min(1, loop[i] * gain));
      work[workLen++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      if (workLen === blockSize) flush_work();
    }
  }
  if (workLen > 0) flush_work();

  const tail = enc.flush();
  if (tail.length > 0) chunks.push(tail);
  return concatU8(chunks);
}

export function concatU8(chunks: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

export function safeFilename(label: string): string {
  return (label || "practice").replace(/[^a-zA-Z0-9가-힣_-]/g, "_").slice(0, 30);
}
