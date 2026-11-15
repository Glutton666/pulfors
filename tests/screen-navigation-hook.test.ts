import { readFileSync } from "node:fs";
import { importedMemberCallCount } from "./helpers/source-contract";

describe("useScreenNavigation extraction", () => {
  const screen = readFileSync("hooks/useMetronomeScreen.ts", "utf8");
  const navigation = readFileSync("hooks/useScreenNavigation.ts", "utf8");

  it("owns modal return leases and Android back routing", () => {
    // Deliberate architecture guard: navigation owns the single native
    // subscription. Closing behavior is tested through that actual listener.
    expect(importedMemberCallCount(navigation, "react-native", "BackHandler", "addEventListener")).toBe(1);
    expect(importedMemberCallCount(screen, "react-native", "BackHandler", "addEventListener")).toBe(0);
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