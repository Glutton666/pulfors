import React, { useState, useRef, useEffect, useCallback } from "react";
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
}

const BAR_HEIGHT = 60;
const BAR_WIDTH = SCREEN_WIDTH - 48;
const BAR_SWIPE_THRESHOLD = 50;
const BEAT_BLOCK_SIZE = 28;
const BEAT_BLOCK_GAP = 6;

function BeatCountBar({
  beatsPerMeasure,
  onBeatsChange,
  onDismiss,
}: {
  beatsPerMeasure: number;
  onBeatsChange: (beats: number) => void;
  onDismiss: () => void;
}) {
  const { colors: C } = useTheme();
  const beatsRef = useRef(beatsPerMeasure);
  const onBeatsChangeRef = useRef(onBeatsChange);
  const onDismissRef = useRef(onDismiss);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const triggeredRef = useRef(false);
  const slideOffset = useSharedValue(0);
  const barContainerRef = useRef<View>(null);
  const isDraggingRef = useRef(false);

  useEffect(() => { beatsRef.current = beatsPerMeasure; }, [beatsPerMeasure]);
  useEffect(() => { onBeatsChangeRef.current = onBeatsChange; }, [onBeatsChange]);
  useEffect(() => { onDismissRef.current = onDismiss; }, [onDismiss]);

  const resetSlide = useCallback(() => {
    slideOffset.value = withSpring(0, { damping: 20, stiffness: 300 });
  }, []);

  const processBarMove = useCallback((dx: number, dy: number) => {
    if (dy > BAR_SWIPE_THRESHOLD && Math.abs(dy) > Math.abs(dx) * 1.2 && !triggeredRef.current) {
      triggeredRef.current = true;
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      onDismissRef.current();
      return;
    }

    slideOffset.value = dx * 0.5;

    if (Math.abs(dx) > BAR_SWIPE_THRESHOLD && !triggeredRef.current) {
      triggeredRef.current = true;
      const canAdd = beatsRef.current < MAX_BEATS;
      const canRemove = beatsRef.current > MIN_BEATS;
      if (dx > 0 && canAdd) {
        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onBeatsChangeRef.current(beatsRef.current + 1);
      } else if (dx < 0 && canRemove) {
        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onBeatsChangeRef.current(beatsRef.current - 1);
      }
      setTimeout(() => { triggeredRef.current = false; }, 200);
    }
  }, []);

  const barPanResponder = useRef(
    Platform.OS !== "web"
      ? PanResponder.create({
          onStartShouldSetPanResponder: () => true,
          onMoveShouldSetPanResponder: () => true,
          onPanResponderGrant: (e) => {
            startXRef.current = e.nativeEvent.pageX;
            startYRef.current = e.nativeEvent.pageY;
            triggeredRef.current = false;
          },
          onPanResponderMove: (e) => {
            const dx = e.nativeEvent.pageX - startXRef.current;
            const dy = e.nativeEvent.pageY - startYRef.current;
            processBarMove(dx, dy);
          },
          onPanResponderRelease: () => { resetSlide(); },
          onPanResponderTerminate: () => { resetSlide(); },
        })
      : null
  ).current;

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const el = barContainerRef.current as any as HTMLElement;
    if (!el?.addEventListener) return;

    const handleDown = (e: MouseEvent) => {
      startXRef.current = e.clientX;
      startYRef.current = e.clientY;
      isDraggingRef.current = true;
      triggeredRef.current = false;
    };
    const handleMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      processBarMove(e.clientX - startXRef.current, e.clientY - startYRef.current);
    };
    const handleUp = () => {
      isDraggingRef.current = false;
      resetSlide();
    };
    el.addEventListener("mousedown", handleDown);
    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
    return () => {
      el.removeEventListener("mousedown", handleDown);
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
    };
  }, [processBarMove, resetSlide]);

  const barNativeHandlers = Platform.OS !== "web" && barPanResponder ? barPanResponder.panHandlers : {};

  const slideStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: slideOffset.value }],
  }));

  const blocks = Array.from({ length: beatsPerMeasure }, (_, i) => i);

  return (
    <View
      ref={barContainerRef}
      style={barStyles.wrapper}
      {...barNativeHandlers}
    >
      <Animated.View style={[barStyles.bar, { borderColor: C.accentMuted }, slideStyle]}>
        <View style={barStyles.arrowLeft}>
          <Ionicons name="remove" size={18} color={beatsPerMeasure <= MIN_BEATS ? Colors.textTertiary : C.accent} />
        </View>
        <View style={barStyles.blocksRow}>
          {blocks.map((i) => (
            <View
              key={i}
              style={[
                barStyles.block,
                {
                  backgroundColor: i === 0 ? C.accent : C.accentMuted,
                  width: BEAT_BLOCK_SIZE,
                  height: BEAT_BLOCK_SIZE,
                },
              ]}
            />
          ))}
        </View>
        <View style={barStyles.arrowRight}>
          <Ionicons name="add" size={18} color={beatsPerMeasure >= MAX_BEATS ? Colors.textTertiary : C.accent} />
        </View>
      </Animated.View>
      <View style={barStyles.countRow}>
        <Text style={[barStyles.countText, { color: C.accent }]}>{beatsPerMeasure}</Text>
        <Text style={barStyles.countLabel}> beats</Text>
      </View>
      <View style={barStyles.hintRow}>
        <Ionicons name="chevron-down" size={14} color={Colors.textTertiary} />
        <Text style={barStyles.hintText}>swipe down to close</Text>
      </View>
    </View>
  );
}

