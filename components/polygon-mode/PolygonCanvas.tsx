/**
 * PolygonCanvas — 폴리곤 레이어를 마트료시카 방식으로 동심 배치해 렌더링.
 *
 * - 변 많은 레이어 → 바깥(큰 반지름), 변 적은 레이어 → 안쪽
 * - 변 수 1 → 원(펄스) 렌더링
 * - 활성 꼭짓점: 색상+크기 강조
 * - 오프셋 있는 꼭짓점: 점선 링으로 시각 구분
 * - 편집 모드: 비편집 레이어 opacity 0.25 dimmed
 */

import React, { useEffect, useRef } from "react";
import { View } from "react-native";
import Svg, { Circle, Polygon, G, Line } from "react-native-svg";
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
} from "./PolygonTypes";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface PolygonCanvasProps {
  layers: PolygonLayer[];
  activeVertices: Record<string, number>;
  editingLayerId: string | null;
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

export function PolygonCanvas({
  layers, activeVertices, editingLayerId, onVertexLongPress, size,
}: PolygonCanvasProps) {
  const cx = size / 2;
  const cy = size / 2;
  const maxRadius = size / 2 - 20;

  const sorted = sortLayersForDisplay(layers);
  const radii = computeLayerRadii(sorted, maxRadius);

  const VERTEX_R_NORMAL = 5;
  const VERTEX_R_ACTIVE = 8;

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
            // 원(펄스) 렌더링
            const isActive = activeVertex === 0;
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
                {/* 펄스 중심 점 */}
                <AnimatedVertex
                  cx={cx}
                  cy={cy}
                  r={VERTEX_R_ACTIVE}
                  color={layer.color}
                  isActive={isActive}
                />
              </G>
            );
          }

          // 다각형 렌더링
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
                const hitR = VERTEX_R_ACTIVE + 12;

                return (
                  <G
                    key={vi}
                    onLongPress={
                      onVertexLongPress
                        ? () => onVertexLongPress(layer.id, vi)
                        : undefined
                    }
                  >
                    {/* 터치 히트 영역 (투명) */}
                    <Circle cx={v.x} cy={v.y} r={hitR} fill="transparent" />
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
