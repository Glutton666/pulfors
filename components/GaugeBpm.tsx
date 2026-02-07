import React, { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  Pressable,
  TextInput,
  Modal,
  Platform,
  Dimensions,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  withSequence,
  withTiming,
  useSharedValue,
  Easing,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const GAUGE_SIZE = Math.min(SCREEN_WIDTH - 80, 280);

interface GaugeBpmProps {
  bpm: number;
  onBpmChange: (bpm: number) => void;
  isPlaying: boolean;
  tempoLabel: string;
}

export function GaugeBpm({ bpm, onBpmChange, isPlaying, tempoLabel }: GaugeBpmProps) {
  const [showInput, setShowInput] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDragging = useRef(false);
  const lastX = useRef(0);
  const accum = useRef(0);
  const pulseScale = useSharedValue(1);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 5;
      },
      onPanResponderGrant: (_, gestureState) => {
        isDragging.current = false;
        lastX.current = gestureState.x0;
        accum.current = 0;

        longPressTimer.current = setTimeout(() => {
          if (!isDragging.current) {
            setInputValue(String(bpm));
            setShowInput(true);
            if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          }
        }, 3000);
      },
      onPanResponderMove: (_, gestureState) => {
        if (Math.abs(gestureState.dx) > 8) {
          isDragging.current = true;
          if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
          }
        }

        if (isDragging.current) {
          const dx = gestureState.moveX - lastX.current;
          lastX.current = gestureState.moveX;
          accum.current += dx;

          const threshold = 8;
          if (Math.abs(accum.current) >= threshold) {
            const steps = Math.floor(accum.current / threshold);
            accum.current -= steps * threshold;
            onBpmChange(Math.max(20, Math.min(300, bpm + steps)));
            if (Platform.OS !== "web" && steps !== 0) {
              Haptics.selectionAsync();
            }
          }
        }
      },
      onPanResponderRelease: () => {
        isDragging.current = false;
        if (longPressTimer.current) {
          clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
        }
      },
    })
  ).current;

  const handleInputSubmit = useCallback(() => {
    const val = parseInt(inputValue);
    if (!isNaN(val) && val >= 20 && val <= 300) {
      onBpmChange(val);
    }
    setShowInput(false);
  }, [inputValue, onBpmChange]);

  const gaugeProgress = (bpm - 20) / (300 - 20);
  const startAngle = -135;
  const endAngle = 135;
  const currentAngle = startAngle + gaugeProgress * (endAngle - startAngle);

  const ticks = Array.from({ length: 28 }, (_, i) => {
    const angle = startAngle + (i / 27) * (endAngle - startAngle);
    const rad = (angle * Math.PI) / 180;
    const r = GAUGE_SIZE / 2 - 6;
    const isMajor = i % 7 === 0;
    const len = isMajor ? 14 : 7;
    const x1 = GAUGE_SIZE / 2 + Math.cos(rad) * r;
    const y1 = GAUGE_SIZE / 2 + Math.sin(rad) * r;
    const x2 = GAUGE_SIZE / 2 + Math.cos(rad) * (r - len);
    const y2 = GAUGE_SIZE / 2 + Math.sin(rad) * (r - len);
    const tickAngle = startAngle + (i / 27) * (endAngle - startAngle);
    const tickBpm = Math.round(20 + (i / 27) * 280);
    const isActive = tickAngle <= currentAngle;
    return { x1, y1, x2, y2, isMajor, isActive, tickBpm, angle };
  });

  const needleRad = (currentAngle * Math.PI) / 180;
  const needleLen = GAUGE_SIZE / 2 - 30;
  const cx = GAUGE_SIZE / 2;
  const cy = GAUGE_SIZE / 2;

  return (
    <View style={styles.container}>
      <View
        style={[styles.gaugeOuter, { width: GAUGE_SIZE, height: GAUGE_SIZE }]}
        {...panResponder.panHandlers}
      >
        <View style={[styles.gaugeRing, { width: GAUGE_SIZE - 4, height: GAUGE_SIZE - 4, borderRadius: (GAUGE_SIZE - 4) / 2 }]} />

        {ticks.map((tick, i) => {
          const tickLen = tick.isMajor ? 14 : 7;
          const tickWidth = tick.isMajor ? 2.5 : 1.5;
          return (
            <View
              key={i}
              style={[
                styles.tick,
                {
                  left: tick.x2 - tickWidth / 2,
                  top: tick.y2,
                  width: tickWidth,
                  height: tickLen,
                  backgroundColor: tick.isActive ? Colors.accent : Colors.textTertiary,
                  transform: [{ rotate: `${tick.angle + 90}deg` }],
                  opacity: tick.isActive ? 1 : 0.3,
                },
              ]}
            />
          );
        })}

        <View
          style={[
            styles.needle,
            {
              left: cx,
              top: cy,
              width: needleLen,
              height: 3,
              transform: [{ rotate: `${currentAngle}deg` }],
              transformOrigin: "left center",
            },
          ]}
        />
        <View style={[styles.needleCenter, { left: cx - 8, top: cy - 8 }]} />

        <View style={styles.bpmCenter}>
          <Text style={styles.bpmNumber}>{bpm}</Text>
          <Text style={styles.bpmLabel}>BPM</Text>
        </View>

        <View style={styles.tempoLabelWrap}>
          <Text style={styles.tempoLabelText}>{tempoLabel}</Text>
        </View>
      </View>

      <Text style={styles.swipeHint}>
        {Platform.OS === "web" ? "Drag left/right to adjust" : "Swipe or hold 3s to type"}
      </Text>

      <Modal visible={showInput} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowInput(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Enter BPM</Text>
            <TextInput
              style={styles.modalInput}
              value={inputValue}
              onChangeText={setInputValue}
              keyboardType="number-pad"
              maxLength={3}
              autoFocus
              selectTextOnFocus
              onSubmitEditing={handleInputSubmit}
              placeholderTextColor={Colors.textTertiary}
            />
            <View style={styles.modalActions}>
              <Pressable onPress={() => setShowInput(false)} style={styles.modalBtn}>
                <Text style={styles.modalBtnCancel}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleInputSubmit} style={[styles.modalBtn, styles.modalBtnPrimary]}>
                <Text style={styles.modalBtnText}>Set</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: 6,
  },
  gaugeOuter: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  gaugeRing: {
    position: "absolute",
    borderWidth: 2,
    borderColor: Colors.border,
  },
  tick: {
    position: "absolute",
    borderRadius: 1,
  },
  needle: {
    position: "absolute",
    backgroundColor: Colors.accent,
    borderRadius: 2,
  },
  needleCenter: {
    position: "absolute",
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.accent,
  },
  bpmCenter: {
    alignItems: "center",
    marginTop: 40,
  },
  bpmNumber: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 52,
    color: Colors.text,
    lineHeight: 58,
  },
  bpmLabel: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 12,
    color: Colors.textTertiary,
    letterSpacing: 3,
    marginTop: -2,
  },
  tempoLabelWrap: {
    position: "absolute",
    bottom: 20,
    alignItems: "center",
    width: "100%",
  },
  tempoLabelText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 13,
    color: Colors.accentMuted,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  swipeHint: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 11,
    color: Colors.textTertiary,
    opacity: 0.6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 24,
    width: 260,
    alignItems: "center",
    gap: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalTitle: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 18,
    color: Colors.text,
  },
  modalInput: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    padding: 14,
    width: "100%",
    textAlign: "center",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 32,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: Colors.surfaceLight,
  },
  modalBtnPrimary: {
    backgroundColor: Colors.accent,
  },
  modalBtnCancel: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  modalBtnText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 14,
    color: Colors.background,
  },
});
