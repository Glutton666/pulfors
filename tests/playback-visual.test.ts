import { test } from "node:test";
import assert from "node:assert/strict";
import { MetronomeEngine } from "../lib/metronome-engine";
import { findVisualTick, playbackPulseEnvelope, visualTickInterval } from "../lib/playback-visual";

function withClock(run: (advance: (ms: number) => void) => void) {
  const original = performance.now;
  let now = 10000;
  Object.defineProperty(performance, "now", { value: () => now, configurable: true });
  try { run(ms => { now += ms; }); }
  finally { Object.defineProperty(performance, "now", { value: original, configurable: true }); }
}

for (const bpm of [120, 240]) for (const slots of [1, 3, 9, 16]) {
  test(`frame sampling ${bpm} BPM / ${slots} slots follows audio without firing it`, () => {
    withClock(advance => {
      const e = new MetronomeEngine();
      e.setBpm(bpm);
      e.setBeatsPerMeasure(4);
      if (slots > 1) for (let beat = 0; beat < 4; beat++) e.setBeatSubdivision(beat, Array(slots).fill("normal"));
      e.setPreRenderedAudio(true);
      let callbacks = 0;
      e.setOnSubBeat(() => { callbacks++; });
      e.start();
      const first = e.getPlaybackVisual()!;
      const count = callbacks;
      const interval = 60000 / bpm / slots;
      // Simulate an entire late frame without delivering JS timer callbacks.
      advance(interval * 2.3);
      const latest = e.getPlaybackVisual()!;
      assert.equal(latest.beat, Math.floor(2 / slots));
      assert.equal(latest.subBeat, 2 % slots);
      assert.ok(Math.abs(latest.intervalMs - interval) < 0.001);
      assert.ok(Math.abs(latest.ageMs - interval * 0.3) < 0.001);
      assert.notEqual(latest.pulseId, first.pulseId);
      assert.equal(callbacks, count, "frame sampling must not fire audio or callbacks");
      // Multiple stalled measures still pick the latest known repeating position.
      advance(e.getMeasureDurationMs() * 40);
      const late = e.getPlaybackVisual()!;
      assert.equal(late.subBeat, latest.subBeat);
      assert.equal(late.beat, latest.beat);
      assert.notEqual(late.pulseId, latest.pulseId);
      assert.equal(callbacks, count);
      e.stop();
      assert.equal(e.getPlaybackVisual(), null);
      e.start();
      assert.notEqual(e.getPlaybackVisual()!.pulseId, first.pulseId);
      e.stop();
    });
  });
}

test("callback-driven output is never visually advanced past its audible callback", () => {
  withClock(advance => {
    const e = new MetronomeEngine();
    e.setBeatsPerMeasure(4);
    e.start();
    const first = e.getPlaybackVisual()!;
    advance(1400);
    assert.equal(e.getPlaybackVisual()!.pulseId, first.pulseId);
    assert.equal(e.getPlaybackVisual()!.subBeat, 0);
    e.stop();
  });
});

test("tempo changes update visual slot duration without restarting playback", () => {
  withClock(advance => {
    const e = new MetronomeEngine();
    e.setBpm(120);
    for (let beat = 0; beat < 4; beat++) e.setBeatSubdivision(beat, Array(9).fill("normal"));
    e.setPreRenderedAudio(true);
    e.setOnScheduleRebuild(() => e.setPreRenderedAudio(true));
    e.start();
    const first = e.getPlaybackVisual()!;
    advance(100);
    e.setBpm(240);
    assert.ok(Math.abs(e.getPlaybackVisual()!.intervalMs - 250 / 9) < 0.001);
    assert.equal(e.getPlaybackVisual()!.pulseId.split(":")[0], first.pulseId.split(":")[0]);
    e.stop();
  });
});

test("positive and negative intentional visual offsets remain applied exactly once", () => {
  for (const offset of [-60, 60]) withClock(advance => {
    const e = new MetronomeEngine();
    e.setBpm(120);
    e.setBeatsPerMeasure(4);
    for (let beat = 0; beat < 4; beat++) e.setBeatSubdivision(beat, Array(9).fill("normal"));
    e.setPreRenderedAudio(true);
    e.setVisualTimingProvider(elapsed => elapsed - 20);
    e.setAudioOffsetMs(offset);
    e.start();
    advance(220);
    const elapsed = 220 - 20 + offset;
    assert.equal(e.getPlaybackVisual()!.subBeat, Math.floor(elapsed / (500 / 9)));
    e.stop();
  });
});

test("early rollover keeps the final audible slot; single-beat loops get a new pulse id", () => {
  withClock(advance => {
    const e = new MetronomeEngine();
    e.setBpm(120);
    e.setBeatsPerMeasure(1);
    e.setPreRenderedAudio(true);
    e.start();
    const first = e.getPlaybackVisual()!;
    assert.equal(first.subBeat, 0);
    advance(499);
    assert.equal(e.getPlaybackVisual()!.pulseId, first.pulseId);
    advance(1);
    assert.notEqual(e.getPlaybackVisual()!.pulseId, first.pulseId);
    e.stop();
  });
});

test("base-layer lookup ignores coincident layer ticks and retains mute/accent/strong roles", () => {
  const e = new MetronomeEngine();
  e.setBeatSubdivision(0, ["strong", "mute", "accent", "normal"]);
  e.start();
  const schedule = (e as any).schedule;
  const i = findVisualTick(schedule, 130);
  assert.equal(schedule[i].type, "mute");
  assert.equal(visualTickInterval(schedule, i, e.getMeasureDurationMs()), 125);
  const layered = [{ time: 0, layerIndex: 0 }, { time: 0, layerIndex: 1 }, { time: 30, layerIndex: 2 }];
  assert.equal(findVisualTick(layered as any, 35), 0);
  e.stop();
});

test("dense pulses start at peak, end within the slot, and never replay expired frames", () => {
  for (const interval of [500, 500 / 3, 500 / 9, 250 / 9, 250 / 16]) {
    const start = playbackPulseEnvelope(interval);
    assert.equal(start.initial, 1);
    assert.ok(start.remainingMs <= interval * 0.8);
    assert.ok(start.remainingMs <= 200);
    const middle = playbackPulseEnvelope(interval, start.remainingMs / 2);
    assert.equal(middle.initial, 0.5);
    assert.equal(middle.remainingMs, start.remainingMs / 2);
    assert.deepEqual(playbackPulseEnvelope(interval, interval * 10), { initial: 0, remainingMs: 0 });
  }
  assert.equal(playbackPulseEnvelope(NaN, NaN).initial, 1);
  assert.equal(playbackPulseEnvelope(-1, -1).initial, 1);
});