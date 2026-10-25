import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/contexts/ThemeContext";
import type { DraftReport } from "@/lib/rhythm-lab/verification";

type Region = DraftReport["regions"][number];

type Props = {
  report: DraftReport;
  language: "ko" | "en";
  onReview: (measureIndex: number) => void;
  onListen: (measureIndex: number, kind: "original" | "notation" | "overlay") => void;
  onConfirm: (measureIndex: number) => void;
  onAlternatives: (measureIndex: number) => void;
  onEdit: (measureIndex: number) => void;
  disabled?: boolean;
};

const CODE_LABELS: Record<string, { ko: string; en: string }> = {
  timing: { ko: "타격 시점 차이", en: "Timing differs" },
  ambiguous: { ko: "해석이 여러 가지일 수 있어요", en: "More than one reading may fit" },
  missing: { ko: "빠진 타격이 있어요", en: "A hit may be missing" },
  extra: { ko: "추가된 타격이 있어요", en: "An extra hit may be present" },
  duration: { ko: "음 길이를 확인해 주세요", en: "Check note duration" },
  structure: { ko: "리듬 구조를 확인할 수 없어요", en: "Rhythm structure could not be validated" },
};

const ISSUE_LABELS: Record<string, { ko: string; en: string }> = {
  "glyph-duration": { ko: "표시 음가와 계산 길이가 일치하지 않습니다.", en: "The displayed note value does not match its duration." },
  "bar-position": { ko: "마디 위치 계산이 일치하지 않습니다.", en: "The calculated bar position does not match." },
  "bar-overflow": { ko: "기보가 마디 경계를 넘습니다.", en: "The notation extends past the bar boundary." },
  "collapsed-hits": { ko: "서로 다른 타격이 한 시점으로 합쳐졌습니다.", en: "Distinct strikes have collapsed to one onset." },
  "duplicate-hit": { ko: "원본 타격이 중복 기보되었습니다.", en: "An original hit was notated more than once." },
  "missing-hit": { ko: "원본 타격이 기보에서 누락되었습니다.", en: "An original hit is missing from notation." },
  "unknown-hit": { ko: "기보의 원본 타격 연결이 잘못되었습니다.", en: "A notation event refers to an unknown original hit." },
  "unfilled-gap": { ko: "음표·쉼표 사이의 시간이 채워지지 않았습니다.", en: "There is an unfilled gap between notes and rests." },
  overlap: { ko: "단일 리듬의 음표·쉼표가 겹칩니다.", en: "Notes or rests overlap in a single rhythm." },
  "bar-total": { ko: "마디의 음가 합계가 박자와 맞지 않습니다.", en: "The bar's total duration does not match the meter." },
  invalid_structure: { ko: "기보 구조가 올바르지 않아요", en: "Notation structure is invalid" },
  structure: { ko: "기보 구조를 확인할 수 없어요", en: "Notation structure could not be validated" },
  missing_event: { ko: "기보에서 타격이 빠졌을 수 있어요", en: "A hit may be missing from the notation" },
  extra_event: { ko: "기보에 타격이 더 있을 수 있어요", en: "The notation may contain an extra hit" },
  duration_mismatch: { ko: "음 길이가 입력과 달라요", en: "Note duration differs from the input" },
  ambiguous: { ko: "이 마디는 여러 해석이 가능해요", en: "This measure has multiple possible readings" },
  timing_mismatch: { ko: "타격 시점이 입력과 달라요", en: "Hit timing differs from the input" },
  no_events: { ko: "비교할 기보가 없어요", en: "There is no notation to compare" },
  "protected-boundary": { ko: "보호된 입력 경계와 충돌합니다.", en: "This conflicts with a protected input boundary." },
  protected_boundary: { ko: "보호된 입력 경계와 충돌합니다.", en: "This conflicts with a protected input boundary." },
  "tie-chain": { ko: "붙임줄 연결이 끊겼거나 일치하지 않습니다.", en: "The tie chain is broken or inconsistent." },
  tie_chain: { ko: "붙임줄 연결이 끊겼거나 일치하지 않습니다.", en: "The tie chain is broken or inconsistent." },
};

