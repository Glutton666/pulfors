// ============================================================
// 악보 SVG 레이아웃 계산 엔진 (순수 함수)
// ============================================================

import type { ClefType, NoteDuration, Pitch, ScoreMeasure } from "./score-types";

// ── 오선보 기본 상수 ───────────────────────────────────────────
export const STAFF_LINE_COUNT = 5;
export const LINE_SPACING = 10;        // 선 간격 (px)
export const STAFF_HEIGHT = LINE_SPACING * (STAFF_LINE_COUNT - 1); // 40px
export const LEDGER_LINE_WIDTH = 14;

// 음자리표 너비
export const CLEF_WIDTH: Record<ClefType, number> = {
  treble: 24,
  bass: 20,
  alto: 18,
  tenor: 18,
  percussion: 14,
};

// 박자표 너비 (숫자 너비 기준)
export const TIME_SIG_WIDTH = 20;

// 조표 너비 (샤프/플랫 한 개당 8px)
export const KEY_SIG_ACCIDENTAL_WIDTH = 8;

// 음표 너비 (duration별)
export const NOTE_WIDTH: Record<NoteDuration, number> = {
  whole:          48,
  half:           32,
  quarter:        24,
  eighth:         18,
  sixteenth:      14,
  thirty_second:  12,
  whole_dot:      56,
  half_dot:       38,
  quarter_dot:    28,
  eighth_dot:     22,
  sixteenth_dot:  16,
};

// 음표 머리 크기
export const NOTE_HEAD_RX = 4.5;  // 가로 반축
export const NOTE_HEAD_RY = 3.2;  // 세로 반축
export const STEM_HEIGHT = 30;    // 기둥 높이
export const FLAG_OFFSET = 2;     // 꼬리 시작 오프셋

// ── 음높이 → 오선 위치 변환 ────────────────────────────────────

// 음이름 → 반음 수 (C=0, D=2, E=4, F=5, G=7, A=9, B=11)
const STEP_SEMITONES: Record<string, number> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
};

// 오선보 위 선 인덱스 (0 = 맨 아래 선, 4 = 맨 위 선)
// 높은음자리표 기준: 맨 아래 선 = E4, 맨 위 선 = F5
// 각 step = LINE_SPACING / 2 = 5px 이동

// 높은음자리표: B4 = 2번째 선(index 1) 위 한 칸 = y=0 기준 위에서부터
// 오선: 맨 위(line 4) → 맨 아래(line 0)
// Y = 0(맨 위 선) ~ STAFF_HEIGHT(맨 아래 선)
// 단계 1개 = LINE_SPACING/2 = 5px

// 기준 음 (높은음자리표: 맨 아래 선 = E4)
const TREBLE_CLEF_REFERENCE: { step: string; octave: number; y: number } = {
  step: "E",
  octave: 4,
  y: STAFF_HEIGHT, // 맨 아래 선
};

// 기준 음 (낮은음자리표: 맨 아래 선 = G2)
const BASS_CLEF_REFERENCE: { step: string; octave: number; y: number } = {
  step: "G",
  octave: 2,
  y: STAFF_HEIGHT,
};

// 알토 음자리표: 맨 아래 선 = F3
const ALTO_CLEF_REFERENCE: { step: string; octave: number; y: number } = {
  step: "F",
  octave: 3,
  y: STAFF_HEIGHT,
};

// 테너 음자리표: 맨 아래 선 = D3
const TENOR_CLEF_REFERENCE: { step: string; octave: number; y: number } = {
  step: "D",
  octave: 3,
  y: STAFF_HEIGHT,
};

// 단계 거리 계산 (두 음 사이의 diatonic step 거리)
const STEP_ORDER = ["C", "D", "E", "F", "G", "A", "B"];

function stepIndex(step: string, octave: number): number {
  return octave * 7 + STEP_ORDER.indexOf(step);
}

/**
 * 음높이 → 오선보 Y 좌표 (오선 위쪽이 낮은 Y)
 * @param pitch 음높이
 * @param clef 음자리표
 * @returns Y 좌표 (오선 내부: 0~STAFF_HEIGHT, 덧줄: 음수 또는 STAFF_HEIGHT 초과)
 */
