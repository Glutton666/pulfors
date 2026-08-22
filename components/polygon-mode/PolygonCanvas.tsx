/**
 * PolygonCanvas — 폴리곤 레이어를 마트료시카 방식으로 동심 배치해 렌더링.
 *
 * - 변 많은 레이어 → 바깥(큰 반지름), 변 적은 레이어 → 안쪽
 * - 변 수 1 → 원(펄스) 렌더링
 * - 활성 꼭짓점: 색상+크기 강조
 * - 오프셋 있는 꼭짓점: 점선 링으로 시각 구분
 * - 편집 모드: 비편집 레이어 opacity 0.25 dimmed
 * - 꼭짓점 탭: S/A/N/M 강세 순환 (onVertexPress)
 * - 꼭짓점 롱프레스: 오프셋 편집 (onVertexLongPress)
 * - 터치 처리: SVG 위 절대위치 Pressable 오버레이 사용
 *   (react-native-svg <G> onLongPress는 웹에서 동작하지 않음)
 */

import React, { useEffect, useRef } from "react";
import { View, Pressable, StyleSheet } from "react-native";
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
  computeLayerLayout,
  getVertexBeatType,
  BEAT_TYPE_LABEL,
  computeVertexAngles,
  computeHitTargets,
  computePulseLabelPosition,
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
  const sorted = sortLayersForDisplay(layers);
  const layouts = computeLayerLayout(sorted, size);

  const VERTEX_R_NORMAL = 5;
  const VERTEX_R_ACTIVE = 8;
  const HIT_R = VERTEX_R_ACTIVE + 12;
  const LABEL_OFFSET = 16; // 꼭짓점에서 레이블까지 거리 (px)
  const LABEL_FONT_SIZE = 9;

  // ── 터치 오버레이 히트 타깃 (SVG G onLongPress는 웹에서 미동작) ──
  // 편집 모드에서는 편집 중인 레이어의 타깃만 활성화 (겹치는 꼭짓점 라우팅)
  const hitTargets = computeHitTargets(sorted, layouts, size, editingLayerId);
  const pulseLabelIndices = new Map<string, number>();
  const pulseCount = sorted.reduce((count, layer) => {
    if (Math.max(1, layer.sides) !== 1) return count;
    pulseLabelIndices.set(layer.id, count);
    return count + 1;
  }, 0);

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        {sorted.map((layer, idx) => {
          const isEditing = editingLayerId !== null;
          const isThisEditing = layer.id === editingLayerId;
          const layerOpacity = isEditing && !isThisEditing ? 0.2 : 1;
          const activeVertex = activeVertices[layer.id] ?? -1;
          const sides = Math.max(1, layer.sides);
          const r = layouts[idx].r;
          const cx = layouts[idx].cx;
          const cy = layouts[idx].cy;

          if (sides === 1) {
            // ── 원(펄스) 렌더링 ──
            const isActive = activeVertex === 0;
            const beatType = getVertexBeatType(layer, 0);
            const isMute = beatType === "mute";
            const label = BEAT_TYPE_LABEL[beatType];
            const labelColor = isMute ? layer.color + "55" : layer.color;
            const labelPos = pulseLabelIndices.has(layer.id)
              ? computePulseLabelPosition(
                cx,
                cy,
                pulseLabelIndices.get(layer.id) ?? 0,
                pulseCount,
                size,
              )
              : getLabelPos(cx, cy, cx, cy, VERTEX_R_ACTIVE + LABEL_OFFSET);
            return (
              <G key={layer.id} opacity={layerOpacity}>
                {/* 원 외곽선·활성 링: mute이면 미표시 */}
                {!isMute && (
                  <Circle
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill="none"
                    stroke={layer.color}
                    strokeWidth={isThisEditing ? 2.5 : 1.5}
                    strokeDasharray="4 4"
                  />
                )}
                {!isMute && isActive && (
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
                {/* 펄스 점 (터치는 오버레이 Pressable에서 처리) */}
                <G>
                  {!isMute && (
                    <AnimatedVertex
                      cx={cx}
                      cy={cy}
                      r={VERTEX_R_ACTIVE}
                      color={layer.color}
                      isActive={isActive}
                    />
                  )}
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
          // 활성(non-mute) 꼭짓점은 정 N각형 원래 위치 유지, 외곽선은 뮤트 꼭짓점을 건너뛰고 연결.
          const { activeAngles, activeIndices, muteAngles, muteIndices } =
            computeVertexAngles(layer);

          const activeVerts = activeAngles.map((angle) => ({
            x: cx + r * Math.cos(angle),
            y: cy + r * Math.sin(angle),
          }));
          const muteGhostVerts = muteAngles.map((angle) => ({
            x: cx + r * Math.cos(angle),
            y: cy + r * Math.sin(angle),
          }));

          const activePointsStr = activeVerts.map((v) => `${v.x},${v.y}`).join(" ");

          return (
            <G key={layer.id} opacity={layerOpacity}>
              {/* 폴리곤 외곽선: 활성 꼭짓점만 연결 (2개 이상이어야 선이 보임) */}
              {activeVerts.length >= 2 && (
                <Polygon
                  points={activePointsStr}
                  fill="none"
                  stroke={layer.color}
                  strokeWidth={isThisEditing ? 2.5 : 1.5}
                  strokeOpacity={0.7}
                />
              )}

              {/* 활성 꼭짓점들: 도트 + 오프셋 링 + 레이블 */}
              {activeVerts.map((av, k) => {
                const vi = activeIndices[k];
                const isActive = vi === activeVertex;
                const hasOffset = (layer.offsets[vi] ?? 0) > 0.01;
                const beatType = getVertexBeatType(layer, vi);
                const label = BEAT_TYPE_LABEL[beatType];
                const labelPos = getLabelPos(av.x, av.y, cx, cy, LABEL_OFFSET);
                return (
                  <G key={vi}>
                    {hasOffset && (
                      <Circle
                        cx={av.x}
                        cy={av.y}
                        r={isActive ? VERTEX_R_ACTIVE + 5 : VERTEX_R_NORMAL + 4}
                        fill="none"
                        stroke={layer.color}
                        strokeWidth={1}
                        strokeDasharray="2 2"
                        opacity={0.5}
                      />
                    )}
                    <AnimatedVertex
                      cx={av.x}
                      cy={av.y}
                      r={isActive ? VERTEX_R_ACTIVE : VERTEX_R_NORMAL}
                      color={layer.color}
                      isActive={isActive}
                    />
                    <SvgText
                      x={labelPos.x}
                      y={labelPos.y}
                      textAnchor="middle"
                      dy="0.35em"
                      fontSize={LABEL_FONT_SIZE}
                      fontWeight="700"
                      fill={layer.color}
                    >
                      {label}
                    </SvgText>
                  </G>
                );
              })}

              {/* 뮤트 꼭짓점들: 유령 위치에 M 레이블 + 히트 영역만 */}
              {muteGhostVerts.map((gv, k) => {
                const vi = muteIndices[k];
                const labelPos = getLabelPos(gv.x, gv.y, cx, cy, LABEL_OFFSET);
                return (
                  <G key={`mute-${vi}`}>
                    <SvgText
                      x={labelPos.x}
                      y={labelPos.y}
                      textAnchor="middle"
                      dy="0.35em"
                      fontSize={LABEL_FONT_SIZE}
                      fontWeight="700"
                      fill={layer.color + "55"}
                    >
                      M
                    </SvgText>
                  </G>
                );
              })}
            </G>
          );
        })}
      </Svg>

      {/* ── 터치 오버레이: 탭(강세 순환) + 롱프레스(오프셋 팝업) ── */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {hitTargets.map((tgt) => (
          <Pressable
            key={tgt.key}
            onPress={onVertexPress ? () => onVertexPress(tgt.layerId, tgt.vertexIdx) : undefined}
            onLongPress={onVertexLongPress ? () => onVertexLongPress(tgt.layerId, tgt.vertexIdx) : undefined}
            delayLongPress={400}
            style={{
              position: "absolute",
              left: tgt.x - HIT_R,
              top: tgt.y - HIT_R,
              width: HIT_R * 2,
              height: HIT_R * 2,
              borderRadius: HIT_R,
            }}
          />
        ))}
      </View>
    </View>
  );
}
