// ============================================================
// ScorePalette — 음표 입력 팔레트
// 탭: [음표][쉼표][부호][강약][빠르기][악기 기호]
// ============================================================

import React, { useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Spacing, Radius } from "@/constants/tokens";
import type {
  NoteDuration,
  Accidental,
  ArticulationType,
  Dynamic,
  InstrumentCategory,
} from "@/lib/score-types";
import type { EditorTool } from "@/components/ScoreCanvas";

// ── 음표 길이 ─────────────────────────────────────────────────

const DURATIONS: Array<{ value: NoteDuration; symbol: string; labelKey: string }> = [
  { value: "whole",     symbol: "𝅝",  labelKey: "durationWhole" },
  { value: "half",      symbol: "𝅗𝅥", labelKey: "durationHalf" },
  { value: "quarter",   symbol: "♩",  labelKey: "durationQuarter" },
  { value: "eighth",    symbol: "♪",  labelKey: "durationEighth" },
  { value: "sixteenth", symbol: "𝅘𝅥𝅯", labelKey: "durationSixteenth" },
];

// ── 아티큘레이션 ──────────────────────────────────────────────

const ARTICULATIONS: Array<{ id: ArticulationType; symbol: string; labelKey: string }> = [
  { id: "staccato", symbol: "·",  labelKey: "articulStaccato" },
  { id: "tenuto",   symbol: "—",  labelKey: "articulTenuto" },
  { id: "accent",   symbol: ">",  labelKey: "articulAccent" },
  { id: "fermata",  symbol: "𝄐",  labelKey: "articulFermata" },
  { id: "marcato",  symbol: "^",  labelKey: "articulMarcato" },
];

// ── 임시표 ────────────────────────────────────────────────────

const ACCIDENTALS: Array<{ value: Accidental | null; symbol: string; labelKey: string }> = [
  { value: null,    symbol: "♮", labelKey: "accidentalNatural" },
  { value: "sharp", symbol: "♯", labelKey: "accidentalSharp" },
  { value: "flat",  symbol: "♭", labelKey: "accidentalFlat" },
  { value: "double_sharp", symbol: "𝄪", labelKey: "accidentalDoubleSharp" },
  { value: "double_flat",  symbol: "𝄫", labelKey: "accidentalDoubleFlat" },
];

// ── 강약 ──────────────────────────────────────────────────────

const DYNAMICS: Array<{ id: Dynamic; symbol: string }> = [
  { id: "pp",  symbol: "pp" },
  { id: "p",   symbol: "p" },
  { id: "mp",  symbol: "mp" },
  { id: "mf",  symbol: "mf" },
  { id: "f",   symbol: "f" },
  { id: "ff",  symbol: "ff" },
  { id: "sfz", symbol: "sfz" },
  { id: "fp",  symbol: "fp" },
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

interface InstrSymbol { id: string; symbol: string; labelKey: string; }

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
  { id: "bowUp",     symbol: "↑",  labelKey: "symBowUp" },
  { id: "bowDown",   symbol: "↓",  labelKey: "symBowDown" },
  { id: "harmonic",  symbol: "◇",  labelKey: "symHarmonic" },
];

function getInstrSymbols(cat?: InstrumentCategory): InstrSymbol[] {
  switch (cat) {
    case "strings":    return STRINGS_SYMBOLS;
    case "keyboard":   return KEYBOARD_SYMBOLS;
    case "woodwind":
    case "brass":      return WOODWIND_SYMBOLS;
    case "vocal":      return VOCAL_SYMBOLS;
    case "percussion": return PERC_SYMBOLS;
    default:           return [...STRINGS_SYMBOLS, ...KEYBOARD_SYMBOLS];
  }
}

// ── 팔레트 탭 ─────────────────────────────────────────────────

type PaletteTab = "notes" | "rests" | "signs" | "dynamics" | "tempo" | "instr";

// ── Props ─────────────────────────────────────────────────────

export interface ScorePaletteProps {
  activeTool: EditorTool;
  activeDuration: NoteDuration;
  isDotted: boolean;
  accidental: Accidental | null;
  selectedArticulation: ArticulationType | null;
  selectedDynamic: Dynamic | null;
  instrumentCategory?: InstrumentCategory;
  enabledSymbols?: Record<string, boolean>;
  onToolChange: (tool: EditorTool) => void;
  onDurationChange: (dur: NoteDuration) => void;
  onDottedChange: (dotted: boolean) => void;
  onAccidentalChange: (acc: Accidental | null) => void;
  onArticulationSelect: (id: ArticulationType | null) => void;
  onDynamicSelect: (id: Dynamic | null) => void;
  onTempoSelect?: (text: string, bpm: number) => void;
  onSymbolToggle?: (id: string, enabled: boolean) => void;
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────

export function ScorePalette({
  activeTool,
  activeDuration,
  isDotted,
  accidental,
  selectedArticulation,
  selectedDynamic,
  instrumentCategory,
  enabledSymbols = {},
  onToolChange,
  onDurationChange,
  onDottedChange,
  onAccidentalChange,
  onArticulationSelect,
  onDynamicSelect,
  onTempoSelect,
  onSymbolToggle,
}: ScorePaletteProps) {
  const { colors: C } = useTheme();
  const { t } = useLanguage();
  const [tab, setTab] = useState<PaletteTab>(
    activeTool === "rest" ? "rests" : "notes",
  );
  const [selectedTempo, setSelectedTempo] = useState<string | null>(null);

  const styles = makeStyles(C);

  const instrSymbols = getInstrSymbols(instrumentCategory);

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
        </ScrollView>
      )}

      {/* ── 부호 탭: 임시표 + 아티큘레이션 ────────────────────── */}
      {tab === "signs" && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.itemRow}
        >
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
        </ScrollView>
      )}

      {/* ── 빠르기 탭 ─────────────────────────────────────────── */}
      {tab === "tempo" && (
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
      )}

      {/* ── 악기별 기호 탭 ────────────────────────────────────── */}
      {tab === "instr" && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.itemRow}
        >
          {instrSymbols.map((sym) => {
            const isEnabled = enabledSymbols[sym.id] !== false; // 기본값 true
            return (
              <Pressable
                key={sym.id}
                style={[
                  styles.instrBtn,
                  {
                    backgroundColor: isEnabled ? C.accent + "22" : "transparent",
                    borderColor: isEnabled ? C.accent : C.border,
                    opacity: isEnabled ? 1 : 0.5,
                  },
                ]}
                onPress={() => onSymbolToggle?.(sym.id, !isEnabled)}
                testID={`score-palette-sym-${sym.id}`}
              >
                <Text style={[styles.instrSymbol, { color: isEnabled ? C.accent : C.text }]}>
                  {sym.symbol}
                </Text>
                <Text style={[styles.durLabel, { color: isEnabled ? C.accent : C.textSecondary }]}>
                  {t("scoreMode", sym.labelKey as any)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
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
  });
