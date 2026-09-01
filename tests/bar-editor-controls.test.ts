import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { MetronomeEngine } from "../lib/metronome-engine";
import {
  adjustBarDuration,
  clampBarBpm,
  clampBarRepeatCount,
  formatBarDuration,
  getBarSampleCells,
  getSampleCellCoverage,
  getBarRepeatCountHoldIntervalMs,
  splitBarDuration,
} from "../components/bar-mode/BarModeTypes";

describe("bar editor control values", () => {
  test("sample cells expose one flag per bar cell and stay false without samples", () => {
    assert.deepEqual(
      getBarSampleCells(2, 3, { "2-0": "file:///kick.wav", "2-2": "file:///snare.wav" }),
      [true, false, true],
    );
    assert.deepEqual(getBarSampleCells(1, 0, { "1-0": "" }), [false]);
    assert.deepEqual(getBarSampleCells(1, 2), [false, false]);
  });

  test("keeps an untrimmed sample on its single trigger cell", () => {
    const coverage = getSampleCellCoverage({
      bpm: 120,
      beatsPerMeasure: 1,
      beatSubdivisions: { "0": ["normal"] },
      barRepeats: {},
      noteSamples: { "0-0": "file:///kick.wav" },
    });

    expect(coverage.get("0-0")).toEqual({ source: "recording", kind: "direct" });
  });

  test("matches the engine's legacy subdivision timestamps when a trim reaches the next row", () => {
    const engine = new MetronomeEngine();
    engine.setBpm(120);
    engine.setBeatsPerMeasure(2);
    engine.setBeatSubdivision(0, ["normal", "normal", "normal", "normal"]);
    engine.setBeatSubdivision(1, ["normal", "normal", "normal", "normal"]);
    const schedule = engine.getScheduleInfo();
    expect(schedule.ticks.filter((tick) => tick.beat === 1 && tick.subBeat === 0)[0]?.time).toBe(500);

    const coverage = getSampleCellCoverage({
      bpm: 120,
      beatsPerMeasure: 2,
      beatSubdivisions: {
        "0": ["normal", "normal", "normal", "normal"],
        "1": ["normal", "normal", "normal", "normal"],
      },
      barRepeats: {},
      noteSamples: { "0-1": "file:///clap.wav#t=0,500" },
      beatDenominator: 4,
    });

    expect(coverage.get("0-0")).toBeUndefined();
    expect(coverage.get("0-1")).toEqual({ source: "recording", kind: "direct" });
    expect(coverage.get("0-2")).toEqual({ source: "recording", kind: "continued" });
    expect(coverage.get("0-3")).toEqual({ source: "recording", kind: "continued" });
    expect(coverage.get("1-0")).toEqual({ source: "recording", kind: "continued" });
    expect(coverage.get("1-1")).toBeUndefined();
  });

  test("uses the engine's denominator-normalized timing for legacy rows", () => {
    const engine = new MetronomeEngine();
    // 120 displayed BPM at an eighth-note denominator is 60 internal BPM.
    engine.setBpm(60);
    engine.setBeatsPerMeasure(2);
    engine.setBeatSubdivision(0, ["normal", "normal", "normal", "normal"]);
    engine.setBeatSubdivision(1, ["normal", "normal", "normal", "normal"]);
    const schedule = engine.getScheduleInfo();
    expect(schedule.ticks.filter((tick) => tick.beat === 1 && tick.subBeat === 0)[0]?.time).toBe(1000);

    const coverage = getSampleCellCoverage({
      bpm: 120,
      beatsPerMeasure: 2,
      beatSubdivisions: {
        "0": ["normal", "normal", "normal", "normal"],
        "1": ["normal", "normal", "normal", "normal"],
      },
      barRepeats: {},
      noteSamples: { "0-1": "file:///eighth-note.wav#t=0,1000" },
      beatDenominator: 8,
    });

    expect(coverage.get("0-1")).toEqual({ source: "recording", kind: "direct" });
    expect(coverage.get("0-2")).toEqual({ source: "recording", kind: "continued" });
    expect(coverage.get("0-3")).toEqual({ source: "recording", kind: "continued" });
    expect(coverage.get("1-0")).toEqual({ source: "recording", kind: "continued" });
    expect(coverage.get("1-1")).toBeUndefined();
  });

  test("uses the engine's doubled half-time duration before extending into the next row", () => {
    const engine = new MetronomeEngine();
    engine.setBpm(120);
    engine.setHalfTime(true);
    engine.setBeatsPerMeasure(2);
    engine.setBeatSubdivision(0, ["normal", "normal", "normal", "normal"]);
    engine.setBeatSubdivision(1, ["normal", "normal", "normal", "normal"]);
    const schedule = engine.getScheduleInfo();
    expect(schedule.ticks.filter((tick) => tick.beat === 1 && tick.subBeat === 0)[0]?.time).toBe(1000);

    const coverage = getSampleCellCoverage({
      bpm: 120,
      halfTime: true,
      beatsPerMeasure: 2,
      beatSubdivisions: {
        "0": ["normal", "normal", "normal", "normal"],
        "1": ["normal", "normal", "normal", "normal"],
      },
      barRepeats: {},
      noteSamples: { "0-1": "file:///half-time.wav#t=0,1000" },
      beatDenominator: 4,
    });

    expect(coverage.get("0-1")).toEqual({ source: "recording", kind: "direct" });
    expect(coverage.get("0-2")).toEqual({ source: "recording", kind: "continued" });
    expect(coverage.get("0-3")).toEqual({ source: "recording", kind: "continued" });
    expect(coverage.get("1-0")).toEqual({ source: "recording", kind: "continued" });
    expect(coverage.get("1-1")).toBeUndefined();
  });

  test("accounts for bar repeats, local BPM, and duration-repeat time", () => {
    const coverage = getSampleCellCoverage({
      bpm: 120,
      beatsPerMeasure: 3,
      beatSubdivisions: {
        "0": ["normal", "normal", "normal", "normal"],
        "1": ["normal", "normal", "normal", "normal"],
        "2": ["normal", "normal", "normal", "normal"],
      },
      barRepeats: {
        0: { type: "count", value: 2, meterNumerator: 4, meterDenominator: 4 },
        1: { type: "duration", value: 3, bpm: 60, meterNumerator: 4, meterDenominator: 4 },
      },
      noteSamples: { "0-0": "file:///loop.wav#t=0,7500" },
      beatDenominator: 4,
    });

    // Bar 0 is one 120 BPM pulse repeated twice.
    for (let cell = 0; cell < 4; cell++) {
      expect(coverage.get(`0-${cell}`)).toBeDefined();
    }
    // The 60 BPM duration bar occupies three seconds. The recording continues
    // into the following one-pulse row under the Bar-mode tuplet timing model.
    for (let cell = 0; cell < 4; cell++) {
      expect(coverage.get(`1-${cell}`)).toBeDefined();
    }
    expect(coverage.get("2-0")).toEqual({ source: "recording", kind: "continued" });
  });

  test("prefers recording coverage over an overlapping imported start and ignores corrupt samples", () => {
    const coverage = getSampleCellCoverage({
      bpm: 120,
      beatsPerMeasure: 2,
      beatSubdivisions: {
        "0": ["normal", "normal", "normal", "normal"],
        "1": ["normal", "normal", "normal", "normal"],
      },
      barRepeats: {},
      noteSamples: {
        "0-0": "file:///recording.wav#t=0,600",
        "1-0": "file:///import.wav",
        "1-1": "file:///bad-trim.wav#t=400,100",
        "1-2": "not a uri#t=0,500",
      },
      noteSampleSources: {
        "0-0": "recording",
        "1-0": "import",
        "1-1": "import",
        "1-2": "recording",
      },
      beatDenominator: 4,
    });

    expect(coverage.get("1-0")).toEqual({ source: "recording", kind: "continued" });
    expect(coverage.get("1-1")).toBeUndefined();
    expect(coverage.get("1-2")).toBeUndefined();
  });

  test("duration always displays as zero-padded mm:ss", () => {
    assert.equal(formatBarDuration(30), "00:30");
    assert.equal(formatBarDuration(65), "01:05");
    assert.equal(formatBarDuration(3599), "59:59");
  });

  test("active minutes control changes only the minute unit", () => {
    assert.equal(adjustBarDuration(2 * 60 + 30, "minutes", 1), 3 * 60 + 30);
    assert.equal(adjustBarDuration(2 * 60 + 30, "minutes", -1), 1 * 60 + 30);
    assert.equal(adjustBarDuration(30, "minutes", -1), 30);
  });

  test("active seconds control changes only the second unit", () => {
    assert.equal(adjustBarDuration(2 * 60 + 30, "seconds", 1), 2 * 60 + 31);
    assert.equal(adjustBarDuration(2 * 60 + 30, "seconds", -1), 2 * 60 + 29);
    assert.equal(adjustBarDuration(2 * 60 + 59, "seconds", 1), 2 * 60 + 59);
  });

  test("duration changes stay within 00:01 to 59:59", () => {
    assert.equal(formatBarDuration(adjustBarDuration(1, "seconds", -1)), "00:01");
    assert.equal(formatBarDuration(adjustBarDuration(3599, "minutes", 1)), "59:59");
    assert.deepEqual(splitBarDuration(0), { minutes: 0, seconds: 1 });
  });

  test("repeat count and BPM enforce their supported ranges", () => {
    assert.equal(clampBarRepeatCount(0), 1);
    assert.equal(clampBarRepeatCount(100), 99);
    assert.equal(clampBarBpm(19), 20);
    assert.equal(clampBarBpm(301), 300);
  });

  test("repeat-count hold interval accelerates and respects its floor", () => {
    const initial = getBarRepeatCountHoldIntervalMs(0);
    const afterOneSecond = getBarRepeatCountHoldIntervalMs(1000);
    const afterThreeSeconds = getBarRepeatCountHoldIntervalMs(3000);
    const atFloor = getBarRepeatCountHoldIntervalMs(60_000);

    assert.equal(initial, 300);
    assert.ok(afterOneSecond < initial);
    assert.ok(afterThreeSeconds < afterOneSecond);
    assert.equal(atFloor, 60);
  });
});