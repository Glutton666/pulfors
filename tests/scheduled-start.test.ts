import {
  SCHEDULED_PREPARE_LEAD_MS,
  getScheduledPreparationDelay,
} from "@/lib/scheduled-start";

describe("scheduled start preparation timing", () => {
  it("starts preparation eight seconds before the target", () => {
    expect(getScheduledPreparationDelay(20_000)).toBe(12_000);
    expect(SCHEDULED_PREPARE_LEAD_MS).toBe(8000);
  });

  it("starts preparation immediately when the target is less than eight seconds away", () => {
    expect(getScheduledPreparationDelay(5000)).toBe(0);
  });
});