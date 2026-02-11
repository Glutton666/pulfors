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
import Colors from "@/constants/colors";

export type BeatType = "accent" | "normal" | "mute";

const SCREEN_WIDTH = Dimensions.get("window").width;
const DIAL_SIZE = Math.min(SCREEN_WIDTH - 48, 300);
const DIAL_RADIUS = DIAL_SIZE / 2;
const DOT_RADIUS_FROM_CENTER = DIAL_RADIUS - 30;
const DOT_SIZE = 32;
const ACCENT_DOT_SIZE = 38;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.35;
const MIN_BEATS = 1;
const MAX_BEATS = 12;

interface DialBeatDotProps {
  index: number;
  total: number;
  isActive: boolean;
  beatType: BeatType;
  onPress: () => void;
}

function DialBeatDot({ index, total, isActive, beatType, onPress }: DialBeatDotProps) {
  const isAccent = beatType === "accent";
  const isMute = beatType === "mute";
  const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
  const size = isAccent ? ACCENT_DOT_SIZE : DOT_SIZE;
  const x = DIAL_RADIUS + DOT_RADIUS_FROM_CENTER * Math.cos(angle) - size / 2;
  const y = DIAL_RADIUS + DOT_RADIUS_FROM_CENTER * Math.sin(angle) - size / 2;

  const popScale = useSharedValue(1);

  const handlePress = useCallback(() => {
    popScale.value = withSequence(
      withTiming(0.6, { duration: 60 }),
      withSpring(1.15, { damping: 8, stiffness: 400 }),
      withTiming(1, { duration: 150 })
    );
    onPress();
  }, [onPress]);

  const animatedStyle = useAnimatedStyle(() => {
    const baseScale = popScale.value;

    if (isMute) {
      if (isActive) {
        return {
          transform: [
            {
              scale: baseScale * withSequence(
                withTiming(1.3, { duration: 50, easing: Easing.out(Easing.quad) }),
                withTiming(1, { duration: 250, easing: Easing.out(Easing.elastic(1.5)) })
              ),
            },
          ],
          borderColor: withTiming(Colors.textTertiary, { duration: 50 }),
          shadowOpacity: withSequence(
            withTiming(0.5, { duration: 50 }),
            withTiming(0, { duration: 400 })
          ),
        };
      }
      return {
        transform: [{ scale: baseScale }],
        borderColor: withTiming(Colors.textTertiary, { duration: 200 }),
        shadowOpacity: withTiming(0, { duration: 200 }),
      };
    }

    if (isActive) {
      return {
        transform: [
          {
            scale: baseScale * withSequence(
              withTiming(1.3, { duration: 50, easing: Easing.out(Easing.quad) }),
              withTiming(1, { duration: 250, easing: Easing.out(Easing.elastic(1.5)) })
            ),
          },
        ],
        backgroundColor: withTiming(
          isAccent ? Colors.accent : Colors.text,
          { duration: 50 }
        ),
        shadowOpacity: withSequence(
          withTiming(1, { duration: 50 }),
          withTiming(0, { duration: 400 })
        ),
      };
    }
    return {
      transform: [{ scale: baseScale }],
      backgroundColor: withTiming(
        isAccent ? Colors.accentMuted : Colors.textTertiary,
        { duration: 200 }
      ),
      shadowOpacity: withTiming(0, { duration: 200 }),
    };
  }, [isActive, beatType]);

  return (
    <Pressable
      onPress={handlePress}
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: size,
        height: size,
      }}
      hitSlop={6}
    >
      <Animated.View
        style={[
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: isMute ? "transparent" : (isAccent ? Colors.accentMuted : Colors.textTertiary),
            borderWidth: isMute ? 2.5 : 0,
            borderColor: isMute ? Colors.textTertiary : "transparent",
          },
          animatedStyle,
          {
            shadowColor: isAccent ? Colors.accent : Colors.text,
            shadowOffset: { width: 0, height: 0 },
            shadowRadius: isActive ? 20 : 0,
          },
        ]}
      />
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
}

