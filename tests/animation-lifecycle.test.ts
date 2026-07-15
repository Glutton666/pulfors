import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computePendulumAnim,
  computeGlowParams,
  pendulumPlan,
  glowPlan,
  PENDULUM_RETURN_HOME_MS,
  GLOW_RESET_MS,
} from "../lib/animation-lifecycle";

test("computePendulumAnim: 60 BPM → 1초 스윙, 35° 클램프", () => {
  const r = computePendulumAnim(60);
  assert.equal(r.swingDuration, 1000);
  assert.equal(r.maxAngle, 35);
});

test("computePendulumAnim: 120 BPM → 500ms, 각도 32°", () => {
  const r = computePendulumAnim(120);
  assert.equal(r.swingDuration, 500);
  assert.equal(r.maxAngle, 32);
});

test("computePendulumAnim: 240 BPM → 250ms, 각도 16°", () => {
  const r = computePendulumAnim(240);
  assert.equal(r.swingDuration, 250);
  assert.equal(r.maxAngle, 24);
});

test("computePendulumAnim: 400 BPM → 각도 15°로 클램프", () => {
  const r = computePendulumAnim(400);
  assert.equal(r.maxAngle, 15);
});

test("computePendulumAnim: 0 BPM 방어(division-by-zero 없음)", () => {
  const r = computePendulumAnim(0);
  assert.ok(Number.isFinite(r.swingDuration));
  assert.ok(r.swingDuration > 0);
});

test("computePendulumAnim: side-to-side cadence가 1박자에 일치 (60·120·240 BPM)", () => {
  for (const bpm of [60, 120, 240]) {
    const beatMs = 60000 / bpm;
    assert.equal(computePendulumAnim(bpm).swingDuration, beatMs);
  }
});

test("computeGlowParams: 저 BPM은 기본 60/500ms", () => {
  const p = computeGlowParams(80);
  assert.equal(p.attackMs, 60);
  assert.equal(p.releaseMs, 500);
});

test("computeGlowParams: BPM≥180에서 release 단축돼 비트 간격 안에 끝남", () => {
  for (const bpm of [180, 200, 240, 300]) {
    const p = computeGlowParams(bpm);
    const beatInterval = 60000 / bpm;
    const total = p.attackMs + p.releaseMs;
    assert.ok(p.releaseMs < 500, `bpm=${bpm} release=${p.releaseMs} < 500`);
    // 글로우 총 길이가 다음 비트 트리거 시점을 크게 넘기지 않아야 한다 (≤ 1.5x).
    assert.ok(total <= beatInterval * 1.5 + 50, `bpm=${bpm} total=${total} interval=${beatInterval}`);
  }
});

test("computeGlowParams: release는 최소 120ms 보장", () => {
  const p = computeGlowParams(600);
  assert.ok(p.releaseMs >= 120);
});

// pendulumPlan / glowPlan: 컴포넌트가 reanimated 워클릿으로 매핑하는 결정론적
// 명령 시퀀스를 검증한다. 항상 cancel이 첫 번째여야 이전 사이클이 잔존하지 않는다.

test("pendulumPlan: 정지 → cancel + returnHome", () => {
  const ops = pendulumPlan({ isPlaying: false, maxAngle: 30, swingDuration: 500 });
  assert.equal(ops.length, 2);
  assert.equal(ops[0].type, "cancel");
  assert.deepEqual(ops[1], { type: "returnHome", duration: PENDULUM_RETURN_HOME_MS });
});

test("pendulumPlan: 재생 중 → cancel 후 swing 시퀀스 시작", () => {
  const ops = pendulumPlan({ isPlaying: true, maxAngle: 28, swingDuration: 500 });
  assert.equal(ops.length, 2);
  assert.equal(ops[0].type, "cancel");
  assert.deepEqual(ops[1], { type: "swing", targetAngle: 28, duration: 500, maxAngle: 28 });
});

test("pendulumPlan: BPM 변경 시 swingDuration이 즉시 반영된다", () => {
  const slow = pendulumPlan({ isPlaying: true, maxAngle: 30, swingDuration: 1000 });
  const fast = pendulumPlan({ isPlaying: true, maxAngle: 20, swingDuration: 250 });
  // 속도 변경 시 항상 cancel이 먼저, 그리고 새 duration이 즉시 반영돼야 한다.
  assert.equal(slow[0].type, "cancel");
  assert.equal(fast[0].type, "cancel");
  assert.equal((slow[1] as { duration: number }).duration, 1000);
  assert.equal((fast[1] as { duration: number }).duration, 250);
});

