/**
 * 온디바이스 스템 분리 (Stem Separation) 모듈
 *
 * Demucs ONNX 모델을 사용해 오디오 파일을 개별 악기 트랙으로 분리합니다.
 * - htdemucs: 4-stem (vocals / drums / bass / other)
 * - htdemucs_6s: 6-stem (vocals / drums / bass / guitar / piano / other)
 *
 * 추론 환경 요구 사항:
 *   - onnxruntime-react-native 네이티브 모듈 (Expo Go 미지원, 커스텀 빌드 필요)
 *   - 모델 파일: <bundle>/models/htdemucs.ort 또는 htdemucs_6s.ort
 *
 * 실행 흐름:
 *   1. WAV/PCM 디코딩 → Float32 스테레오 PCM
 *   2. (선택) 노이즈 제거 ONNX 모델 적용
 *   3. Demucs ONNX 모델로 청크 단위 스템 분리
 *   4. 각 스템을 WAV 파일로 저장
 *   5. 드럼 스템 PCM에서 온디바이스 자기상관(autocorrelation)으로 BPM 분석
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import * as Crypto from "expo-crypto";
import { Platform } from "react-native";
import { notifyStorageError } from "./storage-notifier";
import { logger } from "./logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StemModel = "htdemucs" | "htdemucs_6s";

export interface StemSeparationConfig {
  model: StemModel;
  noiseRemoval: boolean;
}

export interface BpmSegment {
  startSec: number;
  endSec: number;
  bpm: number;
}

export interface StemTrack {
  name: string;
  uri: string;
  volume: number;
  isMuted: boolean;
  isSolo: boolean;
}

export interface StemResult {
  id: string;
  sourceUri: string;
  sourceName: string;
  model: StemModel;
  noiseRemoval: boolean;
  stems: StemTrack[];
  bpmMap: BpmSegment[];
  durationSec: number;
  createdAt: number;
}

export type SeparationProgress =
  | { phase: "decoding"; pct: number }
  | { phase: "denoising"; pct: number }
  | { phase: "separating"; pct: number; chunk: number; totalChunks: number }
  | { phase: "analyzing"; pct: number }
  | { phase: "done" };

export type SeparationError =
  | "unsupported_format"
  | "memory_pressure"
  /** Native ORT runtime module is missing (requires a custom build) */
  | "model_unavailable"
  /** ORT runtime is present but model .ort file was not found on device */
  | "model_not_found"
  | "inference_failed"
  | "file_read_error";

export interface SeparationResult {
  ok: true;
  result: StemResult;
}
export interface SeparationFailure {
  ok: false;
  error: SeparationError;
  message: string;
}

// ---------------------------------------------------------------------------
// ORT type definitions (onnxruntime-react-native shape)
// ---------------------------------------------------------------------------

interface OrtTensor {
  data: Float32Array;
  dims: readonly number[];
  type: string;
}
interface OrtSession {
  /** Input tensor names as exported from the model graph */
  inputNames: string[];
  /** Output tensor names as exported from the model graph */
  outputNames: string[];
  run(feeds: Record<string, OrtTensor>): Promise<Record<string, OrtTensor>>;
  release(): Promise<void>;
}
interface OrtLib {
  InferenceSession: {
    create(
      modelPathOrBuffer: string | ArrayBuffer,
      options?: { executionProviders?: string[]; graphOptimizationLevel?: string },
    ): Promise<OrtSession>;
  };
  Tensor: new (type: "float32", data: Float32Array, dims: [number, number, number]) => OrtTensor;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const STEM_LABELS_4: string[] = ["vocals", "drums", "bass", "other"];
export const STEM_LABELS_6: string[] = ["vocals", "drums", "bass", "guitar", "piano", "other"];

/** Demucs モデルのサンプルレート */
const DEMUCS_SAMPLE_RATE = 44100;
/** 청크당 초 (4초 = 176,400 샘플 × 2채널) */
const CHUNK_SECONDS = 4;
const CHUNK_SAMPLES = DEMUCS_SAMPLE_RATE * CHUNK_SECONDS;
/** 모델 파일 확장자 — ORT format for mobile */
const MODEL_EXT = ".ort";

export function getStemLabels(model: StemModel): string[] {
  return model === "htdemucs_6s" ? STEM_LABELS_6 : STEM_LABELS_4;
}

// ---------------------------------------------------------------------------
// AsyncStorage persistence
// ---------------------------------------------------------------------------

const STORAGE_KEY = "@stem_separation_results_v1";

function normalizeStemResult(raw: unknown): StemResult | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !r.id) return null;
  if (typeof r.sourceUri !== "string") return null;
  if (typeof r.sourceName !== "string") return null;
  if (r.model !== "htdemucs" && r.model !== "htdemucs_6s") return null;
  if (!Array.isArray(r.stems)) return null;
  const stems: StemTrack[] = r.stems.map((s: unknown): StemTrack => {
    const st = s as Record<string, unknown>;
    return {
      name: typeof st.name === "string" ? st.name : "track",
      uri: typeof st.uri === "string" ? st.uri : "",
      volume: typeof st.volume === "number" ? Math.max(0, Math.min(1, st.volume)) : 1.0,
      isMuted: !!st.isMuted,
      isSolo: !!st.isSolo,
    };
  });
  const bpmMap: BpmSegment[] = Array.isArray(r.bpmMap)
    ? (r.bpmMap as unknown[]).map((seg: unknown): BpmSegment => {
        const s = seg as Record<string, unknown>;
        return {
          startSec: typeof s.startSec === "number" ? s.startSec : 0,
          endSec: typeof s.endSec === "number" ? s.endSec : 0,
          bpm: typeof s.bpm === "number" ? s.bpm : 120,
        };
      })
    : [];
  return {
    id: r.id,
    sourceUri: r.sourceUri,
    sourceName: r.sourceName,
    model: r.model,
    noiseRemoval: !!r.noiseRemoval,
    stems,
    bpmMap,
    durationSec: typeof r.durationSec === "number" ? r.durationSec : 0,
    createdAt: typeof r.createdAt === "number" ? r.createdAt : 0,
  };
}

