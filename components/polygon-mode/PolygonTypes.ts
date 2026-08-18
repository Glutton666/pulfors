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
   * 꼭짓점별 강세(S/A/N) 대신 단일 볼륨으로 음량을 조절한다.
   */
  volume: number;
  /**
   * 꼭짓점별 타이밍 오프셋 비율 (0.0 ~ 0.5).
   * 배열 길이 = sides. 0 = 오프셋 없음, 0.5 = 다음 비트까지 절반 지연 (스윙).
   */
  offsets: number[];
  /**
   * 꼭짓점별 강세 (N/M 만 사용 — N=normal, M=mute).
   * 배열 길이 = sides. 미설정 인덱스는 role로 fallback.
   */
  beatTypes: VertexBeatType[];
}

/** 레이어를 마트료시카 배치 기준으로 정렬: 변 많은 것 → 바깥(큰 반지름) */
export function sortLayersForDisplay(layers: PolygonLayer[]): PolygonLayer[] {
  return [...layers].sort((a, b) => b.sides - a.sides);
}

/** 레이어별 배치 결과: 반지름 + 중심 좌표 (공유 꼭짓점 팬 구조) */
export interface LayerLayout {
  r: number;
  cx: number;
  cy: number;
}

/**
 * 공유 꼭짓점(보석형 팬) 레이아웃 계산.
 *
 * 모든 폴리곤의 첫 번째(-π/2, 상단) 꼭짓점이 같은 핀 포인트에 고정된다:
 * - pinX = size/2, pinY = 상단 여백
 * - 각 레이어 중심: cx = pinX, cy = pinY + r (첫 꼭짓점 y = cy - r = pinY)
 * - 반지름은 **고유 변 수 그룹** 기준으로 바깥→안쪽 단계적 축소:
 *   같은 변 수 레이어는 항상 동일한 반지름(동일 크기)을 갖는다
 * - 같은 변 수 레이어는 cy에 ±2px(선 두께 수준) 델타만 줘 "두 줄"처럼 보이게 함
 *
 * sides=1(원/펄스) 레이어도 동일 공식을 쓰지만 Canvas 쪽에서 팬 구조 미적용.
 */
export function computeLayerLayout(sortedLayers: PolygonLayer[], size: number): LayerLayout[] {
  const n = sortedLayers.length;
  if (n === 0) return [];

  const maxRadius = size / 2 - 20;
  const pinX = size / 2;
  const pinY = 20; // 캔버스 상단 여백 (핀 포인트 y)

  // 고유 변 수 그룹 (sortedLayers는 변 많은 것부터 정렬돼 있음)
  const uniqueSides: number[] = [];
  for (const layer of sortedLayers) {
    if (!uniqueSides.includes(layer.sides)) uniqueSides.push(layer.sides);
  }
  const groupIndex = new Map(uniqueSides.map((s, i) => [s, i]));

  const base = maxRadius * 0.72;
  const gN = uniqueSides.length;
  const step = gN === 1 ? 0 : (maxRadius * 0.62) / gN;

  // 같은 변 수 그룹 내 인덱스를 추적해 cy 미세 오프셋 적용
  const groupCount: Record<number, number> = {};
  return sortedLayers.map((layer) => {
    const gi = groupIndex.get(layer.sides) ?? 0;
    const r = Math.max(20, base - step * gi);
    const g = groupCount[layer.sides] ?? 0;
    groupCount[layer.sides] = g + 1;
    // 같은 변 수면 cy에 ±2px 델타 (앵커 제외 -2/+2 교대, 누적 없음)
    const cyDelta = g === 0 ? 0 : (g % 2 === 0 ? 2 : -2);
    return { r, cx: pinX, cy: pinY + r + cyDelta };
  });
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
  const centerX = size / 2;
  const centerY = size / 2;
  const targets: VertexHitTarget[] = [];

  sortedLayers.forEach((layer, idx) => {
    if (editingLayerId !== null && layer.id !== editingLayerId) return;
    const sides = Math.max(1, layer.sides);
    const r = layouts[idx].r;
    const cx = sides === 1 ? centerX : layouts[idx].cx;
    const cy = sides === 1 ? centerY : layouts[idx].cy;
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
 * @deprecated 공유 꼭짓점 레이아웃(computeLayerLayout)으로 대체됨.
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
