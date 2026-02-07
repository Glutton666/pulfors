import React, { useRef, useEffect, useCallback, useMemo } from "react";
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
  isAccent: boolean;
}

function DialBeatDot({ index, total, isActive, isAccent }: DialBeatDotProps) {
  const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
  const x = DIAL_RADIUS + DOT_RADIUS_FROM_CENTER * Math.cos(angle) - (isAccent ? ACCENT_DOT_SIZE : DOT_SIZE) / 2;
  const y = DIAL_RADIUS + DOT_RADIUS_FROM_CENTER * Math.sin(angle) - (isAccent ? ACCENT_DOT_SIZE : DOT_SIZE) / 2;

  const animatedStyle = useAnimatedStyle(() => {
    if (isActive) {
      return {
        transform: [
          {
            scale: withSequence(
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
      transform: [{ scale: withTiming(1, { duration: 200 }) }],
      backgroundColor: withTiming(Colors.textTertiary, { duration: 200 }),
      shadowOpacity: withTiming(0, { duration: 200 }),
    };
  }, [isActive, isAccent]);

  const size = isAccent ? ACCENT_DOT_SIZE : DOT_SIZE;

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          left: x,
          top: y,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: Colors.textTertiary,
        },
        animatedStyle,
        {
          shadowColor: isAccent ? Colors.accent : Colors.text,
          shadowOffset: { width: 0, height: 0 },
          shadowRadius: isActive ? 20 : 0,
        },
      ]}
    />
  );
}

interface BeatIndicatorProps {
  beatsPerMeasure: number;
  currentBeat: number;
  isPlaying: boolean;
  onBeatsChange: (beats: number) => void;
  onTogglePlay: () => void;
}

export function BeatIndicator({
  beatsPerMeasure,
  currentBeat,
  isPlaying,
  onBeatsChange,
  onTogglePlay,
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
              isAccent={beat === 0}
            />
          ))}

        </Animated.View>

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
            styles.centerHub,
            isPlaying && styles.centerHubActive,
            pressed && styles.centerHubPressed,
          ]}
          testID="play-button"
        >
          <Ionicons
            name={isPlaying ? "stop" : "play"}
            size={28}
            color={isPlaying ? Colors.background : Colors.background}
            style={!isPlaying ? { marginLeft: 3, marginBottom: 2 } : { marginBottom: 2 }}
          />
          <Text style={styles.signatureText}>
            {beatsPerMeasure}/{beatsPerMeasure <= 4 ? "4" : "8"}
          </Text>
        </Pressable>
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
  centerGlow: {
    position: "absolute",
    width: 100,
    height: 100,
    borderRadius: 50,
    opacity: 0,
  },
  centerHub: {
    position: "absolute",
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
  },
  centerHubActive: {
    backgroundColor: Colors.danger,
  },
  centerHubPressed: {
    transform: [{ scale: 0.92 }],
    opacity: 0.9,
  },
  signatureText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 9,
    color: Colors.background,
    letterSpacing: 1,
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
