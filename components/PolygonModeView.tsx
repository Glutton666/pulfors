/**
 * PolygonModeView — 폴리곤 메트로놈 전체화면 뷰
 *
 * 레이아웃 (위 → 아래):
 *   1. 헤더 (제목 + 닫기)
 *   2. 폴리곤 캔버스 (flex: 1)
 *   3. 레이어 편집 패널
 *   4. 오프셋 팝업 (overlay)
 */

import React, { useCallback } from "react";
import {
  View, Text, Pressable, StyleSheet, useWindowDimensions, ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useScale } from "@/lib/scale";
import type { UsePolygonModeResult } from "@/hooks/usePolygonMode";
import { PolygonCanvas } from "@/components/polygon-mode/PolygonCanvas";
import { PolygonLayerEditor } from "@/components/polygon-mode/PolygonLayerEditor";
import { PolygonOffsetPopup } from "@/components/polygon-mode/PolygonOffsetPopup";

interface PolygonModeViewProps {
  polygonMode: UsePolygonModeResult;
  isPlaying: boolean;
  onClose: () => void;
}

export function PolygonModeView({ polygonMode, isPlaying, onClose }: PolygonModeViewProps) {
  const { colors: C } = useTheme();
  const { t } = useLanguage();
  const S = useScale();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const {
    layers, editingLayerId, setEditingLayerId,
    activeVertices, offsetPopup, setOffsetPopup,
    handleAddLayer, handleDeleteLayer, handleUpdateLayer, handleSetOffset,
    handleVertexBeatTypeCycle,
  } = polygonMode;

  // 캔버스 크기: 화면 너비 기반 (정사각형)
  const canvasSize = Math.min(width - 32, 400);

  const handleLayerSelect = useCallback((id: string) => {
    setEditingLayerId(id === editingLayerId ? null : id);
  }, [editingLayerId, setEditingLayerId]);

  const handleVertexLongPress = useCallback(
    (layerId: string, vertexIdx: number) => {
      if (!editingLayerId) return; // 편집 모드일 때만
      setOffsetPopup({ layerId, vertexIdx });
    },
    [editingLayerId, setOffsetPopup],
  );

  const currentPopupLayer = offsetPopup
    ? layers.find(l => l.id === offsetPopup.layerId)
    : null;
  const currentPopupOffset = currentPopupLayer
    ? (currentPopupLayer.offsets[offsetPopup!.vertexIdx] ?? 0)
    : 0;

  return (
    <View style={[StyleSheet.absoluteFillObject, { backgroundColor: C.background }]}>
      {/* ── 헤더 ── */}
      <View style={{
        flexDirection: "row",
        alignItems: "center",
        paddingTop: insets.top + S.ms(8, 0.3),
        paddingHorizontal: S.ms(16, 0.3),
        paddingBottom: S.ms(12, 0.3),
        borderBottomWidth: 1,
        borderBottomColor: C.border,
      }}>
        <Pressable
          onPress={onClose}
          style={({ pressed }) => ({
            padding: 8,
            opacity: pressed ? 0.6 : 1,
          })}
          hitSlop={8}
        >
          <Ionicons name="close" size={S.ms(24, 0.4)} color={C.textSecondary} />
        </Pressable>
        <Text style={{
          flex: 1,
          textAlign: "center",
          fontFamily: "SpaceGrotesk_700Bold",
          fontSize: S.ms(17, 0.4),
          color: C.text,
          letterSpacing: 0.5,
        }}>
          {t("polygon", "title")}
        </Text>
        {/* 재생 상태 표시 */}
        <View style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingHorizontal: 10,
          paddingVertical: 5,
          borderRadius: 12,
          backgroundColor: isPlaying ? C.accent + "22" : C.background,
        }}>
          <View style={{
            width: 6, height: 6, borderRadius: 3,
            backgroundColor: isPlaying ? C.accent : C.textTertiary,
          }} />
          <Text style={{
            fontFamily: "SpaceGrotesk_500Medium",
            fontSize: S.ms(11, 0.3),
            color: isPlaying ? C.accent : C.textTertiary,
          }}>
            {isPlaying ? t("polygon", "playing") : t("polygon", "stopped")}
          </Text>
        </View>
      </View>

      {/* ── 캔버스 영역 ── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingVertical: S.ms(16, 0.3),
        }}
        scrollEnabled={false}
      >
        {layers.length === 0 ? (
          <View style={{ alignItems: "center", gap: 12 }}>
            <Text style={{
              fontFamily: "SpaceGrotesk_500Medium",
              fontSize: S.ms(15, 0.4),
              color: C.textSecondary,
              textAlign: "center",
            }}>
              {t("polygon", "emptyHint")}
            </Text>
          </View>
        ) : (
          <PolygonCanvas
            layers={layers}
            activeVertices={activeVertices}
            editingLayerId={editingLayerId}
            onVertexPress={handleVertexBeatTypeCycle}
            onVertexLongPress={handleVertexLongPress}
            size={canvasSize}
          />
        )}

        {/* 편집 모드 힌트 */}
        {editingLayerId && layers.length > 0 && (
          <Text style={{
            fontFamily: "SpaceGrotesk_400Regular",
            fontSize: S.ms(11, 0.3),
            color: C.textTertiary,
            textAlign: "center",
            marginTop: 8,
          }}>
            {t("polygon", "editHint")}
          </Text>
        )}
      </ScrollView>

      {/* ── 레이어 편집 패널 ── */}
      <PolygonLayerEditor
        layers={layers}
        editingLayerId={editingLayerId}
        onSelectLayer={handleLayerSelect}
        onUpdateLayer={handleUpdateLayer}
        onDeleteLayer={handleDeleteLayer}
        onAddLayer={handleAddLayer}
        onVertexLongPress={handleVertexLongPress}
      />

      {/* ── 오프셋 팝업 ── */}
      {offsetPopup && (
        <PolygonOffsetPopup
          visible
          vertexIdx={offsetPopup.vertexIdx}
          currentOffset={currentPopupOffset}
          onConfirm={(offset) => handleSetOffset(offsetPopup.layerId, offsetPopup.vertexIdx, offset)}
          onClose={() => setOffsetPopup(null)}
        />
      )}
    </View>
  );
}
