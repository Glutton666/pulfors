import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { translations } from "../lib/i18n.data";

const readSource = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

test("quick-start onboarding: language, sound check, and ready state are the only steps", () => {
  const source = readSource("components/OnboardingModal.tsx");

  assert.match(source, /const TOTAL_STEPS = 3;/);
  assert.match(
    source,
    /case 0:\s*return renderLanguageStep\(\);\s*case 1:\s*return renderSoundTestStep\(\);\s*case 2:\s*return renderReadyStep\(\);/s,
  );
  assert.match(source, /const handleSkip[\s\S]*?onComplete\(/);
  assert.match(source, /const handleNext[\s\S]*?step < TOTAL_STEPS - 1[\s\S]*?onComplete\(/);
});

test("quick-start onboarding: controls expose progress, navigation, and sound-check accessibility", () => {
  const source = readSource("components/OnboardingModal.tsx");

  for (const expected of [
    'accessibilityRole="progressbar"',
    'testID="onboarding-back"',
    'testID="onboarding-skip"',
    'testID="onboarding-next"',
    'testID="onboarding-sound-test-play"',
    'testID="onboarding-ready-summary"',
    'accessibilityRole="radio"',
  ]) {
    assert.ok(source.includes(expected), `missing accessible onboarding control: ${expected}`);
  }

  assert.match(source, /minHeight: 44/);
  assert.match(source, /height: 52/);
});

test("quick-start translations: each new label is available in Korean and English", () => {
  const onboarding = translations.onboarding;
  for (const key of [
    "back",
    "backHint",
    "skipHint",
    "nextHint",
    "startHint",
    "quickStartTitle",
    "quickStartSubtitle",
    "quickStartBody",
    "quickStartHint",
    "soundTestPlayHint",
    "soundTestFailed",
  ] as const) {
    assert.ok(onboarding[key].ko.length > 0, `missing Korean onboarding translation: ${key}`);
    assert.ok(onboarding[key].en.length > 0, `missing English onboarding translation: ${key}`);
  }
});

test("error fallback: localized retry, home, and data-safety actions stay available", () => {
  const source = readSource("components/ErrorFallback.tsx");

  for (const expected of [
    't("errorFallback", "title")',
    't("errorFallback", "retry")',
    't("errorFallback", "home")',
    't("errorFallback", "dataSafe")',
    'testID="error-fallback-retry"',
    'testID="error-fallback-home"',
    "const handleGoHome",
    "resetError();",
    'router.replace("/")',
  ]) {
    assert.ok(source.includes(expected), `missing error fallback recovery behavior: ${expected}`);
  }

  for (const key of ["title", "message", "dataSafe", "retry", "home", "details"] as const) {
    assert.ok(translations.errorFallback[key].ko.length > 0, `missing Korean error translation: ${key}`);
    assert.ok(translations.errorFallback[key].en.length > 0, `missing English error translation: ${key}`);
  }
});