import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import type { PracticeEntry } from "../storage";
import type { ScoreDocument } from "../score-types";
import { logger } from "../logger";
import {
  normalizeMetroChannel,
  normalizeSampleChannel,
  type MetroChannel,
  type SampleChannel,
} from "../stereo-channel";
import { normalizeNoteImageCrop } from "../note-image-crop";

export const ALL_KEYS = [
  "metronome_settings",
  "metronome_fade_out",
  "metronome_control_pad_mapping_v1",
  "practice_book",
  "metronome_custom_sound_sets",
  "metronome_practice_rooms",
  "metronome_theme_color",
  "metronome_custom_hex",
  "metronome_hub_images",
  "metronome_language",
  "metronome_activity_log",
  "metronome_activity_settings",
  "metronome_goals",
  "@note_samples",
  "@note_sample_names",
  "@note_sample_sources",
  "@note_sample_channels",
  "@note_sample_volumes",
  "@note_sample_speeds",
  "@note_sample_metro_channels_beat",
  "metronome_onboarding_done",
  // 악보 모드 인덱스 (개별 악보는 SCORE_KEY_PREFIX + id 형태로 동적 관리)
  "metronome_scores_v1",
];

// 악보 개별 항목 키 접두사
export const SCORE_KEY_PREFIX = "metronome_score_";

// 복원 트랜잭션용 임시 스냅샷 키. restoreFromJson 시작 시 ALL_KEYS의 현재
// 값을 직렬화해 이 키에 저장하고, 정상 종료 시 삭제한다. 앱이 강제 종료되거나
// multiSet이 실패하면 이 키가 남아 부팅 시 자동 롤백된다.
export const RESTORE_SNAPSHOT_KEY = "metronome_restore_snapshot_v1";

export const SAMPLES_DIR = "note_samples/";
export const IMAGES_DIR = "note_images/";

export const MAX_IMPORT_JSON_CHARS = 100 * 1024 * 1024;
export const MAX_AUDIO_FILE_COUNT = 500;
export const MAX_AUDIO_FILE_B64_CHARS = 70 * 1024 * 1024;
export const MAX_IMAGE_FILE_COUNT = 100;
export const MAX_IMAGE_FILE_B64_CHARS = 20 * 1024 * 1024;
export const MAX_IMAGE_FILES_TOTAL_B64_CHARS = 60 * 1024 * 1024;
// 복원된 note sample 맵의 최대 항목 수. 초과 시 앱 기동마다 플레이어 생성
// 부담이 반복되는 지속적 서비스 거부를 방지한다.
export const MAX_NOTE_SAMPLES_PER_MAP = 200;
// 백업에서 복원하는 practice book 항목의 최대 수.
export const MAX_PRACTICE_BOOK_ENTRIES = 500;
// 단일 practice entry 의 noteQueueEntries / noteQueueEntryIds 최대 수.
// deep-link-import.ts 의 동일 상수와 값을 맞춘다.
export const MAX_QUEUE_ENTRIES = 500;
export const MAX_QUEUE_IDS = 500;
// noteQueueEntries 최대 재귀 깊이. deep-link-import.ts 의 MAX_DEPTH 와 동일.
export const MAX_ENTRY_DEPTH = 4;

export interface BackupFile {
  _meta: {
    app: string;
    version: number;
    createdAt: string;
    keyCount: number;
  };
  // 데이터 모양 버전.  `_meta.version`(파일 포맷)과 독립적으로 진화한다.
  // 누락 시 v0으로 간주해 마이그레이션을 거친다. 자세한 내용은
  // `./migrations.ts` 참고.
  schemaVersion?: number;
  data: Record<string, string | null>;
  audioFiles?: Record<string, string>;
  imageFiles?: Record<string, string>;
}

