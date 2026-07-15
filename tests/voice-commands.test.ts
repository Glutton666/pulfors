import { test } from "node:test";
import assert from "node:assert/strict";
import { parseVoiceCommand } from "../lib/voice-commands";

test("빈 입력 → unknown empty", () => {
  assert.deepEqual(parseVoiceCommand(""), { type: "unknown", reason: "empty" });
  assert.deepEqual(parseVoiceCommand("   "), { type: "unknown", reason: "empty" });
});

test("strictNickname: 애칭 없으면 noNickname", () => {
  const r = parseVoiceCommand("재생", { nickname: "메트", strictNickname: true });
  assert.deepEqual(r, { type: "unknown", reason: "noNickname" });
});

test("strictNickname: 애칭 포함 시 동작", () => {
  const r = parseVoiceCommand("메트야 재생", { nickname: "메트", strictNickname: true });
  assert.deepEqual(r, { type: "play" });
});

test("non-strict: 애칭 없어도 동작", () => {
  assert.deepEqual(parseVoiceCommand("재생"), { type: "play" });
});

test("재생/정지/토글", () => {
  assert.deepEqual(parseVoiceCommand("시작"), { type: "play" });
  assert.deepEqual(parseVoiceCommand("플레이"), { type: "play" });
  assert.deepEqual(parseVoiceCommand("play"), { type: "play" });
  assert.deepEqual(parseVoiceCommand("정지"), { type: "stop" });
  assert.deepEqual(parseVoiceCommand("멈춰"), { type: "stop" });
  assert.deepEqual(parseVoiceCommand("stop"), { type: "stop" });
  assert.deepEqual(parseVoiceCommand("토글"), { type: "toggle" });
});

test("초기화 / 도움말", () => {
  assert.deepEqual(parseVoiceCommand("초기화"), { type: "reset" });
  assert.deepEqual(parseVoiceCommand("reset"), { type: "reset" });
  assert.deepEqual(parseVoiceCommand("도움말"), { type: "help" });
  assert.deepEqual(parseVoiceCommand("help"), { type: "help" });
});

test("박자 한국어: '3박자', '6박', '4분의 3'", () => {
  assert.deepEqual(parseVoiceCommand("3박자"), { type: "setBeats", beats: 3 });
  assert.deepEqual(parseVoiceCommand("6박"), { type: "setBeats", beats: 6 });
  assert.deepEqual(parseVoiceCommand("4분의 3"), { type: "setBeats", beats: 3 });
});

test("박자 영어: '6 beats'", () => {
  assert.deepEqual(parseVoiceCommand("6 beats"), { type: "setBeats", beats: 6 });
});

test("박자 범위 밖(0, 17+) → 박자로 매치 안됨", () => {
  // 17 beats는 setBeats 범위 밖이지만 setBpm 범위(20~300)도 밖이라 결국 unknown 또는 다른 매치
  const r = parseVoiceCommand("17박자");
  assert.notEqual(r.type, "setBeats");
});

test("BPM 배수: 두 배 / 절반", () => {
  assert.deepEqual(parseVoiceCommand("두 배"), { type: "bpmMultiplier", factor: 2 });
  assert.deepEqual(parseVoiceCommand("double"), { type: "bpmMultiplier", factor: 2 });
  assert.deepEqual(parseVoiceCommand("절반"), { type: "bpmMultiplier", factor: 0.5 });
  assert.deepEqual(parseVoiceCommand("half"), { type: "bpmMultiplier", factor: 0.5 });
});

test("BPM 델타: 큰 변화 먼저 매치", () => {
  assert.deepEqual(parseVoiceCommand("훨씬 빠르게"), { type: "bpmDelta", delta: 10 });
  assert.deepEqual(parseVoiceCommand("much faster"), { type: "bpmDelta", delta: 10 });
  assert.deepEqual(parseVoiceCommand("훨씬 느리게"), { type: "bpmDelta", delta: -10 });
  assert.deepEqual(parseVoiceCommand("빠르게"), { type: "bpmDelta", delta: 5 });
  assert.deepEqual(parseVoiceCommand("느리게"), { type: "bpmDelta", delta: -5 });
  assert.deepEqual(parseVoiceCommand("speed up"), { type: "bpmDelta", delta: 5 });
});

test("명시 BPM: 'bpm 120', '120 bpm', '템포 90'", () => {
  assert.deepEqual(parseVoiceCommand("bpm 120"), { type: "setBpm", bpm: 120 });
  assert.deepEqual(parseVoiceCommand("120 bpm"), { type: "setBpm", bpm: 120 });
  assert.deepEqual(parseVoiceCommand("템포 90"), { type: "setBpm", bpm: 90 });
});

test("명시 BPM: '120으로', 'set to 100'", () => {
  assert.deepEqual(parseVoiceCommand("120으로"), { type: "setBpm", bpm: 120 });
  assert.deepEqual(parseVoiceCommand("set to 100"), { type: "setBpm", bpm: 100 });
});

test("BPM 범위 검증: 20~300만 허용", () => {
  // 19는 매치 안됨, 0초기화 우선이므로 unknown으로 떨어짐
  const r1 = parseVoiceCommand("bpm 19");
  assert.notEqual(r1.type, "setBpm");
  // 301은 정규식이 \d{2,3}이라 301은 매치되지만 범위 체크에서 탈락
  const r2 = parseVoiceCommand("bpm 301");
  assert.notEqual(r2.type, "setBpm");
  // 20과 300은 허용
  assert.deepEqual(parseVoiceCommand("bpm 20"), { type: "setBpm", bpm: 20 });
  assert.deepEqual(parseVoiceCommand("bpm 300"), { type: "setBpm", bpm: 300 });
});

test("한국어 숫자 발화: '백이십' → 120", () => {
  assert.deepEqual(parseVoiceCommand("백이십"), { type: "setBpm", bpm: 120 });
  assert.deepEqual(parseVoiceCommand("이백"), { type: "setBpm", bpm: 200 });
});

test("영어 워드 숫자: 'one hundred twenty' → 120", () => {
  assert.deepEqual(parseVoiceCommand("one hundred twenty"), { type: "setBpm", bpm: 120 });
});

test("벗어난 입력 → unknown noMatch", () => {
  assert.deepEqual(parseVoiceCommand("바나나 우유"), { type: "unknown", reason: "noMatch" });
});

test("애칭 + 호격조사 제거 후 매치", () => {
  assert.deepEqual(parseVoiceCommand("메트야 정지"), { type: "stop" }, );
  assert.deepEqual(parseVoiceCommand("메트 정지", { nickname: "메트" }), { type: "stop" });
});
