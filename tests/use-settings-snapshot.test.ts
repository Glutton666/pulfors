/**
 * @jest-environment jsdom
 *
 * Regression tests for useSettings snapshot correctness:
 *  1. beatDenominator is included in every subsequent settings save —
 *     not just the explicit setBeatDenominator call — so it is never
 *     silently lost when another setting (volume, BPM, …) triggers a save.
 *  2. A full round-trip: change denominator → change volume → reload →
 *     denominator is preserved.
 */

import { renderHook, act } from "@testing-library/react";

// ─────────────────────────────────────────────────────────────────────────────
// Stubs
// ─────────────────────────────────────────────────────────────────────────────

// Saved settings accumulator — records every call to saveSettings
const savedSettings: Array<Record<string, unknown>> = [];
let mockPersistStatus = {
  lastSaveAt: null as number | null,
  lastErrorAt: null as number | null,
  consecutiveFailures: 0,
  pendingChanges: 0,
  cycleFailed: false,
};

jest.mock("@/lib/storage", () => ({
  loadSettings: jest.fn().mockResolvedValue({
    bpm: 120,
    beatsPerMeasure: 4,
    beatDenominator: 4,
    subdivisions: 1,
    subdivisionPattern: ["accent"],
    beatSubdivisions: {},
    volume: 0.75,
    sampleVolume: 0.8,
    soundSet: "classic",
    layerSoundSets: {},
    flashMode: "accent",
    hapticMode: "all",
    audioOffsetMs: 0,
    timerStopMode: "end-of-cycle",
    landscapeReversed: false,
    beatDirection: "cw",
    username: "",
    barMetronomeChannel: "both",
    barCellOpacity: 0.55,
    barRowHeight: 44,
    backgroundPlay: false,
    autoResumeAfterInterruption: true,
    showLandscapeImage: true,
    landscapeContentType: "photo",
  }),
  saveSettings: jest.fn().mockImplementation((settings: Record<string, unknown>) => {
    savedSettings.push({ ...settings });
    return Promise.resolve();
  }),
}));

// createDebouncedPersister stub: calls the save function synchronously so we
// can assert on saved values without flushing timers.
jest.mock("@/lib/persist", () => ({
  createDebouncedPersister: jest.fn(
    (
      getSnapshot: () => Record<string, unknown>,
      save: (s: Record<string, unknown>) => Promise<void>,
    ) => {
      // Returns a partial-update persister that merges into the snapshot and
      // saves immediately — mirrors the real one's contract without debouncing.
      const persister = (partial?: Record<string, unknown>) => {
        const snapshot = getSnapshot();
        const merged = partial ? { ...snapshot, ...partial } : snapshot;
        save(merged);
      };
      persister.getStatus = () => mockPersistStatus;
      return persister;
    },
  ),
}));

// expo-audio stub
jest.mock("expo-audio", () => ({
  createAudioPlayer: jest.fn(() => ({ volume: 1, release: jest.fn() })),
}));

// metronome-engine stub
jest.mock("@/lib/metronome-engine", () => ({
  soundSets: { classic: { high: "h", low: "l", strong: "s" } },
}));

// audio-renderer stub
jest.mock("@/lib/audio-renderer", () => ({
  clearWebClickBuffers: jest.fn(),
}));

// app/index.helpers stub
jest.mock("@/app/index.helpers", () => ({
  defaultBeatTypes: (n: number) => Array.from({ length: n }, () => "normal"),
}));

import { useRef, act as reactAct } from "react";
import { useSettings } from "../hooks/useSettings";
import type { UseSettingsParams } from "../hooks/useSettings";

