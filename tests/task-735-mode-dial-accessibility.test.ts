import { test } from "node:test";
import assert from "node:assert/strict";
import { createT } from "../lib/i18n";

// Rendering, keyboard navigation, trigger focus and measured header clearance
// are exercised against the real app in e2e/mode-dial-accessibility.spec.ts.
// Translation data remains a legitimate direct data-contract test.
test("mode dial accessibility copy exists in both languages", () => {
  for (const language of ["ko", "en"] as const) {
    const t = createT(language);
    for (const key of ["closeDial", "dialLabel", "dialHint", "triggerHint", "nextMode", "previousMode", "selectMode"] as const) {
      assert.ok(t("switcher", key).length > 0, `${language} switcher.${key} missing`);
    }
  }
});
