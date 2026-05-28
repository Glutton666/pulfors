/**
 * score-audio-prepare.test.ts
 *
 * Integration tests verifying that prepareScoreAudio() fully populates the WAV
 * file cache before any playback (RAF tick) begins on native.  This guards
 * against a regression where the first measure was silent on real devices
 * because playback started before the WAV files were ready.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * MANUAL TEST CHECKLIST — physical device / Expo Go
 * ─────────────────────────────────────────────────────────────────────────────
 * Run these steps on a real iOS/Android device with Expo Go after any change
 * to lib/score-audio.ts or hooks/useScorePlayback.ts:
 *
 * 1. LOADING INDICATOR
 *    Open a score with ≥ 4 distinct pitches.  Tap Play.
 *    A brief "preparing…" indicator (isPreparing = true) must appear before
 *    the playhead starts moving.
 *
 * 2. FIRST MEASURE AUDIO
 *    All notes in measure 1 must be audible.  No silent first measure
 *    (the original regression — native-only, invisible on web).
 *
 * 3. CACHE HIT (second play)
 *    Tap Stop then Play again immediately.  The preparing indicator must not
 *    reappear (files already cached); playback starts faster.
 *
 * 4. SCORE SWITCH
 *    Navigate to a score with entirely different pitches, tap Play.
 *    The preparing indicator must appear again for the new MIDI notes,
 *    then playback starts correctly.
 *
 * 5. STOP DURING PREPARE
 *    While the preparing indicator is showing, tap Stop.
 *    Playback must never start (session guard).  The indicator must
 *    disappear.  Tapping Play again re-triggers the prepare step.
 *
 * 6. MUTE AUDIO
 *    Toggle "Mute audio" in playback settings.  Play must start without
 *    the preparing indicator at all (the MIDI array is empty when mute
 *    skips the prepare path in useScorePlayback).
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Automated coverage (this file):
 *  A. prepareScoreAudio — WAV file cache population (native path)
 *  B. prepareScoreAudio — progress callback accuracy
 *  C. prepareScoreAudio — MIDI range filter and deduplication
 *  D. prepareScoreAudio — web is a no-op
 *  E. scheduleMeasureNotes — silent-fail for uncached notes (native)
 *  F. scheduleMeasureNotes — plays cached notes (native)
 *  G. stopAllScoreNotes / cancel — cancels pending measure schedule
 *  J. instrument-specific waveforms — instrumentToWaveform + WAV suffix + schedule URI
 */

import { Platform } from "react-native";

// ── Stubs ────────────────────────────────────────────────────────────────────
// expo-file-system stub exposes _mockState so we can observe how many WAV files
// were written by _ensureNoteFile() without touching the real filesystem.
const fsStub = require("../tests/_stubs/expo-file-system") as {
  _mockState: { writeCount: number; writtenUris: string[]; reset(): void };
};

// expo-audio stub — patch createAudioPlayer so we can spy on native playback
const audioStub = require("../tests/_stubs/expo-audio") as {
  createAudioPlayer: jest.Mock;
};
audioStub.createAudioPlayer = jest.fn(() => ({
  play: jest.fn(),
  pause: jest.fn(),
  remove: jest.fn(),
  volume: 1,
}));

// Ensure we are on "native" so the WAV-file code path is active.
// The react-native stub defaults to { OS: "ios" }, so this is already set.
(Platform as unknown as Record<string, unknown>).OS = "ios";

import {
  getPrepareBatchSize,
  instrumentToWaveform,
  prepareScoreAudio,
  previewScoreNote,
  scheduleMeasureNotes,
  stopAllScoreNotes,
} from "../lib/score-audio";

import * as audioRenderer from "../lib/audio-renderer";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — MIDI note allocation
// Each test group uses a distinct range of MIDI notes so the module-level
// _fileCache never creates false cache-hit conflicts between groups.
// Valid MIDI range for score audio: 21–108.
// ─────────────────────────────────────────────────────────────────────────────

