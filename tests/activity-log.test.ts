import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  loadLoggingEnabled,
  saveLoggingEnabled,
  addActivityLog,
  loadActivityLogs,
  clearActivityLogs,
  clearActivityData,
  loadGoals,
  pruneActivityLogs,
  saveGoals,
  ACTIVITY_RETENTION_DAYS,
  type Goal,
} from "../lib/activity-log";

const AsyncStorage = require("./_stubs/async-storage");

beforeEach(() => {
  AsyncStorage.__reset();
});

test("loadLoggingEnabled: 기본 false", async () => {
  assert.equal(await loadLoggingEnabled(), false);
});

test("saveLoggingEnabled/loadLoggingEnabled: 라운드트립", async () => {
  await saveLoggingEnabled(true);
  assert.equal(await loadLoggingEnabled(), true);
  await saveLoggingEnabled(false);
  assert.equal(await loadLoggingEnabled(), false);
});

test("loadLoggingEnabled: 손상 JSON → false", async () => {
  await AsyncStorage.setItem("metronome_activity_settings", "}}}");
  assert.equal(await loadLoggingEnabled(), false);
});

test("loadActivityLogs: 기본 []", async () => {
  assert.deepEqual(await loadActivityLogs(), []);
});

test("addActivityLog: id/timestamp 자동 + 누적 저장", async () => {
  await addActivityLog({
    type: "practice_session",
    data: { bpm: 120, mode: "dial", duration: 60 },
  });
  await addActivityLog({
    type: "feature_usage",
    data: { feature: "signal_generator", duration: 30 },
  });
  const logs = await loadActivityLogs();
  assert.equal(logs.length, 2);
  assert.ok(logs[0].id);
  assert.ok(logs[0].timestamp > 0);
  assert.equal(logs[0].type, "practice_session");
  assert.equal(logs[1].type, "feature_usage");
  assert.notEqual(logs[0].id, logs[1].id);
});

test("addActivityLog: 동시 호출도 직렬 chain 으로 모두 보존", async () => {
  const tasks = Array.from({ length: 5 }, (_, i) =>
    addActivityLog({
      type: "practice_session",
      data: { bpm: 100 + i, mode: "dial", duration: 10 },
    }),
  );
  await Promise.all(tasks);
  const logs = await loadActivityLogs();
  assert.equal(logs.length, 5);
  const bpms = (logs.map((l) => (l.data as any).bpm) as number[]).sort();
  assert.deepEqual(bpms, [100, 101, 102, 103, 104]);
});

test("clearActivityLogs: 전체 삭제", async () => {
  await addActivityLog({
    type: "practice_session",
    data: { bpm: 120, mode: "bar", duration: 5 },
  });
  await clearActivityLogs();
  assert.deepEqual(await loadActivityLogs(), []);
});

test("clearActivityData: 로그·목표·로컬 기록 동의를 함께 삭제", async () => {
  await saveLoggingEnabled(true);
  await saveGoals([{ id: "g", type: "total_play_time", target: 10, label: "10분" }]);
  await addActivityLog({
    type: "practice_session",
    data: { bpm: 120, mode: "bar", duration: 5 },
  });
  await clearActivityData();
  assert.equal(await loadLoggingEnabled(), false);
  assert.deepEqual(await loadActivityLogs(), []);
  assert.deepEqual(await loadGoals(), []);
});

test("clearActivityData: 이미 대기 중인 로그 쓰기 뒤에 직렬화되어 기록을 되살리지 않음", async () => {
  const pendingWrite = addActivityLog({
    type: "practice_session",
    data: { bpm: 120, mode: "bar", duration: 5 },
  });
  await clearActivityData();
  await pendingWrite;
  assert.deepEqual(await loadActivityLogs(), []);
});

test("pruneActivityLogs: 730일보다 오래된 세션만 정리", () => {
  const now = new Date(2026, 7, 21).getTime();
  const retained = pruneActivityLogs([
    { id: "edge", type: "practice_session", timestamp: now - ACTIVITY_RETENTION_DAYS * 24 * 60 * 60 * 1000, data: { bpm: 120, mode: "dial", duration: 1 } },
    { id: "old", type: "practice_session", timestamp: now - (ACTIVITY_RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000, data: { bpm: 120, mode: "dial", duration: 1 } },
  ], now);
  assert.deepEqual(retained.map((entry) => entry.id), ["edge"]);
});

test("loadActivityLogs: 읽는 동안 만료 로그를 저장소에서도 자동 정리", async () => {
  const now = Date.now();
  await AsyncStorage.setItem("metronome_activity_log", JSON.stringify([
    { id: "old", type: "practice_session", timestamp: now - (ACTIVITY_RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000, data: { bpm: 120, mode: "dial", duration: 10 } },
    { id: "fresh", type: "practice_session", timestamp: now, data: { bpm: 120, mode: "dial", duration: 10 } },
  ]));
  assert.deepEqual((await loadActivityLogs()).map((entry) => entry.id), ["fresh"]);
  assert.deepEqual(JSON.parse(await AsyncStorage.getItem("metronome_activity_log")).map((entry: { id: string }) => entry.id), ["fresh"]);
});

test("loadGoals: 기본 []", async () => {
  assert.deepEqual(await loadGoals(), []);
});

test("saveGoals/loadGoals: 라운드트립", async () => {
  const goals: Goal[] = [
    { id: "g1", type: "total_play_time", target: 3600, label: "1시간" },
    { id: "g2", type: "session_goal", target: 600, label: "한 세션 10분" },
  ];
  await saveGoals(goals);
  assert.deepEqual(await loadGoals(), goals);
});

test("loadGoals: 손상 JSON → []", async () => {
  await AsyncStorage.setItem("metronome_goals", "}}}");
  assert.deepEqual(await loadGoals(), []);
});
