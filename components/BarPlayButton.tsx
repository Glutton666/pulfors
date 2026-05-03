import React from "react";
import { View, Pressable, Platform, ActivityIndicator, type ViewStyle, type StyleProp } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

export interface BarPlayButtonProps {
  isPlaying: boolean;
  isPreparing: boolean;
  barLoopMode: "loop" | "once";
  onTogglePlay: () => void;
  onBarLoopModeChange: (mode: "loop" | "once") => void;
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
  baseStyle,
  accentColor,
  dangerColor,
  backgroundColor,
  iconSize,
  badgeIconSize,
  sizeOverride,
  testID = "bar-play-button",
}: BarPlayButtonProps) {
  const handleLongPress = () => {
    const next = barLoopMode === "loop" ? "once" : "loop";
    onBarLoopModeChange(next);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  };

  return (
    <View>
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
            style={!isPlaying ? { marginLeft: 2 } : undefined}
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
    </View>
  );
}
