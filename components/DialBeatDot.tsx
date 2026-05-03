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
          beatBg.value = withTiming("rgba(72, 79, 88, 0.35)", { duration: 50 });
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
          <LinearGradient
            key={C.accent}
            colors={[C.white, C.accent, C.accent]}
            locations={[0, 0.4, 1]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={{ width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center" }}
          >
            <View style={{ width: size - 10, height: size - 10, borderRadius: (size - 10) / 2, backgroundColor: C.accent, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: C.white, fontSize: FontSize.caption, fontWeight: "bold" as const, lineHeight: 13, textShadowColor: "rgba(0,0,0,0.5)", textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 3 }}>S</Text>
            </View>
          </LinearGradient>
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