export function pitchToY(pitch: Pitch, clef: ClefType): number {
  let ref = TREBLE_CLEF_REFERENCE;
  if (clef === "bass") ref = BASS_CLEF_REFERENCE;
  else if (clef === "alto") ref = ALTO_CLEF_REFERENCE;
  else if (clef === "tenor") ref = TENOR_CLEF_REFERENCE;
  else if (clef === "percussion") return STAFF_HEIGHT / 2; // 타악기는 중앙

  const refIdx = stepIndex(ref.step, ref.octave);
  const pitchIdx = stepIndex(pitch.step, pitch.octave);
  const stepDiff = pitchIdx - refIdx;

  // 위로 갈수록 Y가 작아짐 (화면 좌표)
  return ref.y - stepDiff * (LINE_SPACING / 2);
}

/**
 * Y 좌표 → 가장 가까운 음높이 (터치 입력용)
 */
export function yToPitch(y: number, clef: ClefType): Pitch {
  let ref = TREBLE_CLEF_REFERENCE;
  if (clef === "bass") ref = BASS_CLEF_REFERENCE;
  else if (clef === "alto") ref = ALTO_CLEF_REFERENCE;
  else if (clef === "tenor") ref = TENOR_CLEF_REFERENCE;

  const stepDiff = Math.round((ref.y - y) / (LINE_SPACING / 2));
  const refIdx = stepIndex(ref.step, ref.octave);
  const targetIdx = refIdx + stepDiff;

  const octave = Math.floor(targetIdx / 7);
  const stepPos = ((targetIdx % 7) + 7) % 7;
  const step = STEP_ORDER[stepPos] as Pitch["step"];

  return { step, octave: Math.max(0, Math.min(8, octave)) };
}

/**
 * 음높이를 MIDI 번호로 변환 (C4 = 60)
 */
export function pitchToMidi(pitch: Pitch): number {
  const base = pitch.octave * 12 + STEP_SEMITONES[pitch.step];
  let acc = 0;
  if (pitch.accidental === "sharp") acc = 1;
  else if (pitch.accidental === "flat") acc = -1;
  else if (pitch.accidental === "double_sharp") acc = 2;
  else if (pitch.accidental === "double_flat") acc = -2;
  return base + acc;
}

/**
 * 음높이를 표시 이름으로 변환 (예: "C4", "F#5")
 */
export function pitchToName(pitch: Pitch): string {
  let accStr = "";
  if (pitch.accidental === "sharp") accStr = "♯";
  else if (pitch.accidental === "flat") accStr = "♭";
  else if (pitch.accidental === "natural") accStr = "♮";
  else if (pitch.accidental === "double_sharp") accStr = "𝄪";
  else if (pitch.accidental === "double_flat") accStr = "𝄫";
  return `${pitch.step}${accStr}${pitch.octave}`;
}

// ── 덧줄(Ledger Line) 계산 ─────────────────────────────────────

/**
 * 특정 Y 좌표에 덧줄이 필요한지 계산
 * @returns 덧줄 Y 좌표 배열 (오선 위: 음수, 오선 아래: STAFF_HEIGHT 초과)
 */
export function getLedgerLines(noteY: number): number[] {
  const ledgers: number[] = [];
  // 오선 위 덧줄 (Y < 0)
  if (noteY <= -LINE_SPACING / 2) {
    let y = -LINE_SPACING;
    while (y >= noteY - LINE_SPACING / 2) {
      ledgers.push(y);
      y -= LINE_SPACING;
    }
  }
  // 오선 아래 덧줄 (Y > STAFF_HEIGHT)
  if (noteY >= STAFF_HEIGHT + LINE_SPACING / 2) {
    let y = STAFF_HEIGHT + LINE_SPACING;
    while (y <= noteY + LINE_SPACING / 2) {
      ledgers.push(y);
      y += LINE_SPACING;
    }
  }
  return ledgers;
}

// ── 음표 기둥 방향 ─────────────────────────────────────────────

/**
 * 기둥 방향 결정 (오선 중앙 기준: 중앙보다 아래면 기둥 위로)
 */
export function getStemDirection(noteY: number): "up" | "down" {
  const midY = STAFF_HEIGHT / 2;
  return noteY > midY ? "up" : "down";
}

// ── 마디 폭 계산 ──────────────────────────────────────────────

/**
 * 마디의 최소 필요 폭 계산 (음표 폭 합계 + 여백)
 */
export function measureMinWidth(measure: ScoreMeasure): number {
  let totalWidth = 8; // 시작 여백
  for (const el of measure.elements) {
    if (el.type === "note" || el.type === "rest") {
      totalWidth += NOTE_WIDTH[el.duration] ?? 24;
    }
  }
  return Math.max(totalWidth + 8, 60); // 최소 60px
}