export async function loadStemResults(): Promise<StemResult[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeStemResult).filter((r): r is StemResult => r !== null);
  } catch (e) {
    notifyStorageError({ key: STORAGE_KEY, operation: "load", error: e });
    return [];
  }
}

export async function saveStemResults(results: StemResult[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(results));
  } catch (e) {
    notifyStorageError({ key: STORAGE_KEY, operation: "save", error: e });
  }
}

export async function deleteStemResult(id: string): Promise<void> {
  try {
    const existing = await loadStemResults();
    const target = existing.find((r) => r.id === id);
    if (target) {
      for (const stem of target.stems) {
        if (stem.uri && stem.uri.startsWith("file://")) {
          try { await FileSystem.deleteAsync(stem.uri, { idempotent: true }); } catch {}
        }
      }
      const stemDir = `${FileSystem.documentDirectory}stems/${id}/`;
      try { await FileSystem.deleteAsync(stemDir, { idempotent: true }); } catch {}
    }
    await saveStemResults(existing.filter((r) => r.id !== id));
  } catch (e) {
    logger.warn("[stemSep] deleteStemResult failed:", e);
  }
}

export async function upsertStemResult(result: StemResult): Promise<void> {
  try {
    const existing = await loadStemResults();
    const idx = existing.findIndex((r) => r.id === result.id);
    if (idx >= 0) {
      existing[idx] = result;
    } else {
      existing.unshift(result);
    }
    await saveStemResults(existing);
  } catch (e) {
    logger.warn("[stemSep] upsertStemResult failed:", e);
  }
}

// ---------------------------------------------------------------------------
// BPM map persistence
// ---------------------------------------------------------------------------

export async function saveBpmMapForStem(stemResultId: string, bpmMap: BpmSegment[]): Promise<void> {
  const key = `@stem_bpm_map_${stemResultId}`;
  try {
    await AsyncStorage.setItem(key, JSON.stringify(bpmMap));
  } catch (e) {
    notifyStorageError({ key, operation: "save", error: e });
  }
}

export async function loadBpmMapForStem(stemResultId: string): Promise<BpmSegment[] | null> {
  const key = `@stem_bpm_map_${stemResultId}`;
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed as BpmSegment[];
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Runtime detection
// ---------------------------------------------------------------------------

/**
 * onnxruntime-react-native 가용 여부를 확인합니다.
 * 커스텀 네이티브 빌드에서만 true를 반환합니다 (Expo Go 미지원).
 */
export function isOnnxRuntimeAvailable(): boolean {
  if (Platform.OS === "web") return false;
  try {
    // @ts-ignore — optional native module, not installed in Expo Go
    require("onnxruntime-react-native"); // eslint-disable-line @typescript-eslint/no-require-imports
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// WAV encoding helpers
// ---------------------------------------------------------------------------

/**
 * Float32 PCM 데이터를 16-bit PCM WAV 바이트 배열로 변환합니다.
 * @param pcm - 인터리빙된 스테레오 샘플 (L0,R0,L1,R1,…) 또는 모노 샘플
 * @param channels - 채널 수 (1 또는 2)
 * @param sampleRate - 샘플레이트 (기본 44100)
 */
export function encodeWav(pcm: Float32Array, channels: number, sampleRate: number): Uint8Array {
  const numSamples = pcm.length;
  const bitsPerSample = 16;
  const blockAlign = channels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * (bitsPerSample / 8);
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);         // PCM chunk size
  view.setUint16(20, 1, true);          // PCM = 1
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return new Uint8Array(buffer);
}

// ---------------------------------------------------------------------------
// Pure-JS base64 helpers (avoids atob/btoa RN runtime inconsistencies)
// ---------------------------------------------------------------------------

const B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B64_LOOKUP = new Uint8Array(256);
for (let i = 0; i < B64_CHARS.length; i++) B64_LOOKUP[B64_CHARS.charCodeAt(i)] = i;

/**
 * WAV Uint8Array → Base64 string without relying on btoa().
 * FileSystem.writeAsStringAsync(uri, base64, { encoding: Base64 }) 용.
 * Exported so tests can produce base64 that is guaranteed compatible with
 * base64ToArrayBuffer (same alphabet, no newlines).
 */
export function uint8ToBase64(bytes: Uint8Array): string {
  let out = "";
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < len ? bytes[i + 1] : 0;
    const b2 = i + 2 < len ? bytes[i + 2] : 0;
    out += B64_CHARS[b0 >> 2];
    out += B64_CHARS[((b0 & 3) << 4) | (b1 >> 4)];
    out += i + 1 < len ? B64_CHARS[((b1 & 15) << 2) | (b2 >> 6)] : "=";
    out += i + 2 < len ? B64_CHARS[b2 & 63] : "=";
  }
  return out;
}

/**
 * Base64 string → ArrayBuffer without relying on atob().
 * FileSystem.readAsStringAsync(..., { encoding: Base64 }) 결과 디코딩 용.
 */
export function base64ToArrayBuffer(b64: string): ArrayBuffer {
  // Strip whitespace and padding
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, "");
  const outputLen = Math.floor((clean.length * 3) / 4);
  const buf = new ArrayBuffer(outputLen);
  const view = new Uint8Array(buf);
  let outIdx = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = B64_LOOKUP[clean.charCodeAt(i)];
    const c1 = B64_LOOKUP[clean.charCodeAt(i + 1)];
    const c2 = B64_LOOKUP[clean.charCodeAt(i + 2)];
    const c3 = B64_LOOKUP[clean.charCodeAt(i + 3)];
    view[outIdx++] = (c0 << 2) | (c1 >> 4);
    if (i + 2 < clean.length) view[outIdx++] = ((c1 & 15) << 4) | (c2 >> 2);
    if (i + 3 < clean.length) view[outIdx++] = ((c2 & 3) << 6) | c3;
  }
  return buf;
}

