import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  adjustBarDuration,
  clampBarBpm,
  clampBarRepeatCount,
  formatBarDuration,
  splitBarDuration,
} from "../components/bar-mode/BarModeTypes";

describe("bar editor control values", () => {
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
});