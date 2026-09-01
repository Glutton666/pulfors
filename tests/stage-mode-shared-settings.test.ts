/**
 * Stage settings should use the shared settings modal for common controls,
 * while retaining a discoverable path for stage-only options.
 */
import fs from "node:fs";
import assert from "node:assert";

const overlaySource = fs.readFileSync("components/StageModeOverlay.tsx", "utf8");
const uiSource = fs.readFileSync("components/MetronomeScreenUI.tsx", "utf8");
const modalSource = fs.readFileSync("components/SettingsModal.tsx", "utf8");
const themeSource = fs.readFileSync("components/settings/SettingsThemeTab.tsx", "utf8");

describe("Stage shared settings flow", () => {
  test("stage top-bar settings opens the shared scoped modal", () => {
    assert.ok(
      overlaySource.includes("if (onOpenModeSettings) {\n              onOpenModeSettings();"),
      "stage settings button must prefer the shared settings callback",
    );
    assert.ok(
      uiSource.includes('onOpenModeSettings={() => openScopedSettings("stage")}'),
      "StageModeOverlay must be wired to the stage-scoped settings modal",
    );
  });

  test("stage-only settings remain reachable from the shared Theme tab", () => {
    assert.ok(
      modalSource.includes("onOpenStageOptions={onOpenStageOptions}"),
      "SettingsModal must pass the stage-only options callback",
    );
    assert.ok(
      themeSource.includes('testID="open-stage-only-settings"'),
      "stage scope must expose a stage-only settings entry point",
    );
    assert.ok(
      uiSource.includes("stageOptionsRequest={stageOptionsRequest}"),
      "stage-only options must be able to reopen the Stage panel",
    );
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