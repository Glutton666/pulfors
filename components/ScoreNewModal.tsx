// ============================================================
// ScoreNewModal — 새 악보 만들기 설정 모달
// ============================================================

import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
} from "react-native";
import { AnimatedModal } from "@/components/AnimatedModal";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useScale } from "@/lib/scale";
import { Radius, Spacing, FontSize } from "@/constants/tokens";
import { createScoreDocument } from "@/lib/score-storage";
import { INSTRUMENTS } from "@/lib/score-types";
import type { ScoreDocument, ClefType } from "@/lib/score-types";

// 지원 악기 목록
const INSTRUMENT_OPTIONS: Array<{ id: string }> = [
  { id: "piano" }, { id: "violin" }, { id: "viola" }, { id: "cello" },
  { id: "bass" }, { id: "flute" }, { id: "oboe" }, { id: "clarinet" },
  { id: "saxophone" }, { id: "trumpet" }, { id: "horn" }, { id: "trombone" },
  { id: "drums" }, { id: "guitar" }, { id: "soprano" }, { id: "alto" },
  { id: "tenor" }, { id: "baritone" }, { id: "custom" },
];

const INSTRUMENT_KEY_MAP: Record<string, string> = {
  piano: "instrPiano", violin: "instrViolin", viola: "instrViola",
  cello: "instrCello", bass: "instrBass", flute: "instrFlute",
  oboe: "instrOboe", clarinet: "instrClarinet", saxophone: "instrSaxophone",
  trumpet: "instrTrumpet", horn: "instrHorn", trombone: "instrTrombone",
  drums: "instrDrums", guitar: "instrGuitar", soprano: "instrSoprano",
  alto: "instrAlto", tenor: "instrTenor", baritone: "instrBaritone",
  custom: "instrCustom",
};

const CLEF_OPTIONS: ClefType[] = ["treble", "bass", "alto", "tenor", "percussion"];
const CLEF_KEY_MAP: Record<ClefType, string> = {
  treble: "clefTreble", bass: "clefBass", alto: "clefAlto",
  tenor: "clefTenor", percussion: "clefPerc",
};

const TIME_SIGNATURES = [
  { num: 4, den: 4 }, { num: 3, den: 4 }, { num: 2, den: 4 },
  { num: 6, den: 8 }, { num: 9, den: 8 }, { num: 12, den: 8 },
  { num: 2, den: 2 }, { num: 5, den: 4 }, { num: 7, den: 8 },
];

const KEY_SIGNATURE_OPTIONS = [
  { sharps: -7 }, { sharps: -6 }, { sharps: -5 }, { sharps: -4 },
  { sharps: -3 }, { sharps: -2 }, { sharps: -1 }, { sharps: 0 },
  { sharps: 1 }, { sharps: 2 }, { sharps: 3 }, { sharps: 4 },
  { sharps: 5 }, { sharps: 6 }, { sharps: 7 },
];

function accidentalLabel(sharps: number): string {
  if (sharps === 0) return "♮";
  if (sharps > 0) return `♯×${sharps}`;
  return `♭×${Math.abs(sharps)}`;
}

// 성부 설정
interface PartDraft {
  instrumentId: string;
  clef: ClefType;
}

function defaultClef(instrumentId: string): ClefType {
  return INSTRUMENTS[instrumentId]?.defaultClef ?? "treble";
}

const MAX_PARTS = 8;

export interface ScoreNewModalProps {
  visible: boolean;
  defaultBpm: number;
  onClose: () => void;
  onCreate: (doc: ScoreDocument) => void;
}

