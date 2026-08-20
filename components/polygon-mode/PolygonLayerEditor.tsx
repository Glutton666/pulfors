/**
 * PolygonLayerEditor — 레이어 목록 + 편집 패널
 *
 * 편집 항목: 변 수, 볼륨, 사운드셋(커스텀 가져오기 포함)
 * 삭제된 항목: 색상 선택(자동 배정), 사운드 역할(강/약/강세 → 볼륨으로 대체)
 * 꼭짓점 강세 → 탭으로 뮤트/언뮤트 전환
 */

import React, { useCallback, useEffect, useRef } from "react";
import {
  View, Text, Pressable, ScrollView, PanResponder,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useScale } from "@/lib/scale";
import type { PolygonLayer } from "./PolygonTypes";
import { soundSets } from "@/lib/metronome-engine";

// 편집 가능한 사운드셋 목록
const SOUND_SET_KEYS = Object.keys(soundSets) as (keyof typeof soundSets)[];

// 사운드셋 이름 → 표시명
function soundSetLabel(key: string): string {
  const labels: Record<string, string> = {
    classic: "Classic", metronome: "Metronome", wood: "Wood", bell: "Bell",
    digital: "Digital", voice: "Voice", rimshot: "Rimshot", click: "Click",
  };
  return labels[key] ?? key;
}

interface PolygonLayerEditorProps {
  layers: PolygonLayer[];
  editingLayerId: string | null;
  onSelectLayer: (id: string) => void;
  onUpdateLayer: (id: string, patch: Partial<PolygonLayer>) => void;
  onDeleteLayer: (id: string) => void;
  onAddLayer: () => void;
  /** 커스텀 사운드 가져오기 버튼을 탭했을 때 (실제 파일 피킹은 부모가 담당) */
  onPickCustomSound?: (layerId: string) => void;
}

// ── 볼륨 슬라이더 ─────────────────────────────────────────────────────────────
function VolumeSlider({
  value, onChange, color,
}: {
  value: number;
  onChange: (v: number) => void;
  color: string;
}) {
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  const trackWidthRef = useRef(200);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const v = Math.max(0, Math.min(1, e.nativeEvent.locationX / trackWidthRef.current));
        onChangeRef.current(v);
      },
      onPanResponderMove: (e) => {
        const v = Math.max(0, Math.min(1, e.nativeEvent.locationX / trackWidthRef.current));
        onChangeRef.current(v);
      },
    }),
  ).current;

  const pct = Math.round(value * 100);

  return (
    <View style={{ flex: 1, justifyContent: "center", height: 32 }}>
      <View
        {...panResponder.panHandlers}
        onLayout={(e) => { trackWidthRef.current = e.nativeEvent.layout.width; }}
        style={{
          height: 8,
          borderRadius: 4,
          backgroundColor: color + "30",
          overflow: "visible",
          position: "relative",
        }}
      >
        {/* 채워진 트랙 */}
        <View style={{
          width: `${pct}%`,
          height: "100%",
          backgroundColor: color + "CC",
          borderRadius: 4,
        }} />
        {/* 썸 */}
        <View style={{
          position: "absolute",
          left: `${pct}%` as any,
          top: -6,
          width: 20,
          height: 20,
          borderRadius: 10,
          backgroundColor: color,
          transform: [{ translateX: -10 }],
          shadowColor: "#000",
          shadowOpacity: 0.25,
          shadowRadius: 3,
          elevation: 3,
        }} />
      </View>
      <Text style={{
        position: "absolute",
        right: 0,
        bottom: -2,
        fontSize: 10,
        color: color,
        fontFamily: "SpaceGrotesk_500Medium",
        opacity: 0.8,
      }}>
        {pct}%
      </Text>
    </View>
  );
}

