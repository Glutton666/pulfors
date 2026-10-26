import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useTheme } from "@/contexts/ThemeContext";

const values = [1, 2, 4, 8, 16, 24, 32, 64];

/** A reserved guidance area keeps the strike target still when the hint expires. */
export function RhythmEntryGuidance({ message, manual, duration, onDuration, disabled, hint, ko, compact, width, stacked = false }: {
  message: string; manual: boolean; duration: number; onDuration: (value: number) => void;
  disabled: boolean; hint: boolean; ko: boolean; compact: boolean; width?: number; stacked?: boolean;
}) {
  const { colors: C } = useTheme();
  const denominator = values.find((value) => Math.abs(duration - 4 / value) < 0.001);
  const valueLabel = denominator === 24 ? "16³" : denominator ? `1/${denominator}` : `${duration}${ko ? "박" : "q"}`;
  return <View testID="rhythm-entry-guidance" style={{ height: compact && stacked ? (manual ? 48 : 28) : compact ? 104 : 58, width: compact && !stacked ? width : "100%", justifyContent: "center", gap: 3 }}>
    <Text testID="rhythm-input-guidance" accessibilityLiveRegion="polite" style={{ color: C.textSecondary, fontSize: 11, lineHeight: 14 }}>{message}</Text>
    {manual ? <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
      <Text testID="rhythm-entry-current-value" style={{ color: C.textSecondary, fontSize: 10 }}>{ko ? "음가" : "Value"} {valueLabel}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
        {values.map((value) => <Pressable key={value} testID={`rhythm-entry-value-${value}`} accessibilityRole="button"
          accessibilityLabel={ko ? `${value}분 음표${value === 24 ? " (연음)" : ""}` : `1/${value} note${value === 24 ? " (triplet)" : ""}`}
          accessibilityState={{ selected: Math.abs(duration - 4 / value) < 0.001, disabled }}
          disabled={disabled} onPress={() => onDuration(4 / value)}
          style={{ paddingHorizontal: 6, minHeight: 26, justifyContent: "center", borderWidth: 1, borderRadius: 5, marginRight: 3, borderColor: Math.abs(duration - 4 / value) < 0.001 ? C.accent : C.border }}>
          <Text style={{ color: C.text, fontSize: 10 }}>{value === 24 ? "16³" : value}</Text>
        </Pressable>)}
      </ScrollView>
    </View> : <View style={{ minHeight: 26, justifyContent: "center" }}>
      {hint && <Text testID="rhythm-stopped-hint" accessibilityLiveRegion="polite" style={{ color: C.accent, fontSize: 10, lineHeight: 12 }}>
        {ko ? "지금은 소리만 납니다 · 녹음 시작을 누르세요" : "Sound only · press Start recording to capture"}
      </Text>}
    </View>}
  </View>;
}
