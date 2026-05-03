import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ClickBlackout,
  DEFAULT_FILTER_OPTIONS,
  shouldAcceptResult,
} from "../lib/voice-filter";

const opts = DEFAULT_FILTER_OPTIONS;

test("빈 transcript → empty", () => {
  assert.equal(shouldAcceptResult({ transcript: "", confidence: 1, now: 0, lastClickAt: null }), "empty");
  assert.equal(shouldAcceptResult({ transcript: "   ", confidence: 1, now: 0, lastClickAt: null }), "empty");
  assert.equal(shouldAcceptResult({ transcript: null, confidence: 1, now: 0, lastClickAt: null }), "empty");
});

test("단일 음절(1자) → too-short", () => {
  assert.equal(shouldAcceptResult({ transcript: "k", confidence: 1, now: 0, lastClickAt: null }), "too-short");
  assert.equal(shouldAcceptResult({ transcript: "고", confidence: 1, now: 0, lastClickAt: null }), "too-short");
});

test("2자 이상 통과", () => {
  assert.equal(shouldAcceptResult({ transcript: "go", confidence: 1, now: 0, lastClickAt: null }), "ok");
  assert.equal(shouldAcceptResult({ transcript: "정지", confidence: 0.9, now: 0, lastClickAt: null }), "ok");
});

test("confidence 임계 미만 → low-confidence", () => {
  assert.equal(
    shouldAcceptResult({ transcript: "stop", confidence: 0.2, now: 0, lastClickAt: null }),
    "low-confidence",
  );
});

test("confidence undefined/null은 통과시킴", () => {
  assert.equal(shouldAcceptResult({ transcript: "stop", confidence: undefined, now: 0, lastClickAt: null }), "ok");
  assert.equal(shouldAcceptResult({ transcript: "stop", confidence: null, now: 0, lastClickAt: null }), "ok");
});

test("클릭 직후 80ms 윈도우 안 → click-blackout", () => {
  for (const dt of [0, 1, 50, 79]) {
    assert.equal(
      shouldAcceptResult({ transcript: "stop", confidence: 0.9, now: 1000 + dt, lastClickAt: 1000 }),
      "click-blackout",
      `dt=${dt}`,
    );
  }
});

test("클릭 후 80ms 이후 → ok", () => {
  assert.equal(
    shouldAcceptResult({ transcript: "stop", confidence: 0.9, now: 1080, lastClickAt: 1000 }),
    "ok",
  );
});

test("lastClickAt이 미래에 있으면(시계 보정 등) blackout 적용 안함", () => {
  assert.equal(
    shouldAcceptResult({ transcript: "stop", confidence: 0.9, now: 900, lastClickAt: 1000 }),
    "ok",
  );
});

test("ClickBlackout: noteClick → 윈도우 안에서는 isInBlackout=true", () => {
  const b = new ClickBlackout(80);
  b.noteClick(1000);
  assert.equal(b.isInBlackout(1000), true);
  assert.equal(b.isInBlackout(1079), true);
  assert.equal(b.isInBlackout(1080), false);
});

test("ClickBlackout: reset 후 차단 해제", () => {
  const b = new ClickBlackout(80);
  b.noteClick(1000);
  assert.equal(b.isInBlackout(1010), true);
  b.reset();
  assert.equal(b.isInBlackout(1010), false);
});

test("연속 클릭 시뮬레이션: 매 클릭이 윈도우를 갱신", () => {
  const b = new ClickBlackout(80);
  b.noteClick(1000);
  b.noteClick(1100);
  assert.equal(b.isInBlackout(1170), true); // 1100 기준 70ms 후
  assert.equal(b.isInBlackout(1180), false);
});

test("기본값 점검: minConfidence=0.5, minTranscriptLength=2, clickBlackoutMs=80", () => {
  assert.equal(opts.minConfidence, 0.5);
  assert.equal(opts.minTranscriptLength, 2);
  assert.equal(opts.clickBlackoutMs, 80);
});
