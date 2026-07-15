// ============================================================
// 악보 AsyncStorage CRUD
// ============================================================

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import type { ScoreDocument, ScoreListItem, ScorePart, ScoreMeasure } from "./score-types";
import { INSTRUMENTS, migrateLegacyLayoutOverrides } from "./score-types";

const SCORES_INDEX_KEY = "metronome_scores_v1";
const SCORE_PREFIX = "metronome_score_";

function scoreKey(id: string): string {
  return `${SCORE_PREFIX}${id}`;
}

// 빈 마디 생성
export function createEmptyMeasure(): ScoreMeasure {
  return {
    id: Crypto.randomUUID(),
    elements: [],
  };
}

// 빈 파트 생성
export function createEmptyPart(instrumentId: string): ScorePart {
  const inst = INSTRUMENTS[instrumentId] ?? INSTRUMENTS["custom"];
  return {
    id: Crypto.randomUUID(),
    instrumentId,
    clef: inst.defaultClef,
    measures: [createEmptyMeasure(), createEmptyMeasure(), createEmptyMeasure(), createEmptyMeasure()],
  };
}

// 새 악보 생성
export function createScoreDocument(options: {
  title?: string;
  parts: Array<{ instrumentId: string }>;
  timeSignature?: { numerator: number; denominator: number };
  bpm?: number;
  keySharps?: number;
}): ScoreDocument {
  const now = Date.now();
  const id = Crypto.randomUUID();
  return {
    id,
    metadata: {
      title: options.title ?? "",
      createdAt: now,
      updatedAt: now,
    },
    parts: options.parts.map((p) => createEmptyPart(p.instrumentId)),
    keySignature: { sharps: options.keySharps ?? 0 },
    timeSignature: options.timeSignature ?? { numerator: 4, denominator: 4 },
    bpm: options.bpm ?? 120,
    measuresPerLine: 4,
    playbackSettings: {
      showPlayhead: true,
      showZoomView: true,
    },
  };
}

// 목록 인덱스 로드
async function loadIndex(): Promise<string[]> {
  try {
    const data = await AsyncStorage.getItem(SCORES_INDEX_KEY);
    if (data) {
      const parsed: unknown = JSON.parse(data);
      if (Array.isArray(parsed)) return parsed.filter((v) => typeof v === "string");
    }
  } catch {}
  return [];
}

// 목록 인덱스 저장
async function saveIndex(ids: string[]): Promise<void> {
  await AsyncStorage.setItem(SCORES_INDEX_KEY, JSON.stringify(ids));
}

// 악보 저장 (신규/수정)
export async function saveScore(doc: ScoreDocument): Promise<void> {
  const updated: ScoreDocument = {
    ...doc,
    metadata: { ...doc.metadata, updatedAt: Date.now() },
  };
  await AsyncStorage.setItem(scoreKey(doc.id), JSON.stringify(updated));

  // 인덱스에 추가
  const index = await loadIndex();
  if (!index.includes(doc.id)) {
    index.unshift(doc.id);
    await saveIndex(index);
  }
}

// 악보 불러오기
export async function loadScore(id: string): Promise<ScoreDocument | null> {
  try {
    const data = await AsyncStorage.getItem(scoreKey(id));
    if (data) return migrateLegacyLayoutOverrides(JSON.parse(data) as ScoreDocument);
  } catch {}
  return null;
}

// 악보 삭제
export async function deleteScore(id: string): Promise<void> {
  await AsyncStorage.removeItem(scoreKey(id));
  const index = await loadIndex();
  const newIndex = index.filter((i) => i !== id);
  await saveIndex(newIndex);
}

// 악보 목록 로드 (경량 정보만)
export async function loadScoreList(): Promise<ScoreListItem[]> {
  const index = await loadIndex();
  const items: ScoreListItem[] = [];
  for (const id of index) {
    try {
      const data = await AsyncStorage.getItem(scoreKey(id));
      if (data) {
        const doc = JSON.parse(data) as ScoreDocument;
        items.push({
          id: doc.id,
          title: doc.metadata.title || "Untitled",
          partCount: doc.parts.length,
          measureCount: doc.parts[0]?.measures.length ?? 0,
          bpm: doc.bpm,
          timeSignature: doc.timeSignature,
          updatedAt: doc.metadata.updatedAt,
        });
      }
    } catch {}
  }
  return items;
}

// 악보 복제
export async function duplicateScore(id: string): Promise<ScoreDocument | null> {
  const original = await loadScore(id);
  if (!original) return null;
  const newId = Crypto.randomUUID();
  const now = Date.now();
  const copy: ScoreDocument = {
    ...original,
    id: newId,
    metadata: {
      ...original.metadata,
      title: `${original.metadata.title} (copy)`,
      createdAt: now,
      updatedAt: now,
    },
  };
  await saveScore(copy);
  return copy;
}
