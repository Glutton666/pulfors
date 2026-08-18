/**
 * PolygonModeView — 폴리곤 메트로놈 전체화면 뷰
 *
 * 레이아웃 (위 → 아래):
 *   1. 헤더 (제목 + 닫기)
 *   2. BPM 컨트롤 (스와이프 조정, 길게 누르면 ±10)
 *   3. 폴리곤 캔버스 (flex: 1)
 *   4. 레이어 편집 패널
 *   5. 오프셋 팝업 (overlay)
 */

import React, { useCallback, useEffect, useRef } from "react";
import {
  View, Text, Pressable, StyleSheet, useWindowDimensions, ScrollView,
  PanResponder, Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useScale } from "@/lib/scale";
import type { UsePolygonModeResult } from "@/hooks/usePolygonMode";
import type { ClickPCMs } from "@/lib/audio-renderer";
import { getWebAudioContext } from "@/lib/audio-renderer";
import { PolygonCanvas } from "@/components/polygon-mode/PolygonCanvas";
import { PolygonLayerEditor } from "@/components/polygon-mode/PolygonLayerEditor";
import { PolygonOffsetPopup } from "@/components/polygon-mode/PolygonOffsetPopup";

interface PolygonModeViewProps {
  polygonMode: UsePolygonModeResult;
  isPlaying: boolean;
  onClose: () => void;
  onTogglePlay?: () => void;
  bpm?: number;
  onBpmChange?: (bpm: number) => void;
}

const BPM_MIN = 20;
const BPM_MAX = 300;

