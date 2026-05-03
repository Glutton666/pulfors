import { test } from "node:test";
import assert from "node:assert/strict";

import { buildPreviewUri } from "../lib/note-preview";

test("channel='both'은 입력 uri를 그대로 반환하고 decode/save를 호출하지 않는다", async () => {
  let decoded = 0;
  let saved = 0;
  const out = await buildPreviewUri("file:///rec.m4a#t=100,500", "both", {
    decode: async () => { decoded += 1; return new Float32Array(10); },
    save: async () => { saved += 1; return "should-not-be-used"; },
  });
  assert.equal(out, "file:///rec.m4a#t=100,500");
  assert.equal(decoded, 0);
  assert.equal(saved, 0);
});

test("channel='left'은 decode 후 saveStereoSampleWav를 left 인자로 호출하고 결과 uri를 반환", async () => {
  const captured: { ch?: string; len?: number; filename?: string } = {};
  const out = await buildPreviewUri("file:///rec.m4a", "left", {
    decode: async () => new Float32Array([0.1, 0.2, 0.3]),
    save: async (mono, ch, filename) => {
      captured.ch = ch;
      captured.len = mono.length;
      captured.filename = filename;
      return "file:///cache/preview_left.wav";
    },
    now: () => 12345,
  });
  assert.equal(out, "file:///cache/preview_left.wav");
  assert.equal(captured.ch, "left");
  assert.equal(captured.len, 3);
  assert.match(captured.filename ?? "", /left/);
  assert.match(captured.filename ?? "", /12345/);
});

test("channel='right'은 right 인자로 save를 호출", async () => {
  let chSeen: string | undefined;
  await buildPreviewUri("file:///rec.m4a", "right", {
    decode: async () => new Float32Array([0]),
    save: async (_m, ch) => { chSeen = ch; return "x"; },
  });
  assert.equal(chSeen, "right");
});

test("decode 실패(null)는 원본 uri 폴백", async () => {
  const out = await buildPreviewUri("file:///rec.m4a#t=0,1000", "left", {
    decode: async () => null,
    save: async () => { throw new Error("should not call"); },
  });
  assert.equal(out, "file:///rec.m4a#t=0,1000");
});

test("decode가 빈 PCM 반환하면 save 호출 없이 원본 폴백", async () => {
  let saveCalls = 0;
  const out = await buildPreviewUri("file:///rec.m4a", "right", {
    decode: async () => new Float32Array(0),
    save: async () => { saveCalls += 1; return "x"; },
  });
  assert.equal(out, "file:///rec.m4a");
  assert.equal(saveCalls, 0);
});

test("decode 예외 던지면 원본 uri 폴백", async () => {
  const out = await buildPreviewUri("file:///rec.m4a", "left", {
    decode: async () => { throw new Error("boom"); },
    save: async () => { throw new Error("nope"); },
  });
  assert.equal(out, "file:///rec.m4a");
});

test("decode 시 #t= 프래그먼트는 제거된 raw uri로 전달된다", async () => {
  let decodeArg: string | undefined;
  await buildPreviewUri("file:///rec.m4a#t=100,500", "left", {
    decode: async (u) => { decodeArg = u; return new Float32Array([0]); },
    save: async () => "ok",
  });
  assert.equal(decodeArg, "file:///rec.m4a");
});
