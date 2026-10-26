import { startRhythmPulseClock } from "../lib/rhythm-lab/pulse-clock";

describe("recording metronome deadlines", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("keeps absolute phase despite callback work and cancels on stop", () => {
    let now = 1000;
    const clicks: number[] = [];
    const stop = startRhythmPulseClock(500, () => { clicks.push(now); now += 60; }, () => now);
    for (const expected of [1500, 2000, 2500]) {
      now = expected;
      jest.advanceTimersByTime(clicks.length ? 440 : 500);
    }
    expect(clicks).toEqual([1500, 2000, 2500]);
    stop();
    now = 3000;
    jest.advanceTimersByTime(500);
    expect(clicks).toHaveLength(3);
  });

  test("a late callback skips missed beats instead of bursting or shifting the phase", () => {
    let now = 0;
    const clicks: number[] = [];
    const stop = startRhythmPulseClock(500, () => { clicks.push(now); }, () => now);
    now = 1250;
    jest.advanceTimersByTime(500);
    expect(clicks).toEqual([1250]);
    now = 1500;
    jest.advanceTimersByTime(250);
    expect(clicks).toEqual([1250, 1500]);
    stop();
  });
});
