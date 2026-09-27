import { readFileSync, statSync } from "node:fs";

const SCREEN_HOOK_PATH = "hooks/useMetronomeScreen.ts";
// Ratchet after wiring native sparse ownership, random-pass preview, and
// stopped-only editing guards; further growth should still be reviewed.
const MAX_SCREEN_HOOK_BYTES = 168_667;
const MAX_SCREEN_HOOK_LINES = 4_254;

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