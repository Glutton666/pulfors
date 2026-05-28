// ============================================================
// ScoreRenderer — 오선보 SVG 렌더링 컴포넌트
// ============================================================

import React, { useMemo } from "react";
import { View, ScrollView, StyleSheet, Text, Platform } from "react-native";
import Svg, {
  Line,
  Ellipse,
  Rect,
  Path,
  G,
  Text as SvgText,
  Circle,
} from "react-native-svg";
import { useTheme } from "@/contexts/ThemeContext";
import {
  STAFF_LINE_COUNT,
  LINE_SPACING,
  STAFF_HEIGHT,
  CLEF_WIDTH,
  TIME_SIG_WIDTH,
  KEY_SIG_ACCIDENTAL_WIDTH,
  NOTE_HEAD_RX,
  NOTE_HEAD_RY,
  STEM_HEIGHT,
  NOTE_WIDTH,
  LEDGER_LINE_WIDTH,
  pitchToY,
  getLedgerLines,
  getStemDirection,
  layoutMeasure,
  measureMinWidth,
  headerWidth,
  KEY_SIG_POSITIONS,
  computeScoreLayout,
} from "@/lib/score-layout";
import { BASE_LINE_SPACING, scoreScaleFactor } from "@/lib/score-scale";
import type { ScoreRowLayout } from "@/lib/score-layout";
import type { ScoreDocument, ScorePart, ScoreMeasure, ScoreNote, ScoreRest, ClefType, NoteDuration, ArticulationType } from "@/lib/score-types";

// ── 상수 ─────────────────────────────────────────────────────
const PART_GAP = 32;            // 성부 간 간격
const STAFF_PADDING_TOP = 24;   // 오선 위 여백 (덧줄/기호 공간)
const STAFF_PADDING_BOTTOM = 28; // 오선 아래 여백
const PART_HEIGHT = STAFF_PADDING_TOP + STAFF_HEIGHT + STAFF_PADDING_BOTTOM;

// ── 음자리표 SVG Path ─────────────────────────────────────────

function TrebleClef({ x, y, color }: { x: number; y: number; color: string }) {
  // 단순화된 높은음자리표 (G자형)
  return (
    <SvgText
      x={x}
      y={y + STAFF_HEIGHT * 0.85}
      fontSize={STAFF_HEIGHT * 1.8}
      fontFamily="serif"
      fill={color}
      textAnchor="middle"
    >
      𝄞
    </SvgText>
  );
}

function BassClef({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <SvgText
      x={x}
      y={y + STAFF_HEIGHT * 0.6}
      fontSize={STAFF_HEIGHT * 1.2}
      fontFamily="serif"
      fill={color}
      textAnchor="middle"
    >
      𝄢
    </SvgText>
  );
}

function AltoClef({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <SvgText
      x={x}
      y={y + STAFF_HEIGHT * 0.7}
      fontSize={STAFF_HEIGHT * 1.2}
      fontFamily="serif"
      fill={color}
      textAnchor="middle"
    >
      𝄡
    </SvgText>
  );
}

function PercClef({ x, y, color }: { x: number; y: number; color: string }) {
  const cx = x;
  const cy = y + STAFF_HEIGHT / 2;
  return (
    <G>
      <Rect x={cx - 7} y={cy - STAFF_HEIGHT / 2} width={3} height={STAFF_HEIGHT} fill={color} />
      <Rect x={cx + 4} y={cy - STAFF_HEIGHT / 2} width={3} height={STAFF_HEIGHT} fill={color} />
    </G>
  );
}

// ── 오선 ─────────────────────────────────────────────────────

function StaffLines({ x, y, width, color }: { x: number; y: number; width: number; color: string }) {
  return (
    <G>
      {Array.from({ length: STAFF_LINE_COUNT }, (_, i) => (
        <Line
          key={i}
          x1={x}
          y1={y + i * LINE_SPACING}
          x2={x + width}
          y2={y + i * LINE_SPACING}
          stroke={color}
          strokeWidth={1}
        />
      ))}
    </G>
  );
}

// ── 박자표 ────────────────────────────────────────────────────

function TimeSignature({ x, y, numerator, denominator, color }: {
  x: number;
  y: number;
  numerator: number;
  denominator: number;
  color: string;
}) {
  const cx = x + TIME_SIG_WIDTH / 2;
  return (
    <G>
      <SvgText
        x={cx}
        y={y + LINE_SPACING * 1.5}
        fontSize={LINE_SPACING * 1.8}
        fontFamily="SpaceGrotesk_700Bold"
        fill={color}
        textAnchor="middle"
      >
        {numerator}
      </SvgText>
      <SvgText
        x={cx}
        y={y + LINE_SPACING * 3.5}
        fontSize={LINE_SPACING * 1.8}
        fontFamily="SpaceGrotesk_700Bold"
        fill={color}
        textAnchor="middle"
      >
        {denominator}
      </SvgText>
    </G>
  );
}

