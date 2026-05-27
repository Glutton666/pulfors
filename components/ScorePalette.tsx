// ============================================================
// ScorePalette — 음표 입력 팔레트 (음표/쉼표/부호/강약)
// ============================================================

import React, { useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { FontSize, Spacing, Radius } from "@/constants/tokens";
import type { NoteDuration, Accidental, ArticulationType, Dynamic } from "@/lib/score-types";
import type { EditorTool } from "@/components/ScoreCanvas";

// ── 음표 길이 데이터 ──────────────────────────────────────────

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

// ── 임시표 ─────────────────────────────────────────────────────

const ACCIDENTALS: Array<{ value: Accidental | null; symbol: string; labelKey: string }> = [
  { value: null,    symbol: "♮", labelKey: "accidentalNatural" },
  { value: "sharp", symbol: "♯", labelKey: "accidentalSharp" },
  { value: "flat",  symbol: "♭", labelKey: "accidentalFlat" },
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
];

// ── 팔레트 탭 타입 ─────────────────────────────────────────────

type PaletteTab = "notes" | "rests" | "signs" | "dynamics";

// ── Props ─────────────────────────────────────────────────────

export interface ScorePaletteProps {
  activeTool: EditorTool;
  activeDuration: NoteDuration;
  isDotted: boolean;
  accidental: Accidental | null;
  selectedArticulation: ArticulationType | null;
  selectedDynamic: Dynamic | null;
  onToolChange: (tool: EditorTool) => void;
  onDurationChange: (dur: NoteDuration) => void;
  onDottedChange: (dotted: boolean) => void;
  onAccidentalChange: (acc: Accidental | null) => void;
  onArticulationSelect: (id: ArticulationType | null) => void;
  onDynamicSelect: (id: Dynamic | null) => void;
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────

export function ScorePalette({
  activeTool,
  activeDuration,
  isDotted,
  accidental,
  selectedArticulation,
  selectedDynamic,
  onToolChange,
  onDurationChange,
  onDottedChange,
  onAccidentalChange,
  onArticulationSelect,
  onDynamicSelect,
}: ScorePaletteProps) {
  const { colors: C } = useTheme();
  const { t } = useLanguage();
  const [tab, setTab] = useState<PaletteTab>(
    activeTool === "rest" ? "rests" : "notes",
  );

  const styles = makeStyles(C);

  const TAB_DEFS: Array<{ id: PaletteTab; labelKey: string; tool?: EditorTool }> = [
    { id: "notes",    labelKey: "paletteNotes",    tool: "note" },
    { id: "rests",    labelKey: "paletteRests",    tool: "rest" },
    { id: "signs",    labelKey: "paletteSigns" },
    { id: "dynamics", labelKey: "paletteDynamics" },
  ];

  function handleTabPress(tabId: PaletteTab, tool?: EditorTool) {
    setTab(tabId);
    if (tool) onToolChange(tool);
  }

  return (
    <View style={[styles.container, { borderTopColor: C.border, backgroundColor: C.surface }]}>
      {/* 탭 헤더 + 보조 도구 */}
      <View style={styles.tabRow}>
        {TAB_DEFS.map((td) => {
          const isTabActive = tab === td.id;
          return (
            <Pressable
              key={td.id}
              style={[
                styles.tabBtn,
                { borderBottomColor: isTabActive ? C.accent : "transparent" },
              ]}
              onPress={() => handleTabPress(td.id, td.tool)}
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

        {/* 선택 도구 */}
        <Pressable
          style={[
            styles.tabBtn,
            { borderBottomColor: activeTool === "select" ? C.accent : "transparent" },
          ]}
          onPress={() => onToolChange("select")}
          testID="score-palette-tool-select"
        >
          <Text
            style={[
              styles.tabLabel,
              { color: activeTool === "select" ? C.accent : C.textSecondary },
            ]}
          >
            {t("scoreMode", "toolSelect")}
          </Text>
        </Pressable>

        {/* 지우기 도구 */}
        <Pressable
          style={[
            styles.tabBtn,
            { borderBottomColor: activeTool === "erase" ? C.accent : "transparent" },
          ]}
          onPress={() => onToolChange("erase")}
          testID="score-palette-tool-erase"
        >
          <Text
            style={[
              styles.tabLabel,
              { color: activeTool === "erase" ? C.accent : C.textSecondary },
            ]}
          >
            {t("scoreMode", "toolErase")}
          </Text>
        </Pressable>
      </View>

      {/* 음표 / 쉼표 탭 공통: 음표 길이 선택 */}
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

          {/* 점음표 토글 */}
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

      {/* 부호 탭: 임시표 + 아티큘레이션 */}
      {tab === "signs" && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.itemRow}
        >
          {/* 임시표 */}
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

          {/* 구분선 */}
          <View style={[styles.divider, { backgroundColor: C.border }]} />

          {/* 아티큘레이션 */}
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

      {/* 강약 탭 */}
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
      paddingHorizontal: 6,
      gap: 1,
    },
    tabBtn: {
      flex: 1,
      alignItems: "center",
      paddingVertical: 6,
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
      minWidth: 40,
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
      minWidth: 44,
    },
    dynSymbol: {
      fontSize: 15,
      fontFamily: "SpaceGrotesk_700Bold",
      fontStyle: "italic",
    },
  });