export interface PracticeShareFile {
  _meta: {
    app: string;
    type: "practice_entry";
    createdAt: string;
  };
  entry: PracticeEntry;
  audioFiles?: Record<string, string>;
  imageFiles?: Record<string, string>;
  /** 악보 모드 항목 전용: 연결된 ScoreDocument. 수신 기기에 악보가 없어도 복원할 수 있도록 포함한다. */
  scoreDoc?: ScoreDocument;
}

export function formatDateForFilename(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}${m}${day}_${h}${min}`;
}

export function writeStringToFile(fileUri: string, content: string): Promise<void> {
  return FileSystem.writeAsStringAsync(fileUri, content, {
    encoding: FileSystem.EncodingType.UTF8,
  });
}

export function readStringFromFile(fileUri: string): Promise<string> {
  return FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.UTF8,
  });
}

export function pickFileWeb<T>(
  accept: string,
  handler: (text: string) => Promise<T>,
  fallback: T,
): Promise<T> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    const onChange = async (evt: Event) => {
      const target = evt.target as HTMLInputElement;
      const file = target.files?.[0];
      if (!file) {
        resolve(fallback);
        return;
      }
      if (file.size > MAX_IMPORT_JSON_CHARS) {
        logger.warn("[Backup] Web import file too large:", file.size);
        resolve(fallback);
        return;
      }
      try {
        const text = await file.text();
        resolve(await handler(text));
      } catch {
        resolve(fallback);
      }
    };
    input.addEventListener("change", onChange);
    input.click();
  });
}

export function downloadJsonWeb(json: string, filename: string): void {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function extractBaseUri(uri: string): string {
  return uri.split("#")[0];
}

export function extractFragment(uri: string): string {
  const idx = uri.indexOf("#");
  return idx >= 0 ? uri.substring(idx) : "";
}

export function filenameFromUri(uri: string): string {
  const base = extractBaseUri(uri);
  const parts = base.split("/");
  return parts[parts.length - 1] || `sample_${Date.now()}`;
}

export function imageAssetKey(uri: string): string {
  const baseUri = extractBaseUri(uri);
  let hash = 2166136261;
  for (let i = 0; i < baseUri.length; i++) {
    hash ^= baseUri.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const dataMime = /^data:image\/(png|jpeg|gif|webp|heic|heif);base64,/i.exec(baseUri)?.[1];
  const filename = dataMime
    ? `inline.${dataMime.toLowerCase() === "jpeg" ? "jpg" : dataMime.toLowerCase()}`
    : filenameFromUri(baseUri);
  return `image_${(hash >>> 0).toString(36)}_${filename}`;
}

export function audioAssetKey(uri: string): string {
  const baseUri = extractBaseUri(uri);
  let hash = 2166136261;
  for (let i = 0; i < baseUri.length; i++) {
    hash ^= baseUri.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `audio_${(hash >>> 0).toString(36)}_${filenameFromUri(baseUri)}`;
}

export async function ensureSamplesDir(): Promise<string> {
  const dir = FileSystem.documentDirectory + SAMPLES_DIR;
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
  return dir;
}

export async function ensureImagesDir(): Promise<string> {
  const dir = FileSystem.documentDirectory + IMAGES_DIR;
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  return dir;
}

export async function readAudioAsBase64(uri: string): Promise<string | null> {
  if (Platform.OS === "web") return null;
  const baseUri = extractBaseUri(uri);
  if (!baseUri.startsWith("file://")) return null;
  try {
    const info = await FileSystem.getInfoAsync(baseUri);
    if (!info.exists) return null;
    return await FileSystem.readAsStringAsync(baseUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
  } catch (e) {
    logger.warn("[Backup] Failed to read audio file:", baseUri, e);
    return null;
  }
}

export async function readImageAsBase64(uri: string): Promise<string | null> {
  const baseUri = extractBaseUri(uri);
  if (baseUri.startsWith("data:image/")) {
    const marker = ";base64,";
    const index = baseUri.indexOf(marker);
    return index >= 0 ? baseUri.slice(index + marker.length) : null;
  }
  if (Platform.OS === "web" && baseUri.startsWith("blob:")) {
    try {
      const response = await fetch(baseUri);
      if (!response.ok) return null;
      const bytes = new Uint8Array(await response.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      }
      return btoa(binary);
    } catch (e) {
      logger.warn("[Backup] Failed to read blob image:", e);
      return null;
    }
  }
  return readAudioAsBase64(uri);
}

export function sanitizeAudioFilename(raw: string): string {
  const base = raw.replace(/\\/g, "/").split("/").pop() ?? "sample";
  const clean = base
    .replace(/[^a-zA-Z0-9가-힣._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._-]+/, "");
  const hasDot = clean.includes(".");
  const ext = hasDot ? clean.slice(clean.lastIndexOf(".")).toLowerCase() : ".bin";
  const stem = hasDot ? clean.slice(0, clean.lastIndexOf(".")) : clean;
  const safeStem = (stem || "sample").slice(0, 60);
  const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  return `${safeStem}_${suffix}${ext}`;
}

export function sanitizeNoteSampleUris(
  samples: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!samples) return samples;
  const safe: Record<string, string> = {};
  let accepted = 0;
  for (const [k, v] of Object.entries(samples)) {
    if (accepted >= MAX_NOTE_SAMPLES_PER_MAP) {
      logger.warn(`[Backup] Note sample map exceeds limit (${MAX_NOTE_SAMPLES_PER_MAP}), remaining entries dropped`);
      break;
    }
    if (typeof v !== "string") continue;
    const raw = v.split("#")[0];
    const isLocal =
      raw.startsWith("file://") ||
      raw.startsWith("asset://") ||
      raw.startsWith("blob:") ||
      raw.startsWith("data:");
    if (isLocal) {
      safe[k] = v;
      accepted++;
    } else {
      logger.warn("[Backup] Unsafe noteSample URI stripped at import:", k, raw.slice(0, 80));
    }
  }
  return safe;
}

/**
 * 이미지 URI 가 로컬 스킴(file://, asset://, blob:, data:)인지 확인한다.
 * 원격 URL(http, https 등)은 빈 문자열로 교체해 아웃바운드 요청을 차단한다.
 */
export function sanitizeImageUri(uri: unknown): string | undefined {
  if (typeof uri !== "string") return undefined;
  const raw = uri.split("#")[0];
  const isLocal =
    raw.startsWith("file://") ||
    raw.startsWith("asset://") ||
    raw.startsWith("blob:") ||
    raw.startsWith("data:");
  if (!isLocal) {
    logger.warn("[Backup] Unsafe image URI stripped at import:", raw.slice(0, 80));
    return undefined;
  }
  return uri;
}

export function sanitizeNoteSampleChannelMap(
  channels: Record<string, unknown> | undefined,
): Record<string, SampleChannel> | undefined {
  if (!channels) return channels;
  const out: Record<string, SampleChannel> = {};
  for (const [k, v] of Object.entries(channels)) {
    if (typeof k !== "string") continue;
    out[k] = normalizeSampleChannel(v);
  }
  return out;
}

export function sanitizeNoteSampleVolumeMap(
  volumes: Record<string, unknown> | undefined,
): Record<string, number> | undefined {
  if (!volumes) return volumes;
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(volumes)) {
    if (typeof value === "number" && Number.isFinite(value)) {
      out[key] = Math.max(0, Math.min(1, value));
    }
  }
  return out;
}

export function sanitizeNoteSampleSpeedMap(
  speeds: Record<string, unknown> | undefined,
): Record<string, number> | undefined {
  if (!speeds) return speeds;
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(speeds)) {
    if (typeof value === "number" && Number.isFinite(value)) {
      out[key] = Math.max(0.5, Math.min(2, value));
    }
  }
  return out;
}

export function sanitizeNoteSampleMetroChannelMap(
  channels: Record<string, unknown> | undefined,
): Record<string, MetroChannel> | undefined {
  if (!channels) return channels;
  const out: Record<string, MetroChannel> = {};
  for (const [key, value] of Object.entries(channels)) {
    out[key] = normalizeMetroChannel(value);
  }
  return out;
}

export function sanitizeCustomSoundSetsJson(json: string): string {
  try {
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return json;
    const sets = parsed as Record<string, unknown>;
    for (const setKey of Object.keys(sets)) {
      const set = sets[setKey];
      if (typeof set !== "object" || set === null || Array.isArray(set)) continue;
      const setObj = set as Record<string, unknown>;
      for (const role of ["strong", "accent", "normal"]) {
        const sample = setObj[role];
        if (typeof sample !== "object" || sample === null || Array.isArray(sample)) continue;
        const sampleObj = sample as Record<string, unknown>;
        if (typeof sampleObj.sampleUri === "string") {
          const raw = sampleObj.sampleUri.split("#")[0];
          const isLocal =
            raw.startsWith("file://") ||
            raw.startsWith("asset://") ||
            raw.startsWith("blob:") ||
            raw.startsWith("data:");
          if (!isLocal) {
            logger.warn(
              "[Backup] Unsafe customSoundSet sampleUri stripped:",
              setKey,
              role,
              raw.slice(0, 80),
            );
            delete sampleObj.sampleUri;
            delete sampleObj.sampleName;
            sampleObj.type = "builtin";
          }
        }
      }
    }
    return JSON.stringify(parsed);
  } catch {
    return json;
  }
}

/**
 * PracticeEntry 를 재귀적으로 sanitize 한다.
 *
 * `raw` 가 null / non-object / Array 이면 null 을 반환한다 (호출자가 필터).
 * 개별 하위 항목의 처리 오류는 그 항목만 드랍하고 나머지를 계속 진행한다.
 *
 * - imageUri: 로컬 스킴만 허용 (sanitizeImageUri)
 * - noteSamples / noteSampleChannels: 기존 헬퍼로 검증
 * - noteQueueEntries: MAX_QUEUE_ENTRIES 로 절단 후 재귀 처리
 *   depth >= MAX_ENTRY_DEPTH 에 도달하면 하위 noteQueueEntries 를 드랍해
 *   pathological 중첩 페이로드로 인한 지속적 DoS 를 방지한다.
 * - noteQueueEntryIds: MAX_QUEUE_IDS 로 절단
 */
export function sanitizePracticeEntry(raw: unknown, depth = 0): PracticeEntry | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    logger.warn("[Backup] sanitizePracticeEntry: null/non-object input, dropping entry");
    return null;
  }
  const entry = raw as PracticeEntry;

  let queueEntries: PracticeEntry[] | undefined;
  if (Array.isArray(entry.noteQueueEntries)) {
    if (depth >= MAX_ENTRY_DEPTH) {
      logger.warn(`[Backup] noteQueueEntries 재귀 깊이 초과 (${MAX_ENTRY_DEPTH}), 하위 항목 드랍`);
      queueEntries = undefined;
    } else {
      let raw_queue = entry.noteQueueEntries;
      if (raw_queue.length > MAX_QUEUE_ENTRIES) {
        logger.warn(`[Backup] noteQueueEntries too large (${raw_queue.length}), truncating to ${MAX_QUEUE_ENTRIES}`);
        raw_queue = raw_queue.slice(0, MAX_QUEUE_ENTRIES);
      }
      queueEntries = raw_queue
        .map((qe) => { try { return sanitizePracticeEntry(qe, depth + 1); } catch { return null; } })
        .filter((qe): qe is PracticeEntry => qe !== null);
    }
  }

  let queueEntryIds = entry.noteQueueEntryIds;
  if (Array.isArray(queueEntryIds) && queueEntryIds.length > MAX_QUEUE_IDS) {
    logger.warn(`[Backup] noteQueueEntryIds too large (${queueEntryIds.length}), truncating to ${MAX_QUEUE_IDS}`);
    queueEntryIds = queueEntryIds.slice(0, MAX_QUEUE_IDS);
  }

  return {
    ...entry,
    noteSamples: sanitizeNoteSampleUris(entry.noteSamples),
    noteSampleChannels: sanitizeNoteSampleChannelMap(entry.noteSampleChannels),
    noteSampleVolumes: sanitizeNoteSampleVolumeMap(entry.noteSampleVolumes),
    noteSampleSpeeds: sanitizeNoteSampleSpeedMap(entry.noteSampleSpeeds),
    imageUri: sanitizeImageUri(entry.imageUri),
    imageCrop: sanitizeImageUri(entry.imageUri)
      ? normalizeNoteImageCrop(entry.imageCrop)
      : undefined,
    noteQueueEntries: queueEntries,
    noteQueueEntryIds: queueEntryIds,
  };
}

export function sanitizeBackupData(
  data: Record<string, string | null>,
): Record<string, string | null> {
  const result = { ...data };

  if (result["metronome_custom_sound_sets"]) {
    result["metronome_custom_sound_sets"] = sanitizeCustomSoundSetsJson(
      result["metronome_custom_sound_sets"]!,
    );
  }

  if (result["@note_samples"]) {
    try {
      const samples: Record<string, string> = JSON.parse(result["@note_samples"]!);
      result["@note_samples"] = JSON.stringify(sanitizeNoteSampleUris(samples) ?? {});
    } catch {}
  }

  if (result["@note_sample_channels"]) {
    try {
      const channels: Record<string, unknown> = JSON.parse(result["@note_sample_channels"]!);
      result["@note_sample_channels"] = JSON.stringify(
        sanitizeNoteSampleChannelMap(channels) ?? {},
      );
    } catch {}
  }

  if (result["@note_sample_volumes"]) {
    try {
      const volumes: Record<string, unknown> = JSON.parse(result["@note_sample_volumes"]!);
      result["@note_sample_volumes"] = JSON.stringify(sanitizeNoteSampleVolumeMap(volumes) ?? {});
    } catch {}
  }

  if (result["@note_sample_speeds"]) {
    try {
      const speeds: Record<string, unknown> = JSON.parse(result["@note_sample_speeds"]!);
      result["@note_sample_speeds"] = JSON.stringify(sanitizeNoteSampleSpeedMap(speeds) ?? {});
    } catch {}
  }

  if (result["@note_sample_metro_channels_beat"]) {
    try {
      const channels: Record<string, unknown> = JSON.parse(result["@note_sample_metro_channels_beat"]!);
      result["@note_sample_metro_channels_beat"] = JSON.stringify(
        sanitizeNoteSampleMetroChannelMap(channels) ?? {},
      );
    } catch {}
  }

  if (result["metronome_hub_images"] !== undefined) {
    let safeImages: unknown[] = [];
    try {
      const parsed: unknown = JSON.parse(result["metronome_hub_images"] ?? "[]");
      if (!Array.isArray(parsed)) {
        logger.warn("[Backup] metronome_hub_images is not an array, resetting to []");
      } else {
        safeImages = parsed.map((img) => {
          if (typeof img !== "object" || img === null) return img;
          const o = img as Record<string, unknown>;
          const safeUri = sanitizeImageUri(o.uri);
          return { ...o, uri: safeUri ?? "" };
        });
      }
    } catch (err) {
      logger.warn("[Backup] metronome_hub_images JSON parse failed, resetting to []:", err);
    }
    result["metronome_hub_images"] = JSON.stringify(safeImages);
  }

  if (result["practice_book"] !== undefined) {
    let safe: PracticeEntry[] = [];
    try {
      const parsed: unknown = JSON.parse(result["practice_book"] ?? "[]");
      if (!Array.isArray(parsed)) {
        logger.warn("[Backup] practice_book is not an array, resetting to []");
      } else {
        let entries = parsed as unknown[];
        if (entries.length > MAX_PRACTICE_BOOK_ENTRIES) {
          logger.warn(`[Backup] Practice book too large (${entries.length}), truncating to ${MAX_PRACTICE_BOOK_ENTRIES}`);
          entries = entries.slice(0, MAX_PRACTICE_BOOK_ENTRIES);
        }
        for (const e of entries) {
          try {
            const sanitized = sanitizePracticeEntry(e);
            if (sanitized !== null) safe.push(sanitized);
          } catch (err) {
            logger.warn("[Backup] practice_book entry sanitization failed, dropping entry:", err);
          }
        }
      }
    } catch (err) {
      logger.warn("[Backup] practice_book JSON parse failed, resetting to []:", err);
    }
    result["practice_book"] = JSON.stringify(safe);
  }

  return result;
}

export async function writeAudioFromBase64(filename: string, base64: string): Promise<string> {
  const dir = await ensureSamplesDir();
  const safe = sanitizeAudioFilename(filename);
  const fileUri = dir + safe;
  await FileSystem.writeAsStringAsync(fileUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return fileUri;
}

function decodeImageBase64(base64: string): Uint8Array | null {
  if (base64.length === 0 || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) return null;
  try {
    const decoded = atob(base64);
    return Uint8Array.from(decoded, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

function detectImageExtension(base64: string): string | null {
  const b = decodeImageBase64(base64);
  if (!b || b.length < 12) return null;
  if (
    b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff &&
    b[b.length - 2] === 0xff && b[b.length - 1] === 0xd9
  ) return "jpg";
  const pngHeader = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const pngEnd = [0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];
  if (
    b.length >= 24 &&
    pngHeader.every((v, i) => b[i] === v) &&
    pngEnd.every((v, i) => b[b.length - pngEnd.length + i] === v)
  ) return "png";
  const gifHeader = String.fromCharCode(...b.slice(0, 6));
  if ((gifHeader === "GIF87a" || gifHeader === "GIF89a") && b[b.length - 1] === 0x3b) return "gif";
  if (
    String.fromCharCode(...b.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...b.slice(8, 12)) === "WEBP"
  ) {
    const declaredSize = b[4] | (b[5] << 8) | (b[6] << 16) | (b[7] << 24);
    if (declaredSize + 8 === b.length) return "webp";
  }
  if (b.length >= 16 && String.fromCharCode(...b.slice(4, 8)) === "ftyp") return "heic";
  return null;
}

export async function writeImageFromBase64(filename: string, base64: string): Promise<string> {
  const dir = await ensureImagesDir();
  const safe = sanitizeAudioFilename(filename);
  const fileUri = dir + safe;
  await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
  return fileUri;
}

export function collectUrisFromSampleMap(
  samples: Record<string, string> | undefined,
): Map<string, string> {
  const uris = new Map<string, string>();
  if (!samples) return uris;
  for (const uri of Object.values(samples)) {
    if (uri) {
      uris.set(audioAssetKey(uri), extractBaseUri(uri));
    }
  }
  return uris;
}

export function collectAudioUrisFromEntry(
  entry: PracticeEntry,
  uris: Map<string, string> = new Map(),
): Map<string, string> {
  for (const [key, uri] of collectUrisFromSampleMap(entry.noteSamples)) {
    uris.set(key, uri);
  }
  for (const child of entry.noteQueueEntries ?? []) {
    collectAudioUrisFromEntry(child, uris);
  }
  return uris;
}

export function collectAllAudioUris(
  data: Record<string, string | null>,
): Map<string, string> {
  const uris = new Map<string, string>();

  const samplesJson = data["@note_samples"];
  if (samplesJson) {
    try {
      const samples: Record<string, string> = JSON.parse(samplesJson);
      for (const [, uri] of Object.entries(samples)) {
        if (uri) {
          uris.set(audioAssetKey(uri), extractBaseUri(uri));
        }
      }
    } catch {}
  }

  const bookJson = data["practice_book"];
  if (bookJson) {
    try {
      const entries: PracticeEntry[] = JSON.parse(bookJson);
      for (const entry of entries) {
        collectAudioUrisFromEntry(entry, uris);
      }
    } catch {}
  }

  return uris;
}

function collectEntryImageUris(entry: PracticeEntry, uris: Map<string, string>): void {
  if (entry.imageUri) uris.set(imageAssetKey(entry.imageUri), extractBaseUri(entry.imageUri));
  for (const child of entry.noteQueueEntries ?? []) collectEntryImageUris(child, uris);
}

export function collectImageUrisFromEntry(entry: PracticeEntry): Map<string, string> {
  const uris = new Map<string, string>();
  collectEntryImageUris(entry, uris);
  return uris;
}

export function collectAllImageUris(data: Record<string, string | null>): Map<string, string> {
  const uris = new Map<string, string>();
  try {
    const images: unknown = JSON.parse(data["metronome_hub_images"] ?? "[]");
    if (Array.isArray(images)) {
      for (const image of images) {
        const uri = image && typeof image === "object" ? (image as { uri?: unknown }).uri : undefined;
        if (typeof uri === "string") uris.set(imageAssetKey(uri), extractBaseUri(uri));
      }
    }
  } catch {}
  try {
    const entries: unknown = JSON.parse(data["practice_book"] ?? "[]");
    if (Array.isArray(entries)) {
      for (const entry of entries) {
        if (entry && typeof entry === "object") collectEntryImageUris(entry as PracticeEntry, uris);
      }
    }
  } catch {}
  return uris;
}

export async function readAllAudioFiles(
  uris: Map<string, string>,
): Promise<Record<string, string>> {
  const audioFiles: Record<string, string> = {};
  for (const [fname, baseUri] of uris) {
    const base64 = await readAudioAsBase64(baseUri);
    if (base64) {
      audioFiles[fname] = base64;
    }
  }
  return audioFiles;
}

export async function readAllImageFiles(uris: Map<string, string>): Promise<Record<string, string>> {
  const imageFiles: Record<string, string> = {};
  let total = 0;
  for (const [fname, baseUri] of uris) {
    if (Object.keys(imageFiles).length >= MAX_IMAGE_FILE_COUNT) break;
    const base64 = await readImageAsBase64(baseUri);
    if (
      base64 &&
      base64.length <= MAX_IMAGE_FILE_B64_CHARS &&
      total + base64.length <= MAX_IMAGE_FILES_TOTAL_B64_CHARS &&
      detectImageExtension(base64) !== null
    ) {
      imageFiles[fname] = base64;
      total += base64.length;
    }
  }
  return imageFiles;
}

export function remapUri(oldUri: string, uriMapping: Map<string, string>): string {
  const fname = filenameFromUri(oldUri);
  const newBase = uriMapping.get(audioAssetKey(oldUri)) ?? uriMapping.get(fname);
  if (newBase) {
    return newBase + extractFragment(oldUri);
  }
  return oldUri;
}

export function remapSampleMap(
  samples: Record<string, string>,
  uriMapping: Map<string, string>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, uri] of Object.entries(samples)) {
    result[key] = remapUri(uri, uriMapping);
  }
  return result;
}

export function remapEntryAudioUris(
  entry: PracticeEntry,
  uriMapping: Map<string, string>,
): PracticeEntry {
  return {
    ...entry,
    noteSamples: entry.noteSamples
      ? remapSampleMap(entry.noteSamples, uriMapping)
      : entry.noteSamples,
    noteQueueEntries: entry.noteQueueEntries?.map((child) =>
      remapEntryAudioUris(child, uriMapping),
    ),
  };
}

export async function restoreAudioFiles(
  audioFiles: Record<string, string>,
): Promise<Map<string, string>> {
  const uriMapping = new Map<string, string>();
  const entries = Object.entries(audioFiles);
  if (entries.length > MAX_AUDIO_FILE_COUNT) {
    logger.warn("[Backup] Audio file count exceeds limit:", entries.length);
    return uriMapping;
  }
  for (const [fname, base64] of entries) {
    if (typeof base64 !== "string" || base64.length > MAX_AUDIO_FILE_B64_CHARS) {
      logger.warn("[Backup] Audio file too large, skipping:", fname, base64?.length);
      continue;
    }
    try {
      const newUri = await writeAudioFromBase64(fname, base64);
      uriMapping.set(fname, newUri);
    } catch (e) {
      logger.warn("[Backup] Failed to restore audio file:", fname, e);
    }
  }
  return uriMapping;
}

export async function restoreImageFiles(
  imageFiles: Record<string, string>,
): Promise<Map<string, string>> {
  const uriMapping = new Map<string, string>();
  const entries = Object.entries(imageFiles);
  if (entries.length > MAX_IMAGE_FILE_COUNT) {
    logger.warn("[Backup] Image file count exceeds limit:", entries.length);
    return uriMapping;
  }
  let total = 0;
  for (const [fname, base64] of entries) {
    if (
      typeof base64 !== "string" ||
      base64.length > MAX_IMAGE_FILE_B64_CHARS ||
      total + base64.length > MAX_IMAGE_FILES_TOTAL_B64_CHARS ||
      !detectImageExtension(base64)
    ) {
      logger.warn("[Backup] Invalid or oversized image, skipping:", fname);
      continue;
    }
    try {
      const ext = detectImageExtension(base64)!;
      const mime = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
      const newUri = Platform.OS === "web"
        ? `data:${mime};base64,${base64}`
        : await writeImageFromBase64(`${fname.replace(/\.[^.]+$/, "")}.${ext}`, base64);
      uriMapping.set(fname, newUri);
      total += base64.length;
    } catch (e) {
      logger.warn("[Backup] Failed to restore image file:", fname, e);
    }
  }
  return uriMapping;
}

export function remapEntryImageUris(entry: PracticeEntry, uriMapping: Map<string, string>): PracticeEntry {
  return {
    ...entry,
    imageUri: entry.imageUri ? remapImageUri(entry.imageUri, uriMapping) : entry.imageUri,
    noteQueueEntries: entry.noteQueueEntries?.map((child) => remapEntryImageUris(child, uriMapping)),
  };
}

function remapImageUri(oldUri: string, uriMapping: Map<string, string>): string {
  // filename fallback keeps compatibility with early/hand-authored imageFiles maps.
  const newBase = uriMapping.get(imageAssetKey(oldUri)) ?? uriMapping.get(filenameFromUri(oldUri));
  return newBase ? newBase + extractFragment(oldUri) : oldUri;
}

export function remapDataImageUris(
  data: Record<string, string | null>,
  uriMapping: Map<string, string>,
): Record<string, string | null> {
  const result = { ...data };
  try {
    const entries: PracticeEntry[] = JSON.parse(result["practice_book"] ?? "[]");
    result["practice_book"] = JSON.stringify(entries.map((entry) => remapEntryImageUris(entry, uriMapping)));
  } catch {}
  try {
    const images: Array<Record<string, unknown>> = JSON.parse(result["metronome_hub_images"] ?? "[]");
    result["metronome_hub_images"] = JSON.stringify(images.map((image) => ({
      ...image,
      uri: typeof image.uri === "string" ? remapImageUri(image.uri, uriMapping) : image.uri,
    })));
  } catch {}
  return result;
}

export function remapDataUris(
  data: Record<string, string | null>,
  uriMapping: Map<string, string>,
): Record<string, string | null> {
  const result = { ...data };

  if (result["@note_samples"]) {
    try {
      const samples: Record<string, string> = JSON.parse(result["@note_samples"]!);
      result["@note_samples"] = JSON.stringify(remapSampleMap(samples, uriMapping));
    } catch {}
  }

  if (result["practice_book"]) {
    try {
      const entries: PracticeEntry[] = JSON.parse(result["practice_book"]!);
      result["practice_book"] = JSON.stringify(
        entries.map((entry) => remapEntryAudioUris(entry, uriMapping)),
      );
    } catch {}
  }

  return result;
}
