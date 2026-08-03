// ============================================================
// ScoreEditorCanvas — 악보 스크롤 영역 + ScoreCanvas + 참조 이미지
// ============================================================

import React, { useMemo } from "react";
import { View, Text, Image, Pressable, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Spacing } from "@/constants/tokens";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useScale } from "@/lib/scale";
import { makeStyles } from "@/components/ScoreEditorScreen.styles";
import { ScoreCanvas } from "@/components/ScoreCanvas";
import type { EditorTool } from "@/components/ScoreCanvas";
import type {
  ScoreDocument,
  ScorePart,
  ScoreNote,
  NoteDuration,
  Pitch,
  Accidental,
  NoteHeadType,
  DrumType,
} from "@/lib/score-types";

export interface ScoreEditorCanvasProps {
  doc: ScoreDocument;
  currentPart: ScorePart | null;
  containerWidth: number;
  selectedElementId: string | null;
  multiSelectIds: string[];
  selectedMeasureIdx: number | null;
  measureMultiSelectIndices: number[];
  selectedPartIdx: number;
  activeTool: EditorTool;
  activeDuration: NoteDuration;
  isDotted: boolean;
  accidental: Accidental | null;
  selectedNoteHead: NoteHeadType | null;
  highlightColor: string;
  lineSpacing: number;
  isPlaying: boolean;
  notePreviewEnabled: boolean;
  playheadMeasureIdx: number | undefined;
  playheadFraction: number;
  showPlayhead: boolean;
  /** ScoreCanvas を無効にするフラグ (マディ設定メニュー等が開いているとき) */
  canvasDisabled: boolean;
  isLandscape: boolean;
  referenceImageUri?: string;
  referenceImageOpacity: number;
  scoreScrollRef: React.RefObject<ScrollView>;
  /** 各マディのY座標記録 (自動スクロール用) */
  measureRowYRef: React.MutableRefObject<Record<number, number>>;
  // ── Canvas callbacks ───────────────────────────────────────
  onNotePlaced: (
    measureIdx: number,
    pitch: Pitch,
    duration: NoteDuration,
    insertIdx: number,
    placedX: number,
    noteHead?: NoteHeadType | null,
    drumType?: DrumType,
  ) => void;
  onRestPlaced: (
    measureIdx: number,
    duration: NoteDuration,
    insertIdx: number,
    placedX: number,
  ) => void;
  onElementTap: (elementId: string, measureIdx: number) => void;
  onMeasureTap: (measureIdx: number) => void;
  onMeasureLongPress: (measureIdx: number) => void;
  onClearSelection: () => void;
  onEraseElement: (elementId: string, measureIdx: number) => void;
  onEraseMultiple: (elements: Array<{ elementId: string; measureIdx: number }>) => void;
  onNoteMoved: (elementId: string, measureIdx: number, newPitch: Pitch, drumType?: DrumType) => void;
  onTupletBracketTap: (elementIds: string[]) => void;
  onAddMeasure: () => void;
  onOpenMeta: () => void;
  onReferenceOpacityToggle: () => void;
}