// Group A  → MIDI 30, 31
// Group B  → MIDI 32, 33, 34   (progress callback)
// Group B2 → MIDI 42, 43       (final-progress sub-test)
// Group C  → MIDI 44, 45       (range filter / dedup)
// Group E/F→ MIDI 47 (no-cache), 48 (with-cache)
// Group G  → MIDI 49 (cancel)
// Group K  → MIDI 75 (violin/native), 76 (piano/native), 77-78 (web — no file written)

// ─────────────────────────────────────────────────────────────────────────────
// A. WAV file cache population
// ─────────────────────────────────────────────────────────────────────────────

// Group A uses MIDI 30–34 (5 distinct notes, each used in exactly one test)
describe("prepareScoreAudio — WAV cache population (A)", () => {
  beforeEach(() => {
    fsStub._mockState.reset();
  });

  it("resolves without throwing for a valid MIDI list", async () => {
    // MIDI 30 — first use, populates cache
    await expect(prepareScoreAudio([30])).resolves.toBeUndefined();
  });

  it("writes one WAV file per unique MIDI note", async () => {
    // MIDI 31 and 32 — both fresh, both should be written
    await prepareScoreAudio([31, 32]);
    expect(fsStub._mockState.writeCount).toBe(2);
  });

  it("written URIs contain the MIDI note number in the filename", async () => {
    // MIDI 33 and 34 — fresh notes
    await prepareScoreAudio([33, 34]);
    const uris = fsStub._mockState.writtenUris;
    expect(uris.some((u) => u.includes("score_note_33_sine.wav"))).toBe(true);
    expect(uris.some((u) => u.includes("score_note_34_sine.wav"))).toBe(true);
  });

  it("second call with already-cached notes writes nothing (cache hit)", async () => {
    // MIDI 31 and 32 were cached in "writes one WAV file" test above
    await prepareScoreAudio([31, 32]); // both already in cache → 0 new writes
    expect(fsStub._mockState.writeCount).toBe(0);
  });

  it("resolves for an empty MIDI list", async () => {
    await expect(prepareScoreAudio([])).resolves.toBeUndefined();
    expect(fsStub._mockState.writeCount).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. Progress callback accuracy
// ─────────────────────────────────────────────────────────────────────────────

describe("prepareScoreAudio — progress callback (B)", () => {
  it("progress callback fires once per unique note", async () => {
    const calls: Array<{ done: number; total: number }> = [];
    await prepareScoreAudio([32, 33, 34], (done, total) => {
      calls.push({ done, total });
    });
    expect(calls).toHaveLength(3);
  });

  it("done values are 1-based and monotonically increasing", async () => {
    const doneValues: number[] = [];
    await prepareScoreAudio([42, 43], (done) => doneValues.push(done));
    expect(doneValues).toEqual([1, 2]);
  });

  it("final progress call has done === total", async () => {
    let lastDone = -1;
    let lastTotal = -1;
    await prepareScoreAudio([42, 43], (done, total) => {
      lastDone = done;
      lastTotal = total;
    });
    expect(lastDone).toBe(lastTotal);
    expect(lastDone).toBeGreaterThan(0);
  });

  it("progress callback not called for an empty list", async () => {
    let called = false;
    await prepareScoreAudio([], () => { called = true; });
    expect(called).toBe(false);
  });

  it("total reported to callback matches unique valid note count", async () => {
    const totals: number[] = [];
    // 35 is valid; 19 and 109 are out of range → only 1 valid note
    await prepareScoreAudio([19, 35, 109], (_done, total) => totals.push(total));
    expect(totals.every((t) => t === 1)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. MIDI range filter and deduplication
// ─────────────────────────────────────────────────────────────────────────────

describe("prepareScoreAudio — range filter and dedup (C)", () => {
  beforeEach(() => {
    fsStub._mockState.reset();
  });

  it("MIDI < 21 is filtered out", async () => {
    await prepareScoreAudio([19, 20]);
    expect(fsStub._mockState.writeCount).toBe(0);
  });

  it("MIDI > 108 is filtered out", async () => {
    await prepareScoreAudio([109, 127]);
    expect(fsStub._mockState.writeCount).toBe(0);
  });

  it("only in-range notes produce WAV files", async () => {
    // 19 invalid, 44 valid, 109 invalid
    await prepareScoreAudio([19, 44, 109]);
    expect(fsStub._mockState.writeCount).toBe(1);
    expect(fsStub._mockState.writtenUris[0]).toContain("score_note_44_sine.wav");
  });

  it("duplicate MIDI notes are deduplicated — one file per pitch", async () => {
    await prepareScoreAudio([45, 45, 45]);
    expect(fsStub._mockState.writeCount).toBe(1);
  });

  it("all-invalid list resolves without error and writes nothing", async () => {
    await expect(prepareScoreAudio([0, 10, 15, 110, 127])).resolves.toBeUndefined();
    expect(fsStub._mockState.writeCount).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D. Web is a no-op
// ─────────────────────────────────────────────────────────────────────────────

describe("prepareScoreAudio — web is a no-op (D)", () => {
  const savedOS = (Platform as unknown as Record<string, unknown>).OS;

  beforeEach(() => {
    (Platform as unknown as Record<string, unknown>).OS = "web";
    fsStub._mockState.reset();
  });

  afterEach(() => {
    (Platform as unknown as Record<string, unknown>).OS = savedOS;
  });

  it("resolves immediately on web without writing any files", async () => {
    await prepareScoreAudio([60, 72]);
    expect(fsStub._mockState.writeCount).toBe(0);
  });

  it("progress callback is never invoked on web", async () => {
    let called = false;
    await prepareScoreAudio([60, 72], () => { called = true; });
    expect(called).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E. scheduleMeasureNotes — silent-fail for uncached notes (native)
// ─────────────────────────────────────────────────────────────────────────────

describe("scheduleMeasureNotes — guard logic (E)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    audioStub.createAudioPlayer.mockClear();
  });

  afterEach(() => {
    stopAllScoreNotes();
    jest.useRealTimers();
  });

  it("MIDI < 21 — skipped, no timer scheduled", () => {
    scheduleMeasureNotes([{ midiNote: 20, startOffsetMs: 0, durationMs: 300 }]);
    jest.runAllTimers();
    expect(audioStub.createAudioPlayer).not.toHaveBeenCalled();
  });

  it("MIDI > 108 — skipped, no timer scheduled", () => {
    scheduleMeasureNotes([{ midiNote: 109, startOffsetMs: 0, durationMs: 300 }]);
    jest.runAllTimers();
    expect(audioStub.createAudioPlayer).not.toHaveBeenCalled();
  });

  it("zero-duration note — skipped (durationMs ≤ 0)", () => {
    scheduleMeasureNotes([{ midiNote: 60, startOffsetMs: 0, durationMs: 0 }]);
    jest.runAllTimers();
    expect(audioStub.createAudioPlayer).not.toHaveBeenCalled();
  });

  it("uncached valid note — timer fires but createAudioPlayer not called (silent-fail)", async () => {
    // MIDI 47 has never been prepared in this test run
    scheduleMeasureNotes([{ midiNote: 47, startOffsetMs: 0, durationMs: 500 }]);
    jest.runAllTimers();
    await Promise.resolve(); // flush microtasks from _playNativeNote
    expect(audioStub.createAudioPlayer).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F. scheduleMeasureNotes — plays cached notes (native)
// ─────────────────────────────────────────────────────────────────────────────

describe("scheduleMeasureNotes — cached note playback (F)", () => {
  beforeAll(async () => {
    // Prepare MIDI 48 with real timers so the WAV file is in the cache
    await prepareScoreAudio([48]);
  });

  beforeEach(() => {
    jest.useFakeTimers();
    audioStub.createAudioPlayer.mockClear();
  });

  afterEach(() => {
    stopAllScoreNotes();
    jest.useRealTimers();
  });

  it("cached note — createAudioPlayer called after timer fires", async () => {
    scheduleMeasureNotes([{ midiNote: 48, startOffsetMs: 0, durationMs: 500 }]);
    jest.runAllTimers();
    await Promise.resolve(); // flush _playNativeNote promise
    await Promise.resolve();
    expect(audioStub.createAudioPlayer).toHaveBeenCalledTimes(1);
  });

  it("cached note — player URI contains the correct WAV filename", async () => {
    scheduleMeasureNotes([{ midiNote: 48, startOffsetMs: 0, durationMs: 500 }]);
    jest.runAllTimers();
    await Promise.resolve();
    await Promise.resolve();
    const arg = audioStub.createAudioPlayer.mock.calls[0][0] as { uri: string };
    expect(arg.uri).toContain("score_note_48_sine.wav");
  });

  it("scheduled note respects startOffsetMs — not called before the offset", async () => {
    scheduleMeasureNotes([{ midiNote: 48, startOffsetMs: 200, durationMs: 300 }]);
    jest.advanceTimersByTime(100); // before 200ms offset
    await Promise.resolve();
    expect(audioStub.createAudioPlayer).not.toHaveBeenCalled();

    jest.advanceTimersByTime(200); // past 200ms offset
    await Promise.resolve();
    await Promise.resolve();
    expect(audioStub.createAudioPlayer).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// G. stopAllScoreNotes / cancel — cancels pending measure schedule
// ─────────────────────────────────────────────────────────────────────────────

describe("stopAllScoreNotes — cancels pending schedule (G)", () => {
  beforeAll(async () => {
    // Prepare MIDI 49 so the cache is populated for these tests
    await prepareScoreAudio([49]);
  });

  beforeEach(() => {
    jest.useFakeTimers();
    audioStub.createAudioPlayer.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("stopAllScoreNotes before timers fire — no players created", async () => {
    scheduleMeasureNotes([{ midiNote: 49, startOffsetMs: 100, durationMs: 500 }]);
    stopAllScoreNotes(); // cancel before the 100ms timer
    jest.runAllTimers();
    await Promise.resolve();
    expect(audioStub.createAudioPlayer).not.toHaveBeenCalled();
  });

  it("cancel function returned by scheduleMeasureNotes works independently", async () => {
    const cancel = scheduleMeasureNotes([
      { midiNote: 49, startOffsetMs: 100, durationMs: 500 },
    ]);
    cancel(); // cancel via returned function
    jest.runAllTimers();
    await Promise.resolve();
    expect(audioStub.createAudioPlayer).not.toHaveBeenCalled();
  });

  it("second scheduleMeasureNotes call cancels the first", async () => {
    scheduleMeasureNotes([{ midiNote: 49, startOffsetMs: 50, durationMs: 500 }]);
    // Scheduling a new measure cancels the previous one
    scheduleMeasureNotes([{ midiNote: 49, startOffsetMs: 50, durationMs: 500 }]);
    jest.runAllTimers();
    await Promise.resolve();
    await Promise.resolve();
    // Only the second schedule's player should be created
    expect(audioStub.createAudioPlayer).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// H. batchSize parameter — edge cases and custom values
// MIDI 50–65 (fresh notes not used by groups A–G)
//   single: 50 | 4-note: 51–54 | 5-note: 55–59 | batchSize=2: 61–63 | batchSize=1: 64–65
// ─────────────────────────────────────────────────────────────────────────────

describe("prepareScoreAudio — batchSize edge cases (H)", () => {
  beforeEach(() => {
    fsStub._mockState.reset();
  });

  it("single note: progress fires once with done=1, total=1", async () => {
    const calls: Array<[number, number]> = [];
    await prepareScoreAudio([50], (done, total) => calls.push([done, total]));
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual([1, 1]);
  });

  it("exactly 4 notes (= default batchSize): progress fires 4 times, total=4 throughout", async () => {
    const dones: number[] = [];
    const totals: number[] = [];
    await prepareScoreAudio([51, 52, 53, 54], (done, total) => {
      dones.push(done);
      totals.push(total);
    });
    expect(dones).toHaveLength(4);
    expect(totals.every((t) => t === 4)).toBe(true);
    expect([...dones].sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
  });

  it("5 notes (default batchSize=4): progress fires 5 times across 2 batches", async () => {
    const dones: number[] = [];
    const totals: number[] = [];
    await prepareScoreAudio([55, 56, 57, 58, 59], (done, total) => {
      dones.push(done);
      totals.push(total);
    });
    expect(dones).toHaveLength(5);
    expect(totals.every((t) => t === 5)).toBe(true);
    expect([...dones].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it("custom batchSize=2: 3 notes → 2 batches, progress fires 3 times", async () => {
    const dones: number[] = [];
    await prepareScoreAudio(
      [61, 62, 63],
      (done) => dones.push(done),
      2, // batchSize
    );
    expect(dones).toHaveLength(3);
    expect([...dones].sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });

  it("custom batchSize=1: 2 notes → strictly serial, done increments 1→2 in order", async () => {
    const calls: Array<[number, number]> = [];
    await prepareScoreAudio(
      [64, 65],
      (done, total) => calls.push([done, total]),
      1, // batchSize=1 → each note is its own single-item batch
    );
    expect(calls).toHaveLength(2);
    // batchSize=1 means strictly sequential — done must be exactly 1 then 2
    expect(calls[0][0]).toBe(1);
    expect(calls[1][0]).toBe(2);
    expect(calls.every(([_, t]) => t === 2)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// I. getPrepareBatchSize — device tier heuristic
// ─────────────────────────────────────────────────────────────────────────────

describe("getPrepareBatchSize — device tier heuristic (I)", () => {
  // Save globals modified by these tests
  const savedOS = (Platform as unknown as Record<string, unknown>).OS;
  const savedVersion = (Platform as unknown as Record<string, unknown>).Version;
  const savedNavigator = (global as unknown as Record<string, unknown>).navigator;

  afterEach(() => {
    (Platform as unknown as Record<string, unknown>).OS = savedOS;
    (Platform as unknown as Record<string, unknown>).Version = savedVersion;
    (global as unknown as Record<string, unknown>).navigator = savedNavigator;
  });

  // ── navigator.hardwareConcurrency tiers (web / environments that expose it) ──

  it("hardwareConcurrency ≥ 8 → batchSize 8 (high-end machine)", () => {
    (global as unknown as Record<string, unknown>).navigator = { hardwareConcurrency: 8 };
    expect(getPrepareBatchSize()).toBe(8);
  });

  it("hardwareConcurrency = 16 → batchSize 8 (capped at 8)", () => {
    (global as unknown as Record<string, unknown>).navigator = { hardwareConcurrency: 16 };
    expect(getPrepareBatchSize()).toBe(8);
  });

  it("hardwareConcurrency = 4 → batchSize 6 (mid-range)", () => {
    (global as unknown as Record<string, unknown>).navigator = { hardwareConcurrency: 4 };
    expect(getPrepareBatchSize()).toBe(6);
  });

  it("hardwareConcurrency = 7 → batchSize 6", () => {
    (global as unknown as Record<string, unknown>).navigator = { hardwareConcurrency: 7 };
    expect(getPrepareBatchSize()).toBe(6);
  });

  it("hardwareConcurrency = 2 → batchSize 4 (low-end)", () => {
    (global as unknown as Record<string, unknown>).navigator = { hardwareConcurrency: 2 };
    expect(getPrepareBatchSize()).toBe(4);
  });

  // ── Native fallback (hardwareConcurrency = 0 / falsy → native heuristic) ──

  describe("native fallback — platform version heuristic", () => {
    beforeEach(() => {
      // hardwareConcurrency=0 is falsy → function falls through to platform check
      (global as unknown as Record<string, unknown>).navigator = { hardwareConcurrency: 0 };
    });

    it("iOS 16+ → batchSize 6 (A15 Bionic and newer)", () => {
      (Platform as unknown as Record<string, unknown>).OS = "ios";
      (Platform as unknown as Record<string, unknown>).Version = "17.4";
      expect(getPrepareBatchSize()).toBe(6);
    });

    it("iOS 16.0 exactly → batchSize 6", () => {
      (Platform as unknown as Record<string, unknown>).OS = "ios";
      (Platform as unknown as Record<string, unknown>).Version = "16.0";
      expect(getPrepareBatchSize()).toBe(6);
    });

    it("iOS 15.x → batchSize 4", () => {
      (Platform as unknown as Record<string, unknown>).OS = "ios";
      (Platform as unknown as Record<string, unknown>).Version = "15.7";
      expect(getPrepareBatchSize()).toBe(4);
    });

    it("Android API 31+ → batchSize 6 (Android 12+)", () => {
      (Platform as unknown as Record<string, unknown>).OS = "android";
      (Platform as unknown as Record<string, unknown>).Version = 34;
      expect(getPrepareBatchSize()).toBe(6);
    });

    it("Android API 31 exactly → batchSize 6", () => {
      (Platform as unknown as Record<string, unknown>).OS = "android";
      (Platform as unknown as Record<string, unknown>).Version = 31;
      expect(getPrepareBatchSize()).toBe(6);
    });

    it("Android API 30 → batchSize 4", () => {
      (Platform as unknown as Record<string, unknown>).OS = "android";
      (Platform as unknown as Record<string, unknown>).Version = 30;
      expect(getPrepareBatchSize()).toBe(4);
    });

    it("unknown platform → batchSize 4 (safe default)", () => {
      (Platform as unknown as Record<string, unknown>).OS = "unknown";
      expect(getPrepareBatchSize()).toBe(4);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// J. Instrument-specific waveforms
// J1: instrumentToWaveform — category → waveform mapping
// J2: prepareScoreAudio — violin writes _sawtooth, piano writes _triangle WAV
// J3: scheduleMeasureNotes — URI reflects instrument waveform suffix
//
// MIDI allocation (fresh, not used by A–I):
//   MIDI 73 → violin  (sawtooth, cache key: 73_sawtooth)
//   MIDI 74 → piano   (triangle, cache key: 74_triangle)
// ─────────────────────────────────────────────────────────────────────────────

describe("instrumentToWaveform — category → waveform mapping (J1)", () => {
  it("violin → sawtooth (strings category)", () => {
    expect(instrumentToWaveform("violin")).toBe("sawtooth");
  });

  it("piano → triangle (keyboard category)", () => {
    expect(instrumentToWaveform("piano")).toBe("triangle");
  });

  it("cello → sawtooth (strings category)", () => {
    expect(instrumentToWaveform("cello")).toBe("sawtooth");
  });

  it("organ → triangle (keyboard category)", () => {
    expect(instrumentToWaveform("organ")).toBe("triangle");
  });

  it("unknown instrument id → sine (safe default)", () => {
    expect(instrumentToWaveform("unknown_xyz")).toBe("sine");
  });

  it("empty string → sine (safe default)", () => {
    expect(instrumentToWaveform("")).toBe("sine");
  });
});

describe("prepareScoreAudio — instrument waveform suffix in WAV filename (J2)", () => {
  beforeEach(() => {
    fsStub._mockState.reset();
  });

  it("violin instrumentId writes a _sawtooth WAV (MIDI 73)", async () => {
    await prepareScoreAudio([73], undefined, 4, "violin");
    expect(fsStub._mockState.writeCount).toBe(1);
    expect(fsStub._mockState.writtenUris[0]).toContain("score_note_73_sawtooth.wav");
  });

  it("second call with same violin note hits cache — no new writes", async () => {
    await prepareScoreAudio([73], undefined, 4, "violin");
    expect(fsStub._mockState.writeCount).toBe(0);
  });

  it("piano instrumentId writes a _triangle WAV (MIDI 74)", async () => {
    await prepareScoreAudio([74], undefined, 4, "piano");
    expect(fsStub._mockState.writeCount).toBe(1);
    expect(fsStub._mockState.writtenUris[0]).toContain("score_note_74_triangle.wav");
  });

  it("same MIDI, different instruments → separate cache entries (no cross-contamination)", async () => {
    fsStub._mockState.reset();
    await prepareScoreAudio([73], undefined, 4, "piano");
    expect(fsStub._mockState.writtenUris[0]).toContain("score_note_73_triangle.wav");
  });
});

describe("scheduleMeasureNotes — URI reflects instrument waveform suffix (J3)", () => {
  beforeAll(async () => {
    await prepareScoreAudio([73], undefined, 4, "violin");
    await prepareScoreAudio([74], undefined, 4, "piano");
  });

  beforeEach(() => {
    jest.useFakeTimers();
    audioStub.createAudioPlayer.mockClear();
  });

  afterEach(() => {
    stopAllScoreNotes();
    jest.useRealTimers();
  });

  it("piano instrument — createAudioPlayer URI contains _triangle suffix", async () => {
    scheduleMeasureNotes(
      [{ midiNote: 74, startOffsetMs: 0, durationMs: 500 }],
      undefined,
      "piano",
    );
    jest.runAllTimers();
    await Promise.resolve();
    await Promise.resolve();
    expect(audioStub.createAudioPlayer).toHaveBeenCalledTimes(1);
    const arg = audioStub.createAudioPlayer.mock.calls[0][0] as { uri: string };
    expect(arg.uri).toContain("score_note_74_triangle.wav");
  });

  it("violin instrument — createAudioPlayer URI contains _sawtooth suffix", async () => {
    scheduleMeasureNotes(
      [{ midiNote: 73, startOffsetMs: 0, durationMs: 500 }],
      undefined,
      "violin",
    );
    jest.runAllTimers();
    await Promise.resolve();
    await Promise.resolve();
    expect(audioStub.createAudioPlayer).toHaveBeenCalledTimes(1);
    const arg = audioStub.createAudioPlayer.mock.calls[0][0] as { uri: string };
    expect(arg.uri).toContain("score_note_73_sawtooth.wav");
  });

  it("default (no instrument) — createAudioPlayer URI contains _sine suffix", async () => {
    await prepareScoreAudio([73]);
    scheduleMeasureNotes([{ midiNote: 73, startOffsetMs: 0, durationMs: 500 }]);
    jest.runAllTimers();
    await Promise.resolve();
    await Promise.resolve();
    expect(audioStub.createAudioPlayer).toHaveBeenCalledTimes(1);
    const arg = audioStub.createAudioPlayer.mock.calls[0][0] as { uri: string };
    expect(arg.uri).toContain("score_note_73_sine.wav");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// K. previewScoreNote — instrument waveform routing
//
// K1: native path — _ensureNoteFile is called (writeCount) and createAudioPlayer
//     receives a URI with the correct waveform suffix
// K2: web path — AudioContext.createOscillator() is called with the correct
//     oscillator type for the given instrument
//
// MIDI allocation (fresh, not used by A–J):
//   MIDI 75 → violin/native  (sawtooth)
//   MIDI 76 → piano/native   (triangle)
//   MIDI 77 → violin/web     (sawtooth, no file written)
//   MIDI 78 → piano/web      (triangle, no file written)
// ─────────────────────────────────────────────────────────────────────────────

describe("previewScoreNote — native instrument waveform routing (K1)", () => {
  const savedOS = (Platform as unknown as Record<string, unknown>).OS;

  beforeAll(() => {
    (Platform as unknown as Record<string, unknown>).OS = "ios";
  });

  afterAll(() => {
    (Platform as unknown as Record<string, unknown>).OS = savedOS;
  });

  beforeEach(() => {
    fsStub._mockState.reset();
    audioStub.createAudioPlayer.mockClear();
  });

  it("violin — _ensureNoteFile writes a _sawtooth WAV (MIDI 75)", async () => {
    previewScoreNote(75, "violin");
    // Flush the _ensureNoteFile promise chain and the subsequent _playNativeNote
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(fsStub._mockState.writeCount).toBe(1);
    expect(fsStub._mockState.writtenUris[0]).toContain("score_note_75_sawtooth.wav");
  });

  it("violin — createAudioPlayer URI contains _sawtooth suffix (MIDI 75)", async () => {
    // MIDI 75 was cached by the previous test; reset to force a fresh write
    // (use same note — cache hit path still calls createAudioPlayer)
    previewScoreNote(75, "violin");
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(audioStub.createAudioPlayer).toHaveBeenCalledTimes(1);
    const arg = audioStub.createAudioPlayer.mock.calls[0][0] as { uri: string };
    expect(arg.uri).toContain("score_note_75_sawtooth.wav");
  });

  it("piano — _ensureNoteFile writes a _triangle WAV (MIDI 76)", async () => {
    previewScoreNote(76, "piano");
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(fsStub._mockState.writeCount).toBe(1);
    expect(fsStub._mockState.writtenUris[0]).toContain("score_note_76_triangle.wav");
  });

  it("piano — createAudioPlayer URI contains _triangle suffix (MIDI 76)", async () => {
    previewScoreNote(76, "piano");
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(audioStub.createAudioPlayer).toHaveBeenCalledTimes(1);
    const arg = audioStub.createAudioPlayer.mock.calls[0][0] as { uri: string };
    expect(arg.uri).toContain("score_note_76_triangle.wav");
  });

  it("out-of-range MIDI — no file written, createAudioPlayer not called", async () => {
    previewScoreNote(10, "violin"); // MIDI 10 < 21 → early return
    await Promise.resolve();
    await Promise.resolve();
    expect(fsStub._mockState.writeCount).toBe(0);
    expect(audioStub.createAudioPlayer).not.toHaveBeenCalled();
  });
});

describe("previewScoreNote — web AudioContext oscillator type (K2)", () => {
  const savedOS = (Platform as unknown as Record<string, unknown>).OS;

  // Build a minimal AudioContext mock that records what was set on the oscillator
  function makeMockCtx() {
    const osc = {
      type: "" as OscillatorType,
      frequency: { value: 0 },
      connect: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
      disconnect: jest.fn(),
    };
    const gain = {
      gain: {
        value: 0,
        setValueAtTime: jest.fn(),
        linearRampToValueAtTime: jest.fn(),
        cancelScheduledValues: jest.fn(),
      },
      connect: jest.fn(),
      disconnect: jest.fn(),
    };
    const ctx = {
      state: "running" as AudioContextState,
      currentTime: 0,
      destination: {} as AudioDestinationNode,
      createOscillator: jest.fn(() => osc),
      createGain: jest.fn(() => gain),
      resume: jest.fn().mockResolvedValue(undefined),
    };
    return { ctx, osc, gain };
  }

  beforeAll(() => {
    (Platform as unknown as Record<string, unknown>).OS = "web";
  });

  afterAll(() => {
    (Platform as unknown as Record<string, unknown>).OS = savedOS;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("violin — oscillator type is 'sawtooth' (MIDI 77)", () => {
    const { ctx, osc } = makeMockCtx();
    jest
      .spyOn(audioRenderer, "getWebAudioContext")
      .mockReturnValueOnce(ctx as unknown as AudioContext);

    previewScoreNote(77, "violin");

    expect(ctx.createOscillator).toHaveBeenCalled();
    expect(osc.type).toBe("sawtooth");
  });

  it("piano — oscillator type is 'triangle' (MIDI 78)", () => {
    const { ctx, osc } = makeMockCtx();
    jest
      .spyOn(audioRenderer, "getWebAudioContext")
      .mockReturnValueOnce(ctx as unknown as AudioContext);

    previewScoreNote(78, "piano");

    expect(ctx.createOscillator).toHaveBeenCalled();
    expect(osc.type).toBe("triangle");
  });

  it("no instrument — oscillator type is 'sine' (default, MIDI 77)", () => {
    const { ctx, osc } = makeMockCtx();
    jest
      .spyOn(audioRenderer, "getWebAudioContext")
      .mockReturnValueOnce(ctx as unknown as AudioContext);

    previewScoreNote(77); // no instrumentId → sine

    expect(ctx.createOscillator).toHaveBeenCalled();
    expect(osc.type).toBe("sine");
  });

  it("null AudioContext — no crash, createOscillator never called", () => {
    jest
      .spyOn(audioRenderer, "getWebAudioContext")
      .mockReturnValueOnce(null);

    expect(() => previewScoreNote(77, "violin")).not.toThrow();
  });

  it("out-of-range MIDI — AudioContext never consulted", () => {
    const spy = jest
      .spyOn(audioRenderer, "getWebAudioContext")
      .mockReturnValueOnce(null);

    previewScoreNote(10, "violin"); // MIDI 10 < 21 → early return before web path
    expect(spy).not.toHaveBeenCalled();
  });
});
