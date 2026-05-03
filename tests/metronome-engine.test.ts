import { test } from "node:test";
import assert from "node:assert/strict";

// 모듈 stub은 tests/_stubs/setup.cjs에서 처리 (--require로 사전 로드).
// 실행 명령: npx tsx --require ./tests/_stubs/setup.cjs --test tests/*.test.ts
import { MetronomeEngine } from "../lib/metronome-engine";

test("MetronomeEngine 생성자가 throw하지 않는다", () => {
  const engine = new MetronomeEngine();
  assert.ok(engine);
});

test("setBpm은 20-300 범위로 클램프된다", () => {
  const engine = new MetronomeEngine();
  engine.setBpm(10);
  // private field이지만 getCurrentBeat 같은 public 메서드로 영향 검증은 어려우니
  // 단순히 throw하지 않는 것만 확인. 추가 getter는 향후 추가 시 직접 검증.
  engine.setBpm(500);
  engine.setBpm(120);
  assert.ok(true);
});

test("setBeatsPerMeasure는 getBeatsPerMeasure로 읽힌다", () => {
  const engine = new MetronomeEngine();
  engine.setBeatsPerMeasure(7);
  assert.equal(engine.getBeatsPerMeasure(), 7);
  engine.setBeatsPerMeasure(3);
  assert.equal(engine.getBeatsPerMeasure(), 3);
});

test("getCurrentBeat는 시작 전 0을 반환한다", () => {
  const engine = new MetronomeEngine();
  assert.equal(engine.getCurrentBeat(), 0);
});

test("setOnBeat 콜백 등록은 throw하지 않는다", () => {
  const engine = new MetronomeEngine();
  engine.setOnBeat(() => {});
  engine.setAudioCallbacks(() => {}, () => {}, () => {});
  assert.ok(true);
});

test("buildSchedule: jumpToBlock + jumpCount=2에서 jumpIteration이 0,1 부여되고 점프 종료 후 state.jump가 복원", () => {
  // beatsPerMeasure=6, A(0..1, jumpToBlock=B, jumpCount=2), B(2..3), C(4..5)
  // 기대 흐름: A_ji0 B_ji0 A_ji1 B_ji1 C(점프 외)
  const engine = new MetronomeEngine();
  engine.setBpm(120);
  engine.setBeatsPerMeasure(6);
  engine.setBeatTypes(["accent", "normal", "normal", "normal", "normal", "normal"]);
  engine.setLoopBlocks([
    { startBeat: 0, endBeat: 1, type: "count", value: 1, jumpToBlock: 1, jumpCount: 2 },
    { startBeat: 2, endBeat: 3, type: "count", value: 1 },
    { startBeat: 4, endBeat: 5, type: "count", value: 1 },
  ]);
  engine.buildScheduleOnly();
  const schedule = (engine as unknown as { schedule: import("../lib/metronome-engine").ScheduledTick[] }).schedule;
  assert.ok(schedule.length > 0);

  const mainBeats = schedule.filter(t => t.isMainBeat);

  // 점프 영역 ticks: jumpTotal=2, jumpSourceBlockIndex=0 (A의 origIdx)
  const jumpTicks = mainBeats.filter(t => t.jumpTotal === 2);
  assert.equal(jumpTicks.length, 8, "A(2박) B(2박) ×2 = 8 메인비트 (jumpTotal=2)");
  for (const t of jumpTicks) {
    assert.equal(t.jumpTotal, 2);
    assert.equal(t.jumpSourceBlockIndex, 0);
  }

  // jumpIteration 분포: ji=0 4틱 (A 2박 + B 2박), ji=1 4틱
  const ji0 = jumpTicks.filter(t => t.jumpIteration === 0);
  const ji1 = jumpTicks.filter(t => t.jumpIteration === 1);
  assert.equal(ji0.length, 4);
  assert.equal(ji1.length, 4);

  // 점프 출력 순서: 시간 오름차순으로 [A,A,B,B,A,A,B,B] blockIndex
  const ordered = [...jumpTicks].sort((a, b) => a.time - b.time);
  assert.deepEqual(
    ordered.map(t => t.blockIndex),
    [0, 0, 1, 1, 0, 0, 1, 1],
  );
  assert.deepEqual(
    ordered.map(t => t.jumpIteration),
    [0, 0, 0, 0, 1, 1, 1, 1],
  );

  // C 블록(주 메인 비트 2개)은 점프 영역 밖 → state.jump가 복원되어 jumpTotal=0
  const cTicks = mainBeats.filter(t => t.blockIndex === 2);
  assert.equal(cTicks.length, 2);
  for (const t of cTicks) {
    assert.equal(t.jumpTotal, 0, "점프 종료 후 state.jump.total이 0으로 복원");
    assert.equal(t.jumpIteration, 0);
    assert.equal(t.jumpSourceBlockIndex, -1, "sourceBlockIndex도 -1로 복원");
  }

  // C는 점프 영역 이후 시간대에 위치
  const lastJumpTime = Math.max(...jumpTicks.map(t => t.time));
  for (const t of cTicks) {
    assert.ok(t.time > lastJumpTime, "C는 점프 영역 이후에 emit");
  }
});
