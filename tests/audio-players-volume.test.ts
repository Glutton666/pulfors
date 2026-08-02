/**
 * @jest-environment jsdom
 *
 * Tests for useAudioPlayers.setPoolsVolume:
 *  1. Volume change updates all players in an already-created pool.
 *  2. A pool created lazily AFTER the volume change inherits the new volume.
 *  3. Out-of-range values are clamped to [0, 1].
 */

import { renderHook, act } from "@testing-library/react";

// ── expo-audio stub ──────────────────────────────────────────────────────────
// Variable name must start with "mock" to be accessible inside jest.mock factories.
function mockMakePlayer() {
  return { volume: 1, loop: false, remove: jest.fn() };
}
jest.mock("expo-audio", () => ({
  createAudioPlayer: jest.fn(() => mockMakePlayer()),
}));

// ── soundSets stub ───────────────────────────────────────────────────────────
jest.mock("@/lib/metronome-engine", () => ({
  soundSets: {
    classic:   { high: "h1", low: "l1", strong: "s1" },
    woodblock: { high: "h2", low: "l2", strong: "s2" },
  },
}));

import { useAudioPlayers } from "../hooks/useAudioPlayers";

// ── helper ───────────────────────────────────────────────────────────────────
function poolVolumes(allPlayersRef: React.MutableRefObject<any>, key: string): number[] {
  const pool = allPlayersRef.current[key];
  if (!pool) return [];
  return [
    pool.highA.volume, pool.highB.volume, pool.highC.volume, pool.highD.volume,
    pool.lowA.volume,  pool.lowB.volume,  pool.lowC.volume,  pool.lowD.volume,
    pool.strongA.volume, pool.strongB.volume, pool.strongC.volume, pool.strongD.volume,
  ];
}

// ────────────────────────────────────────────────────────────────────────────

describe("useAudioPlayers — setPoolsVolume", () => {
  beforeEach(() => {
    const { createAudioPlayer } = require("expo-audio") as { createAudioPlayer: jest.Mock };
    createAudioPlayer.mockImplementation(() => mockMakePlayer());
  });

  it("updates all 12 players in an already-created pool", () => {
    const { result } = renderHook(() => useAudioPlayers("classic"));

    // Trigger lazy creation of the "classic" pool.
    act(() => { void result.current.allPlayersRef.current["classic"]; });
    expect(poolVolumes(result.current.allPlayersRef, "classic")).toHaveLength(12);

    act(() => { result.current.setPoolsVolume(0.4); });

    expect(poolVolumes(result.current.allPlayersRef, "classic").every(v => v === 0.4)).toBe(true);
  });

  it("a pool created AFTER setPoolsVolume inherits the stored volume", () => {
    const { result } = renderHook(() => useAudioPlayers("classic"));

    // Set volume before "woodblock" pool exists.
    act(() => { result.current.setPoolsVolume(0.25); });

    // Lazily create "woodblock" pool.
    act(() => { void result.current.allPlayersRef.current["woodblock"]; });

    expect(poolVolumes(result.current.allPlayersRef, "woodblock").every(v => v === 0.25)).toBe(true);
  });

  it("clamps over-drive values to 1 and negative values to 0", () => {
    const { result } = renderHook(() => useAudioPlayers("classic"));
    act(() => { void result.current.allPlayersRef.current["classic"]; });

    act(() => { result.current.setPoolsVolume(1.8); });
    expect(poolVolumes(result.current.allPlayersRef, "classic").every(v => v === 1)).toBe(true);

    act(() => { result.current.setPoolsVolume(-0.5); });
    expect(poolVolumes(result.current.allPlayersRef, "classic").every(v => v === 0)).toBe(true);
  });
});
