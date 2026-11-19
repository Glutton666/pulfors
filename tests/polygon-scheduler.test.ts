import {
  POLYGON_TICKS_PER_MEASURE,
  buildPolygonSchedule,
  createPolygonScheduleRunner,
  type PolygonScheduleLayer,
} from "@/lib/polygon-scheduler";

const layer = (
  id: string,
  sides: number,
  patch: Partial<PolygonScheduleLayer> = {},
): PolygonScheduleLayer => ({
  id,
  sides,
  soundSet: "classic",
  role: "low",
  volume: 1,
  offsets: [],
  beatTypes: [],
  ...patch,
});

describe("polygon integer scheduler", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("builds exactly N stable integer-tick events for each N-gon", () => {
    const layers = [layer("three", 3), layer("five", 5), layer("seven", 7)];
    const first = buildPolygonSchedule({ layers, beatsPerMeasure: 4 });
    const second = buildPolygonSchedule({ layers, beatsPerMeasure: 4 });

    expect(first.events).toHaveLength(15);
    expect(first.events.map((event) => event.id)).toEqual(
      second.events.map((event) => event.id),
    );
    expect(new Set(first.events.map((event) => event.id)).size).toBe(15);
    expect(first.events.every((event) =>
      Number.isInteger(event.slotTick) && Number.isInteger(event.tick)
    )).toBe(true);
  });

  it("builds exact integer positions for every supported side and meter", () => {
    for (let beats = 1; beats <= 16; beats++) {
      for (let sides = 1; sides <= 16; sides++) {
        const schedule = buildPolygonSchedule({
          beatsPerMeasure: beats,
          layers: [layer(`layer-${sides}`, sides)],
        });
        expect(schedule.events).toHaveLength(sides);
        expect(schedule.events.every((event) =>
          Number.isInteger(event.slotTick)
          && Number.isInteger(event.tick)
          && event.beat >= 0
          && event.beat < beats
        )).toBe(true);
      }
    }
  });

  it("keeps mute slots and quantizes offsets on the integer grid", () => {
    const schedule = buildPolygonSchedule({
      beatsPerMeasure: 4,
      layers: [layer("tri", 3, {
        offsets: [0, 0.5, 0],
        beatTypes: ["strong", "mute", "normal"],
      })],
    });

    expect(schedule.events.map((event) => event.type)).toEqual([
      "strong",
      "mute",
      "normal",
    ]);
    expect(schedule.events[1].slotTick).toBe(POLYGON_TICKS_PER_MEASURE / 3);
    expect(schedule.events[1].tick).toBe(POLYGON_TICKS_PER_MEASURE / 2);
  });

  it("advances a vertex across a beat boundary using the earlier beat callback", () => {
    const schedule = buildPolygonSchedule({
      beatsPerMeasure: 4,
      layers: [layer("quad", 4, { offsets: [0, -0.2] })],
    });
    const emit = jest.fn();
    const runner = createPolygonScheduleRunner(emit);
    runner.scheduleBeat({ sessionId: 1, schedule, absoluteBeat: 0, bpm: 120 });
    expect(emit.mock.calls.map(([event]) => event.vertex)).toEqual([0]);
    jest.advanceTimersByTime(399);
    expect(emit).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1);
    expect(emit.mock.calls.map(([event]) => event.vertex)).toEqual([0, 1]);
    runner.scheduleBeat({ sessionId: 1, schedule, absoluteBeat: 1, bpm: 120 });
    expect(emit).toHaveBeenCalledTimes(2);
  });

  it("plays an advanced first vertex at startup, then before the next measure only once", () => {
    const schedule = buildPolygonSchedule({
      beatsPerMeasure: 4,
      layers: [layer("quad", 4, { offsets: [-0.2] })],
    });
    const firstVertex = jest.fn();
    const runner = createPolygonScheduleRunner(event => {
      if (event.vertex === 0) firstVertex();
    });
    const fire = (absoluteBeat: number, nextSchedule = schedule) =>
      runner.scheduleBeat({ sessionId: 1, schedule: nextSchedule, absoluteBeat, bpm: 120 });
    fire(0);
    expect(firstVertex).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1500);
    fire(3);
    jest.advanceTimersByTime(399);
    expect(firstVertex).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1);
    expect(firstVertex).toHaveBeenCalledTimes(2);
    runner.cancelLayer(1, "quad");
    jest.advanceTimersByTime(100);
    // Returning to zero after the advance sounded must not repeat that same vertex.
    fire(4, buildPolygonSchedule({ beatsPerMeasure: 4, layers: [layer("quad", 4)] }));
    expect(firstVertex).toHaveBeenCalledTimes(2);
  });

  it("keeps startup and the upcoming advance separate in one-beat measures", () => {
    const schedule = buildPolygonSchedule({ beatsPerMeasure: 1, layers: [layer("pulse", 1, { offsets: [-0.5] })] });
    const emit = jest.fn();
    const runner = createPolygonScheduleRunner(emit);
    runner.scheduleBeat({ sessionId: 1, schedule, absoluteBeat: 0, bpm: 120 });
    expect(emit).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(250);
    expect(emit).toHaveBeenCalledTimes(2);
    jest.advanceTimersByTime(250);
    runner.scheduleBeat({ sessionId: 1, schedule, absoluteBeat: 1, bpm: 120 });
    expect(emit).toHaveBeenCalledTimes(2);
    jest.advanceTimersByTime(250);
    expect(emit).toHaveBeenCalledTimes(3);
  });

  it("delivers non-divisor layers without duplicate or missing occurrences", () => {
    const schedule = buildPolygonSchedule({
      beatsPerMeasure: 4,
      layers: [layer("three", 3), layer("five", 5), layer("seven", 7)],
    });
    const delivered: string[] = [];
    const runner = createPolygonScheduleRunner((event) => delivered.push(event.id));

    for (let beat = 0; beat < 4; beat++) {
      runner.scheduleBeat({ sessionId: 1, schedule, absoluteBeat: beat, bpm: 120 });
    }
    jest.runAllTimers();

    expect(delivered).toHaveLength(15);
    expect(new Set(delivered).size).toBe(15);
  });

  it("deduplicates repeated scheduling of the same beat occurrence", () => {
    const schedule = buildPolygonSchedule({
      beatsPerMeasure: 4,
      layers: [layer("five", 5)],
    });
    const delivered: string[] = [];
    const runner = createPolygonScheduleRunner((event) => delivered.push(event.id));
    const request = { sessionId: 2, schedule, absoluteBeat: 0, bpm: 120 };

    runner.scheduleBeat(request);
    runner.scheduleBeat(request);
    jest.runAllTimers();

    expect(delivered).toEqual(["five:0", "five:1"]);
  });

  it("cancels only the edited layer inside a session", () => {
    const schedule = buildPolygonSchedule({
      beatsPerMeasure: 4,
      layers: [
        layer("edited", 3, { offsets: [0.5, 0, 0] }),
        layer("kept", 3, { offsets: [0.5, 0, 0] }),
      ],
    });
    const delivered: string[] = [];
    const runner = createPolygonScheduleRunner((event) => delivered.push(event.id));

    runner.scheduleBeat({ sessionId: 3, schedule, absoluteBeat: 0, bpm: 120 });
    runner.cancelLayer(3, "edited");
    jest.runAllTimers();

    expect(delivered).toEqual(["kept:0"]);
  });

  it("cancels one session without touching another", () => {
    const schedule = buildPolygonSchedule({
      beatsPerMeasure: 4,
      layers: [layer("tri", 3, { offsets: [0.5, 0, 0] })],
    });
    const delivered: string[] = [];
    const runner = createPolygonScheduleRunner((event) => delivered.push(event.id));

    runner.scheduleBeat({ sessionId: 4, schedule, absoluteBeat: 0, bpm: 120 });
    runner.scheduleBeat({ sessionId: 5, schedule, absoluteBeat: 0, bpm: 120 });
    runner.cancelSession(4);
    jest.runAllTimers();

    expect(delivered).toEqual(["tri:0"]);
  });

  it("repeats stable event IDs once per later measure", () => {
    const schedule = buildPolygonSchedule({
      beatsPerMeasure: 4,
      layers: [layer("pulse", 1)],
    });
    const delivered: string[] = [];
    const runner = createPolygonScheduleRunner((event) => delivered.push(event.id));

    runner.scheduleBeat({ sessionId: 6, schedule, absoluteBeat: 0, bpm: 120 });
    runner.scheduleBeat({ sessionId: 6, schedule, absoluteBeat: 4, bpm: 120 });

    expect(delivered).toEqual(["pulse:0", "pulse:0"]);
  });

  it("keeps occurrence bookkeeping bounded over long sessions", () => {
    const schedule = buildPolygonSchedule({
      beatsPerMeasure: 4,
      layers: [layer("pulse", 1)],
    });
    const runner = createPolygonScheduleRunner(jest.fn());

    for (let measure = 0; measure < 200; measure++) {
      runner.scheduleBeat({
        sessionId: 7,
        schedule,
        absoluteBeat: measure * 4,
        bpm: 120,
      });
    }

    expect(runner.snapshot()).toEqual({
      pendingCount: 0,
      deliveredCount: 1,
    });
  });

  it("ignores an out-of-order callback from an earlier beat", () => {
    const schedule = buildPolygonSchedule({
      beatsPerMeasure: 4,
      layers: [layer("quad", 4)],
    });
    const delivered: string[] = [];
    const runner = createPolygonScheduleRunner((event) => delivered.push(event.id));

    runner.scheduleBeat({ sessionId: 8, schedule, absoluteBeat: 2, bpm: 120 });
    runner.scheduleBeat({ sessionId: 8, schedule, absoluteBeat: 1, bpm: 120 });

    expect(delivered).toEqual(["quad:2"]);
  });
});