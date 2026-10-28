import React from "react";
import Svg, { G, Line, Text as SvgText } from "react-native-svg";
import { StaffNoteGlyph } from "@/components/staff/StaffGlyphs";

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
    return <StaffNoteGlyph type="normal" active index={0} x={x} beamCount={Math.max(0, Math.round(Math.log2(noteValue)) - 2)} grouped={false} noteValueDenominator={noteValue} colors={{ accent: "#111111" }} noteY={y} stemTop={y - 31} beamGap={5} />;
  }
  const restValue = restDenominator[glyph];
  if (restValue) {
    return <StaffNoteGlyph type="mute" active index={0} x={x} beamCount={Math.max(0, Math.round(Math.log2(restValue)) - 2)} grouped={false} noteValueDenominator={restValue} colors={{ accent: "#111111" }} noteY={y} stemTop={y - 31} beamGap={5} />;
  }
  if (glyph === "repeat_start" || glyph === "repeat_end" || glyph === "repeat_both") {
    return <G><Line x1={x - size * 0.48} x2={x - size * 0.48} y1={y - size * 0.6} y2={y + size * 0.6} stroke="#111" strokeWidth={1.4} /><Line x1={x - size * 0.32} x2={x - size * 0.32} y1={y - size * 0.6} y2={y + size * 0.6} stroke="#111" strokeWidth={1.4} /><Line x1={x + size * 0.32} x2={x + size * 0.32} y1={y - size * 0.6} y2={y + size * 0.6} stroke="#111" strokeWidth={1.4} /><Line x1={x + size * 0.48} x2={x + size * 0.48} y1={y - size * 0.6} y2={y + size * 0.6} stroke="#111" strokeWidth={1.4} /></G>;
  }
  return <SvgText x={x} y={y + size * 0.32} textAnchor="middle" fill="#111111" fontSize={Math.max(12, size * 0.85)} fontFamily="serif">{typography[glyph] ?? glyph}</SvgText>;
}

export function NotebookGlyphPreview({ glyph, size = 26 }: { glyph: string; size?: number }) {
  return <Svg width={size + 28} height={size + 24} viewBox="0 0 70 55"><NotebookGlyph glyph={glyph} x={35} y={28} size={size} /></Svg>;
}
