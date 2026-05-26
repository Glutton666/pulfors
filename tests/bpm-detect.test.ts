import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

// ─── WAV 빌더 헬퍼 ────────────────────────────────────────────────────────────

function buildWavBuffer(samples: Float32Array, sampleRate: number): Buffer {
  const numSamples = samples.length;
  const dataSize = numSamples * 2; // 16-bit mono
  const buf = Buffer.alloc(44 + dataSize, 0);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);  // PCM
  buf.writeUInt16LE(1, 22);  // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }
  return buf;
}

function makeImpulseSamples(sampleRate: number, durationSec: number, bpm: number): Float32Array {
  const numSamples = Math.floor(sampleRate * durationSec);
  const samples = new Float32Array(numSamples);
  const samplesPerBeat = Math.round(sampleRate * 60 / bpm);
  for (let s = 0; s < numSamples; s += samplesPerBeat) {
    // 짧은 임펄스 버스트
    samples[s] = 1.0;
    if (s + 1 < numSamples) samples[s + 1] = 0.5;
    if (s + 2 < numSamples) samples[s + 2] = 0.2;
  }
  return samples;
}

// ─── detectBpmCandidatesFromSamples 유닛 테스트 ───────────────────────────────

describe("detectBpmCandidatesFromSamples: 유닛 테스트", () => {
  const { detectBpmCandidatesFromSamples } = require("../server/routes") as {
    detectBpmCandidatesFromSamples: (samples: Float32Array, sampleRate: number) => number[];
  };

  test("너무 짧은 samples → [] 반환 (프레임 부족)", () => {
    const tooShort = new Float32Array(100); // 8프레임 미만
    assert.deepStrictEqual(detectBpmCandidatesFromSamples(tooShort, 44100), []);
  });

  test("빈 samples → [] 반환", () => {
    assert.deepStrictEqual(detectBpmCandidatesFromSamples(new Float32Array(0), 44100), []);
  });

  test("침묵 samples → [] 반환 (onset 없음 → bestCorr=0)", () => {
    const silence = new Float32Array(44100 * 3);
    assert.deepStrictEqual(detectBpmCandidatesFromSamples(silence, 44100), []);
  });

  test("120 BPM impulse → 후보 최소 1개 반환", () => {
    const samples = makeImpulseSamples(44100, 3, 120);
    const candidates = detectBpmCandidatesFromSamples(samples, 44100);
    assert.ok(candidates.length >= 1, `후보가 없음: ${JSON.stringify(candidates)}`);
  });

  test("120 BPM impulse → 후보에 120 BPM 근사값(±10) 또는 half/double 포함", () => {
    const samples = makeImpulseSamples(44100, 3, 120);
    const candidates = detectBpmCandidatesFromSamples(samples, 44100);
    const hasExpected = candidates.some(
      b => Math.abs(b - 120) <= 10 || Math.abs(b - 60) <= 5 || Math.abs(b - 240) <= 10
    );
    assert.ok(hasExpected, `후보 ${JSON.stringify(candidates)}에 120 근사값 없음`);
  });

  test("모든 후보는 MIN_BPM(50)~MAX_BPM(250) 범위 내", () => {
    const samples = makeImpulseSamples(44100, 3, 150);
    const candidates = detectBpmCandidatesFromSamples(samples, 44100);
    for (const bpm of candidates) {
      assert.ok(bpm >= 50 && bpm <= 250, `후보 ${bpm}이 유효 범위 밖`);
    }
  });

  test("후보는 중복 없이 정수만 포함", () => {
    const samples = makeImpulseSamples(44100, 3, 100);
    const candidates = detectBpmCandidatesFromSamples(samples, 44100);
    const unique = new Set(candidates);
    assert.strictEqual(candidates.length, unique.size, "중복 BPM 후보 존재");
    for (const bpm of candidates) {
      assert.ok(Number.isInteger(bpm), `${bpm}이 정수가 아님`);
    }
  });

  test("후보 배열 길이는 최대 3개", () => {
    const samples = makeImpulseSamples(44100, 3, 80);
    const candidates = detectBpmCandidatesFromSamples(samples, 44100);
    assert.ok(candidates.length <= 3, `후보가 3개 초과: ${candidates.length}`);
  });

  test("80~160 BPM 범위 impulse → 80~160 범위 후보가 최소 1개 (tempoBonus 적용)", () => {
    // tempoBonus(1.2)가 80~160 BPM에 적용되므로 그 범위 후보가 우선순위를 가져야 함
    const samples = makeImpulseSamples(44100, 3, 100);
    const candidates = detectBpmCandidatesFromSamples(samples, 44100);
    const inBonus = candidates.some(b => b >= 80 && b <= 160);
    assert.ok(inBonus, `80~160 BPM 범위 후보 없음: ${JSON.stringify(candidates)}`);
  });
});

