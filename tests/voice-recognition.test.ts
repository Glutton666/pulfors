import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isVoiceRecognitionSupported,
  startVoiceRecognition,
} from "../lib/voice-recognition";

test("isVoiceRecognitionSupported: native(ios)에서는 false", () => {
  // react-native stub Platform.OS = "ios"
  assert.equal(isVoiceRecognitionSupported(), false);
});

test("startVoiceRecognition: 미지원 환경에서 onError('not-supported') 후 null", () => {
  let errMsg: string | null = null;
  const handle = startVoiceRecognition({
    lang: "ko",
    onResult: () => {},
    onError: (e) => { errMsg = e; },
    onEnd: () => {},
  });
  assert.equal(handle, null);
  assert.equal(errMsg, "not-supported");
});

// --- 가짜 SpeechRecognition 환경에서 필터링 동작 검증 ---
class FakeRecognition {
  lang = "";
  interimResults = false;
  maxAlternatives = 0;
  continuous = false;
  onresult: ((e: any) => void) | null = null;
  onerror: ((e: any) => void) | null = null;
  onend: (() => void) | null = null;
  started = false;
  start() { this.started = true; }
  stop() {}
  emit(transcript: string, confidence: number) {
    this.onresult?.({
      results: [
        Object.assign([{ transcript, confidence }], { length: 1 }),
      ],
    });
  }
}

function withFakeSR<T>(fn: (rec: FakeRecognition) => T): T {
  const w = globalThis as any;
  let lastRec: FakeRecognition | null = null;
  if (typeof (w as any).window === "undefined") (w as any).window = w;
  const prevSR = (w.window as any).SpeechRecognition;
  (w.window as any).SpeechRecognition = function () {
    lastRec = new FakeRecognition();
    return lastRec;
  };
  const prevPlatform = require("react-native").Platform.OS;
  require("react-native").Platform.OS = "web";
  try {
    return fn((lastRec ?? new FakeRecognition()));
  } finally {
    (w.window as any).SpeechRecognition = prevSR;
    require("react-native").Platform.OS = prevPlatform;
  }
}

test("필터: 단일 문자 transcript는 onResult로 전달되지 않고 too-short로 보고됨", () => {
  withFakeSR(() => {
    const w = globalThis as any;
    const recs: FakeRecognition[] = [];
    (w.window as any).SpeechRecognition = function () { const r = new FakeRecognition(); recs.push(r); return r; };
    require("react-native").Platform.OS = "web";

    const seen: string[] = [];
    const filtered: { reason: string; t: string }[] = [];
    const handle = startVoiceRecognition({
      lang: "en",
      onResult: (t) => seen.push(t),
      onError: () => {},
      onEnd: () => {},
      onResultFiltered: (reason, t) => filtered.push({ reason, t }),
    });
    assert.ok(handle);
    recs[0].emit("k", 0.9);
    assert.deepEqual(seen, []);
    assert.equal(filtered[0]?.reason, "too-short");
  });
});

test("필터: confidence 0.2는 low-confidence로 차단", () => {
  withFakeSR(() => {
    const w = globalThis as any;
    const recs: FakeRecognition[] = [];
    (w.window as any).SpeechRecognition = function () { const r = new FakeRecognition(); recs.push(r); return r; };
    require("react-native").Platform.OS = "web";

    const seen: string[] = [];
    const filtered: string[] = [];
    const handle = startVoiceRecognition({
      lang: "en",
      onResult: (t) => seen.push(t),
      onError: () => {},
      onEnd: () => {},
      onResultFiltered: (reason) => filtered.push(reason),
    });
    assert.ok(handle);
    recs[0].emit("stop", 0.2);
    assert.deepEqual(seen, []);
    assert.equal(filtered[0], "low-confidence");
  });
});

test("필터: noteClick 직후 80ms 안의 결과는 click-blackout로 차단", () => {
  withFakeSR(() => {
    const w = globalThis as any;
    const recs: FakeRecognition[] = [];
    (w.window as any).SpeechRecognition = function () { const r = new FakeRecognition(); recs.push(r); return r; };
    require("react-native").Platform.OS = "web";

    const seen: string[] = [];
    const filtered: string[] = [];
    const handle = startVoiceRecognition({
      lang: "en",
      onResult: (t) => seen.push(t),
      onError: () => {},
      onEnd: () => {},
      clickBlackoutMs: 80,
      onResultFiltered: (reason) => filtered.push(reason),
    });
    assert.ok(handle);
    handle!.noteClick(Date.now());
    recs[0].emit("stop", 0.9);
    assert.deepEqual(seen, []);
    assert.equal(filtered[0], "click-blackout");
  });
});

test("옵션 override: minTranscriptLength=1 → 단일 문자도 허용", () => {
  withFakeSR(() => {
    const w = globalThis as any;
    const recs: FakeRecognition[] = [];
    (w.window as any).SpeechRecognition = function () { const r = new FakeRecognition(); recs.push(r); return r; };
    require("react-native").Platform.OS = "web";

    const seen: string[] = [];
    const handle = startVoiceRecognition({
      lang: "en",
      onResult: (t) => seen.push(t),
      onError: () => {},
      onEnd: () => {},
      minTranscriptLength: 1,
      minConfidence: 0,
    });
    assert.ok(handle);
    recs[0].emit("k", 0.1);
    assert.deepEqual(seen, ["k"]);
  });
});

test("정상 결과(2자 이상, confidence 충분)는 onResult로 전달", () => {
  withFakeSR(() => {
    const w = globalThis as any;
    const recs: FakeRecognition[] = [];
    (w.window as any).SpeechRecognition = function () { const r = new FakeRecognition(); recs.push(r); return r; };
    require("react-native").Platform.OS = "web";

    const seen: string[] = [];
    const handle = startVoiceRecognition({
      lang: "en",
      onResult: (t) => seen.push(t),
      onError: () => {},
      onEnd: () => {},
    });
    assert.ok(handle);
    recs[0].emit("stop", 0.9);
    assert.deepEqual(seen, ["stop"]);
  });
});
