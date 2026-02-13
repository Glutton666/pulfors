import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  Platform,
  Dimensions,
  PanResponder,
  GestureResponderEvent,
  PanResponderGestureState,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  useSharedValue,
  runOnJS,
  Easing,
  cancelAnimation,
} from "react-native-reanimated";
import { Ionicons, Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useTheme } from "@/contexts/ThemeContext";
import {
  TUNINGS,
  frequencyToNote,
  findClosestTuningNote,
  autoCorrelate,
  type InstrumentTuning,
} from "@/lib/tuner-engine";

type Mode = "stopwatch" | "timer" | "tuner";
type TimerState = "idle" | "running" | "paused" | "finishing";

const PANEL_WIDTH = 260;
const HANDLE_WIDTH = 28;
const HANDLE_HEIGHT = 80;
const TOTAL_DRAWER_WIDTH = PANEL_WIDTH + HANDLE_WIDTH;
const EDGE_SWIPE_ZONE = 30;
const SWIPE_THRESHOLD = 50;
const TIMER_PRESETS = [
  { label: "30s", seconds: 30 },
  { label: "1m", seconds: 60 },
  { label: "3m", seconds: 180 },
  { label: "5m", seconds: 300 },
  { label: "10m", seconds: 600 },
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
  onStopRequested: () => void;
  isMetronomePlaying: boolean;
  topInset: number;
}

