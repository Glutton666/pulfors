/// <reference types="jest" />
/**
 * @jest-environment jsdom
 *
 * score-playback-hook.test.ts
 *
 * Hook-level integration tests for useScorePlayback.
 * Guards against the "silent first measure" regression: requestAnimationFrame
 * (RAF) must NOT be called — and isPlaying must remain false — until
 * prepareScoreAudio has fully resolved on native.
 *
 * The session-guard invariant is also tested: after stop() is called while
 * prepare is in flight, the stale finally-callback must not start RAF.
 *
 * Strategy:
 *   - renderHook from @testing-library/react renders the real useScorePlayback
 *   - lib/score-audio is jest.mock'd so prepareScoreAudio is a controllable stub
 *   - requestAnimationFrame is replaced with a jest.fn() spy before each test
 *   - act() / await act(async () => ...) ensures React state flushes correctly
 *
 * Automated coverage:
 *   H1.  prepare-before-RAF: RAF not called while prepareScoreAudio is pending
 *   H2.  RAF called after prepareScoreAudio resolves (normal play)
 *   H3.  Session guard: stop() during prepare → stale callback skips RAF
 *   H4.  Session guard: multiple stop/play cycles → only latest session fires RAF
 *   H5.  Web fast-path: RAF starts immediately (no prepare called)
 *   H6.  Empty-MIDI fast-path (percussion): RAF starts immediately
 *   H7.  isPreparing is true immediately after play() on native with MIDI
 *   H8.  isPreparing resets to false after prepareScoreAudio resolves
 *   H9.  isPreparing resets to false after stop() (session invalidated)
 *   H10. prepareProgress is null after prepare resolves (cleared in finally)
 *   H11. prepareProgress is null after stop() even if prepare never resolved
 *   H12. double play() while isPreparing is ignored (idempotent guard)
 *   H13. prepareScoreAudio rejection does not crash — finally still fires RAF
 */

import { renderHook, act } from "@testing-library/react";
import { Platform } from "react-native";

// ── Module mock — lib/score-audio ────────────────────────────────────────────
jest.mock("../lib/score-audio", () => ({
  getPrepareBatchSize: jest.fn(() => 4),
  prepareScoreAudio: jest.fn(),
  scheduleMeasureNotes: jest.fn(() => jest.fn()),
  stopAllScoreNotes: jest.fn(),
}));

import * as scoreAudio from "../lib/score-audio";

const mockPrepare = scoreAudio.prepareScoreAudio as jest.MockedFunction<
  typeof scoreAudio.prepareScoreAudio
>;

// ── Subject under test ───────────────────────────────────────────────────────
import { useScorePlayback } from "../hooks/useScorePlayback";

// ── ScoreDocument fixture ────────────────────────────────────────────────────
// Minimal valid document with one measure containing quarter-note C4 (MIDI 60).
// buildPlayTimeline returns notes: [{midiNote: 60, ...}] → allMidi = [60]
// → native prepare path fires (Platform.OS = "ios" by default in the stub).
import type { ScoreDocument } from "../lib/score-types";

const DOC_WITH_NOTES: ScoreDocument = {
  id: "test-doc-notes",
  metadata: { title: "Hook test", createdAt: 0, updatedAt: 0 },
  parts: [
    {
      id: "part-1",
      instrumentId: "piano",
      clef: "treble",
      measures: [
        {
          id: "m1",
          bpm: 120,
          timeSignature: { numerator: 4, denominator: 4 },
          elements: [
            {
              id: "n1",
              type: "note",
              pitch: { step: "C", octave: 4 },
              duration: "quarter",
            },
          ],
        },
      ],
    },
  ],
  keySignature: { sharps: 0 },
  timeSignature: { numerator: 4, denominator: 4 },
  bpm: 120,
};

