import React from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "@/contexts/ThemeContext";

export interface RhythmInputDockProps {
  toolbar: React.ReactNode;
  children: React.ReactNode;
  compact?: boolean;
}

/**
 * A restrained bottom dock for rhythm entry controls. The workspace remains
 * responsible for sizing the score above it and for all input/gesture logic.
 */
export function RhythmInputDock({
  toolbar,
  children,
  compact = false,
}: RhythmInputDockProps) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.dock,
        {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          paddingHorizontal: compact ? 8 : 12,
          paddingTop: compact ? 6 : 9,
          paddingBottom: compact ? 6 : 10,
        },
      ]}
    >
      <View
        style={[
          styles.toolbar,
          {
            minHeight: compact ? 30 : 36,
            marginBottom: compact ? 5 : 8,
            paddingBottom: compact ? 5 : 7,
            borderBottomColor: colors.border,
          },
        ]}
      >
        {toolbar}
      </View>
      <View style={[styles.inputArea, compact && styles.compactInputArea]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  dock: {
    width: "100%",
    minHeight: 0,
    flexShrink: 1,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
    flexShrink: 1,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  inputArea: {
    minHeight: 0,
    flexShrink: 1,
    width: "100%",
  },
  compactInputArea: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
});

export default RhythmInputDock;
