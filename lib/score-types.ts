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
