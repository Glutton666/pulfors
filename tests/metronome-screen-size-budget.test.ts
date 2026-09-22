import { readFileSync, statSync } from "node:fs";

const SCREEN_HOOK_PATH = "hooks/useMetronomeScreen.ts";
const MAX_SCREEN_HOOK_BYTES = 167_409;
const MAX_SCREEN_HOOK_LINES = 4_228;

describe("useMetronomeScreen size budget", () => {
  it("does not exceed the ratcheted byte budget", () => {
    expect(statSync(SCREEN_HOOK_PATH).size).toBeLessThanOrEqual(
      MAX_SCREEN_HOOK_BYTES,
    );
  });

  it("does not exceed the ratcheted line budget", () => {
    const source = readFileSync(SCREEN_HOOK_PATH, "utf8");
    const lineCount = source.endsWith("\n")
      ? source.slice(0, -1).split(/\r?\n/).length
      : source.split(/\r?\n/).length;
    expect(lineCount).toBeLessThanOrEqual(MAX_SCREEN_HOOK_LINES);
  });
});