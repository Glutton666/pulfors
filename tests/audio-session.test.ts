import { test } from "node:test";
import assert from "node:assert/strict";
import {
  acquireAudioSession,
  releaseAudioSession,
  registerMetronomeBridge,
  withAudioSession,
  notifyUserMetronomeToggle,
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

test("user restarts metronome inside modal then stops manually before release", async () => {
  // 모달 열림 → acquire(=pause) → 사용자가 모달 안에서 메트로놈을 다시 켰다가
  // 직접 끔. notifyUserMetronomeToggle로 사용자 의도를 신호하면 release 시점에
  // 자동 resume을 건너뛴다.
  _resetAudioSessionForTests();
  const { state, bridge } = makeBridge(true);
  registerMetronomeBridge(bridge);
  await acquireAudioSession("rec", "recording");
  assert.equal(state.running, false, "paused by acquire");
  // 사용자가 모달 안에서 직접 메트로놈을 켰다가 다시 끈 시나리오.
  notifyUserMetronomeToggle();
  state.running = true; state.resumeCount++;
  notifyUserMetronomeToggle();
  state.running = false; state.pauseCount++;
  const resumeBefore = state.resumeCount;
  await releaseAudioSession("rec");
  assert.equal(state.resumeCount, resumeBefore, "should not auto-resume because user stopped manually");
  assert.equal(state.running, false);
});

test("integration: bridge pause/resume via app-style toggle does not mark user toggle", async () => {
  // app/index.tsx의 togglePlayPause 경로를 모사: bridge.pause/resume가
  // togglePlayPauseRef를 호출하고 그 핸들러는 notifyUserMetronomeToggle을 부른다.
  // audio-session이 자체적으로 bridge.pause를 호출했을 때 사용자 토글로 오인하지
  // 않아야 release 시점에 자동 resume이 일어난다.
  _resetAudioSessionForTests();
  const state = { running: true, pauseCount: 0, resumeCount: 0 };
  const userToggle = () => {
    notifyUserMetronomeToggle();
    if (state.running) { state.running = false; state.pauseCount++; }
    else { state.running = true; state.resumeCount++; }
  };
  registerMetronomeBridge({
    isRunning: () => state.running,
    pause: () => { if (state.running) userToggle(); },
    resume: () => { if (!state.running) userToggle(); },
  });
  await acquireAudioSession("rec", "recording");
  assert.equal(state.running, false, "bridge pause invoked through user-toggle path");
  assert.equal(state.pauseCount, 1);
  await releaseAudioSession("rec");
  assert.equal(state.running, true, "auto-resume must fire even though bridge path ran user toggle");
  assert.equal(state.resumeCount, 1);
});

test("signal generator: native mic → android webview fallback transition", async () => {
  // iOS 네이티브 마이크가 실패하여 Android WebView 폴백으로 전환되는 시나리오:
  // signalGenMicMobile release → signalGenMicAndroid acquire가 연속해서 일어날 때
  // pause/resume이 중복 발생하지 않고 메트로놈 상태가 일관되어야 한다.
  _resetAudioSessionForTests();
  const { state, bridge } = makeBridge(true);
  registerMetronomeBridge(bridge);
  await acquireAudioSession("signalGenMicMobile", "mic");
  assert.equal(state.pauseCount, 1, "first acquire pauses metronome once");
  // 폴백: 새 caller acquire가 release보다 먼저 일어난다 (overlap).
  await acquireAudioSession("signalGenMicAndroid", "mic");
  assert.equal(state.pauseCount, 1, "no extra pause while still active");
  await releaseAudioSession("signalGenMicMobile");
  assert.equal(state.resumeCount, 0, "must not resume while android caller still active");
  await releaseAudioSession("signalGenMicAndroid");
  assert.equal(state.resumeCount, 1, "resume only after final caller releases");
  assert.equal(_audioSessionDebugState().activeCallers.length, 0);
});

test("notifyUserMetronomeToggle outside session is a no-op", async () => {
  _resetAudioSessionForTests();
  const { state, bridge } = makeBridge(true);
  registerMetronomeBridge(bridge);
  // 활성 caller 없을 때 사용자 토글 신호는 무시되어야 한다.
  notifyUserMetronomeToggle();
  await acquireAudioSession("rec", "recording");
  await releaseAudioSession("rec");
  assert.equal(state.resumeCount, 1, "auto-resume normally when no user toggle inside session");
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
