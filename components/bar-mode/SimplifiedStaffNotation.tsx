import React from "react";
import { View, StyleSheet } from "react-native";
import Svg, {
  Ellipse,
  G,
  Line,
  Path,
  Text as SvgText,
} from "react-native-svg";
import type { BeatType } from "@/components/beat-indicator.types";
import type { BarModeColors } from "./BarModeTypes";

interface SimplifiedStaffNotationProps {
  beat: number;
  notes: BeatType[];
  activeSubNote: number;
  isCurrentBeat: boolean;
  colors: BarModeColors;
  meterDenominator: 2 | 4 | 8;
  rightInset?: number;
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

function noteX(index: number, count: number): number {
  if (count <= 1) return VIEWBOX_WIDTH / 2;
  return 16 + (index * (VIEWBOX_WIDTH - 32)) / (count - 1);
}

function NoteGlyph({
  type,
  x,
  active,
  index,
  beamCount,
  grouped,
  noteValueDenominator,
  colors: C,
}: {
  type: BeatType;
  x: number;
  active: boolean;
  index: number;
  beamCount: number;
  grouped: boolean;
  noteValueDenominator: number;
  colors: BarModeColors;
}) {
  const stroke = active ? C.white : C.text;
  const accent = active ? C.white : C.accent;
  const muted = active ? C.white : C.textTertiary;
  const opacity = active ? 1 : 0.92;
  const openNotehead = noteValueDenominator <= 2;
  const stemTop = grouped ? TUPLET_BEAM_Y : STAFF_TOP - 1;
  const flags = !grouped && beamCount > 0
    ? Array.from({ length: beamCount }, (_, flag) => (
      <Path
        key={flag}
        testID={`bar-note-flag-${index}-${flag}`}
        d={`M ${x + 3.5} ${stemTop + flag * BEAM_GAP} Q ${x + 8.2} ${stemTop + 1.5 + flag * BEAM_GAP} ${x + 6.2} ${stemTop + 5.1 + flag * BEAM_GAP}`}
        fill="none"
        stroke={stroke}
        strokeWidth={1.3}
        strokeLinecap="round"
      />
    ))
    : null;

  if (type === "mute") {
    // Mute is an intentionally empty rhythmic slot.
    return <G testID={`bar-note-mute-${index}`} />;
  }

  if (type === "strong") {
    // S: preserve the open X head, replacing the old central vertical stroke
    // with a short horizontal stroke that only protrudes slightly.
    return (
      <G testID={`bar-note-strong-${index}`} opacity={opacity}>
        <Line x1={x + 3.6} y1={stemTop} x2={x + 3.6} y2={NOTE_Y} stroke={stroke} strokeWidth={1.3} />
        {flags}
        <Ellipse cx={x} cy={NOTE_Y} rx={4.1} ry={2.8} fill="none" stroke={accent} strokeWidth={1.35} />
        <Line x1={x - 2.6} y1={NOTE_Y - 2} x2={x + 2.6} y2={NOTE_Y + 2} stroke={accent} strokeWidth={1.25} />
        <Line x1={x + 2.6} y1={NOTE_Y - 2} x2={x - 2.6} y2={NOTE_Y + 2} stroke={accent} strokeWidth={1.25} />
        <Line
          testID={`bar-note-strong-strike-${index}`}
          x1={x - 5.4}
          y1={NOTE_Y}
          x2={x + 5.4}
          y2={NOTE_Y}
          stroke={stroke}
          strokeWidth={1.35}
        />
      </G>
    );
  }

  if (type === "accent") {
    // a: the ordinary filled note.
    return (
      <G testID={`bar-note-accent-${index}`} opacity={opacity}>
        <Line x1={x + 3.6} y1={stemTop} x2={x + 3.6} y2={NOTE_Y} stroke={stroke} strokeWidth={1.35} />
        {flags}
        <Ellipse
          cx={x}
          cy={NOTE_Y}
          rx={4.1}
          ry={2.8}
          fill={openNotehead ? "none" : stroke}
          stroke={stroke}
          strokeWidth={openNotehead ? 1.25 : 0}
        />
      </G>
    );
  }

  // N: conventional ghost note — a filled notehead enclosed by parentheses.
  return (
    <G testID={`bar-note-normal-${index}`} opacity={opacity}>
      <Line x1={x + 3.1} y1={stemTop} x2={x + 3.1} y2={NOTE_Y} stroke={muted} strokeWidth={1.25} />
      {flags}
      <Ellipse
        cx={x}
        cy={NOTE_Y}
        rx={3.4}
        ry={2.35}
        fill={openNotehead ? "none" : accent}
        stroke={accent}
        strokeWidth={openNotehead ? 1.15 : 0}
      />
      <Path
        d={`M ${x - 4.7} ${NOTE_Y - 3.4} Q ${x - 6.2} ${NOTE_Y} ${x - 4.7} ${NOTE_Y + 3.4}`}
        fill="none"
        stroke={muted}
        strokeWidth={1.05}
      />
      <Path
        d={`M ${x + 4.7} ${NOTE_Y - 3.4} Q ${x + 6.2} ${NOTE_Y} ${x + 4.7} ${NOTE_Y + 3.4}`}
        fill="none"
        stroke={muted}
        strokeWidth={1.05}
      />
    </G>
  );
}

function RhythmGroup({
  count,
  notation,
  colors: C,
}: {
  count: number;
  notation: StaffRhythmNotation;
  colors: BarModeColors;
}) {
  if (!notation.useBeam && !notation.useBracket) return null;
  const firstStem = noteX(0, count) + 3.6;
  const lastStem = noteX(count - 1, count) + 3.6;
  const bracketFirst = noteX(0, count) - 7;
  const bracketLast = noteX(count - 1, count) + 7;
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
          stroke={C.textSecondary}
          strokeWidth={1.8}
          strokeLinecap="square"
        />
      ))}
      {notation.useBracket && (
        <Path
          testID="bar-rhythm-bracket"
          d={`M ${bracketFirst} ${TUPLET_BEAM_Y + 3} L ${bracketFirst} ${TUPLET_BEAM_Y} L ${bracketLast} ${TUPLET_BEAM_Y} L ${bracketLast} ${TUPLET_BEAM_Y + 3}`}
          fill="none"
          stroke={C.textSecondary}
          strokeWidth={1}
        />
      )}
      {notation.isTuplet && (
        <SvgText
          testID={`bar-tuplet-number-${count}`}
          x={(noteX(0, count) + noteX(count - 1, count)) / 2}
          y={TUPLET_BEAM_Y - 1.3}
          fill={C.text}
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
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {[0, 1, 2, 3, 4].map((line) => (
          <Line
            key={line}
            x1={0}
            y1={STAFF_TOP + line * STAFF_GAP}
            x2={VIEWBOX_WIDTH}
            y2={STAFF_TOP + line * STAFF_GAP}
            stroke={C.textTertiary}
            strokeOpacity={isCurrentBeat ? 0.58 : 0.38}
            strokeWidth={line === 2 ? 1.1 : 0.7}
          />
        ))}
        <RhythmGroup count={visibleNotes.length} notation={notation} colors={C} />
        {visibleNotes.map((type, index) => (
          <NoteGlyph
            key={`${type}-${index}`}
            type={type}
            x={noteX(index, visibleNotes.length)}
            active={isCurrentBeat && index === activeSubNote}
            index={index}
            beamCount={notation.beamCount}
            grouped={notation.useBeam}
            noteValueDenominator={notation.noteValueDenominator}
            colors={C}
          />
        ))}
      </Svg>
    </View>
  );
}