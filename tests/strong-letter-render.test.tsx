/** @jest-environment jsdom */
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { Platform } from "react-native";

jest.mock("react-native-reanimated", () => ({
  __esModule: true,
  default: { View: require("react-native").View },
  useSharedValue: (value: unknown) => ({ value }),
  useAnimatedStyle: (compute: () => unknown) => compute(),
  useAnimatedReaction: () => {},
  withTiming: (value: unknown) => value,
  withSequence: (...values: unknown[]) => values.at(-1),
  Easing: { out: (value: unknown) => value, quad: (value: unknown) => value },
}));
jest.mock("expo-linear-gradient", () => ({
  LinearGradient: require("react-native").View,
}));
jest.mock("@/contexts/ThemeContext", () => ({
  useTheme: () => ({ colors: { accent: "#D4A846", accentMuted: "#887744", textTertiary: "#888888" } }),
}));

// Mock only the native SVG host, not the shared letter component under test.
jest.mock("react-native-svg", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: ({ testID, children, accessible, ...props }: any) =>
      React.createElement("svg", { ...props, "data-testid": testID }, children),
    Path: ({ testID, ...props }: any) =>
      React.createElement("path", { ...props, "data-testid": testID }),
  };
});

import { GradientLetter } from "@/components/GradientLetter";
import { DialBeatDot } from "@/components/DialBeatDot";

afterEach(cleanup);

it("scales the real dial's S in direct proportion to the surrounding beat circle", () => {
  const props = {
    index: 0, total: 4, isActive: false, beatType: "strong" as const,
    onPress: () => {}, isDropTarget: false, subdivisionCount: 0,
    dDialRadius: 100, dDotRadiusFromCenter: 80,
  };
  const { getByTestId, rerender } = render(<DialBeatDot {...props} dDotSize={20} />);
  const small = Number(getByTestId("strong-letter-svg").getAttribute("height"));
  rerender(<DialBeatDot {...props} dDotSize={40} />);
  const large = Number(getByTestId("strong-letter-svg").getAttribute("height"));
  expect(small / 20).toBeCloseTo(0.44);
  expect(large / 40).toBeCloseTo(small / 20);
  expect(large).toBeCloseTo(small * 2);
});

describe.each(["android", "ios", "web"] as const)("strong symbol on %s", (os) => {
  const previousOS = Platform.OS;
  beforeEach(() => { Platform.OS = os; });
  afterEach(() => { Platform.OS = previousOS; });

  it.each([8, 14, 24, 64])("uses a bounded vector rather than font layout in a %spx box", (size) => {
    const { getByTestId, queryByTestId, container } = render(
      <GradientLetter letter="S" width={size} height={size} fontSize={size * 0.8}
        lineHeight={size * 1.8} colors={["#1A1A1A", "#FFFFFF"]} />,
    );
    const svg = getByTestId("strong-letter-svg");
    const path = getByTestId("strong-letter-path");
    expect(Number(svg.getAttribute("width"))).toBeGreaterThan(0);
    expect(Number(svg.getAttribute("height"))).toBeGreaterThan(0);
    expect(Number(svg.getAttribute("width"))).toBeLessThanOrEqual(size);
    expect(Number(svg.getAttribute("height"))).toBeLessThanOrEqual(size);
    expect(path.getAttribute("d")).toMatch(/^M.+C.+/);
    expect(path.getAttribute("stroke")).toBe("#1A1A1A");
    expect(queryByTestId("gradient-letter-text")).toBeNull();
    expect(container.querySelector("mask")).toBeNull();
  });

  it("updates contrast without retaining the old symbol color", () => {
    const { getByTestId, rerender } = render(
      <GradientLetter letter="S" width={24} height={24} fontSize={16} lineHeight={18}
        colors={["#FFFFFF", "#1A1A1A"]} />,
    );
    rerender(<GradientLetter letter="S" width={24} height={24} fontSize={16} lineHeight={18}
      colors={["#1A1A1A", "#FFFFFF"]} />);
    expect(getByTestId("strong-letter-path").getAttribute("stroke")).toBe("#1A1A1A");
  });
});
