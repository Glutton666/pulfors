import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { translations } from "../lib/i18n.data";

const readSource = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

test("signal generator close and clear-target icon controls expose localized actions", () => {
  const source = readSource("components/SignalGeneratorModal.tsx");

  const count = (value: string) => source.split(value).length - 1;
  assert.equal(count('accessibilityLabel={t("signalGenerator", "close")}'), 3, "portrait, landscape, and tuning guide close controls must be labeled");
  assert.equal(count('accessibilityHint={t("signalGenerator", "closeHint")}'), 3);
  assert.match(
    source,
    /onPress=\{clearPitchTarget\}[\s\S]*?accessibilityRole="button"[\s\S]*?accessibilityLabel=\{t\("signalGenerator", "clearTarget"\)\}[\s\S]*?accessibilityHint=\{t\("signalGenerator", "clearTargetHint"\)\}/,
  );
});

test("drum kit close control exposes a localized button action", () => {
  const source = readSource("components/DrumKitModal.tsx");

  assert.match(
    source,
    /testID="drum-kit-close"[\s\S]*?accessibilityRole="button"[\s\S]*?accessibilityLabel=\{t\("drumKit", "close"\)\}[\s\S]*?accessibilityHint=\{t\("drumKit", "closeHint"\)\}/,
  );
});

test("menu header updates its accessible action when switching between menu and lab", () => {
  const source = readSource("components/MenuScreen.tsx");

  assert.match(source, /accessibilityRole="button"/);
  assert.match(source, /accessibilityLabel=\{showLab \? t\("main", "menuBack"\) : t\("switcher", "openDial"\)\}/);
  assert.match(source, /accessibilityHint=\{showLab \? t\("main", "menuBackHint"\) : t\("switcher", "openDialHint"\)\}/);
});

test("icon-control accessibility labels and hints have Korean and English translations", () => {
  for (const [section, keys] of [
    ["signalGenerator", ["close", "closeHint", "clearTarget", "clearTargetHint"]],
    ["drumKit", ["close", "closeHint"]],
    ["switcher", ["openDial", "closeDial", "openDialHint", "closeDialHint"]],
    ["main", ["menuBack", "menuBackHint"]],
  ] as const) {
    const sectionTranslations = translations[section] as Record<string, { ko: string; en: string }>;
    for (const key of keys) {
      assert.ok(sectionTranslations[key].ko.length > 0, `missing Korean translation: ${section}.${key}`);
      assert.ok(sectionTranslations[key].en.length > 0, `missing English translation: ${section}.${key}`);
    }
  }
});