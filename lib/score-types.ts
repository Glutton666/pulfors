// ============================================================
// 악보 모드 타입 정의
// ============================================================

export type ClefType = "treble" | "bass" | "alto" | "tenor" | "percussion";

export type NoteDuration =
  | "whole"
  | "half"
  | "quarter"
  | "eighth"
  | "sixteenth"
  | "thirty_second"
  | "whole_dot"
  | "half_dot"
  | "quarter_dot"
  | "eighth_dot"
  | "sixteenth_dot"
  | "thirty_second_dot";

export type RestDuration = NoteDuration;

export type Accidental = "sharp" | "flat" | "natural" | "double_sharp" | "double_flat";

export type Dynamic = "pppp" | "ppp" | "pp" | "p" | "mp" | "mf" | "f" | "ff" | "fff" | "ffff" | "sfz" | "fp" | "mute";

export type ArticulationType =
  | "staccato"
  | "tenuto"
  | "accent"
  | "marcato"
  | "fermata"
  | "staccatissimo"
  | "portato"
  | "snap_pizzicato"
  | "left_hand_pizzicato";

export type OrnamentType =
  | "trill"
  | "mordent"
  | "turn"
  | "tremolo"
  | "grace_note"
  | "glissando"
  | "arpeggio_up"
  | "arpeggio_down";

export type NoteHeadType = "normal" | "cross" | "diamond" | "triangle" | "slash";

// ── 드럼(타악기) 종류 ────────────────────────────────────────────
// 표준 드럼 표기법을 단순화한 매핑: 킥/스네어/하이햇(오픈·클로즈드)/크래시/라이드/탐탐(하이·미드·로우)
export type DrumType =
  | "crash"
  | "ride"
  | "hihat_open"
  | "hihat_closed"
  | "tom_high"
  | "tom_mid"
  | "snare"
  | "tom_low"
  | "kick";

export interface DrumMapEntry {
  /**
   * 오선 위치 — 맨 위 선(0)을 기준으로 한 half-line-step 개수(1 step = LINE_SPACING/2 px).
   * 음수 = 오선 위 스페이스(덧줄 필요), 8 = 맨 아래 선.
   */
  staffStep: number;
  noteHead: NoteHeadType;
  labelKey: string;
}

// 표준 드럼 표기법에 기반한 단순화된 오선 위치 매핑 (위→아래로 음높이가 높은 악기부터 배치)
export const DRUM_MAP: Record<DrumType, DrumMapEntry> = {
  crash:        { staffStep: -2, noteHead: "cross",    labelKey: "drumCrash" },
  ride:         { staffStep: -1, noteHead: "cross",    labelKey: "drumRide" },
  hihat_open:   { staffStep: 0,  noteHead: "triangle", labelKey: "drumHihatOpen" },
  hihat_closed: { staffStep: 0,  noteHead: "cross",    labelKey: "drumHihatClosed" },
  tom_high:     { staffStep: 1,  noteHead: "normal",   labelKey: "drumTomHigh" },
  tom_mid:      { staffStep: 3,  noteHead: "normal",   labelKey: "drumTomMid" },
  snare:        { staffStep: 4,  noteHead: "normal",   labelKey: "drumSnare" },
  tom_low:      { staffStep: 6,  noteHead: "normal",   labelKey: "drumTomLow" },
  kick:         { staffStep: 8,  noteHead: "normal",   labelKey: "drumKick" },
};

export const DRUM_TYPES: DrumType[] = [
  "crash", "ride", "hihat_open", "hihat_closed",
  "tom_high", "tom_mid", "snare", "tom_low", "kick",
];

// 악기 카테고리
export type InstrumentCategory =
  | "strings"
  | "woodwind"
  | "brass"
  | "percussion"
  | "keyboard"
  | "vocal"
  | "guitar"
  | "other";

export interface InstrumentDef {
  id: string;
  category: InstrumentCategory;
  defaultClef: ClefType;
  transposeSemitones?: number; // 이조 악기 (예: Bb 트럼펫 = -2)
}

