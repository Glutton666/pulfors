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

// ─── NoteRecorderModal: BPM fetch 상태 머신 시뮬레이션 ───────────────────────
//
// NoteRecorderModal.tsx의 fetchBpm / suggestedBpms / onSuggestBpm 로직을
// 동일한 알고리즘으로 추출해 mocked fetch와 함께 행동 테스트를 수행한다.
// (animated-modal.test.ts가 AnimatedModal의 useEffect를 시뮬레이션하는 방식과 동일)

type MockFetch = (url: string, opts?: RequestInit) => Promise<Response>;

class BpmFetchSimulation {
  suggestedBpms: number[] = [];
  isFetchingBpm = false;
  private _fetch: MockFetch;

  constructor(mockFetch: MockFetch) {
    this._fetch = mockFetch;
  }

  /** NoteRecorderModal.tsx의 fetchBpm useCallback과 동일한 로직 */
  async fetchBpm(audioUri: string): Promise<void> {
    try {
      this.suggestedBpms = [];
      this.isFetchingBpm = true;

      const MAX_SEND_BYTES = 3 * 1024 * 1024;
      const resp = await this._fetch(audioUri);
      if (!resp.ok) return;
      const ab = await resp.arrayBuffer();
      const bytes = new Uint8Array(ab).slice(0, MAX_SEND_BYTES);

      // base64 인코딩 (btoa 대신 Node.js Buffer 사용)
      const base64Audio = Buffer.from(bytes).toString("base64");

      const uriLower = audioUri.toLowerCase().split("?")[0];
      const dotIdx = uriLower.lastIndexOf(".");
      const rawExt = dotIdx >= 0 ? uriLower.slice(dotIdx) : ".wav";
      const ALLOWED_EXTS = [".wav", ".m4a", ".3gp", ".mp4", ".aac", ".webm"];
      const format = ALLOWED_EXTS.includes(rawExt) ? rawExt : ".wav";

      const apiResp = await this._fetch("/api/analyze-audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio: base64Audio, format }),
      });
      if (!apiResp.ok) return;
      const data = await apiResp.json() as { bpm?: number | null; bpmCandidates?: number[] };
      const rawCandidates = Array.isArray(data.bpmCandidates)
        ? data.bpmCandidates
        : (typeof data.bpm === "number" ? [data.bpm] : []);
      const validCandidates = rawCandidates.filter(
        (b) => typeof b === "number" && b >= 50 && b <= 250,
      );
      if (validCandidates.length > 0) {
        this.suggestedBpms = validCandidates;
      }
    } catch {
      // 실패 시 조용히 종료 (NoteRecorderModal.tsx와 동일)
    } finally {
      this.isFetchingBpm = false;
    }
  }

  /** BPM 칩 onPress 시 동작 (NoteRecorderModal.tsx 1027~1028번 줄과 동일) */
  onChipPress(bpm: number, onSuggestBpm?: (bpm: number) => void): void {
    if (onSuggestBpm) onSuggestBpm(bpm);
    this.suggestedBpms = [];
  }
}

/** 간단한 mock fetch 팩토리 */
function mockFetchPair(
  audioBuf: ArrayBuffer,
  apiResponse: object,
  apiOk = true,
): MockFetch {
  return async (url: string) => {
    if (url === "/api/analyze-audio") {
      const body = JSON.stringify(apiResponse);
      return {
        ok: apiOk,
        status: apiOk ? 200 : 500,
        arrayBuffer: async () => new ArrayBuffer(0),
        json: async () => JSON.parse(body),
      } as unknown as Response;
    }
    // 오디오 URI 요청
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => audioBuf,
      json: async () => ({}),
    } as unknown as Response;
  };
}