export function RhythmValidationPanel({
  report,
  language,
  onReview,
  onListen,
  onConfirm,
  onAlternatives,
  onEdit,
  disabled = false,
}: Props) {
  const { colors: C } = useTheme();
  const ko = language === "ko";
  const [selectedMeasure, setSelectedMeasure] = useState<number | null>(null);

  const regions = useMemo(
    () => [...report.regions].sort((a, b) => a.measureIndex - b.measureIndex),
    [report.regions],
  );
  const selected = regions.find((region) => region.measureIndex === selectedMeasure) ?? null;
  const issueRegions = report.issues.filter((issue) => issue.measureIndex === selectedMeasure);
  const outcomeText = (value: boolean | null | undefined) => value == null
    ? (ko ? "측정 안 됨" : "Not measured")
    : value ? (ko ? "일치" : "Match") : (ko ? "차이 있음" : "Differs");
  const canConfirm = (region: Region) =>
    (region.status === "ambiguous" || region.status === "ready" || region.status === "confirmed");

  const chooseMeasure = (measureIndex: number) => {
    setSelectedMeasure(measureIndex);
    onReview(measureIndex);
  };
  const score = report.similarity == null ? "—" : `${report.similarity}%`;

  const reasonText = (reason: string) => {
    const code = ISSUE_LABELS[reason] ?? CODE_LABELS[reason];
    return code ? (ko ? code.ko : code.en) : (ko ? "검토가 필요해요" : "Needs review");
  };
  const issueText = (code: string) => {
    const normalized = code.toLowerCase();
    const inferred = normalized.includes("struct")
      ? CODE_LABELS.structure
      : normalized.includes("missing")
        ? CODE_LABELS.missing
        : normalized.includes("extra")
          ? CODE_LABELS.extra
          : normalized.includes("duration")
            ? CODE_LABELS.duration
            : normalized.includes("timing") || normalized.includes("onset")
              ? CODE_LABELS.timing
              : normalized.includes("ambig")
                ? CODE_LABELS.ambiguous
                : undefined;
    const value = ISSUE_LABELS[code] ?? CODE_LABELS[code] ?? inferred;
    return value ? (ko ? value.ko : value.en) : (ko ? "기보를 검토해 주세요" : "Review this notation");
  };

  const action = (
    label: string,
    icon: keyof typeof Ionicons.glyphMap,
    onPress: () => void,
    testID?: string,
    emphasized = false,
    blocked = false,
  ) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || blocked}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.action,
        {
          backgroundColor: emphasized ? C.accent : C.surfaceLight,
          borderColor: emphasized ? C.accent : C.border,
          opacity: disabled || blocked ? 0.45 : pressed ? 0.72 : 1,
        },
      ]}
    >
      <Ionicons name={icon} size={15} color={emphasized ? C.background : C.textSecondary} />
      <Text style={[styles.actionText, { color: emphasized ? C.background : C.text }]}>{label}</Text>
    </Pressable>
  );

  return (
    <View
      testID="rhythm-validation-panel"
      style={[styles.panel, { backgroundColor: C.surface, borderColor: C.border }]}
    >
      <View style={styles.header}>
        <View style={styles.headingGroup}>
          <View style={[styles.mark, { backgroundColor: C.accent }]}>
            <Ionicons name="pulse" size={16} color={C.background} />
          </View>
          <View style={styles.headingCopy}>
            <Text style={[styles.title, { color: C.text }]}>
              {ko ? "입력–악보 유사율" : "Input ↔ notation similarity"}
            </Text>
            <Text style={[styles.subtitle, { color: C.textSecondary }]}>
              {ko ? "연습 점수가 아닌 탭 시점의 일치도" : "Tap-timing similarity, not a practice grade"}
            </Text>
          </View>
        </View>
        <View style={[styles.similarityBox, { backgroundColor: C.background, borderColor: C.border }]}>
          <Text style={[styles.similarityCaption, { color: C.textTertiary }]}>
            {ko ? "유사율" : "SIMILARITY"}
          </Text>
          <Text testID="rhythm-similarity" style={[styles.similarity, { color: C.accent }]}>
            {score}
          </Text>
        </View>
      </View>

      <Text style={[styles.explanation, { color: C.textSecondary }]}>
        {ko
          ? "원래 타격 시점과 기보의 리듬 시점을 비교합니다. 이 수치는 확신도나 연주 성적이 아닙니다."
          : "Compares the original hit timing with the written rhythm. This is not confidence or a performance score."}
      </Text>

      <View style={styles.checkGrid} testID="rhythm-validation-checks">
        <Check label={ko ? "타격 시점" : "Onset match"} value={outcomeText(report.onsetMatches)} C={C} />
        <Check label={ko ? "측정된 건반 음 길이" : "Measured key duration"} value={outcomeText(report.durationMatches)} C={C} />
        <Check label={ko ? "구조 검증" : "Structural validity"} value={report.valid ? (ko ? "유효" : "Valid") : (ko ? "오류" : "Invalid")} C={C} />
        <Check label={ko ? "의도 승인" : "Intent approval"} value={regions.length > 0 && regions.every((region) => region.status === "confirmed")
          ? (ko ? "확정됨" : "Confirmed") : (ko ? "미확정" : "Not approved")} C={C} />
      </View>

      {!report.valid && (
        <View style={[styles.failure, { backgroundColor: C.background, borderColor: C.border }]}>
          <Ionicons name="alert-circle-outline" size={18} color={C.accent} />
          <View style={styles.failureCopy}>
            <Text style={[styles.failureTitle, { color: C.text }]}>
              {ko ? "이 기보를 검증할 수 없어요" : "This notation could not be validated"}
            </Text>
            <Text style={[styles.failureBody, { color: C.textSecondary }]}>
              {ko ? "앱의 기보 계산 검증에 실패했습니다. 이 구간은 확정할 수 없으며 원본 입력은 보존됩니다." : "The app's notation calculation failed validation. This region cannot be confirmed; your original input is preserved."}
            </Text>
          </View>
        </View>
      )}

      <View style={styles.measureHeader}>
        <Text style={[styles.sectionLabel, { color: C.textTertiary }]}>
          {ko ? "마디별 검토" : "MEASURES"}
        </Text>
        <Text style={[styles.statusLegend, { color: C.textTertiary }]}>
          {ko ? "확정 상태는 일치도와 별개" : "Confirmation is separate from similarity"}
        </Text>
      </View>
      {regions.length ? (
        <View style={styles.measureList}>
          {regions.map((region) => {
            const active = selected?.measureIndex === region.measureIndex;
            const statusLabel = region.status === "confirmed"
              ? (ko ? "확정됨" : "Confirmed")
              : region.status === "invalid"
                ? (ko ? "기보 검증 실패" : "Validation failed")
              : region.status === "unresolved"
                ? (ko ? "해석 미해결" : "Unresolved")
                : region.status === "ambiguous"
                  ? (ko ? "모호함" : "Ambiguous")
                  : (ko ? "검토 전" : "Unconfirmed");
            return (
              <Pressable
                key={region.measureIndex}
                testID={`rhythm-review-region-${region.measureIndex}`}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${ko ? "마디" : "Measure"} ${region.measureIndex + 1}, ${statusLabel}`}
                disabled={disabled}
                onPress={() => chooseMeasure(region.measureIndex)}
                style={({ pressed }) => [
                  styles.measureRow,
                  {
                    backgroundColor: active ? C.surfaceLight : C.background,
                    borderColor: active ? C.accent : C.border,
                    opacity: disabled ? 0.5 : pressed ? 0.76 : 1,
                  },
                ]}
              >
                <View style={[styles.measureNumber, { backgroundColor: active ? C.accent : C.surfaceLight }]}>
                  <Text style={[styles.measureNumberText, { color: active ? C.background : C.text }]}>
                    {String(region.measureIndex + 1).padStart(2, "0")}
                  </Text>
                </View>
                <View style={styles.measureInfo}>
                  <Text style={[styles.measureTitle, { color: C.text }]}>
                    {ko ? `마디 ${region.measureIndex + 1}` : `Measure ${region.measureIndex + 1}`}
                  </Text>
                  <Text style={[styles.measureMeta, { color: C.textSecondary }]}>
                    {region.similarity == null ? "—" : `${region.similarity}%`}
                    {"  ·  "}
                    {statusLabel}
                  </Text>
                </View>
                <Ionicons
                  name={region.status === "confirmed" ? "checkmark-circle" : "chevron-forward"}
                  size={18}
                  color={region.status === "confirmed" ? C.accent : C.textTertiary}
                />
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View style={[styles.empty, { backgroundColor: C.background, borderColor: C.border }]}>
          <Text style={[styles.emptyText, { color: C.textSecondary }]}>
            {ko ? "비교할 마디가 아직 없습니다." : "No measures to compare yet."}
          </Text>
        </View>
      )}

      {selected && (
        <View style={[styles.detail, { borderTopColor: C.border }]}>
          <View style={styles.detailHeading}>
            <Text style={[styles.detailTitle, { color: C.text }]}>
              {ko ? `마디 ${selected.measureIndex + 1} 세부 검토` : `Measure ${selected.measureIndex + 1}`}
            </Text>
            <Text style={[styles.detailSimilarity, { color: C.accent }]}>
              {selected.similarity == null ? "—" : `${selected.similarity}%`}
            </Text>
          </View>

          <View style={styles.metrics}>
            <Metric label={ko ? "평균 오차" : "Mean"} value={`${Math.round(selected.meanErrorMs * 10) / 10} ms`} C={C} />
            <Metric label={ko ? "최대 오차" : "Peak"} value={`${Math.round(selected.maxErrorMs * 10) / 10} ms`} C={C} />
            <Metric label={ko ? "빠짐 / 추가" : "Missing / extra"} value={`${selected.missing} / ${selected.extra}`} C={C} />
            <Metric label={ko ? "음 길이 최대 오차" : "Duration peak"} value={selected.maxDurationErrorMs == null ? "—" : `${Math.round(selected.maxDurationErrorMs * 10) / 10} ms`} C={C} />
          </View>
          <View style={styles.checkGrid} testID={`rhythm-region-checks-${selected.measureIndex}`}>
            <Check label={ko ? "타격 시점" : "Onset match"} value={outcomeText(selected.onsetMatches)} C={C} />
            <Check
              label={ko ? `건반 음 길이${selected.comparedDurations ? ` · ${selected.comparedDurations}` : ""}` : `Key duration${selected.comparedDurations ? ` · ${selected.comparedDurations}` : ""}`}
              value={outcomeText(selected.durationMatches)}
              C={C}
            />
            <Check label={ko ? "구조 검증" : "Structure"} value={issueRegions.length ? (ko ? "오류" : "Invalid") : (ko ? "유효" : "Valid")} C={C} />
            <Check label={ko ? "의도 승인" : "Intent approval"} value={selected.status === "confirmed" ? (ko ? "확정됨" : "Confirmed") : (ko ? "미확정" : "Not approved")} C={C} />
          </View>

          {(selected.reasons.length > 0 || issueRegions.length > 0) && (
            <View style={styles.reasons}>
              {[...new Set([...selected.reasons.map(reasonText), ...issueRegions.map((issue) => issueText(issue.code))])].map((reason) => (
                <View key={reason} style={[styles.reasonPill, { backgroundColor: C.surfaceLight, borderColor: C.border }]}>
                  <View style={[styles.reasonDot, { backgroundColor: C.accent }]} />
                  <Text style={[styles.reasonText, { color: C.textSecondary }]}>{reason}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.actionGroup}>
            {action(ko ? "원본" : "Original", "musical-notes-outline", () => onListen(selected.measureIndex, "original"))}
            {action(ko ? "기보" : "Notation", "document-text-outline", () => onListen(selected.measureIndex, "notation"), undefined, false, selected.status === "invalid")}
            {action(ko ? "겹쳐 듣기" : "Overlay", "layers-outline", () => onListen(selected.measureIndex, "overlay"), undefined, false, selected.status === "invalid")}
          </View>
          <View style={styles.actionGroup}>
            {action(ko ? "다른 해석" : "Alternatives", "git-compare-outline", () => onAlternatives(selected.measureIndex), undefined, false, selected.candidateCount < 2)}
            {selected.status !== "invalid" && action(ko ? "직접 수정" : "Edit notation", "create-outline", () => onEdit(selected.measureIndex))}
            {canConfirm(selected)
              ? action(
                  selected.status === "confirmed" ? (ko ? "확정됨" : "Confirmed") : (ko ? "마디 확정" : "Confirm measure"),
                  "checkmark-circle-outline",
                  () => onConfirm(selected.measureIndex),
                  "rhythm-review-confirm",
                  true,
                  selected.status === "confirmed",
                )
              : null}
          </View>
        </View>
      )}
    </View>
  );
}

function Metric({ label, value, C }: { label: string; value: string; C: ReturnType<typeof useTheme>["colors"] }) {
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricLabel, { color: C.textTertiary }]}>{label}</Text>
      <Text style={[styles.metricValue, { color: C.text }]}>{value}</Text>
    </View>
  );
}

function Check({ label, value, C }: { label: string; value: string; C: ReturnType<typeof useTheme>["colors"] }) {
  return <View style={[styles.check, { borderColor: C.border, backgroundColor: C.background }]}>
    <Text style={[styles.checkLabel, { color: C.textTertiary }]}>{label}</Text>
    <Text style={[styles.checkValue, { color: C.text }]}>{value}</Text>
  </View>;
}

const styles = StyleSheet.create({
  panel: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 12, overflow: "hidden" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  headingGroup: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 10 },
  mark: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  headingCopy: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 15, fontFamily: "SpaceGrotesk_700Bold" },
  subtitle: { fontSize: 11, lineHeight: 15 },
  similarityBox: { minWidth: 68, borderWidth: 1, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 6, alignItems: "center" },
  similarityCaption: { fontSize: 8, letterSpacing: 0.8, fontFamily: "SpaceGrotesk_700Bold" },
  similarity: { fontSize: 20, lineHeight: 24, fontFamily: "SpaceGrotesk_700Bold" },
  explanation: { fontSize: 11, lineHeight: 16, marginTop: -3 },
  checkGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  check: { flexGrow: 1, flexBasis: "46%", minWidth: 125, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, gap: 3 },
  checkLabel: { fontSize: 9 },
  checkValue: { fontSize: 11, fontFamily: "SpaceGrotesk_700Bold" },
  failure: { flexDirection: "row", gap: 9, alignItems: "flex-start", borderWidth: 1, borderRadius: 10, padding: 10 },
  failureCopy: { flex: 1, gap: 3 },
  failureTitle: { fontSize: 12, fontFamily: "SpaceGrotesk_700Bold" },
  failureBody: { fontSize: 11, lineHeight: 15 },
  measureHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginTop: 1 },
  sectionLabel: { fontSize: 9, letterSpacing: 1, fontFamily: "SpaceGrotesk_700Bold" },
  statusLegend: { flexShrink: 1, fontSize: 9, textAlign: "right" },
  measureList: { gap: 6 },
  measureRow: { minHeight: 46, borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5, flexDirection: "row", alignItems: "center", gap: 9 },
  measureNumber: { width: 31, height: 31, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  measureNumberText: { fontSize: 11, fontFamily: "SpaceGrotesk_700Bold" },
  measureInfo: { flex: 1, gap: 2 },
  measureTitle: { fontSize: 12, fontFamily: "SpaceGrotesk_700Bold" },
  measureMeta: { fontSize: 10 },
  empty: { minHeight: 44, borderWidth: 1, borderRadius: 10, borderStyle: "dashed", justifyContent: "center", paddingHorizontal: 12 },
  emptyText: { fontSize: 11 },
  detail: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 11, gap: 10 },
  detailHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  detailTitle: { fontSize: 13, fontFamily: "SpaceGrotesk_700Bold" },
  detailSimilarity: { fontSize: 14, fontFamily: "SpaceGrotesk_700Bold" },
  metrics: { flexDirection: "row", gap: 6 },
  metric: { flex: 1, minWidth: 0, backgroundColor: "transparent", gap: 3 },
  metricLabel: { fontSize: 9 },
  metricValue: { fontSize: 11, fontFamily: "SpaceGrotesk_700Bold" },
  reasons: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  reasonPill: { minHeight: 26, borderWidth: 1, borderRadius: 20, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 5 },
  reasonDot: { width: 5, height: 5, borderRadius: 3 },
  reasonText: { fontSize: 10 },
  actionGroup: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  action: { minHeight: 36, flexGrow: 1, flexBasis: 90, borderWidth: 1, borderRadius: 9, paddingHorizontal: 9, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  actionText: { fontSize: 10, fontFamily: "SpaceGrotesk_700Bold" },
});

export default RhythmValidationPanel;
