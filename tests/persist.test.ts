// lib/persist.ts 단위 테스트.
// 디바운스 머지 시멘틱이 향후 setting 추가 시 회귀 없도록 락하는 가드.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createDebouncedPersister } from "../lib/persist";

test("[persist] 디바운스 윈도우 내 다중 호출은 한 번만 write로 flush된다", async () => {
  let snapshot = { a: 1, b: 2, c: 3 };
  const writes: typeof snapshot[] = [];
  const persist = createDebouncedPersister(() => snapshot, (m) => { writes.push(m); }, 30);

  persist({ a: 10 });
  persist({ b: 20 });
  persist({ c: 30 });
  assert.equal(writes.length, 0, "디바운스 전에는 write 없음");
  await new Promise(r => setTimeout(r, 60));
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0], { a: 10, b: 20, c: 30 });
});

test("[persist] flush()는 즉시 쓰기, cancel()은 pending을 버린다", async () => {
  let snapshot = { x: 0 };
  const writes: typeof snapshot[] = [];
  const persist = createDebouncedPersister(() => snapshot, (m) => { writes.push(m); }, 100);

  persist({ x: 5 });
  persist.flush();
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0], { x: 5 });

  persist({ x: 99 });
  persist.cancel();
  await new Promise(r => setTimeout(r, 150));
  assert.equal(writes.length, 1, "cancel 후 추가 write 없음");
});

test("[persist] getSnapshot은 매 flush 시점마다 최신 값을 읽는다", async () => {
  const base = { a: 0, b: 0 };
  const writes: typeof base[] = [];
  const persist = createDebouncedPersister(() => ({ ...base }), (m) => { writes.push(m); }, 20);

  base.a = 1;
  persist({ b: 2 });
  await new Promise(r => setTimeout(r, 40));
  assert.deepEqual(writes[0], { a: 1, b: 2 });

  base.a = 100;
  persist({ b: 200 });
  await new Promise(r => setTimeout(r, 40));
  assert.deepEqual(writes[1], { a: 100, b: 200 });
});

test("[persist] 빈 호출은 write를 트리거하지 않는다", async () => {
  let snapshot = { k: 1 };
  const writes: typeof snapshot[] = [];
  const persist = createDebouncedPersister(() => snapshot, (m) => { writes.push(m); }, 20);
  persist.flush();
  await new Promise(r => setTimeout(r, 40));
  assert.equal(writes.length, 0);
});

// --- Task #38: 실패 재시도 ---

function makeFlakyWriter(failures: number) {
  let calls = 0;
  const log: { merged: any; ok: boolean }[] = [];
  const write = async (m: any) => {
    calls += 1;
    if (calls <= failures) {
      log.push({ merged: m, ok: false });
      throw new Error(`fail#${calls}`);
    }
    log.push({ merged: m, ok: true });
  };
  return { write, log, get calls() { return calls; } };
}

test("[persist:retry] 첫 시도 실패 후 백오프로 두 번째 시도가 성공한다", async () => {
  const snap = { v: 1 };
  const w = makeFlakyWriter(1);
  const persist = createDebouncedPersister(() => snap, w.write, 10, { maxAttempts: 3, baseDelayMs: 30 });

  persist({ v: 42 });
  await new Promise(r => setTimeout(r, 200));

  assert.equal(w.calls, 2, "재시도 한 번 더 호출");
  assert.deepEqual(w.log[0].merged, { v: 42 });
  assert.equal(w.log[0].ok, false);
  assert.equal(w.log[1].ok, true);

  const status = persist.getStatus();
  assert.equal(status.consecutiveFailures, 0, "성공 시 실패 카운터 리셋");
  assert.equal(status.cycleFailed, false);
  assert.equal(status.pendingChanges, 0);
  assert.ok(status.lastSaveAt !== null);
  assert.ok(status.lastErrorAt !== null, "한 번 실패한 흔적은 남는다");
});

test("[persist:retry] maxAttempts 모두 실패하면 cycleFailed가 켜지고 pending이 보존된다", async () => {
  const snap = { v: 0 };
  const w = makeFlakyWriter(99);
  const persist = createDebouncedPersister(() => snap, w.write, 5, { maxAttempts: 3, baseDelayMs: 10 });

  persist({ v: 7 });
  await new Promise(r => setTimeout(r, 300));

  assert.equal(w.calls, 3, "정확히 maxAttempts번 시도");
  const status = persist.getStatus();
  assert.equal(status.cycleFailed, true);
  assert.equal(status.consecutiveFailures, 3);
  assert.equal(status.pendingChanges, 1, "실패한 변경은 pending에 남아 다음 호출 때 합쳐진다");
  assert.equal(status.lastSaveAt, null);
});

test("[persist:retry] 백오프 대기 중 새 변경이 들어오면 즉시 머지 후 재시도", async () => {
  const snap = { a: 0, b: 0 };
  // 첫 두 번은 실패, 세 번째는 성공.
  const w = makeFlakyWriter(2);
  const persist = createDebouncedPersister(() => snap, w.write, 5, { maxAttempts: 5, baseDelayMs: 100 });

  persist({ a: 1 });
  // 첫 시도가 실패하고 100ms 백오프 들어가도록 잠깐 대기.
  await new Promise(r => setTimeout(r, 30));
  assert.equal(w.calls, 1);
  // 백오프 대기 중 새 변경 → 백오프 타이머 취소되고 즉시 두 번째 시도(머지된 페이로드).
  persist({ b: 2 });
  await new Promise(r => setTimeout(r, 5));
  assert.equal(w.calls, 2, "백오프 무시하고 즉시 재시도");
  assert.deepEqual(w.log[1].merged, { a: 1, b: 2 }, "이전 실패분 + 새 변경 모두 머지");

  // 두 번째도 실패 → 200ms 백오프 → 세 번째 성공.
  await new Promise(r => setTimeout(r, 400));
  assert.equal(w.calls, 3);
  assert.equal(w.log[2].ok, true);
  assert.equal(persist.getStatus().consecutiveFailures, 0);
});

