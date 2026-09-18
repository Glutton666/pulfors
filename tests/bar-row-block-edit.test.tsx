/** @jest-environment jsdom */
import React from "react";
import type { FC, ReactNode } from "react";
import { fireEvent, render } from "@testing-library/react";

import {
  BAR_SAMPLE_COVERAGE_LAYOUT,
  getBarSampleCoverageLineWidth,
  getBarRightRailLayout,
  SwipeableBarRow,
} from "@/components/bar-mode/SwipeableBarRow";
import { getStaffRhythmNotation } from "@/components/bar-mode/SimplifiedStaffNotation";
import { StaffRestGlyph } from "@/components/staff/StaffGlyphs";

jest.mock("@expo/vector-icons", () => {
  const MockIonicons: FC = () => null;
  MockIonicons.displayName = "MockIonicons";
  return { Ionicons: MockIonicons };
});

jest.mock("expo-linear-gradient", () => {
  const React = require("react");
  const MockLinearGradient: FC<any> = ({ children, testID, ...props }) =>
    React.createElement("div", { ...props, "data-testid": testID }, children);
  MockLinearGradient.displayName = "MockLinearGradient";
  return {
    LinearGradient: MockLinearGradient,
  };
});

jest.mock("react-native-svg", () => {
  const React = require("react");
  const element = (tag: string) => {
    const MockSvgElement: FC<{
      children?: ReactNode;
      testID?: string;
      [key: string]: unknown;
    }> = ({
      children,
      testID,
      ...props
    }) => React.createElement(tag, { ...props, "data-testid": testID }, children);
    MockSvgElement.displayName = `MockSvg${tag}`;
    return MockSvgElement;
  };
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
    const { getByTestId, queryByTestId, getByText } = render(
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
    const clipContainer = getByTestId("bar-row-clip-container-1") as HTMLElement;
    const overlay = getByTestId("bar-sample-coverage-overlay-1") as HTMLElement;
    const direct = getByTestId("bar-sample-coverage-segment-1-1") as HTMLElement;
    const continued = getByTestId("bar-sample-coverage-segment-1-2") as HTMLElement;
    expect(clipContainer.contains(overlay)).toBe(true);
    expect(BAR_SAMPLE_COVERAGE_LAYOUT.top).toBeGreaterThanOrEqual(0);
    expect(BAR_SAMPLE_COVERAGE_LAYOUT.height).toBe(3);
    expect(getBarSampleCoverageLineWidth("direct")).toBe(3);
    expect(getBarSampleCoverageLineWidth("continued")).toBe(2);
    expect(direct).toBeTruthy();
    expect(continued).toBeTruthy();
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
    expect(overlay.querySelectorAll("[data-testid]").length).toBe(2);
  });

  it("centers real note glyphs, renders mute as a rest, and stacks meter above tempo", () => {
    const { getByTestId, queryByTestId, getByText } = render(
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
    expect(getByTestId("bar-rest-short-3")).toBeTruthy();
    expect(getByTestId("bar-note-mute-3").children).not.toHaveLength(0);
    const strongStrike = getByTestId("bar-note-strong-strike-0");
    expect(strongStrike.getAttribute("y1")).toBe(strongStrike.getAttribute("y2"));
    const staffSvg = getByTestId("bar-staff-2").querySelector("svg");
    expect(staffSvg?.getAttribute("preserveAspectRatio")).toBe("xMidYMid meet");
    expect(getByText("4/4")).toBeTruthy();
    expect(getByText("120")).toBeTruthy();
    expect(queryByTestId("bar-cell-type-2-0-strong")).toBeNull();
    expect(queryByTestId("bar-cell-type-2-1-accent")).toBeNull();
    expect(queryByTestId("bar-cell-type-2-2-normal")).toBeNull();
    expect(queryByTestId("bar-cell-type-2-3-mute")).toBeNull();
    expect(queryByTestId("bar-active-cell-2-0")).toBeNull();
    expect(queryByTestId("bar-active-cell-2-1")).toBeNull();
    expect(getByTestId("bar-active-cell-2-2")).toBeTruthy();
    expect(queryByTestId("bar-active-cell-2-3")).toBeNull();
  });

  it("renders rests for all-mute groups without dropping their rhythm beams", () => {
    const { getByTestId } = render(
      <SwipeableBarRow
        beat={3}
        beatType="mute"
        subdivisions={["mute", "mute", "mute", "mute"]}
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
      />,
    );

    for (let index = 0; index < 4; index++) {
      expect(getByTestId(`bar-note-mute-${index}`)).toBeTruthy();
      expect(getByTestId(`bar-rest-short-${index}`)).toBeTruthy();
    }
    expect(getByTestId("bar-rhythm-beam-0")).toBeTruthy();
    expect(getByTestId("bar-rhythm-beam-1")).toBeTruthy();
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
    expect(getByTestId("bar-tuplet-number-3").textContent).toBe("3");
    expect(getByTestId("bar-rhythm-beam-0")).toBeTruthy();
    expect(getByTestId("bar-rhythm-beam-0").getAttribute("stroke")).toBe(colors.accent);
    expect(getByTestId("bar-tuplet-number-3").getAttribute("fill")).toBe(colors.accent);
    expect(getByTestId("bar-note-normal-0").querySelector("ellipse")?.getAttribute("stroke")).toBe(colors.accent);
  });

  it("does not render sample markers or a coverage overlay for an empty row", () => {
    const { queryByTestId } = render(
      <SwipeableBarRow
        beat={2}
        beatType="normal"
        subdivisions={["normal", "normal"]}
        repeat={null}
        isCurrentBeat={false}
        isEditingBeat={false}
        blockDepth={0}
        blockStart={false}
        blockEnd={false}
        symbolBadges={[]}
        isPlaying={false}
        bpm={120}
        meterNumerator={2}
        meterDenominator={4}
        beatsPerMeasure={2}
        onPress={jest.fn()}
        onSwipeLeft={jest.fn()}
        onSwipeRight={jest.fn()}
        onLongPress={jest.fn()}
        colors={colors}
        ms={(value) => value}
        sampleCellCoverage={[undefined, undefined]}
      />,
    );

    expect(queryByTestId("bar-sample-coverage-overlay-2")).toBeNull();
    expect(queryByTestId("bar-sample-start-marker-2-0")).toBeNull();
    expect(queryByTestId("bar-sample-start-marker-2-1")).toBeNull();
  });

  it.each([
    [4, 2, 8, 1, false, true, false],
    [4, 3, 8, 1, true, true, false],
    [4, 4, 16, 2, false, true, false],
    [4, 5, 16, 2, true, true, false],
    [4, 6, 16, 2, true, true, false],
    [4, 7, 16, 2, true, true, false],
    [4, 8, 32, 3, false, true, false],
    [4, 9, 32, 3, true, true, false],
    [2, 3, 4, 0, true, false, true],
    [8, 3, 16, 2, true, true, false],
  ] as const)(
    "derives standard notation for denominator %i and %i subdivisions",
    (denominator, count, noteValueDenominator, beamCount, isTuplet, useBeam, useBracket) => {
      expect(getStaffRhythmNotation(denominator, count)).toEqual({
        noteValueDenominator,
        beamCount,
        isTuplet,
        useBeam,
        useBracket,
      });
    },
  );

  it("covers standard note values and beam counts for all supported denominators and subdivisions", () => {
    const expected = {
      2: {
        values: [2, 4, 4, 8, 8, 8, 8, 16, 16],
        beams: [0, 0, 0, 1, 1, 1, 1, 2, 2],
      },
      4: {
        values: [4, 8, 8, 16, 16, 16, 16, 32, 32],
        beams: [0, 1, 1, 2, 2, 2, 2, 3, 3],
      },
      8: {
        values: [8, 16, 16, 32, 32, 32, 32, 64, 64],
        beams: [1, 2, 2, 3, 3, 3, 3, 4, 4],
      },
    } as const;

    ([2, 4, 8] as const).forEach(denominator => {
      for (let count = 1; count <= 9; count++) {
        const notation = getStaffRhythmNotation(denominator, count);
        expect(notation.noteValueDenominator).toBe(expected[denominator].values[count - 1]);
        expect(notation.beamCount).toBe(expected[denominator].beams[count - 1]);
        expect(notation.isTuplet).toBe([3, 5, 6, 7, 9].includes(count));
      }
    });
  });

  it.each([
    [1, "bar-rest-whole-0"],
    [2, "bar-rest-half-0"],
    [4, "bar-rest-quarter-0"],
    [8, "bar-rest-eighth-0"],
    [16, "bar-rest-short-0"],
  ] as const)("renders denominator %i with the matching rest glyph", (denominator, testID) => {
    const { getByTestId } = render(
      <StaffRestGlyph
        x={20}
        index={0}
        noteValueDenominator={denominator}
        beamCount={Math.max(0, Math.log2(denominator) - 2)}
        grouped={false}
        color={colors.accent}
        noteY={22}
        stemTop={8}
        beamGap={3}
      />,
    );
    expect(getByTestId(testID)).toBeTruthy();
  });

  it.each(["accent", "normal"] as const)(
    "renders a denominator-2 single %s note with an open notehead",
    (type) => {
      const { getByTestId } = render(
        <SwipeableBarRow
          beat={0}
          beatType={type}
          subdivisions={[type]}
          repeat={null}
          isCurrentBeat={false}
          isEditingBeat={false}
          blockDepth={0}
          blockStart={false}
          blockEnd={false}
          symbolBadges={[]}
          isPlaying={false}
          bpm={120}
          meterNumerator={2}
          meterDenominator={2}
          beatsPerMeasure={2}
          onPress={jest.fn()}
          onSwipeLeft={jest.fn()}
          onSwipeRight={jest.fn()}
          onLongPress={jest.fn()}
          colors={colors}
          ms={(value) => value}
          showStaffNotation
        />,
      );

      expect(getByTestId(`bar-note-${type}-0`).querySelector("ellipse")?.getAttribute("fill")).toBe("none");
    },
  );

  it("reserves separate right-side rails for block repeat text and the end marker", () => {
    const { getByTestId, getByText } = render(
      <SwipeableBarRow
        beat={1}
        beatType="normal"
        subdivisions={["normal", "normal", "normal"]}
        repeat={null}
        isCurrentBeat={false}
        isEditingBeat={false}
        blockDepth={1}
        blockStart={false}
        blockEnd
        blockRepeatText="×12"
        symbolBadges={[]}
        isPlaying={false}
        bpm={71}
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
      />,
    );

    expect(getByTestId("bar-block-repeat-1")).toBeTruthy();
    expect(getByTestId("bar-block-end-marker-1")).toBeTruthy();
    expect(getBarRightRailLayout(true, "×12")).toEqual({
      blockEndWidth: 10,
      blockRepeatWidth: 28,
      blockRightInset: 38,
      infoRight: 40,
    });
    expect(getByText("×12")).toBeTruthy();
    expect(getByText("3/4")).toBeTruthy();
    expect(getByText("71")).toBeTruthy();
  });
});
