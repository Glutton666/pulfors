/**
 * PolygonCanvas — 폴리곤 레이어를 마트료시카 방식으로 동심 배치해 렌더링.
 *
 * - 변 많은 레이어 → 바깥(큰 반지름), 변 적은 레이어 → 안쪽
 * - 변 수 1 → 원(펄스) 렌더링
 * - 활성 꼭짓점: 색상+크기 강조
 * - 오프셋 있는 꼭짓점: 점선 링으로 시각 구분
 * - 편집 모드: 비편집 레이어 opacity 0.25 dimmed
 * - 꼭짓점 탭: S/A/N/M 강세 순환 (onVertexPress)
 * - 꼭짓점 롱프레스: 오프셋 편집 (onVertexLongPress, 편집 모드일 때만)
 */

import React, { useEffect, useRef } from "react";
import { View } from "react-native";
import Svg, { Circle, Polygon, G, Text as SvgText } from "react-native-svg";
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  withSequence,
  Easing,
} from "react-native-reanimated";
import type { PolygonLayer } from "./PolygonTypes";
import {
  sortLayersForDisplay,
  computeLayerRadii,
  polygonVertices,
  getVertexBeatType,
  BEAT_TYPE_LABEL,
} from "./PolygonTypes";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface PolygonCanvasProps {
  layers: PolygonLayer[];
  activeVertices: Record<string, number>;
  editingLayerId: string | null;
  /** 꼭짓점 탭 → 강세 순환 (S/A/N/M) */
  onVertexPress?: (layerId: string, vertexIdx: number) => void;
  /** 편집 모드에서 꼭짓점 롱프레스 → 오프셋 편집 */
  onVertexLongPress?: (layerId: string, vertexIdx: number) => void;
  size: number; // 캔버스 크기 (정사각형)
}

/** 단일 꼭짓점의 펄스 애니메이션 */
function AnimatedVertex({
  cx, cy, r, color, isActive,
}: {
  cx: number; cy: number; r: number; color: string; isActive: boolean;
}) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (isActive) {
      scale.value = withSequence(
        withTiming(1.7, { duration: 80, easing: Easing.out(Easing.cubic) }),
        withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) }),
      );
      opacity.value = withSequence(
        withTiming(1, { duration: 0 }),
        withTiming(0.6, { duration: 300 }),
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  const animProps = useAnimatedProps(() => ({
    r: r * scale.value,
    opacity: opacity.value,
  }));

  return (
    <AnimatedCircle
      cx={cx}
      cy={cy}
      fill={isActive ? color : color + "55"}
      animatedProps={animProps}
    />
  );
}

/**
 * 꼭짓점에서 바깥(중심 반대 방향)으로 offset px 이동한 레이블 좌표를 반환한다.
 * 꼭짓점이 중심과 같은 경우(sides=1 펄스) 아래쪽으로 내린다.
 */
function getLabelPos(
  vx: number, vy: number,
  cx: number, cy: number,
  offset: number,
): { x: number; y: number } {
  const dx = vx - cx;
  const dy = vy - cy;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) {
    // 중심점 — 아래쪽에 배치
    return { x: vx, y: vy + offset };
  }
  return { x: vx + (dx / len) * offset, y: vy + (dy / len) * offset };
}

