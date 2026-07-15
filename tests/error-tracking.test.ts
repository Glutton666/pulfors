import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  initErrorTracking,
  captureException,
  captureBreadcrumb,
  isErrorTrackingActive,
} from "../lib/error-tracking";

const orig = {
  info: console.info,
  warn: console.warn,
  error: console.error,
};
let infos: any[][];
let warns: any[][];
let errors: any[][];
const savedDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

beforeEach(() => {
  infos = []; warns = []; errors = [];
  console.info = (...a: any[]) => infos.push(a);
  console.warn = (...a: any[]) => warns.push(a);
  console.error = (...a: any[]) => errors.push(a);
  delete process.env.EXPO_PUBLIC_SENTRY_DSN;
});

afterEach(() => {
  console.info = orig.info;
  console.warn = orig.warn;
  console.error = orig.error;
  if (savedDsn !== undefined) process.env.EXPO_PUBLIC_SENTRY_DSN = savedDsn;
});

test("isErrorTrackingActive: DSN 없이 false", () => {
  assert.equal(isErrorTrackingActive(), false);
});

test("initErrorTracking: DSN 없으면 console-only 안내", async () => {
  await initErrorTracking();
  assert.equal(isErrorTrackingActive(), false);
});

test("initErrorTracking: DSN 있어도 패키지 미설치면 안전", async () => {
  process.env.EXPO_PUBLIC_SENTRY_DSN = "https://x@y/1";
  await initErrorTracking();
  assert.equal(isErrorTrackingActive(), false);
});

test("captureException: 항상 console.error로 기록", () => {
  captureException(new Error("boom"), { ctx: 1 });
  assert.equal(errors.length, 1);
  assert.equal(errors[0][0], "[error-tracking]");
});

test("captureException: 컨텍스트 없이도 안전", () => {
  captureException("문자열 에러");
  assert.equal(errors.length, 1);
});

test("captureBreadcrumb: warning 이상은 dev에서 console.warn", () => {
  captureBreadcrumb({ category: "audio", message: "underrun", level: "warning" });
  assert.equal(warns.length, 1);
  assert.match(warns[0][0], /breadcrumb.*audio.*underrun/);
});

test("captureBreadcrumb: info 레벨은 console 미출력", () => {
  captureBreadcrumb({ category: "x", message: "hi", level: "info" });
  assert.equal(warns.length, 0);
  assert.equal(errors.length, 0);
});

test("captureBreadcrumb: 레벨 없이도 안전", () => {
  captureBreadcrumb({ message: "no-level" });
  assert.equal(warns.length, 0);
});
