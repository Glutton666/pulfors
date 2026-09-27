import assert from "node:assert/strict";
import { MetronomeEngine } from "../lib/metronome-engine";

function mainBeatOrder(engine: MetronomeEngine): number[] {
  return engine.getScheduleInfo().ticks
    .filter(tick => tick.isMainBeat)
    .map(tick => tick.beat);
}

function createRandomEngine(): MetronomeEngine {
  const engine = new MetronomeEngine();
  engine.setBeatsPerMeasure(4);
  engine.setBlockPlayMode("random");
  return engine;
}

test("random Bar next pass is selected once and consumed unchanged at rollover", () => {
  const originalRandom = Math.random;
  const engine = createRandomEngine();
  let randomCalls = 0;

  try {
    Math.random = () => {
      randomCalls += 1;
      return 0;
    };
    engine.buildScheduleOnly();
    assert.deepEqual(mainBeatOrder(engine), [1, 2, 3, 0]);
    const currentDuration = engine.getScheduleInfo().durationMs;

    Math.random = () => {
      randomCalls += 1;
      return 0.99;
    };
    const upcoming = engine.getUpcomingRandomScheduleInfo();
    assert.ok(upcoming);
    const selectedOrder = upcoming.ticks
      .filter(tick => tick.isMainBeat)
      .map(tick => tick.beat);
    assert.deepEqual(selectedOrder, [0, 1, 2, 3]);
    const callsAfterSelection = randomCalls;
    assert.equal(engine.getUpcomingRandomScheduleInfo()?.durationMs, upcoming.durationMs);
    assert.deepEqual(
      engine.getUpcomingRandomScheduleInfo()?.ticks
        .filter(tick => tick.isMainBeat)
        .map(tick => tick.beat),
      selectedOrder,
    );
    assert.equal(randomCalls, callsAfterSelection, "repeated peeks reuse one selected pass");
    assert.equal(engine.getScheduleInfo().durationMs, currentDuration, "peeking leaves the active duration unchanged");

    Math.random = () => {
      throw new Error("rollover must not select a second random order");
    };
    (engine as any).rolloverToNextMeasure();
    assert.deepEqual(mainBeatOrder(engine), selectedOrder);
    assert.equal(engine.getScheduleInfo().durationMs, upcoming.durationMs);
  } finally {
    Math.random = originalRandom;
    engine.stop();
  }
});

test("configuration edits invalidate the selected pass before a fresh preview", () => {
  const originalRandom = Math.random;
  const engine = createRandomEngine();

  try {
    Math.random = () => 0;
    engine.buildScheduleOnly();

    Math.random = () => 0.99;
    const stale = engine.getUpcomingRandomScheduleInfo();
    assert.ok(stale);
    assert.deepEqual(
      stale.ticks.filter(tick => tick.isMainBeat).map(tick => tick.beat),
      [0, 1, 2, 3],
    );

    engine.setBpm(60);
    Math.random = () => 0;
    const fresh = engine.getUpcomingRandomScheduleInfo();
    assert.ok(fresh);
    assert.deepEqual(
      fresh.ticks.filter(tick => tick.isMainBeat).map(tick => tick.beat),
      [1, 2, 3, 0],
    );
    assert.notEqual(fresh.durationMs, stale.durationMs, "the preview reflects the edited BPM");

    (engine as any).rolloverToNextMeasure();
    assert.deepEqual(mainBeatOrder(engine), [1, 2, 3, 0]);
    assert.equal(engine.getScheduleInfo().durationMs, fresh.durationMs);
  } finally {
    Math.random = originalRandom;
    engine.stop();
  }
});

test("stopping discards an unconsumed random pass", () => {
  const originalRandom = Math.random;
  const engine = createRandomEngine();

  try {
    Math.random = () => 0;
    engine.buildScheduleOnly();
    Math.random = () => 0.99;
    const discarded = engine.getUpcomingRandomScheduleInfo();
    assert.ok(discarded);
    assert.deepEqual(
      discarded.ticks.filter(tick => tick.isMainBeat).map(tick => tick.beat),
      [0, 1, 2, 3],
    );

    engine.stop();
    Math.random = () => 0;
    engine.start();
    engine.stop();
    assert.deepEqual(mainBeatOrder(engine), [1, 2, 3, 0], "restart builds a fresh current random pass");

    Math.random = () => 0;
    const afterRestart = engine.getUpcomingRandomScheduleInfo();
    assert.ok(afterRestart);
    assert.notDeepEqual(
      afterRestart.ticks.filter(tick => tick.isMainBeat).map(tick => tick.beat),
      discarded.ticks.filter(tick => tick.isMainBeat).map(tick => tick.beat),
    );
  } finally {
    Math.random = originalRandom;
    engine.stop();
  }
});

test("upcoming random schedule is unavailable for nonrandom or caller-ordered schedules", () => {
  const engine = createRandomEngine();
  engine.buildScheduleOnly();
  assert.ok(engine.getUpcomingRandomScheduleInfo());

  engine.setBlockPlayMode("loop");
  assert.equal(engine.getUpcomingRandomScheduleInfo(), null);

  engine.setBlockPlayMode("random");
  engine.setRandomBarOrder([3, 2, 1, 0]);
  assert.equal(engine.getUpcomingRandomScheduleInfo(), null);
});

test("caller-order preview is isolated and matches the installed boundary schedule", () => {
  const engine = createRandomEngine();
  engine.setRandomBarOrder([3, 2, 1, 0]);
  engine.buildScheduleOnly();
  const active = engine.getScheduleInfo();
  const activeOrder = active.ticks.filter(tick => tick.isMainBeat).map(tick => tick.beat);
  const activeDuration = active.durationMs;
  const blockCacheSize = engine._getBlockCacheSize();
  const cacheSize = engine._getScheduleCacheSize();

  const originalRandom = Math.random;
  try {
    Math.random = () => {
      throw new Error("a supplied-order preview must not consume the random generator");
    };
    const preview = engine.previewScheduleForRandomBarOrder([1, 0, 3, 2]);
    const previewOrder = preview.ticks.filter(tick => tick.isMainBeat).map(tick => tick.beat);
    assert.ok(previewOrder.length > 0);
    assert.equal(engine.getScheduleInfo().durationMs, activeDuration);
    assert.deepEqual(
      engine.getScheduleInfo().ticks.filter(tick => tick.isMainBeat).map(tick => tick.beat),
      activeOrder,
    );
    assert.equal(engine._getBlockCacheSize(), blockCacheSize);
    assert.equal(engine._getScheduleCacheSize(), cacheSize);

    engine.setRandomBarOrder([1, 0, 3, 2]);
    engine.buildScheduleOnly();
    const installed = engine.getScheduleInfo();
    assert.equal(installed.durationMs, preview.durationMs);
    assert.deepEqual(
      installed.ticks.filter(tick => tick.isMainBeat).map(tick => tick.beat),
      previewOrder,
    );
  } finally {
    Math.random = originalRandom;
    engine.stop();
  }
});