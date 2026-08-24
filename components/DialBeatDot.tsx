import React, { useCallback, useEffect } from "react";
import { View, Text, Pressable } from "react-native";
import Animated, {
  useAnimatedStyle,
  useAnimatedReaction,
  withTiming,
  withSequence,
  useSharedValue,
  Easing,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "@/contexts/ThemeContext";
import type { BeatType } from "@/lib/metronome-engine";
import { Radius, FontSize } from "@/constants/tokens";
import { accentGradientEdge, onAccentColor, onAccentShadow } from "@/lib/color-contrast";

export interface DialBeatDotProps {
  index: number;
  total: number;
  isActive: boolean;
  beatType: BeatType;
  onPress: () => void;
  isDropTarget: boolean;
  subdivisionCount: number;
  beatDirection?: "cw" | "ccw";
  dDialRadius: number;
  dDotRadiusFromCenter: number;
  dDotSize: number;
}

export function DialBeatDot({
  index,
  total,
  isActive,
  beatType,
  onPress,
  isDropTarget,
  subdivisionCount,
  beatDirection = "cw",
  dDialRadius,
  dDotRadiusFromCenter,
  dDotSize,
}: DialBeatDotProps) {
  const { colors: C } = useTheme();
  const isStrong = beatType === "strong";
  const isAccent = beatType === "accent" || isStrong;
  const isMute = beatType === "mute";
  const dirMul = beatDirection === "ccw" ? -1 : 1;
  const angle = dirMul * (index / total) * 2 * Math.PI - Math.PI / 2;
  const size = dDotSize;
  const x = dDialRadius + dDotRadiusFromCenter * Math.cos(angle) - size / 2;
  const y = dDialRadius + dDotRadiusFromCenter * Math.sin(angle) - size / 2;

  const popScale = useSharedValue(1);
  const beatScale = useSharedValue(1);
  const beatBg = useSharedValue(
    isMute ? "transparent" : isAccent ? C.accentMuted : C.textTertiary
  );
  const beatBorder = useSharedValue(
    isMute ? C.textSecondary : "transparent"
  );
  const beatOpacity = useSharedValue(isStrong ? 0.85 : 1);

  const activeSV = useSharedValue(isActive ? 1 : 0);
  useEffect(() => {
    activeSV.value = isActive ? 1 : 0;
  }, [isActive]);

  const accentColor = C.accent;
  const accentMutedColor = C.accentMuted;

  const handlePress = useCallback(() => {
    popScale.value = withSequence(
      withTiming(0.85, { duration: 40, easing: Easing.out(Easing.quad) }),
      withTiming(1, { duration: 100, easing: Easing.out(Easing.quad) })
    );
    onPress();
  }, [onPress]);

  const beatTypeTag = useSharedValue(0);
  const colorHash = accentColor.split('').reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0);
  const currentTag = (isMute ? 1 : isStrong ? 2 : isAccent ? 3 : 0) + colorHash * 0.0000001;
  useEffect(() => {
    beatTypeTag.value = currentTag;
  }, [currentTag]);

  useAnimatedReaction(
    () => [activeSV.value, beatTypeTag.value] as const,
    ([curActive, _curTag], prev) => {
      const prevActive = prev ? prev[0] : -1;
      const activeChanged = curActive !== prevActive;
      const active = curActive === 1;
      if (isMute) {
        if (active) {
          if (activeChanged) {
            beatScale.value = withSequence(
              withTiming(1.15, { duration: 50, easing: Easing.out(Easing.quad) }),
              withTiming(1, { duration: 200, easing: Easing.out(Easing.quad) })
            );
          }
          // 테마 중립 플래시 — 고정 회색 대신 현재 팔레트의 overlay 색 사용
          beatBg.value = withTiming(C.overlay10, { duration: 50 });
          beatBorder.value = withTiming(C.textSecondary, { duration: 50 });
        } else {
          if (activeChanged) {
            beatScale.value = withTiming(1, { duration: 150 });
          }
          beatBg.value = withTiming("transparent", { duration: 150 });
          beatBorder.value = withTiming(C.textSecondary, { duration: 150 });
        }
      } else if (active) {
        if (activeChanged) {
          beatScale.value = withSequence(
            withTiming(isStrong ? 1.35 : 1.2, { duration: 50, easing: Easing.out(Easing.quad) }),
            withTiming(1, { duration: 200, easing: Easing.out(Easing.quad) })
          );
        }
        beatBg.value = withTiming(
          isAccent ? accentColor : C.text,
          { duration: 50 }
        );
        beatBorder.value = withTiming(isStrong ? accentColor : "transparent", { duration: 50 });
        beatOpacity.value = withTiming(1, { duration: 50 });
      } else {
        if (activeChanged) {
          beatScale.value = withTiming(1, { duration: 150 });
        }
        beatBg.value = withTiming(
          isStrong ? accentColor : isAccent ? accentMutedColor : C.textTertiary,
          { duration: 150 }
        );
        beatBorder.value = withTiming(isStrong ? accentColor : "transparent", { duration: 150 });
        beatOpacity.value = withTiming(isStrong ? 0.85 : 1, { duration: 150 });
      }
    },
    [isMute, isStrong, isAccent, accentColor, accentMutedColor]
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: beatScale.value * popScale.value }],
    backgroundColor: beatBg.value,
    borderColor: beatBorder.value,
    opacity: beatOpacity.value,
  }));

  return (
    <Pressable
      onPress={handlePress}
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: size,
        height: size,
        zIndex: 10,
      }}
      hitSlop={10}
      pressRetentionOffset={{ top: 20, left: 20, right: 20, bottom: 20 }}
    >
      {isStrong ? (
        <Animated.View
          style={[
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              overflow: "hidden",
            },
            animatedStyle,
          ]}
        >
          {/* LinearGradient에 자식(View/Text)을 중첩시키면 이 빌드에서 배경은
              그려지는데 자식 콘텐츠가 합성되지 않는 문제가 있었다 (2026-08-25
              실기기 확인 — "S" 표시가 항상 안 보임). 그라디언트는 자식 없이
              배경만 그리고, 안쪽 링/텍스트는 형제 요소로 절대위치 오버레이한다. */}
          <LinearGradient
            key={C.accent}
            colors={[accentGradientEdge(C.accent), C.accent, C.accent]}
            locations={[0, 0.4, 1]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={{ width: size, height: size, borderRadius: size / 2 }}
          />
          <View style={{ position: "absolute", top: 5, left: 5, width: size - 10, height: size - 10, borderRadius: (size - 10) / 2, backgroundColor: C.accent }} />
          <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: onAccentColor(C.accent), fontSize: FontSize.caption, fontWeight: "bold" as const, lineHeight: 13, textShadowColor: onAccentShadow(C.accent), textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 3 }}>S</Text>
          </View>
        </Animated.View>
      ) : (
        <Animated.View
          style={[
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: isMute
                ? "transparent"
                : isAccent
                ? C.accentMuted
                : C.textTertiary,
              borderWidth: isMute ? 2.5 : 0,
              borderColor: isMute ? C.textSecondary : "transparent",
            },
            animatedStyle,
          ]}
        />
      )}
      {isDropTarget && (
        <View
          style={{
            position: "absolute",
            borderWidth: 2,
            borderStyle: "dashed" as "dashed",
            opacity: 0.8,
            width: size + 12,
            height: size + 12,
            borderRadius: (size + 12) / 2,
            top: -6,
            left: -6,
            borderColor: C.accent,
          }}
        />
      )}
      {subdivisionCount > 1 && (
        <View style={{
          position: "absolute",
          bottom: -4,
          right: -4,
          width: 16,
          height: 16,
          borderRadius: Radius.md,
          borderWidth: 1,
          alignItems: "center" as const,
          justifyContent: "center" as const,
          borderColor: C.accent,
        }}>
          <Text style={{
            fontFamily: "SpaceGrotesk_700Bold",
            fontSize: 9,
            color: C.accent,
          }}>{subdivisionCount}</Text>
        </View>
      )}
    </Pressable>
  );
}
