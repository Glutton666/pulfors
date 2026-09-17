import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createT } from "../lib/i18n";

const readSource = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

test("mode dial exposes current/open state and screen-reader adjustment actions", () => {
  const dial = readSource("components/ModeSwitcherDial.tsx");
  assert.match(dial, /accessibilityRole="adjustable"/);
  assert.match(dial, /accessibilityState=\{\{ expanded: true \}\}/);
  assert.match(dial, /accessibilityValue=\{\{[\s\S]*?now: selectedIndex \+ 1,[\s\S]*?text:/);
  for (const action of ["increment", "decrement", "activate", "dismiss"]) {
    assert.match(dial, new RegExp(`name: ["']${action}["']`));
  }
});

test("mode dial supports arrows, confirmation, Escape, and trigger focus restoration", () => {
  const dial = readSource("components/ModeSwitcherDial.tsx");
  for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter", "Escape"]) {
    assert.match(dial, new RegExp(`event\\.key === ["']${key}["']`));
  }
  assert.match(dial, /event\.key === " " \|\| event\.key === "Spacebar"/);
  assert.match(dial, /requestAnimationFrame\(restoreTriggerFocus\)/);
  assert.match(dial, /target\?\.focus\?\.\(\)/);
});

test("visible mode trigger reports its expanded state and current mode", () => {
  const ui = readSource("components/MetronomeScreenUI.tsx");
  assert.match(ui, /testID="mode-cycle-label"/);
  assert.match(ui, /accessibilityState=\{\{ expanded: isModeDialOpen \}\}/);
  assert.match(ui, /accessibilityValue=\{\{ text: t\("switcher", currentMode/);
  assert.match(ui, /returnFocusRef=\{modeDialTriggerRef\}/);
});

test("idle portrait Note mode reserves a separate row below the mode trigger", () => {
  const ui = readSource("components/MetronomeScreenUI.tsx");
  assert.match(
    ui,
    /noteIsPlaying \? 4 : 48/,
    "Note controls must start below the tappable mode label while idle",
  );
});

test("mode dial accessibility copy exists in both languages", () => {
  for (const language of ["ko", "en"] as const) {
    const t = createT(language);
    for (const key of ["closeDial", "dialLabel", "dialHint", "triggerHint", "nextMode", "previousMode", "selectMode"] as const) {
      assert.ok(t("switcher", key).length > 0, `${language} switcher.${key} missing`);
    }
  }
});