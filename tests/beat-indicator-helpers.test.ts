import { test } from "node:test";
import assert from "node:assert/strict";
import { getLayerCountForBeat, formatRepeat, findPillDropTarget, mergePillToLayer } from "../components/beat-indicator-helpers";
import type { LoopBlock, BeatType } from "../components/beat-indicator.types";

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

test("findPillDropTarget: returns null when empty", () => {
  assert.equal(findPillDropTarget(10, 10, 0, {}), null);
});

test("findPillDropTarget: skips source index", () => {
  const layouts = { 0: { x: 0, y: 0, w: 50, h: 30 } };
  assert.equal(findPillDropTarget(20, 10, 0, layouts), null);
});

test("findPillDropTarget: hit inside box", () => {
  const layouts = { 0: { x: 0, y: 0, w: 50, h: 30 }, 1: { x: 100, y: 0, w: 50, h: 30 } };
  assert.equal(findPillDropTarget(120, 10, 0, layouts), 1);
});

test("findPillDropTarget: hitSlop expands hitbox", () => {
  const layouts = { 1: { x: 100, y: 0, w: 50, h: 30 } };
  assert.equal(findPillDropTarget(95, 5, 0, layouts), 1); // -5 within default 8 slop
  assert.equal(findPillDropTarget(92, 5, 0, layouts), 1); // exactly at slop boundary
});

test("findPillDropTarget: outside hitSlop returns null", () => {
  const layouts = { 1: { x: 100, y: 0, w: 50, h: 30 } };
  assert.equal(findPillDropTarget(90, 5, 0, layouts), null); // -10 beyond 8 slop
});

test("findPillDropTarget: right edge boundary", () => {
  const layouts = { 1: { x: 100, y: 0, w: 50, h: 30 } };
  assert.equal(findPillDropTarget(158, 5, 0, layouts), 1); // x+w+slop = 158
  assert.equal(findPillDropTarget(159, 5, 0, layouts), null);
});

test("findPillDropTarget: bottom edge boundary", () => {
  const layouts = { 1: { x: 100, y: 0, w: 50, h: 30 } };
  assert.equal(findPillDropTarget(120, 38, 0, layouts), 1); // y+h+slop = 38
  assert.equal(findPillDropTarget(120, 39, 0, layouts), null);
});

test("findPillDropTarget: custom hitSlop", () => {
  const layouts = { 1: { x: 100, y: 0, w: 50, h: 30 } };
  assert.equal(findPillDropTarget(85, 5, 0, layouts, 16), 1);
  assert.equal(findPillDropTarget(85, 5, 0, layouts, 0), null);
});

test("mergePillToLayer: target has layerOf returns null", () => {
  const blocks: LoopBlock[] = [
    { startBeat: 0, endBeat: 1, type: "count", value: 1 },
    { startBeat: 2, endBeat: 3, type: "count", value: 1, layerOf: 99 },
  ];
  assert.equal(mergePillToLayer(blocks, 0, 1, {}, {}), null);
});

test("mergePillToLayer: out of bounds returns null", () => {
  const blocks: LoopBlock[] = [{ startBeat: 0, endBeat: 1, type: "count", value: 1 }];
  assert.equal(mergePillToLayer(blocks, 0, 5, {}, {}), null);
  assert.equal(mergePillToLayer(blocks, 5, 0, {}, {}), null);
});

test("mergePillToLayer: source becomes layer of target with ownBeatTypes", () => {
  const blocks: LoopBlock[] = [
    { startBeat: 0, endBeat: 1, type: "count", value: 1, jumpToBlock: 5, jumpCount: 2 },
    { startBeat: 2, endBeat: 3, type: "count", value: 1 },
  ];
  const beatTypes: Record<number, BeatType> = { 0: "strong", 1: "accent" };
  const result = mergePillToLayer(blocks, 0, 1, beatTypes, {});
  assert.ok(result);
  assert.equal(result![0].layerOf, 1);
  assert.equal(result![0].jumpToBlock, undefined);
  assert.equal(result![0].jumpCount, undefined);
  assert.deepEqual(result![0].ownBeatTypes, { 0: "strong", 1: "accent" });
  assert.equal(result![0].ownSubdivisions, undefined);
});

test("mergePillToLayer: missing beatType defaults to normal", () => {
  const blocks: LoopBlock[] = [
    { startBeat: 0, endBeat: 1, type: "count", value: 1 },
    { startBeat: 2, endBeat: 3, type: "count", value: 1 },
  ];
  const result = mergePillToLayer(blocks, 0, 1, {}, {});
  assert.deepEqual(result![0].ownBeatTypes, { 0: "normal", 1: "normal" });
});

test("mergePillToLayer: captures subdivisions for source range", () => {
  const blocks: LoopBlock[] = [
    { startBeat: 0, endBeat: 1, type: "count", value: 1 },
    { startBeat: 2, endBeat: 3, type: "count", value: 1 },
  ];
  const subs: Record<string, BeatType[]> = {
    "0": ["strong", "normal"],
    "5": ["accent"],
  };
  const result = mergePillToLayer(blocks, 0, 1, {}, subs);
  assert.deepEqual(result![0].ownSubdivisions, { "0": ["strong", "normal"] });
});

test("mergePillToLayer: children of source re-attach to target", () => {
  const blocks: LoopBlock[] = [
    { startBeat: 0, endBeat: 1, type: "count", value: 1 },
    { startBeat: 2, endBeat: 3, type: "count", value: 1 },
    { startBeat: 0, endBeat: 1, type: "count", value: 1, layerOf: 0 },
  ];
  const result = mergePillToLayer(blocks, 0, 1, {}, {});
  assert.equal(result![0].layerOf, 1);
  assert.equal(result![2].layerOf, 1);
});

test("mergePillToLayer: source without children does not affect siblings", () => {
  const blocks: LoopBlock[] = [
    { startBeat: 0, endBeat: 1, type: "count", value: 1 },
    { startBeat: 2, endBeat: 3, type: "count", value: 1 },
    { startBeat: 4, endBeat: 5, type: "count", value: 1, layerOf: 1 },
  ];
  const result = mergePillToLayer(blocks, 0, 1, {}, {});
  assert.equal(result![2].layerOf, 1); // unchanged
});
