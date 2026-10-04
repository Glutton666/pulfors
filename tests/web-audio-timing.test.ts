import { test } from "node:test";
import assert from "node:assert/strict";
import { alignVisualElapsedToAudio, getWebAudioPresentationTime } from "../lib/web-audio-timing";

test("output timestamp advances to the current screen frame, without double-counting latency", () => {
  const time = getWebAudioPresentationTime({
    currentTime: 10,
    baseLatency: 0.02,
    outputLatency: 0.1,
    getOutputTimestamp: () => ({ contextTime: 9.9, performanceTime: 900 }),
  }, 950);
  assert.ok(Math.abs(time - 9.95) < 0.000001);
});

test("missing or uninitialized output timestamps use reported output latency", () => {
  for (const getOutputTimestamp of [undefined, () => ({ contextTime: 0, performanceTime: 0 })]) {
    assert.equal(getWebAudioPresentationTime({
      currentTime: 10, baseLatency: 0.02, outputLatency: 0.08, getOutputTimestamp,
    }, 1000), 9.9);
  }
});

test("unsupported timestamps and invalid latency values cannot poison timing", () => {
  assert.equal(getWebAudioPresentationTime({
    currentTime: 10, baseLatency: Number.NaN, outputLatency: -1,
    getOutputTimestamp: () => { throw new Error("unsupported"); },
  }, 1000), 10);
  assert.equal(getWebAudioPresentationTime({ currentTime: 0, outputLatency: 0.1 }, 1000), 0);
});

test("presentation estimates never advance beyond the audio render clock", () => {
  assert.equal(getWebAudioPresentationTime({
    currentTime: 10,
    getOutputTimestamp: () => ({ contextTime: 9.9, performanceTime: 1 }),
  }, 1000), 10);
});

test("visual alignment preserves the measure boundary and future start delay", () => {
  assert.equal(alignVisualElapsedToAudio(0, -80, 2000), -80);
  assert.equal(alignVisualElapsedToAudio(5080, 5000, 2000), 5000);
  assert.equal(alignVisualElapsedToAudio(-420, 1500, 2000), -500);
  assert.equal(alignVisualElapsedToAudio(80, 2000, 2000), 0);
  assert.equal(alignVisualElapsedToAudio(123, Number.NaN, 2000), 123);
  assert.equal(alignVisualElapsedToAudio(123, 100, 0), 123);
});