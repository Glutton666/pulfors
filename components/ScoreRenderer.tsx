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
  noteStaffY,
  getLedgerLines,
  getStemDirection,
  layoutMeasure,
  measureMinWidth,
  headerWidth,
  KEY_SIG_POSITIONS,
  computeScoreLayout,
} from "@/lib/score-layout";
import { BASE_LINE_SPACING, scoreScaleFactor } from "@/lib/score-scale";
import type { ScoreRowLayout, NotePosition } from "@/lib/score-layout";
import type { ScoreDocument, ScorePart, ScoreMeasure, ScoreNote, ScoreRest, ClefType, NoteDuration, ArticulationType, OrnamentType, NoteHeadType } from "@/lib/score-types";
import { DRUM_MAP } from "@/lib/score-types";

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

function NoteHead({ x, y, duration, color, filled, noteHead = "normal" }: {
  x: number;
  y: number;
  duration: NoteDuration;
  color: string;
  filled: boolean;
  noteHead?: NoteHeadType;
}) {
  const isOpen = duration === "whole" || duration === "half" || duration === "whole_dot" || duration === "half_dot";

  if (noteHead === "cross") {
    // X자 모양 (심벌/하이햇 등 타악기 표준 표기)
    const r = NOTE_HEAD_RX;
    return (
      <G>
        <Line x1={x - r} y1={y - r} x2={x + r} y2={y + r} stroke={color} strokeWidth={1.6} />
        <Line x1={x - r} y1={y + r} x2={x + r} y2={y - r} stroke={color} strokeWidth={1.6} />
      </G>
    );
  }
  if (noteHead === "triangle") {
    // 삼각형 (오픈 하이햇 등)
    const r = NOTE_HEAD_RX;
    const h = NOTE_HEAD_RY * 1.3;
    const d = `M${x},${y - h} L${x + r},${y + h * 0.6} L${x - r},${y + h * 0.6} Z`;
    return <Path d={d} fill={isOpen ? "none" : color} stroke={color} strokeWidth={1.2} />;
  }
  if (noteHead === "diamond") {
    const rx = NOTE_HEAD_RX;
    const ry = NOTE_HEAD_RY * 1.3;
    const d = `M${x},${y - ry} L${x + rx},${y} L${x},${y + ry} L${x - rx},${y} Z`;
    return <Path d={d} fill={isOpen ? "none" : color} stroke={color} strokeWidth={1.2} />;
  }
  if (noteHead === "slash") {
    const r = NOTE_HEAD_RX * 1.1;
    return <Line x1={x - r} y1={y + r * 0.7} x2={x + r} y2={y - r * 0.7} stroke={color} strokeWidth={2.2} />;
  }

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
    case "snap_pizzicato":
      return (
        <G>
          <Circle cx={noteX} cy={y - 3} r={4} stroke={color} strokeWidth={1.2} fill="none" />
          <Circle cx={noteX} cy={y - 3} r={1.5} fill={color} />
        </G>
      );
    case "left_hand_pizzicato":
      return (
        <G>
          <Line x1={noteX - 5} y1={y} x2={noteX + 5} y2={y} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
          <Line x1={noteX} y1={y - 5} x2={noteX} y2={y + 5} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
        </G>
      );
    default:
      return null;
  }
}

// ── 꾸밈음 기호 렌더링 ────────────────────────────────────────

