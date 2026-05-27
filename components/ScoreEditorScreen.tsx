// ============================================================
// ScoreEditorScreen — 악보 편집 화면
// ============================================================

import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Alert,
  Platform,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Crypto from "expo-crypto";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useScale } from "@/lib/scale";
import { Radius, Spacing, FontSize } from "@/constants/tokens";
import { saveScore } from "@/lib/score-storage";
import { createEmptyMeasure } from "@/lib/score-storage";
import type {
  ScoreDocument,
  ScoreNote,
  ScoreRest,
  ScoreMeasure,
  NoteDuration,
  Pitch,
} from "@/lib/score-types";
import { ScoreRenderer } from "@/components/ScoreRenderer";

// ── 툴 타입 ────────────────────────────────────────────────────

type EditorTool = "select" | "note" | "rest" | "erase";

const DURATION_OPTIONS: Array<{ value: NoteDuration; symbol: string }> = [
  { value: "whole",      symbol: "𝅝" },
  { value: "half",       symbol: "𝅗𝅥" },
  { value: "quarter",    symbol: "♩" },
  { value: "eighth",     symbol: "♪" },
  { value: "sixteenth",  symbol: "𝅘𝅥𝅯" },
];

// ── 음표 타입 ───────────────────────────────────────────────────

function makeNote(pitch: Pitch, duration: NoteDuration): ScoreNote {
  return {
    id: Crypto.randomUUID(),
    type: "note",
    pitch,
    duration,
  };
}

function makeRest(duration: NoteDuration): ScoreRest {
  return {
    id: Crypto.randomUUID(),
    type: "rest",
    duration,
  };
}

// ── 기본 음표 (C4 4분음표) ──────────────────────────────────────

const DEFAULT_PITCH: Pitch = { step: "C", octave: 4 };

// ── Props ───────────────────────────────────────────────────────

export interface ScoreEditorScreenProps {
  doc: ScoreDocument;
  onBack: () => void;
  onSaved: (doc: ScoreDocument) => void;
}

// ── 메인 컴포넌트 ───────────────────────────────────────────────