/**
 * 헤더 폭 계산 (음자리표 + 박자표 + 조표)
 */
export function headerWidth(
  clef: ClefType,
  hasTimeSignature: boolean,
  keyAccidentalCount: number,
): number {
  let w = CLEF_WIDTH[clef] + 8; // 음자리표 + 여백
  if (Math.abs(keyAccidentalCount) > 0) {
    w += Math.abs(keyAccidentalCount) * KEY_SIG_ACCIDENTAL_WIDTH + 4;
  }
  if (hasTimeSignature) {
    w += TIME_SIG_WIDTH + 4;
  }
  return w;
}

// ── 음표 X 위치 계산 ──────────────────────────────────────────

export interface NotePosition {
  elementId: string;
  x: number;
  y: number;
  width: number;
}

/**
 * 마디 내 음표들의 X, Y 좌표 계산
 */
export function layoutMeasure(
  measure: ScoreMeasure,
  startX: number,
  clef: ClefType,
  totalWidth: number,
): NotePosition[] {
  const positions: NotePosition[] = [];
  const elementCount = measure.elements.length;
  if (elementCount === 0) return positions;

  // 각 음표의 기본 폭 계산
  const widths = measure.elements.map((el) =>
    NOTE_WIDTH[el.duration] ?? 24
  );
  const totalNoteWidth = widths.reduce((a, b) => a + b, 0);

  // 남은 공간을 음표 개수로 균등 배분
  const leftPad = 8;
  const extraPerNote = Math.max(
    0,
    (totalWidth - totalNoteWidth - leftPad * 2) / elementCount
  );

  let x = startX + leftPad;
  for (let i = 0; i < measure.elements.length; i++) {
    const el = measure.elements[i];
    const w = widths[i];
    let y = STAFF_HEIGHT / 2; // 기본값 (쉼표용)

    if (el.type === "note") {
      y = pitchToY(el.pitch, clef);
    }

    positions.push({
      elementId: el.id,
      x: x + w / 2, // 음표 중심 X
      y,
      width: w,
    });
    x += w + extraPerNote;
  }
  return positions;
}

// ── 빔(Beam) 그룹 계산 ─────────────────────────────────────────

export interface BeamGroup {
  startIdx: number;
  endIdx: number;
  beamLevel: number; // 1 = 8분음표 빔, 2 = 16분음표 빔
}

/**
 * 8분음표 이상을 빔으로 묶는 그룹 계산
 */
export function calcBeamGroups(
  durations: NoteDuration[],
  beatsPerMeasure: number,
  denominator: number,
): BeamGroup[] {
  const groups: BeamGroup[] = [];
  // 간단한 구현: 인접한 8분/16분음표를 묶음
  let start = -1;
  for (let i = 0; i <= durations.length; i++) {
    const dur = durations[i];
    const beamable =
      dur === "eighth" ||
      dur === "sixteenth" ||
      dur === "thirty_second" ||
      dur === "eighth_dot" ||
      dur === "sixteenth_dot";

    if (beamable && start === -1) {
      start = i;
    } else if (!beamable && start !== -1) {
      if (i - start >= 2) {
        groups.push({ startIdx: start, endIdx: i - 1, beamLevel: 1 });
      }
      start = -1;
    }
  }
  return groups;
}

// ── 조표 배치 ─────────────────────────────────────────────────
// 각 음자리표별 샤프/플랫 기호의 Y 좌표 배열
// 순서: F, C, G, D, A, E, B (샤프) / B, E, A, D, G, C, F (플랫)

// 높은음자리표
export const TREBLE_SHARP_POSITIONS = [
  pitchToY({ step: "F", octave: 5 }, "treble"),
  pitchToY({ step: "C", octave: 5 }, "treble"),
  pitchToY({ step: "G", octave: 5 }, "treble"),
  pitchToY({ step: "D", octave: 5 }, "treble"),
  pitchToY({ step: "A", octave: 4 }, "treble"),
  pitchToY({ step: "E", octave: 5 }, "treble"),
  pitchToY({ step: "B", octave: 4 }, "treble"),
];
export const TREBLE_FLAT_POSITIONS = [
  pitchToY({ step: "B", octave: 4 }, "treble"),
  pitchToY({ step: "E", octave: 5 }, "treble"),
  pitchToY({ step: "A", octave: 4 }, "treble"),
  pitchToY({ step: "D", octave: 5 }, "treble"),
  pitchToY({ step: "G", octave: 4 }, "treble"),
  pitchToY({ step: "C", octave: 5 }, "treble"),
  pitchToY({ step: "F", octave: 4 }, "treble"),
];

