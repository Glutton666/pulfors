/** @jest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { Platform } from "react-native";
import { useCircularSubdivision } from "../hooks/useCircularSubdivision";
import type { BeatType } from "../lib/metronome-engine";

jest.mock("react-native", () => {
  const actual = jest.requireActual("react-native");
  return { ...actual, Platform: { OS: "web" }, AppState: { addEventListener: () => ({ remove() {} }) },
    PanResponder: { create: (config: unknown) => ({ panHandlers: config }) } };
});
const native = (x: number, y: number) => ({ nativeEvent: { pageX: x, pageY: y, touches: [{}] } });
function pointer(type: string, x: number, y: number, target: EventTarget = document, id = 1) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperties(event, { pointerId: { value: id }, isPrimary: { value: true } });
  target.dispatchEvent(event);
}
function setup() {
  const dial = document.createElement("div");
  const dot = document.createElement("div");
  dot.setAttribute("data-circular-beat", "2");
  dial.append(dot);
  document.body.append(dial);
  dial.getBoundingClientRect = () => ({ left: 100, top: 100, width: 300, height: 300 }) as DOMRect;
  (dial as any).measureInWindow = (callback: Function) => callback(100, 100, 300);
  const onCommit = jest.fn(), onTap = jest.fn(), onClaim = jest.fn();
  const options = { enabled: true, dialRef: { current: dial as any }, size: 300, radius: 120,
    width: 400, height: 800, beatTypes: ["strong", "normal", "accent", "normal"] as BeatType[],
    total: 4, beatDirection: "cw" as const, onCommit, onTap, onClaim };
  const hook = renderHook((props) => useCircularSubdivision(props), { initialProps: options });
  return { ...hook, options, dot, onCommit, onTap, onClaim };
}
beforeEach(() => { jest.useFakeTimers(); (Platform as any).OS = "web"; });
afterEach(() => { document.body.innerHTML = ""; jest.useRealTimers(); });

test("web hold-move-release commits only the original beat once and suppresses ghost click", () => {
  const { result, dot, onCommit, onClaim } = setup();
  act(() => pointer("pointerdown", 250, 370, dot));
  act(() => jest.advanceTimersByTime(400));
  expect(result.current.draft?.beatIndex).toBe(2);
  expect(onClaim).toHaveBeenCalledTimes(1);
  act(() => pointer("pointermove", 250, 343.6));
  act(() => pointer("pointerup", 250, 343.6));
  expect(onCommit).toHaveBeenCalledWith(2, ["accent"]);
  expect(onCommit).toHaveBeenCalledTimes(1);
  const click = new MouseEvent("click", { bubbles: true, cancelable: true });
  expect(dot.dispatchEvent(click)).toBe(false);
  expect(result.current.draft).toBeNull();
});
test.each(["pointercancel", "lostpointercapture", "blur", "disable", "rotate"])("%s discards draft without commit", (kind) => {
  const { result, dot, onCommit, rerender, options } = setup();
  act(() => pointer("pointerdown", 250, 370, dot));
  act(() => jest.advanceTimersByTime(400));
  act(() => {
    if (kind === "blur") window.dispatchEvent(new Event("blur"));
    else if (kind === "disable") rerender({ ...options, enabled: false });
    else if (kind === "rotate") rerender({ ...options, width: 800, height: 400 });
    else pointer(kind, 250, 343.6);
  });
  expect(result.current.draft).toBeNull();
  act(() => pointer("pointerup", 250, 343.6));
  expect(onCommit).not.toHaveBeenCalled();
});
test("ordinary tap and pre-hold swipe do not activate or commit", () => {
  const { result, dot, onCommit, onClaim } = setup();
  act(() => { pointer("pointerdown", 250, 370, dot); pointer("pointerup", 250, 370); });
  act(() => jest.advanceTimersByTime(500));
  expect(onClaim).not.toHaveBeenCalled();
  act(() => { pointer("pointerdown", 250, 370, dot); pointer("pointermove", 290, 370); });
  act(() => jest.advanceTimersByTime(500));
  expect(result.current.draft).toBeNull();
  expect(onCommit).not.toHaveBeenCalled();
});
test("second contact and unmount discard pending timers/draft", () => {
  const { result, dot, onCommit, unmount } = setup();
  act(() => pointer("pointerdown", 250, 370, dot));
  act(() => jest.advanceTimersByTime(400));
  act(() => pointer("pointerdown", 260, 370, dot, 2));
  expect(result.current.draft).toBeNull();
  act(() => pointer("pointerup", 250, 370));
  act(() => pointer("pointerdown", 250, 370, dot));
  unmount();
  act(() => jest.advanceTimersByTime(500));
  expect(onCommit).not.toHaveBeenCalled();
});
test("native responder captures hold but yields ordinary swipes and performs a short tap once", () => {
  (Platform as any).OS = "ios";
  const { result, onTap, onCommit } = setup();
  const handlers = result.current.nativeHandlers[2] as any;
  expect(handlers.onStartShouldSetPanResponderCapture()).toBe(true);
  act(() => handlers.onPanResponderGrant(native(250, 370)));
  expect(handlers.onPanResponderTerminationRequest()).toBe(true);
  act(() => handlers.onPanResponderRelease(native(250, 370)));
  expect(onTap).toHaveBeenCalledWith(2);
  act(() => handlers.onPanResponderGrant(native(250, 370)));
  act(() => jest.advanceTimersByTime(400));
  expect(handlers.onPanResponderTerminationRequest()).toBe(false);
  act(() => handlers.onPanResponderMove(native(250, 317.2), { numberActiveTouches: 1 }));
  act(() => handlers.onPanResponderRelease(native(250, 317.2)));
  expect(onCommit).toHaveBeenCalledWith(2, ["normal"]);
  expect(onTap).toHaveBeenCalledTimes(1);
});
test("Android termination never saves and disables parent swipe until contact ends", () => {
  (Platform as any).OS = "android";
  const { result, onCommit } = setup();
  const handlers = result.current.nativeHandlers[2] as any;
  act(() => handlers.onPanResponderGrant(native(250, 370)));
  act(() => jest.advanceTimersByTime(400));
  act(() => handlers.onPanResponderTerminate());
  expect(result.current.draft).toBeNull();
  expect(result.current.ownedRef.current).toBe(true);
  act(() => handlers.onPanResponderRelease(native(250, 370)));
  expect(result.current.ownedRef.current).toBe(false);
  expect(onCommit).not.toHaveBeenCalled();
});

test("lost release after blur does not leave the next contact or unrelated button blocked", () => {
  const { result, dot, onCommit } = setup();
  act(() => pointer("pointerdown", 250, 370, dot));
  act(() => jest.advanceTimersByTime(400));
  act(() => window.dispatchEvent(new Event("blur")));
  act(() => pointer("pointerdown", 250, 370, dot, 3));
  act(() => jest.advanceTimersByTime(400));
  expect(result.current.draft?.beatIndex).toBe(2);
  act(() => pointer("pointerup", 250, 343.6, document, 3));
  expect(onCommit).toHaveBeenCalledTimes(1);
  const button = document.createElement("button");
  document.body.append(button);
  act(() => pointer("pointerdown", 10, 10, button, 4));
  expect(button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))).toBe(true);
});