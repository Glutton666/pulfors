import AsyncStorage from "@react-native-async-storage/async-storage";
import { createRhythmDocument, interpretRhythm } from "@/lib/rhythm-lab/engine";
import { deleteRhythmDocument, listRhythmDocuments, saveRhythmDocument } from "@/lib/rhythm-lab/storage";
import { sanitizePracticeEntry } from "@/lib/backup/shared";
import { filterPracticeBookEntries } from "@/lib/practice-book-filter";

const BOOK = "practice_book";
const LEGACY = "rhythm_lab_documents_v1";
const makeDoc = () => ({
  ...createRhythmDocument({ title: "Rhythm practice", bpm: 120 }),
  hits: [
    { id: "first", onsetMs: 0, releaseMs: 180, midi: 60 },
    { id: "second", onsetMs: 500, releaseMs: 750, midi: 64 },
  ],
});
const book = async () => JSON.parse((await AsyncStorage.getItem(BOOK)) ?? "[]");

beforeEach(async () => {
  jest.restoreAllMocks();
  await AsyncStorage.clear();
});

test("saves a self-contained rhythm in the main book without overwriting other modes", async () => {
  const other = { id: "existing", label: "Keep", mode: "beat", marker: "preserve" };
  await AsyncStorage.setItem(BOOK, JSON.stringify([other]));
  const doc = makeDoc();
  doc.manualEvents = interpretRhythm(doc).events.map((event) => ({ ...event, locked: true }));
  await saveRhythmDocument(doc);
  const entries = await book();
  expect(entries).toHaveLength(2);
  expect(entries[1]).toEqual(other);
  expect(entries[0]).toMatchObject({
    mode: "rhythm", label: doc.title,
    rhythmDocument: { hits: doc.hits, manualEvents: doc.manualEvents, offsetMs: doc.offsetMs },
  });
  expect(filterPracticeBookEntries(entries, "rhythm")).toEqual([entries[0]]);
  expect(filterPracticeBookEntries(entries, "bar")).toEqual([]);
});

test("editing a saved rhythm updates its entry rather than duplicating it", async () => {
  const doc = makeDoc();
  await saveRhythmDocument(doc);
  const id = (await book())[0].id;
  await saveRhythmDocument({ ...doc, title: "Corrected", simplification: 0.65, offsetMs: 12 });
  expect(await book()).toHaveLength(1);
  expect((await book())[0]).toMatchObject({ id, label: "Corrected", rhythmDocument: { simplification: 0.65, offsetMs: 12 } });
});

test("legacy takes migrate intact and deleting them never resurrects an old copy", async () => {
  const doc = makeDoc();
  await AsyncStorage.setItem(LEGACY, JSON.stringify([doc]));
  expect((await listRhythmDocuments())[0].hits).toEqual(doc.hits);
  expect((await book())[0].rhythmDocument).toEqual(doc);
  expect(await AsyncStorage.getItem(LEGACY)).toBe("[]");
  await deleteRhythmDocument(doc.id);
  expect(await listRhythmDocuments()).toEqual([]);
  expect(await book()).toEqual([]);
});

test("a main-book rename is reflected when reopening its rhythm", async () => {
  await saveRhythmDocument(makeDoc());
  const entries = await book();
  entries[0].label = "Renamed in main book";
  await AsyncStorage.setItem(BOOK, JSON.stringify(entries));
  expect((await listRhythmDocuments())[0].title).toBe("Renamed in main book");
});

test("an older legacy copy cannot replace the canonical corrected rhythm", async () => {
  const original = makeDoc();
  await saveRhythmDocument({ ...original, title: "Canonical", offsetMs: 25 });
  await AsyncStorage.setItem(LEGACY, JSON.stringify([original]));
  expect((await listRhythmDocuments())[0]).toMatchObject({ title: "Canonical", offsetMs: 25 });
  expect(await book()).toHaveLength(1);
});

test("a failed destination write rejects and preserves the original legacy recording", async () => {
  const doc = makeDoc();
  await AsyncStorage.setItem(LEGACY, JSON.stringify([doc]));
  const originalSetItem = AsyncStorage.setItem;
  jest.spyOn(AsyncStorage, "setItem").mockImplementation(async (key, value) => {
    if (key === BOOK) throw new Error("storage full");
    return originalSetItem(key, value);
  });
  await expect(listRhythmDocuments()).rejects.toThrow("storage full");
  expect(JSON.parse((await AsyncStorage.getItem(LEGACY))!)).toEqual([doc]);
  expect(await AsyncStorage.getItem(BOOK)).toBeNull();
});

test("malformed main-book data is never overwritten by a rhythm save", async () => {
  await AsyncStorage.setItem(BOOK, '{"broken":true}');
  await expect(saveRhythmDocument(makeDoc())).rejects.toThrow("Invalid practice book");
  expect(await AsyncStorage.getItem(BOOK)).toBe('{"broken":true}');
});

test("serial rhythm saves retain both recordings", async () => {
  const first = makeDoc();
  const second = { ...makeDoc(), id: `${first.id}-other` };
  await Promise.all([saveRhythmDocument(first), saveRhythmDocument(second)]);
  expect((await listRhythmDocuments()).map((doc) => doc.id).sort()).toEqual([first.id, second.id].sort());
});

test("backup sanitization retains valid rhythm data and rejects invalid rhythm payloads", async () => {
  await saveRhythmDocument(makeDoc());
  const entry = (await book())[0];
  expect(sanitizePracticeEntry(JSON.parse(JSON.stringify(entry)))?.rhythmDocument).toEqual(entry.rhythmDocument);
  expect(sanitizePracticeEntry({ ...entry, imageUri: "javascript:alert(1)" })?.imageUri).toBeUndefined();
  expect(sanitizePracticeEntry({ ...entry, rhythmDocument: { version: -1 } })).toBeNull();
});
