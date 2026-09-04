/** @jest-environment jsdom */
import React from "react";
import { fireEvent, render } from "@testing-library/react";

import { SwipeableBarRow } from "@/components/bar-mode/SwipeableBarRow";

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

jest.mock("expo-linear-gradient", () => {
  const React = require("react");
  return {
    LinearGradient: ({ children, testID, ...props }: any) =>
      React.createElement("div", { ...props, "data-testid": testID }, children),
  };
});

jest.mock("react-native-svg", () => {
  const React = require("react");
  const element = (tag: string) => ({
    children,
    testID,
    ...props
  }: {
    children?: React.ReactNode;
    testID?: string;
    [key: string]: unknown;
  }) => React.createElement(tag, { ...props, "data-testid": testID }, children);
  return {
    __esModule: true,
    default: element("svg"),
    Ellipse: element("ellipse"),
    G: element("g"),
    Line: element("line"),
    Path: element("path"),
    Text: element("text"),
  };
});

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
    const { getByTestId, queryByTestId } = render(
      <SwipeableBarRow
        beat={1}
        beatType="strong"
        subdivisions={["strong", "normal", "normal", "normal"]}
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

    expect(queryByTestId("bar-staff-1")).toBeNull();
    expect(getByTestId("bar-cell-strong-gradient-1-0")).toBeTruthy();
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
        showStaffNotation
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

  it("keeps accent and strong cell backgrounds while showing samples as a top line", () => {
    const { getByTestId } = render(
      <SwipeableBarRow
        beat={1}
        beatType="strong"
        subdivisions={["accent", "strong", "normal", "normal"]}
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
        showStaffNotation
        sampleCellCoverage={[
          { source: "recording", kind: "direct" },
          { source: "recording", kind: "continued" },
          undefined,
          undefined,
        ]}
      />,
    );

    expect(getByTestId("bar-sample-cell-1-0")).toBeTruthy();
    expect(getByTestId("bar-sample-coverage-cell-1-1")).toBeTruthy();

    const overlay = getByTestId("bar-sample-coverage-overlay-1") as HTMLElement;
    expect(overlay.children).toHaveLength(4);
    expect(overlay.querySelectorAll("[data-testid]").length).toBe(0);
  });

  it("marks only the currently playing subdivision and gives strong notes depth without symbols", () => {
    const { getByTestId, queryByTestId } = render(
      <SwipeableBarRow
        beat={2}
        beatType="strong"
        subdivisions={["strong", "accent", "normal", "mute"]}
        repeat={null}
        isCurrentBeat
        activeSubNote={2}
        isEditingBeat={false}
        blockDepth={0}
        blockStart={false}
        blockEnd={false}
        symbolBadges={[]}
        isPlaying
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
        showStaffNotation
      />,
    );

    expect(getByTestId("bar-staff-2")).toBeTruthy();
    expect(getByTestId("bar-note-strong-0")).toBeTruthy();
    expect(getByTestId("bar-note-accent-1")).toBeTruthy();
    expect(getByTestId("bar-note-normal-2")).toBeTruthy();
    expect(getByTestId("bar-note-mute-3")).toBeTruthy();
    expect(queryByTestId("bar-cell-type-2-0-strong")).toBeNull();
    expect(queryByTestId("bar-cell-type-2-1-accent")).toBeNull();
    expect(queryByTestId("bar-cell-type-2-2-normal")).toBeNull();
    expect(queryByTestId("bar-cell-type-2-3-mute")).toBeNull();
    expect(queryByTestId("bar-active-cell-2-0")).toBeNull();
    expect(queryByTestId("bar-active-cell-2-1")).toBeNull();
    expect(getByTestId("bar-active-cell-2-2")).toBeTruthy();
    expect(queryByTestId("bar-active-cell-2-3")).toBeNull();
  });

  it("adds a distinct start marker only to direct sample cells", () => {
    const { getByTestId, queryByTestId } = render(
      <SwipeableBarRow
        beat={0}
        beatType="normal"
        subdivisions={["normal", "normal", "normal"]}
        repeat={null}
        isCurrentBeat={false}
        isEditingBeat
        blockDepth={0}
        blockStart={false}
        blockEnd={false}
        symbolBadges={[]}
        isPlaying={false}
        bpm={120}
        meterNumerator={3}
        meterDenominator={4}
        beatsPerMeasure={3}
        onPress={jest.fn()}
        onSwipeLeft={jest.fn()}
        onSwipeRight={jest.fn()}
        onLongPress={jest.fn()}
        colors={colors}
        ms={(value) => value}
        showStaffNotation
        sampleCellCoverage={[
          { source: "recording", kind: "direct" },
          { source: "recording", kind: "continued" },
          undefined,
        ]}
      />,
    );

    expect(getByTestId("bar-sample-start-marker-0-0")).toBeTruthy();
    expect(queryByTestId("bar-sample-start-marker-0-1")).toBeNull();
    expect(queryByTestId("bar-sample-start-marker-0-2")).toBeNull();
    expect(getByTestId("bar-tuplet-3")).toBeTruthy();
    expect(getByTestId("bar-tuplet-3").textContent).toBe("3");
  });
});
