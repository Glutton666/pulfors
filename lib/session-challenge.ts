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
  Dynamic,
  ArticulationType,
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

const LEVEL_PARAMS = {
  1: {
    timeSigs: [
      { numerator: 4, denominator: 4 },
      { numerator: 3, denominator: 4 },
    ] as TimeSig[],
    bpmRange: [60, 120] as [number, number],
    measureCountRange: [4, 8] as [number, number],
    // -1 to 1 sharp/flat for easy key sigs
    keyRange: [0, 0] as [number, number],
    instrument: "trumpet",
  },
  2: {
    timeSigs: [
      { numerator: 3, denominator: 4 },
      { numerator: 4, denominator: 4 },
      { numerator: 6, denominator: 4 },
      { numerator: 7, denominator: 8 },
    ] as TimeSig[],
    bpmRange: [50, 160] as [number, number],
    measureCountRange: [4, 8] as [number, number],
    // ±2 sharps/flats
    keyRange: [-2, 2] as [number, number],
    instrument: "trumpet",
  },
  3: {
    timeSigs: [
      { numerator: 4, denominator: 4 },
      { numerator: 3, denominator: 4 },
      { numerator: 6, denominator: 4 },
      { numerator: 5, denominator: 4 },
      { numerator: 7, denominator: 4 },
    ] as TimeSig[],
    bpmRange: [40, 180] as [number, number],
    measureCountRange: [6, 12] as [number, number],
    // ±4 sharps/flats
    keyRange: [-4, 4] as [number, number],
    instrument: "trumpet",
  },
};

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

// Weighted pick: higher weight = higher probability
function pickWeighted<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

// ─── Duration Tables ─────────────────────────────────────────
// 값 = 8분음표(eighth) 단위 (정수만 허용)
const DURATION_EIGHTHS: Partial<Record<NoteDuration, number>> = {
  whole:       8,
  half:        4,
  quarter:     2,
  eighth:      1,
  quarter_dot: 3,
  half_dot:    6,
};

// Level 1: 4분음표만 사용 (1 slot = 1 quarter)
const L1_DURATIONS: NoteDuration[] = ["quarter"];

// Level 2/3: 8분음표 기반, 가중치로 shorter values 우선
// [duration, weight]
const L2_DUR_WEIGHTS: [NoteDuration, number][] = [
  ["eighth",      5],
  ["quarter",     4],
  ["quarter_dot", 2],
];
const L3_DUR_WEIGHTS: [NoteDuration, number][] = [
  ["eighth",      5],
  ["quarter",     4],
  ["quarter_dot", 2],
  ["half",        1],
];

// 슬롯 수 계산 (denom=8이면 numerator slots; denom=4이면 numerator*2 slots for eighth unit)
function getMeasureSlots(ts: TimeSig, level: ChallengeLevel): number {
  if (level === 1) return ts.numerator; // quarter-note slots
  // eighth-note slots
  if (ts.denominator === 8) return ts.numerator;
  return ts.numerator * (8 / ts.denominator);
}

// 음표 길이 → 슬롯 수 (8분음표 단위, 정수 아니면 null)
function durationToSlots(d: NoteDuration, level: ChallengeLevel): number | null {
  const eighths = DURATION_EIGHTHS[d];
  if (eighths == null) return null;
  if (level === 1) {
    // quarter-note slots
    if (eighths % 2 !== 0) return null;
    return eighths / 2;
  }
  return eighths;
}

// 가중치 배열에서 remaining 슬롯에 맞는 것 골라내기
function pickDurationWeighted(
  durWeights: [NoteDuration, number][],
  level: ChallengeLevel,
  remaining: number,
): NoteDuration {
  const fitting = durWeights.filter(([d]) => {
    const s = durationToSlots(d, level);
    return s !== null && s <= remaining;
  });
  if (fitting.length === 0) return level === 1 ? "quarter" : "eighth";
  const items = fitting.map(([d]) => d);
  const weights = fitting.map(([, w]) => w);
  return pickWeighted(items, weights);
}

// ─── Pitch Tables ─────────────────────────────────────────────
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

// ─── Note/Rest Factories ──────────────────────────────────────
const L3_ARTICULATIONS: ArticulationType[] = ["staccato", "tenuto", "accent", "marcato"];
const L3_DYNAMICS: Dynamic[] = ["p", "mp", "mf", "f", "ff"];

function makeNote(
  d: NoteDuration,
  level: ChallengeLevel,
  noteIndex: number,
): ScoreNote {
  const note: ScoreNote = {
    id: uid(),
    type: "note",
    pitch: randomPitch(),
    duration: d,
  };
  if (level === 3) {
    // 30% chance of articulation
    if (Math.random() < 0.30) {
      note.articulations = [pick(L3_ARTICULATIONS)];
    }
    // First note in measure sometimes gets dynamic marking
    if (noteIndex === 0 && Math.random() < 0.40) {
      note.dynamic = pick(L3_DYNAMICS);
    }
  }
  return note;
}

function makeRest(d: NoteDuration): ScoreRest {
  return { id: uid(), type: "rest", duration: d };
}

// ─── Measure Fill: Level 1 (quarter-note only) ────────────────
function fillMeasureL1(totalSlots: number, density: number): Array<ScoreNote | ScoreRest> {
  const elements: Array<ScoreNote | ScoreRest> = [];
  for (let i = 0; i < totalSlots; i++) {
    elements.push(
      Math.random() < density
        ? makeNote("quarter", 1, i)
        : makeRest("quarter"),
    );
  }
  return elements;
}

