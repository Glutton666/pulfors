import React, { useCallback, useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Alert,
  Platform,
  Pressable,
  FlatList,
  BackHandler,
} from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLanguage } from "@/contexts/LanguageContext";
import { StageBeatArc } from "@/components/StageBeatArc";
import type { PracticeEntry } from "@/lib/storage";
import type { BeatType } from "@/lib/metronome-engine";

interface StageModeOverlayProps {
  visible: boolean;
  bpm: number;
  flashOpacity: SharedValue<number>;
  /** 비트 진행률 SharedValue (0→1 per beat). 아크 애니메이션 구동. */
  beatProgress: SharedValue<number>;
  /** 현재 비트 (1-indexed). 멈춤이면 -1. */
  currentBeat: number;
  /** 박자당 비트 수 (StageBeatArc 슬롯 계산 및 박자표 표시용) */
  beatsPerMeasure: number;
  /** 비트당 서브디비전 수 */
  subdivisionCount?: number;
  /** 비트별 타입 배열 ("mute" 이면 StageBeatArc에서 특수 렌더링) */
  beatTypes?: BeatType[];
  /** 현재 메트로놈 재생 중 여부 */
  isPlaying: boolean;
  /** 재생/정지 토글 콜백 */
  onPlayPause: () => void;
  onExit: () => void;
  onBpmChange: (bpm: number) => void;
  /** 셋 리스트 후보 — 내부에서 beat-mode 필터 적용 */
  practiceEntries?: PracticeEntry[];
  /** 현재 활성(하이라이트) 항목 ID */
  activeEntryId?: string;
  /** 셋 리스트 항목 선택 — 엔진 재시작 없이 즉시 전환 */
  onSelectEntry?: (entry: PracticeEntry) => void;
}

/**
 * 무대 모드 전용 풀스크린 오버레이.
 * - 검은 배경에 큰 BPM 숫자 + 비트 아크 애니메이션
 * - 재생/정지 버튼
 * - 박자에 맞는 흰색 플래시
 * - BPM ±1/±10 버튼 (탭: ±1, 홀드: ±10 반복)
 * - 가로 스크롤 셋 리스트 (연습 항목 빠른 전환)
 * - 종료 버튼 — Alert(네이티브) 또는 인라인 확인(웹)
 */
