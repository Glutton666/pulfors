import React from "react";
import Svg, { Ellipse, G, Path } from "react-native-svg";
import type { NotebookBeamStem } from "@/lib/notebook-beaming";
import { BRAVURA_FLAG_OUTLINES } from "@/components/lab-score/notebook/BravuraFlagOutlines";
import { NOTEBOOK_WHOLE_NOTE_OUTLINE } from "@/components/lab-score/notebook/NotebookWholeNoteOutline";

export type NotebookNoteDuration =
  | "whole"
  | "half"
  | "quarter"
  | "eighth"
  | "sixteenth"
  | "thirty_second";

export interface NotebookNoteGlyphProps {
  duration: NotebookNoteDuration;
  x: number;
  y: number;
  size: number;
  color?: string;
  beam?: NotebookBeamStem;
}

const flagCountByDuration: Record<NotebookNoteDuration, number> = {
  whole: 0,
  half: 0,
  quarter: 0,
  eighth: 1,
  sixteenth: 2,
  thirty_second: 3,
};

export function NotebookNoteGlyph({
  duration,
  x,
  y,
  size,
  color = "#111111",
  beam,
}: NotebookNoteGlyphProps) {
  const isWhole = duration === "whole";
  const isOpen = isWhole || duration === "half";
  const flagCount = flagCountByDuration[duration];
  const scale = size / 26;
  const beamedStemX = beam ? (beam.direction === "up" ? 4.8 : -4.8) : 4.8;
  // A normal stem spans 3.5 staff spaces (12 units each).
  const beamedStemEnd = beam ? (beam.stemY - y) / scale : -42;
  // Bravura's 32nd flag origin is below its top; align that top to the stem.
  const flagTop = -42 + (duration === "thirty_second" ? 215 * 0.025 : 0);

  return (
    <G
      testID={`notebook-note-${duration}`}
      transform={`translate(${x} ${y}) scale(${size / 26})`}
    >
      {!isWhole && (
        <Path
          testID="notebook-note-stem"
          d={`M ${beamedStemX} 0 L ${beamedStemX} ${beamedStemEnd}`}
          fill="none"
          stroke={color}
          strokeWidth={1.55}
          strokeLinecap="round"
        />
      )}
      {!beam && flagCount > 0 && (
        <Path
          testID="notebook-note-flag-0"
          d={BRAVURA_FLAG_OUTLINES[duration === "eighth" ? "eighth" : duration === "sixteenth" ? "sixteenth" : "thirtySecond"]}
          transform={`translate(4.8 ${flagTop}) scale(0.025 -0.025)`}
          fill={color}
          stroke={color}
          strokeWidth={0.35}
          strokeLinejoin="round"
        />
      )}
      {isWhole ? (
        <Path
          testID="notebook-note-head"
          d={NOTEBOOK_WHOLE_NOTE_OUTLINE}
          fill={color}
          fillRule="evenodd"
        />
      ) : (
        <Ellipse
          testID="notebook-note-head"
          cx={0}
          cy={0}
          rx={5.8}
          ry={3.85}
          transform="rotate(-24 0 0)"
          fill={isOpen ? "none" : color}
          stroke={color}
          strokeWidth={isOpen ? 1.45 : 0}
        />
      )}
    </G>
  );
}

export function NotebookNoteGlyphPreview({
  duration,
  size = 26,
  color = "#111111",
}: {
  duration: NotebookNoteDuration;
  size?: number;
  color?: string;
}) {
  return (
    <Svg
      width={size + 28}
      height={size + 38}
      viewBox="0 0 70 78"
    >
      <NotebookNoteGlyph
        duration={duration}
        x={35}
        y={48}
        size={size}
        color={color}
      />
    </Svg>
  );
}