// ─── Measure Fill: Level 2 — Hemiola cross-accent pattern ────
// 6/4 (12 slots): 헤미올라 — 4×♩. (3+3+3+3) 대신 6×♩ (2+2+2+2+2+2)
// 4/4 (8 slots): 3+3+2 cross-accent (Samba/Tresillo feel)
function fillMeasureHemiola(
  totalSlots: number,
  density: number,
): Array<ScoreNote | ScoreRest> {
  const elements: Array<ScoreNote | ScoreRest> = [];

  if (totalSlots === 12) {
    // 6/4 헤미올라: 6×quarter (slots=2 each) 대 원래 4×quarter_dot (slots=3)
    for (let i = 0; i < 6; i++) {
      elements.push(
        Math.random() < density ? makeNote("quarter", 2, i) : makeRest("quarter"),
      );
    }
  } else {
    // 4/4 또는 기타: 3+3+2 tresillo 패턴 (8 slots: ♩.♩.♩♩ → 3+3+2)
    const pattern: NoteDuration[] = ["quarter_dot", "quarter_dot", "quarter"];
    let idx = 0;
    for (const d of pattern) {
      const slots = durationToSlots(d, 2) ?? 2;
      if (elements.reduce((acc, el) => acc + (durationToSlots(el.duration, 2) ?? 0), 0) + slots > totalSlots) {
        elements.push(Math.random() < density ? makeNote("eighth", 2, idx) : makeRest("eighth"));
      } else {
        elements.push(Math.random() < density ? makeNote(d, 2, idx) : makeRest(d));
      }
      idx++;
    }
  }
  return elements;
}

// ─── Measure Fill: Level 2 (eighth-note based, syncopation + hemiola) ──
function fillMeasureL2(totalSlots: number, density: number): Array<ScoreNote | ScoreRest> {
  // 30% chance: use hemiola cross-accent pattern (only for meters that support it)
  if (Math.random() < 0.30 && (totalSlots === 12 || totalSlots === 8)) {
    return fillMeasureHemiola(totalSlots, density);
  }

  const elements: Array<ScoreNote | ScoreRest> = [];
  let remaining = totalSlots;
  let noteIndex = 0;

  // Syncopation: ~40% chance to start with an eighth rest → shifts notes to off-beat
  const startWithRest = Math.random() < 0.40;
  if (startWithRest && remaining >= 1) {
    elements.push(makeRest("eighth"));
    remaining -= 1;
  }

  while (remaining > 0) {
    const d = pickDurationWeighted(L2_DUR_WEIGHTS, 2, remaining);
    const slots = durationToSlots(d, 2) ?? 1;
    // High note density on off-beat to reinforce syncopation feel
    const noteChance = startWithRest && noteIndex % 2 === 0 ? density + 0.15 : density;
    elements.push(
      Math.random() < Math.min(noteChance, 0.90)
        ? makeNote(d, 2, noteIndex)
        : makeRest(d),
    );
    remaining -= slots;
    noteIndex++;
  }
  return elements;
}

// ─── Measure Fill: Level 3 (eighth-note based, complex) ───────
function fillMeasureL3(totalSlots: number, density: number): Array<ScoreNote | ScoreRest> {
  const elements: Array<ScoreNote | ScoreRest> = [];
  let remaining = totalSlots;
  let noteIndex = 0;

  while (remaining > 0) {
    const d = pickDurationWeighted(L3_DUR_WEIGHTS, 3, remaining);
    const slots = durationToSlots(d, 3) ?? 1;
    elements.push(
      Math.random() < density
        ? makeNote(d, 3, noteIndex)
        : makeRest(d),
    );
    remaining -= slots;
    noteIndex++;
  }
  return elements;
}

// ─── Measure Builder ─────────────────────────────────────────
function buildMeasure(
  ts: TimeSig,
  level: ChallengeLevel,
  density: number,
  measureIdx: number,
): ScoreMeasure {
  const slots = getMeasureSlots(ts, level);

  let elements: Array<ScoreNote | ScoreRest>;
  if (level === 1) {
    elements = fillMeasureL1(slots, density);
  } else if (level === 2) {
    elements = fillMeasureL2(slots, density);
  } else {
    elements = fillMeasureL3(slots, density);
  }

  const measure: ScoreMeasure = { id: uid(), elements };

  // Level 3: add measure-level dynamics occasionally
  if (level === 3 && measureIdx % 2 === 0 && Math.random() < 0.50) {
    measure.dynamic = pick(L3_DYNAMICS);
  }

  return measure;
}

// ─── Main Generator ──────────────────────────────────────────
export function generateChallengeScore(level: ChallengeLevel): ScoreDocument {
  const params = LEVEL_PARAMS[level];
  const timeSig = pick(params.timeSigs);
  const bpm = randInt(params.bpmRange[0], params.bpmRange[1]);
  const measureCount = randInt(params.measureCountRange[0], params.measureCountRange[1]);
  const sharps = randInt(params.keyRange[0], params.keyRange[1]);

  // Note density: L1=0.75, L2=0.65, L3=0.78 (≈1.2×L2 as spec'd)
  const density = level === 1 ? 0.75 : level === 2 ? 0.65 : 0.78;

  const measures: ScoreMeasure[] = Array.from({ length: measureCount }, (_, i) =>
    buildMeasure(timeSig, level, density, i),
  );

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
        instrumentId: params.instrument,
        clef: "treble",
        measures,
      },
    ],
    keySignature: { sharps },
    timeSignature: timeSig,
    bpm,
  };
}
