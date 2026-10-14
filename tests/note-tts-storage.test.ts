import AsyncStorage from "@react-native-async-storage/async-storage";
import { noteTtsNative } from "@/lib/note-tts-runtime";
import {
  attachNoteTtsPlayerLease,
  releaseNoteTtsPlayerLease,
  retainNoteTtsFile,
} from "@/lib/note-tts";
import { collectUnusedNoteTtsFiles, withNoteTtsStorageLock } from "@/lib/note-tts-storage";
import { saveNoteSamplesDurably } from "@/lib/note-samples";

jest.mock("@/lib/note-tts-runtime", () => ({
  noteTtsNative: {
    discard: jest.fn(),
    listFiles: jest.fn(),
  },
}));

const native = noteTtsNative as unknown as {
  discard: jest.Mock;
  listFiles: jest.Mock;
};
const sharedUri = "file:///app/files/tts-samples/12345678-1234-1234-1234-123456789abc.wav";
const unusedUri = "file:///app/files/tts-samples/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.wav";
const leasedUri = "file:///app/files/tts-samples/99999999-8888-7777-6666-555555555555.wav";

beforeEach(async () => {
  await (AsyncStorage as unknown as { __reset: () => void }).__reset();
  jest.clearAllMocks();
  const files = [sharedUri, unusedUri, leasedUri];
  native.listFiles.mockImplementation(async () => [...files]);
  native.discard.mockImplementation(async (uri: string) => {
    const index = files.indexOf(uri);
    if (index >= 0) files.splice(index, 1);
  });
});

test("keeps files referenced by global samples or nested practice-book entries and deletes only orphans", async () => {
  await AsyncStorage.setItem("@note_samples", JSON.stringify({ "0-0": `${sharedUri}#t=10,900` }));
  await AsyncStorage.setItem("practice_book", JSON.stringify([
    { noteSamples: { "1-0": sharedUri }, noteQueueEntries: [{ noteSamples: { "2-0": sharedUri } }] },
  ]));

  await collectUnusedNoteTtsFiles();

  expect(native.discard).toHaveBeenCalledTimes(2);
  expect(native.discard).toHaveBeenCalledWith(unusedUri);
  expect(native.discard).toHaveBeenCalledWith(leasedUri);
  expect(native.discard).not.toHaveBeenCalledWith(sharedUri);
});

test("preserves a file held by an active player/export until its final lease is released", async () => {
  const player = {};
  attachNoteTtsPlayerLease(player, leasedUri);
  const releaseExport = retainNoteTtsFile(leasedUri);
  await collectUnusedNoteTtsFiles();
  expect(native.discard).not.toHaveBeenCalledWith(leasedUri);

  releaseNoteTtsPlayerLease(player);
  await collectUnusedNoteTtsFiles();
  expect(native.discard).not.toHaveBeenCalledWith(leasedUri);

  releaseExport();
  await collectUnusedNoteTtsFiles();
  expect(native.discard).toHaveBeenCalledWith(leasedUri);
});

test("waits for reference writes before scanning storage", async () => {
  let releaseWrite!: () => void;
  const blocked = new Promise<void>((resolve) => { releaseWrite = resolve; });
  const write = withNoteTtsStorageLock(async () => {
    await blocked;
    await AsyncStorage.setItem("practice_book", JSON.stringify([{ noteSamples: { "0-0": sharedUri } }]));
  });
  const cleanup = collectUnusedNoteTtsFiles();
  releaseWrite();
  await Promise.all([write, cleanup]);

  expect(native.discard).not.toHaveBeenCalledWith(sharedUri);
});

test("a failed sample-map save does not run cleanup and cannot delete the previous URI", async () => {
  await AsyncStorage.setItem("@note_samples", JSON.stringify({ "0-0": sharedUri }));
  const setItem = jest.spyOn(AsyncStorage, "setItem").mockRejectedValue(new Error("storage full"));

  await expect(saveNoteSamplesDurably({})).resolves.toBe(false);
  expect(native.listFiles).not.toHaveBeenCalled();
  expect(native.discard).not.toHaveBeenCalled();
  setItem.mockRestore();
});