export function ScoreNewModal({ visible, defaultBpm, onClose, onCreate }: ScoreNewModalProps) {
  const { colors: C } = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const S = useScale();
  const webTopInset = Platform.OS === "web" ? 67 : 0;

  const [title, setTitle] = useState("");
  const [bpmText, setBpmText] = useState(String(defaultBpm));
  const [parts, setParts] = useState<PartDraft[]>([
    { instrumentId: "piano", clef: "treble" },
  ]);
  const [expandedPartIdx, setExpandedPartIdx] = useState<number | null>(null);
  const [timeNumerator, setTimeNumerator] = useState(4);
  const [timeDenominator, setTimeDenominator] = useState(4);
  const [keySharps, setKeySharps] = useState(0);

  const styles = makeStyles(C, S);

  function handleCreate() {
    const parsedBpm = Math.max(20, Math.min(300, parseInt(bpmText, 10) || defaultBpm));
    const doc = createScoreDocument({
      title: title.trim() || t("scoreMode", "untitled"),
      parts: parts.map((p) => ({ instrumentId: p.instrumentId })),
      timeSignature: { numerator: timeNumerator, denominator: timeDenominator },
      bpm: parsedBpm,
      keySharps,
    });
    // 각 성부의 클레프 적용
    doc.parts.forEach((p, i) => {
      if (parts[i]) p.clef = parts[i].clef;
    });
    onCreate(doc);
    resetForm();
  }

  function resetForm() {
    setTitle("");
    setBpmText(String(defaultBpm));
    setParts([{ instrumentId: "piano", clef: "treble" }]);
    setExpandedPartIdx(null);
    setTimeNumerator(4);
    setTimeDenominator(4);
    setKeySharps(0);
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  function addPart() {
    if (parts.length >= MAX_PARTS) return;
    setParts((prev) => [...prev, { instrumentId: "violin", clef: "treble" }]);
    setExpandedPartIdx(parts.length);
  }

  function removePart(idx: number) {
    if (parts.length <= 1) return;
    setParts((prev) => prev.filter((_, i) => i !== idx));
    setExpandedPartIdx(null);
  }

  function updatePart(idx: number, patch: Partial<PartDraft>) {
    setParts((prev) =>
      prev.map((p, i) => {
        if (i !== idx) return p;
        const updated = { ...p, ...patch };
        // 악기 변경 시 기본 클레프 자동 적용
        if (patch.instrumentId && !patch.clef) {
          updated.clef = defaultClef(patch.instrumentId);
        }
        return updated;
      })
    );
  }

  return (
    <AnimatedModal visible={visible} transparent onRequestClose={handleClose}>
      <Pressable style={styles.overlay} onPress={handleClose} testID="score-new-modal-overlay">
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: C.surface,
              borderColor: C.border,
              paddingTop: (insets.top || webTopInset) + 16,
              paddingBottom: 24 + (insets.bottom || (Platform.OS === "web" ? 34 : 0)),
            },
          ]}
          onStartShouldSetResponder={() => true}
        >
          <View style={styles.handle} />
          <Text style={[styles.title, { color: C.text }]}>{t("scoreMode", "newTitle")}</Text>

          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 460 }}>
            {/* 제목 */}
            <Text style={[styles.label, { color: C.textSecondary }]}>{t("scoreMode", "scoreTitleLabel")}</Text>
            <TextInput
              style={[styles.textInput, { color: C.text, borderColor: C.border, backgroundColor: C.background }]}
              value={title}
              onChangeText={setTitle}
              placeholder={t("scoreMode", "scoreTitlePlaceholder")}
              placeholderTextColor={C.textSecondary}
              maxLength={60}
              testID="score-new-title-input"
            />

            {/* BPM */}
            <Text style={[styles.label, { color: C.textSecondary }]}>{t("scoreMode", "bpmLabel")}</Text>
            <View style={styles.bpmRow}>
              <Pressable
                style={[styles.bpmBtn, { borderColor: C.border }]}
                onPress={() => setBpmText((v) => String(Math.max(20, (parseInt(v, 10) || defaultBpm) - 5)))}
                testID="score-new-bpm-down"
              >
                <Ionicons name="remove" size={18} color={C.text} />
              </Pressable>
              <TextInput
                style={[styles.bpmInput, { color: C.text, borderColor: C.border, backgroundColor: C.background }]}
                value={bpmText}
                onChangeText={(v) => setBpmText(v.replace(/[^0-9]/g, ""))}
                keyboardType="numeric"
                maxLength={3}
                textAlign="center"
                testID="score-new-bpm-input"
              />
              <Pressable
                style={[styles.bpmBtn, { borderColor: C.border }]}
                onPress={() => setBpmText((v) => String(Math.min(300, (parseInt(v, 10) || defaultBpm) + 5)))}
                testID="score-new-bpm-up"
              >
                <Ionicons name="add" size={18} color={C.text} />
              </Pressable>
            </View>

            {/* 성부(파트) 설정 */}
            <View style={styles.sectionHeader}>
              <Text style={[styles.label, { color: C.textSecondary, marginTop: 0 }]}>
                {t("scoreMode", "partCountLabel")} ({parts.length}/{MAX_PARTS})
              </Text>
              {parts.length < MAX_PARTS && (
                <Pressable
                  style={[styles.addPartBtn, { borderColor: C.accent }]}
                  onPress={addPart}
                  testID="score-new-add-part"
                >
                  <Ionicons name="add" size={14} color={C.accent} />
                  <Text style={[styles.addPartText, { color: C.accent }]}>추가</Text>
                </Pressable>
              )}
            </View>

            {parts.map((part, idx) => {
              const isExpanded = expandedPartIdx === idx;
              return (
                <View key={idx} style={[styles.partCard, { borderColor: C.border, backgroundColor: C.background }]}>
                  {/* 헤더 */}
                  <Pressable
                    style={styles.partCardHeader}
                    onPress={() => setExpandedPartIdx(isExpanded ? null : idx)}
                    testID={`score-new-part-header-${idx}`}
                  >
                    <View style={[styles.partNumBadge, { backgroundColor: C.accent }]}>
                      <Text style={styles.partNumText}>{idx + 1}</Text>
                    </View>
                    <Text style={[styles.partName, { color: C.text }]}>
                      {t("scoreMode", INSTRUMENT_KEY_MAP[part.instrumentId] as any)} — {t("scoreMode", CLEF_KEY_MAP[part.clef] as any)}
                    </Text>
                    <View style={{ flex: 1 }} />
                    {parts.length > 1 && (
                      <Pressable
                        onPress={() => removePart(idx)}
                        hitSlop={8}
                        testID={`score-new-remove-part-${idx}`}
                      >
                        <Ionicons name="close-circle-outline" size={18} color="#E55" />
                      </Pressable>
                    )}
                    <Ionicons
                      name={isExpanded ? "chevron-up" : "chevron-down"}
                      size={16}
                      color={C.textSecondary}
                      style={{ marginLeft: 4 }}
                    />
                  </Pressable>

                  {/* 확장 시 악기/클레프 선택 */}
                  {isExpanded && (
                    <View style={styles.partCardBody}>
                      <Text style={[styles.subLabel, { color: C.textSecondary }]}>{t("scoreMode", "instrumentLabel")}</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <View style={{ flexDirection: "row", gap: 6 }}>
                          {INSTRUMENT_OPTIONS.map((inst) => {
                            const isSel = part.instrumentId === inst.id;
                            return (
                              <Pressable
                                key={inst.id}
                                style={[
                                  styles.chip,
                                  { borderColor: isSel ? C.accent : C.border, backgroundColor: isSel ? C.accent + "22" : C.surface },
                                ]}
                                onPress={() => updatePart(idx, { instrumentId: inst.id })}
                                testID={`score-new-part-${idx}-instrument-${inst.id}`}
                              >
                                <Text style={[styles.chipText, { color: isSel ? C.accent : C.text }]}>
                                  {t("scoreMode", INSTRUMENT_KEY_MAP[inst.id] as any)}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </ScrollView>

                      <Text style={[styles.subLabel, { color: C.textSecondary, marginTop: 8 }]}>
                        {t("scoreMode", "clefTreble").replace("높은음자리표", "음자리표").replace("Treble Clef", "Clef")}
                      </Text>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                        {CLEF_OPTIONS.map((clef) => {
                          const isSel = part.clef === clef;
                          return (
                            <Pressable
                              key={clef}
                              style={[
                                styles.chip,
                                { borderColor: isSel ? C.accent : C.border, backgroundColor: isSel ? C.accent + "22" : C.surface },
                              ]}
                              onPress={() => updatePart(idx, { clef })}
                              testID={`score-new-part-${idx}-clef-${clef}`}
                            >
                              <Text style={[styles.chipText, { color: isSel ? C.accent : C.text }]}>
                                {t("scoreMode", CLEF_KEY_MAP[clef] as any)}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  )}
                </View>
              );
            })}

            {/* 박자표 */}
            <Text style={[styles.label, { color: C.textSecondary }]}>{t("scoreMode", "timeSignatureLabel")}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
              <View style={{ flexDirection: "row", gap: 6 }}>
                {TIME_SIGNATURES.map((ts) => {
                  const isSel = ts.num === timeNumerator && ts.den === timeDenominator;
                  return (
                    <Pressable
                      key={`${ts.num}/${ts.den}`}
                      style={[styles.chip, { borderColor: isSel ? C.accent : C.border, backgroundColor: isSel ? C.accent + "22" : C.background }]}
                      onPress={() => { setTimeNumerator(ts.num); setTimeDenominator(ts.den); }}
                      testID={`score-new-timesig-${ts.num}-${ts.den}`}
                    >
                      <Text style={[styles.chipText, { color: isSel ? C.accent : C.text }]}>
                        {ts.num}/{ts.den}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>

            {/* 조표 */}
            <Text style={[styles.label, { color: C.textSecondary }]}>{t("scoreMode", "keySignatureLabel")}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
              <View style={{ flexDirection: "row", gap: 6 }}>
                {KEY_SIGNATURE_OPTIONS.map((ks) => {
                  const isSel = ks.sharps === keySharps;
                  return (
                    <Pressable
                      key={ks.sharps}
                      style={[styles.chip, { borderColor: isSel ? C.accent : C.border, backgroundColor: isSel ? C.accent + "22" : C.background }]}
                      onPress={() => setKeySharps(ks.sharps)}
                      testID={`score-new-key-${ks.sharps}`}
                    >
                      <Text style={[styles.chipText, { color: isSel ? C.accent : C.text }]}>
                        {accidentalLabel(ks.sharps)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>

            <View style={{ height: 8 }} />
          </ScrollView>

          {/* 버튼 */}
          <View style={styles.btnRow}>
            <Pressable
              style={[styles.cancelBtn, { backgroundColor: C.background, borderColor: C.border }]}
              onPress={handleClose}
              testID="score-new-cancel"
            >
              <Text style={[styles.cancelText, { color: C.text }]}>{t("scoreMode", "cancel")}</Text>
            </Pressable>
            <Pressable
              style={[styles.createBtn, { backgroundColor: C.accent }]}
              onPress={handleCreate}
              testID="score-new-create"
            >
              <Text style={styles.createText}>{t("scoreMode", "create")}</Text>
            </Pressable>
          </View>
        </View>
      </Pressable>
    </AnimatedModal>
  );
}

const makeStyles = (C: any, S: any) =>
  StyleSheet.create({
    overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
    sheet: {
      borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
      borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1,
      paddingHorizontal: Spacing.lg, gap: Spacing.sm,
    },
    handle: { alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: C.border, marginBottom: Spacing.xs },
    title: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: FontSize.subtitle, marginBottom: Spacing.xs },
    label: { fontFamily: "SpaceGrotesk_500Medium", fontSize: FontSize.small, marginTop: Spacing.sm, marginBottom: 4 },
    subLabel: { fontFamily: "SpaceGrotesk_500Medium", fontSize: 11 },
    textInput: {
      borderWidth: 1, borderRadius: Radius.md,
      paddingHorizontal: Spacing.md, paddingVertical: 10,
      fontFamily: "SpaceGrotesk_400Regular", fontSize: FontSize.body,
    },
    bpmRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    bpmBtn: { borderWidth: 1, borderRadius: Radius.md, padding: 8 },
    bpmInput: {
      flex: 1, borderWidth: 1, borderRadius: Radius.md,
      paddingVertical: 10, fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: FontSize.subtitle,
    },
    sectionHeader: { flexDirection: "row", alignItems: "center", marginTop: Spacing.sm, marginBottom: 4 },
    addPartBtn: {
      flexDirection: "row", alignItems: "center", gap: 2,
      borderWidth: 1, borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 3,
    },
    addPartText: { fontFamily: "SpaceGrotesk_500Medium", fontSize: FontSize.small },
    partCard: { borderWidth: 1, borderRadius: Radius.md, marginBottom: 6, overflow: "hidden" },
    partCardHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 9, gap: 8 },
    partNumBadge: { width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },
    partNumText: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 11, color: "#fff" },
    partName: { fontFamily: "SpaceGrotesk_500Medium", fontSize: FontSize.small },
    partCardBody: { paddingHorizontal: 10, paddingBottom: 10, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 8 },
    chip: { borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 10, paddingVertical: 6 },
    chipText: { fontFamily: "SpaceGrotesk_500Medium", fontSize: FontSize.small },
    btnRow: { flexDirection: "row", gap: Spacing.md, marginTop: Spacing.md },
    cancelBtn: { flex: 1, borderWidth: 1, borderRadius: Radius.md, paddingVertical: 12, alignItems: "center" },
    cancelText: { fontFamily: "SpaceGrotesk_500Medium", fontSize: FontSize.body },
    createBtn: { flex: 2, borderRadius: Radius.md, paddingVertical: 12, alignItems: "center" },
    createText: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: FontSize.body, color: "#fff" },
  });
