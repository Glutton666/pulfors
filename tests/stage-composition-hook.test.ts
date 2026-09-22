import fs from "node:fs";

describe("stage composition extraction", () => {
  const screen = fs.readFileSync("hooks/useMetronomeScreen.ts", "utf8");
  const hook = fs.readFileSync("hooks/useStageComposition.ts", "utf8");

  test("owns the Stage practice snapshot and lifecycle", () => {
    expect(screen).toContain('from "@/hooks/useStageComposition"');
    expect(hook).toContain("subscribePracticeBook");
    expect(hook).toContain("pruneStageKeyMappings");
    expect(hook).toContain("exitStageWithMenuReturn");
    expect(screen).not.toContain("const stagePracticeEventVersionRef");
  });

  test("does not duplicate Stage practice loading in the screen hook", () => {
    expect(screen).not.toContain("loadPracticeBook()\n      .then((entries)");
    expect(hook.split("loadPracticeBook()").length - 1).toBe(1);
  });
});