export function StopwatchTimer({
  onTimerExpired,
  onStopRequested,
  isMetronomePlaying,
  topInset,
}: StopwatchTimerProps) {
  const [open, setOpen] = useState(false);
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
  const isPlayingRef = useRef(isMetronomePlaying);

  const { colors: C } = useTheme();

  const [tunerActive, setTunerActive] = useState(false);
  const [tunerInstrument, setTunerInstrument] = useState(0);
  const [detectedFreq, setDetectedFreq] = useState<number | null>(null);
  const [detectedNote, setDetectedNote] = useState<string | null>(null);
  const [detectedCents, setDetectedCents] = useState(0);
  const [selectedString, setSelectedString] = useState<number | null>(null);
  const [micPermission, setMicPermission] = useState<boolean | null>(null);
  const audioContextRef = useRef<any>(null);
  const analyserRef = useRef<any>(null);
  const sourceRef = useRef<any>(null);
  const streamRef = useRef<any>(null);
  const tunerRafRef = useRef<number | null>(null);
  const tunerActiveRef = useRef(false);

  useEffect(() => {
    isPlayingRef.current = isMetronomePlaying;
  }, [isMetronomePlaying]);

  const slideX = useSharedValue(-PANEL_WIDTH);
  const pulseOpacity = useSharedValue(1);
  const finishingPulse = useSharedValue(1);
  const handleGlow = useSharedValue(0);
  const handleFlash = useSharedValue(0);
  const thermoHeight = useSharedValue(1);
  const thermoBreakTop = useSharedValue(0);
  const thermoBreakBottom = useSharedValue(0);
  const thermoBreakOpacity = useSharedValue(0);

  useEffect(() => {
    if (open) {
      slideX.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.quad) });
    } else {
      slideX.value = withTiming(-PANEL_WIDTH, { duration: 180, easing: Easing.in(Easing.quad) });
    }
  }, [open]);

  useEffect(() => {
    if (state === "running" || state === "finishing") {
      handleGlow.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1000 }),
          withTiming(0.3, { duration: 1000 })
        ),
        -1,
        true
      );
    } else {
      cancelAnimation(handleGlow);
      handleGlow.value = withTiming(0, { duration: 300 });
    }
  }, [state]);

  const openRef = useRef(false);
  const togglePanel = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setOpen((prev) => {
      openRef.current = !prev;
      return !prev;
    });
  }, []);

  const openPanel = useCallback(() => {
    if (!openRef.current) {
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      openRef.current = true;
      setOpen(true);
    }
  }, []);

  const closePanel = useCallback(() => {
    if (openRef.current) {
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      openRef.current = false;
      setOpen(false);
    }
  }, []);

  const drawerPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (
          _evt: GestureResponderEvent,
          gestureState: PanResponderGestureState
        ) => {
          return (
            Math.abs(gestureState.dx) > 10 &&
            Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.5
          );
        },
        onPanResponderMove: (
          _evt: GestureResponderEvent,
          gestureState: PanResponderGestureState
        ) => {
          const currentOpen = openRef.current;
          if (currentOpen) {
            const clamped = Math.min(0, Math.max(-PANEL_WIDTH, gestureState.dx));
            slideX.value = clamped;
          } else {
            const clamped = Math.min(0, Math.max(-PANEL_WIDTH, -PANEL_WIDTH + gestureState.dx));
            slideX.value = clamped;
          }
        },
        onPanResponderRelease: (
          _evt: GestureResponderEvent,
          gestureState: PanResponderGestureState
        ) => {
          if (gestureState.dx > SWIPE_THRESHOLD) {
            openPanel();
            slideX.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.quad) });
          } else if (gestureState.dx < -SWIPE_THRESHOLD) {
            closePanel();
            slideX.value = withTiming(-PANEL_WIDTH, { duration: 180, easing: Easing.in(Easing.quad) });
          } else {
            const currentOpen = openRef.current;
            if (currentOpen) {
              slideX.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.quad) });
            } else {
              slideX.value = withTiming(-PANEL_WIDTH, { duration: 180, easing: Easing.in(Easing.quad) });
            }
          }
        },
      }),
    [openPanel, closePanel]
  );

  const edgeSwipePanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (
          _evt: GestureResponderEvent,
          gestureState: PanResponderGestureState
        ) => {
          return gestureState.dx > 8 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
        },
        onPanResponderMove: (
          _evt: GestureResponderEvent,
          gestureState: PanResponderGestureState
        ) => {
          const clamped = Math.min(0, Math.max(-PANEL_WIDTH, -PANEL_WIDTH + gestureState.dx));
          slideX.value = clamped;
        },
        onPanResponderRelease: (
          _evt: GestureResponderEvent,
          gestureState: PanResponderGestureState
        ) => {
          if (gestureState.dx > SWIPE_THRESHOLD) {
            openPanel();
            slideX.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.quad) });
          } else {
            slideX.value = withTiming(-PANEL_WIDTH, { duration: 180, easing: Easing.in(Easing.quad) });
          }
        },
      }),
    [openPanel]
  );

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
    if (isPlayingRef.current) {
      setState("finishing");
      onStopRequested();
    } else {
      clearTimerInterval();
      elapsedAtPauseRef.current = Date.now() - startTimeRef.current;
      setState("paused");
    }
  }, [hapticFeedback, clearTimerInterval, onStopRequested]);

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
    thermoBreakOpacity.value = 0;
    thermoBreakTop.value = 0;
    thermoBreakBottom.value = 0;
    thermoHeight.value = startRemaining / timerDuration;
    intervalRef.current = setInterval(() => {
      const el = Date.now() - startTimeRef.current + elapsedAtPauseRef.current;
      const leftSec = Math.max(0, startRemaining - Math.floor(el / 1000));
      const leftSmooth = Math.max(0, startRemaining - el / 1000);
      setRemaining(leftSec);
      thermoHeight.value = timerDuration > 0 ? leftSmooth / timerDuration : 0;
      if (leftSec <= 0) {
        clearInterval(intervalRef.current!);
        intervalRef.current = null;
        thermoHeight.value = withTiming(0, { duration: 300 });
        setState("finishing");
        if (isPlayingRef.current) {
          onTimerExpired();
        }
      }
    }, 50);
  }, [hapticFeedback, timerDuration, remaining, state, onTimerExpired]);

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
    thermoHeight.value = 1;
    setState("idle");
  }, [hapticFeedback, clearTimerInterval, timerDuration]);

  useEffect(() => {
    if (state === "finishing" && !isMetronomePlaying) {
      const animDuration = 1200;
      const timeout = setTimeout(() => {
        if (mode === "stopwatch") {
          clearTimerInterval();
          elapsedAtPauseRef.current = Date.now() - startTimeRef.current;
          setState("paused");
        } else {
          thermoHeight.value = 1;
          thermoBreakOpacity.value = 0;
          thermoBreakTop.value = 0;
          thermoBreakBottom.value = 0;
          setState("idle");
          setRemaining(timerDuration);
        }
      }, animDuration);
      return () => clearTimeout(timeout);
    }
  }, [isMetronomePlaying, state, timerDuration, mode, clearTimerInterval]);

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
      handleFlash.value = withSequence(
        withTiming(1, { duration: 100 }),
        withTiming(0, { duration: 150 }),
        withTiming(1, { duration: 100 }),
        withTiming(0, { duration: 150 }),
        withTiming(1, { duration: 100 }),
        withTiming(0, { duration: 200 })
      );
      thermoBreakOpacity.value = withTiming(1, { duration: 150 });
      thermoBreakTop.value = withTiming(-6, { duration: 300, easing: Easing.out(Easing.quad) });
      thermoBreakBottom.value = withTiming(4, { duration: 300, easing: Easing.out(Easing.quad) });
    } else {
      cancelAnimation(pulseOpacity);
      cancelAnimation(finishingPulse);
      pulseOpacity.value = withTiming(1, { duration: 200 });
      finishingPulse.value = withTiming(1, { duration: 200 });
      handleFlash.value = 0;
      thermoBreakOpacity.value = 0;
      thermoBreakTop.value = 0;
      thermoBreakBottom.value = 0;
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

  const handleGlowStyle = useAnimatedStyle(() => ({
    opacity: handleGlow.value,
  }));

  const handleFlashStyle = useAnimatedStyle(() => ({
    opacity: handleFlash.value,
  }));

  const thermoFillStyle = useAnimatedStyle(() => ({
    height: `${thermoHeight.value * 100}%` as any,
  }));

  const thermoBreakTopStyle = useAnimatedStyle(() => ({
    opacity: thermoBreakOpacity.value,
    transform: [{ translateY: thermoBreakTop.value }, { rotate: "-12deg" }],
  }));

  const thermoBreakBottomStyle = useAnimatedStyle(() => ({
    opacity: thermoBreakOpacity.value,
    transform: [{ translateY: thermoBreakBottom.value }, { rotate: "8deg" }],
  }));

  const startTuner = useCallback(async () => {
    if (Platform.OS !== "web") {
      setTunerActive(false);
      setMicPermission(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioCtx;
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 4096;
      analyserRef.current = analyser;
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      sourceRef.current = source;

      setMicPermission(true);
      tunerActiveRef.current = true;
      setTunerActive(true);

      const buf = new Float32Array(analyser.fftSize);
      const detect = () => {
        if (!tunerActiveRef.current) return;
        analyser.getFloatTimeDomainData(buf);
        const freq = autoCorrelate(buf, audioCtx.sampleRate);
        if (freq > 0 && freq < 2000) {
          setDetectedFreq(Math.round(freq * 10) / 10);
          const noteInfo = frequencyToNote(freq);
          setDetectedNote(`${noteInfo.name}${noteInfo.octave}`);
          setDetectedCents(noteInfo.cents);
        } else {
          setDetectedFreq(null);
          setDetectedNote(null);
          setDetectedCents(0);
        }
        tunerRafRef.current = requestAnimationFrame(detect);
      };
      detect();
    } catch {
      setMicPermission(false);
      setTunerActive(false);
    }
  }, []);

  const stopTuner = useCallback(() => {
    tunerActiveRef.current = false;
    setTunerActive(false);
    if (tunerRafRef.current) {
      cancelAnimationFrame(tunerRafRef.current);
      tunerRafRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t: any) => t.stop());
      streamRef.current = null;
    }
    setDetectedFreq(null);
    setDetectedNote(null);
    setDetectedCents(0);
  }, []);

  useEffect(() => {
    return () => {
      if (tunerActiveRef.current) stopTuner();
    };
  }, [stopTuner]);

  const switchMode = useCallback(
    (newMode: Mode) => {
      if (state !== "idle") return;
      hapticFeedback();
      if (mode === "tuner" && newMode !== "tuner") {
        stopTuner();
      }
      setMode(newMode);
    },
    [state, hapticFeedback, mode, stopTuner]
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

  const handleStatusIcon = () => {
    if (state === "running") return "radiobox-marked" as const;
    if (state === "finishing") return "radiobox-marked" as const;
    if (mode === "tuner") return "tune-variant" as const;
    if (mode === "stopwatch") return "timer-outline" as const;
    return "av-timer" as const;
  };

  const handleStatusColor = () => {
    if (state === "running") return Colors.success;
    if (state === "finishing") return Colors.danger;
    if (mode === "tuner" && tunerActive) return C.accent;
    return Colors.textTertiary;
  };

  return (
    <>
      {!open && (
        <View
          style={[styles.edgeSwipeZone, { top: topInset + 60 }]}
          {...edgeSwipePanResponder.panHandlers}
        />
      )}
      <View
        style={[styles.edgeContainer, { top: topInset + 60 }]}
        pointerEvents="box-none"
      >
        <Animated.View
          style={[styles.drawerWrapper, panelStyle]}
          {...drawerPanResponder.panHandlers}
        >
          <View style={styles.panel}>
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
                  size={14}
                  color={mode === "stopwatch" ? C.accent : Colors.textTertiary}
                />
                <Text style={[styles.tabText, mode === "stopwatch" && styles.tabTextActive, mode === "stopwatch" && { color: C.accent }]}>
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
                  size={14}
                  color={mode === "timer" ? C.accent : Colors.textTertiary}
                />
                <Text style={[styles.tabText, mode === "timer" && styles.tabTextActive, mode === "timer" && { color: C.accent }]}>
                  TIMER
                </Text>
              </Pressable>
              <Pressable
                onPress={() => switchMode("tuner")}
                style={({ pressed }) => [
                  styles.tab,
                  mode === "tuner" && styles.tabActive,
                  pressed && styles.buttonPressed,
                ]}
                testID="tab-tuner"
              >
                <MaterialCommunityIcons
                  name="tune-variant"
                  size={14}
                  color={mode === "tuner" ? C.accent : Colors.textTertiary}
                />
                <Text style={[styles.tabText, mode === "tuner" && styles.tabTextActive, mode === "tuner" && { color: C.accent }]}>
                  TUNER
                </Text>
              </Pressable>
            </View>

            <View style={styles.divider} />

            {mode === "stopwatch"
              ? renderStopwatchContent()
              : mode === "timer"
              ? renderTimerContent()
              : renderTunerContent()}
          </View>

          <Pressable
            onPress={togglePanel}
            style={({ pressed }) => [
              styles.handle,
              open && styles.handleOpen,
              open && { borderColor: C.accent },
              pressed && styles.handlePressed,
            ]}
            testID="panel-toggle"
          >
            <Animated.View style={[styles.handleGlow, { backgroundColor: C.accent }, handleGlowStyle]} />
            <Animated.View style={[styles.handleFlash, handleFlashStyle]} />
            {!open && isActive && mode === "timer" && (state === "running" || state === "finishing") ? (
              <View style={styles.thermometer}>
                {state === "finishing" && (
                  <>
                    <Animated.View
                      style={[
                        styles.thermoBreakShard,
                        { backgroundColor: Colors.danger },
                        thermoBreakTopStyle,
                      ]}
                    />
                    <Animated.View
                      style={[
                        styles.thermoBreakShard,
                        { backgroundColor: Colors.danger, top: 26 },
                        thermoBreakBottomStyle,
                      ]}
                    />
                  </>
                )}
                <View style={styles.thermoTube}>
                  <View style={styles.thermoTrack} />
                  <Animated.View
                    style={[
                      styles.thermoFill,
                      {
                        backgroundColor: state === "finishing" ? Colors.danger : C.accent,
                      },
                      thermoFillStyle,
                    ]}
                  />
                </View>
                <View
                  style={[
                    styles.thermoBulb,
                    {
                      backgroundColor: state === "finishing" ? Colors.danger : C.accent,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.thermoBulbInner,
                      {
                        backgroundColor: state === "finishing" ? Colors.danger : C.accent,
                      },
                    ]}
                  />
                </View>
              </View>
            ) : (
              <>
                <View style={styles.handleLine} />
                <MaterialCommunityIcons
                  name={handleStatusIcon()}
                  size={14}
                  color={handleStatusColor()}
                />
                <View style={styles.handleLine} />
              </>
            )}
          </Pressable>
        </Animated.View>
      </View>
    </>
  );

  function renderStopwatchContent() {
    const { main, fraction } = formatTime(elapsed);
    return (
      <View style={styles.displaySection}>
        <View style={styles.timeRow}>
          {state === "finishing" && (
            <Animated.View style={[styles.finishingDot, finishingStyle]} />
          )}
          {state === "running" && (
            <Animated.View style={[styles.runningDot, runningDotStyle]} />
          )}
          <Text style={[styles.timeText, state === "finishing" && styles.finishingText]}>{main}</Text>
          <Text style={[styles.fractionText, state === "finishing" && { color: Colors.danger }]}>{fraction}</Text>
        </View>

        {state === "finishing" && (
          <Text style={styles.finishingLabel}>completing measure...</Text>
        )}

        <View style={styles.controlRow}>
          {state === "idle" && (
            <Pressable
              onPress={startStopwatch}
              style={({ pressed }) => [styles.controlButton, styles.startButton, { backgroundColor: C.accent }, pressed && styles.buttonPressed]}
              testID="stopwatch-start"
            >
              <Ionicons name="play" size={16} color={Colors.background} />
            </Pressable>
          )}
          {state === "running" && (
            <Pressable
              onPress={pauseStopwatch}
              style={({ pressed }) => [styles.controlButton, styles.pauseButton, pressed && styles.buttonPressed]}
              testID="stopwatch-pause"
            >
              <Ionicons name="pause" size={16} color={Colors.text} />
            </Pressable>
          )}
          {state === "paused" && (
            <>
              <Pressable
                onPress={resetStopwatch}
                style={({ pressed }) => [styles.controlButton, styles.resetButton, pressed && styles.buttonPressed]}
                testID="stopwatch-reset"
              >
                <Feather name="rotate-ccw" size={14} color={Colors.danger} />
              </Pressable>
              <Pressable
                onPress={startStopwatch}
                style={({ pressed }) => [styles.controlButton, styles.startButton, { backgroundColor: C.accent }, pressed && styles.buttonPressed]}
                testID="stopwatch-resume"
              >
                <Ionicons name="play" size={16} color={Colors.background} />
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
                  timerDuration === p.seconds && { backgroundColor: C.accentDim, borderColor: C.accent },
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text
                  style={[
                    styles.presetText,
                    timerDuration === p.seconds && styles.presetTextActive,
                    timerDuration === p.seconds && { color: C.accent },
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
              style={[styles.timeText, styles.timeInput, { borderBottomColor: C.accent }]}
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
                  backgroundColor: state === "finishing" ? Colors.danger : C.accent,
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
              style={({ pressed }) => [styles.controlButton, styles.startButton, { backgroundColor: C.accent }, pressed && styles.buttonPressed]}
              testID="timer-start"
            >
              <Ionicons name="play" size={16} color={Colors.background} />
            </Pressable>
          )}
          {state === "running" && (
            <Pressable
              onPress={pauseTimer}
              style={({ pressed }) => [styles.controlButton, styles.pauseButton, pressed && styles.buttonPressed]}
              testID="timer-pause"
            >
              <Ionicons name="pause" size={16} color={Colors.text} />
            </Pressable>
          )}
          {state === "paused" && (
            <>
              <Pressable
                onPress={resetTimer}
                style={({ pressed }) => [styles.controlButton, styles.resetButton, pressed && styles.buttonPressed]}
                testID="timer-reset"
              >
                <Feather name="rotate-ccw" size={14} color={Colors.danger} />
              </Pressable>
              <Pressable
                onPress={startTimer}
                style={({ pressed }) => [styles.controlButton, styles.startButton, { backgroundColor: C.accent }, pressed && styles.buttonPressed]}
                testID="timer-resume"
              >
                <Ionicons name="play" size={16} color={Colors.background} />
              </Pressable>
            </>
          )}
        </View>
      </View>
    );
  }

  function renderTunerContent() {
    const currentTuning = TUNINGS[tunerInstrument];
    const match = detectedFreq
      ? findClosestTuningNote(detectedFreq, currentTuning)
      : null;

    const centsDisplay = match ? match.cents : detectedCents;
    const inTune = Math.abs(centsDisplay) <= 5;
    const centsColor = inTune
      ? Colors.success
      : Math.abs(centsDisplay) <= 15
      ? C.accent
      : Colors.danger;

    const meterPosition = Math.max(-50, Math.min(50, centsDisplay));
    const meterPercent = ((meterPosition + 50) / 100) * 100;

    return (
      <View style={styles.displaySection}>
        <View style={styles.instrumentRow}>
          <Pressable
            onPress={() => {
              hapticFeedback();
              setTunerInstrument((prev) =>
                prev <= 0 ? TUNINGS.length - 1 : prev - 1
              );
              setSelectedString(null);
            }}
            hitSlop={8}
          >
            <Feather name="chevron-left" size={14} color={Colors.textSecondary} />
          </Pressable>
          <Text style={styles.instrumentLabel}>{currentTuning.label}</Text>
          <Pressable
            onPress={() => {
              hapticFeedback();
              setTunerInstrument((prev) =>
                prev >= TUNINGS.length - 1 ? 0 : prev + 1
              );
              setSelectedString(null);
            }}
            hitSlop={8}
          >
            <Feather name="chevron-right" size={14} color={Colors.textSecondary} />
          </Pressable>
        </View>

        <View style={styles.stringRow}>
          {currentTuning.notes.map((note, i) => {
            const isMatched = match && match.note.string === note.string;
            const isSelected = selectedString === note.string;
            return (
              <Pressable
                key={i}
                onPress={() => {
                  hapticFeedback();
                  setSelectedString(
                    selectedString === note.string ? null : note.string
                  );
                }}
                style={({ pressed }) => [
                  styles.stringChip,
                  isSelected && styles.stringChipSelected,
                  isSelected && { backgroundColor: C.accentDim, borderColor: C.accent },
                  isMatched && inTune && styles.stringChipInTune,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text
                  style={[
                    styles.stringLabel,
                    isSelected && styles.stringLabelSelected,
                    isSelected && { color: C.accent },
                    isMatched && inTune && { color: Colors.success },
                  ]}
                >
                  {note.name}
                </Text>
                <Text style={styles.stringNum}>{note.string}</Text>
              </Pressable>
            );
          })}
        </View>

        {!tunerActive ? (
          <View style={styles.tunerStartSection}>
            {micPermission === false && Platform.OS !== "web" ? (
              <Text style={styles.tunerHint}>
                Tuner uses microphone (web only)
              </Text>
            ) : micPermission === false ? (
              <Text style={styles.tunerHint}>Microphone access denied</Text>
            ) : null}
            <Pressable
              onPress={startTuner}
              style={({ pressed }) => [
                styles.controlButton,
                styles.startButton,
                { backgroundColor: C.accent },
                pressed && styles.buttonPressed,
              ]}
              testID="tuner-start"
            >
              <MaterialCommunityIcons
                name="microphone"
                size={16}
                color={Colors.background}
              />
            </Pressable>
          </View>
        ) : (
          <View style={styles.tunerActiveSection}>
            <Text style={[styles.tunerNote, { color: centsColor }]}>
              {detectedNote ?? "--"}
            </Text>

            <View style={styles.centsMeter}>
              <View style={styles.centsMeterTrack}>
                <View style={styles.centsMeterCenter} />
                <View
                  style={[
                    styles.centsMeterNeedle,
                    {
                      left: `${meterPercent}%` as any,
                      backgroundColor: centsColor,
                    },
                  ]}
                />
              </View>
              <View style={styles.centsMeterLabels}>
                <Text style={styles.centsMeterLabel}>-50</Text>
                <Text style={[styles.centsMeterLabel, { color: Colors.text }]}>0</Text>
                <Text style={styles.centsMeterLabel}>+50</Text>
              </View>
            </View>

            <Text style={[styles.centsText, { color: centsColor }]}>
              {centsDisplay > 0 ? "+" : ""}
              {centsDisplay} cents
            </Text>

            {detectedFreq && (
              <Text style={styles.freqText}>{detectedFreq} Hz</Text>
            )}

            <Pressable
              onPress={stopTuner}
              style={({ pressed }) => [
                styles.controlButton,
                styles.pauseButton,
                pressed && styles.buttonPressed,
              ]}
              testID="tuner-stop"
            >
              <Ionicons name="stop" size={14} color={Colors.text} />
            </Pressable>
          </View>
        )}
      </View>
    );
  }
}

const styles = StyleSheet.create({
  edgeSwipeZone: {
    position: "absolute",
    left: 0,
    width: EDGE_SWIPE_ZONE,
    height: 300,
    zIndex: 99,
  },
  edgeContainer: {
    position: "absolute",
    left: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    zIndex: 100,
  },
  drawerWrapper: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  handle: {
    width: HANDLE_WIDTH,
    minHeight: HANDLE_HEIGHT,
    backgroundColor: Colors.surface,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    borderWidth: 1,
    borderLeftWidth: 0,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    overflow: "hidden",
    paddingVertical: 6,
  },
  handleOpen: {
    backgroundColor: Colors.surfaceLight,
    borderColor: Colors.accent,
  },
  handlePressed: {
    backgroundColor: Colors.surfaceLight,
  },
  handleGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.accent,
  },
  handleLine: {
    width: 3,
    height: 10,
    borderRadius: 1.5,
    backgroundColor: Colors.textTertiary,
    opacity: 0.4,
  },
  panel: {
    width: PANEL_WIDTH,
    backgroundColor: Colors.surface,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderBottomRightRadius: 16,
    borderRightColor: Colors.border,
    borderBottomColor: Colors.border,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 16,
    gap: 10,
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
    gap: 4,
    paddingVertical: 6,
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: Colors.surfaceLight,
  },
  tabText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 8,
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
    gap: 10,
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  timeText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 28,
    color: Colors.text,
    letterSpacing: 2,
    fontVariant: ["tabular-nums"],
  },
  fractionText: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 16,
    color: Colors.textSecondary,
    letterSpacing: 1,
    fontVariant: ["tabular-nums"],
  },
  finishingText: {
    color: Colors.danger,
  },
  runningDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: Colors.success,
    marginRight: 6,
    marginBottom: 3,
  },
  finishingDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: Colors.danger,
    marginRight: 6,
    marginBottom: 3,
  },
  controlRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  controlButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
    gap: 5,
  },
  presetChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  presetChipActive: {
    backgroundColor: Colors.accentDim,
    borderColor: Colors.accent,
  },
  presetText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 10,
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
    minWidth: 100,
    paddingVertical: 2,
    color: Colors.text,
  },
  timeTextEditable: {
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
    fontSize: 9,
    color: Colors.danger,
    letterSpacing: 1,
    opacity: 0.8,
  },
  handleFlash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.danger,
    borderRadius: 12,
    zIndex: 10,
  },
  thermometer: {
    alignItems: "center",
  },
  thermoTube: {
    width: 6,
    height: 48,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    overflow: "hidden",
    justifyContent: "flex-end",
    marginBottom: -4,
    zIndex: 0,
  },
  thermoTrack: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 3,
  },
  thermoFill: {
    width: "100%",
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    zIndex: 1,
  },
  thermoBulb: {
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  thermoBulbInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    opacity: 0.6,
  },
  thermoBreakShard: {
    position: "absolute",
    width: 6,
    height: 3,
    borderRadius: 1.5,
    top: 20,
    zIndex: 2,
  },
  instrumentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  instrumentLabel: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 11,
    color: Colors.text,
    letterSpacing: 0.5,
    minWidth: 100,
    textAlign: "center",
  },
  stringRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 4,
  },
  stringChip: {
    width: 32,
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
  },
  stringChipSelected: {
    backgroundColor: Colors.accentDim,
    borderColor: Colors.accent,
  },
  stringChipInTune: {
    borderColor: Colors.success,
    backgroundColor: "rgba(63, 185, 80, 0.12)",
  },
  stringLabel: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 13,
    color: Colors.text,
  },
  stringLabelSelected: {
    color: Colors.accent,
  },
  stringNum: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 7,
    color: Colors.textTertiary,
    letterSpacing: 0.5,
  },
  tunerStartSection: {
    alignItems: "center",
    gap: 8,
  },
  tunerHint: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 9,
    color: Colors.textTertiary,
    textAlign: "center",
  },
  tunerActiveSection: {
    alignItems: "center",
    gap: 6,
  },
  tunerNote: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 32,
    letterSpacing: 2,
  },
  centsMeter: {
    width: "90%",
    gap: 3,
  },
  centsMeterTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.surfaceLight,
    position: "relative",
    overflow: "visible",
  },
  centsMeterCenter: {
    position: "absolute",
    left: "50%",
    top: -2,
    width: 2,
    height: 8,
    marginLeft: -1,
    backgroundColor: Colors.textTertiary,
    borderRadius: 1,
  },
  centsMeterNeedle: {
    position: "absolute",
    top: -3,
    width: 6,
    height: 10,
    marginLeft: -3,
    borderRadius: 3,
  },
  centsMeterLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  centsMeterLabel: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 7,
    color: Colors.textTertiary,
  },
  centsText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 11,
    letterSpacing: 0.5,
  },
  freqText: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 9,
    color: Colors.textTertiary,
  },
});
