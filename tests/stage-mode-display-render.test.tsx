/** @jest-environment jsdom */
import React from "react";
import { act, render } from "@testing-library/react";

jest.mock("@/components/GradientLetter", () => ({
  GradientLetter: ({ letter, width, height }: { letter: string; width: number; height: number }) => (
    <span data-testid="gradient-letter" data-width={width} data-height={height}>{letter}</span>
  ),
}));

jest.mock("@/contexts/ThemeContext", () => ({
  useTheme: () => ({
    colors: {
      accent: "#D4A846",
    },
  }),
}));

import { StageBeatColumn } from "@/components/StageBeatColumn";

describe("StageBeatColumn rendered strong markers", () => {
  const baseProps: React.ComponentProps<typeof StageBeatColumn> = {
    currentBeat: 0,
    beatsPerMeasure: 2,
    beatTypes: ["strong", "strong"],
    subdivisionTypes: ["strong", "normal", "mute", "strong"],
    nextSubdivisionTypes: ["normal", "mute"],
    activeSubNote: 3,
    theme: "dark",
  };

  it("renders current and next strong markers alongside their beat numbers", () => {
    const { getByTestId, queryByTestId } = render(<StageBeatColumn {...baseProps} />);

    expect(getByTestId("stage-current-strong")).toBeTruthy();
    expect(getByTestId("stage-next-strong")).toBeTruthy();
    expect(getByTestId("stage-current-beat")).toBeTruthy();
    expect(getByTestId("stage-next-beat")).toBeTruthy();
    expect(getByTestId("stage-strong-subdivision-0")).toBeTruthy();
    expect(getByTestId("stage-strong-subdivision-3")).toBeTruthy();
    expect(queryByTestId("stage-strong-subdivision-1")).toBeNull();
    expect(queryByTestId("stage-strong-subdivision-2")).toBeNull();
    expect(getByTestId("stage-strong-subdivision-3")).toBeTruthy();
  });

  it("only shows main strong markers for strong beat types", () => {
    const { queryByTestId, rerender } = render(
      <StageBeatColumn {...baseProps} beatTypes={["strong", "normal"]} />,
    );
    expect(queryByTestId("stage-current-strong")).toBeTruthy();
    expect(queryByTestId("stage-next-strong")).toBeNull();

    rerender(<StageBeatColumn {...baseProps} beatTypes={["normal", "strong"]} />);
    expect(queryByTestId("stage-current-strong")).toBeNull();
    expect(queryByTestId("stage-next-strong")).toBeTruthy();
  });

  it("keeps active strong subdivision markers after a narrow layout", () => {
    const { getByTestId } = render(<StageBeatColumn {...baseProps} />);
    const column = getByTestId("stage-beat-column");

    act(() => {
      (column as HTMLElement & {
        __onLayout?: (event: { nativeEvent: { layout: { width: number; height: number } } }) => void;
      }).__onLayout?.({
        nativeEvent: { layout: { width: 96, height: 120 } },
      });
    });

    expect(getByTestId("stage-strong-subdivision-3")).toBeTruthy();
    expect(getByTestId("stage-current-beat")).toBeTruthy();
    const letters = document.querySelectorAll('[data-testid="gradient-letter"]');
    expect(letters.length).toBeGreaterThan(0);
    for (const letter of letters) {
      expect(Number(letter.getAttribute("data-width"))).toBeGreaterThanOrEqual(8);
      expect(Number(letter.getAttribute("data-height"))).toBeGreaterThanOrEqual(8);
    }
  });
});