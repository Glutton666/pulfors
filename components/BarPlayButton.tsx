import React, { useRef } from "react";
import { View, Pressable, Platform, ActivityIndicator, PanResponder, Animated, type ViewStyle, type StyleProp } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Spacing } from "@/constants/tokens";

export interface BarPlayButtonProps {
  isPlaying: boolean;
  isPreparing: boolean;
  barLoopMode: "loop" | "once";
  onTogglePlay: () => void;
  onBarLoopModeChange: (mode: "loop" | "once") => void;
  blockPlayMode?: "sequential" | "loop" | "random";
  onBlockPlayModeChange?: (mode: "sequential" | "loop" | "random") => void;
  baseStyle: StyleProp<ViewStyle>;
  accentColor: string;
  dangerColor: string;
  backgroundColor: string;
  iconSize: number;
  badgeIconSize: number;
  sizeOverride?: { width: number; height: number; borderRadius: number };
  testID?: string;
}

export function BarPlayButton({
  isPlaying,
  isPreparing,
  barLoopMode,
  onTogglePlay,
  onBarLoopModeChange,
  blockPlayMode,
  onBlockPlayModeChange,
  baseStyle,
  accentColor,
  dangerColor,
  backgroundColor,
  iconSize,
  badgeIconSize,
  sizeOverride,
  testID = "bar-play-button",
}: BarPlayButtonProps) {
  const shakeXRef = useRef(0);
  const lastDirRef = useRef<"left" | "right" | null>(null);
  const dirChangesRef = useRef(0);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const shakePanel = PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_e, g) =>
      !isPlaying && Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.2,
    onPanResponderGrant: () => {
      shakeXRef.current = 0;
      lastDirRef.current = null;
      dirChangesRef.current = 0;
    },
    onPanResponderMove: (_e, g) => {
      const dx = g.dx - shakeXRef.current;
      const curDir: "left" | "right" = dx < 0 ? "left" : "right";
      if (lastDirRef.current && curDir !== lastDirRef.current && Math.abs(dx) > 12) {
        dirChangesRef.current++;
        shakeXRef.current = g.dx;
        if (dirChangesRef.current >= 2 && onBlockPlayModeChange) {
          dirChangesRef.current = 0;
          const next = blockPlayMode === "random" ? "sequential" : "random";
          onBlockPlayModeChange(next);
          if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          Animated.sequence([
            Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
          ]).start();
        }
      }
      if (lastDirRef.current !== curDir && Math.abs(dx) > 6) {
        lastDirRef.current = curDir;
      }
    },
    onPanResponderRelease: () => {
      shakeXRef.current = 0;
      lastDirRef.current = null;
      dirChangesRef.current = 0;
    },
  });

  const handleLongPress = () => {
    const next = barLoopMode === "loop" ? "once" : "loop";
    onBarLoopModeChange(next);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  };

  const isRandom = blockPlayMode === "random";

  return (
    <Animated.View style={{ transform: [{ translateX: shakeAnim }] }} {...shakePanel.panHandlers}>
      <Pressable
        onPress={onTogglePlay}
        onLongPress={handleLongPress}
        delayLongPress={400}
        style={({ pressed }) => [
          baseStyle,
          sizeOverride,
          pressed && { opacity: 0.7 },
          isPreparing && { opacity: 0.5 },
          barLoopMode === "loop" && { borderWidth: 1.5, borderColor: accentColor },
        ]}
        testID={testID}
        disabled={isPreparing}
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? "정지 / Stop" : "재생 / Play"}
        accessibilityState={{ busy: isPreparing, disabled: isPreparing }}
        accessibilityHint={
          barLoopMode === "loop"
            ? "길게 누르면 한 번만 재생 모드로 변경 / Long press to switch to once mode"
            : "길게 누르면 반복 재생 모드로 변경 / Long press to switch to loop mode"
        }
      >
        {isPreparing ? (
          <ActivityIndicator size="small" color={accentColor} />
        ) : (
          <Ionicons
            name={isPlaying ? "stop" : "play"}
            size={iconSize}
            color={isPlaying ? dangerColor : accentColor}
            style={!isPlaying ? { marginLeft: Spacing.xxs } : undefined}
          />
        )}
      </Pressable>
      {barLoopMode === "loop" && (
        <View
          style={{
            position: "absolute",
            top: -6,
            right: -6,
            backgroundColor: accentColor,
            borderRadius: 7,
            width: 14,
            height: 14,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="repeat" size={badgeIconSize} color={backgroundColor} />
        </View>
      )}
      {isRandom && !isPlaying && (
        <View
          style={{
            position: "absolute",
            bottom: -6,
            right: -6,
            backgroundColor: accentColor + "CC",
            borderRadius: 7,
            width: 14,
            height: 14,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="shuffle" size={badgeIconSize} color={backgroundColor} />
        </View>
      )}
    </Animated.View>
  );
}