function OrnamentMark({ ornament, noteX, noteY, direction, color }: {
  ornament: OrnamentType;
  noteX: number;
  noteY: number;
  direction: "up" | "down";
  color: string;
}) {
  const baseY = direction === "up" ? noteY - STEM_HEIGHT - 10 : noteY - 14;
  switch (ornament) {
    case "trill":
      return (
        <G>
          <SvgText x={noteX} y={baseY} fontSize={10} fontStyle="italic" fill={color} textAnchor="middle">tr</SvgText>
          <Path
            d={`M${noteX - 4},${baseY + 4} Q${noteX - 1},${baseY + 1} ${noteX + 2},${baseY + 4} Q${noteX + 5},${baseY + 7} ${noteX + 8},${baseY + 4}`}
            stroke={color} strokeWidth={1} fill="none"
          />
        </G>
      );
    case "mordent":
      return (
        <G>
          <Line x1={noteX} y1={baseY - 3} x2={noteX} y2={baseY + 6} stroke={color} strokeWidth={1} />
          <Path
            d={`M${noteX - 5},${baseY + 1} Q${noteX - 2},${baseY - 3} ${noteX + 1},${baseY + 1} Q${noteX + 4},${baseY + 5} ${noteX + 7},${baseY + 1}`}
            stroke={color} strokeWidth={1} fill="none"
          />
        </G>
      );
    case "turn":
      return (
        <Path
          d={`M${noteX - 6},${baseY - 1} Q${noteX},${baseY - 8} ${noteX + 6},${baseY - 1} Q${noteX},${baseY + 6} ${noteX - 6},${baseY - 1}`}
          stroke={color} strokeWidth={1} fill="none"
        />
      );
    case "tremolo":
      return (
        <G>
          <Line x1={noteX - 5} y1={baseY + 3} x2={noteX + 5} y2={baseY - 1} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
          <Line x1={noteX - 5} y1={baseY + 7} x2={noteX + 5} y2={baseY + 3} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
          <Line x1={noteX - 5} y1={baseY + 11} x2={noteX + 5} y2={baseY + 7} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
        </G>
      );
    case "grace_note":
      return (
        <G>
          <Ellipse cx={noteX - 7} cy={baseY + 3} rx={3.5} ry={2.5} fill={color} />
          <Line x1={noteX - 4} y1={baseY + 3} x2={noteX - 4} y2={baseY - 5} stroke={color} strokeWidth={1} />
          <Line x1={noteX - 10} y1={baseY + 3} x2={noteX - 2} y2={baseY - 1} stroke={color} strokeWidth={1} />
        </G>
      );
    case "glissando":
      return (
        <SvgText x={noteX + 3} y={baseY + 5} fontSize={8} fill={color} textAnchor="start" fontStyle="italic">
          gliss.
        </SvgText>
      );
    case "arpeggio_up": {
      const ax = noteX - 9;
      const ay = noteY + 6;
      return (
        <G>
          <Path
            d={`M${ax},${ay} Q${ax - 3},${ay - 4} ${ax},${ay - 8} Q${ax + 3},${ay - 12} ${ax},${ay - 16} Q${ax - 3},${ay - 20} ${ax},${ay - 24}`}
            stroke={color} strokeWidth={1.2} fill="none"
          />
          <Path
            d={`M${ax - 3},${ay - 21} L${ax},${ay - 26} L${ax + 3},${ay - 21}`}
            stroke={color} strokeWidth={1} fill="none" strokeLinejoin="round"
          />
        </G>
      );
    }
    case "arpeggio_down": {
      const ax = noteX - 9;
      const ay = noteY - 6;
      return (
        <G>
          <Path
            d={`M${ax},${ay} Q${ax + 3},${ay + 4} ${ax},${ay + 8} Q${ax - 3},${ay + 12} ${ax},${ay + 16} Q${ax + 3},${ay + 20} ${ax},${ay + 24}`}
            stroke={color} strokeWidth={1.2} fill="none"
          />
          <Path
            d={`M${ax - 3},${ay + 21} L${ax},${ay + 26} L${ax + 3},${ay + 21}`}
            stroke={color} strokeWidth={1} fill="none" strokeLinejoin="round"
          />
        </G>
      );
    }
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
  const relY = noteStaffY(note, clef);
  const noteY = staffY + relY;
  const dur = note.duration;
  const needsStem = dur !== "whole" && dur !== "whole_dot";
  const direction = getStemDirection(relY);
  const drumEntry = note.drumType ? DRUM_MAP[note.drumType] : undefined;

  const flagCount =
    dur === "eighth" || dur === "eighth_dot" ? 1 :
    dur === "sixteenth" || dur === "sixteenth_dot" ? 2 :
    dur === "thirty_second" || dur === "thirty_second_dot" ? 3 : 0;

  const dotted =
    dur === "whole_dot" || dur === "half_dot" || dur === "quarter_dot" ||
    dur === "eighth_dot" || dur === "sixteenth_dot" || dur === "thirty_second_dot";

  const highlightColor = isSelected ? "#4A9EFF" : color;
  const articulations = note.articulations ?? [];

  return (
    <G>
      <LedgerLines cx={x} noteY={relY} staffY={staffY} color={highlightColor} />
      <NoteHead x={x} y={noteY} duration={dur} color={highlightColor} filled noteHead={drumEntry?.noteHead ?? note.noteHead} />
      {needsStem && <Stem x={x} y={noteY} direction={direction} color={highlightColor} />}
      {flagCount > 0 && <Flag x={x} y={noteY} direction={direction} count={flagCount} color={highlightColor} />}
      {dotted && <DotSymbol x={x} y={noteY} color={highlightColor} />}
      {articulations.map((art, i) => (
        <ArticulationMark key={art} art={art} noteX={x} noteY={noteY} direction={direction} color={highlightColor} idx={i} />
      ))}
      {/* 겹점 (doubleDotted) — 두 개의 점 */}
      {note.doubleDotted && <DotSymbol x={x} y={noteY} color={highlightColor} />}
      {note.doubleDotted && <DotSymbol x={x + 6} y={noteY} color={highlightColor} />}
      {/* 노트 레벨 강약 기호 */}
      {note.dynamic && (
        <SvgText
          x={x}
          y={staffY + STAFF_HEIGHT + 14}
          fontSize={9}
          fill={highlightColor}
          fontFamily="serif"
          fontStyle="italic"
          fontWeight="bold"
          textAnchor="middle"
        >
          {note.dynamic}
        </SvgText>
      )}
      {note.ornament && (
        <OrnamentMark
          ornament={note.ornament}
          noteX={x}
          noteY={noteY}
          direction={direction}
          color={highlightColor}
        />
      )}
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
    rest.duration === "eighth_dot" || rest.duration === "sixteenth_dot" || rest.duration === "thirty_second_dot";

  return (
    <G>
      <RestSymbol x={x} y={staffY} duration={rest.duration} color={color} />
      {dotted && <DotSymbol x={x + 8} y={staffY + STAFF_HEIGHT / 2} color={color} />}
    </G>
  );
}

// ── 마디선 ────────────────────────────────────────────────────

function Barline({ x, y, height, color, isDouble, isFinal }: {
  x: number;
  y: number;
  height: number;
  color: string;
  isDouble?: boolean;
  isFinal?: boolean;
}) {
  if (isFinal) {
    return (
      <G>
        <Line x1={x - 5} y1={y} x2={x - 5} y2={y + height} stroke={color} strokeWidth={1} />
        <Line x1={x} y1={y} x2={x} y2={y + height} stroke={color} strokeWidth={4} />
      </G>
    );
  }
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
  multiSelectIds?: string[];
  /** 이 마디가 마디 설정 드로어에서 현재 선택된 마디인지 여부 */
  isSelectedMeasure?: boolean;
  /** 이 마디가 복사/이동용 다중 선택에 포함되었는지 여부 */
  isMultiSelectedMeasure?: boolean;
  isPlayheadMeasure?: boolean;
  playheadFraction?: number;
  highlightColor?: string;
  showPlayhead?: boolean;
  // 크레셴도/데크레셴도 span 상태 (PartRender에서 계산)
  crescState?: "start" | "middle" | "end" | "full";
  decrescState?: "start" | "middle" | "end" | "full";
  // 헤어핀 노트 앵커 IDs (note-level 정밀 위치)
  crescNoteStartId?: string;
  crescNoteEndId?: string;
  decrescNoteStartId?: string;
  decrescNoteEndId?: string;
  // 마디별 유효 음자리표/조표 (PartRender에서 계산, 없으면 part.clef 사용)
  effectiveClef?: ClefType;
  // 이 마디에서 음자리표가 바뀌면 true (mid-staff 표시)
  clefChanged?: boolean;
  // 최종 마디 → 끝 마디선
  isFinalMeasure?: boolean;
  // 다음 마디에서 박자표/조표/음자리표가 바뀌면 true → 이중 마디선
  isChangeBarline?: boolean;
  // 이 마디에서 조표를 표시할지 여부 (행 첫 마디 또는 조표 변경 시)
  showKeySig?: boolean;
  /** 이 마디의 자유 배치 X 좌표 오버라이드 (elementId → x) */
  layoutOverrides?: Record<string, number>;
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
  multiSelectIds,
  isSelectedMeasure = false,
  isMultiSelectedMeasure = false,
  isPlayheadMeasure = false,
  playheadFraction = 0,
  highlightColor = "rgba(100,180,255,0.18)",
  showPlayhead = true,
  crescState,
  decrescState,
  crescNoteStartId,
  crescNoteEndId,
  decrescNoteStartId,
  decrescNoteEndId,
  effectiveClef,
  clefChanged,
  isFinalMeasure,
  isChangeBarline,
  showKeySig = false,
  layoutOverrides,
}: MeasureRenderProps) {
  const clef = effectiveClef ?? part.clef;

  // 헤더 폭 계산 — showClef/showKeySig/showTimeSig에 따라 조건부 누산
  let headerX = x + 4;
  let contentX = x + 4;

  if (showClef) {
    contentX += CLEF_WIDTH[clef] + 4;
  }
  if (showKeySig && Math.abs(sharps) > 0) {
    contentX += Math.abs(sharps) * KEY_SIG_ACCIDENTAL_WIDTH + 4;
  }
  if (showTimeSig) {
    contentX += TIME_SIG_WIDTH + 4;
  }

  // 음표 레이아웃
  const contentWidth = width - (contentX - x);
  const positions = layoutMeasure(measure, 0, clef, contentWidth, layoutOverrides);

  return (
    <G>
      {/* 현재 마디 하이라이트 (재생 헤드) */}
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

      {/* 선택된 마디 하이라이트 (마디 설정 드로어에서 선택된 마디) — 테두리로 표시해 재생 헤드 채우기와 구분 */}
      {isSelectedMeasure && (
        <Rect
          x={x + 1}
          y={staffY - STAFF_PADDING_TOP + 5}
          width={Math.max(width - 2, 0)}
          height={STAFF_PADDING_TOP + STAFF_HEIGHT + STAFF_PADDING_BOTTOM - 10}
          fill="none"
          stroke="#FF9F43"
          strokeWidth={2}
          strokeDasharray="4,3"
          rx={4}
        />
      )}

      {/* 복사/이동용 다중 선택 하이라이트 — 채우기로 표시해 단일 선택 테두리와 구분 */}
      {isMultiSelectedMeasure && (
        <Rect
          x={x + 1}
          y={staffY - STAFF_PADDING_TOP + 5}
          width={Math.max(width - 2, 0)}
          height={STAFF_PADDING_TOP + STAFF_HEIGHT + STAFF_PADDING_BOTTOM - 10}
          fill="rgba(255,159,67,0.16)"
          stroke="#FF9F43"
          strokeWidth={1.5}
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

      {/* 조표 — 행 첫 마디이거나 조표 변경 시에만 표시 */}
      {showKeySig && Math.abs(sharps) > 0 && (
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
              isSelected={el.id === selectedElementId || !!multiSelectIds?.includes(el.id)}
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
        const noteY1 = staffY + noteStaffY(el, clef);
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
        const noteY2 = elNext?.type === "note" ? staffY + noteStaffY(elNext, clef) : noteY1;
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

      {/* 슬러 아크 — slurStart → slurEndNoteId (명시적 관계) 또는 마디 끝 폴백 */}
      {positions.map((pos) => {
        const el = measure.elements.find((e) => e.id === pos.elementId);
        if (!el || el.type !== "note" || !el.slurStart) return null;
        const x1 = contentX + pos.x;
        const noteY1 = staffY + noteStaffY(el, clef);
        // slurEndNoteId로 정밀 탐색 (같은 마디 내)
        const endNoteId = el.slurEndNoteId;
        const endElPos = endNoteId ? positions.find((p2) => p2.elementId === endNoteId) : undefined;
        const endEl = endNoteId
          ? measure.elements.find((e) => e.id === endNoteId)
          : measure.elements.find(
              (e, ei) =>
                ei > measure.elements.indexOf(el) && e.type === "note" && (e as typeof el).slurEnd,
            );
        if (!endElPos || !endEl) {
          // 마디 끝까지 열린 슬러 (cross-measure: 다음 마디에서 끝남)
          return (
            <TieArc
              key={`slur-eom-${el.id}`}
              x1={x1}
              y1={noteY1 - 2}
              x2={x + width - 4}
              y2={noteY1 - 2}
              color={color}
            />
          );
        }
        const noteY2 = endEl.type === "note" ? staffY + noteStaffY(endEl, clef) : noteY1;
        return (
          <TieArc
            key={`slur-${el.id}`}
            x1={x1}
            y1={noteY1 - 2}
            x2={contentX + endElPos.x}
            y2={noteY2 - 2}
            color={color}
          />
        );
      })}

      {/* 잇단음표(튜플렛) 브래킷 + 숫자 */}
      {measure.tuplets?.map((group) => {
        const groupPositions = group.elementIds
          .map((id) => positions.find((p) => p.elementId === id))
          .filter((p): p is NotePosition => !!p);
        if (groupPositions.length < 2) return null;
        const first = groupPositions[0];
        const last = groupPositions[groupPositions.length - 1];
        const minRelY = Math.min(...groupPositions.map((p) => p.y));
        const bracketY = staffY + minRelY - 14;
        const x1 = contentX + first.x - first.width / 2 + 2;
        const x2 = contentX + last.x + last.width / 2 - 2;
        const midX = (x1 + x2) / 2;
        const tickH = 5;
        return (
          <G key={`tuplet-${group.id}`}>
            <Path
              d={`M${x1},${bracketY + tickH} L${x1},${bracketY} L${x2},${bracketY} L${x2},${bracketY + tickH}`}
              stroke={color}
              strokeWidth={1}
              fill="none"
            />
            <Rect x={midX - 7} y={bracketY - 8} width={14} height={11} fill="#000" opacity={0} />
            <SvgText
              x={midX}
              y={bracketY - 2}
              fontSize={9}
              fill={color}
              fontFamily="SpaceGrotesk_600SemiBold"
              textAnchor="middle"
            >
              {group.count}
            </SvgText>
          </G>
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

      {/* 크레셴도 헤어핀 (< 모양) — 노트 앵커 기반 (있을 때) 또는 span 기반 */}
      {crescState && (() => {
        const hairY = staffY + STAFF_HEIGHT + 16;
        // 노트 앵커 ID가 있으면 해당 노트 x로 정밀 위치 결정
        const startAnchorPos = crescNoteStartId
          ? positions.find((p) => p.elementId === crescNoteStartId)
          : undefined;
        const endAnchorPos = crescNoteEndId
          ? positions.find((p) => p.elementId === crescNoteEndId)
          : undefined;
        const x0 = startAnchorPos ? contentX + startAnchorPos.x : x + 4;
        const x1 = endAnchorPos ? contentX + endAnchorPos.x : x + width - 4;
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
        // "full": 단일 마디 전체 (같은 마디 내 start→end)
        return (
          <G>
            <Line x1={x0} y1={hairY} x2={x1} y2={hairY - 6} stroke={color} strokeWidth={1} strokeLinecap="round" />
            <Line x1={x0} y1={hairY} x2={x1} y2={hairY + 6} stroke={color} strokeWidth={1} strokeLinecap="round" />
          </G>
        );
      })()}

      {/* 데크레셴도 헤어핀 (> 모양) — 노트 앵커 기반 (있을 때) 또는 span 기반 */}
      {decrescState && (() => {
        const hairY = staffY + STAFF_HEIGHT + 16;
        const startAnchorPos = decrescNoteStartId
          ? positions.find((p) => p.elementId === decrescNoteStartId)
          : undefined;
        const endAnchorPos = decrescNoteEndId
          ? positions.find((p) => p.elementId === decrescNoteEndId)
          : undefined;
        const x0 = startAnchorPos ? contentX + startAnchorPos.x : x + 4;
        const x1 = endAnchorPos ? contentX + endAnchorPos.x : x + width - 4;
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
        // "full": 단일 마디 전체 (같은 마디 내 start→end)
        return (
          <G>
            <Line x1={x0} y1={hairY - 6} x2={x1} y2={hairY} stroke={color} strokeWidth={1} strokeLinecap="round" />
            <Line x1={x0} y1={hairY + 6} x2={x1} y2={hairY} stroke={color} strokeWidth={1} strokeLinecap="round" />
          </G>
        );
      })()}

      {/* 반복 끝 */}
      {measure.repeatEnd && <RepeatDots x={x + width - 6} y={staffY} isStart={false} color={color} />}

      {/* 마디선 — 최종 마디: 끝 마디선, 변경점: 이중 마디선, 그 외: 단일 마디선 */}
      <Barline
        x={x + width}
        y={staffY}
        height={STAFF_HEIGHT}
        color={color}
        isFinal={isFinalMeasure}
        isDouble={!isFinalMeasure && isChangeBarline}
      />

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
  multiSelectIds?: string[];
  selectedMeasureIdx?: number | null;
  multiSelectMeasureIndices?: number[];
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
  multiSelectIds,
  selectedMeasureIdx = null,
  multiSelectMeasureIndices,
  playheadMeasureIdx,
  playheadFraction = 0,
  highlightColor,
  showPlayhead = true,
}: PartRenderProps) {
  // 마디별 유효 박자표/BPM + cresc span 사전 계산
  let effNum = doc.timeSignature.numerator;
  let effDen = doc.timeSignature.denominator;
  let effClef: ClefType = part.clef;
  let effSharps = doc.keySignature.sharps;
  let crescActive = false;
  let decrescActive = false;

  // 선형 순서로 모든 마디 스캔 (rowLayout flatten)
  const allMeasureIndices = rowLayout.flatMap((r) => r.measureIndices);
  const measureMeta: {
    timeNum: number; timeDen: number;
    effClef: ClefType; effSharps: number;
    crescState?: "start" | "middle" | "end" | "full";
    decrescState?: "start" | "middle" | "end" | "full";
  }[] = allMeasureIndices.map((mIdx) => {
    const m = measures[mIdx];
    if (!m) return { timeNum: effNum, timeDen: effDen, effClef, effSharps };

    // 마디별 박자표/음자리표/조표 갱신
    if (m.timeSignature) {
      effNum = m.timeSignature.numerator;
      effDen = m.timeSignature.denominator;
    }
    if (m.clef) effClef = m.clef;
    if (m.keySignature) effSharps = m.keySignature.sharps;

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

    return { timeNum: effNum, timeDen: effDen, effClef, effSharps, crescState: cState, decrescState: dState };
  });
  // mIdx → 위 배열 인덱스 매핑
  const mIdxToMetaIdx: Record<number, number> = {};
  allMeasureIndices.forEach((mIdx, i) => { mIdxToMetaIdx[mIdx] = i; });

  // 박자표/음자리표/조표 표시 변경 감지 (이전 마디와 다를 때만 표시)
  const timeSigChangedAt: Set<number> = new Set();
  const clefChangedAt: Set<number> = new Set();
  const keySigChangedAt: Set<number> = new Set();
  let prevNum = doc.timeSignature.numerator;
  let prevDen = doc.timeSignature.denominator;
  let prevClef: ClefType = part.clef;
  let prevSharps = doc.keySignature.sharps;
  allMeasureIndices.forEach((mIdx) => {
    const meta = measureMeta[mIdxToMetaIdx[mIdx]];
    if (!meta) return;
    if (meta.timeNum !== prevNum || meta.timeDen !== prevDen) {
      timeSigChangedAt.add(mIdx);
      prevNum = meta.timeNum;
      prevDen = meta.timeDen;
    }
    if (meta.effClef !== prevClef) {
      clefChangedAt.add(mIdx);
      prevClef = meta.effClef;
    }
    if (meta.effSharps !== prevSharps) {
      keySigChangedAt.add(mIdx);
      prevSharps = meta.effSharps;
    }
  });

  return (
    <G>
      {rowLayout.map((row, rowIdx) =>
        row.measureIndices.map((mIdx, posInRow) => {
          const measure = measures[mIdx];
          if (!measure) return null;
          const metaIdx = mIdxToMetaIdx[mIdx] ?? 0;
          const meta = measureMeta[metaIdx] ?? {
            timeNum: doc.timeSignature.numerator,
            timeDen: doc.timeSignature.denominator,
            effClef: part.clef,
            effSharps: doc.keySignature.sharps,
          };
          const isFirst = mIdx === 0;
          // 행의 첫 마디이거나 이 마디에서 음자리표가 바뀐 경우 음자리표 표시
          const showClef = posInRow === 0 || clefChangedAt.has(mIdx);
          // 박자표: 악보 첫 마디이거나 박자표가 변경된 마디에서만 표시 (표준 기보법: 매 행 반복 안 함)
          const showTimeSig = mIdx === 0 || timeSigChangedAt.has(mIdx);
          // 조표: 행 첫 마디이거나 조표가 변경된 마디에서 표시 (표준 기보법: 매 행 반복)
          const showKeySig = posInRow === 0 || keySigChangedAt.has(mIdx);
          const x = row.measureWidths.slice(0, posInRow).reduce((a, b) => a + b, 0);
          const staffY = row.y + STAFF_PADDING_TOP;
          const isPlayheadMeasure = playheadMeasureIdx === mIdx;
          // 최종 마디 판정 (전체 measures 배열 기준)
          const isFinalMeasure = mIdx === measures.length - 1;
          // 다음 마디에서 박자표/조표/음자리표가 바뀌면 이중 마디선
          const nextMIdx = allMeasureIndices[allMeasureIndices.indexOf(mIdx) + 1];
          const isChangeBarline = nextMIdx !== undefined && (
            timeSigChangedAt.has(nextMIdx) ||
            clefChangedAt.has(nextMIdx) ||
            keySigChangedAt.has(nextMIdx)
          );

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
              sharps={meta.effSharps ?? doc.keySignature.sharps}
              color={color}
              timeNumerator={meta.timeNum}
              timeDenominator={meta.timeDen}
              selectedElementId={selectedElementId}
              multiSelectIds={multiSelectIds}
              isSelectedMeasure={selectedMeasureIdx === mIdx}
              isMultiSelectedMeasure={!!multiSelectMeasureIndices?.includes(mIdx)}
              isPlayheadMeasure={isPlayheadMeasure}
              playheadFraction={isPlayheadMeasure ? playheadFraction : 0}
              highlightColor={highlightColor}
              showPlayhead={showPlayhead}
              crescState={meta.crescState}
              decrescState={meta.decrescState}
              crescNoteStartId={measures[mIdx]?.crescNoteStartId}
              crescNoteEndId={measures[mIdx]?.crescNoteEndId}
              decrescNoteStartId={measures[mIdx]?.decrescNoteStartId}
              decrescNoteEndId={measures[mIdx]?.decrescNoteEndId}
              effectiveClef={meta.effClef}
              clefChanged={clefChangedAt.has(mIdx)}
              isFinalMeasure={isFinalMeasure}
              isChangeBarline={isChangeBarline}
              showKeySig={showKeySig}
              layoutOverrides={doc.layoutOverrides?.[measure.id]}
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
  multiSelectIds?: string[];
  /** 현재 선택된 마디 인덱스 — 선택된 마디를 시각적으로 하이라이트 (null이면 선택 없음) */
  selectedMeasureIdx?: number | null;
  /** 복사/이동용으로 다중 선택된 마디 인덱스 목록 */
  multiSelectMeasureIndices?: number[];
  playheadMeasureIdx?: number;
  playheadFraction?: number;
  showPlayhead?: boolean;
  highlightColor?: string;
  showPartNames?: boolean;
  /** 화면 크기에 맞는 line spacing (px). 기본값 = 10. useScoreLineSpacing()으로 계산. */
  lineSpacing?: number;
  /** 줄당 마디 수를 강제 지정 (예: 화면 방향에 따라 세로=1, 가로=2). 지정 시 doc.measuresPerLine보다 우선 적용됩니다. */
  measuresPerLineOverride?: number;
}


export function ScoreRenderer({
  doc,
  containerWidth,
  selectedElementId,
  multiSelectIds,
  selectedMeasureIdx = null,
  multiSelectMeasureIndices,
  playheadMeasureIdx,
  playheadFraction = 0,
  showPlayhead = true,
  highlightColor,
  showPartNames = true,
  lineSpacing = BASE_LINE_SPACING,
  measuresPerLineOverride,
}: ScoreRendererProps) {
  const { colors: C } = useTheme();
  const strokeColor = C.text;

  // SVG 스케일 팩터: LINE_SPACING(10) 기반 레이아웃을 lineSpacing 크기로 균일 확대
  const sf = scoreScaleFactor(lineSpacing);
  // 레이아웃은 항상 LINE_SPACING=10 기반으로 계산; containerWidth를 sf로 나눠 논리 너비를 좁힘
  const layoutWidth = containerWidth / sf;

  const { rows, totalHeight } = useMemo(
    () => computeScoreLayout(doc, layoutWidth, measuresPerLineOverride),
    [doc, layoutWidth, measuresPerLineOverride],
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
              multiSelectIds={multiSelectIds}
              selectedMeasureIdx={selectedMeasureIdx}
              multiSelectMeasureIndices={multiSelectMeasureIndices}
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
