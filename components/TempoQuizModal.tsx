import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, View, Text, TextInput, StyleSheet, Platform, ScrollView } from "react-native";
import { AnimatedModal } from "@/components/AnimatedModal";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useScale } from "@/lib/scale";
import { useModalCardLayout } from "@/lib/modal-layout";
import { Radius, Spacing, FontSize } from "@/constants/tokens";
import {
  TEMPO_QUIZ_MEASURES,
  TEMPO_QUIZ_RANGES,
  clampBpmGuess,
  gradeGuess,
  pickRandomBpm,
  type TempoQuizDifficulty,
  type TempoQuizResult,
} from "@/lib/tempo-quiz";

export type TempoQuizPhase = "ready" | "playing" | "answer" | "result";

export interface TempoQuizModalProps {
  visible: boolean;
  onClose: () => void;
  onPlayBpm: (bpm: number, measures: number) => void;
  onStop: () => void;
  measureProgress: number;
  phase: TempoQuizPhase;
  setPhase: (p: TempoQuizPhase) => void;
}

export function TempoQuizModal({
  visible,
  onClose,
  onPlayBpm,
  onStop,
  measureProgress,
  phase,
  setPhase,
}: TempoQuizModalProps) {
  const { colors: C } = useTheme();
  const { t } = useLanguage();
  const layout = useModalCardLayout({ maxWidth: 540 });
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const styles = makeStyles(C);

  const [difficulty, setDifficulty] = useState<TempoQuizDifficulty>("easy");
  const [guessText, setGuessText] = useState("100");
  const [result, setResult] = useState<TempoQuizResult | null>(null);
  const targetRef = useRef(0);

  useEffect(() => {
    if (!visible) {
      setPhase("ready");
      setResult(null);
    }
  }, [visible, setPhase]);

  const startNew = useCallback(() => {
    const bpm = pickRandomBpm(difficulty);
    targetRef.current = bpm;
    setResult(null);
    setGuessText(String(Math.round((TEMPO_QUIZ_RANGES[difficulty].min + TEMPO_QUIZ_RANGES[difficulty].max) / 2)));
    setPhase("playing");
    onPlayBpm(bpm, TEMPO_QUIZ_MEASURES);
  }, [difficulty, onPlayBpm, setPhase]);

  const handleSubmit = useCallback(() => {
    const guess = clampBpmGuess(Number(guessText));
    const r = gradeGuess(targetRef.current, guess);
    setResult(r);
    setPhase("result");
  }, [guessText, setPhase]);

  const handleReplay = useCallback(() => {
    setPhase("playing");
    onPlayBpm(targetRef.current, TEMPO_QUIZ_MEASURES);
  }, [onPlayBpm, setPhase]);

  const handleClose = useCallback(() => {
    onStop();
    onClose();
  }, [onStop, onClose]);

  const handleNext = useCallback(() => {
    setResult(null);
    startNew();
  }, [startNew]);

  return (
    <AnimatedModal visible={visible} transparent onRequestClose={handleClose}>
      <Pressable style={[styles.overlay, layout.isTablet && { alignItems: "center" as const, justifyContent: "center" as const }]} onPress={handleClose}>
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: C.surface,
              borderColor: C.border,
              paddingTop: (insets.top || webTopInset) + 16,
              paddingBottom: 24 + (insets.bottom || (Platform.OS === "web" ? 34 : 0)),
              maxHeight: layout.cardMaxHeight,
            },
            layout.isTablet && { maxWidth: layout.cardWidth, alignSelf: "center" as const, width: "100%" as const, borderRadius: Radius.xl, borderWidth: 1, borderColor: C.border },
          ]}
          onStartShouldSetResponder={() => true}
        >
          <ScrollView contentContainerStyle={{ gap: Spacing.md }} keyboardShouldPersistTaps="handled">
            <View style={styles.handle} />
            <Text style={[styles.title, { color: C.text }]}>{t("tempoQuiz", "title")}</Text>

            {phase === "ready" && (
              <>
                <Text style={[styles.label, { color: C.text }]}>{t("tempoQuiz", "difficulty")}</Text>
                {(["easy", "normal", "hard"] as TempoQuizDifficulty[]).map((d) => (
                  <Pressable
                    key={d}
                    onPress={() => setDifficulty(d)}
                    style={[
                      styles.option,
                      {
                        borderColor: difficulty === d ? C.accent : C.border,
                        backgroundColor: difficulty === d ? C.accent + "22" : "transparent",
                      },
                    ]}
                    testID={`tempo-quiz-difficulty-${d}`}
                  >
                    <Text style={[styles.optionText, { color: C.text }]}>{t("tempoQuiz", d)}</Text>
                  </Pressable>
                ))}
                <Pressable
                  style={({ pressed }) => [styles.primaryBtn, { backgroundColor: C.accent, opacity: pressed ? 0.8 : 1 }]}
                  onPress={startNew}
                  testID="tempo-quiz-start"
                >
                  <Text style={styles.primaryText}>{t("tempoQuiz", "startQuiz")}</Text>
                </Pressable>
              </>
            )}

            {phase === "playing" && (
              <View style={{ alignItems: "center" as const, gap: Spacing.md, paddingVertical: Spacing.lg }}>
                <Text style={[styles.title, { color: C.accent }]}>{t("tempoQuiz", "listening")}</Text>
                <Text style={[styles.label, { color: C.textSecondary }]}>
                  {t("tempoQuiz", "measureProgress")
                    .replace("%cur", String(measureProgress))
                    .replace("%total", String(TEMPO_QUIZ_MEASURES))}
                </Text>
              </View>
            )}

            {phase === "answer" && (
              <>
                <Text style={[styles.label, { color: C.text }]}>{t("tempoQuiz", "yourGuess")}</Text>
                <TextInput
                  value={guessText}
                  onChangeText={(v) => setGuessText(v.replace(/[^0-9]/g, ""))}
                  keyboardType="number-pad"
                  maxLength={3}
                  style={[styles.bigInput, { color: C.text, borderColor: C.border, backgroundColor: C.background }]}
                  testID="tempo-quiz-guess"
                />
                <Pressable
                  style={({ pressed }) => [styles.primaryBtn, { backgroundColor: C.accent, opacity: pressed ? 0.8 : 1 }]}
                  onPress={handleSubmit}
                  testID="tempo-quiz-submit"
                >
                  <Text style={styles.primaryText}>{t("tempoQuiz", "submit")}</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.secondaryBtn, { borderColor: C.border, opacity: pressed ? 0.8 : 1 }]}
                  onPress={handleReplay}
                  testID="tempo-quiz-replay"
                >
                  <Text style={[styles.secondaryText, { color: C.text }]}>{t("tempoQuiz", "replay")}</Text>
                </Pressable>
              </>
            )}

            {phase === "result" && result && (
              <View style={{ gap: Spacing.md }}>
                <Text
                  style={[
                    styles.title,
                    {
                      color:
                        result.grade === "perfect"
                          ? C.accent
                          : result.grade === "good"
                          ? C.text
                          : C.danger || "#d33",
                    },
                  ]}
                >
                  {t("tempoQuiz", result.grade === "perfect" ? "gradePerfect" : result.grade === "good" ? "gradeGood" : "gradeFail")}
                </Text>
                <Row label={t("tempoQuiz", "answer")} value={`${result.target} BPM`} C={C} styles={styles} />
                <Row label={t("tempoQuiz", "yourAnswer")} value={`${result.guess} BPM`} C={C} styles={styles} />
                <Row label={t("tempoQuiz", "diff")} value={`±${result.diff}`} C={C} styles={styles} />
                <Pressable
                  style={({ pressed }) => [styles.primaryBtn, { backgroundColor: C.accent, opacity: pressed ? 0.8 : 1 }]}
                  onPress={handleNext}
                  testID="tempo-quiz-next"
                >
                  <Text style={styles.primaryText}>{t("tempoQuiz", "next")}</Text>
                </Pressable>
              </View>
            )}

            <Pressable
              style={({ pressed }) => [styles.secondaryBtn, { borderColor: C.border, opacity: pressed ? 0.8 : 1 }]}
              onPress={handleClose}
            >
              <Text style={[styles.secondaryText, { color: C.text }]}>{t("tempoQuiz", "close")}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </Pressable>
    </AnimatedModal>
  );
}

