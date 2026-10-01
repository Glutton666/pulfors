import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { Platform } from "react-native";
import * as audioModeCache from "../lib/audio-mode-cache";

const mockApplyAudioModeIfChanged = jest.spyOn(audioModeCache, "applyAudioModeIfChanged");
const mockCreateAudioPlayer = jest.fn();

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
  };
}

beforeEach(() => {
  Platform.OS = "android";
  mockApplyAudioModeIfChanged.mockReset().mockResolvedValue(undefined);
  mockCreateAudioPlayer.mockReset().mockImplementation(createPlayer);
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
  assert.equal(_foregroundPlaybackDebugState().owners.length, 1);
  assert.match(_foregroundPlaybackDebugState().owners[0], /^paused-notification:/);
  const player = mockCreateAudioPlayer.mock.results[0]?.value;

  releasePausedNotificationHold();

  expect(player.pause).toHaveBeenCalledTimes(1);
  expect(player.release).toHaveBeenCalledTimes(1);
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
});