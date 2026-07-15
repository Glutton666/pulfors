"use no memo";
/**
 * StageBeatArc — 반원형 비트 번호 아크.
 *
 * currentBeat 는 앱 상태와 동일하게 **0-based** (엔진 기준).
 * 사용자에게 보이는 레이블은 beat + 1 (1-based).
 * beatSubdivisions 키도 "0", "1", "2" … (0-based 문자열).
 *
 * 현재 비트는 6시(하단 중앙)에, 이웃 비트들은 호를 그리며 위로 올라갑니다.
 * beatProgress(0→1)에 따라 스트립 전체가 왼쪽으로 스윕됩니다.
 *
 *   [prev-2] [prev-1]        [next+1] [next+2]   ← 위 (11, 10, 2, 1시 방향)
 *               [ CURRENT ]                       ← 6시 (하단 중앙)
 *                  ○ ○ ○ ○                        ← 서브디비전 진행 점
 *
 * 비트 타입별 색상:
 *   strong → 흰색(scale 보너스)  accent → #FFD54F(따뜻한 노란색)
 *   normal → 흰색               mute  → "—" + 매우 흐림
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import type { BeatType } from "@/lib/metronome-engine";

// ─── 레이아웃 상수 ────────────────────────────────────────────────
const ITEM_W = 66;   // 슬롯 너비(px)
const VISIBLE = 5;   // 화면에 보이는 슬롯 수
const ARC_H  = 26;   // 현재 비트의 최대 아래 변위 (6시 효과)

// dist = 중심에서의 거리 (0=현재, 1=인접, 2+)
// 현재 비트(dist=0) = 가장 아래(ARC_H), 외곽(dist≥2) = 가장 위(0)
const SCALE_T    = [1.00, 0.64, 0.44, 0.28] as const;
const OPACITY_T  = [1.00, 0.46, 0.22, 0.10] as const;
const TRANS_Y_T  = [ARC_H, ARC_H * 0.45, 0, 0] as const;

// ─── 비트 타입별 시각 속성 ────────────────────────────────────────
const BEAT_COLOR: Record<BeatType, string> = {
  strong: "#ffffff",
  accent: "#FFD54F",
  normal: "#ffffff",
  mute:   "#ffffff",   // opacity로 제어
};
const BEAT_SCALE_BONUS: Record<BeatType, number> = {
  strong: 0.06,
  accent: 0.02,
  normal: 0,
  mute:   0,
};

// ─── 헬퍼 ────────────────────────────────────────────────────────
function tableAt<T extends readonly number[]>(t: T, dist: number): number {
  return t[Math.min(Math.abs(dist), t.length - 1)];
}

/**
 * 0-based currentBeat 에서 offset 만큼 떨어진 비트를 반환 (0-based).
 */
function beatAt(current: number, offset: number, total: number): number {
  return ((current + offset) % total + total) % total;
}

function getBeatType(beat0: number, types?: BeatType[]): BeatType {
  if (!types || types.length === 0) return "normal";
  return types[beat0 % types.length] ?? "normal";
}

/**
 * 비트별 서브디비전 수.
 * beat0 은 0-based; beatSubdivisions 키도 "0", "1" … (0-based).
 */
function getSubdivCount(
  beat0: number,
  beatSubdivisions?: Record<string, BeatType[]>,
  globalSubdivCount = 1,
): number {
  if (beatSubdivisions) {
    const custom = beatSubdivisions[String(beat0)];
    if (custom && custom.length > 0) return custom.length;
  }
  return globalSubdivCount;
}

// ─── 서브디비전 점 ─────────────────────────────────────────────────
/** 현재 비트 — beatProgress에 따라 실시간으로 채워지는 점 */
function AnimatedDot({
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
      opacity: filled ? 0.90 : 0.22,
      backgroundColor: filled ? "#ffffff" : "rgba(255,255,255,0.4)",
    };
  });
  return <Animated.View style={[s.dot, style]} />;
}

/** 다른 비트 — 고정 스타일(서브디비전 수만큼 비어있는 점) */
function StaticDot() {
  return <View style={[s.dot, { opacity: 0.18, backgroundColor: "rgba(255,255,255,0.45)" }]} />;
}

