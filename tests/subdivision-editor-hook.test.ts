import fs from "node:fs";

describe("useSubdivisionEditor extraction", () => {
  const screen = fs.readFileSync("hooks/useMetronomeScreen.ts", "utf8");
  const editor = fs.readFileSync("hooks/useSubdivisionEditor.ts", "utf8");

  it("owns only transient editor state while callbacks stay in one owner", () => {
    expect(screen).toContain('from "@/hooks/useSubdivisionEditor"');
    expect(editor).toContain("dragModeRef");
    expect(editor).toContain("dropTargetBeatRef");
    expect(editor).not.toContain("handleDragStart");
    expect(editor).not.toContain("handleBeatSubdivisionChange");
    expect(editor).not.toContain("applyToAllBeats");
    expect(editor).not.toContain("TODO");
  });

  it("keeps the orchestration hook within the phase-3 budget", () => {
    const lines = screen.split(/\r?\n/).length;
    expect(lines).toBeLessThanOrEqual(4434);
  });
});