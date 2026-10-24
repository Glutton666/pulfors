import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { FontSize, Radius, Spacing } from "@/constants/tokens";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { onAccentColor } from "@/lib/color-contrast";

interface TunerPanelProps {
  detectedFrequency: number | null;
  detectedNote: string | null;
  listening: boolean;
  statusText: string;
  targetFrequency: number;
  targetNote: string;
  cents: number | null;
  referencePlaying: boolean;
  onToggleMic: () => void;
  onDecrease: () => void;
  onIncrease: () => void;
  onEditTarget: () => void;
  onUseDetected: () => void;
  onToggleReference: () => void;
  onOpenGuide: () => void;
}

const MIN_FREQUENCY = 20;
const MAX_FREQUENCY = 20000;
const IN_TUNE_TOLERANCE = 5;

function formatFrequency(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value >= 10000) return Math.round(value).toLocaleString();
  if (value >= 1000) return value.toFixed(1);
  if (value >= 100) return value.toFixed(1);
  return value.toFixed(2);
}

export function TunerPanel({
  detectedFrequency,
  detectedNote,
  listening,
  statusText,
  targetFrequency,
  targetNote,
  cents,
  referencePlaying,
  onToggleMic,
  onDecrease,
  onIncrease,
  onEditTarget,
  onUseDetected,
  onToggleReference,
  onOpenGuide,
}: TunerPanelProps) {
  const { colors: C } = useTheme();
  const { t } = useLanguage();
  const styles = makeStyles(C);
  const { width, height } = useWindowDimensions();
  const sideBySide = width > height && width >= 600;
  const hasDetectedPitch =
    detectedFrequency !== null &&
    Number.isFinite(detectedFrequency) &&
    detectedFrequency >= MIN_FREQUENCY &&
    detectedFrequency <= MAX_FREQUENCY;
  const validCents = cents !== null && Number.isFinite(cents) ? cents : null;
  const hasCents = validCents !== null;
  const exact = validCents !== null && Math.abs(validCents) <= IN_TUNE_TOLERANCE;
  const pitchState = !hasCents
    ? "neutral"
    : exact
      ? "exact"
      : validCents! < 0
        ? "low"
        : "high";
  const pitchColor = pitchState === "exact"
    ? C.success
    : pitchState === "neutral"
      ? C.textTertiary
      : C.accent;
  const centsText = hasCents
    ? `${validCents! > 0 ? "+" : ""}${Math.round(validCents!)}¢`
    : "—";
  const markerPosition: `${number}%` = hasCents
    ? `${Math.max(0, Math.min(100, ((validCents! + 50) / 100) * 100))}%`
    : "50%";
  const decreaseDisabled = targetFrequency <= MIN_FREQUENCY;
  const increaseDisabled = targetFrequency >= MAX_FREQUENCY;

  return (
    <View testID="signal-tuner-panel" style={styles.panel}>
      <View style={styles.header}>
        <View style={styles.headingGroup}>
          <Text style={styles.eyebrow}>{t("signalGenerator", "detectedPitch")}</Text>
          <Text style={styles.title}>{t("signalGenerator", "tunerTitle")}</Text>
        </View>
        <View style={[styles.listeningBadge, listening && styles.listeningBadgeActive]}>
          <View style={[styles.statusDot, listening && styles.statusDotActive]} />
          <Text style={styles.statusText} numberOfLines={1}>{t("signalGenerator", listening ? "micActive" : "micInactive")}</Text>
        </View>
      </View>

      <View style={{ flexDirection: sideBySide ? "row" : "column", gap: Spacing.md }}>
      <View style={{ flex: sideBySide ? 1 : undefined, minWidth: 0, gap: Spacing.md }}>
      <View style={styles.pitchReadout}>
        <View style={styles.readoutMain}>
          <Text
            testID={hasDetectedPitch ? "signal-mic-frequency" : "signal-mic-placeholder"}
            style={styles.frequencyValue}
            accessibilityLabel={
              hasDetectedPitch
                ? `${formatFrequency(detectedFrequency!)} ${t("signalGenerator", "hzUnit")}`
                : statusText
            }
          >
            {hasDetectedPitch ? formatFrequency(detectedFrequency!) : "—"}
          </Text>
          <Text style={styles.frequencyUnit}>{t("signalGenerator", "hzUnit")}</Text>
        </View>
        {hasDetectedPitch && detectedNote ? (
          <Text testID="signal-mic-note" style={styles.noteValue}>
            {detectedNote}
          </Text>
        ) : (
          <Text style={styles.awaitingText}>{statusText}</Text>
        )}
      </View>

      <View style={styles.centsSection}>
        <View style={styles.centsHeading}>
          <Text style={styles.sectionLabel}>{t("signalGenerator", "pitchDifference")}</Text>
          <Text
            testID="signal-tuner-cents"
            style={[styles.centsValue, { color: pitchColor }]}
            accessibilityLabel={
              hasCents
                ? `${centsText} ${pitchState === "exact"
                    ? t("signalGenerator", "pitchExact")
                    : t("signalGenerator", pitchState === "low" ? "pitchLow" : "pitchHigh")}`
                : "—"
            }
          >
            {centsText}
          </Text>
        </View>
        <View
          style={styles.meter}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={t("signalGenerator", "pitchDifference")}
          accessibilityValue={hasCents ? { min: -50, max: 50, now: Math.max(-50, Math.min(50, Math.round(validCents!))), text: centsText } : undefined}
        >
          <View style={styles.meterTrack}>
            <View style={[styles.meterCenter, exact && { backgroundColor: C.success }]} />
            <View
              style={[
                styles.meterMarker,
                {
                  left: markerPosition,
                  backgroundColor: pitchColor,
                   opacity: hasCents ? 1 : 0,
                },
              ]}
            />
          </View>
          <View style={styles.meterLabels}>
            <Text style={styles.meterLabel}>−50</Text>
            <Text style={[styles.meterLabel, exact && { color: C.success }]}>0</Text>
            <Text style={styles.meterLabel}>+50</Text>
          </View>
        </View>
      </View>

      </View>
      <View style={{ flex: sideBySide ? 1 : undefined, minWidth: 0, gap: Spacing.md, justifyContent: sideBySide ? "center" : undefined }}>
      <View style={styles.targetBlock}>
        <View style={styles.targetTopline}>
          <Text style={styles.sectionLabel}>{t("signalGenerator", "targetFrequency")}</Text>
          <Text style={styles.targetNote}>{targetNote}</Text>
        </View>
        <View style={styles.targetRow}>
          <Pressable
            testID="signal-target-decrease"
            accessibilityRole="button"
            accessibilityLabel={t("signalGenerator", "targetDecrease")}
            accessibilityState={{ disabled: decreaseDisabled }}
            disabled={decreaseDisabled}
            onPress={onDecrease}
            style={({ pressed }) => [
              styles.stepButton,
              decreaseDisabled && styles.disabledButton,
              pressed && !decreaseDisabled && styles.pressedButton,
            ]}
          >
            <Ionicons name="remove" size={20} color={decreaseDisabled ? C.textTertiary : C.text} />
          </Pressable>
          <Pressable
            testID="signal-target-edit"
            accessibilityRole="button"
            accessibilityLabel={`${t("signalGenerator", "editTarget")}, ${targetNote}, ${formatFrequency(targetFrequency)} ${t("signalGenerator", "hzUnit")}`}
            onPress={onEditTarget}
            style={({ pressed }) => [styles.targetValueButton, pressed && styles.pressedButton]}
          >
            <Text testID="signal-target-frequency" style={styles.targetFrequency}>
              {formatFrequency(targetFrequency)} <Text style={styles.targetUnit}>{t("signalGenerator", "hzUnit")}</Text>
            </Text>
            <Ionicons name="pencil-outline" size={15} color={C.textTertiary} />
          </Pressable>
          <Pressable
            testID="signal-target-increase"
            accessibilityRole="button"
            accessibilityLabel={t("signalGenerator", "targetIncrease")}
            accessibilityState={{ disabled: increaseDisabled }}
            disabled={increaseDisabled}
            onPress={onIncrease}
            style={({ pressed }) => [
              styles.stepButton,
              increaseDisabled && styles.disabledButton,
              pressed && !increaseDisabled && styles.pressedButton,
            ]}
          >
            <Ionicons name="add" size={20} color={increaseDisabled ? C.textTertiary : C.text} />
          </Pressable>
        </View>
      </View>

      <View style={styles.actions}>
        <Pressable
          testID="signal-mic-toggle"
          accessibilityRole="button"
          accessibilityLabel={t("signalGenerator", listening ? "micStop" : "micStart")}
          accessibilityState={{ selected: listening }}
          onPress={onToggleMic}
          style={({ pressed }) => [
            styles.primaryAction,
            { backgroundColor: listening ? C.surfaceLight : C.accent },
            pressed && styles.pressedButton,
          ]}
        >
          <Ionicons
            name={listening ? "mic-off-outline" : "mic-outline"}
            size={18}
            color={listening ? C.text : onAccentColor(C.accent)}
          />
          <Text style={[styles.primaryActionText, { color: listening ? C.text : onAccentColor(C.accent) }]}>
            {t("signalGenerator", listening ? "micStop" : "micStart")}
          </Text>
        </Pressable>
        <Pressable
          testID="signal-use-detected"
          accessibilityRole="button"
          accessibilityLabel={t("signalGenerator", "useDetected")}
          accessibilityState={{ disabled: !hasDetectedPitch }}
          disabled={!hasDetectedPitch}
          onPress={onUseDetected}
          style={({ pressed }) => [
            styles.secondaryAction,
            !hasDetectedPitch && styles.disabledButton,
            pressed && hasDetectedPitch && styles.pressedButton,
          ]}
        >
          <Ionicons name="return-down-forward-outline" size={16} color={C.accent} />
          <Text style={styles.secondaryActionText}>{t("signalGenerator", "useDetected")}</Text>
        </Pressable>
      </View>

      <View style={styles.footerActions}>
        <Pressable
          testID="signal-toggle"
          accessibilityRole="button"
          accessibilityLabel={t("signalGenerator", referencePlaying ? "referenceStop" : "referencePlay")}
          accessibilityState={{ selected: referencePlaying }}
          onPress={onToggleReference}
          style={({ pressed }) => [styles.footerButton, pressed && styles.pressedButton]}
        >
          <Ionicons
            name={referencePlaying ? "pause-circle-outline" : "play-circle-outline"}
            size={17}
            color={referencePlaying ? C.accent : C.textSecondary}
          />
          <Text style={styles.footerButtonText}>
            {t("signalGenerator", referencePlaying ? "referenceStop" : "referencePlay")}
          </Text>
        </Pressable>
        <Pressable
          testID="signal-tuning-guide"
          accessibilityRole="button"
          accessibilityLabel={t("signalGenerator", "tuningGuide")}
          onPress={onOpenGuide}
          style={({ pressed }) => [styles.footerButton, pressed && styles.pressedButton]}
        >
          <Ionicons name="book-outline" size={16} color={C.textSecondary} />
          <Text style={styles.footerButtonText}>{t("signalGenerator", "tuningGuide")}</Text>
        </Pressable>
      </View>
      </View>
      </View>
    </View>
  );
}