export const INSTRUMENTS: Record<string, InstrumentDef> = {
  // 현악기
  violin:       { id: "violin",       category: "strings",   defaultClef: "treble" },
  viola:        { id: "viola",        category: "strings",   defaultClef: "alto" },
  cello:        { id: "cello",        category: "strings",   defaultClef: "bass" },
  bass:         { id: "bass",         category: "strings",   defaultClef: "bass" },
  // 목관악기
  flute:        { id: "flute",        category: "woodwind",  defaultClef: "treble" },
  oboe:         { id: "oboe",         category: "woodwind",  defaultClef: "treble" },
  clarinet:     { id: "clarinet",     category: "woodwind",  defaultClef: "treble", transposeSemitones: -2 },
  bassoon:      { id: "bassoon",      category: "woodwind",  defaultClef: "bass" },
  saxophone:    { id: "saxophone",    category: "woodwind",  defaultClef: "treble", transposeSemitones: -2 },
  // 금관악기
  trumpet:      { id: "trumpet",      category: "brass",     defaultClef: "treble", transposeSemitones: -2 },
  horn:         { id: "horn",         category: "brass",     defaultClef: "treble", transposeSemitones: -7 },
  trombone:     { id: "trombone",     category: "brass",     defaultClef: "bass" },
  tuba:         { id: "tuba",         category: "brass",     defaultClef: "bass" },
  // 타악기
  drums:        { id: "drums",        category: "percussion", defaultClef: "percussion" },
  timpani:      { id: "timpani",      category: "percussion", defaultClef: "bass" },
  marimba:      { id: "marimba",      category: "percussion", defaultClef: "treble" },
  // 건반
  piano:        { id: "piano",        category: "keyboard",  defaultClef: "treble" },
  organ:        { id: "organ",        category: "keyboard",  defaultClef: "treble" },
  harpsichord:  { id: "harpsichord",  category: "keyboard",  defaultClef: "treble" },
  // 성악
  soprano:      { id: "soprano",      category: "vocal",     defaultClef: "treble" },
  mezzosoprano: { id: "mezzosoprano", category: "vocal",     defaultClef: "treble" },
  alto:         { id: "alto",         category: "vocal",     defaultClef: "treble" },
  tenor:        { id: "tenor",        category: "vocal",     defaultClef: "treble" },
  baritone:     { id: "baritone",     category: "vocal",     defaultClef: "bass" },
  bass_voice:   { id: "bass_voice",   category: "vocal",     defaultClef: "bass" },
  // 기타
  guitar:       { id: "guitar",       category: "guitar",    defaultClef: "treble", transposeSemitones: -12 },
  custom:       { id: "custom",       category: "other",     defaultClef: "treble" },
};

// 조표 정의 (샤프/플랫 개수, 양수=샤프, 음수=플랫)
export interface KeySignature {
  sharps: number; // -7 ~ 7, 양수=샤프, 음수=플랫
}

export const KEY_SIGNATURES: KeySignature[] = [
  { sharps: -7 }, { sharps: -6 }, { sharps: -5 }, { sharps: -4 },
  { sharps: -3 }, { sharps: -2 }, { sharps: -1 }, { sharps: 0 },
  { sharps: 1 }, { sharps: 2 }, { sharps: 3 }, { sharps: 4 },
  { sharps: 5 }, { sharps: 6 }, { sharps: 7 },
];

// 조표 sharps 값 -> 장조 이름 (샤프/플랫 개수별 표기)
const MAJOR_KEY_NAMES: Record<number, string> = {
  [-7]: "C♭", [-6]: "G♭", [-5]: "D♭", [-4]: "A♭",
  [-3]: "E♭", [-2]: "B♭", [-1]: "F",
  [0]: "C",
  [1]: "G", [2]: "D", [3]: "A", [4]: "E",
  [5]: "B", [6]: "F♯", [7]: "C♯",
};

/** 조표 sharps 값을 표시용 라벨로 변환. 예: 0 -> "C", 2 -> "D (2♯)", -3 -> "E♭ (3♭)" */
export function getKeySignatureLabel(sharps: number): string {
  const name = MAJOR_KEY_NAMES[sharps] ?? "C";
  if (sharps === 0) return name;
  const count = Math.abs(sharps);
  const symbol = sharps > 0 ? "♯" : "♭";
  return `${name} (${count}${symbol})`;
}

// 음높이 (C4 = 중간 C, MIDI note 60)
export interface Pitch {
  step: "C" | "D" | "E" | "F" | "G" | "A" | "B";
  octave: number; // 0-8
  accidental?: Accidental;
}

// 음표
export interface ScoreNote {
  id: string;
  type: "note";
  pitch: Pitch;
  duration: NoteDuration;
  dotted?: boolean;
  doubleDotted?: boolean;
  tieStart?: boolean;
  tieEnd?: boolean;
  slurStart?: boolean;
  slurEnd?: boolean;
  slurEndNoteId?: string;
  articulations?: ArticulationType[];
  dynamic?: Dynamic;
  noteHead?: NoteHeadType;
  /** 타악기(percussion) 파트에서 이 음표가 나타내는 드럼 종류. 설정 시 pitch는 무시되고
   *  표준 오선 위치·음표머리·재생 사운드가 모두 drumType에서 파생됩니다. */
  drumType?: DrumType;
  ornament?: OrnamentType;
  lyric?: string; // 성악 가사
  // 현악기 특수
  bowUp?: boolean;    // 활 방향 위
  bowDown?: boolean;  // 활 방향 아래
  harmonic?: boolean; // 하모닉스
  pizzicato?: boolean;
  arco?: boolean;
  // 건반 특수
  pedal?: boolean;     // 페달 시작
  pedalEnd?: boolean;  // 페달 끝
  ottava?: 1 | 2 | -1 | -2; // 8va(1), 15ma(2), 8vb(-1), 15mb(-2)
  arpeggio?: boolean;
}

