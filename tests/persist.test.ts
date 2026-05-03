// lib/persist.ts 단위 테스트.
// 디바운스 머지 시멘틱이 향후 setting 추가 시 회귀 없도록 락하는 가드.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createDebouncedPersister } from "../lib/persist";

test("[persist] 디바운스 윈도우 내 다중 호출은 한 번만 write로 flush된다", async () => {
  let snapshot = { a: 1, b: 2, c: 3 };
  const writes: typeof snapshot[] = [];
  const persist = createDebouncedPersister(() => snapshot, (m) => writes.push(m), 30);

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
  const persist = createDebouncedPersister(() => snapshot, (m) => writes.push(m), 100);

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
  const persist = createDebouncedPersister(() => ({ ...base }), (m) => writes.push(m), 20);

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
  const persist = createDebouncedPersister(() => snapshot, (m) => writes.push(m), 20);
  persist.flush();
  await new Promise(r => setTimeout(r, 40));
  assert.equal(writes.length, 0);
});
