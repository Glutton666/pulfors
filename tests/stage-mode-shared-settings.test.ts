/**
 * Stage settings should use one shared modal for common and stage-only controls.
 */
import fs from "node:fs";
import assert from "node:assert";

const overlaySource = fs.readFileSync("components/StageModeOverlay.tsx", "utf8");
const uiSource = fs.readFileSync("components/MetronomeScreenUI.tsx", "utf8");
const modalSource = fs.readFileSync("components/SettingsModal.tsx", "utf8");
const themeSource = fs.readFileSync("components/settings/SettingsThemeTab.tsx", "utf8");
const stageSectionSource = fs.readFileSync("components/settings/SettingsStageSection.tsx", "utf8");
const storageSource = fs.readFileSync("lib/storage.ts", "utf8");

describe("Stage shared settings flow", () => {
  test("stage top-bar settings opens the shared scoped modal", () => {
    assert.ok(
      overlaySource.includes("onOpenModeSettings?.();"),
      "stage settings button must open the shared settings callback",
    );
    assert.ok(
      uiSource.includes('onOpenModeSettings={() => openScopedSettings("stage")}'),
      "StageModeOverlay must be wired to the stage-scoped settings modal",
    );
  });

  test("stage-only settings render directly inside the shared Theme tab", () => {
    assert.ok(
      modalSource.includes("onStageSettingsChange={onStageSettingsChange}"),
      "SettingsModal must pass the shared stage settings updater",
    );
    assert.ok(
      themeSource.includes('testID="stage-settings-inline"'),
      "stage scope must render stage-only settings inline",
    );
    assert.ok(
      stageSectionSource.includes('testID="stage-settings-section"'),
      "the integrated section must own all stage-only controls",
    );
    assert.ok(!uiSource.includes("stageOptionsRequest="), "the old panel reopen request must be removed");
  });

  test("legacy stage settings migrate into the shared stage profile without overriding new values", () => {
    assert.ok(storageSource.includes("...legacyStageOptions,\n            ...sanitizeStageSettings(profile.stageOptions)"));
    assert.ok(storageSource.includes("!isPlainObject(savedStageProfile.stageOptions)"));
    assert.ok(storageSource.includes("void saveSettings(merged, { notifyOnError: false })"));
  });

  test("shared Stage settings do not let the Stage back handler intercept modal dismissal", () => {
    assert.ok(
      overlaySource.includes("if (modeSettingsVisible) return false;"),
      "Stage back handler must defer to the shared settings modal",
    );
    assert.ok(
      uiSource.includes("modeSettingsVisible={showSettings && settingsScope === \"stage\"}"),
      "StageModeOverlay must know when its shared settings modal is visible",
    );
  });
});