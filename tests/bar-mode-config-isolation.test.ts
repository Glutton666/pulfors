import fs from "node:fs";
import path from "node:path";

describe("Beat and Bar rhythm profile isolation", () => {
  const screenSource = fs.readFileSync(
    path.join(process.cwd(), "hooks/useMetronomeScreen.ts"),
    "utf8",
  );
  const uiSource = fs.readFileSync(
    path.join(process.cwd(), "components/MetronomeScreenUI.tsx"),
    "utf8",
  );
  const keyboardSource = fs.readFileSync(
    path.join(process.cwd(), "hooks/useKeyboardShortcuts.ts"),
    "utf8",
  );
  const barModeSource = fs.readFileSync(
    path.join(process.cwd(), "hooks/useBarMode.ts"),
    "utf8",
  );
  const practiceLoadSource = fs.readFileSync(
    path.join(process.cwd(), "hooks/usePracticeBookLoad.ts"),
    "utf8",
  );

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
      "onBpmChange={barMode ? handleBarBpmChange : updateBpm}",
    );
    expect(uiSource).toContain("onBeatsPerMeasureChange={updateTimeSignature}");
    expect(uiSource).toContain("barMode={barMode}");
    expect(uiSource).not.toContain("barMode={false}");
    expect(screenSource).toContain("if (barModeRef.current)");
    expect(screenSource).toContain("handleBarBpmChange(detectedBpm);");
  });

  test("Android Back and Escape use the profile-aware Bar exit", () => {
    expect(screenSource).toContain("handleBarModeChangeRef.current(false);");
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

  test("Bar loop and block mode setters synchronously update the canonical snapshot", () => {
    expect(barModeSource).toContain(
      "barConfigRef.current.barLoopMode = next;",
    );
    expect(barModeSource).toContain(
      "barConfigRef.current.blockPlayMode = next;",
    );
    expect(barModeSource).toContain("blockPlayModeRef.current = next;");
    expect(barModeSource).toContain(
      "p.engineRef.current?.setBlockPlayMode(next);",
    );
  });

  test("practice-book mode changes use the profile-aware transition callback", () => {
    expect(screenSource).toContain("setBarMode: handleBarModeChange, setNoteMode");
    expect(practiceLoadSource).not.toContain(
      "beatsPerMeasure,\n          beatTypes: [...beatTypes],\n          beatSubdivisions: { ...beatSubdivisions }",
    );
  });

  test("mode switches preserve canonical refs instead of rebuilding from render state", () => {
    expect(barModeSource).toContain(
      "Do not rebuild it from React state here",
    );
    expect(barModeSource).toContain(
      "Bar editors update barConfigRef synchronously",
    );
    expect(barModeSource).not.toContain(
      "beatsPerMeasure: p.beatsPerMeasure,\n          beatTypes: [...p.beatTypes]",
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