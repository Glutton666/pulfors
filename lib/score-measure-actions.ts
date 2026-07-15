// ============================================================
// score-measure-actions.ts
//
// ScoreEditorScreen 마디 탭 롱프레스 → Alert 확인 → 삭제 흐름에서
// 추출한 순수 로직. React Native 컴포넌트를 렌더링하지 않고도
// 버튼 구성과 삭제 동작을 단위 테스트할 수 있습니다.
// ============================================================

import * as Crypto from "expo-crypto";
import type { ScoreDocument, ScoreMeasure } from "@/lib/score-types";
import { remapTupletsWithIdMap } from "@/lib/score-tuplet";

/**
 * 특정 파트의 특정 마디부터 적용되는 조표(키시그니처)를 변경합니다.
 * 대상 파트/마디가 없으면 원본 doc을 그대로 반환합니다.
 */
export function setMeasureKeySignature(
  doc: ScoreDocument,
  partIdx: number,
  measureIdx: number,
  sharps: number,
): ScoreDocument {
  const part = doc.parts[partIdx];
  if (!part || !part.measures[measureIdx]) return doc;

  return {
    ...doc,
    parts: doc.parts.map((p, pIdx) => {
      if (pIdx !== partIdx) return p;
      return {
        ...p,
        measures: p.measures.map((m, mIdx) =>
          mIdx !== measureIdx ? m : { ...m, keySignature: { sharps } },
        ),
      };
    }),
  };
}

export interface MeasureAlertButton {
  text: string;
  style?: "default" | "cancel" | "destructive";
  onPress?: () => void;
}

export interface MeasureLongPressLabels {
  editLinkEntry: string;
  clearLink: string;
  delete: string;
  cancel: string;
}

export interface BuildMeasureLongPressButtonsParams {
  measure: ScoreMeasure;
  measureIdx: number;
  labels: MeasureLongPressLabels;
  onEditLinkEntry: (measureIdx: number, measure: ScoreMeasure) => void;
  onClearLink: (measureIdx: number) => void;
  onDelete: (measureIdx: number) => void;
}

/**
 * 마디 탭 롱프레스 시 표시할 Alert 버튼 목록을 구성합니다.
 * 순서: [연결 항목 편집] → (연결된 항목이 있으면 [연결 해제]) → [삭제] → [취소]
 */
export function buildMeasureLongPressButtons(
  params: BuildMeasureLongPressButtonsParams,
): MeasureAlertButton[] {
  const { measure, measureIdx, labels, onEditLinkEntry, onClearLink, onDelete } = params;

  const buttons: MeasureAlertButton[] = [
    {
      text: labels.editLinkEntry,
      onPress: () => onEditLinkEntry(measureIdx, measure),
    },
  ];

  if (measure.linkedPracticeEntryId) {
    buttons.push({
      text: labels.clearLink,
      onPress: () => onClearLink(measureIdx),
    });
  }

  buttons.push(
    { text: labels.delete, style: "destructive", onPress: () => onDelete(measureIdx) },
    { text: labels.cancel, style: "cancel" },
  );

  return buttons;
}

/**
 * 마디를 문서에서 제거합니다 (모든 파트에서 동일 인덱스 제거).
 * 대상 파트가 없거나 마디가 1개뿐이면 원본 doc을 그대로 반환합니다
 * (마지막 남은 마디는 삭제할 수 없음).
 */
export function deleteMeasureFromDoc(
  doc: ScoreDocument,
  partIdx: number,
  measureIdx: number,
): ScoreDocument {
  const part = doc.parts[partIdx];
  if (!part || part.measures.length <= 1) return doc;

  return {
    ...doc,
    parts: doc.parts.map((p) => ({
      ...p,
      measures: p.measures.filter((_, i) => i !== measureIdx),
    })),
  };
}

// ============================================================
// 마디 복사 / 이동(잘라내기) / 붙여넣기
//
// ScorePart.measures는 파트 간 인덱스로 정렬되어 있다(같은 마디=같은 인덱스,
// deleteMeasureFromDoc과 동일한 전제). 따라서 마디 하나를 복사/이동한다는 것은
// 그 인덱스의 "마디 전체(모든 파트의 해당 칸)"를 복사/이동하는 것을 의미한다.
// 다른 파트/악보로의 복사(서로 다른 인덱스 간 매핑)는 out of scope.
// ============================================================

export interface MeasureClipboardPartEntry {
  measure: ScoreMeasure;
  /** doc.layoutOverrides[measure.id] 스냅샷 (elementId -> x) */
  overrides?: Record<string, number>;
}

/** 마디 하나(모든 파트에 걸친 한 "칸")를 나타내는 클립보드 항목 */
export interface MeasureClipboardEntry {
  perPart: MeasureClipboardPartEntry[];
}

/**
 * 선택된 마디 인덱스들을 클립보드 형태로 깊은 복사합니다.
 * 인덱스는 오름차순으로 정렬되어(원래 순서 유지) 반환됩니다.
 * 일부 파트에 해당 인덱스 마디가 없으면(비정상 상태) 그 인덱스는 건너뜁니다.
 */
