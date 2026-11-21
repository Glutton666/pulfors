import React, { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import type Colors from "@/constants/colors";
import { onAccentColor } from "@/lib/color-contrast";
import type { translations } from "@/lib/i18n.data";
import { lugFrequencyBand, parseLugReference, type LugReading } from "@/lib/drum-lug-measurement";

interface Props {
  reading: LugReading;
  reference: number | null;
  listening: boolean;
  micStatus: string;
  hasMicError: boolean;
  sensitivity: number;
  onToggleMic: () => void;
  onSetReference: (frequency: number | null) => void;
}

export function DrumLugPanel({ reading, reference, listening, micStatus, hasMicError, sensitivity, onToggleMic, onSetReference }: Props) {
  const { t } = useLanguage();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const tr = (key: keyof typeof translations.signalGenerator) => t("signalGenerator", key);
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [minHz, maxHz] = lugFrequencyBand(reference);
  const hit = reading.kind === "hit" && listening && !hasMicError && sensitivity > 0 ? reading : null;
  const delta = hit && reference !== null ? Math.round((hit.frequency - reference) * 10) / 10 : null;
  const status = !listening || hasMicError ? micStatus
    : sensitivity === 0 ? tr("lugDetectionOff")
    : reading.kind === "measuring" ? tr("lugMeasuring")
    : reading.kind === "retry" ? tr("lugRetry")
    : reference !== null ? tr("lugNext")
    : hit?.suggestedReference != null ? tr("lugReady")
    : hit ? tr("lugRepeat") : tr("lugFirst");

  const commit = (text: string) => {
    const hz = parseLugReference(text);
    if (hz === null) { setInvalid(true); return; }
    onSetReference(hz);
    setEditing(false);
    setInvalid(false);
  };

  return (
    <View testID="signal-lug-panel" style={styles.panel}>
      <Text style={styles.title}>{tr("lugMode")}</Text>
      <Text style={styles.hint}>{tr("lugPlacement")}</Text>
      <View style={styles.metrics}>
        <View style={styles.metric}>
          <Text style={styles.hint}>{tr("lugThisHit")}</Text>
          <Text testID="signal-lug-reading" style={styles.value}>{hit ? `${hit.frequency.toFixed(1)} Hz` : "—"}</Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.hint}>{tr("lugReference")}</Text>
          <Text testID="signal-lug-reference" style={styles.value}>{reference !== null ? `${reference.toFixed(1)} Hz` : "—"}</Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.hint}>{tr("lugDifference")}</Text>
          <Text testID="signal-lug-difference" style={[styles.value, { color: delta === null ? colors.textSecondary : colors.accent }]}>
            {delta === null ? "—" : `${delta > 0 ? "+" : ""}${delta.toFixed(1)} Hz`}
          </Text>
        </View>
      </View>
      {reference !== null && <Text testID="signal-lug-band" style={styles.hint}>
        {tr("lugBand")} · {Number(minHz.toFixed(1))}–{Number(maxHz.toFixed(1))} Hz
      </Text>}
      <Text testID="signal-lug-status" accessibilityLiveRegion="polite" style={styles.status}>
        {status}
      </Text>
      <Pressable testID="signal-lug-mic" accessibilityRole="button" onPress={onToggleMic} style={[styles.button, { backgroundColor: listening ? colors.surfaceLight : colors.accent }]}>
        <Ionicons name={listening ? "mic-off-outline" : "mic-outline"} size={18} color={listening ? colors.text : onAccentColor(colors.accent)} />
        <Text style={[styles.buttonText, { color: listening ? colors.text : onAccentColor(colors.accent) }]}>{tr(listening ? "micStop" : "micStart")}</Text>
      </Pressable>
      <View style={styles.actions}>
        {reference === null ? (
          <Pressable
            testID="signal-lug-use-reading"
            accessibilityRole="button"
            disabled={hit?.suggestedReference == null}
            onPress={() => {
              if (hit?.suggestedReference != null) {
                onSetReference(hit.suggestedReference);
                setEditing(false);
                setInvalid(false);
              }
            }}
            style={[styles.button, { opacity: hit?.suggestedReference == null ? 0.45 : 1 }]}
          >
            <Text style={styles.buttonText}>{tr("lugUseReading")}</Text>
          </Pressable>
        ) : (
          <Pressable testID="signal-lug-unlock" accessibilityRole="button" onPress={() => { setEditing(false); setInvalid(false); onSetReference(null); }} style={styles.button}>
            <Text style={styles.buttonText}>{tr("lugUnlock")}</Text>
          </Pressable>
        )}
        <Pressable testID="signal-lug-edit-reference" accessibilityRole="button" accessibilityState={{ expanded: editing }} onPress={() => {
          setEditing(!editing);
          setInput(reference === null ? "" : String(reference));
          setInvalid(false);
        }} style={styles.button}>
          <Text style={styles.buttonText}>{tr(editing ? "lugCancel" : "lugEnterReference")}</Text>
        </Pressable>
      </View>
      {editing && (
        <View>
          <View style={styles.actions}>
            <TextInput
              testID="signal-lug-reference-input"
              accessibilityLabel={tr("lugEnterReference")}
              style={styles.input}
              keyboardType="decimal-pad"
              returnKeyType="done"
              placeholder="30–450 Hz"
              placeholderTextColor={colors.textSecondary}
              value={input}
              maxLength={7}
              onChangeText={(text) => { setInput(text); setInvalid(false); }}
              onSubmitEditing={(event) => commit(event.nativeEvent.text)}
            />
            <Pressable testID="signal-lug-lock" accessibilityRole="button" onPress={() => commit(input)} style={styles.button}>
              <Text style={styles.buttonText}>{tr("lugLock")}</Text>
            </Pressable>
          </View>
          {invalid && <Text testID="signal-lug-invalid" accessibilityLiveRegion="polite" style={[styles.hint, { color: colors.danger }]}>{tr("lugInvalid")}</Text>}
        </View>
      )}
    </View>
  );
}

const makeStyles = (c: typeof Colors) => StyleSheet.create({
  panel: { gap: 10 },
  title: { color: c.text, fontSize: 23, fontWeight: "700" },
  hint: { color: c.textSecondary, fontSize: 13, lineHeight: 18 },
  status: { color: c.text, fontSize: 14, minHeight: 22 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 8, padding: 12, borderRadius: 12, backgroundColor: c.backgroundSecondary, borderWidth: 1, borderColor: c.border },
  metric: { flexGrow: 1, flexBasis: 78, gap: 4 },
  value: { color: c.text, fontSize: 19, fontWeight: "700", fontVariant: ["tabular-nums"] },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  input: { flex: 1, color: c.text, minWidth: 72, minHeight: 44, paddingHorizontal: 12, borderRadius: 9, borderWidth: 1, borderColor: c.border, backgroundColor: c.backgroundSecondary, fontSize: 15 },
  button: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingHorizontal: 12, minHeight: 44, backgroundColor: c.backgroundSecondary, borderWidth: 1, borderColor: c.border, borderRadius: 9 },
  buttonText: { color: c.text, fontSize: 13, fontWeight: "600" },
});
