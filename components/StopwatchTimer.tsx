import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  Platform,
  Dimensions,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  withSpring,
  useSharedValue,
  Easing,
  cancelAnimation,
  runOnJS,
} from "react-native-reanimated";
import { Ionicons, Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";

type Mode = "stopwatch" | "timer";
type TimerState = "idle" | "running" | "paused" | "finishing";

const PANEL_WIDTH = 280;
const TIMER_PRESETS = [
  { label: "30s", seconds: 30 },
  { label: "1m", seconds: 60 },
  { label: "3m", seconds: 180 },
  { label: "5m", seconds: 300 },
  { label: "10m", seconds: 600 },
  { label: "15m", seconds: 900 },
];

function formatTime(totalMs: number): { main: string; fraction: string } {
  const totalSeconds = Math.floor(totalMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const centiseconds = Math.floor((totalMs % 1000) / 10);
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  const cc = String(centiseconds).padStart(2, "0");
  return { main: `${mm}:${ss}`, fraction: `.${cc}` };
}

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return `${mm}:${ss}`;
}

interface StopwatchTimerProps {
  onTimerExpired: () => void;
  isMetronomePlaying: boolean;
  visible: boolean;
  onClose: () => void;
  topInset: number;
}

export function StopwatchTimer({
  onTimerExpired,
  isMetronomePlaying,
  visible,
  onClose,
  topInset,
}: StopwatchTimerProps) {
  const [mode, setMode] = useState<Mode>("stopwatch");
  const [state, setState] = useState<TimerState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [timerDuration, setTimerDuration] = useState(180);
  const [remaining, setRemaining] = useState(180);
  const [editingTimer, setEditingTimer] = useState(false);
  const [editInput, setEditInput] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);
  const elapsedAtPauseRef = useRef(0);

  const slideX = useSharedValue(PANEL_WIDTH);
  const backdropOpacity = useSharedValue(0);
  const pulseOpacity = useSharedValue(1);
  const finishingPulse = useSharedValue(1);

  useEffect(() => {
    if (visible) {
      slideX.value = withSpring(0, { damping: 20, stiffness: 200 });
      backdropOpacity.value = withTiming(1, { duration: 250 });
    } else {
      slideX.value = withSpring(PANEL_WIDTH, { damping: 20, stiffness: 200 });
      backdropOpacity.value = withTiming(0, { duration: 200 });
    }
  }, [visible]);

  const clearTimerInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const hapticFeedback = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  const startStopwatch = useCallback(() => {
    hapticFeedback();
    startTimeRef.current = Date.now() - elapsedAtPauseRef.current;
    setState("running");
    intervalRef.current = setInterval(() => {
      setElapsed(Date.now() - startTimeRef.current);
    }, 33);
  }, [hapticFeedback]);

  const pauseStopwatch = useCallback(() => {
    hapticFeedback();
    clearTimerInterval();
    elapsedAtPauseRef.current = Date.now() - startTimeRef.current;
    setState("paused");
  }, [hapticFeedback, clearTimerInterval]);

  const resetStopwatch = useCallback(() => {
    hapticFeedback();
    clearTimerInterval();
    setElapsed(0);
    elapsedAtPauseRef.current = 0;
    setState("idle");
  }, [hapticFeedback, clearTimerInterval]);

  const startTimer = useCallback(() => {
    hapticFeedback();
    const startRemaining = state === "paused" ? remaining : timerDuration;
    setRemaining(startRemaining);
    startTimeRef.current = Date.now();
    elapsedAtPauseRef.current = 0;
    setState("running");
    intervalRef.current = setInterval(() => {
      const el = Date.now() - startTimeRef.current + elapsedAtPauseRef.current;
      const left = Math.max(0, startRemaining - Math.floor(el / 1000));
      setRemaining(left);
      if (left <= 0) {
        clearInterval(intervalRef.current!);
        intervalRef.current = null;
        if (isMetronomePlaying) {
          setState("finishing");
          onTimerExpired();
        } else {
          setState("idle");
          setRemaining(timerDuration);
        }
      }
    }, 200);
  }, [hapticFeedback, timerDuration, remaining, state, isMetronomePlaying, onTimerExpired]);

  const pauseTimer = useCallback(() => {
    hapticFeedback();
    clearTimerInterval();
    elapsedAtPauseRef.current += Date.now() - startTimeRef.current;
    setState("paused");
  }, [hapticFeedback, clearTimerInterval]);

  const resetTimer = useCallback(() => {
    hapticFeedback();
    clearTimerInterval();
    setRemaining(timerDuration);
    elapsedAtPauseRef.current = 0;
    setState("idle");
  }, [hapticFeedback, clearTimerInterval, timerDuration]);

  useEffect(() => {
    if (state === "finishing" && !isMetronomePlaying) {
      setState("idle");
      setRemaining(timerDuration);
    }
  }, [isMetronomePlaying, state, timerDuration]);

  useEffect(() => {
    if (state === "running") {
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0.4, { duration: 800, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
    } else if (state === "finishing") {
      finishingPulse.value = withRepeat(
        withSequence(
          withTiming(0.3, { duration: 400 }),
          withTiming(1, { duration: 400 })
        ),
        -1,
        true
      );
    } else {
      cancelAnimation(pulseOpacity);
      cancelAnimation(finishingPulse);
      pulseOpacity.value = withTiming(1, { duration: 200 });
      finishingPulse.value = withTiming(1, { duration: 200 });
    }
  }, [state]);

  useEffect(() => {
    return () => clearTimerInterval();
  }, [clearTimerInterval]);

  const runningDotStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  const finishingStyle = useAnimatedStyle(() => ({
    opacity: finishingPulse.value,
  }));

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: slideX.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const switchMode = useCallback(
    (newMode: Mode) => {
      if (state !== "idle") return;
      hapticFeedback();
      setMode(newMode);
    },
    [state, hapticFeedback]
  );

  const adjustTimerDuration = useCallback(
    (seconds: number) => {
      if (state !== "idle") return;
      hapticFeedback();
      setTimerDuration(seconds);
      setRemaining(seconds);
      setEditingTimer(false);
    },
    [state, hapticFeedback]
  );

  const startEditingTimer = useCallback(() => {
    if (state !== "idle") return;
    const mins = Math.floor(timerDuration / 60);
    const secs = timerDuration % 60;
    setEditInput(
      mins > 0 ? `${mins}:${String(secs).padStart(2, "0")}` : `${secs}`
    );
    setEditingTimer(true);
  }, [state, timerDuration]);

  const commitEditInput = useCallback(() => {
    setEditingTimer(false);
    const trimmed = editInput.trim();
    if (!trimmed) return;

    let totalSeconds = 0;
    if (trimmed.includes(":")) {
      const parts = trimmed.split(":");
      const mins = parseInt(parts[0], 10) || 0;
      const secs = parseInt(parts[1], 10) || 0;
      totalSeconds = mins * 60 + secs;
    } else {
      const val = parseInt(trimmed, 10) || 0;
      totalSeconds = val < 10 ? val * 60 : val;
    }

    totalSeconds = Math.max(1, Math.min(totalSeconds, 5999));
    setTimerDuration(totalSeconds);
    setRemaining(totalSeconds);
  }, [editInput]);

  const isActive = state !== "idle";

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? "auto" : "none"}>
      <Animated.View style={[styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View
        style={[
          styles.panel,
          panelStyle,
          { paddingTop: topInset + 12 },
        ]}
      >
        <View style={styles.panelHeader}>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [
              styles.closeButton,
              pressed && styles.buttonPressed,
            ]}
            testID="panel-close"
          >
            <Ionicons name="chevron-forward" size={20} color={Colors.textSecondary} />
          </Pressable>
        </View>

        <View style={styles.tabRow}>
          <Pressable
            onPress={() => switchMode("stopwatch")}
            style={({ pressed }) => [
              styles.tab,
              mode === "stopwatch" && styles.tabActive,
              pressed && styles.buttonPressed,
            ]}
            testID="tab-stopwatch"
          >
            <MaterialCommunityIcons
              name="timer-outline"
              size={15}
              color={mode === "stopwatch" ? Colors.accent : Colors.textTertiary}
            />
            <Text style={[styles.tabText, mode === "stopwatch" && styles.tabTextActive]}>
              STOPWATCH
            </Text>
          </Pressable>
          <Pressable
            onPress={() => switchMode("timer")}
            style={({ pressed }) => [
              styles.tab,
              mode === "timer" && styles.tabActive,
              pressed && styles.buttonPressed,
            ]}
            testID="tab-timer"
          >
            <MaterialCommunityIcons
              name="av-timer"
              size={15}
              color={mode === "timer" ? Colors.accent : Colors.textTertiary}
            />
            <Text style={[styles.tabText, mode === "timer" && styles.tabTextActive]}>
              TIMER
            </Text>
          </Pressable>
        </View>

        <View style={styles.divider} />

        {mode === "stopwatch" ? renderStopwatchContent() : renderTimerContent()}
      </Animated.View>
    </View>
  );

  function renderStopwatchContent() {
    const { main, fraction } = formatTime(elapsed);
    return (
      <View style={styles.displaySection}>
        <View style={styles.timeRow}>
          {state === "running" && (
            <Animated.View style={[styles.runningDot, runningDotStyle]} />
          )}
          <Text style={styles.timeText}>{main}</Text>
          <Text style={styles.fractionText}>{fraction}</Text>
        </View>

        <View style={styles.controlRow}>
          {state === "idle" && (
            <Pressable
              onPress={startStopwatch}
              style={({ pressed }) => [styles.controlButton, styles.startButton, pressed && styles.buttonPressed]}
              testID="stopwatch-start"
            >
              <Ionicons name="play" size={18} color={Colors.background} />
            </Pressable>
          )}
          {state === "running" && (
            <Pressable
              onPress={pauseStopwatch}
              style={({ pressed }) => [styles.controlButton, styles.pauseButton, pressed && styles.buttonPressed]}
              testID="stopwatch-pause"
            >
              <Ionicons name="pause" size={18} color={Colors.text} />
            </Pressable>
          )}
          {state === "paused" && (
            <>
              <Pressable
                onPress={resetStopwatch}
                style={({ pressed }) => [styles.controlButton, styles.resetButton, pressed && styles.buttonPressed]}
                testID="stopwatch-reset"
              >
                <Feather name="rotate-ccw" size={16} color={Colors.danger} />
              </Pressable>
              <Pressable
                onPress={startStopwatch}
                style={({ pressed }) => [styles.controlButton, styles.startButton, pressed && styles.buttonPressed]}
                testID="stopwatch-resume"
              >
                <Ionicons name="play" size={18} color={Colors.background} />
              </Pressable>
            </>
          )}
        </View>
      </View>
    );
  }

  function renderTimerContent() {
    const display = formatCountdown(remaining);
    const progress = timerDuration > 0 ? remaining / timerDuration : 1;
    return (
      <View style={styles.displaySection}>
        {state === "idle" && (
          <View style={styles.presetRow}>
            {TIMER_PRESETS.map((p) => (
              <Pressable
                key={p.seconds}
                onPress={() => adjustTimerDuration(p.seconds)}
                style={({ pressed }) => [
                  styles.presetChip,
                  timerDuration === p.seconds && styles.presetChipActive,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text
                  style={[
                    styles.presetText,
                    timerDuration === p.seconds && styles.presetTextActive,
                  ]}
                >
                  {p.label}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        <View style={styles.timeRow}>
          {state === "finishing" && (
            <Animated.View style={[styles.finishingDot, finishingStyle]} />
          )}
          {state === "running" && (
            <Animated.View style={[styles.runningDot, runningDotStyle]} />
          )}
          {state === "idle" && editingTimer ? (
            <TextInput
              style={[styles.timeText, styles.timeInput]}
              value={editInput}
              onChangeText={setEditInput}
              onBlur={commitEditInput}
              onSubmitEditing={commitEditInput}
              keyboardType="numbers-and-punctuation"
              autoFocus
              selectTextOnFocus
              placeholder="m:ss"
              placeholderTextColor={Colors.textTertiary}
              testID="timer-input"
            />
          ) : (
            <Pressable
              onPress={state === "idle" ? startEditingTimer : undefined}
              disabled={state !== "idle"}
            >
              <Animated.Text
                style={[
                  styles.timeText,
                  state === "idle" && styles.timeTextEditable,
                  state === "finishing" && styles.finishingText,
                  state === "finishing" ? finishingStyle : undefined,
                ]}
              >
                {display}
              </Animated.Text>
            </Pressable>
          )}
        </View>

        {(state === "running" || state === "finishing") && (
          <View style={styles.progressBarContainer}>
            <View
              style={[
                styles.progressBarFill,
                {
                  width: `${progress * 100}%` as any,
                  backgroundColor: state === "finishing" ? Colors.danger : Colors.accent,
                },
              ]}
            />
          </View>
        )}

        {state === "finishing" && (
          <Text style={styles.finishingLabel}>completing measure...</Text>
        )}

        <View style={styles.controlRow}>
          {state === "idle" && (
            <Pressable
              onPress={startTimer}
              style={({ pressed }) => [styles.controlButton, styles.startButton, pressed && styles.buttonPressed]}
              testID="timer-start"
            >
              <Ionicons name="play" size={18} color={Colors.background} />
            </Pressable>
          )}
          {state === "running" && (
            <Pressable
              onPress={pauseTimer}
              style={({ pressed }) => [styles.controlButton, styles.pauseButton, pressed && styles.buttonPressed]}
              testID="timer-pause"
            >
              <Ionicons name="pause" size={18} color={Colors.text} />
            </Pressable>
          )}
          {state === "paused" && (
            <>
              <Pressable
                onPress={resetTimer}
                style={({ pressed }) => [styles.controlButton, styles.resetButton, pressed && styles.buttonPressed]}
                testID="timer-reset"
              >
                <Feather name="rotate-ccw" size={16} color={Colors.danger} />
              </Pressable>
              <Pressable
                onPress={startTimer}
                style={({ pressed }) => [styles.controlButton, styles.startButton, pressed && styles.buttonPressed]}
                testID="timer-resume"
              >
                <Ionicons name="play" size={18} color={Colors.background} />
              </Pressable>
            </>
          )}
        </View>
      </View>
    );
  }
}

interface ToggleButtonProps {
  onPress: () => void;
  isActive: boolean;
}

export function StopwatchTimerToggle({ onPress, isActive }: ToggleButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.toggleButton,
        isActive && styles.toggleButtonActive,
        pressed && styles.buttonPressed,
      ]}
      testID="panel-toggle"
    >
      <MaterialCommunityIcons
        name="timer-outline"
        size={18}
        color={isActive ? Colors.accent : Colors.textSecondary}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  panel: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: PANEL_WIDTH,
    backgroundColor: Colors.surface,
    borderLeftWidth: 1,
    borderLeftColor: Colors.border,
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 12,
  },
  panelHeader: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 4,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  tabRow: {
    flexDirection: "row",
    gap: 4,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 6,
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: Colors.surfaceLight,
  },
  tabText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 9,
    color: Colors.textTertiary,
    letterSpacing: 1.5,
  },
  tabTextActive: {
    color: Colors.accent,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    opacity: 0.5,
  },
  displaySection: {
    alignItems: "center",
    gap: 12,
    paddingTop: 8,
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  timeText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 32,
    color: Colors.text,
    letterSpacing: 2,
    fontVariant: ["tabular-nums"],
  },
  fractionText: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 18,
    color: Colors.textSecondary,
    letterSpacing: 1,
    fontVariant: ["tabular-nums"],
  },
  finishingText: {
    color: Colors.danger,
  },
  runningDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.success,
    marginRight: 8,
    marginBottom: 4,
  },
  finishingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.danger,
    marginRight: 8,
    marginBottom: 4,
  },
  controlRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  controlButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  startButton: {
    backgroundColor: Colors.accent,
  },
  pauseButton: {
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  resetButton: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  buttonPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.95 }],
  },
  presetRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 6,
  },
  presetChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  presetChipActive: {
    backgroundColor: Colors.accentDim,
    borderColor: Colors.accent,
  },
  presetText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 11,
    color: Colors.textTertiary,
    letterSpacing: 1,
  },
  presetTextActive: {
    color: Colors.accent,
  },
  timeInput: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.accent,
    textAlign: "center",
    minWidth: 120,
    paddingVertical: 2,
    color: Colors.text,
  },
  timeTextEditable: {
    borderBottomWidth: 1,
    borderBottomColor: "transparent",
    textDecorationLine: "underline",
    textDecorationColor: Colors.textTertiary,
    textDecorationStyle: "dotted",
  },
  progressBarContainer: {
    width: "80%",
    height: 3,
    borderRadius: 1.5,
    backgroundColor: Colors.surfaceLight,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 1.5,
  },
  finishingLabel: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 10,
    color: Colors.danger,
    letterSpacing: 1,
    opacity: 0.8,
  },
  toggleButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  toggleButtonActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accentDim,
  },
});
