/**
 * PolygonTypes.ts — 폴리곤 메트로놈 타입 정의
 */

export interface PolygonLayer {
  /** 레이어 고유 ID */
  id: string;
  /** 변(꼭짓점) 수: 1 = 원(펄스), 2-16 = 다각형 */
  sides: number;
  /** 레이어 색상 (hex) */
  color: string;
  /** 사운드셋 키 (soundSets의 키) */
  soundSet: string;
  /** 사운드 역할 */
  role: "high" | "low" | "strong";
  /**
   * 꼭짓점별 타이밍 오프셋 비율 (0.0 ~ 0.5).
   * 배열 길이 = sides. 0 = 오프셋 없음, 0.5 = 다음 비트까지 절반 지연 (스윙).
   */
  offsets: number[];
}

/** 레이어를 마트료시카 배치 기준으로 정렬: 변 많은 것 → 바깥(큰 반지름) */
export function sortLayersForDisplay(layers: PolygonLayer[]): PolygonLayer[] {
  return [...layers].sort((a, b) => b.sides - a.sides);
}

/**
 * 정렬된 레이어 배열에서 각 레이어의 반지름 비율(0~1)을 계산한다.
 * 같은 변 수의 레이어는 살짝 크기 차이를 준다.
 */
export function computeLayerRadii(sortedLayers: PolygonLayer[], maxRadius: number): number[] {
  const n = sortedLayers.length;
  if (n === 0) return [];
  if (n === 1) return [maxRadius * 0.72];

  // 바깥부터 안쪽까지 균등 분할
  const step = maxRadius * 0.62 / n;
  const base = maxRadius * 0.72;

  // 같은 변 수 그룹 내 인덱스를 추적해 미세 오프셋 적용
  const groupCount: Record<number, number> = {};
  return sortedLayers.map((layer, i) => {
    const raw = base - step * i;
    const g = groupCount[layer.sides] ?? 0;
    groupCount[layer.sides] = g + 1;
    // 같은 변 수면 작은 델타 추가 (첫 번째 레이어는 +4, 두 번째는 -4 등)
    const delta = g === 0 ? 0 : (g % 2 === 0 ? 6 * Math.ceil(g / 2) : -6 * Math.ceil(g / 2));
    return Math.max(20, raw + delta);
  });
}

/** 정 N각형의 꼭짓점 좌표 계산 (중심 cx, cy, 반지름 r, 시작 각도 -90°) */
export function polygonVertices(
  cx: number, cy: number, r: number, sides: number,
): Array<{ x: number; y: number }> {
  if (sides <= 1) return [{ x: cx, y: cy - r }]; // 원/펄스
  return Array.from({ length: sides }, (_, i) => {
    const angle = (2 * Math.PI * i) / sides - Math.PI / 2;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  });
}

/** 기본 레이어 색상 팔레트 */
export const LAYER_COLORS = [
  "#FF6B6B", "#4ECDC4", "#FFD93D", "#6BCB77", "#4D96FF",
  "#C77DFF", "#FF9F1C", "#00C9A7", "#FF4D6D", "#A8DADC",
];

export const DEFAULT_POLYGON_LAYER: Omit<PolygonLayer, "id" | "color"> = {
  sides: 4,
  soundSet: "classic",
  role: "high",
  offsets: [],
};
