import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  notifyStorageError,
  onStorageError,
  clearStorageErrorListeners,
  type StorageErrorInfo,
} from "../lib/storage-notifier";

const orig = { warn: console.warn };

beforeEach(() => {
  console.warn = () => {};
  clearStorageErrorListeners();
});

afterEach(() => {
  console.warn = orig.warn;
  clearStorageErrorListeners();
});

test("notifyStorageError: 등록된 리스너 호출", () => {
  const received: StorageErrorInfo[] = [];
  onStorageError((i) => received.push(i));
  notifyStorageError({ key: "k", operation: "save", error: new Error("oops") });
  assert.equal(received.length, 1);
  assert.equal(received[0].key, "k");
  assert.equal(received[0].operation, "save");
});

test("onStorageError: 반환된 unsubscribe로 해제", () => {
  const received: StorageErrorInfo[] = [];
  const unsub = onStorageError((i) => received.push(i));
  unsub();
  notifyStorageError({ key: "k", operation: "load", error: "x" });
  assert.equal(received.length, 0);
});

test("notifyStorageError: 리스너 throw 해도 다른 리스너 진행", () => {
  const received: string[] = [];
  onStorageError(() => { throw new Error("bad"); });
  onStorageError((i) => received.push(i.key));
  notifyStorageError({ key: "good", operation: "save", error: null });
  assert.deepEqual(received, ["good"]);
});

test("clearStorageErrorListeners: 모두 해제", () => {
  const received: StorageErrorInfo[] = [];
  onStorageError((i) => received.push(i));
  onStorageError((i) => received.push(i));
  clearStorageErrorListeners();
  notifyStorageError({ key: "k", operation: "save", error: null });
  assert.equal(received.length, 0);
});

test("notifyStorageError: 리스너 0개여도 안전", () => {
  notifyStorageError({ key: "k", operation: "load", error: null });
  assert.ok(true);
});
