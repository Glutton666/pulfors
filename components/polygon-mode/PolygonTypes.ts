/**
 * PolygonTypes.ts — 폴리곤 메트로놈 타입 정의
 */

/** 꼭짓점 강세 종류. S=Strong, A=Accent, N=Normal, M=Mute */
export type VertexBeatType = "strong" | "accent" | "normal" | "mute";

const BEAT_TYPE_CYCLE: VertexBeatType[] = ["strong", "accent", "normal", "mute"];

/** 탭할 때마다 S→A→N→M→S로 순환 */
export function cycleVertexBeatType(current: VertexBeatType): VertexBeatType {
  const idx = BEAT_TYPE_CYCLE.indexOf(current);
  return BEAT_TYPE_CYCLE[(idx + 1) % BEAT_TYPE_CYCLE.length];
}

/**
 * 꼭짓점의 실제 강세를 반환한다.
 * beatTypes 배열이 없거나 짧으면 layer.role로 fallback한다.
 */
export function getVertexBeatType(layer: PolygonLayer, vertexIdx: number): VertexBeatType {
  if (layer.beatTypes && layer.beatTypes[vertexIdx] !== undefined) {
    return layer.beatTypes[vertexIdx];
  }
  // fallback: 기존 role → VertexBeatType 매핑
  if (layer.role === "strong") return "strong";
  if (layer.role === "high")   return "accent";
  return "normal";
}

/** 화면에 표시할 단일 문자 레이블 */
export const BEAT_TYPE_LABEL: Record<VertexBeatType, string> = {
  strong: "S",
  accent: "A",
  normal: "N",
  mute:   "M",
};

/**
 * 새 레이어의 기본 beatTypes 배열을 생성한다.
 * 첫 꼭짓점은 S(strong), 나머지는 N(normal).
 */
export function makeDefaultBeatTypes(sides: number): VertexBeatType[] {
  return Array.from({ length: Math.max(1, sides) }, (_, i) =>
    i === 0 ? "strong" : "normal",
  );
}

export interface PolygonLayer {
  /** 레이어 고유 ID */
  id: string;
  /** 변(꼭짓점) 수: 1 = 원(펄스), 2-16 = 다각형 */
  sides: number;
  /** 레이어 색상 (hex) — UI에서 자동 배정, 사용자 변경 불가 */
  color: string;
  /** 사운드셋 키 (soundSets의 키, 또는 'custom-<id>') */
  soundSet: string;
  /** 레이어 전체 기본 사운드 역할 (beatTypes 미지정 꼭짓점의 fallback) */
  role: "high" | "low" | "strong";
  /**
   * 레이어 볼륨 (0.0 ~ 1.0). 기본값 1.0.
   * 꼭짓점별 사운드 강세에 곱해지는 레이어 전체 볼륨.
   */
  volume: number;
  /**
   * 꼭짓점별 타이밍 오프셋 비율 (0.0 ~ 0.5).
   * 배열 길이 = sides. 0 = 오프셋 없음, 0.5 = 다음 비트까지 절반 지연 (스윙).
   */
  offsets: number[];
  /**
   * 꼭짓점별 강세 (S=strong, A=accent, N=normal, M=mute).
   * 배열 길이 = sides. 미설정 인덱스는 role로 fallback.
   */
  beatTypes: VertexBeatType[];
}

/** 레이어를 마트료시카 배치 기준으로 정렬: 변 많은 것 → 바깥(큰 반지름) */
export function sortLayersForDisplay(layers: PolygonLayer[]): PolygonLayer[] {
  return [...layers].sort((a, b) => b.sides - a.sides);
}

/** 레이어별 배치 결과: 동일 반지름 + 중앙 허브 중심 좌표 */
export interface LayerLayout {
  r: number;
  cx: number;
  cy: number;
}

/**
 * 중앙 허브 기반 동심 레이아웃 계산.
 *
 * 모든 레이어가 캔버스 중앙 허브를 공유하고, 변 수가 달라도 동일한
 * 외접 반지름을 사용한다. 따라서 원(펄스)과 다각형이 같은 중심과
 * 스케일로 겹쳐진다.
 */
export function computeLayerLayout(sortedLayers: PolygonLayer[], size: number): LayerLayout[] {
  if (sortedLayers.length === 0) return [];

  const maxRadius = size / 2 - 20;
  const r = Math.max(20, maxRadius * 0.72);
  const cx = size / 2;
  const cy = size / 2;
  return sortedLayers.map(() => ({ r, cx, cy }));
}