// ── 조표 샤프/플랫 ────────────────────────────────────────────

function SharpAccidental({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <SvgText x={x} y={y + 5} fontSize={13} fill={color} textAnchor="middle">
      ♯
    </SvgText>
  );
}

function FlatAccidental({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <SvgText x={x} y={y + 5} fontSize={13} fill={color} textAnchor="middle">
      ♭
    </SvgText>
  );
}

function KeySignatureSymbols({ x, y, sharps, clef, color }: {
  x: number;
  y: number;
  sharps: number;
  clef: ClefType;
  color: string;
}) {
  if (sharps === 0) return null;
  const count = Math.abs(sharps);
  const isSharp = sharps > 0;
  const clefPositions = KEY_SIG_POSITIONS[clef] ?? KEY_SIG_POSITIONS.treble;
  const positions = isSharp ? clefPositions.sharp : clefPositions.flat;

  return (
    <G>
      {Array.from({ length: count }, (_, i) => {
        const accY = y + (positions[i] ?? 0);
        const accX = x + i * (KEY_SIG_ACCIDENTAL_WIDTH + 1);
        return isSharp
          ? <SharpAccidental key={i} x={accX} y={accY} color={color} />
          : <FlatAccidental key={i} x={accX} y={accY} color={color} />;
      })}
    </G>
  );
}

// ── 음표 머리 ─────────────────────────────────────────────────

function NoteHead({ x, y, duration, color, filled }: {
  x: number;
  y: number;
  duration: NoteDuration;
  color: string;
  filled: boolean;
}) {
  const isOpen = duration === "whole" || duration === "half" || duration === "whole_dot" || duration === "half_dot";
  return (
    <Ellipse
      cx={x}
      cy={y}
      rx={NOTE_HEAD_RX}
      ry={NOTE_HEAD_RY}
      fill={isOpen ? "none" : color}
      stroke={color}
      strokeWidth={1.2}
    />
  );
}

// ── 기둥(Stem) ───────────────────────────────────────────────

function Stem({ x, y, direction, color }: {
  x: number;
  y: number;
  direction: "up" | "down";
  color: string;
}) {
  const x2 = direction === "up" ? x + NOTE_HEAD_RX - 1 : x - NOTE_HEAD_RX + 1;
  const y2 = direction === "up" ? y - STEM_HEIGHT : y + STEM_HEIGHT;
  return <Line x1={x2} y1={y} x2={x2} y2={y2} stroke={color} strokeWidth={1.2} />;
}

// ── 꼬리(Flag) ────────────────────────────────────────────────

function Flag({ x, y, direction, count, color }: {
  x: number;
  y: number;
  direction: "up" | "down";
  count: number; // 꼬리 개수 (8분=1, 16분=2, 32분=3)
  color: string;
}) {
  const stemX = direction === "up" ? x + NOTE_HEAD_RX - 1 : x - NOTE_HEAD_RX + 1;
  const stemEndY = direction === "up" ? y - STEM_HEIGHT : y + STEM_HEIGHT;
  const flags = [];
  for (let i = 0; i < count; i++) {
    const fy = direction === "up" ? stemEndY + i * 6 : stemEndY - i * 6;
    const path = direction === "up"
      ? `M${stemX},${fy} Q${stemX + 12},${fy + 8} ${stemX + 8},${fy + 16}`
      : `M${stemX},${fy} Q${stemX - 12},${fy - 8} ${stemX - 8},${fy - 16}`;
    flags.push(<Path key={i} d={path} stroke={color} strokeWidth={1.5} fill="none" />);
  }
  return <G>{flags}</G>;
}

// ── 쉼표 ─────────────────────────────────────────────────────

function RestSymbol({ x, y, duration, color }: {
  x: number;
  y: number;
  duration: NoteDuration;
  color: string;
}) {
  const cy = y + STAFF_HEIGHT / 2;
  switch (duration) {
    case "whole":
    case "whole_dot":
      return <Rect x={x - 7} y={cy - LINE_SPACING - 3} width={14} height={5} fill={color} />;
    case "half":
    case "half_dot":
      return <Rect x={x - 7} y={cy - 4} width={14} height={5} rx={1} fill={color} />;
    case "quarter":
    case "quarter_dot":
      return (
        <SvgText x={x} y={cy + 5} fontSize={18} fill={color} textAnchor="middle" fontFamily="serif">
          𝄽
        </SvgText>
      );
    case "eighth":
    case "eighth_dot":
      return (
        <SvgText x={x} y={cy + 4} fontSize={16} fill={color} textAnchor="middle" fontFamily="serif">
          𝄾
        </SvgText>
      );
    case "sixteenth":
    case "sixteenth_dot":
      return (
        <SvgText x={x} y={cy + 4} fontSize={16} fill={color} textAnchor="middle" fontFamily="serif">
          𝄿
        </SvgText>
      );
    default:
      return <Rect x={x - 5} y={cy - 5} width={10} height={5} fill={color} />;
  }
}

