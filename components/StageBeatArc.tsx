"use no memo";
/**
 * StageBeatArc — 반원형 비트 번호 아크.
 *
 * 비트 번호들을 아치형(가운데 높고 양옆이 낮아지는)으로 배열하고,
 * beatProgress(0→1)에 따라 왼쪽으로 스윕합니다.
 *
 *   [prev-2] [prev-1] [ CURRENT ] [next+1] [next+2]
 *                          ○ ○ ○ ○   ← subdivision dots
 *
 * 뮤트 비트는 "—" 으로 표시하고 매우 흐리게 렌더링.
 * 서브디비전 점은 현재 비트 아래에만 표시.
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import type { BeatType } from "@/lib/metronome-engine";

// ─── 레이아웃 상수 ────────────────────────────────────────────────
const ITEM_W = 64;   // 슬롯 너비(px)
const VISIBLE = 5;   // 화면에 보이는 슬롯 수 (컨테이너 너비 = ITEM_W * VISIBLE)
const ARC_H  = 22;   // 외곽 슬롯의 최대 아래 변위(arc 곡선 높이)

// 중심에서의 거리 → 시각 속성 (index = abs(offset), 최대 3)
const SCALE_T    = [1.00, 0.64, 0.44, 0.28] as const;
const OPACITY_T  = [1.00, 0.46, 0.22, 0.10] as const;
const TRANS_Y_T  = [0, ARC_H * 0.42, ARC_H, ARC_H] as const;

function tableAt<T extends readonly number[]>(t: T, dist: number): number {
  return t[Math.min(Math.abs(dist), t.length - 1)];
}

// ─── 헬퍼 ────────────────────────────────────────────────────────
function beatAt(current: number, offset: number, total: number): number {
  return ((current - 1 + offset + total * 100) % total) + 1;
}

function isMuted(beat: number, types?: BeatType[]): boolean {
  if (!types || types.length === 0) return false;
  return types[(beat - 1) % types.length] === "mute";
}

// ─── 서브디비전 점 ─────────────────────────────────────────────────
function SubDot({
  index,
  total,
  beatProgress,
}: {
  index: number;
  total: number;
  beatProgress: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const filled = beatProgress.value * total > index;
    return {
      opacity: filled ? 0.90 : 0.20,
      backgroundColor: filled ? "#ffffff" : "rgba(255,255,255,0.45)",
    };
  });
  return <Animated.View style={[styles.dot, style]} />;
}

// ─── Props ──────────────────────────────────────────────────────
interface StageBeatArcProps {
  /** 비트 내 진행률 (0→1). 배처에서 매 비트 리셋 후 withTiming 1로. */
  beatProgress: SharedValue<number>;
  /** 현재 비트 (1-indexed). 멈춤이면 -1. */
  currentBeat: number;
  /** 박자당 비트 수 */
  beatsPerMeasure: number;
  /** 비트당 서브디비전 수 (1이면 점 행 숨김) */
  subdivisionCount?: number;
  /** 비트별 타입 ("mute" 이면 특수 렌더링) */
  beatTypes?: BeatType[];
}

// ─── 메인 컴포넌트 ─────────────────────────────────────────────────
export function StageBeatArc({
  beatProgress,
  currentBeat,
  beatsPerMeasure,
  subdivisionCount = 1,
  beatTypes,
}: StageBeatArcProps) {
  // beatProgress 에 맞춰 전체 스트립을 왼쪽으로 스윕
  // 비트 N 시작(beatProgress=0) → 다음 비트 직전(beatProgress≈1) 까지 ITEM_W 만큼 이동
  const stripStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -beatProgress.value * ITEM_W }],
  }));

  const stopped = currentBeat < 1;

  // 슬롯 오프셋: -2 … +3 (총 6 = VISIBLE+1; +3 슬롯이 오른쪽 여백 채움)
  const offsets = [-2, -1, 0, 1, 2, 3] as const;

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.strip, stripStyle]}>
        {offsets.map((offset) => {
          const beat = stopped
            ? ((offset + 2 + beatsPerMeasure) % beatsPerMeasure) + 1
            : beatAt(currentBeat, offset, beatsPerMeasure);

          const muted    = isMuted(beat, beatTypes);
          const isCenter = !stopped && offset === 0;
          const dist     = Math.abs(offset);

          const scale   = stopped ? 0.48 : tableAt(SCALE_T,   dist);
          const opacity = stopped
            ? 0.18
            : muted
              ? tableAt(OPACITY_T, dist) * 0.28
              : tableAt(OPACITY_T, dist);
          const ty = stopped ? ARC_H * 0.55 : tableAt(TRANS_Y_T, dist);

          return (
            <View
              key={offset}
              style={[styles.slot, { width: ITEM_W, transform: [{ translateY: ty }] }]}
            >
              {/* 비트 번호 / 뮤트 기호 */}
              <Text
                style={[styles.beatNum, { opacity, transform: [{ scale }] }]}
                numberOfLines={1}
              >
                {muted ? "—" : String(beat)}
              </Text>

              {/* 서브디비전 점 — 현재 비트만 */}
              {isCenter && subdivisionCount > 1 && (
                <View style={styles.dotsRow}>
                  {Array.from({ length: Math.min(subdivisionCount, 8) }, (_, i) => (
                    <SubDot
                      key={i}
                      index={i}
                      total={subdivisionCount}
                      beatProgress={beatProgress}
                    />
                  ))}
                </View>
              )}
            </View>
          );
        })}
      </Animated.View>

      {/* 좌우 에지 페이드 마스크 — 각 아이템 opacity 로 자연스럽게 처리됨 */}
    </View>
  );
}

// ─── 스타일 ──────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    width: ITEM_W * VISIBLE,
    height: 100,
    overflow: "hidden",
    alignSelf: "center",
  },
  strip: {
    flexDirection: "row",
    alignItems: "flex-start",
    height: "100%",
  },
  slot: {
    alignItems: "center",
    paddingTop: 2,
  },
  beatNum: {
    color: "#ffffff",
    fontSize: 46,
    fontFamily: "SpaceGrotesk_700Bold",
    lineHeight: 54,
    includeFontPadding: false,
    textAlign: "center",
  },
  dotsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
    marginTop: 7,
    maxWidth: ITEM_W - 6,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
});
