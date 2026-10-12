import { createNativeVisualTimingProvider } from "@/lib/native-visual-timing";
import { createNativeAudioOutput } from "@/lib/native-audio-output";
import { createAudioPlayer } from "expo-audio";
import { MetronomeEngine } from "@/lib/metronome-engine";

jest.mock("expo-audio", () => ({ createAudioPlayer: jest.fn() }));
const makePlayer = () => ({
  playing: false, currentTime: 0, loop: false, volume: 1,
  play: jest.fn(), pause: jest.fn(), release: jest.fn(),
});

test("follows rendered position instead of a JS clock that is ahead", () => {
  const provider = createNativeVisualTimingProvider(() => 0.85);
  expect(provider(1020, 2000, true)).toBeCloseTo(850);
  expect(provider(1020, 2000, false)).toBeNull();
});
test("retains the current measure across native loop rollover and a JS stall", () => {
  const provider = createNativeVisualTimingProvider(() => 0.03);
  expect(provider(1980, 2000, true)).toBeCloseTo(2030);
  const caughtUp = createNativeVisualTimingProvider(() => 1.3);
  expect(caughtUp(1500, 2000, true)).toBeCloseTo(1300);
});
test("uses a dynamically replaced player and tolerates missing/released clocks", () => {
  let position: number | undefined = 0.4;
  const provider = createNativeVisualTimingProvider(() => position);
  expect(provider(500, 2000, true)).toBeCloseTo(400);
  position = 0.6;
  expect(provider(500, 2000, true)).toBeCloseTo(600);
  position = undefined;
  expect(provider(500, 2000, true)).toBeNull();
  position = NaN;
  expect(provider(500, 2000, true)).toBeNull();
  expect(createNativeVisualTimingProvider(() => { throw new Error("released"); })(500, 2000, true)).toBeNull();
});
test("native clock waits for playback, survives a transient status flip, and stops reading after release", () => {
  const player = makePlayer();
  jest.mocked(createAudioPlayer).mockReturnValue(player as any);
  const output = createNativeAudioOutput().rendered("file:///count.wav");
  const provider = createNativeVisualTimingProvider(output.getPositionSeconds);
  expect(provider(0, 2000, true)).toBeCloseTo(-10);
  expect(player.play).not.toHaveBeenCalled();
  player.playing = true;
  expect(output.getPositionSeconds()).toBe(0);
  player.currentTime = 0.5; player.playing = false;
  expect(provider(700, 2000, true)).toBeCloseTo(500);
  expect(player.pause).not.toHaveBeenCalled();
  expect(player.play).not.toHaveBeenCalled();
  output.release();
  expect(provider(700, 2000, true)).toBeNull();
  expect(player.release).toHaveBeenCalledTimes(1);
});

test("count beat indicators wait for native output and catch up after a stalled UI", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "performance")!;
  let now = 1000;
  Object.defineProperty(globalThis, "performance", { configurable: true, value: { now: () => now } });
  const engine = new MetronomeEngine();
  try {
    engine.setBpm(120); engine.setBeatsPerMeasure(4); engine.buildScheduleOnly();
    engine.setPreRenderedAudio(true);
    let position = -0.01;
    engine.setVisualTimingProvider(createNativeVisualTimingProvider(() => position));
    const beats: number[] = [];
    engine.setOnBeat((beat) => { beats.push(beat); });
    engine.start();
    const internal = engine as unknown as { loop: () => void };
    expect(beats).toEqual([]);
    now += 80; position = 0; internal.loop();
    expect(beats).toEqual([0]);
    now += 500; position = 0.5; internal.loop();
    expect(beats).toEqual([0, 1]);
    now += 800; position = 1.3; internal.loop();
    expect(beats).toEqual([0, 1, 2]);
    expect(engine.getMeasureElapsedMs()).toBe(1300);
  } finally {
    engine.stop();
    Object.defineProperty(globalThis, "performance", original);
  }
});
