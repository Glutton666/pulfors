import { test } from "node:test";
import assert from "node:assert/strict";
import {
  acquireAudioSession,
  releaseAudioSession,
  registerMetronomeBridge,
  registerSupplementalPlaybackInterruptionHandler,
  withAudioSession,
  notifyUserMetronomeToggle,
  notifyInterruptionBegin,
  notifyInterruptionEnd,
  setAutoResumeAfterInterruption,
  _resetAudioSessionForTests,
  _audioSessionDebugState,
} from "../lib/audio-session";
import { getAudioLifecycleSnapshot } from "../lib/audio-lifecycle";

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

test("acquire configures a recording session without pausing metronome", async () => {
  _resetAudioSessionForTests();
  const { state, bridge } = makeBridge(true);
  registerMetronomeBridge(bridge);
  await acquireAudioSession("rec", "recording");
  assert.equal(state.pauseCount, 0, "recording session should keep monitoring playback running");
  assert.equal(state.running, true);
  await releaseAudioSession("rec");
  assert.equal(state.resumeCount, 0, "release should not resume output it never paused");
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

test("multiple audio-session callers are tracked until the last release", async () => {
  _resetAudioSessionForTests();
  const { state, bridge } = makeBridge(true);
  registerMetronomeBridge(bridge);
  await acquireAudioSession("a", "recording");
  await acquireAudioSession("b", "mic");
  assert.equal(state.pauseCount, 0, "session acquisition does not pause monitoring");
  assert.equal(_audioSessionDebugState().activeCallers.length, 2);
  await releaseAudioSession("a");
  assert.equal(state.resumeCount, 0, "releasing one caller must not affect playback");
  await releaseAudioSession("b");
  assert.equal(state.resumeCount, 0, "final release must not resume output it never paused");
  assert.equal(state.running, true);
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
  assert.equal(state.resumeCount, 0, "session cleanup must not resume output it never paused");
});

test("release of unknown caller still restores state when empty", async () => {
  _resetAudioSessionForTests();
  const { state, bridge } = makeBridge(true);
  registerMetronomeBridge(bridge);
  await releaseAudioSession("ghost");
  assert.equal(state.pauseCount, 0);
  assert.equal(state.resumeCount, 0);
});

test("session release preserves playback when the user keeps it running", async () => {
  _resetAudioSessionForTests();
  const { state, bridge } = makeBridge(true);
  registerMetronomeBridge(bridge);
  await acquireAudioSession("rec", "recording");
  assert.equal(state.pauseCount, 0);
  await releaseAudioSession("rec");
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
  assert.equal(state.resumeCount, 0);
});

test("user toggle intent is tracked while an audio session is active", async () => {
  _resetAudioSessionForTests();
  const { state, bridge } = makeBridge(true);
  registerMetronomeBridge(bridge);
  await acquireAudioSession("rec", "recording");
  notifyUserMetronomeToggle();
  await releaseAudioSession("rec");
  assert.equal(state.pauseCount, 0);
  assert.equal(state.resumeCount, 0);
  assert.equal(state.running, true);
});

test("audio-session acquisition does not invoke the app toggle bridge", async () => {
  _resetAudioSessionForTests();
  const state = { running: true, pauseCount: 0, resumeCount: 0 };
  registerMetronomeBridge({
    isRunning: () => state.running,
    pause: () => { state.running = false; state.pauseCount++; },
    resume: () => { state.running = true; state.resumeCount++; },
  });
  await acquireAudioSession("rec", "recording");
  await releaseAudioSession("rec");
  assert.equal(state.running, true);
  assert.equal(state.pauseCount, 0);
  assert.equal(state.resumeCount, 0);
});

test("close modal immediately after acquire leaves no leaked caller", async () => {
  // 모달이 열리자마자 사용자가 닫는 race: acquire 직후 release가 거의 동시에
  // 호출되어도 active caller가 남지 않고 메트로놈 상태가 정확히 복귀해야 한다.
  _resetAudioSessionForTests();
  const { state, bridge } = makeBridge(true);
  registerMetronomeBridge(bridge);
  const acq = acquireAudioSession("raceModal", "mic");
  const rel = releaseAudioSession("raceModal");
  await Promise.all([acq, rel]);
  assert.equal(_audioSessionDebugState().activeCallers.length, 0);
  assert.equal(state.pauseCount, 0);
  assert.equal(state.resumeCount, 0);
});

test("note recorder: start failure after prepare releases session", async () => {
  // prepareRecording이 acquire 후 startRecording의 record()가 실패하는 시나리오:
  // catch에서 releaseAudioSession을 호출해 active caller가 남지 않아야 한다.
  _resetAudioSessionForTests();
  const { state, bridge } = makeBridge(true);
  registerMetronomeBridge(bridge);
  // prepare 단계에서 acquire 성공.
  await acquireAudioSession("noteRecorderModal", "recording");
  assert.equal(state.pauseCount, 0);
  // record() 실패 → catch에서 release 호출 (NoteRecorderModal.startRecording 패턴).
  await releaseAudioSession("noteRecorderModal");
  assert.equal(_audioSessionDebugState().activeCallers.length, 0);
  assert.equal(state.resumeCount, 0, "session cleanup must not resume output it never paused");
});

test("signal generator: native mic → android webview fallback transition", async () => {
  // iOS 네이티브 마이크가 실패하여 Android WebView 폴백으로 전환되는 시나리오:
  // signalGenMicMobile release → signalGenMicAndroid acquire가 연속해서 일어날 때
  // pause/resume이 중복 발생하지 않고 메트로놈 상태가 일관되어야 한다.
  _resetAudioSessionForTests();
  const { state, bridge } = makeBridge(true);
  registerMetronomeBridge(bridge);
  await acquireAudioSession("signalGenMicMobile", "mic");
  assert.equal(state.pauseCount, 0, "first acquire keeps metronome monitoring");
  // 폴백: 새 caller acquire가 release보다 먼저 일어난다 (overlap).
  await acquireAudioSession("signalGenMicAndroid", "mic");
  assert.equal(state.pauseCount, 0, "no pause while callers overlap");
  await releaseAudioSession("signalGenMicMobile");
  assert.equal(state.resumeCount, 0, "must not resume while android caller still active");
  await releaseAudioSession("signalGenMicAndroid");
  assert.equal(state.resumeCount, 0, "final release does not resume output it never paused");
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
  assert.equal(state.resumeCount, 0, "session release does not auto-resume output it never paused");
});

test("manual acquire/release pairs in modal failure path", async () => {
  // 모달이 acquire 후 prepareToRecord에서 실패하고 catch에서 release하는 시나리오.
  _resetAudioSessionForTests();
  const { state, bridge } = makeBridge(true);
  registerMetronomeBridge(bridge);
  await acquireAudioSession("recFail", "recording");
  // prepareToRecord 실패 시뮬레이션 (catch 경로에서 release 호출).
  await releaseAudioSession("recFail");
  assert.equal(state.resumeCount, 0, "failure cleanup does not resume output it never paused");
  assert.equal(_audioSessionDebugState().activeCallers.length, 0);
});

test("double release does not double-resume", async () => {
  _resetAudioSessionForTests();
  const { state, bridge } = makeBridge(true);
  registerMetronomeBridge(bridge);
  await acquireAudioSession("x", "recording");
  await releaseAudioSession("x");
  await releaseAudioSession("x");
  assert.equal(state.resumeCount, 0);
});

test("interruption begin pauses metronome and end resumes it", async () => {
  _resetAudioSessionForTests();
  const { state, bridge } = makeBridge(true);
  registerMetronomeBridge(bridge);
  notifyInterruptionBegin();
  assert.equal(state.pauseCount, 1, "interruption begin pauses running metronome");
  assert.equal(state.running, false);
  notifyInterruptionEnd();
  assert.equal(state.resumeCount, 1, "interruption end resumes when no user toggle");
  assert.equal(state.running, true);
  await Promise.resolve();
  assert.deepEqual(getAudioLifecycleSnapshot(), { phase: "playing", reason: null });
});

test("interruption pauses and resumes supplemental score playback", () => {
  _resetAudioSessionForTests();
  let running = true;
  let pauses = 0;
  let finishes: boolean[] = [];
  registerSupplementalPlaybackInterruptionHandler({
    isRunning: () => running,
    pauseForInterruption: () => {
      pauses += 1;
      running = false;
    },
    finishInterruption: (shouldResume) => {
      finishes.push(shouldResume);
      running = shouldResume;
    },
  });

  notifyInterruptionBegin();
  assert.equal(pauses, 1);
  assert.equal(running, false);
  assert.deepEqual(getAudioLifecycleSnapshot(), { phase: "interrupted", reason: "interruption" });
  notifyInterruptionEnd();
  assert.deepEqual(finishes, [true]);
  assert.equal(running, true);
  assert.deepEqual(getAudioLifecycleSnapshot(), { phase: "playing", reason: null });
});

test("score-only interruption does not start an idle metronome bridge", () => {
  _resetAudioSessionForTests();
  const { state, bridge } = makeBridge(false);
  registerMetronomeBridge(bridge);
  let scoreRunning = true;
  registerSupplementalPlaybackInterruptionHandler({
    isRunning: () => scoreRunning,
    pauseForInterruption: () => { scoreRunning = false; },
    finishInterruption: (shouldResume) => { scoreRunning = shouldResume; },
  });

  notifyInterruptionBegin();
  notifyInterruptionEnd();

  assert.equal(scoreRunning, true);
  assert.equal(state.resumeCount, 0, "Score recovery must not start the idle metronome");
  assert.equal(state.running, false);
});

test("disabled interruption auto-resume leaves supplemental playback paused", () => {
  _resetAudioSessionForTests();
  let running = true;
  const finishes: boolean[] = [];
  registerSupplementalPlaybackInterruptionHandler({
    isRunning: () => running,
    pauseForInterruption: () => { running = false; },
    finishInterruption: (shouldResume) => {
      finishes.push(shouldResume);
      running = shouldResume;
    },
  });
  setAutoResumeAfterInterruption(false);

  notifyInterruptionBegin();
  notifyInterruptionEnd();
  assert.deepEqual(finishes, [false]);
  assert.equal(running, false);
  assert.deepEqual(getAudioLifecycleSnapshot(), { phase: "idle", reason: null });
});

test("interruption begin is idempotent", async () => {
  _resetAudioSessionForTests();
  const { state, bridge } = makeBridge(true);
  registerMetronomeBridge(bridge);
  notifyInterruptionBegin();
  notifyInterruptionBegin();
  notifyInterruptionBegin();
  assert.equal(state.pauseCount, 1, "only one pause across repeated begins");
  notifyInterruptionEnd();
  assert.equal(state.resumeCount, 1);
});

test("interruption end without begin is a no-op", async () => {
  _resetAudioSessionForTests();
  const { state, bridge } = makeBridge(true);
  registerMetronomeBridge(bridge);
  notifyInterruptionEnd();
  assert.equal(state.pauseCount, 0);
  assert.equal(state.resumeCount, 0);
  assert.equal(state.running, true);
});

test("interruption does nothing when metronome already stopped", async () => {
  _resetAudioSessionForTests();
  const { state, bridge } = makeBridge(false);
  registerMetronomeBridge(bridge);
  notifyInterruptionBegin();
  assert.equal(state.pauseCount, 0, "nothing to pause");
  notifyInterruptionEnd();
  assert.equal(state.resumeCount, 0, "do not auto-start what we did not pause");
  assert.equal(state.running, false);
});

test("user manual stop during interruption suppresses auto-resume", async () => {
  _resetAudioSessionForTests();
  const { state, bridge } = makeBridge(true);
  registerMetronomeBridge(bridge);
  notifyInterruptionBegin();
  assert.equal(state.running, false);
  // 사용자가 인터럽션 중(예: 화면이 잠시 돌아왔을 때) 직접 멈춤을 신호.
  notifyUserMetronomeToggle();
  notifyInterruptionEnd();
  assert.equal(state.resumeCount, 0, "user intent honored, no auto-resume");
  assert.equal(state.running, false);
});

test("interruption while modal is active: modal release does not resume mid-interruption", async () => {
  _resetAudioSessionForTests();
  const { state, bridge } = makeBridge(true);
  registerMetronomeBridge(bridge);
  await acquireAudioSession("rec", "recording");
  assert.equal(state.pauseCount, 0, "modal acquisition keeps monitoring playback running");
  // 모달 사용 중에 전화가 옴.
  notifyInterruptionBegin();
  // 인터럽션이 실제로 재생 중인 메트로놈을 멈춘다.
  assert.equal(state.pauseCount, 1);
  // 사용자가 모달을 닫음 (전화 통화는 진행 중).
  await releaseAudioSession("rec");
  assert.equal(state.resumeCount, 0, "must not resume while interruption still active");
  // 통화 종료.
  notifyInterruptionEnd();
  assert.equal(state.resumeCount, 1, "resume after interruption ends");
  assert.equal(state.running, true);
});

test("modal acquired during interruption: only resumes once after both clear", async () => {
  _resetAudioSessionForTests();
  const { state, bridge } = makeBridge(true);
  registerMetronomeBridge(bridge);
  notifyInterruptionBegin();
  assert.equal(state.pauseCount, 1);
  // 사용자가 통화 중에 모달을 엶 (드물지만 가능).
  await acquireAudioSession("rec", "recording");
  // 이미 멈춰있으므로 모달은 추가로 pause하지 않는다.
  assert.equal(state.pauseCount, 1);
  // 통화 먼저 종료.
  notifyInterruptionEnd();
  // 모달이 아직 열려있으므로 재개하면 안 된다.
  assert.equal(state.resumeCount, 0);
  await releaseAudioSession("rec");
  assert.equal(state.resumeCount, 1, "resume only after both clear");
});

test("interruption begin before bridge is registered is a no-op", async () => {
  _resetAudioSessionForTests();
  // bridge 등록 전에 들어온 인터럽션은 우리가 제어할 게 없으므로 추적하지
  // 않는다. 나중에 bridge가 등록되고 end가 호출돼도 잘못된 자동 재개를
  // 시도하지 않아야 한다.
  notifyInterruptionBegin();
  const { state, bridge } = makeBridge(false);
  registerMetronomeBridge(bridge);
  notifyInterruptionEnd();
  assert.equal(state.pauseCount, 0);
  assert.equal(state.resumeCount, 0);
  assert.equal(state.running, false);
});

test("autoResumeAfterInterruption=false skips resume on interruption end", async () => {
  _resetAudioSessionForTests();
  const { state, bridge } = makeBridge(true);
  registerMetronomeBridge(bridge);
  setAutoResumeAfterInterruption(false);
  notifyInterruptionBegin();
  assert.equal(state.pauseCount, 1, "interruption begin still pauses metronome");
  assert.equal(state.running, false);
  notifyInterruptionEnd();
  assert.equal(state.resumeCount, 0, "auto-resume disabled: bridge.resume must NOT be called");
  assert.equal(state.running, false);
  assert.deepEqual(getAudioLifecycleSnapshot(), { phase: "idle", reason: null });
});

test("manual stop during interruption clears the temporary interrupted status", async () => {
  _resetAudioSessionForTests();
  const { state, bridge } = makeBridge(true);
  registerMetronomeBridge(bridge);
  notifyInterruptionBegin();
  notifyUserMetronomeToggle();
  notifyInterruptionEnd();
  assert.equal(state.resumeCount, 0);
  assert.deepEqual(getAudioLifecycleSnapshot(), { phase: "idle", reason: null });
});

test("failed asynchronous interruption resume exposes recovery failure", async () => {
  _resetAudioSessionForTests();
  let running = true;
  registerMetronomeBridge({
    isRunning: () => running,
    pause: () => { running = false; },
    resume: async () => false,
  });
  notifyInterruptionBegin();
  notifyInterruptionEnd();
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(getAudioLifecycleSnapshot(), { phase: "recoveryFailed", reason: "interruption" });
});

test("autoResumeAfterInterruption=true (default) still resumes on interruption end", async () => {
  _resetAudioSessionForTests();
  const { state, bridge } = makeBridge(true);
  registerMetronomeBridge(bridge);
  // default is true — no explicit call to setAutoResumeAfterInterruption needed
  notifyInterruptionBegin();
  assert.equal(state.pauseCount, 1);
  notifyInterruptionEnd();
  assert.equal(state.resumeCount, 1, "auto-resume enabled: bridge.resume must be called");
  assert.equal(state.running, true);
});

test("autoResumeAfterInterruption=false does not affect modal session release", async () => {
  // The guard only applies inside notifyInterruptionEnd. Modal acquire/release
  // auto-resume should work regardless of this flag.
  _resetAudioSessionForTests();
  const { state, bridge } = makeBridge(true);
  registerMetronomeBridge(bridge);
  setAutoResumeAfterInterruption(false);
  await acquireAudioSession("rec", "recording");
  assert.equal(state.pauseCount, 0);
  await releaseAudioSession("rec");
  assert.equal(state.resumeCount, 0, "modal release does not resume output it never paused");
  assert.equal(state.running, true);
});

test("repeated interruption cycles work consistently", async () => {
  _resetAudioSessionForTests();
  const { state, bridge } = makeBridge(true);
  registerMetronomeBridge(bridge);
  for (let i = 0; i < 3; i++) {
    notifyInterruptionBegin();
    assert.equal(state.running, false, `cycle ${i}: paused`);
    notifyInterruptionEnd();
    assert.equal(state.running, true, `cycle ${i}: resumed`);
  }
  assert.equal(state.pauseCount, 3);
  assert.equal(state.resumeCount, 3);
});
