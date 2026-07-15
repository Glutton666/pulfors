"use no memo";
/**
 * StageBeatArc — 비트 진행률 시각화 원형 아크.
 *
 * beatProgress (SharedValue 0→1) 를 받아 점이 원을 따라
 * 시계 방향으로 한 바퀴 회전합니다.
 * 새 비트마다 0 으로 리셋되고 다음 비트까지 1 로 sweeping.
 */
import React from "react";
import { View, StyleSheet } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";

interface StageBeatArcProps {
  beatProgress: SharedValue<number>;
  /** 원의 직경 (px). 기본값 100 */
  size?: number;
  /** 원 테두리 색. 기본값 rgba(255,255,255,0.15) */
  ringColor?: string;
  /** 회전 점 색. 기본값 흰색 */
  dotColor?: string;
}

export function StageBeatArc({
  beatProgress,
  size = 100,
  ringColor = "rgba(255,255,255,0.15)",
  dotColor = "#ffffff",
}: StageBeatArcProps) {
  const dotSize = size * 0.1;
  const radius = size / 2;

  // 전체 컨테이너를 beatProgress 에 맞게 회전 — 점은 항상 top 에 위치
  const armStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${beatProgress.value * 360}deg` }],
  }));

  return (
    <View style={[styles.root, { width: size, height: size }]}>
      {/* 배경 링 */}
      <View
        style={[
          styles.ring,
          {
            width: size,
            height: size,
            borderRadius: radius,
            borderColor: ringColor,
          },
        ]}
      />

      {/* 회전 암 — 크기가 size×size 이므로 회전 축 = 원 중심 */}
      <Animated.View
        style={[styles.arm, { width: size, height: size }, armStyle]}
      >
        {/* 점: top 가장자리 중앙 */}
        <View
          style={[
            styles.dot,
            {
              width: dotSize,
              height: dotSize,
              borderRadius: dotSize / 2,
              backgroundColor: dotColor,
              top: 3,
              marginLeft: -dotSize / 2,
            },
          ]}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    position: "absolute",
    borderWidth: 1.5,
  },
  arm: {
    position: "absolute",
    alignItems: "center",
  },
  dot: {
    position: "absolute",
  },
});
