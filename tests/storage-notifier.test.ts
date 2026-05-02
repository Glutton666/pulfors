import { test } from "node:test";
import assert from "node:assert/strict";

import {
  notifyStorageError,
  onStorageError,
  clearStorageErrorListeners,
} from "../lib/storage-notifier";

test("등록된 listener는 notifyStorageError 시 호출된다", () => {
  clearStorageErrorListeners();
  let received: any = null;
  const off = onStorageError((info) => { received = info; });
  notifyStorageError({ key: "test_key", operation: "save", error: new Error("disk full") });
  assert.equal(received.key, "test_key");
  assert.equal(received.operation, "save");
  off();
});

test("unsubscribe 후 listener가 더 이상 호출되지 않는다", () => {
  clearStorageErrorListeners();
  let count = 0;
  const off = onStorageError(() => { count++; });
  notifyStorageError({ key: "k", operation: "load", error: "x" });
  off();
  notifyStorageError({ key: "k", operation: "load", error: "x" });
  assert.equal(count, 1);
});

test("여러 listener가 모두 호출된다", () => {
  clearStorageErrorListeners();
  let a = 0; let b = 0;
  const offA = onStorageError(() => { a++; });
  const offB = onStorageError(() => { b++; });
  notifyStorageError({ key: "k", operation: "save", error: "x" });
  assert.equal(a, 1);
  assert.equal(b, 1);
  offA(); offB();
});

test("listener가 throw해도 다른 listener에 영향 없다", () => {
  clearStorageErrorListeners();
  let calledLast = false;
  onStorageError(() => { throw new Error("listener error"); });
  onStorageError(() => { calledLast = true; });
  notifyStorageError({ key: "k", operation: "save", error: "x" });
  assert.equal(calledLast, true);
  clearStorageErrorListeners();
});