// ── 점(Dot) ───────────────────────────────────────────────────

function DotSymbol({ x, y, color }: { x: number; y: number; color: string }) {
  return <Circle cx={x + NOTE_HEAD_RX + 4} cy={y} r={1.8} fill={color} />;
}

// ── 덧줄 ─────────────────────────────────────────────────────

function LedgerLines({ cx, noteY, staffY, color }: {
  cx: number;
  noteY: number;
  staffY: number;
  color: string;
}) {
  const ledgers = getLedgerLines(noteY);
  return (
    <G>
      {ledgers.map((ly, i) => (
        <Line
          key={i}
          x1={cx - NOTE_HEAD_RX * 2}
          y1={staffY + ly}
          x2={cx + NOTE_HEAD_RX * 2}
          y2={staffY + ly}
          stroke={color}
          strokeWidth={1}
        />
      ))}
    </G>
  );
}

// ── 아티큘레이션 기호 ────────────────────────────────────────

function ArticulationMark({ art, noteX, noteY, direction, color, idx }: {
  art: ArticulationType;
  noteX: number;
  noteY: number;
  direction: "up" | "down";
  color: string;
  idx: number;
}) {
  // 기둥이 위이면 아티큘레이션은 음표 머리 아래쪽, 기둥이 아래이면 위쪽
  const offset = direction === "up" ? 8 + idx * 7 : -8 - idx * 7;
  const y = noteY + offset;
  switch (art) {
    case "staccato":
      return <Circle cx={noteX} cy={y} r={1.8} fill={color} />;
    case "staccatissimo":
      return <Rect x={noteX - 1.5} y={y - 4} width={3} height={8} rx={1} fill={color} />;
    case "tenuto":
      return <Line x1={noteX - 5} y1={y} x2={noteX + 5} y2={y} stroke={color} strokeWidth={1.5} strokeLinecap="round" />;
    case "accent":
      return <Path d={`M${noteX - 6},${y - 3} L${noteX + 6},${y} L${noteX - 6},${y + 3}`} stroke={color} strokeWidth={1.2} fill="none" strokeLinejoin="round" />;
    case "marcato":
      return <Path d={`M${noteX - 5},${y + 1} L${noteX},${y - 7} L${noteX + 5},${y + 1}`} stroke={color} strokeWidth={1.2} fill="none" strokeLinejoin="round" />;
    case "fermata":
      return (
        <G>
          <Path d={`M${noteX - 8},${y} Q${noteX},${y - 10} ${noteX + 8},${y}`} stroke={color} strokeWidth={1.2} fill="none" />
          <Circle cx={noteX} cy={y - 3} r={1.5} fill={color} />
        </G>
      );
    case "portato":
      return (
        <G>
          <Line x1={noteX - 5} y1={y + 2} x2={noteX + 5} y2={y + 2} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
          <Circle cx={noteX} cy={y - 3} r={1.8} fill={color} />
        </G>
      );
    default:
      return null;
  }
}

// ── 타이/슬러 아크 ────────────────────────────────────────────

function TieArc({ x1, y1, x2, y2, color }: {
  x1: number; y1: number; x2: number; y2: number; color: string;
}) {
  // 음표머리 바깥쪽에서 시작/끝, 중간에 베지어 커브
  const sx = x1 + NOTE_HEAD_RX;
  const ex = x2 - NOTE_HEAD_RX;
  const midX = (sx + ex) / 2;
  // 줄기 방향에 상관없이 음표 아래 방향으로 호를 그림 (실용적 기본값)
  const bulge = y1 + LINE_SPACING * 2;
  return (
    <Path
      d={`M${sx},${y1} Q${midX},${bulge} ${ex},${y2}`}
      stroke={color}
      strokeWidth={1.4}
      fill="none"
      strokeLinecap="round"
    />
  );
}

// ── 음표 렌더링 ───────────────────────────────────────────────

function NoteElement({ note, x, staffY, clef, color, isSelected }: {
  note: ScoreNote;
  x: number;
  staffY: number;
  clef: ClefType;
  color: string;
  isSelected: boolean;
}) {
  const noteY = staffY + pitchToY(note.pitch, clef);
  const dur = note.duration;
  const needsStem = dur !== "whole" && dur !== "whole_dot";
  const direction = getStemDirection(pitchToY(note.pitch, clef));

  const flagCount =
    dur === "eighth" || dur === "eighth_dot" ? 1 :
    dur === "sixteenth" || dur === "sixteenth_dot" ? 2 :
    dur === "thirty_second" ? 3 : 0;

  const dotted =
    dur === "whole_dot" || dur === "half_dot" || dur === "quarter_dot" ||
    dur === "eighth_dot" || dur === "sixteenth_dot";

  const highlightColor = isSelected ? "#4A9EFF" : color;
  const articulations = note.articulations ?? [];

  return (
    <G>
      <LedgerLines cx={x} noteY={pitchToY(note.pitch, clef)} staffY={staffY} color={highlightColor} />
      <NoteHead x={x} y={noteY} duration={dur} color={highlightColor} filled />
      {needsStem && <Stem x={x} y={noteY} direction={direction} color={highlightColor} />}
      {flagCount > 0 && <Flag x={x} y={noteY} direction={direction} count={flagCount} color={highlightColor} />}
      {dotted && <DotSymbol x={x} y={noteY} color={highlightColor} />}
      {articulations.map((art, i) => (
        <ArticulationMark key={art} art={art} noteX={x} noteY={noteY} direction={direction} color={highlightColor} idx={i} />
      ))}
    </G>
  );
}

