import { beforeEach, expect, jest, test } from "@jest/globals";
import { prepareSparseEvents } from "../lib/audio-sparse-event-preparation";
import type { ClickPCMs, SamplePCMEntry, TickInfo } from "../lib/audio-renderer";
import { releaseRenderedWav, saveRenderedWav } from "../lib/audio-renderer";

jest.mock("../lib/audio-renderer", () => ({
  getRenderSampleRate: () => 44100,
  releaseRenderedWav: jest.fn(),
  resampleForPlaybackSpeed: (pcm: Float32Array, speed = 1) => {
    const clamped = Math.max(0.5, Math.min(2, speed));
    if (clamped === 1) return pcm;
    const length = Math.max(1, Math.floor(pcm.length / clamped));
    return Float32Array.from({ length }, (_, index) => pcm[Math.floor(index * clamped)] ?? 0);
  },
  saveRenderedWav: jest.fn(),
}));

const saveMock = jest.mocked(saveRenderedWav);
const releaseMock = jest.mocked(releaseRenderedWav);

const makeTick = (overrides: Partial<TickInfo> = {}): TickInfo => ({
  time: 0,
  type: "normal",
  beat: 0,
  subBeat: 0,
  repeatIteration: 0,
  barRepeatIteration: 0,
  ...overrides,
});

const makeClicks = (): ClickPCMs => ({
  strong: Float32Array.from([0.1, -0.1]),
  high: Float32Array.from([0.2, -0.2]),
  low: Float32Array.from([0.3, -0.3]),
});

const makeSample = (
  pcm: number[],
  trimStartMs = 0,
  trimDurationMs = 0,
): SamplePCMEntry => ({
  pcm: Float32Array.from(pcm),
  trimStartMs,
  trimDurationMs,
});

beforeEach(() => {
  jest.clearAllMocks();
  saveMock.mockImplementation(async (_pcm, filename) => `file:///private/${filename}`);
});

test("creates one reusable click voice with a descriptor for each scheduled event", async () => {
  const clicks = makeClicks();
  const prepared = await prepareSparseEvents({
    schedule: [
      makeTick({ time: 2 }),
      makeTick({ time: 8 }),
      makeTick({ time: 5, type: "strong" }),
      makeTick({ time: 6, type: "accent" }),
    ],
    measureDurationMs: 10,
    clickPCMs: clicks,
    samplePCMs: new Map(),
    clickVolume: 0.5,
    outputGain: 0.8,
    sampleVolume: 1,
  });

  expect(prepared.periodFrames).toBe(441);
  expect(prepared.clipDescriptors.map(({ startFrame, durationFrames }) => ({
    startFrame,
    durationFrames,
  }))).toEqual([
    { startFrame: 88, durationFrames: 2 },
    { startFrame: 353, durationFrames: 2 },
    { startFrame: 221, durationFrames: 2 },
    { startFrame: 265, durationFrames: 2 },
  ]);
  expect(new Set(prepared.clipDescriptors.slice(0, 2).map((clip) => clip.uri)).size).toBe(1);
  expect(saveMock).toHaveBeenCalledTimes(3);
  expect(Array.from(saveMock.mock.calls[0][0] as Float32Array)[0]).toBeCloseTo(0.12);
  expect(Array.from(saveMock.mock.calls[0][0] as Float32Array)[1]).toBeCloseTo(-0.12);
  prepared.dispose();
  prepared.dispose();
  expect(releaseMock).toHaveBeenCalledTimes(3);
});

