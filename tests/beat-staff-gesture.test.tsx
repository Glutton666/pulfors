/** @jest-environment jsdom */
import React from "react";
import { fireEvent, render } from "@testing-library/react";
import * as ReactNative from "react-native";

import { BeatStaffMode } from "@/components/BeatStaffMode";
import type { BeatStaffCellRects } from "@/lib/beat-staff-logic";

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
});