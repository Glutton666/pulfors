// ============================================================
// 음감·화음 이스터에그 오버레이
// ============================================================

import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, Platform, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { AnimatedModal } from "@/components/AnimatedModal";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { onAccentColor } from "@/lib/color-contrast";
import { Radius, Spacing } from "@/constants/tokens";
import {
  CHORD_DEFINITIONS,
  SOLFEGE_NAMES,
  createPitchQuestion,
  type PitchQuestion,
  type PitchQuizMode,
} from "@/lib/pitch-quiz";
import { playChord, playPitchSequence, stopAllScoreNotes, stopPreviewNote } from "@/lib/score-audio";

type Screen = "choice" | PitchQuizMode | "results";
type Reveal = { correct: boolean; answer: string } | null;

export interface PitchQuizModalProps {
  visible: boolean;
  initialMode?: PitchQuizMode | null;
  onClose: () => void;
}

const RELATIVE_INTERVALS = Array.from({ length: 12 }, (_, index) => index + 1);
const CHORD_KINDS = Object.keys(CHORD_DEFINITIONS) as Array<keyof typeof CHORD_DEFINITIONS>;

export function PitchQuizModal({ visible, initialMode = null, onClose }: PitchQuizModalProps) {
  const { colors: C } = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const [screen, setScreen] = useState<Screen>("choice");
  const [question, setQuestion] = useState<PitchQuestion | null>(null);
  const [reveal, setReveal] = useState<Reveal>(null);
  const [rounds, setRounds] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const nextRoundTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aliveRef = useRef(true);

  const clearRoundTimer = useCallback(() => {
    if (nextRoundTimerRef.current) {
      clearTimeout(nextRoundTimerRef.current);
      nextRoundTimerRef.current = null;
    }
  }, []);

  const clearPlaybackTimer = useCallback(() => {
    if (playbackTimerRef.current) {
      clearTimeout(playbackTimerRef.current);
      playbackTimerRef.current = null;
    }
  }, []);

  const playQuestion = useCallback((next: PitchQuestion) => {
    stopPreviewNote();
    stopAllScoreNotes();
    if (next.mode === "relative") {
      playPitchSequence(next.notes, 520, 430);
    } else if (next.mode === "absolute") {
      playPitchSequence(next.notes, 0, 650);
    } else {
      playChord(next.notes, 1050);
    }
  }, []);

  const startRound = useCallback((mode: PitchQuizMode) => {
    clearRoundTimer();
    clearPlaybackTimer();
    setReveal(null);
    const next = createPitchQuestion(mode);
    setQuestion(next);
    playbackTimerRef.current = setTimeout(() => {
      playbackTimerRef.current = null;
      if (aliveRef.current) playQuestion(next);
    }, 80);
  }, [clearRoundTimer, clearPlaybackTimer, playQuestion]);

  useEffect(() => {
    if (!visible) {
      aliveRef.current = false;
      clearRoundTimer();
      clearPlaybackTimer();
      stopPreviewNote();
      stopAllScoreNotes();
      return;
    }
    aliveRef.current = true;
    setRounds(0);
    setCorrectCount(0);
    setStreak(0);
    setBestStreak(0);
    setReveal(null);
    setQuestion(null);
    if (initialMode) {
      setScreen(initialMode);
      startRound(initialMode);
    } else {
      setScreen("choice");
    }
    return () => {
      aliveRef.current = false;
      clearRoundTimer();
      clearPlaybackTimer();
      stopPreviewNote();
      stopAllScoreNotes();
    };
  }, [visible, initialMode, clearRoundTimer, clearPlaybackTimer, startRound]);

  const selectMode = (mode: PitchQuizMode) => {
    setScreen(mode);
    startRound(mode);
  };

  const feedback = (correct: boolean) => {
    if (Platform.OS === "web") return;
    void Haptics.notificationAsync(
      correct ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error,
    );
  };

  const answerFor = (activeQuestion: PitchQuestion) => {
    if (activeQuestion.mode === "relative") return t("pitchQuiz", `interval${activeQuestion.interval}` as any);
    if (activeQuestion.mode === "absolute") return SOLFEGE_NAMES[activeQuestion.pitchClass];
    return t("pitchQuiz", CHORD_DEFINITIONS[activeQuestion.kind].labelKey as any);
  };

  const submitAnswer = (answer: number | string | null) => {
    if (!question || reveal) return;
    const isCorrect =
      question.mode === "relative"
        ? answer === question.interval
        : question.mode === "absolute"
        ? answer === question.pitchClass
        : answer === question.kind;
    feedback(isCorrect);
    const nextStreak = isCorrect ? streak + 1 : 0;
    setRounds((value) => value + 1);
    setStreak(nextStreak);
    if (isCorrect) {
      setCorrectCount((value) => value + 1);
      setBestStreak((value) => Math.max(value, nextStreak));
    }
    setReveal({ correct: isCorrect, answer: answerFor(question) });
    nextRoundTimerRef.current = setTimeout(() => {
      if (aliveRef.current && screen !== "results") startRound(question.mode);
    }, 950);
  };

  const handleExit = () => {
    clearRoundTimer();
    clearPlaybackTimer();
    stopPreviewNote();
    stopAllScoreNotes();
    if (screen === "results" || rounds === 0) {
      onClose();
      return;
    }
    setReveal(null);
    setQuestion(null);
    setScreen("results");
  };

  const replay = () => {
    if (question) playQuestion(question);
  };

  const accuracy = rounds ? Math.round((correctCount / rounds) * 100) : 0;
  const styles = makeStyles(C);
  const topPadding = (insets.top || (Platform.OS === "web" ? 52 : 12)) + 10;

  return (
    <AnimatedModal visible={visible} transparent onRequestClose={handleExit} statusBarTranslucent>
      <View style={[styles.overlay, { paddingTop: topPadding, paddingBottom: (insets.bottom || 16) + 12 }]}>
        <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
          <Pressable
            onPress={handleExit}
            hitSlop={12}
            style={styles.close}
            accessibilityRole="button"
            accessibilityLabel={t("pitchQuiz", "close")}
            testID="pitch-quiz-close"
          >
            <Ionicons name="close" size={24} color={C.text} />
          </Pressable>

          {screen === "choice" ? (
            <View style={styles.choiceContent}>
              <Ionicons name="ear-outline" size={42} color={C.accent} />
              <Text style={[styles.title, { color: C.text }]}>{t("pitchQuiz", "chooseTitle")}</Text>
              <Text style={[styles.subtitle, { color: C.textSecondary }]}>{t("pitchQuiz", "chooseHint")}</Text>
              <Pressable
                style={[styles.primaryButton, { backgroundColor: C.accent }]}
                onPress={() => selectMode("absolute")}
                testID="pitch-quiz-mode-absolute"
              >
                <Text style={[styles.primaryButtonText, { color: onAccentColor(C.accent) }]}>{t("pitchQuiz", "absolute")}</Text>
              </Pressable>
              <Pressable
                style={[styles.secondaryButton, { borderColor: C.border, backgroundColor: C.background }]}
                onPress={() => selectMode("relative")}
                testID="pitch-quiz-mode-relative"
              >
                <Text style={[styles.secondaryButtonText, { color: C.text }]}>{t("pitchQuiz", "relative")}</Text>
              </Pressable>
              <Pressable
                style={[styles.secondaryButton, { borderColor: C.border, backgroundColor: C.background }]}
                onPress={() => selectMode("chord")}
                testID="pitch-quiz-mode-chord"
              >
                <Text style={[styles.secondaryButtonText, { color: C.text }]}>{t("pitchQuiz", "chord")}</Text>
              </Pressable>
            </View>
          ) : screen === "results" ? (
            <View style={styles.choiceContent}>
              <Ionicons name="trophy-outline" size={44} color={C.accent} />
              <Text style={[styles.title, { color: C.text }]}>{t("pitchQuiz", "resultsTitle")}</Text>
              <Text style={[styles.resultScore, { color: C.accent }]}>{correctCount} / {rounds}</Text>
              <Text style={[styles.subtitle, { color: C.textSecondary }]}>{t("pitchQuiz", "accuracy").replace("{value}", String(accuracy))}</Text>
              <Text style={[styles.subtitle, { color: C.textSecondary }]}>{t("pitchQuiz", "bestStreak").replace("{value}", String(bestStreak))}</Text>
              <Pressable
                style={[styles.primaryButton, { backgroundColor: C.accent }]}
                onPress={onClose}
                testID="pitch-quiz-results-close"
              >
                <Text style={[styles.primaryButtonText, { color: onAccentColor(C.accent) }]}>{t("pitchQuiz", "close")}</Text>
              </Pressable>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.quizContent} showsVerticalScrollIndicator={false}>
              <Text style={[styles.eyebrow, { color: C.accent }]}>
                {t("pitchQuiz", screen === "relative" ? "relative" : screen === "absolute" ? "absolute" : "chord")}
              </Text>
              <Text style={[styles.title, { color: C.text }]}>{t("pitchQuiz", "listen")}</Text>
              <Text style={[styles.subtitle, { color: C.textSecondary }]}>
                {t("pitchQuiz", screen === "relative" ? "relativePrompt" : screen === "absolute" ? "absolutePrompt" : "chordPrompt")}
              </Text>
              <Pressable
                onPress={replay}
                style={[styles.replayButton, { backgroundColor: C.background, borderColor: C.border }]}
                accessibilityRole="button"
                accessibilityLabel={t("pitchQuiz", "replay")}
                testID="pitch-quiz-replay"
              >
                <Ionicons name="volume-high-outline" size={19} color={C.accent} />
                <Text style={[styles.replayText, { color: C.text }]}>{t("pitchQuiz", "replay")}</Text>
              </Pressable>

              {reveal ? (
                <View style={[styles.reveal, { backgroundColor: reveal.correct ? "rgba(48,209,88,0.14)" : "rgba(255,69,58,0.12)" }]}>
                  <Text style={[styles.revealTitle, { color: reveal.correct ? "#30D158" : C.danger }]}>
                    {reveal.correct ? t("pitchQuiz", "correct") : t("pitchQuiz", "answer")}
                  </Text>
                  <Text style={[styles.revealAnswer, { color: C.text }]}>{reveal.answer}</Text>
                </View>
              ) : (
                <>
                  {screen === "relative" && (
                    <View style={styles.answerGrid}>
                      {RELATIVE_INTERVALS.map((interval) => (
                        <Pressable
                          key={interval}
                          onPress={() => submitAnswer(interval)}
                          style={[styles.answerButton, { backgroundColor: C.background, borderColor: C.border }]}
                          testID={`pitch-quiz-answer-interval-${interval}`}
                        >
                          <Text style={[styles.answerText, { color: C.text }]}>{t("pitchQuiz", `interval${interval}` as any)}</Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                  {screen === "absolute" && (
                    <View style={styles.answerGrid}>
                      {SOLFEGE_NAMES.map((name, index) => (
                        <Pressable
                          key={name}
                          onPress={() => submitAnswer(index)}
                          style={[styles.answerButton, { backgroundColor: C.background, borderColor: C.border }]}
                          testID={`pitch-quiz-answer-note-${index}`}
                        >
                          <Text style={[styles.answerText, { color: C.text }]}>{name}</Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                  {screen === "chord" && (
                    <View style={styles.chordGrid}>
                      {CHORD_KINDS.map((kind) => (
                        <Pressable
                          key={kind}
                          onPress={() => submitAnswer(kind)}
                          style={[styles.chordButton, { backgroundColor: C.background, borderColor: C.border }]}
                          testID={`pitch-quiz-answer-chord-${kind}`}
                        >
                          <Text style={[styles.answerText, { color: C.text }]}>{t("pitchQuiz", CHORD_DEFINITIONS[kind].labelKey as any)}</Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                  <Pressable onPress={() => submitAnswer(null)} testID="pitch-quiz-give-up">
                    <Text style={[styles.giveUp, { color: C.textSecondary }]}>{t("pitchQuiz", "giveUp")}</Text>
                  </Pressable>
                </>
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </AnimatedModal>
  );
}

const makeStyles = (C: any) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.68)", justifyContent: "center", paddingHorizontal: 18 },
  card: { width: "100%", maxWidth: 560, alignSelf: "center", borderWidth: 1, borderRadius: Radius.xl, padding: 24, minHeight: 410 },
  close: { position: "absolute", top: 14, right: 14, padding: 6, zIndex: 5 },
  choiceContent: { flex: 1, alignItems: "center", justifyContent: "center", gap: 13, paddingTop: 24 },
  quizContent: { alignItems: "center", gap: 14, paddingTop: 24, paddingBottom: 8 },
  eyebrow: { fontFamily: "SpaceGrotesk_700Bold", letterSpacing: 1.6, fontSize: 12, textTransform: "uppercase" },
  title: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 25, textAlign: "center" },
  subtitle: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 14, textAlign: "center", lineHeight: 20 },
  primaryButton: { minWidth: 218, paddingVertical: 13, paddingHorizontal: 22, borderRadius: Radius.md, alignItems: "center", marginTop: 6 },
  primaryButtonText: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 16 },
  secondaryButton: { minWidth: 218, paddingVertical: 12, paddingHorizontal: 22, borderRadius: Radius.md, alignItems: "center", borderWidth: 1 },
  secondaryButtonText: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 16 },
  replayButton: { borderWidth: 1, flexDirection: "row", gap: 7, alignItems: "center", paddingVertical: 9, paddingHorizontal: 14, borderRadius: Radius.md },
  replayText: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 14 },
  answerGrid: { width: "100%", flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  answerButton: { width: "30%", minWidth: 82, borderWidth: 1, borderRadius: Radius.md, paddingVertical: 12, alignItems: "center" },
  answerText: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 14, textAlign: "center" },
  chordGrid: { width: "100%", gap: 8 },
  chordButton: { borderWidth: 1, borderRadius: Radius.md, paddingVertical: 13, alignItems: "center" },
  giveUp: { fontFamily: "SpaceGrotesk_500Medium", fontSize: 14, textDecorationLine: "underline", padding: 9 },
  reveal: { width: "100%", borderRadius: Radius.md, paddingVertical: 18, alignItems: "center", gap: 5 },
  revealTitle: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 16 },
  revealAnswer: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 22 },
  resultScore: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 42 },
});