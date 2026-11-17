import { createPolygonClock, polygonEffectiveBpm, type PolygonPlaybackRate } from "@/lib/polygon-clock";
import { buildPolygonSchedule, createPolygonScheduleRunner } from "@/lib/polygon-scheduler";

describe("Polygon common playback clock", () => {
  beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(0); });
  afterEach(() => jest.useRealTimers());

  function rig(bpm = 120, clockBpm = bpm) {
    let sessionId = 0;
    const events: { id: string; at: number; type: string }[] = [];
    const schedule = buildPolygonSchedule({
      beatsPerMeasure: 4,
      layers: [3, 4].map(sides => ({
        id: String(sides), sides, soundSet: "classic", role: "low" as const,
        volume: 0.7, offsets: [], beatTypes: [],
      })),
    });
    const runner = createPolygonScheduleRunner(event => {
      events.push({ id: event.id, at: Date.now(), type: event.type });
    });
    const boundary = jest.fn(() => { runner.cancelSession(sessionId++); });
    const clock = createPolygonClock({
      onBoundary: boundary,
      onBeat: (absoluteBeat, effectiveBpm) => runner.scheduleBeat({
        schedule, sessionId, absoluteBeat, bpm: effectiveBpm,
      }),
    });
    const pulse = (rate: PolygonPlaybackRate = 1) =>
      clock.pulse({ bpm, clockBpm, playbackRate: rate });
    const stop = () => { clock.dispose(); runner.dispose(); };
    return { clock, events, pulse, stop, boundary };
  }

  it.each([0.5, 1, 2] as const)("scales actual 3:4 output intervals by %s", rate => {
    const { pulse, events, stop } = rig();
    const period = 2000 / rate;
    for (let at = 0; at < period; at += 500) {
      pulse(rate);
      jest.advanceTimersByTime(Math.min(500, period - at));
    }
    const tri = events.filter(e => e.id.startsWith("3:"));
    const quad = events.filter(e => e.id.startsWith("4:"));
    expect(tri).toHaveLength(3);
    expect(quad).toHaveLength(4);
    tri.forEach((event, i) => expect(event.at).toBeCloseTo(Math.floor(period * i / 3), 0));
    expect(quad.map(event => event.at)).toEqual([0, period / 4, period / 2, period * 3 / 4]);
    stop();
  });

  it.each([20, 300])("does not clamp the effective tempo at display BPM %s", bpm => {
    expect(polygonEffectiveBpm(bpm, 2)).toBe(bpm * 2);
    expect(polygonEffectiveBpm(bpm, 0.5)).toBe(bpm / 2);
    for (const rate of [0.5, 2] as const) {
      jest.setSystemTime(0);
      const { pulse, events, stop } = rig(bpm);
      const span = 60000 / bpm;
      const period = span * 4 / rate;
      for (let at = 0; at < period - 0.01; at += span) {
        pulse(rate);
        jest.advanceTimersByTime(Math.min(span, period - at));
      }
      expect(events.filter(e => e.id.startsWith("4:")).map(e => e.at))
        .toEqual([0, period / 4, period / 2, period * 3 / 4]);
      stop();
    }
  });

  it.each([60, 240, 300])("normalizes a denominator-adjusted engine clock of %s BPM", clockBpm => {
    const { pulse, events, stop } = rig(120, clockBpm);
    const span = 60000 / clockBpm;
    for (let at = 0; at < 2000 - 0.01; at += span) {
      pulse(1);
      jest.advanceTimersByTime(Math.min(span, 2000 - at));
    }
    expect(events.filter(e => e.id.startsWith("4:")).map(e => e.at)).toEqual([0, 500, 1000, 1500]);
    stop();
  });

  it("commits one common boundary and cancels previous-rate offset events", () => {
    const { pulse, events, boundary, stop } = rig();
    pulse(0.5);
    jest.advanceTimersByTime(500);
    // The old triangular event at 1333ms must not survive this boundary.
    pulse(2);
    jest.advanceTimersByTime(500);
    pulse(2);
    jest.advanceTimersByTime(500);
    expect(boundary).toHaveBeenCalledTimes(2);
    expect(events.filter(e => e.id.startsWith("4:")).map(e => e.at))
      .toEqual([0, 500, 750, 1000, 1250]);
    expect(events.filter(e => e.id.startsWith("3:")).map(e => e.at))
      .toEqual([0, 500, 833, 1166]);
    stop();
  });

  it("rejects host-queued callbacks from the previous clock lifetime", () => {
    const callback = jest.fn();
    const clock = createPolygonClock({ onBoundary: jest.fn(), onBeat: callback });
    clock.pulse({ bpm: 120, clockBpm: 120, playbackRate: 2 });
    expect(callback).toHaveBeenCalledTimes(1);
    clock.reset();
    jest.advanceTimersByTime(1000);
    expect(callback).toHaveBeenCalledTimes(1);
    clock.pulse({ bpm: 120, clockBpm: 120, playbackRate: 0.5 });
    expect(callback).toHaveBeenLastCalledWith(0, 60);
    clock.dispose();
    jest.advanceTimersByTime(1000);
    clock.pulse({ bpm: 120, clockBpm: 120, playbackRate: 2 });
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it("fails explicitly on unsupported tempos or rates", () => {
    expect(() => polygonEffectiveBpm(301, 1)).toThrow(RangeError);
    expect(() => polygonEffectiveBpm(120, 3 as PolygonPlaybackRate)).toThrow(RangeError);
  });
});
