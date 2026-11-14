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
  previewScheduleForRandomBarOrder: jest.fn((order: number[]) => ({
    ticks: order.map((beat, index) => ({
      beat,
      subBeat: 0,
      time: index * 100,
      type: "normal",
      isMainBeat: true,
    })),
    durationMs: order.length * 100,
  })),
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
  it.each(["resolve", "reject"] as const)("ignores an old startup %s after a new session takes ownership", async (outcome) => {
    const events: string[] = [];
    const blockPlayModeRef = { current: "loop" as PlaybackMode };
    const engine = makeEngine(events);
    const fixture = makeParams({ isPlaying: false }, events, { current: engine }, blockPlayModeRef);
    const { result } = renderHook(() => useRandomBarSession(fixture));
    let settle!: (value: boolean) => void;
    let reject!: (error: Error) => void;
    const pending = new Promise<boolean>((resolve, fail) => { settle = resolve; reject = fail; });
    let first!: Promise<void>;
    act(() => { first = result.current.handleRandomBarPlay(() => pending); });
    act(() => { result.current.finishRandomBarPlay(); });
    await act(async () => { await result.current.handleRandomBarPlay(async () => true); });
    const currentSession = result.current.randomBarSessionRef.current;
    jest.mocked(engine.setRandomBarOrder).mockClear();

    await act(async () => {
      if (outcome === "resolve") settle(false);
      else reject(new Error("Previous startup failed late"));
      await first;
    });

    expect(result.current.randomBarSessionRef.current).toBe(currentSession);
    expect(currentSession?.active).toBe(true);
    expect(blockPlayModeRef.current).toBe("random");
    expect(engine.setRandomBarOrder).not.toHaveBeenCalled();
  });

  it("does not restore engine or React state when a pending start fails after unmount", async () => {
    const events: string[] = [];
    const blockPlayModeRef = { current: "loop" as PlaybackMode };
    const engine = makeEngine(events);
    const fixture = makeParams({ isPlaying: false }, events, { current: engine }, blockPlayModeRef);
    const { result, unmount } = renderHook(() => useRandomBarSession(fixture));
    let settle!: (value: boolean) => void;
    const pending = new Promise<boolean>(resolve => { settle = resolve; });
    let start!: Promise<void>;
    act(() => { start = result.current.handleRandomBarPlay(() => pending); });
    unmount();
    jest.mocked(engine.setRandomBarOrder).mockClear();
    jest.mocked(fixture.setBlockPlayMode).mockClear();
    await act(async () => { settle(false); await start; });
    expect(engine.setRandomBarOrder).not.toHaveBeenCalled();
    expect(fixture.setBlockPlayMode).not.toHaveBeenCalled();
  });

  it("rejects duplicate replay requests before the playback state rerenders", async () => {
    const events: string[] = [];
    const blockPlayModeRef = { current: "loop" as PlaybackMode };
    const fixture = makeParams({ isPlaying: false }, events, { current: makeEngine(events) }, blockPlayModeRef);
    const { result } = renderHook(() => useRandomBarSession(fixture));
    await act(async () => { await result.current.handleRandomBarPlay(async () => true); });
    act(() => { result.current.finishRandomBarPlay(); });
    const toggle = jest.fn(async () => true);
    await act(async () => {
      await Promise.all([
        result.current.handleReplayRandomBarSession(toggle),
        result.current.handleReplayRandomBarSession(toggle),
      ]);
    });
    expect(toggle).toHaveBeenCalledTimes(1);
    act(() => { result.current.finishRandomBarPlay(); });
    expect(blockPlayModeRef.current).toBe("loop");
  });

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

  it("previews and consumes the identical cached random chunk without rerolling", async () => {
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
    fixture.barLoopModeRef.current = "loop";
    const { result } = renderHook(() =>
      useRandomBarSession({ ...fixture, isPlaying: false }),
    );

    await act(async () => {
      await result.current.handleRandomBarPlay(async () => true);
    });

    const firstPreview = result.current.previewNextRandomBarChunk(engine);
    expect(firstPreview).not.toBeNull();
    expect(firstPreview?.order).toEqual(
      result.current.randomBarPreparedChunkRef.current?.chunk,
    );
    expect(firstPreview?.ticks.map(tick => tick.beat)).toEqual(firstPreview?.order);
    const previewOrder = [...(firstPreview?.order ?? [])];
    const previewMethod = engine.previewScheduleForRandomBarOrder as jest.Mock;
    const previewCalls = previewMethod.mock.calls.length;

    const repeatedPreview = result.current.previewNextRandomBarChunk(engine);
    expect(repeatedPreview?.order).toEqual(previewOrder);
    expect(previewMethod).toHaveBeenCalledTimes(previewCalls);

    act(() => result.current.advanceRandomBarChunk(engine));
    expect(engine.setRandomBarOrder).toHaveBeenLastCalledWith(previewOrder);
    expect(result.current.randomBarChunkStartRef.current).toBe(previewOrder.length);
    expect(result.current.randomBarPreparedChunkRef.current).toBeNull();
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