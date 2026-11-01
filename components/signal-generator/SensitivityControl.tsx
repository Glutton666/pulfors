import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useScale } from "@/lib/scale";
import { FontSize, Radius, Spacing } from "@/constants/tokens";
import { parseSignalSensitivity } from "@/lib/signal-noise-gate";

type Props = { value: number; onChange: (value: number) => Promise<void>; disabled?: boolean };
const copy = {
  en: {
    label: "Sensitivity",
    hint: "0 disables pitch detection · lower values ignore quieter sounds",
    invalid: "Enter a value from 0.0 to 5.0.",
    failed: "Could not save sensitivity. Try again.",
    disabled: "Pitch detection is disabled",
    saved: "Saved",
  },
  ko: {
    label: "민감도",
    hint: "0은 음정 감지를 끕니다 · 낮은 값은 작은 소리를 무시합니다",
    invalid: "0.0~5.0 사이의 값을 입력하세요.",
    failed: "민감도를 저장하지 못했습니다. 다시 시도해 주세요.",
    disabled: "음정 감지가 꺼져 있습니다",
    saved: "저장됨",
  },
};

export function SensitivityControl({ value, onChange, disabled = false }: Props) {
  const { colors: C } = useTheme();
  const { language } = useLanguage();
  const S = useScale();
  const styles = makeStyles(C, S.ms(44));
  const [text, setText] = useState(value.toFixed(1));
  const textRef = useRef(text);
  textRef.current = text;
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [savingState, setSavingState] = useState(false);
  const saving = useRef(false);
  const lastWritten = useRef<number | null>(null);
  const t = copy[language];
  useEffect(() => { setText(value.toFixed(1)); lastWritten.current = value; }, [value]);

  const commit = async (input: string) => {
    if (disabled) return;
    const parsed = parseSignalSensitivity(input);
    setSaved(false);
    if (parsed === null) { setError(t.invalid); return; }
    setError("");
    if (Math.abs(parsed - value) < 0.000001) {
      setText(parsed.toFixed(1));
      lastWritten.current = parsed;
      return;
    }
    if (saving.current) return;
    if (lastWritten.current === parsed) { setText(parsed.toFixed(1)); return; }
    saving.current = true;
    setSavingState(true);
    try {
      await onChange(parsed);
      setText(parsed.toFixed(1));
      lastWritten.current = parsed;
      setSaved(true);
    } catch {
      lastWritten.current = value;
      setError(t.failed);
    } finally { saving.current = false; setSavingState(false); }
  };

  return (
    <View testID="signal-sensitivity-control" style={styles.wrap}>
      <View style={styles.heading}>
        <View style={styles.labels}>
          <Text style={styles.title}>{t.label}</Text>
          <Text style={styles.hint}>{t.hint}</Text>
        </View>
        <View style={styles.entry}>
          <TextInput
            testID="signal-sensitivity-input"
            accessibilityLabel={t.label}
            accessibilityHint={t.hint}
            accessibilityState={{ disabled }}
            editable={!disabled && !savingState}
            value={text}
            onChangeText={next => { textRef.current = next; setText(next); setError(""); setSaved(false); }}
            onBlur={() => { void commit(textRef.current); }}
            onSubmitEditing={event => { void commit(event.nativeEvent.text); }}
            keyboardType="decimal-pad"
            returnKeyType="done"
            selectTextOnFocus
            style={styles.input}
          />
          <Text style={styles.unit}>/ 5.0</Text>
        </View>
      </View>
      <Text testID="signal-sensitivity-feedback" accessibilityLiveRegion="polite" style={[styles.feedback, error ? styles.error : saved ? styles.success : null]}>
        {error || (disabled ? t.disabled : saved ? t.saved : " ")}
      </Text>
    </View>
  );
}

const makeStyles = (C: any, controlHeight: number) => StyleSheet.create({
  wrap: { width: "100%", gap: 4, paddingVertical: Spacing.xs },
  heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: Spacing.sm },
  labels: { flex: 1, gap: 3 },
  title: { color: C.text, fontFamily: "SpaceGrotesk_600SemiBold", fontSize: FontSize.body },
  hint: { color: C.textTertiary, fontFamily: "SpaceGrotesk_500Medium", fontSize: FontSize.micro },
  entry: { flexDirection: "row", alignItems: "center", gap: 5 },
  input: { width: 74, minHeight: controlHeight, paddingHorizontal: Spacing.sm, borderRadius: Radius.md, borderWidth: 1, borderColor: C.border, backgroundColor: C.backgroundSecondary, color: C.text, textAlign: "center", fontFamily: "SpaceGrotesk_700Bold", fontSize: FontSize.body, fontVariant: ["tabular-nums"] },
  unit: { color: C.textTertiary, fontFamily: "SpaceGrotesk_500Medium", fontSize: FontSize.caption },
  feedback: { minHeight: 16, color: C.textTertiary, fontFamily: "SpaceGrotesk_500Medium", fontSize: FontSize.micro },
  error: { color: C.error ?? C.accent },
  success: { color: C.success },
});
