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

import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, PanResponder } from "react-native";
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
  activeIndex,
}: {
  types: BeatType[];
  theme: "dark" | "light";
  size?: number;
  /** 재생 중 현재 활성 서브디비전 인덱스 — 해당 점을 크고 밝게 하이라이트 */
  activeIndex?: number;
}) {
  if (types.length <= 1) return null;
  // 활성 인덱스가 표시 패턴 범위를 벗어나면(예: 블록 자체 서브디비전 재생 중)
  // 잘못된 점을 강조하지 않도록 하이라이트를 생략한다.
  if (activeIndex != null && (activeIndex < 0 || activeIndex >= types.length)) activeIndex = undefined;
  // 무대용 가시성: 일반 점도 어두운 배경에서 멀리서 보이도록 충분히 밝게.
  const dotBase     = theme === "dark" ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.55)";
  const dotMute     = theme === "dark" ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)";
  const activeRing  = theme === "dark" ? "#FFD54F" : "#B8860B";
  // 두 줄(현재+다음)로 세로 공간을 쓰는 대신 가로로 넓게 펼친다.
  // 점 개수가 많으면 화면을 넘지 않도록 간격을 줄인다.
  const gap = size * (types.length <= 4 ? 2.2 : types.length <= 8 ? 1.4 : 0.7);
  return (
    <View style={[styles.subdivRow, { gap }]} testID="stage-subdiv-dots">
      {types.map((t, i) => {
        const isActive = activeIndex === i;
        const color =
          t === "accent" ? (theme === "dark" ? "#FFD54F" : "#B8860B")
          : t === "mute"   ? dotMute
          : t === "strong" ? (theme === "dark" ? "#ffffff" : "#111111")
          : isActive ? (theme === "dark" ? "#ffffff" : "#111111")
          : dotBase;
        const w = isActive ? size * 1.6 : i === 0 ? size * 1.5 : size;
        const h = isActive ? size * 1.3 : size;
        return (
          <View
            key={i}
            style={{
              width: w,
              height: h,
              borderRadius: h / 2,
              backgroundColor: color,
              opacity: isActive ? 1 : i === 0 ? 1 : 0.85,
              borderWidth: isActive ? 2 : 0,
              borderColor: activeRing,
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
  /** 현재 활성 서브디비전 인덱스 (재생 중 하이라이트) */
  activeSubNote?:       number;
  theme?:               "dark" | "light";
  /** 왼쪽 스와이프 → 다음 항목 */
  onSwipeLeft?:         () => void;
  /** 오른쪽 스와이프 → 이전 항목 */
  onSwipeRight?:        () => void;
}

export function StageBeatColumn({
  currentBeat,
  beatsPerMeasure,
  beatTypes,
  subdivisionTypes,
  nextSubdivisionTypes,
  activeSubNote,
  theme = "dark",
  onSwipeLeft,
  onSwipeRight,
}: StageBeatColumnProps) {
  const total     = Math.max(1, beatsPerMeasure);
  const stopped   = currentBeat < 0;
  const slideY    = useSharedValue(0);
  const prevRef   = useRef(currentBeat);

  // ── 스와이프 제스처 (좌: 다음 항목, 우: 이전 항목) ────────────────
  const onSwipeLeftRef  = useRef(onSwipeLeft);
  const onSwipeRightRef = useRef(onSwipeRight);
  useEffect(() => { onSwipeLeftRef.current  = onSwipeLeft;  }, [onSwipeLeft]);
  useEffect(() => { onSwipeRightRef.current = onSwipeRight; }, [onSwipeRight]);

  const swipeFiredRef = useRef(false);
  const swipePR = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > 8 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.2,
      onPanResponderGrant: () => { swipeFiredRef.current = false; },
      onPanResponderMove: (_, gs) => {
        if (swipeFiredRef.current) return;
        if (gs.dx < -50) {
          swipeFiredRef.current = true;
          onSwipeLeftRef.current?.();
        } else if (gs.dx > 50) {
          swipeFiredRef.current = true;
          onSwipeRightRef.current?.();
        }
      },
      onPanResponderRelease: () => { swipeFiredRef.current = false; },
    })
  ).current;

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

  // 컨테이너 높이에 맞춰 축소: 재생 중 콘텐츠(도트+구분선+큰 숫자 2개+서브디비전)는
  // 최대 약 420px — 짧은 화면에서는 overflow hidden 에 위·아래(마디 도트,
  // 서브디비전 점)가 잘려 아예 안 보였다. 높이를 재서 비율로 글자를 줄인다.
  const [rootH, setRootH] = useState(0);
  const fit = rootH > 0 ? Math.min(1, rootH / 430) : 1;
  const curFont  = Math.round(172 * fit);
  const nextFont = Math.round(108 * fit);
  const subSize  = Math.max(16, Math.round(26 * fit));

  return (
    <View
      style={styles.root}
      onLayout={(e) => setRootH(e.nativeEvent.layout.height)}
      {...swipePR.panHandlers}
    >
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
          /* 재생 중: 마디 도트 + 구분선 → 현재 비트 → 다음 비트 → 서브디비전 */
          <>
            {/* 마디 진행 도트 (현재 비트 위) */}
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

            {/* 구분선 (현재 비트 위) */}
            <View style={[styles.divider, { backgroundColor: dividerColor }]} />

            {/* 현재 비트 */}
            <Text style={[styles.beatNum, { color: curColor, fontSize: curFont, lineHeight: curFont + 8 }]}>
              {String(cur0 + 1)}
            </Text>

            {/* 다음 비트 */}
            <Text style={[styles.beatNum, { color: nextColor, fontSize: nextFont, lineHeight: nextFont + 8 }]}>
              {String(next0 + 1)}
            </Text>

            {/* 서브디비전 — 현재 비트만 한 줄로 넓게 (다음 비트 줄은 2단으로 보여 제거) */}
            {subdivisionTypes && subdivisionTypes.length > 1 && (
              <SubdivDots
                types={subdivisionTypes}
                theme={theme}
                size={subSize}
                activeIndex={activeSubNote != null && activeSubNote >= 0 ? activeSubNote : undefined}
              />
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
