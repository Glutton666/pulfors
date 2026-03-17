import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import { Platform } from "react-native";
import type { PracticeEntry } from "./storage";
import { loadPracticeBook, savePracticeBook } from "./storage";

const ALL_KEYS = [
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
  "metronome_onboarding_done",
];

interface BackupFile {
  _meta: {
    app: string;
    version: number;
    createdAt: string;
    keyCount: number;
  };
  data: Record<string, string | null>;
}

interface PracticeShareFile {
  _meta: {
    app: string;
    type: "practice_entry";
    createdAt: string;
  };
  entry: PracticeEntry;
}

function formatDateForFilename(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}${m}${day}_${h}${min}`;
}

function writeStringToFile(fileUri: string, content: string): Promise<void> {
  return FileSystem.writeAsStringAsync(fileUri, content, {
    encoding: FileSystem.EncodingType.UTF8,
  });
}

function readStringFromFile(fileUri: string): Promise<string> {
  return FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.UTF8,
  });
}

function pickFileWeb<T>(
  accept: string,
  handler: (text: string) => Promise<T>,
  fallback: T
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

function downloadJsonWeb(json: string, filename: string): void {
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

export async function exportBackup(): Promise<boolean> {
  try {
    const pairs = await AsyncStorage.multiGet(ALL_KEYS);
    const data: Record<string, string | null> = {};
    for (const [key, value] of pairs) {
      data[key] = value;
    }

    const backup: BackupFile = {
      _meta: {
        app: "metronome",
        version: 1,
        createdAt: new Date().toISOString(),
        keyCount: Object.keys(data).filter((k) => data[k] !== null).length,
      },
      data,
    };

    const json = JSON.stringify(backup, null, 2);
    const filename = `metronome_backup_${formatDateForFilename()}.metronome.json`;

    if (Platform.OS === "web") {
      downloadJsonWeb(json, filename);
      return true;
    }

    const fileUri = FileSystem.cacheDirectory + filename;
    await writeStringToFile(fileUri, json);

    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) {
      console.warn("[Backup] Sharing not available on this device");
      return false;
    }
    await Sharing.shareAsync(fileUri, {
      mimeType: "application/json",
      dialogTitle: "Metronome Backup",
      UTI: "public.json",
    });
    return true;
  } catch (e) {
    console.warn("[Backup] Export error:", e);
    return false;
  }
}

export async function importBackup(): Promise<{ success: boolean; keyCount: number }> {
  try {
    if (Platform.OS === "web") {
      return pickFileWeb(
        ".json,.metronome.json",
        restoreFromJson,
        { success: false, keyCount: 0 }
      );
    }

    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/json", "*/*"],
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets?.[0]) {
      return { success: false, keyCount: 0 };
    }

    const uri = result.assets[0].uri;
    const json = await readStringFromFile(uri);
    return await restoreFromJson(json);
  } catch (e) {
    console.warn("[Backup] Import error:", e);
    return { success: false, keyCount: 0 };
  }
}

async function restoreFromJson(json: string): Promise<{ success: boolean; keyCount: number }> {
  try {
    const backup: BackupFile = JSON.parse(json);
    if (!backup._meta || backup._meta.app !== "metronome" || !backup.data) {
      return { success: false, keyCount: 0 };
    }

    await AsyncStorage.multiRemove(ALL_KEYS);

    const pairs: [string, string][] = [];
    for (const [key, value] of Object.entries(backup.data)) {
      if (value !== null && value !== undefined && ALL_KEYS.includes(key)) {
        pairs.push([key, value]);
      }
    }

    if (pairs.length > 0) {
      await AsyncStorage.multiSet(pairs);
    }

    return { success: true, keyCount: pairs.length };
  } catch (e) {
    console.warn("[Backup] Restore error:", e);
    return { success: false, keyCount: 0 };
  }
}

export async function sharePracticeEntry(entry: PracticeEntry): Promise<boolean> {
  try {
    const shareData: PracticeShareFile = {
      _meta: {
        app: "metronome",
        type: "practice_entry",
        createdAt: new Date().toISOString(),
      },
      entry,
    };

    const json = JSON.stringify(shareData, null, 2);
    const safeName = (entry.label || "practice").replace(/[^a-zA-Z0-9가-힣_-]/g, "_").slice(0, 30);
    const filename = `${safeName}.metronome-practice.json`;

    if (Platform.OS === "web") {
      downloadJsonWeb(json, filename);
      return true;
    }

    const fileUri = FileSystem.cacheDirectory + filename;
    await writeStringToFile(fileUri, json);

    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) {
      console.warn("[Backup] Sharing not available on this device");
      return false;
    }
    await Sharing.shareAsync(fileUri, {
      mimeType: "application/json",
      dialogTitle: entry.label,
      UTI: "public.json",
    });
    return true;
  } catch (e) {
    console.warn("[Backup] Share practice entry error:", e);
    return false;
  }
}

export async function importPracticeEntry(): Promise<{ success: boolean; entry?: PracticeEntry }> {
  try {
    if (Platform.OS === "web") {
      return pickFileWeb(
        ".json,.metronome-practice.json",
        parsePracticeJson,
        { success: false }
      );
    }

    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/json", "*/*"],
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets?.[0]) {
      return { success: false };
    }

    const uri = result.assets[0].uri;
    const json = await readStringFromFile(uri);
    return await parsePracticeJson(json);
  } catch (e) {
    console.warn("[Backup] Import practice entry error:", e);
    return { success: false };
  }
}

async function parsePracticeJson(json: string): Promise<{ success: boolean; entry?: PracticeEntry }> {
  try {
    const data: PracticeShareFile = JSON.parse(json);
    if (!data._meta || data._meta.app !== "metronome" || data._meta.type !== "practice_entry" || !data.entry) {
      return { success: false };
    }

    const entry = data.entry;

    if (!entry.bpm || !entry.beatsPerMeasure || !entry.beatTypes) {
      return { success: false };
    }

    const newId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    const importedEntry: PracticeEntry = {
      ...entry,
      id: newId,
      createdAt: Date.now(),
    };

    const book = await loadPracticeBook();
    book.unshift(importedEntry);
    await savePracticeBook(book);

    return { success: true, entry: importedEntry };
  } catch (e) {
    console.warn("[Backup] Parse practice JSON error:", e);
    return { success: false };
  }
}
