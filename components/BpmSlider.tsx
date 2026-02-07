import React, { useRef, useEffect } from "react";
import { View, Text, StyleSheet, PanResponder, Platform } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface BpmSliderProps {
  bpm: number;
  onBpmChange: (bpm: number) => void;
}

export function BpmSlider({ bpm, onBpmChange }: BpmSliderProps) {
  const currentBpmRef = useRef(bpm);
  const startBpmRef = useRef(bpm);
  const lastHapticBpm = useRef(bpm);
  const onBpmChangeRef = useRef(onBpmChange);

  useEffect(() => {
    currentBpmRef.current = bpm;
  }, [bpm]);

  useEffect(() => {
    onBpmChangeRef.current = onBpmChange;
  }, [onBpmChange]);

  const translateX = useSharedValue(0);
  const isDragging = useSharedValue(0);
  const glowIntensity = useSharedValue(0);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dx) > 5,
      onPanResponderGrant: () => {
        startBpmRef.current = currentBpmRef.current;
        lastHapticBpm.current = currentBpmRef.current;
        isDragging.value = withTiming(1, { duration: 150 });
        glowIntensity.value = withTiming(1, { duration: 200 });
      },
      onPanResponderMove: (_, gestureState) => {
        const sensitivity = 0.4;
        const rawDelta = gestureState.dx * sensitivity;
        const newBpm = Math.round(startBpmRef.current + rawDelta);
        const clampedBpm = Math.max(20, Math.min(300, newBpm));

        translateX.value = Math.max(-30, Math.min(30, gestureState.dx * 0.08));

        if (clampedBpm !== lastHapticBpm.current) {
          if (Platform.OS !== "web") {
            if (clampedBpm % 10 === 0) {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            } else if (clampedBpm % 5 === 0) {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            } else {
              Haptics.selectionAsync();
            }
          }
          lastHapticBpm.current = clampedBpm;
          onBpmChangeRef.current(clampedBpm);
        }
      },
      onPanResponderRelease: () => {
        translateX.value = withSpring(0, { damping: 15, stiffness: 300 });
        isDragging.value = withTiming(0, { duration: 200 });
        glowIntensity.value = withTiming(0, { duration: 300 });
      },
      onPanResponderTerminate: () => {
        translateX.value = withSpring(0, { damping: 15, stiffness: 300 });
        isDragging.value = withTiming(0, { duration: 200 });
        glowIntensity.value = withTiming(0, { duration: 300 });
      },
    })
  ).current;

  const containerAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowIntensity.value * 0.25,
  }));

  return (
    <View style={styles.wrapper}>
      <Animated.View style={[styles.glowBg, glowStyle]} />
      <Animated.View
        style={[styles.container, containerAnimStyle]}
        {...panResponder.panHandlers}
        testID="bpm-slider"
      >
        <View style={styles.arrowLeft}>
          <Feather name="chevron-left" size={16} color={Colors.textTertiary} />
        </View>

        <View style={styles.bpmContent}>
          <Text style={styles.bpmValue} testID="bpm-display">
            {bpm}
          </Text>
          <Text style={styles.bpmUnit}>BPM</Text>
        </View>

        <View style={styles.arrowRight}>
          <Feather name="chevron-right" size={16} color={Colors.textTertiary} />
        </View>

        <View style={styles.tickTrack}>
          {Array.from({ length: 29 }, (_, i) => (
            <View
              key={i}
              style={[
                styles.tick,
                i % 5 === 0 && styles.tickMajor,
                i === 14 && styles.tickCenter,
              ]}
            />
          ))}
        </View>
      </Animated.View>

      <Text style={styles.slideHint}>slide to adjust</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    gap: 6,
  },
  glowBg: {
    position: "absolute",
    top: -10,
    left: -10,
    right: -10,
    bottom: -10,
    borderRadius: 30,
    backgroundColor: Colors.accent,
  },
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    minWidth: 220,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  arrowLeft: {
    opacity: 0.5,
    marginRight: 8,
  },
  arrowRight: {
    opacity: 0.5,
    marginLeft: 8,
  },
  bpmContent: {
    alignItems: "center",
    minWidth: 120,
  },
  bpmValue: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 64,
    color: Colors.text,
    lineHeight: 72,
  },
  bpmUnit: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 13,
    color: Colors.textTertiary,
    letterSpacing: 4,
    marginTop: -4,
  },
  tickTrack: {
    position: "absolute",
    bottom: 6,
    left: 20,
    right: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    height: 6,
  },
  tick: {
    width: 1,
    height: 3,
    backgroundColor: Colors.textTertiary,
    opacity: 0.3,
    borderRadius: 0.5,
  },
  tickMajor: {
    height: 5,
    opacity: 0.5,
  },
  tickCenter: {
    backgroundColor: Colors.accent,
    opacity: 0.7,
    height: 5,
  },
  slideHint: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 11,
    color: Colors.textTertiary,
    letterSpacing: 1,
    opacity: 0.6,
  },
});
