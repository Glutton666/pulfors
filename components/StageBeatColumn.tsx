"use no memo";
/**
 * StageBeatColumn — 수직 비트 디스플레이 (무대 모드 전용).
 *
 * 현재 비트와 다음 비트를 동일한 크기로 표시한다.
 * 둘 다 서브디비전 도트를 표시한다.
 * 비트가 바뀔 때마다 슬라이드-업 애니메이션이 발생한다.
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

function SubdivDots({
  types,
  theme,
  size = 10,
}: {
  types: BeatType[];
  theme: "dark" | "light";
  size?: number;
}) {
  if (types.length <= 1) return null;
  const dotInactive = theme === "dark" ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.14)";
  return (
    <View style={[styles.subdivRow, { gap: size * 0.6 }]}>
      {types.map((t, i) => {
        const color =
          t === "accent" ? (theme === "dark" ? "#FFD54F" : "#B8860B")
          : t === "mute"   ? dotInactive
          : t === "strong" ? (theme === "dark" ? "#ffffff" : "#111111")
          : dotInactive;
        return (
          <View
            key={i}
            style={{
              width: i === 0 ? size * 1.5 : size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: color,
              opacity: i === 0 ? 1 : 0.85,
            }}
          />
        );
      })}
    </View>
  );
}

export interface StageBeatColumnProps {
  currentBeat:          number;
  beatsPerMeasure:      number;
  beatTypes?:           BeatType[];
  /** 현재 비트의 서브디비전 타입 */
  subdivisionTypes?:    BeatType[];
  /** 다음 비트의 서브디비전 타입 */
  nextSubdivisionTypes?: BeatType[];
  theme?:               "dark" | "light";
}

export function StageBeatColumn({
  currentBeat,
  beatsPerMeasure,
  beatTypes,
  subdivisionTypes,
  nextSubdivisionTypes,
  theme = "dark",
}: StageBeatColumnProps) {
  const total     = Math.max(1, beatsPerMeasure);
  const stopped   = currentBeat < 0;
  const slideY    = useSharedValue(0);
  const prevRef   = useRef(currentBeat);

  useEffect(() => {
    if (!stopped && currentBeat !== prevRef.current) {
      slideY.value = 80;
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

  const curColor  = stopped
    ? (theme === "dark" ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)")
    : colorMap[curType];

  const nextColor = theme === "dark"
    ? (nextType === "accent" ? "rgba(255,213,79,0.38)" : "rgba(255,255,255,0.28)")
    : (nextType === "accent" ? "rgba(184,134,11,0.36)" : "rgba(0,0,0,0.22)");

  const dotActive   = theme === "dark" ? "#ffffff" : "#222222";
  const dotInactive = theme === "dark" ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.14)";
  const dividerColor = theme === "dark" ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)";

  const maxDots = Math.min(total, 16);

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.inner, slideStyle]}>

        {stopped ? (
          /* 정지 상태: 첫 비트를 매우 흐리게 표시 (재생 전 미리보기) */
          <>
            <Text style={[styles.beatNum, { color: theme === "dark" ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.13)" }]}>
              1
            </Text>
            {total > 1 && (
              <View style={styles.dotsRow}>
                {Array.from({ length: maxDots }, (_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.dot,
                      i === 0
                        ? [styles.dotActive, { backgroundColor: dotInactive }]
                        : { backgroundColor: dotInactive },
                    ]}
                  />
                ))}
              </View>
            )}
          </>
        ) : (
          /* 재생 중: 현재 비트 + 다음 비트 모두 표시 */
          <>
            <Text style={[styles.beatNum, { color: curColor }]}>
              {String(cur0 + 1)}
            </Text>

            {/* 현재 비트 서브디비전 */}
            {subdivisionTypes && subdivisionTypes.length > 1 && (
              <SubdivDots types={subdivisionTypes} theme={theme} size={10} />
            )}

            {/* 마디 진행 도트 */}
            <View style={styles.dotsRow}>
              {Array.from({ length: maxDots }, (_, i) => (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    i === cur0
                      ? [styles.dotActive, { backgroundColor: dotActive }]
                      : { backgroundColor: dotInactive },
                  ]}
                />
              ))}
            </View>

            {/* 구분선 */}
            <View style={[styles.divider, { backgroundColor: dividerColor }]} />

            {/* ── 다음 비트 ── */}
            <Text style={[styles.beatNum, { color: nextColor }]}>
              {String(next0 + 1)}
            </Text>
            {nextSubdivisionTypes && nextSubdivisionTypes.length > 1 && (
              <SubdivDots types={nextSubdivisionTypes} theme={theme} size={10} />
            )}
          </>
        )}

      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    width: "100%",
  },
  inner: {
    alignItems: "center",
    width: "100%",
  },
  beatNum: {
    fontSize: 148,
    fontFamily: "SpaceGrotesk_700Bold",
    lineHeight: 156,
    textAlign: "center",
    includeFontPadding: false,
  },
  dotsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center",
    marginTop: 6,
    marginBottom: 4,
    maxWidth: 320,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  dotActive: {
    width: 22,
    height: 7,
    borderRadius: 3.5,
  },
  divider: {
    width: 48,
    height: 1,
    borderRadius: 1,
    marginVertical: 14,
  },
  subdivRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 6,
    marginBottom: 2,
  },
});
