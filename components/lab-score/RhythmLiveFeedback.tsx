import React, { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { compareTapTiming } from "@/lib/rhythm-lab/timing-feedback";
import type { Interpretation, RhythmDocument } from "@/lib/rhythm-lab/types";
import type { DraftReport } from "@/lib/rhythm-lab/verification";

const signed = (value: number) => `${value > 0 ? "+" : ""}${Math.round(value)}`;

export function RhythmLiveFeedback({ document, interpretation, report, compact = false }: {
  document: RhythmDocument;
  interpretation: Interpretation;
  report?: DraftReport;
  recording: boolean;
  compact?: boolean;
}) {
  const { colors: C } = useTheme();
  const { language } = useLanguage();
  const ko = language === "ko";
  const feedback = useMemo(() => compareTapTiming(document, interpretation, report), [document, interpretation, report]);
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
    <Text style={{ color: C.textTertiary, fontSize: 10, lineHeight: 14 }}>
      {document.hits.some((hit) => hit.midi !== undefined)
        ? (ko ? "건반: 릴리스 데이터가 있을 때만 입력 음 길이를 측정합니다." : "Keys: input note duration is measured only when release data is available.")
        : document.notationVersion === 2
          ? (ko
            ? "패드 v2: 기본 16분음표, 빠른 간격은 짧게·튜플릿은 비율대로. 남은 쉼은 표시하며 패드 누름 길이는 측정하지 않습니다."
            : "Pad v2: sixteenth default, shortened for faster gaps and scaled for tuplets. Rests are explicit; pad duration is not measured.")
          : (ko
            ? "레거시 패드 기보: 탭 간격 기반 해석, 누름 길이는 측정 안 됨."
            : "Legacy pad notation: interval-based; pad duration is not measured.")}
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
