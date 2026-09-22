import fs from "node:fs";

describe("useNoteSession extraction", () => {
  const screenSource = fs.readFileSync("hooks/useMetronomeScreen.ts", "utf8");
  const hookSource = fs.readFileSync("hooks/useNoteSession.ts", "utf8");

  it("owns note queue state and editing/source boundaries", () => {
    expect(screenSource).toContain('from "@/hooks/useNoteSession"');
    expect(hookSource).toContain("handleNoteAddToQueue");
    expect(hookSource).toContain("handleNoteRemoveFromQueue");
    expect(hookSource).toContain("handleNoteReorderQueue");
    expect(hookSource).toContain("handleNoteInsertNext");
    expect(hookSource).toContain("handleNoteLoadPracticeSources");
    expect(hookSource).toContain("noteEntryTransitionEpochRef");
    expect(screenSource).not.toContain("const handleNoteAddToQueue = useCallback");
    expect(screenSource).not.toContain("const handleNoteRemoveFromQueue = useCallback");
  });

  it("keeps the post-extraction source size budget fixed", () => {
    const lineCount = screenSource.split(/\r?\n/).length;
    expect(lineCount).toBeLessThanOrEqual(4450);
  });
});