// ============================================================
// ScoreCanvas — 터치 가능한 오선보
// 고스트 음표 + XY 점선 가이드 + 돋보기 미니뷰
// ============================================================

import React, { useMemo, useRef, useCallback, useState } from "react";
import { View, PanResponder, StyleSheet } from "react-native";
import Svg, { Line, Ellipse, G, Rect, Text as SvgText } from "react-native-svg";
import { useTheme } from "@/contexts/ThemeContext";
import { ScoreRenderer } from "@/components/ScoreRenderer";
import {
  computeScoreLayout,
  yToPitch,
  pitchToY,
  SCORE_STAFF_PADDING_TOP,
  SCORE_PART_HEIGHT,
  NOTE_HEAD_RX,
  NOTE_HEAD_RY,
  STEM_HEIGHT,
  getStemDirection,
  LINE_SPACING,
  STAFF_HEIGHT,
} from "@/lib/score-layout";
import type {
  ScoreDocument,
  Pitch,
  NoteDuration,
  ClefType,
  Accidental,
} from "@/lib/score-types";

// ── 음이름 변환 ───────────────────────────────────────────────

function pitchLabel(pitch: Pitch): string {
  const acc =
    pitch.accidental === "sharp" ? "♯" :
    pitch.accidental === "flat" ? "♭" :
    pitch.accidental === "double_sharp" ? "𝄪" :
    pitch.accidental === "double_flat" ? "𝄫" : "";
  return `${pitch.step}${acc}${pitch.octave}`;
}

// ── 공개 타입 ─────────────────────────────────────────────────

export type EditorTool = "select" | "note" | "rest" | "erase";

export interface GhostState {
  x: number;
  y: number;
  staffY: number;
  noteY: number;
  pitch: Pitch;
  measureIdx: number;
  insertIdx: number;
}

