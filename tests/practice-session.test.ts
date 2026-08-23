import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PracticeSessionTracker,
  getPracticeSessionDuration,
  isGrowthEligiblePracticeSession,
} from "../lib/activity-log";

const BASE = {
  bpm: 120,
  mode: "dial" as const,
  startedAt: 1_000,
};

test("PracticeSessionTracker: pause와 interruption은 능동 시간에서 제외하고 하나의 세션으로 완료", () => {
  const session = new PracticeSessionTracker(BASE, 1_000);
  session.pause(11_000);       // active 10s
  session.resume(31_000);      // paused 20s
  session.interrupt(41_000);   // active 10s
  session.resume(71_000);      // interrupted 30s
  const record = session.complete(132, "manual", "completed", 76_000); // active 5s

  assert.equal(record.schemaVersion, 2);
  assert.equal(record.duration, 25);
  assert.equal(record.activeDurationSec, 25);
  assert.equal(record.pausedDurationSec, 20);
  assert.equal(record.interruptionDurationSec, 30);
  assert.equal(record.pauseCount, 1);
  assert.equal(record.interruptionCount, 1);
  assert.equal(record.bpmStart, 120);
  assert.equal(record.bpmEnd, 132);
  assert.equal(record.bpmPeak, 132);
  assert.equal(record.status, "completed");
});

test("PracticeSessionTracker: bar BPM source metadata survives into the activity record", () => {
  const session = new PracticeSessionTracker({
    bpm: 156,
    mode: "bar",
    bpmSource: "bar_override",
    activeBarIndex: 3,
    startedAt: 1_000,
  }, 1_000);
  const record = session.complete(156, "manual", "completed", 6_000, {
    bpmSource: "bar_override",
    activeBarIndex: 3,
  });

  assert.equal(record.bpm, 156);
  assert.equal(record.bpmSource, "bar_override");
  assert.equal(record.activeBarIndex, 3);
  assert.equal(record.bpmEndSource, "bar_override");
  assert.equal(record.activeBarIndexEnd, 3);
});

test("PracticeSessionTracker: repeated lifecycle signals are idempotent", () => {
  const session = new PracticeSessionTracker(BASE, 0);
  session.interrupt(5_000);
  session.interrupt(7_000);
  session.resume(10_000);
  session.resume(12_000);
  const record = session.complete(120, "audio_interruption", "abandoned", 15_000);

  assert.equal(record.activeDurationSec, 10);
  assert.equal(record.interruptionDurationSec, 5);
  assert.equal(record.interruptionCount, 1);
  assert.equal(record.status, "abandoned");
});

test("PracticeSessionTracker: watchdog recovery resumes the interrupted session as active practice", () => {
  const session = new PracticeSessionTracker(BASE, 0);
  session.interrupt(5_000); // watchdog detects audio failure
  session.resume(15_000);   // watchdog recovery succeeds and playback continues
  const record = session.complete(120, "manual", "completed", 20_000);

  assert.equal(record.activeDurationSec, 10);
  assert.equal(record.interruptionDurationSec, 10);
  assert.equal(record.status, "completed");
});

test("PracticeSessionTracker: mode exit finalizes the old session before a later session starts", () => {
  const beforeNoteMode = new PracticeSessionTracker(BASE, 0);
  const first = beforeNoteMode.complete(120, "manual", "completed", 8_000);
  const afterNoteMode = new PracticeSessionTracker({ ...BASE, startedAt: 60_000 }, 60_000);
  const second = afterNoteMode.complete(120, "manual", "completed", 65_000);

  assert.equal(first.activeDurationSec, 8);
  assert.equal(second.activeDurationSec, 5);
  assert.equal(first.endedAt, 8_000);
  assert.equal(second.startedAt, 60_000);
});

test("PracticeSessionTracker: discarding a reset-time session leaves no resumable elapsed time", () => {
  let activeSession: PracticeSessionTracker | null = new PracticeSessionTracker(BASE, 0);
  activeSession = null; // full reset discards the in-memory session
  const afterReset = new PracticeSessionTracker(BASE, 100_000);
  const record = afterReset.complete(120, "manual", "completed", 104_000);

  assert.equal(activeSession, null);
  assert.equal(record.activeDurationSec, 4);
});

test("PracticeSessionTracker: an Easter-egg stop completes before later ordinary playback", () => {
  const beforeQuiz = new PracticeSessionTracker(BASE, 0);
  const quizBoundary = beforeQuiz.complete(120, "manual", "completed", 7_000);
  const afterQuiz = new PracticeSessionTracker({ ...BASE, startedAt: 50_000 }, 50_000);
  const resumed = afterQuiz.complete(120, "manual", "completed", 56_000);

  assert.equal(quizBoundary.activeDurationSec, 7);
  assert.equal(resumed.activeDurationSec, 6);
});

test("growth eligibility excludes short, abandoned, and legacy sessions while duration remains compatible", () => {
  const legacy = { bpm: 120, mode: "bar" as const, duration: 60 };
  const short = { ...legacy, schemaVersion: 2 as const, activeDurationSec: 2, status: "completed" as const };
  const abandoned = { ...legacy, schemaVersion: 2 as const, activeDurationSec: 60, status: "abandoned" as const };
  const eligible = { ...legacy, schemaVersion: 2 as const, activeDurationSec: 3, status: "completed" as const };

  assert.equal(getPracticeSessionDuration(legacy), 60);
  assert.equal(getPracticeSessionDuration({ ...eligible, duration: 99 }), 3);
  assert.equal(isGrowthEligiblePracticeSession(legacy), false);
  assert.equal(isGrowthEligiblePracticeSession(short), false);
  assert.equal(isGrowthEligiblePracticeSession(abandoned), false);
  assert.equal(isGrowthEligiblePracticeSession(eligible), true);
});