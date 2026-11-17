import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
} from "react-native";
import type { TempoTrainerConfig } from "@/lib/tempo-trainer";
import { useTheme } from "@/contexts/ThemeContext";
import { useScale } from "@/lib/scale";
import { useLanguage } from "@/contexts/LanguageContext";

interface TempoTrainerControlsProps {
  value: TempoTrainerConfig;
  onChange: (value: TempoTrainerConfig) => void;
  disabled?: boolean;
  onValidityChange?: (valid: boolean) => void;
}

function formatTime(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function parseTime(input: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(input.trim());
  if (!match) return null;
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  const total = minutes * 60 + seconds;
  return seconds <= 59 && total >= 1 && total <= 5999 ? total : null;
}

export function TempoTrainerControls({
  value,
  onChange,
  disabled = false,
  onValidityChange,
}: TempoTrainerControlsProps) {
  const { colors: C } = useTheme();
  const S = useScale();
  const { language } = useLanguage();
  const ko = language === "ko";
  const [timeDraft, setTimeDraft] = useState(formatTime(value.intervalSeconds));
  const [beatsDraft, setBeatsDraft] = useState(String(value.intervalMeasures));
  const [deltaDraft, setDeltaDraft] = useState(String(Math.abs(value.bpmDelta)));
  const [timeError, setTimeError] = useState("");
  const [beatsError, setBeatsError] = useState("");
  const [deltaError, setDeltaError] = useState("");

  const styles = useMemo(() => makeStyles(C, S), [C, S]);
  const validInterval = value.basis === "time" ? parseTime(timeDraft) !== null
    : /^\d+$/.test(beatsDraft.trim()) && Number(beatsDraft) >= 1 && Number(beatsDraft) <= 9999;
  const validDelta = /^\d+$/.test(deltaDraft.trim()) && Number(deltaDraft) >= 0 && Number(deltaDraft) <= 50;
  const valid = !value.enabled || (validInterval && validDelta);
  useEffect(() => { onValidityChange?.(valid); }, [onValidityChange, valid]);

  useEffect(() => {
    setTimeDraft(formatTime(value.intervalSeconds));
    setTimeError("");
  }, [value.intervalSeconds]);

  useEffect(() => {
    setBeatsDraft(String(value.intervalMeasures));
    setBeatsError("");
  }, [value.intervalMeasures]);

  useEffect(() => {
    setDeltaDraft(String(Math.abs(value.bpmDelta)));
    setDeltaError("");
  }, [value.bpmDelta]);

  const patch = (next: Partial<TempoTrainerConfig>) => onChange({ ...value, ...next });

  const commitTime = () => {
    const seconds = parseTime(timeDraft);
    if (seconds === null) {
      setTimeError(ko ? "MM:SS 형식, 00:01–99:59로 입력하세요." : "Enter MM:SS from 00:01 to 99:59.");
      return;
    }
    setTimeError("");
    setTimeDraft(formatTime(seconds));
    if (seconds !== value.intervalSeconds) patch({ intervalSeconds: seconds });
  };

  const commitBeats = () => {
    const beats = /^\d+$/.test(beatsDraft.trim()) ? Number(beatsDraft) : NaN;
    if (!Number.isInteger(beats) || beats < 1 || beats > 9999) {
      setBeatsError(ko ? "1–9999 사이의 정수를 입력하세요." : "Enter a whole number from 1 to 9999.");
      return;
    }
    setBeatsError("");
    setBeatsDraft(String(beats));
    if (beats !== value.intervalMeasures) patch({ intervalMeasures: beats });
  };

  const commitDelta = () => {
    const magnitude = /^\d+$/.test(deltaDraft.trim()) ? Number(deltaDraft) : NaN;
    if (!Number.isInteger(magnitude) || magnitude < 0 || magnitude > 50) {
      setDeltaError(ko ? "0–50 사이의 BPM을 입력하세요." : "Enter a BPM amount from 0 to 50.");
      return;
    }
    setDeltaError("");
    setDeltaDraft(String(magnitude));
    const delta = magnitude * (value.bpmDelta < 0 ? -1 : 1);
    if (delta !== value.bpmDelta) patch({ bpmDelta: delta });
  };

  const changeDirection = (direction: 1 | -1) => {
    const magnitude = Math.min(50, Math.abs(value.bpmDelta));
    setDeltaDraft(String(magnitude));
    setDeltaError("");
    patch({ bpmDelta: direction * magnitude });
  };

  const toggle = () => {
    if (!disabled) patch({ enabled: !value.enabled });
  };

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: value.enabled, disabled }}
        accessibilityLabel={ko ? "템포 트레이너" : "Tempo trainer"}
        disabled={disabled}
        onPress={toggle}
        testID="trainer-toggle"
        style={({ pressed }) => [styles.toggleRow, pressed && !disabled && styles.pressed]}
      >
        <View style={styles.toggleCopy}>
          <Text style={styles.title}>{ko ? "속도 트레이너" : "Speed trainer"}</Text>
          <Text style={styles.subtitle}>
            {disabled
              ? (ko ? "타이머 실행 중에는 설정할 수 없습니다" : "Unavailable while the timer is running")
              : (ko ? "간격마다 BPM을 단계적으로 변경" : "Step the tempo at each interval")}
          </Text>
        </View>
        <View style={[styles.switchTrack, value.enabled && styles.switchTrackOn, disabled && styles.dimmed]}>
          <View style={[styles.switchThumb, value.enabled && styles.switchThumbOn]} />
        </View>
      </Pressable>

      {value.enabled && (
        <View style={styles.fields}>
          <View style={styles.basisRow}>
            <BasisButton
              label={ko ? "시간" : "Time"}
              selected={value.basis === "time"}
              disabled={disabled}
              testID="trainer-basis-time"
              styles={styles}
              onPress={() => patch({ basis: "time" })}
            />
            <BasisButton
              label={ko ? "마디 수" : "Measures"}
              selected={value.basis === "measures"}
              disabled={disabled}
              testID="trainer-basis-measures"
              styles={styles}
              onPress={() => patch({ basis: "measures" })}
            />
          </View>
          <Text style={styles.subtitle}>
            {ko ? "완성된 마디를 셉니다. 시간 조건도 다음 마디 첫 박에 적용됩니다." : "Counts complete measures. Time changes wait for the next measure."}
          </Text>

          {value.basis === "time" ? (
            <View>
              <Text style={styles.fieldLabel}>{ko ? "변경 간격" : "Change every"}</Text>
              <TextInput
                accessibilityLabel={ko ? "간격 시간, 분:초" : "Interval time, minutes and seconds"}
                editable={!disabled}
                keyboardType="number-pad"
                value={timeDraft}
                onChangeText={(text) => {
                  setTimeDraft(text.replace(/[^\d:]/g, "").slice(0, 5));
                  setTimeError("");
                }}
                onBlur={commitTime}
                onSubmitEditing={commitTime}
                returnKeyType="done"
                selectTextOnFocus
                testID="trainer-interval-time"
                style={[styles.input, timeError ? styles.inputError : null, disabled && styles.dimmed]}
              />
              {timeError ? <Text accessibilityRole="alert" style={styles.error}>{timeError}</Text> : null}
            </View>
          ) : (
            <View>
              <Text style={styles.fieldLabel}>{ko ? "변경 간격" : "Change every"}</Text>
              <View style={styles.inlineField}>
                <TextInput
                  accessibilityLabel={ko ? "간격 마디 수" : "Interval in measures"}
                  editable={!disabled}
                  keyboardType="number-pad"
                  value={beatsDraft}
                  onChangeText={(text) => {
                    setBeatsDraft(text.replace(/[^\d]/g, "").slice(0, 4));
                    setBeatsError("");
                  }}
                  onBlur={commitBeats}
                  onSubmitEditing={commitBeats}
                  returnKeyType="done"
                  selectTextOnFocus
                  testID="trainer-interval-measures"
                  style={[styles.input, styles.flexInput, beatsError ? styles.inputError : null, disabled && styles.dimmed]}
                />
                <Text style={styles.unit}>{ko ? "마디" : "measures"}</Text>
              </View>
              {beatsError ? <Text accessibilityRole="alert" style={styles.error}>{beatsError}</Text> : null}
            </View>
          )}

          <View>
            <Text style={styles.fieldLabel}>{ko ? "변경할 BPM" : "BPM change"}</Text>
            <View style={styles.deltaRow}>
              <View style={styles.directionGroup}>
                <DirectionButton
                  label={ko ? "증가" : "Increase"}
                  symbol="+"
                  selected={value.bpmDelta > 0}
                  disabled={disabled}
                  testID="trainer-direction-up"
                  styles={styles}
                  onPress={() => changeDirection(1)}
                />
                <DirectionButton
                  label={ko ? "감소" : "Decrease"}
                  symbol="−"
                  selected={value.bpmDelta < 0}
                  disabled={disabled}
                  testID="trainer-direction-down"
                  styles={styles}
                  onPress={() => changeDirection(-1)}
                />
              </View>
              <TextInput
                accessibilityLabel={ko ? "BPM 변경량" : "BPM change amount"}
                editable={!disabled}
                keyboardType="number-pad"
                value={deltaDraft}
                onChangeText={(text) => {
                  setDeltaDraft(text.replace(/[^\d]/g, "").slice(0, 2));
                  setDeltaError("");
                }}
                onBlur={commitDelta}
                onSubmitEditing={commitDelta}
                returnKeyType="done"
                selectTextOnFocus
                testID="trainer-delta"
                style={[styles.input, styles.deltaInput, deltaError ? styles.inputError : null, disabled && styles.dimmed]}
              />
              <Text style={styles.unit}>{ko ? "BPM" : "BPM"}</Text>
            </View>
            {deltaError ? <Text accessibilityRole="alert" style={styles.error}>{deltaError}</Text> : null}
          </View>

          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: value.accentOnIncrease, disabled }}
            accessibilityLabel={ko ? "BPM 상승 또는 변화량 0일 때 강조음" : "Accent on BPM increase or zero change"}
            disabled={disabled}
            onPress={() => patch({ accentOnIncrease: !value.accentOnIncrease })}
            testID="trainer-accent-toggle"
            style={({ pressed }) => [styles.accentRow, pressed && !disabled && styles.pressed]}
          >
            <Text style={styles.accentLabel}>{ko ? "강조음 (상승·변화량 0)" : "Accent (increase or zero change)"}</Text>
            <View style={[styles.check, value.accentOnIncrease && styles.checkOn, disabled && styles.dimmed]}>
              {value.accentOnIncrease ? <Text style={styles.checkMark}>✓</Text> : null}
            </View>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function BasisButton({
  label,
  selected,
  disabled,
  testID,
  styles,
  onPress,
}: {
  label: string;
  selected: boolean;
  disabled: boolean;
  testID: string;
  styles: ReturnType<typeof makeStyles>;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.segment,
        selected && styles.segmentSelected,
        pressed && !disabled && styles.pressed,
        disabled && styles.dimmed,
      ]}
    >
      <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function DirectionButton({
  label,
  symbol,
  selected,
  disabled,
  testID,
  styles,
  onPress,
}: {
  label: string;
  symbol: string;
  selected: boolean;
  disabled: boolean;
  testID: string;
  styles: ReturnType<typeof makeStyles>;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.directionButton,
        selected && styles.segmentSelected,
        pressed && !disabled && styles.pressed,
        disabled && styles.dimmed,
      ]}
    >
      <Text style={[styles.directionText, selected && styles.segmentTextSelected]}>{symbol}</Text>
    </Pressable>
  );
}

