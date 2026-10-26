/** @jest-environment jsdom */
import React from "react";
import { act, fireEvent, render, renderHook } from "@testing-library/react";
import { useRhythmCalibration } from "../hooks/useRhythmCalibration";
import { calibrationResult } from "../lib/rhythm-lab/calibration";
import { RhythmCalibrationPanel } from "../components/lab-score/RhythmCalibrationPanel";
import type { RhythmReferenceOptions } from "../lib/rhythm-lab/reference-track";

jest.mock("react-native", () => ({
  View: ({ children }: any) => <div>{children}</div>,
  Text: ({ children, testID }: any) => <span data-testid={testID}>{children}</span>,
  TextInput: ({ value, onChangeText, onBlur, testID }: any) =>
    <input data-testid={testID} value={value} onChange={(e) => onChangeText(e.target.value)} onBlur={onBlur} />,
  Pressable: ({ children, onPress, disabled, testID }: any) =>
    <button data-testid={testID} onClick={onPress} disabled={disabled}>{children}</button>,
}));
jest.mock("../contexts/ThemeContext", () => ({ useTheme: () => ({ colors: {} }) }));
jest.mock("../components/lab-score/RhythmInputSurface", () => ({
  RhythmInputSurface: ({ children, onDown, disabled, testID }: any) =>
    <button data-testid={testID} onPointerDown={onDown} disabled={disabled}>{children}</button>,
}));

const mockPasses: { end: () => void; beat: (index: number) => void; ready: (origin: number) => void; fail: () => void }[] = [];
const mockStop = jest.fn();
jest.mock("../lib/rhythm-lab/reference-track", () => ({
  createRhythmReferenceTrack: () => ({
    stop: mockStop,
    start: jest.fn(async (options: RhythmReferenceOptions) => {
      mockPasses.push({
        end: () => options.onEnded?.(), beat: (i) => options.onBeat?.(i, 0),
        ready: (origin) => options.onStarted?.({
          originMs: origin, intervalMs: options.intervalMs, requestedAtMs: 0, preparedAtMs: origin - 50,
          playRequestedAtMs: origin - 20, observedAtMs: origin + 10, observedPositionMs: 10,
          clock: "native-position-observation",
        }),
        fail: () => options.onError?.(new Error("Interrupted")),
      });
    }),
  }),
}));

test.each([-80, 0, 60])("calibration compensates signed %ims input offset without changing input", (offset) => {
  const reference = Array.from({ length: 16 }, (_, i) => 2000 + i * 500);
  const taps = reference.map((time, i) => time + offset + (i % 3 - 1) * 4);
  const raw = [...taps];
  expect(Math.abs(calibrationResult(taps, reference, 500) - offset)).toBeLessThanOrEqual(4);
  expect(taps).toEqual(raw);
});

test("missing, duplicate, one-beat shifted and unstable inputs never become valid calibration", () => {
  const reference = Array.from({ length: 16 }, (_, i) => i * 500);
  expect(() => calibrationResult(reference.slice(1), reference, 500)).toThrow();
  expect(() => calibrationResult(reference.map((time) => time + 500), reference, 500)).toThrow();
  expect(() => calibrationResult(reference.map((time, i) => i === 9 ? reference[8] + 20 : time), reference, 500)).toThrow();
  expect(() => calibrationResult(reference.map((time, i) => time + (i % 2 ? 150 : -150)), reference, 500)).toThrow();
  const jittered = reference.map((time, i) => time + (i % 2 ? 60 : -60));
  expect(() => calibrationResult(jittered, jittered.map((time) => time + 30), 500)).toThrow();
});

