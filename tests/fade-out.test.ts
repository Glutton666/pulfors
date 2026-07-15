import { test } from "node:test";
import assert from "node:assert/strict";
import { clampFadeOutMeasures } from "../lib/storage";

test("clampFadeOutMeasures: clamps to 1..64 and floors", () => {
  assert.equal(clampFadeOutMeasures(0), 1);
  assert.equal(clampFadeOutMeasures(-5), 1);
  assert.equal(clampFadeOutMeasures(1), 1);
  assert.equal(clampFadeOutMeasures(8), 8);
  assert.equal(clampFadeOutMeasures(64), 64);
  assert.equal(clampFadeOutMeasures(65), 64);
  assert.equal(clampFadeOutMeasures(1000), 64);
  assert.equal(clampFadeOutMeasures(3.7), 3);
  assert.equal(clampFadeOutMeasures(NaN), 1);
  assert.equal(clampFadeOutMeasures(Infinity), 1);
});

test("fade-out muted guard: all audio paths short-circuit when muted", () => {
  // 모든 click/sample 콜백은 진입 직후 fadeOutMutedRef를 검사한다.
  // 이 회귀 테스트는 app/index.tsx에 5개 클릭 가드 + 1개 샘플 가드가 존재함을 보장한다.
  const src = require("node:fs").readFileSync("app/index.tsx", "utf8") as string;
  const guards = src.match(/if \(fadeOutMutedRef\.current\)\s+return/g) || [];
  // high, low, strong, layer, block, customSample → 6
  if (guards.length < 6) {
    throw new Error(`fadeOutMutedRef 가드 수 부족: ${guards.length} (>=6 필요)`);
  }
});

test("fade-out phase computation: N/M/K boundaries", () => {
  // 시퀀스 N=2, M=2, K=2 → 6마디 후 종료
  // measureCount(elapsed): 1 audible1, 2 muted-onset, 3 muted, 4 audible2-onset, 5 audible2, 6 stop
  const N = 2, M = 2, K = 2;
  const total = N + M + K;
  const phaseAt = (elapsed: number): "audible1" | "muted" | "audible2" | "stop" => {
    if (elapsed >= total) return "stop";
    if (elapsed < N) return "audible1";
    if (elapsed < N + M) return "muted";
    return "audible2";
  };
  assert.equal(phaseAt(0), "audible1");
  assert.equal(phaseAt(1), "audible1");
  assert.equal(phaseAt(2), "muted");
  assert.equal(phaseAt(3), "muted");
  assert.equal(phaseAt(4), "audible2");
  assert.equal(phaseAt(5), "audible2");
  assert.equal(phaseAt(6), "stop");
});
