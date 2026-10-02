/**
 * @jest-environment jsdom
 */
/* eslint-disable import/first */

import { Platform } from "react-native";

const mockEnsureBackgroundPlaybackAudioMode = jest.fn(async () => {});
const mockIsBackgroundPlaybackEnabled = jest.fn(() => true);
const mockRequestForegroundPlayback = jest.fn(async (_owner?: string) => {});
const mockRelinquishForegroundPlayback = jest.fn((_owner?: string) => {});
const createdPlayers: Array<{
  loop: boolean;
  volume: number;
  play: jest.Mock;
  pause: jest.Mock;
  release: jest.Mock;
  setActiveForLockScreen: jest.Mock;
  clearLockScreenControls: jest.Mock;
  addListener: jest.Mock;
  emitStatus: (playing: boolean) => void;
}> = [];

jest.mock("@/lib/audio-session", () => ({
  ensureBackgroundPlaybackAudioMode: () => mockEnsureBackgroundPlaybackAudioMode(),
  isBackgroundPlaybackEnabled: () => mockIsBackgroundPlaybackEnabled(),
}));

jest.mock("@/lib/android-foreground-service", () => ({
  requestForegroundPlayback: (owner: string) => mockRequestForegroundPlayback(owner),
  relinquishForegroundPlayback: (owner: string) => mockRelinquishForegroundPlayback(owner),
}));

jest.mock("expo-audio", () => ({
  createAudioPlayer: () => {
    let statusListener: ((status: { playing: boolean }) => void) | null = null;
    const player = {
      loop: false,
      volume: 1,
      play: jest.fn(),
      pause: jest.fn(),
      release: jest.fn(),
      setActiveForLockScreen: jest.fn(),
      clearLockScreenControls: jest.fn(),
      addListener: jest.fn((_event: string, listener: (status: { playing: boolean }) => void) => {
        statusListener = listener;
        return { remove: jest.fn() };
      }),
      emitStatus: (playing: boolean) => statusListener?.({ playing }),
    };
    createdPlayers.push(player);
    return player;
  },
}));

import {
  _backgroundPlaybackLeaseDebugState,
  _resetBackgroundPlaybackLeaseForTests,
  beginBackgroundPlaybackLease,
  endBackgroundPlaybackLease,
  releaseDormantBackgroundPlaybackControls,
} from "@/lib/background-playback-lease";