export interface ScoreCanvasProps {
  doc: ScoreDocument;
  containerWidth: number;
  selectedElementId: string | null;
  selectedPartIdx: number;
  activeTool: EditorTool;
  activeDuration: NoteDuration;
  isDotted: boolean;
  accidental: Accidental | null;
  onNotePlaced: (measureIdx: number, pitch: Pitch, duration: NoteDuration, insertIdx: number) => void;
  onRestPlaced: (measureIdx: number, duration: NoteDuration, insertIdx: number) => void;
  onElementTap: (elementId: string, measureIdx: number) => void;
  onMeasureTap: (measureIdx: number) => void;
  onEraseAtPoint: (measureIdx: number) => void;
  onNoteMoved?: (elementId: string, measureIdx: number, newPitch: Pitch) => void;
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────

export function ScoreCanvas({
  doc,
  containerWidth,
  selectedElementId,
  selectedPartIdx,
  activeTool,
  activeDuration,
  isDotted,
  accidental,
  onNotePlaced,
  onRestPlaced,
  onElementTap,
  onMeasureTap,
  onEraseAtPoint,
  onNoteMoved,
}: ScoreCanvasProps) {
  const { colors: C } = useTheme();
  const [ghost, setGhost] = useState<GhostState | null>(null);

  // refs를 통해 PanResponder 클로저에서 최신 값 참조
  const activeToolRef = useRef(activeTool);
  const activeDurationRef = useRef(activeDuration);
  const isDottedRef = useRef(isDotted);
  const accidentalRef = useRef(accidental);
  const selectedElementIdRef = useRef(selectedElementId);
  const onNoteMoveRef = useRef(onNoteMoved);
  const docRef = useRef(doc);
  const selectedPartIdxRef = useRef(selectedPartIdx);
  activeToolRef.current = activeTool;
  activeDurationRef.current = activeDuration;
  isDottedRef.current = isDotted;
  accidentalRef.current = accidental;
  selectedElementIdRef.current = selectedElementId;
  onNoteMoveRef.current = onNoteMoved;
  docRef.current = doc;
  selectedPartIdxRef.current = selectedPartIdx;

  // 음표 드래그 상태 refs
  const dragElementIdRef = useRef<string | null>(null);
  const dragMeasureIdxRef = useRef<number>(-1);

  const { rows, totalHeight } = useMemo(
    () => computeScoreLayout(doc, containerWidth),
    [doc, containerWidth],
  );

  const clef = doc.parts[selectedPartIdx]?.clef ?? "treble";
  const clefRef = useRef(clef);
  clefRef.current = clef;

  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  // 터치 좌표 → 마디 인덱스 + 음높이 + 삽입 위치(insertIdx)
  const touchToGhost = useCallback(
    (lx: number, ly: number): GhostState | null => {
      for (const row of rowsRef.current) {
        const rowBottom = row.y + SCORE_PART_HEIGHT;
        if (ly < row.y || ly > rowBottom) continue;

        let accX = 0;
        for (let i = 0; i < row.measureIndices.length; i++) {
          const mIdx = row.measureIndices[i];
          const mWidth = row.measureWidths[i] ?? 0;
          if (lx >= accX && lx <= accX + mWidth) {
            const staffY = row.y + SCORE_STAFF_PADDING_TOP;
            const staffRelY = ly - staffY;
            const pitch = yToPitch(staffRelY, clefRef.current);
            const acc = accidentalRef.current;
            const finalPitch: Pitch =
              acc != null && acc !== "natural"
                ? { ...pitch, accidental: acc }
                : pitch;
            const noteY = staffY + pitchToY(finalPitch, clefRef.current);

            // X 좌표 → 삽입 위치 계산
            const measure = docRef.current.parts[selectedPartIdxRef.current]?.measures[mIdx];
            const nElements = measure?.elements.length ?? 0;
            const contentX = accX + 4;
            const totalWidth = Math.max(mWidth - 8, 1);
            const nSlots = nElements + 1;
            const slotWidth = totalWidth / nSlots;
            const relX = lx - contentX;
            const insertIdx = Math.max(0, Math.min(nElements, Math.round(relX / slotWidth)));

            return { x: lx, y: ly, staffY, noteY, pitch: finalPitch, measureIdx: mIdx, insertIdx };
          }
          accX += mWidth;
        }
      }
      return null;
    },
    [],
  );

  // 선택 모드: 가장 가까운 음표 hitTest
  const hitTestElement = useCallback(
    (lx: number, ly: number): { elementId: string; measureIdx: number } | null => {
      const HIT_RADIUS = 20;
      for (const row of rowsRef.current) {
        const rowBottom = row.y + SCORE_PART_HEIGHT;
        if (ly < row.y || ly > rowBottom) continue;

        let accX = 0;
        for (let i = 0; i < row.measureIndices.length; i++) {
          const mIdx = row.measureIndices[i];
          const mWidth = row.measureWidths[i] ?? 0;
          if (lx >= accX && lx <= accX + mWidth) {
            const staffY = row.y + SCORE_STAFF_PADDING_TOP;
            const measure = doc.parts[selectedPartIdx]?.measures[mIdx];
            if (!measure || measure.elements.length === 0) {
              onMeasureTap(mIdx);
              return null;
            }
            const contentX = accX + 4;
            const noteSpacing = (mWidth - 8) / Math.max(measure.elements.length, 1);
            let bestDist = HIT_RADIUS;
            let bestId: string | null = null;
            for (let ei = 0; ei < measure.elements.length; ei++) {
              const el = measure.elements[ei];
              if (!el) continue;
              const noteX = contentX + ei * noteSpacing + noteSpacing / 2;
              const noteY =
                el.type === "note"
                  ? staffY + pitchToY(el.pitch, clefRef.current)
                  : staffY + STAFF_HEIGHT / 2;
              const dist = Math.sqrt((lx - noteX) ** 2 + (ly - noteY) ** 2);
              if (dist < bestDist) {
                bestDist = dist;
                bestId = el.id;
              }
            }
            if (bestId) return { elementId: bestId, measureIdx: mIdx };
            onMeasureTap(mIdx);
            return null;
          }
          accX += mWidth;
        }
      }
      return null;
    },
    [doc, selectedPartIdx, onMeasureTap],
  );

  const panResponder = useMemo(() => {
    let tapStartX = 0;
    let tapStartY = 0;
    let isMoving = false;

    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => {
        const tool = activeToolRef.current;
        if (tool === "note" || tool === "rest") return true;
        // 선택 모드 + 선택된 음표가 있으면 드래그 허용
        if (tool === "select" && selectedElementIdRef.current) return true;
        return false;
      },

      onPanResponderGrant: (e) => {
        const { locationX: lx, locationY: ly } = e.nativeEvent;
        tapStartX = lx;
        tapStartY = ly;
        isMoving = false;
        dragElementIdRef.current = null;
        dragMeasureIdxRef.current = -1;

        if (activeToolRef.current === "note" || activeToolRef.current === "rest") {
          setGhost(touchToGhost(lx, ly));
        } else if (activeToolRef.current === "select" && selectedElementIdRef.current) {
          // 선택된 음표의 드래그 시작점 기록
          const hit = hitTestElement(lx, ly);
          if (hit && hit.elementId === selectedElementIdRef.current) {
            dragElementIdRef.current = hit.elementId;
            dragMeasureIdxRef.current = hit.measureIdx;
          }
        }
      },

      onPanResponderMove: (e) => {
        const { locationX: lx, locationY: ly } = e.nativeEvent;
        const dx = lx - tapStartX;
        const dy = ly - tapStartY;
        if (Math.sqrt(dx * dx + dy * dy) > 4) isMoving = true;

        if (activeToolRef.current === "note" || activeToolRef.current === "rest") {
          setGhost(touchToGhost(lx, ly));
        } else if (
          activeToolRef.current === "select" &&
          dragElementIdRef.current &&
          isMoving
        ) {
          // 선택된 음표 드래그: 고스트로 새 음높이 미리 보기
          setGhost(touchToGhost(lx, ly));
        }
      },

      onPanResponderRelease: (e) => {
        const { locationX: lx, locationY: ly } = e.nativeEvent;
        setGhost(null);
        const tool = activeToolRef.current;
        const baseDur = activeDurationRef.current;
        const dur: NoteDuration = isDottedRef.current
          ? (`${baseDur}_dot` as NoteDuration)
          : baseDur;

        if (tool === "note") {
          const info = touchToGhost(lx, ly);
          if (info) onNotePlaced(info.measureIdx, info.pitch, dur, info.insertIdx);
        } else if (tool === "rest") {
          const info = touchToGhost(lx, ly);
          if (info) onRestPlaced(info.measureIdx, dur, info.insertIdx);
        } else if (tool === "erase") {
          const info = touchToGhost(lx, ly);
          if (info) onEraseAtPoint(info.measureIdx);
        } else if (tool === "select") {
          if (isMoving && dragElementIdRef.current && dragMeasureIdxRef.current >= 0) {
            // 드래그 종료 → 새 음높이로 이동
            const info = touchToGhost(lx, ly);
            if (info) {
              onNoteMoveRef.current?.(
                dragElementIdRef.current,
                dragMeasureIdxRef.current,
                info.pitch,
              );
            }
            dragElementIdRef.current = null;
            dragMeasureIdxRef.current = -1;
          } else if (!isMoving) {
            // 탭 → 선택
            const hit = hitTestElement(lx, ly);
            if (hit) onElementTap(hit.elementId, hit.measureIdx);
          }
        }
      },

      onPanResponderTerminate: () => {
        setGhost(null);
        dragElementIdRef.current = null;
        dragMeasureIdxRef.current = -1;
      },
    });
  }, [touchToGhost, hitTestElement, onNotePlaced, onRestPlaced, onEraseAtPoint, onElementTap]);

  const dur = isDotted
    ? (`${activeDuration}_dot` as NoteDuration)
    : activeDuration;

  const svgH = Math.max(totalHeight, 60);

  return (
    <View style={styles.container}>
      {/* 오선보 SVG */}
      <ScoreRenderer
        doc={doc}
        containerWidth={containerWidth}
        selectedElementId={selectedElementId}
      />

      {/* 터치 + 가이드선 + 고스트 SVG 오버레이 */}
      <Svg
        width={containerWidth}
        height={svgH}
        style={StyleSheet.absoluteFillObject}
        {...panResponder.panHandlers}
      >
        {/* 수평 점선 가이드 (음높이) */}
        {ghost && (
          <Line
            x1={0}
            y1={ghost.noteY}
            x2={containerWidth}
            y2={ghost.noteY}
            stroke={C.accent}
            strokeWidth={0.8}
            strokeDasharray="4,3"
            opacity={0.65}
          />
        )}
        {/* 수직 점선 가이드 (박자 위치) */}
        {ghost && (
          <Line
            x1={ghost.x}
            y1={0}
            x2={ghost.x}
            y2={svgH}
            stroke={C.accent}
            strokeWidth={0.8}
            strokeDasharray="4,3"
            opacity={0.65}
          />
        )}

        {/* 고스트 음표 */}
        {ghost && activeTool === "note" && (
          <GhostNote
            x={ghost.x}
            y={ghost.noteY}
            staffY={ghost.staffY}
            duration={dur}
            color={C.accent}
          />
        )}

        {/* 고스트 쉼표 */}
        {ghost && activeTool === "rest" && (
          <GhostRest
            x={ghost.x}
            staffY={ghost.staffY}
            duration={dur}
            color={C.accent}
          />
        )}
      </Svg>

      {/* 돋보기 미니뷰 */}
      {ghost && (activeTool === "note" || activeTool === "rest") && (
        <View
          style={[styles.magnifier, { backgroundColor: C.surface, borderColor: C.accent }]}
          pointerEvents="none"
        >
          <MagnifierView
            pitch={ghost.pitch}
            duration={dur}
            activeTool={activeTool}
            clef={clef}
            accentColor={C.accent}
          />
        </View>
      )}
    </View>
  );
}

