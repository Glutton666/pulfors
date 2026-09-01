import fs from "node:fs";
import path from "node:path";

describe("bar mode BPM profile isolation", () => {
  const settingsSource = fs.readFileSync(
    path.join(process.cwd(), "hooks/useSettings.ts"),
    "utf8",
  );
  const barModeSource = fs.readFileSync(
    path.join(process.cwd(), "hooks/useBarMode.ts"),
    "utf8",
  );

  test("async mode-profile loading cannot overwrite the bar engine schedule", () => {
    expect(settingsSource).toContain('if (mode !== "bar")');
    expect(settingsSource).toContain("setBpm(settings.bpm);");
    expect(settingsSource.indexOf('if (mode !== "bar")')).toBeLessThan(
      settingsSource.indexOf("setBpm(settings.bpm);"),
    );
  });

  test("bar BPM changes are persisted into the bar settings profile", () => {
    expect(barModeSource).toContain("p.persistSettings({ bpm: clamped });");
  });
});