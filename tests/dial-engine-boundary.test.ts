import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { applyDialConfigToEngine } from "../lib/dial-engine-boundary";

function createEngineState() {
  const state = {
    beats: 3,
    types: ["strong", "normal", "normal"],
    subdivisions: { "0": ["strong", "normal"] } as Record<string, string[]>,
    loops: [{ startBeat: 0, endBeat: 2, type: "count", value: 2 }],
    repeats: { 1: { type: "count", value: 3 } } as Record<number, { type: string; value: number }>,
    overrides: { 1: 90 } as Record<number, number>,
    blockPlayMode: "random",
  };
  const engine = {
    setBeatsPerMeasure: (beats: number) => { state.beats = beats; },
    setBeatTypes: (types: string[]) => { state.types = [...types]; },
    setAllBeatSubdivisions: (subdivisions: Record<string, string[]>) => {
      state.subdivisions = Object.fromEntries(
        Object.entries(subdivisions).map(([key, pattern]) => [key, [...pattern]]),
      );
    },
    clearLoopBlocks: () => { state.loops = []; },
    clearBarRepeats: () => { state.repeats = {}; },
    clearBarBpmOverrides: () => { state.overrides = {}; },
    setBlockPlayMode: (mode: string) => { state.blockPlayMode = mode; },
  };
  return { state, engine };
}

describe("dial engine boundary", () => {
  test("replaces all bar-owned schedule state before beat-mode playback", () => {
    const { state, engine } = createEngineState();
    const dial = {
      beatsPerMeasure: 4,
      beatTypes: ["strong", "normal", "normal", "normal"] as any,
      beatSubdivisions: { "2": ["accent", "normal"] as any },
    };

    applyDialConfigToEngine(engine as any, dial);

    assert.equal(state.beats, 4);
    assert.deepEqual(state.types, dial.beatTypes);
    assert.deepEqual(state.subdivisions, dial.beatSubdivisions);
    assert.deepEqual(state.loops, []);
    assert.deepEqual(state.repeats, {});
    assert.deepEqual(state.overrides, {});
    assert.equal(state.blockPlayMode, "loop");
  });

  test("clones the dial subdivision pattern instead of retaining shared bar state", () => {
    const { state, engine } = createEngineState();
    const dial = {
      beatsPerMeasure: 4,
      beatTypes: ["strong", "normal", "normal", "normal"] as any,
      beatSubdivisions: { "0": ["accent", "normal"] as any },
    };

    applyDialConfigToEngine(engine as any, dial);
    dial.beatSubdivisions["0"].push("normal");

    assert.deepEqual(state.subdivisions, { "0": ["accent", "normal"] });
  });
});