// 쉼표
export interface ScoreRest {
  id: string;
  type: "rest";
  duration: RestDuration;
  dotted?: boolean;
}

/**
 * 자유 배치 레이아웃 오버라이드 — 음악 데이터(ScoreNote/ScoreRest)와 분리된 화면 배치 정보.
 * measureId → (elementId → X 좌표). X는 마디 content 영역 시작 기준, 사용자가 터치한
 * 음표 "중심(center)" 좌표(논리 px)를 의미한다. 오버라이드가 없는 요소는 순차 레이아웃으로
 * fallback 배치된다.
 */
export type ScoreLayoutOverrides = Record<string, Record<string, number>>;

export type ScoreElement = ScoreNote | ScoreRest;

/**
 * 잇단음표(튜플렛) 그룹 — 마디 내부 로컬 개념. 음표/쉼표 묶음(elementIds)을
 * count개를 normalCount박자(개) 시간 안에 채워 연주하도록 지정한다.
 * 예: count=3, normalCount=2 → 3연음(triplet, 3:2). 중첩 튜플렛은 지원하지 않는다(out of scope).
 * 이 비율 정보는 시맨틱 모델에만 저장되며, 레이아웃/렌더러/재생 로직은 이 값을 읽기만 한다.
 */
export interface TupletGroup {
  id: string;
  /** 그룹에 속한 음표/쉼표 elementId 목록 (마디 내 순서대로, 연속되어야 함) */
  elementIds: string[];
  /** 실제로 연주되는 음표 개수 (N연음) */
  count: number;
  /** count개가 채워야 할 "정상" 박자 개수 — 표준 표기 관례에 따라 자동 계산됨 */
  normalCount: number;
}

/**
 * 잇단음표 개수(N)에 대해 표준 표기 관례에 따른 normalCount를 계산한다.
 * 규칙: N보다 작은 2의 거듭제곱 중 가장 큰 값을 사용한다.
 * 예: 3→2(3:2, 셋잇단음표), 5→4(5:4, 다섯잇단음표), 6→4(6:4), 7→4(7:4, 일곱잇단음표), 9→8.
 * 사용자가 임의 비율을 직접 지정하는 것은 out of scope — 이 자동 규칙만 지원한다.
 */
export function getTupletNormalCount(count: number): number {
  if (count < 2) return Math.max(1, count);
  let p = 1;
  while (p * 2 < count) p *= 2;
  return p;
}

/** count/normalCount로부터 음표 하나가 실제로 차지하는 박자 스케일 계수를 계산한다. */
export function getTupletBeatScale(count: number, normalCount: number): number {
  if (count <= 0) return 1;
  return normalCount / count;
}

/**
 * 레거시 마이그레이션: 예전 버전에서 ScoreNote/ScoreRest에 직접 저장되던
 * `placedX` 필드를 새로운 `ScoreDocument.layoutOverrides`로 이동시킨다.
 * 이미 마이그레이션된(또는 애초에 placedX가 없는) 문서는 원본을 그대로 반환한다.
 * 저장(loadScore)·가져오기(parsePulforsJson) 등 외부/영속 데이터를 읽는 모든
 * 경로에서 호출되어야 한다.
 */
export function migrateLegacyLayoutOverrides(doc: ScoreDocument): ScoreDocument {
  let overrides: ScoreLayoutOverrides | undefined = doc.layoutOverrides;
  let changed = false;

  const parts = doc.parts.map((part) => {
    const measures = part.measures.map((measure) => {
      const elements = measure.elements.map((el) => {
        const legacyX = (el as ScoreElement & { placedX?: number }).placedX;
        if (typeof legacyX !== "number") return el;
        changed = true;
        overrides = {
          ...overrides,
          [measure.id]: { ...overrides?.[measure.id], [el.id]: legacyX },
        };
        const { placedX: _placedX, ...rest } = el as ScoreElement & { placedX?: number };
        return rest as ScoreElement;
      });
      return elements === measure.elements ? measure : { ...measure, elements };
    });
    return measures === part.measures ? part : { ...part, measures };
  });

  if (!changed) return doc;
  return { ...doc, parts, layoutOverrides: overrides };
}

