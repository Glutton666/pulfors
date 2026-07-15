// ============================================================
// SessionChallengeModal — 악보 이스터에그 랜덤 세션 챌린지 모달
// 카운트인(4박 고정, 4라운드) → 챌린지(금관악기 선택 + 재생) → 완료
// ============================================================

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Modal,
  useWindowDimensions,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAudioPlayer } from "expo-audio";
import * as Haptics from "expo-haptics";
import type { ScoreDocument } from "@/lib/score-types";
import type { ChallengeLevel } from "@/lib/session-challenge";
import { ScoreRenderer } from "@/components/ScoreRenderer";
import { useScorePlayback } from "@/hooks/useScorePlayback";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import { safePlay } from "@/lib/audio-utils";

type Phase = "countin" | "challenge" | "complete";

// 금관악기 옵션: treble clef (trumpet, horn) / bass clef (trombone, tuba)
const BRASS_OPTIONS: { id: string; clef: "treble" | "bass"; label: string }[] = [
  { id: "trumpet",  clef: "treble", label: "Trumpet" },
  { id: "horn",     clef: "treble", label: "Horn" },
  { id: "trombone", clef: "bass",   label: "Trombone" },
  { id: "tuba",     clef: "bass",   label: "Tuba" },
];

interface Props {
  visible: boolean;
  level: ChallengeLevel;
  doc: ScoreDocument;
  onClose: () => void;
}

const LEVEL_COLORS: Record<ChallengeLevel, string> = {
  1: "#4CAF50",
  2: "#2196F3",
  3: "#F44336",
};

// 카운트인: 항상 4박, 4라운드 진행
// Round 0: 강약약약  Round 1: 강강약약  Round 2: 강강강약  Round 3: 강강강강
const COUNTIN_BEATS = 4;
const COUNTIN_ROUNDS = 4;

