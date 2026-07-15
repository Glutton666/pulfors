// rAF 배처 단위 테스트.
// Task #39: 시각용 setState가 프레임당 1회 이하로 합쳐지는지 보장.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRafBatcher } from "../lib/raf-batcher";

function makeFakeRaf() {
  const queue: { id: number; cb: () => void }[] = [];
  let nextId = 1;
  const raf = (cb: () => void) => {
    const id = nextId++;
    queue.push({ id, cb });
    return id;
  };
  const cancel = (id: number) => {
    const idx = queue.findIndex(q => q.id === id);
    if (idx >= 0) queue.splice(idx, 1);
  };
  const tick = () => {
    const drain = queue.splice(0, queue.length);
    for (const { cb } of drain) cb();
  };
  return { raf, cancel, tick, queue };
}

test("[raf-batcher] 단일 프레임 내 다중 schedule()은 한 번만 flush", () => {
  const { raf, cancel, tick } = makeFakeRaf();
  let flushes = 0;
  const b = createRafBatcher(() => { flushes += 1; }, { raf, cancelRaf: cancel });

  for (let i = 0; i < 1000; i++) b.schedule();
  assert.equal(flushes, 0, "프레임 전에는 flush 없음");
  tick();
  assert.equal(flushes, 1, "프레임당 정확히 1회");
});

test("[raf-batcher] flush 후 다음 schedule()은 새 프레임을 예약", () => {
  const { raf, cancel, tick } = makeFakeRaf();
  let flushes = 0;
  const b = createRafBatcher(() => { flushes += 1; }, { raf, cancelRaf: cancel });

  b.schedule(); tick(); assert.equal(flushes, 1);
  b.schedule(); b.schedule(); tick(); assert.equal(flushes, 2);
});

test("[raf-batcher] cancel()은 보류 중인 flush를 취소한다", () => {
  const { raf, cancel, tick } = makeFakeRaf();
  let flushes = 0;
  const b = createRafBatcher(() => { flushes += 1; }, { raf, cancelRaf: cancel });

  b.schedule();
  b.cancel();
  tick();
  assert.equal(flushes, 0);
  // cancel 후 schedule은 다시 예약 가능해야 한다.
  b.schedule(); tick();
  assert.equal(flushes, 1);
});

test("[raf-batcher] flushNow()는 즉시 실행하고 보류 중인 프레임을 취소", () => {
  const { raf, cancel, tick } = makeFakeRaf();
  let flushes = 0;
  const b = createRafBatcher(() => { flushes += 1; }, { raf, cancelRaf: cancel });

  b.schedule();
  b.flushNow();
  assert.equal(flushes, 1);
  tick(); // 취소되었으므로 추가 flush 없음
  assert.equal(flushes, 1);
});

test("[raf-batcher] BPM 200 · 16서브비트(초당 ≈53회 schedule) 시 1초간 setState ≤ 60", () => {
  // 시뮬레이션: 1초 동안 sub-beat 53회 호출 + main beat 3회 호출 + progress 3회 호출
  // = 총 ~59 schedule. raf는 60Hz로 흐른다. flush 횟수가 60 이하여야 한다.
  const { raf, cancel, tick } = makeFakeRaf();
  let flushes = 0;
  const b = createRafBatcher(() => { flushes += 1; }, { raf, cancelRaf: cancel });

  const FRAME_MS = 1000 / 60;
  const SUB_BEATS_PER_SEC = (200 * 16) / 60; // ≈ 53.33
  const MAIN_BEATS_PER_SEC = 200 / 60;       // ≈ 3.33

  // 0..1000ms 사이의 모든 이벤트 시각을 만든 뒤 시간순으로 dispatch.
  const events: number[] = [];
  for (let i = 0; i < SUB_BEATS_PER_SEC; i++) events.push((i / SUB_BEATS_PER_SEC) * 1000);
  for (let i = 0; i < MAIN_BEATS_PER_SEC; i++) events.push((i / MAIN_BEATS_PER_SEC) * 1000);
  for (let i = 0; i < MAIN_BEATS_PER_SEC; i++) events.push((i / MAIN_BEATS_PER_SEC) * 1000); // onProgress
  events.sort((a, b) => a - b);

  let frameTime = FRAME_MS;
  let evIdx = 0;
  for (let t = 0; t <= 1000; t += 0.5) {
    // 이 시점까지의 모든 이벤트 schedule
    while (evIdx < events.length && events[evIdx] <= t) {
      b.schedule();
      evIdx += 1;
    }
    if (t >= frameTime) {
      tick();
      frameTime += FRAME_MS;
    }
  }
  // 잔여 schedule 처리 위해 마지막 프레임 한 번 더
  tick();

  assert.ok(flushes <= 60, `flushes(${flushes}) <= 60Hz`);
  // 모든 이벤트가 어떤 프레임에는 묶여 처리됐어야 함(드롭 없음 확인을 위해 flushes ≥ 1)
  assert.ok(flushes >= 1);
});

test("[raf-batcher] 지속 200Hz schedule 부하에서도 flush ≤ frame 수", () => {
  // Architect 권고: BPM 200·16서브비트 시나리오는 ~53/s로 비교적 낮으니,
  // 더 강하게 200/s 지속 입력에서도 60Hz 캡이 유지되는지 확인.
  const { raf, cancel, tick } = makeFakeRaf();
  let flushes = 0;
  const b = createRafBatcher(() => { flushes += 1; }, { raf, cancelRaf: cancel });

  const FRAME_MS = 1000 / 60;
  const SCHEDULE_HZ = 200;
  const STEP_MS = 1000 / SCHEDULE_HZ; // 5ms
  let nextFrame = FRAME_MS;
  let frames = 0;
  for (let t = 0; t <= 1000; t += STEP_MS) {
    b.schedule();
    while (t >= nextFrame) {
      tick();
      frames += 1;
      nextFrame += FRAME_MS;
    }
  }
  tick(); frames += 1;

  assert.ok(flushes <= frames, `flushes(${flushes}) <= frames(${frames})`);
  assert.ok(flushes <= 61, `flushes(${flushes}) <= ~60Hz`);
  assert.ok(flushes >= 50, `flushes(${flushes}) ≈ frame rate (입력이 충분히 빠를 때)`);
});

test("[raf-batcher] schedule 비율이 raf보다 낮으면 flush == schedule 횟수", () => {
  const { raf, cancel, tick } = makeFakeRaf();
  let flushes = 0;
  const b = createRafBatcher(() => { flushes += 1; }, { raf, cancelRaf: cancel });

  for (let i = 0; i < 5; i++) {
    b.schedule();
    tick();
  }
  assert.equal(flushes, 5);
});

test("[raf-batcher] requestAnimationFrame 미지원 환경 폴백(setTimeout 16ms)", async () => {
  // raf 옵션을 명시적으로 빼고, globalThis.requestAnimationFrame을 잠시 제거.
  type RafHolder = { requestAnimationFrame?: (cb: () => void) => number };
  const g: RafHolder = globalThis;
  const orig = g.requestAnimationFrame;
  delete g.requestAnimationFrame;
  let flushes = 0;
  const b = createRafBatcher(() => { flushes += 1; });
  b.schedule();
  assert.equal(flushes, 0);
  await new Promise(r => setTimeout(r, 30));
  assert.equal(flushes, 1, "setTimeout 폴백이 한 프레임 뒤에 flush");
  g.requestAnimationFrame = orig;
});