export function PolygonModeView({ polygonMode, isPlaying, onClose, onTogglePlay, bpm, onBpmChange }: PolygonModeViewProps) {
  const { colors: C } = useTheme();
  const { t } = useLanguage();
  const S = useScale();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const {
    layers, editingLayerId, setEditingLayerId,
    activeVertices, offsetPopup, setOffsetPopup,
    handleAddLayer, handleDeleteLayer, handleUpdateLayer, handleSetOffset,
    handleVertexBeatTypeCycle, setLayerCustomSound,
  } = polygonMode;

  // 캔버스 크기: 화면 너비 기반 (정사각형)
  const canvasSize = Math.min(width - 32, 400);

  const handleLayerSelect = useCallback((id: string) => {
    setEditingLayerId(id === editingLayerId ? null : id);
  }, [editingLayerId, setEditingLayerId]);

  const handleVertexLongPress = useCallback(
    (layerId: string, vertexIdx: number) => {
      setOffsetPopup({ layerId, vertexIdx });
    },
    [setOffsetPopup],
  );

  const currentPopupLayer = offsetPopup
    ? layers.find(l => l.id === offsetPopup.layerId)
    : null;
  const currentPopupOffset = currentPopupLayer
    ? (currentPopupLayer.offsets[offsetPopup!.vertexIdx] ?? 0)
    : 0;

  // ── BPM 스와이프 제스처 ─────────────────────────────────────────────────
  // 수직 드래그로 BPM 조정: 위로 올리면 증가, 아래로 내리면 감소
  // 1.5px = 1 BPM (앵커: 제스처 시작 시점의 BPM)
  const bpmRef = useRef(bpm ?? 120);
  useEffect(() => { if (bpm !== undefined) bpmRef.current = bpm; }, [bpm]);
  const onBpmChangeRef = useRef(onBpmChange);
  useEffect(() => { onBpmChangeRef.current = onBpmChange; }, [onBpmChange]);
  const bpmGestureStartRef = useRef(120);

  const bpmPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dy) > 3,
      onPanResponderGrant: () => {
        bpmGestureStartRef.current = bpmRef.current;
      },
      onPanResponderMove: (_, gs) => {
        const cb = onBpmChangeRef.current;
        if (!cb) return;
        const delta = Math.round(-gs.dy / 1.5);
        const newBpm = Math.max(BPM_MIN, Math.min(BPM_MAX, bpmGestureStartRef.current + delta));
        if (newBpm !== bpmRef.current) cb(newBpm);
      },
    }),
  ).current;

  // ── 커스텀 사운드 가져오기 ──────────────────────────────────────────────
  const handlePickCustomSound = useCallback(async (layerId: string) => {
    if (Platform.OS !== "web") {
      // native: DocumentPicker + expo-av 디코딩은 향후 지원 예정
      // (raw PCM 추출이 필요해 현재 웹 전용)
      return;
    }
    try {
      // 웹: 숨겨진 file input 으로 오디오 파일 선택
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "audio/*";
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        try {
          const ab = await file.arrayBuffer();
          const ctx = getWebAudioContext();
          if (!ctx) return;
          const audioBuf = await ctx.decodeAudioData(ab.slice(0));
          // 모노 채널 PCM 추출 (AudioContext와 동일한 샘플레이트)
          const pcmData = new Float32Array(audioBuf.getChannelData(0));
          // 3개 강도 변형이 모두 같은 PCM을 사용하고, layer.volume 으로 음량 조절
          const pcms: ClickPCMs = { strong: pcmData, high: pcmData, low: pcmData };
          setLayerCustomSound(layerId, pcms);
        } catch {
          // 지원되지 않는 오디오 포맷
        }
      };
      input.click();
    } catch {
      // 파일 접근 오류
    }
  }, [setLayerCustomSound]);

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
          style={({ pressed }) => ({ padding: 8, opacity: pressed ? 0.6 : 1 })}
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
        {/* 재생/정지 표시 */}
        <Pressable
          onPress={onTogglePlay}
          disabled={!onTogglePlay}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: 12,
            backgroundColor: isPlaying ? C.accent + "22" : C.background,
            opacity: pressed ? 0.7 : 1,
          })}
          hitSlop={8}
        >
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
        </Pressable>
      </View>

      {/* ── BPM 컨트롤 ── */}
      {bpm !== undefined && onBpmChange && (
        <View style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: S.ms(12, 0.3),
          paddingVertical: S.ms(8, 0.3),
          borderBottomWidth: 1,
          borderBottomColor: C.border,
        }}>
          {/* − 버튼: 짧게 누르면 -1, 길게 누르면 -10 */}
          {/* RN Pressability가 longPress 후 릴리즈 onPress를 이미 억제하므로 추가 ref 불필요 */}
          <Pressable
            testID="bpm-minus"
            onPress={() => onBpmChange(Math.max(BPM_MIN, bpm - 1))}
            onLongPress={() => onBpmChange(Math.max(BPM_MIN, bpm - 10))}
            delayLongPress={300}
            style={({ pressed }) => ({
              width: S.ms(36, 0.3),
              height: S.ms(36, 0.3),
              borderRadius: S.ms(18, 0.3),
              backgroundColor: C.surface,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.6 : 1,
            })}
            hitSlop={8}
          >
            <Text style={{ fontSize: S.ms(18, 0.3), color: C.text, lineHeight: S.ms(22, 0.3) }}>−</Text>
          </Pressable>

          {/* BPM 표시: 수직 스와이프로 조정 */}
          <Pressable
            onPress={() => onTogglePlay?.()}
            style={({ pressed }) => ({
              opacity: pressed ? 0.7 : 1,
            })}
            hitSlop={4}
          >
            <View
              {...bpmPanResponder.panHandlers}
              style={{ flexDirection: "row", alignItems: "baseline", gap: 5, paddingVertical: 4 }}
            >
              <Text style={{
                fontFamily: "SpaceGrotesk_700Bold",
                fontSize: S.ms(28, 0.4),
                color: C.text,
                lineHeight: S.ms(32, 0.4),
                minWidth: S.ms(64, 0.3),
                textAlign: "center",
              }}>
                {bpm}
              </Text>
              <Text style={{
                fontFamily: "SpaceGrotesk_400Regular",
                fontSize: S.ms(12, 0.3),
                color: C.textSecondary,
                paddingBottom: 2,
              }}>
                BPM
              </Text>
              <View style={{
                width: 8, height: 8, borderRadius: 4,
                backgroundColor: isPlaying ? C.accent : C.textTertiary,
                marginLeft: 4,
              }} />
            </View>
          </Pressable>

          {/* + 버튼: 짧게 누르면 +1, 길게 누르면 +10 */}
          <Pressable
            testID="bpm-plus"
            onPress={() => onBpmChange(Math.min(BPM_MAX, bpm + 1))}
            onLongPress={() => onBpmChange(Math.min(BPM_MAX, bpm + 10))}
            delayLongPress={300}
            style={({ pressed }) => ({
              width: S.ms(36, 0.3),
              height: S.ms(36, 0.3),
              borderRadius: S.ms(18, 0.3),
              backgroundColor: C.surface,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.6 : 1,
            })}
            hitSlop={8}
          >
            <Text style={{ fontSize: S.ms(18, 0.3), color: C.text, lineHeight: S.ms(22, 0.3) }}>+</Text>
          </Pressable>
        </View>
      )}

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

        {/* 편집 힌트 */}
        {editingLayerId && layers.length > 0 && (
          <Text style={{
            fontFamily: "SpaceGrotesk_400Regular",
            fontSize: S.ms(11, 0.3),
            color: C.textTertiary,
            textAlign: "center",
            marginTop: 8,
          }}>
            {t("polygon", "muteVertex")}
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
        onPickCustomSound={handlePickCustomSound}
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
