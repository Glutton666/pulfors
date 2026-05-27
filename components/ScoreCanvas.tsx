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
  CLEF_WIDTH,
  TIME_SIG_WIDTH,
  KEY_SIG_ACCIDENTAL_WIDTH,
  layoutMeasure,
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
  onMeasureLongPress?: (measureIdx: number) => void;
  onEraseElement: (elementId: string, measureIdx: number) => void;
  onNoteMoved?: (elementId: string, measureIdx: number, newPitch: Pitch) => void;
  // 재생 연동
  playheadMeasureIdx?: number;
  playheadFraction?: number;
  showPlayhead?: boolean;
  highlightColor?: string;
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
  onMeasureLongPress,
  onEraseElement,
  onNoteMoved,
  playheadMeasureIdx,
  playheadFraction = 0,
  showPlayhead = true,
  highlightColor,
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
  const onMeasureLongPressRef = useRef(onMeasureLongPress);
  const docRef = useRef(doc);
  const selectedPartIdxRef = useRef(selectedPartIdx);
  activeToolRef.current = activeTool;
  activeDurationRef.current = activeDuration;
  isDottedRef.current = isDotted;
  accidentalRef.current = accidental;
  selectedElementIdRef.current = selectedElementId;
  onNoteMoveRef.current = onNoteMoved;
  onMeasureLongPressRef.current = onMeasureLongPress;
  docRef.current = doc;
  selectedPartIdxRef.current = selectedPartIdx;

  // 음표 드래그 상태 refs
  const dragElementIdRef = useRef<string | null>(null);
  const dragMeasureIdxRef = useRef<number>(-1);
  // 드래그 시작 시 원래 음표의 accidental 보존 (이동 중 팔레트 accidental 변경 방지)
  const dragOriginalAccidentalRef = useRef<Accidental | null | undefined>(undefined);

  const { rows, totalHeight } = useMemo(
    () => computeScoreLayout(doc, containerWidth),
    [doc, containerWidth],
  );

  const clef = doc.parts[selectedPartIdx]?.clef ?? "treble";
  const clefRef = useRef(clef);
  clefRef.current = clef;

  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  // ScoreRenderer.PartRender와 동일한 박자표 변경 감지 (mIdx → Set)
  const timeSigChangedAt = useMemo(() => {
    const changed = new Set<number>();
    let prevNum = doc.timeSignature.numerator;
    let prevDen = doc.timeSignature.denominator;
    const allMeasureIndices = rows.flatMap((r) => r.measureIndices);
    for (const mIdx of allMeasureIndices) {
      const m = doc.parts[selectedPartIdx]?.measures[mIdx];
      if (!m) continue;
      const sig = m.timeSignature;
      if (sig && (sig.numerator !== prevNum || sig.denominator !== prevDen)) {
        changed.add(mIdx);
        prevNum = sig.numerator;
        prevDen = sig.denominator;
      }
    }
    return changed;
  }, [doc, rows, selectedPartIdx]);
  const timeSigChangedAtRef = useRef(timeSigChangedAt);
  timeSigChangedAtRef.current = timeSigChangedAt;

  // 헤더 폭 계산 — ScoreRenderer의 MeasureRender/PartRender와 완전히 동일한 로직
  const measureContentX = useCallback(
    (measureX: number, posInRow: number, mIdx?: number): number => {
      const showClef = posInRow === 0;
      // ScoreRenderer.PartRender와 동일: posInRow===0이거나 박자표 변경 마디
      const showTimeSig = posInRow === 0 || (mIdx !== undefined && timeSigChangedAtRef.current.has(mIdx));
      const sharps = docRef.current.keySignature?.sharps ?? 0;
      const clef = clefRef.current;
      let cx = measureX + 4;
      if (showClef) cx += CLEF_WIDTH[clef] + 4;
      if (Math.abs(sharps) > 0) cx += Math.abs(sharps) * KEY_SIG_ACCIDENTAL_WIDTH + 4;
      if (showTimeSig) cx += TIME_SIG_WIDTH + 4;
      return cx;
    },
    [],
  );

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

            // X 좌표 → 삽입 위치 계산 (ScoreRenderer 파이프라인 동기화)
            const measure = docRef.current.parts[selectedPartIdxRef.current]?.measures[mIdx];
            const contentX = measureContentX(accX, i, mIdx);
            const contentWidth = Math.max(mWidth - (contentX - accX), 1);
            const positions = measure
              ? layoutMeasure(measure, 0, clefRef.current, contentWidth)
              : [];
            const nElements = measure?.elements.length ?? 0;

            // 각 음표 위치 사이에서 insertIdx 산출
            let insertIdx = nElements; // 기본값: 마지막
            if (positions.length > 0) {
              const relX = lx - contentX;
              for (let ei = 0; ei < positions.length; ei++) {
                const midpoint = ei === 0
                  ? positions[ei].x / 2
                  : (positions[ei - 1].x + (positions[ei - 1].width ?? 0) / 2 + positions[ei].x) / 2;
                if (relX <= midpoint) { insertIdx = ei; break; }
              }
            }

            return { x: lx, y: ly, staffY, noteY, pitch: finalPitch, measureIdx: mIdx, insertIdx };
          }
          accX += mWidth;
        }
      }
      return null;
    },
    [measureContentX],
  );

  // 선택 모드: 가장 가까운 음표 hitTest — ScoreRenderer 파이프라인과 동일한 좌표 사용
  const hitTestElement = useCallback(
    (lx: number, ly: number): { elementId: string; measureIdx: number } | null => {
      const HIT_RADIUS = 24;
      for (const row of rowsRef.current) {
        const rowBottom = row.y + SCORE_PART_HEIGHT;
        if (ly < row.y || ly > rowBottom) continue;

        let accX = 0;
        for (let i = 0; i < row.measureIndices.length; i++) {
          const mIdx = row.measureIndices[i];
          const mWidth = row.measureWidths[i] ?? 0;
          if (lx >= accX && lx <= accX + mWidth) {
            const staffY = row.y + SCORE_STAFF_PADDING_TOP;
            const measure = docRef.current.parts[selectedPartIdxRef.current]?.measures[mIdx];
            if (!measure || measure.elements.length === 0) {
              onMeasureTap(mIdx);
              return null;
            }
            // ScoreRenderer와 동일한 contentX 계산 (박자표 변경 마디 포함)
            const contentX = measureContentX(accX, i, mIdx);
            const contentWidth = Math.max(mWidth - (contentX - accX), 1);
            // ScoreRenderer와 동일한 layoutMeasure 결과로 실제 음표 x 위치 계산
            const positions = layoutMeasure(measure, 0, clefRef.current, contentWidth);

            let bestDist = HIT_RADIUS;
            let bestId: string | null = null;
            for (const pos of positions) {
              const el = measure.elements.find((e) => e.id === pos.elementId);
              if (!el) continue;
              const absX = contentX + pos.x;
              const noteY =
                el.type === "note"
                  ? staffY + pitchToY(el.pitch, clefRef.current)
                  : staffY + STAFF_HEIGHT / 2;
              const dist = Math.sqrt((lx - absX) ** 2 + (ly - noteY) ** 2);
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
    [measureContentX, onMeasureTap],
  );

  // 마디 인덱스만 찾는 hitTest (롱프레스용)
  const hitTestMeasure = useCallback(
    (lx: number, ly: number): number | null => {
      for (const row of rowsRef.current) {
        const rowBottom = row.y + SCORE_PART_HEIGHT;
        if (ly < row.y || ly > rowBottom) continue;
        let accX = 0;
        for (let i = 0; i < row.measureIndices.length; i++) {
          const mIdx = row.measureIndices[i];
          const mWidth = row.measureWidths[i] ?? 0;
          if (lx >= accX && lx <= accX + mWidth) return mIdx;
          accX += mWidth;
        }
      }
      return null;
    },
    [],
  );

  const panResponder = useMemo(() => {
    let tapStartX = 0;
    let tapStartY = 0;
    let isMoving = false;
    let didLongPress = false;
    let longPressTimer: ReturnType<typeof setTimeout> | null = null;

    const clearLongPress = () => {
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    };

    return PanResponder.create({
      // 모든 도구에서 터치 시작 시 캡처 — 단일 PanResponder 레이어로 탭/드래그 통합 처리
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // 드래그 중이 아니면 ScrollView에 양보하여 스크롤 허용
      onPanResponderTerminationRequest: () => !dragElementIdRef.current,

      onPanResponderGrant: (e) => {
        const { locationX: lx, locationY: ly } = e.nativeEvent;
        tapStartX = lx;
        tapStartY = ly;
        isMoving = false;
        didLongPress = false;
        dragElementIdRef.current = null;
        dragMeasureIdxRef.current = -1;

        // 롱프레스 타이머 시작 (500ms)
        clearLongPress();
        longPressTimer = setTimeout(() => {
          longPressTimer = null;
          if (!isMoving && onMeasureLongPressRef.current) {
            const mIdx = hitTestMeasure(lx, ly);
            if (mIdx !== null) {
              didLongPress = true;
              onMeasureLongPressRef.current(mIdx);
            }
          }
        }, 500);

        if (activeToolRef.current === "note" || activeToolRef.current === "rest") {
          setGhost(touchToGhost(lx, ly));
        } else if (activeToolRef.current === "select" && selectedElementIdRef.current) {
          // 선택된 음표의 드래그 시작점 기록
          const hit = hitTestElement(lx, ly);
          if (hit && hit.elementId === selectedElementIdRef.current) {
            dragElementIdRef.current = hit.elementId;
            dragMeasureIdxRef.current = hit.measureIdx;
            // 드래그 시 기존 accidental 보존 — 팔레트 accidental이 변경되더라도 유지
            const d = docRef.current;
            const pIdx = selectedPartIdxRef.current;
            const m = d.parts[pIdx]?.measures[hit.measureIdx];
            const el = m?.elements.find((e) => e.id === hit.elementId);
            dragOriginalAccidentalRef.current =
              el?.type === "note" ? el.pitch.accidental : undefined;
          }
        }
      },

      onPanResponderMove: (e) => {
        const { locationX: lx, locationY: ly } = e.nativeEvent;
        const dx = lx - tapStartX;
        const dy = ly - tapStartY;
        if (Math.sqrt(dx * dx + dy * dy) > 8) { isMoving = true; clearLongPress(); }

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
        clearLongPress();
        const { locationX: lx, locationY: ly } = e.nativeEvent;
        setGhost(null);

        // 롱프레스로 컨텍스트 메뉴가 열렸으면 탭/도구 액션 억제
        if (didLongPress) {
          didLongPress = false;
          dragElementIdRef.current = null;
          dragMeasureIdxRef.current = -1;
          return;
        }

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
          const hit = hitTestElement(lx, ly);
          if (hit) onEraseElement(hit.elementId, hit.measureIdx);
        } else if (tool === "select") {
          if (isMoving && dragElementIdRef.current && dragMeasureIdxRef.current >= 0) {
            const info = touchToGhost(lx, ly);
            if (info) {
              const origAcc = dragOriginalAccidentalRef.current;
              const finalPitch: Pitch =
                origAcc !== undefined
                  ? { ...info.pitch, accidental: origAcc ?? undefined }
                  : { ...info.pitch, accidental: undefined };
              onNoteMoveRef.current?.(
                dragElementIdRef.current,
                dragMeasureIdxRef.current,
                finalPitch,
              );
            }
            dragElementIdRef.current = null;
            dragMeasureIdxRef.current = -1;
            dragOriginalAccidentalRef.current = undefined;
          } else if (!isMoving) {
            const hit = hitTestElement(lx, ly);
            if (hit) onElementTap(hit.elementId, hit.measureIdx);
          }
        }
      },

      onPanResponderTerminate: () => {
        clearLongPress();
        setGhost(null);
        dragElementIdRef.current = null;
        dragMeasureIdxRef.current = -1;
      },
    });
  }, [touchToGhost, hitTestElement, hitTestMeasure, onNotePlaced, onRestPlaced, onEraseElement, onElementTap]);

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
        playheadMeasureIdx={playheadMeasureIdx}
        playheadFraction={playheadFraction}
        showPlayhead={showPlayhead}
        highlightColor={highlightColor}
      />

      {/* 터치 + 가이드선 + 고스트 SVG 오버레이
          View로 감싸서 panHandlers를 View에 붙임 —
          웹에서 SVG에 직접 panHandlers를 붙이면 포인터 이벤트가 차단됨 */}
      <View
        style={{ position: "absolute", top: 0, left: 0, width: containerWidth, height: svgH }}
        {...panResponder.panHandlers}
      >
        <Svg
          width={containerWidth}
          height={svgH}
          style={StyleSheet.absoluteFillObject}
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
      </View>

      {/* 돋보기 미니뷰 — 터치 주변 3배 확대 */}
      {ghost && (activeTool === "note" || activeTool === "rest") && (
        <View
          style={[styles.magnifier, { backgroundColor: C.surface, borderColor: C.accent }]}
          pointerEvents="none"
        >
          <MagnifierView
            ghost={ghost}
            duration={dur}
            activeTool={activeTool}
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
  ghost,
  duration,
  activeTool,
  accentColor,
}: {
  ghost: GhostState;
  duration: NoteDuration;
  activeTool: EditorTool;
  accentColor: string;
}) {
  // 터치 주변 30×30 픽셀 영역을 90×90에 표시 = 3배 확대
  const MAG_SIZE = 90;
  const VIEW_HALF = 15; // 30px 영역의 절반

  const vbX = ghost.x - VIEW_HALF;
  const vbY = ghost.y - VIEW_HALF;
  const vbW = VIEW_HALF * 2;
  const vbH = VIEW_HALF * 2;

  const isOpen =
    duration === "whole" ||
    duration === "half" ||
    duration === "whole_dot" ||
    duration === "half_dot";

  const label = activeTool === "note" ? pitchLabel(ghost.pitch) : "";

  return (
    <Svg
      width={MAG_SIZE}
      height={MAG_SIZE}
      viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
    >
      {/* 오선 5개 — 실제 staffY 기준 */}
      {Array.from({ length: 5 }, (_, i) => (
        <Line
          key={i}
          x1={vbX}
          y1={ghost.staffY + i * LINE_SPACING}
          x2={vbX + vbW}
          y2={ghost.staffY + i * LINE_SPACING}
          stroke={accentColor}
          strokeWidth={0.5}
          opacity={0.5}
        />
      ))}

      {/* 세로 기준선 (삽입 위치 표시) */}
      <Line
        x1={ghost.x}
        y1={vbY}
        x2={ghost.x}
        y2={vbY + vbH}
        stroke={accentColor}
        strokeWidth={0.3}
        strokeDasharray="1,1"
        opacity={0.4}
      />

      {/* 음표 또는 쉼표 고스트 */}
      {activeTool === "note" ? (
        <Ellipse
          cx={ghost.x}
          cy={ghost.noteY}
          rx={NOTE_HEAD_RX}
          ry={NOTE_HEAD_RY}
          fill={isOpen ? "none" : accentColor}
          stroke={accentColor}
          strokeWidth={0.8}
          opacity={0.9}
        />
      ) : (
        <Rect
          x={ghost.x - 4}
          y={ghost.staffY + LINE_SPACING * 2 - 2}
          width={8}
          height={3}
          fill={accentColor}
          opacity={0.9}
        />
      )}

      {/* 음이름 레이블 — viewBox 좌표계에서 하단 */}
      {label ? (
        <SvgText
          x={ghost.x}
          y={vbY + vbH - 1}
          fontSize={5}
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
