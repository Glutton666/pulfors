import React from "react";
import Svg, { Ellipse, G, Path } from "react-native-svg";
import type { NotebookBeamStem } from "@/lib/notebook-beaming";

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

function flagPath(top: number): string {
  return [
    `M 4.8 ${top}`,
    `C 8.2 ${top + 0.4} 12.8 ${top + 4.6} 12.8 ${top + 8.1}`,
    `C 12.8 ${top + 11.3} 10.2 ${top + 13.5} 6.8 ${top + 15.2}`,
    `C 8.4 ${top + 11.8} 9.1 ${top + 9.7} 7.7 ${top + 7.2}`,
    `C 6.8 ${top + 5.6} 5.6 ${top + 4.6} 4.8 ${top + 4.2}`,
    "Z",
  ].join(" ");
}

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
  const beamedStemEnd = beam ? (beam.stemY - y) / scale : -31;

  return (
    <G
      testID={`notebook-note-${duration}`}
      transform={`translate(${x} ${y}) scale(${size / 26})`}
    >
      {!isWhole && (
        <Path
          testID="notebook-note-stem"
          d={beam ? `M ${beamedStemX} 0 L ${beamedStemX} ${beamedStemEnd}` : "M 4.8 0 L 4.8 -31"}
          fill="none"
          stroke={color}
          strokeWidth={1.55}
          strokeLinecap="round"
        />
      )}
      {!beam && Array.from({ length: flagCount }, (_, index) => (
        <Path
          key={index}
          testID={`notebook-note-flag-${index}`}
          d={flagPath(-31 + index * 5.3)}
          fill={color}
          stroke={color}
          strokeWidth={0.35}
          strokeLinejoin="round"
        />
      ))}
      <Ellipse
        testID="notebook-note-head"
        cx={0}
        cy={0}
        rx={isWhole ? 6.5 : 5.8}
        ry={isWhole ? 4.25 : 3.85}
        transform={isWhole ? undefined : "rotate(-24 0 0)"}
        fill={isOpen ? "none" : color}
        stroke={color}
        strokeWidth={isOpen ? 1.45 : 0}
      />
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
        y={39}
        size={size}
        color={color}
      />
    </Svg>
  );
}
