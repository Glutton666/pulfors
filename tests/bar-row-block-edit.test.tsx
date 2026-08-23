/** @jest-environment jsdom */
import React from "react";
import { fireEvent, render } from "@testing-library/react";

import { SwipeableBarRow } from "@/components/bar-mode/SwipeableBarRow";

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

const colors = {
  background: "#101116",
  backgroundSecondary: "#1a1c22",
  text: "#ffffff",
  textSecondary: "#c4c6ce",
  textTertiary: "#8a8d98",
  accent: "#e0b34d",
  accentMuted: "#af8f42",
  danger: "#e25f5f",
  overlay06: "rgba(255,255,255,0.06)",
  overlay08: "rgba(255,255,255,0.08)",
  overlay10: "rgba(255,255,255,0.10)",
  white: "#ffffff",
};

describe("SwipeableBarRow block editing", () => {
  it("keeps a boundary-row tap for bar selection and exposes a separate block editor action", () => {
    const onPress = jest.fn();
    const onEditBlock = jest.fn();
    const { getByTestId } = render(
      <SwipeableBarRow
        beat={1}
        beatType="normal"
        subdivisions={["normal", "normal", "normal", "normal"]}
        repeat={{ type: "count", value: 1, bpm: 120, meterNumerator: 4, meterDenominator: 4 }}
        isCurrentBeat={false}
        isEditingBeat={false}
        blockDepth={1}
        blockStart
        blockEnd={false}
        blockEditIndex={3}
        symbolBadges={[]}
        isPlaying={false}
        bpm={120}
        meterNumerator={4}
        meterDenominator={4}
        beatsPerMeasure={4}
        onPress={onPress}
        onSwipeLeft={jest.fn()}
        onSwipeRight={jest.fn()}
        onLongPress={jest.fn()}
        onEditBlock={onEditBlock}
        colors={colors}
        ms={(value) => value}
      />,
    );

    fireEvent.click(getByTestId("bar-row-1"));
    expect(onPress).toHaveBeenCalledWith(1);

    fireEvent.click(getByTestId("bar-block-edit-1"));
    expect(onEditBlock).toHaveBeenCalledWith(3);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("marks the exact sampled notes instead of rendering a row-level sample badge", () => {
    const { getByTestId, queryByTestId } = render(
      <SwipeableBarRow
        beat={1}
        beatType="normal"
        subdivisions={["normal", "normal", "normal", "normal"]}
        repeat={null}
        isCurrentBeat={false}
        isEditingBeat={false}
        blockDepth={0}
        blockStart={false}
        blockEnd={false}
        symbolBadges={[]}
        isPlaying={false}
        bpm={120}
        meterNumerator={4}
        meterDenominator={4}
        beatsPerMeasure={4}
        onPress={jest.fn()}
        onSwipeLeft={jest.fn()}
        onSwipeRight={jest.fn()}
        onLongPress={jest.fn()}
        colors={colors}
        ms={(value) => value}
        sampleCells={[false, true, false, true]}
      />,
    );

    expect(getByTestId("bar-sample-cell-1-1")).toBeTruthy();
    expect(getByTestId("bar-sample-cell-1-3")).toBeTruthy();
    expect(queryByTestId("bar-sample-cell-1-0")).toBeNull();
    expect(queryByTestId("bar-sample-cell-1-2")).toBeNull();
    expect(queryByTestId("bar-sample-badge-1")).toBeNull();
  });

  it("renders a non-interactive continuous overlay while preserving row actions", () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <SwipeableBarRow
        beat={1}
        beatType="normal"
        subdivisions={["normal", "normal", "normal", "normal"]}
        repeat={null}
        isCurrentBeat={false}
        isEditingBeat={false}
        blockDepth={0}
        blockStart={false}
        blockEnd={false}
        symbolBadges={[]}
        isPlaying={false}
        bpm={120}
        meterNumerator={4}
        meterDenominator={4}
        beatsPerMeasure={4}
        onPress={onPress}
        onSwipeLeft={jest.fn()}
        onSwipeRight={jest.fn()}
        onLongPress={jest.fn()}
        colors={colors}
        ms={(value) => value}
        sampleCellCoverage={[
          undefined,
          { source: "recording", kind: "direct" },
          { source: "recording", kind: "continued" },
          undefined,
        ]}
      />,
    );

    expect(getByTestId("bar-sample-cell-1-1")).toBeTruthy();
    expect(getByTestId("bar-sample-coverage-cell-1-2")).toBeTruthy();
    expect(getByTestId("bar-sample-coverage-overlay-1")).toBeTruthy();
    fireEvent.click(getByTestId("bar-row-1"));
    expect(onPress).toHaveBeenCalledWith(1);
  });
});
