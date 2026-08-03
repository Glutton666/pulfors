// ============================================================
// ScoreEditorPlaybackOverlay — 확대 뷰 + 연결 배지 + 플로팅 도구 버튼
// ============================================================

import React, { useMemo } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useScale } from "@/lib/scale";
import { makeStyles } from "@/components/ScoreEditorScreen.styles";
import { ScoreRenderer } from "@/components/ScoreRenderer";
import type { ScoreDocument, ScorePart } from "@/lib/score-types";
import type { EditorTool } from "@/components/ScoreCanvas";

export interface ScoreEditorPlaybackOverlayProps {
  topBarHeight: number;
  isPlaying: boolean;
  showZoomView: boolean;
  showPlayhead: boolean;
  highlightColor: string;
  currentPart: ScorePart | null;
  doc: ScoreDocument;
  containerWidth: number;
  lineSpacing: number;
  playheadFraction: number;
  currentMeasureIdx: number;
  currentLinkedEntryId: string | undefined;
  activeTool: EditorTool;
  onToggleTool: (tool: "select" | "erase") => void;
}

export function ScoreEditorPlaybackOverlay({
  topBarHeight,
  isPlaying,
  showZoomView,
  showPlayhead,
  highlightColor,
  currentPart,
  doc,
  containerWidth,
  lineSpacing,
  playheadFraction,
  currentMeasureIdx,
  currentLinkedEntryId,
  activeTool,
  onToggleTool,
}: ScoreEditorPlaybackOverlayProps) {
  const { colors: C } = useTheme();
  const { t } = useLanguage();
  const S = useScale();
  const styles = useMemo(() => makeStyles(C, S), [C, S]);

  return (
    <>
      {/* ── 연결된 연습 항목 배지 (재생 중 linkedPracticeEntryId가 있을 때) */}
      {isPlaying && !!currentLinkedEntryId && (
        <View
          style={[
            styles.linkedEntryBadge,
            { backgroundColor: C.accent + "22", borderColor: C.accent },
          ]}
        >
          <Ionicons name="link" size={S.ms(11, 0.3)} color={C.accent} />
          <Text
            style={[styles.linkedEntryBadgeText, { color: C.accent }]}
            numberOfLines={1}
          >
            {t("scoreMode", "linkedPresetActive")} {currentLinkedEntryId}
          </Text>
        </View>
      )}

      {/* ── 확대 뷰 (재생 중 현재 마디) ────────────────────────── */}
      {isPlaying && showZoomView && currentPart && (
        <View
          style={[
            styles.zoomViewWrapper,
            { backgroundColor: C.surface, borderTopColor: C.border },
          ]}
        >
          <Text style={[styles.zoomViewLabel, { color: C.textSecondary }]}>
            {t("scoreMode", "zoomViewLabel")} — {currentMeasureIdx + 1}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <ScoreRenderer
              doc={{
                ...doc,
                parts: doc.parts.map((p) => ({
                  ...p,
                  measures: (
                    currentMeasureIdx < p.measures.length
                      ? [p.measures[currentMeasureIdx]]
                      : []
                  ).filter(Boolean) as typeof p.measures,
                })),
              }}
              containerWidth={containerWidth * 1.4}
              playheadMeasureIdx={0}
              playheadFraction={playheadFraction}
              showPlayhead={showPlayhead}
              highlightColor={highlightColor}
              showPartNames={false}
              lineSpacing={lineSpacing}
            />
          </ScrollView>
        </View>
      )}

      {/* ── 선택 / 지우기 플로팅 버튼 ── */}
      {topBarHeight > 0 && (
        <View style={[styles.floatingToolPanel, { top: topBarHeight + 6 }]}>
          {(["select", "erase"] as const).map((tool) => {
            const isActive = activeTool === tool;
            const icon = tool === "select" ? "hand-right-outline" : "backspace-outline";
            return (
              <Pressable
                key={tool}
                style={[
                  styles.floatingToolBtn,
                  {
                    backgroundColor: isActive ? C.accent : C.surface,
                    borderColor: isActive ? C.accent : C.border,
                  },
                ]}
                onPress={() => onToggleTool(tool)}
                testID={`score-float-tool-${tool}`}
              >
                <Ionicons name={icon} size={16} color={isActive ? "#fff" : C.text} />
              </Pressable>
            );
          })}
        </View>
      )}
    </>
  );
}
