import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type Colors from "@/constants/colors";
import { FontSize, Radius, Spacing } from "@/constants/tokens";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import { lugFrequencyBand, type LugReading, type LugReferenceCandidate } from "@/lib/drum-lug-measurement";
import { frequencyToNote } from "@/lib/signal-analysis";

function noteLabel(hz: number) {
  const note = frequencyToNote(hz);
  return `${note.name}${note.octave}`;
}

export function LugComparison({
  reference, reading, listening, micStatus, hasMicError, sensitivity, onUnlock,
}: {
  reference: number;
  reading: LugReading;
  listening: boolean;
  micStatus: string;
  hasMicError: boolean;
  sensitivity: number;
  onUnlock: () => void;
}) {
  const { t } = useLanguage();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [min, max] = lugFrequencyBand(reference);
  const hit = reading.kind === "hit" && listening && !hasMicError && sensitivity > 0 ? reading.frequency : null;
  const delta = hit === null ? null : Math.round((hit - reference) * 10) / 10;
  const status = !listening || hasMicError ? micStatus
    : sensitivity === 0 ? t("signalGenerator", "lugDetectionOff")
    : reading.kind === "measuring" ? t("signalGenerator", "lugMeasuring")
    : reading.kind === "retry" ? t("signalGenerator", "lugRetry")
    : t("signalGenerator", "lugNext");
  return (
    <View testID="signal-lug-comparison" style={styles.card}>
      <View style={styles.row}>
        <View style={styles.metric}>
          <Text style={styles.hint}>{t("signalGenerator", "lugReference")}</Text>
          <Text testID="signal-lug-reference" style={styles.value}>{reference.toFixed(1)} Hz</Text>
          <Text testID="signal-lug-reference-note" style={[styles.label, styles.accent]}>{noteLabel(reference)}</Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.hint}>{t("signalGenerator", "lugThisHit")}</Text>
          <Text testID="signal-lug-reading" style={styles.value}>{hit === null ? "—" : `${hit.toFixed(1)} Hz`}</Text>
          <Text testID="signal-lug-reading-note" style={[styles.label, styles.accent]}>{hit === null ? "—" : noteLabel(hit)}</Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.hint}>{t("signalGenerator", "lugDifference")}</Text>
          <Text testID="signal-lug-difference" style={[styles.value, styles.accent]}>
            {delta === null ? "—" : `${delta > 0 ? "+" : ""}${delta.toFixed(1)} Hz`}
          </Text>
        </View>
      </View>
      <Text style={styles.hint}>{t("signalGenerator", "lugBand")} · {Number(min.toFixed(1))}–{Number(max.toFixed(1))} Hz</Text>
      <Text testID="signal-lug-status" accessibilityLiveRegion="polite" style={styles.label}>{status}</Text>
      <Pressable testID="signal-lug-unlock" accessibilityRole="button" onPress={onUnlock} style={[styles.button, styles.compact]}>
        <Text style={styles.label}>{t("signalGenerator", "lugUnlock")}</Text>
      </Pressable>
    </View>
  );
}

export function LugReferenceCandidates({ candidates, available, reference, onLock }: {
  candidates: LugReferenceCandidate[];
  available: boolean;
  reference: number | null;
  onLock: (frequency: number) => void;
}) {
  const { t, language } = useLanguage();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [selected, setSelected] = useState<number | null>(null);
  const canLock = selected !== null && selected !== reference;
  return (
    <View testID="signal-lug-candidates" style={styles.card}>
      <Text style={styles.value}>{t("signalGenerator", "lugCandidates")}</Text>
      {!available ? (
        <Text style={styles.hint}>{t("signalGenerator", "lugCandidatesUnavailable")}</Text>
      ) : (
        <>
          <Text style={styles.hint}>{t("signalGenerator", candidates.length > 0 ? "lugChoose" : "lugRepeat")}</Text>
          {candidates.map(({ frequency, strikes }, index) => {
            const chosen = selected === frequency || selected === null && reference === frequency;
            const count = language === "ko" ? `${strikes}번 감지` : `${strikes} ${strikes === 1 ? "hit" : "hits"}`;
            return (
              <Pressable
                key={frequency}
                testID={`signal-lug-candidate-${index}`}
                accessibilityRole="button"
                accessibilityState={{ selected: chosen }}
                onPress={() => setSelected(frequency)}
                style={[styles.button, styles.choice, chosen && styles.chosen]}
              >
                <Text style={styles.label}>{frequency.toFixed(1)} Hz · <Text style={styles.accent}>{noteLabel(frequency)}</Text></Text>
                <Text style={styles.hint}>{count}</Text>
              </Pressable>
            );
          })}
          {candidates.length > 0 && (
            <Pressable
              testID="signal-lug-lock-candidate"
              accessibilityRole="button"
              disabled={!canLock}
              onPress={() => { if (canLock) onLock(selected); }}
              style={[styles.button, styles.compact, !canLock && styles.disabled]}
            >
              <Text style={[styles.label, styles.accent]}>{t("signalGenerator", "lugLockCandidate")}</Text>
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}

const makeStyles = (c: typeof Colors) => StyleSheet.create({
  card: { gap: Spacing.xs, padding: Spacing.sm, borderRadius: Radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.backgroundSecondary },
  row: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.xs },
  metric: { flexGrow: 1, flexBasis: 76, gap: Spacing.xxs },
  hint: { color: c.textSecondary, fontSize: FontSize.small },
  label: { color: c.text, fontSize: FontSize.body, fontWeight: "600" },
  value: { color: c.text, fontSize: FontSize.bodyLg, fontWeight: "700", fontVariant: ["tabular-nums"] },
  accent: { color: c.accent },
  button: { paddingHorizontal: Spacing.sm, minHeight: 44, borderWidth: 1, borderColor: c.border, borderRadius: Radius.sm, justifyContent: "center" },
  chosen: { backgroundColor: c.accentDim, borderColor: c.accent },
  choice: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: Spacing.xs },
  disabled: { opacity: 0.55 },
  compact: { alignSelf: "flex-start" },
});
