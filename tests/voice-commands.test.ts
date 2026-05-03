import { test } from "node:test";
import assert from "node:assert/strict";

import { parseVoiceCommand } from "../lib/voice-commands";

test("재생/정지 한국어 변형", () => {
  assert.equal(parseVoiceCommand("재생").type, "play");
  assert.equal(parseVoiceCommand("시작해").type, "play");
  assert.equal(parseVoiceCommand("플레이").type, "play");
  assert.equal(parseVoiceCommand("정지").type, "stop");
  assert.equal(parseVoiceCommand("멈춰").type, "stop");
  assert.equal(parseVoiceCommand("토글").type, "toggle");
});

test("재생/정지 영어 변형", () => {
  assert.equal(parseVoiceCommand("play").type, "play");
  assert.equal(parseVoiceCommand("start").type, "play");
  assert.equal(parseVoiceCommand("stop").type, "stop");
  assert.equal(parseVoiceCommand("pause").type, "stop");
  assert.equal(parseVoiceCommand("toggle").type, "toggle");
});

test("BPM 명시 (한국어/영어)", () => {
  const a = parseVoiceCommand("120 BPM");
  assert.equal(a.type, "setBpm");
  if (a.type === "setBpm") assert.equal(a.bpm, 120);

  const b = parseVoiceCommand("120으로");
  if (b.type === "setBpm") assert.equal(b.bpm, 120);

  const c = parseVoiceCommand("set 90");
  if (c.type === "setBpm") assert.equal(c.bpm, 90);

  const d = parseVoiceCommand("tempo 200");
  if (d.type === "setBpm") assert.equal(d.bpm, 200);
});

test("BPM 한국어 숫자 (백이십 등)", () => {
  const a = parseVoiceCommand("백이십");
  assert.equal(a.type, "setBpm");
  if (a.type === "setBpm") assert.equal(a.bpm, 120);

  const b = parseVoiceCommand("백");
  if (b.type === "setBpm") assert.equal(b.bpm, 100);
});

test("BPM 델타 / 배수", () => {
  const a = parseVoiceCommand("빠르게");
  assert.equal(a.type, "bpmDelta");
  if (a.type === "bpmDelta") assert.equal(a.delta, 5);

  const b = parseVoiceCommand("많이 느리게");
  if (b.type === "bpmDelta") assert.equal(b.delta, -10);

  const c = parseVoiceCommand("두 배 빠르게");
  assert.equal(c.type, "bpmMultiplier");
  if (c.type === "bpmMultiplier") assert.equal(c.factor, 2);

  const d = parseVoiceCommand("half");
  if (d.type === "bpmMultiplier") assert.equal(d.factor, 0.5);
});

test("박자 설정", () => {
  const a = parseVoiceCommand("4박자");
  assert.equal(a.type, "setBeats");
  if (a.type === "setBeats") assert.equal(a.beats, 4);

  const b = parseVoiceCommand("6 beats");
  if (b.type === "setBeats") assert.equal(b.beats, 6);

  const c = parseVoiceCommand("4분의 3");
  if (c.type === "setBeats") assert.equal(c.beats, 3);
});

test("리셋 / 도움말", () => {
  assert.equal(parseVoiceCommand("초기화").type, "reset");
  assert.equal(parseVoiceCommand("reset").type, "reset");
  assert.equal(parseVoiceCommand("도움말").type, "help");
  assert.equal(parseVoiceCommand("help").type, "help");
});

test("애칭 엄격 모드 — 애칭 미발화 시 unknown", () => {
  const r1 = parseVoiceCommand("재생", { nickname: "풀포", strictNickname: true });
  assert.equal(r1.type, "unknown");

  const r2 = parseVoiceCommand("풀포 재생", { nickname: "풀포", strictNickname: true });
  assert.equal(r2.type, "play");

  const r3 = parseVoiceCommand("풀포야 정지", { nickname: "풀포", strictNickname: true });
  assert.equal(r3.type, "stop");

  // 비엄격 모드: 애칭 없어도 매칭
  const r4 = parseVoiceCommand("재생", { nickname: "풀포", strictNickname: false });
  assert.equal(r4.type, "play");
});

test("애칭 + BPM 명령", () => {
  const r = parseVoiceCommand("Pulpor set 100", { nickname: "pulpor", strictNickname: true });
  assert.equal(r.type, "setBpm");
  if (r.type === "setBpm") assert.equal(r.bpm, 100);
});

test("알 수 없는 발화", () => {
  assert.equal(parseVoiceCommand("").type, "unknown");
  assert.equal(parseVoiceCommand("오늘 날씨가 좋다").type, "unknown");
});

test("BPM 범위 클램프 (파서 단계에서는 무시)", () => {
  // 20 미만, 300 초과는 매칭 안 됨 → unknown 또는 다른 매칭
  const a = parseVoiceCommand("set 5");
  assert.notEqual(a.type, "setBpm");
  const b = parseVoiceCommand("set 500");
  assert.notEqual(b.type, "setBpm");
});
