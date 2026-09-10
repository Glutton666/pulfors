/** @jest-environment jsdom */
import React from "react";
import { act, fireEvent, render, renderHook } from "@testing-library/react";
import * as ReactNative from "react-native";

import { BeatStaffMode } from "@/components/BeatStaffMode";
import { useBeatStaffControls } from "@/hooks/useBeatStaffControls";
import { findBeatStaffCellTarget, type BeatStaffCellRects } from "@/lib/beat-staff-logic";

const getLastPanResponderConfig = (
  ReactNative as unknown as { __getLastPanResponderConfig: () => any }
).__getLastPanResponderConfig;

jest.mock("@/contexts/ThemeContext", () => ({
  useTheme: () => ({
    colors: {
      accent: "#fc0",
      accentDim: "#330",
      border: "#555",
      surface: "#111",
      textSecondary: "#ddd",
      textTertiary: "#999",
      background: "#000",
      backgroundSecondary: "#111",
    },
  }),
}));

jest.mock("@/components/bar-mode/SimplifiedStaffNotation", () => ({
  SimplifiedStaffNotation: () => null,
}));

describe("BeatStaffMode native gestures", () => {
  function renderStaff(overrides: Partial<React.ComponentProps<typeof BeatStaffMode>> = {}) {
    const onBeatsChange = jest.fn();
    const onDeleteBeat = jest.fn();
    const onTogglePlay = jest.fn();
    const cellRectsRef: { current: BeatStaffCellRects } = {
      current: {
        0: { x: 10, y: 20, w: 80, h: 50 },
        1: { x: 100, y: 20, w: 80, h: 50 },
      },
    };
    const view = render(
      <BeatStaffMode
        beatsPerMeasure={2}
        beatDenominator={4}
        beatTypes={["strong", "normal"]}
        beatSubdivisions={{}}
        currentBeat={0}
        activeSubNote={0}
        isPlaying={false}
        isPreparing={false}
        onTogglePlay={onTogglePlay}
        onBeatsChange={onBeatsChange}
        onBeatTypeChange={jest.fn()}
        onDeleteBeat={onDeleteBeat}
        cellRectsRef={cellRectsRef}
        dropTargetBeat={null}
        hintText="hint"
        settingsText="settings"
        playText="play"
        stopText="stop"
        addText="add"
        beatTypeLabels={{ strong: "strong", accent: "accent", normal: "normal", mute: "mute" }}
        {...overrides}
      />,
    );
    return { ...view, onBeatsChange, onDeleteBeat, onTogglePlay, cellRectsRef };
  }

  it("uses the native gesture origin to delete the cell where the swipe began", () => {
    const { onDeleteBeat, cellRectsRef } = renderStaff();
    cellRectsRef.current = {
      0: { x: 10, y: 20, w: 80, h: 50 },
      1: { x: 100, y: 20, w: 80, h: 50 },
    };
    const pan = getLastPanResponderConfig();

    pan.onPanResponderGrant({ nativeEvent: { pageX: 105, pageY: 40 } }, { x0: 50, y0: 40 });
    pan.onPanResponderRelease({}, { dx: -45, dy: 3 });

    expect(onDeleteBeat).toHaveBeenCalledWith(0);
  });

  it("ignores vertical motion and blocks editing during playback", () => {
    const { onBeatsChange, onDeleteBeat, cellRectsRef } = renderStaff({ isPlaying: true });
    cellRectsRef.current = { 0: { x: 10, y: 20, w: 80, h: 50 } };
    const pan = getLastPanResponderConfig();

    expect(pan.onMoveShouldSetPanResponder({}, { dx: 20, dy: 40 })).toBe(false);
    pan.onPanResponderGrant({ nativeEvent: { pageX: 30, pageY: 40 } }, { x0: 30, y0: 40 });
    pan.onPanResponderRelease({}, { dx: -60, dy: 0 });

    expect(onDeleteBeat).not.toHaveBeenCalled();
    expect(onBeatsChange).not.toHaveBeenCalled();
  });

  it("keeps the play/stop control available while edit controls are locked", () => {
    const { getByTestId, onTogglePlay, onBeatsChange } = renderStaff({ isPlaying: true });

    fireEvent.click(getByTestId("beat-staff-play-toggle"));
    fireEvent.click(getByTestId("beat-staff-add"));

    expect(onTogglePlay).toHaveBeenCalledTimes(1);
    expect(onBeatsChange).not.toHaveBeenCalled();
  });

  it("adds by right swipe and button, and enforces the eight-beat cap", () => {
    const first = renderStaff({ beatsPerMeasure: 7, beatTypes: Array(7).fill("normal") });
    let pan = getLastPanResponderConfig();
    pan.onPanResponderGrant({ nativeEvent: { pageX: 30, pageY: 40 } }, { x0: 30, y0: 40 });
    pan.onPanResponderRelease({}, { dx: 50, dy: 2 });
    fireEvent.click(first.getByTestId("beat-staff-add"));
    expect(first.onBeatsChange).toHaveBeenNthCalledWith(1, 8);
    expect(first.onBeatsChange).toHaveBeenNthCalledWith(2, 8);
    first.unmount();

    const capped = renderStaff({ beatsPerMeasure: 8, beatTypes: Array(8).fill("normal") });
    pan = getLastPanResponderConfig();
    pan.onPanResponderGrant({ nativeEvent: { pageX: 30, pageY: 40 } }, { x0: 30, y0: 40 });
    pan.onPanResponderRelease({}, { dx: 50, dy: 2 });
    fireEvent.click(capped.getByTestId("beat-staff-add"));
    expect(capped.onBeatsChange).not.toHaveBeenCalled();
  });

  it("supports cell press and accessibility deletion while stopped", () => {
    const onBeatTypeChange = jest.fn();
    const { getByTestId, onDeleteBeat } = renderStaff({ onBeatTypeChange });
    const cell = getByTestId("beat-staff-cell-1");
    fireEvent.click(cell);
    const fiberKey = Object.keys(cell).find((key) => key.startsWith("__reactFiber$"));
    let fiber = (cell as any)[fiberKey!];
    while (fiber && typeof fiber.memoizedProps?.onAccessibilityAction !== "function") {
      fiber = fiber.return;
    }
    expect(fiber).toBeTruthy();
    fiber.memoizedProps.onAccessibilityAction({ nativeEvent: { actionName: "decrement" } });
    expect(onBeatTypeChange).toHaveBeenCalledWith(1, "mute");
    expect(onDeleteBeat).toHaveBeenCalledWith(1);
  });

  it("reindexes deletion and applies measured-cell subdivision drops across state, config, engine and storage", () => {
    let types: any[] = ["strong", "normal", "accent"];
    let subs: Record<string, any[]> = { "0": ["strong"], "1": ["normal", "normal"], "2": ["accent"] };
    let count = 3;
    const engine = {
      setBeatsPerMeasure: jest.fn(), setBeatTypes: jest.fn((v) => { types = v; }),
      setAllBeatSubdivisions: jest.fn((v) => { subs = v; }),
      setBeatSubdivision: jest.fn(), getBeatTypes: jest.fn(() => types),
    };
    const dial = { current: { beatsPerMeasure: count, beatTypes: types, beatSubdivisions: subs } };
    const persistSettings = jest.fn();
    const setters = {
      setBeatsPerMeasure: jest.fn((v) => { count = v; }),
      setBeatTypes: jest.fn((v) => { types = typeof v === "function" ? v(types) : v; }),
      setBeatSubdivisions: jest.fn((v) => { subs = typeof v === "function" ? v(subs) : v; }),
    };
    const { result, rerender } = renderHook(() => useBeatStaffControls({
      engineRef: { current: engine as any }, barModeRef: { current: false },
      barConfigRef: { current: { ...dial.current } }, dialConfigRef: dial,
      beatTypes: types, beatSubdivisions: subs, ...setters, persistSettings: persistSettings as any,
      scheduleReRender: jest.fn(),
    }));
    act(() => result.current.handleBeatStaffDelete(1));
    expect(types).toEqual(["strong", "accent"]);
    expect(subs).toEqual({ "0": ["strong"], "1": ["accent"] });
    expect(engine.setAllBeatSubdivisions).toHaveBeenCalledWith(subs);
    expect(dial.current.beatSubdivisions).toEqual(subs);
    expect(persistSettings).toHaveBeenCalledWith({ beatsPerMeasure: 2, beatSubdivisions: subs });

    rerender();
    const rects = { 0: { x: 10, y: 20, w: 80, h: 50 }, 1: { x: 100, y: 20, w: 80, h: 50 } };
    const target = findBeatStaffCellTarget(120, 40, rects);
    act(() => result.current.applyBeatStaffSubdivision(target!, ["accent", "normal"]));
    expect(engine.setBeatSubdivision).toHaveBeenCalledWith(1, ["accent", "normal"]);
    expect(dial.current.beatSubdivisions["1"]).toEqual(["accent", "normal"]);
    expect(persistSettings).toHaveBeenLastCalledWith({ beatSubdivisions: { "0": ["strong"], "1": ["accent", "normal"] } });
  });
});
