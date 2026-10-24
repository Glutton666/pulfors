import React, { useCallback, useEffect, useState } from "react";
import { Pressable, View, Text, TextInput, StyleSheet, Platform, Switch, ScrollView } from "react-native";
import { AnimatedModal } from "@/components/AnimatedModal";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useScale } from "@/lib/scale";
import { Radius, Spacing, FontSize } from "@/constants/tokens";
import {
  clampFadeOutMeasures,
  loadFadeOutSettings,
  saveFadeOutSettings,
  type FadeOutSettings,
} from "@/lib/storage";
import { onAccentColor } from "@/lib/color-contrast";

export interface FadeOutModalProps {
  visible: boolean;
  onClose: () => void;
  onStart: (s: FadeOutSettings) => void;
}

export function FadeOutModal({ visible, onClose, onStart }: FadeOutModalProps) {
  const { colors: C } = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const S = useScale();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const styles = makeStyles(C);

  const [enabled, setEnabled] = useState(false);
  const [nText, setNText] = useState("8");
  const [mText, setMText] = useState("4");
  const [kText, setKText] = useState("4");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setError(null);
    loadFadeOutSettings().then((s) => {
      setEnabled(s.enabled);
      setNText(String(s.audibleN));
      setMText(String(s.mutedM));
      setKText(String(s.audibleK));
    });
  }, [visible]);

  const parseField = useCallback((raw: string): number | null => {
    const n = Number(raw.trim());
    if (!Number.isFinite(n) || n < 1 || n > 64 || Math.floor(n) !== n) return null;
    return n;
  }, []);

  const handleStart = useCallback(async () => {
    if (!enabled) {
      setError(t("fadeOut", "disabledHint"));
      return;
    }
    const N = parseField(nText);
    const M = parseField(mText);
    const K = parseField(kText);
    if (N === null || M === null || K === null) {
      setError(t("fadeOut", "invalid"));
      return;
    }
    const settings: FadeOutSettings = {
      enabled: true,
      audibleN: N,
      mutedM: M,
      audibleK: K,
    };
    await saveFadeOutSettings(settings);
    onStart(settings);
  }, [enabled, nText, mText, kText, parseField, onStart, t]);

  const handleToggleEnabled = useCallback(async (v: boolean) => {
    setEnabled(v);
    setError(null);
    const N = parseField(nText) ?? 8;
    const M = parseField(mText) ?? 4;
    const K = parseField(kText) ?? 4;
    await saveFadeOutSettings({
      enabled: v,
      audibleN: clampFadeOutMeasures(N),
      mutedM: clampFadeOutMeasures(M),
      audibleK: clampFadeOutMeasures(K),
    });
  }, [nText, mText, kText, parseField]);

  return (
    <AnimatedModal visible={visible} onRequestClose={onClose}>
      <View testID="fade-out-screen" style={[styles.screen, { backgroundColor: C.background, paddingTop: insets.top || webTopInset, paddingBottom: insets.bottom || (Platform.OS === "web" ? 34 : 0) }]}>
        <View
          style={[styles.sheet, { backgroundColor: C.background, borderColor: C.border }]}
        >
          <View style={styles.header}>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel={t("fadeOut", "close")} testID="fade-out-back">
              <Text style={[styles.backText, { color: C.accent }]}>‹</Text>
            </Pressable>
            <Text style={[styles.title, { color: C.text }]}>{t("fadeOut", "title")}</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel={t("fadeOut", "close")}>
              <Text style={[styles.backText, { color: C.textSecondary }]}>×</Text>
            </Pressable>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: Spacing.md, padding: Spacing.lg, maxWidth: 720, width: "100%", alignSelf: "center" }} keyboardShouldPersistTaps="handled">
            <Text style={[styles.desc, { color: C.textSecondary }]}>{t("fadeOut", "description")}</Text>

            <View style={[styles.row, { borderColor: C.border }]}>
              <Text style={[styles.label, { color: C.text }]}>{t("fadeOut", "enable")}</Text>
              <Switch value={enabled} onValueChange={handleToggleEnabled} />
            </View>

            <Field
              label={t("fadeOut", "audibleN")}
              value={nText}
              onChangeText={setNText}
              C={C}
              styles={styles}
              testID="fade-out-n"
            />
            <Field
              label={t("fadeOut", "mutedM")}
              value={mText}
              onChangeText={setMText}
              C={C}
              styles={styles}
              testID="fade-out-m"
            />
            <Field
              label={t("fadeOut", "audibleK")}
              value={kText}
              onChangeText={setKText}
              C={C}
              styles={styles}
              testID="fade-out-k"
            />
            <Text style={[styles.hint, { color: C.textSecondary }]}>{t("fadeOut", "rangeHint")}</Text>

            {error ? <Text style={[styles.error, { color: C.danger || "#d33" }]}>{error}</Text> : null}

            <Pressable
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: C.accent, opacity: enabled ? (pressed ? 0.8 : 1) : 0.5 },
              ]}
              onPress={handleStart}
              accessibilityRole="button"
              testID="fade-out-start"
            >
              <Text style={[styles.primaryText, { color: onAccentColor(C.accent) }]}>{t("fadeOut", "start")}</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.secondaryBtn,
                { backgroundColor: C.background, borderColor: C.border, opacity: pressed ? 0.8 : 1 },
              ]}
              onPress={onClose}
              accessibilityRole="button"
            >
              <Text style={[styles.secondaryText, { color: C.text }]}>{t("fadeOut", "close")}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </AnimatedModal>
  );
}