export function PolygonCanvas({
  layers, activeVertices, editingLayerId,
  onVertexPress, onVertexLongPress, size,
}: PolygonCanvasProps) {
  const cx = size / 2;
  const cy = size / 2;
  const maxRadius = size / 2 - 20;

  const sorted = sortLayersForDisplay(layers);
  const radii = computeLayerRadii(sorted, maxRadius);

  const VERTEX_R_NORMAL = 5;
  const VERTEX_R_ACTIVE = 8;
  const HIT_R = VERTEX_R_ACTIVE + 12;
  const LABEL_OFFSET = 16; // 꼭짓점에서 레이블까지 거리 (px)
  const LABEL_FONT_SIZE = 9;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        {/* 중심점 */}
        <Circle cx={cx} cy={cy} r={3} fill="#ffffff22" />

        {sorted.map((layer, idx) => {
          const r = radii[idx];
          const isEditing = editingLayerId !== null;
          const isThisEditing = layer.id === editingLayerId;
          const layerOpacity = isEditing && !isThisEditing ? 0.2 : 1;
          const activeVertex = activeVertices[layer.id] ?? -1;
          const sides = Math.max(1, layer.sides);
          const verts = polygonVertices(cx, cy, r, sides);

          if (sides === 1) {
            // ── 원(펄스) 렌더링 ──
            const isActive = activeVertex === 0;
            const beatType = getVertexBeatType(layer, 0);
            const label = BEAT_TYPE_LABEL[beatType];
            const isMute = beatType === "mute";
            const labelColor = isMute ? layer.color + "55" : layer.color;
            // 원 중심 탭 히트 영역
            const labelPos = getLabelPos(cx, cy, cx, cy, VERTEX_R_ACTIVE + LABEL_OFFSET);
            return (
              <G key={layer.id} opacity={layerOpacity}>
                <Circle
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="none"
                  stroke={layer.color}
                  strokeWidth={isThisEditing ? 2.5 : 1.5}
                  strokeDasharray="4 4"
                />
                {isActive && (
                  <Circle
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill="none"
                    stroke={layer.color}
                    strokeWidth={3}
                    opacity={0.5}
                  />
                )}
                {/* 탭 히트 영역 + 펄스 점 */}
                <G
                  onPress={onVertexPress ? () => onVertexPress(layer.id, 0) : undefined}
                  onLongPress={onVertexLongPress ? () => onVertexLongPress(layer.id, 0) : undefined}
                >
                  <Circle cx={cx} cy={cy} r={HIT_R} fill="transparent" />
                  <AnimatedVertex
                    cx={cx}
                    cy={cy}
                    r={VERTEX_R_ACTIVE}
                    color={layer.color}
                    isActive={isActive}
                  />
                  {/* 강세 레이블 */}
                  <SvgText
                    x={labelPos.x}
                    y={labelPos.y}
                    textAnchor="middle"
                    dy="0.35em"
                    fontSize={LABEL_FONT_SIZE}
                    fontWeight="700"
                    fill={labelColor}
                  >
                    {label}
                  </SvgText>
                </G>
              </G>
            );
          }

          // ── 다각형 렌더링 ──
          const pointsStr = verts.map((v) => `${v.x},${v.y}`).join(" ");

          return (
            <G key={layer.id} opacity={layerOpacity}>
              {/* 폴리곤 외곽선 */}
              <Polygon
                points={pointsStr}
                fill="none"
                stroke={layer.color}
                strokeWidth={isThisEditing ? 2.5 : 1.5}
                strokeOpacity={0.7}
              />

              {/* 꼭짓점들 */}
              {verts.map((v, vi) => {
                const isActive = vi === activeVertex;
                const hasOffset = (layer.offsets[vi] ?? 0) > 0.01;
                const beatType = getVertexBeatType(layer, vi);
                const label = BEAT_TYPE_LABEL[beatType];
                const isMute = beatType === "mute";
                const labelColor = isMute ? layer.color + "55" : layer.color;
                const labelPos = getLabelPos(v.x, v.y, cx, cy, LABEL_OFFSET);

                return (
                  <G
                    key={vi}
                    onPress={onVertexPress ? () => onVertexPress(layer.id, vi) : undefined}
                    onLongPress={
                      onVertexLongPress
                        ? () => onVertexLongPress(layer.id, vi)
                        : undefined
                    }
                  >
                    {/* 터치 히트 영역 (투명) */}
                    <Circle cx={v.x} cy={v.y} r={HIT_R} fill="transparent" />
                    {/* 오프셋 표시: 점선 링 */}
                    {hasOffset && (
                      <Circle
                        cx={v.x}
                        cy={v.y}
                        r={isActive ? VERTEX_R_ACTIVE + 5 : VERTEX_R_NORMAL + 4}
                        fill="none"
                        stroke={layer.color}
                        strokeWidth={1}
                        strokeDasharray="2 2"
                        opacity={0.5}
                      />
                    )}
                    <AnimatedVertex
                      cx={v.x}
                      cy={v.y}
                      r={isActive ? VERTEX_R_ACTIVE : VERTEX_R_NORMAL}
                      color={layer.color}
                      isActive={isActive}
                    />
                    {/* 강세 레이블 (S/A/N/M) */}
                    <SvgText
                      x={labelPos.x}
                      y={labelPos.y}
                      textAnchor="middle"
                      dy="0.35em"
                      fontSize={LABEL_FONT_SIZE}
                      fontWeight="700"
                      fill={labelColor}
                    >
                      {label}
                    </SvgText>
                  </G>
                );
              })}
            </G>
          );
        })}
      </Svg>
    </View>
  );
}
