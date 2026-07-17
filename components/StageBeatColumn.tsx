"use no memo";
/**
 * StageBeatColumn — 수직 비트 디스플레이 (무대 모드 전용).
 *
 * 현재 비트를 크고 밝게, 다음 비트를 작고 흐리게 아래에 표시한다.
 * 비트가 바뀔 때마다 위로 슬라이드-업 애니메이션이 발생한다.
 *
 * currentBeat: 0-based (엔진 기준). -1 = 멈춤.
 * beatsPerMeasure: 전체 마디 내 비트 수.
 * beatTypes: BeatType[] — strong/accent/normal/mute.
 * theme: "dark" | "light" — 배경 색상에 맞춰 텍스트 색상 결정.
 */

import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";
import type { BeatType } from "@/lib/metronome-engine";

const BEAT_COLOR_DARK: Record<BeatType, string> = {
  strong: "#ffffff",
  accent: "#FFD54F",
  normal: "#ffffff",
  mute:   "rgba(255,255,255,0.15)",
};
const BEAT_COLOR_LIGHT: Record<BeatType, string> = {
  strong: "#111111",
  accent: "#B8860B",
  normal: "#111111",
  mute:   "rgba(0,0,0,0.18)",
};

function getBeatType(beat0: number, types?: BeatType[]): BeatType {
  if (!types || types.length === 0) return "normal";
  return types[beat0 % types.length] ?? "normal";
}

export interface StageBeatColumnProps {
  currentBeat:      number;
  beatsPerMeasure:  number;
  beatTypes?:       BeatType[];
  /** 현재 비트의 서브디비전 타입 (바 모드에서 전달) */
  subdivisionTypes?: BeatType[];
  theme?:           "dark" | "light";
}

export function StageBeatColumn({
  currentBeat,
  beatsPerMeasure,
  beatTypes,
  subdivisionTypes,
  theme = "dark",
}: StageBeatColumnProps) {
  const total     = Math.max(1, beatsPerMeasure);
  const stopped   = currentBeat < 0;
  const slideY    = useSharedValue(0);
  const prevRef   = useRef(currentBeat);

  useEffect(() => {
    if (!stopped && currentBeat !== prevRef.current) {
      slideY.value = 64;
      slideY.value = withTiming(0, {
        duration: 180,
        easing: Easing.out(Easing.cubic),
      });
    }
    prevRef.current = currentBeat;
  }, [currentBeat, stopped]);

  const slideStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: slideY.value }],
  }));

  const colorMap = theme === "dark" ? BEAT_COLOR_DARK : BEAT_COLOR_LIGHT;

  const cur0  = stopped ? 0 : currentBeat;
  const next0 = stopped ? (1 % total) : ((currentBeat + 1) % total);

  const curType  = getBeatType(cur0,  beatTypes);
  const nextType = getBeatType(next0, beatTypes);

  const curColor  = stopped ? (theme === "dark" ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)") : colorMap[curType];
  const nextColor = theme === "dark"
    ? (nextType === "accent" ? "rgba(255,213,79,0.28)" : "rgba(255,255,255,0.22)")
    : (nextType === "accent" ? "rgba(184,134,11,0.3)" : "rgba(0,0,0,0.16)");

  const dotActive = theme === "dark" ? "#ffffff" : "#222222";
  const dotInactive = theme === "dark" ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.14)";

  const maxDots = Math.min(total, 16);

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.inner, slideStyle]}>
        {/* Current beat — large & bright */}
        <Text style={[styles.currentNum, { color: curColor }]}>
          {stopped ? "—" : String(cur0 + 1)}
        </Text>

        {/* Measure progress dots */}
        {!stopped && (
          <View style={styles.dotsRow}>
            {Array.from({ length: maxDots }, (_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i === cur0
                    ? [styles.dotActive, { backgroundColor: dotActive }]
                    : [{ backgroundColor: dotInactive }],
                ]}
              />
            ))}
          </View>
        )}

        {/* 서브디비전 타입 표시 (바 모드) */}
        {!stopped && subdivisionTypes && subdivisionTypes.length > 1 && (
          <View style={styles.subdivRow}>
            {subdivisionTypes.map((subType, si) => {
              const subColor =
                subType === "accent" ? (theme === "dark" ? "#FFD54F" : "#B8860B")
                : subType === "mute"   ? dotInactive
                : subType === "strong" ? (theme === "dark" ? "#ffffff" : "#111111")
                : dotInactive;
              return (
                <View
                  key={si}
                  style={[
                    styles.subdivDot,
                    si === 0 && styles.subdivDotFirst,
                    { backgroundColor: subColor },
                  ]}
                />
              );
            })}
          </View>
        )}

        {/* Next beat — small & faint */}
        {!stopped && (
          <Text style={[styles.nextNum, { color: nextColor }]}>
            {String(next0 + 1)}
          </Text>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    height: 200,
    width: "100%",
  },
  inner: {
    alignItems: "center",
  },
  currentNum: {
    fontSize: 112,
    fontFamily: "SpaceGrotesk_700Bold",
    lineHeight: 120,
    textAlign: "center",
    includeFontPadding: false,
  },
  dotsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    justifyContent: "center",
    marginTop: 6,
    marginBottom: 2,
    maxWidth: 300,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    width: 20,
    height: 6,
    borderRadius: 3,
  },
  nextNum: {
    fontSize: 48,
    fontFamily: "SpaceGrotesk_400Regular",
    lineHeight: 56,
    textAlign: "center",
    includeFontPadding: false,
    marginTop: 4,
  },
  subdivRow: {
    flexDirection: "row",
    gap: 5,
    justifyContent: "center",
    marginTop: 8,
    marginBottom: 2,
  },
  subdivDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    opacity: 0.85,
  },
  subdivDotFirst: {
    width: 12,
    height: 8,
    borderRadius: 4,
    opacity: 1,
  },
});
