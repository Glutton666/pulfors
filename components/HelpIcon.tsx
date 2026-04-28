import React from "react";
import { Alert, Platform, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/contexts/ThemeContext";
import { useScale } from "@/lib/scale";

interface HelpIconProps {
  title: string;
  message: string;
  size?: number;
  color?: string;
}

export function HelpIcon({ title, message, size, color }: HelpIconProps) {
  const { colors: C } = useTheme();
  const S = useScale();
  const iconSize = size ?? S.ms(15, 0.4);
  const iconColor = color ?? C.textTertiary;

  const onPress = () => {
    if (Platform.OS === "web") {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={message}
    >
      <Ionicons name="help-circle-outline" size={iconSize} color={iconColor} />
    </Pressable>
  );
}
