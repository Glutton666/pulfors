/** @jest-environment jsdom */

import { act, renderHook } from "@testing-library/react";
import type { PracticeEntry } from "@/lib/storage";
import { useNoteSession } from "@/hooks/useNoteSession";

const makeEntry = (id: string): PracticeEntry => ({
  id,
  label: `Entry ${id}`,
  createdAt: 1,
  mode: "beat",
  bpm: 120,
  beatsPerMeasure: 4,
  beatTypes: ["strong", "normal", "normal", "normal"],
  beatSubdivisions: {},
  barRepeats: {},
  barLoopMode: "once",
  subdivisionPattern: ["accent"],
});

const renderNoteSession = (
  startPlayingEntry: (index: number) => Promise<void> = jest.fn().mockResolvedValue(undefined),
) => {
  const finishQueuePlayback = jest.fn();
  const hook = renderHook(() => useNoteSession({
    noteStartPlayingEntry: startPlayingEntry,
    finishNoteQueuePlayback: finishQueuePlayback,
  }));
  return { ...hook, finishQueuePlayback };
};

const addEntries = (
  result: { current: ReturnType<typeof useNoteSession> },
  ...entries: PracticeEntry[]
) => {
  act(() => {
    entries.forEach((entry) => result.current.handleNoteAddToQueue(entry));
  });
};

describe("useNoteSession behavioral boundaries", () => {
  it("edits the queue without starting playback or changing transition ownership", () => {
    const startPlayingEntry = jest.fn().mockResolvedValue(undefined);
    const { result } = renderNoteSession(startPlayingEntry);
    const first = makeEntry("first");
    const second = makeEntry("second");
    const inserted = makeEntry("inserted");

    addEntries(result, first, second);
    const epoch = result.current.noteEntryTransitionEpochRef.current;
    const advanceQueue = jest.fn();
    result.current.noteAdvanceQueueRef.current = advanceQueue;

    act(() => {
      result.current.handleNoteInsertNext(inserted);
    });
    expect(result.current.noteQueue.map((entry) => entry.id)).toEqual([
      "inserted",
      "first",
      "second",
    ]);

    act(() => {
      result.current.handleNoteReorderQueue(2, 0);
    });
    expect(result.current.noteQueue.map((entry) => entry.id)).toEqual([
      "second",
      "inserted",
      "first",
    ]);

    act(() => {
      result.current.handleNoteQueueItemImageChange(1, "file:///updated.jpg");
    });

    expect(result.current.noteQueue.map((entry) => entry.id)).toEqual([
      "second",
      "inserted",
      "first",
    ]);
    expect(result.current.noteQueue[1].imageUri).toBe("file:///updated.jpg");
    expect(startPlayingEntry).not.toHaveBeenCalled();
    expect(advanceQueue).not.toHaveBeenCalled();
    expect(result.current.noteEntryTransitionEpochRef.current).toBe(epoch);
  });

  it("removes the current item during playback and starts exactly one replacement", async () => {
    let resolveReplacement!: () => void;
    const replacementStarted = new Promise<void>((resolve) => {
      resolveReplacement = resolve;
    });
    const startPlayingEntry = jest.fn().mockReturnValue(replacementStarted);
    const { result, finishQueuePlayback } = renderNoteSession(startPlayingEntry);

    addEntries(result, makeEntry("current"), makeEntry("next"));
    act(() => {
      result.current.setNoteCurrentIndex(0);
      result.current.setNoteIsPlaying(true);
    });

    act(() => {
      result.current.handleNoteRemoveFromQueue(0);
      result.current.handleNoteAddToQueue(makeEntry("later"));
      result.current.handleNoteQueueItemImageChange(0, "file:///next.jpg");
    });

    expect(result.current.noteQueue.map((entry) => entry.id)).toEqual(["next", "later"]);
    expect(result.current.noteCurrentIndex).toBe(0);
    expect(startPlayingEntry).toHaveBeenCalledTimes(1);
    expect(startPlayingEntry).toHaveBeenCalledWith(0);
    expect(finishQueuePlayback).not.toHaveBeenCalled();

    resolveReplacement();
    await act(async () => {
      await replacementStarted;
    });
    expect(startPlayingEntry).toHaveBeenCalledTimes(1);
  });

  it("finishes playback when the current and final queue item is removed", () => {
    const startPlayingEntry = jest.fn().mockResolvedValue(undefined);
    const { result, finishQueuePlayback } = renderNoteSession(startPlayingEntry);

    addEntries(result, makeEntry("only"));
    act(() => {
      result.current.setNoteCurrentIndex(0);
      result.current.setNoteIsPlaying(true);
    });
    act(() => {
      result.current.handleNoteRemoveFromQueue(0);
    });

    expect(result.current.noteQueue).toEqual([]);
    expect(result.current.noteCurrentIndex).toBe(-1);
    expect(startPlayingEntry).not.toHaveBeenCalled();
    expect(finishQueuePlayback).toHaveBeenCalledTimes(1);
    expect(finishQueuePlayback).toHaveBeenCalledWith("manual");
  });

  it("resets the queue while preserving selected source entries", () => {
    const { result, finishQueuePlayback } = renderNoteSession();
    const source = makeEntry("source");
    const queued = makeEntry("queued");

    act(() => {
      result.current.handleNoteSourceSelectionChange([source, source]);
      result.current.handleNoteAddToQueue(queued);
      result.current.setNoteCurrentIndex(0);
      result.current.setNoteIsPlaying(true);
      result.current.resetNoteQueue();
    });

    expect(result.current.noteQueue).toEqual([]);
    expect(result.current.noteQueueRef.current).toEqual([]);
    expect(result.current.noteCurrentIndex).toBe(-1);
    expect(result.current.noteBarEntries).toEqual([source]);
    expect(finishQueuePlayback).toHaveBeenCalledTimes(1);
    expect(finishQueuePlayback).toHaveBeenCalledWith("manual");
  });

  it("keeps automatic progression as a parent-owned boundary", () => {
    const { result } = renderNoteSession();
    const advanceQueue = jest.fn();
    const epoch = result.current.noteEntryTransitionEpochRef;
    result.current.noteAdvanceQueueRef.current = advanceQueue;

    addEntries(result, makeEntry("one"), makeEntry("two"));
    act(() => {
      result.current.handleNoteReorderQueue(0, 1);
      result.current.handleNoteRemoveFromQueue(1);
    });

    expect(advanceQueue).not.toHaveBeenCalled();
    expect(epoch.current).toBe(0);
    expect(result.current.noteQueueRef.current.map((entry) => entry.id)).toEqual(["two"]);
    // Measure-complete auto-advance remains in useMetronomeScreen; this hook
    // only owns the queue/ref boundary and must not synthesize a second start.
  });
});