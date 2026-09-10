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

function noteX(index: number, count: number): number {
  if (count <= 1) return VIEWBOX_WIDTH / 2;
  return 16 + (index * (VIEWBOX_WIDTH - 32)) / (count - 1);
}

function NoteGlyph({
  type,
  x,
  active,
  index,
  beamed,
  colors: C,
}: {
  type: BeatType;
  x: number;
  active: boolean;
  index: number;
  beamed: boolean;
  colors: BarModeColors;
}) {
  const stroke = active ? C.white : C.text;
  const accent = active ? C.white : C.accent;
  const muted = active ? C.white : C.textTertiary;
  const opacity = active ? 1 : 0.92;

  if (type === "mute") {
    // Mute is an intentionally empty rhythmic slot.
    return <G testID={`bar-note-mute-${index}`} />;
  }

  if (type === "strong") {
    // S: preserve the open X head, replacing the old central vertical stroke
    // with a short horizontal stroke that only protrudes slightly.
    return (
      <G testID={`bar-note-strong-${index}`} opacity={opacity}>
        {beamed && (
          <Line x1={x + 3.6} y1={TUPLET_BEAM_Y} x2={x + 3.6} y2={NOTE_Y} stroke={stroke} strokeWidth={1.3} />
        )}
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
        <Line x1={x + 3.6} y1={beamed ? TUPLET_BEAM_Y : STAFF_TOP - 1} x2={x + 3.6} y2={NOTE_Y} stroke={stroke} strokeWidth={1.35} />
        <Ellipse cx={x} cy={NOTE_Y} rx={4.1} ry={2.8} fill={stroke} />
      </G>
    );
  }

  // N: conventional ghost note — a filled notehead enclosed by parentheses.
  return (
    <G testID={`bar-note-normal-${index}`} opacity={opacity}>
      <Line x1={x + 3.1} y1={beamed ? TUPLET_BEAM_Y : STAFF_TOP - 1} x2={x + 3.1} y2={NOTE_Y} stroke={muted} strokeWidth={1.25} />
      <Ellipse cx={x} cy={NOTE_Y} rx={3.4} ry={2.35} fill={accent} />
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

function TupletGroup({
  count,
  colors: C,
}: {
  count: number;
  colors: BarModeColors;
}) {
  if (![3, 5, 7].includes(count)) return null;
  const first = noteX(0, count) - 7;
  const last = noteX(count - 1, count) + 7;
  return (
    <G testID={`bar-tuplet-${count}`}>
      <Line
        x1={first}
        y1={TUPLET_BEAM_Y}
        x2={last}
        y2={TUPLET_BEAM_Y}
        stroke={C.textSecondary}
        strokeWidth={2.2}
        strokeLinecap="square"
      />
      <SvgText
        x={(first + last) / 2}
        y={TUPLET_BEAM_Y - 1.3}
        fill={C.text}
        fontSize={6.2}
        fontWeight="700"
        textAnchor="middle"
      >
        {String(count)}
      </SvgText>
    </G>
  );
}

export function SimplifiedStaffNotation({
  beat,
  notes,
  activeSubNote,
  isCurrentBeat,
  colors: C,
  rightInset = 0,
}: SimplifiedStaffNotationProps) {
  const visibleNotes = notes.length > 0 ? notes : ["normal" as BeatType];
  const isTuplet = [3, 5, 7].includes(visibleNotes.length);
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
        <TupletGroup count={visibleNotes.length} colors={C} />
        {visibleNotes.map((type, index) => (
          <NoteGlyph
            key={`${type}-${index}`}
            type={type}
            x={noteX(index, visibleNotes.length)}
            active={isCurrentBeat && index === activeSubNote}
            index={index}
            beamed={isTuplet}
            colors={C}
          />
        ))}
      </Svg>
    </View>
  );
}