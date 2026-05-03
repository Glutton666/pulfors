export type TempoQuizDifficulty = "easy" | "normal" | "hard";

export interface TempoQuizRange {
  min: number;
  max: number;
}

export interface TempoQuizResult {
  guess: number;
  target: number;
  diff: number;
  grade: "perfect" | "good" | "fail";
}

export const TEMPO_QUIZ_RANGES: Record<TempoQuizDifficulty, TempoQuizRange> = {
  easy: { min: 60, max: 120 },
  normal: { min: 60, max: 180 },
  hard: { min: 40, max: 220 },
};

export const TEMPO_QUIZ_MEASURES = 4;
export const TEMPO_QUIZ_PERFECT = 3;
export const TEMPO_QUIZ_GOOD = 8;

export function pickRandomBpm(
  difficulty: TempoQuizDifficulty,
  rng: () => number = Math.random,
): number {
  const { min, max } = TEMPO_QUIZ_RANGES[difficulty];
  const r = rng();
  return Math.max(min, Math.min(max, Math.floor(min + r * (max - min + 1))));
}

export function gradeGuess(target: number, guess: number): TempoQuizResult {
  const diff = Math.abs(target - guess);
  let grade: TempoQuizResult["grade"] = "fail";
  if (diff <= TEMPO_QUIZ_PERFECT) grade = "perfect";
  else if (diff <= TEMPO_QUIZ_GOOD) grade = "good";
  return { guess, target, diff, grade };
}

export interface TempoQuizSession<T> {
  measures: number;
  elapsed: number;
  restore: T | null;
}

export function createQuizEntrySession<T>(snapshot: T): TempoQuizSession<T> {
  return { measures: 0, elapsed: 0, restore: snapshot };
}

export function advanceQuizSession<T>(
  prev: TempoQuizSession<T> | null,
  snapshot: T,
  measures: number,
): TempoQuizSession<T> {
  return {
    measures,
    elapsed: 0,
    restore: prev?.restore ?? snapshot,
  };
}

export function clampBpmGuess(value: number): number {
  if (!Number.isFinite(value)) return 60;
  return Math.max(20, Math.min(300, Math.round(value)));
}