// ── 고스트 음표 ───────────────────────────────────────────────

function GhostNote({
  x,
  y,
  staffY,
  duration,
  color,
}: {
  x: number;
  y: number;
  staffY: number;
  duration: NoteDuration;
  color: string;
}) {
  const isOpen =
    duration === "whole" ||
    duration === "half" ||
    duration === "whole_dot" ||
    duration === "half_dot";
  const needsStem = duration !== "whole" && duration !== "whole_dot";
  const relY = y - staffY;
  const dir = getStemDirection(relY);

  const stemX = dir === "up" ? x + NOTE_HEAD_RX - 1 : x - NOTE_HEAD_RX + 1;
  const stemY2 = dir === "up" ? y - STEM_HEIGHT : y + STEM_HEIGHT;

  return (
    <G opacity={0.42}>
      <Ellipse
        cx={x}
        cy={y}
        rx={NOTE_HEAD_RX}
        ry={NOTE_HEAD_RY}
        fill={isOpen ? "none" : color}
        stroke={color}
        strokeWidth={1.4}
      />
      {needsStem && (
        <Line
          x1={stemX}
          y1={y}
          x2={stemX}
          y2={stemY2}
          stroke={color}
          strokeWidth={1.4}
        />
      )}
    </G>
  );
}

// ── 고스트 쉼표 ───────────────────────────────────────────────

