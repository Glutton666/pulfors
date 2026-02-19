import React, { useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  Dimensions,
  PanResponder,
  Pressable,
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

  const processMove = useCallback((clientX: number) => {
    const dx = clientX - startXRef.current;
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
      processMove(e.clientX);
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
  }, [processMove, resetVisuals]);

  const panResponder = useRef(
    Platform.OS !== "web"
      ? PanResponder.create({
          onStartShouldSetPanResponder: () => false,
          onStartShouldSetPanResponderCapture: () => false,
          onMoveShouldSetPanResponder: (_, gs) =>
            Math.abs(gs.dx) > 30 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5,
          onMoveShouldSetPanResponderCapture: () => false,
          onShouldBlockNativeResponder: () => false,
          onPanResponderGrant: (e) => {
            startXRef.current = e.nativeEvent.pageX;
            triggeredRef.current = false;
          },
          onPanResponderMove: (e) => {
            processMove(e.nativeEvent.pageX);
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

  const modeHandleResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dy) > 20 && Math.abs(gs.dy) > Math.abs(gs.dx) * 1.5,
      onPanResponderRelease: (_, gs) => {
        if (gs.dy < -40) {
          onBarModeChange(true);
          if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        } else if (gs.dy > 40) {
          onBarModeChange(false);
          if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
      },
    })
  ).current;

  const barSwipeStartRef = useRef({ x: 0, y: 0 });
  const barSwipeTriggeredRef = useRef(false);

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

  const barPanResponders = useRef<Record<number, ReturnType<typeof PanResponder.create>>>({});

  const getBarPanResponder = useCallback((beatIndex: number) => {
    if (!barPanResponders.current[beatIndex]) {
      barPanResponders.current[beatIndex] = PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gs) =>
          (Math.abs(gs.dx) > 25 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5) ||
          (gs.dy > 25 && Math.abs(gs.dy) > Math.abs(gs.dx) * 1.5),
        onPanResponderGrant: (e) => {
          barSwipeStartRef.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
          barSwipeTriggeredRef.current = false;
        },
        onPanResponderRelease: (_, gs) => {
          if (barSwipeTriggeredRef.current) return;
          barSwipeTriggeredRef.current = true;
          if (Math.abs(gs.dx) > Math.abs(gs.dy)) {
            const currentPattern = beatSubdivisions[String(beatIndex)] || ["normal"];
            if (gs.dx > 30 && currentPattern.length < 8) {
              const newPattern = [...currentPattern, "normal" as BeatType];
              onBeatSubdivisionChange(beatIndex, newPattern);
              if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            } else if (gs.dx < -30 && currentPattern.length > 1) {
              const newPattern = currentPattern.slice(0, -1);
              onBeatSubdivisionChange(beatIndex, newPattern.length <= 1 ? null : newPattern);
              if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }
          } else if (gs.dy > 30) {
            if (beatsPerMeasure < MAX_BEATS) {
              onBeatsChange(beatsPerMeasure + 1);
              if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            }
          }
        },
      });
    }
    return barPanResponders.current[beatIndex];
  }, [beatSubdivisions, onBeatSubdivisionChange, beatsPerMeasure, onBeatsChange]);

  useEffect(() => {
    barPanResponders.current = {};
  }, [beatSubdivisions, beatsPerMeasure]);

  if (barMode) {
    return (
      <View style={styles.barModeContainer} testID="beat-indicator-bar-mode">
        <View style={styles.barModeHeader}>
          <View style={[styles.signatureRow, { position: "relative" }]}>
            <Text style={[styles.digitalSignature, { fontSize: 40, opacity: 0.25 }]} numberOfLines={1}>
              {beatsPerMeasure}
            </Text>
            <Text style={[styles.digitalSignatureSlash, { fontSize: 34, opacity: 0.25 }]} numberOfLines={1}>
              /
            </Text>
            <Text style={[styles.digitalSignature, { fontSize: 40, opacity: 0.25 }]} numberOfLines={1}>
              {beatsPerMeasure <= 4 ? "4" : "8"}
            </Text>
          </View>
          <Pressable
            onPress={onTogglePlay}
            style={({ pressed }) => [
              styles.barPlayButton,
              pressed && styles.playButtonPressed,
            ]}
            testID="bar-play-button"
          >
            <Ionicons
              name={isPlaying ? "stop" : "play"}
              size={36}
              color={isPlaying ? Colors.danger : C.accent}
              style={!isPlaying ? { marginLeft: 3 } : undefined}
            />
          </Pressable>
        </View>

        <View style={styles.barsList}>
          {beats.map((beat) => {
            const pattern = beatSubdivisions[String(beat)] || [beatTypes[beat] || "normal"];
            const isCurrent = isPlaying && currentBeat === beat;
            const bType = beatTypes[beat] || "normal";
            const panHandlers = Platform.OS !== "web" ? getBarPanResponder(beat).panHandlers : {};
            return (
              <View key={`bar-${beat}`} style={[styles.barRow, isCurrent && { backgroundColor: Colors.surfaceLight }]} {...panHandlers}>
                <Pressable onPress={() => cycleBeatType(beat)} style={styles.barLabel}>
                  <Text style={[
                    styles.barLabelText,
                    { color: bType === "strong" ? C.accent : bType === "accent" ? C.accentMuted : bType === "mute" ? Colors.textTertiary : Colors.textSecondary }
                  ]}>
                    {beat + 1}
                  </Text>
                </Pressable>
                <View style={styles.barCells}>
                  {pattern.map((type, ci) => {
                    const isActiveCell = isCurrent && ci === activeSubNote;
                    const isStrongType = type === "strong";
                    const isAccentType = type === "accent" || isStrongType;
                    return (
                      <Pressable
                        key={ci}
                        onPress={() => handleBarCellPress(beat, ci)}
                        style={{ flex: 1 }}
                      >
                        {isStrongType ? (
                          <View style={[styles.barCell, { overflow: "hidden", opacity: isActiveCell ? 1 : 0.8 }]}>
                            <LinearGradient
                              colors={[Colors.white, C.accent, C.accentMuted]}
                              locations={[0, 0.35, 1]}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 1, y: 1 }}
                              style={[styles.barCell, { alignItems: "center", justifyContent: "center" }]}
                            >
                              <View style={{ flex: 1, alignSelf: "stretch", margin: 3, borderRadius: 3, backgroundColor: C.accentMuted }} />
                            </LinearGradient>
                          </View>
                        ) : (
                          <View
                            style={[
                              styles.barCell,
                              {
                                backgroundColor: type === "mute"
                                  ? "transparent"
                                  : isAccentType
                                  ? (isActiveCell ? C.accent : C.accentMuted)
                                  : (isActiveCell ? Colors.text : Colors.textTertiary),
                                borderWidth: type === "mute" ? 1.5 : 0,
                                borderColor: type === "mute" ? Colors.textTertiary : "transparent",
                                opacity: isActiveCell ? 1 : 0.8,
                              },
                            ]}
                          />
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </View>

        <Pressable
          onPress={() => onBarModeChange(false)}
          style={styles.barModeHandle}
          testID="close-bar-mode"
          hitSlop={{ top: 10, bottom: 10, left: 20, right: 20 }}
          accessibilityRole="button"
          accessibilityLabel="Close bar mode"
        >
          <Ionicons name="chevron-down" size={18} color={Colors.textTertiary} />
        </Pressable>

        <Text style={[styles.hintText, { marginTop: 4 }]}>swipe cells left/right to adjust  |  swipe down to add beat</Text>
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
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    flex: 1,
  },
  barModeHeader: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  barsList: {
    width: "100%" as any,
    gap: 5,
    paddingHorizontal: 4,
  },
  barRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  barLabel: {
    width: 24,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  barLabelText: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 14,
  },
  barCells: {
    flex: 1,
    flexDirection: "row",
    gap: 4,
  },
  barCell: {
    height: 28,
    borderRadius: 5,
    flex: 1,
  },
  barPlayButton: {
    alignItems: "center",
    justifyContent: "center",
    padding: 6,
    marginTop: 4,
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
