// ============================================================
// session-challenge.ts — 악보 이스터에그 랜덤 세션 챌린지
// 특정 악보 제목을 저장하면 랜덤 챌린지 악보가 생성된다.
// ============================================================

import type {
  ScoreDocument,
  ScoreMeasure,
  ScoreNote,
  ScoreRest,
  NoteDuration,
  Pitch,
} from "@/lib/score-types";

export type ChallengeLevel = 1 | 2 | 3;

// ─── Trigger Detection ──────────────────────────────────────
export function detectChallengeLevel(name: string): ChallengeLevel | null {
  const s = name.trim();
  if (s === "Pack to basic") return 1;
  if (s === "Train hard") return 2;
  if (s === "are you rushin or drugin?") return 3;
  return null;
}

// ─── Level Parameters ────────────────────────────────────────
interface TimeSig { numerator: number; denominator: number; }
interface LevelParams {
  timeSigs: TimeSig[];
  bpmRange: [number, number];
  density: number;
  measureCountRange: [number, number];
  useArticulations: boolean;
}

const LEVEL_PARAMS: Record<ChallengeLevel, LevelParams> = {
  1: {
    timeSigs: [
      { numerator: 4, denominator: 4 },
      { numerator: 3, denominator: 4 },
    ],
    bpmRange: [60, 120],
    density: 0.75,
    measureCountRange: [4, 8],
    useArticulations: false,
  },
  2: {
    timeSigs: [
      { numerator: 3, denominator: 4 },
      { numerator: 4, denominator: 4 },
      { numerator: 6, denominator: 4 },
      { numerator: 7, denominator: 8 },
    ],
    bpmRange: [50, 160],
    density: 0.60,
    measureCountRange: [4, 8],
    useArticulations: false,
  },
  3: {
    timeSigs: [
      { numerator: 4, denominator: 4 },
      { numerator: 3, denominator: 4 },
      { numerator: 6, denominator: 4 },
      { numerator: 5, denominator: 4 },
      { numerator: 7, denominator: 4 },
    ],
    bpmRange: [40, 180],
    density: 0.72,
    measureCountRange: [6, 12],
    useArticulations: true,
  },
};

// ─── Duration Tables ─────────────────────────────────────────
// 모든 값은 8분음표(eighth) 단위
const DURATION_EIGHTHS: Partial<Record<NoteDuration, number>> = {
  whole:       8,
  half:        4,
  quarter:     2,
  eighth:      1,
  quarter_dot: 3,
  half_dot:    6,
};

const LEVEL1_DURATIONS: NoteDuration[] = ["whole", "half", "quarter"];
const LEVEL23_DURATIONS: NoteDuration[] = ["half", "quarter", "eighth", "quarter_dot"];

// ─── Helpers ─────────────────────────────────────────────────
function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// 박자표 + 레벨에 따른 최소단위 슬롯 수
function getMeasureSlots(ts: TimeSig, level: ChallengeLevel): number {
  if (level === 1) return ts.numerator; // 4분음표 단위
  return ts.denominator === 4 ? ts.numerator * 2 : ts.numerator; // 8분음표 단위
}

// 음표 길이 → 슬롯 수 (정수가 아니면 null)
function durationSlots(d: NoteDuration, level: ChallengeLevel): number | null {
  const eighths = DURATION_EIGHTHS[d];
  if (eighths == null) return null;
  if (level === 1) {
    if (eighths % 2 !== 0) return null;
    return eighths / 2;
  }
  return eighths;
}

const SCALE_PITCHES: Pitch[] = [
  { step: "C", octave: 4 }, { step: "D", octave: 4 }, { step: "E", octave: 4 },
  { step: "F", octave: 4 }, { step: "G", octave: 4 }, { step: "A", octave: 4 },
  { step: "B", octave: 4 }, { step: "C", octave: 5 }, { step: "D", octave: 5 },
  { step: "E", octave: 5 },
];

function randomPitch(): Pitch {
  const p = pick(SCALE_PITCHES);
  return { step: p.step, octave: p.octave };
}

function makeNote(d: NoteDuration, useArticulations: boolean): ScoreNote {
  const note: ScoreNote = {
    id: uid(),
    type: "note",
    pitch: randomPitch(),
    duration: d,
  };
  if (useArticulations && Math.random() < 0.25) {
    note.articulations = ["staccato"];
  }
  return note;
}

function makeRest(d: NoteDuration): ScoreRest {
  return { id: uid(), type: "rest", duration: d };
}

function fillMeasure(
  totalSlots: number,
  level: ChallengeLevel,
  density: number,
  durations: NoteDuration[],
  useArticulations: boolean,
): Array<ScoreNote | ScoreRest> {
  const elements: Array<ScoreNote | ScoreRest> = [];
  let remaining = totalSlots;

  while (remaining > 0) {
    const fitting = durations.filter((d) => {
      const s = durationSlots(d, level);
      return s !== null && s <= remaining;
    });

    let chosen: NoteDuration;
    if (fitting.length === 0) {
      chosen = level === 1 ? "quarter" : "eighth";
    } else {
      chosen = pick(fitting);
    }

    const slots = durationSlots(chosen, level) ?? 1;
    elements.push(
      Math.random() < density
        ? makeNote(chosen, useArticulations)
        : makeRest(chosen)
    );
    remaining -= slots;
  }

  return elements;
}

// ─── Main Generator ──────────────────────────────────────────
export function generateChallengeScore(level: ChallengeLevel): ScoreDocument {
  const params = LEVEL_PARAMS[level];
  const timeSig = pick(params.timeSigs);
  const bpm = randInt(params.bpmRange[0], params.bpmRange[1]);
  const measureCount = randInt(params.measureCountRange[0], params.measureCountRange[1]);
  const durations = level === 1 ? LEVEL1_DURATIONS : LEVEL23_DURATIONS;
  const slots = getMeasureSlots(timeSig, level);

  const measures: ScoreMeasure[] = Array.from({ length: measureCount }, () => ({
    id: uid(),
    elements: fillMeasure(slots, level, params.density, durations, params.useArticulations),
  }));

  const now = Date.now();
  return {
    id: uid(),
    metadata: {
      title: `Challenge Level ${level}`,
      createdAt: now,
      updatedAt: now,
    },
    parts: [
      {
        id: uid(),
        instrumentId: "violin",
        clef: "treble",
        measures,
      },
    ],
    keySignature: { sharps: 0 },
    timeSignature: timeSig,
    bpm,
  };
}
