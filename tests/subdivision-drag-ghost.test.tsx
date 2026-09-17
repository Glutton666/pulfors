/** @jest-environment jsdom */
import React from "react";
import { render } from "@testing-library/react";
import * as ReactNative from "react-native";

import { SubdivisionBar } from "@/components/SubdivisionBar";

const getLastPanResponderConfig = (
  ReactNative as unknown as { __getLastPanResponderConfig: () => any }
).__getLastPanResponderConfig;

jest.mock("@expo/vector-icons", () => ({
  Feather: () => null,
}));

jest.mock("expo-linear-gradient", () => ({
  LinearGradient: () => null,
}));

jest.mock("@/contexts/ThemeContext", () => ({
  useTheme: () => ({
    colors: {
      accent: "#e0b34d",
      accentMuted: "#af8f42",
      text: "#ffffff",
      textTertiary: "#8a8d98",
      white: "#ffffff",
      backgroundSecondary: "#1a1c22",
    },
  }),
}));

jest.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({ t: (_section: string, key: string) => key }),
}));

jest.mock("@/lib/scale", () => ({
  useScale: () => ({ ms: (value: number) => value }),
}));

jest.mock("react-native-reanimated", () => {
  const { View } = require("react-native");
  return {
    __esModule: true,
    default: { View },
    useSharedValue: (value: number) => ({ value }),
    useAnimatedStyle: () => ({}),
    withTiming: (value: number) => value,
    withSequence: (...values: number[]) => values.at(-1),
    withSpring: (value: number) => value,
  };
});

describe("SubdivisionBar drag cancellation", () => {
  const renderBar = (onDragCancel = jest.fn()) => {
    const onDragStart = jest.fn();
    const onDragMove = jest.fn();
    const onDragEnd = jest.fn();
    const view = render(
      <SubdivisionBar
        pattern={["accent", "normal"]}
        onPatternChange={jest.fn()}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
        onReset={jest.fn()}
      />,
    );
    return { ...view, onDragStart, onDragMove, onDragEnd, onDragCancel };
  };

  it("cancels instead of applying a drop when a native drag is terminated", () => {
    const { onDragStart, onDragMove, onDragEnd, onDragCancel } = renderBar();
    const pan = getLastPanResponderConfig();
    const event = { nativeEvent: { pageX: 120, pageY: 240 } };

    pan.onPanResponderGrant(event, {});
    pan.onPanResponderMove(event, { dx: 0, dy: -24 });

    expect(onDragStart).toHaveBeenCalledTimes(1);
    expect(onDragMove).toHaveBeenCalledWith(120, 240);

    pan.onPanResponderTerminate(event, { dx: 0, dy: -24 });

    expect(onDragCancel).toHaveBeenCalledTimes(1);
    expect(onDragEnd).not.toHaveBeenCalled();
  });

  it("claims an upward pattern drag before the parent bar-add gesture", () => {
    renderBar();
    const pan = getLastPanResponderConfig();

    expect(pan.onMoveShouldSetPanResponderCapture({}, { dx: 2, dy: -20 })).toBe(true);
    expect(pan.onMoveShouldSetPanResponderCapture({}, { dx: 2, dy: 20 })).toBe(false);
    expect(pan.onMoveShouldSetPanResponderCapture({}, { dx: 20, dy: -10 })).toBe(false);
  });

  it("uses the latest native gesture coordinates when the release event is stale", () => {
    const { onDragMove, onDragEnd } = renderBar();
    const pan = getLastPanResponderConfig();
    const staleEvent = { nativeEvent: { pageX: 0, pageY: 0 } };

    pan.onPanResponderGrant(staleEvent, {});
    pan.onPanResponderMove(staleEvent, { dx: 0, dy: -24, moveX: 140, moveY: 260 });
    pan.onPanResponderRelease(staleEvent, { dx: 0, dy: -80, moveX: 120, moveY: 180 });

    expect(onDragMove).toHaveBeenCalledWith(140, 260);
    expect(onDragEnd).toHaveBeenCalledWith(120, 180);
  });

  it("cleans up an active drag when the drawer unmounts", () => {
    const { unmount, onDragCancel } = renderBar();
    const pan = getLastPanResponderConfig();
    const event = { nativeEvent: { pageX: 80, pageY: 160 } };

    pan.onPanResponderGrant(event, {});
    pan.onPanResponderMove(event, { dx: 0, dy: -20 });
    unmount();

    expect(onDragCancel).toHaveBeenCalledTimes(1);
  });

  it("delivers a complete web pointer drag from the drawer to its drop owner", () => {
    const previousOS = ReactNative.Platform.OS;
    (ReactNative.Platform as unknown as { OS: string }).OS = "web";
    const { getByTestId, onDragStart, onDragMove, onDragEnd, unmount } = renderBar();
    const pointerEvent = (type: string, clientX: number, clientY: number) =>
      new MouseEvent(type, { bubbles: true, clientX, clientY });

    getByTestId("subdivision-gesture-wrapper").dispatchEvent(pointerEvent("pointerdown", 180, 420));
    document.dispatchEvent(pointerEvent("pointermove", 180, 390));
    document.dispatchEvent(pointerEvent("pointermove", 120, 180));
    document.dispatchEvent(pointerEvent("pointerup", 120, 180));

    expect(onDragStart).toHaveBeenCalledTimes(1);
    expect(onDragMove).toHaveBeenLastCalledWith(120, 180);
    expect(onDragEnd).toHaveBeenCalledWith(120, 180);

    unmount();
    (ReactNative.Platform as unknown as { OS: string }).OS = previousOS;
  });
});