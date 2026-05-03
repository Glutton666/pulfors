import { test } from "node:test";
import assert from "node:assert/strict";
import { getLayerCountForBeat, formatRepeat } from "../components/beat-indicator-helpers";
import type { LoopBlock } from "../components/beat-indicator.types";

test("getLayerCountForBeat: empty blocks returns 0", () => {
  assert.equal(getLayerCountForBeat(0, [], 4), 0);
});

test("getLayerCountForBeat: single block no layers", () => {
  const blocks: LoopBlock[] = [{ startBeat: 0, endBeat: 3, type: "count", value: 2 }];
  assert.equal(getLayerCountForBeat(0, blocks, 4), 0);
  assert.equal(getLayerCountForBeat(2, blocks, 4), 0);
});

test("getLayerCountForBeat: counts layered blocks", () => {
  const blocks: LoopBlock[] = [
    { startBeat: 0, endBeat: 3, type: "count", value: 2 },
    { startBeat: 0, endBeat: 3, type: "count", value: 1, layerOf: 0 },
    { startBeat: 0, endBeat: 3, type: "count", value: 1, layerOf: 0 },
  ];
  assert.equal(getLayerCountForBeat(1, blocks, 4), 2);
});

test("getLayerCountForBeat: respects beatsPerMeasure cap", () => {
  const blocks: LoopBlock[] = [{ startBeat: 0, endBeat: 7, type: "count", value: 1 }];
  assert.equal(getLayerCountForBeat(5, blocks, 4), 0); // beat 5 > min(7,3)
});

test("getLayerCountForBeat: skips parent blocks with layerOf", () => {
  const blocks: LoopBlock[] = [
    { startBeat: 0, endBeat: 3, type: "count", value: 1, layerOf: 99 },
    { startBeat: 0, endBeat: 3, type: "count", value: 1 },
  ];
  assert.equal(getLayerCountForBeat(0, blocks, 4), 0);
});

test("formatRepeat: count type", () => {
  assert.equal(formatRepeat({ type: "count", value: 4 }), "\u00D74");
});

test("formatRepeat: duration minutes only", () => {
  assert.equal(formatRepeat({ type: "duration", value: 120 }), "2'");
});

test("formatRepeat: duration min+sec", () => {
  assert.equal(formatRepeat({ type: "duration", value: 90 }), "1'30\"");
});

test("formatRepeat: duration sec only", () => {
  assert.equal(formatRepeat({ type: "duration", value: 30 }), "30\"");
});

test("formatRepeat: with bpm override", () => {
  assert.equal(formatRepeat({ type: "count", value: 2, bpm: 120 }), "\u00D72 120");
});

test("formatRepeat: duration with bpm", () => {
  assert.equal(formatRepeat({ type: "duration", value: 60, bpm: 90 }), "1' 90");
});
