/**
 * SwipeableBarRow — single bar row with horizontal swipe and vertical drag.
 */
import React, { useRef, useMemo } from "react";
import { View, Text, Pressable, PanResponder, Animated, Platform, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import type { BeatType, BarRepeat } from "@/components/beat-indicator.types";
import type { ProgressInfo } from "@/lib/metronome-engine";
import { FontSize } from "@/constants/tokens";
import {
  BAR_ROW_H,
  SWIPE_ACTION_THRESHOLD,
  formatBarCenterInfo,
  type BarModeColors,
  type SampleCellCoverage,
} from "./BarModeTypes";
import { SimplifiedStaffNotation } from "./SimplifiedStaffNotation";

export interface SwipeableBarRowProps {
  beat: number;
  beatType: BeatType;
  subdivisions: BeatType[];
  repeat: BarRepeat | null;
  isCurrentBeat: boolean;
  activeSubNote?: number;
  isEditingBeat: boolean;
  blockDepth: number;
  blockStart: boolean;
  blockEnd: boolean;
  blockEditIndex?: number;
  blockRepeatText?: string | null;
  symbolBadges: string[];
  isPlaying: boolean;
  progressCurrent?: number;
  progressTotal?: number;
  bpm: number;
  meterNumerator: number;
  meterDenominator: 2 | 4 | 8;
  beatsPerMeasure: number;
  onPress: (beat: number) => void;
  onSwipeLeft: (beat: number) => void;
  onSwipeRight: (beat: number) => void;
  onLongPress: (beat: number) => void;
  onEditBlock?: (blockIndex: number) => void;
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
  sampleCells?: boolean[];
  sampleCellCoverage?: Array<SampleCellCoverage | undefined>;
}

export function SwipeableBarRow({
  beat, beatType, subdivisions, repeat, isCurrentBeat, isEditingBeat,
  activeSubNote = -1,
  blockDepth: _blockDepth, blockStart, blockEnd, blockEditIndex, blockRepeatText, symbolBadges, isPlaying,
  progressCurrent, progressTotal, bpm, meterNumerator, meterDenominator, beatsPerMeasure,
  onPress, onSwipeLeft, onSwipeRight, onLongPress, onEditBlock,
  onDragStart, onDragMove, onDragEnd, isDragging, showDropLineAbove, dragTranslateY,
  colors: C, ms,
  rowHeight, cellOverlayOpacity: _cellOverlayOpacity, sampleCells = [], sampleCellCoverage = [],
}: SwipeableBarRowProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  const actionTriggered = useRef(false);
  const sampleNoteIndexes = sampleCells.reduce<number[]>((indexes, hasSample, index) => {
    if (hasSample) indexes.push(index + 1);
    return indexes;
  }, []);
  const rowAccessibilityLabel = sampleNoteIndexes.length > 0
    ? `Bar ${beat + 1}, audio samples on notes ${sampleNoteIndexes.join(", ")}`
    : `Bar ${beat + 1}`;

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
    // Do not claim a tap on the number handle. Let the enclosing Pressable
    // select the row, and only claim a deliberate vertical drag for reordering.
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_e, g) =>
      !isPlaying && Math.abs(g.dy) > 8 && Math.abs(g.dy) > Math.abs(g.dx) * 1.2,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => {
      beatNumDragStarted.current = true;
      onDragStart?.(beat);
    },
    onPanResponderMove: (_e, g) => {
      if (beatNumDragStarted.current) { onDragMove?.(beat, g.dy); }
    },
    onPanResponderRelease: (_e, g) => {
      if (beatNumDragStarted.current) {
        onDragEnd?.(beat, g.dy);
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
          accessibilityLabel={rowAccessibilityLabel}
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
               borderLeftWidth: isCurrentBeat ? 3 : isEditingBeat ? 2 : 0,
               borderLeftColor: isCurrentBeat ? C.accent : isEditingBeat ? C.textSecondary : "transparent",
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
             <SimplifiedStaffNotation
               beat={beat}
               notes={cells}
               activeSubNote={activeSubNote}
               isCurrentBeat={isCurrentBeat}
               colors={C}
             />
            {cells.map((ct, ci) => {
              const isLast = ci === cells.length - 1;
               const isActiveCell = isCurrentBeat && ci === activeSubNote;
              const coverage = sampleCellCoverage[ci];
              const hasSample = Boolean(coverage || sampleCells[ci]);
               const isDirectSample = coverage?.kind === "direct" || (!coverage && hasSample);
              return (
                <View
                  key={ci}
                  testID={
                    !hasSample
                      ? `bar-cell-${beat}-${ci}`
                      : isDirectSample
                      ? `bar-sample-cell-${beat}-${ci}`
                      : `bar-sample-coverage-cell-${beat}-${ci}`
                  }
                  accessible={hasSample}
                  accessibilityRole={hasSample ? "image" : undefined}
                  accessibilityLabel={
                    hasSample
                      ? `${coverage?.source === "import" ? "Imported" : "Recorded"} sample ${
                        isDirectSample ? "starts" : "continues"
                      } on note ${ci + 1} of bar ${beat + 1}`
                      : undefined
                  }
                  style={[
                    styles.barMiniCell,
                    !isLast && { borderRightWidth: 1, borderRightColor: C.overlay10 },
                    {
                      backgroundColor: isActiveCell ? C.accent + "12" : "transparent",
                      borderTopWidth: isActiveCell ? 2 : 0,
                      borderBottomWidth: isActiveCell ? 2 : 0,
                      borderTopColor: isActiveCell ? C.white : ct === "strong" ? C.white + "80" : ct === "mute" ? C.textTertiary + "80" : "transparent",
                      borderBottomColor: isActiveCell ? C.white : ct === "strong" ? C.background + "A6" : ct === "mute" ? C.textTertiary + "80" : "transparent",
                    },
                  ]}
                >
                   {isActiveCell && (
                     <View
                       testID={`bar-active-cell-${beat}-${ci}`}
                       pointerEvents="none"
                       style={[styles.barActiveCellMarker, { backgroundColor: C.white }]}
                     />
                   )}
                   {isDirectSample && (
                     <View
                       testID={`bar-sample-start-marker-${beat}-${ci}`}
                       pointerEvents="none"
                       style={[
                         styles.barSampleStartMarker,
                         { backgroundColor: coverage?.source === "import" ? C.textSecondary : C.text },
                       ]}
                     />
                   )}
                </View>
              );
            })}

            {/* Keep sample coverage as a line above the cells so beat accents
                remain the only source of cell background color. */}
            <View
              testID={`bar-sample-coverage-overlay-${beat}`}
              style={[styles.barSampleCoverageOverlay, { pointerEvents: "none" }]}
            >
              {cells.map((_, ci) => {
                const coverage = sampleCellCoverage[ci];
                if (!coverage) return <View key={ci} style={styles.barSampleCoverageSpacer} />;
                // 예전엔 C.accent/C.accentMuted를 썼는데, 악센트 배경도 같은
                // 색이라 악센트 비트 위에 샘플이 있으면 이 선이 배경에 묻혀
                // 안 보였다 (2026-08-24 사용자 확인). C.text/C.textSecondary는
                // 테마의 accent 색과 무관해 어떤 테마에서도 배경과 구별되면서,
                // import/recording 구분(진하기 차이)도 그대로 유지한다.
                const sampleColor = coverage.source === "import" ? C.textSecondary : C.text;
                return (
                  <View
                    key={ci}
                    style={[
                      styles.barSampleCoverageSegment,
                      {
                        borderTopWidth: coverage.kind === "direct" ? 3 : 1,
                        borderTopColor: sampleColor + (coverage.kind === "direct" ? "D9" : "8C"),
                      },
                    ]}
                  />
                );
              })}
            </View>

            {/* 비트 셀 위 info overlay */}
            <View style={styles.barCellOverlay} pointerEvents="none">
              <Text
                style={[styles.barCenterInfo, {
                  color: isCurrentBeat ? C.accent : C.text,
                   fontSize: ms(8.5, 0.35),
                  textShadowColor: "rgba(0,0,0,0.85)",
                  textShadowOffset: { width: 0, height: 1 },
                  textShadowRadius: 4,
                }]}
                numberOfLines={1}
              >
                {isPlaying && progressTotal && progressTotal > 1 && progressCurrent !== undefined
                  ? `${meterNumerator}/${meterDenominator} · ${formatBarCenterInfo(repeat, bpm, meterNumerator, meterDenominator) ?? String(Math.round(bpm))} [${progressCurrent + 1}/${progressTotal}]`
                  : `${meterNumerator}/${meterDenominator} · ${formatBarCenterInfo(repeat, bpm, meterNumerator, meterDenominator) ?? String(Math.round(bpm))}`
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

          {blockEditIndex !== undefined && !isPlaying && (
            <Pressable
              testID={`bar-block-edit-${beat}`}
              accessibilityRole="button"
              accessibilityLabel={`Edit block starting at bar ${beat + 1}`}
              onPress={(event) => {
                event.stopPropagation();
                onEditBlock?.(blockEditIndex);
              }}
              hitSlop={8}
              style={[styles.blockEditButton, { backgroundColor: C.accent + "18" }]}
            >
              <Ionicons name="settings-outline" size={ms(15, 0.4)} color={C.accent} />
            </Pressable>
          )}

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
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 2,
    height: 28,
    borderRadius: 2,
    overflow: "visible",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  blockEditButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 4,
  },
  barMiniCell: {
    flex: 1,
    height: "100%",
    borderRadius: 0,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 2,
    position: "relative",
  },
  barSampleStartMarker: {
    position: "absolute",
    top: 3,
    alignSelf: "center",
    width: 5,
    height: 5,
    borderRadius: 1,
    transform: [{ rotate: "45deg" }],
  },
  barActiveCellMarker: {
    position: "absolute",
    top: 1,
    alignSelf: "center",
    width: 12,
    height: 2,
    borderRadius: 1,
  },
  barSampleCoverageOverlay: {
    position: "absolute",
    top: -2,
    left: 0,
    right: 0,
    height: 4,
    flexDirection: "row",
    zIndex: 5,
  },
  barSampleCoverageSegment: {
    flex: 1,
    borderTopWidth: 1,
    backgroundColor: "transparent",
  },
  barSampleCoverageSpacer: {
    flex: 1,
    backgroundColor: "transparent",
  },
  barCellOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 11,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "flex-end",
    gap: 2,
    paddingHorizontal: 3,
    backgroundColor: "transparent",
  },
  barCenterInfo: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    flexShrink: 1,
  },
});
