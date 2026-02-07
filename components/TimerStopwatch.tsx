import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  TextInput,
  Platform,
} from "react-native";
import { Feather, Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  const tenths = Math.floor((ms % 1000) / 100);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${tenths}`;
}

function formatTimeShort(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

interface TimerStopwatchProps {
  mode: "stopwatch" | "timer";
  stopwatchMs: number;
  isStopwatchRunning: boolean;
  timerMs: number;
  timerTargetMs: number;
  isTimerRunning: boolean;
  isTimerSet: boolean;
  onStartStopwatch: () => void;
  onStopStopwatch: () => void;
  onResetStopwatch: () => void;
  onSetTimerTarget: (ms: number) => void;
  onStartTimer: () => void;
  onStopTimer: () => void;
  onResetTimer: () => void;
  onModeChange: (mode: "stopwatch" | "timer") => void;
}

export function TimerStopwatch({
  mode,
  stopwatchMs,
  isStopwatchRunning,
  timerMs,
  timerTargetMs,
  isTimerRunning,
  isTimerSet,
  onStartStopwatch,
  onStopStopwatch,
  onResetStopwatch,
  onSetTimerTarget,
  onStartTimer,
  onStopTimer,
  onResetTimer,
  onModeChange,
}: TimerStopwatchProps) {
  const [showTimerPicker, setShowTimerPicker] = useState(false);
  const [timerMinInput, setTimerMinInput] = useState("1");
  const [timerSecInput, setTimerSecInput] = useState("00");

  const remainingMs = Math.max(0, timerTargetMs - timerMs);
  const timerProgress = timerTargetMs > 0 ? Math.min(1, timerMs / timerTargetMs) : 0;

  const handleSetTimer = () => {
    const mins = parseInt(timerMinInput) || 0;
    const secs = parseInt(timerSecInput) || 0;
    const totalMs = (mins * 60 + secs) * 1000;
    if (totalMs > 0) {
      onSetTimerTarget(totalMs);
    }
    setShowTimerPicker(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.modeToggle}>
        <Pressable
          onPress={() => onModeChange("stopwatch")}
          style={[styles.modeBtn, mode === "stopwatch" && styles.modeBtnActive]}
        >
          <Feather name="clock" size={14} color={mode === "stopwatch" ? Colors.accent : Colors.textTertiary} />
          <Text style={[styles.modeText, mode === "stopwatch" && styles.modeTextActive]}>
            Stopwatch
          </Text>
        </Pressable>
        <Pressable
          onPress={() => onModeChange("timer")}
          style={[styles.modeBtn, mode === "timer" && styles.modeBtnActive]}
        >
          <Feather name="target" size={14} color={mode === "timer" ? Colors.accent : Colors.textTertiary} />
          <Text style={[styles.modeText, mode === "timer" && styles.modeTextActive]}>
            Timer
          </Text>
        </Pressable>
      </View>

      {mode === "stopwatch" ? (
        <View style={styles.displayRow}>
          <Text style={styles.timeDisplay}>{formatTime(stopwatchMs)}</Text>
          <View style={styles.controls}>
            {isStopwatchRunning ? (
              <Pressable onPress={onStopStopwatch} style={styles.controlBtn}>
                <Ionicons name="pause" size={18} color={Colors.danger} />
              </Pressable>
            ) : (
              <Pressable onPress={onStartStopwatch} style={styles.controlBtn}>
                <Ionicons name="play" size={18} color={Colors.success} />
              </Pressable>
            )}
            <Pressable onPress={onResetStopwatch} style={styles.controlBtn}>
              <Feather name="rotate-ccw" size={16} color={Colors.textSecondary} />
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.displayRow}>
          {isTimerSet ? (
            <>
              <View style={styles.timerDisplay}>
                <Text style={styles.timeDisplay}>{formatTimeShort(remainingMs)}</Text>
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${timerProgress * 100}%` }]} />
                </View>
              </View>
              <View style={styles.controls}>
                {isTimerRunning ? (
                  <Pressable onPress={onStopTimer} style={styles.controlBtn}>
                    <Ionicons name="pause" size={18} color={Colors.danger} />
                  </Pressable>
                ) : (
                  <Pressable onPress={onStartTimer} style={styles.controlBtn}>
                    <Ionicons name="play" size={18} color={Colors.success} />
                  </Pressable>
                )}
                <Pressable onPress={onResetTimer} style={styles.controlBtn}>
                  <Feather name="rotate-ccw" size={16} color={Colors.textSecondary} />
                </Pressable>
              </View>
            </>
          ) : (
            <Pressable
              onPress={() => setShowTimerPicker(true)}
              style={styles.setTimerBtn}
            >
              <Feather name="plus-circle" size={18} color={Colors.accent} />
              <Text style={styles.setTimerText}>Set Timer</Text>
            </Pressable>
          )}
        </View>
      )}

      <Modal visible={showTimerPicker} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowTimerPicker(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Set Timer</Text>
            <Text style={styles.modalSubtitle}>Stops after completing last beat</Text>
            <View style={styles.timerInputRow}>
              <View style={styles.timerInputWrap}>
                <TextInput
                  style={styles.timerInput}
                  value={timerMinInput}
                  onChangeText={setTimerMinInput}
                  keyboardType="number-pad"
                  maxLength={3}
                  selectTextOnFocus
                />
                <Text style={styles.timerInputLabel}>min</Text>
              </View>
              <Text style={styles.timerColon}>:</Text>
              <View style={styles.timerInputWrap}>
                <TextInput
                  style={styles.timerInput}
                  value={timerSecInput}
                  onChangeText={setTimerSecInput}
                  keyboardType="number-pad"
                  maxLength={2}
                  selectTextOnFocus
                />
                <Text style={styles.timerInputLabel}>sec</Text>
              </View>
            </View>
            <View style={styles.quickTimers}>
              {[30, 60, 120, 300, 600].map((secs) => (
                <Pressable
                  key={secs}
                  onPress={() => {
                    setTimerMinInput(String(Math.floor(secs / 60)));
                    setTimerSecInput(String(secs % 60).padStart(2, "0"));
                  }}
                  style={styles.quickTimerBtn}
                >
                  <Text style={styles.quickTimerText}>
                    {secs < 60 ? `${secs}s` : `${secs / 60}m`}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.modalActions}>
              <Pressable onPress={() => setShowTimerPicker(false)} style={styles.modalBtn}>
                <Text style={styles.modalBtnCancel}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleSetTimer} style={[styles.modalBtn, styles.modalBtnPrimary]}>
                <Text style={styles.modalBtnOk}>Start</Text>
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
    gap: 8,
  },
  modeToggle: {
    flexDirection: "row",
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 3,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
  },
  modeBtnActive: {
    backgroundColor: Colors.accentDim,
  },
  modeText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 12,
    color: Colors.textTertiary,
  },
  modeTextActive: {
    color: Colors.accent,
  },
  displayRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    minHeight: 40,
  },
  timeDisplay: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 24,
    color: Colors.text,
    letterSpacing: 1,
  },
  controls: {
    flexDirection: "row",
    gap: 6,
  },
  controlBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  timerDisplay: {
    flex: 1,
    gap: 6,
  },
  progressBarBg: {
    height: 4,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: Colors.accent,
    borderRadius: 2,
  },
  setTimerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  setTimerText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 13,
    color: Colors.accent,
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
    width: 300,
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
  modalSubtitle: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 12,
    color: Colors.textTertiary,
    marginTop: -8,
  },
  timerInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  timerInputWrap: {
    alignItems: "center",
    gap: 4,
  },
  timerInput: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    padding: 12,
    width: 80,
    textAlign: "center",
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 28,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  timerInputLabel: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 11,
    color: Colors.textTertiary,
  },
  timerColon: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 28,
    color: Colors.textTertiary,
  },
  quickTimers: {
    flexDirection: "row",
    gap: 8,
  },
  quickTimerBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.surfaceLight,
  },
  quickTimerText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 12,
    color: Colors.textSecondary,
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
  modalBtnOk: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 14,
    color: Colors.background,
  },
});
