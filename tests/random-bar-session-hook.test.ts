import fs from "node:fs";

describe("useRandomBarSession extraction", () => {
  const screenSource = fs.readFileSync("hooks/useMetronomeScreen.ts", "utf8");
  const hookSource = fs.readFileSync("hooks/useRandomBarSession.ts", "utf8");

  it("keeps the random session lifecycle in the focused hook", () => {
    expect(screenSource).toContain('from "@/hooks/useRandomBarSession"');
    expect(hookSource).toContain("randomBarSessionRef");
    expect(hookSource).toContain("randomBarPreparedChunkRef");
    expect(hookSource).toContain("finishRandomBarPlay");
    expect(hookSource).toContain("handleRandomBarPlay");
    expect(hookSource).toContain("handleReplayRandomBarSession");
    expect(hookSource).toContain("handleSaveRandomBarSession");
    expect(hookSource).toContain("advanceRandomBarChunk");
    expect(hookSource).not.toContain("handleApplyRandomBarSession: () => {}");
    expect(screenSource).not.toContain("const handleApplyRandomBarSession = useCallback");
    expect(screenSource).toContain("handleApplyRandomBarSession: applyRandomBarFromHook");
    expect(screenSource).toContain("handleRandomBarPlay: () => randomBarPlayFromHook");
    expect(hookSource).toContain("randomBarConfigRef");
    expect(hookSource).toContain("p.engineRef.current?.setRandomBarOrder(null)");
  });

  it("does not regress the screen hook size after extraction", () => {
    const lineCount = screenSource.split(/\r?\n/).length;
    // The budget is ratcheted to the actual post-extraction count.
    expect(lineCount).toBeLessThanOrEqual(4566);
  });
});