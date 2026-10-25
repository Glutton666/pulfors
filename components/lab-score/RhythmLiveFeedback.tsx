import React, { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { compareTapTiming } from "@/lib/rhythm-lab/timing-feedback";
import type { Interpretation, RhythmDocument } from "@/lib/rhythm-lab/types";

const signed = (value: number) => `${value > 0 ? "+" : ""}${Math.round(value)}`;

export function RhythmLiveFeedback({ document, interpretation, recording, compact = false }: {
  document: RhythmDocument;
  interpretation: Interpretation;
  recording: boolean;
  compact?: boolean;
}) {
  const { colors: C } = useTheme();
  const { language } = useLanguage();
  const ko = language === "ko";
  const feedback = useMemo(() => compareTapTiming(document, interpretation), [document, interpretation]);
  const latest = feedback.intervals.at(-1);
  const status = document.hits.length < 2 ? (ko ? "두 탭부터 간격 비교" : "Compare after two taps")
    : !feedback.report.valid ? (ko ? "기보 구조 오류" : "Invalid notation")
      : feedback.matches ? (ko ? "타이밍 일치" : "Timing matches")
        : (ko ? "기보 오차 확인" : "Check notation timing");
  return <View testID="rhythm-live-feedback" style={styles.root}>
    <View style={[styles.summary, compact && styles.compactSummary]}>
      <Text style={{ color: C.textSecondary, fontSize: 11 }}>{ko ? "탭 간격" : "Tap interval"}</Text>
      <Text testID="rhythm-live-interval" style={{ color: C.text, fontFamily: "SpaceGrotesk_700Bold", fontSize: compact ? 16 : 21 }}>
        {latest ? Math.round(latest.actualMs) : "—"} <Text style={{ fontSize: 11 }}>ms</Text>
      </Text>
      <Text testID="rhythm-live-verification" numberOfLines={compact ? 2 : undefined} style={{ color: feedback.matches ? C.textSecondary : C.accent, fontSize: 11, flexShrink: 1 }}>
        {status}{feedback.maxIntervalErrorMs !== null ? ` · ${ko ? "최대" : "max"} ${Math.round(feedback.maxIntervalErrorMs)} ms` : ""}
      </Text>
    </View>
    {!compact && <ScrollView horizontal showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.intervals}>
      {feedback.intervals.slice(-4).map((row) => <View key={row.hitId} testID={`rhythm-interval-${row.number}`} style={[styles.interval, { borderColor: C.border }]}>
        <Text style={{ color: C.textSecondary, fontSize: 10 }}>{row.number - 1} → {row.number}</Text>
        <Text style={{ color: C.text, fontSize: 11 }}>{Math.round(row.actualMs)} → {row.notationMs === null ? "—" : Math.round(row.notationMs)} ms</Text>
        <Text style={{ color: row.errorMs !== null && Math.abs(row.errorMs) <= 30 ? C.textSecondary : C.accent, fontSize: 10 }}>
          {ko ? "오차" : "Error"} {row.errorMs === null ? "—" : signed(row.errorMs)} ms
        </Text>
      </View>)}
      {!latest && <Text style={{ color: C.textSecondary, fontSize: 11 }}>{ko ? "실제 탭 → 악보 간격 · ms" : "Actual tap → score interval · ms"}</Text>}
    </ScrollView>}
    {compact && latest && <Text style={{ color: C.textSecondary, fontSize: 10 }}>
      {ko ? "실제 → 악보" : "Tap → score"} {Math.round(latest.actualMs)} → {latest.notationMs === null ? "—" : Math.round(latest.notationMs)} ms
      {latest.errorMs !== null ? ` · ${signed(latest.errorMs)} ms` : ""}
    </Text>}
    <Text style={{ color: C.textTertiary, fontSize: 10 }}>
      {document.hits.some((hit) => hit.midi !== undefined)
        ? (ko ? "건반: 누른 길이 반영" : "Keys: held duration")
        : (ko ? `패드: 탭 간격으로 음가 해석 · 마지막 음가 추정${recording ? " 중" : ""}` : "Pad: interval-based values · last value estimated")}
    </Text>
  </View>;
}

const styles = StyleSheet.create({
  root: { gap: 4, marginVertical: 4 },
  summary: { flexDirection: "row", alignItems: "center", gap: 8 },
  compactSummary: { flexWrap: "wrap", columnGap: 8, rowGap: 2 },
  intervals: { flexDirection: "row", gap: 5, alignItems: "center" },
  interval: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 3, gap: 1 },
});
