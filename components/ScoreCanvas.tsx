// ============================================================
// ScoreCanvas — 터치 가능한 오선보
// 고스트 음표 + XY 점선 가이드 + 돋보기 미니뷰
// ============================================================

import React, { useMemo, useRef, useCallback, useState } from "react";
import { View, PanResponder, StyleSheet } from "react-native";
import Svg, { Line, Ellipse, G, Rect, Text as SvgText } from "react-native-svg";
import { useTheme } from "@/contexts/ThemeContext";
import { previewScoreNote, previewScoreDrum } from "@/lib/score-audio";
import { applyNotePreviewOnRelease } from "@/lib/score-canvas-helpers";
import { pitchToMidi } from "@/lib/score-layout";
import { ScoreRenderer } from "@/components/ScoreRenderer";
import {
  computeScoreLayout,
  yToPitch,
  pitchToY,
  noteStaffY,
  drumTypeToY,
  yToDrumType,
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
import { BASE_LINE_SPACING, scoreScaleFactor } from "@/lib/score-scale";
import type {
  ScoreDocument,
  Pitch,
  NoteDuration,
  ClefType,
  Accidental,
  DrumType,
} from "@/lib/score-types";
import { DRUM_MAP } from "@/lib/score-types";

// ── 음이름 변환 ───────────────────────────────────────────────

function pitchLabel(pitch: Pitch): string {
  const acc =
    pitch.accidental === "sharp" ? "♯" :
    pitch.accidental === "flat" ? "♭" :
    pitch.accidental === "double_sharp" ? "𝄪" :
    pitch.accidental === "double_flat" ? "𝄫" : "";
  return `${pitch.step}${acc}${pitch.octave}`;
}

const DRUM_SHORT_LABEL: Record<DrumType, string> = {
  crash: "Crash",
  ride: "Ride",
  hihat_open: "H.H. Open",
  hihat_closed: "H.H.",
  tom_high: "Tom H",
  tom_mid: "Tom M",
  snare: "Snare",
  tom_low: "Tom L",
  kick: "Kick",
};

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
  /** 마디 content 영역 시작 기준 X (논리 px) — 자유 배치 레이아웃 오버라이드 저장용 */
  measureRelX: number;
  /** 돋보기 미니뷰에 함께 그릴 주변(같은 마디) 기존 음표/쉼표 — 정확한 배치를 위한 참조용 */
  nearbyElements: NearbyElement[];
  /** 타악기(percussion) 파트에서 선택된 드럼 종류 — 지정 시 pitch/noteY는 이 값에서 파생됨 */
  drumType?: DrumType;
}

interface NearbyElement {
  x: number;
  y: number;
  type: "note" | "rest";
  duration: NoteDuration;
}

function isOpenNoteHead(duration: NoteDuration): boolean {
  return (
    duration === "whole" ||
    duration === "half" ||
    duration === "whole_dot" ||
    duration === "half_dot"
  );
}

