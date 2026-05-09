/**
 * deep-link-import.test.ts
 *
 * sanitizeDeepLinkEntry() 의 보안 경계 회귀 테스트.
 * - 외부 URI noteSamples 제거 (최상위 + 중첩 noteQueueEntries)
 * - 스키마 유효성 (bpm/beatTypes 누락 → null)
 * - 숫자 클램프
 * - enum 필드 검증
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { sanitizeDeepLinkEntry } from "../lib/deep-link-import";

const VALID_BASE = {
  id: "abc",
  label: "테스트",
  bpm: 120,
  beatsPerMeasure: 4,
  beatTypes: ["quarter", "quarter", "quarter", "quarter"],
  beatSubdivisions: {},
  barRepeats: {},
  barLoopMode: "loop",
  subdivisionPattern: [],
  createdAt: 1700000000000,
};

describe("sanitizeDeepLinkEntry — 필수 필드 검증", () => {
  test("bpm 누락 → null", () => {
    const { bpm: _, ...rest } = VALID_BASE;
    assert.equal(sanitizeDeepLinkEntry(rest), null);
  });

  test("bpm 문자열 → null", () => {
    assert.equal(sanitizeDeepLinkEntry({ ...VALID_BASE, bpm: "120" }), null);
  });

  test("bpm NaN → null", () => {
    assert.equal(sanitizeDeepLinkEntry({ ...VALID_BASE, bpm: NaN }), null);
  });

  test("beatTypes 누락 → null", () => {
    const { beatTypes: _, ...rest } = VALID_BASE;
    assert.equal(sanitizeDeepLinkEntry(rest), null);
  });

  test("beatTypes 비배열 → null", () => {
    assert.equal(sanitizeDeepLinkEntry({ ...VALID_BASE, beatTypes: "quarter" }), null);
  });

  test("null 페이로드 → null", () => {
    assert.equal(sanitizeDeepLinkEntry(null), null);
  });

  test("배열 페이로드 → null", () => {
    assert.equal(sanitizeDeepLinkEntry([VALID_BASE]), null);
  });

  test("문자열 페이로드 → null", () => {
    assert.equal(sanitizeDeepLinkEntry("{}"), null);
  });
});

describe("sanitizeDeepLinkEntry — noteSamples 제거", () => {
  test("최상위 http:// noteSamples 제거", () => {
    const raw = {
      ...VALID_BASE,
      noteSamples: {
        a: "https://evil.example.com/kick.wav",
        b: "http://attacker.net/snare.mp3",
      },
    };
    const result = sanitizeDeepLinkEntry(raw);
    assert.ok(result);
    assert.deepEqual(result.noteSamples, {});
  });

  test("최상위 file:// noteSamples 도 제거 (수신 측에서 유효하지 않음)", () => {
    const raw = {
      ...VALID_BASE,
      noteSamples: {
        a: "file:///sender-device/Documents/kick.wav",
      },
    };
    const result = sanitizeDeepLinkEntry(raw);
    assert.ok(result);
    assert.deepEqual(result.noteSamples, {});
  });

  test("noteSampleNames / noteSampleSources 도 포함되지 않음", () => {
    const raw = {
      ...VALID_BASE,
      noteSampleNames: { a: "킥" },
      noteSampleSources: { a: "recording" },
    };
    const result = sanitizeDeepLinkEntry(raw);
    assert.ok(result);
    assert.equal(result.noteSampleNames, undefined);
    assert.equal(result.noteSampleSources, undefined);
  });
});

describe("sanitizeDeepLinkEntry — 중첩 noteQueueEntries noteSamples 제거", () => {
  test("noteQueueEntries 내부 http:// noteSamples 제거", () => {
    const raw = {
      ...VALID_BASE,
      noteQueueEntries: [
        {
          ...VALID_BASE,
          id: "q1",
          noteSamples: {
            x: "https://evil.example.com/click.wav",
            y: "file:///sender/Documents/snare.wav",
          },
        },
      ],
    };
    const result = sanitizeDeepLinkEntry(raw);
    assert.ok(result);
    assert.ok(result.noteQueueEntries);
    assert.equal(result.noteQueueEntries!.length, 1);
    assert.deepEqual(result.noteQueueEntries![0].noteSamples, {});
  });

  test("2단계 중첩 noteQueueEntries 의 noteSamples 도 제거", () => {
    const inner = {
      ...VALID_BASE,
      id: "inner",
      noteSamples: { z: "https://attacker.com/deep.wav" },
    };
    const outer = {
      ...VALID_BASE,
      id: "outer",
      noteQueueEntries: [{ ...VALID_BASE, id: "mid", noteQueueEntries: [inner] }],
    };
    const result = sanitizeDeepLinkEntry(outer);
    assert.ok(result);
    const mid = result.noteQueueEntries![0];
    const deepInner = mid.noteQueueEntries![0];
    assert.deepEqual(deepInner.noteSamples, {});
  });

  test("noteQueueEntries 내 bpm 누락 항목은 필터링됨", () => {
    const raw = {
      ...VALID_BASE,
      noteQueueEntries: [
        { id: "bad", label: "no bpm" },
        { ...VALID_BASE, id: "good" },
      ],
    };
    const result = sanitizeDeepLinkEntry(raw);
    assert.ok(result);
    assert.equal(result.noteQueueEntries!.length, 1);
    assert.equal(result.noteQueueEntries![0].id, "good");
  });
});

describe("sanitizeDeepLinkEntry — 숫자 클램프", () => {
  test("bpm 301 → 300", () => {
    const result = sanitizeDeepLinkEntry({ ...VALID_BASE, bpm: 301 });
    assert.ok(result);
    assert.equal(result.bpm, 300);
  });

  test("bpm 1 → 20", () => {
    const result = sanitizeDeepLinkEntry({ ...VALID_BASE, bpm: 1 });
    assert.ok(result);
    assert.equal(result.bpm, 20);
  });

  test("beatsPerMeasure 0 → 1", () => {
    const result = sanitizeDeepLinkEntry({ ...VALID_BASE, beatsPerMeasure: 0 });
    assert.ok(result);
    assert.equal(result.beatsPerMeasure, 1);
  });

  test("beatsPerMeasure 99 → 16", () => {
    const result = sanitizeDeepLinkEntry({ ...VALID_BASE, beatsPerMeasure: 99 });
    assert.ok(result);
    assert.equal(result.beatsPerMeasure, 16);
  });
});

describe("sanitizeDeepLinkEntry — enum 필드 검증", () => {
  test("mode: 유효 값 허용", () => {
    for (const mode of ["beat", "bar", "note"] as const) {
      const result = sanitizeDeepLinkEntry({ ...VALID_BASE, mode });
      assert.ok(result);
      assert.equal(result.mode, mode);
    }
  });

  test("mode: 잘못된 값 → undefined", () => {
    const result = sanitizeDeepLinkEntry({ ...VALID_BASE, mode: "hack" });
    assert.ok(result);
    assert.equal(result.mode, undefined);
  });

  test("barLoopMode: 'once' 보존", () => {
    const result = sanitizeDeepLinkEntry({ ...VALID_BASE, barLoopMode: "once" });
    assert.ok(result);
    assert.equal(result.barLoopMode, "once");
  });

  test("barLoopMode: 잘못된 값 → 'loop' 기본값", () => {
    const result = sanitizeDeepLinkEntry({ ...VALID_BASE, barLoopMode: "unknown" });
    assert.ok(result);
    assert.equal(result.barLoopMode, "loop");
  });

  test("notePlayMode: 유효 값 허용", () => {
    for (const m of ["once", "loop", "random"] as const) {
      const result = sanitizeDeepLinkEntry({ ...VALID_BASE, notePlayMode: m });
      assert.ok(result);
      assert.equal(result.notePlayMode, m);
    }
  });

  test("notePlayMode: 잘못된 값 → undefined", () => {
    const result = sanitizeDeepLinkEntry({ ...VALID_BASE, notePlayMode: "shuffle" });
    assert.ok(result);
    assert.equal(result.notePlayMode, undefined);
  });
});

describe("sanitizeDeepLinkEntry — 레이블 길이 제한", () => {
  test("label 200자 초과 → 200자 절단", () => {
    const longLabel = "a".repeat(300);
    const result = sanitizeDeepLinkEntry({ ...VALID_BASE, label: longLabel });
    assert.ok(result);
    assert.equal(result.label.length, 200);
  });

  test("label 비문자열 → 빈 문자열", () => {
    const result = sanitizeDeepLinkEntry({ ...VALID_BASE, label: 12345 });
    assert.ok(result);
    assert.equal(result.label, "");
  });
});

describe("sanitizeDeepLinkEntry — noteSampleChannels (URI 없는 메타데이터) 허용", () => {
  test("유효한 채널 값 보존", () => {
    const raw = {
      ...VALID_BASE,
      noteSampleChannels: { "0-0": "left", "1-0": "right", "2-0": "both" },
    };
    const result = sanitizeDeepLinkEntry(raw);
    assert.ok(result);
    assert.deepEqual(result.noteSampleChannels, { "0-0": "left", "1-0": "right", "2-0": "both" });
  });

  test("잘못된 채널 값 → 'both' 기본값", () => {
    const raw = {
      ...VALID_BASE,
      noteSampleChannels: { "0-0": "stereo", "1-0": 42 },
    };
    const result = sanitizeDeepLinkEntry(raw);
    assert.ok(result);
    assert.deepEqual(result.noteSampleChannels, { "0-0": "both", "1-0": "both" });
  });
});

describe("sanitizeDeepLinkEntry — 정상 페이로드 통과", () => {
  test("최소 유효 페이로드 → 정상 반환", () => {
    const result = sanitizeDeepLinkEntry(VALID_BASE);
    assert.ok(result);
    assert.equal(result.bpm, 120);
    assert.equal(result.beatsPerMeasure, 4);
    assert.deepEqual(result.noteSamples, {});
  });

  test("알 수 없는 필드는 결과에 포함되지 않음", () => {
    const raw = { ...VALID_BASE, __proto__: { x: 1 }, constructor: "hack", eval: "bad" };
    const result = sanitizeDeepLinkEntry(raw);
    assert.ok(result);
    assert.equal((result as any).__proto__?.x, undefined);
    assert.equal((result as any).eval, undefined);
  });
});
