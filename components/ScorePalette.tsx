// ============================================================
// ScorePalette — 음표 입력 팔레트
// 탭: [음표][쉼표][부호][강약][빠르기][악기 기호]
// ============================================================

import React, { useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Spacing, Radius } from "@/constants/tokens";
import type {
  NoteDuration,
  Accidental,
  ArticulationType,
  Dynamic,
  InstrumentCategory,
  OrnamentType,
  DrumType,
} from "@/lib/score-types";
import { DRUM_TYPES, DRUM_MAP } from "@/lib/score-types";
import type { EditorTool } from "@/components/ScoreCanvas";

// ── 음표 길이 ─────────────────────────────────────────────────

const DURATIONS: Array<{ value: NoteDuration; symbol: string; labelKey: string }> = [
  { value: "whole",          symbol: "𝅝",  labelKey: "durationWhole" },
  { value: "half",           symbol: "𝅗𝅥", labelKey: "durationHalf" },
  { value: "quarter",        symbol: "♩",  labelKey: "durationQuarter" },
  { value: "eighth",         symbol: "♪",  labelKey: "durationEighth" },
  { value: "sixteenth",      symbol: "𝅘𝅥𝅯", labelKey: "durationSixteenth" },
  { value: "thirty_second",  symbol: "𝅘𝅥𝅰", labelKey: "durationThirtySecond" },
];

// ── 아티큘레이션 ──────────────────────────────────────────────

const ARTICULATIONS: Array<{ id: ArticulationType; symbol: string; labelKey: string }> = [
  { id: "staccato",           symbol: "·",    labelKey: "articulStaccato" },
  { id: "tenuto",             symbol: "—",    labelKey: "articulTenuto" },
  { id: "accent",             symbol: ">",    labelKey: "articulAccent" },
  { id: "fermata",            symbol: "𝄐",   labelKey: "articulFermata" },
  { id: "marcato",            symbol: "^",    labelKey: "articulMarcato" },
  { id: "staccatissimo",      symbol: "▼",    labelKey: "articulStaccatissimo" },
  { id: "portato",            symbol: "—·",   labelKey: "articulPortato" },
  { id: "snap_pizzicato",     symbol: "◎",    labelKey: "articulSnapPizzicato" },
  { id: "left_hand_pizzicato", symbol: "+",   labelKey: "articulLeftHandPizz" },
];

// ── 임시표 ────────────────────────────────────────────────────

const ACCIDENTALS: Array<{ value: Accidental; symbol: string; labelKey: string }> = [
  { value: "natural",      symbol: "♮", labelKey: "accidentalNatural" },
  { value: "sharp",        symbol: "♯", labelKey: "accidentalSharp" },
  { value: "flat",         symbol: "♭", labelKey: "accidentalFlat" },
  { value: "double_sharp", symbol: "𝄪", labelKey: "accidentalDoubleSharp" },
  { value: "double_flat",  symbol: "𝄫", labelKey: "accidentalDoubleFlat" },
];

// ── 반복/이동 부호 ─────────────────────────────────────────────

export type RepeatSignId =
  | "repeat_start"
  | "repeat_end"
  | "repeat_both"
  | "segno"
  | "coda"
  | "da_capo"
  | "dal_segno"
  | "dal_segno_coda"
  | "da_capo_coda"
  | "fine"
  | "volta1"
  | "volta2";

export interface RepeatSignItem { id: RepeatSignId; symbol: string; labelKey: string; }

const REPEAT_SIGNS: RepeatSignItem[] = [
  { id: "repeat_start",    symbol: "||:",   labelKey: "signRepeatStart" },
  { id: "repeat_end",      symbol: ":||",   labelKey: "signRepeatEnd" },
  { id: "repeat_both",     symbol: ":||:",  labelKey: "signRepeatBoth" },
  { id: "segno",           symbol: "𝄋",    labelKey: "signSegno" },
  { id: "coda",            symbol: "𝄌",    labelKey: "signCoda" },
  { id: "da_capo",         symbol: "D.C.",  labelKey: "signDaCapo" },
  { id: "dal_segno",       symbol: "D.S.",  labelKey: "signDalSegno" },
  { id: "dal_segno_coda",  symbol: "D.S.𝄌", labelKey: "signDalSegnoCoda" },
  { id: "da_capo_coda",    symbol: "D.C.𝄌", labelKey: "signDaCapoCoda" },
  { id: "fine",            symbol: "Fine",  labelKey: "signFine" },
  { id: "volta1",          symbol: "1.",    labelKey: "signVolta1" },
  { id: "volta2",          symbol: "2.",    labelKey: "signVolta2" },
];

