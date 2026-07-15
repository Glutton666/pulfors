// Task #40: 백업 schemaVersion 마이그레이션 단위 테스트.
// migrateBackup이 (a) 누락된 버전을 v0으로 분기하고, (b) 미래 버전을 거부하고,
// (c) 정상 v1을 무손실 통과시키는지 회귀 가드한다. 추가로 importBackup이
// 손상된 JSON과 미래 버전 파일을 적절한 errorCode로 보고하는지 확인한다.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CURRENT_SCHEMA_VERSION,
  migrateBackup,
  UnsupportedBackupVersionError,
} from "../lib/backup/migrations";
import type { BackupFile } from "../lib/backup/shared";
import { restoreFromJson } from "../lib/backup/full";
import AsyncStorage from "@react-native-async-storage/async-storage";

function makeBackup(overrides: Partial<BackupFile> = {}): BackupFile {
  return {
    _meta: {
      app: "metronome",
      version: 2,
      createdAt: "2026-05-03T00:00:00.000Z",
      keyCount: 1,
    },
    data: {
      practice_book: JSON.stringify([
        {
          id: "p1",
          label: "P1",
          createdAt: 0,
          bpm: 120,
          beatsPerMeasure: 4,
          beatTypes: ["accent", "normal", "normal", "normal"],
          beatSubdivisions: {},
          barRepeats: {},
          barLoopMode: "once",
          subdivisionPattern: ["accent"],
        },
      ]),
    },
    ...overrides,
  };
}

test("[migrate] schemaVersion 누락 시 v0으로 간주하고 CURRENT까지 끌어올린다", () => {
  const backup = makeBackup();
  // 명시적으로 schemaVersion 미정의
  assert.equal(backup.schemaVersion, undefined);
  const result = migrateBackup(backup);
  assert.equal(result.fromVersion, 0);
  assert.equal(result.toVersion, CURRENT_SCHEMA_VERSION);
  assert.deepEqual(result.data, backup.data);
});

test("[migrate] v0 → v1 마이그레이션은 데이터 의미를 보존한다(현재 identity)", () => {
  const backup = makeBackup({ schemaVersion: 0 });
  const result = migrateBackup(backup);
  assert.equal(result.fromVersion, 0);
  assert.equal(result.toVersion, 1);
  // 현재 v0→v1은 identity. 데이터 내용 동일.
  assert.deepEqual(result.data, backup.data);
});

test("[migrate] 정상 v1 백업은 변환 없이 통과한다", () => {
  const backup = makeBackup({ schemaVersion: 1 });
  const result = migrateBackup(backup);
  assert.equal(result.fromVersion, 1);
  assert.equal(result.toVersion, 1);
  assert.deepEqual(result.data, backup.data);
});

test("[migrate] 미래 버전 백업은 UnsupportedBackupVersionError를 던진다", () => {
  const backup = makeBackup({ schemaVersion: CURRENT_SCHEMA_VERSION + 5 });
  let caught: unknown = null;
  try {
    migrateBackup(backup);
  } catch (e) {
    caught = e;
  }
  assert.ok(caught instanceof UnsupportedBackupVersionError, "전용 에러 클래스");
  const err = caught as UnsupportedBackupVersionError;
  assert.equal(err.fileVersion, CURRENT_SCHEMA_VERSION + 5);
  assert.equal(err.currentVersion, CURRENT_SCHEMA_VERSION);
});

test("[migrate] 비정상 schemaVersion(NaN, 문자열, 음수, 소수)는 v0으로 안전하게 분기한다", () => {
  const cases: Array<{ label: string; value: unknown }> = [
    { label: "NaN", value: Number.NaN },
    { label: "문자열", value: "1" as unknown },
    { label: "Infinity", value: Number.POSITIVE_INFINITY },
    { label: "음수", value: -3 },
    { label: "소수(0.4 → floor 0)", value: 0.4 },
  ];
  for (const c of cases) {
    const backup = makeBackup({ schemaVersion: c.value as number });
    const result = migrateBackup(backup);
    assert.equal(result.fromVersion, 0, `${c.label} 케이스는 v0으로 분기`);
    assert.equal(result.toVersion, CURRENT_SCHEMA_VERSION);
  }
});

test("[migrate] CURRENT_SCHEMA_VERSION + 1만 큰 경우에도 거부한다", () => {
  const backup = makeBackup({ schemaVersion: CURRENT_SCHEMA_VERSION + 1 });
  assert.throws(
    () => migrateBackup(backup),
    (err) => err instanceof UnsupportedBackupVersionError,
  );
});

test("[import] 손상된 JSON은 errorCode='invalid'로 거부된다", async () => {
  const cases = [
    "this is not json",
    "{ broken",
    "",
    "null",
    "[]",
    JSON.stringify({ data: {} }), // _meta 누락
    JSON.stringify({ _meta: { app: "other" }, data: {} }), // 잘못된 app 식별자
  ];
  for (const json of cases) {
    const r = await restoreFromJson(json);
    assert.equal(r.success, false, `손상 케이스 거부: ${json.slice(0, 30)}`);
    assert.equal(r.errorCode, "invalid");
    assert.equal(r.keyCount, 0);
  }
});

test("[import] 미래 schemaVersion 백업은 errorCode='unsupported_version'으로 거부된다", async () => {
  const future: BackupFile = {
    _meta: { app: "metronome", version: 2, createdAt: "2099-01-01", keyCount: 0 },
    schemaVersion: CURRENT_SCHEMA_VERSION + 10,
    data: {},
  };
  const r = await restoreFromJson(JSON.stringify(future));
  assert.equal(r.success, false);
  assert.equal(r.errorCode, "unsupported_version");
  assert.equal(r.keyCount, 0);
});

test("[import] 정상 v1 백업은 라운드트립으로 데이터를 복원하고 schemaVersion을 통과한다", async () => {
  // 깨끗한 상태에서 시작
  await (AsyncStorage as unknown as { __reset: () => void }).__reset();
  const settings = JSON.stringify({ bpm: 137, beatsPerMeasure: 5 });
  const valid: BackupFile = {
    _meta: { app: "metronome", version: 2, createdAt: "2026-05-03", keyCount: 1 },
    schemaVersion: 1,
    data: { metronome_settings: settings },
  };
  const r = await restoreFromJson(JSON.stringify(valid));
  assert.equal(r.success, true);
  assert.equal(r.errorCode, undefined);
  assert.equal(r.keyCount, 1);
  // AsyncStorage에 실제로 저장된 값 확인
  const stored = await AsyncStorage.getItem("metronome_settings");
  assert.equal(stored, settings);
});

test("[migrate] 빈 data 객체도 마이그레이션 체인을 통과한다", () => {
  const backup: BackupFile = {
    _meta: {
      app: "metronome",
      version: 2,
      createdAt: "2026-05-03T00:00:00.000Z",
      keyCount: 0,
    },
    data: {},
  };
  const result = migrateBackup(backup);
  assert.deepEqual(result.data, {});
  assert.equal(result.toVersion, CURRENT_SCHEMA_VERSION);
});
