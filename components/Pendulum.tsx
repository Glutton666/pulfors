import React from "react";
import { View, StyleSheet, Dimensions } from "react-native";
import Animated, {
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
} from "react-native-reanimated";
import Colors from "@/constants/colors";
import { useTheme } from "@/contexts/ThemeContext";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const PENDULUM_LENGTH = Math.min(SCREEN_WIDTH * 0.5, 200);
const BOB_SIZE = 14;

interface PendulumProps {
  isPlaying: boolean;
  bpm: number;
}

export function Pendulum({ isPlaying, bpm }: PendulumProps) {
  const { colors: C } = useTheme();
  const swingDuration = (60000 / bpm) * 1;
  const maxAngle = Math.max(15, Math.min(35, 40 - bpm / 15));

  const animatedStyle = useAnimatedStyle(() => {
    if (!isPlaying) {
      return {
        transform: [{ rotate: "0deg" }],
      };
    }

    return {
      transform: [
        {
          rotate: withRepeat(
            withSequence(
              withTiming(`${maxAngle}deg`, {
                duration: swingDuration,
                easing: Easing.inOut(Easing.sin),
              }),
              withTiming(`${-maxAngle}deg`, {
                duration: swingDuration,
                easing: Easing.inOut(Easing.sin),
              })
            ),
            -1,
            false
          ),
        },
      ],
    };
  }, [isPlaying, bpm, swingDuration, maxAngle]);

  return (
    <View style={styles.container}>
      <View style={[styles.pivotPoint, { backgroundColor: C.accent }]} />
      <Animated.View style={[styles.pendulumArm, animatedStyle]}>
        <View style={[styles.armLine, { backgroundColor: C.accentMuted }]} />
        <View style={styles.weightTrack}>
          <View style={[styles.weight, { backgroundColor: C.accent }]} />
        </View>
        <View style={[styles.bob, { backgroundColor: C.accent }]} />
      </Animated.View>
      <View style={styles.base}>
        <View style={styles.baseTriangle} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "flex-end",
    height: PENDULUM_LENGTH + 60,
    marginBottom: 8,
  },
  pivotPoint: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.accent,
    position: "absolute",
    top: 0,
    zIndex: 10,
  },
  pendulumArm: {
    position: "absolute",
    top: 6,
    alignItems: "center",
    transformOrigin: "center top",
  },
  armLine: {
    width: 3,
    height: PENDULUM_LENGTH,
    backgroundColor: Colors.accentMuted,
    borderRadius: 1.5,
  },
  weightTrack: {
    position: "absolute",
    top: PENDULUM_LENGTH * 0.3,
    alignItems: "center",
  },
  weight: {
    width: 22,
    height: 14,
    backgroundColor: Colors.accent,
    borderRadius: 3,
  },
  bob: {
    width: BOB_SIZE,
    height: BOB_SIZE,
    borderRadius: BOB_SIZE / 2,
    backgroundColor: Colors.accent,
    marginTop: -2,
  },
  base: {
    position: "absolute",
    bottom: 0,
    alignItems: "center",
  },
  baseTriangle: {
    width: 0,
    height: 0,
    borderLeftWidth: 40,
    borderRightWidth: 40,
    borderBottomWidth: 30,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: Colors.surfaceLight,
    transform: [{ rotate: "180deg" }],
  },
});
