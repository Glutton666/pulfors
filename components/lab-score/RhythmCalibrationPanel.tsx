import React from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useTheme } from "@/contexts/ThemeContext";
import type { useRhythmCalibration } from "@/hooks/useRhythmCalibration";

export function RhythmCalibrationPanel({ ko, calibration, offset, onOffset, onReset, onStart, onTap, disabled }: {
  ko: boolean; calibration: ReturnType<typeof useRhythmCalibration>; offset: string;
  onOffset: (value: string) => void; onReset: () => void; onStart: () => void; onTap: () => void; disabled: boolean;
}) {
  const { colors: C } = useTheme();
  const message = calibration.phase === "idle" ? (ko ? "기준음 시작 → 예비 4박 듣기 → 16박에 맞춰 탭" : "Start reference → listen for 4 beats → tap 16 beats")
    : calibration.phase === "preparing" ? (ko ? "기준음 준비 중…" : "Preparing reference…")
      : calibration.phase === "done" ? (ko ? `보정 적용: ${calibration.message}` : `Applied: ${calibration.message}`)
        : calibration.phase === "error" ? (ko ? "누락·중복 또는 불안정한 박 · 기존 보정 유지, 다시 시도하세요." : "Missing, duplicate or unstable beats · previous offset kept. Please retry.")
          : calibration.message.startsWith("count-in:") ? `${ko ? "예비박" : "Count-in"} ${calibration.message.split(":")[1]}`
            : `${ko ? "탭" : "Taps"} ${calibration.count}/16`;
  return <View style={{ gap: 8 }}>
    <Text style={{ color: C.text, fontSize: 13 }}>{ko ? "타이밍 보정" : "Timing calibration"}</Text>
    <Text testID="rhythm-calibration-status" accessibilityLiveRegion="polite" style={{ color: C.textSecondary, fontSize: 11 }}>{message}</Text>
    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
      <TextInput testID="rhythm-offset-input" accessibilityLabel={ko ? "수동 오프셋 ms" : "Manual offset ms"} value={offset}
        editable={!disabled} onChangeText={onOffset} onBlur={() => onOffset(String(Number.isFinite(Number(offset)) ? Math.max(-2000, Math.min(2000, Number(offset))) : 0))}
        keyboardType="numbers-and-punctuation" style={{ color: C.text, borderColor: C.border, borderWidth: 1, borderRadius: 8, padding: 8, minWidth: 75 }} />
      <Text style={{ color: C.textSecondary, fontSize: 11 }}>ms · −2000…2000</Text>
      <Pressable testID="rhythm-calibration-reset" accessibilityRole="button" disabled={disabled} onPress={onReset} style={{ padding: 10 }}><Text style={{ color: C.text }}>{ko ? "초기화" : "Reset"}</Text></Pressable>
      <Pressable testID="rhythm-calibration-reference" accessibilityRole="button" disabled={disabled} onPress={onStart} style={{ padding: 10, borderWidth: 1, borderColor: C.border, borderRadius: 8 }}><Text style={{ color: C.text }}>{ko ? "기준음 시작 / 다시 시작" : "Start / restart reference"}</Text></Pressable>
    </View>
    <Pressable testID="rhythm-calibration-tap" accessibilityRole="button" disabled={disabled || calibration.phase !== "playing" || calibration.count >= 16}
      onPressIn={onTap} style={{ backgroundColor: C.accent, opacity: disabled || calibration.phase !== "playing" ? 0.45 : 1, borderRadius: 12, minHeight: 64, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: C.background }}>{ko ? "기준음에 맞춰 탭" : "Tap with the reference"} · {Math.min(16, calibration.count)}/16</Text>
    </Pressable>
    <Text style={{ color: C.textSecondary, fontSize: 10 }}>{ko ? "개인의 듣기·입력 오차 보정입니다. 원본 시각은 바뀌지 않습니다. +값은 늦은 입력을 앞당깁니다." : "Personal listening/input offset, not a hardware-only measurement. Raw times stay intact. Positive values compensate late taps."}</Text>
  </View>;
}
