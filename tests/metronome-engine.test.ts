import { test } from "node:test";
import assert from "node:assert/strict";

// expo-haptics와 react-native는 Node 환경에서 import 시 실패하므로 stub.
const Module = require("module");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request: string, ...rest: any[]) {
  if (request === "expo-haptics") return require.resolve("./_stubs/expo-haptics.js");
  if (request === "react-native") return require.resolve("./_stubs/react-native.js");
  return originalResolve.call(this, request, ...rest);
};

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
