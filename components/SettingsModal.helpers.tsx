import React from "react";
import { View, Text, Pressable, Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/contexts/ThemeContext";
import { make_styles } from "./SettingsModal.styles";
import type { SoundSet } from "@/lib/storage";
import type { TranslationFn } from "@/lib/i18n";

export type TripleValue = "all" | "accent" | "off";
export type SoundSetOption = { value: SoundSet; label: string; icon: string };
export type TripleOption = { value: TripleValue; label: string };

export function getSoundSetOptions(t: TranslationFn): SoundSetOption[] {
  return [
    { value: "classic", label: t("soundSets", "classic"), icon: "music-note" },
    { value: "woodblock", label: t("soundSets", "woodblock"), icon: "music-box" },
    { value: "digital", label: t("soundSets", "digital"), icon: "sine-wave" },
    { value: "rimshot", label: t("soundSets", "rimshot"), icon: "music-circle-outline" },
  ];
}

export function getTripleOptions(t: TranslationFn): TripleOption[] {
  return [
    { value: "all", label: t("tripleOptions", "all") },
    { value: "accent", label: t("tripleOptions", "accent") },
    { value: "off", label: t("tripleOptions", "off") },
  ];
}

export interface TripleSelectorProps {
  value: TripleValue;
  onChange: (v: TripleValue) => void;
  accentColor: string;
  accentDimColor: string;
  options: TripleOption[];
}

export function TripleSelector({
  value,
  onChange,
  accentColor,
  accentDimColor,
  options,
}: TripleSelectorProps) {
  const { colors: C } = useTheme();
  const styles = make_styles(C);
  return (
    <View style={styles.tripleRow}>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <Pressable
            key={opt.value}
            style={[
              styles.tripleBtn,
              active && [
                styles.tripleBtnActive,
                { borderColor: accentColor, backgroundColor: accentDimColor },
              ],
            ]}
            onPress={() => {
              onChange(opt.value);
              if (Platform.OS !== "web") {
                Haptics.selectionAsync();
              }
            }}
          >
            <Text
              style={[
                styles.tripleBtnText,
                active && [styles.tripleBtnTextActive, { color: accentColor }],
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
