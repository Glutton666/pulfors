// ============================================================
// 악보 SVG 레이아웃 계산 엔진 (순수 함수)
// ============================================================

import type { ClefType, NoteDuration, Pitch, ScoreMeasure, ScoreDocument, ScoreElement, ScoreNote, DrumType } from "./score-types";
import { DRUM_MAP, DRUM_TYPES } from "./score-types";
import { getElementBeatScale } from "./score-tuplet";

// ── 오선보 기본 상수 ───────────────────────────────────────────
// LINE_SPACING을 변경하면 모든 파생 상수가 자동으로 스케일링됩니다.
export const STAFF_LINE_COUNT = 5;
export const LINE_SPACING = 10;        // 선 간격 (px) — 기준값: 10
export const STAFF_HEIGHT = LINE_SPACING * (STAFF_LINE_COUNT - 1); // 40px

// 덧줄 너비 = 음표머리 너비의 2.5배
export const LEDGER_LINE_WIDTH = Math.round(LINE_SPACING * 1.4); // 14

// 음자리표 너비 (LINE_SPACING 기반)
export const CLEF_WIDTH: Record<ClefType, number> = {
  treble:     Math.round(LINE_SPACING * 2.4),  // 24
  bass:       Math.round(LINE_SPACING * 2.0),  // 20
  alto:       Math.round(LINE_SPACING * 1.8),  // 18
  tenor:      Math.round(LINE_SPACING * 1.8),  // 18
  percussion: Math.round(LINE_SPACING * 1.4),  // 14
};

// 박자표 너비
export const TIME_SIG_WIDTH = Math.round(LINE_SPACING * 2.0); // 20

// 조표 너비 (샤프/플랫 한 개당)
export const KEY_SIG_ACCIDENTAL_WIDTH = Math.round(LINE_SPACING * 0.8); // 8

// 음표 너비 (duration별 — LINE_SPACING 기반)
export const NOTE_WIDTH: Record<NoteDuration, number> = {
  whole:          Math.round(LINE_SPACING * 4.8), // 48
  half:           Math.round(LINE_SPACING * 3.2), // 32
  quarter:        Math.round(LINE_SPACING * 2.4), // 24
  eighth:         Math.round(LINE_SPACING * 1.8), // 18
  sixteenth:      Math.round(LINE_SPACING * 1.4), // 14
  thirty_second:      Math.round(LINE_SPACING * 1.2), // 12
  thirty_second_dot:  Math.round(LINE_SPACING * 1.5), // 15
  whole_dot:      Math.round(LINE_SPACING * 5.6), // 56
  half_dot:       Math.round(LINE_SPACING * 3.8), // 38
  quarter_dot:    Math.round(LINE_SPACING * 2.8), // 28
  eighth_dot:     Math.round(LINE_SPACING * 2.2), // 22
  sixteenth_dot:  Math.round(LINE_SPACING * 1.6), // 16
};

// 음표 머리·기둥 크기 (LINE_SPACING 기반)
export const NOTE_HEAD_RX = LINE_SPACING * 0.55;        // 5.5 — 가로 반축
export const NOTE_HEAD_RY = LINE_SPACING * 0.40;        // 4.0 — 세로 반축
export const STEM_HEIGHT   = Math.round(LINE_SPACING * 3.2); // 32 — 기둥 높이
export const FLAG_OFFSET   = Math.round(LINE_SPACING * 0.2); // 2  — 꼬리 시작 오프셋

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
 * 드럼 종류 → 오선 Y 좌표 (표준 표기법 기반 단순화 매핑, DRUM_MAP 참고)
 */
export function drumTypeToY(drumType: DrumType): number {
  return DRUM_MAP[drumType].staffStep * (LINE_SPACING / 2);
}

/**
 * Y 좌표 → 가장 가까운 드럼 종류 (타악기 파트 터치 입력용)
 */
export function yToDrumType(y: number): DrumType {
  const step = Math.round(y / (LINE_SPACING / 2));
  let closest: DrumType = "snare";
  let minDist = Infinity;
  for (const dt of DRUM_TYPES) {
    const dist = Math.abs(DRUM_MAP[dt].staffStep - step);
    if (dist < minDist) {
      minDist = dist;
      closest = dt;
    }
  }
  return closest;
}