// ---------------------------------------------------------------------------
// Audio decoding (WAV only — format is enforced at import time in the UI)
// ---------------------------------------------------------------------------

interface WavData {
  pcm: Float32Array;       // interleaved stereo
  channels: number;
  sampleRate: number;
  durationSec: number;
}

/**
 * WAV ファイルをデコードして Float32 PCM を返します。
 * 16/24/32-bit PCM と 32-bit float WAV に対応。
 * 非WAV形式はエラーをスローします (コンバートが必要)。
 */
function decodeWavBytes(bytes: ArrayBuffer): WavData {
  const view = new DataView(bytes);
  const readStr = (off: number, len: number) => {
    let s = "";
    for (let i = 0; i < len; i++) s += String.fromCharCode(view.getUint8(off + i));
    return s;
  };

  if (readStr(0, 4) !== "RIFF" || readStr(8, 4) !== "WAVE") {
    throw new Error("Not a valid WAV file");
  }

  let offset = 12;
  let audioFormat = 1;
  let channels = 1;
  let sampleRate = 44100;
  let bitsPerSample = 16;
  let dataOffset = 0;
  let dataSize = 0;

  while (offset < bytes.byteLength - 8) {
    const chunkId = readStr(offset, 4);
    const chunkSize = view.getUint32(offset + 4, true);
    if (chunkId === "fmt ") {
      audioFormat = view.getUint16(offset + 8, true);
      channels = view.getUint16(offset + 10, true);
      sampleRate = view.getUint32(offset + 12, true);
      bitsPerSample = view.getUint16(offset + 22, true);
    } else if (chunkId === "data") {
      dataOffset = offset + 8;
      dataSize = chunkSize;
      break;
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }

  if (dataOffset === 0) throw new Error("WAV data chunk not found");
  if (audioFormat !== 1 && audioFormat !== 3) {
    throw new Error(`Unsupported WAV audio format: ${audioFormat}`);
  }

  const bytesPerSample = bitsPerSample / 8;
  const numSamples = dataSize / bytesPerSample;
  const pcm = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const off = dataOffset + i * bytesPerSample;
    if (audioFormat === 3) {
      // 32-bit float
      pcm[i] = view.getFloat32(off, true);
    } else if (bitsPerSample === 16) {
      pcm[i] = view.getInt16(off, true) / 32768;
    } else if (bitsPerSample === 24) {
      const lo = view.getUint8(off);
      const mi = view.getUint8(off + 1);
      const hi = view.getInt8(off + 2);
      pcm[i] = ((hi << 16) | (mi << 8) | lo) / 8388608;
    } else if (bitsPerSample === 32) {
      pcm[i] = view.getInt32(off, true) / 2147483648;
    }
  }

  const durationSec = numSamples / channels / sampleRate;
  return { pcm, channels, sampleRate, durationSec };
}

/**
 * ステレオ Float32 PCM をリサンプリングします (線形補間)。
 * channels が 1 の場合はデュアルモノに変換します。
 */
