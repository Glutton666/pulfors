import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
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
    <View style={styles.menu} accessibilityRole="menu">
      {options.map((option) => {
        const selected = mode === option.id && option.id !== "settings";
        return (
          <Pressable
            key={option.id}
            testID={`notebook-mode-${option.id}`}
            accessibilityRole="menuitem"
            accessibilityLabel={ko ? option.ko : option.en}
            accessibilityState={{ selected }}
            onPress={() => onMode(option.id)}
            style={[styles.option, selected && styles.optionActive]}
          >
            <Ionicons name={option.icon} size={20} color={selected ? "#745b3a" : "#746a5b"} />
            {selected ? <View style={styles.selectedMark} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  menu: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    padding: 4,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#ded6c9",
    backgroundColor: "#fffdf8",
    elevation: 8,
    shadowColor: "#201e1a",
    shadowOpacity: 0.17,
    shadowRadius: 12,
  },
  option: { width: 46, height: 46, borderRadius: 11, alignItems: "center", justifyContent: "center", position: "relative" },
  optionActive: { backgroundColor: "#eee5d7" },
  selectedMark: { position: "absolute", bottom: 5, width: 4, height: 4, borderRadius: 2, backgroundColor: "#8c7049" },
});
