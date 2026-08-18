/**
 * PolygonLayerEditor — 레이어 목록 + 편집 패널
 *
 * 레이어 탭 → 해당 레이어 편집 모드 진입
 * 편집 항목: 변 수(1~16), 색상, 사운드셋, 사운드 역할
 */

import React, { useCallback } from "react";
import {
  View, Text, Pressable, ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useScale } from "@/lib/scale";
import type { PolygonLayer } from "./PolygonTypes";
import { LAYER_COLORS } from "./PolygonTypes";
import { soundSets } from "@/lib/metronome-engine";

// 편집 가능한 사운드셋 목록
const SOUND_SET_KEYS = Object.keys(soundSets) as (keyof typeof soundSets)[];

interface PolygonLayerEditorProps {
  layers: PolygonLayer[];
  editingLayerId: string | null;
  onSelectLayer: (id: string) => void;
  onUpdateLayer: (id: string, patch: Partial<PolygonLayer>) => void;
  onDeleteLayer: (id: string) => void;
  onAddLayer: () => void;
  onVertexLongPress?: (layerId: string, vertexIdx: number) => void;
}

// 사운드셋 이름 → 표시명 (i18n 없이 간단히)
function soundSetLabel(key: string): string {
  const labels: Record<string, string> = {
    classic: "Classic", metronome: "Metronome", wood: "Wood", bell: "Bell",
    digital: "Digital", voice: "Voice", rimshot: "Rimshot", click: "Click",
  };
  return labels[key] ?? key;
}

