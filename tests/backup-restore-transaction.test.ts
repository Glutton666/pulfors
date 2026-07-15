// 백업 복원 트랜잭션 회귀 가드.
// restoreFromJson은 multiSet 실패 시 스냅샷에서 롤백하고, 강제 종료된 경우
// 부팅 시 rollbackPendingRestoreIfAny()로 자동 복구되어야 한다.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { restoreFromJson, rollbackPendingRestoreIfAny } from "../lib/backup/full";
import { ALL_KEYS, RESTORE_SNAPSHOT_KEY } from "../lib/backup/shared";
import { CURRENT_SCHEMA_VERSION } from "../lib/backup/migrations";

const AsyncStorage = require("./_stubs/async-storage");

beforeEach(() => {
  AsyncStorage.__reset();
});

function makeBackupJson(data: Record<string, string>): string {
  return JSON.stringify({
    _meta: {
      app: "metronome",
      version: 2,
      createdAt: new Date().toISOString(),
      keyCount: Object.keys(data).length,
    },
    schemaVersion: CURRENT_SCHEMA_VERSION,
    data,
  });
}

test("성공 경로: 복원 성공 시 스냅샷 키가 정리됨", async () => {
  await AsyncStorage.setItem("metronome_settings", JSON.stringify({ bpm: 90 }));
  const json = makeBackupJson({ metronome_settings: JSON.stringify({ bpm: 200 }) });
  const r = await restoreFromJson(json);
  assert.equal(r.success, true);
  assert.equal(r.keyCount, 1);
  assert.equal(await AsyncStorage.getItem(RESTORE_SNAPSHOT_KEY), null);
  const s = JSON.parse(await AsyncStorage.getItem("metronome_settings"));
  assert.equal(s.bpm, 200);
});

test("실패 경로: multiSet 실패 시 기존 데이터로 롤백", async () => {
  await AsyncStorage.setItem("metronome_settings", JSON.stringify({ bpm: 77 }));
  await AsyncStorage.setItem("practice_book", JSON.stringify([{ id: "p" }]));
  const original = AsyncStorage.multiSet;
  let calls = 0;
  AsyncStorage.multiSet = async (pairs: [string, string][]) => {
    calls++;
    // 첫 번째 호출(실제 복원 단계)만 실패시키고, 롤백 단계 호출은 통과.
    if (calls === 1) throw new Error("simulated multiSet failure");
    return original.call(AsyncStorage, pairs);
  };
  try {
    const json = makeBackupJson({ metronome_settings: JSON.stringify({ bpm: 200 }) });
    const r = await restoreFromJson(json);
    assert.equal(r.success, false);
    assert.equal(r.errorCode, "io");
    // 원본이 복구되었는지 확인
    const s = JSON.parse(await AsyncStorage.getItem("metronome_settings"));
    assert.equal(s.bpm, 77);
    const book = JSON.parse(await AsyncStorage.getItem("practice_book"));
    assert.equal(book[0].id, "p");
    // 스냅샷 키도 정리되었는지
    assert.equal(await AsyncStorage.getItem(RESTORE_SNAPSHOT_KEY), null);
  } finally {
    AsyncStorage.multiSet = original;
  }
});

test("부팅 복구: 스냅샷 키가 남아 있으면 자동 롤백", async () => {
  // 실패한 복원의 흔적을 직접 시뮬레이션:
  // metronome_settings는 새 백업 값으로 덮였고, 스냅샷 키에는 옛 값이 남음.
  const oldSnapshot = {
    metronome_settings: JSON.stringify({ bpm: 88 }),
    practice_book: JSON.stringify([{ id: "old" }]),
  };
  await AsyncStorage.setItem("metronome_settings", JSON.stringify({ bpm: 999 }));
  await AsyncStorage.setItem(RESTORE_SNAPSHOT_KEY, JSON.stringify(oldSnapshot));

  const ok = await rollbackPendingRestoreIfAny();
  assert.equal(ok, true);
  const s = JSON.parse(await AsyncStorage.getItem("metronome_settings"));
  assert.equal(s.bpm, 88);
  const book = JSON.parse(await AsyncStorage.getItem("practice_book"));
  assert.equal(book[0].id, "old");
  assert.equal(await AsyncStorage.getItem(RESTORE_SNAPSHOT_KEY), null);
});

test("부팅 복구: 스냅샷 없음 → no-op (false)", async () => {
  const ok = await rollbackPendingRestoreIfAny();
  assert.equal(ok, false);
});

test("부팅 복구: 손상된 스냅샷은 키를 비우고 false 반환 (무한 재시도 방지)", async () => {
  await AsyncStorage.setItem(RESTORE_SNAPSHOT_KEY, "}}}");
  const ok = await rollbackPendingRestoreIfAny();
  assert.equal(ok, false);
  assert.equal(await AsyncStorage.getItem(RESTORE_SNAPSHOT_KEY), null);
});

test("성공 경로: ALL_KEYS에 없는 백업 키는 무시", async () => {
  const json = makeBackupJson({
    metronome_settings: JSON.stringify({ bpm: 100 }),
    unknown_alien_key: "should-be-ignored",
  });
  const r = await restoreFromJson(json);
  assert.equal(r.success, true);
  assert.equal(r.keyCount, 1);
  assert.equal(await AsyncStorage.getItem("unknown_alien_key"), null);
});

test("ALL_KEYS 상수에 RESTORE_SNAPSHOT_KEY가 포함되지 않음", () => {
  // 스냅샷 키는 백업/복원 대상이 아니어야 한다 (자기 자신을 백업하면 무한 재귀).
  assert.equal(ALL_KEYS.includes(RESTORE_SNAPSHOT_KEY), false);
});

test("동시 복원: 병렬 호출이 직렬화되어 마지막 호출 결과가 일관됨", async () => {
  await AsyncStorage.setItem("metronome_settings", JSON.stringify({ bpm: 50 }));
  const a = makeBackupJson({ metronome_settings: JSON.stringify({ bpm: 100 }) });
  const b = makeBackupJson({ metronome_settings: JSON.stringify({ bpm: 200 }) });
  const [r1, r2] = await Promise.all([restoreFromJson(a), restoreFromJson(b)]);
  assert.equal(r1.success, true);
  assert.equal(r2.success, true);
  // 직렬화되었으므로 스냅샷 키는 정리되어야 함 (경합으로 잔존 안 됨).
  assert.equal(await AsyncStorage.getItem(RESTORE_SNAPSHOT_KEY), null);
  // 두 결과 중 하나가 최종 — 어느 쪽이든 둘 중 하나의 값이어야 한다.
  const s = JSON.parse(await AsyncStorage.getItem("metronome_settings"));
  assert.ok(s.bpm === 100 || s.bpm === 200, `unexpected bpm: ${s.bpm}`);
});

test("부팅 복구: I/O 실패 시 스냅샷 키 보존(다음 부팅에서 재시도 가능)", async () => {
  const goodSnapshot = JSON.stringify({
    metronome_settings: JSON.stringify({ bpm: 88 }),
  });
  await AsyncStorage.setItem(RESTORE_SNAPSHOT_KEY, goodSnapshot);
  const original = AsyncStorage.multiSet;
  AsyncStorage.multiSet = async () => {
    throw new Error("simulated transient I/O");
  };
  try {
    const ok = await rollbackPendingRestoreIfAny();
    assert.equal(ok, false);
    // I/O 실패이므로 스냅샷은 보존되어야 함
    assert.equal(await AsyncStorage.getItem(RESTORE_SNAPSHOT_KEY), goodSnapshot);
  } finally {
    AsyncStorage.multiSet = original;
  }
});
