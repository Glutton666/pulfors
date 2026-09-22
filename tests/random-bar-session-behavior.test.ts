/**
 * @jest-environment jsdom
 *
 * Behavioral coverage for the random Bar session boundary.
 *
 * This deliberately exercises the hook through renderHook rather than checking
 * its source text. The engine is mocked only at the boundary consumed by the
 * hook; playback state is changed through rerender to exercise the lifecycle
 * effect that restores the previous block mode.
 */
import { act, renderHook } from "@testing-library/react";
import type { MutableRefObject } from "react";
import type { MetronomeEngine } from "../lib/metronome-engine";
import {
  useRandomBarSession,
  type UseRandomBarSessionParams,
} from "../hooks/useRandomBarSession";

type PlaybackMode = "sequential" | "loop" | "random";

interface HookProps {
  isPlaying: boolean;
  isPreparing?: boolean;
}

const makeEngine = (events: string[]) => ({
  setRandomBarOrder: jest.fn((order: number[] | null) => {
    events.push(`order:${order === null ? "null" : order.join(",")}`);
  }),
  setBlockPlayMode: jest.fn((mode: PlaybackMode) => {
    events.push(`engine-mode:${mode}`);
  }),
  getIsRunning: jest.fn(() => true),
}) as unknown as MetronomeEngine;

const makeParams = (
  props: HookProps,
  events: string[],
  engineRef: MutableRefObject<MetronomeEngine | null>,
  blockPlayModeRef: MutableRefObject<PlaybackMode>,
): UseRandomBarSessionParams => {
  const barConfigRef = {
    current: {
      beatsPerMeasure: 4,
      beatTypes: ["normal", "normal", "normal", "normal"],
      beatSubdivisions: {},
      barRepeats: {},
      loopBlocks: [{ startBeat: 1, endBeat: 2 }],
      subdivisionPattern: ["accent"],
      noteSamples: {},
      noteSampleNames: {},
      noteSampleSources: {},
      noteSampleChannels: {},
      noteSampleVolumes: {},
      noteSampleSpeeds: {},
    },
  };

  return {
    strategy: "independent",
    setStrategy: jest.fn(),
    persistSettings: jest.fn(),
    engineRef,
    blockPlayModeRef,
    setBlockPlayMode: jest.fn((mode: PlaybackMode) => {
      events.push(`state-mode:${mode}`);
    }),
    isPlaying: props.isPlaying,
    isPreparing: props.isPreparing ?? false,
    barMode: true,
    barConfigRef,
    barLoopModeRef: { current: "once" },
    barBpmRef: { current: 120 },
    username: "behavior-test",
    noteSamplesRef: { current: {} },
    noteSampleNamesRef: { current: {} },
    noteSampleSourcesRef: { current: {} },
    noteSampleChannelsRef: { current: {} },
    noteSampleVolumesRef: { current: {} },
    noteSampleSpeedsRef: { current: {} },
    setBeatsPerMeasure: jest.fn(),
    setBeatTypes: jest.fn(),
    setBeatSubdivisions: jest.fn(),
    setBarRepeats: jest.fn(),
    setLoopBlocks: jest.fn(),
    setBarStartBeat: jest.fn(),
    setNoteSamples: jest.fn(),
    setNoteSampleNames: jest.fn(),
    setNoteSampleSources: jest.fn(),
    setNoteSampleChannels: jest.fn(),
    setNoteSampleVolumes: jest.fn(),
    setNoteSampleSpeeds: jest.fn(),
    scheduleReRender: jest.fn(),
  };
};

