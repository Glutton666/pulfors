import React from "react";
import { View, StyleSheet } from "react-native";
import Svg, {
  G,
  Line,
  Path,
  Text as SvgText,
} from "react-native-svg";
import type { BeatType } from "@/components/beat-indicator.types";
import type { BarModeColors } from "./BarModeTypes";
import { StaffNoteGlyph } from "@/components/staff/StaffGlyphs";

interface SimplifiedStaffNotationProps {
  beat: number;
  notes: BeatType[];
  activeSubNote: number;
  isCurrentBeat: boolean;
  colors: BarModeColors;
  meterDenominator: 2 | 4 | 8;
  rightInset?: number;
  viewBoxWidth?: number;
}

// Match the usable staff area's phone aspect ratio. A much wider viewBox made
// preserveAspectRatio="none" necessary and distorted both noteheads and spacing.
const VIEWBOX_WIDTH = 260;
const VIEWBOX_HEIGHT = 32;
const STAFF_TOP = 9;
const STAFF_GAP = 4.25;
const STAFF_BOTTOM = STAFF_TOP + STAFF_GAP * 4;
const NOTE_Y = STAFF_TOP + STAFF_GAP * 2;
const TUPLET_BEAM_Y = 7;
const BEAM_GAP = 2.45;

export interface StaffRhythmNotation {
  noteValueDenominator: number;
  beamCount: number;
  isTuplet: boolean;
  useBeam: boolean;
  useBracket: boolean;
}

function isPowerOfTwo(value: number): boolean {
  return value > 0 && (value & (value - 1)) === 0;
}

export function getStaffRhythmNotation(
  meterDenominator: 2 | 4 | 8,
  subdivisionCount: number,
): StaffRhythmNotation {
  const count = Math.max(1, Math.floor(subdivisionCount));
  const standardDivision = 2 ** Math.floor(Math.log2(count));
  const noteValueDenominator = meterDenominator * standardDivision;
  const beamCount = Math.max(0, Math.round(Math.log2(noteValueDenominator / 4)));
  const isTuplet = count > 1 && !isPowerOfTwo(count);
  return {
    noteValueDenominator,
    beamCount,
    isTuplet,
    useBeam: count > 1 && beamCount > 0,
    useBracket: isTuplet && beamCount === 0,
  };
}

function noteX(index: number, count: number, width: number): number {
  if (count <= 1) return width / 2;
  const inset = Math.min(16, Math.max(7, width * 0.1));
  return inset + (index * (width - inset * 2)) / (count - 1);
}

function RhythmGroup({
  count,
  notation,
  colors: C,
  width,
}: {
  count: number;
  notation: StaffRhythmNotation;
  colors: BarModeColors;
  width: number;
}) {
  if (!notation.useBeam && !notation.useBracket) return null;
  const firstStem = noteX(0, count, width) + 3.6;
  const lastStem = noteX(count - 1, count, width) + 3.6;
  const bracketFirst = noteX(0, count, width) - 7;
  const bracketLast = noteX(count - 1, count, width) + 7;
  return (
    <G testID={notation.isTuplet ? `bar-tuplet-${count}` : `bar-rhythm-group-${count}`}>
      {notation.useBeam && Array.from({ length: notation.beamCount }, (_, beam) => (
        <Line
          key={beam}
          testID={`bar-rhythm-beam-${beam}`}
          x1={firstStem}
          y1={TUPLET_BEAM_Y + beam * BEAM_GAP}
          x2={lastStem}
          y2={TUPLET_BEAM_Y + beam * BEAM_GAP}
          stroke={C.accent}
          strokeWidth={1.8}
          strokeLinecap="square"
        />
      ))}
      {notation.useBracket && (
        <Path
          testID="bar-rhythm-bracket"
          d={`M ${bracketFirst} ${TUPLET_BEAM_Y + 3} L ${bracketFirst} ${TUPLET_BEAM_Y} L ${bracketLast} ${TUPLET_BEAM_Y} L ${bracketLast} ${TUPLET_BEAM_Y + 3}`}
          fill="none"
          stroke={C.accent}
          strokeWidth={1}
        />
      )}
      {notation.isTuplet && (
        <SvgText
          testID={`bar-tuplet-number-${count}`}
          x={(noteX(0, count, width) + noteX(count - 1, count, width)) / 2}
          y={TUPLET_BEAM_Y - 1.3}
          fill={C.accent}
          fontSize={6.2}
          fontWeight="700"
          textAnchor="middle"
        >
          {String(count)}
        </SvgText>
      )}
    </G>
  );
}

export function SimplifiedStaffNotation({
  beat,
  notes,
  activeSubNote,
  isCurrentBeat,
  colors: C,
  meterDenominator,
  rightInset = 0,
  viewBoxWidth = VIEWBOX_WIDTH,
}: SimplifiedStaffNotationProps) {
  const visibleNotes = notes.length > 0 ? notes : ["normal" as BeatType];
  const notation = getStaffRhythmNotation(meterDenominator, visibleNotes.length);
  return (
    <View
      testID={`bar-staff-${beat}`}
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { right: rightInset }]}
    >
      <Svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${viewBoxWidth} ${VIEWBOX_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {[0, 1, 2, 3, 4].map((line) => (
          <Line
            key={line}
            x1={0}
            y1={STAFF_TOP + line * STAFF_GAP}
            x2={viewBoxWidth}
            y2={STAFF_TOP + line * STAFF_GAP}
            stroke={C.textTertiary}
            strokeOpacity={isCurrentBeat ? 0.58 : 0.38}
            strokeWidth={line === 2 ? 1.1 : 0.7}
          />
        ))}
        <RhythmGroup count={visibleNotes.length} notation={notation} colors={C} width={viewBoxWidth} />
        {visibleNotes.map((type, index) => (
          <StaffNoteGlyph
            key={`${type}-${index}`}
            type={type}
            x={noteX(index, visibleNotes.length, viewBoxWidth)}
            active={isCurrentBeat && index === activeSubNote}
            index={index}
            beamCount={notation.beamCount}
            grouped={notation.useBeam}
            noteValueDenominator={notation.noteValueDenominator}
            colors={C}
            noteY={NOTE_Y}
            stemTop={notation.useBeam ? TUPLET_BEAM_Y : STAFF_TOP - 1}
            beamGap={BEAM_GAP}
          />
        ))}
      </Svg>
    </View>
  );
}