// ── 쉼표 렌더링 ───────────────────────────────────────────────

function RestElement({ rest, x, staffY, color }: {
  rest: ScoreRest;
  x: number;
  staffY: number;
  color: string;
}) {
  const dotted =
    rest.duration === "whole_dot" || rest.duration === "half_dot" || rest.duration === "quarter_dot" ||
    rest.duration === "eighth_dot" || rest.duration === "sixteenth_dot";

  return (
    <G>
      <RestSymbol x={x} y={staffY} duration={rest.duration} color={color} />
      {dotted && <DotSymbol x={x + 8} y={staffY + STAFF_HEIGHT / 2} color={color} />}
    </G>
  );
}

// ── 마디선 ────────────────────────────────────────────────────

function Barline({ x, y, height, color, isDouble }: {
  x: number;
  y: number;
  height: number;
  color: string;
  isDouble?: boolean;
}) {
  if (isDouble) {
    return (
      <G>
        <Line x1={x - 3} y1={y} x2={x - 3} y2={y + height} stroke={color} strokeWidth={1} />
        <Line x1={x} y1={y} x2={x} y2={y + height} stroke={color} strokeWidth={3} />
      </G>
    );
  }
  return <Line x1={x} y1={y} x2={x} y2={y + height} stroke={color} strokeWidth={1} />;
}

// ── 반복 기호 ─────────────────────────────────────────────────

function RepeatDots({ x, y, isStart, color }: { x: number; y: number; isStart: boolean; color: string }) {
  const dotX = isStart ? x + 6 : x - 6;
  return (
    <G>
      <Line x1={x} y1={y} x2={x} y2={y + STAFF_HEIGHT} stroke={color} strokeWidth={3} />
      <Line x1={isStart ? x + 3 : x - 3} y1={y} x2={isStart ? x + 3 : x - 3} y2={y + STAFF_HEIGHT} stroke={color} strokeWidth={1} />
      <Circle cx={dotX} cy={y + LINE_SPACING * 1.5} r={2} fill={color} />
      <Circle cx={dotX} cy={y + LINE_SPACING * 2.5} r={2} fill={color} />
    </G>
  );
}

// ── 마디 하나 렌더링 ──────────────────────────────────────────

interface MeasureRenderProps {
  measure: ScoreMeasure;
  part: ScorePart;
  x: number;
  staffY: number;
  width: number;
  isFirst: boolean;
  showClef: boolean;
  showTimeSig: boolean;
  sharps: number;
  color: string;
  timeNumerator: number;
  timeDenominator: number;
  selectedElementId?: string | null;
  isPlayheadMeasure?: boolean;
  playheadFraction?: number;
  highlightColor?: string;
  showPlayhead?: boolean;
  // 크레셴도/데크레셴도 span 상태 (PartRender에서 계산)
  crescState?: "start" | "middle" | "end" | "full";
  decrescState?: "start" | "middle" | "end" | "full";
}

