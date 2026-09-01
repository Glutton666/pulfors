/** @jest-environment jsdom */
import React from "react";
import { fireEvent, render } from "@testing-library/react";
import * as ReactNative from "react-native";

import { BarPlayButton } from "@/components/BarPlayButton";
import {
  BAR_PLAY_GESTURE_DIRECTION_CHANGES,
  createBarPlayGestureState,
  updateBarPlayGesture,
} from "@/lib/bar-play-gesture";

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

const getLastPanResponderConfig = (
  ReactNative as unknown as { __getLastPanResponderConfig: () => any }
).__getLastPanResponderConfig;

const alternatingPositions = [
  -20,
  20,
  -20,
  20,
  -20,
  20,
  -20,
  20,
  -20,
];

describe("bar play gesture tracker", () => {
  it("requires four full round trips before triggering", () => {
    let state = createBarPlayGestureState();

    alternatingPositions.slice(0, -1).forEach((x) => {
      const result = updateBarPlayGesture(state, x);
      state = result.state;
      expect(result.triggered).toBe(false);
    });

    const final = updateBarPlayGesture(
      state,
      alternatingPositions.at(-1)!,
    );
    expect(final.state.directionChanges).toBe(
      BAR_PLAY_GESTURE_DIRECTION_CHANGES,
    );
    expect(final.triggered).toBe(true);
  });

  it("ignores short jitter and repeated movement in one direction", () => {
    let state = createBarPlayGestureState();
    for (const x of [-4, -9, -15, -20, -26, -32, -24, -28]) {
      state = updateBarPlayGesture(state, x).state;
    }

    expect(state.directionChanges).toBe(0);
  });

  it("works from either initial direction", () => {
    let state = createBarPlayGestureState();
    let triggered = false;
    for (const x of alternatingPositions.map((position) => -position)) {
      const result = updateBarPlayGesture(state, x);
      state = result.state;
      triggered = result.triggered;
    }

    expect(triggered).toBe(true);
  });
});

describe("BarPlayButton random entry", () => {
  const renderButton = (
    overrides: Partial<React.ComponentProps<typeof BarPlayButton>> = {},
  ) => {
    const onTogglePlay = jest.fn();
    const onBarLoopModeChange = jest.fn();
    const onRandomPlayRequest = jest.fn();
    const view = render(
      <BarPlayButton
        isPlaying={false}
        isPreparing={false}
        barLoopMode="once"
        onTogglePlay={onTogglePlay}
        onBarLoopModeChange={onBarLoopModeChange}
        blockPlayMode="loop"
        onRandomPlayRequest={onRandomPlayRequest}
        baseStyle={{}}
        accentColor="#ffcc00"
        dangerColor="#ff0000"
        backgroundColor="#000000"
        iconSize={34}
        badgeIconSize={13}
        t={(_section, key) => String(key)}
        {...overrides}
      />,
    );
    return {
      ...view,
      onTogglePlay,
      onBarLoopModeChange,
      onRandomPlayRequest,
    };
  };

  beforeEach(() => {
    const Animated = ReactNative.Animated as any;
    Animated.Value.prototype.stopAnimation = jest.fn();
    Animated.sequence = jest.fn(() => ({ start: jest.fn() }));
    Animated.parallel = jest.fn(() => ({ start: jest.fn() }));
  });

  it("requests random playback once at the fourth round trip", () => {
    const { onRandomPlayRequest } = renderButton();
    const pan = getLastPanResponderConfig();
    const event = { nativeEvent: {} };

    pan.onPanResponderGrant(event, {});
    alternatingPositions.forEach((dx, index) => {
      pan.onPanResponderMove(event, { dx, dy: 0 });
      expect(onRandomPlayRequest).toHaveBeenCalledTimes(
        index === alternatingPositions.length - 1 ? 1 : 0,
      );
    });
    pan.onPanResponderMove(event, { dx: 20, dy: 0 });

    expect(onRandomPlayRequest).toHaveBeenCalledTimes(1);
  });

  it("resets partial progress when the gesture ends or is cancelled", () => {
    const { onRandomPlayRequest } = renderButton();
    const pan = getLastPanResponderConfig();
    const event = { nativeEvent: {} };

    pan.onPanResponderGrant(event, {});
    alternatingPositions.slice(0, -1).forEach((dx) => {
      pan.onPanResponderMove(event, { dx, dy: 0 });
    });
    pan.onPanResponderRelease(event, {});

    pan.onPanResponderGrant(event, {});
    pan.onPanResponderMove(event, { dx: -20, dy: 0 });
    expect(onRandomPlayRequest).not.toHaveBeenCalled();

    pan.onPanResponderTerminate(event, {});
    pan.onPanResponderGrant(event, {});
    alternatingPositions.forEach((dx) => {
      pan.onPanResponderMove(event, { dx, dy: 0 });
    });
    expect(onRandomPlayRequest).toHaveBeenCalledTimes(1);
  });

  it("does not claim the gesture while playing or preparing", () => {
    renderButton({ isPlaying: true });
    let pan = getLastPanResponderConfig();
    expect(
      pan.onMoveShouldSetPanResponder({}, { dx: 30, dy: 0 }),
    ).toBe(false);

    renderButton({ isPreparing: true });
    pan = getLastPanResponderConfig();
    expect(
      pan.onMoveShouldSetPanResponder({}, { dx: 30, dy: 0 }),
    ).toBe(false);
  });

  it("keeps normal tap and long-press behavior", () => {
    const { getByTestId, onTogglePlay, onBarLoopModeChange } =
      renderButton();
    const button = getByTestId("bar-play-button");

    fireEvent.click(button);
    fireEvent.contextMenu(button);

    expect(onTogglePlay).toHaveBeenCalledTimes(1);
    expect(onBarLoopModeChange).toHaveBeenCalledWith("loop");
  });
});