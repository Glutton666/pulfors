import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const readSource = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

test("scheduled start controls provide accessible labels and minimum touch targets", () => {
  const source = readSource("components/ScheduledStartModal.tsx");

  assert.match(source, /accessibilityRole="button"/);
  assert.match(source, /accessibilityLabel=\{`\$\{label\} increase`\}/);
  assert.match(source, /accessibilityLabel=\{`\$\{label\} decrease`\}/);
  assert.match(source, /accessibilityValue=\{\{ now: value, min, max \}\}/);
  assert.match(source, /minWidth: 44/);
  assert.match(source, /minHeight: 44/);
  assert.match(source, /testID="scheduled-start-close"[\s\S]*?accessibilityRole="button"/);
});

test("beat stepper preserves caller styling while enforcing accessible target size", () => {
  const source = readSource("components/BeatStepperButton.tsx");

  assert.match(source, /style=\{\[baseStyle, \{ minWidth: 44, minHeight: 44 \}/);
  assert.match(source, /accessibilityRole="button"/);
  assert.match(source, /accessibilityState=\{\{ disabled \}\}/);
});

test("BPM slider exposes keyboard and focus accessibility affordances", () => {
  const source = readSource("components/BpmSlider.tsx");

  for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"]) {
    assert.match(source, new RegExp(`["']${key}["']`));
  }
  assert.match(source, /key === "Enter" \|\| key === " " \|\| key === "Spacebar"/);
  assert.match(source, /accessibilityValue=\{\{ min: 20, max: 300, now: bpm, text:/);
  assert.match(source, /Platform\.OS === "web"[\s\S]*?tabIndex: 0[\s\S]*?onKeyDown: handleKeyDown/);
  assert.match(source, /\{\.\.\.webFocusProps\}/);
  assert.match(source, /focusedCard/);
});