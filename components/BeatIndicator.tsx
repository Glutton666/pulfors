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
  useSharedValue,
  Easing,
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
              withTiming(1.4, { duration: 60, easing: Easing.out(Easing.quad) }),
              withTiming(1, { duration: 200, easing: Easing.out(Easing.quad) })
            ),
          },
        ],
        backgroundColor: withTiming(
          isAccent ? Colors.accent : Colors.text,
          { duration: 60 }
        ),
        shadowOpacity: withSequence(
          withTiming(0.6, { duration: 60 }),
          withTiming(0, { duration: 300 })
        ),
      };
    }
    return {
      transform: [{ scale: withTiming(1, { duration: 150 }) }],
      backgroundColor: withTiming(Colors.textTertiary, { duration: 150 }),
      shadowOpacity: withTiming(0, { duration: 150 }),
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
          shadowRadius: 8,
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

  const ghostOpacity = useSharedValue(0);
  const ghostScale = useSharedValue(0.5);
  const removeOpacity = useSharedValue(1);
  const removeScale = useSharedValue(1);

  const startXRef = useRef(0);
  const isDraggingRef = useRef(false);
  const triggeredRef = useRef(false);
  const beatsRef = useRef(beatsPerMeasure);
  const onBeatsChangeRef = useRef(onBeatsChange);
  const containerRef = useRef<View>(null);

  useEffect(() => { beatsRef.current = beatsPerMeasure; }, [beatsPerMeasure]);
  useEffect(() => { onBeatsChangeRef.current = onBeatsChange; }, [onBeatsChange]);

  const resetVisuals = useCallback(() => {
    ghostOpacity.value = withTiming(0, { duration: 200 });
    ghostScale.value = withTiming(0.5, { duration: 200 });
    removeOpacity.value = withTiming(1, { duration: 200 });
    removeScale.value = withTiming(1, { duration: 200 });
  }, []);

  const processMove = useCallback((clientX: number) => {
    const dx = clientX - startXRef.current;
    const progress = Math.min(Math.abs(dx) / SWIPE_THRESHOLD, 1);
    const canAdd = beatsRef.current < MAX_BEATS;
    const canRemove = beatsRef.current > MIN_BEATS;

    if (dx > 0 && canAdd) {
      ghostOpacity.value = withTiming(progress * 0.8, { duration: 30 });
      ghostScale.value = withTiming(0.5 + progress * 0.5, { duration: 30 });
      removeOpacity.value = withTiming(1, { duration: 30 });
      removeScale.value = withTiming(1, { duration: 30 });
    } else if (dx < 0 && canRemove) {
      removeOpacity.value = withTiming(1 - progress * 0.7, { duration: 30 });
      removeScale.value = withTiming(1 - progress * 0.4, { duration: 30 });
      ghostOpacity.value = withTiming(0, { duration: 30 });
    } else {
      ghostOpacity.value = withTiming(0, { duration: 30 });
      removeOpacity.value = withTiming(1, { duration: 30 });
      removeScale.value = withTiming(1, { duration: 30 });
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
    transform: [{ scale: ghostScale.value }],
  }));

  const lastDotFadeStyle = useAnimatedStyle(() => ({
    opacity: removeOpacity.value,
    transform: [{ scale: removeScale.value }],
  }));

  const nativePanHandlers = Platform.OS !== "web" && panResponder ? panResponder.panHandlers : {};

  return (
    <View
      ref={containerRef}
      style={styles.touchArea}
      testID="beat-indicator-swipe"
      {...nativePanHandlers}
    >
      <View style={styles.dotsRow} pointerEvents="none">
        {beats.map((beat) => {
          const isLast = beat === beatsPerMeasure - 1 && beatsPerMeasure > MIN_BEATS;
          if (isLast) {
            return (
              <Animated.View key={beat} style={lastDotFadeStyle}>
                <BeatDot
                  isActive={isPlaying && currentBeat === beat}
                  isAccent={beat === 0}
                />
              </Animated.View>
            );
          }
          return (
            <BeatDot
              key={beat}
              isActive={isPlaying && currentBeat === beat}
              isAccent={beat === 0}
            />
          );
        })}

        {beatsPerMeasure < MAX_BEATS && (
          <Animated.View style={[styles.ghostDot, ghostDotStyle]} />
        )}
      </View>

      <Text style={styles.hintText} pointerEvents="none">
        {beatsPerMeasure}/{beatsPerMeasure <= 4 ? "4" : "8"}
        {"  "}·{"  "}swipe to add or remove
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  touchArea: {
    alignItems: "center",
    paddingVertical: 8,
    gap: 8,
    cursor: "grab" as any,
    userSelect: "none" as any,
  },
  dotsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingVertical: 12,
    paddingHorizontal: 24,
    minHeight: 48,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.textTertiary,
  },
  accentDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  ghostDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.accent,
    borderWidth: 1.5,
    borderColor: Colors.accent,
    borderStyle: "dashed",
  },
  hintText: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 11,
    color: Colors.textTertiary,
    letterSpacing: 1,
    opacity: 0.6,
  },
});
