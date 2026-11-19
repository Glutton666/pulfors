/**
 * PolygonModeView — 폴리곤 메트로놈 전체화면 뷰
 *
 * 레이아웃 (위 → 아래):
 *   1. 헤더 (제목 + 닫기)
 *   2. 폴리곤 캔버스 (flex: 1)
 *   3. 레이어 편집 패널
 *   4. 비트 모드와 같은 BPM 컨트롤
 *   5. 오프셋 팝업 (overlay)
 */

import React, { useCallback, useState } from "react";
import {
  View, Text, Pressable, StyleSheet, useWindowDimensions,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useScale } from "@/lib/scale";
import type { UsePolygonModeResult } from "@/hooks/usePolygonMode";
import type { ClickPCMs } from "@/lib/audio-renderer";
import { getWebAudioContext } from "@/lib/audio-renderer";
import { polygonSlotDurationMs } from "@/lib/polygon-offset";
import { PolygonCanvas } from "@/components/polygon-mode/PolygonCanvas";
import { PolygonLayerEditor } from "@/components/polygon-mode/PolygonLayerEditor";
import { PolygonOffsetPopup } from "@/components/polygon-mode/PolygonOffsetPopup";
import { BpmSlider } from "@/components/BpmSlider";

interface PolygonModeViewProps {
  polygonMode: UsePolygonModeResult;
  isPlaying: boolean;
  onClose: () => void;
  onTogglePlay?: () => void;
  bpm?: number;
  beatsPerMeasure?: number;
  onBpmChange?: (bpm: number) => void;
}

const SHARED_SPEEDS = [
  { rate: 2, label: "1/2 · ×2" },
  { rate: 1, label: "1/4 · ×1" },
  { rate: 0.5, label: "1/8 · ×0.5" },
] as const;

export function PolygonModeView({ polygonMode, isPlaying, onClose, onTogglePlay, bpm, beatsPerMeasure = 4, onBpmChange }: PolygonModeViewProps) {
  const { colors: C } = useTheme();
  const { t, language } = useLanguage();
  const S = useScale();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [canvasArea, setCanvasArea] = useState({ width: 0, height: 0 });

  const {
    layers, editingLayerId, setEditingLayerId,
    activeVertices, offsetPopup, setOffsetPopup,
    handleAddLayer, handleDeleteLayer, handleUpdateLayer, handleSetOffset,
    handleVertexBeatTypeCycle, setLayerCustomSound,
  } = polygonMode;

  // Keep the drawing inside the actual space left by the controller, including
  // short landscape layouts where width alone would make it overflow.
  const canvasSize = Math.max(0, Math.min(
    canvasArea.width - S.ms(32, 0.3),
    canvasArea.height - S.ms(46, 0.3),
    width - S.ms(32, 0.3),
    400,
  ));
  const isCompactHeight = height < 520;
  const isShortLandscape = isCompactHeight && width > height;
  const speedIndex = SHARED_SPEEDS.findIndex(({ rate }) => rate === polygonMode.playbackRate);
  const speed = SHARED_SPEEDS[speedIndex];
  const cycleSharedSpeed = () => {
    polygonMode.setPlaybackRate(SHARED_SPEEDS[(speedIndex + 1) % SHARED_SPEEDS.length].rate);
  };
  const getSlotMs = (sides: number) => polygonSlotDurationMs(bpm ?? 120, polygonMode.playbackRate, beatsPerMeasure, sides);

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
    <View testID="polygon-screen" style={[StyleSheet.absoluteFillObject, { backgroundColor: C.background }]}>
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
          testID="polygon-close"
          accessibilityRole="button"
          accessibilityLabel={language === "ko" ? "폴리곤 닫기" : "Close Polygon"}
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
          testID="polygon-play-toggle"
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? (t("polygon", "playing")) : (t("polygon", "stopped"))}
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

      <View style={{
        flex: 1,
        minHeight: 0,
        flexDirection: isShortLandscape ? "row" : "column",
        alignItems: "stretch",
      }}>
        {/* ── 캔버스 영역 ── */}
        <View
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            alignItems: "center",
            justifyContent: "center",
          }}
          onLayout={(event) => setCanvasArea({
            width: event.nativeEvent.layout.width,
            height: event.nativeEvent.layout.height,
          })}
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
        ) : canvasSize > 0 ? (
          <View testID="polygon-canvas" style={{ width: canvasSize, height: canvasSize }}>
            <PolygonCanvas
              layers={layers}
              activeVertices={activeVertices}
              editingLayerId={editingLayerId}
              onVertexPress={handleVertexBeatTypeCycle}
              onVertexLongPress={handleVertexLongPress}
              onVertexOffsetCommit={handleSetOffset}
              getSlotMs={getSlotMs}
              size={canvasSize}
            />
          </View>
        ) : null}

          {/* 편집 힌트 */}
          {editingLayerId && layers.length > 0 && (
            <Text style={{
              fontFamily: "SpaceGrotesk_400Regular",
              fontSize: S.ms(11, 0.3),
              color: C.textTertiary,
              textAlign: "center",
              marginTop: 8,
            }}>
              {t("polygon", "vertexTimingHint")}
            </Text>
          )}
        </View>

        {/* One continuous controller surface: layers, shared playback rate, BPM. */}
        <View
          testID="polygon-controls"
          style={{
            flexShrink: isShortLandscape ? 1 : 0,
            minWidth: 0,
            backgroundColor: C.surface,
            paddingBottom: insets.bottom + S.ms(8, 0.3),
            ...(isShortLandscape ? { width: "48%", maxWidth: 460 } : {}),
          }}
        >
        <PolygonLayerEditor
          layers={layers}
          editingLayerId={editingLayerId}
          onSelectLayer={handleLayerSelect}
          onUpdateLayer={handleUpdateLayer}
          onDeleteLayer={handleDeleteLayer}
          onAddLayer={handleAddLayer}
          onPickCustomSound={handlePickCustomSound}
          compactHeight={isCompactHeight}
        />
        {bpm !== undefined && onBpmChange && (
          <View style={{ paddingHorizontal: S.ms(16, 0.3), paddingTop: S.ms(5, 0.3) }}>
            <BpmSlider
              embedded
              bpm={bpm}
              onBpmChange={onBpmChange}
              onTapTempo={() => onTogglePlay?.()}
               onDenominatorCycle={cycleSharedSpeed}
               centerHoldLabel={speed.label}
               centerHoldHint={t("polygon", "sharedSpeedHint")}
              isLandscape={isCompactHeight}
            />
          </View>
        )}
        </View>
      </View>

      {/* ── 오프셋 팝업 ── */}
      {offsetPopup && currentPopupLayer && (
        <PolygonOffsetPopup
          key={`${offsetPopup.layerId}:${offsetPopup.vertexIdx}`}
          visible
          vertexIdx={offsetPopup.vertexIdx}
          currentOffset={currentPopupOffset}
          slotMs={getSlotMs(currentPopupLayer.sides)}
          onConfirm={(offset) => handleSetOffset(offsetPopup.layerId, offsetPopup.vertexIdx, offset)}
          onClose={() => setOffsetPopup(null)}
        />
      )}
    </View>
  );
}
