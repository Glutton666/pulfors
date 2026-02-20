import React, { useRef, useEffect, useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  Dimensions,
  PanResponder,
  Pressable,
  ScrollView,
  Modal,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  withTiming,
  withSequence,
  withSpring,
  useSharedValue,
  Easing,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import Colors from "@/constants/colors";
import { useTheme } from "@/contexts/ThemeContext";

export type BeatType = "strong" | "accent" | "normal" | "mute";

const SCREEN_WIDTH = Dimensions.get("window").width;
const DIAL_SIZE = Math.min(SCREEN_WIDTH - 48, 300);
const DIAL_RADIUS = DIAL_SIZE / 2;
const DOT_RADIUS_FROM_CENTER = DIAL_RADIUS - 30;
const DOT_SIZE = 34;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.35;
const MIN_BEATS = 1;
const MAX_BEATS = 12;

export { DIAL_SIZE, DIAL_RADIUS, DOT_RADIUS_FROM_CENTER };

interface DialBeatDotProps {
  index: number;
  total: number;
  isActive: boolean;
  beatType: BeatType;
  onPress: () => void;
  isDropTarget: boolean;
  subdivisionCount: number;
}

function DialBeatDot({
  index,
  total,
  isActive,
  beatType,
  onPress,
  isDropTarget,
  subdivisionCount,
}: DialBeatDotProps) {
  const { colors: C } = useTheme();
  const isStrong = beatType === "strong";
  const isAccent = beatType === "accent" || isStrong;
  const isMute = beatType === "mute";
  const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
  const size = DOT_SIZE;
  const x = DIAL_RADIUS + DOT_RADIUS_FROM_CENTER * Math.cos(angle) - size / 2;
  const y = DIAL_RADIUS + DOT_RADIUS_FROM_CENTER * Math.sin(angle) - size / 2;

  const popScale = useSharedValue(1);
  const beatScale = useSharedValue(1);
  const beatBg = useSharedValue(
    isMute ? "transparent" : isAccent ? C.accentMuted : Colors.textTertiary
  );
  const beatBorder = useSharedValue(
    isMute ? Colors.textSecondary : "transparent"
  );
  const beatShadow = useSharedValue(0);

  const handlePress = useCallback(() => {
    popScale.value = withSequence(
      withTiming(0.85, { duration: 40, easing: Easing.out(Easing.quad) }),
      withTiming(1, { duration: 100, easing: Easing.out(Easing.quad) })
    );
    onPress();
  }, [onPress]);

  useEffect(() => {
    if (isMute) {
      if (isActive) {
        beatScale.value = withSequence(
          withTiming(1.15, { duration: 50, easing: Easing.out(Easing.quad) }),
          withTiming(1, { duration: 200, easing: Easing.out(Easing.quad) })
        );
        beatBg.value = withTiming("rgba(72, 79, 88, 0.35)", { duration: 50 });
        beatBorder.value = withTiming(Colors.textSecondary, { duration: 50 });
        beatShadow.value = withSequence(
          withTiming(0.3, { duration: 50 }),
          withTiming(0, { duration: 300 })
        );
      } else {
        beatScale.value = withTiming(1, { duration: 150 });
        beatBg.value = withTiming("transparent", { duration: 150 });
        beatBorder.value = withTiming(Colors.textSecondary, { duration: 150 });
        beatShadow.value = withTiming(0, { duration: 150 });
      }
    } else if (isActive) {
      beatScale.value = withSequence(
        withTiming(isStrong ? 1.35 : 1.2, { duration: 50, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: 200, easing: Easing.out(Easing.quad) })
      );
      beatBg.value = withTiming(
        isAccent ? C.accent : Colors.text,
        { duration: 50 }
      );
      beatBorder.value = withTiming(isStrong ? C.accent : "transparent", { duration: 50 });
      beatShadow.value = withSequence(
        withTiming(isStrong ? 1.5 : 1, { duration: 50 }),
        withTiming(0, { duration: 300 })
      );
    } else {
      beatScale.value = withTiming(1, { duration: 150 });
      beatBg.value = withTiming(
        isStrong ? C.accent : isAccent ? C.accentMuted : Colors.textTertiary,
        { duration: 150 }
      );
      beatBorder.value = withTiming(isStrong ? C.accent : "transparent", { duration: 150 });
      beatShadow.value = withTiming(0, { duration: 150 });
    }
  }, [isActive, beatType, C.accent, C.accentMuted]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: beatScale.value * popScale.value }],
    backgroundColor: beatBg.value,
    borderColor: beatBorder.value,
    shadowOpacity: beatShadow.value,
  }));

  return (
    <Pressable
      onPress={handlePress}
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: size,
        height: size,
        zIndex: 10,
      }}
      hitSlop={10}
      pressRetentionOffset={{ top: 20, left: 20, right: 20, bottom: 20 }}
    >
      {isStrong ? (
        <Animated.View
          style={[
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              overflow: "hidden",
              opacity: isActive ? 1 : 0.65,
            },
            animatedStyle,
            {
              shadowColor: C.accent,
              shadowOffset: { width: 0, height: 0 },
              shadowRadius: isActive ? 16 : 0,
            },
          ]}
        >
          <LinearGradient
            colors={[Colors.white, C.accent, C.accentMuted]}
            locations={[0, 0.35, 1]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={{ width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center" }}
          >
            <View style={{ width: size - 14, height: size - 14, borderRadius: (size - 14) / 2, backgroundColor: C.accentMuted }} />
          </LinearGradient>
        </Animated.View>
      ) : (
        <Animated.View
          style={[
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: isMute
                ? "transparent"
                : isAccent
                ? C.accentMuted
                : Colors.textTertiary,
              borderWidth: isMute ? 2.5 : 0,
              borderColor: isMute ? Colors.textSecondary : "transparent",
            },
            animatedStyle,
            {
              shadowColor: isAccent ? C.accent : Colors.text,
              shadowOffset: { width: 0, height: 0 },
              shadowRadius: isActive ? 16 : 0,
            },
          ]}
        />
      )}
      {isDropTarget && (
        <View
          style={[
            styles.dropTargetRing,
            {
              width: size + 12,
              height: size + 12,
              borderRadius: (size + 12) / 2,
              top: -6,
              left: -6,
              borderColor: C.accent,
            },
          ]}
        />
      )}
      {subdivisionCount > 1 && (
        <View style={[styles.subdivBadge, { borderColor: C.accent }]}>
          <Text style={[styles.subdivBadgeText, { color: C.accent }]}>{subdivisionCount}</Text>
        </View>
      )}
    </Pressable>
  );
}

