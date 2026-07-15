import React, { useCallback, useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Alert,
  Platform,
  Pressable,
  BackHandler,
} from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLanguage } from "@/contexts/LanguageContext";

interface StageModeOverlayProps {
  visible: boolean;
  bpm: number;
  flashOpacity: SharedValue<number>;
  onExit: () => void;
  onBpmChange: (bpm: number) => void;
}

/**
 * 무대 모드 전용 풀스크린 오버레이.
 * - 검은 배경에 큰 BPM 숫자
 * - 박자에 맞는 흰색 플래시 (flashOpacity shared value 재활용)
 * - 하단: BPM ±1/±10 버튼 (온스크린 대체 컨트롤 + 볼륨 버튼 힌트)
 * - 하단: 종료 버튼 — Alert 확인 (네이티브) 또는 인라인 확인 UI (웹)
 */
export function StageModeOverlay({
  visible,
  bpm,
  flashOpacity,
  onExit,
  onBpmChange,
}: StageModeOverlayProps) {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();

  // 웹: Alert.alert이 no-op이므로 인라인 확인 상태 사용
  const [confirmingExit, setConfirmingExit] = useState(false);

  // 오버레이가 닫힐 때 확인 상태 초기화
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

  // Android 하드웨어 백 버튼 처리
  useEffect(() => {
    if (!visible || Platform.OS !== "android") return;
    const handler = BackHandler.addEventListener("hardwareBackPress", () => {
      triggerExit();
      return true;
    });
    return () => handler.remove();
  }, [visible, triggerExit]);

  // 최신 BPM을 interval 콜백 안에서도 stale 없이 읽기 위한 ref
  const bpmRef = useRef(bpm);
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);

  const onBpmChangeRef = useRef(onBpmChange);
  useEffect(() => { onBpmChangeRef.current = onBpmChange; }, [onBpmChange]);

  const clampBpm = (v: number) => Math.min(300, Math.max(20, v));

  // hold-repeat 상태
  const holdActiveRef = useRef(false);           // 롱프레스 반복 모드 진입 여부
  const holdDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopHold = useCallback(() => {
    if (holdDelayRef.current) { clearTimeout(holdDelayRef.current); holdDelayRef.current = null; }
    if (holdIntervalRef.current) { clearInterval(holdIntervalRef.current); holdIntervalRef.current = null; }
  }, []);

  // 언마운트 시 타이머 정리
  useEffect(() => () => stopHold(), [stopHold]);

  /** PressIn: 300ms 후 반복 모드 돌입, 그 뒤 150ms 간격으로 ±10 반복 */
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

  /** PressOut: 타이머 정리 (onPress가 이후에 발동) */
  const handlePressOut = useCallback(() => {
    stopHold();
  }, [stopHold]);

  /** Press(탭): 반복 모드가 아니었으면 ±1 적용 */
  const handlePress = useCallback((delta: number) => {
    if (holdActiveRef.current) {
      holdActiveRef.current = false; // 플래그 초기화
      return;
    }
    onBpmChangeRef.current(clampBpm(bpmRef.current + delta));
  }, []);

  if (!visible) return null;

  const webTop = Platform.OS === "web" ? 67 : 0;
  const topPad = (insets.top || webTop) + 16;
  const bottomPad = (insets.bottom || (Platform.OS === "web" ? 34 : 0)) + 24;

  return (
    <View style={styles.container} testID="stage-mode-overlay">
      {/* 박자 플래시 */}
      <Animated.View
        pointerEvents="none"
        style={[styles.flashLayer, flashStyle]}
      />

      {/* BPM 디스플레이 */}
      <View style={[styles.bpmArea, { paddingTop: topPad }]}>
        <Text style={styles.bpmLabel}>{t("stageMode", "bpmLabel")}</Text>
        <Text style={styles.bpmNumber} testID="stage-mode-bpm">{bpm}</Text>
        <Text style={styles.volumeHint}>{t("stageMode", "volumeHint")}</Text>
      </View>

      {/* BPM 조절 버튼 — 탭: ±1 / 홀드(300ms 후 150ms 간격 반복): ±10 */}
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
  },
  bpmLabel: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 16,
    fontFamily: "SpaceGrotesk_400Regular",
    letterSpacing: 6,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  bpmNumber: {
    color: "#ffffff",
    fontSize: 112,
    fontFamily: "SpaceGrotesk_700Bold",
    lineHeight: 120,
    letterSpacing: -2,
  },
  volumeHint: {
    color: "rgba(255,255,255,0.3)",
    fontSize: 13,
    fontFamily: "SpaceGrotesk_400Regular",
    marginTop: 12,
  },
  bpmButtons: {
    flexDirection: "row",
    gap: 20,
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  bpmBtn: {
    flex: 1,
    height: 72,
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
  exitArea: {
    width: "100%",
    alignItems: "center",
    paddingHorizontal: 24,
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