// Percussion clef → buildPlayTimeline returns notes: [] → allMidi is empty
// → fast-path (no prepare needed).
const DOC_PERCUSSION: ScoreDocument = {
  ...DOC_WITH_NOTES,
  id: "test-doc-perc",
  parts: [{ ...DOC_WITH_NOTES.parts[0], clef: "percussion" }],
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Flush all queued microtasks (Promise.resolve chain) three times to ensure
 * the .catch(() => {}).finally(() => ...) chain in the hook fully settles.
 * Must be called inside act() to properly flush React state updates.
 */
const flushMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

// ── Test setup ───────────────────────────────────────────────────────────────

let rafSpy: jest.SpyInstance;

beforeEach(() => {
  mockPrepare.mockClear();
  (scoreAudio.scheduleMeasureNotes as jest.Mock).mockClear();
  (scoreAudio.stopAllScoreNotes as jest.Mock).mockClear();

  // Replace requestAnimationFrame with a no-op spy.
  // We only observe whether it is called, not drive the tick loop.
  rafSpy = jest
    .spyOn(globalThis, "requestAnimationFrame")
    .mockImplementation(() => 0);

  // Default: native platform (the react-native stub sets OS="ios")
  (Platform as unknown as { OS: string }).OS = "ios";
});

afterEach(() => {
  rafSpy.mockRestore();
  (Platform as unknown as { OS: string }).OS = "ios";
});

// ─────────────────────────────────────────────────────────────────────────────
// H1–H4. prepare-before-RAF guard and session guard (native, MIDI present)
// ─────────────────────────────────────────────────────────────────────────────

describe("useScorePlayback — prepare-before-RAF guard (H1–H4)", () => {
  it("H1: isPlaying stays false and RAF is not called while prepareScoreAudio is pending", async () => {
    let resolvePrep!: () => void;
    mockPrepare.mockImplementation(
      () => new Promise<void>((r) => { resolvePrep = r; }),
    );

    const { result } = renderHook(() => useScorePlayback(DOC_WITH_NOTES));

    // Trigger play — synchronous part completes, async prepare is in flight
    act(() => { result.current.play(); });

    // prepareScoreAudio called, but RAF must NOT have fired yet
    expect(mockPrepare).toHaveBeenCalledTimes(1);
    expect(rafSpy).not.toHaveBeenCalled();
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.isPreparing).toBe(true);

    // Resolve prepare → state updates + RAF
    await act(async () => {
      resolvePrep();
      await flushMicrotasks();
    });

    expect(rafSpy).toHaveBeenCalledTimes(1);
    expect(result.current.isPlaying).toBe(true);
  });

  it("H2: RAF is called exactly once after prepareScoreAudio resolves", async () => {
    mockPrepare.mockResolvedValue(undefined);

    const { result } = renderHook(() => useScorePlayback(DOC_WITH_NOTES));

    await act(async () => {
      result.current.play();
      await flushMicrotasks();
    });

    expect(rafSpy).toHaveBeenCalledTimes(1);
    expect(result.current.isPlaying).toBe(true);
  });

  it("H3: stop() during prepare invalidates the session — RAF never fires", async () => {
    let resolvePrep!: () => void;
    mockPrepare.mockImplementation(
      () => new Promise<void>((r) => { resolvePrep = r; }),
    );

    const { result } = renderHook(() => useScorePlayback(DOC_WITH_NOTES));

    act(() => { result.current.play(); });
    expect(result.current.isPreparing).toBe(true);

    // Stop before prepare finishes — increments prepareSessionRef
    act(() => { result.current.stop(); });
    expect(result.current.isPreparing).toBe(false);
    expect(result.current.isPlaying).toBe(false);

    // Stale finally-callback fires: session guard must block startRaf()
    await act(async () => {
      resolvePrep();
      await flushMicrotasks();
    });

    expect(rafSpy).not.toHaveBeenCalled();
    expect(result.current.isPlaying).toBe(false);
  });

  it("H4: multiple stop/play cycles — only the latest session fires RAF", async () => {
    const resolvers: Array<() => void> = [];
    mockPrepare.mockImplementation(
      () => new Promise<void>((r) => resolvers.push(r)),
    );

    const { result } = renderHook(() => useScorePlayback(DOC_WITH_NOTES));

    // Session 1
    act(() => { result.current.play(); });
    expect(result.current.isPreparing).toBe(true);

    // Invalidate session 1
    act(() => { result.current.stop(); });

    // Session 2
    act(() => { result.current.play(); });
    expect(result.current.isPreparing).toBe(true);

    // Resolve both: session 1 stale → skipped; session 2 valid → RAF fires
    await act(async () => {
      resolvers[0]?.(); // session 1 stale
      resolvers[1]?.(); // session 2 valid
      await flushMicrotasks();
    });

    // RAF fires exactly once (from session 2 only)
    expect(rafSpy).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// H5–H6. Fast-paths that skip prepare
// ─────────────────────────────────────────────────────────────────────────────

describe("useScorePlayback — fast-paths (H5–H6)", () => {
  it("H5: web platform — RAF starts immediately, prepareScoreAudio not called", () => {
    (Platform as unknown as { OS: string }).OS = "web";

    const { result } = renderHook(() => useScorePlayback(DOC_WITH_NOTES));

    act(() => { result.current.play(); });

    expect(mockPrepare).not.toHaveBeenCalled();
    expect(rafSpy).toHaveBeenCalledTimes(1);
    expect(result.current.isPlaying).toBe(true);
  });

  it("H6: percussion clef (empty MIDI) — RAF starts immediately, no prepare", () => {
    const { result } = renderHook(() => useScorePlayback(DOC_PERCUSSION));

    act(() => { result.current.play(); });

    expect(mockPrepare).not.toHaveBeenCalled();
    expect(rafSpy).toHaveBeenCalledTimes(1);
    expect(result.current.isPlaying).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// H7–H9. isPreparing lifecycle
// ─────────────────────────────────────────────────────────────────────────────

describe("useScorePlayback — isPreparing lifecycle (H7–H9)", () => {
  it("H7: isPreparing is true immediately after play() on native with MIDI", async () => {
    let resolvePrep!: () => void;
    mockPrepare.mockImplementation(
      () => new Promise<void>((r) => { resolvePrep = r; }),
    );

    const { result } = renderHook(() => useScorePlayback(DOC_WITH_NOTES));

    act(() => { result.current.play(); });

    expect(result.current.isPreparing).toBe(true);

    // Cleanup
    await act(async () => { resolvePrep(); await flushMicrotasks(); });
  });

  it("H8: isPreparing resets to false after prepareScoreAudio resolves", async () => {
    mockPrepare.mockResolvedValue(undefined);

    const { result } = renderHook(() => useScorePlayback(DOC_WITH_NOTES));

    await act(async () => {
      result.current.play();
      await flushMicrotasks();
    });

    expect(result.current.isPreparing).toBe(false);
  });

  it("H9: isPreparing resets to false after stop() — session guard fires", async () => {
    let resolvePrep!: () => void;
    mockPrepare.mockImplementation(
      () => new Promise<void>((r) => { resolvePrep = r; }),
    );

    const { result } = renderHook(() => useScorePlayback(DOC_WITH_NOTES));

    act(() => { result.current.play(); });
    expect(result.current.isPreparing).toBe(true);

    // stop() immediately resets isPreparing
    act(() => { result.current.stop(); });
    expect(result.current.isPreparing).toBe(false);

    // Stale callback fires — must NOT re-set isPreparing
    await act(async () => {
      resolvePrep();
      await flushMicrotasks();
    });

    expect(result.current.isPreparing).toBe(false);
    expect(result.current.isPlaying).toBe(false);
    expect(rafSpy).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// H10–H11. prepareProgress lifecycle
// ─────────────────────────────────────────────────────────────────────────────

describe("useScorePlayback — prepareProgress lifecycle (H10–H11)", () => {
  it("H10: prepareProgress is null after prepare resolves (cleared in finally)", async () => {
    mockPrepare.mockResolvedValue(undefined);

    const { result } = renderHook(() => useScorePlayback(DOC_WITH_NOTES));

    await act(async () => {
      result.current.play();
      await flushMicrotasks();
    });

    expect(result.current.prepareProgress).toBeNull();
  });

  it("H11: prepareProgress is null after stop() even if prepare never resolved", async () => {
    let resolvePrep!: () => void;
    mockPrepare.mockImplementation(
      () => new Promise<void>((r) => { resolvePrep = r; }),
    );

    const { result } = renderHook(() => useScorePlayback(DOC_WITH_NOTES));

    act(() => { result.current.play(); });
    // prepareProgress is now { done: 0, total: 1 } (non-null)
    expect(result.current.prepareProgress).not.toBeNull();

    act(() => { result.current.stop(); });
    expect(result.current.prepareProgress).toBeNull();

    // Stale callback — must not restore prepareProgress
    await act(async () => {
      resolvePrep();
      await flushMicrotasks();
    });

    expect(result.current.prepareProgress).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// H12–H13. Additional edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe("useScorePlayback — edge cases (H12–H13)", () => {
  it("H12: double play() while isPreparing is ignored (idempotent guard)", async () => {
    let resolvePrep!: () => void;
    mockPrepare.mockImplementation(
      () => new Promise<void>((r) => { resolvePrep = r; }),
    );

    const { result } = renderHook(() => useScorePlayback(DOC_WITH_NOTES));

    // First play — enters prepare; React re-renders with isPreparing=true
    act(() => { result.current.play(); });
    expect(result.current.isPreparing).toBe(true);

    // Second play — the updated play callback captures isPreparing=true → no-op
    act(() => { result.current.play(); });

    // Only one prepare should have been started
    expect(mockPrepare).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolvePrep();
      await flushMicrotasks();
    });

    // RAF started exactly once (from the single valid session)
    expect(rafSpy).toHaveBeenCalledTimes(1);
  });

  it("H13: prepareScoreAudio rejection does not crash — finally still fires RAF", async () => {
    // The hook uses .catch(() => {}).finally(() => startRaf()) so a rejection
    // is swallowed and playback still starts.  This documents that intent.
    mockPrepare.mockRejectedValue(new Error("simulated prepare failure"));

    const { result } = renderHook(() => useScorePlayback(DOC_WITH_NOTES));

    await act(async () => {
      result.current.play();
      await flushMicrotasks();
    });

    expect(rafSpy).toHaveBeenCalledTimes(1);
    expect(result.current.isPlaying).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// H14. Unmount cleanup
// ─────────────────────────────────────────────────────────────────────────────

describe("useScorePlayback — unmount cleanup (H14)", () => {
  it("H14: unmount during prepare invalidates session — stale finally never fires RAF", async () => {
    let resolvePrep!: () => void;
    mockPrepare.mockImplementation(
      () => new Promise<void>((r) => { resolvePrep = r; }),
    );

    const { result, unmount } = renderHook(() => useScorePlayback(DOC_WITH_NOTES));

    // Trigger play — prepare is in flight
    act(() => { result.current.play(); });
    expect(result.current.isPreparing).toBe(true);
    expect(rafSpy).not.toHaveBeenCalled();

    // Unmount the hook — increments prepareSessionRef (unmount cleanup effect)
    act(() => { unmount(); });

    // Resolve the now-stale prepare promise
    await act(async () => {
      resolvePrep();
      await flushMicrotasks();
    });

    // Session guard must block startRaf — RAF must NOT have been called
    expect(rafSpy).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// H15. Pause / resume interaction
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// H16. Instrument change invalidation
// ─────────────────────────────────────────────────────────────────────────────

describe("useScorePlayback — instrument change invalidation (H16)", () => {
  it("H16: changing instrument while idle invalidates readiness — next play() re-triggers prepare", async () => {
    mockPrepare.mockResolvedValue(undefined);

    const DOC_PIANO = DOC_WITH_NOTES;
    const DOC_VIOLIN: ScoreDocument = {
      ...DOC_WITH_NOTES,
      id: "test-doc-violin",
      parts: [{ ...DOC_WITH_NOTES.parts[0], instrumentId: "violin" }],
    };

    const { result, rerender } = renderHook(
      (doc: ScoreDocument) => useScorePlayback(doc),
      { initialProps: DOC_PIANO },
    );

    // Initial play — prepare for "piano"
    await act(async () => {
      result.current.play();
      await flushMicrotasks();
    });
    expect(result.current.isPlaying).toBe(true);
    expect(mockPrepare).toHaveBeenCalledTimes(1);

    // Stop playback (resets isAudioReadyRef)
    act(() => { result.current.stop(); });

    // Change instrument while idle (not preparing)
    act(() => { rerender(DOC_VIOLIN); });

    // Next play() must call prepareScoreAudio again (new instrument)
    await act(async () => {
      result.current.play();
      await flushMicrotasks();
    });
    expect(result.current.isPlaying).toBe(true);
    expect(mockPrepare).toHaveBeenCalledTimes(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// H17. Instrument change while prepare is in flight → re-prepare uses fresh pairs
//
// Regression guard for the stale-pairs bug:
//   Old behaviour: the instrument-change effect reused prepareParamsRef.current
//   .noteInstrumentPairs — pairs built when play() was called.  After the
//   instrument changes those pairs still carry the OLD instrumentId, so the
//   second prepareScoreAudio call would generate WAV files with the wrong
//   waveform.
//
//   Fix: the effect now calls buildPlayTimeline(doc) to rebuild pairs from the
//   current doc before passing them to _runPrepare.
// ─────────────────────────────────────────────────────────────────────────────

describe("useScorePlayback — instrument change during prepare uses fresh pairs (H17)", () => {
  it("H17a: second prepare is called with the new instrumentId when instrument changes mid-prepare", async () => {
    let resolveFirst!: () => void;
    mockPrepare
      .mockImplementationOnce(() => new Promise<void>((r) => { resolveFirst = r; }))
      .mockResolvedValue(undefined);

    const DOC_PIANO = DOC_WITH_NOTES; // instrumentId: "piano"
    const DOC_VIOLIN: ScoreDocument = {
      ...DOC_WITH_NOTES,
      id: "test-doc-violin-h17",
      parts: [{ ...DOC_WITH_NOTES.parts[0], instrumentId: "violin" }],
    };

    const { result, rerender } = renderHook(
      (doc: ScoreDocument) => useScorePlayback(doc),
      { initialProps: DOC_PIANO },
    );

    // play() → first prepare starts (still pending)
    act(() => { result.current.play(); });
    expect(result.current.isPreparing).toBe(true);
    expect(mockPrepare).toHaveBeenCalledTimes(1);

    // Change instrument while first prepare is in flight
    act(() => { rerender(DOC_VIOLIN); });

    // Effect fires → second prepare is triggered with fresh pairs
    expect(mockPrepare).toHaveBeenCalledTimes(2);

    // Verify the second call's noteInstrumentPairs use the NEW instrumentId ("violin")
    const secondCallPairs = mockPrepare.mock.calls[1][4] as Array<{ midi: number; instrumentId: string }>;
    expect(secondCallPairs).toBeDefined();
    expect(secondCallPairs.length).toBeGreaterThan(0);
    expect(secondCallPairs.every((p) => p.instrumentId === "violin")).toBe(true);

    // The FIRST call's pairs should have had the old instrumentId ("piano")
    const firstCallPairs = mockPrepare.mock.calls[0][4] as Array<{ midi: number; instrumentId: string }>;
    expect(firstCallPairs.every((p) => p.instrumentId === "piano")).toBe(true);

    // Resolve first (stale) prepare — session guard ensures it does NOT start RAF
    await act(async () => {
      resolveFirst();
      await flushMicrotasks();
    });
  });

  it("H17b: second prepare pairs do not contain the old instrumentId (no stale contamination)", async () => {
    let resolveFirst!: () => void;
    mockPrepare
      .mockImplementationOnce(() => new Promise<void>((r) => { resolveFirst = r; }))
      .mockResolvedValue(undefined);

    const DOC_PIANO = DOC_WITH_NOTES;
    const DOC_CELLO: ScoreDocument = {
      ...DOC_WITH_NOTES,
      id: "test-doc-cello-h17",
      parts: [{ ...DOC_WITH_NOTES.parts[0], instrumentId: "cello" }],
    };

    const { rerender, result } = renderHook(
      (doc: ScoreDocument) => useScorePlayback(doc),
      { initialProps: DOC_PIANO },
    );

    act(() => { result.current.play(); });
    expect(mockPrepare).toHaveBeenCalledTimes(1);

    // Change to cello while prepare is in flight
    act(() => { rerender(DOC_CELLO); });
    expect(mockPrepare).toHaveBeenCalledTimes(2);

    const secondCallPairs = mockPrepare.mock.calls[1][4] as Array<{ midi: number; instrumentId: string }>;
    // Must NOT contain "piano" (old stale value)
    expect(secondCallPairs.some((p) => p.instrumentId === "piano")).toBe(false);
    // Must contain "cello" (new instrument)
    expect(secondCallPairs.every((p) => p.instrumentId === "cello")).toBe(true);

    await act(async () => {
      resolveFirst();
      await flushMicrotasks();
    });
  });

  it("H17c: isAudioReady is invalidated on instrument change — subsequent play re-prepares", async () => {
    mockPrepare.mockResolvedValue(undefined);

    const DOC_PIANO = DOC_WITH_NOTES;
    const DOC_VIOLIN: ScoreDocument = {
      ...DOC_WITH_NOTES,
      id: "test-doc-violin-h17c",
      parts: [{ ...DOC_WITH_NOTES.parts[0], instrumentId: "violin" }],
    };

    const { result, rerender } = renderHook(
      (doc: ScoreDocument) => useScorePlayback(doc),
      { initialProps: DOC_PIANO },
    );

    // First play → prepare → audio ready
    await act(async () => {
      result.current.play();
      await flushMicrotasks();
    });
    expect(mockPrepare).toHaveBeenCalledTimes(1);

    act(() => { result.current.stop(); });

    // Change instrument while idle → invalidates isAudioReadyRef
    act(() => { rerender(DOC_VIOLIN); });

    // Next play must re-prepare (isAudioReadyRef was cleared by instrument change)
    await act(async () => {
      result.current.play();
      await flushMicrotasks();
    });
    expect(mockPrepare).toHaveBeenCalledTimes(2);

    // The re-prepare pairs must reflect "violin", not the old "piano"
    const rePreparePairs = mockPrepare.mock.calls[1][4] as Array<{ midi: number; instrumentId: string }>;
    expect(rePreparePairs.every((p) => p.instrumentId === "violin")).toBe(true);
  });
});

describe("useScorePlayback — pause/resume (H15)", () => {
  it("H15: pause() stops playback; subsequent play() resumes without re-triggering prepare", async () => {
    // First play: prepare resolves immediately
    mockPrepare.mockResolvedValue(undefined);

    const { result } = renderHook(() => useScorePlayback(DOC_WITH_NOTES));

    // Initial play — prepare + start RAF
    await act(async () => {
      result.current.play();
      await flushMicrotasks();
    });
    expect(result.current.isPlaying).toBe(true);
    expect(rafSpy).toHaveBeenCalledTimes(1);
    // prepareScoreAudio called exactly once during initial play
    expect(mockPrepare).toHaveBeenCalledTimes(1);

    // Pause — stops RAF, isPlaying → false; isAudioReadyRef stays true
    act(() => { result.current.pause(); });
    expect(result.current.isPlaying).toBe(false);
    // No extra prepare calls during pause
    expect(mockPrepare).toHaveBeenCalledTimes(1);

    // Resume via play() — isAudioReadyRef=true → skips prepare, goes straight to startRaf
    await act(async () => {
      result.current.play();
      await flushMicrotasks();
    });
    expect(result.current.isPlaying).toBe(true);
    // prepareScoreAudio must NOT have been called again (still 1 total)
    expect(mockPrepare).toHaveBeenCalledTimes(1);
    // RAF fired a second time (resume)
    expect(rafSpy).toHaveBeenCalledTimes(2);
  });
});