// 반복/이동 부호
export type RepeatSign =
  | "repeat_start"     // ||:
  | "repeat_end"       // :||
  | "repeat_both"      // :||:
  | "segno"            // 𝄋
  | "coda"             // 𝄌
  | "da_capo"          // D.C.
  | "dal_segno"        // D.S.
  | "dal_segno_coda"   // D.S. al Coda
  | "da_capo_coda"     // D.C. al Coda
  | "fine";            // Fine

export type TempoChangeType = "fixed" | "rit" | "accel";

// 마디
export interface ScoreMeasure {
  id: string;
  elements: ScoreElement[];

  // 이 마디부터 변경되는 메타 (없으면 이전 값 유지)
  timeSignature?: { numerator: number; denominator: number };
  bpm?: number;
  tempoText?: string;           // "Allegro", "Andante", "rit.", "accel."
  tempoChangeType?: TempoChangeType;
  tempoEndBpm?: number;         // rit./accel. 목표 BPM

  // 강약
  dynamic?: Dynamic;
  crescStart?: boolean;
  crescEnd?: boolean;
  decrescStart?: boolean;
  decrescEnd?: boolean;
  // 헤어핀 노트 앵커 — 두 노트 사이 정밀 위치 지정
  crescNoteStartId?: string;
  crescNoteEndId?: string;
  decrescNoteStartId?: string;
  decrescNoteEndId?: string;

  // 반복/이동 부호
  repeatStart?: boolean;
  repeatEnd?: boolean;
  voltaBracket?: number;        // 1, 2, 3... (N번 괄호)
  voltaBracketEnd?: boolean;
  segno?: boolean;
  coda?: boolean;
  jumpTo?: "start" | "segno" | "coda" | "fine";
  jumpText?: string;            // "D.C.", "D.S.", "Fine" 등

  // 이 마디부터 음자리표/조표 변경 (없으면 파트/문서 기본값 유지)
  clef?: ClefType;
  keySignature?: { sharps: number };

  // 악보 위쪽 텍스트
  rehearsalMark?: string;       // "A", "B", "1" 등 리허설 마크

  // 연결된 연주 항목 ID (연주 노트·Practice Entry 연동)
  linkedPracticeEntryId?: string;

  /** 이 마디 내 잇단음표(튜플렛) 그룹 목록. 중첩 그룹은 지원하지 않는다. */
  tuplets?: TupletGroup[];
}

// 성부(파트)
export interface ScorePart {
  id: string;
  instrumentId: string;        // INSTRUMENTS 키
  name?: string;               // 커스텀 이름
  clef: ClefType;
  measures: ScoreMeasure[];
  // 악기별 특수 기호 활성화 상태
  enabledSymbols?: Record<string, boolean>;
}

// 악보 메타데이터
export interface ScoreMetadata {
  title: string;
  subtitle?: string;
  composer?: string;
  arranger?: string;
  lyricist?: string;
  copyright?: string;
  difficulty?: "beginner" | "intermediate" | "advanced" | "expert";
  memo?: string;
  createdAt: number;
  updatedAt: number;
}

// 악보 문서
export interface ScoreDocument {
  id: string;
  metadata: ScoreMetadata;
  parts: ScorePart[];
  keySignature: KeySignature;
  timeSignature: { numerator: number; denominator: number };
  bpm: number;
  // 재생 설정
  playbackSettings?: {
    showPlayhead?: boolean;
    showZoomView?: boolean;
    /** true이면 악보 재생 시 음표 소리를 끔 */
    muteAudio?: boolean;
    /** false이면 음표 입력 시 즉시 미리 듣기 소리를 끔 (기본값: true) */
    notePreview?: boolean;
  };
  // 참조 이미지 (편집 불가, 투명도 조절 가능)
  referenceImageUri?: string;
  referenceImageOpacity?: number;
  /** 한 줄에 표시할 마디 수. undefined이면 컨테이너 너비 기반 자동 배치 */
  measuresPerLine?: number;
  /** 내보내기 시 몇 줄마다 페이지를 나눌지. undefined/0이면 페이지 나누기 없이 한 장으로 내보냄 */
  linesPerPage?: number;
  /** 자유 배치된 음표/쉼표의 화면 X 좌표 오버라이드 (measureId → elementId → x). 음악 데이터와 분리된 순수 레이아웃 정보. */
  layoutOverrides?: ScoreLayoutOverrides;
}

// 악보 목록 아이템 (썸네일용 경량 정보)
export interface ScoreListItem {
  id: string;
  title: string;
  partCount: number;
  measureCount: number;
  bpm: number;
  timeSignature: { numerator: number; denominator: number };
  updatedAt: number;
}
