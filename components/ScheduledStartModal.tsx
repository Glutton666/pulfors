import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useScale } from "@/lib/scale";
import { Radius, Spacing, FontSize } from "@/constants/tokens";

export interface ScheduledStartModalProps {
  visible: boolean;
  onClose: () => void;
  bpm: number;
  beatsPerMeasure: number;
  onScheduled: (params: { startAtPerformanceTime: number }) => void;
}

const LEAD_OPTIONS = [5, 10, 20] as const;

export function ScheduledStartModal({
  visible,
  onClose,
  bpm,
  beatsPerMeasure,
  onScheduled,
}: ScheduledStartModalProps) {
  const { colors: C } = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const S = useScale();
  const styles = useMemo(() => makeStyles(C), [C]);
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  const [leadIn, setLeadIn] = useState<number>(10);
  const [counting, setCounting] = useState(false);
  const [countdownMs, setCountdownMs] = useState(0);

  const tickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fireTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAll = useCallback(() => {
    if (tickTimerRef.current) { clearInterval(tickTimerRef.current); tickTimerRef.current = null; }
    if (fireTimerRef.current) { clearTimeout(fireTimerRef.current); fireTimerRef.current = null; }
  }, []);

  useEffect(() => {
    if (!visible) {
      clearAll();
      setCounting(false);
      setCountdownMs(0);
    }
  }, [visible, clearAll]);

  useEffect(() => { return () => clearAll(); }, [clearAll]);

  const handleStart = useCallback(() => {
    clearAll();
    const delayMs = leadIn * 1000;
    const fireAt = Date.now() + delayMs;
    const startAtPerf =
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now() + delayMs
        : Date.now() + delayMs;

    setCounting(true);
    setCountdownMs(delayMs);

    tickTimerRef.current = setInterval(() => {
      const remaining = fireAt - Date.now();
      setCountdownMs(Math.max(0, remaining));
      if (remaining <= 50) {
        clearInterval(tickTimerRef.current!);
        tickTimerRef.current = null;
      }
    }, 100);

    fireTimerRef.current = setTimeout(() => {
      fireTimerRef.current = null;
      clearAll();
      setCounting(false);
      onScheduled({ startAtPerformanceTime: startAtPerf });
      onClose();
    }, delayMs);
  }, [leadIn, clearAll, onScheduled, onClose]);

  const handleCancel = useCallback(() => {
    clearAll();
    setCounting(false);
    setCountdownMs(0);
  }, [clearAll]);

  const sec = Math.max(0, Math.ceil(countdownMs / 1000));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={counting ? handleCancel : onClose}>
      <View style={styles.overlay}>
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: C.background,
              borderColor: C.border,
              paddingTop: (insets.top || webTopInset) + 16,
              paddingBottom: 24 + (insets.bottom || webBottomInset),
            },
          ]}
        >
          <View style={styles.header}>
            <View style={{ width: 26 }} />
            <Text style={[styles.headerTitle, { color: C.text }]}>{t("scheduledStart", "title")}</Text>
            <Pressable onPress={counting ? handleCancel : onClose} hitSlop={10} testID="scheduled-start-close">
              <Ionicons name="close" size={26} color={C.text} />
            </Pressable>
          </View>

          <View style={styles.body}>
            {!counting ? (
              <>
                <Text style={[styles.label, { color: C.textSecondary }]}>
                  {t("scheduledStart", "settingsSummary")
                    .replace("%bpm", String(bpm))
                    .replace("%meter", String(beatsPerMeasure))}
                </Text>

                <Text style={[styles.sectionLabel, { color: C.text }]}>
                  {t("scheduledStart", "leadInLabel")}
                </Text>
                <View style={styles.pillRow}>
                  {LEAD_OPTIONS.map((sec) => {
                    const selected = leadIn === sec;
                    return (
                      <Pressable
                        key={sec}
                        style={[
                          styles.pill,
                          { borderColor: selected ? C.accent : C.border, backgroundColor: selected ? C.accent : C.surface },
                        ]}
                        onPress={() => setLeadIn(sec)}
                        testID={`lead-in-${sec}`}
                      >
                        <Text style={[styles.pillText, { color: selected ? "#fff" : C.text }]}>
                          {sec}{t("scheduledStart", "secSuffix")}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Pressable
                  style={({ pressed }) => [styles.primaryBtn, { backgroundColor: C.accent }, pressed && { opacity: 0.85 }]}
                  onPress={handleStart}
                  testID="scheduled-start-fire"
                >
                  <Text style={styles.primaryBtnText}>{t("scheduledStart", "start")}</Text>
                </Pressable>
              </>
            ) : (
              <View style={styles.countdownBox}>
                <Text style={[styles.countdownLabel, { color: C.textSecondary }]}>
                  {t("scheduledStart", "countdownInfo")
                    .replace("%bpm", String(bpm))
                    .replace("%meter", String(beatsPerMeasure))}
                </Text>
                <Text style={[styles.countdown, { color: C.accent }]} testID="scheduled-start-countdown">
                  {sec}
                </Text>
                <Pressable
                  style={({ pressed }) => [styles.secondaryBtn, { borderColor: C.border, backgroundColor: C.surface }, pressed && { opacity: 0.85 }]}
                  onPress={handleCancel}
                  testID="scheduled-start-cancel"
                >
                  <Text style={[styles.secondaryBtnText, { color: C.text }]}>{t("scheduledStart", "cancel")}</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (C: any) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
    },
    sheet: {
      flex: 1,
      borderTopWidth: 1,
    },
    header: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
      paddingHorizontal: Spacing.lg,
      paddingBottom: Spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    headerTitle: {
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: FontSize.subtitle,
    },
    body: {
      flex: 1,
      padding: Spacing.lg,
      gap: Spacing.lg,
    },
    label: {
      fontFamily: "SpaceGrotesk_400Regular",
      fontSize: FontSize.body,
    },
    sectionLabel: {
      fontFamily: "SpaceGrotesk_500Medium",
      fontSize: FontSize.body,
    },
    pillRow: {
      flexDirection: "row" as const,
      gap: Spacing.sm,
    },
    pill: {
      paddingVertical: Spacing.sm,
      paddingHorizontal: Spacing.xl,
      borderRadius: Radius.lg,
      borderWidth: 1,
    },
    pillText: {
      fontFamily: "SpaceGrotesk_500Medium",
      fontSize: FontSize.body,
    },
    primaryBtn: {
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.lg,
      borderRadius: Radius.md,
      alignItems: "center" as const,
    },
    primaryBtnText: {
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: FontSize.body,
      color: "#fff",
    },
    countdownBox: {
      flex: 1,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: Spacing.xl,
    },
    countdownLabel: {
      fontFamily: "SpaceGrotesk_400Regular",
      fontSize: FontSize.body,
    },
    countdown: {
      fontFamily: "SpaceGrotesk_700Bold",
      fontSize: 96,
      textAlign: "center" as const,
    },
    secondaryBtn: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: Spacing.xs,
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.xl,
      borderRadius: Radius.md,
      borderWidth: 1,
    },
    secondaryBtnText: {
      fontFamily: "SpaceGrotesk_500Medium",
      fontSize: FontSize.body,
    },
  });
