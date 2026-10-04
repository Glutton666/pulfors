/** @jest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { useBeatSubdivisionCommit } from "../hooks/useBeatSubdivisionCommit";
import { createInitialBarConfig, createInitialDialConfig } from "../lib/bar-config-helpers";
import type { BeatType } from "../lib/metronome-engine";
import { MetronomeEngine } from "../lib/metronome-engine";

function setup() {
  const beatTypes: BeatType[] = ["strong", "accent", "mute", "normal"];
  const beatSubdivisions: Record<string, BeatType[]> = { "0": ["strong", "normal"], "2": ["mute", "normal"] };
  const dialConfig = { ...createInitialDialConfig(), beatTypes: [...beatTypes], beatSubdivisions: { ...beatSubdivisions } };
  const engine = { setBeatTypes: jest.fn(), setBeatSubdivision: jest.fn(),
    setBeatsPerMeasure: jest.fn(), setAllBeatSubdivisions: jest.fn() };
  const saved: Record<string, unknown> = {};
  const options = {
    beatTypes, beatSubdivisions, dialConfigRef: { current: dialConfig },
    barConfigRef: { current: createInitialBarConfig() }, barModeRef: { current: false },
    engineRef: { current: engine as any }, activeModeRef: { current: "beat" },
    isPlayingRef: { current: false }, isPreparingRef: { current: false },
    setBeatTypes: jest.fn(), setBeatSubdivisions: jest.fn(), scheduleReRender: jest.fn(),
    setBeatsPerMeasure: jest.fn(), onInsertBeatSamples: jest.fn(), onBeatLimit: jest.fn(),
    persistSettings: jest.fn((patch) => { Object.assign(saved, patch); }),
  };
  const hook = renderHook(() => useBeatSubdivisionCommit(options));
  return { ...hook, options, engine, saved, dialConfig, beatSubdivisions };
}
test.each([
  ["accent", "normal", "accent", "normal", "accent", "normal", "accent", "normal", "strong"],
  ["mute", "strong", "normal"],
])("inserts exactly one beat after its anchor and aligns the new override: %j", (...notes) => {
  const { result, options, engine, saved, dialConfig, beatSubdivisions } = setup();
  const pattern = notes as BeatType[];
  act(() => result.current.handleCircularSubdivisionCommit(2, pattern));
  const expected = ["strong", "accent", "mute", pattern[0] === "mute" ? "normal" : pattern[0], "normal"];
  expect(engine.setBeatTypes).toHaveBeenCalledWith(expected);
  expect(engine.setBeatSubdivision).not.toHaveBeenCalled();
  expect(saved.beatSubdivisions).toEqual({ "0": ["strong", "normal"], "2": ["mute", "normal"], "3": pattern });
  expect(engine.setAllBeatSubdivisions).toHaveBeenCalledWith(saved.beatSubdivisions);
  expect(engine.setBeatsPerMeasure).toHaveBeenCalledWith(5);
  expect(options.setBeatsPerMeasure).toHaveBeenCalledWith(5);
  expect(options.onInsertBeatSamples).toHaveBeenCalledWith(3);
  expect(dialConfig.beatsPerMeasure).toBe(5);
  expect(dialConfig.beatTypes).toEqual(expected);
  expect(dialConfig.beatSubdivisions).toEqual(saved.beatSubdivisions);
  expect(saved.beatsPerMeasure).toBe(5);
  expect(saved.beatTypes).toEqual(expected);
  expect(saved.subdivisionPattern).toBeUndefined();
  expect(dialConfig.subdivisionPattern).toEqual(["accent"]);
  expect(beatSubdivisions["2"]).toEqual(["mute", "normal"]);
  expect(options.scheduleReRender).toHaveBeenCalledTimes(1);
  expect(engine.setBeatTypes.mock.invocationCallOrder[0]).toBeLessThan(engine.setAllBeatSubdivisions.mock.invocationCallOrder[0]);
});
test("one note inserts an unsubdivided beat without clearing the anchor pattern", () => {
  const { result, engine, saved, options } = setup();
  act(() => result.current.handleCircularSubdivisionCommit(0, ["normal"]));
  expect(engine.setBeatSubdivision).not.toHaveBeenCalled();
  expect(engine.setBeatTypes).toHaveBeenLastCalledWith(["strong", "normal", "accent", "mute", "normal"]);
  expect(saved.beatSubdivisions).toEqual({ "0": ["strong", "normal"], "3": ["mute", "normal"] });
  expect(saved.beatTypes).toEqual(["strong", "normal", "accent", "mute", "normal"]);
  expect(options.onInsertBeatSamples).toHaveBeenCalledWith(1);
  expect(options.scheduleReRender).toHaveBeenCalledTimes(1);
});
test.each(["mode", "playing", "preparing"])("commit cannot apply after %s ownership changes", (kind) => {
  const { result, options, engine } = setup();
  if (kind === "mode") options.activeModeRef.current = "bar";
  if (kind === "playing") options.isPlayingRef.current = true;
  if (kind === "preparing") options.isPreparingRef.current = true;
  act(() => result.current.handleCircularSubdivisionCommit(0, ["accent", "normal"]));
  expect(options.persistSettings).not.toHaveBeenCalled();
  expect(options.onInsertBeatSamples).not.toHaveBeenCalled();
  expect(engine.setBeatsPerMeasure).not.toHaveBeenCalled();
  expect(engine.setBeatSubdivision).not.toHaveBeenCalled();
});

test("limit reports failure and preserves the original document and samples", () => {
  const { result, options, dialConfig } = setup();
  dialConfig.beatsPerMeasure = 16;
  dialConfig.beatTypes = Array(16).fill("normal");
  const original = JSON.stringify(dialConfig);
  act(() => result.current.handleCircularSubdivisionCommit(0, ["accent", "normal"]));
  expect(options.onBeatLimit).toHaveBeenCalledTimes(1);
  expect(options.persistSettings).not.toHaveBeenCalled();
  expect(options.onInsertBeatSamples).not.toHaveBeenCalled();
  expect(JSON.stringify(dialConfig)).toBe(original);
});

test.each([-1, 4, 1.5, NaN])("invalid anchor %s never inserts or shifts samples", (anchor) => {
  const { result, options } = setup();
  act(() => result.current.handleCircularSubdivisionCommit(anchor, ["normal"]));
  expect(options.persistSettings).not.toHaveBeenCalled();
  expect(options.onInsertBeatSamples).not.toHaveBeenCalled();
});

test("back-to-back insertions read the current ref, not a stale render snapshot", () => {
  const { result, dialConfig, options, saved } = setup();
  act(() => {
    result.current.handleCircularSubdivisionCommit(3, ["accent", "normal"]);
    result.current.handleCircularSubdivisionCommit(4, ["normal", "strong"]);
  });
  expect(dialConfig.beatTypes).toEqual(["strong", "accent", "mute", "normal", "accent", "normal"]);
  expect(saved.beatsPerMeasure).toBe(6);
  expect(saved.beatSubdivisions).toMatchObject({ "4": ["accent", "normal"], "5": ["normal", "strong"] });
  expect(options.persistSettings).toHaveBeenCalledTimes(2);
});

test("the ordinary subdivision editor still replaces a pattern without inserting", () => {
  const { result, options, engine, saved } = setup();
  act(() => result.current.handleBeatSubdivisionChange(2, ["normal", "accent"]));
  expect(engine.setBeatSubdivision).toHaveBeenCalledWith(2, ["normal", "accent"]);
  expect(saved.beatSubdivisions).toEqual({ "0": ["strong", "normal"], "2": ["normal", "accent"] });
  expect(options.onInsertBeatSamples).not.toHaveBeenCalled();
  expect(options.setBeatsPerMeasure).not.toHaveBeenCalled();
});

test("the real engine retains existing patterns and plays a leading-M new beat correctly", () => {
  const { result, options, dialConfig } = setup();
  const engine = new MetronomeEngine();
  engine.setBeatsPerMeasure(4);
  engine.setBeatTypes(dialConfig.beatTypes);
  engine.setAllBeatSubdivisions(dialConfig.beatSubdivisions);
  options.engineRef.current = engine;
  act(() => result.current.handleCircularSubdivisionCommit(0, ["mute", "strong", "normal"]));
  expect(engine.getBeatsPerMeasure()).toBe(5);
  expect(engine.getBeatTypes()).toEqual(["strong", "normal", "accent", "mute", "normal"]);
  expect(engine.getAllBeatSubdivisions()).toEqual({
    "0": ["strong", "normal"], "1": ["mute", "strong", "normal"], "3": ["mute", "normal"],
  });
  const ticks = engine.getScheduleInfo().ticks;
  expect(ticks.filter(tick => tick.beat === 1).map(tick => tick.type)).toEqual(["mute", "strong", "normal"]);
  engine.cleanup();
});