const barStyles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    cursor: "grab" as any,
    userSelect: "none" as any,
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: BAR_HEIGHT,
    width: BAR_WIDTH,
    borderRadius: 16,
    borderWidth: 1.5,
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
  },
  arrowLeft: {
    width: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  arrowRight: {
    width: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  blocksRow: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    gap: BEAT_BLOCK_GAP,
    paddingVertical: 4,
  },
  block: {
    borderRadius: 6,
  },
  countRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  countText: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 22,
  },
  countLabel: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  hintRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  hintText: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 11,
    color: Colors.textTertiary,
    letterSpacing: 1,
    opacity: 0.5,
  },
});

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
}: BeatIndicatorProps) {
  const { colors: C } = useTheme();
  const beats = Array.from({ length: beatsPerMeasure }, (_, i) => i);
  const [showBeatBar, setShowBeatBar] = useState(false);

  const swipeProgress = useSharedValue(0);
  const swipeDirection = useSharedValue(0);
  const dialRotation = useSharedValue(0);
  const centerGlow = useSharedValue(0);
  const modeTransition = useSharedValue(1);
  const prevBeatRef = useRef(-1);

  const switchToBeatBar = useCallback(() => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowBeatBar(true);
    modeTransition.value = 0;
    modeTransition.value = withTiming(1, { duration: 250, easing: Easing.out(Easing.quad) });
  }, []);

  const dismissBeatBar = useCallback(() => {
    modeTransition.value = withTiming(0, { duration: 200, easing: Easing.in(Easing.quad) });
    setTimeout(() => {
      setShowBeatBar(false);
      modeTransition.value = 1;
    }, 210);
  }, []);

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
  const startYRef = useRef(0);
  const isDraggingRef = useRef(false);
  const triggeredRef = useRef(false);
  const verticalTriggeredRef = useRef(false);
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

  const processMove = useCallback((clientX: number, clientY: number) => {
    const dx = clientX - startXRef.current;
    const dy = clientY - startYRef.current;

    if (dy < -60 && Math.abs(dy) > Math.abs(dx) * 1.3 && !verticalTriggeredRef.current) {
      verticalTriggeredRef.current = true;
      switchToBeatBar();
      return;
    }

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
  }, [switchToBeatBar]);

  useEffect(() => {
    if (Platform.OS !== "web") return;

    const handleMouseDown = (e: MouseEvent) => {
      startXRef.current = e.clientX;
      startYRef.current = e.clientY;
      isDraggingRef.current = true;
      triggeredRef.current = false;
      verticalTriggeredRef.current = false;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      processMove(e.clientX, e.clientY);
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
            (Math.abs(gs.dx) > 30 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5) ||
            (gs.dy < -30 && Math.abs(gs.dy) > Math.abs(gs.dx) * 1.3),
          onMoveShouldSetPanResponderCapture: () => false,
          onShouldBlockNativeResponder: () => false,
          onPanResponderGrant: (e) => {
            startXRef.current = e.nativeEvent.pageX;
            startYRef.current = e.nativeEvent.pageY;
            triggeredRef.current = false;
            verticalTriggeredRef.current = false;
          },
          onPanResponderMove: (e) => {
            processMove(e.nativeEvent.pageX, e.nativeEvent.pageY);
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

  const dialContainerAnimStyle = useAnimatedStyle(() => ({
    opacity: modeTransition.value,
    transform: [{ scale: 0.95 + modeTransition.value * 0.05 }],
  }));

  const barAnimStyle = useAnimatedStyle(() => ({
    opacity: modeTransition.value,
    transform: [{ translateY: (1 - modeTransition.value) * 30 }],
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

  if (showBeatBar) {
    return (
      <Animated.View style={barAnimStyle}>
        <BeatCountBar
          beatsPerMeasure={beatsPerMeasure}
          onBeatsChange={onBeatsChange}
          onDismiss={dismissBeatBar}
        />
      </Animated.View>
    );
  }

  return (
    <View
      ref={containerRef}
      style={styles.touchArea}
      testID="beat-indicator-swipe"
      {...nativePanHandlers}
    >
      <Animated.View style={dialContainerAnimStyle}>
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
      </Animated.View>

      <View style={styles.swipeUpHintRow}>
        <Ionicons name="chevron-up" size={14} color={Colors.textTertiary} />
        <Text style={styles.hintText}>swipe up for beat bar</Text>
      </View>
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
  swipeUpHintRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
});
