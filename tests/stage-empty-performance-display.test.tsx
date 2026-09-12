/** @jest-environment jsdom */
import React from "react";
import { fireEvent, render } from "@testing-library/react";

jest.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({ t: (_section: string, key: string) => key }),
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => <span data-testid="mock-icon" />,
}));

jest.mock("@/components/StageBeatColumn", () => ({
  StageBeatColumn: () => <div data-testid="mock-stage-beat-column" />,
}));

jest.mock("@/components/SubdivisionBar", () => ({
  SubdivisionBar: () => <div data-testid="mock-subdivision-bar" />,
}));

import { StageEmptyPerformanceDisplay } from "@/components/StageEmptyPerformanceDisplay";

const makeProps = () => ({
  currentBeat: -1,
  beatsPerMeasure: 4,
  beatTypes: ["strong", "normal", "normal", "normal"] as import("@/lib/metronome-engine").BeatType[],
  subdivisionPattern: ["accent", "normal"] as import("@/lib/metronome-engine").BeatType[],
  beatSubdivisions: {},
  activeSubNote: -1,
  isPlaying: false,
  isDark: true,
  text: "#fff",
  faint: "#888",
  accent: "#ffd54f",
  onPlayPause: jest.fn(),
  onPlayLongPress: jest.fn(),
  onBeatsChange: jest.fn(),
  onBeatTypeChange: jest.fn(),
  onBeatSubdivisionChange: jest.fn(),
  onApplyPatternToAll: jest.fn(),
  onPatternChange: jest.fn(),
  onDragStart: jest.fn(),
  onDragMove: jest.fn(),
  onDragCancel: jest.fn(),
  onReset: jest.fn(),
});

describe("StageEmptyPerformanceDisplay", () => {
  it("shows the performance readout and full Beat editor while stopped", () => {
    const props = makeProps();
    const { getByTestId } = render(<StageEmptyPerformanceDisplay {...props} />);

    expect(getByTestId("mock-stage-beat-column")).toBeTruthy();
    expect(getByTestId("stage-empty-editor")).toBeTruthy();
    expect(getByTestId("mock-subdivision-bar")).toBeTruthy();

    fireEvent.click(getByTestId("stage-empty-play-pause"));
    expect(props.onPlayPause).toHaveBeenCalledTimes(1);
  });

  it("keeps the stage readout but hides editing controls during playback", () => {
    const props = makeProps();
    const { getByTestId, queryByTestId } = render(
      <StageEmptyPerformanceDisplay {...props} currentBeat={2} isPlaying />,
    );

    expect(getByTestId("mock-stage-beat-column")).toBeTruthy();
    expect(queryByTestId("stage-empty-editor")).toBeNull();
  });

  it("keeps apply-to-all wired to the current subdivision pattern", () => {
    const props = makeProps();
    const { getByTestId } = render(<StageEmptyPerformanceDisplay {...props} />);

    fireEvent.click(getByTestId("stage-empty-apply-all"));
    expect(props.onApplyPatternToAll).toHaveBeenCalledWith(["accent", "normal"]);
  });
});