function resampleToDemucsStereo(wav: WavData): Float32Array {
  const targetRate = DEMUCS_SAMPLE_RATE;
  const srcRate = wav.sampleRate;
  const srcChannels = wav.channels;
  const srcFrames = wav.pcm.length / srcChannels;
  const dstFrames = Math.round(srcFrames * (targetRate / srcRate));

  // Interleaved stereo output: [L0,R0,L1,R1,…]
  const out = new Float32Array(dstFrames * 2);
  const ratio = (srcFrames - 1) / Math.max(dstFrames - 1, 1);

  for (let i = 0; i < dstFrames; i++) {
    const srcIdx = i * ratio;
    const lo = Math.floor(srcIdx);
    const hi = Math.min(lo + 1, srcFrames - 1);
    const t = srcIdx - lo;

    if (srcChannels === 1) {
      const s = wav.pcm[lo] * (1 - t) + wav.pcm[hi] * t;
      out[i * 2] = s;
      out[i * 2 + 1] = s;
    } else {
      out[i * 2]     = wav.pcm[lo * 2]     * (1 - t) + wav.pcm[hi * 2]     * t;
      out[i * 2 + 1] = wav.pcm[lo * 2 + 1] * (1 - t) + wav.pcm[hi * 2 + 1] * t;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Core inference functions
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Model provisioning: document-directory cache + configurable CDN download
// ---------------------------------------------------------------------------

/**
 * CDN download URLs for on-device model provisioning.
 *
 * HOW TO CONFIGURE FOR PRODUCTION:
 *   1. Convert the Demucs PyTorch checkpoints to ORT format (see models/README.md).
 *   2. Host the .ort files on a CDN / object storage.
 *   3. Replace the empty strings below with the real HTTPS URLs.
 *
 * Models are downloaded once to `FileSystem.documentDirectory/models/` and
 * reused on subsequent runs.  The denoiser URL is optional — if empty, the
 * noise-removal pass is skipped (user is informed via UI).
 *
 * BUNDLED MODELS (alternative to download):
 *   If you want to ship models inside the app bundle (requires a custom build):
 *   1. Place the .ort files into the `models/` project directory.
 *   2. Add the filename to the `require` switch inside `_bundledAssetModule`.
 *   3. Rebuild — Metro will bundle them as binary assets (assetExts includes "ort").
 */
/**
 * CDN URLs for each model file.
 *
 * Values are initialised from `EXPO_PUBLIC_STEM_*` environment variables so
 * the operator can configure download locations at build time without editing
 * source code.  The variables are:
 *
 *   EXPO_PUBLIC_STEM_MODEL_URL_4S       — htdemucs.ort  (4-stem model, ~83 MB)
 *   EXPO_PUBLIC_STEM_MODEL_URL_6S       — htdemucs_6s.ort (6-stem model, ~83 MB)
 *   EXPO_PUBLIC_STEM_MODEL_URL_DENOISER — denoiser.ort  (optional, ~28 MB)
 *
 * If an env var is not set the corresponding entry is an empty string and the
 * model will be treated as unavailable.
 */
export const MODEL_DOWNLOAD_URLS: Record<string, string> = {
  "htdemucs.ort":    (typeof process !== "undefined" ? process.env?.EXPO_PUBLIC_STEM_MODEL_URL_4S       : undefined) ?? "",
  "htdemucs_6s.ort": (typeof process !== "undefined" ? process.env?.EXPO_PUBLIC_STEM_MODEL_URL_6S       : undefined) ?? "",
  "denoiser.ort":    (typeof process !== "undefined" ? process.env?.EXPO_PUBLIC_STEM_MODEL_URL_DENOISER : undefined) ?? "",
};

/**
 * Attempt to get a bundled asset module ID for models that are intentionally
 * included in the app bundle via `require(...)`.
 *
 * IMPORTANT: the switch cases below only return a value when the corresponding
 * .ort file physically exists in `models/` at Metro bundle time.  If the file
 * is absent, the `require` throws a module-not-found error at bundle time.
 * **Only add a case when you have the actual file in place.**
 *
 * Developers who have not yet added model files should leave this function as-is;
 * `resolveModelPath` will fall through to the download strategy automatically.
 */
function _bundledAssetModule(_filename: string): number | null {
  // Add require() cases here when you physically place model files in models/:
  //
  // switch (_filename) {
  //   case "htdemucs.ort":    return require("../models/htdemucs.ort") as number;
  //   case "htdemucs_6s.ort": return require("../models/htdemucs_6s.ort") as number;
  //   case "denoiser.ort":    return require("../models/denoiser.ort") as number;
  // }
  //
  // Until then, return null so the document-directory path is used instead.
  return null;
}

/**
 * Resolves a model file to a local filesystem path using two strategies:
 *
 *   1. Expo Asset — for models bundled with the app (see `_bundledAssetModule`).
 *   2. Documents cache + CDN download — for models provisioned at first run.
 *
 * Returns null when the model is unavailable; callers should return
 * `SeparationError.model_not_found` in that case.
 */
async function resolveModelPath(modelFilename: string): Promise<string | null> {
  // Strategy 1: bundled Expo Asset (requires physical file in models/)
  const assetId = _bundledAssetModule(modelFilename);
  if (assetId != null) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Asset } = require("expo-asset") as typeof import("expo-asset");
      const asset = Asset.fromModule(assetId);
      await asset.downloadAsync();
      if (asset.localUri) {
        logger.info(`[stemSep] model via bundle asset: ${asset.localUri}`);
        return asset.localUri;
      }
    } catch {
      // Asset extraction failed — fall through
    }
  }

  // Strategy 2a: previously cached in documents directory
  const modelsDir = `${FileSystem.documentDirectory ?? ""}models/`;
  const docPath = `${modelsDir}${modelFilename}`;
  try {
    const info = await FileSystem.getInfoAsync(docPath);
    if (info.exists && (info as { size?: number }).size && ((info as { size?: number }).size ?? 0) > 1024) {
      logger.info(`[stemSep] model from cache: ${docPath}`);
      return docPath;
    }
  } catch {}

  // Strategy 2b: first-run download from configured CDN URL
  const downloadUrl = MODEL_DOWNLOAD_URLS[modelFilename];
  if (downloadUrl) {
    try {
      logger.info(`[stemSep] downloading model ${modelFilename} from CDN…`);
      await FileSystem.makeDirectoryAsync(modelsDir, { intermediates: true });
      const result = await FileSystem.downloadAsync(downloadUrl, docPath);
      if (result.status === 200) {
        logger.info(`[stemSep] model cached: ${docPath}`);
        return docPath;
      }
      logger.warn(`[stemSep] CDN returned ${result.status} for ${modelFilename}`);
    } catch (e) {
      logger.warn(`[stemSep] model download failed for ${modelFilename}:`, e);
    }
  }

  logger.warn(`[stemSep] model unavailable: ${modelFilename} (set MODEL_DOWNLOAD_URLS or bundle the .ort file)`);
  return null;
}

/**
 * Returns true if a Demucs model is resolvable (cached on device or a CDN
 * URL is configured).  UI can use this to show a pre-flight warning before
 * the user starts separation.
 */
