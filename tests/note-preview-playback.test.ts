import { startNotePreview } from "../lib/note-preview-playback";

function player() {
  return { isLoaded: true, duration: 1, pause: jest.fn(), replace: jest.fn(),
    play: jest.fn(), seekTo: jest.fn().mockResolvedValue(undefined) };
}
test("configures the new loaded source, awaits seek, then plays", async () => {
  const p = player(), configure = jest.fn();
  expect(await startNotePreview(p, "file://voice.wav", 0.25, () => false, configure)).toBe(true);
  expect(p.replace).toHaveBeenCalledWith({ uri: "file://voice.wav" });
  expect(configure.mock.invocationCallOrder[0]).toBeGreaterThan(p.replace.mock.invocationCallOrder[0]);
  expect(p.play.mock.invocationCallOrder[0]).toBeGreaterThan(p.seekTo.mock.invocationCallOrder[0]);
});
test.each(["replace", "seek", "play"])("%s failures are not reported as successful playback", async stage => {
  const p = player();
  if (stage === "replace") p.replace.mockImplementation(() => { throw new Error("source"); });
  if (stage === "seek") p.seekTo.mockRejectedValue(new Error("seek"));
  if (stage === "play") p.play.mockImplementation(() => Promise.reject(new Error("play")));
  await expect(startNotePreview(p, "file://voice.wav", 0, () => false)).rejects.toThrow();
  if (stage !== "play") expect(p.play).not.toHaveBeenCalled();
});
test("positive stale duration does not bypass readiness or load timeout", async () => {
  jest.useFakeTimers();
  try {
    const p = player(); p.isLoaded = false;
    const work = startNotePreview(p, "file://voice.wav", 0, () => false);
    const checked = expect(work).rejects.toThrow("previewLoad");
    await jest.advanceTimersByTimeAsync(3040);
    await checked;
    expect(p.seekTo).not.toHaveBeenCalled(); expect(p.play).not.toHaveBeenCalled();
  } finally { jest.useRealTimers(); }
});
test("accepted but suppressed playback is surfaced as an error", async () => {
  jest.useFakeTimers();
  try {
    const p = { ...player(), playing: false, currentTime: 0 };
    const work = startNotePreview(p, "file://voice.wav", 0, () => false);
    const checked = expect(work).rejects.toThrow("previewPlay");
    await jest.advanceTimersByTimeAsync(1560);
    await checked;
  } finally { jest.useRealTimers(); }
});
test("closing while loading rejects late playback without touching a newer source", async () => {
  jest.useFakeTimers();
  try {
    const p = player(); p.isLoaded = false; let cancelled = false;
    const work = startNotePreview(p, "file://old.wav", 0, () => cancelled);
    await jest.advanceTimersByTimeAsync(40); cancelled = true;
    await jest.advanceTimersByTimeAsync(40);
    expect(await work).toBe(false); expect(p.play).not.toHaveBeenCalled();
  } finally { jest.useRealTimers(); }
});
test("a new preview waits for the old seek to finish, and only the latest one plays", async () => {
  const p = player(); let finish!: () => void; let cancel = false;
  p.seekTo.mockReturnValueOnce(new Promise<void>(yes => { finish = yes; }));
  const old = startNotePreview(p, "file://old.wav", 0.1, () => cancel);
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  cancel = true;
  const latest = startNotePreview(p, "file://new.wav", 0.2, () => false);
  finish();
  expect(await old).toBe(false); expect(await latest).toBe(true);
  expect(p.replace.mock.calls).toEqual([[{ uri: "file://old.wav" }], [{ uri: "file://new.wav" }]]);
  expect(p.play).toHaveBeenCalledTimes(1);
});
