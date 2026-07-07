// ============================================================
// SessionChallengeModal — 악보 이스터에그 랜덤 세션 챌린지 모달
// 카운트인(4라운드) → 챌린지(악보 재생) → 완료 3단계 흐름
// ============================================================

import React, { useState, useEffect, useRef, useCallback } from "react";
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
import type { ScoreDocument } from "@/lib/score-types";
import type { ChallengeLevel } from "@/lib/session-challenge";
import { ScoreRenderer } from "@/components/ScoreRenderer";
import { useScorePlayback } from "@/hooks/useScorePlayback";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";

type Phase = "countin" | "challenge" | "complete";

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

export function SessionChallengeModal({ visible, level, doc, onClose }: Props) {
  const { t } = useLanguage();
  const { colors: C } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();

  const [phase, setPhase] = useState<Phase>("countin");
  const [countinRound, setCountinRound] = useState(0);
  const [activeBeat, setActiveBeat] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const playback = useScorePlayback(doc);
  const playbackEverPlayedRef = useRef(false);

  const beatsPerMeasure = doc.timeSignature.numerator;
  const beatMs = Math.round(60000 / doc.bpm);
  const levelColor = LEVEL_COLORS[level];
  const containerWidth = Math.min(windowWidth, 640) - 32;

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // 모달 닫힐 때 정리
  useEffect(() => {
    if (!visible) {
      clearTimer();
      playback.stop();
      setPhase("countin");
      setCountinRound(0);
      setActiveBeat(0);
      playbackEverPlayedRef.current = false;
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // 카운트인 시작
  useEffect(() => {
    if (!visible) return;

    setPhase("countin");
    setCountinRound(0);
    setActiveBeat(0);

    let round = 0;
    let beat = 0;

    timerRef.current = setInterval(() => {
      beat = (beat + 1) % beatsPerMeasure;
      if (beat === 0) {
        round++;
        if (round >= 4) {
          clearTimer();
          setActiveBeat(-1);
          setPhase("challenge");
          return;
        }
        setCountinRound(round);
      }
      setActiveBeat(beat);
    }, beatMs);

    return clearTimer;
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // 챌린지 단계 진입 시 재생 시작
  useEffect(() => {
    if (phase === "challenge" && visible) {
      playbackEverPlayedRef.current = false;
      playback.play();
    }
    if (phase !== "challenge") {
      playback.stop();
    }
  }, [phase, visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // 재생 시작 추적 (일시정지와 완료 구분)
  useEffect(() => {
    if (playback.isPlaying && phase === "challenge") {
      playbackEverPlayedRef.current = true;
    }
  }, [playback.isPlaying, phase]);

  if (!visible) return null;

  // ── 카운트인 단계 ─────────────────────────────────────────
  if (phase === "countin") {
    const strongCount = Math.min(countinRound + 1, beatsPerMeasure);
    const circleSize = beatsPerMeasure > 6 ? 38 : 52;
    const gap = beatsPerMeasure > 6 ? 6 : 10;

    return (
      <Modal visible animationType="fade" statusBarTranslucent>
        <View style={styles.root}>
          {/* 상단: 레벨 배지 + 카운트인 제목 */}
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

          {/* 비트 인디케이터 */}
          <View style={[styles.beatRow, { gap }]}>
            {Array.from({ length: beatsPerMeasure }, (_, i) => {
              const isStrong = i < strongCount;
              const isActive = i === activeBeat;
              return (
                <View
                  key={i}
                  style={[
                    styles.beatCircle,
                    {
                      width: circleSize,
                      height: circleSize,
                      borderRadius: circleSize / 2,
                    },
                    isStrong && { borderColor: levelColor, borderWidth: 2 },
                    isActive && { backgroundColor: levelColor },
                    !isStrong && !isActive && styles.beatCircleWeak,
                  ]}
                >
                  <Text
                    style={[
                      styles.beatLabel,
                      { fontSize: beatsPerMeasure > 6 ? 10 : 13 },
                      isActive && styles.beatLabelActive,
                    ]}
                  >
                    {i === 0 ? "강" : "약"}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* 라운드 진행 점 */}
          <View style={styles.roundRow}>
            {[0, 1, 2, 3].map((r) => (
              <View
                key={r}
                style={[
                  styles.roundDot,
                  r <= countinRound && { backgroundColor: levelColor },
                ]}
              />
            ))}
          </View>

          {/* 악보 미리보기 */}
          <View style={styles.scorePreviewBox}>
            <Text style={styles.previewLabel}>{t("challenge", "preview")}</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              <ScoreRenderer
                doc={doc}
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
              </Text>
            </View>
            <Pressable
              onPress={() => {
                playback.stop();
                setPhase("complete");
              }}
              style={[styles.doneBtn, { borderColor: levelColor }]}
              accessibilityLabel={t("challenge", "done")}
            >
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
              doc={doc}
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
                  if (playback.isPlaying) playback.pause();
                  else playback.play();
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
    flexWrap: "wrap",
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  beatCircle: {
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
    marginBottom: 16,
  },
  roundDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#2a2a2a",
  },
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
    paddingHorizontal: 16,
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