function MeasureRender({
  measure,
  part,
  x,
  staffY,
  width,
  isFirst,
  showClef,
  showTimeSig,
  sharps,
  color,
  timeNumerator,
  timeDenominator,
  selectedElementId,
  isPlayheadMeasure = false,
  playheadFraction = 0,
  highlightColor = "rgba(100,180,255,0.18)",
  showPlayhead = true,
  crescState,
  decrescState,
}: MeasureRenderProps) {
  const clef = part.clef;

  // 헤더 폭 계산
  let headerX = x + 4;
  let contentX = x + 4;

  if (showClef) {
    contentX += CLEF_WIDTH[clef] + 4;
  }
  if (Math.abs(sharps) > 0) {
    contentX += Math.abs(sharps) * KEY_SIG_ACCIDENTAL_WIDTH + 4;
  }
  if (showTimeSig) {
    contentX += TIME_SIG_WIDTH + 4;
  }

  // 음표 레이아웃
  const contentWidth = width - (contentX - x);
  const positions = layoutMeasure(measure, 0, clef, contentWidth);

  return (
    <G>
      {/* 현재 마디 하이라이트 */}
      {isPlayheadMeasure && (
        <Rect
          x={x}
          y={staffY - STAFF_PADDING_TOP + 4}
          width={width}
          height={STAFF_PADDING_TOP + STAFF_HEIGHT + STAFF_PADDING_BOTTOM - 8}
          fill={highlightColor}
          rx={4}
        />
      )}

      <StaffLines x={x} y={staffY} width={width} color={color} />

      {/* 음자리표 */}
      {showClef && clef === "treble" && <TrebleClef x={headerX + CLEF_WIDTH[clef] / 2} y={staffY} color={color} />}
      {showClef && clef === "bass" && <BassClef x={headerX + CLEF_WIDTH[clef] / 2} y={staffY} color={color} />}
      {showClef && (clef === "alto" || clef === "tenor") && <AltoClef x={headerX + CLEF_WIDTH[clef] / 2} y={staffY} color={color} />}
      {showClef && clef === "percussion" && <PercClef x={headerX + CLEF_WIDTH[clef] / 2} y={staffY} color={color} />}
      {showClef && (() => { headerX += CLEF_WIDTH[clef] + 4; return null; })()}

      {/* 조표 */}
      {Math.abs(sharps) > 0 && (
        <KeySignatureSymbols x={headerX} y={staffY} sharps={sharps} clef={clef} color={color} />
      )}

      {/* 박자표 */}
      {showTimeSig && (
        <TimeSignature
          x={contentX - TIME_SIG_WIDTH - 4}
          y={staffY}
          numerator={timeNumerator}
          denominator={timeDenominator}
          color={color}
        />
      )}

      {/* 반복 시작 */}
      {measure.repeatStart && <RepeatDots x={x + 6} y={staffY} isStart color={color} />}

      {/* 음표/쉼표 */}
      {positions.map((pos) => {
        const el = measure.elements.find((e) => e.id === pos.elementId);
        if (!el) return null;
        const absX = contentX + pos.x;
        if (el.type === "note") {
          return (
            <NoteElement
              key={el.id}
              note={el}
              x={absX}
              staffY={staffY}
              clef={clef}
              color={color}
              isSelected={el.id === selectedElementId}
            />
          );
        } else {
          return (
            <RestElement
              key={el.id}
              rest={el}
              x={absX}
              staffY={staffY}
              color={color}
            />
          );
        }
      })}

      {/* 타이 아크 — tieStart가 true인 음표와 다음 음표 연결 */}
      {positions.map((pos, pi) => {
        const el = measure.elements.find((e) => e.id === pos.elementId);
        if (!el || el.type !== "note" || !el.tieStart) return null;
        const x1 = contentX + pos.x;
        const noteY1 = staffY + pitchToY(el.pitch, clef);
        const nextPos = positions[pi + 1];
        if (!nextPos) {
          // 마디 끝 — 다음 마디 첫 음표까지 이어지는 타이: 마디 오른쪽 끝으로만 그림
          return (
            <TieArc
              key={`tie-eom-${el.id}`}
              x1={x1}
              y1={noteY1}
              x2={x + width - 4}
              y2={noteY1}
              color={color}
            />
          );
        }
        const elNext = measure.elements.find((e) => e.id === nextPos.elementId);
        const noteY2 = elNext?.type === "note" ? staffY + pitchToY(elNext.pitch, clef) : noteY1;
        return (
          <TieArc
            key={`tie-${el.id}`}
            x1={x1}
            y1={noteY1}
            x2={contentX + nextPos.x}
            y2={noteY2}
            color={color}
          />
        );
      })}

      {/* 리허설 마크 (A, B, 1 등) */}
      {measure.rehearsalMark && (
        <G>
          <Rect x={contentX + 2} y={staffY - 20} width={14} height={13} fill="none" stroke={color} strokeWidth={1} />
          <SvgText x={contentX + 9} y={staffY - 10} fontSize={9} fill={color} fontFamily="SpaceGrotesk_700Bold" textAnchor="middle">
            {measure.rehearsalMark}
          </SvgText>
        </G>
      )}

      {/* 세뇨 (𝄋) */}
      {measure.segno && (
        <SvgText x={x + 6} y={staffY - 4} fontSize={16} fill={color} fontFamily="serif">𝄋</SvgText>
      )}

      {/* 코다 (𝄌) */}
      {measure.coda && (
        <SvgText x={x + (measure.segno ? 22 : 6)} y={staffY - 4} fontSize={16} fill={color} fontFamily="serif">𝄌</SvgText>
      )}

      {/* Volta 괄호 (1·2번 번호 괄호) */}
      {measure.voltaBracket && (
        <G>
          <Rect
            x={x + 1}
            y={staffY - STAFF_PADDING_TOP + 2}
            width={width - 2}
            height={10}
            fill="none"
            stroke={color}
            strokeWidth={1}
          />
          <SvgText
            x={x + 5}
            y={staffY - STAFF_PADDING_TOP + 10}
            fontSize={8}
            fill={color}
            fontFamily="SpaceGrotesk_600SemiBold"
          >
            {measure.voltaBracket}.
          </SvgText>
        </G>
      )}

      {/* 빠르기말 */}
      {measure.tempoText && (
        <SvgText
          x={contentX + 4}
          y={staffY - 10}
          fontSize={9}
          fill={color}
          fontFamily="SpaceGrotesk_600SemiBold"
          fontStyle="italic"
        >
          {measure.tempoText}
        </SvgText>
      )}

      {/* BPM 표시 (빠르기말과 같이) */}
      {measure.bpm && !measure.tempoText && (
        <SvgText x={contentX + 4} y={staffY - 10} fontSize={8} fill={color} fontFamily="SpaceGrotesk_500Medium">
          ♩={measure.bpm}
        </SvgText>
      )}

      {/* D.C. / D.S. / Fine 등 이동 텍스트 */}
      {measure.jumpText && (
        <SvgText
          x={x + width - 4}
          y={staffY - 8}
          fontSize={9}
          fill={color}
          fontFamily="SpaceGrotesk_600SemiBold"
          textAnchor="end"
          fontStyle="italic"
        >
          {measure.jumpText}
        </SvgText>
      )}

      {/* 강약 기호 (마디 아래) */}
      {measure.dynamic && (
        <SvgText
          x={contentX + 4}
          y={staffY + STAFF_HEIGHT + 14}
          fontSize={11}
          fill={color}
          fontFamily="serif"
          fontStyle="italic"
          fontWeight="bold"
        >
          {measure.dynamic}
        </SvgText>
      )}

      {/* 크레셴도 헤어핀 (< 모양) — span 기반 */}
      {crescState && (() => {
        const hairY = staffY + STAFF_HEIGHT + 16;
        const x0 = x + 4;
        const x1 = x + width - 4;
        // "start": 왼쪽 꼭짓점 → 오른쪽 열린 끝
        if (crescState === "start") return (
          <G>
            <Line x1={x0} y1={hairY} x2={x1} y2={hairY - 6} stroke={color} strokeWidth={1} strokeLinecap="round" />
            <Line x1={x0} y1={hairY} x2={x1} y2={hairY + 6} stroke={color} strokeWidth={1} strokeLinecap="round" />
          </G>
        );
        // "middle": 두 수평선
        if (crescState === "middle") return (
          <G>
            <Line x1={x0} y1={hairY - 6} x2={x1} y2={hairY - 6} stroke={color} strokeWidth={1} strokeLinecap="round" />
            <Line x1={x0} y1={hairY + 6} x2={x1} y2={hairY + 6} stroke={color} strokeWidth={1} strokeLinecap="round" />
          </G>
        );
        // "end": 왼쪽 열린 끝 → 오른쪽 꼭짓점
        if (crescState === "end") return (
          <G>
            <Line x1={x0} y1={hairY - 6} x2={x1} y2={hairY} stroke={color} strokeWidth={1} strokeLinecap="round" />
            <Line x1={x0} y1={hairY + 6} x2={x1} y2={hairY} stroke={color} strokeWidth={1} strokeLinecap="round" />
          </G>
        );
        // "full": 단일 마디 전체
        return (
          <G>
            <Line x1={x0} y1={hairY} x2={x1} y2={hairY - 6} stroke={color} strokeWidth={1} strokeLinecap="round" />
            <Line x1={x0} y1={hairY} x2={x1} y2={hairY + 6} stroke={color} strokeWidth={1} strokeLinecap="round" />
          </G>
        );
      })()}

      {/* 데크레셴도 헤어핀 (> 모양) — span 기반 */}
      {decrescState && (() => {
        const hairY = staffY + STAFF_HEIGHT + 16;
        const x0 = x + 4;
        const x1 = x + width - 4;
        // "start": 왼쪽 열린 끝 → 오른쪽 진행
        if (decrescState === "start") return (
          <G>
            <Line x1={x0} y1={hairY - 6} x2={x1} y2={hairY} stroke={color} strokeWidth={1} strokeLinecap="round" />
            <Line x1={x0} y1={hairY + 6} x2={x1} y2={hairY} stroke={color} strokeWidth={1} strokeLinecap="round" />
          </G>
        );
        // "middle": 두 수평선
        if (decrescState === "middle") return (
          <G>
            <Line x1={x0} y1={hairY - 6} x2={x1} y2={hairY - 6} stroke={color} strokeWidth={1} strokeLinecap="round" />
            <Line x1={x0} y1={hairY + 6} x2={x1} y2={hairY + 6} stroke={color} strokeWidth={1} strokeLinecap="round" />
          </G>
        );
        // "end": 닫힌 꼭짓점
        if (decrescState === "end") return (
          <G>
            <Line x1={x0} y1={hairY} x2={x1} y2={hairY + 6} stroke={color} strokeWidth={1} strokeLinecap="round" />
            <Line x1={x0} y1={hairY} x2={x1} y2={hairY - 6} stroke={color} strokeWidth={1} strokeLinecap="round" />
          </G>
        );
        // "full": 단일 마디 전체
        return (
          <G>
            <Line x1={x0} y1={hairY - 6} x2={x1} y2={hairY} stroke={color} strokeWidth={1} strokeLinecap="round" />
            <Line x1={x0} y1={hairY + 6} x2={x1} y2={hairY} stroke={color} strokeWidth={1} strokeLinecap="round" />
          </G>
        );
      })()}

      {/* 반복 끝 */}
      {measure.repeatEnd && <RepeatDots x={x + width - 6} y={staffY} isStart={false} color={color} />}

      {/* 마디선 */}
      <Barline x={x + width} y={staffY} height={STAFF_HEIGHT} color={color} />

      {/* Playhead 세로선 */}
      {isPlayheadMeasure && showPlayhead && (
        <Line
          x1={x + playheadFraction * width}
          y1={staffY - STAFF_PADDING_TOP + 8}
          x2={x + playheadFraction * width}
          y2={staffY + STAFF_HEIGHT + STAFF_PADDING_BOTTOM - 8}
          stroke="rgba(60,140,255,0.9)"
          strokeWidth={2}
        />
      )}
    </G>
  );
}

