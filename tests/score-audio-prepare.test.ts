/// <reference types="jest" />
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

import { buildPlayTimeline } from "../lib/score-playback";
import type { ScoreDocument } from "../lib/score-types";

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
// Group K3 → MIDI 85, 86 (native rapid-fire; pre-cached before tests)
// Group K4 → MIDI 88, 89 (web rapid-fire)
// Group L  → MIDI 80 (same pitch, three distinct cache keys: 80_sawtooth / 80_triangle / 80_sine)
// Group N  → MIDI 62 (violin/sawtooth), 63 (piano/triangle) — two-part multi-instrument timeline

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

// ─────────────────────────────────────────────────────────────────────────────
// K3. previewScoreNote — rapid successive calls (native): only one player active
//
// Two or more calls in quick succession must result in exactly one
// createAudioPlayer invocation.  Earlier calls are cancelled via the token
// mechanism before _playNativeNote resolves.
//
// MIDI allocation (fresh, pre-cached in beforeAll):
//   MIDI 85 → same-pitch rapid-fire
//   MIDI 86 → second pitch for cross-pitch cancellation test
// ─────────────────────────────────────────────────────────────────────────────

describe("previewScoreNote — rapid successive calls cancel previous (K3 native)", () => {
  const savedOS = (Platform as unknown as Record<string, unknown>).OS;

  beforeAll(async () => {
    (Platform as unknown as Record<string, unknown>).OS = "ios";
    // Pre-cache so _ensureNoteFile resolves as a microtask (cache hit)
    await prepareScoreAudio([85, 86]);
  });

  afterAll(() => {
    (Platform as unknown as Record<string, unknown>).OS = savedOS;
  });

  beforeEach(() => {
    audioStub.createAudioPlayer.mockClear();
  });

  it("two rapid same-pitch calls — only one player created", async () => {
    previewScoreNote(85);
    previewScoreNote(85); // cancels the first before it resolves
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(audioStub.createAudioPlayer).toHaveBeenCalledTimes(1);
  });

  it("three rapid same-pitch calls — only one player created", async () => {
    previewScoreNote(85);
    previewScoreNote(85);
    previewScoreNote(85); // cancels the first two
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(audioStub.createAudioPlayer).toHaveBeenCalledTimes(1);
  });

  it("two rapid different-pitch calls — only the second pitch player is created", async () => {
    previewScoreNote(85); // first
    previewScoreNote(86); // cancels first, plays second
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(audioStub.createAudioPlayer).toHaveBeenCalledTimes(1);
    const arg = audioStub.createAudioPlayer.mock.calls[0][0] as { uri: string };
    expect(arg.uri).toContain("score_note_86_sine.wav");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// K4. previewScoreNote — rapid successive calls (web): first oscillator stopped
//
// On web each call to _playWebNote returns a stop function immediately.
// Rapid successive calls must invoke that stop function on the previous
// oscillator before creating the next one — leaving only one active oscillator.
//
// MIDI allocation (fresh, web path — no WAV files involved):
//   MIDI 88, 89 — not used by any other group
// ─────────────────────────────────────────────────────────────────────────────

describe("previewScoreNote — rapid successive calls cancel previous (K4 web)", () => {
  const savedOS = (Platform as unknown as Record<string, unknown>).OS;

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

  it("two rapid calls — first oscillator is stopped early (stop called twice)", () => {
    const mock1 = makeMockCtx();
    const mock2 = makeMockCtx();
    const spy = jest.spyOn(audioRenderer, "getWebAudioContext");
    spy.mockReturnValueOnce(mock1.ctx as unknown as AudioContext);
    spy.mockReturnValueOnce(mock2.ctx as unknown as AudioContext);

    previewScoreNote(88); // first — oscillator in mock1.ctx
    previewScoreNote(88); // second — cancels first, oscillator in mock2.ctx

    // First oscillator: scheduled stop (once) + early-cancel stop (once) = 2
    expect(mock1.osc.stop).toHaveBeenCalledTimes(2);
    // Second oscillator: only the scheduled stop = 1
    expect(mock2.osc.stop).toHaveBeenCalledTimes(1);
  });

  it("three rapid calls — first two oscillators stopped early, last one active", () => {
    const mocks = [makeMockCtx(), makeMockCtx(), makeMockCtx()];
    const spy = jest.spyOn(audioRenderer, "getWebAudioContext");
    spy.mockReturnValueOnce(mocks[0].ctx as unknown as AudioContext);
    spy.mockReturnValueOnce(mocks[1].ctx as unknown as AudioContext);
    spy.mockReturnValueOnce(mocks[2].ctx as unknown as AudioContext);

    previewScoreNote(89);
    previewScoreNote(89);
    previewScoreNote(89);

    // First two oscillators should each have stop called twice (scheduled + early-cancel)
    expect(mocks[0].osc.stop).toHaveBeenCalledTimes(2);
    expect(mocks[1].osc.stop).toHaveBeenCalledTimes(2);
    // Last oscillator only has its scheduled stop
    expect(mocks[2].osc.stop).toHaveBeenCalledTimes(1);
  });

  it("two rapid different-pitch calls — both AudioContexts consulted, first cancelled", () => {
    const mock1 = makeMockCtx();
    const mock2 = makeMockCtx();
    const spy = jest.spyOn(audioRenderer, "getWebAudioContext");
    spy.mockReturnValueOnce(mock1.ctx as unknown as AudioContext);
    spy.mockReturnValueOnce(mock2.ctx as unknown as AudioContext);

    previewScoreNote(88); // first pitch
    previewScoreNote(89); // different pitch — cancels first

    expect(spy).toHaveBeenCalledTimes(2);
    expect(mock1.osc.stop).toHaveBeenCalledTimes(2); // cancelled
    expect(mock2.osc.stop).toHaveBeenCalledTimes(1); // active
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// L. PCM waveform signature — sawtooth vs triangle vs sine differ in content
//
// Calls prepareScoreAudio with a real (non-mocked) encodeWav and decodes the
// written WAV bytes back to Float32 PCM via parseWav.  Asserts that violin
// (sawtooth) and piano (triangle) produce genuinely different PCM at the same
// MIDI pitch, and that both differ from the default sine waveform.
//
// This catches a regression where the waveform parameter is silently dropped
// inside _generatePCM — such a bug would still emit a WAV file and pass all
// URI-suffix checks, but every instrument would sound identical (wrong timbre).
//
// MIDI allocation: 80 — three distinct cache keys: 80_sawtooth, 80_triangle,
// 80_sine.  None of these appear in groups A–K.
// ─────────────────────────────────────────────────────────────────────────────

describe("prepareScoreAudio — PCM waveform signature differs by instrument (L)", () => {
  const MIDI = 80;

  /** Fraction of sample positions where |a[i] − b[i]| > threshold. */
  function diffFraction(
    a: Float32Array,
    b: Float32Array,
    threshold = 0.01,
  ): number {
    const len = Math.min(a.length, b.length);
    let count = 0;
    for (let i = 0; i < len; i++) {
      if (Math.abs(a[i] - b[i]) > threshold) count++;
    }
    return count / len;
  }

  let sawPcm: Float32Array;
  let triPcm: Float32Array;
  let sinPcm: Float32Array;

  beforeAll(async () => {
    // ── violin → sawtooth (cache key: 80_sawtooth, fresh) ──────────────────
    fsStub._mockState.reset();
    await prepareScoreAudio([MIDI], undefined, 4, "violin");
    const sawUri = fsStub._mockState.writtenUris[0];
    const sawBytes = (fsStub._mockState as any).writtenData.get(sawUri) as Uint8Array;
    ({ pcm: sawPcm } = audioRenderer.parseWav(sawBytes.buffer as ArrayBuffer));

    // ── piano → triangle (cache key: 80_triangle, fresh) ───────────────────
    fsStub._mockState.reset();
    await prepareScoreAudio([MIDI], undefined, 4, "piano");
    const triUri = fsStub._mockState.writtenUris[0];
    const triBytes = (fsStub._mockState as any).writtenData.get(triUri) as Uint8Array;
    ({ pcm: triPcm } = audioRenderer.parseWav(triBytes.buffer as ArrayBuffer));

    // ── default (no instrumentId) → sine (cache key: 80_sine, fresh) ───────
    fsStub._mockState.reset();
    await prepareScoreAudio([MIDI]);
    const sinUri = fsStub._mockState.writtenUris[0];
    const sinBytes = (fsStub._mockState as any).writtenData.get(sinUri) as Uint8Array;
    ({ pcm: sinPcm } = audioRenderer.parseWav(sinBytes.buffer as ArrayBuffer));
  });

  it("WAV bytes are captured — PCM arrays are defined and non-empty", () => {
    expect(sawPcm).toBeDefined();
    expect(triPcm).toBeDefined();
    expect(sinPcm).toBeDefined();
    expect(sawPcm.length).toBeGreaterThan(0);
  });

  it("all three waveforms produce PCM of the same length (same MIDI / SR / duration)", () => {
    expect(sawPcm.length).toBe(triPcm.length);
    expect(sawPcm.length).toBe(sinPcm.length);
  });

  it("sawtooth PCM differs significantly from triangle PCM at MIDI 80 (>5% of samples)", () => {
    expect(diffFraction(sawPcm, triPcm)).toBeGreaterThan(0.05);
  });

  it("sawtooth PCM differs significantly from sine PCM at MIDI 80 (>5% of samples)", () => {
    expect(diffFraction(sawPcm, sinPcm)).toBeGreaterThan(0.05);
  });

  it("triangle PCM differs significantly from sine PCM at MIDI 80 (>5% of samples)", () => {
    expect(diffFraction(triPcm, sinPcm)).toBeGreaterThan(0.05);
  });

  it("sawtooth steady-state peak amplitude is ≥ 0.5 (waveform not silenced)", () => {
    // Skip the 8 ms attack window (≈176 samples at 22050 Hz) and inspect the
    // next 1000 samples; the envelope is flat at 0.6 in that region.
    const ATTACK_SAMPLES = 176;
    const WINDOW = 1000;
    let max = 0;
    for (
      let i = ATTACK_SAMPLES;
      i < ATTACK_SAMPLES + WINDOW && i < sawPcm.length;
      i++
    ) {
      if (Math.abs(sawPcm[i]) > max) max = Math.abs(sawPcm[i]);
    }
    expect(max).toBeGreaterThanOrEqual(0.5);
  });

  it("triangle steady-state peak amplitude is ≥ 0.5 (waveform not silenced)", () => {
    const ATTACK_SAMPLES = 176;
    const WINDOW = 1000;
    let max = 0;
    for (
      let i = ATTACK_SAMPLES;
      i < ATTACK_SAMPLES + WINDOW && i < triPcm.length;
      i++
    ) {
      if (Math.abs(triPcm[i]) > max) max = Math.abs(triPcm[i]);
    }
    expect(max).toBeGreaterThanOrEqual(0.5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// M. Multi-instrument score preparation — noteInstrumentPairs API
//
// Verifies that a score with multiple instruments generates the correct WAV
// file for each (MIDI, waveform) combination, not a single shared waveform.
//
// MIDI allocation (fresh, not used by A–L):
//   MIDI 90 → violin measure (sawtooth) AND piano measure (triangle)
//             — same pitch, two instruments → two distinct cache entries
//   MIDI 91 → violin-only
//   MIDI 92 → piano-only
//   MIDI 93 → cello (sawtooth — same waveform as violin; dedup test)
//   MIDI 94 → out-of-range test (19 and 109 used inline, not MIDI 94)
//   MIDI 95 → progress callback test
//   MIDI 96 → scheduleMeasureNotes multi-instrument URI test (violin)
//   MIDI 97 → scheduleMeasureNotes multi-instrument URI test (piano)
// ─────────────────────────────────────────────────────────────────────────────

describe("prepareScoreAudio — multi-instrument via noteInstrumentPairs (M1)", () => {
  beforeEach(() => {
    fsStub._mockState.reset();
  });

  it("violin + piano on the same MIDI pitch → two distinct WAV files (sawtooth + triangle)", async () => {
    await prepareScoreAudio(
      [],
      undefined,
      4,
      undefined,
      [
        { midi: 90, instrumentId: "violin" },
        { midi: 90, instrumentId: "piano" },
      ],
    );
    expect(fsStub._mockState.writeCount).toBe(2);
    const uris = fsStub._mockState.writtenUris;
    expect(uris.some((u) => u.includes("score_note_90_sawtooth.wav"))).toBe(true);
    expect(uris.some((u) => u.includes("score_note_90_triangle.wav"))).toBe(true);
  });

  it("two distinct pitches, two instruments → two WAV files with correct waveform suffix", async () => {
    await prepareScoreAudio(
      [],
      undefined,
      4,
      undefined,
      [
        { midi: 91, instrumentId: "violin" },
        { midi: 92, instrumentId: "piano" },
      ],
    );
    expect(fsStub._mockState.writeCount).toBe(2);
    const uris = fsStub._mockState.writtenUris;
    expect(uris.some((u) => u.includes("score_note_91_sawtooth.wav"))).toBe(true);
    expect(uris.some((u) => u.includes("score_note_92_triangle.wav"))).toBe(true);
  });

  it("same MIDI, same waveform category (violin + cello, both sawtooth) → one WAV file (dedup)", async () => {
    await prepareScoreAudio(
      [],
      undefined,
      4,
      undefined,
      [
        { midi: 93, instrumentId: "violin" },
        { midi: 93, instrumentId: "cello" },
      ],
    );
    // Both map to sawtooth → only one unique (midi, waveform) pair
    expect(fsStub._mockState.writeCount).toBe(1);
    expect(fsStub._mockState.writtenUris[0]).toContain("score_note_93_sawtooth.wav");
  });

  it("duplicate pairs (same midi + same instrument repeated) → one WAV file (dedup)", async () => {
    await prepareScoreAudio(
      [],
      undefined,
      4,
      undefined,
      [
        { midi: 91, instrumentId: "violin" },
        { midi: 91, instrumentId: "violin" },
        { midi: 91, instrumentId: "violin" },
      ],
    );
    // violin × 91 was cached above; reset already done by beforeEach,
    // but the module-level cache still has it → 0 new writes (cache hit)
    expect(fsStub._mockState.writeCount).toBe(0);
  });

  it("out-of-range MIDI in pairs is filtered — no WAV written for it", async () => {
    await prepareScoreAudio(
      [],
      undefined,
      4,
      undefined,
      [
        { midi: 19, instrumentId: "violin" },
        { midi: 109, instrumentId: "piano" },
        { midi: 90, instrumentId: "violin" }, // valid, but already cached (from first test above)
      ],
    );
    // MIDI 19 and 109 are out of range; MIDI 90 (violin/sawtooth) already cached
    expect(fsStub._mockState.writeCount).toBe(0);
  });

  it("empty noteInstrumentPairs → resolves immediately, no files written", async () => {
    await expect(
      prepareScoreAudio([], undefined, 4, undefined, []),
    ).resolves.toBeUndefined();
    // Empty pairs array is treated as "not provided" → falls back to midiNotes []
    expect(fsStub._mockState.writeCount).toBe(0);
  });
});

describe("prepareScoreAudio — multi-instrument progress callback (M2)", () => {
  it("progress fires once per unique (midi, waveform) pair", async () => {
    const calls: Array<{ done: number; total: number }> = [];
    // MIDI 95: violin (sawtooth) and piano (triangle) → 2 unique pairs
    await prepareScoreAudio(
      [],
      (done, total) => calls.push({ done, total }),
      4,
      undefined,
      [
        { midi: 95, instrumentId: "violin" },
        { midi: 95, instrumentId: "piano" },
      ],
    );
    expect(calls).toHaveLength(2);
    expect(calls[calls.length - 1].done).toBe(calls[calls.length - 1].total);
  });

  it("total reported equals unique (midi, waveform) count (dedup applied)", async () => {
    const totals: number[] = [];
    // violin + cello both → sawtooth → 1 unique pair after dedup
    // Progress fires once (total=1) because there is exactly 1 unique (midi, waveform) pair.
    await prepareScoreAudio(
      [],
      (_done, total) => totals.push(total),
      4,
      undefined,
      [
        { midi: 95, instrumentId: "violin" }, // 95_sawtooth — cached from first M2 test
        { midi: 95, instrumentId: "cello" },  // same waveform (sawtooth) → deduped away
      ],
    );
    // After dedup: 1 unique pair (95_sawtooth). Progress fires once with total=1
    // regardless of whether the file is a cache hit.
    expect(totals).toHaveLength(1);
    expect(totals[0]).toBe(1);
  });

  it("progress done values are 1-based and monotonically increasing", async () => {
    // 91_triangle and 92_sawtooth are both fresh (M1 prepared 91_sawtooth and 92_triangle)
    const calls: Array<[number, number]> = [];
    await prepareScoreAudio(
      [],
      (done, total) => calls.push([done, total]),
      4,
      undefined,
      [
        { midi: 91, instrumentId: "piano" },  // 91_triangle — fresh
        { midi: 92, instrumentId: "violin" }, // 92_sawtooth — fresh
      ],
    );
    // 2 unique fresh pairs → progress fires twice
    expect(calls).toHaveLength(2);
    // done values form a 1-based sequence
    const dones = calls.map(([d]) => d).sort((a, b) => a - b);
    expect(dones).toEqual([1, 2]);
    // total is 2 throughout
    expect(calls.every(([, t]) => t === 2)).toBe(true);
  });
});

describe("prepareScoreAudio — multi-instrument cache hit after prepare (M3)", () => {
  beforeEach(() => {
    fsStub._mockState.reset();
  });

  it("second call with same pairs writes nothing (all cache hits)", async () => {
    // First call — fresh pairs (using already-cached 90_sawtooth + 90_triangle)
    await prepareScoreAudio(
      [],
      undefined,
      4,
      undefined,
      [
        { midi: 90, instrumentId: "violin" }, // 90_sawtooth — cached in M1
        { midi: 90, instrumentId: "piano" },  // 90_triangle — cached in M1
      ],
    );
    expect(fsStub._mockState.writeCount).toBe(0);
  });

  it("cross-instrument cache isolation: violin WAV and piano WAV are separate entries", async () => {
    // Verify cache keys are independent: prepare piano variant of MIDI 91
    // (91_triangle is now cached from M2 progress test)
    // This is a no-op prepare — confirms the waveform suffix separates the entries
    await prepareScoreAudio(
      [],
      undefined,
      4,
      undefined,
      [
        { midi: 91, instrumentId: "violin" }, // 91_sawtooth — cached
        { midi: 91, instrumentId: "piano" },  // 91_triangle — cached
      ],
    );
    expect(fsStub._mockState.writeCount).toBe(0);
  });
});

describe("prepareScoreAudio — multi-instrument PCM waveform integrity (M4)", () => {
  /**
   * Fraction of sample positions where |a[i] − b[i]| > threshold.
   * Reused from Group L for the multi-instrument path.
   */
  function diffFraction(a: Float32Array, b: Float32Array, threshold = 0.01): number {
    const len = Math.min(a.length, b.length);
    let count = 0;
    for (let i = 0; i < len; i++) {
      if (Math.abs(a[i] - b[i]) > threshold) count++;
    }
    return count / len;
  }

  // MIDI 93: was prepared with violin (sawtooth) in M1.
  // Now prepare the same MIDI with piano (triangle) via noteInstrumentPairs
  // and verify the PCM content is genuinely different.
  let sawPcm: Float32Array;
  let triPcm: Float32Array;

  beforeAll(async () => {
    // 93_sawtooth already cached from M1; grab its bytes
    fsStub._mockState.reset();
    await prepareScoreAudio([], undefined, 4, undefined, [
      { midi: 93, instrumentId: "violin" },
    ]);
    // If already cached, writtenUris is empty — use the previously written data
    // by re-preparing fresh with a piano variant which IS new
    fsStub._mockState.reset();
    await prepareScoreAudio([], undefined, 4, undefined, [
      { midi: 93, instrumentId: "piano" },
    ]);
    const triUri = fsStub._mockState.writtenUris[0];
    const triBytes = (fsStub._mockState as any).writtenData.get(triUri) as Uint8Array;
    ({ pcm: triPcm } = audioRenderer.parseWav(triBytes.buffer as ArrayBuffer));

    // Get sawtooth PCM for MIDI 93 by writing it fresh (separate MIDI to avoid cache collision)
    // Use MIDI 93 sawtooth — already in module cache, so prepare with a brand-new pitch
    // to force a write. We use MIDI 96 (fresh) for the sawtooth reference.
    fsStub._mockState.reset();
    await prepareScoreAudio([], undefined, 4, undefined, [
      { midi: 96, instrumentId: "violin" },
    ]);
    const sawUri = fsStub._mockState.writtenUris[0];
    const sawBytes = (fsStub._mockState as any).writtenData.get(sawUri) as Uint8Array;
    ({ pcm: sawPcm } = audioRenderer.parseWav(sawBytes.buffer as ArrayBuffer));
  });

  it("multi-instrument path: sawtooth PCM and triangle PCM differ significantly (>5%)", () => {
    expect(sawPcm).toBeDefined();
    expect(triPcm).toBeDefined();
    expect(diffFraction(sawPcm, triPcm)).toBeGreaterThan(0.05);
  });
});

describe("scheduleMeasureNotes — multi-instrument: URI matches waveform for each instrument (M5)", () => {
  beforeAll(async () => {
    // Prepare MIDI 96 (violin/sawtooth) and MIDI 97 (piano/triangle) for playback tests
    await prepareScoreAudio([], undefined, 4, undefined, [
      { midi: 96, instrumentId: "violin" },
      { midi: 97, instrumentId: "piano" },
    ]);
  });

  beforeEach(() => {
    jest.useFakeTimers();
    audioStub.createAudioPlayer.mockClear();
  });

  afterEach(() => {
    stopAllScoreNotes();
    jest.useRealTimers();
  });

  it("violin measure (MIDI 96) → createAudioPlayer URI contains _sawtooth suffix", async () => {
    scheduleMeasureNotes(
      [{ midiNote: 96, startOffsetMs: 0, durationMs: 500 }],
      undefined,
      "violin",
    );
    jest.runAllTimers();
    await Promise.resolve();
    await Promise.resolve();
    expect(audioStub.createAudioPlayer).toHaveBeenCalledTimes(1);
    const arg = audioStub.createAudioPlayer.mock.calls[0][0] as { uri: string };
    expect(arg.uri).toContain("score_note_96_sawtooth.wav");
  });

  it("piano measure (MIDI 97) → createAudioPlayer URI contains _triangle suffix", async () => {
    scheduleMeasureNotes(
      [{ midiNote: 97, startOffsetMs: 0, durationMs: 500 }],
      undefined,
      "piano",
    );
    jest.runAllTimers();
    await Promise.resolve();
    await Promise.resolve();
    expect(audioStub.createAudioPlayer).toHaveBeenCalledTimes(1);
    const arg = audioStub.createAudioPlayer.mock.calls[0][0] as { uri: string };
    expect(arg.uri).toContain("score_note_97_triangle.wav");
  });

  it("switching instruments between measures plays correct waveform each time", async () => {
    // Measure 1: violin
    scheduleMeasureNotes(
      [{ midiNote: 96, startOffsetMs: 0, durationMs: 400 }],
      undefined,
      "violin",
    );
    jest.runAllTimers();
    await Promise.resolve();
    await Promise.resolve();
    const callAfterViolin = audioStub.createAudioPlayer.mock.calls.length;
    expect(callAfterViolin).toBe(1);
    const violinArg = audioStub.createAudioPlayer.mock.calls[0][0] as { uri: string };
    expect(violinArg.uri).toContain("score_note_96_sawtooth.wav");

    // Measure 2: piano (new measure replaces the previous one)
    audioStub.createAudioPlayer.mockClear();
    scheduleMeasureNotes(
      [{ midiNote: 97, startOffsetMs: 0, durationMs: 400 }],
      undefined,
      "piano",
    );
    jest.runAllTimers();
    await Promise.resolve();
    await Promise.resolve();
    expect(audioStub.createAudioPlayer).toHaveBeenCalledTimes(1);
    const pianoArg = audioStub.createAudioPlayer.mock.calls[0][0] as { uri: string };
    expect(pianoArg.uri).toContain("score_note_97_triangle.wav");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// N. 다악기(multi-part) 타임라인 — buildPlayTimeline + scheduleMeasureNotes
// MIDI 62 = 바이올린(D4, sawtooth), MIDI 63 = 피아노(Eb4, triangle)
// ─────────────────────────────────────────────────────────────────────────────

/** 바이올린 + 피아노 2파트 악보 픽스처 */
const TWO_PART_DOC: ScoreDocument = {
  id: "two-part-doc",
  metadata: { title: "두 파트 테스트", createdAt: 0, updatedAt: 0 },
  parts: [
    {
      id: "part-violin",
      instrumentId: "violin",
      clef: "treble",
      measures: [
        {
          id: "m-violin-1",
          bpm: 120,
          timeSignature: { numerator: 4, denominator: 4 },
          elements: [
            {
              id: "n-v1",
              type: "note",
              pitch: { step: "D", octave: 5 }, // MIDI 62 = 5×12+2
              duration: "quarter",
            },
          ],
        },
      ],
    },
    {
      id: "part-piano",
      instrumentId: "piano",
      clef: "treble",
      measures: [
        {
          id: "m-piano-1",
          bpm: 120,
          timeSignature: { numerator: 4, denominator: 4 },
          elements: [
            {
              id: "n-p1",
              type: "note",
              pitch: { step: "D", octave: 5, accidental: "sharp" }, // MIDI 63 = 5×12+2+1
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

describe("buildPlayTimeline — 두 파트 악보: 두 파트 음표를 한 이벤트로 병합 (N1)", () => {
  it("timeline에 마디 수만큼 이벤트가 생성되고 두 파트의 음표가 모두 포함됨", () => {
    const timeline = buildPlayTimeline(TWO_PART_DOC);
    expect(timeline).toHaveLength(1); // 마디 1개
    expect(timeline[0].notes).toHaveLength(2); // 두 파트 각 1음표
  });

  it("바이올린 파트 음표의 instrumentId가 'violin'", () => {
    const timeline = buildPlayTimeline(TWO_PART_DOC);
    const violinNote = timeline[0].notes.find((n) => n.midiNote === 62);
    expect(violinNote).toBeDefined();
    expect(violinNote!.instrumentId).toBe("violin");
  });

  it("피아노 파트 음표의 instrumentId가 'piano'", () => {
    const timeline = buildPlayTimeline(TWO_PART_DOC);
    const pianoNote = timeline[0].notes.find((n) => n.midiNote === 63);
    expect(pianoNote).toBeDefined();
    expect(pianoNote!.instrumentId).toBe("piano");
  });
});

describe("buildPlayTimeline — 타악기 파트는 음표 생략 (N2)", () => {
  it("percussion 파트의 음표는 수집되지 않음", () => {
    const doc: ScoreDocument = {
      ...TWO_PART_DOC,
      id: "perc-doc",
      parts: [
        TWO_PART_DOC.parts[0], // violin (treble)
        { ...TWO_PART_DOC.parts[1], id: "part-perc", clef: "percussion" },
      ],
    };
    const timeline = buildPlayTimeline(doc);
    expect(timeline).toHaveLength(1);
    // percussion 파트 음표는 포함되지 않고 violin 파트 음표 1개만 있어야 함
    expect(timeline[0].notes).toHaveLength(1);
    expect(timeline[0].notes[0].instrumentId).toBe("violin");
  });
});

describe("scheduleMeasureNotes — 음표별 instrumentId → 파형 결정 (N3)", () => {
  beforeAll(async () => {
    // N-group 음표(MIDI 62, 63)를 native 경로로 준비
    await prepareScoreAudio([], undefined, 4, undefined, [
      { midi: 62, instrumentId: "violin" },
      { midi: 63, instrumentId: "piano" },
    ]);
  });

  beforeEach(() => {
    jest.useFakeTimers();
    audioStub.createAudioPlayer.mockClear();
  });

  afterEach(() => {
    stopAllScoreNotes();
    jest.useRealTimers();
  });

  it("바이올린(MIDI 62) 음표 → _sawtooth.wav URI, 피아노(MIDI 63) 음표 → _triangle.wav URI (동시 재생)", async () => {
    // per-note instrumentId 사용 — top-level instrumentId 없음
    scheduleMeasureNotes([
      { midiNote: 62, startOffsetMs: 0, durationMs: 400, instrumentId: "violin" },
      { midiNote: 63, startOffsetMs: 0, durationMs: 400, instrumentId: "piano" },
    ]);
    jest.runAllTimers();
    await Promise.resolve();
    await Promise.resolve();
    expect(audioStub.createAudioPlayer).toHaveBeenCalledTimes(2);

    const uris = audioStub.createAudioPlayer.mock.calls.map(
      (c: [{ uri: string }]) => c[0].uri,
    );
    expect(uris.some((u: string) => u.includes("score_note_62_sawtooth.wav"))).toBe(true);
    expect(uris.some((u: string) => u.includes("score_note_63_triangle.wav"))).toBe(true);
  });

  it("per-note instrumentId가 top-level instrumentId보다 우선함", async () => {
    // top-level = "piano"이지만 note.instrumentId = "violin" → sawtooth 사용
    scheduleMeasureNotes(
      [{ midiNote: 62, startOffsetMs: 0, durationMs: 400, instrumentId: "violin" }],
      undefined,
      "piano", // top-level는 piano이지만 무시되어야 함
    );
    jest.runAllTimers();
    await Promise.resolve();
    await Promise.resolve();
    expect(audioStub.createAudioPlayer).toHaveBeenCalledTimes(1);
    const arg = audioStub.createAudioPlayer.mock.calls[0][0] as { uri: string };
    expect(arg.uri).toContain("score_note_62_sawtooth.wav");
  });
});
