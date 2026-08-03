// ============================================================
// ScoreEditorTypes — 共有型・純粋ヘルパー
// ============================================================

import * as Crypto from "expo-crypto";
import type {
  ScoreDocument,
  ScoreNote,
  ScoreRest,
  NoteDuration,
  Pitch,
  Accidental,
  ArticulationType,
  Dynamic,
  OrnamentType,
  NoteHeadType,
  DrumType,
  ScoreLayoutOverrides,
} from "@/lib/score-types";

export const MAX_HISTORY = 50;

export function makeNote(
  pitch: Pitch,
  duration: NoteDuration,
  accidental?: Accidental | null,
  articulations?: ArticulationType[],
  dynamic?: Dynamic,
  ornament?: OrnamentType | null,
  doubleDotted?: boolean,
  noteHead?: NoteHeadType | null,
  drumType?: DrumType,
): ScoreNote {
  const finalPitch: Pitch = accidental
    ? { ...pitch, accidental }
    : pitch;
  return {
    id: Crypto.randomUUID(),
    type: "note",
    pitch: finalPitch,
    duration,
    doubleDotted: doubleDotted || undefined,
    articulations: articulations?.length ? articulations : undefined,
    dynamic: dynamic ?? undefined,
    ornament: ornament ?? undefined,
    noteHead: noteHead ?? undefined,
    drumType: drumType ?? undefined,
  };
}

export function makeRest(duration: NoteDuration): ScoreRest {
  return {
    id: Crypto.randomUUID(),
    type: "rest",
    duration,
  };
}

/** elementId → x 항목을 추가한 새 오버라이드 객체를 반환 */
export function withLayoutOverride(
  overrides: ScoreLayoutOverrides | undefined,
  measureId: string,
  elementId: string,
  x: number,
): ScoreLayoutOverrides {
  return {
    ...overrides,
    [measureId]: { ...overrides?.[measureId], [elementId]: x },
  };
}

/** elementId 항목을 제거한 새 오버라이드 객체를 반환 */
export function withoutLayoutOverride(
  overrides: ScoreLayoutOverrides | undefined,
  measureId: string,
  elementId: string,
): ScoreLayoutOverrides | undefined {
  if (overrides?.[measureId]?.[elementId] === undefined) return overrides;
  const { [elementId]: _removed, ...restForMeasure } = overrides[measureId];
  return { ...overrides, [measureId]: restForMeasure };
}