function makeStyles(C: ReturnType<typeof useTheme>["colors"], S: ReturnType<typeof useScale>) {
  return StyleSheet.create({
    container: {
      width: "100%",
      alignSelf: "stretch",
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: C.border,
      paddingTop: S.ms(10, 0.3),
      paddingHorizontal: S.ms(8, 0.3),
    },
    toggleRow: {
      minHeight: S.ms(42, 0.3),
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: S.ms(8, 0.3),
    },
    toggleCopy: { flex: 1, minWidth: 0 },
    title: {
      color: C.text,
      fontFamily: "SpaceGrotesk_700Bold",
      fontSize: S.ms(12, 0.3),
      letterSpacing: 0.2,
    },
    subtitle: {
      marginTop: S.ms(2, 0.3),
      color: C.textTertiary,
      fontFamily: "SpaceGrotesk_400Regular",
      fontSize: S.ms(9, 0.3),
      lineHeight: S.ms(13, 0.3),
    },
    switchTrack: {
      width: S.ms(34, 0.3),
      height: S.ms(20, 0.3),
      borderRadius: S.ms(12, 0.3),
      backgroundColor: C.border,
      justifyContent: "center",
      paddingHorizontal: S.ms(2, 0.3),
    },
    switchTrackOn: { backgroundColor: C.accent },
    switchThumb: {
      width: S.ms(16, 0.3),
      height: S.ms(16, 0.3),
      borderRadius: S.ms(8, 0.3),
      backgroundColor: C.background,
    },
    switchThumbOn: { alignSelf: "flex-end" },
    fields: { marginTop: S.ms(9, 0.3), gap: S.ms(9, 0.3) },
    basisRow: { flexDirection: "row", gap: S.ms(6, 0.3) },
    segment: {
      flex: 1,
      minHeight: S.ms(30, 0.3),
      borderRadius: S.ms(7, 0.3),
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.surface,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: S.ms(8, 0.3),
    },
    segmentSelected: { backgroundColor: C.accent, borderColor: C.accent },
    segmentText: {
      color: C.textSecondary,
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: S.ms(10, 0.3),
    },
    segmentTextSelected: { color: C.background },
    fieldLabel: {
      marginBottom: S.ms(4, 0.3),
      color: C.textTertiary,
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: S.ms(9, 0.3),
      letterSpacing: 0.35,
      textTransform: "uppercase",
    },
    input: {
      minHeight: S.ms(34, 0.3),
      borderRadius: S.ms(7, 0.3),
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.surface,
      color: C.text,
      paddingHorizontal: S.ms(10, 0.3),
      paddingVertical: 0,
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: S.ms(13, 0.3),
      fontVariant: ["tabular-nums"],
      letterSpacing: 0.8,
    },
    inputError: { borderColor: C.danger },
    inlineField: { flexDirection: "row", alignItems: "center", gap: S.ms(8, 0.3) },
    flexInput: { flex: 1, minWidth: 0 },
    unit: {
      color: C.textSecondary,
      fontFamily: "SpaceGrotesk_500Medium",
      fontSize: S.ms(10, 0.3),
    },
    deltaRow: { flexDirection: "row", alignItems: "center", gap: S.ms(7, 0.3) },
    directionGroup: { flexDirection: "row", gap: S.ms(4, 0.3) },
    directionButton: {
      width: S.ms(31, 0.3),
      height: S.ms(32, 0.3),
      borderRadius: S.ms(7, 0.3),
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    directionText: {
      color: C.textSecondary,
      fontFamily: "SpaceGrotesk_700Bold",
      fontSize: S.ms(16, 0.3),
      lineHeight: S.ms(19, 0.3),
    },
    deltaInput: { flex: 1, minWidth: S.ms(40, 0.3), textAlign: "center", paddingHorizontal: S.ms(4, 0.3) },
    accentRow: {
      minHeight: S.ms(32, 0.3),
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: S.ms(8, 0.3),
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: C.border,
      paddingTop: S.ms(7, 0.3),
    },
    accentLabel: {
      flex: 1,
      color: C.textSecondary,
      fontFamily: "SpaceGrotesk_500Medium",
      fontSize: S.ms(10, 0.3),
      lineHeight: S.ms(14, 0.3),
    },
    check: {
      width: S.ms(19, 0.3),
      height: S.ms(19, 0.3),
      borderRadius: S.ms(5, 0.3),
      borderWidth: 1,
      borderColor: C.border,
      alignItems: "center",
      justifyContent: "center",
    },
    checkOn: { backgroundColor: C.accent, borderColor: C.accent },
    checkMark: { color: C.background, fontSize: S.ms(12, 0.3), lineHeight: S.ms(15, 0.3), fontWeight: "700" },
    error: {
      marginTop: S.ms(3, 0.3),
      color: C.danger,
      fontFamily: "SpaceGrotesk_400Regular",
      fontSize: S.ms(9, 0.3),
      lineHeight: S.ms(13, 0.3),
    },
    dimmed: { opacity: 0.48 },
    pressed: { opacity: 0.72 },
  });
}
