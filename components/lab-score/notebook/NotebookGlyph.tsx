import React from "react";
import Svg, { Circle, G, Line, Path, Text as SvgText } from "react-native-svg";
import { StaffRestGlyph } from "@/components/staff/StaffGlyphs";
import { ALL_INSTR_SYMBOLS, ARTICULATIONS } from "@/components/ScorePalette";
import { NotebookNoteGlyph } from "./NotebookNoteGlyph";
import type { NotebookNoteRole } from "@/lib/staff-notebook";
import type { NotebookBeamStem } from "@/lib/notebook-beaming";

const noteDenominator: Record<string, number> = { whole: 1, half: 2, quarter: 4, eighth: 8, sixteenth: 16, "thirty_second": 32 };
const restDenominator: Record<string, number> = { "rest-whole": 1, "rest-half": 2, "rest-quarter": 4, "rest-eighth": 8, "rest-sixteenth": 16, "rest-thirty_second": 32 };
const typography: Record<string, string> = {
  sharp: "♯", flat: "♭", natural: "♮", double_sharp: "𝄪", double_flat: "𝄫",
  repeat_start: "||:", repeat_end: ":||", repeat_both: ":||:", segno: "𝄋", coda: "𝄌",
  fermata: "𝄐", staccato: "·", tenuto: "—", accent: ">", marcato: "^", snap_pizzicato: "◎",
  bowUp: "↑", bowDown: "↓", harmonic: "◇", pizzicato: "pizz.", arco: "arco",
  pedal: "𝆑", pedalEnd: "✻", ottava1: "8va", arpeggio: "≈",
  trill: "tr~", mordent: "𝒎", turn: "𝒔", tremolo: "///", grace_note: "𝅘♪",
  glissando: "gliss.", arpeggio_up: "≀↑", arpeggio_down: "≀↓",
  da_capo: "D.C.", dal_segno: "D.S.", dal_segno_coda: "D.S. al Coda", da_capo_coda: "D.C. al Coda", fine: "Fine", volta1: "1.", volta2: "2.",
};

