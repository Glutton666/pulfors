/**
 * SwipeableBarRow — single bar row with horizontal swipe and vertical drag.
 */
import React, { useRef, useMemo } from "react";
import { View, Text, Pressable, PanResponder, Animated, Platform, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import type { BeatType, BarRepeat } from "@/components/beat-indicator.types";
import type { ProgressInfo } from "@/lib/metronome-engine";
import { FontSize } from "@/constants/tokens";
import {
  BAR_ROW_H,
  SWIPE_ACTION_THRESHOLD,
  formatBarCenterInfo,
  type BarModeColors,
} from "./BarModeTypes";

export interface SwipeableBarRowProps {
  beat: number;
  beatType: BeatType;
  subdivisions: BeatType[];
  repeat: BarRepeat | null;
  isCurrentBeat: boolean;
  isEditingBeat: boolean;
  blockDepth: number;
  blockStart: boolean;
  blockEnd: boolean;
  blockRepeatText?: string | null;
  symbolBadges: string[];
  isPlaying: boolean;
  progressCurrent?: number;
  progressTotal?: number;
  bpm: number;
  beatsPerMeasure: number;
  onPress: (beat: number) => void;
  onSwipeLeft: (beat: number) => void;
  onSwipeRight: (beat: number) => void;
  onLongPress: (beat: number) => void;
  onDragStart?: (beat: number) => void;
  onDragMove?: (beat: number, dy: number) => void;
  onDragEnd?: (beat: number, dy: number) => void;
  isDragging?: boolean;
  showDropLineAbove?: boolean;
  dragTranslateY?: Animated.Value;
  colors: BarModeColors;
  ms: (size: number, factor?: number) => number;
  rowHeight?: number;
  cellOverlayOpacity?: number;
}

export function SwipeableBarRow({
  beat, beatType, subdivisions, repeat, isCurrentBeat, isEditingBeat,
  blockDepth: _blockDepth, blockStart, blockEnd, blockRepeatText, symbolBadges, isPlaying,
  progressCurrent, progressTotal, bpm, beatsPerMeasure,
  onPress, onSwipeLeft, onSwipeRight, onLongPress,
  onDragStart, onDragMove, onDragEnd, isDragging, showDropLineAbove, dragTranslateY,
  colors: C, ms,
  rowHeight, cellOverlayOpacity: _cellOverlayOpacity,
}: SwipeableBarRowProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  const actionTriggered = useRef(false);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_e, g) =>
      !isPlaying && Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderGrant: () => { actionTriggered.current = false; },
    onPanResponderMove: (_e, g) => {
      translateX.setValue(Math.max(-80, Math.min(80, g.dx * 0.5)));
    },
    onPanResponderRelease: (_e, g) => {
      if (!actionTriggered.current) {
        if (g.dx < -SWIPE_ACTION_THRESHOLD) {
          if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onSwipeLeft(beat);
        } else if (g.dx > SWIPE_ACTION_THRESHOLD) {
          if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onSwipeRight(beat);
        }
      }
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true, tension: 120, friction: 8 }).start();
    },
    onPanResponderTerminate: () => {
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true, tension: 120, friction: 8 }).start();
    },
  }), [isPlaying, beat, onSwipeLeft, onSwipeRight]);

  const beatNumDragStarted = useRef(false);
  const beatNumPan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !isPlaying,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => { beatNumDragStarted.current = false; },
    onPanResponderMove: (_e, g) => {
      if (!beatNumDragStarted.current && Math.abs(g.dy) > 8) {
        beatNumDragStarted.current = true;
        onDragStart?.(beat);
      }
      if (beatNumDragStarted.current) { onDragMove?.(beat, g.dy); }
    },
    onPanResponderRelease: (_e, g) => {
      if (beatNumDragStarted.current) {
        onDragEnd?.(beat, g.dy);
      } else if (Math.abs(g.dx) < 8 && Math.abs(g.dy) < 8) {
        onPress?.(beat);
      }
      beatNumDragStarted.current = false;
    },
    onPanResponderTerminate: (_e, g) => {
      if (beatNumDragStarted.current) { onDragEnd?.(beat, g.dy ?? 0); }
      beatNumDragStarted.current = false;
    },
  }), [isPlaying, beat, onDragStart, onDragMove, onDragEnd, onPress]);

  const cells: BeatType[] = subdivisions.length > 0 ? subdivisions : [beatType];

  const rowTransform = dragTranslateY
    ? [{ translateX }, { translateY: dragTranslateY }]
    : [{ translateX }];

  return (
    <View style={{ position: "relative", overflow: isDragging ? "visible" : "hidden" }}>
      {showDropLineAbove && (
        <View style={{ height: 2, backgroundColor: "#5b9cf6", borderRadius: 1, marginHorizontal: 4 }} />
      )}
      <Animated.View
        style={[
          { transform: rowTransform },
          isDragging && {
            zIndex: 20,
            shadowColor: "#000",
            shadowOpacity: 0.3,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 4 },
            elevation: 10,
            opacity: 0.92,
          },
        ]}
        {...panResponder.panHandlers}
      >
        <Pressable
          testID={`bar-row-${beat}`}
          onPress={() => { if (!isPlaying) onPress(beat); }}
          onLongPress={() => { if (!isPlaying) onLongPress(beat); }}
          delayLongPress={500}
          style={[
            styles.barRow,
            {
              height: rowHeight ?? BAR_ROW_H,
              backgroundColor: isCurrentBeat
                ? C.accent + "18"
                : isEditingBeat
                ? C.backgroundSecondary
                : "transparent",
              borderBottomColor: C.overlay06,
            },
          ]}
        >
          {/* 바 번호 + 드래그 핸들 */}
          <View
            style={[styles.barRowNumber, { width: ms(32, 0.5), paddingHorizontal: 2 }]}
            {...beatNumPan.panHandlers}
          >
            <Text
              style={[
                styles.barRowNumberText,
                {
                  fontSize: ms(13, 0.45),
                  color: isDragging
                    ? "#5b9cf6"
                    : isCurrentBeat
                    ? C.accent
                    : beatType === "strong" ? C.accent
                    : beatType === "accent" ? C.accentMuted
                    : beatType === "mute" ? C.textTertiary
                    : C.textSecondary,
                  fontFamily: isDragging || isCurrentBeat ? "SpaceGrotesk_700Bold" : "SpaceGrotesk_500Medium",
                  opacity: isDragging ? 0.9 : 0.2,
                },
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.6}
            >
              {beat + 1}
            </Text>
            <View style={{ flexDirection: "column", gap: 2, marginLeft: 1, opacity: isDragging ? 0.7 : 0.2 }}>
              {[0, 1, 2].map(i => (
                <View key={i} style={{ width: 10, height: 1.5, borderRadius: 1, backgroundColor: isDragging ? "#5b9cf6" : C.textTertiary }} />
              ))}
            </View>
          </View>

          {/* 중앙: 비트 셀 */}
          <View style={[styles.barRowCells, { height: rowHeight != null ? Math.max(20, rowHeight - 16) : 28 }]}>
            {cells.map((ct, ci) => {
              const isLast = ci === cells.length - 1;
              const isActiveCell = isCurrentBeat;
              return (
                <View
                  key={ci}
                  style={[
                    styles.barMiniCell,
                    !isLast && { borderRightWidth: 0.5, borderRightColor: C.overlay06 },
                    {
                      backgroundColor:
                        ct === "strong" ? (isActiveCell ? C.accent : C.accent + "90")
                        : ct === "accent" ? (isActiveCell ? C.accentMuted : C.accentMuted + "90")
                        : ct === "mute" ? "transparent"
                        : (isActiveCell ? C.textSecondary : C.textTertiary + "60"),
                      borderWidth: ct === "mute" ? 1 : 0,
                      borderColor: ct === "mute" ? C.textTertiary + "80" : "transparent",
                    },
                  ]}
                />
              );
            })}

            {/* 비트 셀 위 info overlay */}
            <View style={styles.barCellOverlay} pointerEvents="none">
              <Text
                style={[styles.barCenterInfo, {
                  color: isCurrentBeat ? C.accent : C.text,
                  fontSize: ms(13, 0.45),
                  textShadowColor: "rgba(0,0,0,0.85)",
                  textShadowOffset: { width: 0, height: 1 },
                  textShadowRadius: 4,
                }]}
                numberOfLines={1}
              >
                {isPlaying && progressTotal && progressTotal > 1 && progressCurrent !== undefined
                  ? `${formatBarCenterInfo(repeat, bpm, beatsPerMeasure) ?? String(Math.round(bpm))} [${progressCurrent + 1}/${progressTotal}]`
                  : (formatBarCenterInfo(repeat, bpm, beatsPerMeasure) ?? String(Math.round(bpm)))
                }
                {symbolBadges.length > 0 ? `  ${symbolBadges.join(" ")}` : ""}
              </Text>
            </View>

            {/* 좌측 블록 시작 괄호 */}
            {blockStart && (
              <View
                style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 10, alignItems: "center", justifyContent: "center" }}
                pointerEvents="none"
              >
                <Text style={{ fontSize: ms(14, 0.5), color: C.accent, fontFamily: "SpaceGrotesk_700Bold", opacity: 0.85, includeFontPadding: false }}>{"["}</Text>
              </View>
            )}

            {/* 우측 블록 끝 괄호 */}
            {blockEnd && (
              <View
                style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 10, alignItems: "center", justifyContent: "center" }}
                pointerEvents="none"
              >
                <Text style={{ fontSize: ms(14, 0.5), color: C.accent, fontFamily: "SpaceGrotesk_700Bold", opacity: 0.85, includeFontPadding: false }}>{"]"}</Text>
              </View>
            )}

            {/* 반복 횟수 뱃지 (×N) */}
            {blockRepeatText && (
              <View
                style={{ position: "absolute", right: blockEnd ? 10 : 4, top: 2 }}
                pointerEvents="none"
              >
                <Text style={{ fontSize: ms(9, 0.4), color: C.accent, fontFamily: "SpaceGrotesk_700Bold", opacity: 0.9 }}>{blockRepeatText}</Text>
              </View>
            )}
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  barRow: {
    flexDirection: "row",
    alignItems: "center",
    height: BAR_ROW_H,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  barRowNumber: {
    width: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  barRowNumberText: {
    fontSize: FontSize.caption,
  },
  barRowCells: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 2,
    height: 28,
    borderRadius: 2,
    overflow: "hidden",
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.08)",
  },
  barMiniCell: {
    flex: 1,
    height: "100%",
    borderRadius: 0,
  },
  barCellOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingHorizontal: 4,
    backgroundColor: "transparent",
  },
  barCenterInfo: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    flexShrink: 1,
  },
});
