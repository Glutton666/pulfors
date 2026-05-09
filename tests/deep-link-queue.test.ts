/**
 * deep-link-queue.test.ts
 *
 * DeepLinkQueue 순수 클래스의 cold-start 큐 동작 검증.
 * - Task #109 에서 추가된 pendingCommandRef / setCommandHandler replay 로직을
 *   lib/deep-link-queue.ts 로 추출한 뒤 이 테스트로 회귀를 방지한다.
 */

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { DeepLinkQueue } from "../lib/deep-link-queue";
import type { VoiceCommand } from "../lib/voice-commands";

const PLAY: VoiceCommand = { type: "play" };
const STOP: VoiceCommand = { type: "stop" };
const SET_BPM: VoiceCommand = { type: "setBpm", bpm: 140 };

let q: DeepLinkQueue;

beforeEach(() => {
  q = new DeepLinkQueue();
});

// ─── 핸들러 없는 상태 ────────────────────────────────────────────────────────

describe("핸들러 미등록 상태에서 dispatch()", () => {
  test("명령이 pending 에 보관된다", () => {
    q.dispatch(PLAY);
    assert.deepEqual(q.pending, PLAY);
  });

  test("dispatch() 반환값이 true (보관됨)", () => {
    const queued = q.dispatch(PLAY);
    assert.equal(queued, true);
  });

  test("여러 번 dispatch() 하면 마지막 명령만 보관된다 (latest-wins)", () => {
    q.dispatch(PLAY);
    q.dispatch(STOP);
    q.dispatch(SET_BPM);
    assert.deepEqual(q.pending, SET_BPM);
  });

  test("핸들러를 해제(null)한 뒤 dispatch() 해도 즉시 호출되지 않는다", () => {
    const received: VoiceCommand[] = [];
    q.setHandler((cmd) => received.push(cmd));
    q.setHandler(null);
    q.dispatch(PLAY);
    assert.deepEqual(received, []);
  });
});

// ─── 핸들러 등록 시 재전달 ────────────────────────────────────────────────────

describe("setHandler() 로 핸들러 등록 시 pending 재전달", () => {
  test("dispatch() 후 setHandler() → 핸들러가 pending 명령을 받는다", () => {
    const received: VoiceCommand[] = [];
    q.dispatch(PLAY);
    q.setHandler((cmd) => received.push(cmd));
    assert.deepEqual(received, [PLAY]);
  });

  test("재전달 후 pending 이 null 로 지워진다", () => {
    q.dispatch(PLAY);
    q.setHandler(() => {});
    assert.equal(q.pending, null);
  });

  test("여러 명령 중 마지막 것만 재전달된다", () => {
    const received: VoiceCommand[] = [];
    q.dispatch(PLAY);
    q.dispatch(STOP);
    q.dispatch(SET_BPM);
    q.setHandler((cmd) => received.push(cmd));
    assert.deepEqual(received, [SET_BPM]);
  });

  test("pending 없이 setHandler() 호출 → 핸들러는 호출되지 않는다", () => {
    const received: VoiceCommand[] = [];
    q.setHandler((cmd) => received.push(cmd));
    assert.deepEqual(received, []);
  });
});

// ─── 핸들러 등록 후 dispatch() ───────────────────────────────────────────────

describe("핸들러 등록 후 dispatch() — 즉시 전달", () => {
  test("핸들러가 있으면 dispatch() 시 즉시 호출된다", () => {
    const received: VoiceCommand[] = [];
    q.setHandler((cmd) => received.push(cmd));
    q.dispatch(PLAY);
    assert.deepEqual(received, [PLAY]);
  });

  test("dispatch() 반환값이 false (보관되지 않음)", () => {
    q.setHandler(() => {});
    const queued = q.dispatch(PLAY);
    assert.equal(queued, false);
  });

  test("즉시 전달 후 pending 은 null 상태를 유지한다", () => {
    q.setHandler(() => {});
    q.dispatch(PLAY);
    assert.equal(q.pending, null);
  });

  test("핸들러가 있으면 연속 dispatch() 모두 즉시 전달된다", () => {
    const received: VoiceCommand[] = [];
    q.setHandler((cmd) => received.push(cmd));
    q.dispatch(PLAY);
    q.dispatch(STOP);
    q.dispatch(SET_BPM);
    assert.deepEqual(received, [PLAY, STOP, SET_BPM]);
  });
});

// ─── 핸들러 null 해제 후 동작 ────────────────────────────────────────────────

describe("setHandler(null) 해제 후 동작", () => {
  test("해제 후 dispatch() → pending 에 보관된다", () => {
    q.setHandler(() => {});
    q.setHandler(null);
    q.dispatch(PLAY);
    assert.deepEqual(q.pending, PLAY);
  });

  test("해제 후 새 핸들러 등록 → pending 재전달", () => {
    q.setHandler(() => {});
    q.setHandler(null);
    q.dispatch(STOP);
    const received: VoiceCommand[] = [];
    q.setHandler((cmd) => received.push(cmd));
    assert.deepEqual(received, [STOP]);
  });

  test("setHandler(null) 로 pending 이 있어도 재전달되지 않는다", () => {
    q.dispatch(PLAY);
    q.setHandler(null);
    assert.deepEqual(q.pending, PLAY);
  });
});

// ─── 핸들러 예외 처리 ────────────────────────────────────────────────────────

describe("핸들러 예외는 호출자에게 전파된다", () => {
  test("dispatch() 중 핸들러 예외 → 호출자에게 throw", () => {
    q.setHandler(() => { throw new Error("boom"); });
    assert.throws(() => q.dispatch(PLAY), /boom/);
  });

  test("setHandler() 내 재전달 중 예외 → 호출자에게 throw", () => {
    q.dispatch(PLAY);
    assert.throws(
      () => q.setHandler(() => { throw new Error("replay-error"); }),
      /replay-error/,
    );
  });

  test("재전달 예외 후 pending 은 null 이 된다 (재시도 방지)", () => {
    q.dispatch(PLAY);
    try {
      q.setHandler(() => { throw new Error("fail"); });
    } catch {}
    assert.equal(q.pending, null);
  });
});

// ─── reset() ─────────────────────────────────────────────────────────────────

describe("reset() — 상태 초기화", () => {
  test("handler 와 pending 이 null 로 초기화된다", () => {
    q.setHandler(() => {});
    q.dispatch(PLAY);
    q.setHandler(null);
    q.dispatch(STOP);
    q.reset();
    assert.equal(q.handler, null);
    assert.equal(q.pending, null);
  });
});
