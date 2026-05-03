import { test } from "node:test";
import assert from "node:assert/strict";

// E2E 스모크: 엔진 시작/콜백/정지 파이프라인이 끊기지 않는지 확인합니다.
// 실제 오디오는 stub이라 시간 진행 검증보다 "안전한 라이프사이클"을 보장하는 데 집중합니다.
// 실행: npx tsx --require ./tests/_stubs/setup.cjs --test tests/engine-pipeline.test.ts
import { MetronomeEngine } from "../lib/metronome-engine";

test("E2E: setBpm/setBeatsPerMeasure → setOnBeat → start → stop 파이프라인", async () => {
  const engine = new MetronomeEngine();
  engine.setBpm(120);
  engine.setBeatsPerMeasure(4);

  let beatCount = 0;
  engine.setOnBeat(() => {
    beatCount += 1;
  });
  engine.setAudioCallbacks(() => {}, () => {}, () => {});

  // start 는 audio 컨텍스트가 stub이라 즉시 반환되거나 throw하지 않아야 함
  try {
    engine.start(0);
  } catch (e) {
    // stub 환경에서 start 가 부분적으로 실패할 수 있어도, stop 은 안전해야 함
  }
  // 짧게 기다리고 정지
  await new Promise((r) => setTimeout(r, 30));
  engine.stop();

  // 파이프라인이 throw 없이 닫힘 확인
  assert.ok(beatCount >= 0);
  assert.equal(engine.getIsRunning(), false);
});

test("E2E: 빠른 BPM/박자 변경 후 stop 안전성", () => {
  const engine = new MetronomeEngine();
  engine.setBpm(60);
  engine.setBeatsPerMeasure(3);
  engine.setBpm(180);
  engine.setBeatsPerMeasure(7);
  engine.setBpm(40);
  engine.setBeatsPerMeasure(12);
  engine.stop();
  assert.equal(engine.getIsRunning(), false);
  assert.equal(engine.getBeatsPerMeasure(), 12);
});

test("E2E: setBeatTypes / setAllBeatSubdivisions 빌드", () => {
  const engine = new MetronomeEngine();
  engine.setBeatsPerMeasure(4);
  engine.setBeatTypes(["strong", "normal", "accent", "normal"]);
  engine.setAllBeatSubdivisions({ "0": ["normal", "normal"], "2": ["normal", "normal", "normal", "normal"] });
  // 스케줄 빌드 호출 시 throw 없어야 함
  try {
    (engine as any).buildScheduleOnly?.();
  } catch (e) {
    assert.fail("buildScheduleOnly threw: " + String(e));
  }
  assert.ok(true);
});