export interface ScoreCanvasProps {
  doc: ScoreDocument;
  containerWidth: number;
  selectedElementId: string | null;
  multiSelectIds?: string[];
  selectedPartIdx: number;
  /** 현재 선택된 마디 인덱스 — 선택된 마디를 시각적으로 하이라이트하는 데 사용 (null이면 선택 없음) */
  selectedMeasureIdx?: number | null;
  /** 다중 선택된 마디 인덱스 목록 — 복사/이동 등 배치 작업 대상 하이라이트에 사용 */
  multiSelectMeasureIndices?: number[];
  activeTool: EditorTool;
  activeDuration: NoteDuration;
  isDotted: boolean;
  accidental: Accidental | null;
  onNotePlaced: (measureIdx: number, pitch: Pitch, duration: NoteDuration, insertIdx: number, placedX: number, drumType?: DrumType) => void;
  /** 타악기(percussion) 파트에서 현재 선택된 드럼 종류 — 지정 시 터치 Y좌표를 무시하고 표준 오선 위치에 배치 */
  selectedDrumType?: DrumType;
  onRestPlaced: (measureIdx: number, duration: NoteDuration, insertIdx: number, placedX: number) => void;
  onElementTap: (elementId: string, measureIdx: number) => void;
  onMeasureTap: (measureIdx: number) => void;
  onMeasureLongPress?: (measureIdx: number) => void;
  onEraseElement: (elementId: string, measureIdx: number) => void;
  onEraseMultiple?: (elements: Array<{elementId: string; measureIdx: number}>) => void;
  onNoteMoved?: (elementId: string, measureIdx: number, newPitch: Pitch) => void;
  /** 잇단음표 브래킷/숫자를 탭했을 때 호출 — 그룹 전체 elementIds를 전달 (다중 선택용) */
  onTupletBracketTap?: (elementIds: string[]) => void;
  // 재생 연동
  playheadMeasureIdx?: number;
  playheadFraction?: number;
  showPlayhead?: boolean;
  highlightColor?: string;
  /** 화면 크기에 맞는 line spacing (px). 기본값 = 10. useScoreLineSpacing()으로 계산. */
  lineSpacing?: number;
  /** 재생 중일 때 true — 음표 입력 미리 듣기를 억제합니다 */
  isPlaying?: boolean;
  /** false이면 음표 입력 시 미리 듣기 소리를 내지 않습니다 (기본값: true) */
  notePreviewEnabled?: boolean;
  /** 현재 선택된 악기 ID — 미리 듣기 음색 결정에 사용 */
  instrumentId?: string;
  /** 스텝 입력 커서 — 다음 음표가 삽입될 마디 인덱스 (null이면 커서 비활성) */
  cursorMeasureIdx?: number | null;
  /** 스텝 입력 커서 — 다음 음표가 삽입될 마디 내 요소 인덱스 */
  cursorInsertIdx?: number;
  /** true이면 터치 입력(음표 배치/드래그/지우기 등)을 모두 무시합니다 — 마디 설정 메뉴 등 오버레이가 열려 있을 때 사용 */
  disabled?: boolean;
  /** 줄당 마디 수를 강제 지정 (예: 화면 방향에 따라 세로=1, 가로=2). 지정 시 doc.measuresPerLine보다 우선 적용됩니다. */
  measuresPerLineOverride?: number;
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────

export function ScoreCanvas({
  doc,
  containerWidth,
  selectedElementId,
  multiSelectIds,
  selectedPartIdx,
  selectedMeasureIdx = null,
  multiSelectMeasureIndices,
  activeTool,
  activeDuration,
  isDotted,
  accidental,
  onNotePlaced,
  selectedDrumType,
  onRestPlaced,
  onElementTap,
  onMeasureTap,
  onMeasureLongPress,
  onEraseElement,
  onEraseMultiple,
  onNoteMoved,
  onTupletBracketTap,
  playheadMeasureIdx,
  playheadFraction = 0,
  showPlayhead = true,
  highlightColor,
  lineSpacing = BASE_LINE_SPACING,
  isPlaying = false,
  notePreviewEnabled = true,
  instrumentId,
  cursorMeasureIdx = null,
  cursorInsertIdx = 0,
  disabled = false,
  measuresPerLineOverride,
}: ScoreCanvasProps) {
  const { colors: C } = useTheme();
  const [ghost, setGhost] = useState<GhostState | null>(null);

  // 마디 설정 메뉴 등 오버레이가 열리면(disabled=true) 남아있는 고스트 미리보기를 즉시 제거
  React.useEffect(() => {
    if (disabled) setGhost(null);
  }, [disabled]);

  // SVG 스케일 팩터: 물리 터치 좌표 ↔ 레이아웃 좌표 변환에 사용
  const sf = scoreScaleFactor(lineSpacing);
  const sfRef = useRef(sf);
  sfRef.current = sf;
  // 레이아웃 계산에 사용하는 논리 너비 (LINE_SPACING=10 기반)
  const layoutWidth = containerWidth / sf;

  // refs를 통해 PanResponder 클로저에서 최신 값 참조
  const activeToolRef = useRef(activeTool);
  const activeDurationRef = useRef(activeDuration);
  const isDottedRef = useRef(isDotted);
  const accidentalRef = useRef(accidental);
  const selectedElementIdRef = useRef(selectedElementId);
  const onNoteMoveRef = useRef(onNoteMoved);
  const onMeasureLongPressRef = useRef(onMeasureLongPress);
  const onEraseMultipleRef = useRef(onEraseMultiple);
  const onTupletBracketTapRef = useRef(onTupletBracketTap);
  const docRef = useRef(doc);
  const selectedPartIdxRef = useRef(selectedPartIdx);
  const selectedDrumTypeRef = useRef(selectedDrumType);
  selectedDrumTypeRef.current = selectedDrumType;
  activeToolRef.current = activeTool;
  activeDurationRef.current = activeDuration;
  isDottedRef.current = isDotted;
  accidentalRef.current = accidental;
  selectedElementIdRef.current = selectedElementId;
  onNoteMoveRef.current = onNoteMoved;
  onMeasureLongPressRef.current = onMeasureLongPress;
  onEraseMultipleRef.current = onEraseMultiple;
  onTupletBracketTapRef.current = onTupletBracketTap;
  docRef.current = doc;
  selectedPartIdxRef.current = selectedPartIdx;

  // 커서 refs — PanResponder 클로저에서 최신값 참조
  const cursorMeasureIdxRef = useRef(cursorMeasureIdx);
  const cursorInsertIdxRef = useRef(cursorInsertIdx);
  cursorMeasureIdxRef.current = cursorMeasureIdx;
  cursorInsertIdxRef.current = cursorInsertIdx;

  // 음표 드래그 상태 refs
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  const notePreviewEnabledRef = useRef(notePreviewEnabled);
  notePreviewEnabledRef.current = notePreviewEnabled;

  const instrumentIdRef = useRef(instrumentId);
  instrumentIdRef.current = instrumentId;

  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  const dragElementIdRef = useRef<string | null>(null);
  const dragMeasureIdxRef = useRef<number>(-1);
  // 드래그 시작 시 원래 음표의 accidental 보존 (이동 중 팔레트 accidental 변경 방지)
  const dragOriginalAccidentalRef = useRef<Accidental | null | undefined>(undefined);

  const { rows, totalHeight } = useMemo(
    () => computeScoreLayout(doc, layoutWidth, measuresPerLineOverride),
    [doc, layoutWidth, measuresPerLineOverride],
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

  // ScoreRenderer.PartRender와 동일한 음자리표/조표 변경 감지
  const effectiveClefAtMeasure = useMemo(() => {
    const map = new Map<number, ClefType>();
    let eff: ClefType = clef;
    const allMeasureIndices = rows.flatMap((r) => r.measureIndices);
    for (const mIdx of allMeasureIndices) {
      const m = doc.parts[selectedPartIdx]?.measures[mIdx];
      if (m?.clef) eff = m.clef;
      map.set(mIdx, eff);
    }
    return map;
  }, [doc, rows, selectedPartIdx, clef]);
  const effectiveClefAtMeasureRef = useRef(effectiveClefAtMeasure);
  effectiveClefAtMeasureRef.current = effectiveClefAtMeasure;

  const effectiveSharpsAtMeasure = useMemo(() => {
    const map = new Map<number, number>();
    let eff = doc.keySignature?.sharps ?? 0;
    const allMeasureIndices = rows.flatMap((r) => r.measureIndices);
    for (const mIdx of allMeasureIndices) {
      const m = doc.parts[selectedPartIdx]?.measures[mIdx];
      if (m?.keySignature) eff = m.keySignature.sharps;
      map.set(mIdx, eff);
    }
    return map;
  }, [doc, rows, selectedPartIdx]);
  const effectiveSharpsAtMeasureRef = useRef(effectiveSharpsAtMeasure);
  effectiveSharpsAtMeasureRef.current = effectiveSharpsAtMeasure;

  const clefChangedAtCanvas = useMemo(() => {
    const changed = new Set<number>();
    let prev: ClefType = clef;
    for (const [mIdx, eff] of effectiveClefAtMeasure) {
      if (eff !== prev) { changed.add(mIdx); prev = eff; }
    }
    return changed;
  }, [effectiveClefAtMeasure, clef]);
  const clefChangedAtCanvasRef = useRef(clefChangedAtCanvas);
  clefChangedAtCanvasRef.current = clefChangedAtCanvas;

  const keySigChangedAtCanvas = useMemo(() => {
    const changed = new Set<number>();
    let prev = doc.keySignature?.sharps ?? 0;
    for (const [mIdx, eff] of effectiveSharpsAtMeasure) {
      if (eff !== prev) { changed.add(mIdx); prev = eff; }
    }
    return changed;
  }, [effectiveSharpsAtMeasure, doc.keySignature?.sharps]);
  const keySigChangedAtCanvasRef = useRef(keySigChangedAtCanvas);
  keySigChangedAtCanvasRef.current = keySigChangedAtCanvas;

  // 헤더 폭 계산 — ScoreRenderer의 MeasureRender/PartRender와 완전히 동일한 로직
  const measureContentX = useCallback(
    (measureX: number, posInRow: number, mIdx?: number): number => {
      // 행 첫 마디이거나 이 마디에서 음자리표가 바뀐 경우 음자리표 표시
      const showClef = posInRow === 0 || (mIdx !== undefined && clefChangedAtCanvasRef.current.has(mIdx));
      // 박자표: 악보 첫 마디(mIdx===0)이거나 박자표 변경 마디 (매 행 반복 안 함)
      const showTimeSig = mIdx === 0 || (mIdx !== undefined && timeSigChangedAtRef.current.has(mIdx));
      // 조표: 행 첫 마디이거나 조표 변경 마디 (매 행 반복)
      const showKeySig = posInRow === 0 || (mIdx !== undefined && keySigChangedAtCanvasRef.current.has(mIdx));
      const effClef = (mIdx !== undefined ? effectiveClefAtMeasureRef.current.get(mIdx) : undefined) ?? clefRef.current;
      const effSharps = (mIdx !== undefined ? effectiveSharpsAtMeasureRef.current.get(mIdx) : undefined) ?? (docRef.current.keySignature?.sharps ?? 0);
      let cx = measureX + 4;
      if (showClef) cx += CLEF_WIDTH[effClef] + 4;
      if (showKeySig && Math.abs(effSharps) > 0) cx += Math.abs(effSharps) * KEY_SIG_ACCIDENTAL_WIDTH + 4;
      if (showTimeSig) cx += TIME_SIG_WIDTH + 4;
      return cx;
    },
    [],
  );

  // 커서 SVG 좌표 계산 — cursorMeasureIdx/cursorInsertIdx → (x, staffY)
  const { cursorSvgX, cursorSvgStaffY } = useMemo(() => {
    if (cursorMeasureIdx == null) return { cursorSvgX: null, cursorSvgStaffY: null };
    for (const row of rows) {
      let accX = 0;
      for (let i = 0; i < row.measureIndices.length; i++) {
        const mIdx = row.measureIndices[i];
        const mWidth = row.measureWidths[i] ?? 0;
        if (mIdx === cursorMeasureIdx) {
          const cx = measureContentX(accX, i, mIdx);
          const measure = doc.parts[selectedPartIdx]?.measures[mIdx];
          const cw = Math.max(mWidth - (cx - accX), 1);
          const positions = measure
            ? layoutMeasure(measure, 0, clef, cw, docRef.current.layoutOverrides?.[measure.id])
            : [];
          let cxPos: number;
          if (positions[cursorInsertIdx]) {
            cxPos = cx + positions[cursorInsertIdx].x;
          } else if (positions.length > 0) {
            const last = positions[positions.length - 1];
            cxPos = cx + last.x + (last.width ?? 24) + 4;
          } else {
            cxPos = cx + 4;
          }
          return { cursorSvgX: cxPos, cursorSvgStaffY: row.y + SCORE_STAFF_PADDING_TOP };
        }
        accX += mWidth;
      }
    }
    return { cursorSvgX: null, cursorSvgStaffY: null };
  }, [cursorMeasureIdx, cursorInsertIdx, rows, doc, selectedPartIdx, clef, measureContentX]);

  // 터치 좌표 → 마디 인덱스 + 음높이 + 삽입 위치(insertIdx)
  // 자유 배치 입력: 손가락 위치(X,Y) 그대로 마디·음높이·삽입위치 결정
  const touchToGhost = useCallback(
    (lx: number, ly: number): GhostState | null => {
      // 덧줄 영역까지 터치 인식하도록 행 경계를 확장 (위아래로 4줄 추가)
      const LEDGER_EXTRA = LINE_SPACING * 4;

      // ── 자유 배치: 탭 위치 그대로 사용 ──
      for (const row of rowsRef.current) {
        const rowBottom = row.y + SCORE_PART_HEIGHT;
        if (ly < row.y - LEDGER_EXTRA || ly > rowBottom + LEDGER_EXTRA) continue;

        let accX = 0;
        for (let i = 0; i < row.measureIndices.length; i++) {
          const mIdx = row.measureIndices[i];
          const mWidth = row.measureWidths[i] ?? 0;
          if (lx >= accX && lx <= accX + mWidth) {
            const staffY = row.y + SCORE_STAFF_PADDING_TOP;
            const staffRelY = ly - staffY;
            const effClefGhost = effectiveClefAtMeasureRef.current.get(mIdx) ?? clefRef.current;
            const isPercussionGhost = effClefGhost === "percussion";
            const ghostDrumType = isPercussionGhost
              ? (selectedDrumTypeRef.current ?? yToDrumType(staffRelY))
              : undefined;
            const pitch = isPercussionGhost
              ? yToPitch(ghostDrumType ? drumTypeToY(ghostDrumType) : staffRelY, effClefGhost)
              : yToPitch(staffRelY, effClefGhost);
            const acc = accidentalRef.current;
            const finalPitch: Pitch =
              acc != null && acc !== "natural"
                ? { ...pitch, accidental: acc }
                : pitch;
            const noteY = isPercussionGhost && ghostDrumType
              ? staffY + drumTypeToY(ghostDrumType)
              : staffY + pitchToY(finalPitch, effClefGhost);

            const measure = docRef.current.parts[selectedPartIdxRef.current]?.measures[mIdx];
            const contentX = measureContentX(accX, i, mIdx);
            const contentWidth = Math.max(mWidth - (contentX - accX), 1);
            const positions = measure
              ? layoutMeasure(measure, 0, effClefGhost, contentWidth, docRef.current.layoutOverrides?.[measure.id])
              : [];
            const nElements = measure?.elements.length ?? 0;

            let insertIdx = nElements;
            if (positions.length > 0) {
              const relX = lx - contentX;
              for (let ei = 0; ei < positions.length; ei++) {
                const midpoint = ei === 0
                  ? positions[ei].x / 2
                  : (positions[ei - 1].x + (positions[ei - 1].width ?? 0) / 2 + positions[ei].x) / 2;
                if (relX <= midpoint) { insertIdx = ei; break; }
              }
            }

            const measureRelX = Math.max(0, lx - contentX);
            const nearbyElements: NearbyElement[] = measure
              ? positions
                  .map((pos): NearbyElement | null => {
                    const el = measure.elements.find((e) => e.id === pos.elementId);
                    if (!el) return null;
                    return {
                      x: contentX + pos.x,
                      y: staffY + pos.y,
                      type: el.type,
                      duration: el.duration,
                    };
                  })
                  .filter((v): v is NearbyElement => v != null)
              : [];
            return { x: lx, y: ly, staffY, noteY, pitch: finalPitch, measureIdx: mIdx, insertIdx, measureRelX, nearbyElements, drumType: ghostDrumType };
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
            const effClefHit = effectiveClefAtMeasureRef.current.get(mIdx) ?? clefRef.current;
            const positions = layoutMeasure(measure, 0, effClefHit, contentWidth, docRef.current.layoutOverrides?.[measure.id]);

            let bestDist = HIT_RADIUS;
            let bestId: string | null = null;
            for (const pos of positions) {
              const el = measure.elements.find((e) => e.id === pos.elementId);
              if (!el) continue;
              const absX = contentX + pos.x;
              const noteY =
                el.type === "note"
                  ? staffY + noteStaffY(el, effClefHit)
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

  // 잇단음표 브래킷/숫자 hitTest — 탭 시 그룹 전체를 다중 선택 (ScoreRenderer의 브래킷 렌더링과 동일 좌표)
  const hitTestTupletBracket = useCallback(
    (lx: number, ly: number): string[] | null => {
      const TUPLET_HIT_PAD = 10;
      for (const row of rowsRef.current) {
        const rowBottom = row.y + SCORE_PART_HEIGHT;
        if (ly < row.y || ly > rowBottom) continue;

        let accX = 0;
        for (let i = 0; i < row.measureIndices.length; i++) {
          const mIdx = row.measureIndices[i];
          const mWidth = row.measureWidths[i] ?? 0;
          if (lx >= accX && lx <= accX + mWidth) {
            const measure = docRef.current.parts[selectedPartIdxRef.current]?.measures[mIdx];
            if (!measure?.tuplets?.length) return null;
            const staffY = row.y + SCORE_STAFF_PADDING_TOP;
            const contentX = measureContentX(accX, i, mIdx);
            const contentWidth = Math.max(mWidth - (contentX - accX), 1);
            const effClefHit = effectiveClefAtMeasureRef.current.get(mIdx) ?? clefRef.current;
            const positions = layoutMeasure(measure, 0, effClefHit, contentWidth, docRef.current.layoutOverrides?.[measure.id]);

            for (const group of measure.tuplets) {
              const groupPositions = group.elementIds
                .map((id) => positions.find((p) => p.elementId === id))
                .filter((p): p is NonNullable<typeof p> => !!p);
              if (groupPositions.length < 2) continue;
              const first = groupPositions[0];
              const last = groupPositions[groupPositions.length - 1];
              const minRelY = Math.min(...groupPositions.map((p) => p.y));
              const bracketY = staffY + minRelY - 14;
              const x1 = contentX + first.x - first.width / 2 + 2;
              const x2 = contentX + last.x + last.width / 2 - 2;
              if (
                lx >= x1 - TUPLET_HIT_PAD &&
                lx <= x2 + TUPLET_HIT_PAD &&
                ly >= bracketY - TUPLET_HIT_PAD &&
                ly <= bracketY + TUPLET_HIT_PAD
              ) {
                return group.elementIds;
              }
            }
            return null;
          }
          accX += mWidth;
        }
      }
      return null;
    },
    [measureContentX],
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

    // 지우개 드래그 범위 삭제용 누적 목록
    let eraseHitsList: Array<{elementId: string; measureIdx: number}> = [];
    const eraseHitIds = new Set<string>();

    return PanResponder.create({
      // 모든 도구에서 터치 시작 시 캡처 — 단일 PanResponder 레이어로 탭/드래그 통합 처리
      // disabled(마디 설정 메뉴 등 오버레이가 열려 있는 동안)일 때는 아예 응답하지 않음 → 음표 입력 차단
      // 2손가락 이상 터치는 스크롤 제스처로 간주하여 응답하지 않고 부모 ScrollView에 양보
      onStartShouldSetPanResponder: (e) => !disabledRef.current && e.nativeEvent.touches.length <= 1,
      onMoveShouldSetPanResponder: (e) => !disabledRef.current && e.nativeEvent.touches.length <= 1,
      // 드래그 중이 아니면 ScrollView에 양보하여 스크롤 허용
      onPanResponderTerminationRequest: () => !dragElementIdRef.current,

      onPanResponderGrant: (e) => {
        if (disabledRef.current) return;
        const { locationX: lx, locationY: ly } = e.nativeEvent;
        // 물리 터치 좌표 → 레이아웃 좌표 (LINE_SPACING=10 기반)
        const scale = sfRef.current;
        const slx = lx / scale;
        const sly = ly / scale;
        tapStartX = slx;
        tapStartY = sly;
        isMoving = false;
        didLongPress = false;
        dragElementIdRef.current = null;
        dragMeasureIdxRef.current = -1;
        eraseHitsList = [];
        eraseHitIds.clear();

        // 롱프레스 타이머 시작 (500ms)
        clearLongPress();
        longPressTimer = setTimeout(() => {
          longPressTimer = null;
          if (!isMoving && onMeasureLongPressRef.current) {
            const mIdx = hitTestMeasure(slx, sly);
            if (mIdx !== null) {
              didLongPress = true;
              onMeasureLongPressRef.current(mIdx);
            }
          }
        }, 500);

        if (activeToolRef.current === "note" || activeToolRef.current === "rest") {
          setGhost(touchToGhost(slx, sly));
        } else if (activeToolRef.current === "select" && selectedElementIdRef.current) {
          // 선택된 음표의 드래그 시작점 기록
          const hit = hitTestElement(slx, sly);
          if (hit && hit.elementId === selectedElementIdRef.current) {
            dragElementIdRef.current = hit.elementId;
            dragMeasureIdxRef.current = hit.measureIdx;
            // 음표 드래그 시작 → 롱프레스 타이머 즉시 취소 (마디 설정창 오발동 방지)
            clearLongPress();
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
        if (disabledRef.current) return;
        const { locationX: lx, locationY: ly } = e.nativeEvent;
        const scale = sfRef.current;
        const slx = lx / scale;
        const sly = ly / scale;
        const dx = slx - tapStartX;
        const dy = sly - tapStartY;
        if (Math.sqrt(dx * dx + dy * dy) > 8) { isMoving = true; clearLongPress(); }

        if (activeToolRef.current === "note" || activeToolRef.current === "rest") {
          setGhost(touchToGhost(slx, sly));
        } else if (
          activeToolRef.current === "select" &&
          dragElementIdRef.current &&
          isMoving
        ) {
          // 선택된 음표 드래그: 고스트로 새 음높이 미리 보기
          setGhost(touchToGhost(slx, sly));
        } else if (activeToolRef.current === "erase" && isMoving) {
          // 지우개 드래그: 이동 경로의 모든 요소 누적
          const eraseHit = hitTestElement(slx, sly);
          if (eraseHit && !eraseHitIds.has(eraseHit.elementId)) {
            eraseHitIds.add(eraseHit.elementId);
            eraseHitsList.push(eraseHit);
          }
        }
      },

      onPanResponderRelease: (e) => {
        clearLongPress();
        if (disabledRef.current) {
          setGhost(null);
          didLongPress = false;
          dragElementIdRef.current = null;
          dragMeasureIdxRef.current = -1;
          eraseHitsList = [];
          eraseHitIds.clear();
          return;
        }
        const { locationX: lx, locationY: ly } = e.nativeEvent;
        const scale = sfRef.current;
        const slx = lx / scale;
        const sly = ly / scale;
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
          const info = touchToGhost(slx, sly);
          if (info) {
            if (notePreviewEnabledRef.current && !isPlayingRef.current) {
              if (info.drumType) {
                previewScoreDrum(info.drumType);
              } else {
                applyNotePreviewOnRelease(isPlayingRef.current, pitchToMidi(info.pitch), previewScoreNote, instrumentIdRef.current);
              }
            }
            onNotePlaced(info.measureIdx, info.pitch, dur, info.insertIdx, info.measureRelX, info.drumType);
          }
        } else if (tool === "rest") {
          const info = touchToGhost(slx, sly);
          if (info) onRestPlaced(info.measureIdx, dur, info.insertIdx, info.measureRelX);
        } else if (tool === "erase") {
          if (eraseHitsList.length > 0) {
            // 드래그 범위 일괄 삭제
            onEraseMultipleRef.current?.(eraseHitsList);
          } else {
            // 탭 단일 삭제
            const hit = hitTestElement(slx, sly);
            if (hit) onEraseElement(hit.elementId, hit.measureIdx);
          }
          eraseHitsList = [];
          eraseHitIds.clear();
        } else if (tool === "select") {
          if (isMoving && dragElementIdRef.current && dragMeasureIdxRef.current >= 0) {
            const info = touchToGhost(slx, sly);
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
            const hit = hitTestElement(slx, sly);
            if (hit) {
              onElementTap(hit.elementId, hit.measureIdx);
            } else {
              const tupletHit = hitTestTupletBracket(slx, sly);
              if (tupletHit) onTupletBracketTapRef.current?.(tupletHit);
            }
          }
        }
      },

      onPanResponderTerminate: () => {
        clearLongPress();
        setGhost(null);
        dragElementIdRef.current = null;
        dragMeasureIdxRef.current = -1;
        eraseHitsList = [];
        eraseHitIds.clear();
      },
    });
  }, [touchToGhost, hitTestElement, hitTestMeasure, hitTestTupletBracket, onNotePlaced, onRestPlaced, onEraseElement, onElementTap]);

  const dur = isDotted
    ? (`${activeDuration}_dot` as NoteDuration)
    : activeDuration;

  // 레이아웃 높이(논리)와 물리 높이 분리
  const svgH = Math.max(totalHeight, 60);        // 논리 높이 (layout space)
  const svgHPhys = svgH * sf;                    // 물리 높이 (physical pixels)
  // 오버레이 SVG viewBox: 논리 좌표계(layout space)를 물리 픽셀로 균일 확대
  const overlayViewBox = `0 0 ${layoutWidth} ${svgH}`;

  return (
    <View style={styles.container}>
      {/* 오선보 SVG */}
      <ScoreRenderer
        doc={doc}
        containerWidth={containerWidth}
        selectedElementId={selectedElementId}
        multiSelectIds={multiSelectIds}
        selectedMeasureIdx={selectedMeasureIdx}
        multiSelectMeasureIndices={multiSelectMeasureIndices}
        playheadMeasureIdx={playheadMeasureIdx}
        playheadFraction={playheadFraction}
        showPlayhead={showPlayhead}
        highlightColor={highlightColor}
        lineSpacing={lineSpacing}
        measuresPerLineOverride={measuresPerLineOverride}
      />

      {/* 터치 + 가이드선 + 고스트 SVG 오버레이
          View로 감싸서 panHandlers를 View에 붙임 —
          웹에서 SVG에 직접 panHandlers를 붙이면 포인터 이벤트가 차단됨.
          overlayViewBox = layout space → ghost 좌표가 ScoreRenderer와 동일한 논리 좌표계 사용 */}
      <View
        style={{ position: "absolute", top: 0, left: 0, width: containerWidth, height: svgHPhys }}
        testID="score-canvas-overlay"
        {...panResponder.panHandlers}
      >
        <Svg
          width={containerWidth}
          height={svgHPhys}
          viewBox={overlayViewBox}
          style={StyleSheet.absoluteFillObject}
        >
          {/* 수평 점선 가이드 (음높이) — ghost 좌표는 layout space */}
          {ghost && (
            <Line
              x1={0}
              y1={ghost.noteY}
              x2={layoutWidth}
              y2={ghost.noteY}
              stroke={C.accent}
              strokeWidth={0.8}
              strokeDasharray="4,3"
              opacity={0.65}
            />
          )}
          {/* 스텝 입력 커서 — 손가락이 없을 때만 표시 */}
          {!ghost && cursorSvgX != null && cursorSvgStaffY != null &&
            (activeTool === "note" || activeTool === "rest") && (
            <G>
              <Line
                x1={cursorSvgX}
                y1={cursorSvgStaffY - 4}
                x2={cursorSvgX}
                y2={cursorSvgStaffY + STAFF_HEIGHT + 4}
                stroke={C.accent}
                strokeWidth={2}
                opacity={0.85}
              />
            </G>
          )}

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
          testID="score-magnifier"
        >
          <MagnifierView
            ghost={ghost}
            duration={dur}
            activeTool={activeTool}
            accentColor={C.accent}
            noteColor={C.text}
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
  noteColor,
}: {
  ghost: GhostState;
  duration: NoteDuration;
  activeTool: EditorTool;
  accentColor: string;
  noteColor: string;
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

  const label = activeTool === "note" ? (ghost.drumType ? DRUM_SHORT_LABEL[ghost.drumType] : pitchLabel(ghost.pitch)) : "";
  const drumEntry = ghost.drumType ? DRUM_MAP[ghost.drumType] : undefined;

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

      {/* 이미 배치된 주변 음표/쉼표 — 정확한 위치 참조용 */}
      {ghost.nearbyElements.map((el, i) =>
        el.type === "note" ? (
          <Ellipse
            key={`nb-${i}`}
            cx={el.x}
            cy={el.y}
            rx={NOTE_HEAD_RX}
            ry={NOTE_HEAD_RY}
            fill={isOpenNoteHead(el.duration) ? "none" : noteColor}
            stroke={noteColor}
            strokeWidth={0.7}
            opacity={0.85}
          />
        ) : (
          <Rect
            key={`nb-${i}`}
            x={el.x - 4}
            y={el.y - 2}
            width={8}
            height={3}
            fill={noteColor}
            opacity={0.85}
          />
        )
      )}

      {/* 음표 또는 쉼표 고스트 */}
      {activeTool === "note" ? (
        drumEntry?.noteHead === "cross" ? (
          <G opacity={0.9}>
            <Line x1={ghost.x - NOTE_HEAD_RX} y1={ghost.noteY - NOTE_HEAD_RX} x2={ghost.x + NOTE_HEAD_RX} y2={ghost.noteY + NOTE_HEAD_RX} stroke={accentColor} strokeWidth={1} />
            <Line x1={ghost.x - NOTE_HEAD_RX} y1={ghost.noteY + NOTE_HEAD_RX} x2={ghost.x + NOTE_HEAD_RX} y2={ghost.noteY - NOTE_HEAD_RX} stroke={accentColor} strokeWidth={1} />
          </G>
        ) : drumEntry?.noteHead === "triangle" ? (
          <Rect
            x={ghost.x - NOTE_HEAD_RX}
            y={ghost.noteY - NOTE_HEAD_RY}
            width={NOTE_HEAD_RX * 2}
            height={NOTE_HEAD_RY * 2}
            fill="none"
            stroke={accentColor}
            strokeWidth={0.8}
            opacity={0.9}
          />
        ) : (
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
        )
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
