import { readRepoSource } from "./helpers/source-contract";

describe("Beat and Bar rhythm profile isolation", () => {
  // Transitional parent-wiring guards: these do NOT establish runtime behavior.
  // Actual profile transitions, canonical refs and mode setters are covered in
  // bar-profile-behavior.test.ts; keep remaining parent contracts until their
  // orchestration-level harness covers hydration, Stage, keyboard and drags.
  const screenSource = readRepoSource("hooks/useMetronomeScreen.ts");
  const navigationSource = readRepoSource("hooks/useScreenNavigation.ts");
  const uiSource = readRepoSource("components/MetronomeScreenUI.tsx");
  const keyboardSource = readRepoSource("hooks/useKeyboardShortcuts.ts");
  const barModeSource = readRepoSource("hooks/useBarMode.ts");
  const practiceLoadSource = readRepoSource("hooks/usePracticeBookLoad.ts");

  test("active Bar config is selected from barConfigRef rather than shared Beat state", () => {
    expect(screenSource).toContain(
      "beatTypes: barMode ? barConfigRef.current.beatTypes : beatTypes",
    );
    expect(screenSource).toContain(
      "beatSubdivisions: barMode ? barConfigRef.current.beatSubdivisions : beatSubdivisions",
    );
    expect(screenSource).toContain(
      "subdivisionPattern: barMode",
    );
    expect(screenSource).toContain(
      "? (barConfigRef.current.subdivisionPattern ?? [\"accent\"])",
    );
  });

  test("Stage mode renders the selected active-mode rhythm profile", () => {
    expect(uiSource).toContain("bpm={currentBarConfig.bpm}");
    expect(uiSource).toContain(
      "beatsPerMeasure={currentBarConfig.beatsPerMeasure}",
    );
    expect(uiSource).toContain("beatTypes={currentBarConfig.beatTypes}");
    expect(uiSource).toContain(
      "beatSubdivisions={currentBarConfig.beatSubdivisions}",
    );
    expect(uiSource).toContain(
      "subdivisionPattern={currentBarConfig.subdivisionPattern}",
    );
  });

  test("Stage controls keep Bar edits on the Bar-owned callbacks", () => {
    expect(uiSource).toContain(
      "onBpmChange={barMode ? guardedBarBpmChange : tutorialBpmChange}",
    );
    expect(uiSource).toContain("onBeatsPerMeasureChange={guardedTimeSignatureChange}");
    expect(uiSource).toContain("barMode={barMode}");
    expect(uiSource).not.toContain("barMode={false}");
    expect(screenSource).toContain("if (barModeRef.current)");
    expect(screenSource).toContain("handleBarBpmChange(detectedBpm);");
  });

  test("Android Back and Escape use the profile-aware Bar exit", () => {
    expect(navigationSource).toContain("handleBarModeChangeRef.current(false);");
    expect(keyboardSource).toContain("handleBarModeChangeRef.current(false);");
    expect(keyboardSource).not.toContain("setBarMode(false)");
  });

  test("Stage entry selection updates only the selected mode profile", () => {
    expect(uiSource).toContain("if (barMode !== entryIsBar)");
    expect(uiSource).toContain("handleBarModeChange(entryIsBar);");
    expect(uiSource).toContain("if (entryIsBar) {");
    expect(uiSource).toContain("subdivisionPattern: entrySubdivisionPattern");
    expect(uiSource).not.toContain("barModeRef.current = entryIsBar");
    expect(uiSource).not.toContain("setBarMode(entryIsBar)");
  });

  test("seamless Stage advance keeps BPM and rhythm data in the selected profile", () => {
    expect(screenSource).toContain(
      "const nextSubdivisionPattern: BeatType[] =",
    );
    expect(screenSource).toContain(
      "subdivisionPattern: nextSubdivisionPattern",
    );
    expect(screenSource).toContain(
      "barBpmRef.current = seamlessNext.bpm",
    );
    expect(screenSource).toContain("hasBeenConfigured: true,");
  });

  test("Bar drag edits never persist into the Beat settings profile", () => {
    expect(screenSource).toContain(
      "dialConfigRef.current.beatSubdivisions = newSubs;\n        persistSettings({ beatSubdivisions: newSubs });",
    );
    expect(screenSource).toContain(
      "barConfigRef.current.beatSubdivisions = newSubs;\n      } else {",
    );
    expect(screenSource).toContain(
      "barConfigRef.current.beatSubdivisions = { ...newSubs };\n        } else {",
    );
    expect(barModeSource).not.toContain("p.persistSettings({ bpm: clamped });");
  });

  test("selecting a Bar beat synchronizes its active pattern into the Bar snapshot", () => {
    expect(screenSource).toContain(
      "barConfigRef.current.subdivisionPattern = nextPattern;",
    );
    expect(screenSource).toContain("setSubdivisionPattern(nextPattern);");
  });

  test("keyboard BPM and tap tempo route through the active mode profile", () => {
    expect(keyboardSource).toContain(
      "const activeBpm = barModeRef.current ? barBpmRef.current : bpmRef.current;",
    );
    expect(keyboardSource).toContain(
      "handleBarBpmChangeRef.current(nextBpm);",
    );
    expect(keyboardSource).toContain("applyActiveBpm(tapBpm);");
  });

  test("practice-book mode changes use the profile-aware transition callback", () => {
    expect(screenSource).toContain("setBarMode: handleBarModeChange, setNoteMode");
    expect(practiceLoadSource).not.toContain(
      "beatsPerMeasure,\n          beatTypes: [...beatTypes],\n          beatSubdivisions: { ...beatSubdivisions }",
    );
  });

  test("sample hydration and recording keep canonical profiles complete", () => {
    expect(screenSource).toContain("Object.assign(dialConfigRef.current, {");
    expect(screenSource).toContain(
      "const targetConfig = barModeRef.current\n      ? barConfigRef.current\n      : dialConfigRef.current;",
    );
    expect(screenSource).toContain("Object.assign(targetConfig, {");
  });

  test("denominator changes derive engine tempo from the active profile BPM", () => {
    expect(screenSource).toContain(
      "const activeBpm = barModeRef.current\n        ? barBpmRef.current\n        : bpmRef.current;",
    );
    expect(screenSource).toContain(
      "engineRef.current?.setBpm(activeBpm * (4 / next));",
    );
  });
});