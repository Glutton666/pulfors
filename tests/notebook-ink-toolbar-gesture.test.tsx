/** @jest-environment jsdom */
import React from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { NotebookInkToolbar } from "@/components/lab-score/notebook/NotebookInkToolbar";

let mockLatestPanConfig: any;
let mockPanCreateCount = 0;
const mockGeometry: Record<string, [number, number, number, number]> = {
  "notebook-ink-toolbar-root": [0, 250, 400, 66],
  "notebook-ink-tool-gesture-owner": [100, 260, 94, 44],
  "notebook-ink-tool-row-move": [100, 105, 190, 40],
  "notebook-ink-tool-row-erase": [100, 150, 190, 40],
  "notebook-ink-tool-row-pen": [100, 195, 190, 40],
};

jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("react-native", () => {
  const React = require("react");
  const native = jest.requireActual("react-native");
  const TestView = React.forwardRef(({ children, testID, onLayout }: any, ref: any) => {
    const assignRef = (node: any) => {
      if (node) {
        node.__onLayout = onLayout;
        node.measureInWindow = (callback: (x: number, y: number, width: number, height: number) => void) => {
          const bounds: [number, number, number, number] = mockGeometry[testID] ?? [100, 200, 190, 40];
          callback(...bounds);
        };
      }
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    };
    return React.createElement("div", { "data-testid": testID, ref: assignRef }, children);
  });
  const TestPressable = ({ children, testID, accessibilityRole, accessibilityLabel, disabled, onPress, onPressIn, onPressOut }: any) =>
    React.createElement("button", {
      "data-testid": testID,
      "aria-label": accessibilityLabel,
      role: accessibilityRole === "menuitem" ? "menuitem" : "button",
      disabled,
      onMouseDown: onPressIn,
      onMouseUp: onPressOut,
      onClick: onPress,
    }, children);
  return {
    ...native,
    View: TestView,
    Text: ({ children, testID }: any) => React.createElement("span", { "data-testid": testID }, children),
    Pressable: TestPressable,
    PanResponder: {
      create: (config: any) => {
        mockLatestPanConfig = config;
        mockPanCreateCount += 1;
        return { panHandlers: {} };
      },
    },
    useWindowDimensions: () => ({ width: 390, height: 844, scale: 1, fontScale: 1 }),
  };
});

function makeProps(tool: "pen" | "erase" | "move" = "pen") {
  return {
    ko: false,
    tool,
    scale: 1,
    canUndo: true,
    canRedo: true,
    pickerTop: 0,
    pickerBottom: 844,
    onTool: jest.fn(),
    onToolPopup: jest.fn(),
    onZoom: jest.fn(),
    onUndo: jest.fn(),
    onRedo: jest.fn(),
  };
}

function setup(tool: "pen" | "erase" | "move" = "pen", measureRows = true) {
  const props = makeProps(tool);
  const view = render(<NotebookInkToolbar {...props} />);
  const button = view.getByTestId("notebook-ink-tool");
  fireEvent.mouseDown(button);
  act(() => { jest.advanceTimersByTime(380); });
  if (measureRows) {
    for (const id of ["move", "erase", "pen"]) {
      const row = view.getByTestId(`notebook-ink-tool-row-${id}`) as any;
      act(() => row.__onLayout?.({ nativeEvent: { layout: { width: 190, height: 40 } } }));
    }
  }
  return { ...view, props, config: mockLatestPanConfig, button };
}

const gesture = (x0: number, y0: number, moveX: number, moveY: number) => ({
  x0, y0, moveX, moveY, dx: moveX - x0, dy: moveY - y0,
});

beforeEach(() => {
  jest.useFakeTimers();
  mockPanCreateCount = 0;
  mockLatestPanConfig = null;
  (globalThis as any).requestAnimationFrame = (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  };
  (globalThis as any).cancelAnimationFrame = jest.fn();
});

afterEach(() => {
  cleanup();
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

test("long-press upward drag follows measured menu rows and commits the selected tool once", () => {
  const { props, config } = setup("pen");
  expect(config.onMoveShouldSetPanResponderCapture()).toBe(true);
  act(() => {
    config.onPanResponderGrant({}, gesture(147, 300, 147, 300));
    config.onPanResponderMove({}, gesture(147, 300, 147, 165));
    config.onPanResponderRelease();
  });
  expect(props.onTool).toHaveBeenCalledTimes(1);
  expect(props.onTool).toHaveBeenCalledWith("erase");
  expect(props.onToolPopup).not.toHaveBeenCalled();
});

test("when menu row bounds are not ready, upward travel selects the next tool", () => {
  const { props, config } = setup("pen", false);
  act(() => {
    config.onPanResponderGrant({}, gesture(147, 300, 147, 300));
    config.onPanResponderMove({}, gesture(147, 300, 147, 255));
    config.onPanResponderRelease();
  });
  expect(props.onTool).toHaveBeenCalledTimes(1);
  expect(props.onTool).toHaveBeenCalledWith("erase");
});

test("small cumulative rightward steps open the selected eraser settings once without release selecting twice", () => {
  const { props, config } = setup("pen");
  act(() => {
    config.onPanResponderGrant({}, gesture(147, 300, 147, 300));
    config.onPanResponderMove({}, gesture(147, 300, 147, 165));
    for (const x of [157, 167, 177, 187]) {
      config.onPanResponderMove({}, gesture(147, 300, x, 165));
    }
    config.onPanResponderRelease();
  });
  expect(props.onTool.mock.calls).toEqual([["erase"]]);
  expect(props.onToolPopup.mock.calls).toEqual([["erase"]]);
  expect(props.onTool.mock.invocationCallOrder[0]).toBeLessThan(props.onToolPopup.mock.invocationCallOrder[0]);
});

test("gesture cancellation does not commit the preview selection", () => {
  const { props, config } = setup("pen", false);
  act(() => {
    config.onPanResponderGrant({}, gesture(147, 300, 147, 300));
    config.onPanResponderMove({}, gesture(147, 300, 147, 250));
    config.onPanResponderTerminate();
  });
  expect(props.onTool).not.toHaveBeenCalled();
  expect(props.onToolPopup).not.toHaveBeenCalled();
});

test("rightward movement on Move never opens unrelated settings", () => {
  const { props, config } = setup("move");
  act(() => {
    config.onPanResponderGrant({}, gesture(147, 300, 147, 300));
    config.onPanResponderMove({}, gesture(147, 300, 147, 120));
    for (const x of [157, 167, 177, 187]) {
      config.onPanResponderMove({}, gesture(147, 300, x, 120));
    }
    config.onPanResponderRelease();
  });
  expect(props.onToolPopup).not.toHaveBeenCalled();
  expect(props.onTool).not.toHaveBeenCalled();
});

test("PanResponder stays stable across preview renders and continues using current callbacks", () => {
  const { props, config, rerender } = setup("pen", false);
  const latest = jest.fn();
  rerender(<NotebookInkToolbar {...props} onTool={latest} />);
  expect(mockPanCreateCount).toBe(1);
  act(() => {
    config.onPanResponderGrant({}, gesture(147, 300, 147, 300));
    config.onPanResponderMove({}, gesture(147, 300, 147, 250));
    config.onPanResponderRelease();
  });
  expect(props.onTool).not.toHaveBeenCalled();
  expect(latest).toHaveBeenCalledWith("erase");
});
