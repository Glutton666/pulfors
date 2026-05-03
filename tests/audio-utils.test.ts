import { test } from "node:test";
import assert from "node:assert/strict";
import { safePlay, safeSeekAndPlay, releaseRecorder, notifyAudioPoolFallback, computeRecommendedPoolSize } from "../lib/audio-utils";

test("computeRecommendedPoolSize: 저속(60BPM 1분할) → 2", () => {
  assert.equal(computeRecommendedPoolSize(60, 1), 2);
});

test("computeRecommendedPoolSize: 표준(120BPM 1분할) → 2", () => {
  assert.equal(computeRecommendedPoolSize(120, 1), 2);
});

test("computeRecommendedPoolSize: 중속(120BPM 4분할=8 hits/sec) → 3", () => {
  assert.equal(computeRecommendedPoolSize(120, 4), 3);
});

test("computeRecommendedPoolSize: 고속(200BPM 4분할≈13.3 hits/sec) → 4", () => {
  assert.equal(computeRecommendedPoolSize(200, 4), 4);
});

test("computeRecommendedPoolSize: 경계 hitsPerSec=5 → 2 (≤5)", () => {
  // 75BPM × 4 = 5 hits/sec
  assert.equal(computeRecommendedPoolSize(75, 4), 2);
});

test("computeRecommendedPoolSize: 경계 hitsPerSec=9 → 3 (≤9)", () => {
  // 135BPM × 4 = 9 hits/sec
  assert.equal(computeRecommendedPoolSize(135, 4), 3);
});

test("computeRecommendedPoolSize: 비정상 입력 클램프", () => {
  assert.equal(computeRecommendedPoolSize(NaN, NaN), 2);
  assert.equal(computeRecommendedPoolSize(-50, 0), 2);
  assert.equal(computeRecommendedPoolSize(99999, 99), 4);
});

test("computeRecommendedPoolSize: subdivision 소수점은 floor", () => {
  assert.equal(computeRecommendedPoolSize(120, 4.9), 3);
});


test("safePlay: null/undefined 안전 무시", () => {
  assert.doesNotThrow(() => safePlay(null, "t1"));
  assert.doesNotThrow(() => safePlay(undefined, "t1"));
  assert.doesNotThrow(() => safePlay({} as any, "t1"));
});

test("safePlay: 동기 throw 흡수, 호출 후 정상 진행", () => {
  let called = false;
  const player = {
    play: () => {
      called = true;
      throw new Error("boom");
    },
  };
  assert.doesNotThrow(() => safePlay(player, "sync-throw"));
  assert.equal(called, true);
});

test("safePlay: Promise rejection 흡수 (unhandledRejection 발생 안 함)", async () => {
  const player = {
    play: () => Promise.reject(new Error("rejected")),
  };
  safePlay(player, "async-reject");
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(true);
});

test("safePlay: Promise resolve 정상 처리", async () => {
  let resolved = false;
  const player = {
    play: () =>
      new Promise<void>((res) => {
        setTimeout(() => {
          resolved = true;
          res();
        }, 5);
      }),
  };
  safePlay(player, "async-ok");
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(resolved, true);
});

test("safeSeekAndPlay: null 안전", () => {
  assert.doesNotThrow(() => safeSeekAndPlay(null, 0, "t"));
  assert.doesNotThrow(() => safeSeekAndPlay(undefined, 0, "t"));
});

test("safeSeekAndPlay: 동기 seek + play 호출", () => {
  const calls: string[] = [];
  const player = {
    seekTo: (_s: number) => {
      calls.push("seek");
    },
    play: () => {
      calls.push("play");
    },
  };
  safeSeekAndPlay(player, 1.5, "sync-seek");
  assert.deepEqual(calls, ["seek", "play"]);
});

test("safeSeekAndPlay: 비동기 seek 후 play 호출", async () => {
  const calls: string[] = [];
  const player = {
    seekTo: (_s: number) =>
      new Promise<void>((res) => {
        setTimeout(() => {
          calls.push("seek");
          res();
        }, 5);
      }),
    play: () => {
      calls.push("play");
    },
  };
  safeSeekAndPlay(player, 0.5, "async-seek");
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(calls, ["seek", "play"]);
});

test("safeSeekAndPlay: seek 동기 throw 흡수, play 호출 안 함", () => {
  const calls: string[] = [];
  const player = {
    seekTo: () => {
      throw new Error("seek fail");
    },
    play: () => {
      calls.push("play");
    },
  };
  assert.doesNotThrow(() => safeSeekAndPlay(player, 0, "seek-throw"));
  assert.deepEqual(calls, []);
});

test("safeSeekAndPlay: seek Promise rejection 흡수", async () => {
  const player = {
    seekTo: () => Promise.reject(new Error("reject")),
    play: () => {},
  };
  safeSeekAndPlay(player, 0, "seek-reject");
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(true);
});

test("releaseRecorder: null 안전", async () => {
  await releaseRecorder(null, "t");
  await releaseRecorder(undefined, "t");
  assert.ok(true);
});

test("releaseRecorder: stop + remove 호출", async () => {
  const calls: string[] = [];
  const rec = {
    stop: () => {
      calls.push("stop");
    },
    remove: () => {
      calls.push("remove");
    },
  };
  await releaseRecorder(rec, "ok");
  assert.deepEqual(calls, ["stop", "remove"]);
});

test("releaseRecorder: stop 비동기 + remove 호출", async () => {
  const calls: string[] = [];
  const rec = {
    stop: () =>
      new Promise<void>((res) => {
        setTimeout(() => {
          calls.push("stop");
          res();
        }, 5);
      }),
    remove: () => {
      calls.push("remove");
    },
  };
  await releaseRecorder(rec, "async");
  assert.deepEqual(calls, ["stop", "remove"]);
});

test("releaseRecorder: stop throw해도 remove 호출됨", async () => {
  const calls: string[] = [];
  const rec = {
    stop: () => {
      calls.push("stop-throw");
      throw new Error("fail");
    },
    remove: () => {
      calls.push("remove");
    },
  };
  await releaseRecorder(rec, "stop-fail");
  assert.deepEqual(calls, ["stop-throw", "remove"]);
});

test("releaseRecorder: stop reject해도 remove 호출됨", async () => {
  const calls: string[] = [];
  const rec = {
    stop: () => Promise.reject(new Error("rej")),
    remove: () => {
      calls.push("remove");
    },
  };
  await releaseRecorder(rec, "stop-reject");
  assert.deepEqual(calls, ["remove"]);
});

test("releaseRecorder: remove 없어도 throw 안 함", async () => {
  const rec = { stop: () => {} };
  await releaseRecorder(rec as any, "no-remove");
  assert.ok(true);
});

test("notifyAudioPoolFallback: throw 없이 호출", () => {
  assert.doesNotThrow(() => notifyAudioPoolFallback("t1"));
  assert.doesNotThrow(() => notifyAudioPoolFallback("t2", { bpm: 200 }));
});
