import { test } from "node:test";
import assert from "node:assert/strict";

import { MetronomeEngine } from "../lib/metronome-engine";

type EngineInternals = {
  measureStartTime: number;
  measureDurationMs: number;
  anchorWallTime: number;
  anchorMeasureCount: number;
  anchorMeasureDurationMs: number;
  measureCount: number;
  preRenderedAudio: boolean;
  pendingOffsetTimers: Set<ReturnType<typeof setTimeout>>;
  rolloverToNextMeasure: () => void;
  fireTick: (tick: unknown) => void;
  fillRealtimeAudioLookAhead: (now: number) => void;
  schedule: { time: number; beat: number; subBeat: number; type: string; isMainBeat: boolean; layerIndex: number; blockIndex: number; barRepeatIteration: number; barRepeatTotal: number; repeatIteration: number; blockRepeatTotal: number; jumpIteration: number; jumpTotal: number; jumpSourceBlockIndex: number; layerBeat: number }[];
};

function withFakeNow<T>(startMs: number, fn: (advance: (ms: number) => void) => T): T {
  const real = globalThis.performance;
  let now = startMs;
  // @ts-expect-error - 테스트용 시계 stub
  globalThis.performance = { now: () => now };
  try {
    return fn((ms: number) => { now += ms; });
  } finally {
    globalThis.performance = real;
  }
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

test("measureStartTime: 100마디 진행 후 절대 기준선과 정확히 일치 (drift 0)", () => {
  withFakeNow(1000, () => {
    const e = new MetronomeEngine();
    e.setBpm(180);
    e.setBeatsPerMeasure(4);
    e.start();
    const dur = e.getMeasureDurationMs();
    const internals = e as unknown as EngineInternals;
    const anchor = internals.anchorWallTime;

    for (let i = 0; i < 100; i++) {
      internals.rolloverToNextMeasure();
    }

    assert.equal(internals.measureCount, 100);
    const expected = anchor + 100 * dur;
    assert.equal(
      internals.measureStartTime,
      expected,
      `100마디 후 measureStartTime이 anchor + 100*dur과 정확히 일치해야 함`,
    );
    e.stop();
  });
});

test("measureStartTime: 비정수 BPM 장시간 rollover도 callback 지연을 누적하지 않는다", () => {
  withFakeNow(2500, (advance) => {
    const e = new MetronomeEngine();
    e.setBpm(137);
    e.setBeatsPerMeasure(7);
    e.start();
    const internals = e as unknown as EngineInternals;
    const anchor = internals.anchorWallTime;
    const duration = e.getMeasureDurationMs();
    for (let i = 0; i < 10000; i++) {
      advance(i % 3);
      internals.rolloverToNextMeasure();
    }
    assert.equal(internals.measureStartTime, anchor + 10000 * duration);
    e.stop();
  });
});

test("pre-rendered timeline resync follows audio phase after a JS stall", () => {
  withFakeNow(1000, (advance) => {
    const e = new MetronomeEngine();
    e.setBpm(120);
    e.setBeatsPerMeasure(4);
    e.start();
    e.setPreRenderedAudio(true);
    advance(275);
    assert.equal(e.syncToMeasureElapsedMs(500, 40), true);
    assert.equal(e.getMeasureElapsedMs(), 500);
    assert.equal(e.syncToMeasureElapsedMs(520, 40), false);
    e.stop();
  });
});

test("timeline resync never reanchors real-time fallback output", () => {
  withFakeNow(1000, (advance) => {
    const e = new MetronomeEngine();
    e.setBpm(120);
    e.start();
    const start = e.getMeasureStartTime();
    advance(300);
    assert.equal(e.syncToMeasureElapsedMs(700, 40), false);
    assert.equal(e.getMeasureStartTime(), start);
    e.stop();
  });
});

test("web fallback reserves a 160ms audio-clock window once and survives a JS stall", () => {
  withFakeNow(1000, (advance) => {
    const engine = new MetronomeEngine();
    engine.setBpm(300);
    engine.setBeatsPerMeasure(4);
    engine.setBeatTypes(["accent", "normal", "normal", "normal"]);
    engine.buildScheduleOnly();
    const scheduled: Array<{ tick: EngineInternals["schedule"][number]; at: number }> = [];
    let immediateAudio = 0;
    engine.setAudioCallbacks(
      () => { immediateAudio += 1; },
      () => { immediateAudio += 1; },
      () => { immediateAudio += 1; },
    );
    engine.setRealtimeAudioScheduler((tick, at) => {
      scheduled.push({ tick: tick as EngineInternals["schedule"][number], at });
      return true;
    });
    engine.start({ measureStartAt: 1100 });
    const internals = engine as unknown as EngineInternals;

    assert.equal(scheduled.length, 1, "first 160ms window only contains the downbeat");
    assert.equal(scheduled[0].at, 1100, "deadline is the absolute performance timeline");
    internals.fillRealtimeAudioLookAhead(1000);
    assert.equal(scheduled.length, 1, "the same tick is never queued twice");

    advance(220);
    internals.fireTick(scheduled[0].tick);
    assert.equal(immediateAudio, 0, "a late JS callback does not replay already-reserved audio");
    assert.equal(scheduled[0].at, 1100, "the reserved audio deadline does not move with the stall");
    engine.stop();
  });
});

test("fallback reservations are cancelled on schedule replacement and stop", () => {
  withFakeNow(2000, () => {
    const engine = new MetronomeEngine();
    let clears = 0;
    engine.setRealtimeAudioScheduler(() => true, () => { clears += 1; });
    engine.start();
    const afterStart = clears;
    engine.setBpm(180);
    assert.ok(clears > afterStart, "a settings rebuild clears stale reservations");
    const afterRebuild = clears;
    engine.stop();
    assert.ok(clears > afterRebuild, "stop clears every future source");
  });
});

test("look-ahead does not reclaim Polygon-muted base clicks", () => {
  withFakeNow(3000, () => {
    const engine = new MetronomeEngine();
    const internals = engine as unknown as EngineInternals & { isRunning: boolean };
    engine.setBaseClickMuted(true);
    engine.buildScheduleOnly();
    internals.isRunning = true;
    internals.measureStartTime = 3000;
    let reservations = 0;
    let immediateAudio = 0;
    engine.setRealtimeAudioScheduler(() => { reservations += 1; return true; });
    engine.setAudioCallbacks(
      () => { immediateAudio += 1; },
      () => { immediateAudio += 1; },
      () => { immediateAudio += 1; },
    );

    internals.fillRealtimeAudioLookAhead(3000);
    internals.fireTick(internals.schedule[0]);
    assert.equal(reservations, 0, "muted base audio remains outside the reservation queue");
    assert.equal(immediateAudio, 0, "the ordinary path still honors baseClickMuted");
    engine.stop();
  });
});

test("look-ahead leaves layer and block sound-set ticks on their specialized callbacks", () => {
  withFakeNow(4000, () => {
    const engine = new MetronomeEngine();
    const internals = engine as unknown as EngineInternals & { isRunning: boolean };
    const baseTick = {
      time: 0, beat: 0, subBeat: 0, type: "accent", isMainBeat: true,
      layerIndex: 0, layerBeat: 0, blockIndex: 0,
      blockRepeatTotal: 0, repeatIteration: 0,
      barRepeatIteration: 0, barRepeatTotal: 0,
      jumpIteration: 0, jumpTotal: 0, jumpSourceBlockIndex: -1,
    } as EngineInternals["schedule"][number];
    const layerTick = { ...baseTick, layerIndex: 1 } as EngineInternals["schedule"][number];
    engine.setLoopBlocks([{ startBeat: 0, endBeat: 0, type: "count", value: 1, soundSet: "woodblock" }]);
    internals.schedule = [baseTick, layerTick];
    internals.measureStartTime = 4000;
    internals.isRunning = true;
    let reservations = 0;
    let blockCalls = 0;
    let layerCalls = 0;
    engine.setRealtimeAudioScheduler(() => { reservations += 1; return true; });
    engine.setBlockAudioCallback(() => { blockCalls += 1; });
    engine.setLayerAudioCallback(() => { layerCalls += 1; });

    internals.fillRealtimeAudioLookAhead(4000);
    internals.fireTick(baseTick);
    internals.fireTick(layerTick);
    assert.equal(reservations, 0, "specialized timbres are not claimed by the global click queue");
    assert.equal(blockCalls, 1);
    assert.equal(layerCalls, 1);
    engine.stop();
  });
});

test("measureStartTime: BPM 변경 후 anchor가 재고정되어 새 길이로 누적", () => {
  withFakeNow(0, (advance) => {
    const e = new MetronomeEngine();
    e.setBpm(120);
    e.setBeatsPerMeasure(4);
    e.start();
    const dur1 = e.getMeasureDurationMs();
    const internals = e as unknown as EngineInternals;

    // 5마디 진행
    for (let i = 0; i < 5; i++) internals.rolloverToNextMeasure();
    assert.equal(internals.measureStartTime, 5 * dur1);

    // 시간 진행 후 BPM 변경 (rebuildSchedule 호출 → anchor 재고정)
    advance(100);
    e.setBpm(180);
    const dur2 = e.getMeasureDurationMs();
    assert.notEqual(dur1, dur2);

    const startAfterBpm = internals.measureStartTime;
    const countAfterBpm = internals.measureCount;
    assert.equal(internals.anchorWallTime, startAfterBpm);
    assert.equal(internals.anchorMeasureCount, countAfterBpm);
    assert.equal(internals.anchorMeasureDurationMs, dur2);

    // 추가 10마디 진행 → 새 길이로 정확히 누적
    for (let i = 0; i < 10; i++) internals.rolloverToNextMeasure();
    assert.equal(internals.measureStartTime, startAfterBpm + 10 * dur2);
    e.stop();
  });
});

test("offset > 0: stop() 후 잔여 setTimeout이 playTickAudio를 호출하지 않는다", async () => {
  const e = new MetronomeEngine();
  e.setBpm(120);
  e.setBeatsPerMeasure(4);
  e.setAudioOffsetMs(50);

  const calls: string[] = [];
  e.setAudioCallbacks(
    () => calls.push("high"),
    () => calls.push("low"),
    () => calls.push("strong"),
  );

  e.start();
  const internals = e as unknown as EngineInternals;
  // 명시적으로 fireTick 호출하여 setTimeout 1개를 등록
  internals.fireTick({
    time: 0,
    beat: 0,
    subBeat: 0,
    type: "normal",
    isMainBeat: true,
    layerIndex: 0,
    blockIndex: -1,
    barRepeatIteration: 0,
    barRepeatTotal: 1,
    repeatIteration: 0,
    blockRepeatTotal: 1,
    jumpIteration: 0,
    jumpTotal: 0,
    jumpSourceBlockIndex: -1,
    layerBeat: 0,
  });
  assert.ok(internals.pendingOffsetTimers.size > 0, "offset 타이머가 등록되어야 함");

  e.stop();
  assert.equal(internals.pendingOffsetTimers.size, 0, "stop() 후 보류 타이머가 즉시 비워져야 함");

  await sleep(120);
  // stop 후 실시간 click이 발화되지 않아야 함
  assert.equal(
    calls.filter(c => c === "low" || c === "high" || c === "strong").length,
    0,
    `stop 후 잔여 click이 발생: ${calls.join(",")}`,
  );
});

test("offset < 0: stop() 후 잔여 햅틱 setTimeout이 fireTickHaptic을 호출하지 않는다", async () => {
  const e = new MetronomeEngine();
  e.setBpm(120);
  e.setBeatsPerMeasure(4);
  e.setAudioOffsetMs(-40);

  e.start();
  const internals = e as unknown as EngineInternals;
  internals.fireTick({
    time: 0,
    beat: 0,
    subBeat: 0,
    type: "normal",
    isMainBeat: true,
    layerIndex: 0,
    blockIndex: -1,
    barRepeatIteration: 0,
    barRepeatTotal: 1,
    repeatIteration: 0,
    blockRepeatTotal: 1,
    jumpIteration: 0,
    jumpTotal: 0,
    jumpSourceBlockIndex: -1,
    layerBeat: 0,
  });
  assert.ok(internals.pendingOffsetTimers.size > 0);
  e.stop();
  assert.equal(internals.pendingOffsetTimers.size, 0);
  await sleep(80);
  // 추가 검증: 타이머가 모두 정리됐으므로 size 여전히 0
  assert.equal(internals.pendingOffsetTimers.size, 0);
});

test("takeover handshake: rebuildSchedule이 onScheduleRebuild 콜백 호출하되 preRenderedAudio를 자동 false로 만들지 않는다", () => {
  const e = new MetronomeEngine();
  e.setBpm(120);
  e.setBeatsPerMeasure(4);
  e.start();

  const internals = e as unknown as EngineInternals;
  e.setPreRenderedAudio(true);

  let callbackFired = 0;
  let preRenderedAtCallback: boolean | null = null;
  e.setOnScheduleRebuild(() => {
    callbackFired += 1;
    // 콜백 진입 시점에는 아직 preRenderedAudio가 true여야 한다 (이중 발화 방지).
    preRenderedAtCallback = internals.preRenderedAudio;
  });

  // BPM 변경으로 rebuildSchedule 트리거
  e.setBpm(180);

  assert.equal(callbackFired, 1, "onScheduleRebuild 콜백이 호출되어야 함");
  assert.equal(preRenderedAtCallback, true, "콜백 진입 시점에는 preRenderedAudio=true (실시간 발화 short-circuit 유지)");
  // 외부 콜백이 명시적으로 false로 만들지 않았으므로 여전히 true
  assert.equal(internals.preRenderedAudio, true);

  // 외부가 정리 완료 후 명시적으로 false 호출
  e.setPreRenderedAudio(false);
  assert.equal(internals.preRenderedAudio, false);

  e.stop();
});

test("takeover handshake: 콜백 미등록 케이스에서는 preRenderedAudio를 자동으로 false로 떨어뜨려 deadlock 방지", () => {
  const e = new MetronomeEngine();
  e.setBpm(120);
  e.setBeatsPerMeasure(4);
  e.start();

  const internals = e as unknown as EngineInternals;
  e.setPreRenderedAudio(true);
  // 콜백을 등록하지 않은 상태에서 rebuild
  e.setBpm(150);

  assert.equal(internals.preRenderedAudio, false, "콜백 미등록 시 자동 false fallback");
  e.stop();
});

test("rolloverToNextMeasure: measureDurationMs가 변경되면 anchor를 새 길이의 시작점에 다시 고정", () => {
  withFakeNow(0, () => {
    const e = new MetronomeEngine();
    e.setBpm(120);
    e.setBeatsPerMeasure(4);
    e.start();
    const dur1 = e.getMeasureDurationMs();
    const internals = e as unknown as EngineInternals;

    for (let i = 0; i < 3; i++) internals.rolloverToNextMeasure();
    assert.equal(internals.measureStartTime, 3 * dur1);

    // barBpmOverrides로 다음 마디 길이를 변경 (rebuildSchedule 트리거 → 즉시 anchor 재고정 후 rolloverToNextMeasure도 새 길이로 anchor 재고정)
    e.setBarBpmOverride(0, 240);
    const dur2 = e.getMeasureDurationMs();

    // setBarBpmOverride가 rebuildSchedule을 호출했을 때 anchor가
    // 현재 마디 시작점/새 길이로 재고정됨을 검증한다.
    if (dur2 !== dur1) {
      assert.equal(internals.anchorWallTime, internals.measureStartTime);
      assert.equal(internals.anchorMeasureCount, internals.measureCount);
      assert.equal(internals.anchorMeasureDurationMs, dur2);
    }
    // 1마디 진행 → 새 길이로 정확히 누적
    const beforeStart = internals.measureStartTime;
    const beforeCount = internals.measureCount;
    internals.rolloverToNextMeasure();
    assert.equal(internals.measureCount, beforeCount + 1);
    assert.equal(internals.measureStartTime, beforeStart + dur2);
    e.stop();
  });
});

test("base click mute: 폴리곤이 엔진 비트를 시계로 써도 기본 클릭과 샘플은 발화하지 않는다", () => {
  const e = new MetronomeEngine();
  const clicks: string[] = [];
  let samples = 0;
  let beats = 0;
  e.setAudioCallbacks(
    () => clicks.push("high"),
    () => clicks.push("low"),
    () => clicks.push("strong"),
  );
  e.setCustomSampleCallback(() => {
    samples += 1;
    return true;
  });
  e.setOnBeat(() => { beats += 1; });

  const internals = e as unknown as EngineInternals;
  const mainTick = {
    time: 0,
    beat: 0,
    subBeat: 0,
    type: "normal",
    isMainBeat: true,
    layerIndex: 0,
    blockIndex: -1,
    barRepeatIteration: 0,
    barRepeatTotal: 1,
    repeatIteration: 0,
    blockRepeatTotal: 1,
    jumpIteration: 0,
    jumpTotal: 0,
    jumpSourceBlockIndex: -1,
    layerBeat: 0,
  };

  e.setBaseClickMuted(true);
  internals.fireTick(mainTick);
  assert.equal(beats, 1, "폴리곤 스케줄러가 쓰는 엔진 비트 콜백은 유지되어야 함");
  assert.deepEqual(clicks, [], "기본 메트로놈 클릭은 음소거되어야 함");
  assert.equal(samples, 0, "기본 비트에 연결된 샘플도 음소거되어야 함");

  e.setBaseClickMuted(false);
  internals.fireTick(mainTick);
  assert.deepEqual(clicks, ["low"], "폴리곤을 닫으면 기본 클릭이 다시 재생되어야 함");
  assert.equal(samples, 1, "폴리곤을 닫으면 기본 샘플도 다시 재생되어야 함");
});
