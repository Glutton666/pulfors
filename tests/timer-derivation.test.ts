import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeStopwatchElapsedMs,
  computeTimerRemaining,
  computeTimerThermoFraction,
  isTimerExpired,
} from "../lib/timer-derivation";

test("stopwatch idle returns 0", () => {
  assert.equal(computeStopwatchElapsedMs("idle", 1000, 5000, 9999), 0);
  assert.equal(computeStopwatchElapsedMs("countdown", 1000, 5000, 9999), 0);
});

test("stopwatch running uses wall-clock", () => {
  const start = 1_000_000;
  assert.equal(computeStopwatchElapsedMs("running", start, 0, start + 200), 200);
  assert.equal(
    computeStopwatchElapsedMs("running", start, 0, start + 5 * 60 * 1000),
    5 * 60 * 1000
  );
});

test("stopwatch finishing keeps ticking from startTime", () => {
  const start = 500;
  assert.equal(
    computeStopwatchElapsedMs("finishing", start, 0, start + 1234),
    1234
  );
});

test("stopwatch paused returns frozen elapsedAtPause", () => {
  assert.equal(computeStopwatchElapsedMs("paused", 0, 7654, 99999), 7654);
});

test("stopwatch running clamps negative drift to 0", () => {
  assert.equal(computeStopwatchElapsedMs("running", 5000, 0, 4000), 0);
});

test("stopwatch unaffected by JS thread stalls (200ms vs 5min)", () => {
  const start = 0;
  // Simulate 5 minutes passing with no interval ticks
  const fiveMin = 5 * 60 * 1000;
  const result = computeStopwatchElapsedMs("running", start, 0, fiveMin);
  assert.equal(result, fiveMin);
});

test("timer idle shows full duration", () => {
  const r = computeTimerRemaining("idle", 0, 0, 0, 180, 9999);
  assert.equal(r.sec, 180);
  assert.equal(r.smooth, 180);
});

test("timer running computes remaining from wall-clock", () => {
  const start = 1000;
  const r = computeTimerRemaining("running", start, 60, 0, 60, start + 1500);
  // 1.5 sec elapsed → 59 sec floor, 58.5 smooth
  assert.equal(r.sec, 59);
  assert.equal(r.smooth, 58.5);
});

test("timer running floors to integer second", () => {
  const start = 0;
  const r = computeTimerRemaining("running", start, 30, 0, 30, 999);
  assert.equal(r.sec, 30);
  const r2 = computeTimerRemaining("running", start, 30, 0, 30, 1000);
  assert.equal(r2.sec, 29);
});

test("timer paused returns paused remaining", () => {
  const r = computeTimerRemaining("paused", 0, 0, 42, 180, 9999);
  assert.equal(r.sec, 42);
  assert.equal(r.smooth, 42);
});

test("timer finishing preserves pausedRemainingSec (pause→finishing)", () => {
  // User-paused at 23s left → finishing should still display 23s
  const r = computeTimerRemaining("finishing", 1000, 30, 23, 30, 99999);
  assert.equal(r.sec, 23);
  assert.equal(r.smooth, 23);
});

test("timer finishing shows 0 when actually expired", () => {
  // Expiry path sets pausedRemainingSec=0 before transition
  const r = computeTimerRemaining("finishing", 1000, 30, 0, 30, 99999);
  assert.equal(r.sec, 0);
  assert.equal(r.smooth, 0);
});

test("timer running clamps to 0 when expired", () => {
  const start = 0;
  const r = computeTimerRemaining("running", start, 5, 0, 5, 10_000);
  assert.equal(r.sec, 0);
  assert.equal(r.smooth, 0);
});

test("timer running survives long background pause (5min duration)", () => {
  const start = 0;
  const dur = 5 * 60; // 300s
  // After 4m59s
  const r1 = computeTimerRemaining("running", start, dur, 0, dur, 4 * 60 * 1000 + 59 * 1000);
  assert.equal(r1.sec, 1);
  // After exactly 5 min
  const r2 = computeTimerRemaining("running", start, dur, 0, dur, 5 * 60 * 1000);
  assert.equal(r2.sec, 0);
});

test("thermo fraction interpolates smoothly", () => {
  const start = 0;
  // Mid-point of 60s timer
  const f = computeTimerThermoFraction("running", start, 60, 60, 30_000);
  assert.equal(f, 0.5);
});

test("thermo fraction is 1 at idle", () => {
  assert.equal(computeTimerThermoFraction("idle", 0, 0, 60, 999), 1);
});

test("thermo fraction at finishing reflects startRemaining", () => {
  // Pause at half→finishing → still ~0.5
  assert.equal(computeTimerThermoFraction("finishing", 0, 30, 60, 999), 0.5);
  // Expired (startRemaining=0 by convention) → 0
  assert.equal(computeTimerThermoFraction("finishing", 0, 0, 60, 999), 0);
});

test("thermo fraction handles zero duration", () => {
  assert.equal(computeTimerThermoFraction("running", 0, 0, 0, 100), 0);
});

test("thermo fraction paused uses startRemaining/total", () => {
  // Paused with 20s left in 60s timer → 1/3
  const f = computeTimerThermoFraction("paused", 0, 20, 60, 9999);
  assert.equal(Math.round(f * 1000) / 1000, 0.333);
});

test("isTimerExpired true when elapsed >= startRemaining seconds", () => {
  assert.equal(isTimerExpired(0, 5, 5_000), true);
  assert.equal(isTimerExpired(0, 5, 4_999), false);
  assert.equal(isTimerExpired(1000, 1, 1999), false);
  assert.equal(isTimerExpired(1000, 1, 2000), true);
});

test("isTimerExpired stable under long stall (background return)", () => {
  // Started, then 10 min later JS wakes up with 60s timer
  assert.equal(isTimerExpired(0, 60, 600_000), true);
});