export async function isModelAvailable(model: StemModel): Promise<boolean> {
  const filename = model === "htdemucs_6s" ? "htdemucs_6s.ort" : "htdemucs.ort";
  const modelsDir = `${FileSystem.documentDirectory ?? ""}models/`;
  const docPath = `${modelsDir}${filename}`;
  try {
    const info = await FileSystem.getInfoAsync(docPath);
    if (info.exists && ((info as { size?: number }).size ?? 0) > 1024) return true;
  } catch {}
  return !!MODEL_DOWNLOAD_URLS[filename];
}

/**
 * Returns true when the denoiser model is usable — either cached on device
 * or a CDN URL is configured in `EXPO_PUBLIC_STEM_MODEL_URL_DENOISER`.
 * Used by the UI to decide whether to enable the noise-removal toggle.
 */
export async function isDenoiserProvisioned(): Promise<boolean> {
  const modelsDir = `${FileSystem.documentDirectory ?? ""}models/`;
  const docPath = `${modelsDir}denoiser.ort`;
  try {
    const info = await FileSystem.getInfoAsync(docPath);
    if (info.exists && ((info as { size?: number }).size ?? 0) > 1024) return true;
  } catch {}
  return !!MODEL_DOWNLOAD_URLS["denoiser.ort"];
}

// ---------------------------------------------------------------------------
// First-run model download
// ---------------------------------------------------------------------------

export interface ModelDownloadProgress {
  /** Which model file is currently being fetched */
  filename: string;
  /** 0-100 percentage across all required models combined */
  overallPct: number;
}

/**
 * Downloads all required model files that are not yet cached on device.
 *
 * This is the first-run provisioning step.  Call it from the UI once the user
 * has selected an audio file and confirmed they want to start separation.  The
 * progress callback fires as each model finishes downloading.
 *
 * Returns `true` when all required models are available after the call
 * (either already cached or successfully downloaded), `false` otherwise.
 *
 * Model URLs are taken from `MODEL_DOWNLOAD_URLS`, which is populated from
 * the `EXPO_PUBLIC_STEM_*` environment variables at build time.
 */
export async function downloadModels(
  model: StemModel,
  onProgress: (p: ModelDownloadProgress) => void,
  signal?: AbortSignal,
): Promise<boolean> {
  const modelFilename = model === "htdemucs_6s" ? "htdemucs_6s.ort" : "htdemucs.ort";
  const required = [modelFilename];
  let downloaded = 0;

  for (const filename of required) {
    if (signal?.aborted) return false;
    onProgress({ filename, overallPct: Math.round((downloaded / required.length) * 100) });

    // Already cached?
    const modelsDir = `${FileSystem.documentDirectory ?? ""}models/`;
    const docPath = `${modelsDir}${filename}`;
    try {
      const info = await FileSystem.getInfoAsync(docPath);
      if (info.exists && ((info as { size?: number }).size ?? 0) > 1024) {
        downloaded++;
        onProgress({ filename, overallPct: Math.round((downloaded / required.length) * 100) });
        continue;
      }
    } catch {}

    // Download from CDN
    const url = MODEL_DOWNLOAD_URLS[filename];
    if (!url) return false;

    try {
      await FileSystem.makeDirectoryAsync(modelsDir, { intermediates: true });
      const result = await FileSystem.downloadAsync(url, docPath);
      if (result.status !== 200) {
        logger.warn(`[stemSep] downloadModels: CDN ${result.status} for ${filename}`);
        return false;
      }
      logger.info(`[stemSep] downloadModels: cached ${filename}`);
    } catch (e) {
      logger.warn(`[stemSep] downloadModels: failed for ${filename}:`, e);
      return false;
    }
    downloaded++;
  }

  onProgress({ filename: modelFilename, overallPct: 100 });
  return true;
}

// ---------------------------------------------------------------------------
// Core inference functions
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Stereo layout helpers
// ---------------------------------------------------------------------------

/**
 * Interleaved [L0,R0,L1,R1,…] → planar [L0,L1,…,L_{n-1}, R0,R1,…,R_{n-1}]
 *
 * Demucs ORT models declare their tensor shape as [batch, channels, frames],
 * which is channel-first (planar) layout. resampleToDemucsStereo() produces
 * interleaved PCM, so we must convert before feeding the tensor.
 */
export function interleavedToPlanar(interleaved: Float32Array): Float32Array {
  const frames = interleaved.length >>> 1;
  const out = new Float32Array(interleaved.length);
  for (let i = 0; i < frames; i++) {
    out[i]          = interleaved[i * 2];       // L channel
    out[frames + i] = interleaved[i * 2 + 1];   // R channel
  }
  return out;
}

/**
 * Planar [L0,L1,…,L_{n-1}, R0,R1,…,R_{n-1}] → interleaved [L0,R0,L1,R1,…]
 *
 * ORT output tensors use the same channel-first planar layout. Convert back to
 * interleaved before writing WAV or passing to downstream consumers.
 */
export function planarToInterleaved(planar: Float32Array): Float32Array {
  const frames = planar.length >>> 1;
  const out = new Float32Array(planar.length);
  for (let i = 0; i < frames; i++) {
    out[i * 2]     = planar[i];           // L channel
    out[i * 2 + 1] = planar[frames + i];  // R channel
  }
  return out;
}

/**
 * 노이즈 제거 ONNX 모델을 실행합니다.
 * 모델 경로: models/denoiser.ort (Expo Asset 또는 bundle/documents 디렉터리)
 */
