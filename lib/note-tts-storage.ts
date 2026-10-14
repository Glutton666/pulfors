import AsyncStorage from "@react-native-async-storage/async-storage";
import { captureBreadcrumb } from "@/lib/error-tracking";
import { noteTtsNative } from "@/lib/note-tts-runtime";
import { isNoteTtsFileRetained, subscribeNoteTtsFileRelease } from "./note-tts";

let storageLock: Promise<unknown> = Promise.resolve();
const pendingReferences = new Map<string, number>();

/**
 * Serializes file-reference writes with garbage collection. A stale storage
 * snapshot must never race a write that is about to add the same URI back.
 */
export function withNoteTtsStorageLock<T>(operation: () => Promise<T>): Promise<T> {
  const result = storageLock.then(operation, operation);
  storageLock = result.then(() => undefined, () => undefined);
  return result;
}

function collectUris(value: unknown, target: Set<string>): void {
  if (typeof value === "string") {
    const withoutTrim = value.split("#", 1)[0];
    if (/^file:\/\/.+\/tts-samples\/[a-f0-9-]{36}\.wav$/i.test(withoutTrim)) {
      target.add(withoutTrim);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectUris(item, target);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectUris(item, target);
  }
}

/** Protect references contained in a storage write until that write settles. */
export function retainPendingNoteTtsReferences(value: unknown): () => void {
  const uris = new Set<string>();
  collectUris(value, uris);
  for (const uri of uris) pendingReferences.set(uri, (pendingReferences.get(uri) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    for (const uri of uris) {
      const count = pendingReferences.get(uri) ?? 0;
      if (count <= 1) pendingReferences.delete(uri);
      else pendingReferences.set(uri, count - 1);
    }
  };
}

/**
 * Removes only native-generated files absent from every persisted value.
 * Any storage read or native listing failure aborts the entire sweep.
 */
export async function collectUnusedNoteTtsFiles(): Promise<void> {
  const native = noteTtsNative;
  if (!native) return;
  await withNoteTtsStorageLock(async () => {
    let keys: readonly string[];
    let stored: readonly (readonly [string, string | null])[];
    let files: string[];
    try {
      keys = await AsyncStorage.getAllKeys();
      stored = await AsyncStorage.multiGet(keys);
      files = await native.listFiles();
    } catch (error) {
      captureBreadcrumb({ category: "noteTts.storage", message: "File cleanup scan failed", level: "warning", data: { error: String(error) } });
      return;
    }

    const referenced = new Set<string>();
    for (const uri of pendingReferences.keys()) referenced.add(uri);
    for (const [, raw] of stored) {
      if (!raw) continue;
      try {
        collectUris(JSON.parse(raw), referenced);
      } catch {
        // Malformed persisted content may still contain a valid URI. Preserve it.
        const matches = raw.match(/file:\/\/[^"\\\s]+\/tts-samples\/[a-f0-9-]{36}\.wav/gi) ?? [];
        for (const uri of matches) referenced.add(uri.split("#", 1)[0]);
      }
    }

    for (const uri of files) {
      const canonical = uri.split("#", 1)[0];
      if (!/^file:\/\/.+\/tts-samples\/[a-f0-9-]{36}\.wav$/i.test(canonical)) continue;
      if (referenced.has(canonical) || pendingReferences.has(canonical) || isNoteTtsFileRetained(canonical)) continue;
      try {
        await native.discard(canonical);
      } catch (error) {
        // Leave an undeletable file for the next successful sweep.
        captureBreadcrumb({ category: "noteTts.storage", message: "Unused speech file could not be removed", level: "warning", data: { error: String(error) } });
      }
    }
  });
}

// A sweep that skipped an actively used file must get another chance as soon
// as playback/export releases its final lease.
subscribeNoteTtsFileRelease(() => {
  void collectUnusedNoteTtsFiles();
});
