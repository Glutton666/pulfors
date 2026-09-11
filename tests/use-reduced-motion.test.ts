import { motionDuration } from "@/hooks/useReducedMotion";

describe("motionDuration", () => {
  it("removes optional motion when reduce motion is enabled", () => {
    expect(motionDuration(200, true)).toBe(0);
  });

  it("preserves normal durations and clamps invalid values", () => {
    expect(motionDuration(200, false)).toBe(200);
    expect(motionDuration(-1, false)).toBe(0);
  });
});