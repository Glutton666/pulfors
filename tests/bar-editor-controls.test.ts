import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  adjustBarDuration,
  clampBarBpm,
  clampBarRepeatCount,
  formatBarDuration,
  getBarSampleCells,
  getBarRepeatCountHoldIntervalMs,
  splitBarDuration,
} from "../components/bar-mode/BarModeTypes";

describe("bar editor control values", () => {
  test("sample cells expose one flag per bar cell and stay false without samples", () => {
    assert.deepEqual(
      getBarSampleCells(2, 3, { "2-0": "file:///kick.wav", "2-2": "file:///snare.wav" }),
      [true, false, true],
    );
    assert.deepEqual(getBarSampleCells(1, 0, { "1-0": "" }), [false]);
    assert.deepEqual(getBarSampleCells(1, 2), [false, false]);
  });

  test("duration always displays as zero-padded mm:ss", () => {
    assert.equal(formatBarDuration(30), "00:30");
    assert.equal(formatBarDuration(65), "01:05");
    assert.equal(formatBarDuration(3599), "59:59");
  });

  test("active minutes control changes only the minute unit", () => {
    assert.equal(adjustBarDuration(2 * 60 + 30, "minutes", 1), 3 * 60 + 30);
    assert.equal(adjustBarDuration(2 * 60 + 30, "minutes", -1), 1 * 60 + 30);
    assert.equal(adjustBarDuration(30, "minutes", -1), 30);
  });

  test("active seconds control changes only the second unit", () => {
    assert.equal(adjustBarDuration(2 * 60 + 30, "seconds", 1), 2 * 60 + 31);
    assert.equal(adjustBarDuration(2 * 60 + 30, "seconds", -1), 2 * 60 + 29);
    assert.equal(adjustBarDuration(2 * 60 + 59, "seconds", 1), 2 * 60 + 59);
  });

  test("duration changes stay within 00:01 to 59:59", () => {
    assert.equal(formatBarDuration(adjustBarDuration(1, "seconds", -1)), "00:01");
    assert.equal(formatBarDuration(adjustBarDuration(3599, "minutes", 1)), "59:59");
    assert.deepEqual(splitBarDuration(0), { minutes: 0, seconds: 1 });
  });

  test("repeat count and BPM enforce their supported ranges", () => {
    assert.equal(clampBarRepeatCount(0), 1);
    assert.equal(clampBarRepeatCount(100), 99);
    assert.equal(clampBarBpm(19), 20);
    assert.equal(clampBarBpm(301), 300);
  });

  test("repeat-count hold interval accelerates and respects its floor", () => {
    const initial = getBarRepeatCountHoldIntervalMs(0);
    const afterOneSecond = getBarRepeatCountHoldIntervalMs(1000);
    const afterThreeSeconds = getBarRepeatCountHoldIntervalMs(3000);
    const atFloor = getBarRepeatCountHoldIntervalMs(60_000);

    assert.equal(initial, 300);
    assert.ok(afterOneSecond < initial);
    assert.ok(afterThreeSeconds < afterOneSecond);
    assert.equal(atFloor, 60);
  });
});