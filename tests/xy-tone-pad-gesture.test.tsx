/** @jest-environment jsdom */
import React from "react";
import { act, fireEvent, render } from "@testing-library/react";
import { Platform } from "react-native";
import { XYTonePad } from "@/components/settings/XYTonePad";

jest.mock("@/contexts/ThemeContext", () => ({ useTheme: () => ({ colors: {} }) }));
jest.mock("react-native", () => {
  const native = jest.requireActual("react-native");
  const React = require("react");
  return {
    ...native,
    View: React.forwardRef(function TestView({ children, testID, onLayout, onPointerDown }: any, ref: any) {
      return React.createElement("div", {
        "data-testid": testID, onPointerDown,
        ref: (node: any) => {
          if (node) {
            node.__onLayout = onLayout;
            node.measureInWindow = (cb: any) => cb(100, 200, 200, 200);
          }
          if (typeof ref === "function") ref(node);
          else if (ref) ref.current = node;
        },
      }, children);
    }),
  };
});

const labels = { title: "Fader", attack: "Attack", high: "High", low: "Low", resonance: "Resonance", neutral: "Neutral", reset: "Reset" };
function setup() {
  const onChange = jest.fn();
  const view = render(<XYTonePad tonePosition={{ x: 0, y: 0 }} onTonePositionChange={onChange} labels={labels} />);
  const pad = view.getByTestId("xy-tone-pad-control") as any;
  act(() => pad.__onLayout({ nativeEvent: { layout: { width: 200, height: 200 } } }));
  pad.getBoundingClientRect = () => ({ left: 100, top: 200, width: 200, height: 200 });
  const config = require("react-native").__getLastPanResponderConfig();
  return { ...view, pad, config, onChange };
}
const event = (x: number, y: number) => ({ nativeEvent: { locationX: x, locationY: y, pageX: x + 100, pageY: y + 200 } });
function pointer(target: Element | Document, kind: string, x: number, y: number) {
  const e = new Event(kind, { bubbles: true, cancelable: true });
  Object.assign(e, { clientX: x, clientY: y, pointerId: 1, button: 0, isPrimary: true });
  fireEvent(target, e);
}

afterEach(() => { jest.restoreAllMocks(); });

test("native fast diagonal reversals update both axes and use the latest callback", () => {
  Platform.OS = "ios";
  const view = setup();
  const latest = jest.fn();
  view.rerender(<XYTonePad tonePosition={{ x: -1, y: -1 }} onTonePositionChange={latest} labels={labels} />);
  act(() => {
    view.config.onPanResponderGrant(event(100, 100));
    view.config.onPanResponderMove(event(1, 1), { dx: -100, dy: -100 });
    view.config.onPanResponderMove(event(1, 1), { dx: 100, dy: 100 });
    view.config.onPanResponderMove(event(1, 1), { dx: 0, dy: 0 });
    view.config.onPanResponderRelease();
  });
  expect(view.onChange).not.toHaveBeenCalled();
  expect(latest.mock.calls.map(([p]) => p)).toEqual([{ x: 0, y: 0 }, { x: -1, y: -1 }, { x: 1, y: 1 }, { x: 0, y: 0 }]);
});

test("native page-coordinate fallback subtracts the pad origin", () => {
  Platform.OS = "ios";
  const { config, onChange } = setup();
  act(() => config.onPanResponderGrant({ nativeEvent: { pageX: 100, pageY: 200 } }));
  expect(onChange).toHaveBeenLastCalledWith({ x: -1, y: -1 });
});

test("only two nearby completed taps reset; rapid drags are never double taps", () => {
  Platform.OS = "ios";
  jest.spyOn(Date, "now").mockReturnValue(1000);
  const { config, onChange, getByTestId } = setup();
  act(() => {
    config.onPanResponderGrant(event(20, 20));
    config.onPanResponderMove(event(0, 0), { dx: -20, dy: -20 });
    config.onPanResponderRelease();
    config.onPanResponderGrant(event(180, 180));
    config.onPanResponderMove(event(200, 200), { dx: 20, dy: 20 });
    config.onPanResponderRelease();
  });
  expect(onChange).toHaveBeenLastCalledWith({ x: 1, y: 1 });
  act(() => {
    config.onPanResponderGrant(event(30, 30));
    config.onPanResponderRelease();
    config.onPanResponderGrant(event(31, 31));
    config.onPanResponderRelease();
  });
  expect(onChange).toHaveBeenLastCalledWith({ x: 0, y: 0 });
  fireEvent.click(getByTestId("xy-tone-pad-reset"));
  expect(onChange).toHaveBeenLastCalledWith({ x: 0, y: 0 });
});

test("web pointers drag outside the pad, reset, and detach on unmount", () => {
  Platform.OS = "web";
  const { pad, onChange, unmount, getByTestId } = setup();
  pointer(pad, "pointerdown", 200, 300);
  pointer(document, "pointermove", 100, 200);
  pointer(document, "pointermove", 400, 500);
  pointer(document, "pointerup", 200, 300);
  expect(onChange.mock.calls.map(([p]) => p)).toEqual([{ x: 0, y: 0 }, { x: -1, y: -1 }, { x: 1, y: 1 }, { x: 0, y: 0 }]);
  pointer(pad, "pointerdown", 100, 200);
  fireEvent.click(getByTestId("xy-tone-pad-reset"));
  const afterReset = onChange.mock.calls.length;
  pointer(document, "pointermove", 300, 400);
  expect(onChange).toHaveBeenCalledTimes(afterReset);
  pointer(pad, "pointerdown", 100, 200);
  unmount();
  const afterUnmount = onChange.mock.calls.length;
  pointer(document, "pointermove", 300, 400);
  expect(onChange).toHaveBeenCalledTimes(afterUnmount);
});
