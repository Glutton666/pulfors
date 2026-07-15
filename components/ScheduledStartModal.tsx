import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Platform,
} from "react-native";
import { AnimatedSlideModal } from "@/components/AnimatedModal";
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

const OFFSET_STEP = 50;
const OFFSET_MAX = 2000;

function getDefaultTarget(): { h: number; m: number; s: number } {
  const now = new Date();
  now.setSeconds(now.getSeconds() + 60);
  return { h: now.getHours(), m: now.getMinutes(), s: now.getSeconds() };
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatRemaining(ms: number) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  return `${pad2(m)}:${pad2(s)}`;
}

function formatOffset(ms: number): string {
  if (ms === 0) return "0 ms";
  return (ms > 0 ? "+" : "") + ms + " ms";
}

interface SpinnerProps {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  label: string;
  accent: string;
  text: string;
  border: string;
  surface: string;
}

function Spinner({ value, min, max, onChange, label, accent, text, border, surface }: SpinnerProps) {
  const inc = () => onChange(value >= max ? min : value + 1);
  const dec = () => onChange(value <= min ? max : value - 1);
  return (
    <View style={spinnerStyles.col}>
      <Text style={[spinnerStyles.label, { color: text + "88" }]}>{label}</Text>
      <Pressable onPress={inc} hitSlop={8} style={[spinnerStyles.chevron, { borderColor: border, backgroundColor: surface }]}>
        <Ionicons name="chevron-up" size={20} color={accent} />
      </Pressable>
      <View style={[spinnerStyles.valueBox, { borderColor: border, backgroundColor: surface }]}>
        <Text style={[spinnerStyles.value, { color: text }]}>{pad2(value)}</Text>
      </View>
      <Pressable onPress={dec} hitSlop={8} style={[spinnerStyles.chevron, { borderColor: border, backgroundColor: surface }]}>
        <Ionicons name="chevron-down" size={20} color={accent} />
      </Pressable>
    </View>
  );
}

