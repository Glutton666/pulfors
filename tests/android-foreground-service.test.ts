import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { Platform } from "react-native";
import * as audioModeCache from "../lib/audio-mode-cache";

const mockApplyAudioModeIfChanged = jest.spyOn(audioModeCache, "applyAudioModeIfChanged");
const mockCreateAudioPlayer = jest.fn();
const mockAcquireBackgroundService = jest.fn(async (_token: string) => {});
const mockReleaseBackgroundService = jest.fn(async (_token: string) => {});

jest.mock("../modules/sparse-metronome/src", () => ({
  BackgroundPlaybackService: {
    acquire: (token: string) => mockAcquireBackgroundService(token),
    release: (token: string) => mockReleaseBackgroundService(token),
  },
}));

jest.mock("expo-audio", () => ({
  createAudioPlayer: mockCreateAudioPlayer,
}));

import {
  _foregroundPlaybackDebugState,
  holdForegroundForPausedNotification,
  releasePausedNotificationHold,
  requestForegroundPlayback,
  relinquishForegroundPlayback,
} from "../lib/android-foreground-service";

function createPlayer() {
  return {
    loop: false,
    volume: 1,
    play: jest.fn(),
    pause: jest.fn(),
    release: jest.fn(),
    setActiveForLockScreen: jest.fn(),
  };
}

beforeEach(() => {
  Platform.OS = "android";
  mockApplyAudioModeIfChanged.mockReset().mockResolvedValue(undefined);
  mockCreateAudioPlayer.mockReset().mockImplementation(createPlayer);
  mockAcquireBackgroundService.mockReset().mockResolvedValue(undefined);
  mockReleaseBackgroundService.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  releasePausedNotificationHold();
  for (const owner of _foregroundPlaybackDebugState().owners) {
    relinquishForegroundPlayback(owner);
  }
  Platform.OS = "ios";
});

test("paused notification acquisition is deduped and releases its player and owner", async () => {
  const first = holdForegroundForPausedNotification();
  const second = holdForegroundForPausedNotification();

  await Promise.all([first, second]);

  assert.equal(mockCreateAudioPlayer.mock.calls.length, 1);
  expect(mockAcquireBackgroundService).toHaveBeenCalledTimes(1);
  assert.equal(_foregroundPlaybackDebugState().owners.length, 1);
  assert.match(_foregroundPlaybackDebugState().owners[0], /^paused-notification:/);
  const player = mockCreateAudioPlayer.mock.results[0]?.value;

  releasePausedNotificationHold();

  expect(player.pause).toHaveBeenCalledTimes(1);
  expect(player.release).toHaveBeenCalledTimes(1);
  expect(player.setActiveForLockScreen).not.toHaveBeenCalled();
  expect(mockReleaseBackgroundService).toHaveBeenCalledWith(mockAcquireBackgroundService.mock.calls[0][0]);
  assert.deepEqual(_foregroundPlaybackDebugState().owners, []);
});

test("release cancels a pending acquire and removes its owner before player creation", async () => {
  let finishAudioMode!: () => void;
  mockApplyAudioModeIfChanged.mockImplementation(
    () => new Promise<void>((resolve) => { finishAudioMode = resolve; }),
  );

  const pending = holdForegroundForPausedNotification();
  assert.equal(_foregroundPlaybackDebugState().owners.length, 1);

  releasePausedNotificationHold();
  assert.deepEqual(_foregroundPlaybackDebugState().owners, []);

  finishAudioMode();
  await pending;

  assert.equal(mockCreateAudioPlayer.mock.calls.length, 0);
  assert.equal(_foregroundPlaybackDebugState().isForegroundActive, false);
  assert.deepEqual(_foregroundPlaybackDebugState().owners, []);
});

test("a new acquire after cancellation survives settlement of the old acquire", async () => {
  let finishAudioMode!: () => void;
  mockApplyAudioModeIfChanged.mockImplementationOnce(
    () => new Promise<void>((resolve) => { finishAudioMode = resolve; }),
  );

  const canceled = holdForegroundForPausedNotification();
  releasePausedNotificationHold();
  const current = holdForegroundForPausedNotification();
  assert.equal(_foregroundPlaybackDebugState().owners.length, 1);
  assert.match(_foregroundPlaybackDebugState().owners[0], /^paused-notification:/);
  const currentOwner = _foregroundPlaybackDebugState().owners[0];

  finishAudioMode();
  await Promise.all([canceled, current]);

  assert.equal(mockCreateAudioPlayer.mock.calls.length, 1);
  assert.deepEqual(_foregroundPlaybackDebugState().owners, [currentOwner]);
  assert.equal(_foregroundPlaybackDebugState().isForegroundActive, true);
});

test("releasing the paused hold preserves active foreground owners", async () => {
  await requestForegroundPlayback("active-playback");
  await holdForegroundForPausedNotification();

  releasePausedNotificationHold();

  assert.deepEqual(_foregroundPlaybackDebugState().owners, ["active-playback"]);
  assert.equal(_foregroundPlaybackDebugState().isForegroundActive, true);
  expect(mockAcquireBackgroundService).toHaveBeenCalledTimes(1);
  expect(mockReleaseBackgroundService).not.toHaveBeenCalled();
});

test("a canceled native acquire cannot release a newer foreground hold", async () => {
  let finishOldNative!: () => void;
  mockAcquireBackgroundService.mockImplementationOnce(
    () => new Promise<void>((resolve) => { finishOldNative = resolve; }),
  );
  const old = requestForegroundPlayback("old");
  await Promise.resolve();
  const oldToken = mockAcquireBackgroundService.mock.calls[0][0];
  relinquishForegroundPlayback("old");
  await requestForegroundPlayback("new");
  const newToken = mockAcquireBackgroundService.mock.calls[1][0];
  assert.notEqual(oldToken, newToken);

  finishOldNative();
  await old;
  assert.deepEqual(_foregroundPlaybackDebugState().owners, ["new"]);
  assert.equal(_foregroundPlaybackDebugState().isForegroundActive, true);
  expect(mockReleaseBackgroundService).toHaveBeenCalledWith(oldToken);
  expect(mockReleaseBackgroundService).not.toHaveBeenCalledWith(newToken);
});

test("a missing or failed native service is reported without creating a silent player", async () => {
  mockAcquireBackgroundService.mockRejectedValueOnce(new Error("Rebuild the Android app"));
  await expect(holdForegroundForPausedNotification()).rejects.toThrow("Rebuild the Android app");
  expect(mockCreateAudioPlayer).not.toHaveBeenCalled();
  assert.deepEqual(_foregroundPlaybackDebugState().owners, []);
  assert.equal(_foregroundPlaybackDebugState().isForegroundActive, false);
});