test("preserves layer click choice, per-beat stereo routing, and sample slots", async () => {
  const defaultClicks = makeClicks();
  const layerClicks: ClickPCMs = {
    strong: Float32Array.from([0.8]),
    high: Float32Array.from([0.7]),
    low: Float32Array.from([0.6]),
  };
  const samples = new Map<string, SamplePCMEntry>([
    ["0-0", makeSample([0.1, 0.2])],
    ["0-0~1", makeSample([0.3, 0.4])],
    ["0-0~2", makeSample([0.5, 0.6])],
  ]);
  const prepared = await prepareSparseEvents({
    schedule: [
      makeTick({ time: 0, layerIndex: 1, layerSoundSet: "layer-a" }),
      makeTick({ time: 3, repeatIteration: 1 }),
      makeTick({ time: 5, type: "mute" }),
    ],
    measureDurationMs: 10,
    clickPCMs: defaultClicks,
    layerClickPCMs: new Map([["layer-a", layerClicks]]),
    samplePCMs: samples,
    clickVolume: 1,
    outputGain: 0.5,
    sampleVolume: 0.5,
    sampleVolumes: { "0-0": 0.4, "0-0~1": 0.6, "0-0~2": 0.8 },
    sampleChannels: { "0-0": "left", "0-0~1": "right" },
    metroChannelsByBeat: { "0": "right", "1": "off" },
  });

  expect(prepared.clipDescriptors).toHaveLength(5);
  const click = saveMock.mock.calls.find(([pcm]) =>
    !(pcm instanceof Float32Array) &&
    Array.from((pcm as { left: Float32Array }).left).every((value) => value === 0),
  )?.[0] as { left: Float32Array; right: Float32Array };
  expect(Array.from(click.left)).toEqual([0]);
  expect(click.right[0]).toBeCloseTo(0.3);

  const leftSample = saveMock.mock.calls.find(([pcm]) =>
    !(pcm instanceof Float32Array) &&
    Array.from((pcm as { right: Float32Array }).right).every((value) => value === 0),
  )?.[0] as { left: Float32Array; right: Float32Array };
  expect(Array.from(leftSample.left)[0]).toBeCloseTo(0.01);
  expect(Array.from(leftSample.left)[1]).toBeCloseTo(0.02);
  expect(Array.from(leftSample.right)).toEqual([0, 0]);

  const rightSample = saveMock.mock.calls.find(([pcm]) =>
    !(pcm instanceof Float32Array) &&
    (pcm as { right: Float32Array }).right.length === 2 &&
    Array.from((pcm as { left: Float32Array }).left).every((value) => value === 0) &&
    (pcm as { right: Float32Array }).right[0] > 0,
  )?.[0] as { left: Float32Array; right: Float32Array };
  expect(Array.from(rightSample.right)[0]).toBeCloseTo(0.045);
  expect(Array.from(rightSample.right)[1]).toBeCloseTo(0.06);
  prepared.dispose();
});

test("keeps long samples intact when their tail crosses the loop boundary", async () => {
  const longSample = makeSample(Array.from({ length: 900 }, (_, index) => index / 1000));
  const prepared = await prepareSparseEvents({
    schedule: [makeTick({ time: 9 })],
    measureDurationMs: 10,
    clickPCMs: makeClicks(),
    samplePCMs: new Map([["0-0", longSample]]),
    clickVolume: 0,
    outputGain: 1,
    sampleVolume: 1,
  });

  const sampleEvent = prepared.clipDescriptors[0];
  expect(sampleEvent.startFrame).toBe(397);
  expect(sampleEvent.durationFrames).toBe(900);
  expect(sampleEvent.startFrame + sampleEvent.durationFrames).toBeGreaterThan(prepared.periodFrames);
  expect(saveMock).toHaveBeenCalledTimes(1);
  expect(Array.from(saveMock.mock.calls[0][0] as Float32Array)).toHaveLength(900);
  prepared.dispose();
});

test("trims and speed-adjusts sample voices before applying sample gain", async () => {
  const prepared = await prepareSparseEvents({
    schedule: [makeTick()],
    measureDurationMs: 10,
    clickPCMs: makeClicks(),
    samplePCMs: new Map([["0-0", makeSample([1, 2, 3, 4, 5], 1000 / 44100, 3 * 1000 / 44100)]]),
    clickVolume: 0,
    outputGain: 0.5,
    sampleVolume: 0.8,
    sampleVolumes: { "0-0": 0.5 },
    sampleSpeeds: { "0-0": 2 },
  });

  expect(prepared.clipDescriptors).toHaveLength(1);
  expect(prepared.clipDescriptors[0].durationFrames).toBe(1);
  expect(Array.from(saveMock.mock.calls[0][0] as Float32Array)[0]).toBeCloseTo(0.4);
  prepared.dispose();
});

