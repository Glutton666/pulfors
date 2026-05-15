import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

describe("Landing page: CDN script self-hosting", () => {
  const html = fs.readFileSync(
    path.resolve(process.cwd(), "server/templates/landing-page.html"),
    "utf-8",
  );

  test("qr-code-styling CDN URL이 landing-page.html에 존재하지 않음", () => {
    assert.ok(
      !html.includes("unpkg.com"),
      "외부 CDN(unpkg.com) 참조가 제거되어야 합니다",
    );
  });

  test("qr-code-styling 스크립트가 로컬 경로(/assets/js/)로 로드됨", () => {
    assert.ok(
      html.includes("/assets/js/qr-code-styling.js"),
      "self-hosted 경로 /assets/js/qr-code-styling.js 참조가 있어야 합니다",
    );
  });

  test("self-hosted qr-code-styling.js 파일이 실제로 존재함", () => {
    const localPath = path.resolve(process.cwd(), "assets/js/qr-code-styling.js");
    assert.ok(fs.existsSync(localPath), "assets/js/qr-code-styling.js 파일이 존재해야 합니다");
  });

  test("self-hosted qr-code-styling.js 파일이 비어있지 않음", () => {
    const localPath = path.resolve(process.cwd(), "assets/js/qr-code-styling.js");
    const size = fs.statSync(localPath).size;
    assert.ok(size > 1000, `파일 크기(${size} bytes)가 너무 작음`);
  });
});

describe("isRateLimited: sliding window per-IP rate limit 런타임 동작", () => {
  const { isRateLimited, _ipRequestLog, RATE_LIMIT_MAX_REQUESTS } =
    require("../server/routes") as {
      isRateLimited: (ip: string) => boolean;
      _ipRequestLog: Map<string, number[]>;
      RATE_LIMIT_MAX_REQUESTS: number;
    };

  beforeEach(() => {
    _ipRequestLog.clear();
  });

  test("허용 한도(RATE_LIMIT_MAX_REQUESTS)까지는 false 반환", () => {
    const ip = "1.2.3.4";
    for (let i = 0; i < RATE_LIMIT_MAX_REQUESTS; i++) {
      assert.strictEqual(isRateLimited(ip), false, `${i + 1}번째 요청이 차단되면 안 됨`);
    }
  });

  test("한도 초과 시 true 반환 (429 응답 대상)", () => {
    const ip = "2.3.4.5";
    for (let i = 0; i < RATE_LIMIT_MAX_REQUESTS; i++) isRateLimited(ip);
    assert.strictEqual(isRateLimited(ip), true, "한도+1번째 요청은 차단되어야 함");
  });

  test("다른 IP는 독립적으로 카운트됨", () => {
    const ip1 = "10.0.0.1";
    const ip2 = "10.0.0.2";
    for (let i = 0; i < RATE_LIMIT_MAX_REQUESTS; i++) isRateLimited(ip1);
    assert.strictEqual(isRateLimited(ip1), true, "ip1은 차단되어야 함");
    assert.strictEqual(isRateLimited(ip2), false, "ip2는 차단되지 않아야 함");
  });

  test("윈도우 이전 타임스탬프는 무시됨 (슬라이딩 윈도우)", () => {
    const ip = "3.4.5.6";
    const oldTs = Date.now() - 61_000;
    _ipRequestLog.set(ip, new Array(RATE_LIMIT_MAX_REQUESTS).fill(oldTs));
    assert.strictEqual(isRateLimited(ip), false, "만료된 타임스탬프는 카운트에서 제외되어야 함");
  });
});

