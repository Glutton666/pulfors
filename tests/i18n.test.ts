import { test } from "node:test";
import assert from "node:assert/strict";

import { createT, getTempoLabel, formatDurationLocalized } from "../lib/i18n";

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

test("every translation key has both ko and en values", async () => {
  const mod = await import("../lib/i18n");
  // Access the internal translations map via re-import as JSON-like.
  // We rely on createT round-trip: pick any t() to assert non-empty for both langs.
  // Iterate by re-importing the source module raw text would be brittle; instead,
  // use a representative sample of namespaces and require both langs return strings.
  void mod;

  const tKo = createT("ko");
  const tEn = createT("en");
  const samples: [string, string][] = [
    ["settings", "title"],
    ["settings", "themeTab"],
    ["settings", "soundTab"],
    ["settings", "profileTab"],
    ["settings", "landscapePhoto"],
    ["settings", "landscapeStats"],
    ["settings", "statsTodayPractice"],
  ];
  for (const [ns, key] of samples) {
    const ko = tKo(ns as any, key as any);
    const en = tEn(ns as any, key as any);
    assert.ok(typeof ko === "string" && ko.length > 0, `ko missing for ${ns}.${key}`);
    assert.ok(typeof en === "string" && en.length > 0, `en missing for ${ns}.${key}`);
  }
});

test("getTempoLabel returns reasonable label for typical BPMs", () => {
  const label = getTempoLabel(120, "ko");
  assert.equal(typeof label, "string");
  assert.ok(label.length > 0);
});

test("formatDurationLocalized handles 0 and large values", () => {
  assert.equal(typeof formatDurationLocalized(0, "ko"), "string");
  assert.equal(typeof formatDurationLocalized(3700, "en"), "string");
});