function GhostRest({
  x,
  staffY,
  duration,
  color,
}: {
  x: number;
  staffY: number;
  duration: NoteDuration;
  color: string;
}) {
  const cy = staffY + STAFF_HEIGHT / 2;
  return (
    <G opacity={0.42}>
      {(duration === "whole" || duration === "whole_dot") && (
        <Rect x={x - 7} y={cy - LINE_SPACING - 3} width={14} height={5} fill={color} />
      )}
      {(duration === "half" || duration === "half_dot") && (
        <Rect x={x - 7} y={cy - 4} width={14} height={5} rx={1} fill={color} />
      )}
      {(duration === "quarter" || duration === "quarter_dot") && (
        <SvgText x={x} y={cy + 5} fontSize={18} fill={color} textAnchor="middle" fontFamily="serif">
          𝄽
        </SvgText>
      )}
      {(duration === "eighth" || duration === "eighth_dot") && (
        <SvgText x={x} y={cy + 4} fontSize={16} fill={color} textAnchor="middle" fontFamily="serif">
          𝄾
        </SvgText>
      )}
      {(duration === "sixteenth" || duration === "sixteenth_dot") && (
        <SvgText x={x} y={cy + 4} fontSize={16} fill={color} textAnchor="middle" fontFamily="serif">
          𝄿
        </SvgText>
      )}
    </G>
  );
}

// ── 돋보기 미니뷰 ─────────────────────────────────────────────

function MagnifierView({
  pitch,
  duration,
  activeTool,
  clef,
  accentColor,
}: {
  pitch: Pitch;
  duration: NoteDuration;
  activeTool: EditorTool;
  clef: ClefType;
  accentColor: string;
}) {
  const MINI_W = 84;
  const MINI_H = 62;
  const STAFF_Y = 10;
  const LINE_SP = 7;

  // 현재 음 위치 (오선보 스케일 → 미니 스케일)
  const scale = LINE_SP / LINE_SPACING;
  const relY = pitchToY(pitch, clef);
  const noteY = STAFF_Y + relY * scale;
  const cx = MINI_W / 2;

  const isOpen =
    duration === "whole" ||
    duration === "half" ||
    duration === "whole_dot" ||
    duration === "half_dot";

  const label = activeTool === "note" ? pitchLabel(pitch) : "";

  return (
    <Svg width={MINI_W} height={MINI_H}>
      {/* 오선 5개 */}
      {Array.from({ length: 5 }, (_, i) => (
        <Line
          key={i}
          x1={6}
          y1={STAFF_Y + i * LINE_SP}
          x2={MINI_W - 6}
          y2={STAFF_Y + i * LINE_SP}
          stroke={accentColor}
          strokeWidth={0.8}
          opacity={0.45}
        />
      ))}

      {/* 음표 또는 쉼표 */}
      {activeTool === "note" ? (
        <Ellipse
          cx={cx}
          cy={noteY}
          rx={5}
          ry={3.5}
          fill={isOpen ? "none" : accentColor}
          stroke={accentColor}
          strokeWidth={1}
        />
      ) : (
        <Rect
          x={cx - 6}
          y={STAFF_Y + LINE_SP * 2 - 3}
          width={12}
          height={4}
          fill={accentColor}
        />
      )}

      {/* 음이름 */}
      {label ? (
        <SvgText
          x={cx}
          y={MINI_H - 4}
          fontSize={10}
          fill={accentColor}
          textAnchor="middle"
          fontFamily="SpaceGrotesk_600SemiBold"
        >
          {label}
        </SvgText>
      ) : null}
    </Svg>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
  },
  magnifier: {
    position: "absolute",
    top: 4,
    right: 4,
    borderRadius: 8,
    borderWidth: 1.5,
    overflow: "hidden",
  },
});
