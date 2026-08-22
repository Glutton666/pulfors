import { test } from "node:test";
import assert from "node:assert/strict";
import {
  _resetAudioLifecycleForTests,
  getAudioLifecycleSnapshot,
  markAudioInterrupted,
  markAudioPlaying,
  markAudioPreparing,
  markAudioRecovering,
  markAudioRecoveryFailed,
  markAudioRecoverySucceeded,
  markAudioStopped,
} from "../lib/audio-lifecycle";

test("playback lifecycle reports preparation before active playback", () => {
  _resetAudioLifecycleForTests();
  markAudioPreparing();
  assert.deepEqual(getAudioLifecycleSnapshot(), { phase: "preparing", reason: null });
  markAudioPlaying();
  assert.deepEqual(getAudioLifecycleSnapshot(), { phase: "playing", reason: null });
});

test("interruption recovery preserves a clear interrupted and recovering state", () => {
  _resetAudioLifecycleForTests();
  markAudioPlaying();
  markAudioInterrupted("interruption");
  assert.deepEqual(getAudioLifecycleSnapshot(), { phase: "interrupted", reason: "interruption" });
  markAudioRecovering("interruption");
  assert.deepEqual(getAudioLifecycleSnapshot(), { phase: "recovering", reason: "interruption" });
  markAudioPlaying();
  assert.deepEqual(getAudioLifecycleSnapshot(), { phase: "playing", reason: null });
});

test("an audible tick clears a transient recovery status immediately", () => {
  _resetAudioLifecycleForTests();
  markAudioRecovering("watchdog");
  markAudioRecoverySucceeded();
  assert.deepEqual(getAudioLifecycleSnapshot(), { phase: "playing", reason: null });
});

test("failed recovery remains actionable until a manual retry or stop changes it", () => {
  _resetAudioLifecycleForTests();
  markAudioRecovering("watchdog");
  markAudioRecoveryFailed("watchdog");
  assert.deepEqual(getAudioLifecycleSnapshot(), { phase: "recoveryFailed", reason: "watchdog" });
  markAudioRecovering("watchdog");
  markAudioPreparing(); // a restart must not hide that it is still a recovery attempt
  assert.deepEqual(getAudioLifecycleSnapshot(), { phase: "recovering", reason: "watchdog" });
  markAudioStopped();
  assert.deepEqual(getAudioLifecycleSnapshot(), { phase: "idle", reason: null });
});