test("glowPlan: 정지 → cancel + reset", () => {
  const ops = glowPlan({ isPlaying: false, currentBeat: 2, prevBeat: 1, bpm: 120 });
  assert.equal(ops.length, 2);
  assert.equal(ops[0].type, "cancel");
  assert.deepEqual(ops[1], { type: "reset", duration: GLOW_RESET_MS });
});

test("glowPlan: 새 비트 → cancel + pulse", () => {
  const ops = glowPlan({ isPlaying: true, currentBeat: 2, prevBeat: 1, bpm: 120 });
  assert.equal(ops.length, 2);
  assert.equal(ops[0].type, "cancel");
  const pulse = ops[1] as { type: "pulse"; attackMs: number; releaseMs: number };
  assert.equal(pulse.type, "pulse");
  assert.equal(pulse.attackMs, 60);
  assert.equal(pulse.releaseMs, 500);
});

test("glowPlan: 동일 비트 재호출은 no-op (중첩 트리거 차단)", () => {
  const ops = glowPlan({ isPlaying: true, currentBeat: 2, prevBeat: 2, bpm: 120 });
  assert.equal(ops.length, 0);
});

test("glowPlan: currentBeat<0이면 no-op (재생 직전 초기 상태)", () => {
  const ops = glowPlan({ isPlaying: true, currentBeat: -1, prevBeat: -1, bpm: 120 });
  assert.equal(ops.length, 0);
});

test("glowPlan: 고 BPM(240)에서 pulse release가 단축돼 비트 간격 안에 끝난다", () => {
  const ops = glowPlan({ isPlaying: true, currentBeat: 0, prevBeat: -1, bpm: 240 });
  const pulse = ops[1] as { type: "pulse"; attackMs: number; releaseMs: number };
  const beatInterval = 60000 / 240; // 250ms
  assert.ok(pulse.releaseMs < 500, `release=${pulse.releaseMs}`);
  assert.ok(pulse.attackMs + pulse.releaseMs <= beatInterval * 1.5 + 50);
});

// 가짜 reanimated 워클릿: cancel/withTiming 호출 순서를 기록해 컴포넌트
// 효과가 plan을 충실히 매핑하는지 시뮬레이션한다.
test("pendulumPlan: BPM 변경 시퀀스를 fake driver에 흘려보내면 cancel이 먼저 실행된다", () => {
  const calls: string[] = [];
  const drive = (ops: ReturnType<typeof pendulumPlan>) => {
    for (const op of ops) {
      if (op.type === "cancel") calls.push("cancel");
      else if (op.type === "returnHome") calls.push(`home:${op.duration}`);
      else calls.push(`swing:${op.duration}@${op.targetAngle}`);
    }
  };
  drive(pendulumPlan({ isPlaying: true, maxAngle: 30, swingDuration: 1000 }));
  drive(pendulumPlan({ isPlaying: true, maxAngle: 25, swingDuration: 500 }));
  drive(pendulumPlan({ isPlaying: false, maxAngle: 25, swingDuration: 500 }));
  assert.deepEqual(calls, [
    "cancel", "swing:1000@30",
    "cancel", "swing:500@25",
    "cancel", `home:${PENDULUM_RETURN_HOME_MS}`,
  ]);
});

test("glowPlan: 연속 비트마다 cancel이 호출돼 글로우가 중첩되지 않는다", () => {
  const calls: string[] = [];
  const drive = (ops: ReturnType<typeof glowPlan>) => {
    for (const op of ops) {
      if (op.type === "cancel") calls.push("cancel");
      else if (op.type === "reset") calls.push("reset");
      else calls.push(`pulse:${op.attackMs}/${op.releaseMs}`);
    }
  };
  // 240 BPM: 4박자 연속 트리거
  drive(glowPlan({ isPlaying: true, currentBeat: 0, prevBeat: -1, bpm: 240 }));
  drive(glowPlan({ isPlaying: true, currentBeat: 1, prevBeat: 0, bpm: 240 }));
  drive(glowPlan({ isPlaying: true, currentBeat: 2, prevBeat: 1, bpm: 240 }));
  drive(glowPlan({ isPlaying: true, currentBeat: 3, prevBeat: 2, bpm: 240 }));
  const cancelCount = calls.filter((c) => c === "cancel").length;
  const pulseCount = calls.filter((c) => c.startsWith("pulse:")).length;
  assert.equal(cancelCount, 4, "각 비트마다 cancel이 호출돼야 함");
  assert.equal(pulseCount, 4, "각 비트마다 pulse가 한 번씩만 시작돼야 함");
});
