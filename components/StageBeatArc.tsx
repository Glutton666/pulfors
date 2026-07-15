"use no memo";
/**
 * StageBeatArc — 반원형 비트 번호 아크.
 *
 * 현재 비트는 6시(하단 중앙)에, 이웃 비트들은 좌우로 호를 그리며 위로 올라갑니다.
 * beatProgress(0→1)에 따라 스트립 전체가 왼쪽으로 스윕됩니다.
 *
 *        [prev-2]  [prev-1]  [next+1]  [next+2]   ← higher (11, 10, 2, 1 o'clock)
 *                  [ CURRENT ]                     ← 6 o'clock (bottom center)
 *                    ○ ○ ○ ○                       ← per-beat subdivision dots
 *
 * 비트 타입별 색상:
 *   strong → 흰색, accent → 따뜻한 노란색 (#FFD54F)
 *   normal → 흰색, mute  → "—" 기호, 매우 흐림
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import type { BeatType } from "@/lib/metronome-engine";

// ─── 레이아웃 상수 ────────────────────────────────────────────────
const ITEM_W = 66;    // 슬롯 너비(px)
const VISIBLE = 5;    // 화면에 보이는 슬롯 수
const ARC_H  = 26;   // 현재 비트의 최대 아래 변위 (6시 효과)

// 중심에서의 거리(0=현재, 1=인접, 2…) → 시각 속성
// 현재 비트(dist=0): 가장 아래(ARC_H), 외곽(dist=2+): 가장 위(0)
const SCALE_T    = [1.00, 0.64, 0.44, 0.28] as const;
const OPACITY_T  = [1.00, 0.46, 0.22, 0.10] as const;
const TRANS_Y_T  = [ARC_H, ARC_H * 0.45, 0, 0] as const;  // 현재=아래, 외곽=위

// ─── 비트 타입별 텍스트 색상 ──────────────────────────────────────
const BEAT_COLOR: Record<BeatType, string> = {
  strong: "#ffffff",
  accent: "#FFD54F",   // 따뜻한 노란색
  normal: "#ffffff",
  mute:   "#ffffff",   // opacity로 제어
};
// strong 비트는 살짝 크게
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

function beatAt(current: number, offset: number, total: number): number {
  return ((current - 1 + offset + total * 100) % total) + 1;
}

function getBeatType(beat: number, types?: BeatType[]): BeatType {
  if (!types || types.length === 0) return "normal";
  return types[(beat - 1) % types.length] ?? "normal";
}

/** 비트에 해당하는 서브디비전 수 */
function getSubdivCount(
  beat: number,
  beatSubdivisions?: Record<string, BeatType[]>,
  globalSubdivCount?: number,
): number {
  if (beatSubdivisions) {
    const custom = beatSubdivisions[String(beat)];
    if (custom && custom.length > 0) return custom.length;
  }
  return globalSubdivCount ?? 1;
}

// ─── 서브디비전 점 (애니메이션 — 현재 비트 전용) ─────────────────
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
      opacity:         filled ? 0.90 : 0.22,
      backgroundColor: filled ? "#ffffff" : "rgba(255,255,255,0.4)",
    };
  });
  return <Animated.View style={[s.dot, style]} />;
}

/** 정적 점 (현재 비트 외 비트의 서브디비전 표시) */
function StaticDot() {
  return <View style={[s.dot, { opacity: 0.18, backgroundColor: "rgba(255,255,255,0.5)" }]} />;
}

// ─── Props ──────────────────────────────────────────────────────
export interface StageBeatArcProps {
  beatProgress:    SharedValue<number>;
  currentBeat:     number;               // 1-indexed; -1 = 멈춤
  beatsPerMeasure: number;
  subdivisionCount?: number;             // 글로벌 서브디비전 수 폴백
  beatTypes?:      BeatType[];           // 길이 = beatsPerMeasure
  /** 비트별 서브디비전 패턴 (키 = String(1-indexed beat)) */
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
  // beatProgress에 따라 스트립 전체 왼쪽 스윕 (ITEM_W 만큼 이동)
  const stripStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -beatProgress.value * ITEM_W }],
  }));

  const stopped = currentBeat < 1;
  // 슬롯: [-2, -1, 0, +1, +2, +3] (총 6 = VISIBLE+1, 오른쪽 여백 채움)
  const offsets = [-2, -1, 0, 1, 2, 3] as const;

  return (
    <View style={s.root}>
      <Animated.View style={[s.strip, stripStyle]}>
        {offsets.map((offset) => {
          const beat = stopped
            ? ((offset + 2 + beatsPerMeasure) % beatsPerMeasure) + 1
            : beatAt(currentBeat, offset, beatsPerMeasure);

          const bType   = getBeatType(beat, beatTypes);
          const isMuted = bType === "mute";
          const isCenter = !stopped && offset === 0;
          const dist = Math.abs(offset);

          const baseScale   = stopped ? 0.48 : tableAt(SCALE_T, dist);
          const scaleBonus  = isCenter ? BEAT_SCALE_BONUS[bType] : 0;
          const scale       = baseScale + scaleBonus;

          const baseOpacity = stopped ? 0.18 : tableAt(OPACITY_T, dist);
          const opacity     = isMuted ? baseOpacity * 0.28 : baseOpacity;

          // 6시(하단) 효과: 현재 비트 = ARC_H 아래, 외곽 비트 = 위
          const ty = stopped ? ARC_H * 0.4 : tableAt(TRANS_Y_T, dist);

          const color = isCenter ? BEAT_COLOR[bType] : "#ffffff";

          // 서브디비전 점 개수: 비트별 커스텀 우선, 없으면 global
          const subCount = Math.min(
            getSubdivCount(beat, beatSubdivisions, subdivisionCount),
            8
          );
          const showDots = subCount > 1;

          return (
            <View
              key={offset}
              style={[s.slot, { width: ITEM_W, transform: [{ translateY: ty }] }]}
            >
              {/* 비트 번호 / 뮤트 기호 */}
              <Text
                style={[
                  s.beatNum,
                  { opacity, color, transform: [{ scale }] },
                ]}
                numberOfLines={1}
              >
                {isMuted ? "—" : String(beat)}
              </Text>

              {/* 서브디비전 점 */}
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
