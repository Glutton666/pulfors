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
    <AnimatedModal visible={visible} transparent onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: C.surface,
              borderColor: C.border,
              paddingTop: (insets.top || webTopInset) + 16,
              paddingBottom: 24 + (insets.bottom || (Platform.OS === "web" ? 34 : 0)),
            },
          ]}
          onStartShouldSetResponder={() => true}
        >
          <ScrollView contentContainerStyle={{ gap: Spacing.md }} keyboardShouldPersistTaps="handled">
            <View style={styles.handle} />
            <Text style={[styles.title, { color: C.text }]}>{t("fadeOut", "title")}</Text>
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
              <Text style={[styles.primaryText, { color: "#fff" }]}>{t("fadeOut", "start")}</Text>
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
      </Pressable>
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
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.4)",
      justifyContent: "flex-end" as const,
    },
    sheet: {
      borderTopLeftRadius: Radius.xl,
      borderTopRightRadius: Radius.xl,
      borderTopWidth: 1,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      paddingHorizontal: Spacing.lg,
      maxHeight: "90%" as const,
    },
    handle: {
      alignSelf: "center" as const,
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: C.border,
      marginBottom: Spacing.sm,
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
