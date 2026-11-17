import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import { Platform } from "react-native";
import { logger } from "../logger";
import { captureBreadcrumb } from "../error-tracking";
import {
  ALL_KEYS,
  isProfileBackupKey,
  SCORE_KEY_PREFIX,
  MAX_IMPORT_JSON_CHARS,
  RESTORE_SNAPSHOT_KEY,
  type BackupFile,
  collectAllAudioUris,
  collectAllImageUris,
  downloadJsonWeb,
  formatDateForFilename,
  pickFileWeb,
  readAllAudioFiles,
  readAllImageFiles,
  readStringFromFile,
  remapDataUris,
  remapDataImageUris,
  restoreAudioFiles,
  restoreImageFiles,
  sanitizeBackupData,
  writeStringToFile,
} from "./shared";
import { CURRENT_SCHEMA_VERSION, migrateBackup, UnsupportedBackupVersionError } from "./migrations";
import { BackupFileSchema, formatZodError } from "./schema";
import { addProfileData, getActiveProfileId, readProfileData } from "../profiles";
import { flushAllPersisters } from "../persist";
import { drainProfileWrites } from "../profile-storage";
import { validateProfileBackupData } from "./profile-validation";

export type ImportBackupErrorCode = "unsupported_version" | "invalid" | "io";

export interface ImportBackupResult {
  success: boolean;
  keyCount: number;
  profileId?: string;
  errorCode?: ImportBackupErrorCode;
  /** Zod가 파싱 단계에서 감지한 필드별 오류 설명. 사용자에게 표시 가능. */
  validationDetail?: string;
  /** 쓰기 실패 뒤 원래 데이터를 되돌렸는지, 다음 실행 때 복구해야 하는지. */
  recoveryStatus?: "rolled_back" | "rollback_pending";
}

export async function exportBackup(profileId = getActiveProfileId()): Promise<boolean> {
  try {
    if (profileId === getActiveProfileId()) {
      await flushAllPersisters();
      await drainProfileWrites();
    }
    const data = Object.fromEntries(Object.entries(await readProfileData(profileId)).filter(([key]) => isProfileBackupKey(key)));

    const allUris = collectAllAudioUris(data);
    const audioFiles = await readAllAudioFiles(allUris, true);
    const imageFiles = await readAllImageFiles(collectAllImageUris(data), true);

    const backup: BackupFile = {
      _meta: {
        app: "metronome",
        version: 2,
        createdAt: new Date().toISOString(),
        keyCount: Object.keys(data).filter((k) => data[k] !== null).length,
      },
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data,
      ...(Object.keys(audioFiles).length > 0 ? { audioFiles } : {}),
      ...(Object.keys(imageFiles).length > 0 ? { imageFiles } : {}),
    };

    const json = JSON.stringify(backup);
    const filename = `metronome_backup_${formatDateForFilename()}.metronome.json`;

    if (Platform.OS === "web") {
      downloadJsonWeb(json, filename);
      return true;
    }

    const fileUri = FileSystem.cacheDirectory + filename;
    await writeStringToFile(fileUri, json);

    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) {
      logger.warn("[Backup] Sharing not available on this device");
      return false;
    }
    await Sharing.shareAsync(fileUri, {
      mimeType: "application/json",
      dialogTitle: "Metronome Backup",
      UTI: "public.json",
    });
    return true;
  } catch (e) {
    logger.warn("[Backup] Export error:", e);
    captureBreadcrumb({ category: "backup.export", message: "Export error", level: "error", data: { error: String(e) } });
    return false;
  }
}

