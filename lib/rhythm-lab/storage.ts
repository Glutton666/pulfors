import AsyncStorage from "@react-native-async-storage/async-storage";
import type { RhythmDocument } from "./types";
import { validateRhythmDocument } from "./engine";

// One atomic collection write avoids orphaned index/document pairs. Serialize
// read-modify-write operations to prevent two independent screens losing edits.
const KEY = "rhythm_lab_documents_v1";
let queue: Promise<unknown> = Promise.resolve();
function transaction<T>(operation: () => Promise<T>): Promise<T> {
  const result = queue.then(operation);
  queue = result.catch(() => undefined);
  return result;
}
async function readAll(): Promise<RhythmDocument[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (raw === null) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.length > 200) throw new Error("Invalid rhythm library");
  return parsed.map(validateRhythmDocument);
}
export function listRhythmDocuments(): Promise<RhythmDocument[]> {
  return transaction(readAll);
}
export function saveRhythmDocument(doc: RhythmDocument): Promise<void> {
  return transaction(async () => {
    const safe = validateRhythmDocument({ ...doc, updatedAt: Date.now() });
    const documents = await readAll();
    const next = [safe, ...documents.filter((d) => d.id !== safe.id)].sort((a, b) => b.updatedAt - a.updatedAt);
    if (next.length > 200) throw new Error("Rhythm library is full (200 documents)");
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  });
}
export function deleteRhythmDocument(id: string): Promise<void> {
  return transaction(async () => {
    const documents = await readAll();
    await AsyncStorage.setItem(KEY, JSON.stringify(documents.filter((d) => d.id !== id)));
  });
}
