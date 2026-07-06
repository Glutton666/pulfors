// ============================================================
// score-measure-actions.ts
//
// ScoreEditorScreen 마디 탭 롱프레스 → Alert 확인 → 삭제 흐름에서
// 추출한 순수 로직. React Native 컴포넌트를 렌더링하지 않고도
// 버튼 구성과 삭제 동작을 단위 테스트할 수 있습니다.
// ============================================================

import type { ScoreDocument, ScoreMeasure } from "@/lib/score-types";

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