export async function importBackup(): Promise<ImportBackupResult> {
  try {
    if (Platform.OS === "web") {
      return pickFileWeb<ImportBackupResult>(
        ".json,.metronome.json",
        restoreFromJson,
        { success: false, keyCount: 0 },
      );
    }

    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/json", "*/*"],
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets?.[0]) {
      return { success: false, keyCount: 0 };
    }

    const asset = result.assets[0];
    if (typeof asset.size === "number") {
      if (asset.size > MAX_IMPORT_JSON_CHARS) {
        logger.warn("[Backup] Native import file too large (picker size):", asset.size);
        return { success: false, keyCount: 0, errorCode: "io" };
      }
    } else {
      // Picker did not report size — fall back to filesystem stat before reading.
      try {
        const info = await FileSystem.getInfoAsync(asset.uri);
        if (info.exists && "size" in info && typeof info.size === "number" && info.size > MAX_IMPORT_JSON_CHARS) {
          logger.warn("[Backup] Native import file too large (fs stat):", info.size);
          return { success: false, keyCount: 0, errorCode: "io" };
        }
      } catch (statErr) {
        logger.warn("[Backup] Could not stat import file, proceeding cautiously:", statErr);
      }
    }
    const json = await readStringFromFile(asset.uri);
    return await restoreFromJson(json);
  } catch (e) {
    logger.warn("[Backup] Import error:", e);
    captureBreadcrumb({ category: "backup.import", message: "Import error", level: "error", data: { error: String(e) } });
    return { success: false, keyCount: 0, errorCode: "io" };
  }
}

// 동시 복원 직렬화 락. UI상 동시 import는 거의 발생하지 않지만, 단일
// RESTORE_SNAPSHOT_KEY를 공유하므로 두 호출이 겹치면 스냅샷이 덮어써져
// 잘못된 상태로 롤백될 수 있다. 모듈 레벨 promise 큐로 한 번에 하나만 실행.
let restoreInFlight: Promise<ImportBackupResult> | null = null;

// Exported for tests so that import-level error paths(손상 JSON, 미래 버전,
// 정상 v1 라운드트립)을 DocumentPicker/Sharing 우회 없이 직접 검증할 수 있다.
export async function restoreFromJson(
  json: string,
): Promise<ImportBackupResult> {
  if (restoreInFlight) {
    logger.warn("[Backup] Restore already in flight, queueing");
    // 이전 복원이 끝날 때까지 기다린 뒤 우리 차례로 재진입.
    try { await restoreInFlight; } catch {}
  }
  // 이전 복원이 끝까지 롤백되지 않았다면 유일한 원본 스냅샷을 절대 덮어쓰지
  // 않는다. 앱 시작 시 자동 복구가 먼저 이를 적용할 때까지 새 복원을 막는다.
  try {
    if (await AsyncStorage.getItem(RESTORE_SNAPSHOT_KEY)) {
      logger.warn("[Backup] Restore blocked while a prior rollback is pending");
      return { success: false, keyCount: 0, errorCode: "io", recoveryStatus: "rollback_pending" };
    }
  } catch (e) {
    logger.warn("[Backup] Could not check pending restore state:", e);
    return { success: false, keyCount: 0, errorCode: "io" };
  }
  const p = restoreFromJsonInternal(json);
  restoreInFlight = p;
  try {
    return await p;
  } finally {
    if (restoreInFlight === p) restoreInFlight = null;
  }
}

async function restoreFromJsonInternal(
  json: string,
): Promise<ImportBackupResult> {
  try {
    if (typeof json !== "string" || json.length > MAX_IMPORT_JSON_CHARS) {
      logger.warn("[Backup] Import JSON too large:", json?.length);
      return { success: false, keyCount: 0, errorCode: "invalid" };
    }
    let rawData: unknown;
    try {
      rawData = JSON.parse(json);
    } catch (e) {
      logger.warn("[Backup] JSON parse failed:", e);
      return { success: false, keyCount: 0, errorCode: "invalid" };
    }
    const parseResult = BackupFileSchema.safeParse(rawData);
    if (!parseResult.success) {
      const detail = formatZodError(parseResult.error);
      logger.warn("[Backup] Backup file structure invalid:", detail);
      captureBreadcrumb({
        category: "backup.restore",
        message: "Zod validation failed",
        level: "warning",
        data: { detail },
      });
      return { success: false, keyCount: 0, errorCode: "invalid", validationDetail: detail };
    }
    const backup = parseResult.data;

    let data: Record<string, string | null>;
    try {
      data = migrateBackup(backup).data;
    } catch (e) {
      if (e instanceof UnsupportedBackupVersionError) {
        logger.warn("[Backup] Unsupported schemaVersion:", e.fileVersion, "current:", e.currentVersion);
        captureBreadcrumb({
          category: "backup.restore",
          message: "Unsupported schemaVersion",
          level: "warning",
          data: { fileVersion: e.fileVersion, currentVersion: e.currentVersion },
        });
        return { success: false, keyCount: 0, errorCode: "unsupported_version" };
      }
      throw e;
    }

    try { validateProfileBackupData(data); }
    catch (error) {
      return { success: false, keyCount: 0, errorCode: "invalid", validationDetail: String(error) };
    }
    if (backup.audioFiles && Object.keys(backup.audioFiles).length > 0) {
      const uriMapping = await restoreAudioFiles(backup.audioFiles, true);
      if (uriMapping.size > 0) {
        data = remapDataUris(data, uriMapping);
      }
    }
    if (backup.imageFiles && Object.keys(backup.imageFiles).length > 0) {
      const imageMapping = await restoreImageFiles(backup.imageFiles, true);
      if (imageMapping.size > 0) data = remapDataImageUris(data, imageMapping);
    }

    data = sanitizeBackupData(data);

    const pairs: [string, string][] = [];
    for (const [key, value] of Object.entries(data)) {
      const isKnownKey = isProfileBackupKey(key);
      if (value !== null && value !== undefined && isKnownKey) {
        pairs.push([key, value]);
      }
    }

    const settings = JSON.parse(data.metronome_settings ?? "{}");
    const profile = await addProfileData(Object.fromEntries(pairs), {
      name: typeof settings.username === "string" ? settings.username : "",
      photoUri: typeof settings.profilePhoto === "string" ? settings.profilePhoto : undefined,
    });
    return { success: true, keyCount: pairs.length, profileId: profile.id };
  } catch (e) {
    logger.warn("[Backup] Restore error:", e);
    captureBreadcrumb({ category: "backup.restore", message: "Restore error", level: "error", data: { error: String(e) } });
    return { success: false, keyCount: 0, errorCode: "io" };
  }
}

// 스냅샷이 구조적으로 손상된 경우(=JSON 파싱/모양 검증 실패) 던지는 에러.
// I/O 에러와 구분해 부팅 복구 분기에서 키 보존 여부를 결정한다.
class SnapshotCorruptError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "SnapshotCorruptError";
  }
}

// 스냅샷 JSON으로 ALL_KEYS를 덮어쓴다. 손상/누락된 키는 조용히 건너뛴다.
// 파싱/모양 검증 실패는 SnapshotCorruptError로, I/O 실패는 원본 에러로 던진다.
async function applyRestoreSnapshot(json: string): Promise<void> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new SnapshotCorruptError("Snapshot JSON parse failed");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new SnapshotCorruptError("Snapshot shape invalid");
  }
  const raw = parsed as Record<string, unknown>;
  // v1 스냅샷은 값만 저장했다. 기존 백업을 안전하게 복구할 수 있도록 읽기
  // 호환성을 유지한다.
  const isScopedSnapshot = Array.isArray(raw.keys) && raw.data && typeof raw.data === "object" && !Array.isArray(raw.data);
  const obj = (isScopedSnapshot ? raw.data : raw) as Record<string, unknown>;
  const scopedKeys = Array.isArray(raw.keys) ? raw.keys : [];
  const keys = isScopedSnapshot
    ? scopedKeys.filter((key): key is string => typeof key === "string")
    : ALL_KEYS;
  if (keys.length === 0) throw new SnapshotCorruptError("Snapshot keys invalid");
  await AsyncStorage.multiRemove(keys);
  const pairs: [string, string][] = [];
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "string") pairs.push([key, v]);
  }
  if (pairs.length > 0) {
    await AsyncStorage.multiSet(pairs);
  }
}

/**
 * 부팅 시 호출. 이전 복원 시도가 강제 종료/오류로 끊긴 경우
 * RESTORE_SNAPSHOT_KEY가 남아 있다 — 이를 다시 적용해 손상된 부분 상태를
 * 복구하고 스냅샷 키를 정리한다. 정상 시(스냅샷 없음)는 즉시 false 반환.
 */
export async function rollbackPendingRestoreIfAny(): Promise<boolean> {
  let snapshot: string | null;
  try {
    snapshot = await AsyncStorage.getItem(RESTORE_SNAPSHOT_KEY);
  } catch (e) {
    logger.warn("[Backup] Pending restore check failed:", e);
    return false;
  }
  if (!snapshot) return false;
  logger.warn("[Backup] Pending restore snapshot found at boot, rolling back");
  captureBreadcrumb({
    category: "backup.restore",
    message: "Boot rollback from pending snapshot",
    level: "warning",
  });
  try {
    await applyRestoreSnapshot(snapshot);
    await AsyncStorage.removeItem(RESTORE_SNAPSHOT_KEY);
    return true;
  } catch (e) {
    logger.warn("[Backup] Boot rollback failed:", e);
    captureBreadcrumb({ category: "backup.restore", message: "Boot rollback failed", level: "error", data: { error: String(e) } });
    if (e instanceof SnapshotCorruptError) {
      // 스냅샷이 구조적으로 손상되어 다시 시도해도 의미가 없다 → 키 폐기로
      // 무한 재시도를 막는다.
      try { await AsyncStorage.removeItem(RESTORE_SNAPSHOT_KEY); } catch {}
    }
    // I/O 실패 등 일시적 오류는 스냅샷 키를 그대로 두어 다음 부팅에서 재시도.
    return false;
  }
}
