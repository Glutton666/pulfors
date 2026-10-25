import AsyncStorage from "@react-native-async-storage/async-storage";
import { createRhythmDocument } from "../lib/rhythm-lab/engine";
import { createRhythmRecovery, RHYTHM_RECOVERY_KEY } from "../lib/rhythm-lab/recovery";

const take = (id: string) => ({
  ...createRhythmDocument({ title: id, bpm: 120 }), id,
  hits: [{ id: `${id}-hit`, onsetMs: 0, releaseMs: 100, drum: "snare" as const }],
});
beforeEach(async () => { jest.restoreAllMocks(); await AsyncStorage.clear(); });

test("keeps a synchronous independent snapshot before any storage operation completes", async () => {
  const store = createRhythmRecovery();
  const doc = take("previous");
  store.remember(doc, true);
  doc.hits[0].releaseMs = 999;
  expect(store.snapshot().previous!.hits[0].releaseMs).toBe(100);
  await store.flush();
  const reopened = createRhythmRecovery();
  await reopened.load();
  expect(reopened.snapshot().previous!.hits[0].releaseMs).toBe(100);
});

test("slow startup read merges disk documents without overwriting newer in-memory snapshots", async () => {
  const stored = take("same");
  const read = jest.spyOn(AsyncStorage, "getItem");
  let finish!: (value: string) => void;
  read.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const store = createRhythmRecovery();
  const pending = store.load();
  const updated = { ...stored, title: "updated in memory" };
  store.remember(updated, true);
  finish(JSON.stringify({ version: 1, previousId: "disk", documents: [stored, take("disk")] }));
  await pending;
  expect(store.snapshot().previous!.title).toBe("updated in memory");
  await store.flush();
  const data = JSON.parse((await AsyncStorage.getItem(RHYTHM_RECOVERY_KEY))!);
  expect(data.documents.map((doc: any) => doc.id).sort()).toEqual(["disk", "same", "same_recovery_1"]);
  expect(data.documents.find((doc: any) => doc.id === "same").title).toBe("updated in memory");
  expect(data.documents.find((doc: any) => doc.id === "same_recovery_1").title).toBe("same");
});

test("changes made during an in-flight write are persisted after it, not overwritten by it", async () => {
  const original = AsyncStorage.setItem.bind(AsyncStorage);
  let complete!: () => void;
  jest.spyOn(AsyncStorage, "setItem").mockImplementationOnce((key, value) =>
    new Promise<void>((resolve) => { complete = () => { void original(key, value).then(resolve); }; }));
  const store = createRhythmRecovery();
  store.remember(take("first"), true);
  const writing = store.flush();
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  store.remember(take("second"), true);
  complete();
  await writing;
  const reopened = createRhythmRecovery();
  await reopened.load();
  expect(reopened.snapshot().previous!.id).toBe("second");
  expect(JSON.parse((await AsyncStorage.getItem(RHYTHM_RECOVERY_KEY))!).documents).toHaveLength(2);
});

test("write failure leaves disk untouched and memory recoverable; retry persists all takes", async () => {
  const old = createRhythmRecovery();
  old.remember(take("old"), true);
  await old.flush();
  const before = await AsyncStorage.getItem(RHYTHM_RECOVERY_KEY);
  const store = createRhythmRecovery();
  await store.load();
  store.remember(take("new"), true);
  jest.spyOn(AsyncStorage, "setItem").mockRejectedValueOnce(new Error("full"));
  await store.flush();
  expect(store.snapshot()).toMatchObject({ error: true, previous: { id: "new" } });
  expect(await AsyncStorage.getItem(RHYTHM_RECOVERY_KEY)).toBe(before);
  await store.flush();
  expect(store.snapshot().error).toBe(false);
  expect(JSON.parse((await AsyncStorage.getItem(RHYTHM_RECOVERY_KEY))!).documents).toHaveLength(2);
});

test("unreadable durable recovery is not overwritten with a partial memory collection", async () => {
  await AsyncStorage.setItem(RHYTHM_RECOVERY_KEY, '{"damaged":true}');
  const store = createRhythmRecovery();
  store.remember(take("live"), true);
  await store.flush();
  expect(store.snapshot()).toMatchObject({ error: true, previous: { id: "live" } });
  expect(await AsyncStorage.getItem(RHYTHM_RECOVERY_KEY)).toBe('{"damaged":true}');
});

test("empty workspace visits never replace the previous work pointer", async () => {
  const store = createRhythmRecovery();
  store.remember(take("keep"), true);
  store.remember(createRhythmDocument(), true);
  expect(store.snapshot().previous!.id).toBe("keep");
  await store.flush();
});

test("opening a stale saved document preserves the newer same-ID recovery as a selectable version", async () => {
  const old = take("saved");
  const newer = { ...old, title: "newer unsaved", hits: [{ ...old.hits[0], releaseMs: 900 }] };
  const store = createRhythmRecovery();
  store.remember(newer, true);
  await store.flush();
  const cold = createRhythmRecovery();
  // The document effect runs before the cold recovery read finishes.
  cold.remember(old, false, true);
  await cold.load();
  const copy = cold.snapshot().documents.find((item) => item.id !== old.id)!;
  expect(copy.title).toBe("newer unsaved");
  expect(copy.hits[0].releaseMs).toBe(900);
  await cold.flush();
  const warm = createRhythmRecovery();
  await warm.load();
  warm.remember({ ...old, title: "another saved version" }, false, true);
  expect(warm.snapshot().documents.map((item) => item.title)).toEqual(expect.arrayContaining(["newer unsaved", "saved", "another saved version"]));
});

test("cold-load conflict copies cannot replace a different stored recovery version with the generated ID", async () => {
  await AsyncStorage.setItem(RHYTHM_RECOVERY_KEY, JSON.stringify({ version: 1, previousId: "saved",
    documents: [take("saved"), take("saved_recovery_1")] }));
  const store = createRhythmRecovery();
  store.remember({ ...take("saved"), title: "current version" });
  await store.load();
  expect(store.snapshot().documents.map((item) => item.id).sort()).toEqual(["saved", "saved_recovery_1", "saved_recovery_2"]);
});
