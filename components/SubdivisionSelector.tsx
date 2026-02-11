import React from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";

interface SubdivisionSelectorProps {
  subdivisions: number;
  onSubdivisionsChange: (subs: number) => void;
}

const SUBDIVISION_OPTIONS = [1, 2, 3, 4];

const SUBDIVISION_LABELS: Record<number, string> = {
  1: "\u2669",
  2: "\u266a",
  3: "3",
  4: "\u266c",
};

export function SubdivisionSelector({
  subdivisions,
  onSubdivisionsChange,
}: SubdivisionSelectorProps) {
  const handlePress = (value: number) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onSubdivisionsChange(value);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>NOTE</Text>
      <View style={styles.optionsRow}>
        {SUBDIVISION_OPTIONS.map((value) => {
          const isActive = subdivisions === value;
          return (
            <Pressable
              key={value}
              onPress={() => handlePress(value)}
              style={({ pressed }) => [
                styles.option,
                isActive && styles.optionActive,
                pressed && styles.optionPressed,
              ]}
              testID={`subdivision-${value}`}
            >
              <Text
                style={[
                  styles.optionText,
                  isActive && styles.optionTextActive,
                ]}
              >
                {SUBDIVISION_LABELS[value]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  label: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 10,
    color: Colors.textTertiary,
    letterSpacing: 2,
  },
  optionsRow: {
    flexDirection: "row",
    gap: 2,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    padding: 2,
  },
  option: {
    width: 32,
    height: 28,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  optionActive: {
    backgroundColor: Colors.accentDim,
  },
  optionPressed: {
    opacity: 0.6,
  },
  optionText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 14,
    color: Colors.textTertiary,
  },
  optionTextActive: {
    color: Colors.accent,
  },
});
