import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseDeepLink } from "../lib/deep-link-handler";

describe("parseDeepLink — invalid / empty input", () => {
  test("빈 문자열 → null", () => {
    assert.equal(parseDeepLink(""), null);
  });

  test("잘못된 URL → null", () => {
    assert.equal(parseDeepLink("not a url"), null);
  });

  test("다른 스킴 → null", () => {
    assert.equal(parseDeepLink("https://example.com/play"), null);
    assert.equal(parseDeepLink("myapp://play"), null);
  });

  test("알 수 없는 host → null", () => {
    assert.equal(parseDeepLink("pulfors://unknown"), null);
    assert.equal(parseDeepLink("pulfors://start"), null);
  });

  test("스킴만 → null (host 없음)", () => {
    assert.equal(parseDeepLink("pulfors://"), null);
  });
});

describe("parseDeepLink — play / stop / toggle / reset", () => {
  test("play", () => {
    assert.deepEqual(parseDeepLink("pulfors://play"), { type: "play" });
  });

  test("stop", () => {
    assert.deepEqual(parseDeepLink("pulfors://stop"), { type: "stop" });
  });

  test("toggle", () => {
    assert.deepEqual(parseDeepLink("pulfors://toggle"), { type: "toggle" });
  });

  test("reset", () => {
    assert.deepEqual(parseDeepLink("pulfors://reset"), { type: "reset" });
  });
});

describe("parseDeepLink — bpm?value", () => {
  test("bpm?value=120 → setBpm 120", () => {
    assert.deepEqual(parseDeepLink("pulfors://bpm?value=120"), { type: "setBpm", bpm: 120 });
  });

  test("bpm?value=60 → setBpm 60", () => {
    assert.deepEqual(parseDeepLink("pulfors://bpm?value=60"), { type: "setBpm", bpm: 60 });
  });

  test("bpm?value=200 → setBpm 200", () => {
    assert.deepEqual(parseDeepLink("pulfors://bpm?value=200"), { type: "setBpm", bpm: 200 });
  });

  test("bpm?value=1 → clamped to 20", () => {
    assert.deepEqual(parseDeepLink("pulfors://bpm?value=1"), { type: "setBpm", bpm: 20 });
  });

  test("bpm?value=999 → clamped to 300", () => {
    assert.deepEqual(parseDeepLink("pulfors://bpm?value=999"), { type: "setBpm", bpm: 300 });
  });

  test("bpm?value=abc → null", () => {
    assert.equal(parseDeepLink("pulfors://bpm?value=abc"), null);
  });

  test("bpm 파라미터 없음 → null", () => {
    assert.equal(parseDeepLink("pulfors://bpm"), null);
  });
});

describe("parseDeepLink — bpm?delta", () => {
  test("bpm?delta=+10 → bpmDelta +10", () => {
    assert.deepEqual(parseDeepLink("pulfors://bpm?delta=%2B10"), { type: "bpmDelta", delta: 10 });
  });

  test("bpm?delta=10 → bpmDelta +10", () => {
    assert.deepEqual(parseDeepLink("pulfors://bpm?delta=10"), { type: "bpmDelta", delta: 10 });
  });

  test("bpm?delta=-10 → bpmDelta -10", () => {
    assert.deepEqual(parseDeepLink("pulfors://bpm?delta=-10"), { type: "bpmDelta", delta: -10 });
  });

  test("bpm?delta=-5 → bpmDelta -5", () => {
    assert.deepEqual(parseDeepLink("pulfors://bpm?delta=-5"), { type: "bpmDelta", delta: -5 });
  });

  test("bpm?delta=abc → null", () => {
    assert.equal(parseDeepLink("pulfors://bpm?delta=abc"), null);
  });
});

describe("parseDeepLink — beats?value", () => {
  test("beats?value=4 → setBeats 4", () => {
    assert.deepEqual(parseDeepLink("pulfors://beats?value=4"), { type: "setBeats", beats: 4 });
  });

  test("beats?value=3 → setBeats 3", () => {
    assert.deepEqual(parseDeepLink("pulfors://beats?value=3"), { type: "setBeats", beats: 3 });
  });

  test("beats?value=0 → clamped to 1", () => {
    assert.deepEqual(parseDeepLink("pulfors://beats?value=0"), { type: "setBeats", beats: 1 });
  });

  test("beats?value=99 → clamped to 16", () => {
    assert.deepEqual(parseDeepLink("pulfors://beats?value=99"), { type: "setBeats", beats: 16 });
  });

  test("beats?value=abc → null", () => {
    assert.equal(parseDeepLink("pulfors://beats?value=abc"), null);
  });

  test("beats 파라미터 없음 → null", () => {
    assert.equal(parseDeepLink("pulfors://beats"), null);
  });
});

describe("parseDeepLink — 경계값 및 소수점", () => {
  test("bpm?value=20 → 최소값 그대로", () => {
    assert.deepEqual(parseDeepLink("pulfors://bpm?value=20"), { type: "setBpm", bpm: 20 });
  });

  test("bpm?value=300 → 최대값 그대로", () => {
    assert.deepEqual(parseDeepLink("pulfors://bpm?value=300"), { type: "setBpm", bpm: 300 });
  });

  test("beats?value=1 → 최소값 그대로", () => {
    assert.deepEqual(parseDeepLink("pulfors://beats?value=1"), { type: "setBeats", beats: 1 });
  });

  test("beats?value=16 → 최대값 그대로", () => {
    assert.deepEqual(parseDeepLink("pulfors://beats?value=16"), { type: "setBeats", beats: 16 });
  });
});

describe("parseDeepLink — 전체 명령 null 아님 확인", () => {
  const validUrls = [
    "pulfors://play",
    "pulfors://stop",
    "pulfors://toggle",
    "pulfors://reset",
    "pulfors://bpm?value=120",
    "pulfors://bpm?delta=5",
    "pulfors://bpm?delta=-5",
    "pulfors://beats?value=4",
  ];

  for (const url of validUrls) {
    test(`${url} → null 아님`, () => {
      assert.notEqual(parseDeepLink(url), null);
    });
  }
});
