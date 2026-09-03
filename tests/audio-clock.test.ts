import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AudioClockAdapter,
  AudioOutputStateMachine,
  AudioTimingDiagnostics,
} from "../lib/audio-clock";

test("audio clock maps different epochs and reports rate drift", () => {
  let audio = 10;
  let perf = 1000;
  const adapter = new AudioClockAdapter(
    { nowSeconds: () => audio },
    { nowSeconds: () => perf },
  );
  adapter.map(2);
  audio += 60.03;
  perf += 60;
  const sample = adapter.now();
  assert.ok(sample);
  assert.ok(Math.abs(sample.positionSeconds - 62.03) < 1e-9);
  assert.ok(Math.abs(sample.driftMs - 30) < 1e-6);
  assert.ok(Math.abs((adapter.audioTimeToPerformanceMs(audio) ?? 0) - 1060030) < 1e-6);
});

test("timing diagnostics summarize drift per minute and jitter", () => {
  const diagnostics = new AudioTimingDiagnostics(true);
  diagnostics.record({ audioTimeSeconds: 0, performanceTimeMs: 0, positionSeconds: 0, driftMs: 0 });
  diagnostics.record({ audioTimeSeconds: 30, performanceTimeMs: 30000, positionSeconds: 30, driftMs: 12 });
  diagnostics.record({ audioTimeSeconds: 60, performanceTimeMs: 60000, positionSeconds: 60, driftMs: 20 });
  const summary = diagnostics.summary(60000);
  assert.ok(summary);
  assert.equal(summary.sampleCount, 3);
  assert.equal(summary.driftPerMinuteMs, 20);
  assert.equal(summary.maxAbsDriftMs, 20);
  assert.equal(summary.maxJitterMs, 12);
});

test("disabled diagnostics and stale output generations do no work", () => {
  const diagnostics = new AudioTimingDiagnostics(false);
  diagnostics.record({ audioTimeSeconds: 1, performanceTimeMs: 1, positionSeconds: 1, driftMs: 1 });
  assert.equal(diagnostics.summary(1), null);

  const state = new AudioOutputStateMachine();
  const rendering = state.transition("rendering");
  assert.equal(state.owns(rendering), true);
  state.transition("transitioning");
  assert.equal(state.owns(rendering), false);
  assert.equal(state.snapshot().mode, "transitioning");
});