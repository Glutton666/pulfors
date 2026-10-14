import { NoteTtsSession, validateNoteTtsText, noteTtsErrorCode, type NoteTtsNative, type NoteTtsResult } from "@/lib/note-tts";
import { noteTtsNative as webNative } from "@/lib/note-tts-runtime.web";
import { loadNoteSamples, saveNoteSamples } from "@/lib/note-samples";

function deferred() {
  let resolve!: (value: NoteTtsResult) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<NoteTtsResult>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const result = { uri: "file:///app/tts-samples/73b9bbcf-9a1b-4f84-9bb1-a6638ba19637.wav", duration: 2.5 };
function native(): jest.Mocked<NoteTtsNative> {
  return {
    getVoices: jest.fn().mockResolvedValue([]),
    getOfflineKoreanCountVoices: jest.fn().mockResolvedValue([]),
    generate: jest.fn().mockResolvedValue(result),
    cancel: jest.fn().mockResolvedValue(undefined),
    discard: jest.fn().mockResolvedValue(undefined),
  };
}
describe("Device-local TTS file ownership", () => {
  test("web is a hard unsupported gate, without a native engine", () => expect(webNative).toBeNull());
  test("rejects blank/overlong input and empty voice without starting synthesis", async () => {
    const engine = native();
    const session = new NoteTtsSession(engine);
    await expect(session.generate("  ", "voice")).rejects.toThrow("invalidText");
    await expect(session.generate("가".repeat(301), "voice")).rejects.toThrow("invalidText");
    await expect(session.generate("시작", "")).rejects.toThrow("noVoice");
    expect(engine.generate).not.toHaveBeenCalled();
    expect(validateNoteTtsText(" 시작 ")).toBe("시작");
    expect(validateNoteTtsText("가".repeat(300))).toHaveLength(300);
  });
  test("one explicit generation uses chosen voice, then discards an unsaved file on close", async () => {
    const engine = native(); const session = new NoteTtsSession(engine);
    expect(await session.generate(" 시작 ", "female-ko")).toEqual(result);
    expect(engine.generate).toHaveBeenCalledWith("시작", "female-ko", expect.any(String));
    await session.reset();
    expect(engine.discard).toHaveBeenCalledWith(result.uri);
  });
  test("saved files survive reset and reload via the existing import sample map", async () => {
    const engine = native(); const session = new NoteTtsSession(engine);
    await session.generate("시작", "male-ko");
    const uri = `${result.uri}#t=100,2200`;
    await saveNoteSamples({ "4-1~2": uri });
    session.commit(result.uri);
    await session.reset();
    expect(engine.discard).not.toHaveBeenCalled();
    expect(await loadNoteSamples()).toEqual({ "4-1~2": uri });
    expect(engine.generate).toHaveBeenCalledTimes(1);
  });
  test("close/slot/text change discards a late result instead of returning it", async () => {
    const engine = native(); const pending = deferred();
    engine.generate.mockReturnValueOnce(pending.promise);
    const session = new NoteTtsSession(engine);
    const generating = session.generate("옛 문장", "voice");
    await session.reset();
    expect(engine.cancel).toHaveBeenCalledWith(engine.generate.mock.calls[0][2]);
    pending.resolve(result);
    expect(await generating).toBeNull();
    expect(engine.discard).toHaveBeenCalledWith(result.uri);
  });
  test("a failed old generation cannot affect a restarted generation", async () => {
    const engine = native(); const old = deferred(); const next = deferred();
    engine.generate.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    const session = new NoteTtsSession(engine);
    const first = session.generate("처음", "voice-a");
    await session.reset();
    const second = session.generate("다음", "voice-b");
    old.reject(new Error("failed"));
    expect(await first).toBeNull();
    await expect(session.generate("겹침", "voice-b")).rejects.toThrow("busy");
    next.resolve(result);
    expect(await second).toEqual(result);
    expect(engine.generate.mock.calls[0][2]).not.toBe(engine.generate.mock.calls[1][2]);
  });
  test.each([
    { ...result, duration: 0 }, { ...result, duration: 31 },
    { ...result, duration: NaN }, { ...result, uri: "https://example.org/speech.wav" },
    { ...result, uri: "blob:temporary" },
  ])("invalid/overlong/nonpersistent output is never attached: %o", async (output) => {
    const engine = native(); engine.generate.mockResolvedValue(output);
    await expect(new NoteTtsSession(engine).generate("시작", "voice")).rejects.toThrow("tooLarge");
    expect(engine.discard).toHaveBeenCalledWith(output.uri);
  });
  test("known native errors are actionable and unknown exceptions do not leak raw errors", () => {
    expect(noteTtsErrorCode({ code: "noVoice" })).toBe("noVoice");
    expect(noteTtsErrorCode(new Error("timeout"))).toBe("timeout");
    expect(noteTtsErrorCode(new Error("native details"))).toBe("failed");
  });
});