/** 터치 오버레이 히트 타깃 (Pressable 위치·라우팅) */
export interface VertexHitTarget {
  key: string;
  x: number;
  y: number;
  layerId: string;
  vertexIdx: number;
}

/**
 * 터치 오버레이 히트 타깃 계산.
 *
 * 편집 모드(editingLayerId 지정)에서는 **편집 중인 레이어의 타깃만** 반환한다 —
 * 같은 변 수 레이어들은 꼭짓점이 ±2px 이내로 겹치므로, 전 레이어 타깃을 깔면
 * 항상 마지막에 렌더된 레이어만 터치를 받는다. 편집 모드 라우팅으로 이를 방지.
 * 비편집 모드에서는 모든 레이어 타깃을 반환한다 (겹치면 나중 것이 우선).
 */
export function computeHitTargets(
  sortedLayers: PolygonLayer[],
  layouts: LayerLayout[],
  size: number,
  editingLayerId: string | null,
): VertexHitTarget[] {
  const targets: VertexHitTarget[] = [];

  sortedLayers.forEach((layer, idx) => {
    if (editingLayerId !== null && layer.id !== editingLayerId) return;
    const sides = Math.max(1, layer.sides);
    const r = layouts[idx].r;
    const cx = layouts[idx].cx;
    const cy = layouts[idx].cy;
    if (sides === 1) {
      targets.push({ key: `${layer.id}-0`, x: cx, y: cy, layerId: layer.id, vertexIdx: 0 });
      return;
    }
    const { activeAngles, activeIndices, muteAngles, muteIndices } = computeVertexAngles(layer);
    activeAngles.forEach((a, k) => {
      targets.push({
        key: `${layer.id}-${activeIndices[k]}`,
        x: cx + r * Math.cos(a), y: cy + r * Math.sin(a),
        layerId: layer.id, vertexIdx: activeIndices[k],
      });
    });
    muteAngles.forEach((a, k) => {
      targets.push({
        key: `${layer.id}-${muteIndices[k]}`,
        x: cx + r * Math.cos(a), y: cy + r * Math.sin(a),
        layerId: layer.id, vertexIdx: muteIndices[k],
      });
    });
  });
  return targets;
}

/**
 * @deprecated 중앙 허브 레이아웃(computeLayerLayout)으로 대체됨.
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

/**
 * 뮤트·오프셋을 반영한 꼭짓점 각도 계산 결과.
 *
 * - activeAngles: non-mute 꼭짓점들의 정 N각형 원래 각도 + 오프셋 이동.
 *   외곽선은 활성 꼭짓점만 연결하고 뮤트 꼭짓점은 건너뛴다
 *   (예: 4각형에서 1개 뮤트 → 이등변삼각형).
 * - muteAngles: mute 꼭짓점의 정 N각형 원래 위치. M 레이블 표시 전용.
 */
export interface VertexAnglesResult {
  /** Non-mute 꼭짓점들의 각도 (정 N각형 원래 위치 + 오프셋) */
  activeAngles: number[];
  /** activeAngles[k]에 대응하는 원래 layer vertex index */
  activeIndices: number[];
  /** Mute 꼭짓점들의 정 N각형 유령 각도 (M 레이블 위치) */
  muteAngles: number[];
  /** muteAngles[k]에 대응하는 원래 layer vertex index */
  muteIndices: number[];
}

export function computeVertexAngles(layer: PolygonLayer): VertexAnglesResult {
  const sides = Math.max(1, layer.sides);
  const arcPerSide = (2 * Math.PI) / sides;

  const activeIndices: number[] = [];
  const muteIndices: number[] = [];
  for (let i = 0; i < sides; i++) {
    if (getVertexBeatType(layer, i) === "mute") {
      muteIndices.push(i);
    } else {
      activeIndices.push(i);
    }
  }

  const activeAngles = activeIndices.map((vertexIdx) => {
    const base = -Math.PI / 2 + arcPerSide * vertexIdx;
    const offset = layer.offsets[vertexIdx] ?? 0;
    return base + offset * arcPerSide;
  });

  const muteAngles = muteIndices.map((vertexIdx) =>
    -Math.PI / 2 + arcPerSide * vertexIdx,
  );

  return { activeAngles, activeIndices, muteAngles, muteIndices };
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
  volume: 1.0,
  offsets: [],
  beatTypes: [],
};