// ── 성부 하나 렌더링 ──────────────────────────────────────────

interface PartRenderProps {
  part: ScorePart;
  measures: ScoreMeasure[];
  partIdx: number;
  rowLayout: ScoreRowLayout[];
  doc: ScoreDocument;
  color: string;
  selectedElementId?: string | null;
  playheadMeasureIdx?: number;
  playheadFraction?: number;
  highlightColor?: string;
  showPlayhead?: boolean;
}

function PartRender({
  part,
  measures,
  rowLayout,
  doc,
  color,
  selectedElementId,
  playheadMeasureIdx,
  playheadFraction = 0,
  highlightColor,
  showPlayhead = true,
}: PartRenderProps) {
  // 마디별 유효 박자표/BPM + cresc span 사전 계산
  let effNum = doc.timeSignature.numerator;
  let effDen = doc.timeSignature.denominator;
  let crescActive = false;
  let decrescActive = false;

  // 선형 순서로 모든 마디 스캔 (rowLayout flatten)
  const allMeasureIndices = rowLayout.flatMap((r) => r.measureIndices);
  const measureMeta: {
    timeNum: number; timeDen: number;
    crescState?: "start" | "middle" | "end" | "full";
    decrescState?: "start" | "middle" | "end" | "full";
  }[] = allMeasureIndices.map((mIdx) => {
    const m = measures[mIdx];
    if (!m) return { timeNum: effNum, timeDen: effDen };

    // 마디별 박자표 갱신
    if (m.timeSignature) {
      effNum = m.timeSignature.numerator;
      effDen = m.timeSignature.denominator;
    }

    // cresc span 계산
    let cState: "start" | "middle" | "end" | "full" | undefined;
    if (m.crescStart && m.crescEnd) { cState = "full"; crescActive = false; }
    else if (m.crescStart)          { cState = "start"; crescActive = true; }
    else if (crescActive && m.crescEnd)  { cState = "end"; crescActive = false; }
    else if (crescActive)           { cState = "middle"; }

    let dState: "start" | "middle" | "end" | "full" | undefined;
    if (m.decrescStart && m.decrescEnd) { dState = "full"; decrescActive = false; }
    else if (m.decrescStart)            { dState = "start"; decrescActive = true; }
    else if (decrescActive && m.decrescEnd) { dState = "end"; decrescActive = false; }
    else if (decrescActive)             { dState = "middle"; }

    return { timeNum: effNum, timeDen: effDen, crescState: cState, decrescState: dState };
  });
  // mIdx → 위 배열 인덱스 매핑
  const mIdxToMetaIdx: Record<number, number> = {};
  allMeasureIndices.forEach((mIdx, i) => { mIdxToMetaIdx[mIdx] = i; });

  // 박자표 표시 변경 감지 (이전 마디와 다를 때만 표시)
  const timeSigChangedAt: Set<number> = new Set();
  let prevNum = doc.timeSignature.numerator;
  let prevDen = doc.timeSignature.denominator;
  allMeasureIndices.forEach((mIdx) => {
    const meta = measureMeta[mIdxToMetaIdx[mIdx]];
    if (!meta) return;
    if (meta.timeNum !== prevNum || meta.timeDen !== prevDen) {
      timeSigChangedAt.add(mIdx);
      prevNum = meta.timeNum;
      prevDen = meta.timeDen;
    }
  });

  return (
    <G>
      {rowLayout.map((row, rowIdx) =>
        row.measureIndices.map((mIdx, posInRow) => {
          const measure = measures[mIdx];
          if (!measure) return null;
          const metaIdx = mIdxToMetaIdx[mIdx] ?? 0;
          const meta = measureMeta[metaIdx] ?? { timeNum: doc.timeSignature.numerator, timeDen: doc.timeSignature.denominator };
          const isFirst = mIdx === 0;
          const showClef = posInRow === 0;
          // 박자표 표시: 첫 마디이거나 박자표가 변경된 마디
          const showTimeSig = posInRow === 0 || timeSigChangedAt.has(mIdx);
          const x = row.measureWidths.slice(0, posInRow).reduce((a, b) => a + b, 0);
          const staffY = row.y + STAFF_PADDING_TOP;
          const isPlayheadMeasure = playheadMeasureIdx === mIdx;

          return (
            <MeasureRender
              key={measure.id}
              measure={measure}
              part={part}
              x={x}
              staffY={staffY}
              width={row.measureWidths[posInRow]}
              isFirst={isFirst}
              showClef={showClef}
              showTimeSig={showTimeSig}
              sharps={doc.keySignature.sharps}
              color={color}
              timeNumerator={meta.timeNum}
              timeDenominator={meta.timeDen}
              selectedElementId={selectedElementId}
              isPlayheadMeasure={isPlayheadMeasure}
              playheadFraction={isPlayheadMeasure ? playheadFraction : 0}
              highlightColor={highlightColor}
              showPlayhead={showPlayhead}
              crescState={meta.crescState}
              decrescState={meta.decrescState}
            />
          );
        })
      )}
    </G>
  );
}

