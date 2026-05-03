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
  const mod: unknown = await import("@breezystack/lamejs");
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