const makeStyles = (C: typeof Colors) => StyleSheet.create({
  panel: {
    width: "100%",
    alignSelf: "stretch",
    padding: Spacing.md,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    gap: Spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
   headingGroup: { flex: 1, gap: Spacing.xxs },
  eyebrow: {
    color: C.textTertiary,
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: FontSize.micro,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  title: {
    color: C.text,
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: FontSize.subtitle,
  },
  listeningBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: "48%",
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    backgroundColor: C.overlay05,
  },
  listeningBadgeActive: { backgroundColor: C.accentDim },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.textTertiary,
  },
  statusDotActive: { backgroundColor: C.accent },
  statusText: {
    flexShrink: 1,
    color: C.textSecondary,
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: FontSize.micro,
  },
  pitchReadout: {
    minHeight: 82,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.lg,
    backgroundColor: C.background,
    alignItems: "center",
    justifyContent: "center",
  },
  readoutMain: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  frequencyValue: {
    color: C.text,
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 38,
    lineHeight: 44,
    fontVariant: ["tabular-nums"],
  },
  frequencyUnit: {
    color: C.textSecondary,
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 13,
  },
  noteValue: {
    color: C.accent,
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: FontSize.h1,
    marginTop: -1,
  },
  awaitingText: {
    color: C.textTertiary,
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: FontSize.small,
    marginTop: Spacing.xxs,
  },
  centsSection: { gap: Spacing.xs },
  centsHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionLabel: {
    color: C.textSecondary,
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: FontSize.small,
  },
  centsValue: {
    minWidth: 48,
    textAlign: "right",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: FontSize.bodyLg,
    fontVariant: ["tabular-nums"],
  },
  meter: { gap: 5 },
  meterCenter: {
    position: "absolute",
    left: "50%",
    width: 2,
    height: 13,
    marginLeft: -1,
    borderRadius: 1,
    backgroundColor: C.textTertiary,
  },
  meterMarker: {
    position: "absolute",
    width: 10,
    height: 10,
    top: 2,
    marginLeft: -5,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: C.surface,
  },
  meterTrack: {
    height: 14,
    justifyContent: "center",
    position: "relative",
    marginHorizontal: Spacing.xxs,
    borderRadius: Radius.pill,
    backgroundColor: C.overlay08,
  },
  meterLabels: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  meterLabel: {
    color: C.textTertiary,
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: FontSize.micro,
  },
  targetBlock: {
    gap: Spacing.xs,
    paddingTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  targetTopline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  targetNote: {
    color: C.accent,
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 13,
  },
  targetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  stepButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.backgroundSecondary,
  },
  targetValueButton: {
    minWidth: 0,
    height: 44,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: Radius.md,
    backgroundColor: C.overlay05,
  },
  targetFrequency: {
    color: C.text,
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: FontSize.title,
    fontVariant: ["tabular-nums"],
  },
  targetUnit: {
    color: C.textSecondary,
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: FontSize.small,
  },
  actions: { flexDirection: "row", gap: Spacing.sm },
  primaryAction: {
    minHeight: 44,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md,
  },
  primaryActionText: {
    color: C.background,
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: FontSize.small,
  },
  secondaryAction: {
    minHeight: 44,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: Spacing.xs,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.backgroundSecondary,
  },
  secondaryActionText: {
    color: C.text,
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: FontSize.caption,
  },
  footerActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  footerButton: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: Spacing.xs,
    borderRadius: Radius.sm,
  },
  footerButtonText: {
    color: C.textSecondary,
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: FontSize.caption,
  },
  disabledButton: { opacity: 0.4 },
  pressedButton: { opacity: 0.72 },
});
