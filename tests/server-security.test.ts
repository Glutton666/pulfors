import { test, describe } from "node:test";
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
    const localPath = path.resolve(
      process.cwd(),
      "assets/js/qr-code-styling.js",
    );
    assert.ok(
      fs.existsSync(localPath),
      "assets/js/qr-code-styling.js 파일이 존재해야 합니다",
    );
  });

  test("self-hosted qr-code-styling.js 파일이 비어있지 않음", () => {
    const localPath = path.resolve(
      process.cwd(),
      "assets/js/qr-code-styling.js",
    );
    const size = fs.statSync(localPath).size;
    assert.ok(size > 1000, `파일 크기(${size} bytes)가 너무 작습니다 — 올바로 다운로드됐는지 확인 필요`);
  });
});

describe("routes.ts: WAV 동시성 가드 코드 존재 검증", () => {
  const src = fs.readFileSync(
    path.resolve(process.cwd(), "server/routes.ts"),
    "utf-8",
  );

  test("activeWavCount 변수 선언이 존재함", () => {
    assert.ok(
      src.includes("activeWavCount"),
      "activeWavCount 동시성 카운터가 선언되어야 합니다",
    );
  });

  test("MAX_CONCURRENT_WAV 상수가 선언됨", () => {
    assert.ok(
      src.includes("MAX_CONCURRENT_WAV"),
      "MAX_CONCURRENT_WAV 동시성 상한 상수가 선언되어야 합니다",
    );
  });

  test("WAV 경로에 activeWavCount 가드가 있음 (503 반환)", () => {
    assert.ok(
      src.includes("activeWavCount >= MAX_CONCURRENT_WAV"),
      "WAV 경로에 동시성 가드(activeWavCount >= MAX_CONCURRENT_WAV)가 있어야 합니다",
    );
  });

  test("WAV 분석 후 activeWavCount-- finally 정리가 있음", () => {
    assert.ok(
      src.includes("activeWavCount--"),
      "finally 블록에서 activeWavCount-- 정리가 있어야 합니다",
    );
  });
});

describe("routes.ts: per-IP rate limiting 코드 존재 검증", () => {
  const src = fs.readFileSync(
    path.resolve(process.cwd(), "server/routes.ts"),
    "utf-8",
  );

  test("isRateLimited 함수가 선언됨", () => {
    assert.ok(
      src.includes("function isRateLimited"),
      "isRateLimited 함수가 선언되어야 합니다",
    );
  });

  test("RATE_LIMIT_MAX_REQUESTS 상수가 선언됨", () => {
    assert.ok(
      src.includes("RATE_LIMIT_MAX_REQUESTS"),
      "RATE_LIMIT_MAX_REQUESTS 상수가 선언되어야 합니다",
    );
  });

  test("analyzeAudioHandler에서 isRateLimited 호출 후 429 반환", () => {
    assert.ok(
      src.includes("isRateLimited(ip)"),
      "analyzeAudioHandler가 isRateLimited(ip)를 호출해야 합니다",
    );
    assert.ok(
      src.includes("429"),
      "rate limit 초과 시 HTTP 429 응답이 있어야 합니다",
    );
  });

  test("x-forwarded-for 헤더에서 IP를 추출함 (프록시 뒤 클라이언트 식별)", () => {
    assert.ok(
      src.includes("x-forwarded-for"),
      "x-forwarded-for 헤더로 실제 클라이언트 IP를 추출해야 합니다",
    );
  });
});
