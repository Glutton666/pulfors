import { test } from "node:test";
import assert from "node:assert/strict";

import {
  EasterEggRotationTracker,
  usesSharedEasterEggGesture,
} from "../lib/easter-egg-gesture";

const center = { x: 100, y: 100 };

function pointAt(angle: number) {
  const radians = angle * (Math.PI / 180);
  return { x: center.x + Math.cos(radians) * 50, y: center.y + Math.sin(radians) * 50 };
}

function rotate(tracker: EasterEggRotationTracker, turns: number) {
  tracker.start(center, pointAt(0));
  for (let step = 1; step <= turns; step++) {
    tracker.move(pointAt(step * 90));
  }
  return tracker.end();
}

test("이스터 에그 회전 누적은 여러 제스처에 걸쳐 같은 방향으로 7바퀴를 센다", () => {
  const tracker = new EasterEggRotationTracker();

  assert.equal(rotate(tracker, 14), null);
  assert.deepEqual(rotate(tracker, 14), { isHighRange: false });
});

test("이스터 에그 회전 방향이 반전되면 이전 방향 누적을 버린다", () => {
  const tracker = new EasterEggRotationTracker();

  assert.equal(rotate(tracker, 14), null);
  tracker.start(center, pointAt(0));
  for (let step = 1; step <= 14; step++) tracker.move(pointAt(-step * 90));
  assert.equal(tracker.end(), null);
  assert.equal(rotate(tracker, 14), null);
});

test("긴 회전은 고범위 BPM 문제를 요청한다", () => {
  const tracker = new EasterEggRotationTracker();

  assert.deepEqual(rotate(tracker, 42), { isHighRange: true });
});

test("비트 외 화면과 폴리곤은 공용 이스터 에그 감지를 사용한다", () => {
  assert.equal(usesSharedEasterEggGesture("beat", false), false);
  assert.equal(usesSharedEasterEggGesture("beat", true), true);

  for (const mode of ["bar", "note", "stage", "practice", "score", "menu"]) {
    assert.equal(usesSharedEasterEggGesture(mode, false), true);
  }
});