// ── 강약 ──────────────────────────────────────────────────────

const DYNAMICS: Array<{ id: Dynamic; symbol: string }> = [
  { id: "ppp",  symbol: "ppp" },
  { id: "pp",   symbol: "pp" },
  { id: "p",    symbol: "p" },
  { id: "mp",   symbol: "mp" },
  { id: "mf",   symbol: "mf" },
  { id: "f",    symbol: "f" },
  { id: "ff",   symbol: "ff" },
  { id: "fff",  symbol: "fff" },
  { id: "sfz",  symbol: "sfz" },
  { id: "fp",   symbol: "fp" },
  { id: "mute", symbol: "𝄽" },
];

// ── 꾸밈음 ────────────────────────────────────────────────────

const ORNAMENTS: Array<{ id: OrnamentType; symbol: string; labelKey: string }> = [
  { id: "trill",         symbol: "tr~",   labelKey: "ornTrill" },
  { id: "mordent",       symbol: "𝒎",    labelKey: "ornMordent" },
  { id: "turn",          symbol: "𝒔",    labelKey: "ornTurn" },
  { id: "tremolo",       symbol: "///",   labelKey: "ornTremolo" },
  { id: "grace_note",    symbol: "𝅘♪",   labelKey: "ornGraceNote" },
  { id: "glissando",     symbol: "gliss.", labelKey: "ornGlissando" },
  { id: "arpeggio_up",   symbol: "≀↑",   labelKey: "ornArpeggioUp" },
  { id: "arpeggio_down", symbol: "≀↓",   labelKey: "ornArpeggioDown" },
];

export type CrescType = "cresc" | "decresc" | null;
const CRESC_ITEMS: Array<{ id: CrescType; symbol: string; labelKey: string }> = [
  { id: "cresc",   symbol: "<",  labelKey: "dynCresc" },
  { id: "decresc", symbol: ">",  labelKey: "dynDecresc" },
];

// ── 빠르기 ────────────────────────────────────────────────────

interface TempoItem {
  id: string;
  labelKey: string;
  bpm: number;
  symbol?: string;
}

const TEMPOS: TempoItem[] = [
  { id: "Largo",    labelKey: "tempoLargo",    bpm: 50 },
  { id: "Adagio",   labelKey: "tempoAdagio",   bpm: 72 },
  { id: "Andante",  labelKey: "tempoAndante",  bpm: 92 },
  { id: "Moderato", labelKey: "tempoModerato", bpm: 108 },
  { id: "Allegro",  labelKey: "tempoAllegro",  bpm: 132 },
  { id: "Vivace",   labelKey: "tempoVivace",   bpm: 160 },
  { id: "Presto",   labelKey: "tempoPresto",   bpm: 180 },
  { id: "rit.",     labelKey: "tempoRit",      bpm: 0, symbol: "rit." },
  { id: "accel.",   labelKey: "tempoAccel",    bpm: 0, symbol: "accel." },
];

// ── 악기별 특수 기호 ──────────────────────────────────────────

export interface InstrSymbol { id: string; symbol: string; labelKey: string; }

const STRINGS_SYMBOLS: InstrSymbol[] = [
  { id: "bowUp",     symbol: "↑",     labelKey: "symBowUp" },
  { id: "bowDown",   symbol: "↓",     labelKey: "symBowDown" },
  { id: "harmonic",  symbol: "◇",     labelKey: "symHarmonic" },
  { id: "pizzicato", symbol: "pizz.", labelKey: "symPizzicato" },
  { id: "arco",      symbol: "arco",  labelKey: "symArco" },
];

const KEYBOARD_SYMBOLS: InstrSymbol[] = [
  { id: "pedal",    symbol: "𝆑",   labelKey: "symPedal" },
  { id: "pedalEnd", symbol: "✻",   labelKey: "symPedalEnd" },
  { id: "ottava1",  symbol: "8va", labelKey: "symOttava" },
  { id: "arpeggio", symbol: "≈",   labelKey: "symArpeggio" },
];

const WOODWIND_SYMBOLS: InstrSymbol[] = [
  { id: "staccato", symbol: "·",  labelKey: "articulStaccato" },
  { id: "tenuto",   symbol: "—",  labelKey: "articulTenuto" },
  { id: "marcato",  symbol: "^",  labelKey: "articulMarcato" },
];

const VOCAL_SYMBOLS: InstrSymbol[] = [
  { id: "fermata",  symbol: "𝄐",  labelKey: "articulFermata" },
  { id: "staccato", symbol: "·",  labelKey: "articulStaccato" },
  { id: "accent",   symbol: ">",  labelKey: "articulAccent" },
];

