import React from "react";
import {
  Ellipse,
  G,
  Line,
  Path,
} from "react-native-svg";
import type { BeatType } from "@/components/beat-indicator.types";

export interface StaffGlyphColors {
  accent: string;
}

export interface StaffNoteGlyphProps {
  type: BeatType;
  x: number;
  active: boolean;
  index: number;
  beamCount: number;
  grouped: boolean;
  noteValueDenominator: number;
  colors: StaffGlyphColors;
  noteY: number;
  stemTop: number;
  beamGap: number;
}

/**
 * The three bar-mode note marks live here so staff implementations do not
 * slowly acquire subtly different versions of them.
 */
export function StaffNoteGlyph({
  type,
  x,
  active,
  index,
  beamCount,
  grouped,
  noteValueDenominator,
  colors: C,
  noteY,
  stemTop,
  beamGap,
}: StaffNoteGlyphProps) {
  const stroke = C.accent;
  const opacity = active ? 1 : 0.92;
  const openNotehead = noteValueDenominator <= 2;
  const flags = !grouped && beamCount > 0
    ? Array.from({ length: beamCount }, (_, flag) => (
      <Path
        key={flag}
        testID={`bar-note-flag-${index}-${flag}`}
        d={`M ${x + 3.5} ${stemTop + flag * beamGap} Q ${x + 8.2} ${stemTop + 1.5 + flag * beamGap} ${x + 6.2} ${stemTop + 5.1 + flag * beamGap}`}
        fill="none"
        stroke={stroke}
        strokeWidth={1.3}
        strokeLinecap="round"
      />
    ))
    : null;

  if (type === "mute") {
    return (
      <G testID={`bar-note-mute-${index}`} opacity={opacity}>
        <StaffRestGlyph
          x={x}
          index={index}
          noteValueDenominator={noteValueDenominator}
          beamCount={beamCount}
          grouped={grouped}
          color={stroke}
          noteY={noteY}
          stemTop={stemTop}
          beamGap={beamGap}
        />
      </G>
    );
  }

  if (type === "strong") {
    return (
      <G testID={`bar-note-strong-${index}`} opacity={opacity}>
        <Line x1={x + 3.6} y1={stemTop} x2={x + 3.6} y2={noteY} stroke={stroke} strokeWidth={1.3} />
        {flags}
        <Ellipse cx={x} cy={noteY} rx={4.1} ry={2.8} fill="none" stroke={stroke} strokeWidth={1.35} />
        <Line x1={x - 2.6} y1={noteY - 2} x2={x + 2.6} y2={noteY + 2} stroke={stroke} strokeWidth={1.25} />
        <Line x1={x + 2.6} y1={noteY - 2} x2={x - 2.6} y2={noteY + 2} stroke={stroke} strokeWidth={1.25} />
        <Line testID={`bar-note-strong-strike-${index}`} x1={x - 5.4} y1={noteY} x2={x + 5.4} y2={noteY} stroke={stroke} strokeWidth={1.35} />
      </G>
    );
  }

  if (type === "accent") {
    return (
      <G testID={`bar-note-accent-${index}`} opacity={opacity}>
        <Line x1={x + 3.6} y1={stemTop} x2={x + 3.6} y2={noteY} stroke={stroke} strokeWidth={1.35} />
        {flags}
        <Ellipse cx={x} cy={noteY} rx={4.1} ry={2.8} fill={openNotehead ? "none" : stroke} stroke={stroke} strokeWidth={openNotehead ? 1.25 : 0} />
      </G>
    );
  }

  return (
    <G testID={`bar-note-normal-${index}`} opacity={opacity}>
      <Line x1={x + 3.1} y1={stemTop} x2={x + 3.1} y2={noteY} stroke={stroke} strokeWidth={1.25} />
      {flags}
      <Ellipse cx={x} cy={noteY} rx={3.4} ry={2.35} fill={openNotehead ? "none" : stroke} stroke={stroke} strokeWidth={openNotehead ? 1.15 : 0} />
      <Path d={`M ${x - 4.7} ${noteY - 3.4} Q ${x - 6.2} ${noteY} ${x - 4.7} ${noteY + 3.4}`} fill="none" stroke={stroke} strokeWidth={1.05} />
      <Path d={`M ${x + 4.7} ${noteY - 3.4} Q ${x + 6.2} ${noteY} ${x + 4.7} ${noteY + 3.4}`} fill="none" stroke={stroke} strokeWidth={1.05} />
    </G>
  );
}

export function StaffRestGlyph({
  x,
  index,
  noteValueDenominator,
  beamCount,
  grouped,
  color,
  noteY,
  stemTop,
  beamGap,
}: {
  x: number;
  index: number;
  noteValueDenominator: number;
  beamCount: number;
  grouped: boolean;
  color: string;
  noteY: number;
  stemTop: number;
  beamGap: number;
}) {
  if (noteValueDenominator <= 1) {
    return <Path testID={`bar-rest-whole-${index}`} d={`M ${x - 4.2} ${noteY - 1.2} H ${x + 4.2} V ${noteY + 2.8} H ${x - 4.2} Z`} fill={color} />;
  }
  if (noteValueDenominator <= 2) {
    return <Path testID={`bar-rest-half-${index}`} d={`M ${x - 4.2} ${noteY - 3.4} H ${x + 4.2} V ${noteY + 0.6} H ${x - 4.2} Z`} fill={color} />;
  }

  // The quarter-rest mark is deliberately path-based (rather than text), so
  // it remains identical on native and web SVG renderers.
  const quarter = `M ${x + 2.3} ${noteY - 5.3} L ${x - 1.8} ${noteY - 1.7} L ${x + 1.6} ${noteY + 0.2} L ${x - 1.9} ${noteY + 4.9}`;
  if (noteValueDenominator <= 4) {
    return <Path testID={`bar-rest-quarter-${index}`} d={quarter} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />;
  }

  // Eighth and shorter rests use the conventional descending stem with one
  // hook per flag. Their own flags remain visible even inside a beamed group.
  const restName = noteValueDenominator <= 8 ? "eighth" : "short";
  const flagCount = Math.max(1, Math.round(Math.log2(noteValueDenominator)) - 2);
  const flags = Array.from({ length: flagCount }, (_, flag) => (
      <Path
        key={flag}
        testID={`bar-rest-flag-${index}-${flag}`}
        d={`M ${x - 2.1} ${noteY - 4.2 + flag * beamGap} Q ${x + 4.8} ${noteY - 5.8 + flag * beamGap} ${x + 2.2} ${noteY - 0.8 + flag * beamGap}`}
        fill="none"
        stroke={color}
        strokeWidth={1.45}
        strokeLinecap="round"
      />
    ));
  return (
    <G testID={`bar-rest-${restName}-${index}`}>
      <Path
        testID={`bar-rest-stem-${index}`}
        d={`M ${x + 2.2} ${noteY - 5.4} L ${x - 2.2} ${noteY + 5.4}`}
        fill="none"
        stroke={color}
        strokeWidth={1.55}
        strokeLinecap="round"
      />
      {flags}
    </G>
  );
}