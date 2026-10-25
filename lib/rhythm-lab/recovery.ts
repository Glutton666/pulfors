import AsyncStorage from "@react-native-async-storage/async-storage";
import { validateRhythmDocument } from "./engine";
import type { RhythmDocument } from "./types";

export const RHYTHM_RECOVERY_KEY = "rhythm_lab_recovery_v1";
export const hasRhythmWork = (doc: RhythmDocument) =>
  !!(doc.hits.length || doc.manualEvents?.length || doc.overrides.length || doc.tuplets.length);

/** Memory is updated synchronously, before any new take replaces the document.
 * Serialized writes never discard the in-memory copy on storage failure. */
export function createRhythmRecovery() {
  const documents = new Map<string, RhythmDocument>();
  const touched = new Set<string>();
  const listeners = new Set<() => void>();
  let previousId: string | null = null;
  let pointerTouched = false;
  let ready = false;
  let error = false;
  let revision = 0;
  let persisted = 0;
  let loading: Promise<void> | null = null;
  let writing: Promise<void> | null = null;
  const notify = () => listeners.forEach((listener) => listener());
  const fork = (doc: RhythmDocument, reserved = new Set<string>(), movePointer = true) => {
    let suffix = 1;
    while (documents.has(`${doc.id}_recovery_${suffix}`) || reserved.has(`${doc.id}_recovery_${suffix}`)) suffix++;
    const copy = { ...doc, id: `${doc.id}_recovery_${suffix}` };
    documents.set(copy.id, copy);
    if (movePointer && previousId === doc.id) previousId = copy.id;
    revision++;
    return copy;
  };
  const load = (): Promise<void> => {
    if (ready) return Promise.resolve();
    if (loading) return loading;
    loading = (async () => {
      try {
        const raw = await AsyncStorage.getItem(RHYTHM_RECOVERY_KEY);
        if (raw !== null) {
          const parsed = JSON.parse(raw);
          if (parsed?.version !== 1 || !Array.isArray(parsed.documents) ||
            !(parsed.previousId === null || typeof parsed.previousId === "string")) throw new Error("Invalid recovery data");
          const saved = parsed.documents.map(validateRhythmDocument);
          const reserved = new Set<string>(saved.map((doc: RhythmDocument) => doc.id));
          for (const doc of saved) {
            if (!touched.has(doc.id)) documents.set(doc.id, doc);
            else if (JSON.stringify(documents.get(doc.id)) !== JSON.stringify(doc)) fork(doc, reserved, false);
          }
          if (!pointerTouched) previousId = parsed.previousId;
        }
        ready = true;
        error = false;
      } catch {
        // Never overwrite unreadable durable data with a partial memory cache.
        error = true;
      } finally {
        loading = null;
        notify();
      }
    })();
    return loading;
  };
  const flush = (): Promise<void> => {
    if (writing) return writing;
    writing = (async () => {
      await load();
      if (!ready) return;
      while (persisted < revision) {
        const version = revision;
        const snapshot = JSON.stringify({ version: 1, previousId, documents: [...documents.values()] });
        try {
          await AsyncStorage.setItem(RHYTHM_RECOVERY_KEY, snapshot);
          persisted = version;
          error = false;
        } catch {
          error = true;
          break;
        }
      }
    })().finally(() => { writing = null; notify(); });
    return writing;
  };
  return {
    load, flush,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    snapshot() { return { ready, error, previous: previousId ? documents.get(previousId) : undefined, documents: [...documents.values()] }; },
    remember(doc: RhythmDocument, previous = false, preserveExisting = false) {
      if (!hasRhythmWork(doc)) return;
      const existing = documents.get(doc.id);
      if (preserveExisting && existing && JSON.stringify(existing) !== JSON.stringify(doc)) fork(existing);
      // A snapshot must survive subsequent edits to the active document.
      documents.set(doc.id, JSON.parse(JSON.stringify(doc)));
      touched.add(doc.id);
      if (previous) { previousId = doc.id; pointerTouched = true; }
      revision++;
      notify();
    },
  };
}

// Keeps failed writes recoverable across workspace unmount/remount in this app.
export const rhythmRecovery = createRhythmRecovery();
