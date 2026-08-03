// ============================================================
// ScoreEditorSelectionBars — 선택 액션 바 × 3
//   1. 단일 음표 선택 바
//   2. 마디 다중 선택 바
//   3. 음표 다중 선택 (타이/슬러/잇단음표) 바
// ============================================================

import React, { useMemo } from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useScale } from "@/lib/scale";
import { makeStyles } from "@/components/ScoreEditorScreen.styles";
import type { ScoreNote } from "@/lib/score-types";

export interface ScoreEditorSelectionBarsProps {
  // ── 단일 음표 선택 ──────────────────────────────────────────
  selectedElementId: string | null;
  /** 선택된 음표 엔티티 (기호 지우기 버튼 표시 여부 판단용) */
  selectedNote: ScoreNote | null;
  /** selectionBarPan.panHandlers */
  panHandlers: object;
  onNavigatePrev: () => void;
  onNavigateNext: () => void;
  onClearSymbols: () => void;
  onDeleteSelected: () => void;

  // ── 마디 다중 선택 ─────────────────────────────────────────
  measureMultiSelectIndices: number[];
  hasMeasureClipboard: boolean;
  onDeselectMeasures: () => void;
  onCopyMeasures: () => void;
  onCutMeasures: () => void;
  onDeleteMeasures: () => void;

  // ── 음표 다중 선택 ─────────────────────────────────────────
  multiSelectIds: string[];
  multiSelectCanTie: boolean;
  multiSelectCanTuplet: boolean;
  multiSelectSortedElementsLength: number;
  onClearMultiSelect: () => void;
  onTieMultiSelected: () => void;
  onSlurMultiSelected: () => void;
  onApplyTuplet: () => void;
  onDeleteMultiSelected: () => void;
}