export interface BarRepeat {
  type: "count" | "duration";
  value: number;
}

interface BeatIndicatorProps {
  beatsPerMeasure: number;
  currentBeat: number;
  isPlaying: boolean;
  onBeatsChange: (beats: number) => void;
  onTogglePlay: () => void;
  beatTypes: BeatType[];
  onBeatTypeChange: (index: number, type: BeatType) => void;
  dropTargetBeat: number | null;
  beatSubdivisionCounts: Record<number, number>;
  dialRef?: React.RefObject<View | null>;
  barMode: boolean;
  onBarModeChange: (mode: boolean) => void;
  beatSubdivisions: Record<string, BeatType[]>;
  onBeatSubdivisionChange: (beatIndex: number, pattern: BeatType[] | null) => void;
  activeSubNote: number;
  barAreaRef?: React.RefObject<View | null>;
  barRepeats: Record<number, BarRepeat>;
  onBarRepeatChange: (beat: number, repeat: BarRepeat | null) => void;
  barLoopMode: "loop" | "once";
  onBarLoopModeChange: (mode: "loop" | "once") => void;
}

export function BeatIndicator({
  beatsPerMeasure,
  currentBeat,
  isPlaying,
  onBeatsChange,
  onTogglePlay,
  beatTypes,
  onBeatTypeChange,
  dropTargetBeat,
  beatSubdivisionCounts,
  dialRef,
  barMode,
  onBarModeChange,
  beatSubdivisions,
  onBeatSubdivisionChange,
  activeSubNote,
  barAreaRef,
  barRepeats,
  onBarRepeatChange,
  barLoopMode,
  onBarLoopModeChange,
}: BeatIndicatorProps) {
  const { colors: C } = useTheme();
  const beats = Array.from({ length: beatsPerMeasure }, (_, i) => i);

  const swipeProgress = useSharedValue(0);
  const swipeDirection = useSharedValue(0);
  const dialRotation = useSharedValue(0);
  const centerGlow = useSharedValue(0);
  const prevBeatRef = useRef(-1);

  useEffect(() => {
    if (isPlaying && currentBeat >= 0 && currentBeat !== prevBeatRef.current) {
      prevBeatRef.current = currentBeat;
      centerGlow.value = withSequence(
        withTiming(1, { duration: 60, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 500, easing: Easing.out(Easing.cubic) })
      );
    } else if (!isPlaying) {
      prevBeatRef.current = -1;
      centerGlow.value = withTiming(0, { duration: 200 });
    }
  }, [isPlaying, currentBeat]);

  const startXRef = useRef(0);
  const isDraggingRef = useRef(false);
  const triggeredRef = useRef(false);
  const beatsRef = useRef(beatsPerMeasure);
  const onBeatsChangeRef = useRef(onBeatsChange);
  const containerRef = useRef<View>(null);

  useEffect(() => {
    beatsRef.current = beatsPerMeasure;
  }, [beatsPerMeasure]);
  useEffect(() => {
    onBeatsChangeRef.current = onBeatsChange;
  }, [onBeatsChange]);

  const resetVisuals = useCallback(() => {
    swipeProgress.value = withTiming(0, { duration: 200 });
    swipeDirection.value = 0;
    dialRotation.value = withSpring(0, { damping: 15, stiffness: 300 });
  }, []);

  const processMoveByDx = useCallback((dx: number) => {
    const progress = Math.min(Math.abs(dx) / SWIPE_THRESHOLD, 1);
    const canAdd = beatsRef.current < MAX_BEATS;
    const canRemove = beatsRef.current > MIN_BEATS;

    dialRotation.value = dx * -0.08;

    if (dx < 0 && canAdd) {
      swipeDirection.value = -1;
      swipeProgress.value = progress;
    } else if (dx > 0 && canRemove) {
      swipeDirection.value = 1;
      swipeProgress.value = progress;
    } else {
      swipeDirection.value = 0;
      swipeProgress.value = 0;
    }

    if (progress >= 1 && !triggeredRef.current) {
      triggeredRef.current = true;
      if (dx < 0 && canAdd) {
        if (Platform.OS !== "web") {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
        onBeatsChangeRef.current(beatsRef.current + 1);
      } else if (dx > 0 && canRemove) {
        if (Platform.OS !== "web") {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
        onBeatsChangeRef.current(beatsRef.current - 1);
      }
    }
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") return;

    const handleMouseDown = (e: MouseEvent) => {
      startXRef.current = e.clientX;
      isDraggingRef.current = true;
      triggeredRef.current = false;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      processMoveByDx(e.clientX - startXRef.current);
    };

    const handleMouseUp = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      resetVisuals();
    };

    const node = containerRef.current as any;
    if (!node) return;

    const el = node as unknown as HTMLElement;
    if (!el || !el.addEventListener) return;

    el.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      el.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [processMoveByDx, resetVisuals]);

  const panResponder = useRef(
    Platform.OS !== "web"
      ? PanResponder.create({
          onStartShouldSetPanResponder: () => false,
          onStartShouldSetPanResponderCapture: () => false,
          onMoveShouldSetPanResponder: (_, gs) =>
            Math.abs(gs.dx) > 20 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5,
          onMoveShouldSetPanResponderCapture: () => false,
          onShouldBlockNativeResponder: () => false,
          onPanResponderGrant: () => {
            triggeredRef.current = false;
          },
          onPanResponderMove: (_, gs) => {
            processMoveByDx(gs.dx);
          },
          onPanResponderRelease: () => {
            resetVisuals();
          },
          onPanResponderTerminate: () => {
            resetVisuals();
          },
          onPanResponderTerminationRequest: () => true,
        })
      : null
  ).current;

  const dialStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${dialRotation.value}deg` }],
  }));

  const centerGlowStyle = useAnimatedStyle(() => ({
    opacity: centerGlow.value * 0.7,
    transform: [{ scale: 1 + centerGlow.value * 0.3 }],
  }));

  const isAccentBeat = isPlaying && currentBeat === 0;

  const nativePanHandlers =
    Platform.OS !== "web" && panResponder ? panResponder.panHandlers : {};

  const cycleBeatType = useCallback(
    (index: number) => {
      const current = beatTypes[index] || "normal";
      let next: BeatType;
      if (current === "strong") {
        next = "accent";
      } else if (current === "accent") {
        next = "normal";
      } else if (current === "normal") {
        next = "mute";
      } else {
        next = "strong";
      }
      if (Platform.OS !== "web") {
        Haptics.impactAsync(
          next === "strong"
            ? Haptics.ImpactFeedbackStyle.Heavy
            : next === "accent"
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
    const pattern = beatSubdivisions[String(beatIndex)];
    if (!pattern || pattern.length <= 1) {
      cycleBeatType(beatIndex);
      return;
    }
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
  }, [isPlaying, beatSubdivisions, onBeatSubdivisionChange, cycleBeatType]);

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

  const BAR_HEIGHT = 36;
  const BAR_LINE_COLOR = Colors.textSecondary;
  const [barContainerHeight, setBarContainerHeight] = useState(0);
  const barGap = 18;
  const rowH = BAR_HEIGHT + 1 + barGap;
  const centerPad = Math.max(0, (barContainerHeight - BAR_HEIGHT) / 2);
  const copyHeight = beatsPerMeasure * rowH;
  const [activeCopy, setActiveCopy] = useState(2);
  const activeCopyRef = useRef(2);
  const barPrevBeatRef = useRef(-1);

  const NUM_COPIES = 5;
  const CENTER_COPY = 2;

  useEffect(() => {
    if (!isPlaying) {
      activeCopyRef.current = CENTER_COPY;
      setActiveCopy(CENTER_COPY);
      barPrevBeatRef.current = -1;
      if (barMode && barContainerHeight > 0) {
        const initTarget = Math.max(0, centerPad + CENTER_COPY * copyHeight - barContainerHeight / 2 + BAR_HEIGHT / 2);
        barScrollRef.current?.scrollTo({ y: initTarget, animated: false });
      }
    }
  }, [isPlaying, barMode, barContainerHeight, centerPad, copyHeight]);

  useEffect(() => {
    if (!barMode || !isPlaying || currentBeat < 0) return;
    if (barContainerHeight <= 0 || copyHeight <= 0) return;

    const prev = barPrevBeatRef.current;
    barPrevBeatRef.current = currentBeat;

    if (prev >= 0 && currentBeat < prev) {
      activeCopyRef.current++;
      setActiveCopy(activeCopyRef.current);
    }

    if (activeCopyRef.current > CENTER_COPY && currentBeat > 0) {
      activeCopyRef.current = CENTER_COPY;
      setActiveCopy(CENTER_COPY);
      const snapTop = centerPad + CENTER_COPY * copyHeight + (currentBeat - 1) * rowH;
      const snapTarget = Math.max(0, snapTop - barContainerHeight / 2 + BAR_HEIGHT / 2);
      barScrollRef.current?.scrollTo({ y: snapTarget, animated: false });
    }

    const beatTop = centerPad + activeCopyRef.current * copyHeight + currentBeat * rowH;
    const scrollTarget = Math.max(0, beatTop - barContainerHeight / 2 + BAR_HEIGHT / 2);
    barScrollRef.current?.scrollTo({ y: scrollTarget, animated: true });
  }, [barMode, isPlaying, currentBeat, beatsPerMeasure, barContainerHeight, centerPad, rowH, copyHeight]);

  if (barMode) {
    const isDropping = dropTargetBeat !== null;
    const renderBarRow = (beat: number, copyIndex: number) => {
      const pattern = beatSubdivisions[String(beat)] || [beatTypes[beat] || "normal"];
      const isCurrent = isPlaying && currentBeat === beat && copyIndex === activeCopy;
      const bType = beatTypes[beat] || "normal";
      const isDropTarget = isDropping && (dropTargetBeat === beat || dropTargetBeat === -1);
      const repeat = barRepeats[beat];
      const isPrimary = copyIndex === 1;
      return (
        <Pressable
          key={`bar-${copyIndex}-${beat}`}
          onLongPress={() => { if (isPrimary && !isPlaying) openRepeatModal(beat); }}
          delayLongPress={500}
          onPress={() => { if (isPrimary) cycleBeatType(beat); }}
          style={[
            styles.barBeatWrapper,
            isCurrent && styles.barBeatWrapperActive,
            isPrimary && isDropTarget && { backgroundColor: "rgba(255,255,255,0.06)", borderColor: C.accent, borderWidth: 1, borderRadius: 4, marginHorizontal: -1 },
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
                  onPress={(e) => { e.stopPropagation(); if (isPrimary) handleBarCellPress(beat, ci); }}
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
            onPress={(e) => { e.stopPropagation(); if (isPrimary && !isPlaying) openRepeatModal(beat); }}
            style={styles.barRepeatBadge}
            hitSlop={6}
          >
            <Text style={[styles.barRepeatText, { color: repeat ? C.accent : Colors.textTertiary }]}>
              {repeat ? formatRepeat(repeat) : "\u00D71"}
            </Text>
          </Pressable>
        </Pressable>
      );
    };
    const allBarRows: React.ReactNode[] = [];
    for (let copy = 0; copy < NUM_COPIES; copy++) {
      for (const beat of beats) {
        allBarRows.push(renderBarRow(beat, copy));
      }
    }

    return (
      <View style={styles.barModeContainer} testID="beat-indicator-bar-mode">
        <View style={styles.barTopRowCenter}>
          <Pressable
            onPress={() => onBarModeChange(false)}
            style={styles.barModeCloseBtn}
            testID="close-bar-mode"
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Close bar mode"
          >
            <Ionicons name="close" size={18} color={Colors.textTertiary} />
          </Pressable>
        </View>

        <View
          ref={barAreaRef}
          style={styles.barMeasureOuter}
          onLayout={(e) => setBarContainerHeight(e.nativeEvent.layout.height)}
        >
          <ScrollView
            ref={barScrollRef}
            style={styles.barScrollView}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            contentOffset={{ x: 0, y: centerPad + copyHeight - barContainerHeight / 2 + BAR_HEIGHT / 2 }}
            scrollEnabled={!isPlaying}
          >
            <View style={[styles.barMeasureInner, { paddingTop: centerPad, paddingBottom: centerPad, gap: barGap }]}>{allBarRows}</View>
          </ScrollView>
        </View>

        <View style={styles.barBottomRow}>
          <Pressable
            onPress={() => onBarLoopModeChange(barLoopMode === "loop" ? "once" : "loop")}
            style={[styles.barLoopBtn, barLoopMode === "once" && { backgroundColor: "rgba(255,255,255,0.12)" }]}
            hitSlop={6}
            testID="bar-loop-toggle"
          >
            <Ionicons
              name={barLoopMode === "loop" ? "repeat" : "play-forward"}
              size={18}
              color={barLoopMode === "loop" ? C.accent : Colors.textSecondary}
            />
          </Pressable>
          <View style={styles.barTimeSigRow}>
            <Pressable
              onPress={() => { if (!isPlaying && beatsPerMeasure > MIN_BEATS) { onBeatsChange(beatsPerMeasure - 1); if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } }}
              style={[styles.barTimeSigBtn, (isPlaying || beatsPerMeasure <= MIN_BEATS) && { opacity: 0.3 }]}
              hitSlop={8}
            >
              <Ionicons name="remove" size={16} color={Colors.textSecondary} />
            </Pressable>
            <Text style={styles.hintText}>
              {beatsPerMeasure}/{beatsPerMeasure <= 4 ? "4" : "8"}
            </Text>
            <Pressable
              onPress={() => { if (!isPlaying && beatsPerMeasure < MAX_BEATS) { onBeatsChange(beatsPerMeasure + 1); if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } }}
              style={[styles.barTimeSigBtn, (isPlaying || beatsPerMeasure >= MAX_BEATS) && { opacity: 0.3 }]}
              hitSlop={8}
            >
              <Ionicons name="add" size={16} color={Colors.textSecondary} />
            </Pressable>
          </View>
          <Pressable
            onPress={onTogglePlay}
            style={({ pressed }) => [
              styles.barPlayBtn,
              pressed && { opacity: 0.7 },
            ]}
            testID="bar-play-button"
          >
            <Ionicons
              name={isPlaying ? "stop" : "play"}
              size={22}
              color={isPlaying ? Colors.danger : C.accent}
              style={!isPlaying ? { marginLeft: 2 } : undefined}
            />
          </Pressable>
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

  return (
    <View
      ref={containerRef}
      style={styles.touchArea}
      testID="beat-indicator-swipe"
      {...nativePanHandlers}
    >
      <View style={styles.dialContainer}>
        <View
          ref={dialRef}
          style={{ width: DIAL_SIZE, height: DIAL_SIZE }}
          collapsable={false}
        >
          <Animated.View style={[styles.dial, dialStyle]}>
            {beats.map((beat) => (
              <DialBeatDot
                key={`beat-${beat}`}
                index={beat}
                total={beatsPerMeasure}
                isActive={isPlaying && currentBeat === beat}
                beatType={beatTypes[beat] || "normal"}
                onPress={() => cycleBeatType(beat)}
                isDropTarget={dropTargetBeat === beat || dropTargetBeat === -1}
                subdivisionCount={beatSubdivisionCounts[beat] || 0}
              />
            ))}
          </Animated.View>
        </View>

        <View style={styles.centerArea} pointerEvents="box-none">
          <View style={styles.signatureRow} pointerEvents="none">
            <Text style={styles.digitalSignature} numberOfLines={1}>
              {beatsPerMeasure}
            </Text>
            <Text style={styles.digitalSignatureSlash} numberOfLines={1}>
              /
            </Text>
            <Text style={styles.digitalSignature} numberOfLines={1}>
              {beatsPerMeasure <= 4 ? "4" : "8"}
            </Text>
          </View>

          <Animated.View
            style={[
              styles.centerGlow,
              {
                backgroundColor: isAccentBeat ? C.accent : Colors.text,
              },
              centerGlowStyle,
            ]}
            pointerEvents="none"
          />

          {dropTargetBeat === -1 && (
            <View style={[styles.centerDropRing, { borderColor: C.accent }]} pointerEvents="none" />
          )}

          <Pressable
            onPress={onTogglePlay}
            style={({ pressed }) => [
              styles.playButton,
              pressed && styles.playButtonPressed,
            ]}
            testID="play-button"
          >
            <Ionicons
              name={isPlaying ? "stop" : "play"}
              size={56}
              color={isPlaying ? Colors.danger : C.accent}
              style={!isPlaying ? { marginLeft: 5 } : undefined}
            />
          </Pressable>

          {dropTargetBeat === -1 && (
            <Text style={[styles.centerDropLabel, { color: C.accent }]}>ALL</Text>
          )}
        </View>
      </View>

      <Pressable
        onPress={() => onBarModeChange(true)}
        style={styles.barModeHandle}
        testID="open-bar-mode"
        hitSlop={{ top: 10, bottom: 10, left: 20, right: 20 }}
        accessibilityRole="button"
        accessibilityLabel="Open bar mode"
      >
        <Ionicons name="chevron-up" size={18} color={Colors.textTertiary} />
      </Pressable>

      <Text style={styles.hintText}>swipe to add or remove beats</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  touchArea: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    cursor: "grab" as any,
    userSelect: "none" as any,
  },
  dialContainer: {
    width: DIAL_SIZE,
    height: DIAL_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  dial: {
    width: DIAL_SIZE,
    height: DIAL_SIZE,
    borderRadius: DIAL_RADIUS,
  },
  centerArea: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  signatureRow: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  digitalSignature: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 83,
    color: Colors.textTertiary,
    opacity: 0.15,
  },
  digitalSignatureSlash: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 70,
    color: Colors.textTertiary,
    opacity: 0.15,
    marginHorizontal: -2,
  },
  centerGlow: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    opacity: 0,
  },
  playButton: {
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
  },
  playButtonPressed: {
    transform: [{ scale: 0.85 }],
    opacity: 0.6,
  },
  hintText: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 11,
    color: Colors.textTertiary,
    letterSpacing: 1,
    opacity: 0.5,
  },
  dropTargetRing: {
    position: "absolute",
    borderWidth: 2,
    borderColor: Colors.accent,
    borderStyle: "dashed" as any,
    opacity: 0.8,
  },
  subdivBadge: {
    position: "absolute",
    bottom: -4,
    right: -4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  subdivBadgeText: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 9,
    color: Colors.accent,
  },
  centerDropRing: {
    position: "absolute",
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 2,
    borderColor: Colors.accent,
    borderStyle: "dashed" as any,
    opacity: 0.8,
  },
  centerDropLabel: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 11,
    color: Colors.accent,
    letterSpacing: 2,
    marginTop: 8,
    opacity: 0.9,
  },
  barModeContainer: {
    flex: 1,
    width: "100%" as any,
  },
  barTopRowCenter: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
  },
  barBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    gap: 16,
  },
  barModeCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  barPlayBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  barLoopBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  barTimeSigRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  barTimeSigBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  barMeasureInner: {
    flex: 1,
    gap: 0,
  },
  barBeatWrapper: {
    flexDirection: "row",
    alignItems: "stretch",
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
  barMeasureOuter: {
    flex: 1,
    flexShrink: 1,
    width: "100%" as any,
    paddingHorizontal: 0,
  },
  barScrollView: {
    flexGrow: 0,
  },
  barScrollFade: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 20,
    backgroundColor: "transparent",
  },
  barBeatWrapperActive: {
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  barModeHandle: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 24,
    minWidth: 80,
    minHeight: 36,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 12,
  },
});