test("silence, mute ticks, disabled metro channels, and repeated sample iterations create no events", async () => {
  const prepared = await prepareSparseEvents({
    schedule: [
      makeTick({ type: "mute" }),
      makeTick({ time: 2, repeatIteration: 1 }),
      makeTick({ time: 3, barRepeatIteration: 1 }),
    ],
    measureDurationMs: 10,
    clickPCMs: { strong: new Float32Array(0), high: new Float32Array(0), low: new Float32Array(0) },
    samplePCMs: new Map([["0-0", makeSample([1])]]),
    clickVolume: 1,
    outputGain: 1,
    sampleVolume: 1,
    metroChannelsByBeat: { "0": "off" },
  });

  expect(prepared.clipDescriptors).toEqual([]);
  expect(saveMock).not.toHaveBeenCalled();
  prepared.dispose();
});

test("rejects event, duration, non-finite PCM, and volume limits with cleanup", async () => {
  const tooManyEvents = Array.from({ length: 257 }, (_, index) =>
    makeTick({ time: index % 10 }),
  );
  await expect(prepareSparseEvents({
    schedule: tooManyEvents,
    measureDurationMs: 10,
    clickPCMs: makeClicks(),
    samplePCMs: new Map(),
    clickVolume: 1,
    outputGain: 1,
    sampleVolume: 1,
  })).rejects.toThrow(/256-event limit/);
  expect(releaseMock).toHaveBeenCalledTimes(1);

  await expect(prepareSparseEvents({
    schedule: [makeTick()],
    measureDurationMs: 10,
    clickPCMs: makeClicks(),
    samplePCMs: new Map([["0-0", makeSample([1])]]),
    clickVolume: 1,
    outputGain: 1,
    sampleVolume: 1,
    sampleSpeeds: { "0-0": Number.POSITIVE_INFINITY },
  })).rejects.toThrow(/must be finite/);

  await expect(prepareSparseEvents({
    schedule: [makeTick()],
    measureDurationMs: 10,
    clickPCMs: { ...makeClicks(), low: Float32Array.from([Number.NaN]) },
    samplePCMs: new Map(),
    clickVolume: 1,
    outputGain: 1,
    sampleVolume: 1,
  })).rejects.toThrow(/non-finite sample/);

  await expect(prepareSparseEvents({
    schedule: [],
    measureDurationMs: 10,
    clickPCMs: makeClicks(),
    samplePCMs: new Map(),
    clickVolume: Number.POSITIVE_INFINITY,
    outputGain: 1,
    sampleVolume: 1,
  })).rejects.toThrow(/finite, non-negative/);
});

test("cancellation during a WAV write releases that private file", async () => {
  const controller = new AbortController();
  saveMock.mockImplementationOnce(async (_pcm, filename) => {
    controller.abort();
    return `file:///private/${filename}`;
  });

  await expect(prepareSparseEvents({
    schedule: [makeTick()],
    measureDurationMs: 10,
    clickPCMs: makeClicks(),
    samplePCMs: new Map(),
    clickVolume: 1,
    outputGain: 1,
    sampleVolume: 1,
  }, { signal: controller.signal })).rejects.toThrow("RENDER_ABORTED");
  expect(releaseMock).toHaveBeenCalledTimes(1);
});

test("unique file names keep disposal of concurrent preparations isolated", async () => {
  const first = await prepareSparseEvents({
    schedule: [makeTick()],
    measureDurationMs: 10,
    clickPCMs: makeClicks(),
    samplePCMs: new Map(),
    clickVolume: 1,
    outputGain: 1,
    sampleVolume: 1,
  });
  const second = await prepareSparseEvents({
    schedule: [makeTick()],
    measureDurationMs: 10,
    clickPCMs: makeClicks(),
    samplePCMs: new Map(),
    clickVolume: 1,
    outputGain: 1,
    sampleVolume: 1,
  });

  expect(first.clipDescriptors[0].uri).not.toBe(second.clipDescriptors[0].uri);
  first.dispose();
  expect(releaseMock).toHaveBeenCalledWith(first.clipDescriptors[0].uri);
  expect(releaseMock).not.toHaveBeenCalledWith(second.clipDescriptors[0].uri);
  second.dispose();
});