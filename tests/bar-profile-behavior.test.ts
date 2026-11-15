/** @jest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { useBarMode, type UseBarModeParams } from "@/hooks/useBarMode";
import { createInitialBarConfig, createInitialDialConfig } from "@/lib/bar-config-helpers";
import { MetronomeEngine } from "@/lib/metronome-engine";

jest.mock("@/lib/sample-cache", () => ({ releaseAll: jest.fn(async () => undefined) }));
jest.mock("@/lib/error-tracking", () => ({ captureBreadcrumb: jest.fn() }));

function setup() {
  const engine = new MetronomeEngine();
  engine.setBpm(100);
  engine.setBeatsPerMeasure(4);
  const dial = createInitialDialConfig(4);
  dial.beatTypes = ["strong", "normal", "mute", "accent"];
  dial.beatSubdivisions = { "1": ["strong", "normal"] };
  dial.subdivisionPattern = ["strong", "normal"];
  const sampleFields = [
    "noteSamples", "noteSampleNames", "noteSampleSources", "noteSampleChannels",
    "noteSampleVolumes", "noteSampleSpeeds", "noteSampleMetroChannels",
  ];
  const samples = Object.fromEntries(sampleFields.flatMap(field => [
    [field, {}], [`${field}Ref`, { current: {} }],
    [`set${field[0].toUpperCase()}${field.slice(1)}`, jest.fn()],
  ]));
  const params = {
    ...samples, engineRef: { current: engine },
    barModeRef: { current: false }, setBarMode: jest.fn(),
    dialConfigRef: { current: dial }, stopIfPlaying: jest.fn(),
    isPlayingRef: { current: false }, beatsPerMeasure: 4,
    // Deliberately stale render state: mode changes must restore canonical refs.
    beatTypes: ["normal", "normal", "normal", "normal"],
    beatSubdivisions: {}, subdivisionPattern: ["normal"],
    setBeatsPerMeasure: jest.fn(), setBeatTypes: jest.fn(),
    setBeatSubdivisions: jest.fn(), setSubdivisionPattern: jest.fn(),
    noteSampleSoundsRef: { current: {} }, samplePlayStateRef: { current: {} },
    preloadNoteSampleSounds: jest.fn(), onBarBpmChange: jest.fn(),
    beatDenominatorRef: { current: 4 }, username: "test",
    persistSettings: jest.fn(), scheduleReRender: jest.fn(), t: jest.fn(),
  } as unknown as UseBarModeParams;
  const hook = renderHook(() => useBarMode(params));
  return { ...hook, params, engine, dial };
}

test("first Bar entry starts empty, stops old output and preserves Beat's canonical profile", () => {
  const { result, params, engine, dial } = setup();
  const before = JSON.parse(JSON.stringify(dial));
  act(() => result.current.handleBarModeChange(true));
  expect(params.stopIfPlaying).toHaveBeenCalledTimes(1);
  expect(engine.getBeatsPerMeasure()).toBe(0);
  expect(params.setBeatTypes).toHaveBeenLastCalledWith([]);
  expect(params.setBarMode).toHaveBeenLastCalledWith(true);
  expect(dial).toEqual(before);
});

test("Beat/Bar round trips restore independent strong notes, subdivisions and samples in UI and engine", () => {
  const { result, params, engine, dial } = setup();
  const bar = { ...createInitialBarConfig(3), hasBeenConfigured: true };
  bar.beatTypes = ["normal", "strong", "accent"];
  bar.beatSubdivisions = { "0": ["mute", "strong"] };
  bar.subdivisionPattern = ["mute", "strong"];
  bar.noteSamples = { "1-0": "file:///bar.wav" };
  result.current.barConfigRef.current = bar;
  for (let pass = 0; pass < 2; pass += 1) {
    act(() => result.current.handleBarModeChange(true));
    expect(engine.getBeatTypes()).toEqual(bar.beatTypes);
    expect(engine.getBeatsPerMeasure()).toBe(3);
    expect(params.setBeatSubdivisions).toHaveBeenLastCalledWith(bar.beatSubdivisions);
    expect(params.setNoteSamples).toHaveBeenLastCalledWith(bar.noteSamples);
    expect(params.setSubdivisionPattern).toHaveBeenLastCalledWith(bar.subdivisionPattern);
    act(() => result.current.handleBarModeChange(false));
    expect(engine.getBeatTypes()).toEqual(dial.beatTypes);
    expect(engine.getBeatsPerMeasure()).toBe(4);
    expect(params.setBeatTypes).toHaveBeenLastCalledWith(dial.beatTypes);
    expect(params.setSubdivisionPattern).toHaveBeenLastCalledWith(dial.subdivisionPattern);
    expect(result.current.barConfigRef.current).toEqual(bar);
  }
  expect(params.persistSettings).not.toHaveBeenCalled();
});

test.each([[-5, 20], [87, 87], [999, 300]])("Bar BPM %s clamps to %s without persisting Beat BPM", (input, expected) => {
  const { result, params } = setup();
  act(() => result.current.handleBarBpmChange(input));
  expect(result.current.barBpm).toBe(expected);
  expect(result.current.barBpmRef.current).toBe(expected);
  expect(params.onBarBpmChange).toHaveBeenLastCalledWith(expected);
  expect(params.persistSettings).not.toHaveBeenCalled();
});

test("loop and block mode edits update the canonical snapshot and engine synchronously", () => {
  const { result, engine } = setup();
  const blockMode = jest.spyOn(engine, "setBlockPlayMode");
  act(() => {
    result.current.setBarLoopMode("loop");
    result.current.setBlockPlayMode("random");
    expect(result.current.barConfigRef.current.barLoopMode).toBe("loop");
    expect(result.current.barConfigRef.current.blockPlayMode).toBe("random");
    expect(result.current.blockPlayModeRef.current).toBe("random");
  });
  expect(result.current.barLoopMode).toBe("loop");
  expect(result.current.blockPlayMode).toBe("random");
  expect(blockMode).toHaveBeenLastCalledWith("random");
});
