// ============================================================
// ScoreEditorMeasureDrawer — 마디 설정 드로어 (하단 고정)
// ============================================================

import React, { useMemo } from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useScale } from "@/lib/scale";
import { makeStyles } from "@/components/ScoreEditorScreen.styles";
import type { ScoreDocument, ScorePart, ClefType } from "@/lib/score-types";
import { getKeySignatureLabel } from "@/lib/score-types";

export interface ScoreEditorMeasureDrawerProps {
  currentPart: ScorePart | null;
  doc: ScoreDocument;
  selectedMeasureIdx: number | null;
  selectedPartIdx: number;
  draftMeasure: {
    bpm?: number;
    timeSignature?: { numerator: number; denominator: number };
    clef?: ClefType;
    keySignature?: { sharps: number };
  };
  drawerOpen: boolean;
  bottomInset: number;
  beatStatusText: string;
  beatIsOverflow: boolean;
  drawerMeasureStatus: string;
  onToggleDrawer: () => void;
  onBpmChange: (measureIdx: number | null) => void;
  onTimeSigChange: (measureIdx: number | null) => void;
  onClefCycle: () => void;
  onKeyChange: (delta: -1 | 1) => void;
}

export function ScoreEditorMeasureDrawer({
  currentPart,
  doc,
  selectedMeasureIdx,
  draftMeasure,
  drawerOpen,
  bottomInset,
  beatStatusText,
  beatIsOverflow,
  drawerMeasureStatus,
  onToggleDrawer,
  onBpmChange,
  onTimeSigChange,
  onClefCycle,
  onKeyChange,
}: ScoreEditorMeasureDrawerProps) {
  const { colors: C } = useTheme();
  const { t } = useLanguage();
  const S = useScale();
  const styles = useMemo(() => makeStyles(C, S), [C, S]);

  if (!currentPart) return null;

  const selectedMeasure =
    selectedMeasureIdx !== null ? currentPart.measures[selectedMeasureIdx] : null;

  // BPM 표시값
  const bpmDisplay = (() => {
    const bpm = selectedMeasureIdx !== null ? selectedMeasure?.bpm : draftMeasure.bpm;
    return bpm ? String(bpm) : `${doc.bpm} (${t("scoreMode", "drawerClear")})`;
  })();

  // 박자표 표시값
  const timeSigDisplay = (() => {
    const sig =
      (selectedMeasureIdx !== null
        ? selectedMeasure?.timeSignature
        : draftMeasure.timeSignature) ?? doc.timeSignature;
    return `${sig.numerator}/${sig.denominator}`;
  })();

  // 음자리표 표시값
  const clefDisplay = (() => {
    const clef =
      selectedMeasureIdx !== null ? selectedMeasure?.clef : draftMeasure.clef;
    return clef ?? currentPart.clef ?? "treble";
  })();

  // 조표 표시값
  const sharpsDisplay = (() => {
    const sharps =
      (selectedMeasureIdx !== null
        ? selectedMeasure?.keySignature?.sharps
        : draftMeasure.keySignature?.sharps) ?? doc.keySignature.sharps;
    return sharps === 0 ? "C" : sharps > 0 ? `${sharps}#` : `${Math.abs(sharps)}♭`;
  })();

  return (
    <View
      style={[
        styles.drawerContainer,
        {
          borderColor: C.border,
          backgroundColor: C.surface,
          borderRadius: 0,
          marginTop: 0,
          paddingBottom: bottomInset,
          borderLeftWidth: 0,
          borderRightWidth: 0,
          borderBottomWidth: 0,
        },
      ]}
    >
      <View
        style={[
          styles.drawerHeader,
          { borderBottomColor: drawerOpen ? C.border : "transparent" },
        ]}
      >
        <Pressable
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 6,
          }}
          onPress={onToggleDrawer}
          testID="score-editor-drawer-toggle"
        >
          <Text
            style={[styles.drawerHeaderText, { color: C.text }]}
            numberOfLines={1}
          >
            {selectedMeasureIdx !== null
              ? `${t("scoreMode", "drawerMeasureSettings")} — ${selectedMeasureIdx + 1}`
              : t("scoreMode", "drawerNextMeasureSettings")}
          </Text>
          {beatStatusText ? (
            <Text
              style={[
                styles.drawerStatusText,
                { color: beatIsOverflow ? "#FF8C42" : C.textSecondary },
              ]}
              numberOfLines={1}
              testID="score-editor-beat-status"
            >
              {beatStatusText}
            </Text>
          ) : null}
          {!drawerOpen && drawerMeasureStatus ? (
            <Text
              style={[styles.drawerStatusText, { color: C.textSecondary }]}
              numberOfLines={1}
            >
              {drawerMeasureStatus}
            </Text>
          ) : null}
          <Ionicons
            name={drawerOpen ? "chevron-down" : "chevron-up"}
            size={14}
            color={C.textSecondary}
          />
        </Pressable>
      </View>

      {drawerOpen && (
        <View style={styles.drawerContent}>
          {/* BPM 변경 */}
          <View style={styles.drawerRow}>
            <Text style={[styles.drawerFieldLabel, { color: C.textSecondary }]}>
              {t("scoreMode", "drawerBpmLabel")}
            </Text>
            <Text style={[styles.drawerFieldLabel, { color: C.text, minWidth: 0 }]}>
              {bpmDisplay}
            </Text>
            <Pressable
              style={[styles.drawerApplyBtn, { backgroundColor: C.accent }]}
              onPress={() => onBpmChange(selectedMeasureIdx)}
              testID="score-drawer-bpm-apply"
            >
              <Text style={styles.drawerApplyBtnText}>{t("scoreMode", "drawerApply")}</Text>
            </Pressable>
          </View>

          {/* 박자표 변경 */}
          <View style={styles.drawerRow}>
            <Text style={[styles.drawerFieldLabel, { color: C.textSecondary }]}>
              {t("scoreMode", "drawerTimeSigLabel")}
            </Text>
            <Text style={[styles.drawerFieldLabel, { color: C.text, minWidth: 0 }]}>
              {timeSigDisplay}
            </Text>
            <Pressable
              style={[styles.drawerApplyBtn, { backgroundColor: C.accent }]}
              onPress={() => onTimeSigChange(selectedMeasureIdx)}
              testID="score-drawer-timesig-apply"
            >
              <Text style={styles.drawerApplyBtnText}>{t("scoreMode", "drawerApply")}</Text>
            </Pressable>
          </View>

          {/* 음자리표 변경 */}
          <View style={styles.drawerRow}>
            <Text style={[styles.drawerFieldLabel, { color: C.textSecondary }]}>
              {t("scoreMode", "drawerClefLabel")}
            </Text>
            <Text style={[styles.drawerFieldLabel, { color: C.text, minWidth: 0 }]}>
              {clefDisplay}
            </Text>
            <Pressable
              style={[
                styles.drawerApplyBtn,
                {
                  backgroundColor: C.surface,
                  borderWidth: 1,
                  borderColor: C.border,
                },
              ]}
              onPress={onClefCycle}
              testID="score-drawer-clef-cycle"
            >
              <Text style={[styles.drawerApplyBtnText, { color: C.text }]}>
                {t("scoreMode", "drawerApply")}
              </Text>
            </Pressable>
          </View>

          {/* 조표 변경 */}
          <View style={styles.drawerRow}>
            <Text style={[styles.drawerFieldLabel, { color: C.textSecondary }]}>
              {t("scoreMode", "drawerKeyLabel")}
            </Text>
            <Text style={[styles.drawerFieldLabel, { color: C.text, minWidth: 0 }]}>
              {sharpsDisplay}
            </Text>
            <View style={{ flexDirection: "row", gap: 4 }}>
              {([-1, 1] as const).map((delta) => (
                <Pressable
                  key={delta}
                  style={[
                    styles.drawerApplyBtn,
                    {
                      backgroundColor: C.surface,
                      borderWidth: 1,
                      borderColor: C.border,
                    },
                  ]}
                  onPress={() => onKeyChange(delta)}
                  testID={`score-drawer-key-${delta > 0 ? "plus" : "minus"}`}
                >
                  <Text style={[styles.drawerApplyBtnText, { color: C.text }]}>
                    {delta > 0 ? "+1#" : "-1♭"}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