async function _runNoiseRemoval(
  ort: OrtLib,
  stereoFrames: Float32Array,
  onProgress: (p: SeparationProgress) => void,
  signal?: AbortSignal,
): Promise<Float32Array> {
  onProgress({ phase: "denoising", pct: 5 });

  const modelPath = await resolveModelPath(`denoiser${MODEL_EXT}`);
  if (!modelPath) {
    logger.warn("[stemSep] denoiser model not found, skipping noise removal");
    onProgress({ phase: "denoising", pct: 100 });
    return stereoFrames;
  }

  let session: OrtSession | null = null;
  try {
    session = await ort.InferenceSession.create(modelPath, {
      executionProviders: ["CoreML", "NNAPI", "cpu"],
      graphOptimizationLevel: "all",
    });
    if (signal?.aborted) return stereoFrames;

    onProgress({ phase: "denoising", pct: 40 });

    // Use the first declared input name (avoids hardcoding "mixture")
    const inputName = session.inputNames[0] ?? "mixture";
    // ORT shape [1, 2, frames] is channel-first (planar); convert from interleaved
    const planarInput = interleavedToPlanar(stereoFrames);
    const inputTensor = new ort.Tensor("float32", planarInput, [1, 2, stereoFrames.length / 2]);
    const results = await session.run({ [inputName]: inputTensor });

    if (signal?.aborted) return stereoFrames;
    onProgress({ phase: "denoising", pct: 95 });

    const outKey = Object.keys(results)[0];
    // Output is planar [1, 2, frames] → convert back to interleaved for downstream
    return outKey ? planarToInterleaved(results[outKey].data) : stereoFrames;
  } catch (e) {
    logger.warn("[stemSep] denoiser failed, skipping:", e);
    return stereoFrames;
  } finally {
    try { await session?.release(); } catch {}
    onProgress({ phase: "denoising", pct: 100 });
  }
}

/**
 * Demucs ONNX セッションを生成します (チャンクをまたいで再利用するために外部で管理します)。
 * Returns null when the model file cannot be located.
 */
async function _createDemucsSession(ort: OrtLib, model: StemModel): Promise<OrtSession | null> {
  const modelName = model === "htdemucs_6s" ? "htdemucs_6s" : "htdemucs";
  const modelPath = await resolveModelPath(`${modelName}${MODEL_EXT}`);
  if (!modelPath) return null;
  return ort.InferenceSession.create(modelPath, {
    executionProviders: ["CoreML", "NNAPI", "cpu"],
    graphOptimizationLevel: "all",
  });
}

/**
 * 단일 청크의 Demucs 추론을 실행합니다.
 *
 * Output mapping strategy:
 *   - If the session's outputNames match STEM_LABELS exactly → use name-based lookup.
 *   - Otherwise map by positional index (outputNames[i] → stemLabels[i]).
 *   This handles models that export a single multi-stem tensor named "output" as well
 *   as models that export per-stem tensors with canonical names.
 *
 * @param session    - Reusable InferenceSession
 * @param ort        - ORT library
 * @param chunkStereo - [L0,R0,L1,R1,…] interleaved stereo float32
 * @param stemLabels  - Ordered list of expected stem names for this model
 * @returns stem label → Float32Array (interleaved stereo)
 */
async function _runDemucsChunk(
  session: OrtSession,
  ort: OrtLib,
  chunkStereo: Float32Array,
  stemLabels: string[],
): Promise<Record<string, Float32Array>> {
  const frameSamples = chunkStereo.length / 2;

  // ORT tensor shape [1, 2, frames] is channel-first (planar).
  // chunkStereo is interleaved [L0,R0,L1,R1,…] → must convert to planar before inference.
  const planarInput = interleavedToPlanar(chunkStereo);

  // Use the model's first declared input name instead of hardcoding "mixture"
  const inputName = session.inputNames[0] ?? "mixture";
  const inputTensor = new ort.Tensor("float32", planarInput, [1, 2, frameSamples]);
  const rawResults = await session.run({ [inputName]: inputTensor });

  const output: Record<string, Float32Array> = {};

  // Check if output names match stem labels (ideal case)
  const outputNames = session.outputNames ?? Object.keys(rawResults);
  const nameLookupPossible = stemLabels.every((label) => label in rawResults);

  if (nameLookupPossible) {
    // Model exports per-stem outputs with canonical names (shape [1, 2, frames] each — planar).
    // Convert each stem's planar output to interleaved for WAV writing.
    for (const label of stemLabels) {
      output[label] = planarToInterleaved(rawResults[label].data);
    }
  } else {
    // Map positionally: outputNames[i] → stemLabels[i]
    // Handles single-output models (shape [1, nStems, 2, frames]) by splitting along stem dim,
    // and multi-output models with non-canonical names.
    const resultValues = outputNames.map((n) => rawResults[n]).filter(Boolean);
    if (resultValues.length === 1 && resultValues[0].dims.length === 4) {
      // Shape: [batch=1, nStems, channels=2, frames] — data is planar per stem.
      // Each stem slice is [L0,L1,…,R0,R1,…] → convert to interleaved.
      const tensor = resultValues[0];
      const [, nStems, channels, frames] = tensor.dims as [number, number, number, number];
      const stemFrames = channels * frames;
      for (let s = 0; s < Math.min(nStems, stemLabels.length); s++) {
        const planarSlice = tensor.data.subarray(s * stemFrames, (s + 1) * stemFrames);
        output[stemLabels[s]] = planarToInterleaved(new Float32Array(planarSlice));
      }
    } else {
      // Positional mapping — per-stem tensors (shape [1, 2, frames] each, planar).
      for (let i = 0; i < Math.min(resultValues.length, stemLabels.length); i++) {
        output[stemLabels[i]] = planarToInterleaved(resultValues[i].data);
      }
    }
  }

  return output;
}

// ---------------------------------------------------------------------------
// On-device BPM analysis (onset-energy autocorrelation)
// ---------------------------------------------------------------------------

