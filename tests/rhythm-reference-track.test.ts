import { Platform } from "react-native";
import { createAudioPlayer } from "expo-audio";
import * as renderer from "../lib/audio-renderer";
import { createRhythmReferenceTrack } from "../lib/rhythm-lab/reference-track";

let mockDelay = 120;
let mockInterrupted = false;
let mockPreparation: Promise<Float32Array> | undefined;
let mockFile = 0;
let mockDurationMs = 0;
const mockPlayers: any[] = [];
const mockContext = { state: "running", currentTime: 10, resume: jest.fn() };
const mockWebStop = jest.fn();
jest.mock("../lib/audio-renderer", () => ({
  __esModule: true,
  ...jest.requireActual("../lib/audio-renderer"),
  loadAssetPCM: jest.fn(() => mockPreparation ?? Promise.resolve(new Float32Array([1, 0]))),
  saveRenderedWav: jest.fn(async (pcm: Float32Array) => {
    mockDurationMs = pcm.length / 44.1;
    return `file://reference-${++mockFile}.wav`;
  }),
  releaseRenderedWav: jest.fn(),
  getWebAudioContext: jest.fn(() => mockContext),
  playWebRenderedLoop: jest.fn((pcm: Float32Array, _end, _channel, _volume, _at, looping) => {
    const origin = performance.now() + 40;
    return {
      stop: mockWebStop, isRunning: () => !mockInterrupted && (looping || performance.now() - origin < pcm.length / 44.1),
      getPositionSeconds: () => Math.max(0, performance.now() - origin) / 1000,
      getPresentedPositionSeconds: () => (performance.now() - origin) / 1000,
    };
  }),
}));
jest.mock("expo-audio", () => ({
  createAudioPlayer: jest.fn(() => {
    let start: number | undefined;
    const duration = mockDurationMs;
    const player = {
      isLoaded: true, loop: false, volume: 0,
      get playing() { return start !== undefined && !mockInterrupted && (player.loop || performance.now() - start < duration); },
      get currentTime() {
        const elapsed = start === undefined ? 0 : Math.max(0, performance.now() - start);
        return (player.loop ? elapsed % duration : Math.min(elapsed, duration)) / 1000;
      },
      play: jest.fn(() => { start = performance.now() + mockDelay; }),
      pause: jest.fn(), remove: jest.fn(),
    };
    mockPlayers.push(player);
    return player;
  }),
}));

beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks();
  (Platform as any).OS = "android";
  mockDelay = 120; mockInterrupted = false; mockPreparation = undefined; mockPlayers.length = 0;
});
afterEach(() => jest.useRealTimers());
const advance = (ms: number) => jest.advanceTimersByTimeAsync(ms);

test.each([60, 230])("native track plays once and removes %ims variable startup from the observed origin", async (delay) => {
  mockDelay = delay;
  const session = createRhythmReferenceTrack(), started = jest.fn(), beat = jest.fn();
  const request = performance.now();
  const pending = session.start({ intervalMs: 500, onStarted: started, onBeat: beat });
  await advance(delay + 30); await pending;
  const timing = started.mock.calls[0][0];
  expect(timing.originMs).toBeCloseTo(request + delay);
  expect(timing.observedAtMs).toBeGreaterThan(timing.playRequestedAtMs + delay);
  expect(timing.clock).toBe("native-position-observation");
  expect(mockPlayers[0].loop).toBe(true);
  expect(createAudioPlayer).toHaveBeenCalledWith(expect.anything(), { updateInterval: 20 });
  const pcm = jest.mocked(renderer.saveRenderedWav).mock.calls[0][0] as Float32Array;
  // Test the actual shared renderer, not a mocked list of tick timestamps.
  const attacks = Array.from(pcm.entries()).filter(([, value]) => value > 0.01).map(([i]) => i);
  expect(attacks).toHaveLength(16);
  expect(attacks.slice(1).map((index, i) => index - attacks[i])).toEqual(Array(15).fill(22050));
  await advance(8000);
  expect(mockPlayers[0].play).toHaveBeenCalledTimes(1);
  expect(mockPlayers[0].remove).not.toHaveBeenCalled();
  expect(beat.mock.calls.at(-1)[1]).toBe(timing.originMs + beat.mock.calls.at(-1)[0] * timing.intervalMs);
  session.stop();
  expect(mockPlayers[0].pause).toHaveBeenCalledTimes(1);
  expect(mockPlayers[0].remove).toHaveBeenCalledTimes(1);
  expect(renderer.releaseRenderedWav).toHaveBeenCalledTimes(1);
});

test("nonintegral BPM retains a sample-accurate grid and file length", async () => {
  const session = createRhythmReferenceTrack();
  const pending = session.start({ intervalMs: 60000 / 92 });
  await advance(160); await pending;
  const pcm = jest.mocked(renderer.saveRenderedWav).mock.calls[0][0] as Float32Array;
  const attacks = Array.from(pcm.entries()).filter(([, value]) => value > 0.01).map(([i]) => i);
  const timing = session.getTiming()!;
  expect(attacks).toHaveLength(14);
  for (let i = 1; i < attacks.length; i++) {
    expect(Math.abs(attacks[i] - attacks[i - 1] - timing.intervalMs * 44.1)).toBeLessThanOrEqual(1.01);
  }
  expect(pcm.length / 44.1).toBeCloseTo(attacks.length * timing.intervalMs);
  session.stop();
});

