import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import type { PracticeEntry } from "../storage";
import { logger } from "../logger";
import { normalizeSampleChannel, type SampleChannel } from "../stereo-channel";

export const ALL_KEYS = [
  "metronome_settings",
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
  "metronome_onboarding_done",
];

// 복원 트랜잭션용 임시 스냅샷 키. restoreFromJson 시작 시 ALL_KEYS의 현재
// 값을 직렬화해 이 키에 저장하고, 정상 종료 시 삭제한다. 앱이 강제 종료되거나
// multiSet이 실패하면 이 키가 남아 부팅 시 자동 롤백된다.
export const RESTORE_SNAPSHOT_KEY = "metronome_restore_snapshot_v1";

export const SAMPLES_DIR = "note_samples/";

export const MAX_IMPORT_JSON_CHARS = 100 * 1024 * 1024;
export const MAX_AUDIO_FILE_COUNT = 500;
export const MAX_AUDIO_FILE_B64_CHARS = 70 * 1024 * 1024;
// 복원된 note sample 맵의 최대 항목 수. 초과 시 앱 기동마다 플레이어 생성
// 부담이 반복되는 지속적 서비스 거부를 방지한다.
export const MAX_NOTE_SAMPLES_PER_MAP = 200;
// 백업에서 복원하는 practice book 항목의 최대 수.
export const MAX_PRACTICE_BOOK_ENTRIES = 500;

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
}

export interface PracticeShareFile {
  _meta: {
    app: string;
    type: "practice_entry";
    createdAt: string;
  };
  entry: PracticeEntry;
  audioFiles?: Record<string, string>;
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

export async function ensureSamplesDir(): Promise<string> {
  const dir = FileSystem.documentDirectory + SAMPLES_DIR;
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
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

export function sanitizeBackupData(
  data: Record<string, string | null>,
): Record<string, string | null> {
  const result = { ...data };

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

  if (result["practice_book"]) {
    try {
      let entries: PracticeEntry[] = JSON.parse(result["practice_book"]!);
      if (entries.length > MAX_PRACTICE_BOOK_ENTRIES) {
        logger.warn(`[Backup] Practice book too large (${entries.length}), truncating to ${MAX_PRACTICE_BOOK_ENTRIES}`);
        entries = entries.slice(0, MAX_PRACTICE_BOOK_ENTRIES);
      }
      const sanitized = entries.map((e) => ({
        ...e,
        noteSamples: sanitizeNoteSampleUris(e.noteSamples),
        noteSampleChannels: sanitizeNoteSampleChannelMap(e.noteSampleChannels),
        noteQueueEntries: e.noteQueueEntries?.map((qe) => ({
          ...qe,
          noteSamples: sanitizeNoteSampleUris(qe.noteSamples),
          noteSampleChannels: sanitizeNoteSampleChannelMap(qe.noteSampleChannels),
        })),
      }));
      result["practice_book"] = JSON.stringify(sanitized);
    } catch {}
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

export function collectUrisFromSampleMap(
  samples: Record<string, string> | undefined,
): Map<string, string> {
  const uris = new Map<string, string>();
  if (!samples) return uris;
  for (const uri of Object.values(samples)) {
    if (uri) {
      const fname = filenameFromUri(uri);
      uris.set(fname, extractBaseUri(uri));
    }
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
          const fname = filenameFromUri(uri);
          uris.set(fname, extractBaseUri(uri));
        }
      }
    } catch {}
  }

  const bookJson = data["practice_book"];
  if (bookJson) {
    try {
      const entries: PracticeEntry[] = JSON.parse(bookJson);
      for (const entry of entries) {
        if (entry.noteSamples) {
          for (const [, uri] of Object.entries(entry.noteSamples)) {
            if (uri) {
              const fname = filenameFromUri(uri);
              uris.set(fname, extractBaseUri(uri));
            }
          }
        }
      }
    } catch {}
  }

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

export function remapUri(oldUri: string, uriMapping: Map<string, string>): string {
  const fname = filenameFromUri(oldUri);
  const newBase = uriMapping.get(fname);
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
      for (const entry of entries) {
        if (entry.noteSamples && Object.keys(entry.noteSamples).length > 0) {
          entry.noteSamples = remapSampleMap(entry.noteSamples, uriMapping);
        }
      }
      result["practice_book"] = JSON.stringify(entries);
    } catch {}
  }

  return result;
}
