import type { Difficulty, PlaybackHit, PracticeResult } from "./types";

const median = (xs: number[]) => {
  const values = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(values.length / 2);
  return values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
};

/** Personal perceived offset, not a hardware-only latency measurement. */
export function calibrateOffset(tapsMs: number[], expectedMs: number[]): number {
  if (tapsMs.length !== expectedMs.length || tapsMs.length < 8 ||
      tapsMs.some((n) => !Number.isFinite(n)) || expectedMs.some((n) => !Number.isFinite(n))) {
    throw new Error("Calibration needs at least eight paired taps");
  }
  const errors = tapsMs.slice(3).map((tap, i) => tap - expectedMs[i + 3]);
  const center = median(errors);
  const deviation = median(errors.map((e) => Math.abs(e - center)));
  const retained = errors.filter((e) => Math.abs(e - center) <= Math.max(30, deviation * 3));
  return Math.max(-2000, Math.min(2000, Math.round(median(retained))));
}

export function timingTolerance(bpm: number, difficulty: Difficulty, neighboringGapMs = Infinity): number {
  if (!(bpm > 0) || !Number.isFinite(bpm)) throw new Error("Invalid practice tempo");
  const [ratio, cap] = difficulty === "easy" ? [0.15, 90] : difficulty === "strict" ? [0.05, 35] : [0.1, 60];
  return Math.min(60000 / bpm * ratio, cap, neighboringGapMs * 0.45);
}

/** Monotonic dynamic programming: maximizes one-to-one matches, then minimizes
 * timing error. A nearest-first greedy match can steal a later note's only tap. */
export function evaluatePractice(expected: PlaybackHit[], actual: PlaybackHit[], bpm: number, difficulty: Difficulty): PracticeResult {
  if (expected.length > 2000 || actual.length > 2000) throw new Error("Practice is limited to 2,000 hits per pass");
  const es = [...expected].sort((a, b) => a.timeMs - b.timeMs);
  const as = [...actual].sort((a, b) => a.timeMs - b.timeMs);
  if ([...es, ...as].some((h) => !Number.isFinite(h.timeMs))) throw new Error("Invalid hit time");
  const tolerances = es.map((e, i) => {
    // Simultaneous chord notes share an onset; use the nearest DISTINCT onset.
    let before = i - 1, after = i + 1;
    while (before >= 0 && es[before].timeMs === e.timeMs) before--;
    while (after < es.length && es[after].timeMs === e.timeMs) after++;
    const gap = Math.min(before >= 0 ? e.timeMs - es[before].timeMs : Infinity,
      after < es.length ? es[after].timeMs - e.timeMs : Infinity);
    return timingTolerance(bpm, difficulty, gap);
  });
  const cols = as.length + 1;
  const size = (es.length + 1) * cols;
  const costs = new Float64Array(size);
  const choices = new Uint8Array(size);
  const penalty = 10000;
  for (let i = 1; i <= es.length; i++) { costs[i * cols] = i * penalty; choices[i * cols] = 1; }
  for (let j = 1; j <= as.length; j++) { costs[j] = j * penalty; choices[j] = 2; }
  for (let i = 1; i <= es.length; i++) {
    for (let j = 1; j <= as.length; j++) {
      const idx = i * cols + j;
      const error = Math.abs(as[j - 1].timeMs - es[i - 1].timeMs);
      const matched = error <= tolerances[i - 1]
        ? costs[(i - 1) * cols + j - 1] + error / Math.max(1e-9, tolerances[i - 1]) : Infinity;
      const missed = costs[(i - 1) * cols + j] + penalty;
      const extra = costs[i * cols + j - 1] + penalty;
      if (matched <= missed && matched <= extra) { costs[idx] = matched; choices[idx] = 3; }
      else if (missed <= extra) { costs[idx] = missed; choices[idx] = 1; }
      else { costs[idx] = extra; choices[idx] = 2; }
    }
  }
  const judgments: PracticeResult["judgments"] = [];
  let i = es.length, j = as.length;
  let normalized = 0;
  while (i || j) {
    const choice = choices[i * cols + j];
    if (choice === 3) {
      const error = as[j - 1].timeMs - es[i - 1].timeMs;
      normalized += Math.abs(error) / Math.max(1e-9, tolerances[i - 1]);
      judgments.push({ kind: "hit", expectedId: es[i - 1].id, actualId: as[j - 1].id, errorMs: error }); i--; j--;
    } else if (choice === 1) { judgments.push({ kind: "miss", expectedId: es[i - 1].id }); i--; }
    else { judgments.push({ kind: "extra", actualId: as[j - 1].id }); j--; }
  }
  judgments.reverse();
  const hits = judgments.filter((v) => v.kind === "hit");
  const missed = es.length - hits.length, extra = as.length - hits.length;
  const coverageScore = es.length ? Math.max(0, 100 * (hits.length - extra) / es.length) : (as.length ? 0 : 100);
  const timingScore = hits.length ? Math.max(0, 100 * (1 - normalized / hits.length)) : (es.length ? 0 : 100);
  return {
    score: Math.round(coverageScore * 0.7 + timingScore * 0.3), timingScore: Math.round(timingScore),
    coverageScore: Math.round(coverageScore), missed, extra, matched: hits.length,
    meanErrorMs: hits.length ? hits.reduce((sum, h) => sum + h.errorMs!, 0) / hits.length : 0, judgments,
  };
}