describe("useRandomBarSession behavior", () => {
  it("restores the previous block mode after random playback becomes active and stops", async () => {
    const events: string[] = [];
    const blockPlayModeRef = { current: "loop" as PlaybackMode };
    const engine = makeEngine(events);
    const engineRef = { current: engine };
    const fixture = makeParams(
      { isPlaying: false },
      events,
      engineRef,
      blockPlayModeRef,
    );

    const { result, rerender } = renderHook(
      (props: HookProps) =>
        useRandomBarSession({
          ...fixture,
          isPlaying: props.isPlaying,
          isPreparing: props.isPreparing ?? false,
        }),
      { initialProps: { isPlaying: false } },
    );

    await act(async () => {
      await result.current.handleRandomBarPlay(async () => {
        events.push("toggle");
        return true;
      });
    });

    expect(blockPlayModeRef.current).toBe("random");
    expect(result.current.randomBarPreviousModeRef.current).toBe("loop");
    expect(events).toContain("toggle");
    expect(engine.setRandomBarOrder).toHaveBeenCalledWith(expect.any(Array));
    expect(engine.setBlockPlayMode).toHaveBeenCalledWith("random");

    rerender({ isPlaying: true });
    expect(result.current.randomBarPreviousModeRef.current).toBe("loop");

    rerender({ isPlaying: false });

    expect(blockPlayModeRef.current).toBe("loop");
    expect(result.current.randomBarPreviousModeRef.current).toBeNull();
    expect(result.current.randomBarSession?.active).toBe(false);
    expect(events).toEqual(expect.arrayContaining([
      "state-mode:random",
      "engine-mode:random",
      "state-mode:loop",
      "order:null",
      "engine-mode:loop",
    ]));
    expect(events.indexOf("state-mode:loop")).toBeLessThan(
      events.indexOf("engine-mode:loop"),
    );
  });

  it("stops before clearing the session when explicitly returning while playing", async () => {
    const events: string[] = [];
    const blockPlayModeRef = { current: "sequential" as PlaybackMode };
    const engine = makeEngine(events);
    const engineRef = { current: engine };
    const startToggle = jest.fn(async () => {
      events.push("startup-toggle");
      return true;
    });
    const returnToggle = jest.fn(async () => {
      events.push("return-toggle");
      return undefined;
    });
    const fixture = makeParams(
      { isPlaying: false },
      events,
      engineRef,
      blockPlayModeRef,
    );

    const { result, rerender } = renderHook(
      (props: HookProps) =>
        useRandomBarSession({
          ...fixture,
          isPlaying: props.isPlaying,
          isPreparing: props.isPreparing ?? false,
        }),
      { initialProps: { isPlaying: false } },
    );

    await act(async () => {
      await result.current.handleRandomBarPlay(startToggle);
    });
    rerender({ isPlaying: true });

    act(() => {
      result.current.handleReturnToOriginalBarList(returnToggle);
    });

    expect(returnToggle).toHaveBeenCalledTimes(1);
    expect(blockPlayModeRef.current).toBe("sequential");
    expect(result.current.randomBarPreviousModeRef.current).toBeNull();
    expect(result.current.randomBarSession).toBeNull();
    expect(engine.setRandomBarOrder).toHaveBeenLastCalledWith(null);
    expect(events.indexOf("return-toggle")).toBeLessThan(events.indexOf("order:null"));
  });

  it("rejects replay when the saved loop-block snapshot is stale", async () => {
    const events: string[] = [];
    const blockPlayModeRef = { current: "loop" as PlaybackMode };
    const engine = makeEngine(events);
    const engineRef = { current: engine };
    const toggle = jest.fn().mockResolvedValue(true);
    const fixture = makeParams(
      { isPlaying: false },
      events,
      engineRef,
      blockPlayModeRef,
    );

    const { result } = renderHook(() =>
      useRandomBarSession(fixture),
    );

    act(() => {
      result.current.updateRandomBarSession({
        order: [0, 1],
        cursor: 0,
        sourceCount: 4,
        active: false,
        remainingShuffleBag: [],
        loopBlocks: [{ startBeat: 0, endBeat: 1 }],
      });
    });

    await act(async () => {
      await result.current.handleReplayRandomBarSession(toggle);
    });

    expect(toggle).not.toHaveBeenCalled();
    expect(result.current.randomBarSession).toBeNull();
    expect(result.current.randomBarPreviousModeRef.current).toBeNull();
    expect(engine.setRandomBarOrder).not.toHaveBeenCalled();
    expect(engine.setBlockPlayMode).not.toHaveBeenCalled();
  });

  it("restores the previous mode immediately when playback startup fails", async () => {
    const events: string[] = [];
    const blockPlayModeRef = { current: "loop" as PlaybackMode };
    const engine = makeEngine(events);
    const engineRef = { current: engine };
    const fixture = makeParams(
      { isPlaying: false },
      events,
      engineRef,
      blockPlayModeRef,
    );

    const { result } = renderHook(() => useRandomBarSession(fixture));

    await act(async () => {
      await result.current.handleRandomBarPlay(
        jest.fn().mockResolvedValue(false),
      );
    });

    expect(blockPlayModeRef.current).toBe("loop");
    expect(result.current.randomBarPreviousModeRef.current).toBeNull();
    expect(result.current.randomBarSession?.active).toBe(false);
    expect(engine.setRandomBarOrder).toHaveBeenLastCalledWith(null);
    expect(engine.setBlockPlayMode).toHaveBeenLastCalledWith("loop");
  });
});