/**
 * 드럼 스템 PCM에서 온디바이스 BPM을 분석합니다.
 *
 * 알고리즘:
 *   1. 512-샘플 프레임별 RMS 에너지 계산
 *   2. 1차 미분(onset strength) 계산
 *   3. 8초 윈도우 단위로 자기상관(autocorrelation)으로 지배 lag 검출
 *   4. lag → BPM 변환 후 BpmSegment 배열 반환
 *
 * 서버 전송 없음 — 전적으로 온디바이스에서 실행됩니다.
 */
function _analyzeOnDeviceBpm(
  drumPcm: Float32Array,
  sampleRate: number,
  durationSec: number,
): BpmSegment[] {
  const FRAME = 512;
  const WIN_SEC = 8;
  const WIN_FRAMES = Math.ceil(WIN_SEC * sampleRate / FRAME);

  // 1. Per-frame RMS energy
  const numFrames = Math.floor(drumPcm.length / FRAME);
  if (numFrames < 4) return [];

  const energy = new Float32Array(numFrames);
  for (let i = 0; i < numFrames; i++) {
    let sum = 0;
    const off = i * FRAME;
    for (let j = 0; j < FRAME; j++) {
      const v = drumPcm[off + j];
      sum += v * v;
    }
    energy[i] = Math.sqrt(sum / FRAME);
  }

  // 2. Half-wave rectified first-order difference (onset strength)
  const onset = new Float32Array(numFrames);
  for (let i = 1; i < numFrames; i++) {
    onset[i] = Math.max(0, energy[i] - energy[i - 1]);
  }

  // 3. BPM range 40–240 → lag bounds in frames
  const minBpm = 40, maxBpm = 240;
  const minLag = Math.max(1, Math.floor((60 * sampleRate) / (maxBpm * FRAME)));
  const maxLag = Math.ceil((60 * sampleRate) / (minBpm * FRAME));

  const segments: BpmSegment[] = [];
  let winStart = 0;

  while (winStart < numFrames) {
    const winEnd = Math.min(winStart + WIN_FRAMES, numFrames);
    const winLen = winEnd - winStart;
    if (winLen < minLag * 2) break;

    const effectiveMaxLag = Math.min(maxLag, winLen - 1);
    let bestLag = minLag;
    let bestCorr = -Infinity;

    for (let lag = minLag; lag <= effectiveMaxLag; lag++) {
      let corr = 0;
      for (let i = winStart; i < winEnd - lag; i++) {
        corr += onset[i] * onset[i + lag];
      }
      if (corr > bestCorr) {
        bestCorr = corr;
        bestLag = lag;
      }
    }

    const bpm = Math.round((60 * sampleRate) / (bestLag * FRAME));
    const clampedBpm = Math.max(20, Math.min(300, bpm));
    const startSec = (winStart * FRAME) / sampleRate;
    const endSec = Math.min((winEnd * FRAME) / sampleRate, durationSec);

    segments.push({ startSec, endSec, bpm: clampedBpm });
    winStart += WIN_FRAMES;
  }

  return segments;
}

// ---------------------------------------------------------------------------
// Stem directory helpers
// ---------------------------------------------------------------------------