export function ScoreEditorCanvas({
  doc,
  currentPart,
  containerWidth,
  selectedElementId,
  multiSelectIds,
  selectedMeasureIdx,
  measureMultiSelectIndices,
  selectedPartIdx,
  activeTool,
  activeDuration,
  isDotted,
  accidental,
  selectedNoteHead,
  highlightColor,
  lineSpacing,
  isPlaying,
  notePreviewEnabled,
  playheadMeasureIdx,
  playheadFraction,
  showPlayhead,
  canvasDisabled,
  isLandscape,
  referenceImageUri,
  referenceImageOpacity,
  scoreScrollRef,
  onNotePlaced,
  onRestPlaced,
  onElementTap,
  onMeasureTap,
  onMeasureLongPress,
  onClearSelection,
  onEraseElement,
  onEraseMultiple,
  onNoteMoved,
  onTupletBracketTap,
  onAddMeasure,
  onOpenMeta,
  onReferenceOpacityToggle,
}: ScoreEditorCanvasProps) {
  const { colors: C } = useTheme();
  const { t } = useLanguage();
  const S = useScale();
  const styles = useMemo(() => makeStyles(C, S), [C, S]);

  return (
    <ScrollView
      ref={scoreScrollRef}
      style={styles.scoreScroll}
      contentContainerStyle={[
        styles.scoreContent,
        { paddingHorizontal: Spacing.lg, paddingBottom: 40 },
      ]}
      showsVerticalScrollIndicator={false}
      scrollEnabled
    >
      {/* 악보 메타 — 탭하면 편집 모달 */}
      <Pressable
        style={styles.scoreHeader}
        onPress={onOpenMeta}
        testID="score-header-tap"
      >
        <Text style={[styles.scoreTitle, { color: C.text }]}>
          {doc.metadata.title || t("scoreMode", "untitled")}
        </Text>
        {doc.metadata.composer && (
          <Text style={[styles.scoreMeta, { color: C.textSecondary }]}>
            {doc.metadata.composer}
          </Text>
        )}
      </Pressable>

      {/* 입력 힌트 */}
      {currentPart && currentPart.measures[0]?.elements.length === 0 &&
        (activeTool === "note" || activeTool === "rest") && (
        <Text style={[styles.inputHint, { color: C.textSecondary }]}>
          {t("scoreMode", "inputHint")}
        </Text>
      )}

      {/* 오선보 터치 캔버스 (참조 이미지 포함) */}
      {currentPart ? (
        <View style={{ position: "relative" }}>
          <ScoreCanvas
            doc={{ ...doc, parts: [currentPart] }}
            containerWidth={containerWidth}
            selectedElementId={selectedElementId}
            multiSelectIds={multiSelectIds}
            selectedMeasureIdx={selectedMeasureIdx}
            multiSelectMeasureIndices={measureMultiSelectIndices}
            selectedPartIdx={0}
            activeTool={activeTool}
            activeDuration={activeDuration}
            isDotted={isDotted}
            accidental={accidental}
            onNotePlaced={onNotePlaced}
            selectedNoteHead={selectedNoteHead}
            onRestPlaced={onRestPlaced}
            onElementTap={onElementTap}
            onMeasureTap={onMeasureTap}
            onClearSelection={onClearSelection}
            onMeasureLongPress={onMeasureLongPress}
            onEraseElement={onEraseElement}
            onEraseMultiple={onEraseMultiple}
            onNoteMoved={onNoteMoved}
            onTupletBracketTap={onTupletBracketTap}
            cursorMeasureIdx={null}
            isPlaying={isPlaying}
            notePreviewEnabled={notePreviewEnabled}
            instrumentId={doc.parts[selectedPartIdx]?.instrumentId}
            playheadMeasureIdx={playheadMeasureIdx}
            playheadFraction={playheadFraction}
            showPlayhead={showPlayhead}
            highlightColor={highlightColor}
            lineSpacing={lineSpacing}
            disabled={canvasDisabled}
            measuresPerLineOverride={isLandscape ? 2 : 1}
          />
          {/* 참조 이미지 오버레이 */}
          {referenceImageUri ? (
            <>
              <View
                style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
                pointerEvents="none"
              >
                <Image
                  source={{ uri: referenceImageUri }}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    opacity: referenceImageOpacity,
                    resizeMode: "contain",
                  }}
                />
              </View>
              <Pressable
                style={[
                  styles.refOpacityBtn,
                  { backgroundColor: C.surface + "CC", borderColor: C.border },
                ]}
                onPress={onReferenceOpacityToggle}
                hitSlop={8}
                testID="score-ref-opacity-btn"
              >
                <Text style={[styles.refOpacityLabel, { color: C.text }]}>
                  {Math.round(referenceImageOpacity * 100)}%
                </Text>
              </Pressable>
            </>
          ) : null}
        </View>
      ) : (
        <Text style={{ color: C.textSecondary, marginTop: 24 }}>
          {t("scoreMode", "noPartsHint")}
        </Text>
      )}

      {/* 마디 추가 버튼 */}
      {currentPart && (
        <Pressable
          style={[
            styles.addMeasureRow,
            { borderColor: C.accent, marginTop: 16, marginBottom: 8, alignSelf: "center" },
          ]}
          onPress={onAddMeasure}
          testID="score-add-measure-btn"
        >
          <Ionicons name="add-circle-outline" size={16} color={C.accent} />
          <Text style={[styles.addMeasureRowText, { color: C.accent }]}>
            {t("scoreMode", "addMeasure")}
          </Text>
        </Pressable>
      )}
    </ScrollView>
  );
}
