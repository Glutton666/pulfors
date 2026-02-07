import React from "react";
import { View, StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  withTiming,
  withSequence,
  Easing,
} from "react-native-reanimated";
import Colors from "@/constants/colors";

interface BeatDotProps {
  isActive: boolean;
  isAccent: boolean;
  beatLightMode: "all" | "accent" | "none";
}

function BeatDot({ isActive, isAccent, beatLightMode }: BeatDotProps) {
  const shouldLight =
    beatLightMode === "all" ||
    (beatLightMode === "accent" && isAccent);

  const animatedStyle = useAnimatedStyle(() => {
    if (isActive && shouldLight && beatLightMode !== "none") {
      return {
        transform: [
          {
            scale: withSequence(
              withTiming(1.5, { duration: 50, easing: Easing.out(Easing.quad) }),
              withTiming(1, { duration: 200, easing: Easing.out(Easing.quad) })
            ),
          },
        ],
        backgroundColor: withTiming(
          isAccent ? Colors.accent : Colors.text,
          { duration: 50 }
        ),
      };
    }
    return {
      transform: [{ scale: withTiming(1, { duration: 150 }) }],
      backgroundColor: withTiming(
        beatLightMode === "none" ? Colors.surfaceLight : Colors.textTertiary,
        { duration: 150 }
      ),
    };
  }, [isActive, isAccent, shouldLight, beatLightMode]);

  return (
    <Animated.View
      style={[
        styles.dot,
        isAccent && styles.accentDot,
        animatedStyle,
      ]}
    />
  );
}

interface BeatIndicatorProps {
  beatsPerMeasure: number;
  currentBeat: number;
  isPlaying: boolean;
  beatLightMode: "all" | "accent" | "none";
}

export function BeatIndicator({
  beatsPerMeasure,
  currentBeat,
  isPlaying,
  beatLightMode,
}: BeatIndicatorProps) {
  const beats = Array.from({ length: beatsPerMeasure }, (_, i) => i);

  return (
    <View style={styles.container}>
      {beats.map((beat) => (
        <BeatDot
          key={beat}
          isActive={isPlaying && currentBeat === beat}
          isAccent={beat === 0}
          beatLightMode={beatLightMode}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 12,
    flexWrap: "wrap",
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.textTertiary,
  },
  accentDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
});
