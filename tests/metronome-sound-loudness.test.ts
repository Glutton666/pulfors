import { readFileSync } from "node:fs";
import { join } from "node:path";

type Measurement = { peak: number; rmsDb: number };
type Report = {
  gainDbBySet: Record<string, number>;
  before: Record<string, Measurement>;
  after: Record<string, Measurement>;
};

const report = JSON.parse(
  readFileSync(join(process.cwd(), "assets/sounds/loudness-report.json"), "utf8"),
) as Report;

test("normalized metronome assets stay below the peak ceiling and get louder", () => {
  for (const [filename, after] of Object.entries(report.after)) {
    expect(after.peak).toBeLessThanOrEqual(0.951);
    const set = filename.split("-")[0];
    if (report.gainDbBySet[set] > 0) {
      expect(after.rmsDb).toBeGreaterThan(report.before[filename].rmsDb);
    }
  }
});

test("one gain policy per sound set preserves role balance within tolerance", () => {
  for (const set of Object.keys(report.gainDbBySet)) {
    const files = Object.keys(report.before).filter((filename) => filename.startsWith(`${set}-`));
    const changes = files.map((filename) => report.after[filename].rmsDb - report.before[filename].rmsDb);
    expect(Math.max(...changes) - Math.min(...changes)).toBeLessThanOrEqual(1);
  }
});