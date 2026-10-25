/** @jest-environment jsdom */
import React from "react";
import { act, fireEvent, render } from "@testing-library/react";
import { RhythmInputSurface } from "../components/lab-score/RhythmInputSurface";
import { RhythmKeyboard } from "../components/lab-score/RhythmKeyboard";

let mockResponder: any;
let mockViewProps: any;
jest.mock("react-native", () => {
  const React = require("react");
  return {
    Platform: { OS: "web" },
    PanResponder: { create: (config: any) => { mockResponder = config; return { panHandlers: {} }; } },
    Text: ({ children }: any) => React.createElement("span", null, children),
    View: (props: any) => {
      if (props.testID) mockViewProps = props;
      return React.createElement("div", {
        "data-testid": props.testID, "aria-pressed": props["aria-pressed"],
        onKeyDown: props.onKeyDown, onKeyUp: props.onKeyUp, onBlur: props.onBlur,
        onClick: props.onAccessibilityTap, tabIndex: props.focusable ? 0 : undefined,
      }, props.children);
    },
  };
});

describe("Rhythm input release boundaries", () => {
  test("pad shows a held state once and releases on responder release, cancellation, accessibility tap and blur", () => {
    const onDown = jest.fn(), onUp = jest.fn();
    const screen = render(<RhythmInputSurface label="Pad" testID="surface" onDown={onDown} onUp={onUp}>Pad</RhythmInputSurface>);
    const surface = screen.getByTestId("surface");
    act(() => { mockResponder.onPanResponderGrant(); mockResponder.onPanResponderGrant(); });
    expect(onDown).toHaveBeenCalledTimes(1);
    expect(surface.getAttribute("aria-pressed")).toBe("true");
    act(() => mockResponder.onPanResponderRelease());
    expect(onUp).toHaveBeenCalledTimes(1);
    act(() => { mockResponder.onPanResponderGrant(); mockResponder.onPanResponderTerminate(); });
    expect(surface.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(surface);
    expect(onDown).toHaveBeenCalledTimes(3);
    expect(onUp).toHaveBeenCalledTimes(3);
    fireEvent.keyDown(surface, { key: " " }); fireEvent.keyDown(surface, { key: " ", repeat: true });
    expect(onDown).toHaveBeenCalledTimes(4);
    fireEvent.blur(surface);
    expect(onUp).toHaveBeenCalledTimes(4);
    fireEvent.keyUp(surface, { key: " " });
    expect(onUp).toHaveBeenCalledTimes(4);
    fireEvent.keyDown(surface, { key: "Enter" });
    act(() => window.dispatchEvent(new Event("blur")));
    expect(surface.getAttribute("aria-pressed")).toBe("false");
    screen.unmount();
    expect(onUp).toHaveBeenCalledTimes(5);
  });

  test("locking a held pad releases it and rejects pointer, keyboard and accessibility starts", () => {
    const onDown = jest.fn(), onUp = jest.fn();
    const screen = render(<RhythmInputSurface label="Pad" testID="surface" onDown={onDown} onUp={onUp}>Pad</RhythmInputSurface>);
    act(() => mockResponder.onPanResponderGrant());
    screen.rerender(<RhythmInputSurface disabled label="Pad" testID="surface" onDown={onDown} onUp={onUp}>Pad</RhythmInputSurface>);
    expect(onUp).toHaveBeenCalledTimes(1);
    act(() => mockResponder.onPanResponderGrant());
    fireEvent.click(screen.getByTestId("surface"));
    fireEvent.keyDown(screen.getByTestId("surface"), { key: "Enter" });
    expect(onDown).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("surface").getAttribute("aria-pressed")).toBe("false");
  });

  test("keyboard independent fingers release each pitch once, including touch cancel without changedTouches", () => {
    const onDown = jest.fn(), onUp = jest.fn();
    render(<RhythmKeyboard onDown={onDown} onUp={onUp} />);
    const touch = (identifier: number, locationX: number) => ({ identifier, locationX, locationY: 100 });
    act(() => mockViewProps.onTouchStart({ nativeEvent: { changedTouches: [touch(1, 10), touch(2, 12), touch(3, 90)] } }));
    expect(onDown.mock.calls).toEqual([[60], [64]]);
    act(() => mockViewProps.onTouchEnd({ nativeEvent: { changedTouches: [touch(1, 10)] } }));
    expect(onUp).not.toHaveBeenCalled();
    act(() => mockViewProps.onTouchEnd({ nativeEvent: { changedTouches: [touch(2, 12)] } }));
    expect(onUp.mock.calls).toEqual([[60]]);
    act(() => mockViewProps.onTouchCancel({ nativeEvent: { changedTouches: [] } }));
    expect(onUp.mock.calls).toEqual([[60], [64]]);
  });

  test("keyboard holds clean up on playback lock, unmount and browser focus loss", () => {
    const onDown = jest.fn(), onUp = jest.fn();
    const screen = render(<RhythmKeyboard onDown={onDown} onUp={onUp} />);
    const keyboard = screen.getByTestId("rhythm-keyboard");
    fireEvent.keyDown(keyboard, { key: "a" }); fireEvent.keyDown(keyboard, { key: "d" });
    screen.rerender(<RhythmKeyboard disabled onDown={onDown} onUp={onUp} />);
    expect(onUp.mock.calls).toEqual([[60], [64]]);
    fireEvent.keyDown(keyboard, { key: "g" });
    expect(onDown).toHaveBeenCalledTimes(2);
    screen.rerender(<RhythmKeyboard onDown={onDown} onUp={onUp} />);
    fireEvent.keyDown(keyboard, { key: "g" });
    act(() => window.dispatchEvent(new Event("blur")));
    expect(onUp.mock.calls.at(-1)).toEqual([67]);
    fireEvent.keyDown(keyboard, { key: "a" });
    screen.unmount();
    expect(onUp.mock.calls.at(-1)).toEqual([60]);
  });
});
