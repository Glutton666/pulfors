import { test } from "node:test";
import assert from "node:assert/strict";

import { createT, getTempoLabel, formatDurationLocalized, SUPPORTED_LANGUAGES } from "../lib/i18n";

test("createT('ko') returns Korean strings for known keys", () => {
  const t = createT("ko");
  assert.equal(t("settings", "title"), "설정");
  assert.equal(t("settings", "themeTab"), "테마");
});

test("createT('en') returns English strings for known keys", () => {
  const t = createT("en");
  assert.equal(t("settings", "title"), "Settings");
  assert.equal(t("settings", "themeTab"), "Theme");
});

test("대표 키들이 SUPPORTED_LANGUAGES의 모든 언어에서 비어있지 않은 문자열을 반환한다", () => {
  const samples: [string, string][] = [
    ["settings", "title"],
    ["settings", "themeTab"],
    ["settings", "soundTab"],
    ["settings", "profileTab"],
    ["settings", "landscapePhoto"],
    ["settings", "landscapeStats"],
    ["settings", "statsTodayPractice"],
  ];
  for (const lang of SUPPORTED_LANGUAGES) {
    const t = createT(lang);
    for (const [ns, key] of samples) {
      const v = (t as unknown as (s: string, k: string) => string)(ns, key);
      assert.ok(typeof v === "string" && v.length > 0, `${lang} missing for ${ns}.${key}`);
    }
  }
});

test("getTempoLabel returns reasonable label for typical BPMs", () => {
  const label = getTempoLabel(120, "ko");
  assert.equal(typeof label, "string");
  assert.ok(label.length > 0);
});

test("formatDurationLocalized는 모든 지원 언어에서 0/큰 값을 안전하게 처리한다", () => {
  for (const lang of SUPPORTED_LANGUAGES) {
    assert.equal(typeof formatDurationLocalized(0, lang), "string");
    assert.equal(typeof formatDurationLocalized(3700, lang), "string");
  }
});