const PERC_SYMBOLS: InstrSymbol[] = [
  { id: "bowUp",    symbol: "↑",  labelKey: "symBowUp" },
  { id: "bowDown",  symbol: "↓",  labelKey: "symBowDown" },
  { id: "harmonic", symbol: "◇",  labelKey: "symHarmonic" },
];

// 설정 메뉴에서 사용할 전체 악기 기호 목록 (중복 제거)
export const ALL_INSTR_SYMBOLS: InstrSymbol[] = (() => {
  const seen = new Set<string>();
  return [
    ...STRINGS_SYMBOLS, ...KEYBOARD_SYMBOLS,
    ...WOODWIND_SYMBOLS, ...VOCAL_SYMBOLS, ...PERC_SYMBOLS,
  ].filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
})();

// ── 악기 카테고리 서브탭 ──────────────────────────────────────

type InstrSubTab = "all" | "strings" | "woodwind_brass" | "percussion" | "keyboard" | "vocal";

interface SubTabDef { id: InstrSubTab; labelKey: string; }

const INSTR_SUB_TABS: SubTabDef[] = [
  { id: "all",            labelKey: "catAll" },
  { id: "strings",        labelKey: "catStrings" },
  { id: "woodwind_brass", labelKey: "catWoodwindBrass" },
  { id: "percussion",     labelKey: "catPercussion" },
  { id: "keyboard",       labelKey: "catKeyboard" },
  { id: "vocal",          labelKey: "catVocal" },
];

const INSTR_SYMBOL_MAP: Record<InstrSubTab, InstrSymbol[]> = {
  all:            [...STRINGS_SYMBOLS, ...KEYBOARD_SYMBOLS],
  strings:        STRINGS_SYMBOLS,
  woodwind_brass: WOODWIND_SYMBOLS,
  percussion:     PERC_SYMBOLS,
  keyboard:       KEYBOARD_SYMBOLS,
  vocal:          VOCAL_SYMBOLS,
};

// ── 팔레트 탭 ─────────────────────────────────────────────────

type PaletteTab = "notes" | "rests" | "signs" | "dynamics" | "tempo" | "instr";

// ── Props ─────────────────────────────────────────────────────

