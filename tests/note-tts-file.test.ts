import { prepareNoteTtsFile } from "../lib/note-tts-file";
import { NoteTtsSession, type NoteTtsNative } from "../lib/note-tts";
import { speechWav } from "./helpers/note-tts-wav-fixture";

let mockBytes: Uint8Array;
const mockWrite = jest.fn();
jest.mock("expo-file-system", () => ({
  File: class {
    exists = true; get size() { return mockBytes.length; }
    bytes = async () => mockBytes;
    write = mockWrite;
  },
}));
const result = { uri: "file:///app/tts-samples/voice.wav", duration: 0.02 };
function native(): jest.Mocked<NoteTtsNative> {
  return { getVoices: jest.fn(), getOfflineKoreanCountVoices: jest.fn().mockResolvedValue([]),
    generate: jest.fn().mockResolvedValue(result),
    claim: jest.fn().mockResolvedValue(undefined),
    discard: jest.fn().mockResolvedValue(undefined), cancel: jest.fn().mockResolvedValue(undefined),
    listFiles: jest.fn().mockResolvedValue([]) };
}
beforeEach(() => { mockBytes = speechWav(); mockWrite.mockReset(); });
test("rewrites the owned durable file, corrects duration, and preserves it after commit/reset", async () => {
  const n = native(), session = new NoteTtsSession(n, prepareNoteTtsFile);
  n.generate.mockResolvedValue({ ...result, duration: 0.5 });
  const prepared = await session.generate("시작", "installed");
  expect(prepared).toEqual(result);
  expect(mockWrite).toHaveBeenCalledTimes(1);
  expect(new DataView(mockWrite.mock.calls[0][0].buffer).getUint32(24, true)).toBe(44100);
  session.commit(prepared!.uri);
  await session.reset();
  expect(n.discard).not.toHaveBeenCalled();
});
test("invalid and unwritable generated files are discarded, never handed to the recorder", async () => {
  const n = native(), session = new NoteTtsSession(n, prepareNoteTtsFile);
  mockBytes = speechWav({ silent: true });
  await expect(session.generate("시작", "installed")).rejects.toThrow("invalidAudio");
  expect(mockWrite).not.toHaveBeenCalled();
  expect(n.discard).toHaveBeenCalledWith(result.uri);
  mockBytes = speechWav(); mockWrite.mockImplementationOnce(() => { throw new Error("disk"); });
  await expect(session.generate("시작", "installed")).rejects.toThrow("disk");
  expect(n.discard).toHaveBeenCalledTimes(2);
});
test("cancel during normalization cannot write or publish a late file", async () => {
  const n = native();
  let release!: () => void;
  let entered!: () => void;
  const started = new Promise<void>(yes => { entered = yes; });
  const gate = new Promise<void>(yes => { release = yes; });
  const session = new NoteTtsSession(n, async (output, current) => {
    entered(); await gate; return prepareNoteTtsFile(output, current);
  });
  const work = session.generate("시작", "installed");
  await started; await session.reset(); release();
  expect(await work).toBeNull();
  expect(mockWrite).not.toHaveBeenCalled();
  expect(n.discard).toHaveBeenCalledWith(result.uri);
});
