import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import { Platform } from "react-native";
import { logger } from "../logger";
import { captureBreadcrumb } from "../error-tracking";
import {
  ALL_KEYS,
  MAX_IMPORT_JSON_CHARS,
  type BackupFile,
  collectAllAudioUris,
  downloadJsonWeb,
  formatDateForFilename,
  pickFileWeb,
  readAllAudioFiles,
  readStringFromFile,
  remapDataUris,
  restoreAudioFiles,
  sanitizeBackupData,
  writeStringToFile,
} from "./shared";
import { CURRENT_SCHEMA_VERSION, migrateBackup, UnsupportedBackupVersionError } from "./migrations";

export type ImportBackupErrorCode = "unsupported_version" | "invalid" | "io";

export interface ImportBackupResult {
  success: boolean;
  keyCount: number;
  errorCode?: ImportBackupErrorCode;
}

export async function exportBackup(): Promise<boolean> {
  try {
    const pairs = await AsyncStorage.multiGet(ALL_KEYS);
    const data: Record<string, string | null> = {};
    for (const [key, value] of pairs) {
      data[key] = value;
    }

    const allUris = collectAllAudioUris(data);
    const audioFiles = await readAllAudioFiles(allUris);

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
    if (typeof asset.size === "number" && asset.size > MAX_IMPORT_JSON_CHARS) {
      logger.warn("[Backup] Native import file too large:", asset.size);
      return { success: false, keyCount: 0, errorCode: "io" };
    }
    const json = await readStringFromFile(asset.uri);
    return await restoreFromJson(json);
  } catch (e) {
    logger.warn("[Backup] Import error:", e);
    captureBreadcrumb({ category: "backup.import", message: "Import error", level: "error", data: { error: String(e) } });
    return { success: false, keyCount: 0, errorCode: "io" };
  }
}

// Exported for tests so that import-level error paths(손상 JSON, 미래 버전,
// 정상 v1 라운드트립)을 DocumentPicker/Sharing 우회 없이 직접 검증할 수 있다.
export async function restoreFromJson(
  json: string,
): Promise<ImportBackupResult> {
  try {
    if (typeof json !== "string" || json.length > MAX_IMPORT_JSON_CHARS) {
      logger.warn("[Backup] Import JSON too large:", json?.length);
      return { success: false, keyCount: 0, errorCode: "invalid" };
    }
    let backup: BackupFile;
    try {
      backup = JSON.parse(json);
    } catch (e) {
      logger.warn("[Backup] JSON parse failed:", e);
      return { success: false, keyCount: 0, errorCode: "invalid" };
    }
    if (
      !backup ||
      typeof backup !== "object" ||
      Array.isArray(backup) ||
      !backup._meta ||
      backup._meta.app !== "metronome" ||
      !backup.data
    ) {
      return { success: false, keyCount: 0, errorCode: "invalid" };
    }

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

    if (backup.audioFiles && Object.keys(backup.audioFiles).length > 0 && Platform.OS !== "web") {
      const uriMapping = await restoreAudioFiles(backup.audioFiles);
      if (uriMapping.size > 0) {
        data = remapDataUris(data, uriMapping);
      }
    }

    data = sanitizeBackupData(data);

    await AsyncStorage.multiRemove(ALL_KEYS);

    const pairs: [string, string][] = [];
    for (const [key, value] of Object.entries(data)) {
      if (value !== null && value !== undefined && ALL_KEYS.includes(key)) {
        pairs.push([key, value]);
      }
    }

    if (pairs.length > 0) {
      await AsyncStorage.multiSet(pairs);
    }

    return { success: true, keyCount: pairs.length };
  } catch (e) {
    logger.warn("[Backup] Restore error:", e);
    captureBreadcrumb({ category: "backup.restore", message: "Restore error", level: "error", data: { error: String(e) } });
    return { success: false, keyCount: 0, errorCode: "io" };
  }
}
