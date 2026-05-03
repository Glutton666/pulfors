import { test } from "node:test";
import assert from "node:assert/strict";
import {
  acquireAudioSession,
  releaseAudioSession,
  registerMetronomeBridge,
  withAudioSession,
  _resetAudioSessionForTests,
  _audioSessionDebugState,
} from "../lib/audio-session";

function makeBridge(initial = false) {
  const state = { running: initial, pauseCount: 0, resumeCount: 0 };
  return {
    state,
    bridge: {
      isRunning: () => state.running,
      pause: () => { state.pauseCount++; state.running = false; },
      resume: () => { state.resumeCount++; state.running = true; },
    },
  };
}

test("acquire pauses metronome and release resumes it", async () => {
  _resetAudioSessionForTests();
  const { state, bridge } = makeBridge(true);
  registerMetronomeBridge(bridge);
  await acquireAudioSession("rec", "recording");
  assert.equal(state.pauseCount, 1, "should pause once");
  assert.equal(state.running, false);
  await releaseAudioSession("rec");
  assert.equal(state.resumeCount, 1, "should resume after release");
  assert.equal(state.running, true);
});

test("playback mode does not pause metronome", async () => {
  _resetAudioSessionForTests();
  const { state, bridge } = makeBridge(true);
  registerMetronomeBridge(bridge);
  await acquireAudioSession("p", "playback");
  assert.equal(state.pauseCount, 0);
  await releaseAudioSession("p");
  assert.equal(state.resumeCount, 0);
});

test("only resumes after last caller releases", async () => {
  _resetAudioSessionForTests();
  const { state, bridge } = makeBridge(true);
  registerMetronomeBridge(bridge);
  await acquireAudioSession("a", "recording");
  await acquireAudioSession("b", "mic");
  assert.equal(state.pauseCount, 1, "pause exactly once across multiple acquires");
  await releaseAudioSession("a");
  assert.equal(state.resumeCount, 0, "still has b active, no resume");
  await releaseAudioSession("b");
  assert.equal(state.resumeCount, 1);
});

test("does not pause when metronome already stopped", async () => {
  _resetAudioSessionForTests();
  const { state, bridge } = makeBridge(false);
  registerMetronomeBridge(bridge);
  await acquireAudioSession("rec", "recording");
  assert.equal(state.pauseCount, 0);
  await releaseAudioSession("rec");
  assert.equal(state.resumeCount, 0, "do not auto-start what we did not pause");
});

test("withAudioSession releases on error", async () => {
  _resetAudioSessionForTests();
  const { state, bridge } = makeBridge(true);
  registerMetronomeBridge(bridge);
  await assert.rejects(async () => {
    await withAudioSession("err", "recording", async () => {
      throw new Error("boom");
    });
  }, /boom/);
  const dbg = _audioSessionDebugState();
  assert.equal(dbg.activeCallers.length, 0, "caller cleared even on error");
  assert.equal(state.resumeCount, 1, "metronome resumed after error");
});

test("release of unknown caller still restores state when empty", async () => {
  _resetAudioSessionForTests();
  const { state, bridge } = makeBridge(true);
  registerMetronomeBridge(bridge);
  await releaseAudioSession("ghost");
  assert.equal(state.pauseCount, 0);
  assert.equal(state.resumeCount, 0);
});

test("does not auto-resume if user manually started metronome inside modal", async () => {
  _resetAudioSessionForTests();
  const { state, bridge } = makeBridge(true);
  registerMetronomeBridge(bridge);
  await acquireAudioSession("rec", "recording");
  assert.equal(state.pauseCount, 1);
  // 사용자가 모달 안에서 다시 재생을 켰다가 직접 멈췄다고 가정.
  state.running = true;
  await releaseAudioSession("rec");
  // 사용자가 켠 상태이므로 우리가 다시 toggle해서는 안 된다.
  assert.equal(state.resumeCount, 0);
  assert.equal(state.running, true);
});

test("withAudioSession with sync throw still releases", async () => {
  _resetAudioSessionForTests();
  const { state, bridge } = makeBridge(true);
  registerMetronomeBridge(bridge);
  await assert.rejects(async () => {
    await withAudioSession("syncErr", "mic", async () => {
      throw new TypeError("sync fail");
    });
  }, /sync fail/);
  const dbg = _audioSessionDebugState();
  assert.equal(dbg.activeCallers.length, 0);
  assert.equal(state.resumeCount, 1);
});

test("manual acquire/release pairs in modal failure path", async () => {
  // 모달이 acquire 후 prepareToRecord에서 실패하고 catch에서 release하는 시나리오.
  _resetAudioSessionForTests();
  const { state, bridge } = makeBridge(true);
  registerMetronomeBridge(bridge);
  await acquireAudioSession("recFail", "recording");
  // prepareToRecord 실패 시뮬레이션 (catch 경로에서 release 호출).
  await releaseAudioSession("recFail");
  assert.equal(state.resumeCount, 1, "auto-resume after failure recovery");
  assert.equal(_audioSessionDebugState().activeCallers.length, 0);
});

test("double release does not double-resume", async () => {
  _resetAudioSessionForTests();
  const { state, bridge } = makeBridge(true);
  registerMetronomeBridge(bridge);
  await acquireAudioSession("x", "recording");
  await releaseAudioSession("x");
  await releaseAudioSession("x");
  assert.equal(state.resumeCount, 1);
});
