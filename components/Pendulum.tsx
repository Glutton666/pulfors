import React, { useEffect, useMemo } from "react";
import { View, StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withRepeat,
  withSequence,
  cancelAnimation,
  Easing,
} from "react-native-reanimated";
import { useTheme } from "@/contexts/ThemeContext";
import Colors from "@/constants/colors";
import { moderateScale, SCREEN_WIDTH, IS_TABLET, useScale } from "@/lib/scale";
import { Radius, Spacing } from "@/constants/tokens";
import type { ScaleValues } from "@/lib/scale";
import { computePendulumAnim, pendulumPlan } from "@/lib/animation-lifecycle";

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
  const { swingDuration, maxAngle } = computePendulumAnim(bpm);

  const rotation = useSharedValue(0);

  useEffect(() => {
    // pendulumPlan이 "cancel → (returnHome | swing)" 시퀀스를 결정론적으로
    // 만들어준다. 컴포넌트는 그 명령을 reanimated 워클릿으로 매핑만 한다.
    // cancel 없이 deps만 바꾸면 이전 사이클이 끝까지 유지되어 점프/지터가
    // 발생하므로, 항상 cancel이 먼저 나오는 plan에 의존하는 게 핵심이다.
    const ops = pendulumPlan({ isPlaying, maxAngle, swingDuration });
    for (const op of ops) {
      if (op.type === "cancel") {
        cancelAnimation(rotation);
      } else if (op.type === "returnHome") {
        rotation.value = withTiming(0, { duration: op.duration, easing: Easing.out(Easing.quad) });
      } else {
        // 한 변(side-to-side)이 1박자 = swingDuration. 현재 위치에서 한 변
        // 끝까지 부드럽게 도달한 뒤 반복 시퀀스로 진입.
        const dur = op.duration;
        const angle = op.maxAngle;
        rotation.value = withTiming(op.targetAngle, { duration: dur, easing: Easing.inOut(Easing.sin) }, (finished) => {
          "worklet";
          if (!finished) return;
          rotation.value = withRepeat(
            withSequence(
              withTiming(-angle, { duration: dur, easing: Easing.inOut(Easing.sin) }),
              withTiming(angle, { duration: dur, easing: Easing.inOut(Easing.sin) }),
            ),
            -1,
            false,
          );
        });
      }
    }
    return () => {
      cancelAnimation(rotation);
    };
  }, [isPlaying, bpm, swingDuration, maxAngle, rotation]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

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
    marginBottom: Spacing.sm,
  },
  pivotPoint: {
    width: 12,
    height: 12,
    borderRadius: Radius.sm,
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