export function ScoreEditorScreen({ doc: initialDoc, onBack, onSaved }: ScoreEditorScreenProps) {
  const { colors: C } = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const S = useScale();
  const { width: windowWidth } = useWindowDimensions();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const topInset = insets.top || webTopInset;
  const bottomInset = insets.bottom || (Platform.OS === "web" ? 34 : 0);

  const [doc, setDoc] = useState<ScoreDocument>(initialDoc);
  const [activeTool, setActiveTool] = useState<EditorTool>("note");
  const [activeDuration, setActiveDuration] = useState<NoteDuration>("quarter");
  const [selectedPartIdx, setSelectedPartIdx] = useState(0);
  const [selectedMeasureIdx, setSelectedMeasureIdx] = useState<number | null>(null);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [isDotted, setIsDotted] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const styles = makeStyles(C, S);

  // 저장
  const handleSave = useCallback(async () => {
    try {
      await saveScore(doc);
      onSaved(doc);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      setSavedToast(true);
      toastTimerRef.current = setTimeout(() => setSavedToast(false), 1800);
    } catch {
      Alert.alert("Error", "Could not save score.");
    }
  }, [doc, onSaved]);

  // 마디 추가
  function handleAddMeasure() {
    const newMeasure = createEmptyMeasure();
    setDoc((prev) => {
      const parts = prev.parts.map((part, pIdx) => {
        if (pIdx !== selectedPartIdx) {
          return {
            ...part,
            measures: [...part.measures, createEmptyMeasure()],
          };
        }
        return {
          ...part,
          measures: [...part.measures, newMeasure],
        };
      });
      return { ...prev, parts };
    });
    setSelectedMeasureIdx(
      (doc.parts[selectedPartIdx]?.measures.length ?? 0)
    );
  }

  // 마디 삭제
  function handleDeleteMeasure(mIdx: number) {
    const part = doc.parts[selectedPartIdx];
    if (!part || part.measures.length <= 1) return;
    setDoc((prev) => ({
      ...prev,
      parts: prev.parts.map((p) => ({
        ...p,
        measures: p.measures.filter((_, i) => i !== mIdx),
      })),
    }));
    if (selectedMeasureIdx === mIdx) setSelectedMeasureIdx(null);
  }

  // 음표/쉼표 추가
  function handleAddElement(mIdx: number) {
    if (activeTool === "select") {
      setSelectedMeasureIdx(mIdx);
      return;
    }
    if (activeTool === "erase") {
      handleEraseSelected(mIdx);
      return;
    }

    const dur: NoteDuration = isDotted
      ? (`${activeDuration}_dot` as NoteDuration)
      : activeDuration;

    const newElement =
      activeTool === "note"
        ? makeNote(DEFAULT_PITCH, activeDuration)
        : makeRest(activeDuration);

    setDoc((prev) => ({
      ...prev,
      parts: prev.parts.map((p, pIdx) => {
        if (pIdx !== selectedPartIdx) return p;
        return {
          ...p,
          measures: p.measures.map((m, mi) => {
            if (mi !== mIdx) return m;
            return { ...m, elements: [...m.elements, newElement] };
          }),
        };
      }),
    }));
    setSelectedMeasureIdx(mIdx);
    setSelectedElementId(newElement.id);
  }

  // 마지막 요소 지우기
  function handleEraseSelected(mIdx: number) {
    setDoc((prev) => ({
      ...prev,
      parts: prev.parts.map((p, pIdx) => {
        if (pIdx !== selectedPartIdx) return p;
        return {
          ...p,
          measures: p.measures.map((m, mi) => {
            if (mi !== mIdx) return m;
            return { ...m, elements: m.elements.slice(0, -1) };
          }),
        };
      }),
    }));
  }

  const containerWidth = windowWidth - Spacing.lg * 2;

  const currentPart = doc.parts[selectedPartIdx];

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      {/* 상단 툴바 */}
      <View
        style={[
          styles.topBar,
          { paddingTop: topInset + 4, borderBottomColor: C.border, backgroundColor: C.surface },
        ]}
      >
        <Pressable
          style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
          onPress={onBack}
          hitSlop={12}
          testID="score-editor-back"
        >
          <Ionicons name="chevron-back" size={S.ms(24, 0.4)} color={C.text} />
        </Pressable>

        <Text style={[styles.topTitle, { color: C.text }]} numberOfLines={1}>
          {doc.metadata.title || t("scoreMode", "untitled")}
        </Text>

        {savedToast && (
          <Text style={[styles.savedToast, { color: C.accent }]}>
            {t("scoreMode", "saved")}
          </Text>
        )}

        <Pressable
          style={({ pressed }) => [
            styles.saveBtn,
            { backgroundColor: C.accent },
            pressed && { opacity: 0.8 },
          ]}
          onPress={handleSave}
          testID="score-editor-save"
        >
          <Text style={styles.saveBtnText}>{t("scoreMode", "save")}</Text>
        </Pressable>
      </View>

      {/* 성부 탭 (2+ 성부 시) */}
      {doc.parts.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[styles.partTabsScroll, { backgroundColor: C.surface, borderBottomColor: C.border }]}
          contentContainerStyle={styles.partTabsContent}
        >
          {doc.parts.map((part, pIdx) => (
            <Pressable
              key={part.id}
              style={[
                styles.partTab,
                {
                  borderBottomColor: selectedPartIdx === pIdx ? C.accent : "transparent",
                  borderBottomWidth: 2,
                },
              ]}
              onPress={() => setSelectedPartIdx(pIdx)}
              testID={`score-editor-part-tab-${pIdx}`}
            >
              <Text
                style={[
                  styles.partTabText,
                  { color: selectedPartIdx === pIdx ? C.accent : C.textSecondary },
                ]}
              >
                {part.name ?? part.instrumentId}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* 악보 스크롤 영역 */}
      <ScrollView
        style={styles.scoreScroll}
        contentContainerStyle={[
          styles.scoreContent,
          { paddingHorizontal: Spacing.lg, paddingBottom: bottomInset + 120 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* 악보 메타 */}
        <View style={styles.scoreHeader}>
          <Text style={[styles.scoreTitle, { color: C.text }]}>
            {doc.metadata.title || t("scoreMode", "untitled")}
          </Text>
          {doc.metadata.composer && (
            <Text style={[styles.scoreMeta, { color: C.textSecondary }]}>
              {doc.metadata.composer}
            </Text>
          )}
        </View>

        {/* SVG 오선보 렌더링 */}
        {currentPart ? (
          <ScoreRenderer
            doc={{ ...doc, parts: [currentPart] }}
            containerWidth={containerWidth}
            selectedElementId={selectedElementId}
          />
        ) : (
          <Text style={{ color: C.textSecondary, marginTop: 24 }}>
            {t("scoreMode", "noPartsHint")}
          </Text>
        )}

        {/* 마디 탭 목록 (간략한 마디 선택) */}
        {currentPart && (
          <View style={[styles.measureTabsRow, { marginTop: 16 }]}>
            {currentPart.measures.map((m, mIdx) => (
              <Pressable
                key={m.id}
                style={({ pressed }) => [
                  styles.measureTab,
                  {
                    borderColor: selectedMeasureIdx === mIdx ? C.accent : C.border,
                    backgroundColor:
                      selectedMeasureIdx === mIdx ? C.accent + "22" : C.surface,
                  },
                  pressed && { opacity: 0.7 },
                ]}
                onPress={() => handleAddElement(mIdx)}
                onLongPress={() => {
                  Alert.alert(
                    t("scoreMode", "deleteMeasure"),
                    undefined,
                    [
                      { text: t("scoreMode", "cancel"), style: "cancel" },
                      {
                        text: t("scoreMode", "deleteMeasure"),
                        style: "destructive",
                        onPress: () => handleDeleteMeasure(mIdx),
                      },
                    ],
                  );
                }}
                testID={`score-editor-measure-${mIdx}`}
              >
                <Text style={[styles.measureTabNum, { color: selectedMeasureIdx === mIdx ? C.accent : C.textSecondary }]}>
                  {mIdx + 1}
                </Text>
                <Text style={[styles.measureTabCount, { color: C.textSecondary }]}>
                  {m.elements.length > 0 ? `(${m.elements.length})` : t("scoreMode", "measureEmpty")}
                </Text>
              </Pressable>
            ))}

            <Pressable
              style={[styles.addMeasureBtn, { borderColor: C.border }]}
              onPress={handleAddMeasure}
              testID="score-editor-add-measure"
            >
              <Ionicons name="add" size={16} color={C.textSecondary} />
              <Text style={[styles.addMeasureText, { color: C.textSecondary }]}>
                {t("scoreMode", "addMeasure")}
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      {/* 하단 입력 툴바 */}
      <View
        style={[
          styles.bottomBar,
          {
            paddingBottom: bottomInset + 8,
            borderTopColor: C.border,
            backgroundColor: C.surface,
          },
        ]}
      >
        {/* 툴 선택 */}
        <View style={styles.toolRow}>
          {(["note", "rest", "erase", "select"] as EditorTool[]).map((tool) => {
            const isActive = activeTool === tool;
            const iconName =
              tool === "note" ? "musical-note" :
              tool === "rest" ? "remove" :
              tool === "erase" ? "backspace-outline" :
              "hand-left-outline";
            const label =
              tool === "note" ? t("scoreMode", "toolNote") :
              tool === "rest" ? t("scoreMode", "toolRest") :
              tool === "erase" ? t("scoreMode", "toolErase") :
              t("scoreMode", "toolSelect");
            return (
              <Pressable
                key={tool}
                style={[
                  styles.toolBtn,
                  {
                    backgroundColor: isActive ? C.accent : C.background,
                    borderColor: isActive ? C.accent : C.border,
                  },
                ]}
                onPress={() => setActiveTool(tool)}
                testID={`score-editor-tool-${tool}`}
              >
                <Ionicons
                  name={iconName as any}
                  size={S.ms(16, 0.3)}
                  color={isActive ? "#fff" : C.text}
                />
                <Text style={[styles.toolLabel, { color: isActive ? "#fff" : C.text }]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* 음표 길이 선택 */}
        <View style={styles.durationRow}>
          {DURATION_OPTIONS.map((dur) => {
            const isActive = activeDuration === dur.value;
            return (
              <Pressable
                key={dur.value}
                style={[
                  styles.durationBtn,
                  {
                    backgroundColor: isActive ? C.accent + "33" : "transparent",
                    borderColor: isActive ? C.accent : C.border,
                  },
                ]}
                onPress={() => setActiveDuration(dur.value)}
                testID={`score-editor-dur-${dur.value}`}
              >
                <Text style={[styles.durationSymbol, { color: isActive ? C.accent : C.text }]}>
                  {dur.symbol}
                </Text>
                <Text style={[styles.durationLabel, { color: isActive ? C.accent : C.textSecondary }]}>
                  {t("scoreMode", getDurationKey(dur.value))}
                </Text>
              </Pressable>
            );
          })}

          {/* 점 토글 */}
          <Pressable
            style={[
              styles.dotBtn,
              {
                backgroundColor: isDotted ? C.accent + "33" : "transparent",
                borderColor: isDotted ? C.accent : C.border,
              },
            ]}
            onPress={() => setIsDotted((v) => !v)}
            testID="score-editor-dot"
          >
            <Text style={[styles.durationSymbol, { color: isDotted ? C.accent : C.text }]}>
              •
            </Text>
            <Text style={[styles.durationLabel, { color: isDotted ? C.accent : C.textSecondary }]}>
              {t("scoreMode", "durationDot")}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function getDurationKey(dur: NoteDuration): any {
  const map: Record<string, string> = {
    whole: "durationWhole",
    half: "durationHalf",
    quarter: "durationQuarter",
    eighth: "durationEighth",
    sixteenth: "durationSixteenth",
  };
  return map[dur] ?? "durationQuarter";
}

const makeStyles = (C: any, S: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    topBar: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: Spacing.md,
      paddingBottom: 10,
      borderBottomWidth: 1,
      gap: Spacing.sm,
    },
    iconBtn: {
      padding: 4,
    },
    topTitle: {
      flex: 1,
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: FontSize.body,
    },
    savedToast: {
      fontFamily: "SpaceGrotesk_500Medium",
      fontSize: FontSize.small,
    },
    saveBtn: {
      paddingHorizontal: Spacing.md,
      paddingVertical: 7,
      borderRadius: Radius.md,
    },
    saveBtnText: {
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: FontSize.small,
      color: "#fff",
    },
    partTabsScroll: {
      borderBottomWidth: 1,
      maxHeight: 40,
    },
    partTabsContent: {
      paddingHorizontal: Spacing.md,
    },
    partTab: {
      paddingHorizontal: Spacing.md,
      paddingVertical: 8,
    },
    partTabText: {
      fontFamily: "SpaceGrotesk_500Medium",
      fontSize: FontSize.small,
    },
    scoreScroll: {
      flex: 1,
    },
    scoreContent: {
      gap: 0,
    },
    scoreHeader: {
      alignItems: "center",
      paddingVertical: Spacing.md,
      gap: 4,
    },
    scoreTitle: {
      fontFamily: "SpaceGrotesk_700Bold",
      fontSize: FontSize.subtitle,
    },
    scoreMeta: {
      fontFamily: "SpaceGrotesk_400Regular",
      fontSize: FontSize.small,
    },
    measureTabsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
    },
    measureTab: {
      borderWidth: 1,
      borderRadius: Radius.sm,
      paddingHorizontal: 10,
      paddingVertical: 6,
      alignItems: "center",
      minWidth: 44,
    },
    measureTabNum: {
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: FontSize.small,
    },
    measureTabCount: {
      fontFamily: "SpaceGrotesk_400Regular",
      fontSize: 10,
    },
    addMeasureBtn: {
      borderWidth: 1,
      borderStyle: "dashed",
      borderRadius: Radius.sm,
      paddingHorizontal: 10,
      paddingVertical: 6,
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    addMeasureText: {
      fontFamily: "SpaceGrotesk_400Regular",
      fontSize: FontSize.small,
    },
    bottomBar: {
      borderTopWidth: 1,
      paddingTop: 10,
      paddingHorizontal: Spacing.md,
      gap: 8,
    },
    toolRow: {
      flexDirection: "row",
      gap: 6,
    },
    toolBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
      borderWidth: 1,
      borderRadius: Radius.md,
      paddingVertical: 7,
    },
    toolLabel: {
      fontFamily: "SpaceGrotesk_500Medium",
      fontSize: 11,
    },
    durationRow: {
      flexDirection: "row",
      gap: 4,
    },
    durationBtn: {
      flex: 1,
      borderWidth: 1,
      borderRadius: Radius.sm,
      paddingVertical: 5,
      alignItems: "center",
      gap: 2,
    },
    dotBtn: {
      borderWidth: 1,
      borderRadius: Radius.sm,
      paddingVertical: 5,
      paddingHorizontal: 10,
      alignItems: "center",
      gap: 2,
    },
    durationSymbol: {
      fontSize: 16,
      fontFamily: "serif",
    },
    durationLabel: {
      fontFamily: "SpaceGrotesk_400Regular",
      fontSize: 9,
    },
  });
