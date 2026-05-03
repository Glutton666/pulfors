import React from "react";
import { Pressable, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export interface BeatStepperButtonProps {
  direction: "minus" | "plus";
  onPress: () => void;
  disabled: boolean;
  iconSize: number;
  iconColor: string;
  baseStyle: StyleProp<ViewStyle>;
  testID: string;
}

export function BeatStepperButton({
  direction,
  onPress,
  disabled,
  iconSize,
  iconColor,
  baseStyle,
  testID,
}: BeatStepperButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityState={{ disabled }}
      style={[baseStyle, disabled && { opacity: 0.3 }]}
      hitSlop={8}
      testID={testID}
    >
      <Ionicons name={direction === "minus" ? "remove" : "add"} size={iconSize} color={iconColor} />
    </Pressable>
  );
}