function Field({
  label,
  value,
  onChangeText,
  C,
  styles,
  testID,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  C: any;
  styles: any;
  testID?: string;
}) {
  return (
    <View style={[styles.field, { borderColor: C.border }]}>
      <Text style={[styles.label, { color: C.text }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={(v) => onChangeText(v.replace(/[^0-9]/g, ""))}
        keyboardType="number-pad"
        maxLength={2}
        style={[styles.input, { color: C.text, borderColor: C.border, backgroundColor: C.background }]}
        testID={testID}
      />
    </View>
  );
}

const makeStyles = (C: any) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      justifyContent: "center" as const,
    },
    sheet: {
      flex: 1,
      borderWidth: 0,
    },
    header: {
      minHeight: 56,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
      paddingHorizontal: Spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
      gap: Spacing.md,
    },
    backText: {
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: 28,
      lineHeight: 32,
      minWidth: 28,
      textAlign: "center" as const,
    },
    title: {
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: FontSize.subtitle,
    },
    desc: {
      fontFamily: "SpaceGrotesk_400Regular",
      fontSize: FontSize.small,
      lineHeight: 18,
    },
    row: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.md,
      borderRadius: Radius.md,
      borderWidth: 1,
    },
    field: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
      paddingVertical: Spacing.sm,
      paddingHorizontal: Spacing.md,
      borderRadius: Radius.md,
      borderWidth: 1,
      gap: Spacing.md,
    },
    label: {
      fontFamily: "SpaceGrotesk_500Medium",
      fontSize: FontSize.body,
      flex: 1,
    },
    input: {
      width: 72,
      borderWidth: 1,
      borderRadius: Radius.sm,
      paddingHorizontal: Spacing.sm,
      paddingVertical: Spacing.xs,
      fontFamily: "SpaceGrotesk_500Medium",
      fontSize: FontSize.body,
      textAlign: "center" as const,
    },
    hint: {
      fontFamily: "SpaceGrotesk_400Regular",
      fontSize: FontSize.small,
    },
    error: {
      fontFamily: "SpaceGrotesk_500Medium",
      fontSize: FontSize.small,
    },
    primaryBtn: {
      paddingVertical: Spacing.md,
      borderRadius: Radius.md,
      alignItems: "center" as const,
      marginTop: Spacing.sm,
    },
    primaryText: {
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: FontSize.body,
    },
    secondaryBtn: {
      paddingVertical: Spacing.md,
      borderRadius: Radius.md,
      borderWidth: 1,
      alignItems: "center" as const,
    },
    secondaryText: {
      fontFamily: "SpaceGrotesk_500Medium",
      fontSize: FontSize.body,
    },
  });
