import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  loadLoggingEnabled,
  saveLoggingEnabled,
  addActivityLog,
  loadActivityLogs,
  clearActivityLogs,
  loadGoals,
  saveGoals,
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
