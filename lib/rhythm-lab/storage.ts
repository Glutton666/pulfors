import AsyncStorage from "@react-native-async-storage/async-storage";
import { savePracticeBook, type PracticeEntry } from "../storage";
import type { RhythmDocument } from "./types";
import { validateRhythmDocument } from "./engine";

const LEGACY_KEY = "rhythm_lab_documents_v1";
const BOOK_KEY = "practice_book";
let queue: Promise<unknown> = Promise.resolve();
function transaction<T>(operation: () => Promise<T>): Promise<T> {
  const result = queue.then(operation);
  queue = result.catch(() => undefined);
  return result;
}

// Do not turn a damaged/unavailable main library into an empty replacement.
async function readBook(): Promise<PracticeEntry[]> {
  const raw = await AsyncStorage.getItem(BOOK_KEY);
  if (raw === null) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.some((entry) => !entry || typeof entry !== "object" || Array.isArray(entry))) {
    throw new Error("Invalid practice book");
  }
  return parsed;
}

export function rhythmDocumentFromPracticeEntry(entry: PracticeEntry): RhythmDocument {
  if (entry.mode !== "rhythm" || !entry.rhythmDocument) throw new Error("Missing rhythm document");
  return validateRhythmDocument({ ...entry.rhythmDocument, title: entry.label });
}

function toEntry(doc: RhythmDocument, previous?: PracticeEntry): PracticeEntry {
  return {
    ...previous,
    id: previous?.id ?? `rhythm:${doc.id}`,
    label: doc.title,
    createdAt: previous?.createdAt ?? doc.createdAt,
    mode: "rhythm",
    bpm: doc.bpm,
    beatsPerMeasure: doc.meter.numerator,
    beatTypes: Array.from({ length: doc.meter.numerator }, () => "normal" as const),
    beatSubdivisions: {},
    barRepeats: {},
    barLoopMode: "once",
    subdivisionPattern: [],
    rhythmDocument: doc,
  };
}

async function readAndMigrate(): Promise<PracticeEntry[]> {
  const book = await readBook();
  const raw = await AsyncStorage.getItem(LEGACY_KEY);
  if (raw === null) return book;
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.length > 200) throw new Error("Invalid rhythm library");
  const legacy = parsed.map(validateRhythmDocument);
  if (!legacy.length) return book;
  const existingIds = new Set(book.filter((entry) => entry.mode === "rhythm").map((entry) => entry.rhythmDocument?.id));
  const additions = legacy.filter((doc) => !existingIds.has(doc.id)).map((doc) => toEntry(doc));
  const next = [...additions, ...book];
  // The original collection is cleared only after the complete main-book
  // snapshot is durably saved. Failure leaves it available for a safe retry.
  if (additions.length) await savePracticeBook(next, { throwOnError: true });
  await AsyncStorage.setItem(LEGACY_KEY, "[]");
  return next;
}

export function listRhythmDocuments(): Promise<RhythmDocument[]> {
  return transaction(async () => (await readAndMigrate())
    .filter((entry) => entry.mode === "rhythm")
    .map(rhythmDocumentFromPracticeEntry)
    .sort((a, b) => b.updatedAt - a.updatedAt));
}

export function saveRhythmDocument(doc: RhythmDocument): Promise<void> {
  return transaction(async () => {
    const safe = validateRhythmDocument({ ...doc, updatedAt: Date.now() });
    const book = await readAndMigrate();
    const previous = book.find((entry) => entry.mode === "rhythm" && entry.rhythmDocument?.id === safe.id);
    const entry = toEntry(safe, previous);
    const next = [entry, ...book.filter((item) => item.id !== entry.id)];
    if (!previous && next.filter((item) => item.mode === "rhythm").length > 200) throw new Error("Rhythm library is full (200 documents)");
    await savePracticeBook(next, { throwOnError: true });
  });
}

export function deleteRhythmDocument(id: string): Promise<void> {
  return transaction(async () => {
    const book = await readAndMigrate();
    await savePracticeBook(book.filter((entry) => entry.mode !== "rhythm" || entry.rhythmDocument?.id !== id), { throwOnError: true });
  });
}
