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
  index: number;
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
}

export function BeatIndicator({
  beatsPerMeasure,
  currentBeat,
  isPlaying,
}: BeatIndicatorProps) {
  const beats = Array.from({ length: beatsPerMeasure }, (_, i) => i);

  return (
    <View style={styles.container}>
      {beats.map((beat) => (
        <BeatDot
          key={beat}
          index={beat}
          isActive={isPlaying && currentBeat === beat}
          isAccent={beat === 0}
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
    gap: 16,
    paddingVertical: 16,
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
});