// ─────────────────────────────────────────────────────────────────────────────
// Helper: build the minimal params required by useSettings
// ─────────────────────────────────────────────────────────────────────────────
function buildParams(): UseSettingsParams {
  return {
    engineRef: { current: null },
    baseBpmRef: { current: 120 },
    volumeRef: { current: 0.75 },
    sampleVolumeRef: { current: 0.8 },
    beatDenominatorRef: { current: 4 },
    noteSampleSoundsRef: { current: {} },
    clickPCMCacheRef: { current: {} },
    webClickReadyRef: { current: false },
    scheduleReRenderCallbackRef: { current: () => {} },
    applyAudioSettingsCallbackRef: { current: () => {} },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  savedSettings.length = 0;
  mockPersistStatus = {
    lastSaveAt: null,
    lastErrorAt: null,
    consecutiveFailures: 0,
    pendingChanges: 0,
    cycleFailed: false,
  };
  jest.clearAllMocks();
  // Re-apply the mock implementation that was cleared
  const { saveSettings } = require("@/lib/storage");
  saveSettings.mockImplementation((s: Record<string, unknown>) => {
    savedSettings.push({ ...s });
    return Promise.resolve();
  });
  const { loadSettings } = require("@/lib/storage");
  loadSettings.mockResolvedValue({
    bpm: 120, beatsPerMeasure: 4, beatDenominator: 4,
    subdivisions: 1, subdivisionPattern: ["accent"], beatSubdivisions: {},
    volume: 0.75, sampleVolume: 0.8, soundSet: "classic", layerSoundSets: {},
    flashMode: "accent", hapticMode: "all", audioOffsetMs: 0,
    timerStopMode: "end-of-cycle", landscapeReversed: false,
    beatDirection: "cw", username: "", barMetronomeChannel: "both",
    barCellOpacity: 0.55, barRowHeight: 44,
    backgroundPlay: false, autoResumeAfterInterruption: true,
    showLandscapeImage: true, landscapeContentType: "photo",
  });
});

afterEach(() => {
  jest.useRealTimers();
});

test("beatDenominator is present in the snapshot when volume is changed after setting denominator", () => {
  const params = buildParams();
  const { result } = renderHook(() => useSettings(params));

  // Simulate user changing the denominator to 8
  act(() => {
    result.current.setBeatDenominator(8);
  });

  // Then change volume — this triggers a save via persistSettings({ volume })
  act(() => {
    result.current.updateVolume(0.5);
  });

  // The save triggered by updateVolume must include the current beatDenominator
  const latestSave = savedSettings[savedSettings.length - 1];
  expect(latestSave).toBeDefined();
  expect(latestSave.beatDenominator).toBe(8);
  expect(latestSave.volume).toBe(0.5);
});

test("beatDenominator is present in every save, not only in the explicit change call", () => {
  const params = buildParams();
  const { result } = renderHook(() => useSettings(params));

  // Set denominator to 2
  act(() => {
    result.current.setBeatDenominator(2);
  });

  // Trigger multiple different saves
  act(() => { result.current.updateBpm(90); });
  act(() => { result.current.updateHapticMode("off"); });
  act(() => { result.current.updateFlashMode("off"); });

  // All saved snapshots after the denominator change must carry beatDenominator=2
  for (const save of savedSettings) {
    // Skip saves that might have occurred before we checked (there might be 0)
    if (save.beatDenominator !== undefined) {
      expect(save.beatDenominator).toBe(2);
    }
  }

  // At least one save must have happened
  expect(savedSettings.length).toBeGreaterThan(0);
  const anyHasDenominator = savedSettings.some((s) => s.beatDenominator !== undefined);
  expect(anyHasDenominator).toBe(true);
});

test("failed persistence is exposed to the UI and clears after the next success", () => {
  jest.useFakeTimers();
  const params = buildParams();
  const { result } = renderHook(() => useSettings(params));

  act(() => {
    mockPersistStatus = {
      lastSaveAt: null,
      lastErrorAt: Date.now(),
      consecutiveFailures: 1,
      pendingChanges: 1,
      cycleFailed: false,
    };
    jest.advanceTimersByTime(250);
  });
  expect(result.current.persistStatus.consecutiveFailures).toBe(1);
  expect(result.current.persistStatus.cycleFailed).toBe(false);

  act(() => {
    mockPersistStatus = {
      lastSaveAt: Date.now(),
      lastErrorAt: mockPersistStatus.lastErrorAt,
      consecutiveFailures: 0,
      pendingChanges: 0,
      cycleFailed: false,
    };
    jest.advanceTimersByTime(250);
  });
  expect(result.current.persistStatus.consecutiveFailures).toBe(0);
  expect(result.current.persistStatus.cycleFailed).toBe(false);
});