// ── 메인 ScoreRenderer ────────────────────────────────────────

export interface ScoreRendererProps {
  doc: ScoreDocument;
  containerWidth: number;
  selectedElementId?: string | null;
  playheadMeasureIdx?: number;
  playheadFraction?: number;
  showPlayhead?: boolean;
  highlightColor?: string;
  showPartNames?: boolean;
  /** 화면 크기에 맞는 line spacing (px). 기본값 = 10. useScoreLineSpacing()으로 계산. */
  lineSpacing?: number;
}


export function ScoreRenderer({
  doc,
  containerWidth,
  selectedElementId,
  playheadMeasureIdx,
  playheadFraction = 0,
  showPlayhead = true,
  highlightColor,
  showPartNames = true,
  lineSpacing = BASE_LINE_SPACING,
}: ScoreRendererProps) {
  const { colors: C } = useTheme();
  const strokeColor = C.text;

  // SVG 스케일 팩터: LINE_SPACING(10) 기반 레이아웃을 lineSpacing 크기로 균일 확대
  const sf = scoreScaleFactor(lineSpacing);
  // 레이아웃은 항상 LINE_SPACING=10 기반으로 계산; containerWidth를 sf로 나눠 논리 너비를 좁힘
  const layoutWidth = containerWidth / sf;

  const { rows, totalHeight } = useMemo(
    () => computeScoreLayout(doc, layoutWidth),
    [doc, layoutWidth],
  );

  if (!doc.parts.length) {
    return (
      <View style={[styles.empty]}>
        <Text style={{ color: C.textSecondary, fontSize: 13 }}>성부가 없습니다</Text>
      </View>
    );
  }

  const svgHeight = Math.max(totalHeight, 100);

  // viewBox="0 0 {layoutWidth} {svgHeight}" 으로 SVG 콘텐츠를 sf배 균일 확대
  // 물리 SVG 크기: width=containerWidth, height=svgHeight*sf
  const viewBox = `0 0 ${layoutWidth} ${svgHeight}`;

  return (
    <Svg width={containerWidth} height={svgHeight * sf} viewBox={viewBox} style={styles.svg}>
      {doc.parts.map((part, partIdx) => {
        // 각 성부는 y 오프셋 적용
        const partYOffset = partIdx * PART_HEIGHT;
        const partMeasures = part.measures;

        return (
          <G key={part.id} y={partYOffset}>
            {/* 성부 이름 */}
            {showPartNames && rows[0] && (
              <SvgText
                x={2}
                y={rows[0].y + STAFF_PADDING_TOP + STAFF_HEIGHT / 2 + 4}
                fontSize={9}
                fill={strokeColor}
                fontFamily="SpaceGrotesk_400Regular"
              >
                {part.name ?? part.instrumentId}
              </SvgText>
            )}
            <PartRender
              part={part}
              measures={partMeasures}
              partIdx={partIdx}
              rowLayout={rows}
              doc={doc}
              color={strokeColor}
              selectedElementId={selectedElementId}
              playheadMeasureIdx={playheadMeasureIdx}
              playheadFraction={playheadFraction}
              showPlayhead={showPlayhead}
              highlightColor={highlightColor}
            />
          </G>
        );
      })}

      {/* 첫 마디 세로선 (왼쪽 경계) */}
      {rows.map((row, rowIdx) => (
        <Line
          key={`row-start-${rowIdx}`}
          x1={0}
          y1={row.y + STAFF_PADDING_TOP}
          x2={0}
          y2={row.y + STAFF_PADDING_TOP + STAFF_HEIGHT * doc.parts.length + PART_GAP * (doc.parts.length - 1)}
          stroke={strokeColor}
          strokeWidth={1.5}
        />
      ))}
    </Svg>
  );
}

const styles = StyleSheet.create({
  svg: {
    alignSelf: "flex-start",
  },
  empty: {
    paddingVertical: 24,
    alignItems: "center",
  },
});
