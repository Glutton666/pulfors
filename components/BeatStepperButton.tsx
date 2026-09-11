import React from "react";
import { Pressable, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { TranslationFn } from "@/lib/i18n";

export interface BeatStepperButtonProps {
  direction: "minus" | "plus";
  onPress: () => void;
  disabled: boolean;
  iconSize: number;
  iconColor: string;
  baseStyle: StyleProp<ViewStyle>;
  testID: string;
  t: TranslationFn;
}

export function BeatStepperButton({
  direction,
  onPress,
  disabled,
  iconSize,
  iconColor,
  baseStyle,
  testID,
  t,
}: BeatStepperButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={direction === "minus" ? t("barModeView", "beatStepperDecrease") : t("barModeView", "beatStepperIncrease")}
      accessibilityState={{ disabled }}
      // Keep the visual size supplied by callers, but never let the hit target
      // fall below the platform accessibility minimum.
      style={[baseStyle, { minWidth: 44, minHeight: 44 }, disabled && { opacity: 0.3 }]}
      hitSlop={8}
      testID={testID}
    >
      <Ionicons name={direction === "minus" ? "remove" : "add"} size={iconSize} color={iconColor} />
    </Pressable>
  );
}
