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
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useScale } from "@/lib/scale";
import { Radius, Spacing, FontSize } from "@/constants/tokens";
import { createScoreDocument } from "@/lib/score-storage";
import type { ScoreDocument } from "@/lib/score-types";

// 지원 악기 목록 (ID, 번역 키)
const INSTRUMENT_OPTIONS: Array<{ id: string; icon: string }> = [
  { id: "piano",       icon: "piano" },
  { id: "violin",      icon: "music" },
  { id: "viola",       icon: "music" },
  { id: "cello",       icon: "music" },
  { id: "bass",        icon: "music" },
  { id: "flute",       icon: "music" },
  { id: "oboe",        icon: "music" },
  { id: "clarinet",    icon: "music" },
  { id: "saxophone",   icon: "music" },
  { id: "trumpet",     icon: "music" },
  { id: "horn",        icon: "music" },
  { id: "trombone",    icon: "music" },
  { id: "drums",       icon: "music" },
  { id: "guitar",      icon: "music" },
  { id: "soprano",     icon: "mic" },
  { id: "alto",        icon: "mic" },
  { id: "tenor",       icon: "mic" },
  { id: "baritone",    icon: "mic" },
  { id: "custom",      icon: "add-circle-outline" },
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

const TIME_SIGNATURES = [
  { num: 4, den: 4 },
  { num: 3, den: 4 },
  { num: 2, den: 4 },
  { num: 6, den: 8 },
  { num: 9, den: 8 },
  { num: 12, den: 8 },
  { num: 2, den: 2 },
  { num: 5, den: 4 },
  { num: 7, den: 8 },
];

const KEY_SIGNATURE_OPTIONS = [
  { sharps: -7, labelKey: "keyCbMaj" },
  { sharps: -6, labelKey: "keyGbMaj" },
  { sharps: -5, labelKey: "keyDbMaj" },
  { sharps: -4, labelKey: "keyAbMaj" },
  { sharps: -3, labelKey: "keyEbMaj" },
  { sharps: -2, labelKey: "keyBbMaj" },
  { sharps: -1, labelKey: "keyFMaj" },
  { sharps:  0, labelKey: "keyCMaj" },
  { sharps:  1, labelKey: "keyGMaj" },
  { sharps:  2, labelKey: "keyDMaj" },
  { sharps:  3, labelKey: "keyAMaj" },
  { sharps:  4, labelKey: "keyEMaj" },
  { sharps:  5, labelKey: "keyBMaj" },
  { sharps:  6, labelKey: "keyFsMaj" },
  { sharps:  7, labelKey: "keyCsMaj" },
];

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
  const [selectedInstrument, setSelectedInstrument] = useState("piano");
  const [partCount, setPartCount] = useState<1 | 2>(1);
  const [timeNumerator, setTimeNumerator] = useState(4);
  const [timeDenominator, setTimeDenominator] = useState(4);
  const [keySharps, setKeySharps] = useState(0);
  const [section, setSection] = useState<"instrument" | "time" | "key" | null>(null);

  const styles = makeStyles(C, S);

  function handleCreate() {
    const parts = partCount === 2
      ? [{ instrumentId: selectedInstrument }, { instrumentId: selectedInstrument === "piano" ? "piano" : "bass" }]
      : [{ instrumentId: selectedInstrument }];

    const doc = createScoreDocument({
      title: title.trim() || t("scoreMode", "untitled"),
      parts,
      timeSignature: { numerator: timeNumerator, denominator: timeDenominator },
      bpm: defaultBpm,
      keySharps,
    });
    onCreate(doc);
    resetForm();
  }

  function resetForm() {
    setTitle("");
    setSelectedInstrument("piano");
    setPartCount(1);
    setTimeNumerator(4);
    setTimeDenominator(4);
    setKeySharps(0);
    setSection(null);
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  const selectedKey = KEY_SIGNATURE_OPTIONS.find((k) => k.sharps === keySharps);

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

          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
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

            {/* 악기 선택 */}
            <Text style={[styles.label, { color: C.textSecondary }]}>{t("scoreMode", "instrumentLabel")}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
              {INSTRUMENT_OPTIONS.map((inst) => {
                const isSelected = selectedInstrument === inst.id;
                return (
                  <Pressable
                    key={inst.id}
                    style={[
                      styles.chip,
                      { borderColor: isSelected ? C.accent : C.border, backgroundColor: isSelected ? C.accent + "22" : C.background },
                    ]}
                    onPress={() => setSelectedInstrument(inst.id)}
                    testID={`score-new-instrument-${inst.id}`}
                  >
                    <Text style={[styles.chipText, { color: isSelected ? C.accent : C.text }]}>
                      {t("scoreMode", INSTRUMENT_KEY_MAP[inst.id] as any)}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* 성부 수 */}
            <Text style={[styles.label, { color: C.textSecondary }]}>{t("scoreMode", "partCountLabel")}</Text>
            <View style={styles.segmentRow}>
              {([1, 2] as const).map((n) => (
                <Pressable
                  key={n}
                  style={[
                    styles.segmentBtn,
                    { borderColor: C.border, backgroundColor: partCount === n ? C.accent : C.background },
                  ]}
                  onPress={() => setPartCount(n)}
                  testID={`score-new-part-count-${n}`}
                >
                  <Text style={[styles.segmentText, { color: partCount === n ? "#fff" : C.text }]}>
                    {n === 1 ? t("scoreMode", "partCountSingle") : t("scoreMode", "partCountGrand")}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* 박자표 */}
            <Text style={[styles.label, { color: C.textSecondary }]}>{t("scoreMode", "timeSignatureLabel")}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
              {TIME_SIGNATURES.map((ts) => {
                const isSelected = ts.num === timeNumerator && ts.den === timeDenominator;
                return (
                  <Pressable
                    key={`${ts.num}/${ts.den}`}
                    style={[
                      styles.chip,
                      { borderColor: isSelected ? C.accent : C.border, backgroundColor: isSelected ? C.accent + "22" : C.background },
                    ]}
                    onPress={() => { setTimeNumerator(ts.num); setTimeDenominator(ts.den); }}
                    testID={`score-new-timesig-${ts.num}-${ts.den}`}
                  >
                    <Text style={[styles.chipText, { color: isSelected ? C.accent : C.text }]}>
                      {ts.num}/{ts.den}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* 조표 */}
            <Text style={[styles.label, { color: C.textSecondary }]}>{t("scoreMode", "keySignatureLabel")}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
              {KEY_SIGNATURE_OPTIONS.map((ks) => {
                const isSelected = ks.sharps === keySharps;
                const accStr = ks.sharps > 0 ? `♯×${ks.sharps}` : ks.sharps < 0 ? `♭×${Math.abs(ks.sharps)}` : "♮";
                return (
                  <Pressable
                    key={ks.sharps}
                    style={[
                      styles.chip,
                      { borderColor: isSelected ? C.accent : C.border, backgroundColor: isSelected ? C.accent + "22" : C.background },
                    ]}
                    onPress={() => setKeySharps(ks.sharps)}
                    testID={`score-new-key-${ks.sharps}`}
                  >
                    <Text style={[styles.chipText, { color: isSelected ? C.accent : C.text }]}>
                      {accStr}
                    </Text>
                  </Pressable>
                );
              })}
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
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "flex-end",
    },
    sheet: {
      borderTopLeftRadius: Radius.xl,
      borderTopRightRadius: Radius.xl,
      borderTopWidth: 1,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      paddingHorizontal: Spacing.lg,
      gap: Spacing.sm,
    },
    handle: {
      alignSelf: "center",
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: C.border,
      marginBottom: Spacing.xs,
    },
    title: {
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: FontSize.subtitle,
      marginBottom: Spacing.xs,
    },
    label: {
      fontFamily: "SpaceGrotesk_500Medium",
      fontSize: FontSize.small,
      marginTop: Spacing.sm,
      marginBottom: 4,
    },
    textInput: {
      borderWidth: 1,
      borderRadius: Radius.md,
      paddingHorizontal: Spacing.md,
      paddingVertical: 10,
      fontFamily: "SpaceGrotesk_400Regular",
      fontSize: FontSize.body,
    },
    chipRow: {
      flexDirection: "row",
      marginBottom: 4,
    },
    chip: {
      borderWidth: 1,
      borderRadius: Radius.md,
      paddingHorizontal: 10,
      paddingVertical: 6,
      marginRight: 6,
    },
    chipText: {
      fontFamily: "SpaceGrotesk_500Medium",
      fontSize: FontSize.small,
    },
    segmentRow: {
      flexDirection: "row",
      gap: 8,
    },
    segmentBtn: {
      flex: 1,
      borderWidth: 1,
      borderRadius: Radius.md,
      paddingVertical: 10,
      alignItems: "center",
    },
    segmentText: {
      fontFamily: "SpaceGrotesk_500Medium",
      fontSize: FontSize.small,
    },
    btnRow: {
      flexDirection: "row",
      gap: Spacing.md,
      marginTop: Spacing.md,
    },
    cancelBtn: {
      flex: 1,
      borderWidth: 1,
      borderRadius: Radius.md,
      paddingVertical: 12,
      alignItems: "center",
    },
    cancelText: {
      fontFamily: "SpaceGrotesk_500Medium",
      fontSize: FontSize.body,
    },
    createBtn: {
      flex: 2,
      borderRadius: Radius.md,
      paddingVertical: 12,
      alignItems: "center",
    },
    createText: {
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: FontSize.body,
      color: "#fff",
    },
  });
