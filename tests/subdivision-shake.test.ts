import {
  createShakeTracker,
  resetShakeTracker,
  trackSubdivisionShake,
} from "@/lib/subdivision-shake";

describe("subdivision shake detection", () => {
  it("counts reversals from consecutive movement, not the gesture start point", () => {
    const tracker = createShakeTracker();
    const positions = [0, -35, -10, -30, -5, -25, 0, -20, 5];

    const didReset = positions.some((position, index) =>
      trackSubdivisionShake(tracker, position, index * 100),
    );

    expect(didReset).toBe(true);
  });

  it("ignores tiny movement and reversals outside the shake window", () => {
    const tracker = createShakeTracker();
    const positions = [0, -20, -18, -20, -18, -20, -18];

    const didReset = positions.some((position, index) =>
      trackSubdivisionShake(tracker, position, index * 700),
    );

    expect(didReset).toBe(false);
  });

  it("can be reused for a new gesture after a reset", () => {
    const tracker = createShakeTracker();
    tracker.lastPosition = 120;
    tracker.lastDirection = "right";
    tracker.directionChanges = [100, 200];

    resetShakeTracker(tracker);

    expect(tracker).toEqual({
      lastPosition: null,
      lastDirection: null,
      directionChanges: [],
    });
  });
});