export function PolygonLayerEditor({
  layers, editingLayerId, onSelectLayer, onUpdateLayer, onDeleteLayer, onAddLayer,
  onPickCustomSound,
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

  const handleVolumeChange = useCallback((id: string, volume: number) => {
    onUpdateLayer(id, { volume });
  }, [onUpdateLayer]);

  const isCustomSound = editingLayer?.soundSet.startsWith("custom-") ?? false;

  return (
    <View style={{
      backgroundColor: C.surface,
      borderTopWidth: 1,
      borderTopColor: C.border,
      paddingBottom: !editingLayer && layers.length > 0 ? insets.bottom : 0,
    }}>
      {/* ── 레이어 탭 목록 ── */}
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
                  : pressed ? C.background : "transparent",
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
            <Text style={{
              fontFamily: "SpaceGrotesk_500Medium",
              fontSize: S.ms(13, 0.3),
              color: C.textSecondary,
              flex: 1,
            }}>
              {t("polygon", "sides")}
            </Text>
            <Pressable
              onPress={() => handleSidesChange(editingLayer.id, -1)}
              style={({ pressed }) => ({
                width: 32,
                height: 32,
                alignItems: "center", justifyContent: "center",
                opacity: pressed ? 0.6 : 1,
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
                width: 32,
                height: 32,
                alignItems: "center", justifyContent: "center",
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Text style={{ color: C.text, fontSize: 18, lineHeight: 20 }}>+</Text>
            </Pressable>
          </View>

          {/* 볼륨 슬라이더 (강/약/강세 대체) */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Text style={{
              fontFamily: "SpaceGrotesk_500Medium",
              fontSize: S.ms(13, 0.3),
              color: C.textSecondary,
              width: 40,
            }}>
              {t("polygon", "volume")}
            </Text>
            <VolumeSlider
              value={editingLayer.volume ?? 1.0}
              onChange={(v) => handleVolumeChange(editingLayer.id, v)}
              color={editingLayer.color}
            />
          </View>

          {/* 사운드셋 + 커스텀 가져오기 */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{
              fontFamily: "SpaceGrotesk_500Medium",
              fontSize: S.ms(13, 0.3),
              color: C.textSecondary,
              width: 40,
            }}>
              {t("polygon", "soundSet")}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
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

                {/* 커스텀 사운드가 로드된 경우 표시 */}
                {isCustomSound && (
                  <View style={{
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 8,
                    backgroundColor: C.accent,
                    borderWidth: 1,
                    borderColor: C.accent,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                  }}>
                    <Ionicons name="musical-note" size={10} color="#fff" />
                    <Text style={{
                      fontFamily: "SpaceGrotesk_500Medium",
                      fontSize: S.ms(11, 0.3),
                      color: "#fff",
                    }}>
                      {t("polygon", "customSound")}
                    </Text>
                  </View>
                )}

                {/* 커스텀 사운드 가져오기 버튼 */}
                {onPickCustomSound && (
                  <Pressable
                    onPress={() => onPickCustomSound(editingLayer.id)}
                    style={({ pressed }) => ({
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      borderRadius: 8,
                      backgroundColor: pressed ? C.accent + "22" : "transparent",
                      borderWidth: 1,
                      borderColor: C.border,
                      borderStyle: "dashed" as const,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                    })}
                  >
                    <Ionicons name="add" size={12} color={C.textSecondary} />
                    <Text style={{
                      fontFamily: "SpaceGrotesk_500Medium",
                      fontSize: S.ms(11, 0.3),
                      color: C.textSecondary,
                    }}>
                      {t("polygon", "importAudio")}
                    </Text>
                  </Pressable>
                )}
              </View>
            </ScrollView>
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
              borderRadius: 10,
              backgroundColor: pressed ? C.accent + "CC" : C.accent,
            })}
          >
            <Text style={{
              fontFamily: "SpaceGrotesk_600SemiBold",
              fontSize: S.ms(14, 0.3),
              color: "#fff",
            }}>
              {t("polygon", "addFirstLayer")}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