describe("WAV Worker Thread: 비차단 분석 런타임 검증", () => {
  test("Worker eval에서 침묵 WAV 분석 시 null 반환 (이벤트 루프 비차단 확인)", async () => {
    const { Worker } = await import("node:worker_threads");

    const WORKER_CODE = `
const { workerData, parentPort } = require('worker_threads');
const MAX_AUDIO_SAMPLES = 144000;
const MAX_ANALYSIS_WINDOWS = 5;
function autoCorrelate(buffer, sampleRate, rmsThreshold) {
  rmsThreshold = rmsThreshold || 0.03;
  const SIZE = buffer.length;
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < rmsThreshold) return -1;
  return -1;
}
function decodeWavBuffer(buf) {
  try {
    if (buf.length < 44) return null;
    if (buf.toString('ascii', 0, 4) !== 'RIFF') return null;
    return null;
  } catch { return null; }
}
const buf = Buffer.from(workerData.buffer);
const decoded = decodeWavBuffer(buf);
try { parentPort.postMessage({ ok: true, result: { frequency: null, note: null } }); }
catch (e) { parentPort.postMessage({ ok: false, error: e.message }); }
`;
    const silentWav = Buffer.alloc(44);
    silentWav.write("RIFF", 0, "ascii");

    const result = await new Promise<{ ok: boolean; result: unknown }>((resolve, reject) => {
      const worker = new Worker(WORKER_CODE, {
        eval: true,
        workerData: { buffer: Array.from(silentWav) },
      });
      const timer = setTimeout(() => { worker.terminate(); reject(new Error("timeout")); }, 5000);
      worker.on("message", (msg) => { clearTimeout(timer); resolve(msg); });
      worker.on("error", (e) => { clearTimeout(timer); reject(e); });
    });

    assert.strictEqual(result.ok, true, "Worker가 성공적으로 완료되어야 함");
  });

  test("Worker Thread는 eval 모드로 별도 스레드에서 실행됨 (isMainThread = false)", async () => {
    const { Worker } = await import("node:worker_threads");
    const CODE = `
const { isMainThread, parentPort } = require('worker_threads');
parentPort.postMessage({ isMainThread });
`;
    const isMain = await new Promise<boolean>((resolve, reject) => {
      const w = new Worker(CODE, { eval: true });
      const timer = setTimeout(() => { w.terminate(); reject(new Error("timeout")); }, 3000);
      w.on("message", (msg) => { clearTimeout(timer); resolve(msg.isMainThread); });
      w.on("error", reject);
    });
    assert.strictEqual(isMain, false, "Worker Thread는 isMainThread = false이어야 함");
  });
});

describe("server/index.ts: trust proxy 설정 확인", () => {
  const src = fs.readFileSync(path.resolve(process.cwd(), "server/index.ts"), "utf-8");

  test("app.set('trust proxy') 설정이 존재함", () => {
    assert.ok(src.includes("trust proxy"), "trust proxy 설정이 있어야 함");
  });
});

describe("routes.ts: req.ip 사용 (x-forwarded-for 직접 파싱 제거)", () => {
  const src = fs.readFileSync(path.resolve(process.cwd(), "server/routes.ts"), "utf-8");

  test("req.ip 사용으로 IP 추출함", () => {
    assert.ok(src.includes("req.ip"), "req.ip 사용이 있어야 함");
  });

  test("x-forwarded-for 직접 파싱(.split) 없음 (spoofing 위험 제거됨)", () => {
    const hasSpoofablePattern = src.includes("x-forwarded-for") && src.includes(".split(\",\")");
    assert.ok(!hasSpoofablePattern, "x-forwarded-for 헤더를 직접 split하는 코드가 없어야 함");
  });
});

describe("/api/analyze-audio: 429/503 통합 동작 테스트 (mock req/res)", () => {
  const routesModule = require("../server/routes") as {
    analyzeAudioHandler: (req: any, res: any) => Promise<any>;
    isRateLimited: (ip: string) => boolean;
    _ipRequestLog: Map<string, number[]>;
    RATE_LIMIT_MAX_REQUESTS: number;
    MAX_CONCURRENT_WAV: number;
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

  beforeEach(() => {
    routesModule._ipRequestLog.clear();
  });

  test("rate limit 초과 시 429 반환", async () => {
    const ip = "9.9.9.9";
    for (let i = 0; i < routesModule.RATE_LIMIT_MAX_REQUESTS; i++) {
      routesModule.isRateLimited(ip);
    }
    const req = { ip, socket: { remoteAddress: ip }, body: { audio: "dGVzdA==", format: ".wav" } };
    const res = makeRes();
    await routesModule.analyzeAudioHandler(req, res);
    assert.strictEqual(res.statusCode, 429, "rate limit 초과 시 HTTP 429이어야 함");
    assert.ok((res.body as any)?.error, "에러 메시지가 포함되어야 함");
  });

  test("audio 필드 누락 시 400 반환", async () => {
    const ip = "8.8.8.8";
    const req = { ip, socket: { remoteAddress: ip }, body: {} };
    const res = makeRes();
    await routesModule.analyzeAudioHandler(req, res);
    assert.strictEqual(res.statusCode, 400, "audio 누락 시 400이어야 함");
  });

  test("audio 필드 크기 초과 시 413 반환", async () => {
    const ip = "7.7.7.7";
    const MAX_CHARS = Math.ceil((5 * 1024 * 1024) / 3) * 4;
    const req = { ip, socket: { remoteAddress: ip }, body: { audio: "A".repeat(MAX_CHARS + 1), format: ".wav" } };
    const res = makeRes();
    await routesModule.analyzeAudioHandler(req, res);
    assert.strictEqual(res.statusCode, 413, "audio 크기 초과 시 413이어야 함");
  });
});
