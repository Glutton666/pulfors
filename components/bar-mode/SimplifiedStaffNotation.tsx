import React from "react";
import { View, StyleSheet } from "react-native";
import Svg, {
  Ellipse,
  G,
  Line,
  Path,
  Defs,
  LinearGradient,
  Stop,
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
}

const VIEWBOX_WIDTH = 360;
const VIEWBOX_HEIGHT = 28;
const STAFF_TOP = 5;
const STAFF_GAP = 4.5;
const STAFF_BOTTOM = STAFF_TOP + STAFF_GAP * 4;
const NOTE_Y = STAFF_TOP + STAFF_GAP * 2;

function noteX(index: number, count: number): number {
  if (count <= 1) return VIEWBOX_WIDTH / 2;
  return 16 + (index * (VIEWBOX_WIDTH - 32)) / (count - 1);
}

function NoteGlyph({
  type,
  x,
  active,
  index,
  gradientId,
  colors: C,
}: {
  type: BeatType;
  x: number;
  active: boolean;
  index: number;
  gradientId: string;
  colors: BarModeColors;
}) {
  const stroke = active ? C.white : C.text;
  const accent = active ? C.white : C.accent;
  const muted = active ? C.white : C.textTertiary;
  const opacity = active ? 1 : 0.92;

  if (type === "mute") {
    return (
      <G testID={`bar-note-mute-${index}`} opacity={active ? 1 : 0.72}>
        <Line x1={x - 4} y1={NOTE_Y - 3} x2={x + 4} y2={NOTE_Y + 3} stroke={muted} strokeWidth={1.4} />
        <Line x1={x + 4} y1={NOTE_Y - 3} x2={x - 4} y2={NOTE_Y + 3} stroke={muted} strokeWidth={1.4} />
      </G>
    );
  }

  if (type === "strong") {
    // s: an open head with an X and a stem running through the head. The
    // gradient keeps those three parts feeling like one soft, hand-drawn
    // glyph instead of three unrelated hard strokes.
    return (
      <G testID={`bar-note-strong-${index}`} opacity={opacity}>
        <Line
          x1={x}
          y1={STAFF_TOP - 1}
          x2={x}
          y2={STAFF_BOTTOM + 1}
          stroke={`url(#${gradientId})`}
          strokeWidth={1.35}
          strokeLinecap="round"
        />
        <Ellipse
          cx={x}
          cy={NOTE_Y}
          rx={4.5}
          ry={3}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={1.5}
        />
        <Line
          x1={x - 2.7}
          y1={NOTE_Y - 2.1}
          x2={x + 2.7}
          y2={NOTE_Y + 2.1}
          stroke={`url(#${gradientId})`}
          strokeWidth={1.2}
          strokeLinecap="round"
        />
        <Line
          x1={x + 2.7}
          y1={NOTE_Y - 2.1}
          x2={x - 2.7}
          y2={NOTE_Y + 2.1}
          stroke={`url(#${gradientId})`}
          strokeWidth={1.2}
          strokeLinecap="round"
        />
      </G>
    );
  }

  if (type === "accent") {
    // a: the ordinary filled note.
    return (
      <G testID={`bar-note-accent-${index}`} opacity={opacity}>
        <Line x1={x} y1={STAFF_TOP - 1} x2={x} y2={NOTE_Y + 1} stroke={stroke} strokeWidth={1.35} />
        <Ellipse cx={x} cy={NOTE_Y + 1} rx={4.1} ry={2.8} fill={stroke} />
      </G>
    );
  }

  // n: a horizontal open head with a small note inside.
  return (
    <G testID={`bar-note-normal-${index}`} opacity={opacity}>
      <Line x1={x} y1={STAFF_TOP - 1} x2={x} y2={NOTE_Y + 1} stroke={muted} strokeWidth={1.25} />
      <Ellipse cx={x} cy={NOTE_Y + 1} rx={5.2} ry={2.8} fill="none" stroke={accent} strokeWidth={1.25} />
      <Ellipse cx={x} cy={NOTE_Y + 1} rx={1.7} ry={1.45} fill={accent} />
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
  const y = 2.5;
  const hook = 2.5;
  return (
    <G testID={`bar-tuplet-${count}`}>
      <Path
        d={`M ${first} ${y + hook} L ${first} ${y} L ${last} ${y} L ${last} ${y + hook}`}
        fill="none"
        stroke={C.textSecondary}
        strokeWidth={1}
      />
      <SvgText
        x={(first + last) / 2}
        y={y + 2.8}
        fill={C.text}
        fontSize={7}
        fontWeight="600"
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
}: SimplifiedStaffNotationProps) {
  const visibleNotes = notes.length > 0 ? notes : ["normal" as BeatType];
  const gradientId = `bar-s-note-gradient-${beat}`;
  return (
    <View testID={`bar-staff-${beat}`} pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        preserveAspectRatio="none"
      >
        <Defs>
          <LinearGradient
            id={gradientId}
            x1="0"
            y1="0"
            x2="1"
            y2="1"
          >
            <Stop
              offset="0"
              stopColor={isCurrentBeat ? C.white : C.accent}
              stopOpacity={isCurrentBeat ? 0.98 : 0.9}
            />
            <Stop
              offset="0.52"
              stopColor={C.accent}
              stopOpacity={isCurrentBeat ? 0.92 : 0.76}
            />
            <Stop
              offset="1"
              stopColor={C.accentMuted}
              stopOpacity={isCurrentBeat ? 0.86 : 0.64}
            />
          </LinearGradient>
        </Defs>
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
            gradientId={gradientId}
            colors={C}
          />
        ))}
      </Svg>
    </View>
  );
}