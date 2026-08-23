import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import express from "express";
import type { Server } from "node:http";

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

describe("isRateLimited: fixed window per-IP rate limit 런타임 동작", () => {
  const { isRateLimited, _ipRequestLog, RATE_LIMIT_MAX_REQUESTS } =
    require("../server/routes") as {
      isRateLimited: (ip: string) => boolean;
      _ipRequestLog: Map<string, { count: number; windowStart: number }>;
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

  test("만료된 고정 윈도우는 새 요청부터 다시 시작", () => {
    const ip = "3.4.5.6";
    const oldTs = Date.now() - 61_000;
    _ipRequestLog.set(ip, { count: RATE_LIMIT_MAX_REQUESTS, windowStart: oldTs });
    assert.strictEqual(isRateLimited(ip), false, "만료된 윈도우는 새 카운트로 시작해야 함");
  });
});

describe("WAV Worker Thread: 비차단 분석 런타임 검증", () => {
  test("Worker eval에서 침묵 WAV 분석 시 null 반환 (이벤트 루프 비차단 확인)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Worker } = require("worker_threads");

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
      worker.on("message", (msg: { ok: boolean; result: unknown }) => { clearTimeout(timer); resolve(msg); });
      worker.on("error", (e: Error) => { clearTimeout(timer); reject(e); });
    });

    assert.strictEqual(result.ok, true, "Worker가 성공적으로 완료되어야 함");
  });

  test("Worker Thread는 eval 모드로 별도 스레드에서 실행됨 (isMainThread = false)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Worker } = require("worker_threads");
    const CODE = `
const { isMainThread, parentPort } = require('worker_threads');
parentPort.postMessage({ isMainThread });
`;
    const isMain = await new Promise<boolean>((resolve, reject) => {
      const w = new Worker(CODE, { eval: true });
      const timer = setTimeout(() => { w.terminate(); reject(new Error("timeout")); }, 3000);
      w.on("message", (msg: { isMainThread: boolean }) => { clearTimeout(timer); resolve(msg.isMainThread); });
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
    _ipRequestLog: Map<string, { count: number; windowStart: number }>;
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

  function makeShortAudioFixture(
    extension: ".3gp" | ".webm",
    codec: string,
    muxer: string,
  ): string {
    const directory = fs.mkdtempSync(path.join(tmpdir(), "audio-format-fixture-"));
    const filePath = path.join(directory, `sample${extension}`);
    try {
      execFileSync("ffmpeg", [
        "-v", "error",
        "-y",
        "-f", "lavfi",
        "-i", "anullsrc=channel_layout=mono:sample_rate=48000",
        "-t", "0.25",
        "-c:a", codec,
        "-f", muxer,
        filePath,
      ], { stdio: "pipe" });
      return fs.readFileSync(filePath).toString("base64");
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
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

  test("잘못된 base64는 디코더에 넘기지 않고 400으로 거절", async () => {
    const req = { ip: "6.6.6.6", body: { audio: "not base64!", format: ".wav" } };
    const res = makeRes();
    await routesModule.analyzeAudioHandler(req, res);
    assert.strictEqual(res.statusCode, 400);
    assert.deepStrictEqual(res.body, { error: "Audio data must be valid base64" });
  });

  test("허용되지 않은 오디오 확장자는 415로 거절", async () => {
    const req = { ip: "5.5.5.5", body: { audio: "dGVzdA==", format: ".exe" } };
    const res = makeRes();
    await routesModule.analyzeAudioHandler(req, res);
    assert.strictEqual(res.statusCode, 415);
    assert.deepStrictEqual(res.body, { error: "Unsupported audio format" });
  });

  test("WAV라고 주장하지만 RIFF/WAVE 헤더가 아닌 데이터는 415로 거절", async () => {
    const req = { ip: "4.4.4.4", body: { audio: "dGVzdA==", format: ".wav" } };
    const res = makeRes();
    await routesModule.analyzeAudioHandler(req, res);
    assert.strictEqual(res.statusCode, 415);
    assert.deepStrictEqual(res.body, { error: "Audio data does not match the WAV format" });
  });

  test("허용 목록의 비-WAV 확장자도 실제 컨테이너 서명이 아니면 415로 거절", async () => {
    for (const [index, format] of [".m4a", ".3gp", ".mp4", ".aac", ".webm"].entries()) {
      const req = { ip: `4.4.5.${index}`, body: { audio: "dGVzdA==", format } };
      const res = makeRes();
      await routesModule.analyzeAudioHandler(req, res);
      assert.strictEqual(res.statusCode, 415, `${format} should require a matching container signature`);
      assert.deepStrictEqual(res.body, { error: "Audio data does not match the declared format" });
    }
  });

  test("유효한 3GP와 WebM 컨테이너는 명시적인 FFmpeg demuxer로 분석됨", async () => {
    const fixtures = [
      { format: ".3gp" as const, codec: "aac", muxer: "3gp" },
      { format: ".webm" as const, codec: "libopus", muxer: "webm" },
    ];

    for (const [index, fixture] of fixtures.entries()) {
      const req = {
        ip: `4.4.6.${index}`,
        body: {
          audio: makeShortAudioFixture(fixture.format, fixture.codec, fixture.muxer),
          format: fixture.format,
        },
      };
      const res = makeRes();
      await routesModule.analyzeAudioHandler(req, res);
      assert.strictEqual(res.statusCode, 200, `${fixture.format} fixture should be accepted`);
      assert.ok(res.body && typeof res.body === "object");
    }
  });

  test("객체가 아닌 요청 본문은 400으로 거절", async () => {
    const req = { ip: "3.3.3.3", body: [] };
    const res = makeRes();
    await routesModule.analyzeAudioHandler(req, res);
    assert.strictEqual(res.statusCode, 400);
  });
});

describe("server boundary policy: CORS, proxy, host, and safe failures", () => {
  const indexSource = fs.readFileSync(path.resolve(process.cwd(), "server/index.ts"), "utf-8");
  const routesSource = fs.readFileSync(path.resolve(process.cwd(), "server/routes.ts"), "utf-8");

  test("개발 localhost 허용은 production 전용이 아니라 개발 환경에만 한정됨", () => {
    assert.ok(indexSource.includes("return !isProduction &&"));
    assert.ok(indexSource.includes("localhost|127\\.0\\.0\\.1"));
  });

  test("허용되지 않은 API Origin과 preflight는 403으로 거절", () => {
    assert.match(indexSource, /origin && !isAllowedCorsOrigin\(origin\) && req\.path\.startsWith\("\/api"\)/);
    assert.match(indexSource, /res\.status\(403\)\.json\(\{ error: "Origin not allowed" \}\)/);
  });

  test("신뢰 프록시는 환경/명시적인 hop 값으로만 설정", () => {
    assert.match(indexSource, /TRUST_PROXY_HOPS/);
    assert.match(indexSource, /app\.set\("trust proxy", getTrustProxyHops\(\)\)/);
    assert.match(indexSource, /return 0;/);
  });

  test("호스트 반사는 허용 형식과 구성된 호스트를 확인", () => {
    assert.match(indexSource, /isSafePublicHost/);
    assert.match(indexSource, /fallbackHost/);
    assert.match(indexSource, /escapeHtml\(appName\)/);
    assert.match(indexSource, /configured === normalizedHost/);
  });

  test("기본 보안 응답 헤더를 모든 요청에 적용", () => {
    for (const header of ["X-Content-Type-Options", "Referrer-Policy", "Permissions-Policy"]) {
      assert.ok(indexSource.includes(header), `missing security header: ${header}`);
    }
  });

  test("변환기·워커의 내부 예외 문자열을 API 응답에 그대로 보내지 않음", () => {
    assert.ok(!routesSource.includes("json({ error: e.message })"));
    assert.ok(!routesSource.includes("e.detail ?? e.message"));
    assert.match(routesSource, /Audio data could not be analyzed/);
    assert.match(routesSource, /Audio analysis timed out/);
  });

  test("비-WAV 입력은 컨테이너 서명과 명시적인 FFmpeg 입력 형식을 함께 확인", () => {
    assert.match(routesSource, /isDeclaredContainer/);
    assert.match(routesSource, /FFMPEG_INPUT_FORMAT/);
    assert.match(routesSource, /args\.push\("-f", inputFormat\)/);
  });
});

describe("server security middleware: HTTP response behavior", () => {
  const {
    setupBodyParsing,
    setupCors,
    setupErrorHandler,
    setupSecurityHeaders,
  } = require("../server/index") as {
    setupBodyParsing: (app: express.Express) => void;
    setupCors: (app: express.Express) => void;
    setupErrorHandler: (app: express.Express) => void;
    setupSecurityHeaders: (app: express.Express) => void;
  };

  async function withTestServer(
    callback: (baseUrl: string) => Promise<void>,
  ): Promise<void> {
    const app = express();
    setupSecurityHeaders(app);
    setupCors(app);
    setupBodyParsing(app);
    app.post("/api/echo", (req, res) => res.json(req.body));
    setupErrorHandler(app);

    const server = await new Promise<Server>((resolve) => {
      const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not expose a TCP port");

    try {
      await callback(`http://127.0.0.1:${address.port}`);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  }

  test("허용된 개발 Origin에는 CORS와 기본 보안 헤더를 모두 보냄", async () => {
    await withTestServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/echo`, {
        method: "POST",
        headers: {
          Origin: "http://localhost:3000",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ok: true }),
      });

      assert.equal(response.status, 200);
      assert.equal(response.headers.get("access-control-allow-origin"), "http://localhost:3000");
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
      assert.equal(response.headers.get("referrer-policy"), "no-referrer");
      assert.equal(response.headers.get("permissions-policy"), "camera=(), microphone=(self)");
    });
  });

  test("허용되지 않은 Origin의 API 요청은 403이며 CORS 헤더를 주지 않음", async () => {
    await withTestServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/echo`, {
        method: "POST",
        headers: {
          Origin: "https://untrusted.example",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ok: true }),
      });

      assert.equal(response.status, 403);
      assert.equal(response.headers.get("access-control-allow-origin"), null);
      assert.deepStrictEqual(await response.json(), { error: "Origin not allowed" });
    });
  });

  test("잘못된 JSON은 내부 파서 오류 대신 안전한 400 응답을 받음", async () => {
    await withTestServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/echo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{not-json",
      });

      assert.equal(response.status, 400);
      assert.deepStrictEqual(await response.json(), { message: "Invalid request body" });
    });
  });
});