export function copyMeasuresFromDoc(
  doc: ScoreDocument,
  indices: number[],
): MeasureClipboardEntry[] {
  const sorted = [...new Set(indices)].sort((a, b) => a - b);
  const entries: MeasureClipboardEntry[] = [];

  for (const idx of sorted) {
    const perPart: MeasureClipboardPartEntry[] = [];
    let valid = true;
    for (const part of doc.parts) {
      const m = part.measures[idx];
      if (!m) {
        valid = false;
        break;
      }
      const ov = doc.layoutOverrides?.[m.id];
      perPart.push({ measure: m, overrides: ov ? { ...ov } : undefined });
    }
    if (valid) entries.push({ perPart });
  }

  return entries;
}

/**
 * 선택된 마디 인덱스들을 문서에서 제거하면서 클립보드로 반환합니다(이동/잘라내기).
 * 남는 마디가 0개가 되면(전체 마디 삭제 시도) null을 반환해 아무 것도 하지 않습니다
 * (deleteMeasureFromDoc과 동일한 "마지막 마디는 남겨야 함" 정책).
 */
export function cutMeasuresFromDoc(
  doc: ScoreDocument,
  indices: number[],
): { doc: ScoreDocument; clip: MeasureClipboardEntry[] } | null {
  const sorted = [...new Set(indices)].sort((a, b) => a - b);
  if (sorted.length === 0) return null;

  const maxLen = Math.max(0, ...doc.parts.map((p) => p.measures.length));
  if (sorted.length >= maxLen) return null;

  const clip = copyMeasuresFromDoc(doc, sorted);
  if (clip.length === 0) return null;

  const idxSet = new Set(sorted);
  const removedIds = new Set<string>();
  doc.parts.forEach((p) => {
    sorted.forEach((idx) => {
      const m = p.measures[idx];
      if (m) removedIds.add(m.id);
    });
  });

  let nextOverrides = doc.layoutOverrides;
  if (nextOverrides) {
    const filtered: NonNullable<ScoreDocument["layoutOverrides"]> = {};
    for (const [key, val] of Object.entries(nextOverrides)) {
      if (!removedIds.has(key)) filtered[key] = val;
    }
    nextOverrides = filtered;
  }

  const newDoc: ScoreDocument = {
    ...doc,
    parts: doc.parts.map((p) => ({
      ...p,
      measures: p.measures.filter((_, i) => !idxSet.has(i)),
    })),
    layoutOverrides: nextOverrides,
  };

  return { doc: newDoc, clip };
}

/**
 * 클립보드 내용을 targetIdx 마디 "뒤"에 삽입합니다(모든 파트에 동시 적용).
 * 각 마디/엘리먼트에는 새 id를 발급하며, 같은 마디 내부의 슬러/크레셴도 참조(id)는
 * 새 id로 remap합니다(참조 대상이 복사 범위 밖이면 원본 값을 그대로 둡니다).
 * layoutOverrides도 새 id 기준으로 재작성해 병합합니다.
 */
export function pasteMeasuresIntoDoc(
  doc: ScoreDocument,
  targetIdx: number,
  clip: MeasureClipboardEntry[],
): ScoreDocument {
  if (clip.length === 0) return doc;

  const partCount = doc.parts.length;
  const newMeasuresByPart: ScoreMeasure[][] = doc.parts.map(() => []);
  let nextOverrides = doc.layoutOverrides;

  const crescKeys = [
    "crescNoteStartId",
    "crescNoteEndId",
    "decrescNoteStartId",
    "decrescNoteEndId",
  ] as const;

  clip.forEach((entry) => {
    entry.perPart.forEach((partEntry, partIdx) => {
      if (partIdx >= partCount) return;

      const newMeasureId = Crypto.randomUUID();
      const idMap = new Map<string, string>();
      const newElements = partEntry.measure.elements.map((el) => {
        const newId = Crypto.randomUUID();
        idMap.set(el.id, newId);
        return { ...el, id: newId };
      });
      const remappedElements = newElements.map((el) =>
        el.type === "note" && el.slurEndNoteId && idMap.has(el.slurEndNoteId)
          ? { ...el, slurEndNoteId: idMap.get(el.slurEndNoteId) }
          : el,
      );

      const crescPatch: Partial<ScoreMeasure> = {};
      for (const key of crescKeys) {
        const origId = partEntry.measure[key];
        if (origId && idMap.has(origId)) {
          crescPatch[key] = idMap.get(origId);
        }
      }

      const newMeasure: ScoreMeasure = {
        ...partEntry.measure,
        ...crescPatch,
        id: newMeasureId,
        elements: remappedElements,
        tuplets: remapTupletsWithIdMap(partEntry.measure.tuplets, idMap),
      };
      newMeasuresByPart[partIdx].push(newMeasure);

      if (partEntry.overrides) {
        const newOv: Record<string, number> = {};
        for (const [oldElId, x] of Object.entries(partEntry.overrides)) {
          const newElId = idMap.get(oldElId);
          if (newElId) newOv[newElId] = x;
        }
        if (Object.keys(newOv).length > 0) {
          nextOverrides = { ...nextOverrides, [newMeasureId]: newOv };
        }
      }
    });
  });

  return {
    ...doc,
    parts: doc.parts.map((p, pIdx) => {
      const next = [...p.measures];
      next.splice(targetIdx + 1, 0, ...newMeasuresByPart[pIdx]);
      return { ...p, measures: next };
    }),
    layoutOverrides: nextOverrides,
  };
}
