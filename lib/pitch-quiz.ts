// ============================================================
// 음감·화음 이스터에그의 문제 생성 규칙
// React/UI와 분리해 같은 랜덤 규칙을 테스트할 수 있게 유지한다.
// ============================================================

export const CHORD_EASTER_EGG_TITLE = "choooooord";
export const SOLFEGE_NAMES = ["도", "도#", "레", "레#", "미", "파", "파#", "솔", "솔#", "라", "라#", "시"] as const;

export type PitchQuizMode = "relative" | "absolute" | "chord";
export type ChordKind = "major" | "minor" | "diminished" | "augmented" | "dominant7";

export const CHORD_DEFINITIONS: Record<ChordKind, { intervals: number[]; labelKey: string }> = {
  major: { intervals: [0, 4, 7], labelKey: "chordMajor" },
  minor: { intervals: [0, 3, 7], labelKey: "chordMinor" },
  diminished: { intervals: [0, 3, 6], labelKey: "chordDiminished" },
  augmented: { intervals: [0, 4, 8], labelKey: "chordAugmented" },
  dominant7: { intervals: [0, 4, 7, 10], labelKey: "chordDominant7" },
};

export interface RelativeQuestion {
  mode: "relative";
  rootMidi: number;
  interval: number;
  notes: [number, number];
}

export interface AbsoluteQuestion {
  mode: "absolute";
  midi: number;
  pitchClass: number;
  notes: [number];
}

export interface ChordQuestion {
  mode: "chord";
  rootMidi: number;
  rootPitchClass: number;
  kind: ChordKind;
  notes: number[];
}

export type PitchQuestion = RelativeQuestion | AbsoluteQuestion | ChordQuestion;

const randomIndex = (length: number, random: () => number) =>
  Math.min(length - 1, Math.max(0, Math.floor(random() * length)));

/** 각 문제는 C3~B3 부근에서 재생하여 지나치게 날카롭거나 낮지 않게 한다. */
export function createPitchQuestion(mode: PitchQuizMode, random = Math.random): PitchQuestion {
  if (mode === "relative") {
    const rootMidi = 48 + randomIndex(12, random);
    const interval = 1 + randomIndex(12, random);
    return { mode, rootMidi, interval, notes: [rootMidi, rootMidi + interval] };
  }

  if (mode === "absolute") {
    const midi = 60 + randomIndex(12, random);
    return { mode, midi, pitchClass: midi % 12, notes: [midi] };
  }

  const rootMidi = 48 + randomIndex(12, random);
  const kinds = Object.keys(CHORD_DEFINITIONS) as ChordKind[];
  const kind = kinds[randomIndex(kinds.length, random)];
  return {
    mode,
    rootMidi,
    rootPitchClass: rootMidi % 12,
    kind,
    notes: CHORD_DEFINITIONS[kind].intervals.map((interval) => rootMidi + interval),
  };
}

export function isChordEasterEggTitle(title: string): boolean {
  return title.trim().toLocaleLowerCase() === CHORD_EASTER_EGG_TITLE;
}

/** 2.5초 이내 탭만 남겨, 오래 전 탭과 섞여 우연히 발동하는 일을 막는다. */
export function appendRapidTap(taps: number[], now: number, windowMs = 2500): number[] {
  return [...taps.filter((time) => now - time <= windowMs), now];
}