export function BeatIndicator({
  beatsPerMeasure,
  currentBeat,
  isPlaying,
  onBeatsChange,
  onTogglePlay,
  beatTypes,
  onBeatTypeChange,
}: BeatIndicatorProps) {
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

  useEffect(() => { beatsRef.current = beatsPerMeasure; }, [beatsPerMeasure]);
  useEffect(() => { onBeatsChangeRef.current = onBeatsChange; }, [onBeatsChange]);

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
          onStartShouldSetPanResponder: () => true,
          onMoveShouldSetPanResponder: () => true,
          onPanResponderGrant: (e) => {
            startXRef.current = e.nativeEvent.pageX;
            isDraggingRef.current = true;
            triggeredRef.current = false;
          },
          onPanResponderMove: (e) => {
            processMove(e.nativeEvent.pageX);
          },
          onPanResponderRelease: () => {
            isDraggingRef.current = false;
            resetVisuals();
          },
          onPanResponderTerminate: () => {
            isDraggingRef.current = false;
            resetVisuals();
          },
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

  const nativePanHandlers = Platform.OS !== "web" && panResponder ? panResponder.panHandlers : {};

  const cycleBeatType = useCallback((index: number) => {
    const current = beatTypes[index] || "normal";
    let next: BeatType;
    if (current === "accent") {
      next = "normal";
    } else if (current === "normal") {
      next = "mute";
    } else {
      next = "accent";
    }
    if (Platform.OS !== "web") {
      Haptics.impactAsync(
        next === "accent"
          ? Haptics.ImpactFeedbackStyle.Heavy
          : next === "mute"
          ? Haptics.ImpactFeedbackStyle.Light
          : Haptics.ImpactFeedbackStyle.Medium
      );
    }
    onBeatTypeChange(index, next);
  }, [beatTypes, onBeatTypeChange]);

  return (
    <View
      ref={containerRef}
      style={styles.touchArea}
      testID="beat-indicator-swipe"
      {...nativePanHandlers}
    >
      <View style={styles.dialContainer}>
        <Animated.View style={[styles.dial, dialStyle]}>
          {beats.map((beat) => (
            <DialBeatDot
              key={`beat-${beat}`}
              index={beat}
              total={beatsPerMeasure}
              isActive={isPlaying && currentBeat === beat}
              beatType={beatTypes[beat] || "normal"}
              onPress={() => cycleBeatType(beat)}
            />
          ))}
        </Animated.View>

        <View style={styles.centerArea} pointerEvents="box-none">
          <Text style={styles.digitalSignature}>
            {beatsPerMeasure}/{beatsPerMeasure <= 4 ? "4" : "8"}
          </Text>

          <Animated.View
            style={[
              styles.centerGlow,
              { backgroundColor: isAccentBeat ? Colors.accent : Colors.text },
              centerGlowStyle,
            ]}
            pointerEvents="none"
          />

          <Pressable
            onPress={onTogglePlay}
            style={({ pressed }) => [
              styles.playButton,
              pressed && styles.playButtonPressed,
            ]}
            testID="play-button"
          >
            <Ionicons
              name={isPlaying ? "stop-outline" : "play-outline"}
              size={56}
              color={isPlaying ? Colors.danger : Colors.accent}
              style={[
                { fontWeight: "900" as const },
                !isPlaying ? { marginLeft: 5 } : undefined,
              ]}
            />
          </Pressable>
        </View>
      </View>

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
  digitalSignature: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 128,
    color: Colors.textTertiary,
    letterSpacing: 4,
    opacity: 0.15,
    position: "absolute",
  },
  centerGlow: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    opacity: 0,
  },
  playButton: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 4,
    borderColor: Colors.accent,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  playButtonPressed: {
    transform: [{ scale: 0.92 }],
    opacity: 0.7,
  },
  hintText: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 11,
    color: Colors.textTertiary,
    letterSpacing: 1,
    opacity: 0.5,
  },
});
