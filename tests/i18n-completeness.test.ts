import { test } from "node:test";
import assert from "node:assert/strict";

import { createT, translations, SUPPORTED_LANGUAGES, type TranslationLeaf } from "../lib/i18n";

test("모든 i18n leaf는 SUPPORTED_LANGUAGES의 모든 언어가 비어있지 않다", () => {
  const failures: string[] = [];
  for (const section of Object.keys(translations) as (keyof typeof translations)[]) {
    const ns = translations[section] as Record<string, TranslationLeaf>;
    for (const key of Object.keys(ns)) {
      const leaf = ns[key];
      if (!leaf || typeof leaf !== "object") {
        failures.push(`${String(section)}.${key} (not an object)`);
        continue;
      }
      for (const lang of SUPPORTED_LANGUAGES) {
        const v = (leaf as Record<string, unknown>)[lang];
        if (typeof v !== "string" || v.length === 0) {
          failures.push(`${String(section)}.${key} (${lang} empty)`);
        }
      }
    }
  }
  assert.equal(failures.length, 0, `누락된 번역:\n${failures.join("\n")}`);
});

test("모든 정의 키는 createT로 모든 지원 언어에서 조회된다", () => {
  for (const lang of SUPPORTED_LANGUAGES) {
    const t = createT(lang);
    for (const section of Object.keys(translations) as (keyof typeof translations)[]) {
      const ns = translations[section] as Record<string, TranslationLeaf>;
      for (const key of Object.keys(ns)) {
        const v = (t as unknown as (s: string, k: string) => string)(String(section), key);
        assert.ok(v.length > 0, `${lang} empty for ${String(section)}.${key}`);
      }
    }
  }
});

test("정의되지 않은 키는 키 문자열로 fallback (회귀 가드)", () => {
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const t = createT("ko");
    const out = (t as unknown as (s: string, k: string) => string)("settings", "__definitely_missing__");
    assert.equal(out, "__definitely_missing__");
  } finally {
    console.warn = originalWarn;
  }
});
