/** @jest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { useBeatSubdivisionCommit } from "../hooks/useBeatSubdivisionCommit";
import { createInitialBarConfig, createInitialDialConfig } from "../lib/bar-config-helpers";
import type { BeatType } from "../lib/metronome-engine";

function setup() {
  const beatTypes: BeatType[] = ["strong", "accent", "mute", "normal"];
  const beatSubdivisions: Record<string, BeatType[]> = { "0": ["strong", "normal"], "2": ["mute", "normal"] };
  const dialConfig = { ...createInitialDialConfig(), beatTypes: [...beatTypes], beatSubdivisions: { ...beatSubdivisions } };
  const engine = { setBeatTypes: jest.fn(), setBeatSubdivision: jest.fn() };
  const saved: Record<string, unknown> = {};
  const options = {
    beatTypes, beatSubdivisions, dialConfigRef: { current: dialConfig },
    barConfigRef: { current: createInitialBarConfig() }, barModeRef: { current: false },
    engineRef: { current: engine as any }, activeModeRef: { current: "beat" },
    isPlayingRef: { current: false }, isPreparingRef: { current: false },
    setBeatTypes: jest.fn(), setBeatSubdivisions: jest.fn(), scheduleReRender: jest.fn(),
    persistSettings: jest.fn((patch) => { Object.assign(saved, patch); }),
  };
  const hook = renderHook(() => useBeatSubdivisionCommit(options));
  return { ...hook, options, engine, saved, dialConfig, beatSubdivisions };
}
test.each([
  ["accent", "normal", "accent", "normal", "accent", "normal", "accent", "normal", "strong"],
  ["mute", "strong", "normal"],
])("atomic commit replaces only its original beat and aligns engine override: %j", (...notes) => {
  const { result, options, engine, saved, dialConfig, beatSubdivisions } = setup();
  const pattern = notes as BeatType[];
  act(() => result.current.handleCircularSubdivisionCommit(2, pattern));
  const expected = ["strong", "accent", pattern[0] === "mute" ? "normal" : pattern[0], "normal"];
  expect(engine.setBeatTypes).toHaveBeenCalledWith(expected);
  expect(engine.setBeatSubdivision).toHaveBeenCalledTimes(1);
  expect(engine.setBeatSubdivision).toHaveBeenCalledWith(2, pattern);
  expect(saved.beatSubdivisions).toEqual({ "0": ["strong", "normal"], "2": pattern });
  expect(saved.beatTypes).toEqual(expected);
  expect(saved.subdivisionPattern).toBeUndefined();
  expect(dialConfig.subdivisionPattern).toEqual(["accent"]);
  expect(beatSubdivisions["2"]).toEqual(["mute", "normal"]);
  expect(options.scheduleReRender).toHaveBeenCalledTimes(1);
  expect(engine.setBeatTypes.mock.invocationCallOrder[0]).toBeLessThan(engine.setBeatSubdivision.mock.invocationCallOrder[0]);
});
test("one note clears its old subdivision and updates the visible/persistent/engine beat", () => {
  const { result, engine, saved, options } = setup();
  act(() => result.current.handleCircularSubdivisionCommit(0, ["normal"]));
  expect(engine.setBeatSubdivision).toHaveBeenCalledWith(0, null);
  expect(engine.setBeatTypes).toHaveBeenLastCalledWith(["normal", "accent", "mute", "normal"]);
  expect(saved.beatSubdivisions).toEqual({ "2": ["mute", "normal"] });
  expect(saved.beatTypes).toEqual(["normal", "accent", "mute", "normal"]);
  expect(options.scheduleReRender).toHaveBeenCalledTimes(1);
});
test.each(["mode", "playing", "preparing"])("commit cannot apply after %s ownership changes", (kind) => {
  const { result, options, engine } = setup();
  if (kind === "mode") options.activeModeRef.current = "bar";
  if (kind === "playing") options.isPlayingRef.current = true;
  if (kind === "preparing") options.isPreparingRef.current = true;
  act(() => result.current.handleCircularSubdivisionCommit(0, ["accent", "normal"]));
  expect(options.persistSettings).not.toHaveBeenCalled();
  expect(engine.setBeatSubdivision).not.toHaveBeenCalled();
});