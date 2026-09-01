import { formatBarCenterInfo } from "@/components/bar-mode/BarModeTypes";

describe("bar mode row information", () => {
  it("treats a row as one pulse when calculating a count repeat duration", () => {
    expect(
      formatBarCenterInfo(
        { type: "count", value: 2, bpm: 69 },
        120,
        3,
        4,
      ),
    ).toBe("69 / ×2(00:02)");
  });

  it("converts duration repeats using one pulse per row", () => {
    expect(
      formatBarCenterInfo(
        { type: "duration", value: 10, bpm: 120 },
        120,
        4,
        4,
      ),
    ).toBe("120 / ×20(00:10)");
  });

  it("continues to show a base BPM when a bar has no repeat configuration", () => {
    expect(formatBarCenterInfo(null, 90, 6, 8)).toBe("90");
  });

  it("shows each saved bar's own tempo rather than the compatibility fallback BPM", () => {
    expect(
      formatBarCenterInfo(
        { type: "count", value: 1, bpm: 69, meterNumerator: 3, meterDenominator: 4 },
        140,
        3,
        4,
      ),
    ).toBe("69");
    expect(
      formatBarCenterInfo(
        { type: "count", value: 1, bpm: 120, meterNumerator: 4, meterDenominator: 4 },
        140,
        4,
        4,
      ),
    ).toBe("120");
    expect(
      formatBarCenterInfo(
        { type: "duration", value: 12, bpm: 90, meterNumerator: 6, meterDenominator: 8 },
        140,
        6,
        8,
      ),
    ).toBe("90 / ×36(00:12)");
  });
});
