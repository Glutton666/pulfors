import React from "react";
import Svg, { Circle, G, Line, Path, Text as SvgText } from "react-native-svg";
import { StaffNoteGlyph, StaffRestGlyph } from "@/components/staff/StaffGlyphs";
import { ALL_INSTR_SYMBOLS, ARTICULATIONS } from "@/components/ScorePalette";

const noteDenominator: Record<string, number> = { whole: 1, half: 2, quarter: 4, eighth: 8, sixteenth: 16, "thirty_second": 32 };
const restDenominator: Record<string, number> = { "rest-whole": 1, "rest-half": 2, "rest-quarter": 4, "rest-eighth": 8, "rest-sixteenth": 16 };
const typography: Record<string, string> = {
  sharp: "♯", flat: "♭", natural: "♮", double_sharp: "𝄪", double_flat: "𝄫",
  repeat_start: "||:", repeat_end: ":||", repeat_both: ":||:", segno: "𝄋", coda: "𝄌",
  fermata: "𝄐", staccato: "·", tenuto: "—", accent: ">", marcato: "^", snap_pizzicato: "◎",
  bowUp: "↑", bowDown: "↓", harmonic: "◇", pizzicato: "pizz.", arco: "arco",
  pedal: "𝆑", pedalEnd: "✻", ottava1: "8va", arpeggio: "≈",
  trill: "tr~", mordent: "𝒎", turn: "𝒔", tremolo: "///", grace_note: "𝅘♪",
  glissando: "gliss.", arpeggio_up: "≀↑", arpeggio_down: "≀↓",
  da_capo: "D.C.", dal_segno: "D.S.", dal_segno_coda: "D.S.𝄌", da_capo_coda: "D.C.𝄌", fine: "Fine", volta1: "1.", volta2: "2.",
};

export function NotebookGlyph({ glyph, x, y, size }: { glyph: string; x: number; y: number; size: number }) {
  const noteValue = noteDenominator[glyph];
  if (noteValue) {
    return <G transform={`translate(${x} ${y}) scale(${size / 26})`}><StaffNoteGlyph type="normal" active index={0} x={0} beamCount={Math.max(0, Math.round(Math.log2(noteValue)) - 2)} grouped={false} noteValueDenominator={noteValue} colors={{ accent: "#111111" }} noteY={0} stemTop={-31} beamGap={5} /></G>;
  }
  const restValue = restDenominator[glyph];
  if (restValue) {
    return <G transform={`translate(${x} ${y}) scale(${size / 26})`}><StaffRestGlyph index={0} x={0} beamCount={Math.max(0, Math.round(Math.log2(restValue)) - 2)} grouped={false} noteValueDenominator={restValue} color="#111111" noteY={0} stemTop={-31} beamGap={5} /></G>;
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
  if (glyph === "coda") return <G><Circle cx={x} cy={y} r={size * 0.32} stroke="#111" strokeWidth={1.8} fill="none" /><Line x1={x - size * 0.5} x2={x + size * 0.5} y1={y} y2={y} stroke="#111" strokeWidth={1.8} /><Line x1={x} x2={x} y1={y - size * 0.5} y2={y + size * 0.5} stroke="#111" strokeWidth={1.8} /></G>;
  return <SvgText x={x} y={y + size * 0.32} textAnchor="middle" fill="#111111" fontSize={Math.max(8, size * 0.85)} fontFamily="serif">{typography[glyph] ?? [...ALL_INSTR_SYMBOLS, ...ARTICULATIONS].find((item) => item.id === glyph)?.symbol ?? glyph}</SvgText>;
}

export function NotebookGlyphPreview({ glyph, size = 26 }: { glyph: string; size?: number }) {
  return <Svg width={size + 28} height={size + 24} viewBox="0 0 70 55"><NotebookGlyph glyph={glyph} x={35} y={28} size={size} /></Svg>;
}
