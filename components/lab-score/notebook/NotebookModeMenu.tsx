import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export type NotebookMode = "ink" | "notes" | "select" | "settings";

type Props = {
  ko: boolean;
  mode: NotebookMode;
  onMode: (mode: NotebookMode) => void;
};

const options: Array<{ id: NotebookMode; icon: keyof typeof Ionicons.glyphMap; ko: string; en: string }> = [
  { id: "ink", icon: "pencil-outline", ko: "필기모드", en: "Ink" },
  { id: "notes", icon: "musical-note-outline", ko: "음표모드", en: "Notes" },
  { id: "select", icon: "scan-outline", ko: "선택모드", en: "Select" },
  { id: "settings", icon: "options-outline", ko: "설정", en: "Settings" },
];

export function NotebookModeMenu({ ko, mode, onMode }: Props) {
  return (
    <ScrollView style={styles.wrap} contentContainerStyle={{ padding: 12 }}>
        <View style={styles.menu} accessibilityRole="menu">
          {options.map((option) => (
            <Pressable
              key={option.id}
              testID={`notebook-mode-${option.id}`}
              accessibilityRole="menuitem"
              accessibilityState={{ selected: mode === option.id }}
              onPress={() => onMode(option.id)}
              style={[styles.option, mode === option.id && styles.optionActive]}
            >
              <Ionicons name={option.icon} size={17} color={mode === option.id ? "#745b3a" : "#857a69"} />
              <Text style={[styles.optionText, mode === option.id && styles.optionTextActive]}>{ko ? option.ko : option.en}</Text>
              {mode === option.id ? <Ionicons name="checkmark" size={16} color="#8c7049" /> : null}
            </Pressable>
          ))}
        </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, minHeight: 0 },
  menu: { gap: 6 },
  option: { minHeight: 46, borderRadius: 9, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 9 },
  optionActive: { backgroundColor: "#f3ede3" },
  optionText: { flex: 1, color: "#62594d", fontSize: 12, fontWeight: "600" },
  optionTextActive: { color: "#59462e" },
});