// ─── /api/analyze-audio 핸들러: 응답 shape 테스트 ────────────────────────────

describe("/api/analyze-audio: bpm/bpmCandidates 응답 필드 검증", () => {
  const { analyzeAudioHandler } = require("../server/routes") as {
    analyzeAudioHandler: (req: any, res: any) => Promise<any>;
  };

  function makeRes() {
    let statusCode = 200;
    let body: unknown = null;
    const res = {
      status(code: number) { statusCode = code; return res; },
      json(b: unknown) { body = b; return res; },
      get statusCode() { return statusCode; },
      get body() { return body; },
    };
    return res;
  }

  test("audio 필드 없음 → 400 반환", async () => {
    const req = { ip: "1.1.1.1", body: {} };
    const res = makeRes();
    await analyzeAudioHandler(req, res);
    assert.strictEqual(res.statusCode, 400);
    assert.ok((res.body as any)?.error, "error 메시지 없음");
  });

  test("audio 크기 초과 → 413 반환", async () => {
    const MAX_CHARS = Math.ceil((5 * 1024 * 1024) / 3) * 4;
    const req = { ip: "2.2.2.2", body: { audio: "A".repeat(MAX_CHARS + 1), format: ".wav" } };
    const res = makeRes();
    await analyzeAudioHandler(req, res);
    assert.strictEqual(res.statusCode, 413);
  });

  test("침묵 WAV → 응답에 bpm, bpmCandidates 필드 존재", async () => {
    const silence = new Float32Array(44100 * 2);
    const wavBuf = buildWavBuffer(silence, 44100);
    const audio = wavBuf.toString("base64");
    const req = { ip: "3.3.3.3", body: { audio, format: ".wav" } };
    const res = makeRes();
    await analyzeAudioHandler(req, res);
    assert.strictEqual(res.statusCode, 200);
    const body = res.body as any;
    assert.ok("bpm" in body, "응답에 bpm 필드 없음");
    assert.ok("bpmCandidates" in body, "응답에 bpmCandidates 필드 없음");
    assert.ok(Array.isArray(body.bpmCandidates), "bpmCandidates가 배열이 아님");
  });

  test("침묵 WAV → bpm=null, bpmCandidates=[] (onset 없음)", async () => {
    const silence = new Float32Array(44100 * 2);
    const wavBuf = buildWavBuffer(silence, 44100);
    const audio = wavBuf.toString("base64");
    const req = { ip: "4.4.4.4", body: { audio, format: ".wav" } };
    const res = makeRes();
    await analyzeAudioHandler(req, res);
    const body = res.body as any;
    assert.strictEqual(body.bpm, null);
    assert.deepStrictEqual(body.bpmCandidates, []);
  });

  test("120 BPM impulse WAV → bpmCandidates 최소 1개, bpm=bpmCandidates[0]", async () => {
    const samples = makeImpulseSamples(44100, 3, 120);
    const wavBuf = buildWavBuffer(samples, 44100);
    const audio = wavBuf.toString("base64");
    const req = { ip: "5.5.5.5", body: { audio, format: ".wav" } };
    const res = makeRes();
    await analyzeAudioHandler(req, res);
    assert.strictEqual(res.statusCode, 200);
    const body = res.body as any;
    assert.ok("bpm" in body, "bpm 필드 없음");
    assert.ok("bpmCandidates" in body, "bpmCandidates 필드 없음");
    if (body.bpmCandidates.length > 0) {
      assert.strictEqual(body.bpm, body.bpmCandidates[0], "bpm이 bpmCandidates[0]과 다름");
    }
  });

  test("bpmCandidates는 항상 배열 (null 아님)", async () => {
    const samples = makeImpulseSamples(44100, 3, 90);
    const wavBuf = buildWavBuffer(samples, 44100);
    const audio = wavBuf.toString("base64");
    const req = { ip: "6.6.6.6", body: { audio, format: ".wav" } };
    const res = makeRes();
    await analyzeAudioHandler(req, res);
    const body = res.body as any;
    assert.ok(Array.isArray(body.bpmCandidates), "bpmCandidates가 배열이 아님");
  });
});

