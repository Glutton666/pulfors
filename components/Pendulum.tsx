import React, { useMemo } from "react";
import { View, StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
} from "react-native-reanimated";
import { useTheme } from "@/contexts/ThemeContext";
import Colors from "@/constants/colors";
import { moderateScale, SCREEN_WIDTH, IS_TABLET, useScale } from "@/lib/scale";
import type { ScaleValues } from "@/lib/scale";

const PENDULUM_LENGTH = IS_TABLET
  ? Math.min(SCREEN_WIDTH * 0.35, 280)
  : Math.min(SCREEN_WIDTH * 0.5, moderateScale(200));
const BOB_SIZE = moderateScale(14, 0.4);

interface PendulumProps {
  isPlaying: boolean;
  bpm: number;
}

export function Pendulum({ isPlaying, bpm }: PendulumProps) {
  const { colors: C } = useTheme();
  const S = useScale();
  const styles = useMemo(() => make_styles(C, S), [C, S]);
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
        <View style={[styles.baseTriangle, { borderBottomColor: C.surfaceLight }]} />
      </View>
    </View>
  );
}

const make_styles = (C: typeof Colors, S: ScaleValues) => StyleSheet.create({
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
    borderRadius: 3,
  },
  bob: {
    width: BOB_SIZE,
    height: BOB_SIZE,
    borderRadius: BOB_SIZE / 2,
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
    transform: [{ rotate: "180deg" }],
  },
});
