import React from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useTheme } from "@/contexts/ThemeContext";
import type { useRhythmCalibration } from "@/hooks/useRhythmCalibration";
import { RhythmInputSurface } from "./RhythmInputSurface";

export function RhythmCalibrationPanel({ ko, calibration, offset, onOffset, onReset, onStart, onTap, disabled }: {
  ko: boolean; calibration: ReturnType<typeof useRhythmCalibration>; offset: string;
  onOffset: (value: string) => void; onReset: () => void; onStart: () => void; onTap: () => void; disabled: boolean;
}) {
  const { colors: C } = useTheme();
  const measuring = calibration.phase === "preparing" || calibration.phase === "playing";
  const countingIn = calibration.message.startsWith("count-in:");
  const message = calibration.phase === "idle" ? (ko ? "기준음 시작 → 예비 4박 듣기 → 16박에 맞춰 탭" : "Start reference → listen for 4 beats → tap 16 beats")
    : calibration.phase === "preparing" ? (ko ? "기준음 준비 중…" : "Preparing reference…")
      : calibration.phase === "done" ? (ko ? `보정 적용: ${calibration.message}` : `Applied: ${calibration.message}`)
        : calibration.phase === "error" ? calibration.message === "reference-failed"
          ? (ko ? "기준음을 재생하지 못했습니다. 다시 시작하세요. 기존 보정값은 유지됩니다." : "Reference playback failed. Please restart. Previous offset kept.")
          : (ko ? `탭 ${calibration.count}/16 · 누락·중복 또는 불안정한 박으로 적용하지 못했습니다. 다시 시도하세요.` : `Taps ${calibration.count}/16 · missing, duplicate or unstable beats. Not applied; please retry.`)
          : countingIn ? `${ko ? "예비박" : "Count-in"} ${calibration.message.split(":")[1]}`
            : `${ko ? "탭" : "Taps"} ${calibration.count}/16`;
  const padLabel = !measuring ? (ko ? "눌러서 보정 시작" : "Tap to start calibration")
    : calibration.phase === "preparing" ? (ko ? "기준음 준비 중…" : "Preparing reference…")
      : countingIn ? (ko ? "예비박을 듣고 기다리세요" : "Listen to the count-in")
        : (ko ? "기준음에 맞춰 탭" : "Tap with the reference");
  return <View style={{ gap: 8 }}>
    <Text style={{ color: C.text, fontSize: 13 }}>{ko ? "타이밍 보정" : "Timing calibration"}</Text>
    <Text testID="rhythm-calibration-status" accessibilityLiveRegion="polite" style={{ color: C.textSecondary, fontSize: 11 }}>{message}</Text>
    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
      <TextInput testID="rhythm-offset-input" accessibilityLabel={ko ? "수동 오프셋 ms" : "Manual offset ms"} value={offset}
        editable={!disabled} onChangeText={onOffset} onBlur={() => {
          const normalized = String(Number.isFinite(Number(offset)) ? Math.max(-2000, Math.min(2000, Number(offset))) : 0);
          // Focus/keyboard changes alone are not a manual edit. Calling the
          // editor here would cancel an active calibration without any input.
          if (normalized !== offset) onOffset(normalized);
        }}
        keyboardType="numbers-and-punctuation" style={{ color: C.text, borderColor: C.border, borderWidth: 1, borderRadius: 8, padding: 8, minWidth: 75 }} />
      <Text style={{ color: C.textSecondary, fontSize: 11 }}>{ko ? "ms · 현재 적용값" : "ms · current offset"}</Text>
      <Pressable testID="rhythm-calibration-reset" accessibilityRole="button" disabled={disabled} onPress={onReset} style={{ padding: 10 }}><Text style={{ color: C.text }}>{ko ? "초기화" : "Reset"}</Text></Pressable>
      <Pressable testID="rhythm-calibration-reference" accessibilityRole="button" disabled={disabled} onPress={onStart} style={{ padding: 10, borderWidth: 1, borderColor: C.border, borderRadius: 8 }}><Text style={{ color: C.text }}>{ko ? "기준음 시작 / 다시 시작" : "Start / restart reference"}</Text></Pressable>
    </View>
    <RhythmInputSurface testID="rhythm-calibration-tap" label={padLabel}
      disabled={disabled || calibration.phase === "preparing" || calibration.phase === "playing" && calibration.count >= 16}
      onDown={measuring ? onTap : onStart} onUp={() => {}}
      style={{ backgroundColor: C.accent, borderRadius: 12, minHeight: 64, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: C.background }}>{padLabel}{calibration.phase === "playing" && !countingIn ? ` · ${Math.min(16, calibration.count)}/16` : ""}</Text>
    </RhythmInputSurface>
    <Text style={{ color: C.textSecondary, fontSize: 10 }}>{ko ? "16회 측정이 끝나면 위 적용값이 갱신됩니다. 개인의 듣기·입력 오차 보정이며 원본 시각은 바뀌지 않습니다. +값은 늦은 입력을 앞당깁니다." : "The current offset updates after all 16 taps. Personal listening/input offset, not a hardware-only measurement. Raw times stay intact. Positive values compensate late taps."}</Text>
  </View>;
}
