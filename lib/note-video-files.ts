import { Platform } from "react-native";
import * as Crypto from "expo-crypto";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { activeStorageProfile } from "./profile-storage";
import { isNoteVideoAssetId, type NoteVideoSource } from "./note-video";

const MAX_FILE_BYTES = 150 * 1024 * 1024;
type FileSource = Extract<NoteVideoSource, { kind: "file" }>;

function webVideoTransaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("pulfors-note-video", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("assets");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      try {
        const tx = db.transaction("assets", mode);
        const req = run(tx.objectStore("assets"));
        tx.oncomplete = () => { db.close(); resolve(req.result); };
        tx.onabort = tx.onerror = () => { db.close(); reject(tx.error ?? req.error); };
      } catch (error) { db.close(); reject(error); }
    };
  });
}

function nativeDirectory(profile: string) {
  if (!FileSystem.documentDirectory) throw new Error("Video storage unavailable");
  return `${FileSystem.documentDirectory}note-videos/${encodeURIComponent(profile)}/`;
}

export async function pickNoteVideo(): Promise<FileSource | null> {
  const profile = activeStorageProfile();
  const result = await DocumentPicker.getDocumentAsync({
    type: ["video/mp4", "video/webm", "video/quicktime", "video/x-m4v"], copyToCacheDirectory: true, multiple: false,
  });
  if (result.canceled) return null;
  const item = result.assets[0];
  const ext = item.name.split(".").pop()?.toLowerCase();
  if (!ext || !["mp4", "webm", "mov", "m4v"].includes(ext) || (item.size ?? item.file?.size ?? 0) > MAX_FILE_BYTES) {
    throw new Error("Unsupported video file");
  }
  const assetId = `${Crypto.randomUUID()}.${ext}`;
  if (Platform.OS === "web") {
    // Read the picker File directly; no Base64 video in settings/localStorage.
    if (!item.file || item.file.size > MAX_FILE_BYTES) throw new Error("Video file unavailable");
    await webVideoTransaction("readwrite", (store) => store.put(item.file, `${profile}:${assetId}`));
  } else {
    const dir = nativeDirectory(profile);
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    await FileSystem.copyAsync({ from: item.uri, to: `${dir}${assetId}` });
  }
  return { kind: "file", assetId, name: item.name.slice(0, 200) };
}

export async function resolveNoteVideoFile(assetId: string): Promise<{ uri: string; release(): void }> {
  if (!isNoteVideoAssetId(assetId)) throw new Error("Invalid video asset");
  const profile = activeStorageProfile();
  if (Platform.OS === "web") {
    const blob = await webVideoTransaction("readonly", (store) => store.get(`${profile}:${assetId}`));
    if (!(blob instanceof Blob)) throw new Error("Video file unavailable");
    const uri = URL.createObjectURL(blob);
    return { uri, release: () => URL.revokeObjectURL(uri) };
  }
  const uri = `${nativeDirectory(profile)}${assetId}`;
  if (!(await FileSystem.getInfoAsync(uri)).exists) throw new Error("Video file unavailable");
  return { uri, release() {} };
}

/** Only used for files created by an editor that did not commit them. */
export async function discardUncommittedNoteVideo(assetId: string, profile: string) {
  if (!isNoteVideoAssetId(assetId)) return;
  if (Platform.OS === "web") {
    await webVideoTransaction("readwrite", (store) => store.delete(`${profile}:${assetId}`));
  } else {
    await FileSystem.deleteAsync(`${nativeDirectory(profile)}${assetId}`, { idempotent: true });
  }
}
