import {
  SAMPLE_TAP_TEMPO_MAX_TAPS,
  registerSampleTempoTap,
} from "../lib/sample-tap-tempo";
import fs from "node:fs";
import path from "node:path";

describe("sample tap tempo", () => {
  test("waits for two taps and averages recent intervals", () => {
    const first = registerSampleTempoTap([], 1000);
    expect(first.bpm).toBeNull();

    const second = registerSampleTempoTap(first.tapTimes, 1500);
    const third = registerSampleTempoTap(second.tapTimes, 2020);
    expect(second.bpm).toBe(120);
    expect(third.bpm).toBe(118);
  });

  test("restarts after a long pause", () => {
    const result = registerSampleTempoTap([1000, 1500, 2000], 5001);
    expect(result).toEqual({ tapTimes: [5001], bpm: null, restarted: true });
  });

  test("clamps very fast and slow tapping to the preview range", () => {
    expect(registerSampleTempoTap([1000], 1050).bpm).toBe(300);
    expect(registerSampleTempoTap([1000], 3000).bpm).toBe(30);
  });

  test("uses only the most recent taps", () => {
    let taps: number[] = [];
    for (let index = 0; index < 12; index += 1) {
      taps = registerSampleTempoTap(taps, 1000 + index * 500).tapTimes;
    }
    expect(taps).toHaveLength(SAMPLE_TAP_TEMPO_MAX_TAPS);
    expect(taps[0]).toBe(3000);
  });

  test("the modal resets tap history for sample changes and re-entry", () => {
    const modal = fs.readFileSync(path.resolve(process.cwd(), "components/NoteRecorderModal.tsx"), "utf8");
    expect(modal).toMatch(/if \(!visible\)[\s\S]*resetTempoTaps\(\)/);
    expect(modal).toMatch(/else \{[\s\S]*setLocalBpm\(bpm\);[\s\S]*resetTempoTaps\(\)/);
    expect(modal).toMatch(/\[recordedUri, resetTempoTaps\]/);
  });
});