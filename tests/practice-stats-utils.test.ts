import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDailyStats, isStatsEmpty } from "../components/practice-stats-utils";
import type { ActivityLog } from "../lib/activity-log";

// 고정 기준 시각 (2026-05-03 00:00 로컬). 테스트는 now 인자로 주입.
const FIXED_NOW = new Date(2026, 4, 3, 12, 0, 0).getTime();
const DAY_MS = 24 * 60 * 60 * 1000;

function session(daysAgo: number, mode: "dial" | "bar", duration: number, hour = 10): ActivityLog {
  const d = new Date(FIXED_NOW);
  d.setHours(0, 0, 0, 0);
  const ts = d.getTime() - daysAgo * DAY_MS + hour * 60 * 60 * 1000;
  return {
    id: `s-${daysAgo}-${mode}-${duration}`,
    type: "practice_session",
    timestamp: ts,
    data: { bpm: 120, mode, duration },
  };
}

test("buildDailyStats: 빈 입력 → 7개 0 버킷", () => {
  const stats = buildDailyStats([], 7, FIXED_NOW);
  assert.equal(stats.length, 7);
  assert.ok(stats.every((s) => s.totalSec === 0));
});

test("buildDailyStats: days 클램프 (0/음수 → 1)", () => {
  assert.equal(buildDailyStats([], 0, FIXED_NOW).length, 1);
  assert.equal(buildDailyStats([], -5, FIXED_NOW).length, 1);
});

test("buildDailyStats: 7일 / 30일 라벨 형식 다름", () => {
  const week = buildDailyStats([], 7, FIXED_NOW);
  const month = buildDailyStats([], 30, FIXED_NOW);
  // 요일 한글 1글자
  assert.match(week[0].label, /^[일월화수목금토]$/);
  // M/D
  assert.match(month[0].label, /^\d+\/\d+$/);
});

test("buildDailyStats: dial/bar 모드 분리 집계", () => {
  const logs = [session(0, "dial", 300), session(0, "bar", 200), session(0, "dial", 100)];
  const stats = buildDailyStats(logs, 7, FIXED_NOW);
  const today = stats[stats.length - 1];
  assert.equal(today.totalSec, 600);
  assert.equal(today.beatSec, 400);
  assert.equal(today.barSec, 200);
});

test("buildDailyStats: 일자별 버킷팅 (오늘=마지막, 6일전=첫 번째)", () => {
  const logs = [session(0, "dial", 100), session(6, "bar", 200)];
  const stats = buildDailyStats(logs, 7, FIXED_NOW);
  assert.equal(stats[6].totalSec, 100);
  assert.equal(stats[6].beatSec, 100);
  assert.equal(stats[0].totalSec, 200);
  assert.equal(stats[0].barSec, 200);
});

test("buildDailyStats: 윈도 밖 로그(7일 이상 전)는 무시", () => {
  const logs = [session(10, "dial", 999), session(0, "dial", 50)];
  const stats = buildDailyStats(logs, 7, FIXED_NOW);
  const total = stats.reduce((s, b) => s + b.totalSec, 0);
  assert.equal(total, 50);
});

test("buildDailyStats: 미래 timestamp(dayDelta<0)는 무시", () => {
  const logs: ActivityLog[] = [{
    id: "future",
    type: "practice_session",
    timestamp: FIXED_NOW + 5 * DAY_MS,
    data: { bpm: 120, mode: "dial", duration: 999 },
  }];
  const stats = buildDailyStats(logs, 7, FIXED_NOW);
  assert.ok(stats.every((s) => s.totalSec === 0));
});

test("buildDailyStats: practice_session 외 로그 타입 무시", () => {
  const logs: ActivityLog[] = [{
    id: "fu",
    type: "feature_usage",
    timestamp: FIXED_NOW,
    data: { feature: "signal_generator", duration: 500 },
  }];
  const stats = buildDailyStats(logs, 7, FIXED_NOW);
  assert.ok(stats.every((s) => s.totalSec === 0));
});

test("buildDailyStats: duration 0/음수/NaN 무시", () => {
  const logs: ActivityLog[] = [
    { id: "a", type: "practice_session", timestamp: FIXED_NOW, data: { bpm: 120, mode: "dial", duration: 0 } },
    { id: "b", type: "practice_session", timestamp: FIXED_NOW, data: { bpm: 120, mode: "dial", duration: -10 } },
    { id: "c", type: "practice_session", timestamp: FIXED_NOW, data: { bpm: 120, mode: "dial", duration: NaN } },
    { id: "d", type: "practice_session", timestamp: FIXED_NOW, data: { bpm: 120, mode: "dial", duration: 30 } },
  ];
  const stats = buildDailyStats(logs, 7, FIXED_NOW);
  const total = stats.reduce((s, b) => s + b.totalSec, 0);
  assert.equal(total, 30);
});

test("buildDailyStats: 알 수 없는 mode는 total에만 합산", () => {
  const logs: ActivityLog[] = [{
    id: "x",
    type: "practice_session",
    timestamp: FIXED_NOW,
    data: { bpm: 120, mode: "unknown" as any, duration: 77 },
  }];
  const stats = buildDailyStats(logs, 7, FIXED_NOW);
  const today = stats[stats.length - 1];
  assert.equal(today.totalSec, 77);
  assert.equal(today.beatSec, 0);
  assert.equal(today.barSec, 0);
});

test("isStatsEmpty: 모두 0 → true, 하나라도 양수면 false", () => {
  assert.equal(isStatsEmpty([{ label: "월", totalSec: 0, beatSec: 0, barSec: 0 }]), true);
  assert.equal(isStatsEmpty([
    { label: "월", totalSec: 0, beatSec: 0, barSec: 0 },
    { label: "화", totalSec: 5, beatSec: 5, barSec: 0 },
  ]), false);
  assert.equal(isStatsEmpty([]), true);
});