function Row({ label, value, C, styles }: { label: string; value: string; C: any; styles: any }) {
  return (
    <View style={[styles.row, { borderColor: C.border }]}>
      <Text style={[styles.label, { color: C.textSecondary }]}>{label}</Text>
      <Text style={[styles.label, { color: C.text, fontFamily: "SpaceGrotesk_600SemiBold" }]}>{value}</Text>
    </View>
  );
}

const makeStyles = (C: any) =>
  StyleSheet.create({
    overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" as const },
    sheet: {
      borderTopLeftRadius: Radius.xl,
      borderTopRightRadius: Radius.xl,
      borderTopWidth: 1,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      paddingHorizontal: Spacing.lg,
      maxHeight: "90%" as const,
    },
    handle: {
      alignSelf: "center" as const,
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: C.border,
      marginBottom: Spacing.sm,
    },
    title: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: FontSize.subtitle, textAlign: "center" as const },
    label: { fontFamily: "SpaceGrotesk_500Medium", fontSize: FontSize.body },
    option: {
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.md,
      borderRadius: Radius.md,
      borderWidth: 1,
    },
    optionText: { fontFamily: "SpaceGrotesk_500Medium", fontSize: FontSize.body },
    bigInput: {
      borderWidth: 1,
      borderRadius: Radius.md,
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.lg,
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: 36,
      textAlign: "center" as const,
    },
    row: {
      flexDirection: "row" as const,
      justifyContent: "space-between" as const,
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.md,
      borderRadius: Radius.md,
      borderWidth: 1,
    },
    primaryBtn: {
      paddingVertical: Spacing.md,
      borderRadius: Radius.md,
      alignItems: "center" as const,
      marginTop: Spacing.sm,
    },
    primaryText: { color: "#fff", fontFamily: "SpaceGrotesk_600SemiBold", fontSize: FontSize.body },
    secondaryBtn: {
      paddingVertical: Spacing.md,
      borderRadius: Radius.md,
      borderWidth: 1,
      alignItems: "center" as const,
    },
    secondaryText: { fontFamily: "SpaceGrotesk_500Medium", fontSize: FontSize.body },
  });