// ─── Props ──────────────────────────────────────────────────────
export interface StageBeatArcProps {
  beatProgress:    SharedValue<number>;
  /** 현재 비트 (0-based; -1 = 멈춤). 엔진/앱 상태와 동일. */
  currentBeat:     number;
  beatsPerMeasure: number;
  /** 글로벌 서브디비전 수 폴백 (비트별 커스텀 없을 때 사용) */
  subdivisionCount?: number;
  /** 비트별 타입 (인덱스 = 0-based beat) */
  beatTypes?: BeatType[];
  /** 비트별 서브디비전 패턴 (키 = String(0-based beat): "0", "1"…) */
  beatSubdivisions?: Record<string, BeatType[]>;
}

// ─── 메인 컴포넌트 ─────────────────────────────────────────────────
export function StageBeatArc({
  beatProgress,
  currentBeat,
  beatsPerMeasure,
  subdivisionCount = 1,
  beatTypes,
  beatSubdivisions,
}: StageBeatArcProps) {
  // beatProgress에 따라 스트립 전체 왼쪽 스윕
  const stripStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -beatProgress.value * ITEM_W }],
  }));

  const stopped = currentBeat < 0;
  // 슬롯: [-2, -1, 0, +1, +2, +3] (총 6 = VISIBLE+1; +3이 오른쪽 여백 채움)
  const offsets = [-2, -1, 0, 1, 2, 3] as const;

  return (
    <View style={s.root}>
      <Animated.View style={[s.strip, stripStyle]}>
        {offsets.map((offset) => {
          // beat0: 0-based
          const beat0 = stopped
            ? ((offset + 2) % beatsPerMeasure + beatsPerMeasure) % beatsPerMeasure
            : beatAt(currentBeat, offset, beatsPerMeasure);

          // 사용자에게 보이는 레이블은 1-based
          const label = String(beat0 + 1);

          const bType  = getBeatType(beat0, beatTypes);
          const isMuted = bType === "mute";
          const isCenter = !stopped && offset === 0;
          const dist = Math.abs(offset);

          const baseScale  = stopped ? 0.48 : tableAt(SCALE_T, dist);
          const scaleBonus = isCenter ? BEAT_SCALE_BONUS[bType] : 0;
          const scale      = baseScale + scaleBonus;

          const baseOpacity = stopped ? 0.18 : tableAt(OPACITY_T, dist);
          const opacity     = isMuted ? baseOpacity * 0.28 : baseOpacity;

          // 6시(하단) 효과: 현재(dist=0) = 가장 아래, 외곽 = 위
          const ty = stopped ? ARC_H * 0.4 : tableAt(TRANS_Y_T, dist);

          const color = isCenter ? BEAT_COLOR[bType] : "#ffffff";

          const subCount = Math.min(
            getSubdivCount(beat0, beatSubdivisions, subdivisionCount),
            8
          );
          const showDots = subCount > 1;

          return (
            <View
              key={offset}
              style={[s.slot, { width: ITEM_W, transform: [{ translateY: ty }] }]}
            >
              <Text
                style={[s.beatNum, { opacity, color, transform: [{ scale }] }]}
                numberOfLines={1}
              >
                {isMuted ? "—" : label}
              </Text>

              {showDots && (
                <View style={s.dotsRow}>
                  {Array.from({ length: subCount }, (_, i) =>
                    isCenter ? (
                      <AnimatedDot
                        key={i}
                        index={i}
                        total={subCount}
                        beatProgress={beatProgress}
                      />
                    ) : (
                      <StaticDot key={i} />
                    )
                  )}
                </View>
              )}
            </View>
          );
        })}
      </Animated.View>
    </View>
  );
}

// ─── 스타일 ──────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: {
    width: ITEM_W * VISIBLE,
    height: 110,
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
    fontSize: 48,
    fontFamily: "SpaceGrotesk_700Bold",
    lineHeight: 58,
    includeFontPadding: false,
    textAlign: "center",
  },
  dotsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 6,
    maxWidth: ITEM_W - 8,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
});
