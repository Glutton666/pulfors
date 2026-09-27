import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prepareSparseClipFiles } from "../lib/audio-sparse-clip-preparation";
import { releaseRenderedWav, saveRenderedWav } from "../lib/audio-renderer";

jest.mock("../lib/audio-renderer", () => ({
  getRenderSampleRate: () => 44100,
  releaseRenderedWav: jest.fn(),
  saveRenderedWav: jest.fn(),
}));

const saveMock = saveRenderedWav as jest.MockedFunction<typeof saveRenderedWav>;
const releaseMock = releaseRenderedWav as jest.MockedFunction<typeof releaseRenderedWav>;

beforeEach(() => {
  jest.clearAllMocks();
  saveMock.mockImplementation(async (_pcm, filename) => `file:///private/${filename}`);
});

test("writes exact mono and stereo PCM slices for audible intervals", async () => {
  const left = new Float32Array(1000);
  const right = new Float32Array(1000);
  left.set([0.25, -0.5, 0.75], 10);
  right.set([0.1, 0.2, 0.3], 10);
  left.set([-0.125, 0.5], 500);

  const prepared = await prepareSparseClipFiles({ left, right });
  assert.equal(prepared.periodFrames, 1000);
  assert.deepEqual(prepared.clipDescriptors.map(({ startFrame, durationFrames }) => ({
    startFrame,
    durationFrames,
  })), [
    { startFrame: 10, durationFrames: 3 },
    { startFrame: 500, durationFrames: 2 },
  ]);
  const first = saveMock.mock.calls[0][0] as { left: Float32Array; right: Float32Array };
  assert.deepEqual(Array.from(first.left), [0.25, -0.5, 0.75]);
  assert.deepEqual(Array.from(first.right), Array.from(Float32Array.from([0.1, 0.2, 0.3])));
  const second = saveMock.mock.calls[1][0] as { left: Float32Array; right: Float32Array };
  assert.deepEqual(Array.from(second.left), [-0.125, 0.5]);
  assert.deepEqual(Array.from(second.right), [0, 0]);
  prepared.dispose();
  prepared.dispose();
  assert.equal(releaseMock.mock.calls.length, 2);
});

test("splits a wrapping region into a frame-zero head and period-ending tail", async () => {
  const pcm = new Float32Array(1000);
  pcm[0] = 0.1;
  pcm[1] = 0.2;
  pcm[998] = -0.3;
  pcm[999] = -0.4;

  const prepared = await prepareSparseClipFiles(pcm);
  const [head, tail] = prepared.clipDescriptors;
  assert.equal(head.startFrame, 0);
  assert.equal(head.durationFrames, 2);
  assert.equal(head.wrapRole, "head");
  assert.equal(tail.startFrame, 998);
  assert.equal(tail.durationFrames, 2);
  assert.equal(tail.startFrame + tail.durationFrames, prepared.periodFrames);
  assert.equal(tail.wrapRole, "tail");
  assert.equal(head.wrapGroupId, tail.wrapGroupId);
  assert.deepEqual(
    Array.from(saveMock.mock.calls[0][0] as Float32Array),
    Array.from(Float32Array.from([0.1, 0.2])),
  );
  assert.deepEqual(
    Array.from(saveMock.mock.calls[1][0] as Float32Array),
    Array.from(Float32Array.from([-0.3, -0.4])),
  );
  prepared.dispose();
});

test("accepts a silent loop without creating WAV files", async () => {
  const prepared = await prepareSparseClipFiles(new Float32Array(100));
  assert.equal(prepared.periodFrames, 100);
  assert.deepEqual(prepared.clipDescriptors, []);
  assert.equal(saveMock.mock.calls.length, 0);
  prepared.dispose();
  assert.equal(releaseMock.mock.calls.length, 0);
});