// 낮은음자리표
export const BASS_SHARP_POSITIONS = [
  pitchToY({ step: "F", octave: 3 }, "bass"),
  pitchToY({ step: "C", octave: 3 }, "bass"),
  pitchToY({ step: "G", octave: 3 }, "bass"),
  pitchToY({ step: "D", octave: 3 }, "bass"),
  pitchToY({ step: "A", octave: 2 }, "bass"),
  pitchToY({ step: "E", octave: 3 }, "bass"),
  pitchToY({ step: "B", octave: 2 }, "bass"),
];
export const BASS_FLAT_POSITIONS = [
  pitchToY({ step: "B", octave: 2 }, "bass"),
  pitchToY({ step: "E", octave: 3 }, "bass"),
  pitchToY({ step: "A", octave: 2 }, "bass"),
  pitchToY({ step: "D", octave: 3 }, "bass"),
  pitchToY({ step: "G", octave: 2 }, "bass"),
  pitchToY({ step: "C", octave: 3 }, "bass"),
  pitchToY({ step: "F", octave: 2 }, "bass"),
];

// 알토 음자리표
export const ALTO_SHARP_POSITIONS = [
  pitchToY({ step: "F", octave: 4 }, "alto"),
  pitchToY({ step: "C", octave: 4 }, "alto"),
  pitchToY({ step: "G", octave: 4 }, "alto"),
  pitchToY({ step: "D", octave: 4 }, "alto"),
  pitchToY({ step: "A", octave: 3 }, "alto"),
  pitchToY({ step: "E", octave: 4 }, "alto"),
  pitchToY({ step: "B", octave: 3 }, "alto"),
];
export const ALTO_FLAT_POSITIONS = [
  pitchToY({ step: "B", octave: 3 }, "alto"),
  pitchToY({ step: "E", octave: 4 }, "alto"),
  pitchToY({ step: "A", octave: 3 }, "alto"),
  pitchToY({ step: "D", octave: 4 }, "alto"),
  pitchToY({ step: "G", octave: 3 }, "alto"),
  pitchToY({ step: "C", octave: 4 }, "alto"),
  pitchToY({ step: "F", octave: 3 }, "alto"),
];

// 테너 음자리표
export const TENOR_SHARP_POSITIONS = [
  pitchToY({ step: "F", octave: 4 }, "tenor"),
  pitchToY({ step: "C", octave: 4 }, "tenor"),
  pitchToY({ step: "G", octave: 4 }, "tenor"),
  pitchToY({ step: "D", octave: 4 }, "tenor"),
  pitchToY({ step: "A", octave: 3 }, "tenor"),
  pitchToY({ step: "E", octave: 4 }, "tenor"),
  pitchToY({ step: "B", octave: 3 }, "tenor"),
];
export const TENOR_FLAT_POSITIONS = [
  pitchToY({ step: "B", octave: 3 }, "tenor"),
  pitchToY({ step: "E", octave: 4 }, "tenor"),
  pitchToY({ step: "A", octave: 3 }, "tenor"),
  pitchToY({ step: "D", octave: 4 }, "tenor"),
  pitchToY({ step: "G", octave: 3 }, "tenor"),
  pitchToY({ step: "C", octave: 4 }, "tenor"),
  pitchToY({ step: "F", octave: 3 }, "tenor"),
];

// 클레프별 조표 위치 통합 맵
export const KEY_SIG_POSITIONS: Record<
  ClefType,
  { sharp: number[]; flat: number[] }
> = {
  treble:     { sharp: TREBLE_SHARP_POSITIONS, flat: TREBLE_FLAT_POSITIONS },
  bass:       { sharp: BASS_SHARP_POSITIONS,   flat: BASS_FLAT_POSITIONS },
  alto:       { sharp: ALTO_SHARP_POSITIONS,   flat: ALTO_FLAT_POSITIONS },
  tenor:      { sharp: TENOR_SHARP_POSITIONS,  flat: TENOR_FLAT_POSITIONS },
  percussion: { sharp: [],                     flat: [] }, // 타악기는 조표 없음
};
