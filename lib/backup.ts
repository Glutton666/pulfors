import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import { Platform, Alert } from "react-native";
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

    if (Platform.OS === "web") {
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `metronome_backup_${formatDateForFilename()}.metronome.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return true;
    }

    const filename = `metronome_backup_${formatDateForFilename()}.metronome.json`;
    const fileUri = FileSystem.cacheDirectory + filename;
    await FileSystem.writeAsStringAsync(fileUri, json, { encoding: "utf8" as any });

    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(fileUri, {
        mimeType: "application/json",
        dialogTitle: "Metronome Backup",
        UTI: "public.json",
      });
    }
    return true;
  } catch (e) {
    console.warn("[Backup] Export error:", e);
    return false;
  }
}

export async function importBackup(): Promise<{ success: boolean; keyCount: number }> {
  try {
    if (Platform.OS === "web") {
      return await importBackupWeb();
    }

    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/json", "*/*"],
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets?.[0]) {
      return { success: false, keyCount: 0 };
    }

    const uri = result.assets[0].uri;
    const json = await FileSystem.readAsStringAsync(uri, { encoding: "utf8" as any });
    return await restoreFromJson(json);
  } catch (e) {
    console.warn("[Backup] Import error:", e);
    return { success: false, keyCount: 0 };
  }
}

async function importBackupWeb(): Promise<{ success: boolean; keyCount: number }> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,.metronome.json";
    input.onchange = async (e: any) => {
      const file = e.target?.files?.[0];
      if (!file) {
        resolve({ success: false, keyCount: 0 });
        return;
      }
      try {
        const text = await file.text();
        const result = await restoreFromJson(text);
        resolve(result);
      } catch {
        resolve({ success: false, keyCount: 0 });
      }
    };
    input.click();
  });
}

async function restoreFromJson(json: string): Promise<{ success: boolean; keyCount: number }> {
  try {
    const backup: BackupFile = JSON.parse(json);
    if (!backup._meta || backup._meta.app !== "metronome" || !backup.data) {
      return { success: false, keyCount: 0 };
    }

    const pairs: [string, string][] = [];
    for (const [key, value] of Object.entries(backup.data)) {
      if (value !== null && value !== undefined) {
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

    if (Platform.OS === "web") {
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${safeName}.metronome-practice.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return true;
    }

    const filename = `${safeName}.metronome-practice.json`;
    const fileUri = FileSystem.cacheDirectory + filename;
    await FileSystem.writeAsStringAsync(fileUri, json, { encoding: "utf8" as any });

    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(fileUri, {
        mimeType: "application/json",
        dialogTitle: entry.label,
        UTI: "public.json",
      });
    }
    return true;
  } catch (e) {
    console.warn("[Backup] Share practice entry error:", e);
    return false;
  }
}

export async function importPracticeEntry(): Promise<{ success: boolean; entry?: PracticeEntry }> {
  try {
    if (Platform.OS === "web") {
      return await importPracticeEntryWeb();
    }

    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/json", "*/*"],
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets?.[0]) {
      return { success: false };
    }

    const uri = result.assets[0].uri;
    const json = await FileSystem.readAsStringAsync(uri, { encoding: "utf8" as any });
    return await parsePracticeJson(json);
  } catch (e) {
    console.warn("[Backup] Import practice entry error:", e);
    return { success: false };
  }
}

async function importPracticeEntryWeb(): Promise<{ success: boolean; entry?: PracticeEntry }> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,.metronome-practice.json";
    input.onchange = async (e: any) => {
      const file = e.target?.files?.[0];
      if (!file) {
        resolve({ success: false });
        return;
      }
      try {
        const text = await file.text();
        const result = await parsePracticeJson(text);
        resolve(result);
      } catch {
        resolve({ success: false });
      }
    };
    input.click();
  });
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