/**
 * 음표의 오선 Y 좌표를 계산합니다. 타악기 파트에서 drumType이 지정된 경우 표준 드럼
 * 오선 위치를 사용하고, 그렇지 않으면 기존 pitch 기반 위치(pitchToY)를 사용합니다.
 */
export function noteStaffY(note: ScoreNote, clef: ClefType): number {
  if (clef === "percussion" && note.drumType) {
    return drumTypeToY(note.drumType);
  }
  return pitchToY(note.pitch, clef);
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
 * 음표/쉼표 하나의 화면 표시 폭. 튜플렛에 속한 요소는 실제 연주 박자(스케일)만큼
 * 폭을 줄여, 그룹 전체가 "정상" 박자 개수만큼의 공간을 차지하도록 한다.
 * (예: 셋잇단음표 8분음표 3개는 8분음표 2개 분량의 공간을 차지)
 */
export function getElementDisplayWidth(measure: ScoreMeasure, el: ScoreElement): number {
  const base = NOTE_WIDTH[el.duration] ?? 24;
  const scale = getElementBeatScale(measure, el.id);
  // 최소 폭 바닥은 튜플렛 비율(최소 1/2, 2연음 케이스)보다 작거나 같게 유지해
  // 시맨틱 스케일과 시각 폭이 항상 일치하도록 한다(0.5 초과 케이스는 절대 클램프되지 않음).
  return Math.max(base * scale, base * 0.5);
}

/**
 * 마디의 최소 필요 폭 계산 (음표 폭 합계 + 여백)
 */
export function measureMinWidth(measure: ScoreMeasure): number {
  let totalWidth = 8; // 시작 여백
  for (const el of measure.elements) {
    if (el.type === "note" || el.type === "rest") {
      totalWidth += getElementDisplayWidth(measure, el);
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
  overrides?: Record<string, number>,
): NotePosition[] {
  const positions: NotePosition[] = [];
  const elementCount = measure.elements.length;
  if (elementCount === 0) return positions;

  // 자유 배치 여부: 하나라도 레이아웃 오버라이드가 있으면 자유 배치 모드
  const hasOverride = measure.elements.some((el) => overrides?.[el.id] != null);

  if (hasOverride) {
    // ── 자유 배치 모드: 오버라이드 X 좌표를 그대로 사용 (겹침 방지 없음) ──
    // 오버라이드가 없는 기존 요소는 순차 레이아웃 위치를 fallback으로 사용
    // (자유 배치 이전에 추가된 음표들이 왼쪽으로 몰리는 regression 방지)
    const widthsSeq = measure.elements.map((el) => getElementDisplayWidth(measure, el));
    const totalNoteWidthSeq = widthsSeq.reduce((a, b) => a + b, 0);
    const leftPadSeq = 8;
    const extraPerNoteSeq = Math.max(
      0,
      (totalWidth - totalNoteWidthSeq - leftPadSeq * 2) / elementCount,
    );
    const seqLeftX = new Map<string, number>();
    let seqX = startX + leftPadSeq;
    for (let i = 0; i < measure.elements.length; i++) {
      seqLeftX.set(measure.elements[i].id, seqX);
      seqX += widthsSeq[i] + extraPerNoteSeq;
    }

    const leftPad = 8;
    for (const el of measure.elements) {
      const w = getElementDisplayWidth(measure, el);
      let y = STAFF_HEIGHT / 2;
      if (el.type === "note") {
        y = noteStaffY(el, clef);
      }
      // 오버라이드 값은 사용자가 실제로 터치한 "중심(center)" 좌표를 의미함
      // (ScoreCanvas의 ghost.x/measureRelX는 항상 음표 중심 기준으로 계산됨).
      // 오버라이드가 없는 fallback 값(seqLeftX)은 왼쪽 끝(left edge) 기준이므로 폭의 절반을 더해 중심으로 변환.
      const ov = overrides?.[el.id];
      const x = ov != null
        ? startX + ov
        : (seqLeftX.get(el.id) ?? startX + leftPad) + w / 2;
      positions.push({
        elementId: el.id,
        x,
        y,
        width: w,
      });
    }
    return positions;
  }

  // ── 순차 레이아웃 모드 (기존 동작) ──
  const widths = measure.elements.map((el) =>
    getElementDisplayWidth(measure, el)
  );
  const totalNoteWidth = widths.reduce((a, b) => a + b, 0);

  const leftPad = 8;
  const extraPerNote = Math.max(
    0,
    (totalWidth - totalNoteWidth - leftPad * 2) / elementCount
  );

  let x = startX + leftPad;
  for (let i = 0; i < measure.elements.length; i++) {
    const el = measure.elements[i];
    const w = widths[i];
    let y = STAFF_HEIGHT / 2;

    if (el.type === "note") {
      y = noteStaffY(el, clef);
    }

    positions.push({
      elementId: el.id,
      x: x + w / 2,
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
      dur === "thirty_second_dot" ||
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

// ── 전체 악보 레이아웃 계산 (ScoreCanvas 터치 처리용) ────────────

export interface ScoreRowLayout {
  measureIndices: number[];
  y: number;
  measureWidths: number[];
  rowWidth: number;
}

// ScoreRenderer와 동일한 레이아웃 상수 (LINE_SPACING 기반)
export const SCORE_STAFF_PADDING_TOP    = Math.round(LINE_SPACING * 2.4); // 24
export const SCORE_STAFF_PADDING_BOTTOM = Math.round(LINE_SPACING * 2.8); // 28
export const SCORE_PART_HEIGHT = SCORE_STAFF_PADDING_TOP + STAFF_HEIGHT + SCORE_STAFF_PADDING_BOTTOM; // 92
export const SCORE_ROW_MARGIN_TOP    = Math.round(LINE_SPACING * 1.6); // 16
export const SCORE_ROW_MARGIN_BOTTOM = Math.round(LINE_SPACING * 0.8); // 8
export const SCORE_DEFAULT_MEASURE_WIDTH = Math.round(LINE_SPACING * 12); // 120
export const SCORE_FIRST_MEASURE_EXTRA   = Math.round(LINE_SPACING * 6);  // 60

/**
 * 악보 전체 레이아웃 계산 — ScoreRenderer와 동일한 로직
 * ScoreCanvas의 터치 → 마디/음높이 역계산에 사용
 */
export function computeScoreLayout(
  doc: ScoreDocument,
  containerWidth: number,
  overrideMeasuresPerLine?: number,
): { rows: ScoreRowLayout[]; totalHeight: number } {
  if (!doc.parts.length) return { rows: [], totalHeight: 100 };

  const partCount = doc.parts.length;
  const measures = doc.parts[0]?.measures ?? [];
  const measureCount = measures.length;

  const minWidths = measures.map((m) => measureMinWidth(m));
  const rowHeight = SCORE_PART_HEIGHT * partCount + SCORE_ROW_MARGIN_BOTTOM;

  const clef = doc.parts[0]?.clef ?? "treble";
  const keySharps = doc.keySignature.sharps;
  // 첫 행 헤더: 음자리표 + 조표 + 박자표 + 여유 공간
  const firstRowHeaderW =
    headerWidth(clef, true, keySharps) + SCORE_FIRST_MEASURE_EXTRA;
  // 이후 행 헤더: 음자리표 + 조표 (박자표는 표준 기보법상 첫 행만 표시)
  const subseqRowHeaderW = headerWidth(clef, false, keySharps);

  // ── 줄당 마디 수 고정 모드 ─────────────────────────────────────
  // overrideMeasuresPerLine이 주어지면 doc.measuresPerLine(내보내기 설정)보다 우선한다.
  // (예: 편집 화면 실시간 표시는 화면 방향에 따라 강제되고, doc.measuresPerLine은 PNG/JPG 내보내기 전용)
  const measuresPerLine = overrideMeasuresPerLine ?? doc.measuresPerLine;
  if (measuresPerLine && measuresPerLine >= 1) {
    const rows: ScoreRowLayout[] = [];
    let y = SCORE_ROW_MARGIN_TOP;
    for (let start = 0; start < measureCount; start += measuresPerLine) {
      const chunk = Array.from(
        { length: Math.min(measuresPerLine, measureCount - start) },
        (_, k) => start + k,
      );
      const isFirstRow = start === 0;
      const rh = isFirstRow ? firstRowHeaderW : subseqRowHeaderW;
      const contentPerMeasure = Math.max(1, (containerWidth - rh) / measuresPerLine);
      rows.push({
        measureIndices: chunk,
        y,
        measureWidths: chunk.map((_, idx) => idx === 0 ? rh + contentPerMeasure : contentPerMeasure),
        rowWidth: containerWidth,
      });
      y += rowHeight;
    }
    return { rows, totalHeight: (rows.length > 0 ? rows[rows.length - 1].y + rowHeight : SCORE_ROW_MARGIN_TOP) + SCORE_ROW_MARGIN_BOTTOM };
  }

  // ── 너비 기반 자동 줄 배치 ─────────────────────────────────────
  // currentRowWidth = 현재 행에 쌓인 폭 (행 헤더 + 마디 합계)
  const rows: ScoreRowLayout[] = [];
  let currentRow: number[] = [];
  let currentRowHeaderW = firstRowHeaderW;
  let currentRowWidth = firstRowHeaderW;
  let y = SCORE_ROW_MARGIN_TOP;

  for (let i = 0; i < measureCount; i++) {
    const mw = Math.max(minWidths[i], SCORE_DEFAULT_MEASURE_WIDTH);

    if (currentRow.length > 0 && currentRowWidth + mw > containerWidth) {
      // 현재 행 완성: 첫 마디에 헤더 폭 추가, 나머지는 균등 분배
      const rh = currentRowHeaderW;
      const availContent = Math.max(1, containerWidth - rh);
      const cpm = availContent / currentRow.length;
      rows.push({
        measureIndices: [...currentRow],
        y,
        measureWidths: currentRow.map((_, idx) => idx === 0 ? rh + cpm : cpm),
        rowWidth: containerWidth,
      });
      y += rowHeight;
      // 다음 행 시작 (이후 행은 음자리표+조표만 표시)
      currentRowHeaderW = subseqRowHeaderW;
      currentRow = [i];
      currentRowWidth = subseqRowHeaderW + mw;
    } else {
      currentRow.push(i);
      currentRowWidth += mw;
    }
  }

  // 마지막 (불완전할 수 있는) 행 처리
  if (currentRow.length > 0) {
    const rh = currentRowHeaderW;
    const availContent = Math.max(1, containerWidth - rh);
    const totalMin = currentRow.reduce(
      (sum, mi) => sum + Math.max(minWidths[mi], SCORE_DEFAULT_MEASURE_WIDTH),
      0,
    );
    const scale = Math.max(1, availContent / totalMin);
    rows.push({
      measureIndices: [...currentRow],
      y,
      measureWidths: currentRow.map((mi, idx) => {
        const w = Math.max(minWidths[mi], SCORE_DEFAULT_MEASURE_WIDTH) * Math.min(scale, 2);
        return idx === 0 ? rh + w : w;
      }),
      rowWidth: containerWidth,
    });
    y += rowHeight;
  }

  return { rows, totalHeight: y + SCORE_ROW_MARGIN_BOTTOM };
}

// ── 내보내기 페이지 나누기 ────────────────────────────────────

/**
 * linesPerPage(몇 줄마다 페이지 나눌지) 설정에 따라 doc을 여러 페이지용 부분 문서로 분할.
 * 각 페이지는 원본 doc과 동일한 메타데이터/설정을 갖되, parts[*].measures만 해당 페이지에
 * 속한 마디 구간으로 잘라낸다. linesPerPage가 없거나 전체 줄 수보다 크면 페이지는 1개(원본 그대로).
 */
export function paginateScoreDoc(
  doc: ScoreDocument,
  containerWidth: number,
  measuresPerLineOverride: number | undefined,
  linesPerPage: number | undefined,
): ScoreDocument[] {
  if (!doc.parts.length) return [doc];
  const { rows } = computeScoreLayout(doc, containerWidth, measuresPerLineOverride);
  if (!linesPerPage || linesPerPage < 1 || rows.length <= linesPerPage) {
    return [doc];
  }

  const pages: ScoreDocument[] = [];
  for (let start = 0; start < rows.length; start += linesPerPage) {
    const end = Math.min(start + linesPerPage, rows.length) - 1;
    const firstMeasureIdx = rows[start].measureIndices[0];
    const lastRow = rows[end];
    const lastMeasureIdx = lastRow.measureIndices[lastRow.measureIndices.length - 1];
    pages.push({
      ...doc,
      parts: doc.parts.map((p) => ({
        ...p,
        measures: p.measures.slice(firstMeasureIdx, lastMeasureIdx + 1),
      })),
    });
  }
  return pages;
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