async function getStemDirectory(resultId: string): Promise<string> {
  const dir = `${FileSystem.documentDirectory}stems/${resultId}/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  return dir;
}

/**
 * Float32 PCM をファイルに WAV として書き込みます。
 */
async function writeStemWav(uri: string, pcm: Float32Array, channels: number): Promise<void> {
  const wavBytes = encodeWav(pcm, channels, DEMUCS_SAMPLE_RATE);
  const base64 = uint8ToBase64(wavBytes);
  await FileSystem.writeAsStringAsync(uri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
}

// ---------------------------------------------------------------------------
// Public API: runStemSeparation
// ---------------------------------------------------------------------------

/**
 * 온디바이스 스템 분리를 실행합니다.
 *
 * @param sourceUri  분리할 오디오 파일 URI (file:// 스킴)
 * @param sourceName 표시용 파일명
 * @param config     모델 및 노이즈 제거 옵션
 * @param onProgress 진행 상황 콜백
 * @param signal     취소 시그널
 */
export async function runStemSeparation(
  sourceUri: string,
  sourceName: string,
  config: StemSeparationConfig,
  onProgress: (p: SeparationProgress) => void,
  signal?: AbortSignal,
): Promise<SeparationResult | SeparationFailure> {
  if (!isOnnxRuntimeAvailable()) {
    return {
      ok: false,
      error: "model_unavailable",
      message: "onnxruntime-react-native 네이티브 모듈이 없습니다. 커스텀 개발 클라이언트 빌드가 필요합니다.",
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ort = require("onnxruntime-react-native") as OrtLib;
  const resultId = Crypto.randomUUID();

  let demucsSession: OrtSession | null = null;

  try {
    // ── 1. Read source file ──────────────────────────────────────────────
    if (signal?.aborted) return { ok: false, error: "inference_failed", message: "Cancelled" };
    onProgress({ phase: "decoding", pct: 5 });

    const rawBase64 = await FileSystem.readAsStringAsync(sourceUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    onProgress({ phase: "decoding", pct: 20 });

    // ── 2. Decode audio to Float32 PCM ────────────────────────────────────
    // Pure-JS base64 decode (avoids atob() RN inconsistencies)
    const rawBytes = base64ToArrayBuffer(rawBase64);

    // WAV-only: stem separation decodes audio entirely on-device.
    // Non-WAV formats are rejected at the import UI; if a non-WAV somehow
    // arrives here we surface a clear, actionable error.
    let wav: WavData;
    try {
      wav = decodeWavBytes(rawBytes);
    } catch {
      const ext = sourceUri.split(".").pop()?.toLowerCase() ?? "unknown";
      return {
        ok: false,
        error: "unsupported_format",
        message: `"${ext}" 형식은 지원되지 않습니다. WAV 파일만 가져올 수 있습니다. (Only WAV files are supported for stem separation.)`,
      };
    }
    onProgress({ phase: "decoding", pct: 50 });

    // ── 3. Resample to 44100 Hz stereo ────────────────────────────────────
    let stereoFrames = resampleToDemucsStereo(wav);
    onProgress({ phase: "decoding", pct: 80 });

    if (signal?.aborted) return { ok: false, error: "inference_failed", message: "Cancelled" };

    // ── 4. Optional noise removal ─────────────────────────────────────────
    if (config.noiseRemoval) {
      stereoFrames = await _runNoiseRemoval(ort, stereoFrames, onProgress, signal);
      if (signal?.aborted) return { ok: false, error: "inference_failed", message: "Cancelled" };
    }

    // ── 5. Demucs chunked inference ───────────────────────────────────────
    const stemLabels = getStemLabels(config.model);
    const totalStereoFrames = stereoFrames.length / 2;
    const TOTAL_CHUNKS = Math.max(1, Math.ceil(totalStereoFrames / CHUNK_SAMPLES));

    // Accumulate per-stem PCM across chunks
    const stemPcm: Record<string, Float32Array[]> = {};
    for (const name of stemLabels) stemPcm[name] = [];

    demucsSession = await _createDemucsSession(ort, config.model);
    if (!demucsSession) {
      return {
        ok: false,
        error: "model_not_found",
        message: `Model "${config.model}.ort" not found. Add it to models/ or configure MODEL_DOWNLOAD_URLS in lib/stem-separation.ts.`,
      };
    }

    for (let chunkIdx = 0; chunkIdx < TOTAL_CHUNKS; chunkIdx++) {
      if (signal?.aborted) return { ok: false, error: "inference_failed", message: "Cancelled" };

      onProgress({
        phase: "separating",
        pct: Math.round((chunkIdx / TOTAL_CHUNKS) * 80),
        chunk: chunkIdx,
        totalChunks: TOTAL_CHUNKS,
      });

      const startFrame = chunkIdx * CHUNK_SAMPLES;
      const endFrame = Math.min(startFrame + CHUNK_SAMPLES, totalStereoFrames);
      const chunkLen = (endFrame - startFrame) * 2;

      // Pad last chunk to CHUNK_SAMPLES if needed
      const chunkStereo = new Float32Array(CHUNK_SAMPLES * 2);
      chunkStereo.set(stereoFrames.subarray(startFrame * 2, startFrame * 2 + chunkLen));

      // Pass stemLabels so the chunk runner can map outputs correctly
      const chunkResult = await _runDemucsChunk(demucsSession, ort, chunkStereo, stemLabels);

      for (const name of stemLabels) {
        const stemData = chunkResult[name];
        if (stemData) {
          // Trim padding from last chunk
          const actualLen = (endFrame - startFrame) * 2;
          stemPcm[name].push(stemData.subarray(0, actualLen));
        }
      }
    }

    await demucsSession.release();
    demucsSession = null;

    // ── 6. Assemble & write stem WAV files ────────────────────────────────
    if (signal?.aborted) return { ok: false, error: "inference_failed", message: "Cancelled" };
    onProgress({ phase: "analyzing", pct: 85 });

    const stemDir = await getStemDirectory(resultId);

    const stems: StemTrack[] = [];
    let drumPcm: Float32Array | null = null;

    for (const name of stemLabels) {
      const chunks = stemPcm[name];
      if (!chunks.length) continue;

      const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
      const assembled = new Float32Array(totalLen);
      let off = 0;
      for (const c of chunks) { assembled.set(c, off); off += c.length; }

      if (name === "drums") drumPcm = assembled;

      const uri = `${stemDir}${name}.wav`;
      await writeStemWav(uri, assembled, 2);
      stems.push({ name, uri, volume: 1.0, isMuted: false, isSolo: false });
    }

    // ── 7. On-device BPM analysis on drum stem (no server upload) ─────────
    onProgress({ phase: "analyzing", pct: 92 });
    const bpmMap: BpmSegment[] = drumPcm
      ? _analyzeOnDeviceBpm(drumPcm, DEMUCS_SAMPLE_RATE, wav.durationSec)
      : [];

    // ── 8. Persist result ─────────────────────────────────────────────────
    const result: StemResult = {
      id: resultId,
      sourceUri,
      sourceName,
      model: config.model,
      noiseRemoval: config.noiseRemoval,
      stems,
      bpmMap,
      durationSec: wav.durationSec,
      createdAt: Date.now(),
    };

    await upsertStemResult(result);
    if (bpmMap.length) await saveBpmMapForStem(resultId, bpmMap);

    onProgress({ phase: "done" });
    return { ok: true, result };

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.warn("[stemSep] inference error:", msg);
    if (msg.toLowerCase().includes("memory") || msg.toLowerCase().includes("oom")) {
      return { ok: false, error: "memory_pressure", message: msg };
    }
    if (msg.toLowerCase().includes("format") || msg.toLowerCase().includes("decode") || msg.toLowerCase().includes("unsupported")) {
      return { ok: false, error: "unsupported_format", message: msg };
    }
    return { ok: false, error: "inference_failed", message: msg };
  } finally {
    try { await demucsSession?.release(); } catch {}
  }
}
