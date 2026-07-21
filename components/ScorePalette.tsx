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
  OrnamentType,
  NoteHeadType,
} from "@/lib/score-types";
import type { EditorTool } from "@/components/ScoreCanvas";

// ── 음표 머리 선택 항목 (퍼커션 클레프 전용) ───────────────────
const NOTE_HEAD_OPTIONS: Array<{ value: NoteHeadType; symbol: string; labelKey: string }> = [
  { value: "normal",     symbol: "●", labelKey: "noteHeadNormal" },
  { value: "cross",      symbol: "✕", labelKey: "noteHeadCross" },
  { value: "cross_open", symbol: "✕°", labelKey: "noteHeadCrossOpen" },
  { value: "open_circle", symbol: "○", labelKey: "noteHeadOpenCircle" },
  { value: "slash",      symbol: "/", labelKey: "noteHeadSlash" },
];

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
  bpmMin?: number;
  bpmMax?: number;
  symbol?: string;
}

const TEMPOS: TempoItem[] = [
  { id: "Largo",    labelKey: "tempoLargo",    bpm: 50,  bpmMin: 20,  bpmMax: 60 },
  { id: "Adagio",   labelKey: "tempoAdagio",   bpm: 72,  bpmMin: 60,  bpmMax: 80 },
  { id: "Andante",  labelKey: "tempoAndante",  bpm: 92,  bpmMin: 76,  bpmMax: 108 },
  { id: "Moderato", labelKey: "tempoModerato", bpm: 108, bpmMin: 100, bpmMax: 120 },
  { id: "Allegro",  labelKey: "tempoAllegro",  bpm: 132, bpmMin: 120, bpmMax: 168 },
  { id: "Vivace",   labelKey: "tempoVivace",   bpm: 160, bpmMin: 156, bpmMax: 176 },
  { id: "Presto",   labelKey: "tempoPresto",   bpm: 180, bpmMin: 168, bpmMax: 208 },
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

type PaletteTab = "notes" | "rests" | "signs" | "tempo";

// ── Props ─────────────────────────────────────────────────────

export interface ScorePaletteProps {
  activeTool: EditorTool;
  activeDuration: NoteDuration;
  isDotted: boolean;
  isDoubleDotted?: boolean;
  accidental: Accidental | null;
  selectedArticulation: ArticulationType | null;
  selectedOrnament?: OrnamentType | null;
  selectedRepeatSign?: RepeatSignId | null;
  selectedCrescType?: CrescType;
  onToolChange: (tool: EditorTool) => void;
  onDurationChange: (dur: NoteDuration) => void;
  onDottedChange: (dotted: boolean) => void;
  onDoubleDottedChange?: (doubleDotted: boolean) => void;
  onAccidentalChange: (acc: Accidental | null) => void;
  onArticulationSelect: (id: ArticulationType | null) => void;
  onOrnamentSelect?: (id: OrnamentType | null) => void;
  onRepeatSignSelect?: (id: RepeatSignId | null) => void;
  onCrescTypeSelect?: (type: CrescType) => void;
  onTempoSelect?: (text: string, bpm: number) => void;
  /** true이면 현재 활성 파트가 타악기(percussion) 오선이며 음표머리 선택 UI를 표시합니다 */
  isPercussionPart?: boolean;
  selectedNoteHead?: NoteHeadType | null;
  onNoteHeadSelect?: (noteHead: NoteHeadType | null) => void;
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────

export function ScorePalette({
  activeTool,
  activeDuration,
  isDotted,
  isDoubleDotted = false,
  accidental,
  selectedArticulation,
  selectedOrnament,
  selectedRepeatSign,
  selectedCrescType,
  onToolChange,
  onDurationChange,
  onDottedChange,
  onDoubleDottedChange,
  onAccidentalChange,
  onArticulationSelect,
  onOrnamentSelect,
  onRepeatSignSelect,
  onCrescTypeSelect,
  onTempoSelect,
  isPercussionPart = false,
  selectedNoteHead,
  onNoteHeadSelect,
}: ScorePaletteProps) {
  const { colors: C } = useTheme();
  const { t } = useLanguage();
  const [tab, setTab] = useState<PaletteTab>(
    activeTool === "rest" ? "rests" : "notes",
  );
  const [selectedTempo, setSelectedTempo] = useState<string | null>(null);
  const [editingTempoBpm, setEditingTempoBpm] = useState("");
  const [customTempoText, setCustomTempoText] = useState("");
  const [customBpmValue, setCustomBpmValue] = useState("");

  const styles = makeStyles(C);

  const activeTempoItem = TEMPOS.find((tempo) => tempo.id === selectedTempo) ?? null;
  const editingBpmNum = parseInt(editingTempoBpm, 10);
  const isTempoEditVisible = activeTempoItem != null && activeTempoItem.bpmMin != null;
  const isBpmOutOfRange = isTempoEditVisible && !isNaN(editingBpmNum)
    && (editingBpmNum < activeTempoItem!.bpmMin! || editingBpmNum > activeTempoItem!.bpmMax!);

  const TAB_DEFS: Array<{ id: PaletteTab; labelKey: string; tool?: EditorTool }> = [
    { id: "notes",    labelKey: "paletteNotes",    tool: "note" },
    { id: "rests",    labelKey: "paletteRests",    tool: "rest" },
    { id: "signs",    labelKey: "paletteSigns",    tool: "select" },
    { id: "tempo",    labelKey: "paletteTempo" },
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
                if (td.tool) {
                  onToolChange(td.tool);
                } else if (activeTool === "select" || activeTool === "erase") {
                  onToolChange("note");
                }
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
      </ScrollView>

      {/* ── 현재 적용중인 기호(아티큘레이션/꾸밈음) 표시줄 ── */}
      {tab === "notes" && (selectedArticulation || selectedOrnament) && (
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

      {/* ── 퍼커션 클레프: 음표머리 선택 행 ───────────────────────── */}
      {tab === "notes" && isPercussionPart && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.itemRow}
        >
          {/* null 선택 = 기본 음표머리 사용 */}
          <Pressable
            style={[
              styles.durBtn,
              {
                backgroundColor: selectedNoteHead == null ? C.accent + "33" : "transparent",
                borderColor: selectedNoteHead == null ? C.accent : C.border,
              },
            ]}
            onPress={() => onNoteHeadSelect?.(null)}
            testID="score-palette-notehead-default"
          >
            <Text style={[styles.durSymbol, { color: selectedNoteHead == null ? C.accent : C.text }]}>
              —
            </Text>
            <Text style={[styles.durLabel, { color: selectedNoteHead == null ? C.accent : C.textSecondary }]}>
              {t("scoreMode", "noteHeadDefault" as any)}
            </Text>
          </Pressable>
          {NOTE_HEAD_OPTIONS.map((nh) => {
            const isActive = selectedNoteHead === nh.value;
            return (
              <Pressable
                key={nh.value}
                style={[
                  styles.durBtn,
                  {
                    backgroundColor: isActive ? C.accent + "33" : "transparent",
                    borderColor: isActive ? C.accent : C.border,
                  },
                ]}
                onPress={() => onNoteHeadSelect?.(nh.value)}
                testID={`score-palette-notehead-${nh.value}`}
              >
                <Text style={[styles.durSymbol, { color: isActive ? C.accent : C.text }]}>
                  {nh.symbol}
                </Text>
                <Text style={[styles.durLabel, { color: isActive ? C.accent : C.textSecondary }]}>
                  {t("scoreMode", nh.labelKey as any)}
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

          <View style={[styles.divider, { backgroundColor: C.border }]} />

          {/* 크레셴도 / 데크레셴도 */}
          {CRESC_ITEMS.map((ci) => {
            const isActive = selectedCrescType === ci.id;
            return (
              <Pressable
                key={ci.id as string}
                style={[
                  styles.signBtn,
                  {
                    backgroundColor: isActive ? C.accent + "33" : "transparent",
                    borderColor: isActive ? C.accent : C.border,
                    minWidth: 56,
                  },
                ]}
                onPress={() => onCrescTypeSelect?.(isActive ? null : ci.id)}
                testID={`score-palette-cresc-${ci.id}`}
              >
                <Text style={[styles.artSymbol, { color: isActive ? C.accent : C.text, fontSize: 18 }]}>
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
              const hasRange = tempo.bpmMin != null && tempo.bpmMax != null;
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
                    if (!hasRange) {
                      // rit. / accel. — 즉시 적용
                      setSelectedTempo(isActive ? null : tempo.id);
                      if (!isActive) {
                        onTempoSelect?.(tempo.id, tempo.bpm);
                      }
                    } else {
                      // 범위 있는 프리셋 → 편집 모드 진입/나가기
                      if (isActive) {
                        setSelectedTempo(null);
                        setEditingTempoBpm("");
                      } else {
                        setSelectedTempo(tempo.id);
                        setEditingTempoBpm(String(tempo.bpm));
                      }
                    }
                  }}
                  testID={`score-palette-tempo-${tempo.id}`}
                >
                  <Text style={[styles.tempoName, { color: isActive ? C.accent : C.text }]}>
                    {tempo.symbol ?? displayLabel}
                  </Text>
                  {hasRange && (
                    <Text style={[styles.tempoBpm, { color: isActive ? C.accent : C.textSecondary }]}>
                      {tempo.bpmMin}–{tempo.bpmMax}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>

          {/* 선택된 프리셋의 BPM 편집 행 */}
          {isTempoEditVisible && activeTempoItem && (
            <View style={[styles.tempoEditRow, { borderTopColor: C.border, backgroundColor: C.surface }]}>
              <Text style={[styles.tempoEditLabel, { color: C.textSecondary }]}>
                {t("scoreMode", activeTempoItem.labelKey as any)}
                {"  "}
                <Text style={{ color: C.textSecondary, fontStyle: "italic" }}>
                  {activeTempoItem.bpmMin}–{activeTempoItem.bpmMax}
                </Text>
              </Text>
              <TextInput
                style={[
                  styles.tempoEditInput,
                  {
                    color: isBpmOutOfRange ? "#e05050" : C.text,
                    borderColor: isBpmOutOfRange ? "#e05050" : C.accent,
                    backgroundColor: C.background,
                  },
                ]}
                value={editingTempoBpm}
                onChangeText={setEditingTempoBpm}
                keyboardType="number-pad"
                returnKeyType="done"
                testID="score-palette-tempo-bpm-edit"
              />
              <Pressable
                style={[styles.tempoCustomApply, { backgroundColor: C.accent }]}
                onPress={() => {
                  const bpm = parseInt(editingTempoBpm.trim(), 10);
                  const clamped = isNaN(bpm) ? activeTempoItem.bpm
                    : Math.max(activeTempoItem.bpmMin!, Math.min(activeTempoItem.bpmMax!, bpm));
                  onTempoSelect?.(activeTempoItem.id, clamped);
                  setSelectedTempo(null);
                  setEditingTempoBpm("");
                }}
                testID="score-palette-tempo-bpm-confirm"
              >
                <Text style={styles.tempoCustomApplyText}>✓</Text>
              </Pressable>
            </View>
          )}

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
    tempoEditRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 6,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 6,
      borderTopWidth: 1,
    },
    tempoEditLabel: {
      flex: 1,
      fontFamily: "SpaceGrotesk_500Medium",
      fontSize: 12,
      fontStyle: "italic" as const,
    },
    tempoEditInput: {
      borderWidth: 1,
      borderRadius: Radius.sm,
      paddingHorizontal: 8,
      paddingVertical: 6,
      fontSize: 14,
      fontFamily: "SpaceGrotesk_600SemiBold",
      minWidth: 56,
      textAlign: "center" as const,
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
