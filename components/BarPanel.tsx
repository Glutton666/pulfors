import React, { useRef, useEffect, useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  PanResponder,
  Pressable,
  ScrollView,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useTheme } from "@/contexts/ThemeContext";
import type { BeatType } from "@/lib/metronome-engine";

export interface BarRepeat {
  type: "count" | "duration";
  value: number;
}

const MIN_BEATS = 1;
const MAX_BEATS = 12;

interface BarPanelProps {
  beatsPerMeasure: number;
  currentBeat: number;
  isPlaying: boolean;
  onBeatsChange: (beats: number) => void;
  beatTypes: BeatType[];
  onBeatTypeChange: (index: number, type: BeatType) => void;
  dropTargetBeat: number | null;
  beatSubdivisions: Record<string, BeatType[]>;
  onBeatSubdivisionChange: (beatIndex: number, pattern: BeatType[] | null) => void;
  activeSubNote: number;
  barAreaRef?: React.RefObject<View | null>;
  barRepeats: Record<number, BarRepeat>;
  onBarRepeatChange: (beat: number, repeat: BarRepeat | null) => void;
  visible: boolean;
  onClose: () => void;
}

export function BarPanel({
  beatsPerMeasure,
  currentBeat,
  isPlaying,
  onBeatsChange,
  beatTypes,
  onBeatTypeChange,
  dropTargetBeat,
  beatSubdivisions,
  onBeatSubdivisionChange,
  activeSubNote,
  barAreaRef,
  barRepeats,
  onBarRepeatChange,
  visible,
  onClose,
}: BarPanelProps) {
  const { colors: C } = useTheme();
  const beats = Array.from({ length: beatsPerMeasure }, (_, i) => i);

  const cycleBeatType = useCallback(
    (index: number) => {
      const current = beatTypes[index] || "normal";
      let next: BeatType;
      if (current === "strong") next = "accent";
      else if (current === "accent") next = "normal";
      else if (current === "normal") next = "mute";
      else next = "strong";
      if (Platform.OS !== "web") {
        Haptics.impactAsync(
          next === "strong" || next === "accent"
            ? Haptics.ImpactFeedbackStyle.Heavy
            : next === "mute"
            ? Haptics.ImpactFeedbackStyle.Light
            : Haptics.ImpactFeedbackStyle.Medium
        );
      }
      onBeatTypeChange(index, next);
    },
    [beatTypes, onBeatTypeChange]
  );

  const handleBarCellPress = useCallback((beatIndex: number, cellIndex: number) => {
    if (isPlaying) return;
    const pattern = beatSubdivisions[String(beatIndex)] || ["normal"];
    const newPattern = [...pattern];
    const current = newPattern[cellIndex];
    const next: BeatType =
      current === "strong" ? "accent"
      : current === "accent" ? "normal"
      : current === "normal" ? "mute"
      : "strong";
    newPattern[cellIndex] = next;
    onBeatSubdivisionChange(beatIndex, newPattern);
    if (Platform.OS !== "web") {
      Haptics.impactAsync(
        next === "strong" || next === "accent"
          ? Haptics.ImpactFeedbackStyle.Heavy
          : next === "mute"
          ? Haptics.ImpactFeedbackStyle.Light
          : Haptics.ImpactFeedbackStyle.Medium
      );
    }
  }, [isPlaying, beatSubdivisions, onBeatSubdivisionChange]);

  const barScrollRef = useRef<ScrollView>(null);
  const [repeatModalBeat, setRepeatModalBeat] = useState<number | null>(null);
  const [repeatType, setRepeatType] = useState<"count" | "duration">("count");
  const [repeatCountVal, setRepeatCountVal] = useState(2);
  const [repeatMinVal, setRepeatMinVal] = useState(0);
  const [repeatSecVal, setRepeatSecVal] = useState(30);

  const openRepeatModal = useCallback((beat: number) => {
    const existing = barRepeats[beat];
    if (existing) {
      setRepeatType(existing.type);
      if (existing.type === "count") {
        setRepeatCountVal(existing.value);
      } else {
        setRepeatMinVal(Math.floor(existing.value / 60));
        setRepeatSecVal(existing.value % 60);
      }
    } else {
      setRepeatType("count");
      setRepeatCountVal(2);
      setRepeatMinVal(0);
      setRepeatSecVal(30);
    }
    setRepeatModalBeat(beat);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  }, [barRepeats]);

  const saveRepeat = useCallback(() => {
    if (repeatModalBeat === null) return;
    const val = repeatType === "count" ? repeatCountVal : repeatMinVal * 60 + repeatSecVal;
    if (val <= 0) return;
    if (repeatType === "count" && val === 1) {
      onBarRepeatChange(repeatModalBeat, null);
    } else {
      onBarRepeatChange(repeatModalBeat, { type: repeatType, value: val });
    }
    setRepeatModalBeat(null);
  }, [repeatModalBeat, repeatType, repeatCountVal, repeatMinVal, repeatSecVal, onBarRepeatChange]);

  const clearRepeat = useCallback(() => {
    if (repeatModalBeat === null) return;
    onBarRepeatChange(repeatModalBeat, null);
    setRepeatModalBeat(null);
  }, [repeatModalBeat, onBarRepeatChange]);

  const formatRepeat = (r: BarRepeat): string => {
    if (r.type === "count") return `\u00D7${r.value}`;
    const totalSec = r.value;
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    if (m > 0) return s > 0 ? `${m}'${s.toString().padStart(2, "0")}"` : `${m}'`;
    return `${s}"`;
  };

  const BAR_HEIGHT = beatsPerMeasure <= 4 ? 44 : beatsPerMeasure <= 6 ? 36 : 30;
  const BAR_LINE_COLOR = Colors.textSecondary;
  const SCROLL_MAX_HEIGHT = 10 * (BAR_HEIGHT + 1) + 2;
  const needsScroll = beatsPerMeasure > 10;

  const barAreaPanResponder = useMemo(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) =>
        !isPlaying && Math.abs(gs.dy) > 30 && Math.abs(gs.dy) > Math.abs(gs.dx) * 1.5,
      onPanResponderRelease: (_, gs) => {
        if (isPlaying) return;
        if (gs.dy > 40 && beatsPerMeasure < MAX_BEATS) {
          onBeatsChange(beatsPerMeasure + 1);
          if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        } else if (gs.dy < -40 && beatsPerMeasure > MIN_BEATS) {
          onBeatsChange(beatsPerMeasure - 1);
          if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
      },
    }),
  [isPlaying, beatsPerMeasure, onBeatsChange]);

  useEffect(() => {
    if (!visible || !isPlaying || currentBeat < 0) return;
    if (!needsScroll) return;
    const rowH = BAR_HEIGHT + 1;
    const visibleHeight = SCROLL_MAX_HEIGHT;
    const beatTop = currentBeat * rowH;
    const scrollTarget = Math.max(0, beatTop - (visibleHeight / 2) + (rowH / 2));
    barScrollRef.current?.scrollTo({ y: scrollTarget, animated: false });
  }, [visible, isPlaying, currentBeat, beatsPerMeasure, needsScroll, BAR_HEIGHT, SCROLL_MAX_HEIGHT]);

  if (!visible) return null;

  const isDropping = dropTargetBeat !== null;
  const barRows = beats.map((beat) => {
    const pattern = beatSubdivisions[String(beat)] || [beatTypes[beat] || "normal"];
    const isCurrent = isPlaying && currentBeat === beat;
    const bType = beatTypes[beat] || "normal";
    const isDropTarget = isDropping && (dropTargetBeat === beat || dropTargetBeat === -1);
    const repeat = barRepeats[beat];
    return (
      <Pressable
        key={`bar-${beat}`}
        onLongPress={() => { if (!isPlaying) openRepeatModal(beat); }}
        delayLongPress={500}
        onPress={() => cycleBeatType(beat)}
        style={[
          styles.barBeatWrapper,
          isCurrent && styles.barBeatWrapperActive,
          isDropTarget && { backgroundColor: "rgba(255,255,255,0.06)", borderColor: C.accent, borderWidth: 1, borderRadius: 4, marginHorizontal: -1 },
        ]}
      >
        <View style={styles.barBeatLabel}>
          <Text style={[
            styles.barBeatLabelText,
            {
              color: bType === "strong" ? C.accent
                : bType === "accent" ? C.accentMuted
                : bType === "mute" ? Colors.textTertiary
                : Colors.textSecondary,
              opacity: isCurrent ? 1 : 0.6,
            }
          ]}>
            {beat + 1}
          </Text>
        </View>
        <View style={[
          styles.barBeatContent,
          { height: BAR_HEIGHT },
          isCurrent && { backgroundColor: "rgba(255,255,255,0.08)" },
        ]}>
          {pattern.map((type, ci) => {
            const isActiveCell = isCurrent && ci === activeSubNote;
            const isStrongType = type === "strong";
            const isAccentType = type === "accent" || isStrongType;
            const isLast = ci === pattern.length - 1;
            return (
              <Pressable
                key={ci}
                onPress={(e) => { e.stopPropagation(); handleBarCellPress(beat, ci); }}
                style={[styles.barNoteCell, !isLast && { borderRightWidth: 1, borderRightColor: "rgba(255,255,255,0.08)" }]}
              >
                {isStrongType ? (
                  <LinearGradient
                    colors={[Colors.white, C.accent, C.accentMuted]}
                    locations={[0, 0.35, 1]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.barNoteFill, { opacity: isActiveCell ? 1 : 0.75, margin: 3 }]}
                  />
                ) : type === "mute" ? (
                  <View style={[styles.barNoteFill, {
                    margin: 3,
                    backgroundColor: "transparent",
                    borderWidth: 1,
                    borderColor: Colors.textTertiary,
                    borderStyle: "dashed" as any,
                    opacity: isActiveCell ? 0.9 : 0.4,
                  }]} />
                ) : (
                  <View style={[styles.barNoteFill, {
                    margin: 3,
                    backgroundColor: isAccentType
                      ? (isActiveCell ? C.accent : C.accentMuted)
                      : (isActiveCell ? Colors.text : Colors.textTertiary),
                    opacity: isActiveCell ? 1 : 0.7,
                  }]} />
                )}
              </Pressable>
            );
          })}
        </View>
        <View style={[styles.barBeatEndLine, { backgroundColor: BAR_LINE_COLOR }]} />
        <Pressable
          onPress={(e) => { e.stopPropagation(); if (!isPlaying) openRepeatModal(beat); }}
          style={styles.barRepeatBadge}
          hitSlop={6}
        >
          <Text style={[styles.barRepeatText, { color: repeat ? C.accent : Colors.textTertiary }]}>
            {repeat ? formatRepeat(repeat) : "\u00D71"}
          </Text>
        </Pressable>
      </Pressable>
    );
  });

  return (
    <View style={styles.barPanelContainer} testID="bar-panel">
      <View style={styles.barPanelHeader}>
        <Text style={[styles.hintText, { color: Colors.textTertiary }]}>
          drag {"\u2193"} add  {"\u2022"}  drag {"\u2191"} remove  {"\u2022"}  long press = repeat
        </Text>
        <Pressable
          onPress={onClose}
          style={styles.closeBtnSmall}
          hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
          testID="close-bar-panel"
        >
          <Ionicons name="close" size={18} color={Colors.textSecondary} />
        </Pressable>
      </View>

      <View
        ref={barAreaRef}
        style={styles.barMeasureOuter}
        {...barAreaPanResponder.panHandlers}
      >
        {needsScroll ? (
          <ScrollView
            ref={barScrollRef}
            style={[styles.barScrollView, { maxHeight: SCROLL_MAX_HEIGHT }]}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
          >
            <View style={styles.barMeasureContainer}>
              <View style={[styles.barMeasureStartLine, { backgroundColor: BAR_LINE_COLOR }]} />
              <View style={styles.barMeasureInner}>{barRows}</View>
              <View style={[styles.barMeasureEndLine, { backgroundColor: BAR_LINE_COLOR }]} />
            </View>
          </ScrollView>
        ) : (
          <View style={styles.barMeasureContainer}>
            <View style={[styles.barMeasureStartLine, { backgroundColor: BAR_LINE_COLOR }]} />
            <View style={styles.barMeasureInner}>{barRows}</View>
            <View style={[styles.barMeasureEndLine, { backgroundColor: BAR_LINE_COLOR }]} />
          </View>
        )}

        {needsScroll && (
          <View style={styles.barScrollFade} pointerEvents="none" />
        )}
      </View>

      <Modal
        visible={repeatModalBeat !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setRepeatModalBeat(null)}
      >
        <Pressable style={styles.repeatModalOverlay} onPress={() => setRepeatModalBeat(null)}>
          <View style={[styles.repeatModalCard, { borderColor: C.accent }]} onStartShouldSetResponder={() => true}>
            <Text style={styles.repeatModalTitle}>
              Bar {repeatModalBeat !== null ? repeatModalBeat + 1 : ""} Repeat
            </Text>

            <View style={styles.repeatTypeRow}>
              <Pressable
                onPress={() => setRepeatType("count")}
                style={[styles.repeatTypeBtn, repeatType === "count" && { backgroundColor: C.accent }]}
              >
                <Text style={[styles.repeatTypeBtnText, repeatType === "count" && { color: Colors.background }]}>Count</Text>
              </Pressable>
              <Pressable
                onPress={() => setRepeatType("duration")}
                style={[styles.repeatTypeBtn, repeatType === "duration" && { backgroundColor: C.accent }]}
              >
                <Text style={[styles.repeatTypeBtnText, repeatType === "duration" && { color: Colors.background }]}>Duration</Text>
              </Pressable>
            </View>

            {repeatType === "count" ? (
              <View style={styles.repeatValueRow}>
                <Pressable onPress={() => setRepeatCountVal(Math.max(2, repeatCountVal - 1))} style={styles.repeatValBtn}>
                  <Ionicons name="remove" size={20} color={Colors.text} />
                </Pressable>
                <Text style={styles.repeatValText}>{"\u00D7"}{repeatCountVal}</Text>
                <Pressable onPress={() => setRepeatCountVal(Math.min(99, repeatCountVal + 1))} style={styles.repeatValBtn}>
                  <Ionicons name="add" size={20} color={Colors.text} />
                </Pressable>
              </View>
            ) : (
              <View style={styles.repeatValueRow}>
                <View style={styles.repeatTimeGroup}>
                  <Pressable onPress={() => setRepeatMinVal(Math.max(0, repeatMinVal - 1))} style={styles.repeatValBtn}>
                    <Ionicons name="remove" size={18} color={Colors.text} />
                  </Pressable>
                  <Text style={styles.repeatValText}>{repeatMinVal}</Text>
                  <Pressable onPress={() => setRepeatMinVal(Math.min(59, repeatMinVal + 1))} style={styles.repeatValBtn}>
                    <Ionicons name="add" size={18} color={Colors.text} />
                  </Pressable>
                  <Text style={styles.repeatTimeLabel}>min</Text>
                </View>
                <Text style={styles.repeatTimeSep}>:</Text>
                <View style={styles.repeatTimeGroup}>
                  <Pressable onPress={() => setRepeatSecVal(Math.max(0, repeatSecVal - 5))} style={styles.repeatValBtn}>
                    <Ionicons name="remove" size={18} color={Colors.text} />
                  </Pressable>
                  <Text style={styles.repeatValText}>{repeatSecVal.toString().padStart(2, "0")}</Text>
                  <Pressable onPress={() => setRepeatSecVal(Math.min(55, repeatSecVal + 5))} style={styles.repeatValBtn}>
                    <Ionicons name="add" size={18} color={Colors.text} />
                  </Pressable>
                  <Text style={styles.repeatTimeLabel}>sec</Text>
                </View>
              </View>
            )}

            <View style={styles.repeatActions}>
              <Pressable onPress={clearRepeat} style={styles.repeatClearBtn}>
                <Text style={[styles.repeatClearText, { color: Colors.danger }]}>Clear</Text>
              </Pressable>
              <Pressable onPress={saveRepeat} style={[styles.repeatSaveBtn, { backgroundColor: C.accent }]}>
                <Text style={[styles.repeatSaveText, { color: Colors.background }]}>Save</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  barPanelContainer: {
    width: "100%" as any,
    gap: 6,
  },
  barPanelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  closeBtnSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  hintText: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 10,
    color: Colors.textTertiary,
    letterSpacing: 0.5,
    flex: 1,
  },
  barMeasureOuter: {
    width: "100%" as any,
    paddingHorizontal: 8,
  },
  barMeasureContainer: {
    flexDirection: "row",
    alignItems: "stretch",
    width: "100%" as any,
  },
  barMeasureStartLine: {
    width: 3,
    borderRadius: 1.5,
    marginRight: 0,
  },
  barMeasureEndLine: {
    width: 5,
    borderRadius: 1,
  },
  barMeasureInner: {
    flex: 1,
    gap: 0,
  },
  barBeatWrapper: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  barBeatWrapperActive: {
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  barBeatLabel: {
    width: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  barBeatLabelText: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 13,
  },
  barBeatContent: {
    flex: 1,
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  barNoteCell: {
    flex: 1,
    alignItems: "stretch",
    justifyContent: "stretch",
  },
  barNoteFill: {
    flex: 1,
    borderRadius: 4,
  },
  barBeatEndLine: {
    width: 1.5,
    marginLeft: 0,
    opacity: 0.4,
  },
  barRepeatBadge: {
    width: 32,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  barRepeatText: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 10,
    letterSpacing: 0.5,
  },
  barScrollView: {
    flexGrow: 0,
  },
  barScrollFade: {
    position: "absolute",
    bottom: 0,
    left: 8,
    right: 8,
    height: 20,
    backgroundColor: "transparent",
  },
  repeatModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  repeatModalCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    width: 280,
    gap: 16,
  },
  repeatModalTitle: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 16,
    color: Colors.text,
    textAlign: "center" as const,
  },
  repeatTypeRow: {
    flexDirection: "row",
    gap: 8,
  },
  repeatTypeBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.border,
    alignItems: "center",
  },
  repeatTypeBtnText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 13,
    color: Colors.text,
  },
  repeatValueRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  repeatValBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  repeatValText: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 22,
    color: Colors.text,
    minWidth: 48,
    textAlign: "center" as const,
  },
  repeatTimeGroup: {
    alignItems: "center",
    gap: 4,
  },
  repeatTimeLabel: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 10,
    color: Colors.textTertiary,
  },
  repeatTimeSep: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 22,
    color: Colors.textSecondary,
    marginBottom: 16,
  },
  repeatActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  repeatClearBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.danger,
    alignItems: "center",
  },
  repeatClearText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 14,
  },
  repeatSaveBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  repeatSaveText: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 14,
  },
});
