import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { logger } from "../lib/logger";

const orig = {
  log: console.log,
  info: console.info,
  warn: console.warn,
  error: console.error,
  debug: console.debug,
};

let logs: any[][];
let infos: any[][];
let warns: any[][];
let errors: any[][];
let debugs: any[][];

beforeEach(() => {
  logs = []; infos = []; warns = []; errors = []; debugs = [];
  console.log = (...a: any[]) => logs.push(a);
  console.info = (...a: any[]) => infos.push(a);
  console.warn = (...a: any[]) => warns.push(a);
  console.error = (...a: any[]) => errors.push(a);
  console.debug = (...a: any[]) => debugs.push(a);
});

afterEach(() => {
  console.log = orig.log;
  console.info = orig.info;
  console.warn = orig.warn;
  console.error = orig.error;
  console.debug = orig.debug;
});

test("logger: dev에서 모든 레벨 console로 통과", () => {
  logger.log("a");
  logger.info("b");
  logger.warn("c");
  logger.error("d");
  logger.debug("e");
  assert.deepEqual(logs, [["a"]]);
  assert.deepEqual(infos, [["b"]]);
  assert.deepEqual(warns, [["c"]]);
  assert.deepEqual(errors, [["d"]]);
  assert.deepEqual(debugs, [["e"]]);
});

test("logger: 가변 인자 모두 전달", () => {
  logger.warn("x", 1, { k: "v" });
  assert.deepEqual(warns, [["x", 1, { k: "v" }]]);
});
