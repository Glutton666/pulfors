import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import { Platform } from "react-native";
import type { PracticeEntry } from "../storage";
import { loadPracticeBook, savePracticeBook } from "../storage";
import { logger } from "../logger";
import { captureBreadcrumb } from "../error-tracking";
import {
  MAX_IMPORT_JSON_CHARS,
  type PracticeShareFile,
  collectUrisFromSampleMap,
  downloadJsonWeb,
  pickFileWeb,
  readAllAudioFiles,
  readStringFromFile,
  remapSampleMap,
  restoreAudioFiles,
  sanitizeNoteSampleChannelMap,
  sanitizeNoteSampleUris,
  writeStringToFile,
} from "./shared";

export async function sharePracticeEntry(entry: PracticeEntry): Promise<boolean> {
  try {
    if (entry.mode === "note" && entry.noteQueueEntryIds?.length) {
      const book = await loadPracticeBook();
      const queueEntries = entry.noteQueueEntryIds
        .map((id) => book.find((e) => e.id === id))
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
      logger.warn("[Backup] Sharing not available on this device");
      return false;
    }
    await Sharing.shareAsync(fileUri, {
      mimeType: "application/json",
      dialogTitle: entry.label,
      UTI: "public.json",
    });
    return true;
  } catch (e) {
    logger.warn("[Backup] Share practice entry error:", e);
    captureBreadcrumb({ category: "backup.practice.share", message: "Share practice entry error", level: "error", data: { error: String(e) } });
    return false;
  }
}

export async function importPracticeEntry(): Promise<{ success: boolean; entry?: PracticeEntry }> {
  try {
    if (Platform.OS === "web") {
      return pickFileWeb(
        ".json,.metronome-practice.json",
        parsePracticeJson,
        { success: false },
      );
    }

    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/json", "*/*"],
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets?.[0]) {
      return { success: false };
    }

    const asset = result.assets[0];
    if (typeof asset.size === "number" && asset.size > MAX_IMPORT_JSON_CHARS) {
      logger.warn("[Backup] Native practice import too large:", asset.size);
      return { success: false };
    }
    const json = await readStringFromFile(asset.uri);
    return await parsePracticeJson(json);
  } catch (e) {
    logger.warn("[Backup] Import practice entry error:", e);
    captureBreadcrumb({ category: "backup.practice.import", message: "Import practice entry error", level: "error", data: { error: String(e) } });
    return { success: false };
  }
}

async function parsePracticeJson(
  json: string,
): Promise<{ success: boolean; entry?: PracticeEntry }> {
  try {
    if (typeof json !== "string" || json.length > MAX_IMPORT_JSON_CHARS) {
      logger.warn("[Backup] Practice JSON too large:", json?.length);
      return { success: false };
    }
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
        entry.noteQueueEntries = entry.noteQueueEntries.map((qe) => ({
          ...qe,
          noteSamples: qe.noteSamples ? remapSampleMap(qe.noteSamples, uriMapping) : qe.noteSamples,
        }));
      }
    }

    if (entry.noteSamples) {
      entry.noteSamples = sanitizeNoteSampleUris(entry.noteSamples) ?? {};
    }
    if (entry.noteSampleChannels) {
      entry.noteSampleChannels = sanitizeNoteSampleChannelMap(entry.noteSampleChannels) ?? {};
    }
    if (entry.noteQueueEntries) {
      entry.noteQueueEntries = entry.noteQueueEntries.map((qe) => ({
        ...qe,
        noteSamples: sanitizeNoteSampleUris(qe.noteSamples),
        noteSampleChannels: sanitizeNoteSampleChannelMap(qe.noteSampleChannels),
      }));
    }

    const newId = Date.now().toString() + Math.random().toString(36).substr(2, 9);

    const book = await loadPracticeBook();

    if (entry.mode === "note" && entry.noteQueueEntries?.length) {
      const idMap = new Map<string, string>();
      for (const qe of entry.noteQueueEntries) {
        const existsInBook = book.some((b) => b.id === qe.id);
        if (!existsInBook) {
          const qeNewId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
          idMap.set(qe.id, qeNewId);
          book.unshift({ ...qe, id: qeNewId, createdAt: Date.now() });
        } else {
          idMap.set(qe.id, qe.id);
        }
      }
      entry.noteQueueEntryIds = (entry.noteQueueEntryIds || []).map((id) => idMap.get(id) || id);
      entry.noteQueueEntries = entry.noteQueueEntries.map((qe) => ({
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
    logger.warn("[Backup] Parse practice JSON error:", e);
    return { success: false };
  }
}