const spinnerStyles = StyleSheet.create({
  col: {
    alignItems: "center" as const,
    gap: Spacing.xs,
  },
  label: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: FontSize.caption,
    marginBottom: Spacing.xxs,
  },
  chevron: {
    width: 44,
    height: 36,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  valueBox: {
    width: 60,
    height: 52,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  value: {
    fontFamily: "SpaceMono_400Regular",
    fontSize: 28,
  },
});

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

  const [targetH, setTargetH] = useState(0);
  const [targetM, setTargetM] = useState(0);
  const [targetS, setTargetS] = useState(0);
  const [offsetMs, setOffsetMs] = useState(0);
  const [nowStr, setNowStr] = useState("");
  const [pastError, setPastError] = useState(false);

  const [counting, setCounting] = useState(false);
  const [countdownMs, setCountdownMs] = useState(0);

  const clockTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fireTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAll = useCallback(() => {
    if (clockTimerRef.current) { clearInterval(clockTimerRef.current); clockTimerRef.current = null; }
    if (tickTimerRef.current) { clearInterval(tickTimerRef.current); tickTimerRef.current = null; }
    if (fireTimerRef.current) { clearTimeout(fireTimerRef.current); fireTimerRef.current = null; }
  }, []);

  const updateNow = useCallback(() => {
    const now = new Date();
    setNowStr(`${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`);
  }, []);

  useEffect(() => {
    if (visible && !counting) {
      const def = getDefaultTarget();
      setTargetH(def.h);
      setTargetM(def.m);
      setTargetS(def.s);
      setOffsetMs(0);
      setPastError(false);
      updateNow();
      clockTimerRef.current = setInterval(updateNow, 1000);
    }
    if (!visible) {
      clearAll();
      setCounting(false);
      setCountdownMs(0);
      setPastError(false);
    }
    return () => {
      if (clockTimerRef.current) { clearInterval(clockTimerRef.current); clockTimerRef.current = null; }
    };
  }, [visible, counting, clearAll, updateNow]);

  useEffect(() => { return () => clearAll(); }, [clearAll]);

  const computeFireAt = useCallback((): number | null => {
    const now = new Date();
    const target = new Date(now);
    target.setHours(targetH, targetM, targetS, 0);
    const rawFireAt = target.getTime() + offsetMs;
    if (rawFireAt <= Date.now() + 500) {
      target.setDate(target.getDate() + 1);
      const nextFireAt = target.getTime() + offsetMs;
      if (nextFireAt <= Date.now() + 500) return null;
      return nextFireAt;
    }
    return rawFireAt;
  }, [targetH, targetM, targetS, offsetMs]);

  const handleStart = useCallback(() => {
    clearAll();
    const fireAt = computeFireAt();
    if (!fireAt) {
      setPastError(true);
      return;
    }
    setPastError(false);
    const delayMs = fireAt - Date.now();
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
    }, 250);

    fireTimerRef.current = setTimeout(() => {
      fireTimerRef.current = null;
      clearAll();
      setCounting(false);
      onScheduled({ startAtPerformanceTime: startAtPerf });
      onClose();
    }, delayMs);
  }, [computeFireAt, clearAll, onScheduled, onClose]);

  const handleCancel = useCallback(() => {
    clearAll();
    setCounting(false);
    setCountdownMs(0);
    updateNow();
    clockTimerRef.current = setInterval(updateNow, 1000);
  }, [clearAll, updateNow]);

  const incOffset = useCallback(() => {
    setOffsetMs((v) => Math.min(OFFSET_MAX, v + OFFSET_STEP));
    setPastError(false);
  }, []);

  const decOffset = useCallback(() => {
    setOffsetMs((v) => Math.max(-OFFSET_MAX, v - OFFSET_STEP));
    setPastError(false);
  }, []);

  const resetOffset = useCallback(() => {
    setOffsetMs(0);
    setPastError(false);
  }, []);

  return (
    <AnimatedSlideModal visible={visible} transparent onRequestClose={counting ? handleCancel : onClose}>
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
                <ScrollView
                  style={styles.scroll}
                  contentContainerStyle={styles.scrollContent}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  <View style={styles.nowRow}>
                    <Text style={[styles.nowLabel, { color: C.textTertiary }]}>{t("scheduledStart", "nowLabel")}</Text>
                    <Text style={[styles.nowTime, { color: C.textSecondary }]}>{nowStr}</Text>
                  </View>

                  <Text style={[styles.sectionLabel, { color: C.text }]}>
                    {t("scheduledStart", "targetTimeLabel")}
                  </Text>

                  <View style={styles.spinnerRow}>
                    <Spinner
                      value={targetH} min={0} max={23}
                      onChange={(v) => { setTargetH(v); setPastError(false); }}
                      label={t("scheduledStart", "hourLabel")}
                      accent={C.accent} text={C.text} border={C.border} surface={C.surface}
                    />
                    <Text style={[styles.colon, { color: C.text }]}>:</Text>
                    <Spinner
                      value={targetM} min={0} max={59}
                      onChange={(v) => { setTargetM(v); setPastError(false); }}
                      label={t("scheduledStart", "minLabel")}
                      accent={C.accent} text={C.text} border={C.border} surface={C.surface}
                    />
                    <Text style={[styles.colon, { color: C.text }]}>:</Text>
                    <Spinner
                      value={targetS} min={0} max={59}
                      onChange={(v) => { setTargetS(v); setPastError(false); }}
                      label={t("scheduledStart", "secLabel")}
                      accent={C.accent} text={C.text} border={C.border} surface={C.surface}
                    />
                  </View>

                  <View style={styles.offsetRow}>
                    <Text style={[styles.offsetLabel, { color: C.textSecondary }]}>
                      {t("scheduledStart", "offsetLabel")}
                    </Text>
                    <View style={styles.offsetControls}>
                      <Pressable
                        onPress={decOffset}
                        hitSlop={8}
                        style={[styles.offsetBtn, { borderColor: C.border, backgroundColor: C.surface }]}
                        testID="offset-dec"
                      >
                        <Ionicons name="remove" size={16} color={C.text} />
                      </Pressable>
                      <Pressable
                        onPress={resetOffset}
                        style={[styles.offsetValue, { borderColor: offsetMs !== 0 ? C.accent : C.border, backgroundColor: C.surface }]}
                        testID="offset-value"
                      >
                        <Text style={[styles.offsetValueText, { color: offsetMs !== 0 ? C.accent : C.textSecondary }]}>
                          {formatOffset(offsetMs)}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={incOffset}
                        hitSlop={8}
                        style={[styles.offsetBtn, { borderColor: C.border, backgroundColor: C.surface }]}
                        testID="offset-inc"
                      >
                        <Ionicons name="add" size={16} color={C.text} />
                      </Pressable>
                    </View>
                    <Text style={[styles.offsetHint, { color: C.textTertiary }]}>
                      {t("scheduledStart", "offsetHint")}
                    </Text>
                  </View>

                  {pastError && (
                    <Text style={[styles.errorText, { color: C.danger }]}>
                      {t("scheduledStart", "pastTimeError")}
                    </Text>
                  )}

                  <Text style={[styles.summaryText, { color: C.textSecondary }]}>
                    {t("scheduledStart", "settingsSummary")
                      .replace("%bpm", String(bpm))
                      .replace("%meter", String(beatsPerMeasure))}
                  </Text>
                </ScrollView>

                <View style={[styles.bottomBar, { borderTopColor: C.border }]}>
                  <Pressable
                    style={({ pressed }) => [styles.primaryBtn, { backgroundColor: C.accent }, pressed && { opacity: 0.85 }]}
                    onPress={handleStart}
                    testID="scheduled-start-fire"
                  >
                    <Text style={styles.primaryBtnText}>{t("scheduledStart", "start")}</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <View style={styles.countdownBox}>
                <Text style={[styles.countdownLabel, { color: C.textSecondary }]}>
                  {t("scheduledStart", "countdownInfo")
                    .replace("%bpm", String(bpm))
                    .replace("%meter", String(beatsPerMeasure))}
                </Text>
                <Text style={[styles.targetTimeText, { color: C.textTertiary }]}>
                  {pad2(targetH)}:{pad2(targetM)}:{pad2(targetS)}
                  {offsetMs !== 0 && (
                    <Text style={{ fontSize: FontSize.small }}>{"  "}{formatOffset(offsetMs)}</Text>
                  )}
                </Text>
                <Text style={[styles.countdown, { color: C.accent }]} testID="scheduled-start-countdown">
                  {formatRemaining(countdownMs)}
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
    </AnimatedSlideModal>
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
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      padding: Spacing.lg,
      gap: Spacing.lg,
    },
    bottomBar: {
      paddingHorizontal: Spacing.lg,
      paddingTop: Spacing.md,
      paddingBottom: Spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    nowRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: Spacing.sm,
    },
    nowLabel: {
      fontFamily: "SpaceGrotesk_400Regular",
      fontSize: FontSize.small,
    },
    nowTime: {
      fontFamily: "SpaceMono_400Regular",
      fontSize: FontSize.small,
    },
    sectionLabel: {
      fontFamily: "SpaceGrotesk_500Medium",
      fontSize: FontSize.body,
    },
    spinnerRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: Spacing.sm,
    },
    colon: {
      fontFamily: "SpaceGrotesk_700Bold",
      fontSize: 28,
      marginTop: 24,
    },
    offsetRow: {
      gap: Spacing.xs,
    },
    offsetLabel: {
      fontFamily: "SpaceGrotesk_500Medium",
      fontSize: FontSize.small,
    },
    offsetControls: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: Spacing.sm,
    },
    offsetBtn: {
      width: 36,
      height: 36,
      borderRadius: Radius.md,
      borderWidth: 1,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    offsetValue: {
      flex: 1,
      height: 36,
      borderRadius: Radius.md,
      borderWidth: 1,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      paddingHorizontal: Spacing.sm,
    },
    offsetValueText: {
      fontFamily: "SpaceMono_400Regular",
      fontSize: FontSize.small,
    },
    offsetHint: {
      fontFamily: "SpaceGrotesk_400Regular",
      fontSize: FontSize.caption,
    },
    errorText: {
      fontFamily: "SpaceGrotesk_400Regular",
      fontSize: FontSize.small,
    },
    summaryText: {
      fontFamily: "SpaceGrotesk_400Regular",
      fontSize: FontSize.small,
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
      gap: Spacing.lg,
    },
    countdownLabel: {
      fontFamily: "SpaceGrotesk_400Regular",
      fontSize: FontSize.body,
    },
    targetTimeText: {
      fontFamily: "SpaceMono_400Regular",
      fontSize: FontSize.subtitle,
    },
    countdown: {
      fontFamily: "SpaceGrotesk_700Bold",
      fontSize: 72,
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