export function StageModeOverlay({
  visible,
  bpm,
  flashOpacity,
  beatProgress,
  currentBeat,
  beatsPerMeasure,
  subdivisionCount = 1,
  beatTypes,
  isPlaying,
  onPlayPause,
  onExit,
  onBpmChange,
  practiceEntries = [],
  activeEntryId,
  onSelectEntry,
}: StageModeOverlayProps) {
  // beat-mode 항목만 셋 리스트에 표시 (bar / note 모드 항목 제외)
  const beatEntries = practiceEntries.filter(
    (e) => e.mode !== "bar" && e.mode !== "note"
  );
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();

  const [confirmingExit, setConfirmingExit] = useState(false);

  useEffect(() => {
    if (!visible) setConfirmingExit(false);
  }, [visible]);

  const flashStyle = useAnimatedStyle(() => ({
    opacity: flashOpacity.value,
  }));

  const triggerExit = useCallback(() => {
    if (Platform.OS === "web") {
      setConfirmingExit(true);
      return;
    }
    Alert.alert(
      t("stageMode", "exitTitle"),
      t("stageMode", "exitMessage"),
      [
        { text: t("stageMode", "exitCancel"), style: "cancel" },
        { text: t("stageMode", "exitConfirm"), style: "destructive", onPress: onExit },
      ],
    );
  }, [onExit, t]);

  useEffect(() => {
    if (!visible || Platform.OS !== "android") return;
    const handler = BackHandler.addEventListener("hardwareBackPress", () => {
      triggerExit();
      return true;
    });
    return () => handler.remove();
  }, [visible, triggerExit]);

  const bpmRef = useRef(bpm);
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);

  const onBpmChangeRef = useRef(onBpmChange);
  useEffect(() => { onBpmChangeRef.current = onBpmChange; }, [onBpmChange]);

  const clampBpm = (v: number) => Math.min(300, Math.max(20, v));

  const holdActiveRef = useRef(false);
  const holdDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopHold = useCallback(() => {
    if (holdDelayRef.current) { clearTimeout(holdDelayRef.current); holdDelayRef.current = null; }
    if (holdIntervalRef.current) { clearInterval(holdIntervalRef.current); holdIntervalRef.current = null; }
  }, []);

  useEffect(() => () => stopHold(), [stopHold]);

  const handlePressIn = useCallback((delta: number) => {
    holdActiveRef.current = false;
    holdDelayRef.current = setTimeout(() => {
      holdActiveRef.current = true;
      onBpmChangeRef.current(clampBpm(bpmRef.current + delta * 10));
      holdIntervalRef.current = setInterval(() => {
        onBpmChangeRef.current(clampBpm(bpmRef.current + delta * 10));
      }, 150);
    }, 300);
  }, []);

  const handlePressOut = useCallback(() => { stopHold(); }, [stopHold]);

  const handlePress = useCallback((delta: number) => {
    if (holdActiveRef.current) { holdActiveRef.current = false; return; }
    onBpmChangeRef.current(clampBpm(bpmRef.current + delta));
  }, []);

  if (!visible) return null;

  const webTop = Platform.OS === "web" ? 67 : 0;
  const topPad = (insets.top || webTop) + 16;
  const bottomPad = (insets.bottom || (Platform.OS === "web" ? 34 : 0)) + 16;

  return (
    <View style={styles.container} testID="stage-mode-overlay">
      {/* 박자 플래시 */}
      <Animated.View pointerEvents="none" style={[styles.flashLayer, flashStyle]} />

      {/* BPM 디스플레이 + 비트 아크 */}
      <View style={[styles.bpmArea, { paddingTop: topPad }]}>
        <Text style={styles.bpmLabel}>{t("stageMode", "bpmLabel")}</Text>
        <Text style={styles.bpmNumber} testID="stage-mode-bpm">{bpm}</Text>
        <StageBeatArc
          beatProgress={beatProgress}
          currentBeat={currentBeat}
          beatsPerMeasure={beatsPerMeasure}
          subdivisionCount={subdivisionCount}
          beatTypes={beatTypes}
        />
        <Text style={styles.volumeHint}>{t("stageMode", "volumeHint")}</Text>
      </View>

      {/* 재생/정지 버튼 */}
      <Pressable
        style={({ pressed }) => [styles.playPauseBtn, pressed && styles.playPauseBtnPressed]}
        onPress={onPlayPause}
        testID="stage-mode-play-pause"
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? t("stageMode", "pause") : t("stageMode", "play")}
      >
        <Ionicons
          name={isPlaying ? "pause-circle" : "play-circle"}
          size={72}
          color="#ffffff"
        />
      </Pressable>

      {/* BPM 조절 버튼 */}
      <View style={styles.bpmButtons}>
        <Pressable
          style={({ pressed }) => [styles.bpmBtn, pressed && styles.bpmBtnPressed]}
          onPress={() => handlePress(-1)}
          onPressIn={() => handlePressIn(-1)}
          onPressOut={handlePressOut}
          testID="stage-mode-bpm-minus"
          accessibilityLabel="BPM −1 / −10"
        >
          <Ionicons name="remove" size={28} color="#fff" />
          <Text style={styles.bpmBtnDelta}>−1 / −10</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.bpmBtn, pressed && styles.bpmBtnPressed]}
          onPress={() => handlePress(1)}
          onPressIn={() => handlePressIn(1)}
          onPressOut={handlePressOut}
          testID="stage-mode-bpm-plus"
          accessibilityLabel="BPM +1 / +10"
        >
          <Ionicons name="add" size={28} color="#fff" />
          <Text style={styles.bpmBtnDelta}>+1 / +10</Text>
        </Pressable>
      </View>

      {/* 셋 리스트 — beat-mode 항목이 있을 때만 표시 */}
      {beatEntries.length > 0 && (
        <View style={styles.setListContainer}>
          <Text style={styles.setListLabel}>{t("stageMode", "setList")}</Text>
          <FlatList
            data={beatEntries}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.setListContent}
            renderItem={({ item }) => {
              const isActive = item.id === activeEntryId;
              // 박자표: beatsPerMeasure/4 (denominator 기본 4)
              const timeSig = `${item.beatsPerMeasure}/4`;
              return (
                <Pressable
                  style={({ pressed }) => [
                    styles.setCard,
                    isActive && styles.setCardActive,
                    pressed && styles.setCardPressed,
                  ]}
                  onPress={() => onSelectEntry?.(item)}
                  testID={`stage-set-entry-${item.id}`}
                >
                  <Text
                    style={[styles.setCardLabel, isActive && styles.setCardLabelActive]}
                    numberOfLines={1}
                  >
                    {item.label}
                  </Text>
                  <Text style={[styles.setCardMeta, isActive && styles.setCardMetaActive]}>
                    {item.bpm} BPM · {timeSig}
                  </Text>
                </Pressable>
              );
            }}
          />
        </View>
      )}

      {/* 종료 버튼 / 확인 UI */}
      <View style={[styles.exitArea, { paddingBottom: bottomPad }]}>
        {confirmingExit ? (
          <View style={styles.confirmRow} testID="stage-mode-confirm-exit">
            <Text style={styles.confirmText}>{t("stageMode", "exitMessage")}</Text>
            <View style={styles.confirmButtons}>
              <Pressable
                style={({ pressed }) => [styles.confirmBtn, styles.confirmBtnCancel, pressed && { opacity: 0.6 }]}
                onPress={() => setConfirmingExit(false)}
                testID="stage-mode-cancel-exit"
              >
                <Text style={styles.confirmBtnText}>{t("stageMode", "exitCancel")}</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.confirmBtn, styles.confirmBtnConfirm, pressed && { opacity: 0.6 }]}
                onPress={onExit}
                testID="stage-mode-confirm-exit-btn"
              >
                <Text style={[styles.confirmBtnText, { color: "#ff4444" }]}>{t("stageMode", "exitConfirm")}</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable
            style={({ pressed }) => [styles.exitBtn, pressed && styles.exitBtnPressed]}
            onPress={triggerExit}
            testID="stage-mode-exit"
            accessibilityRole="button"
            accessibilityLabel={t("stageMode", "exitButton")}
          >
            <Ionicons name="close-circle-outline" size={18} color="rgba(255,255,255,0.8)" />
            <Text style={styles.exitText}>{t("stageMode", "exitButton")}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 99998,
    backgroundColor: "#000",
    justifyContent: "space-between",
    alignItems: "center",
  },
  flashLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#ffffff",
    pointerEvents: "none" as const,
  },
  bpmArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  bpmLabel: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 16,
    fontFamily: "SpaceGrotesk_400Regular",
    letterSpacing: 6,
    textTransform: "uppercase",
  },
  bpmNumber: {
    color: "#ffffff",
    fontSize: 100,
    fontFamily: "SpaceGrotesk_700Bold",
    lineHeight: 108,
    letterSpacing: -2,
  },
  volumeHint: {
    color: "rgba(255,255,255,0.3)",
    fontSize: 12,
    fontFamily: "SpaceGrotesk_400Regular",
  },
  // Play/Pause
  playPauseBtn: {
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderRadius: 50,
  },
  playPauseBtnPressed: {
    opacity: 0.6,
  },
  // BPM buttons
  bpmButtons: {
    flexDirection: "row",
    gap: 20,
    paddingHorizontal: 24,
    paddingVertical: 8,
  },
  bpmBtn: {
    flex: 1,
    height: 68,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  bpmBtnPressed: {
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  bpmBtnDelta: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 12,
    fontFamily: "SpaceGrotesk_400Regular",
  },
  // Set list
  setListContainer: {
    width: "100%",
    paddingTop: 4,
    paddingBottom: 4,
  },
  setListLabel: {
    color: "rgba(255,255,255,0.3)",
    fontSize: 10,
    fontFamily: "SpaceGrotesk_500Medium",
    letterSpacing: 4,
    textTransform: "uppercase",
    paddingHorizontal: 24,
    marginBottom: 8,
  },
  setListContent: {
    paddingHorizontal: 16,
    gap: 10,
  },
  setListEmpty: {
    color: "rgba(255,255,255,0.2)",
    fontSize: 13,
    fontFamily: "SpaceGrotesk_400Regular",
    paddingHorizontal: 24,
    paddingVertical: 4,
  },
  setCard: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 14,
    minWidth: 100,
    maxWidth: 150,
  },
  setCardActive: {
    backgroundColor: "rgba(255,255,255,0.18)",
    borderColor: "rgba(255,255,255,0.5)",
  },
  setCardPressed: {
    opacity: 0.65,
  },
  setCardLabel: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 12,
    fontFamily: "SpaceGrotesk_500Medium",
    marginBottom: 2,
  },
  setCardLabelActive: {
    color: "#ffffff",
  },
  setCardMeta: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 11,
    fontFamily: "SpaceGrotesk_400Regular",
  },
  setCardMetaActive: {
    color: "rgba(255,255,255,0.8)",
  },
  // Exit area
  exitArea: {
    width: "100%",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  exitBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 28,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  exitBtnPressed: {
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  exitText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 15,
    fontFamily: "SpaceGrotesk_500Medium",
  },
  confirmRow: {
    alignItems: "center",
    gap: 14,
    width: "100%",
  },
  confirmText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 15,
    fontFamily: "SpaceGrotesk_400Regular",
    textAlign: "center",
  },
  confirmButtons: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  confirmBtnCancel: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderColor: "rgba(255,255,255,0.15)",
  },
  confirmBtnConfirm: {
    backgroundColor: "rgba(255,68,68,0.15)",
    borderColor: "rgba(255,68,68,0.3)",
  },
  confirmBtnText: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 15,
    fontFamily: "SpaceGrotesk_500Medium",
  },
});