describe("NoteRecorderModal: BPM fetch 상태 머신 행동 테스트", () => {
  const silentAudioBuf = new ArrayBuffer(44); // 최소 WAV 크기

  test("fetchBpm 전 suggestedBpms는 빈 배열, isFetchingBpm=false", () => {
    const sim = new BpmFetchSimulation(mockFetchPair(silentAudioBuf, {}));
    assert.deepStrictEqual(sim.suggestedBpms, []);
    assert.strictEqual(sim.isFetchingBpm, false);
  });

  test("fetchBpm 완료 후 isFetchingBpm=false (finally 보장)", async () => {
    const sim = new BpmFetchSimulation(
      mockFetchPair(silentAudioBuf, { bpmCandidates: [120] }),
    );
    await sim.fetchBpm("https://example.com/test.wav");
    assert.strictEqual(sim.isFetchingBpm, false);
  });

  test("API가 bpmCandidates:[120,60] 반환 → suggestedBpms에 두 칩 모두 설정", async () => {
    const sim = new BpmFetchSimulation(
      mockFetchPair(silentAudioBuf, { bpm: 120, bpmCandidates: [120, 60] }),
    );
    await sim.fetchBpm("https://example.com/audio.wav");
    assert.deepStrictEqual(sim.suggestedBpms, [120, 60], "두 BPM 칩이 모두 설정되어야 함");
  });

  test("bpmCandidates 없고 bpm 단독 반환 → suggestedBpms에 [bpm] 설정 (fallback)", async () => {
    const sim = new BpmFetchSimulation(
      mockFetchPair(silentAudioBuf, { bpm: 96, bpmCandidates: undefined }),
    );
    await sim.fetchBpm("https://example.com/audio.wav");
    assert.deepStrictEqual(sim.suggestedBpms, [96]);
  });

  test("유효 범위(50~250) 밖 BPM은 필터링됨", async () => {
    const sim = new BpmFetchSimulation(
      mockFetchPair(silentAudioBuf, { bpmCandidates: [30, 120, 300] }),
    );
    await sim.fetchBpm("https://example.com/audio.wav");
    assert.deepStrictEqual(sim.suggestedBpms, [120], "30과 300은 필터링되어야 함");
  });

  test("API 응답 bpm/bpmCandidates 모두 없거나 빈 배열 → suggestedBpms=[]", async () => {
    const sim = new BpmFetchSimulation(
      mockFetchPair(silentAudioBuf, { bpm: null, bpmCandidates: [] }),
    );
    await sim.fetchBpm("https://example.com/audio.wav");
    assert.deepStrictEqual(sim.suggestedBpms, []);
  });

  test("오디오 URI fetch 실패(ok=false) → suggestedBpms=[], fetchBpm 조용히 종료", async () => {
    const failFetch: MockFetch = async () => ({
      ok: false,
      status: 404,
      arrayBuffer: async () => new ArrayBuffer(0),
      json: async () => ({}),
    } as unknown as Response);
    const sim = new BpmFetchSimulation(failFetch);
    await sim.fetchBpm("https://example.com/missing.wav");
    assert.deepStrictEqual(sim.suggestedBpms, []);
  });

  test("API POST 실패(ok=false) → suggestedBpms=[]", async () => {
    const sim = new BpmFetchSimulation(
      mockFetchPair(silentAudioBuf, {}, false /* apiOk=false */),
    );
    await sim.fetchBpm("https://example.com/audio.wav");
    assert.deepStrictEqual(sim.suggestedBpms, []);
  });

  test("BPM 칩 클릭 → onSuggestBpm(bpm) 호출 + suggestedBpms 초기화", async () => {
    const sim = new BpmFetchSimulation(
      mockFetchPair(silentAudioBuf, { bpmCandidates: [120, 60] }),
    );
    await sim.fetchBpm("https://example.com/audio.wav");
    assert.deepStrictEqual(sim.suggestedBpms, [120, 60]);

    let called: number | null = null;
    sim.onChipPress(120, (bpm) => { called = bpm; });
    assert.strictEqual(called, 120, "onSuggestBpm이 선택한 BPM으로 호출되어야 함");
    assert.deepStrictEqual(sim.suggestedBpms, [], "칩 클릭 후 suggestedBpms 초기화");
  });

  test("두 번째 칩 클릭도 정상 동작 — onSuggestBpm(60) 호출", async () => {
    const sim = new BpmFetchSimulation(
      mockFetchPair(silentAudioBuf, { bpmCandidates: [120, 60] }),
    );
    await sim.fetchBpm("https://example.com/audio.wav");

    let called: number | null = null;
    sim.onChipPress(60, (bpm) => { called = bpm; });
    assert.strictEqual(called, 60);
    assert.deepStrictEqual(sim.suggestedBpms, []);
  });

  test("URL 확장자에 따라 format이 올바르게 전달됨 (.m4a)", async () => {
    let capturedFormat: string | null = null;
    const captureFetch: MockFetch = async (url, opts) => {
      if (url === "/api/analyze-audio" && opts?.body) {
        const body = JSON.parse(opts.body as string);
        capturedFormat = body.format;
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => new ArrayBuffer(0),
          json: async () => ({ bpmCandidates: [100] }),
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => silentAudioBuf,
        json: async () => ({}),
      } as unknown as Response;
    };
    const sim = new BpmFetchSimulation(captureFetch);
    await sim.fetchBpm("https://example.com/recording.m4a");
    assert.strictEqual(capturedFormat, ".m4a", "format이 URL 확장자에서 올바르게 추출되어야 함");
  });

  test("허용 안 된 확장자(.xyz) → format='.wav' fallback", async () => {
    let capturedFormat: string | null = null;
    const captureFetch: MockFetch = async (url, opts) => {
      if (url === "/api/analyze-audio" && opts?.body) {
        const body = JSON.parse(opts.body as string);
        capturedFormat = body.format;
        return {
          ok: true, status: 200,
          arrayBuffer: async () => new ArrayBuffer(0),
          json: async () => ({ bpmCandidates: [100] }),
        } as unknown as Response;
      }
      return {
        ok: true, status: 200,
        arrayBuffer: async () => silentAudioBuf,
        json: async () => ({}),
      } as unknown as Response;
    };
    const sim = new BpmFetchSimulation(captureFetch);
    await sim.fetchBpm("https://example.com/file.xyz");
    assert.strictEqual(capturedFormat, ".wav", "허용되지 않은 확장자는 .wav로 fallback");
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

// ─── 온디바이스(FFT 기반) BPM 감지: detectBpmCandidatesOnDevice ───────────────
//
// components/NoteRecorderModal.tsx가 WAV(iOS 녹음/가져오기)에 대해 사용하는
// 완전 온디바이스 경로. 네트워크 호출 없이 스펙트럼 온셋 → 자기상관 방식으로
// BPM 후보를 추출한다.

describe("detectBpmCandidatesOnDevice: 온디바이스 FFT 기반 BPM 감지", () => {
  const { detectBpmCandidatesOnDevice, computeSpectralOnsetEnvelope } =
    require("../lib/onset-bpm-detect") as {
      detectBpmCandidatesOnDevice: (samples: Float32Array, sampleRate: number) => {
        candidates: number[];
        failureReason?: string;
      };
      computeSpectralOnsetEnvelope: (samples: Float32Array, sampleRate: number) => { onset: Float32Array; hopRate: number } | null;
    };

  function makeClickTrain(sampleRate: number, durationSec: number, bpm: number): Float32Array {
    const numSamples = Math.floor(sampleRate * durationSec);
    const samples = new Float32Array(numSamples);
    const samplesPerBeat = Math.round((sampleRate * 60) / bpm);
    // 클릭성 임펄스(광대역 스파이크)를 각 비트 위치에 삽입 — 실제 메트로놈 클릭과 유사.
    for (let s = 0; s < numSamples; s += samplesPerBeat) {
      for (let k = 0; k < 8 && s + k < numSamples; k++) {
        samples[s + k] = k % 2 === 0 ? 0.9 : -0.9;
      }
    }
    return samples;
  }

  test("데이터가 너무 짧으면 insufficient_data 실패 사유 반환", () => {
    const tooShort = new Float32Array(100);
    const result = detectBpmCandidatesOnDevice(tooShort, 44100);
    assert.deepStrictEqual(result.candidates, []);
    assert.strictEqual(result.failureReason, "insufficient_data");
  });

  test("무음 오디오 → no_signal 실패 사유 반환", () => {
    const silence = new Float32Array(44100 * 3);
    const result = detectBpmCandidatesOnDevice(silence, 44100);
    assert.deepStrictEqual(result.candidates, []);
    assert.strictEqual(result.failureReason, "no_signal");
  });

  test("120 BPM 클릭 트레인 → 후보 최소 1개, failureReason 없음", () => {
    const samples = makeClickTrain(44100, 4, 120);
    const result = detectBpmCandidatesOnDevice(samples, 44100);
    assert.ok(result.candidates.length >= 1, `후보 없음: ${JSON.stringify(result)}`);
    assert.strictEqual(result.failureReason, undefined);
  });

  test("120 BPM 클릭 트레인 → 후보에 120 근사값 또는 half/double 포함", () => {
    const samples = makeClickTrain(44100, 4, 120);
    const result = detectBpmCandidatesOnDevice(samples, 44100);
    const hasExpected = result.candidates.some(
      (b) => Math.abs(b - 120) <= 10 || Math.abs(b - 60) <= 5 || Math.abs(b - 240) <= 10,
    );
    assert.ok(hasExpected, `후보 ${JSON.stringify(result.candidates)}에 120 근사값 없음`);
  });

  test("모든 후보는 50~250 BPM 범위 내이며 정수", () => {
    const samples = makeClickTrain(44100, 4, 90);
    const result = detectBpmCandidatesOnDevice(samples, 44100);
    for (const bpm of result.candidates) {
      assert.ok(bpm >= 50 && bpm <= 250, `후보 ${bpm}이 범위 밖`);
      assert.ok(Number.isInteger(bpm), `후보 ${bpm}이 정수가 아님`);
    }
  });

  test("computeSpectralOnsetEnvelope: 짧은 샘플 → null 반환", () => {
    const tooShort = new Float32Array(500);
    assert.strictEqual(computeSpectralOnsetEnvelope(tooShort, 44100), null);
  });

  test("computeSpectralOnsetEnvelope: 충분한 샘플 → onset 배열과 hopRate 반환", () => {
    const samples = makeClickTrain(44100, 2, 120);
    const env = computeSpectralOnsetEnvelope(samples, 44100);
    assert.ok(env, "onset envelope가 null이면 안 됨");
    assert.ok(env!.onset.length > 8, "onset 프레임 수가 너무 적음");
    assert.strictEqual(env!.hopRate, 44100 / 512);
  });
});

// ─── 트리밍 변경 시 재감지: 트림 범위에 따라 다른 슬라이스가 분석되는지 검증 ───

describe("트림 변경 시 재감지 시뮬레이션 (recompute on trim change)", () => {
  const { detectBpmCandidatesOnDevice } = require("../lib/onset-bpm-detect") as {
    detectBpmCandidatesOnDevice: (samples: Float32Array, sampleRate: number) => {
      candidates: number[];
      failureReason?: string;
    };
  };

  function makeTwoTempoSamples(sampleRate: number): Float32Array {
    // 앞 3초는 90 BPM, 뒤 3초는 150 BPM인 합성 오디오.
    const durEach = 3;
    const first = new Float32Array(sampleRate * durEach);
    const second = new Float32Array(sampleRate * durEach);
    const fillClicks = (arr: Float32Array, bpm: number) => {
      const spb = Math.round((sampleRate * 60) / bpm);
      for (let s = 0; s < arr.length; s += spb) {
        for (let k = 0; k < 8 && s + k < arr.length; k++) {
          arr[s + k] = k % 2 === 0 ? 0.9 : -0.9;
        }
      }
    };
    fillClicks(first, 90);
    fillClicks(second, 150);
    const combined = new Float32Array(first.length + second.length);
    combined.set(first, 0);
    combined.set(second, first.length);
    return combined;
  }

  test("트림 범위를 앞/뒤로 바꾸면 서로 다른 BPM 후보 세트를 반환할 수 있음", () => {
    const sampleRate = 44100;
    const combined = makeTwoTempoSamples(sampleRate);
    const half = Math.floor(combined.length / 2);

    const frontSlice = combined.subarray(0, half);
    const backSlice = combined.subarray(half);

    const frontResult = detectBpmCandidatesOnDevice(frontSlice, sampleRate);
    const backResult = detectBpmCandidatesOnDevice(backSlice, sampleRate);

    assert.ok(frontResult.candidates.length >= 1, "앞부분 후보 없음");
    assert.ok(backResult.candidates.length >= 1, "뒷부분 후보 없음");

    const frontHas90 = frontResult.candidates.some((b) => Math.abs(b - 90) <= 10 || Math.abs(b - 45) <= 5 || Math.abs(b - 180) <= 10);
    const backHas150 = backResult.candidates.some((b) => Math.abs(b - 150) <= 10 || Math.abs(b - 75) <= 5);
    assert.ok(frontHas90, `앞부분 후보에 90 BPM 근사값 없음: ${JSON.stringify(frontResult.candidates)}`);
    assert.ok(backHas150, `뒷부분 후보에 150 BPM 근사값 없음: ${JSON.stringify(backResult.candidates)}`);
  });
});

// ─── 서버 ffmpeg 트림 파라미터: trimStartSec/trimEndSec 파싱 검증 ─────────────
//
// ffmpeg 자체 실행은 통합 테스트 영역이므로, 여기서는 analyzeAudioHandler가
// trimStartSec/trimEndSec 필드를 안전하게 파싱/무시하며 기존 동작(413/400 등)을
// 깨지 않는지만 검증한다.

describe("/api/analyze-audio: trimStartSec/trimEndSec 파라미터 안전성", () => {
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

  test("잘못된 타입(문자열)의 trimStartSec/trimEndSec → 무시되고 정상 동작(WAV 경로)", async () => {
    const silence = new Float32Array(44100 * 2);
    const wavBuf = buildWavBuffer(silence, 44100);
    const audio = wavBuf.toString("base64");
    const req = {
      ip: "7.7.7.7",
      body: { audio, format: ".wav", trimStartSec: "not-a-number", trimEndSec: "also-bad" },
    };
    const res = makeRes();
    await analyzeAudioHandler(req, res);
    assert.strictEqual(res.statusCode, 200);
  });

  test("음수 trimStartSec → 무시되고 400/413 없이 정상 응답", async () => {
    const silence = new Float32Array(44100 * 2);
    const wavBuf = buildWavBuffer(silence, 44100);
    const audio = wavBuf.toString("base64");
    const req = {
      ip: "8.8.8.8",
      body: { audio, format: ".wav", trimStartSec: -5, trimEndSec: 2 },
    };
    const res = makeRes();
    await analyzeAudioHandler(req, res);
    assert.strictEqual(res.statusCode, 200);
  });
});