describe("calibration controls", () => {
  const mount = (phase: "idle" | "playing" = "idle", offset = "0") => {
    const props = { ko: true, calibration: { phase, count: 0, message: "", start: jest.fn(), tap: jest.fn(), cancel: jest.fn() },
      offset, onOffset: jest.fn(), onStart: jest.fn(), onTap: jest.fn(), onReset: jest.fn(), disabled: false };
    return { ...render(<RhythmCalibrationPanel {...props} />), props };
  };
  test("leaving an unchanged offset field does not edit or cancel calibration", () => {
    const screen = mount("playing");
    fireEvent.blur(screen.getByTestId("rhythm-offset-input"));
    expect(screen.props.onOffset).not.toHaveBeenCalled();
  });
  test("blur still normalizes a noncanonical manual value", () => {
    const screen = mount("idle", "001");
    fireEvent.blur(screen.getByTestId("rhythm-offset-input"));
    expect(screen.props.onOffset).toHaveBeenCalledWith("1");
  });
  test("the idle pad starts reference playback instead of silently ignoring taps", () => {
    const screen = mount();
    const pad = screen.getByTestId("rhythm-calibration-tap");
    expect(pad.hasAttribute("disabled")).toBe(false);
    fireEvent.pointerDown(pad);
    expect(screen.props.onStart).toHaveBeenCalledTimes(1);
    expect(screen.props.onTap).not.toHaveBeenCalled();
  });
  test("the active pad records input rather than restarting reference playback", () => {
    const screen = mount("playing");
    fireEvent.pointerDown(screen.getByTestId("rhythm-calibration-tap"));
    expect(screen.props.onTap).toHaveBeenCalledTimes(1);
    expect(screen.props.onStart).not.toHaveBeenCalled();
  });
});

describe("reference session lifecycle", () => {
  let time = 0;
  beforeEach(() => {
    mockPasses.length = 0; jest.clearAllMocks();
    jest.spyOn(performance, "now").mockImplementation(() => time);
  });
  afterEach(() => jest.restoreAllMocks());
  test("prepare delay and warm-up are not input; only completed 16-beat pass applies", () => {
    const apply = jest.fn();
    const hook = renderHook(() => useRhythmCalibration(apply));
    act(() => hook.result.current.tap());
    expect(hook.result.current.count).toBe(0);
    act(() => hook.result.current.start(500));
    time = 750; act(() => hook.result.current.tap());
    expect(hook.result.current.count).toBe(0);
    const pass = mockPasses[0];
    act(() => pass.ready(1200));
    for (let i = 0; i < 20; i++) {
      time = 1200 + i * 500;
      act(() => pass.beat(i));
      time += 40;
      act(() => hook.result.current.tap());
    }
    expect(hook.result.current.count).toBe(16);
    expect(apply).not.toHaveBeenCalled();
    act(() => pass.end());
    expect(apply).toHaveBeenCalledWith(40);
    expect(hook.result.current.phase).toBe("done");
    act(() => hook.result.current.tap());
    expect(apply).toHaveBeenCalledTimes(1);
  });
  test("restart, cancel and unmount invalidate late output callbacks and clear collected taps", () => {
    const apply = jest.fn(), hook = renderHook(() => useRhythmCalibration(apply));
    act(() => hook.result.current.start(500));
    const old = mockPasses[0];
    act(() => old.ready(100));
    time = 100; act(() => old.beat(0));
    time = 2150; act(() => hook.result.current.tap());
    expect(hook.result.current.count).toBe(1);
    act(() => hook.result.current.start(500));
    act(() => { old.beat(4); old.end(); });
    expect(hook.result.current.count).toBe(0);
    expect(hook.result.current.phase).toBe("preparing");
    act(() => hook.result.current.cancel());
    act(() => mockPasses[1].end());
    expect(hook.result.current.phase).toBe("idle");
    expect(apply).not.toHaveBeenCalled();
    hook.unmount();
    old.beat(5); old.end();
    expect(mockStop).toHaveBeenCalled();
  });
  test("late/skipped visual callbacks cannot shift the reference grid", () => {
    const apply = jest.fn(), hook = renderHook(() => useRhythmCalibration(apply));
    act(() => hook.result.current.start(500));
    const pass = mockPasses[0];
    act(() => pass.ready(1000));
    // No per-beat callback arrives on time; taps still use the audio grid.
    for (let i = 0; i < 16; i++) {
      time = 1000 + (i + 4) * 500 + 55;
      act(() => hook.result.current.tap());
      if (i % 3 === 0) { time += 180; act(() => pass.beat(i + 4)); }
    }
    act(() => pass.end());
    expect(apply).toHaveBeenCalledWith(55);
  });
  test("interruption rejects partial calibration without applying a value", () => {
    const apply = jest.fn(), hook = renderHook(() => useRhythmCalibration(apply));
    act(() => hook.result.current.start(500));
    act(() => { mockPasses[0].ready(100); mockPasses[0].fail(); });
    expect(hook.result.current.phase).toBe("error");
    expect(apply).not.toHaveBeenCalled();
  });
});