test("stalled UI skips callbacks rather than replaying clicks or moving their deadlines", async () => {
  const session = createRhythmReferenceTrack(), beat = jest.fn();
  const pending = session.start({ intervalMs: 500, onBeat: beat });
  await advance(160); await pending;
  const origin = session.getTiming()!.originMs;
  const clock = jest.spyOn(performance, "now").mockReturnValue(origin + 2830);
  await advance(20);
  expect(beat.mock.calls.at(-1)).toEqual([5, origin + 2500]);
  expect(mockPlayers[0].play).toHaveBeenCalledTimes(1);
  clock.mockRestore(); session.stop();
});

test("cancelled preparation cannot create output or overwrite a restarted owner", async () => {
  let resolve!: (pcm: Float32Array) => void;
  mockPreparation = new Promise((done) => { resolve = done; });
  const session = createRhythmReferenceTrack(), stale = jest.fn();
  const old = session.start({ intervalMs: 500, onStarted: stale });
  session.stop(); mockPreparation = undefined;
  const next = session.start({ intervalMs: 400 });
  await advance(150); await next;
  resolve(new Float32Array([1, 0])); await old;
  expect(stale).not.toHaveBeenCalled();
  expect(mockPlayers).toHaveLength(1);
  expect(mockPlayers[0].remove).not.toHaveBeenCalled();
  expect(session.getTiming()!.intervalMs).toBe(400);
  session.stop();
});

test("cancel during native startup releases once and rejects late acceptance", async () => {
  const session = createRhythmReferenceTrack(), started = jest.fn();
  const pending = session.start({ intervalMs: 500, onStarted: started });
  await advance(40); session.stop(); await advance(200); await pending;
  expect(started).not.toHaveBeenCalled();
  expect(mockPlayers[0].remove).toHaveBeenCalledTimes(1);
  expect(renderer.releaseRenderedWav).toHaveBeenCalledTimes(1);
});

test("interruption stops the owner and reports failure instead of silently continuing the clock", async () => {
  const session = createRhythmReferenceTrack(), error = jest.fn();
  const pending = session.start({ intervalMs: 500, onError: error });
  await advance(150); await pending;
  mockInterrupted = true; await advance(30);
  expect(error).toHaveBeenCalledTimes(1);
  expect(session.getTiming()).toBeUndefined();
  expect(mockPlayers[0].remove).toHaveBeenCalledTimes(1);
});

test("web reserves one future finite buffer, uses presentation position and stops at the pass end", async () => {
  (Platform as any).OS = "web";
  const session = createRhythmReferenceTrack(), ended = jest.fn();
  const pending = session.start({ intervalMs: 500, beats: 20, onEnded: ended });
  await advance(50); await pending;
  expect(session.getTiming()!.originMs).toBe(40);
  expect(session.getTiming()!.clock).toBe("web-presentation");
  expect(renderer.playWebRenderedLoop).toHaveBeenCalledWith(expect.anything(), undefined, "both", 1, 10.04, false);
  await advance(10000);
  expect(ended).toHaveBeenCalledTimes(1);
  expect(renderer.playWebRenderedLoop).toHaveBeenCalledTimes(1);
  expect(renderer.saveRenderedWav).not.toHaveBeenCalled();
  expect(mockWebStop).toHaveBeenCalledTimes(1);
  expect(createAudioPlayer).not.toHaveBeenCalled();
});

test("failure to obtain native position times out without claiming a start", async () => {
  mockDelay = 10000;
  const session = createRhythmReferenceTrack(), started = jest.fn();
  const rejection = expect(session.start({ intervalMs: 500, onStarted: started })).rejects.toThrow("timed out");
  await advance(5100); await rejection;
  expect(started).not.toHaveBeenCalled();
  expect(mockPlayers[0].remove).toHaveBeenCalledTimes(1);
});

test.each([3, 20])("native %i-beat count-in/calibration is one finite file, not JS-stitched clicks", async (beats) => {
  const session = createRhythmReferenceTrack(), ended = jest.fn(), error = jest.fn();
  const pending = session.start({ intervalMs: 500, beats, onEnded: ended, onError: error });
  await advance(150); await pending;
  const player = mockPlayers[0];
  expect(player.loop).toBe(false);
  const pcm = jest.mocked(renderer.saveRenderedWav).mock.calls[0][0] as Float32Array;
  expect(pcm.length).toBe(beats * 22050);
  expect(Array.from(pcm).filter((value) => value > 0.01)).toHaveLength(beats);
  await advance(beats * 500);
  expect(player.playing).toBe(false);
  expect(player.play).toHaveBeenCalledTimes(1);
  expect(ended).toHaveBeenCalledTimes(1);
  expect(error).not.toHaveBeenCalled();
});