export function NotebookGlyph({ glyph, x, y, size, role = "normal", dotted = false, beam }: { glyph: string; x: number; y: number; size: number; role?: NotebookNoteRole; dotted?: boolean; beam?: NotebookBeamStem }) {
  const noteValue = noteDenominator[glyph];
  if (noteValue) {
    return <G>
      <NotebookNoteGlyph duration={glyph as "whole" | "half" | "quarter" | "eighth" | "sixteenth" | "thirty_second"} x={x} y={y} size={size} beam={beam} />
      <G transform={`translate(${x} ${y}) scale(${size / 26})`}>
        {role === "ghost" && <Path testID="notebook-ghost-mark" d="M-12 -9 Q-18 0 -12 9 M12 -9 Q18 0 12 9" fill="none" stroke="#111" strokeWidth={1.4} />}
        {role === "strong" && <Path testID="notebook-strong-mark" d={beam?.direction === "up"
          ? `M-8 ${((beam.stemY - y) / (size / 26)) - 20} L9 ${((beam.stemY - y) / (size / 26)) - 15} L-8 ${((beam.stemY - y) / (size / 26)) - 10}`
          : "M-8 -46 L9 -41 L-8 -36"} fill="none" stroke="#111" strokeWidth={1.8} />}
        {dotted && <Circle testID="notebook-dot" cx={role === "ghost" ? 23 : 16} cy={-3} r={2.2} fill="#111" />}
      </G>
    </G>;
  }
  const restValue = restDenominator[glyph];
  if (restValue) {
    return <G transform={`translate(${x} ${y}) scale(${size / 26})`}>
      <StaffRestGlyph index={0} x={0} beamCount={Math.max(0, Math.round(Math.log2(restValue)) - 2)} grouped={false} noteValueDenominator={restValue} color="#111111" noteY={0} stemTop={-31} beamGap={5} />
      {dotted && <Circle testID="notebook-rest-dot" cx={11} cy={-3} r={2.2} fill="#111" />}
    </G>;
  }
  if (glyph === "repeat_start" || glyph === "repeat_end" || glyph === "repeat_both") {
    return <G transform={`translate(${x} ${y}) scale(${size / 26})`}>
      <Line x1={-3} x2={-3} y1={-24} y2={24} stroke="#111" strokeWidth={3} />
      <Line x1={2} x2={2} y1={-24} y2={24} stroke="#111" strokeWidth={1.4} />
      {glyph !== "repeat_end" && <><Circle cx={10} cy={-6} r={2} fill="#111" /><Circle cx={10} cy={6} r={2} fill="#111" /></>}
      {glyph !== "repeat_start" && <><Circle cx={-11} cy={-6} r={2} fill="#111" /><Circle cx={-11} cy={6} r={2} fill="#111" /></>}
    </G>;
  }
  if (glyph === "fermata") return <G transform={`translate(${x} ${y}) scale(${size / 26})`}><Path d="M-12 0 A12 12 0 0 1 12 0" stroke="#111" strokeWidth={2} fill="none" /><Circle cx={0} cy={-1} r={2} fill="#111" /></G>;
  if (["sharp", "flat", "natural", "double_sharp", "double_flat", "staccato", "staccatissimo", "tenuto", "accent", "marcato", "segno", "volta1", "volta2"].includes(glyph)) return <G transform={`translate(${x} ${y}) scale(${size / 26})`}>
    {glyph === "sharp" && <Path d="M-4 -15 V14 M4 -17 V12 M-9 -4 L9 -8 M-9 5 L9 1" fill="none" stroke="#111" strokeWidth={2} />}
    {(glyph === "flat" || glyph === "double_flat") && <><Path d="M-3 -18 V9 C14 3 10 -9 -3 -1" fill="none" stroke="#111" strokeWidth={1.9} />{glyph === "double_flat" && <Path d="M-12 -18 V9 C5 3 1 -9 -12 -1" fill="none" stroke="#111" strokeWidth={1.9} />}</>}
    {glyph === "natural" && <Path d="M-4 -16 V7 L5 3 V-10 L-4 -6 M5 3 V15" fill="none" stroke="#111" strokeWidth={2} />}
    {glyph === "double_sharp" && <Path d="M-7 -7 L7 7 M7 -7 L-7 7" fill="none" stroke="#111" strokeWidth={3.5} />}
    {glyph === "staccato" && <Circle cx={0} cy={0} r={2.5} fill="#111" />}
    {glyph === "staccatissimo" && <Path d="M-3 -7 L3 -7 L0 3 Z" fill="#111" />}
    {glyph === "tenuto" && <Line x1={-8} x2={8} y1={0} y2={0} stroke="#111" strokeWidth={2} />}
    {glyph === "accent" && <Path d="M-8 -5 L9 0 L-8 5" fill="none" stroke="#111" strokeWidth={1.8} />}
    {glyph === "marcato" && <Path d="M-7 5 L0 -6 L7 5" fill="none" stroke="#111" strokeWidth={1.8} />}
    {glyph === "segno" && <><Path d="M6 -11 C-8 -20 -12 -1 0 1 C13 3 7 19 -6 11 M-10 13 L11 -14" fill="none" stroke="#111" strokeWidth={2} /><Circle cx={-8} cy={-6} r={2} fill="#111" /><Circle cx={8} cy={6} r={2} fill="#111" /></>}
    {(glyph === "volta1" || glyph === "volta2") && <><Path d="M-12 7 V-9 H18" fill="none" stroke="#111" strokeWidth={1.4} /><SvgText x={-5} y={4} fontSize={12} fill="#111">{glyph === "volta1" ? "1." : "2."}</SvgText></>}
  </G>;
  if (glyph === "coda") return <G><Circle cx={x} cy={y} r={size * 0.32} stroke="#111" strokeWidth={1.8} fill="none" /><Line x1={x - size * 0.5} x2={x + size * 0.5} y1={y} y2={y} stroke="#111" strokeWidth={1.8} /><Line x1={x} x2={x} y1={y - size * 0.5} y2={y + size * 0.5} stroke="#111" strokeWidth={1.8} /></G>;
  return <SvgText x={x} y={y + size * 0.32} textAnchor="middle" fill="#111111" fontSize={Math.max(8, size * 0.85)} fontFamily="serif">{typography[glyph] ?? [...ALL_INSTR_SYMBOLS, ...ARTICULATIONS].find((item) => item.id === glyph)?.symbol ?? glyph}</SvgText>;
}

export function NotebookGlyphPreview({ glyph, size = 26, role, dotted }: { glyph: string; size?: number; role?: NotebookNoteRole; dotted?: boolean }) {
  if (noteDenominator[glyph]) {
    return <Svg width={size + 28} height={size + 38} viewBox="0 0 90 90"><NotebookGlyph glyph={glyph} x={45} y={53} size={size} role={role} dotted={dotted} /></Svg>;
  }
  return <Svg width={size + 28} height={size + 24} viewBox="0 0 70 55"><NotebookGlyph glyph={glyph} x={35} y={28} size={size} dotted={dotted} /></Svg>;
}
