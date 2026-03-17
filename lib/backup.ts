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

const SAMPLES_DIR = "note_samples/";

interface BackupFile {
  _meta: {
    app: string;
    version: number;
    createdAt: string;
    keyCount: number;
  };
  data: Record<string, string | null>;
  audioFiles?: Record<string, string>;
}

interface PracticeShareFile {
  _meta: {
    app: string;
    type: "practice_entry";
    createdAt: string;
  };
  entry: PracticeEntry;
  audioFiles?: Record<string, string>;
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

function extractBaseUri(uri: string): string {
  return uri.split("#")[0];
}

function extractFragment(uri: string): string {
  const idx = uri.indexOf("#");
  return idx >= 0 ? uri.substring(idx) : "";
}

function filenameFromUri(uri: string): string {
  const base = extractBaseUri(uri);
  const parts = base.split("/");
  return parts[parts.length - 1] || `sample_${Date.now()}`;
}

async function ensureSamplesDir(): Promise<string> {
  const dir = FileSystem.documentDirectory + SAMPLES_DIR;
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
  return dir;
}

async function readAudioAsBase64(uri: string): Promise<string | null> {
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
    console.warn("[Backup] Failed to read audio file:", baseUri, e);
    return null;
  }
}

async function writeAudioFromBase64(filename: string, base64: string): Promise<string> {
  const dir = await ensureSamplesDir();
  const fileUri = dir + filename;
  await FileSystem.writeAsStringAsync(fileUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return fileUri;
}

function collectUrisFromSampleMap(
  samples: Record<string, string> | undefined
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

function collectAllAudioUris(
  data: Record<string, string | null>
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

async function readAllAudioFiles(
  uris: Map<string, string>
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

function remapUri(
  oldUri: string,
  uriMapping: Map<string, string>
): string {
  const fname = filenameFromUri(oldUri);
  const newBase = uriMapping.get(fname);
  if (newBase) {
    return newBase + extractFragment(oldUri);
  }
  return oldUri;
}

function remapSampleMap(
  samples: Record<string, string>,
  uriMapping: Map<string, string>
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, uri] of Object.entries(samples)) {
    result[key] = remapUri(uri, uriMapping);
  }
  return result;
}

async function restoreAudioFiles(
  audioFiles: Record<string, string>
): Promise<Map<string, string>> {
  const uriMapping = new Map<string, string>();
  for (const [fname, base64] of Object.entries(audioFiles)) {
    try {
      const newUri = await writeAudioFromBase64(fname, base64);
      uriMapping.set(fname, newUri);
    } catch (e) {
      console.warn("[Backup] Failed to restore audio file:", fname, e);
    }
  }
  return uriMapping;
}

function remapDataUris(
  data: Record<string, string | null>,
  uriMapping: Map<string, string>
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

    let data = backup.data;

    if (backup.audioFiles && Object.keys(backup.audioFiles).length > 0 && Platform.OS !== "web") {
      const uriMapping = await restoreAudioFiles(backup.audioFiles);
      if (uriMapping.size > 0) {
        data = remapDataUris(data, uriMapping);
      }
    }

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
    console.warn("[Backup] Restore error:", e);
    return { success: false, keyCount: 0 };
  }
}

export async function sharePracticeEntry(entry: PracticeEntry): Promise<boolean> {
  try {
    if (entry.mode === "note" && entry.noteQueueEntryIds?.length) {
      const book = await loadPracticeBook();
      const queueEntries = entry.noteQueueEntryIds
        .map(id => book.find(e => e.id === id))
        .filter((e): e is PracticeEntry => !!e);
      entry = { ...entry, noteQueueEntries: queueEntries };
    }

    const entryUris = collectUrisFromSampleMap(entry.noteSamples);
    if (entry.noteQueueEntries) {
      for (const qe of entry.noteQueueEntries) {
        const qeUris = collectUrisFromSampleMap(qe.noteSamples);
        for (const [k, v] of qeUris) entryUris.set(k, v);
      }
    }
    const audioFiles = await readAllAudioFiles(entryUris);

    const shareData: PracticeShareFile = {
      _meta: {
        app: "metronome",
        type: "practice_entry",
        createdAt: new Date().toISOString(),
      },
      entry,
      ...(Object.keys(audioFiles).length > 0 ? { audioFiles } : {}),
    };

    const json = JSON.stringify(shareData);
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

    if (data.audioFiles && Object.keys(data.audioFiles).length > 0 && Platform.OS !== "web") {
      const uriMapping = await restoreAudioFiles(data.audioFiles);
      if (uriMapping.size > 0 && entry.noteSamples) {
        entry.noteSamples = remapSampleMap(entry.noteSamples, uriMapping);
      }
      if (uriMapping.size > 0 && entry.noteQueueEntries) {
        entry.noteQueueEntries = entry.noteQueueEntries.map(qe => ({
          ...qe,
          noteSamples: qe.noteSamples ? remapSampleMap(qe.noteSamples, uriMapping) : qe.noteSamples,
        }));
      }
    }

    const newId = Date.now().toString() + Math.random().toString(36).substr(2, 9);

    const book = await loadPracticeBook();

    if (entry.mode === "note" && entry.noteQueueEntries?.length) {
      const idMap = new Map<string, string>();
      for (const qe of entry.noteQueueEntries) {
        const existsInBook = book.some(b => b.id === qe.id);
        if (!existsInBook) {
          const qeNewId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
          idMap.set(qe.id, qeNewId);
          book.unshift({ ...qe, id: qeNewId, createdAt: Date.now() });
        } else {
          idMap.set(qe.id, qe.id);
        }
      }
      entry.noteQueueEntryIds = (entry.noteQueueEntryIds || []).map(id => idMap.get(id) || id);
      entry.noteQueueEntries = entry.noteQueueEntries.map(qe => ({
        ...qe,
        id: idMap.get(qe.id) || qe.id,
      }));
    }

    const importedEntry: PracticeEntry = {
      ...entry,
      id: newId,
      createdAt: Date.now(),
    };

    book.unshift(importedEntry);
    await savePracticeBook(book);

    return { success: true, entry: importedEntry };
  } catch (e) {
    console.warn("[Backup] Parse practice JSON error:", e);
    return { success: false };
  }
}
