// ============================================================
// 잇단음표(튜플렛) 시맨틱 헬퍼 (순수 함수)
// score-layout.ts(렌더링/폭 계산)와 score-playback.ts(재생 타이밍)가
// 공통으로 참조하는 단일 진실 공급원(source of truth).
// ============================================================

import * as Crypto from "expo-crypto";
import type { ScoreMeasure, TupletGroup } from "./score-types";
import { getTupletBeatScale, getTupletNormalCount } from "./score-types";

/** elementId가 속한 튜플렛 그룹을 찾는다 (없으면 undefined). */
export function findTupletForElement(
  measure: ScoreMeasure,
  elementId: string,
): TupletGroup | undefined {
  return measure.tuplets?.find((g) => g.elementIds.includes(elementId));
}

/**
 * elementId의 실제 박자 스케일 계수를 반환한다.
 * 튜플렛에 속하지 않으면 1(스케일 없음)을 반환한다.
 */
export function getElementBeatScale(measure: ScoreMeasure, elementId: string): number {
  const group = findTupletForElement(measure, elementId);
  if (!group) return 1;
  return getTupletBeatScale(group.count, group.normalCount);
}

/**
 * 연속된 elementIds를 count연음 그룹으로 묶는다.
 * 이미 튜플렛에 속한 요소가 있으면 해당 그룹을 제거(치환)한다(중첩 미지원).
 */
export function createTupletGroup(
  measure: ScoreMeasure,
  elementIds: string[],
  count: number,
): ScoreMeasure {
  if (elementIds.length < 2) return measure;
  // 불변식: count는 항상 실제로 묶인 요소 개수와 같아야 한다(N연음은 N개의 음표/쉼표로 구성됨).
  // 호출부에서 다른 값을 전달하더라도 여기서 강제로 맞춰 데이터 무결성을 보장한다.
  const effectiveCount = elementIds.length;
  const idSet = new Set(elementIds);
  const remainingGroups = (measure.tuplets ?? []).filter(
    (g) => !g.elementIds.some((id) => idSet.has(id)),
  );
  const newGroup: TupletGroup = {
    id: Crypto.randomUUID(),
    elementIds: [...elementIds],
    count: effectiveCount,
    normalCount: getTupletNormalCount(effectiveCount),
  };
  return { ...measure, tuplets: [...remainingGroups, newGroup] };
}

/** groupId로 지정된 튜플렛 그룹을 제거한다. */
export function removeTupletGroup(measure: ScoreMeasure, groupId: string): ScoreMeasure {
  if (!measure.tuplets?.length) return measure;
  const next = measure.tuplets.filter((g) => g.id !== groupId);
  if (next.length === measure.tuplets.length) return measure;
  return { ...measure, tuplets: next.length ? next : undefined };
}

/** elementId가 삭제될 때 그 요소가 속한 튜플렛 그룹에서도 제거한다(1개만 남으면 그룹 자체를 해제). */
export function removeElementFromTuplets(measure: ScoreMeasure, elementId: string): ScoreMeasure {
  if (!measure.tuplets?.length) return measure;
  const next: TupletGroup[] = [];
  for (const g of measure.tuplets) {
    if (!g.elementIds.includes(elementId)) {
      next.push(g);
      continue;
    }
    const remainingIds = g.elementIds.filter((id) => id !== elementId);
    if (remainingIds.length >= 2) {
      // 요소가 빠지면 남은 개수에 맞춰 count/normalCount를 재계산한다.
      // (예: 5연음 중 1개 삭제 → 4개가 남으면 4연음이 되어야 하며,
      //  원래의 count=5를 그대로 유지하면 표기·타이밍이 실제 요소 개수와 어긋난다.)
      const newCount = remainingIds.length;
      next.push({
        ...g,
        elementIds: remainingIds,
        count: newCount,
        normalCount: getTupletNormalCount(newCount),
      });
    }
    // 1개 이하로 줄면 튜플렛 그룹 자체를 해제한다.
  }
  return { ...measure, tuplets: next.length ? next : undefined };
}

/**
 * 마디 복사/붙여넣기 시 elementId를 idMap 기준으로 재작성한다.
 * 참조 대상이 복사 범위 밖(idMap에 없음)이면 해당 그룹은 버려진다.
 */
export function remapTupletsWithIdMap(
  tuplets: TupletGroup[] | undefined,
  idMap: Map<string, string>,
): TupletGroup[] | undefined {
  if (!tuplets?.length) return undefined;
  const next: TupletGroup[] = [];
  for (const g of tuplets) {
    const remapped = g.elementIds.map((id) => idMap.get(id));
    if (remapped.some((id) => !id) || remapped.length < 2) continue;
    next.push({ ...g, id: Crypto.randomUUID(), elementIds: remapped as string[] });
  }
  return next.length ? next : undefined;
}