test("[persist:retry] 정상 경로(실패 없음) 회귀: 한 번만 호출, 상태 깨끗", async () => {
  const snap = { x: 0 };
  let calls = 0;
  const persist = createDebouncedPersister(() => snap, async () => { calls += 1; }, 10, { maxAttempts: 3, baseDelayMs: 50 });

  persist({ x: 9 });
  await new Promise(r => setTimeout(r, 60));

  assert.equal(calls, 1);
  const s = persist.getStatus();
  assert.equal(s.consecutiveFailures, 0);
  assert.equal(s.cycleFailed, false);
  assert.equal(s.pendingChanges, 0);
  assert.ok(s.lastSaveAt !== null);
  assert.equal(s.lastErrorAt, null);
});

test("[persist:retry] 사이클이 모두 실패한 뒤 새 persist() 호출은 새 사이클을 시작한다", async () => {
  const snap = { v: 0 };
  let calls = 0;
  let shouldFail = true;
  const write = async () => {
    calls += 1;
    if (shouldFail) throw new Error("nope");
  };
  const persist = createDebouncedPersister(() => snap, write, 5, { maxAttempts: 2, baseDelayMs: 10 });

  persist({ v: 1 });
  await new Promise(r => setTimeout(r, 100));
  assert.equal(calls, 2, "첫 사이클: maxAttempts번 모두 실패");
  assert.equal(persist.getStatus().cycleFailed, true);

  // 백오프 타이머는 끝났고(maxAttempts 도달), pending에 변경이 남은 상태.
  // 새 persist() → cycleFailed 리셋 + 새 사이클(이번엔 성공).
  shouldFail = false;
  persist({ v: 2 });
  await new Promise(r => setTimeout(r, 30));
  assert.equal(calls, 3, "새 사이클에서 한 번 더 호출");
  const s = persist.getStatus();
  assert.equal(s.cycleFailed, false);
  assert.equal(s.consecutiveFailures, 0);
  assert.equal(s.pendingChanges, 0);
});

test("[persist:retry] in-flight write 도중 cancel()이 들어오면 결과가 상태를 오염시키지 않는다", async () => {
  const snap = { v: 0 };
  let calls = 0;
  let resolveWrite!: () => void;
  let rejectWrite!: (e: any) => void;
  const persist = createDebouncedPersister(
    () => snap,
    () => {
      calls += 1;
      return new Promise<void>((res, rej) => { resolveWrite = res; rejectWrite = rej; });
    },
    5,
    { maxAttempts: 5, baseDelayMs: 10 },
  );

  persist({ v: 1 });
  await new Promise(r => setTimeout(r, 20));
  assert.equal(calls, 1, "첫 시도 시작");
  // in-flight 상태에서 cancel.
  persist.cancel();
  // 그 시도가 늦게 실패해도 재시도가 발생해서는 안 된다.
  rejectWrite(new Error("late"));
  await new Promise(r => setTimeout(r, 50));

  assert.equal(calls, 1, "cancel 이후 추가 시도 없음");
  const s = persist.getStatus();
  assert.equal(s.pendingChanges, 0, "cancel은 pending을 비운다");
  assert.equal(s.cycleFailed, false);
  assert.equal(s.consecutiveFailures, 0, "cancelled 콜백은 카운터를 증가시키지 않는다");
});

test("[persist:retry] 백오프 대기 중 cancel()은 재시도를 중단시킨다", async () => {
  const snap = { v: 0 };
  let calls = 0;
  const persist = createDebouncedPersister(
    () => snap,
    async () => { calls += 1; throw new Error("nope"); },
    5,
    { maxAttempts: 5, baseDelayMs: 80 },
  );

  persist({ v: 1 });
  await new Promise(r => setTimeout(r, 30)); // 첫 시도 실패 후 백오프 진입
  assert.equal(calls, 1);
  persist.cancel();
  await new Promise(r => setTimeout(r, 200));
  assert.equal(calls, 1, "백오프 타이머가 취소되어 재시도 없음");
  assert.equal(persist.getStatus().pendingChanges, 0);
});

test("[persist] flush→cancel, cancel→flush 상호작용", async () => {
  const snap = { x: 0 };
  const writes: any[] = [];
  const persist = createDebouncedPersister(() => snap, (m) => { writes.push(m); }, 30);

  // flush 후 cancel: flush가 동기로 쓰고 끝났으니 cancel은 noop이어야 한다.
  persist({ x: 1 });
  persist.flush();
  persist.cancel();
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0], { x: 1 });

  // cancel 후 flush: pending 없으므로 write 없음.
  persist({ x: 2 });
  persist.cancel();
  persist.flush();
  await new Promise(r => setTimeout(r, 60));
  assert.equal(writes.length, 1, "cancel이 pending을 비웠으므로 추가 쓰기 없음");
});

test("[persist:retry] write가 sync void를 반환해도 기존처럼 동작한다(하위호환)", async () => {
  const snap = { k: 0 };
  const writes: any[] = [];
  const persist = createDebouncedPersister(() => snap, (m) => { writes.push(m); }, 10, { maxAttempts: 3, baseDelayMs: 20 });
  persist({ k: 5 });
  await new Promise(r => setTimeout(r, 40));
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0], { k: 5 });
  assert.equal(persist.getStatus().consecutiveFailures, 0);
});