describe("background playback lease", () => {
  beforeEach(() => {
    (Platform as unknown as { OS: string }).OS = "ios";
    jest.clearAllMocks();
    createdPlayers.length = 0;
    mockIsBackgroundPlaybackEnabled.mockReturnValue(true);
    mockEnsureBackgroundPlaybackAudioMode.mockResolvedValue(undefined);
    _resetBackgroundPlaybackLeaseForTests();
    jest.clearAllMocks();
  });

  it("shares one continuous silent player until the last owner releases", async () => {
    const first = beginBackgroundPlaybackLease();
    const second = beginBackgroundPlaybackLease();

    await expect(first.ready).resolves.toBe(true);
    await expect(second.ready).resolves.toBe(true);
    expect(createdPlayers).toHaveLength(1);
    expect(createdPlayers[0].loop).toBe(true);
    expect(createdPlayers[0].volume).toBe(0);
    expect(createdPlayers[0].play).toHaveBeenCalledTimes(1);

    endBackgroundPlaybackLease(first.token);
    expect(createdPlayers[0].pause).not.toHaveBeenCalled();
    endBackgroundPlaybackLease(second.token);
    expect(createdPlayers[0].pause).toHaveBeenCalledTimes(1);
    expect(createdPlayers[0].release).toHaveBeenCalledTimes(1);
    expect(_backgroundPlaybackLeaseDebugState().ownerCount).toBe(0);
  });

  it("does not resurrect playback when the owner releases during activation", async () => {
    let finishMode!: () => void;
    mockEnsureBackgroundPlaybackAudioMode.mockImplementationOnce(
      () => new Promise<void>((resolve) => { finishMode = resolve; }),
    );
    const lease = beginBackgroundPlaybackLease();
    endBackgroundPlaybackLease(lease.token);
    finishMode();

    await expect(lease.ready).resolves.toBe(false);
    expect(createdPlayers).toHaveLength(0);
    expect(_backgroundPlaybackLeaseDebugState().hasKeepalivePlayer).toBe(false);
  });

  it("keeps Android foreground ownership for the full lease", async () => {
    (Platform as unknown as { OS: string }).OS = "android";
    const lease = beginBackgroundPlaybackLease();
    await lease.ready;

    expect(mockRequestForegroundPlayback).toHaveBeenCalledWith("active-playback");
    expect(createdPlayers[0].setActiveForLockScreen).not.toHaveBeenCalled();
    expect(createdPlayers[0].loop).toBe(true);
    expect(createdPlayers[0].volume).toBe(0);
    endBackgroundPlaybackLease(lease.token);
    expect(createdPlayers[0].clearLockScreenControls).toHaveBeenCalledTimes(1);
    expect(mockRelinquishForegroundPlayback).toHaveBeenCalledWith("active-playback");
  });

  it("does not expose a MediaSession or interpret silent-player status as transport commands", async () => {
    (Platform as unknown as { OS: string }).OS = "android";
    let playing = true;
    let lease: ReturnType<typeof beginBackgroundPlaybackLease>;
    const controls = {
      isPlaying: () => playing,
      pause: jest.fn(() => {
        playing = false;
        endBackgroundPlaybackLease(lease.token);
      }),
      resume: jest.fn(() => {
        playing = true;
        lease = beginBackgroundPlaybackLease(controls);
      }),
    };
    lease = beginBackgroundPlaybackLease(controls);
    await lease.ready;

    expect(createdPlayers[0].setActiveForLockScreen).not.toHaveBeenCalled();
    expect(createdPlayers[0].addListener).not.toHaveBeenCalled();
    createdPlayers[0].emitStatus(false);
    expect(controls.pause).not.toHaveBeenCalled();
    expect(_backgroundPlaybackLeaseDebugState().ownerCount).toBe(1);
    expect(_backgroundPlaybackLeaseDebugState().hasKeepalivePlayer).toBe(true);

    createdPlayers[0].emitStatus(true);
    expect(controls.resume).not.toHaveBeenCalled();
    expect(_backgroundPlaybackLeaseDebugState().ownerCount).toBe(1);
    endBackgroundPlaybackLease(lease.token);
    jest.restoreAllMocks();
  });

  it("releases the silent helper and ordinary service on pause without retaining a media session", async () => {
    (Platform as unknown as { OS: string }).OS = "android";
    let playing = true;
    let lease: ReturnType<typeof beginBackgroundPlaybackLease>;
    const controls = {
      isPlaying: () => playing,
      pause: jest.fn(() => {
        playing = false;
        endBackgroundPlaybackLease(lease.token);
      }),
      resume: jest.fn(() => { playing = true; }),
    };
    lease = beginBackgroundPlaybackLease(controls);
    await lease.ready;
    controls.pause();
    expect(_backgroundPlaybackLeaseDebugState()).toEqual({
      ownerCount: 0,
      hasKeepalivePlayer: false,
      activationPending: false,
    });

    releaseDormantBackgroundPlaybackControls();

    expect(createdPlayers[0].clearLockScreenControls).toHaveBeenCalledTimes(1);
    expect(createdPlayers[0].pause).toHaveBeenCalledTimes(1);
    expect(createdPlayers[0].release).toHaveBeenCalledTimes(1);
    expect(mockRelinquishForegroundPlayback).toHaveBeenCalledWith("active-playback");
    expect(_backgroundPlaybackLeaseDebugState().hasKeepalivePlayer).toBe(false);
    jest.restoreAllMocks();
  });

  it("preserves an independent active owner during sparse handoff cleanup", async () => {
    (Platform as unknown as { OS: string }).OS = "android";
    let playing = true;
    let pausedLease: ReturnType<typeof beginBackgroundPlaybackLease>;
    const controls = {
      isPlaying: () => playing,
      pause: jest.fn(() => {
        playing = false;
        endBackgroundPlaybackLease(pausedLease.token);
      }),
      resume: jest.fn(() => { playing = true; }),
    };
    pausedLease = beginBackgroundPlaybackLease(controls);
    await pausedLease.ready;
    const independentLease = beginBackgroundPlaybackLease();
    await expect(independentLease.ready).resolves.toBe(true);
    controls.pause();
    expect(_backgroundPlaybackLeaseDebugState().ownerCount).toBe(1);
    releaseDormantBackgroundPlaybackControls();

    expect(_backgroundPlaybackLeaseDebugState().ownerCount).toBe(1);
    expect(_backgroundPlaybackLeaseDebugState().hasKeepalivePlayer).toBe(true);
    expect(createdPlayers[0].clearLockScreenControls).not.toHaveBeenCalled();
    expect(createdPlayers[0].release).not.toHaveBeenCalled();

    endBackgroundPlaybackLease(independentLease.token);
    expect(createdPlayers[0].clearLockScreenControls).toHaveBeenCalledTimes(1);
    expect(createdPlayers[0].release).toHaveBeenCalledTimes(1);
    jest.restoreAllMocks();
  });

  it("ignores silent-player status changes without toggling audible playback", async () => {
    (Platform as unknown as { OS: string }).OS = "android";
    let playing = true;
    let lease: ReturnType<typeof beginBackgroundPlaybackLease>;
    const controls = {
      isPlaying: () => playing,
      pause: jest.fn(() => { playing = false; }),
      resume: jest.fn(() => { playing = true; }),
    };
    lease = beginBackgroundPlaybackLease(controls);
    await lease.ready;

    createdPlayers[0].emitStatus(false);
    expect(controls.pause).not.toHaveBeenCalled();
    createdPlayers[0].emitStatus(true);
    expect(controls.resume).not.toHaveBeenCalled();

    endBackgroundPlaybackLease(lease.token);
  });

  it("starts a fresh activation after an immediate stop and restart", async () => {
    let finishFirstMode!: () => void;
    mockEnsureBackgroundPlaybackAudioMode.mockImplementationOnce(
      () => new Promise<void>((resolve) => { finishFirstMode = resolve; }),
    );
    const first = beginBackgroundPlaybackLease();
    endBackgroundPlaybackLease(first.token);
    const second = beginBackgroundPlaybackLease();

    finishFirstMode();
    await expect(first.ready).resolves.toBe(false);
    await expect(second.ready).resolves.toBe(true);
    expect(createdPlayers).toHaveLength(1);
    expect(_backgroundPlaybackLeaseDebugState().ownerCount).toBe(1);
    expect(_backgroundPlaybackLeaseDebugState().hasKeepalivePlayer).toBe(true);
    endBackgroundPlaybackLease(second.token);
  });

  it("does nothing when background playback is disabled", async () => {
    mockIsBackgroundPlaybackEnabled.mockReturnValue(false);
    const lease = beginBackgroundPlaybackLease();

    expect(lease.token).toBeNull();
    await expect(lease.ready).resolves.toBe(false);
    expect(createdPlayers).toHaveLength(0);
  });
});