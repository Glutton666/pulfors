import { test } from "node:test";
import assert from "node:assert/strict";

import { createT, translations, type TranslationLeaf } from "../lib/i18n";

test("모든 i18n leaf는 ko/en 두 언어가 모두 비어있지 않다", () => {
  const failures: string[] = [];
  for (const section of Object.keys(translations) as (keyof typeof translations)[]) {
    const ns = translations[section] as Record<string, TranslationLeaf>;
    for (const key of Object.keys(ns)) {
      const leaf = ns[key];
      if (!leaf || typeof leaf !== "object") {
        failures.push(`${String(section)}.${key} (not an object)`);
        continue;
      }
      if (typeof leaf.ko !== "string" || leaf.ko.length === 0) failures.push(`${String(section)}.${key} (ko empty)`);
      if (typeof leaf.en !== "string" || leaf.en.length === 0) failures.push(`${String(section)}.${key} (en empty)`);
    }
  }
  assert.equal(failures.length, 0, `누락된 번역:\n${failures.join("\n")}`);
});

test("모든 정의 키는 createT로 양 언어 모두 조회된다", () => {
  const tKo = createT("ko");
  const tEn = createT("en");
  for (const section of Object.keys(translations) as (keyof typeof translations)[]) {
    const ns = translations[section] as Record<string, TranslationLeaf>;
    for (const key of Object.keys(ns)) {
      const ko = (tKo as unknown as (s: string, k: string) => string)(String(section), key);
      const en = (tEn as unknown as (s: string, k: string) => string)(String(section), key);
      assert.ok(ko.length > 0, `ko empty for ${String(section)}.${key}`);
      assert.ok(en.length > 0, `en empty for ${String(section)}.${key}`);
    }
  }
});

test("정의되지 않은 키는 키 문자열로 fallback (회귀 가드)", () => {
  const t = createT("ko");
  const out = (t as unknown as (s: string, k: string) => string)("settings", "__definitely_missing__");
  assert.equal(out, "__definitely_missing__");
});
