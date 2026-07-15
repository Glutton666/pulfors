import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Platform,
  ActivityIndicator,
} from "react-native";
import { AnimatedSlideModal } from "@/components/AnimatedModal";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { Radius, FontSize, Spacing, FontWeight } from "@/constants/tokens";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useScale } from "@/lib/scale";
import type { PracticeEntry } from "@/lib/storage";
import {
  exportPracticeEntry,
  shareExportedFile,
  revokeExportedUri,
  clampRepeats,
  clampFadeOutSec,
  type ExportFormat,
} from "@/lib/audio-export";
import { logger } from "@/lib/logger";

interface ExportEntryModalProps {
  visible: boolean;
  entry: PracticeEntry | null;
  onClose: () => void;
}

export function ExportEntryModal({ visible, entry, onClose }: ExportEntryModalProps) {
  const insets = useSafeAreaInsets();
  const { colors: C } = useTheme();
  const { t } = useLanguage();
  const S = useScale();
  const styles = useMemo(() => makeStyles(C), [C]);

  const [format, setFormat] = useState<ExportFormat>("wav");
  const [repeatsText, setRepeatsText] = useState("4");
  const [fadeEnabled, setFadeEnabled] = useState(true);
  const [fadeText, setFadeText] = useState("3");
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [doneInfo, setDoneInfo] = useState<{ filename: string; uri: string; format: ExportFormat } | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const lastUriRef = useRef<string | null>(null);

  const reset = useCallback(() => {
    setFormat("wav");
    setRepeatsText("4");
    setFadeEnabled(true);
    setFadeText("3");
    setProgress(0);
    setBusy(false);
    setErrorMsg(null);
    setDoneInfo(null);
    if (lastUriRef.current) {
      revokeExportedUri(lastUriRef.current);
      lastUriRef.current = null;
    }
  }, []);

  const handleClose = useCallback(() => {
    if (busy) return;
    reset();
    onClose();
  }, [busy, reset, onClose]);

  const handleStart = useCallback(async () => {
    if (!entry || busy) return;
    const repeats = clampRepeats(parseInt(repeatsText, 10) || 1);
    const fadeOutSec = fadeEnabled ? clampFadeOutSec(parseFloat(fadeText) || 0) : 0;
    setBusy(true);
    setErrorMsg(null);
    setDoneInfo(null);
    setProgress(0);
    try {
      const result = await exportPracticeEntry(entry, {
        format,
        repeats,
        fadeOutSec,
        onProgress: (p) => { if (mountedRef.current) setProgress(p); },
      });
      if (!mountedRef.current) {
        revokeExportedUri(result.uri);
        return;
      }
      lastUriRef.current = result.uri;
      setDoneInfo(result);
      // 자동 공유 트리거.
      try {
        await shareExportedFile(result.uri, result.filename, result.format);
      } catch (e) {
        logger.warn("[ExportEntryModal] share failed:", e);
        if (mountedRef.current) setErrorMsg(t("exportAudio", "failMsg"));
      }
    } catch (e) {
      const msg = String((e as Error)?.message || e);
      logger.warn("[ExportEntryModal] export failed:", e);
      if (mountedRef.current) {
        if (msg === "EMPTY_RENDER") {
          setErrorMsg(t("exportAudio", "emptyRender"));
        } else {
          setErrorMsg(t("exportAudio", "failMsg"));
        }
      }
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, [entry, busy, repeatsText, fadeEnabled, fadeText, format, t]);

  const repeatsValid = useMemo(() => {
    const n = parseInt(repeatsText, 10);
    return Number.isFinite(n) && n >= 1 && n <= 99;
  }, [repeatsText]);

  const fadeValid = useMemo(() => {
    if (!fadeEnabled) return true;
    const n = parseFloat(fadeText);
    return Number.isFinite(n) && n >= 0 && n <= 60;
  }, [fadeEnabled, fadeText]);

  const canStart = !!entry && !busy && repeatsValid && fadeValid && !doneInfo;

  const progressPct = Math.round(progress * 100);
  let progressLabel = "";
  if (busy) {
    if (progress < 0.55) progressLabel = t("exportAudio", "progressRendering");
    else if (progress < 0.9) progressLabel = t("exportAudio", "progressEncoding");
    else progressLabel = t("exportAudio", "progressSaving");
  }

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  return (
    <AnimatedSlideModal
      visible={visible}
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View
        style={[
          styles.container,
          {
            paddingTop: (insets.top || webTopInset) + Spacing.sm,
            paddingBottom: (insets.bottom || webBottomInset) + Spacing.sm,
          },
        ]}
      >
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={1}>
            {t("exportAudio", "title")}
            {entry?.label ? `  ·  ${entry.label}` : ""}
          </Text>
          <Pressable onPress={handleClose} hitSlop={10} disabled={busy}>
            <Ionicons name="close" size={S.ms(24, 0.4)} color={busy ? C.textTertiary : C.textSecondary} />
          </Pressable>
        </View>

        <View style={styles.body}>
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>{t("exportAudio", "format")}</Text>
            <View style={styles.row}>
              <FormatChip
                active={format === "wav"}
                label={t("exportAudio", "formatWav")}
                onPress={() => !busy && setFormat("wav")}
                C={C}
              />
              <FormatChip
                active={format === "mp3"}
                label={t("exportAudio", "formatMp3")}
                onPress={() => !busy && setFormat("mp3")}
                C={C}
              />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>{t("exportAudio", "repeats")}</Text>
            <TextInput
              style={[
                styles.input,
                !repeatsValid && { borderColor: C.danger },
              ]}
              value={repeatsText}
              onChangeText={(v) => setRepeatsText(v.replace(/[^0-9]/g, "").slice(0, 3))}
              keyboardType="number-pad"
              editable={!busy}
              testID="export-repeats-input"
            />
            <Text style={styles.hint}>{t("exportAudio", "repeatsHint")}</Text>
          </View>

          <View style={styles.section}>
            <View style={styles.rowBetween}>
              <Text style={styles.sectionLabel}>{t("exportAudio", "fadeOut")}</Text>
              <Pressable
                onPress={() => !busy && setFadeEnabled((v) => !v)}
                style={[
                  styles.toggle,
                  fadeEnabled && { backgroundColor: C.accent },
                ]}
                disabled={busy}
                testID="export-fade-toggle"
              >
                <Text style={[styles.toggleText, fadeEnabled && { color: "#fff" }]}>
                  {fadeEnabled ? t("exportAudio", "fadeOutEnabled") : t("exportAudio", "fadeOutDisabled")}
                </Text>
              </Pressable>
            </View>
            {fadeEnabled ? (
              <>
                <TextInput
                  style={[
                    styles.input,
                    !fadeValid && { borderColor: C.danger },
                  ]}
                  value={fadeText}
                  onChangeText={(v) => setFadeText(v.replace(/[^0-9.]/g, "").slice(0, 5))}
                  keyboardType="decimal-pad"
                  editable={!busy}
                  testID="export-fade-input"
                />
                <Text style={styles.hint}>{t("exportAudio", "fadeSecondsHint")}</Text>
              </>
            ) : null}
          </View>

          {busy ? (
            <View style={styles.progressBox}>
              <ActivityIndicator color={C.accent} />
              <Text style={styles.progressText}>{progressLabel}  {progressPct}%</Text>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${progressPct}%`, backgroundColor: C.accent }]} />
              </View>
            </View>
          ) : null}

          {errorMsg ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={S.ms(18, 0.4)} color={C.danger} />
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          ) : null}

          {doneInfo ? (
            <View style={styles.successBox}>
              <Ionicons name="checkmark-circle-outline" size={S.ms(20, 0.4)} color="#10B981" />
              <View style={{ flex: 1 }}>
                <Text style={styles.successTitle}>{t("exportAudio", "success")}</Text>
                <Text style={styles.successMsg}>{doneInfo.filename}</Text>
                <Text style={styles.successHint}>{t("exportAudio", "successMsg")}</Text>
              </View>
              <Pressable
                onPress={() => shareExportedFile(doneInfo.uri, doneInfo.filename, doneInfo.format)}
                style={styles.reshareBtn}
                hitSlop={8}
              >
                <Ionicons name="share-outline" size={S.ms(18, 0.4)} color={C.accent} />
              </Pressable>
            </View>
          ) : null}
        </View>

        <View style={styles.footer}>
          <Pressable
            style={styles.cancelBtn}
            onPress={handleClose}
            disabled={busy}
          >
            <Text style={styles.cancelText}>{t("exportAudio", "cancel")}</Text>
          </Pressable>
          <Pressable
            style={[
              styles.startBtn,
              { backgroundColor: C.accent },
              !canStart && { opacity: 0.4 },
            ]}
            onPress={handleStart}
            disabled={!canStart}
            testID="export-start-btn"
          >
            <Ionicons name="download-outline" size={S.ms(18, 0.4)} color="#fff" />
            <Text style={styles.startText}>{t("exportAudio", "start")}</Text>
          </Pressable>
        </View>
      </View>
    </AnimatedSlideModal>
  );
}

function FormatChip({
  active,
  label,
  onPress,
  C,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
  C: typeof Colors;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        chipStyles.chip,
        { borderColor: active ? C.accent : C.border, backgroundColor: active ? C.accent : "transparent" },
      ]}
    >
      <Text style={[chipStyles.text, { color: active ? "#fff" : C.text }]}>{label}</Text>
    </Pressable>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    flex: 1,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderRadius: Radius.md,
    alignItems: "center",
  },
  text: {
    fontSize: FontSize.body,
    fontWeight: FontWeight.medium,
  },
});

const makeStyles = (C: typeof Colors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: C.background,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: Spacing.xl,
      paddingVertical: Spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
      gap: Spacing.md,
    },
    title: {
      flex: 1,
      fontSize: FontSize.title,
      fontWeight: FontWeight.semibold,
      color: C.text,
    },
    body: {
      flex: 1,
      paddingHorizontal: Spacing.xl,
      paddingTop: Spacing.lg,
      gap: Spacing.xl,
    },
    section: {
      gap: Spacing.sm,
    },
    sectionLabel: {
      fontSize: FontSize.body,
      fontWeight: FontWeight.semibold,
      color: C.text,
    },
    row: {
      flexDirection: "row",
      gap: Spacing.sm,
    },
    rowBetween: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    input: {
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: Radius.md,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.md,
      fontSize: FontSize.body,
      color: C.text,
      backgroundColor: C.surface,
    },
    hint: {
      fontSize: FontSize.caption,
      color: C.textTertiary,
    },
    toggle: {
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.xs,
      borderRadius: Radius.pill,
      borderWidth: 1,
      borderColor: C.border,
    },
    toggleText: {
      fontSize: FontSize.caption,
      color: C.textSecondary,
      fontWeight: FontWeight.medium,
    },
    progressBox: {
      gap: Spacing.sm,
      padding: Spacing.lg,
      borderRadius: Radius.md,
      backgroundColor: C.surface,
      borderWidth: 1,
      borderColor: C.border,
    },
    progressText: {
      fontSize: FontSize.small,
      color: C.textSecondary,
    },
    progressBar: {
      height: Spacing.xs,
      backgroundColor: C.border,
      borderRadius: Radius.pill,
      overflow: "hidden",
    },
    progressFill: {
      height: "100%",
    },
    errorBox: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.sm,
      padding: Spacing.md,
      borderRadius: Radius.md,
      backgroundColor: C.surface,
      borderWidth: 1,
      borderColor: C.danger,
    },
    errorText: {
      flex: 1,
      fontSize: FontSize.small,
      color: C.danger,
    },
    successBox: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.md,
      padding: Spacing.md,
      borderRadius: Radius.md,
      backgroundColor: C.surface,
      borderWidth: 1,
      borderColor: "#10B981",
    },
    successTitle: {
      fontSize: FontSize.body,
      fontWeight: FontWeight.semibold,
      color: C.text,
    },
    successMsg: {
      fontSize: FontSize.caption,
      color: C.textSecondary,
      marginTop: Spacing.xxs,
    },
    successHint: {
      fontSize: FontSize.caption,
      color: C.textTertiary,
      marginTop: Spacing.xxs,
    },
    reshareBtn: {
      padding: Spacing.sm,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: C.border,
    },
    footer: {
      flexDirection: "row",
      gap: Spacing.sm,
      paddingHorizontal: Spacing.xl,
      paddingVertical: Spacing.md,
      borderTopWidth: 1,
      borderTopColor: C.border,
    },
    cancelBtn: {
      flex: 1,
      paddingVertical: Spacing.md,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: C.border,
      alignItems: "center",
      justifyContent: "center",
    },
    cancelText: {
      fontSize: FontSize.body,
      color: C.textSecondary,
      fontWeight: FontWeight.medium,
    },
    startBtn: {
      flex: 2,
      flexDirection: "row",
      gap: Spacing.sm,
      paddingVertical: Spacing.md,
      borderRadius: Radius.md,
      alignItems: "center",
      justifyContent: "center",
    },
    startText: {
      fontSize: FontSize.body,
      color: "#fff",
      fontWeight: FontWeight.semibold,
    },
  });
