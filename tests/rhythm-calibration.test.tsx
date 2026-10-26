/** @jest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { useRhythmCalibration } from "../hooks/useRhythmCalibration";
import { calibrationResult } from "../lib/rhythm-lab/calibration";

const mockPasses: { end: () => void; beat: (index: number) => void }[] = [];
const mockStop = jest.fn();
jest.mock("../lib/rhythm-lab/audio", () => ({
  createRhythmAudioSession: () => ({
    stop: mockStop,
    play: jest.fn(async (_hits: unknown, _start: unknown, end: () => void, beat: (index: number) => void) => {
      mockPasses.push({ end, beat });
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
});
