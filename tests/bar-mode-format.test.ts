import { formatBarCenterInfo } from "@/components/bar-mode/BarModeTypes";

describe("bar mode row information", () => {
  it("uses the bar's own meter when calculating a count repeat duration", () => {
    expect(
      formatBarCenterInfo(
        { type: "count", value: 2, bpm: 69 },
        120,
        3,
        4,
      ),
    ).toBe("69 / ×2(00:05)");
  });

  it("uses the bar's own meter when converting a duration to repeats", () => {
    expect(
      formatBarCenterInfo(
        { type: "duration", value: 10, bpm: 120 },
        120,
        4,
        4,
      ),
    ).toBe("120 / ×5(00:10)");
  });

  it("continues to show a base BPM when a bar has no repeat configuration", () => {
    expect(formatBarCenterInfo(null, 90, 6, 8)).toBe("90");
  });
});