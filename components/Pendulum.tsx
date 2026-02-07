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

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const PENDULUM_LENGTH = Math.min(SCREEN_WIDTH * 0.38, 160);
const BOB_SIZE = 12;

interface PendulumProps {
  isPlaying: boolean;
  bpm: number;
}

export function Pendulum({ isPlaying, bpm }: PendulumProps) {
  const swingDuration = (60000 / bpm);
  const maxAngle = Math.max(12, Math.min(30, 35 - bpm / 15));

  const animatedStyle = useAnimatedStyle(() => {
    if (!isPlaying) {
      return { transform: [{ rotate: "0deg" }] };
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
      <View style={styles.pivotPoint} />
      <Animated.View style={[styles.pendulumArm, animatedStyle]}>
        <View style={styles.armLine} />
        <View style={styles.weightTrack}>
          <View style={styles.weight} />
        </View>
        <View style={styles.bob} />
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
    height: PENDULUM_LENGTH + 40,
  },
  pivotPoint: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.accent,
    position: "absolute",
    top: 0,
    zIndex: 10,
  },
  pendulumArm: {
    position: "absolute",
    top: 5,
    alignItems: "center",
    transformOrigin: "center top",
  },
  armLine: {
    width: 2.5,
    height: PENDULUM_LENGTH,
    backgroundColor: Colors.accentMuted,
    borderRadius: 1.25,
  },
  weightTrack: {
    position: "absolute",
    top: PENDULUM_LENGTH * 0.3,
    alignItems: "center",
  },
  weight: {
    width: 18,
    height: 12,
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
    borderLeftWidth: 30,
    borderRightWidth: 30,
    borderBottomWidth: 22,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: Colors.surfaceLight,
    transform: [{ rotate: "180deg" }],
  },
});