export function SessionChallengeModal({ visible, level, doc, onClose }: Props) {
  const { t } = useLanguage();
  const { colors: C } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();

  const [phase, setPhase] = useState<Phase>("countin");
  // 카운트인: round(0-3)과 activeBeat(0-3)는 항상 4박 기준
  const [countinRound, setCountinRound] = useState(0);
  const [activeBeat, setActiveBeat] = useState(0);

  // 금관악기 선택
  const [brassIdx, setBrassIdx] = useState(0);
  const selectedBrass = BRASS_OPTIONS[brassIdx];

  // 선택된 악기로 doc을 파생 (ScoreRenderer + 재생용)
  const playbackDoc = useMemo<ScoreDocument>(() => ({
    ...doc,
    parts: doc.parts.map((p) => ({
      ...p,
      instrumentId: selectedBrass.id,
      clef: selectedBrass.clef,
    })),
  }), [doc, selectedBrass]);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 카운트인 클릭 사운드
  const clickHigh = useAudioPlayer(require("@/assets/sounds/click-high.wav"));
  const clickLow  = useAudioPlayer(require("@/assets/sounds/click-low.wav"));

  const playback = useScorePlayback(playbackDoc);

  // 재생 완료 자동 감지용 refs
  const playbackStartedRef = useRef(false);
  const userPausedRef       = useRef(false);
  const prevIsPlayingRef    = useRef(false);

  const beatMs = Math.round(60000 / doc.bpm);
  const levelColor = LEVEL_COLORS[level];
  const containerWidth = Math.min(windowWidth, 640) - 32;

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // 클릭음 재생
  // round 기반 강박 판정: beat < round+1 → round 0: 강약약약, 1: 강강약약, 2: 강강강약, 3: 강강강강
  const playCountinClick = useCallback((beat: number, round: number) => {
    const isStrong = beat < round + 1;
    try {
      const player = isStrong ? clickHigh : clickLow;
      player.seekTo(0);
      safePlay(player, isStrong ? "challenge.click.high" : "challenge.click.low");
    } catch {}
    try {
      Haptics.impactAsync(
        isStrong ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light,
      );
    } catch {}
  }, [clickHigh, clickLow]);

  // 모달 닫힐 때 정리
  useEffect(() => {
    if (!visible) {
      clearTimer();
      playback.stop();
      setPhase("countin");
      setCountinRound(0);
      setActiveBeat(0);
      playbackStartedRef.current  = false;
      userPausedRef.current       = false;
      prevIsPlayingRef.current    = false;
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // 카운트인 시작 (visible 변경 시)
  useEffect(() => {
    if (!visible) return;

    setPhase("countin");
    setCountinRound(0);
    setActiveBeat(0);
    playbackStartedRef.current = false;
    userPausedRef.current      = false;
    prevIsPlayingRef.current   = false;

    let round = 0;
    let beat = 0;

    // 첫 박자 즉시 재생 (round=0, beat=0 → 강박)
    playCountinClick(0, 0);

    timerRef.current = setInterval(() => {
      beat += 1;
      if (beat >= COUNTIN_BEATS) {
        // 다음 라운드
        beat = 0;
        round += 1;
        if (round >= COUNTIN_ROUNDS) {
          clearTimer();
          setActiveBeat(-1);
          setPhase("challenge");
          return;
        }
        setCountinRound(round);
      }
      setActiveBeat(beat);
      // round를 함께 전달해 강박 범위가 라운드마다 확장되도록 함
      playCountinClick(beat, round);
    }, beatMs);

    return clearTimer;
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // 챌린지 단계 진입 시 재생 시작
  useEffect(() => {
    if (phase === "challenge" && visible) {
      playbackStartedRef.current = false;
      userPausedRef.current      = false;
      prevIsPlayingRef.current   = false;
      playback.play();
    }
    if (phase !== "challenge") {
      playback.stop();
    }
  }, [phase, visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // 재생 완료 자동 감지: playback 끝 → complete 단계
  useEffect(() => {
    if (phase !== "challenge") {
      prevIsPlayingRef.current = playback.isPlaying;
      return;
    }
    if (playback.isPlaying) {
      playbackStartedRef.current = true;
    }
    if (
      prevIsPlayingRef.current &&
      !playback.isPlaying &&
      !playback.isPreparing &&
      playbackStartedRef.current &&
      !userPausedRef.current
    ) {
      setPhase("complete");
    }
    prevIsPlayingRef.current = playback.isPlaying;
  }, [playback.isPlaying, playback.isPreparing, phase]);

  if (!visible) return null;

  // ── 카운트인 단계 ─────────────────────────────────────────
  if (phase === "countin") {
    // 강박 개수 = round+1 (라운드 0→1강, 1→2강, 2→3강, 3→4강)
    const strongCount = countinRound + 1;

    return (
      <Modal visible animationType="fade" statusBarTranslucent>
        <View style={styles.root}>
          {/* 레벨 배지 + 카운트인 제목 */}
          <View style={[styles.countinHeader, { paddingTop: insets.top + 16 }]}>
            <View style={[styles.levelBadge, { borderColor: levelColor }]}>
              <Text style={[styles.levelBadgeText, { color: levelColor }]}>
                {t("challenge", "level")} {level}
              </Text>
            </View>
            <Text style={styles.countinTitle}>{t("challenge", "countIn")}</Text>
          </View>

          {/* BPM + 박자 */}
          <View style={styles.bpmRow}>
            <Text style={styles.bpmNumber}>{doc.bpm}</Text>
            <Text style={styles.bpmUnit}>{t("challenge", "bpmLabel")}</Text>
            <Text style={styles.timeSigText}>
              {"  "}{doc.timeSignature.numerator}/{doc.timeSignature.denominator}
            </Text>
          </View>

          {/* 카운트인 비트 인디케이터 — 항상 4박 */}
          <View style={[styles.beatRow, { gap: 10 }]}>
            {Array.from({ length: COUNTIN_BEATS }, (_, i) => {
              const isStrong = i < strongCount;
              const isActive = i === activeBeat;
              return (
                <View
                  key={i}
                  style={[
                    styles.beatCircle,
                    isStrong && { borderColor: levelColor, borderWidth: 2 },
                    isActive && { backgroundColor: levelColor },
                    !isStrong && !isActive && styles.beatCircleWeak,
                  ]}
                >
                  <Text style={[styles.beatLabel, isActive && styles.beatLabelActive]}>
                    {i < strongCount ? "강" : "약"}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* 라운드 진행 점 */}
          <View style={styles.roundRow}>
            {Array.from({ length: COUNTIN_ROUNDS }, (_, r) => (
              <View
                key={r}
                style={[styles.roundDot, r <= countinRound && { backgroundColor: levelColor }]}
              />
            ))}
          </View>

          {/* 금관악기 선택 */}
          <View style={styles.instrumentRow}>
            {BRASS_OPTIONS.map((opt, idx) => (
              <Pressable
                key={opt.id}
                onPress={() => setBrassIdx(idx)}
                style={[
                  styles.instrumentPill,
                  brassIdx === idx && { backgroundColor: levelColor, borderColor: levelColor },
                  brassIdx !== idx && { borderColor: "#444" },
                ]}
              >
                <Text style={[
                  styles.instrumentPillText,
                  { color: brassIdx === idx ? "white" : "#888" },
                ]}>
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* 악보 미리보기 */}
          <View style={styles.scorePreviewBox}>
            <Text style={styles.previewLabel}>{t("challenge", "preview")}</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              <ScoreRenderer
                doc={playbackDoc}
                containerWidth={containerWidth}
                showPartNames={false}
                showPlayhead={false}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  }

  // ── 챌린지 단계 ──────────────────────────────────────────
  if (phase === "challenge") {
    return (
      <Modal visible animationType="slide" statusBarTranslucent>
        <View style={[styles.root, { backgroundColor: C.background }]}>
          {/* 헤더 */}
          <View style={[styles.challengeHeader, { paddingTop: insets.top + 8, borderBottomColor: C.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.challengeTitle, { color: C.text }]}>
                {t("challenge", `level${level}Title`)}
              </Text>
              <Text style={[styles.challengeSubtitle, { color: C.textSecondary }]}>
                {doc.bpm} BPM · {doc.timeSignature.numerator}/{doc.timeSignature.denominator}
                {"  ·  "}{selectedBrass.label}
              </Text>
            </View>
            {/* 수동 완료 버튼 */}
            <Pressable
              onPress={() => { playback.stop(); setPhase("complete"); }}
              style={[styles.doneBtn, { borderColor: levelColor }]}
              accessibilityLabel={t("challenge", "done")}
            >
              <Ionicons name="checkmark" size={18} color={levelColor} />
              <Text style={[styles.doneBtnText, { color: levelColor }]}>
                {t("challenge", "done")}
              </Text>
            </Pressable>
          </View>

          {/* 악보 */}
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.scoreScrollContent}
            showsVerticalScrollIndicator={false}
          >
            <ScoreRenderer
              doc={playbackDoc}
              containerWidth={containerWidth}
              showPartNames={false}
              showPlayhead={playback.isPlaying}
              playheadMeasureIdx={playback.currentMeasureIdx}
              playheadFraction={playback.playheadFraction}
            />
          </ScrollView>

          {/* 재생 컨트롤 */}
          <View style={[styles.controls, { paddingBottom: insets.bottom + 16, borderTopColor: C.border }]}>
            {playback.isPreparing ? (
              <View style={styles.preparingRow}>
                <ActivityIndicator color={levelColor} />
                <Text style={[styles.preparingText, { color: C.textSecondary }]}>
                  {t("challenge", "preparing")}
                  {playback.prepareProgress
                    ? ` ${playback.prepareProgress.done}/${playback.prepareProgress.total}`
                    : "…"}
                </Text>
              </View>
            ) : (
              <Pressable
                onPress={() => {
                  if (playback.isPlaying) {
                    userPausedRef.current = true;
                    playback.pause();
                  } else {
                    userPausedRef.current = false;
                    playback.play();
                  }
                }}
                style={[styles.playBtn, { backgroundColor: levelColor }]}
                accessibilityLabel={playback.isPlaying ? t("challenge", "pause") : t("challenge", "play")}
              >
                <Ionicons
                  name={playback.isPlaying ? "pause" : "play"}
                  size={28}
                  color="white"
                />
              </Pressable>
            )}
          </View>
        </View>
      </Modal>
    );
  }

  // ── 완료 단계 ────────────────────────────────────────────
  return (
    <Modal visible animationType="fade" statusBarTranslucent>
      <View style={styles.completeRoot}>
        <View style={[styles.completeBadge, { borderColor: levelColor }]}>
          <Ionicons name="checkmark" size={64} color={levelColor} />
        </View>
        <Text style={[styles.completeTitle, { color: levelColor }]}>
          {t("challenge", "complete")}
        </Text>
        <Text style={styles.completeSubtitle}>
          {t("challenge", `level${level}Title`)}
        </Text>
        <Text style={styles.completeBpm}>
          {doc.bpm} BPM · {doc.timeSignature.numerator}/{doc.timeSignature.denominator}
        </Text>
        <Pressable
          onPress={onClose}
          style={[styles.closeBtn, { backgroundColor: levelColor }]}
          accessibilityLabel={t("challenge", "close")}
        >
          <Text style={styles.closeBtnText}>{t("challenge", "close")}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const CIRCLE_SIZE = 52;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0a0a0a",
  },
  // ── 카운트인 ──────────────────────────────────────────────
  countinHeader: {
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 8,
    gap: 8,
  },
  levelBadge: {
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  levelBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  countinTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "white",
    letterSpacing: 2,
  },
  bpmRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
    paddingVertical: 12,
  },
  bpmNumber: {
    fontSize: 52,
    fontWeight: "800",
    color: "white",
    lineHeight: 60,
  },
  bpmUnit: {
    fontSize: 18,
    fontWeight: "600",
    color: "#888",
    marginLeft: 6,
  },
  timeSigText: {
    fontSize: 26,
    fontWeight: "700",
    color: "#aaa",
  },
  beatRow: {
    flexDirection: "row",
    justifyContent: "center",
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  beatCircle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    borderWidth: 1,
    borderColor: "#444",
    backgroundColor: "#1a1a1a",
    alignItems: "center",
    justifyContent: "center",
  },
  beatCircleWeak: {
    borderColor: "#2a2a2a",
    backgroundColor: "#111",
  },
  beatLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#666",
  },
  beatLabelActive: {
    color: "white",
  },
  roundRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginBottom: 12,
  },
  roundDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#2a2a2a",
  },
  // ── 악기 선택 ─────────────────────────────────────────────
  instrumentRow: {
    flexDirection: "row",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  instrumentPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  instrumentPillText: {
    fontSize: 12,
    fontWeight: "700",
  },
  // ── 악보 미리보기 ─────────────────────────────────────────
  scorePreviewBox: {
    flex: 1,
    marginHorizontal: 16,
    marginBottom: 20,
    borderRadius: 12,
    backgroundColor: "#111",
    overflow: "hidden",
    padding: 12,
  },
  previewLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#555",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  // ── 챌린지 ───────────────────────────────────────────────
  challengeHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  challengeTitle: {
    fontSize: 17,
    fontWeight: "700",
  },
  challengeSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  doneBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  doneBtnText: {
    fontSize: 14,
    fontWeight: "700",
  },
  scoreScrollContent: {
    padding: 16,
  },
  controls: {
    alignItems: "center",
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  preparingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  preparingText: {
    fontSize: 14,
  },
  playBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  // ── 완료 ─────────────────────────────────────────────────
  completeRoot: {
    flex: 1,
    backgroundColor: "#0a0a0a",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  completeBadge: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
  },
  completeTitle: {
    fontSize: 32,
    fontWeight: "800",
    marginBottom: 8,
  },
  completeSubtitle: {
    fontSize: 16,
    color: "#888",
    marginBottom: 4,
  },
  completeBpm: {
    fontSize: 14,
    color: "#666",
    marginBottom: 48,
  },
  closeBtn: {
    paddingHorizontal: 48,
    paddingVertical: 16,
    borderRadius: 32,
  },
  closeBtnText: {
    fontSize: 17,
    fontWeight: "700",
    color: "white",
  },
});
