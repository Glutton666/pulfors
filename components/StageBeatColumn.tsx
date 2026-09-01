"use no memo";
/**
 * StageBeatColumn — 수직 비트 디스플레이 (무대 모드 전용).
 *
 * 현재/다음 재생을 각각 비트와 서브디비전의 2줄 그룹으로 표시한다.
 * 현재 그룹은 강하게, 다음 그룹은 낮은 대비로 표시한다.
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
  maxWidth,
  testID,
}: {
  types: BeatType[];
  theme: "dark" | "light";
  size?: number;
  /** 재생 중 현재 활성 서브디비전 인덱스 — 해당 점을 크고 밝게 하이라이트 */
  activeIndex?: number;
  /** 사용 가능한 가로 폭 — 점 개수가 많아도 잘리지 않도록 크기를 줄인다 */
  maxWidth?: number;
  testID?: string;
}) {
  if (types.length === 0) return null;
  // 활성 인덱스가 표시 패턴 범위를 벗어나면(예: 블록 자체 서브디비전 재생 중)
  // 잘못된 점을 강조하지 않도록 하이라이트를 생략한다.
  if (activeIndex != null && (activeIndex < 0 || activeIndex >= types.length)) activeIndex = undefined;
  // 무대용 가시성: 일반 점도 어두운 배경에서 멀리서 보이도록 충분히 밝게.
  const dotBase     = theme === "dark" ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.55)";
  const activeRing  = theme === "dark" ? "#FFD54F" : "#B8860B";
  // 두 줄(현재+다음)로 세로 공간을 쓰는 대신 가로로 넓게 펼친다.
  // 점 개수가 많으면 화면을 넘지 않도록 간격을 줄인다.
  const n = types.length;
  const ratio = n <= 4 ? 2.2 : n <= 8 ? 1.2 : 0.7;
  // 첫 점 1.5배 + 활성 점 1.6배 여유분(+1.6유닛)을 포함해 전체 폭이
  // maxWidth 안에 들어가도록 점 크기를 줄인다. (8분할 이상에서 잘려 안 보이던 문제)
  if (maxWidth && maxWidth > 0) {
    const units = n + (n - 1) * ratio + 1.6;
    size = Math.max(8, Math.min(size, Math.floor((maxWidth - 16) / units)));
  }
  const gap = size * ratio;
  const strongBg  = theme === "dark" ? "#ffffff" : "#111111";
  const strongFg  = theme === "dark" ? "#111111" : "#ffffff";
  const accentCol = theme === "dark" ? "#FFD54F" : "#B8860B";
  const muteEdge  = theme === "dark" ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.45)";
  return (
    <View style={[styles.subdivRow, { gap }]} testID={testID ?? "stage-subdiv-dots"}>
      {types.map((t, i) => {
        const isActive = activeIndex === i;
        // 타입별 약호: strong=흰 바탕 S, accent=노란 채움 A, mute=속 빈 링, normal=회색 점
        const color =
          t === "accent" ? accentCol
          : t === "mute"   ? "transparent"
          : t === "strong" ? strongBg
          : isActive ? strongBg
          : dotBase;
        const w = isActive ? size * 1.6 : i === 0 ? size * 1.5 : size;
        const h = isActive ? size * 1.3 : size;
        const label = t === "strong" ? "S" : t === "accent" ? "A" : null;
        // 활성 점은 링만 두르지 않고 노란색으로 꽉 채워 확실히 강조
        const bg = isActive
          ? activeRing
          : t === "mute" ? "transparent" : color;
        const labelColor = isActive
          ? "#3a2c00"
          : t === "strong" ? strongFg : theme === "dark" ? "#3a2c00" : "#fff8e1";
        return (
          <View
            key={i}
            style={{
              width: w,
              height: h,
              borderRadius: h / 2,
              backgroundColor: bg,
              opacity: isActive ? 1 : i === 0 ? 1 : 0.9,
              borderWidth: !isActive && t === "mute" ? 2 : 0,
              borderColor: muteEdge,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {label != null && size >= 12 && (
              <Text
                style={{
                  color: labelColor,
                  fontSize: Math.round(h * 0.62),
                  lineHeight: Math.round(h * 0.8),
                  fontWeight: "800",
                  includeFontPadding: false,
                }}
              >
                {label}
              </Text>
            )}
          </View>
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
  labels?: {
    current: string;
    next: string;
    beat: string;
    subdivision: string;
  };
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
  labels = {
    current: "현재 재생 중",
    next: "다음 재생",
    beat: "비트",
    subdivision: "서브디비전",
  },
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

  const dividerColor = theme === "dark" ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)";

  // 컨테이너 높이에 맞춰 축소해 네 줄(현재/다음 비트와 서브디비전)이
  // 작은 화면에서도 모두 보이도록 한다.
  const [rootH, setRootH] = useState(0);
  const [rootW, setRootW] = useState(0);
  const fit = rootH > 0 ? Math.min(1, rootH / 330) : 1;
  const curFont  = Math.round(78 * fit);
  const nextFont = Math.round(58 * fit);
  const subSize  = Math.max(12, Math.round(21 * fit));
  const currentSubdiv = subdivisionTypes ?? [];
  const nextSubdiv = nextSubdivisionTypes ?? [];

  const SubdivisionLine = ({
    types,
    activeIndex,
    testID,
    muted = false,
  }: {
    types: BeatType[];
    activeIndex?: number;
    testID: string;
    muted?: boolean;
  }) => (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, { color: muted ? nextColor : curColor }]}>
        {labels.subdivision}
      </Text>
      {types.length > 0 ? (
        <SubdivDots
          types={types}
          theme={theme}
          size={subSize}
          maxWidth={rootW > 0 ? rootW - 132 : undefined}
          activeIndex={activeIndex}
          testID={testID}
        />
      ) : (
        <Text testID={testID} style={[styles.emptyDetail, { color: muted ? nextColor : curColor }]}>
          —
        </Text>
      )}
    </View>
  );

  return (
    <View
      style={styles.root}
      onLayout={(e) => { setRootH(e.nativeEvent.layout.height); setRootW(e.nativeEvent.layout.width); }}
      {...swipePR.panHandlers}
    >
      <Animated.View style={[styles.inner, slideStyle]}>

        <View
          testID="stage-current-count"
          style={[
            styles.countGroup,
            {
              borderColor: dividerColor,
              backgroundColor: theme === "dark"
                ? "rgba(255,255,255,0.045)"
                : "rgba(0,0,0,0.035)",
            },
          ]}
        >
          <Text style={[styles.groupLabel, { color: curColor }]}>{labels.current}</Text>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: curColor }]}>{labels.beat}</Text>
            <Text
              testID="stage-current-beat"
              style={[styles.beatNum, styles.currentBeatNum, { color: curColor, fontSize: curFont, lineHeight: curFont + 4 }]}
            >
              {String(cur0 + 1)}
            </Text>
          </View>
          <SubdivisionLine
            types={currentSubdiv}
            activeIndex={!stopped && activeSubNote != null && activeSubNote >= 0 ? activeSubNote : undefined}
            testID="stage-current-subdivision"
          />
        </View>

        <View style={[styles.groupDivider, { backgroundColor: dividerColor }]} />

        <View
          testID="stage-next-count"
          style={[
            styles.countGroup,
            styles.nextCountGroup,
            {
              borderColor: dividerColor,
              backgroundColor: theme === "dark"
                ? "rgba(255,255,255,0.018)"
                : "rgba(0,0,0,0.018)",
            },
          ]}
        >
          <Text style={[styles.groupLabel, { color: nextColor }]}>{labels.next}</Text>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: nextColor }]}>{labels.beat}</Text>
            <Text
              testID="stage-next-beat"
              style={[styles.beatNum, styles.nextBeatNum, { color: nextColor, fontSize: nextFont, lineHeight: nextFont + 4 }]}
            >
              {String(next0 + 1)}
            </Text>
          </View>
          <SubdivisionLine
            types={nextSubdiv}
            testID="stage-next-subdivision"
            muted
          />
        </View>

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
    gap: 10,
  },
  countGroup: {
    width: "100%",
    maxWidth: 430,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  nextCountGroup: {
    opacity: 0.9,
  },
  groupLabel: {
    alignSelf: "center",
    fontSize: 12,
    fontFamily: "SpaceGrotesk_600SemiBold",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  detailRow: {
    minHeight: 58,
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
  },
  detailLabel: {
    width: 112,
    fontSize: 14,
    fontFamily: "SpaceGrotesk_500Medium",
    opacity: 0.72,
  },
  emptyDetail: {
    fontSize: 22,
    fontFamily: "SpaceGrotesk_600SemiBold",
    includeFontPadding: false,
  },
  groupDivider: {
    width: 42,
    height: 1,
    marginVertical: 1,
  },
  beatNum: {
    fontSize: 148,
    fontFamily: "SpaceGrotesk_700Bold",
    includeFontPadding: false,
  },
  currentBeatNum: {
    flex: 1,
    textAlign: "right",
  },
  nextBeatNum: {
    flex: 1,
    textAlign: "right",
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
    alignItems: "center",
    justifyContent: "flex-end",
    flex: 1,
    minHeight: 24,
  },
});