test("cleans already-written files when a later save fails", async () => {
  saveMock
    .mockResolvedValueOnce("file:///private/first.wav")
    .mockRejectedValueOnce(new Error("write failed"));
  const pcm = new Float32Array(1000);
  pcm[10] = 1;
  pcm[500] = 1;

  await assert.rejects(() => prepareSparseClipFiles(pcm), /write failed/);
  expect(releaseMock).toHaveBeenCalledTimes(1);
  expect(releaseMock).toHaveBeenCalledWith("file:///private/first.wav");
});

test("cleans completed writes when cancellation arrives during preparation", async () => {
  const controller = new AbortController();
  saveMock.mockImplementationOnce(async () => {
    controller.abort();
    return "file:///private/cancelled.wav";
  });
  const pcm = new Float32Array(100);
  pcm[10] = 1;

  await assert.rejects(
    () => prepareSparseClipFiles(pcm, { signal: controller.signal }),
    /EXPORT_ABORTED/,
  );
  expect(releaseMock).toHaveBeenCalledWith("file:///private/cancelled.wav");
});

test("unique filenames isolate concurrently prepared sessions from each other's cleanup", async () => {
  const now = jest.spyOn(Date, "now").mockReturnValue(1234);
  try {
    const pcm = new Float32Array(100);
    pcm[10] = 1;
    const first = await prepareSparseClipFiles(pcm);
    const second = await prepareSparseClipFiles(pcm);
    const firstUri = first.clipDescriptors[0].uri;
    const secondUri = second.clipDescriptors[0].uri;
    assert.notEqual(firstUri, secondUri);
    first.dispose();
    expect(releaseMock).toHaveBeenCalledTimes(1);
    expect(releaseMock).toHaveBeenCalledWith(firstUri);
    expect(releaseMock).not.toHaveBeenCalledWith(secondUri);
    second.dispose();
  } finally {
    now.mockRestore();
  }
});

test("rejects native period, per-file, aggregate-byte, custom-sample, and segment-count limits", async () => {
  await assert.rejects(
    () => prepareSparseClipFiles(new Float32Array(44100 * 60 * 60 + 1)),
    /one-hour period limit/,
  );

  const tooLongMonoClip = new Float32Array(524267);
  tooLongMonoClip.fill(0.5);
  await assert.rejects(() => prepareSparseClipFiles(tooLongMonoClip), /per-file 1 MiB WAV limit/);

  const custom = new Float32Array(100);
  custom[5] = 1;
  await assert.rejects(
    () => prepareSparseClipFiles(custom, { hasCustomSamples: true }),
    /does not support custom samples/,
  );

  const dense = new Float32Array(300000);
  for (let frame = 100; frame < 100 + 257 * 500; frame += 500) dense[frame] = 1;
  await assert.rejects(
    () => prepareSparseClipFiles(dense),
    /supports at most 256/,
  );
  assert.equal(saveMock.mock.calls.length, 0);
});

test("rejects a single session whose clips exceed the 16 MiB aggregate limit", async () => {
  const clipFrames = 262100;
  const intervalCount = 17;
  const periodFrames = intervalCount * (clipFrames + 300);
  const left = new Float32Array(periodFrames);
  const right = new Float32Array(periodFrames);
  for (let interval = 0; interval < intervalCount; interval++) {
    const start = interval * (clipFrames + 300);
    left.fill(0.5, start, start + clipFrames);
  }

  await assert.rejects(
    () => prepareSparseClipFiles({ left, right }),
    /16 MiB total preloaded-file limit/,
  );
  assert.equal(saveMock.mock.calls.length, 0);
});

test("accounts for WAV bytes retained by another prepared session until disposal", async () => {
  const clipFrames = 500000;
  const intervalCount = 9;
  const left = new Float32Array(intervalCount * (clipFrames + 300));
  for (let interval = 0; interval < intervalCount; interval++) {
    const start = interval * (clipFrames + 300);
    left.fill(0.5, start, start + clipFrames);
  }

  const first = await prepareSparseClipFiles(left);
  await assert.rejects(
    () => prepareSparseClipFiles(left),
    /16 MiB total preloaded-file limit across sessions/,
  );
  first.dispose();
  const afterRelease = await prepareSparseClipFiles(left);
  afterRelease.dispose();
});