export function ScoreEditorSelectionBars({
  selectedElementId,
  selectedNote,
  panHandlers,
  onNavigatePrev,
  onNavigateNext,
  onClearSymbols,
  onDeleteSelected,
  measureMultiSelectIndices,
  hasMeasureClipboard: _hasMeasureClipboard,
  onDeselectMeasures,
  onCopyMeasures,
  onCutMeasures,
  onDeleteMeasures,
  multiSelectIds,
  multiSelectCanTie,
  multiSelectCanTuplet,
  multiSelectSortedElementsLength,
  onClearMultiSelect,
  onTieMultiSelected,
  onSlurMultiSelected,
  onApplyTuplet,
  onDeleteMultiSelected,
}: ScoreEditorSelectionBarsProps) {
  const { colors: C } = useTheme();
  const { t } = useLanguage();
  const S = useScale();
  const styles = useMemo(() => makeStyles(C, S), [C, S]);

  const hasSymbols = !!(
    selectedNote?.articulations?.length ||
    selectedNote?.ornament ||
    selectedNote?.dynamic ||
    (selectedNote as any)?.bowUp ||
    (selectedNote as any)?.bowDown ||
    (selectedNote as any)?.harmonic ||
    (selectedNote as any)?.pizzicato ||
    (selectedNote as any)?.arco ||
    (selectedNote as any)?.pedal ||
    (selectedNote as any)?.pedalEnd ||
    (selectedNote as any)?.ottava ||
    (selectedNote as any)?.arpeggio
  );

  return (
    <>
      {/* ── 선택된 음표 액션 바 ────────────────────────────────── */}
      {selectedElementId && (
        <View
          style={[styles.selectionBar, { backgroundColor: C.surface, borderBottomColor: C.border }]}
          {...panHandlers}
        >
          <Text style={[styles.selectionLabel, { color: C.textSecondary }]}>
            {t("scoreMode", "toolSelect")} ·
          </Text>

          <Pressable
            style={[styles.selBarBtn, { borderColor: C.border }]}
            onPress={onNavigatePrev}
            testID="score-editor-nav-prev"
          >
            <Ionicons name="chevron-back" size={14} color={C.text} />
          </Pressable>
          <Pressable
            style={[styles.selBarBtn, { borderColor: C.border }]}
            onPress={onNavigateNext}
            testID="score-editor-nav-next"
          >
            <Ionicons name="chevron-forward" size={14} color={C.text} />
          </Pressable>

          <View style={{ flex: 1 }} />

          {selectedNote && hasSymbols && (
            <Pressable
              style={[styles.selBarBtn, { borderColor: C.border }]}
              onPress={onClearSymbols}
              testID="score-editor-clear-symbols"
            >
              <Ionicons name="close-circle-outline" size={16} color={C.textSecondary} />
            </Pressable>
          )}

          <Pressable
            style={[styles.selBarBtn, { borderColor: "#FF4444" }]}
            onPress={onDeleteSelected}
            testID="score-editor-delete-selected"
          >
            <Ionicons name="trash-outline" size={16} color="#FF4444" />
          </Pressable>
        </View>
      )}

      {/* ── 마디 다중 선택 액션 바 ──────────────────────────────── */}
      {measureMultiSelectIndices.length >= 2 && (
        <View
          style={[styles.selectionBar, { backgroundColor: C.surface, borderBottomColor: C.border }]}
          testID="score-editor-measure-group-bar"
        >
          <Text style={[styles.selectionLabel, { color: C.textSecondary }]}>
            {measureMultiSelectIndices.length}{t("scoreMode", "groupBarSelectedCount")}
          </Text>

          <View style={{ flex: 1 }} />

          <Pressable
            style={[styles.selBarBtn, { borderColor: C.border }]}
            onPress={onDeselectMeasures}
            testID="score-editor-measure-deselect"
          >
            <Text style={[styles.selBarBtnText, { color: C.textSecondary }]}>
              {t("scoreMode", "deselect")}
            </Text>
          </Pressable>

          <Pressable
            style={[styles.selBarBtn, { borderColor: C.accent }]}
            onPress={onCopyMeasures}
            testID="score-editor-measure-copy"
          >
            <Ionicons name="copy-outline" size={16} color={C.accent} />
            <Text style={[styles.selBarBtnText, { color: C.accent }]}>
              {t("scoreMode", "measureCopyAction")}
            </Text>
          </Pressable>

          <Pressable
            style={[styles.selBarBtn, { borderColor: C.accent }]}
            onPress={onCutMeasures}
            testID="score-editor-measure-cut"
          >
            <Ionicons name="cut-outline" size={16} color={C.accent} />
            <Text style={[styles.selBarBtnText, { color: C.accent }]}>
              {t("scoreMode", "measureMoveAction")}
            </Text>
          </Pressable>

          <Pressable
            style={[styles.selBarBtn, { borderColor: "#FF4444" }]}
            onPress={onDeleteMeasures}
            testID="score-editor-measure-delete"
          >
            <Text style={[styles.selBarBtnText, { color: "#FF4444" }]}>
              {t("scoreMode", "deleteAction")}
            </Text>
          </Pressable>

          <Pressable
            style={[styles.selBarBtn, { borderColor: "#FF4444" }]}
            onPress={onDeselectMeasures}
            testID="score-editor-measure-clear-selection"
          >
            <Ionicons name="close-outline" size={16} color="#FF4444" />
          </Pressable>
        </View>
      )}

      {/* ── 다중 선택(2개 이상) 묶기 액션 바 ────────────────────── */}
      {multiSelectIds.length >= 2 && (
        <View
          style={[styles.selectionBar, { backgroundColor: C.surface, borderBottomColor: C.border }]}
          testID="score-editor-group-bar"
        >
          <Text style={[styles.selectionLabel, { color: C.textSecondary }]}>
            {multiSelectIds.length}{t("scoreMode", "groupBarSelectedCount")}
          </Text>

          <View style={{ flex: 1 }} />

          <Pressable
            style={[styles.selBarBtn, { borderColor: C.border }]}
            onPress={onClearMultiSelect}
            testID="score-editor-group-deselect"
          >
            <Text style={[styles.selBarBtnText, { color: C.textSecondary }]}>
              {t("scoreMode", "deselect")}
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.selBarBtn,
              { borderColor: multiSelectCanTie ? C.accent : C.border, opacity: multiSelectCanTie ? 1 : 0.4 },
            ]}
            onPress={onTieMultiSelected}
            disabled={!multiSelectCanTie}
            testID="score-editor-group-tie"
          >
            <Text style={[styles.selBarBtnText, { color: multiSelectCanTie ? C.accent : C.textSecondary }]}>
              ⌣ {t("scoreMode", "groupBarTieButton")}
            </Text>
          </Pressable>

          <Pressable
            style={[styles.selBarBtn, { borderColor: C.accent }]}
            onPress={onSlurMultiSelected}
            testID="score-editor-group-slur"
          >
            <Text style={[styles.selBarBtnText, { color: C.accent }]}>
              ⌢ {t("scoreMode", "groupBarSlurButton")}
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.selBarBtn,
              {
                borderColor: multiSelectCanTuplet ? C.accent : C.border,
                opacity: multiSelectCanTuplet ? 1 : 0.4,
              },
            ]}
            onPress={onApplyTuplet}
            disabled={!multiSelectCanTuplet}
            testID="score-editor-group-tuplet"
          >
            <Text
              style={[
                styles.selBarBtnText,
                { color: multiSelectCanTuplet ? C.accent : C.textSecondary },
              ]}
            >
              ⋮⋮ {t("scoreMode", "groupBarTupletButton")}
              {multiSelectCanTuplet ? ` (${multiSelectSortedElementsLength})` : ""}
            </Text>
          </Pressable>

          <Pressable
            style={[styles.selBarBtn, { borderColor: "#FF4444" }]}
            onPress={onDeleteMultiSelected}
            testID="score-editor-group-delete"
          >
            <Text style={[styles.selBarBtnText, { color: "#FF4444" }]}>
              {t("scoreMode", "deleteAction")}
            </Text>
          </Pressable>

          <Pressable
            style={[styles.selBarBtn, { borderColor: C.border }]}
            onPress={onClearMultiSelect}
            testID="score-editor-group-clear"
          >
            <Ionicons name="close-circle-outline" size={16} color={C.textSecondary} />
          </Pressable>
        </View>
      )}
    </>
  );
}