export interface ScorePaletteProps {
  activeTool: EditorTool;
  activeDuration: NoteDuration;
  isDotted: boolean;
  isDoubleDotted?: boolean;
  accidental: Accidental | null;
  selectedArticulation: ArticulationType | null;
  selectedDynamic: Dynamic | null;
  selectedOrnament?: OrnamentType | null;
  selectedRepeatSign?: RepeatSignId | null;
  selectedInstrumentSymbol?: string | null;
  onInstrumentSymbolSelect?: (id: string | null) => void;
  selectedCrescType?: CrescType;
  instrumentCategory?: InstrumentCategory;
  enabledSymbols?: Record<string, boolean>;
  onToolChange: (tool: EditorTool) => void;
  onDurationChange: (dur: NoteDuration) => void;
  onDottedChange: (dotted: boolean) => void;
  onDoubleDottedChange?: (doubleDotted: boolean) => void;
  onAccidentalChange: (acc: Accidental | null) => void;
  onArticulationSelect: (id: ArticulationType | null) => void;
  onDynamicSelect: (id: Dynamic | null) => void;
  onOrnamentSelect?: (id: OrnamentType | null) => void;
  onRepeatSignSelect?: (id: RepeatSignId | null) => void;
  onCrescTypeSelect?: (type: CrescType) => void;
  onTempoSelect?: (text: string, bpm: number) => void;
  onSymbolToggle?: (id: string, enabled: boolean) => void;
  /** true이면 현재 활성 파트가 타악기(percussion) 오선이며 드럼 종류 선택 UI를 표시합니다 */
  isPercussionPart?: boolean;
  selectedDrumType?: DrumType;
  onDrumTypeSelect?: (drumType: DrumType) => void;
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────

export function ScorePalette({
  activeTool,
  activeDuration,
  isDotted,
  isDoubleDotted = false,
  accidental,
  selectedArticulation,
  selectedDynamic,
  selectedOrnament,
  selectedRepeatSign,
  selectedCrescType,
  selectedInstrumentSymbol = null,
  onInstrumentSymbolSelect,
  instrumentCategory,
  enabledSymbols = {},
  onToolChange,
  onDurationChange,
  onDottedChange,
  onDoubleDottedChange,
  onAccidentalChange,
  onArticulationSelect,
  onDynamicSelect,
  onOrnamentSelect,
  onRepeatSignSelect,
  onCrescTypeSelect,
  onTempoSelect,
  onSymbolToggle,
  isPercussionPart = false,
  selectedDrumType,
  onDrumTypeSelect,
}: ScorePaletteProps) {
  const { colors: C } = useTheme();
  const { t } = useLanguage();
  const [tab, setTab] = useState<PaletteTab>(
    activeTool === "rest" ? "rests" : "notes",
  );
  const [selectedTempo, setSelectedTempo] = useState<string | null>(null);
  const [customTempoText, setCustomTempoText] = useState("");
  const [customBpmValue, setCustomBpmValue] = useState("");
  const [instrSubTab, setInstrSubTab] = useState<InstrSubTab>(() => {
    switch (instrumentCategory) {
      case "strings":    return "strings";
      case "keyboard":   return "keyboard";
      case "woodwind":
      case "brass":      return "woodwind_brass";
      case "percussion": return "percussion";
      case "vocal":      return "vocal";
      default:           return "all";
    }
  });

  const styles = makeStyles(C);

  // 카테고리 서브탭 기호 목록
  const instrSymbols = INSTR_SYMBOL_MAP[instrSubTab] ?? INSTR_SYMBOL_MAP.all;

  const TAB_DEFS: Array<{ id: PaletteTab; labelKey: string; tool?: EditorTool }> = [
    { id: "notes",    labelKey: "paletteNotes",    tool: "note" },
    { id: "rests",    labelKey: "paletteRests",    tool: "rest" },
    { id: "signs",    labelKey: "paletteSigns" },
    { id: "dynamics", labelKey: "paletteDynamics" },
    { id: "tempo",    labelKey: "paletteTempo" },
    { id: "instr",    labelKey: "paletteInstr" },
  ];

  return (
    <View style={[styles.container, { borderTopColor: C.border, backgroundColor: C.surface }]}>
      {/* ── 탭 헤더 ────────────────────────────────────────────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabRow}
      >
        {TAB_DEFS.map((td) => {
          const isTabActive = tab === td.id;
          return (
            <Pressable
              key={td.id}
              style={[
                styles.tabBtn,
                { borderBottomColor: isTabActive ? C.accent : "transparent" },
              ]}
              onPress={() => {
                setTab(td.id);
                if (td.tool) onToolChange(td.tool);
              }}
              testID={`score-palette-tab-${td.id}`}
            >
              <Text
                style={[
                  styles.tabLabel,
                  { color: isTabActive ? C.accent : C.textSecondary },
                ]}
              >
                {t("scoreMode", td.labelKey as any)}
              </Text>
            </Pressable>
          );
        })}

        {/* 선택 / 지우기 도구 */}
        {(["select", "erase"] as EditorTool[]).map((tool) => {
          const key = tool === "select" ? "toolSelect" : "toolErase";
          const isActive = activeTool === tool;
          return (
            <Pressable
              key={tool}
              style={[
                styles.tabBtn,
                { borderBottomColor: isActive ? C.accent : "transparent" },
              ]}
              onPress={() => onToolChange(tool)}
              testID={`score-palette-tool-${tool}`}
            >
              <Text
                style={[styles.tabLabel, { color: isActive ? C.accent : C.textSecondary }]}
              >
                {t("scoreMode", key as any)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* ── 현재 적용중인 기호(아티큘레이션/꾸밈음/강약/악기 기호) 표시줄 ── */}
      {tab === "notes" && (selectedArticulation || selectedOrnament || selectedDynamic || selectedInstrumentSymbol) && (
        <View style={[styles.activeSymbolsRow, { borderBottomColor: C.border }]}>
          <Text style={[styles.activeSymbolsLabel, { color: C.textSecondary }]}>
            {t("scoreMode", "currentArticulationLabel")}:
          </Text>
          {selectedArticulation && (
            <Pressable
              style={[styles.activeSymbolChip, { borderColor: C.accent, backgroundColor: C.accent + "22" }]}
              onPress={() => onArticulationSelect(null)}
              testID="score-palette-active-articulation"
            >
              <Text style={[styles.activeSymbolChipText, { color: C.accent }]}>
                {ARTICULATIONS.find((a) => a.id === selectedArticulation)?.symbol ?? ""}
              </Text>
              <Ionicons name="close" size={12} color={C.accent} />
            </Pressable>
          )}
          {selectedOrnament && (
            <Pressable
              style={[styles.activeSymbolChip, { borderColor: C.accent, backgroundColor: C.accent + "22" }]}
              onPress={() => onOrnamentSelect?.(null)}
              testID="score-palette-active-ornament"
            >
              <Text style={[styles.activeSymbolChipText, { color: C.accent }]}>
                {ORNAMENTS.find((o) => o.id === selectedOrnament)?.symbol ?? selectedOrnament}
              </Text>
              <Ionicons name="close" size={12} color={C.accent} />
            </Pressable>
          )}
          {selectedDynamic && (
            <Pressable
              style={[styles.activeSymbolChip, { borderColor: C.accent, backgroundColor: C.accent + "22" }]}
              onPress={() => onDynamicSelect(null)}
              testID="score-palette-active-dynamic"
            >
              <Text style={[styles.activeSymbolChipText, { color: C.accent }]}>{selectedDynamic}</Text>
              <Ionicons name="close" size={12} color={C.accent} />
            </Pressable>
          )}
          {selectedInstrumentSymbol && (
            <Pressable
              style={[styles.activeSymbolChip, { borderColor: C.accent, backgroundColor: C.accent + "22" }]}
              onPress={() => onInstrumentSymbolSelect?.(null)}
              testID="score-palette-active-instr-symbol"
            >
              <Text style={[styles.activeSymbolChipText, { color: C.accent }]}>{selectedInstrumentSymbol}</Text>
              <Ionicons name="close" size={12} color={C.accent} />
            </Pressable>
          )}
        </View>
      )}

      {/* ── 음표 / 쉼표 탭 ─────────────────────────────────────── */}
      {(tab === "notes" || tab === "rests") && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.itemRow}
        >
          {DURATIONS.map((d) => {
            const isActive = activeDuration === d.value;
            return (
              <Pressable
                key={d.value}
                style={[
                  styles.durBtn,
                  {
                    backgroundColor: isActive ? C.accent + "33" : "transparent",
                    borderColor: isActive ? C.accent : C.border,
                  },
                ]}
                onPress={() => onDurationChange(d.value)}
                testID={`score-palette-dur-${d.value}`}
              >
                <Text style={[styles.durSymbol, { color: isActive ? C.accent : C.text }]}>
                  {d.symbol}
                </Text>
                <Text style={[styles.durLabel, { color: isActive ? C.accent : C.textSecondary }]}>
                  {t("scoreMode", d.labelKey as any)}
                </Text>
              </Pressable>
            );
          })}

          <Pressable
            style={[
              styles.durBtn,
              {
                backgroundColor: isDotted ? C.accent + "33" : "transparent",
                borderColor: isDotted ? C.accent : C.border,
              },
            ]}
            onPress={() => onDottedChange(!isDotted)}
            testID="score-palette-dot"
          >
            <Text style={[styles.durSymbol, { color: isDotted ? C.accent : C.text }]}>•</Text>
            <Text style={[styles.durLabel, { color: isDotted ? C.accent : C.textSecondary }]}>
              {t("scoreMode", "durationDot")}
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.durBtn,
              {
                backgroundColor: isDoubleDotted ? C.accent + "33" : "transparent",
                borderColor: isDoubleDotted ? C.accent : C.border,
              },
            ]}
            onPress={() => onDoubleDottedChange?.(!isDoubleDotted)}
            testID="score-palette-double-dot"
          >
            <Text style={[styles.durSymbol, { color: isDoubleDotted ? C.accent : C.text }]}>••</Text>
            <Text style={[styles.durLabel, { color: isDoubleDotted ? C.accent : C.textSecondary }]}>
              {t("scoreMode", "durationDoubleDot")}
            </Text>
          </Pressable>
        </ScrollView>
      )}

      {/* ── 타악기 파트: 드럼 종류 선택 (notes 탭 하단) ────────── */}
      {tab === "notes" && isPercussionPart && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.itemRow}
        >
          {DRUM_TYPES.map((dt) => {
            const isActive = selectedDrumType === dt;
            const entry = DRUM_MAP[dt];
            return (
              <Pressable
                key={dt}
                style={[
                  styles.durBtn,
                  {
                    backgroundColor: isActive ? C.accent + "33" : "transparent",
                    borderColor: isActive ? C.accent : C.border,
                  },
                ]}
                onPress={() => onDrumTypeSelect?.(dt)}
                testID={`score-palette-drum-${dt}`}
              >
                <Text style={[styles.durSymbol, { color: isActive ? C.accent : C.text }]}>
                  {entry.noteHead === "cross" ? "✕" : entry.noteHead === "triangle" ? "▲" : entry.noteHead === "diamond" ? "◆" : "●"}
                </Text>
                <Text style={[styles.durLabel, { color: isActive ? C.accent : C.textSecondary }]}>
                  {t("scoreMode", entry.labelKey as any)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {/* ── 부호 탭: 반복부호 + 임시표 + 아티큘레이션 ─────────── */}
      {tab === "signs" && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.itemRow}
        >
          {/* 반복/이동 부호 */}
          {REPEAT_SIGNS.map((rs) => {
            const isActive = selectedRepeatSign === rs.id;
            return (
              <Pressable
                key={rs.id}
                style={[
                  styles.signBtn,
                  {
                    backgroundColor: isActive ? C.accent + "33" : "transparent",
                    borderColor: isActive ? C.accent : C.border,
                    minWidth: 40,
                  },
                ]}
                onPress={() => onRepeatSignSelect?.(isActive ? null : rs.id)}
                testID={`score-palette-repeat-${rs.id}`}
              >
                <Text style={[styles.accSymbol, { color: isActive ? C.accent : C.text, fontSize: 12 }]}>
                  {rs.symbol}
                </Text>
                <Text style={[styles.durLabel, { color: isActive ? C.accent : C.textSecondary }]}>
                  {t("scoreMode", rs.labelKey as any)}
                </Text>
              </Pressable>
            );
          })}

          <View style={[styles.divider, { backgroundColor: C.border }]} />

          {ACCIDENTALS.map((a) => {
            const isActive = accidental === a.value;
            return (
              <Pressable
                key={a.labelKey}
                style={[
                  styles.signBtn,
                  {
                    backgroundColor: isActive ? C.accent + "33" : "transparent",
                    borderColor: isActive ? C.accent : C.border,
                  },
                ]}
                onPress={() => onAccidentalChange(isActive ? null : a.value)}
                testID={`score-palette-acc-${a.labelKey}`}
              >
                <Text style={[styles.accSymbol, { color: isActive ? C.accent : C.text }]}>
                  {a.symbol}
                </Text>
              </Pressable>
            );
          })}

          <View style={[styles.divider, { backgroundColor: C.border }]} />

          {ARTICULATIONS.map((art) => {
            const isActive = selectedArticulation === art.id;
            return (
              <Pressable
                key={art.id}
                style={[
                  styles.signBtn,
                  {
                    backgroundColor: isActive ? C.accent + "33" : "transparent",
                    borderColor: isActive ? C.accent : C.border,
                  },
                ]}
                onPress={() => onArticulationSelect(isActive ? null : art.id)}
                testID={`score-palette-art-${art.id}`}
              >
                <Text style={[styles.artSymbol, { color: isActive ? C.accent : C.text }]}>
                  {art.symbol}
                </Text>
                <Text style={[styles.durLabel, { color: isActive ? C.accent : C.textSecondary }]}>
                  {t("scoreMode", art.labelKey as any)}
                </Text>
              </Pressable>
            );
          })}

          <View style={[styles.divider, { backgroundColor: C.border }]} />

          {/* 꾸밈음 */}
          {ORNAMENTS.map((orn) => {
            const isActive = selectedOrnament === orn.id;
            return (
              <Pressable
                key={orn.id}
                style={[
                  styles.signBtn,
                  {
                    backgroundColor: isActive ? C.accent + "33" : "transparent",
                    borderColor: isActive ? C.accent : C.border,
                    minWidth: 44,
                  },
                ]}
                onPress={() => onOrnamentSelect?.(isActive ? null : orn.id)}
                testID={`score-palette-orn-${orn.id}`}
              >
                <Text style={[styles.artSymbol, { color: isActive ? C.accent : C.text, fontSize: 12 }]}>
                  {orn.symbol}
                </Text>
                <Text style={[styles.durLabel, { color: isActive ? C.accent : C.textSecondary }]}>
                  {t("scoreMode", orn.labelKey as any)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {/* ── 강약 탭 ───────────────────────────────────────────── */}
      {tab === "dynamics" && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.itemRow}
        >
          {DYNAMICS.map((dyn) => {
            const isActive = selectedDynamic === dyn.id;
            return (
              <Pressable
                key={dyn.id}
                style={[
                  styles.dynBtn,
                  {
                    backgroundColor: isActive ? C.accent + "33" : "transparent",
                    borderColor: isActive ? C.accent : C.border,
                  },
                ]}
                onPress={() => onDynamicSelect(isActive ? null : dyn.id)}
                testID={`score-palette-dyn-${dyn.id}`}
              >
                <Text style={[styles.dynSymbol, { color: isActive ? C.accent : C.text }]}>
                  {dyn.symbol}
                </Text>
              </Pressable>
            );
          })}

          <View style={[styles.divider, { backgroundColor: C.border }]} />

          {CRESC_ITEMS.map((ci) => {
            const isActive = selectedCrescType === ci.id;
            return (
              <Pressable
                key={ci.id as string}
                style={[
                  styles.dynBtn,
                  {
                    backgroundColor: isActive ? C.accent + "33" : "transparent",
                    borderColor: isActive ? C.accent : C.border,
                    width: 56,
                  },
                ]}
                onPress={() => onCrescTypeSelect?.(isActive ? null : ci.id)}
                testID={`score-palette-cresc-${ci.id}`}
              >
                <Text style={[styles.dynSymbol, { color: isActive ? C.accent : C.text, fontSize: 18 }]}>
                  {ci.symbol}
                </Text>
                <Text style={[styles.durLabel, { color: isActive ? C.accent : C.textSecondary }]}>
                  {t("scoreMode", ci.labelKey as any)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {/* ── 빠르기 탭 ─────────────────────────────────────────── */}
      {tab === "tempo" && (
        <View>
          {/* 프리셋 버튼 가로 스크롤 */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.itemRow}
          >
            {TEMPOS.map((tempo) => {
              const isActive = selectedTempo === tempo.id;
              const displayLabel = t("scoreMode", tempo.labelKey as any);
              return (
                <Pressable
                  key={tempo.id}
                  style={[
                    styles.tempoBtn,
                    {
                      backgroundColor: isActive ? C.accent + "33" : "transparent",
                      borderColor: isActive ? C.accent : C.border,
                    },
                  ]}
                  onPress={() => {
                    setSelectedTempo(isActive ? null : tempo.id);
                    if (!isActive) {
                      onTempoSelect?.(tempo.id, tempo.bpm);
                    }
                  }}
                  testID={`score-palette-tempo-${tempo.id}`}
                >
                  <Text style={[styles.tempoName, { color: isActive ? C.accent : C.text }]}>
                    {tempo.symbol ?? displayLabel}
                  </Text>
                  {tempo.bpm > 0 && (
                    <Text style={[styles.tempoBpm, { color: isActive ? C.accent : C.textSecondary }]}>
                      ♩={tempo.bpm}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>

          {/* 자유 텍스트 입력 행 */}
          <View style={[styles.tempoCustomRow, { borderTopColor: C.border }]}>
            <TextInput
              style={[styles.tempoCustomInput, { color: C.text, borderColor: C.border, backgroundColor: C.background, flex: 2 }]}
              value={customTempoText}
              onChangeText={setCustomTempoText}
              placeholder="Allegro / rit. / accel."
              placeholderTextColor={C.textSecondary}
              returnKeyType="done"
              testID="score-palette-custom-tempo-text"
            />
            <TextInput
              style={[styles.tempoCustomInput, { color: C.text, borderColor: C.border, backgroundColor: C.background, flex: 1 }]}
              value={customBpmValue}
              onChangeText={setCustomBpmValue}
              placeholder="BPM"
              placeholderTextColor={C.textSecondary}
              keyboardType="number-pad"
              returnKeyType="done"
              testID="score-palette-custom-tempo-bpm"
            />
            <Pressable
              style={[styles.tempoCustomApply, { backgroundColor: C.accent }]}
              onPress={() => {
                const text = customTempoText.trim();
                const bpm = parseInt(customBpmValue.trim(), 10);
                if (!text && !bpm) return;
                onTempoSelect?.(text || "custom", bpm > 0 ? bpm : 0);
                setCustomTempoText("");
                setCustomBpmValue("");
              }}
              testID="score-palette-custom-tempo-apply"
            >
              <Text style={styles.tempoCustomApplyText}>✓</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* ── 악기별 기호 탭 ────────────────────────────────────── */}
      {tab === "instr" && (
        <View>
          {/* 카테고리 서브탭 */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.itemRow, { paddingVertical: 4 }]}
          >
            {INSTR_SUB_TABS.map((sub) => {
              const isSubActive = instrSubTab === sub.id;
              return (
                <Pressable
                  key={sub.id}
                  style={[
                    styles.subTabBtn,
                    {
                      backgroundColor: isSubActive ? C.accent + "33" : "transparent",
                      borderColor: isSubActive ? C.accent : C.border,
                    },
                  ]}
                  onPress={() => setInstrSubTab(sub.id)}
                  testID={`score-palette-instr-sub-${sub.id}`}
                >
                  <Text style={[styles.durLabel, { color: isSubActive ? C.accent : C.textSecondary }]}>
                    {t("scoreMode", sub.labelKey as any)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* 해당 카테고리 기호 목록 */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.itemRow}
          >
            {instrSymbols.map((sym) => {
              const isEnabled = enabledSymbols[sym.id] !== false;
              const isActive = selectedInstrumentSymbol === sym.id;
              return (
                <Pressable
                  key={sym.id}
                  style={[
                    styles.instrBtn,
                    {
                      backgroundColor: isActive ? C.accent + "44" : isEnabled ? C.accent + "22" : "transparent",
                      borderColor: isActive ? C.accent : isEnabled ? C.accent + "88" : C.border,
                      opacity: isEnabled ? 1 : 0.5,
                    },
                  ]}
                  onPress={() => {
                    if (isEnabled) onInstrumentSymbolSelect?.(isActive ? null : sym.id);
                  }}
                  onLongPress={() => onSymbolToggle?.(sym.id, !isEnabled)}
                  testID={`score-palette-sym-${sym.id}`}
                >
                  <Text style={[styles.instrSymbol, { color: isActive ? C.accent : isEnabled ? C.accent : C.text }]}>
                    {sym.symbol}
                  </Text>
                  <Text style={[styles.durLabel, { color: isActive ? C.accent : isEnabled ? C.accent : C.textSecondary }]}>
                    {t("scoreMode", sym.labelKey as any)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const makeStyles = (C: any) =>
  StyleSheet.create({
    container: {
      borderTopWidth: 1,
      paddingTop: 4,
    },
    tabRow: {
      flexDirection: "row",
      paddingHorizontal: 4,
      gap: 1,
      borderBottomWidth: 0,
    },
    tabBtn: {
      alignItems: "center",
      paddingVertical: 6,
      paddingHorizontal: 8,
      borderBottomWidth: 2,
    },
    tabLabel: {
      fontFamily: "SpaceGrotesk_500Medium",
      fontSize: 10,
    },
    activeSymbolsRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: Spacing.sm,
      paddingVertical: 4,
      gap: 6,
      borderBottomWidth: 1,
      flexWrap: "wrap",
    },
    activeSymbolsLabel: {
      fontFamily: "SpaceGrotesk_500Medium",
      fontSize: 10,
    },
    activeSymbolChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: Radius.pill ?? 999,
      borderWidth: 1,
    },
    activeSymbolChipText: {
      fontFamily: "SpaceGrotesk_500Medium",
      fontSize: 12,
    },
    itemRow: {
      flexDirection: "row",
      paddingHorizontal: Spacing.sm,
      paddingVertical: 8,
      gap: 6,
      alignItems: "center",
    },
    durBtn: {
      alignItems: "center",
      borderWidth: 1,
      borderRadius: Radius.sm,
      paddingHorizontal: 10,
      paddingVertical: 6,
      minWidth: 46,
      gap: 2,
    },
    durSymbol: {
      fontSize: 18,
      fontFamily: "serif",
    },
    durLabel: {
      fontFamily: "SpaceGrotesk_400Regular",
      fontSize: 9,
    },
    signBtn: {
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderRadius: Radius.sm,
      paddingHorizontal: 10,
      paddingVertical: 6,
      minWidth: 38,
      gap: 2,
    },
    accSymbol: {
      fontSize: 22,
      fontFamily: "serif",
    },
    artSymbol: {
      fontSize: 20,
      fontFamily: "serif",
    },
    divider: {
      width: 1,
      height: 32,
      marginHorizontal: 4,
    },
    dynBtn: {
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderRadius: Radius.sm,
      paddingHorizontal: 12,
      paddingVertical: 8,
      minWidth: 40,
    },
    dynSymbol: {
      fontSize: 14,
      fontFamily: "SpaceGrotesk_700Bold",
      fontStyle: "italic",
    },
    tempoBtn: {
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderRadius: Radius.sm,
      paddingHorizontal: 10,
      paddingVertical: 6,
      minWidth: 56,
      gap: 2,
    },
    tempoName: {
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: 12,
      fontStyle: "italic",
    },
    tempoBpm: {
      fontFamily: "SpaceGrotesk_400Regular",
      fontSize: 9,
    },
    instrBtn: {
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderRadius: Radius.sm,
      paddingHorizontal: 10,
      paddingVertical: 6,
      minWidth: 52,
      gap: 2,
    },
    instrSymbol: {
      fontSize: 16,
      fontFamily: "SpaceGrotesk_600SemiBold",
    },
    subTabBtn: {
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderRadius: Radius.sm,
      paddingHorizontal: 8,
      paddingVertical: 4,
      minWidth: 36,
    },
    tempoCustomRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 6,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 6,
      borderTopWidth: 1,
    },
    tempoCustomInput: {
      borderWidth: 1,
      borderRadius: Radius.sm,
      paddingHorizontal: 8,
      paddingVertical: 6,
      fontSize: 12,
      fontFamily: "SpaceGrotesk_400Regular",
    },
    tempoCustomApply: {
      borderRadius: Radius.sm,
      paddingHorizontal: 12,
      paddingVertical: 8,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    tempoCustomApplyText: {
      color: "#fff",
      fontSize: 14,
      fontFamily: "SpaceGrotesk_600SemiBold",
    },
  });