export function PolygonLayerEditor({
  layers, editingLayerId, onSelectLayer, onUpdateLayer, onDeleteLayer, onAddLayer,
}: PolygonLayerEditorProps) {
  const { colors: C } = useTheme();
  const { t } = useLanguage();
  const S = useScale();
  const insets = useSafeAreaInsets();

  const editingLayer = layers.find(l => l.id === editingLayerId) ?? null;

  const sidesLabel = (s: number) => s === 1 ? t("polygon", "sidesCircle") : String(s);

  const handleSidesChange = useCallback((id: string, delta: number) => {
    const layer = layers.find(l => l.id === id);
    if (!layer) return;
    const next = Math.max(1, Math.min(16, layer.sides + delta));
    onUpdateLayer(id, { sides: next });
  }, [layers, onUpdateLayer]);

  return (
    <View style={{
      backgroundColor: C.surface,
      borderTopWidth: 1,
      borderTopColor: C.border,
      // 편집 패널·빈 상태가 없을 때(탭 행만 표시) safe-area 확보
      paddingBottom: !editingLayer && layers.length > 0 ? insets.bottom : 0,
    }}>
      {/* ── 레이어 목록 탭 ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: S.ms(12, 0.3),
          paddingVertical: S.ms(8, 0.3),
          gap: S.ms(8, 0.3),
          alignItems: "center",
        }}
      >
        {layers.map((layer) => {
          const isEditing = layer.id === editingLayerId;
          return (
            <Pressable
              key={layer.id}
              onPress={() => onSelectLayer(layer.id)}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: 12,
                paddingVertical: 7,
                borderRadius: 20,
                borderWidth: isEditing ? 2 : 1,
                borderColor: isEditing ? layer.color : C.border,
                backgroundColor: isEditing
                  ? layer.color + "22"
                  : pressed
                  ? C.background
                  : "transparent",
              })}
            >
              <View style={{
                width: 10, height: 10, borderRadius: 5,
                backgroundColor: layer.color,
              }} />
              <Text style={{
                fontFamily: "SpaceGrotesk_500Medium",
                fontSize: S.ms(12, 0.3),
                color: isEditing ? layer.color : C.text,
              }}>
                {sidesLabel(layer.sides)}
              </Text>
            </Pressable>
          );
        })}

        {/* + 추가 버튼 */}
        {layers.length < 8 && (
          <Pressable
            onPress={onAddLayer}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              paddingHorizontal: 12,
              paddingVertical: 7,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: C.border,
              borderStyle: "dashed" as const,
              backgroundColor: pressed ? C.accent + "11" : "transparent",
            })}
          >
            <Ionicons name="add" size={14} color={C.accent} />
            <Text style={{
              fontFamily: "SpaceGrotesk_500Medium",
              fontSize: S.ms(12, 0.3),
              color: C.accent,
            }}>
              {t("polygon", "addLayer")}
            </Text>
          </Pressable>
        )}
      </ScrollView>

      {/* ── 편집 패널 ── */}
      {editingLayer && (
        <View style={{
          paddingHorizontal: S.ms(16, 0.3),
          paddingBottom: S.ms(16, 0.3) + insets.bottom,
          gap: S.ms(12, 0.3),
          borderTopWidth: 1,
          borderTopColor: C.border + "55",
        }}>
          {/* 변 수 스텝 */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Text style={{ fontFamily: "SpaceGrotesk_500Medium", fontSize: S.ms(13, 0.3), color: C.textSecondary, flex: 1 }}>
              {t("polygon", "sides")}
            </Text>
            <Pressable
              onPress={() => handleSidesChange(editingLayer.id, -1)}
              style={({ pressed }) => ({
                width: 32, height: 32, borderRadius: 16,
                backgroundColor: pressed ? C.accent + "33" : C.background,
                borderWidth: 1, borderColor: C.border,
                alignItems: "center", justifyContent: "center",
              })}
            >
              <Text style={{ color: C.text, fontSize: 18, lineHeight: 20 }}>−</Text>
            </Pressable>
            <Text style={{
              fontFamily: "SpaceGrotesk_700Bold",
              fontSize: S.ms(18, 0.4),
              color: C.accent,
              minWidth: 50,
              textAlign: "center",
            }}>
              {sidesLabel(editingLayer.sides)}
            </Text>
            <Pressable
              onPress={() => handleSidesChange(editingLayer.id, 1)}
              style={({ pressed }) => ({
                width: 32, height: 32, borderRadius: 16,
                backgroundColor: pressed ? C.accent + "33" : C.background,
                borderWidth: 1, borderColor: C.border,
                alignItems: "center", justifyContent: "center",
              })}
            >
              <Text style={{ color: C.text, fontSize: 18, lineHeight: 20 }}>+</Text>
            </Pressable>
          </View>

          {/* 색상 선택 */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ fontFamily: "SpaceGrotesk_500Medium", fontSize: S.ms(13, 0.3), color: C.textSecondary, flex: 1 }}>
              {t("polygon", "color")}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {LAYER_COLORS.map((color) => (
                  <Pressable
                    key={color}
                    onPress={() => onUpdateLayer(editingLayer.id, { color })}
                    style={{
                      width: 24, height: 24, borderRadius: 12,
                      backgroundColor: color,
                      borderWidth: editingLayer.color === color ? 3 : 1,
                      borderColor: editingLayer.color === color ? "#fff" : "transparent",
                    }}
                  />
                ))}
              </View>
            </ScrollView>
          </View>

          {/* 사운드셋 */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ fontFamily: "SpaceGrotesk_500Medium", fontSize: S.ms(13, 0.3), color: C.textSecondary, flex: 1 }}>
              {t("polygon", "soundSet")}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: "row", gap: 6 }}>
                {SOUND_SET_KEYS.map((key) => {
                  const active = editingLayer.soundSet === key;
                  return (
                    <Pressable
                      key={key}
                      onPress={() => onUpdateLayer(editingLayer.id, { soundSet: key })}
                      style={({ pressed }) => ({
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: 8,
                        backgroundColor: active ? C.accent : pressed ? C.accent + "22" : C.background,
                        borderWidth: 1,
                        borderColor: active ? C.accent : C.border,
                      })}
                    >
                      <Text style={{
                        fontFamily: "SpaceGrotesk_500Medium",
                        fontSize: S.ms(11, 0.3),
                        color: active ? "#fff" : C.textSecondary,
                      }}>
                        {soundSetLabel(key)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          </View>

          {/* 사운드 역할 */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ fontFamily: "SpaceGrotesk_500Medium", fontSize: S.ms(13, 0.3), color: C.textSecondary, flex: 1 }}>
              {t("polygon", "role")}
            </Text>
            <View style={{ flexDirection: "row", gap: 6 }}>
              {(["high", "low", "strong"] as const).map((role) => {
                const active = editingLayer.role === role;
                return (
                  <Pressable
                    key={role}
                    onPress={() => onUpdateLayer(editingLayer.id, { role })}
                    style={({ pressed }) => ({
                      paddingHorizontal: 12,
                      paddingVertical: 5,
                      borderRadius: 8,
                      backgroundColor: active ? C.accent : pressed ? C.accent + "22" : C.background,
                      borderWidth: 1,
                      borderColor: active ? C.accent : C.border,
                    })}
                  >
                    <Text style={{
                      fontFamily: "SpaceGrotesk_500Medium",
                      fontSize: S.ms(12, 0.3),
                      color: active ? "#fff" : C.textSecondary,
                    }}>
                      {t("polygon", role as "high" | "low" | "strong")}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* 삭제 버튼 */}
          <Pressable
            onPress={() => onDeleteLayer(editingLayer.id)}
            style={({ pressed }) => ({
              paddingVertical: 8,
              borderRadius: 8,
              backgroundColor: pressed ? C.danger + "22" : "transparent",
              borderWidth: 1,
              borderColor: C.danger + "55",
              alignItems: "center",
            })}
          >
            <Text style={{
              fontFamily: "SpaceGrotesk_500Medium",
              fontSize: S.ms(13, 0.3),
              color: C.danger,
            }}>
              {t("polygon", "deleteLayer")}
            </Text>
          </Pressable>
        </View>
      )}

      {/* 레이어 없을 때 힌트 */}
      {layers.length === 0 && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 16 + insets.bottom, alignItems: "center" }}>
          <Pressable
            onPress={onAddLayer}
            style={({ pressed }) => ({
              paddingHorizontal: 20, paddingVertical: 10,
              borderRadius: 10, backgroundColor: pressed ? C.accent + "CC" : C.accent,
            })}
          >
            <Text style={{ fontFamily: "SpaceGrotesk_600SemiBold", fontSize: S.ms(14, 0.3), color: "#fff" }}>
              {t("polygon", "addFirstLayer")}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
