import React, { useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  Dimensions,
  PanResponder,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  withTiming,
  withSequence,
  withSpring,
  withDelay,
  useSharedValue,
  Easing,
  FadeIn,
  FadeOut,
  ZoomIn,
  ZoomOut,
  Layout,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";

const SCREEN_WIDTH = Dimensions.get("window").width;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.35;
const MIN_BEATS = 1;
const MAX_BEATS = 12;

interface BeatDotProps {
  isActive: boolean;
  isAccent: boolean;
}

function BeatDot({ isActive, isAccent }: BeatDotProps) {
  const animatedStyle = useAnimatedStyle(() => {
    if (isActive) {
      return {
        transform: [
          {
            scale: withSequence(
              withTiming(1.5, { duration: 50, easing: Easing.out(Easing.quad) }),
              withTiming(1, { duration: 250, easing: Easing.out(Easing.elastic(1.5)) })
            ),
          },
        ],
        backgroundColor: withTiming(
          isAccent ? Colors.accent : Colors.text,
          { duration: 50 }
        ),
        shadowOpacity: withSequence(
          withTiming(0.8, { duration: 50 }),
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

  return (
    <Animated.View
      style={[
        styles.dot,
        isAccent && styles.accentDot,
        animatedStyle,
        {
          shadowColor: isAccent ? Colors.accent : Colors.text,
          shadowOffset: { width: 0, height: 0 },
          shadowRadius: 10,
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
}

export function BeatIndicator({
  beatsPerMeasure,
  currentBeat,
  isPlaying,
  onBeatsChange,
}: BeatIndicatorProps) {
  const beats = Array.from({ length: beatsPerMeasure }, (_, i) => i);

  const swipeProgress = useSharedValue(0);
  const swipeDirection = useSharedValue(0);
  const ghostOpacity = useSharedValue(0);
  const ghostScale = useSharedValue(0.3);
  const ghostTranslateX = useSharedValue(20);
  const removeOpacity = useSharedValue(1);
  const removeScale = useSharedValue(1);
  const removeTranslateX = useSharedValue(0);
  const rowTranslateX = useSharedValue(0);

  const startXRef = useRef(0);
  const isDraggingRef = useRef(false);
  const triggeredRef = useRef(false);
  const beatsRef = useRef(beatsPerMeasure);
  const onBeatsChangeRef = useRef(onBeatsChange);
  const containerRef = useRef<View>(null);

  useEffect(() => { beatsRef.current = beatsPerMeasure; }, [beatsPerMeasure]);
  useEffect(() => { onBeatsChangeRef.current = onBeatsChange; }, [onBeatsChange]);

  const resetVisuals = useCallback(() => {
    ghostOpacity.value = withTiming(0, { duration: 250, easing: Easing.out(Easing.quad) });
    ghostScale.value = withTiming(0.3, { duration: 250, easing: Easing.out(Easing.quad) });
    ghostTranslateX.value = withTiming(20, { duration: 250 });
    removeOpacity.value = withTiming(1, { duration: 250, easing: Easing.out(Easing.quad) });
    removeScale.value = withTiming(1, { duration: 250, easing: Easing.out(Easing.quad) });
    removeTranslateX.value = withTiming(0, { duration: 250 });
    rowTranslateX.value = withSpring(0, { damping: 15, stiffness: 300 });
    swipeProgress.value = withTiming(0, { duration: 200 });
    swipeDirection.value = 0;
  }, []);

  const processMove = useCallback((clientX: number) => {
    const dx = clientX - startXRef.current;
    const progress = Math.min(Math.abs(dx) / SWIPE_THRESHOLD, 1);
    const canAdd = beatsRef.current < MAX_BEATS;
    const canRemove = beatsRef.current > MIN_BEATS;

    const easedProgress = 1 - Math.pow(1 - progress, 3);

    rowTranslateX.value = dx * 0.06;

    if (dx > 0 && canAdd) {
      swipeDirection.value = 1;
      swipeProgress.value = progress;
      ghostOpacity.value = easedProgress * 0.9;
      ghostScale.value = 0.3 + easedProgress * 0.7;
      ghostTranslateX.value = 20 * (1 - easedProgress);
      removeOpacity.value = 1;
      removeScale.value = 1;
      removeTranslateX.value = 0;
    } else if (dx < 0 && canRemove) {
      swipeDirection.value = -1;
      swipeProgress.value = progress;
      removeOpacity.value = 1 - easedProgress * 0.8;
      removeScale.value = 1 - easedProgress * 0.5;
      removeTranslateX.value = easedProgress * -20;
      ghostOpacity.value = 0;
      ghostScale.value = 0.3;
      ghostTranslateX.value = 20;
    } else {
      swipeDirection.value = 0;
      swipeProgress.value = 0;
      ghostOpacity.value = withTiming(0, { duration: 100 });
      removeOpacity.value = withTiming(1, { duration: 100 });
      removeScale.value = withTiming(1, { duration: 100 });
      removeTranslateX.value = withTiming(0, { duration: 100 });
    }

    if (progress >= 1 && !triggeredRef.current) {
      triggeredRef.current = true;
      if (dx > 0 && canAdd) {
        if (Platform.OS !== "web") {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
        onBeatsChangeRef.current(beatsRef.current + 1);
      } else if (dx < 0 && canRemove) {
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

  const ghostDotStyle = useAnimatedStyle(() => ({
    opacity: ghostOpacity.value,
    transform: [
      { scale: ghostScale.value },
      { translateX: ghostTranslateX.value },
    ],
  }));

  const lastDotFadeStyle = useAnimatedStyle(() => ({
    opacity: removeOpacity.value,
    transform: [
      { scale: removeScale.value },
      { translateX: removeTranslateX.value },
    ],
  }));

  const rowAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: rowTranslateX.value }],
  }));

  const progressBarStyle = useAnimatedStyle(() => {
    const dir = swipeDirection.value;
    const prog = swipeProgress.value;
    if (dir === 0 || prog === 0) {
      return { opacity: 0, width: 0 };
    }
    return {
      opacity: withTiming(prog * 0.5, { duration: 30 }),
      width: withTiming(prog * 60, { duration: 30 }),
      backgroundColor: dir > 0 ? Colors.accent : Colors.danger,
    };
  });

  const nativePanHandlers = Platform.OS !== "web" && panResponder ? panResponder.panHandlers : {};

  return (
    <View
      ref={containerRef}
      style={styles.touchArea}
      testID="beat-indicator-swipe"
      {...nativePanHandlers}
    >
      <Animated.View style={[styles.progressBar, progressBarStyle]} />

      <Animated.View style={[styles.dotsRow, rowAnimStyle]} pointerEvents="none">
        {beats.map((beat) => {
          const isLast = beat === beatsPerMeasure - 1 && beatsPerMeasure > MIN_BEATS;
          if (isLast) {
            return (
              <Animated.View key={`beat-${beat}`} style={lastDotFadeStyle}>
                <BeatDot
                  isActive={isPlaying && currentBeat === beat}
                  isAccent={beat === 0}
                />
              </Animated.View>
            );
          }
          return (
            <BeatDot
              key={`beat-${beat}`}
              isActive={isPlaying && currentBeat === beat}
              isAccent={beat === 0}
            />
          );
        })}

        {beatsPerMeasure < MAX_BEATS && (
          <Animated.View style={[styles.ghostDot, ghostDotStyle]} />
        )}
      </Animated.View>

      <View style={styles.hintRow} pointerEvents="none">
        <View style={styles.signatureBadge}>
          <Text style={styles.signatureText}>
            {beatsPerMeasure}/{beatsPerMeasure <= 4 ? "4" : "8"}
          </Text>
        </View>
        <Text style={styles.hintText}>swipe to add or remove</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  touchArea: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    gap: 10,
    cursor: "grab" as any,
    userSelect: "none" as any,
  },
  progressBar: {
    position: "absolute",
    top: 0,
    height: 2,
    borderRadius: 1,
    backgroundColor: Colors.accent,
  },
  dotsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
    paddingVertical: 20,
    paddingHorizontal: 24,
    minHeight: 72,
    width: "100%",
    flexWrap: "wrap",
  },
  dot: {
    width: 21,
    height: 21,
    borderRadius: 10.5,
    backgroundColor: Colors.textTertiary,
  },
  accentDot: {
    width: 27,
    height: 27,
    borderRadius: 13.5,
  },
  ghostDot: {
    width: 21,
    height: 21,
    borderRadius: 10.5,
    borderWidth: 2,
    borderColor: Colors.accent,
    backgroundColor: "transparent",
  },
  hintRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  signatureBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  signatureText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 12,
    color: Colors.textSecondary,
    letterSpacing: 1,
  },
  hintText: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 11,
    color: Colors.textTertiary,
    letterSpacing: 1,
    opacity: 0.5,
  },
});
