/** @jest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { Platform } from "react-native";
import { useNoteTts } from "@/hooks/useNoteTts";
jest.mock("@/lib/note-tts-file", () => ({ prepareNoteTtsFile: async (result: unknown) => result }));
import { noteTtsNative } from "@/lib/note-tts-runtime";
import type { NoteTtsNative, NoteTtsResult } from "@/lib/note-tts";

jest.mock("@/lib/note-tts-runtime", () => ({
  noteTtsNative: { getVoices: jest.fn(), generate: jest.fn(), claim: jest.fn(), cancel: jest.fn(), discard: jest.fn(), listFiles: jest.fn() },
}));
jest.mock("@/lib/error-tracking", () => ({ captureBreadcrumb: jest.fn() }));
const native = noteTtsNative as jest.Mocked<NoteTtsNative>;
const output = { uri: "file:///app/tts-samples/test.wav", duration: 1.2 };
const voices = [
  { id: "m", name: "Male", language: "ko-KR", gender: "male" },
  { id: "f", name: "Female", language: "ko-KR", gender: "female" },
];
function pending() {
  let resolve!: (value: NoteTtsResult) => void;
  const promise = new Promise<NoteTtsResult>((yes) => { resolve = yes; });
  return { promise, resolve };
}
beforeEach(() => {
  jest.clearAllMocks();
  Platform.OS = "ios";
  native.getVoices.mockResolvedValue(voices as any);
  native.generate.mockResolvedValue(output);
  native.claim.mockResolvedValue(undefined);
  native.cancel.mockResolvedValue(undefined);
  native.discard.mockResolvedValue(undefined);
});
function harness() {
  const generated = jest.fn(); const invalidated = jest.fn();
  const hook = renderHook(({ visible, target }) => useNoteTts(visible, target, generated, invalidated),
    { initialProps: { visible: true, target: "0-0-0" } });
  return { ...hook, generated, invalidated };
}
async function ready(h: ReturnType<typeof harness>) {
  await act(async () => { await h.result.current.loadVoices(); });
  act(() => { h.result.current.changeText("시작"); });
}
test("explicit generation hands the actual file, voice and text to trim UI once", async () => {
  const h = harness(); await ready(h);
  act(() => h.result.current.changeVoice("f"));
  await act(async () => { await h.result.current.generate(); });
  expect(h.generated).toHaveBeenCalledWith(output, "시작");
  expect(native.generate).toHaveBeenCalledWith("시작", "f", expect.any(String));
  expect(h.result.current.status).toBe("ready");
  act(() => h.result.current.commit(output.uri));
  h.unmount();
  expect(native.discard).not.toHaveBeenCalled();
});
test.each(["close", "slot", "text", "voice", "cancel"])("%s invalidates a late result", async (change) => {
  const h = harness(); await ready(h);
  const work = pending(); native.generate.mockReturnValueOnce(work.promise);
  let generation!: Promise<void>;
  act(() => { generation = h.result.current.generate(); });
  act(() => {
    if (change === "close") h.rerender({ visible: false, target: "0-0-0" });
    if (change === "slot") h.rerender({ visible: true, target: "0-0-2" });
    if (change === "text") h.result.current.changeText("변경");
    if (change === "voice") h.result.current.changeVoice("f");
    if (change === "cancel") h.result.current.reset();
  });
  await act(async () => { work.resolve(output); await generation; });
  expect(h.generated).not.toHaveBeenCalled();
  expect(native.cancel).toHaveBeenCalledTimes(1);
  expect(native.discard).toHaveBeenCalledWith(output.uri);
});
test("double press cannot suppress a valid generation or start a second job", async () => {
  const h = harness(); await ready(h);
  const work = pending(); native.generate.mockReturnValueOnce(work.promise);
  let first!: Promise<void>; let second!: Promise<void>;
  act(() => { first = h.result.current.generate(); second = h.result.current.generate(); });
  expect(native.generate).toHaveBeenCalledTimes(1);
  await act(async () => { work.resolve(output); await Promise.all([first, second]); });
  expect(h.generated).toHaveBeenCalledTimes(1);
});
test("failure is displayed, retry works, and an empty voice list is actionable", async () => {
  const h = harness(); await ready(h);
  native.generate.mockRejectedValueOnce({ code: "timeout" });
  await act(async () => { await h.result.current.generate(); });
  expect(h.result.current.error).toBe("timeout");
  await act(async () => { await h.result.current.generate(); });
  expect(h.generated).toHaveBeenCalledTimes(1);
  native.getVoices.mockResolvedValueOnce([]);
  await act(async () => { await h.result.current.loadVoices(); });
  expect(h.result.current.error).toBe("noVoice");
});
test("web never queries voices or generates audio", async () => {
  Platform.OS = "web";
  const h = harness();
  await act(async () => { await h.result.current.loadVoices(); await h.result.current.generate(); });
  expect(h.result.current.status).toBe("unavailable");
  expect(native.getVoices).not.toHaveBeenCalled();
  expect(native.generate).not.toHaveBeenCalled();
});
