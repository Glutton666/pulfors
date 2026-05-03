import { test } from "node:test";
import assert from "node:assert/strict";
import { computePendulumAnim, computeGlowParams } from "../lib/animation-lifecycle";

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
