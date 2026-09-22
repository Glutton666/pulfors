import { readFileSync } from "node:fs";

describe("useScreenNavigation extraction", () => {
  const screen = readFileSync("hooks/useMetronomeScreen.ts", "utf8");
  const navigation = readFileSync("hooks/useScreenNavigation.ts", "utf8");

  it("owns modal return leases and Android back routing", () => {
    expect(screen).toContain('from "@/hooks/useScreenNavigation"');
    expect(navigation).toContain("menuItemReturnGenerationRef");
    expect(navigation).toContain('hardwareBackPress');
    expect(navigation).toContain("closeScoreMode");
    expect(navigation).toContain("openExclusive");
    expect(navigation).toContain("showTuningGuide");
    expect(screen).not.toContain('BackHandler.addEventListener("hardwareBackPress"');
  });

  it("keeps tutorial lifecycle in the navigation domain without duplicate parent handlers", () => {
    expect(navigation).toContain("completeTutorialStep");
    expect(navigation).toContain("finishModeTutorial");
    expect(navigation).toContain("resetModeTutorials");
    expect(screen).not.toContain("const completeTutorialStep = useCallback");
    expect(screen).not.toContain("const finishModeTutorial = useCallback");
  });

  it("ratchets the parent source budget after the extraction", () => {
    const lineCount = screen.split(/\r?\n/).length;
    expect(lineCount).toBeLessThanOrEqual(4300);
  });
});