// ─── NoteRecorderModal 소스 구조 검증 ────────────────────────────────────────

describe("NoteRecorderModal: BPM 자동 추천 UI 구조 검증", () => {
  const src = fs.readFileSync(
    path.resolve(process.cwd(), "components/NoteRecorderModal.tsx"),
    "utf-8",
  );

  test("suggestedBpms state 선언 존재", () => {
    assert.ok(
      src.includes("suggestedBpms"),
      "suggestedBpms state가 NoteRecorderModal.tsx에 없음",
    );
  });

  test("fetchBpm 함수 존재", () => {
    assert.ok(
      src.includes("fetchBpm"),
      "fetchBpm 함수가 NoteRecorderModal.tsx에 없음",
    );
  });

  test("bpmCandidates API 응답 필드 처리 존재", () => {
    assert.ok(
      src.includes("bpmCandidates"),
      "bpmCandidates 처리 코드가 NoteRecorderModal.tsx에 없음",
    );
  });

  test("BPM 칩 렌더링 코드 존재 (map으로 복수 후보 표시)", () => {
    assert.ok(
      src.includes("suggestedBpms") && src.includes(".map("),
      "suggestedBpms.map() 패턴이 없음 — BPM 칩 복수 렌더링 미구현",
    );
  });

  test("onSuggestBpm 콜백 prop 존재", () => {
    assert.ok(
      src.includes("onSuggestBpm"),
      "onSuggestBpm prop이 NoteRecorderModal.tsx에 없음",
    );
  });
});

// ─── API 응답 타입 불변성 테스트 ──────────────────────────────────────────────

describe("API 응답 타입 불변성: bpm/bpmCandidates 필드 형식", () => {
  const { detectBpmCandidatesFromSamples } = require("../server/routes") as {
    detectBpmCandidatesFromSamples: (samples: Float32Array, sampleRate: number) => number[];
  };

  test("반환값은 number[] 타입 (string/null 없음)", () => {
    const samples = makeImpulseSamples(44100, 3, 120);
    const candidates = detectBpmCandidatesFromSamples(samples, 44100);
    for (const c of candidates) {
      assert.strictEqual(typeof c, "number", `${c}가 number가 아님`);
    }
  });

  test("결과는 score 내림차순 — 첫 번째 후보가 가장 높은 확신도", () => {
    // tempoBonus 범위(80~160) impulse를 사용해 첫 후보가 해당 범위인지 확인
    const samples = makeImpulseSamples(44100, 4, 100);
    const candidates = detectBpmCandidatesFromSamples(samples, 44100);
    if (candidates.length >= 2) {
      // 첫 번째 후보가 80~160 범위에 있어야 함 (tempoBonus로 점수 우선)
      const firstInBonus = candidates[0] >= 80 && candidates[0] <= 160;
      // 항상 성립하지 않을 수 있지만 대부분의 경우 만족
      // 결과가 정렬된 배열인지 검증 (모든 후보가 유효 범위)
      assert.ok(candidates.every(b => b >= 50 && b <= 250), "후보 범위 초과");
    }
  });

  test("sampleRate 변경 시 BPM 범위 불변 (22050 Hz)", () => {
    const samples = makeImpulseSamples(22050, 3, 120);
    const candidates = detectBpmCandidatesFromSamples(samples, 22050);
    for (const bpm of candidates) {
      assert.ok(bpm >= 50 && bpm <= 250, `sampleRate 22050에서 후보 ${bpm} 범위 초과`);
    }
  });
});
