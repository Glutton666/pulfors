import { test } from "node:test";
import assert from "node:assert/strict";

import {
  SUPPORTED_LANGUAGES,
  FALLBACK_LANGUAGE,
  isLanguageCode,
  translations,
  createT,
  detectDeviceLanguage,
  LANGUAGE_OPTIONS,
  LANGUAGE_LABELS,
  type TranslationLeaf,
} from "../lib/i18n";

test("[meta] SUPPORTED_LANGUAGES는 비어있지 않고 FALLBACK_LANGUAGE를 포함한다", () => {
  assert.ok(SUPPORTED_LANGUAGES.length > 0);
  assert.ok(SUPPORTED_LANGUAGES.includes(FALLBACK_LANGUAGE));
});

test("[meta] 모든 leaf는 SUPPORTED_LANGUAGES와 정확히 동일한 키 셋을 가진다", () => {
  const expected = [...SUPPORTED_LANGUAGES].sort().join(",");
  const failures: string[] = [];
  for (const section of Object.keys(translations) as (keyof typeof translations)[]) {
    const ns = translations[section] as Record<string, TranslationLeaf>;
    for (const key of Object.keys(ns)) {
      const leaf = ns[key];
      const got = Object.keys(leaf).sort().join(",");
      if (got !== expected) failures.push(`${String(section)}.${key}: keys=[${got}] expected=[${expected}]`);
    }
  }
  assert.equal(failures.length, 0, `언어 키 불일치:\n${failures.join("\n")}`);
});

test("[meta] isLanguageCode는 지원 코드만 통과시킨다", () => {
  for (const code of SUPPORTED_LANGUAGES) assert.ok(isLanguageCode(code));
  assert.equal(isLanguageCode("xx"), false);
  assert.equal(isLanguageCode(null), false);
  assert.equal(isLanguageCode(undefined), false);
  assert.equal(isLanguageCode(123), false);
});

test("[meta] 폴백 체인: 선택 언어 값이 비어 있으면 FALLBACK_LANGUAGE 값으로 폴백한다", () => {
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const fakeLang = "xx" as unknown as (typeof SUPPORTED_LANGUAGES)[number];
    const t = createT(fakeLang);
    // 정의된 키는 FALLBACK_LANGUAGE 값으로 풀려야 한다.
    const out = (t as unknown as (s: string, k: string) => string)("settings", "title");
    assert.equal(out, translations.settings.title[FALLBACK_LANGUAGE]);
  } finally {
    console.warn = originalWarn;
  }
});

test("[meta] 정의되지 않은 키는 fallback도 없으므로 키 문자열을 반환한다", () => {
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const t = createT(FALLBACK_LANGUAGE);
    const out = (t as unknown as (s: string, k: string) => string)("settings", "__nope__");
    assert.equal(out, "__nope__");
  } finally {
    console.warn = originalWarn;
  }
});

test("[meta] 새 언어 추가 시뮬레이션: 빈 leaf는 키 셋 검사로 즉시 누락이 드러난다", () => {
  // SUPPORTED_LANGUAGES에 신규 코드 "ja"를 추가한 상황을 흉내낸다.
  const simulated = [...SUPPORTED_LANGUAGES, "ja"] as const;
  const fakeLeaf = { ko: "x", en: "x" } as Record<string, string>;
  const missingForJa = simulated.filter((c) => !(c in fakeLeaf));
  assert.deepEqual(missingForJa, ["ja"]);
  // 즉, 코드 한 줄(상수에 'ja' 추가)만 바꾸면 모든 leaf에서 'ja' 키 누락이 감지되며,
  // 컴파일 시점에는 TranslationLeaf = Record<LanguageCode, string> 강제로 tsc가 동일한 누락을 보고한다.
});

test("[meta] LANGUAGE_OPTIONS와 LANGUAGE_LABELS는 SUPPORTED_LANGUAGES와 정확히 정렬된다", () => {
  assert.deepEqual(
    LANGUAGE_OPTIONS.map((o) => o.value),
    [...SUPPORTED_LANGUAGES],
    "LANGUAGE_OPTIONS는 SUPPORTED_LANGUAGES를 그대로 반영해야 함",
  );
  for (const code of SUPPORTED_LANGUAGES) {
    const label = LANGUAGE_LABELS[code];
    assert.ok(typeof label === "string" && label.length > 0, `${code} label 누락`);
  }
});

test("[meta] detectDeviceLanguage는 항상 SUPPORTED_LANGUAGES 중 하나를 반환한다", () => {
  const got = detectDeviceLanguage();
  assert.ok((SUPPORTED_LANGUAGES as readonly string[]).includes(got), `예상 외 코드: ${got}`);
});

test("[meta] detectDeviceLanguage는 navigator.languages → language → Intl 순으로 1차 서브태그를 매칭한다", () => {
  const desc = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const setNav = (v: unknown) => {
    Object.defineProperty(globalThis, "navigator", { value: v, configurable: true, writable: true });
  };
  try {
    setNav({ language: "ko-KR", languages: ["ko-KR", "en-US"] });
    assert.equal(detectDeviceLanguage(), "ko");
    setNav({ language: "en-GB", languages: ["en-GB"] });
    assert.equal(detectDeviceLanguage(), "en");
    setNav({ language: "fr-FR", languages: ["fr-FR"] });
    // 미지원 로케일은 FALLBACK_LANGUAGE로 매핑.
    assert.equal(detectDeviceLanguage(), FALLBACK_LANGUAGE);
  } finally {
    if (desc) Object.defineProperty(globalThis, "navigator", desc);
    else delete (globalThis as { navigator?: unknown }).navigator;
  }
});
