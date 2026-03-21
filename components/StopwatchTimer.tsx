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
import { useLanguage } from "@/contexts/LanguageContext";
import { moderateScale } from "@/lib/scale";
type Mode = "stopwatch" | "timer";
type TimerState = "idle" | "running" | "paused" | "finishing" | "countdown";

const PANEL_WIDTH = moderateScale(260, 0.3);
const HANDLE_WIDTH = moderateScale(28, 0.3);
const HANDLE_HEIGHT = moderateScale(80, 0.3);
const TOTAL_DRAWER_WIDTH = PANEL_WIDTH + HANDLE_WIDTH;
const EDGE_SWIPE_ZONE = 30;
const SWIPE_THRESHOLD = 50;
const TIMER_PRESETS = [
  { label: "30s", seconds: 30 },
  { label: "1m", seconds: 60 },
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
  onStartMetronome: () => void;
  isMetronomePlaying: boolean;
  currentBeat: number;
  topInset: number;
  isLandscape?: boolean;
}

export function StopwatchTimer({
  onTimerExpired,
  onStopRequested,
  onStartMetronome,
  isMetronomePlaying,
  currentBeat,
  topInset,
  isLandscape = false,
}: StopwatchTimerProps) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("stopwatch");
  const [state, setState] = useState<TimerState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [timerDuration, setTimerDuration] = useState(180);
  const [remaining, setRemaining] = useState(180);
  const [editingTimer, setEditingTimer] = useState(false);
  const [timerMinInput, setTimerMinInput] = useState("");
  const [timerSecInput, setTimerSecInput] = useState("");
  const [countdownLeft, setCountdownLeft] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);
  const elapsedAtPauseRef = useRef(0);
  const isPlayingRef = useRef(isMetronomePlaying);
  const stateRef = useRef<TimerState>(state);
  const modeRef = useRef<Mode>(mode);

  const { colors: C } = useTheme();

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  useEffect(() => {
    isPlayingRef.current = isMetronomePlaying;
  }, [isMetronomePlaying]);

  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearCountdownInterval = useCallback(() => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isMetronomePlaying && stateRef.current === "running") {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (modeRef.current === "stopwatch") {
        elapsedAtPauseRef.current = Date.now() - startTimeRef.current;
      } else {
        elapsedAtPauseRef.current += Date.now() - startTimeRef.current;
      }
      setState("paused");
    }
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
    if (state === "running" || state === "finishing" || state === "countdown") {
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

  const actualStartStopwatch = useCallback(() => {
    startTimeRef.current = Date.now() - elapsedAtPauseRef.current;
    setState("running");
    intervalRef.current = setInterval(() => {
      setElapsed(Date.now() - startTimeRef.current);
    }, 33);
  }, []);

  const startStopwatch = useCallback(() => {
    hapticFeedback();
    setCountdownLeft(3);
    setState("countdown");
    setOpen(false);
    clearCountdownInterval();
    let count = 3;
    countdownIntervalRef.current = setInterval(() => {
      count--;
      if (count <= 0) {
        clearInterval(countdownIntervalRef.current!);
        countdownIntervalRef.current = null;
        setCountdownLeft(0);
        if (!isPlayingRef.current) {
          onStartMetronome();
        }
        actualStartStopwatch();
      } else {
        setCountdownLeft(count);
      }
    }, 1000);
  }, [hapticFeedback, onStartMetronome, clearCountdownInterval, actualStartStopwatch]);

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
    clearCountdownInterval();
    if (isPlayingRef.current) {
      onStopRequested();
    }
    setElapsed(0);
    setCountdownLeft(0);
    elapsedAtPauseRef.current = 0;
    setState("idle");
  }, [hapticFeedback, clearTimerInterval, clearCountdownInterval, onStopRequested]);

  const actualStartTimer = useCallback(() => {
    const startRemaining = stateRef.current === "paused" ? remaining : timerDuration;
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
  }, [timerDuration, remaining, onTimerExpired]);

  const startTimer = useCallback(() => {
    hapticFeedback();
    setCountdownLeft(3);
    setState("countdown");
    setOpen(false);
    clearCountdownInterval();
    let count = 3;
    countdownIntervalRef.current = setInterval(() => {
      count--;
      if (count <= 0) {
        clearInterval(countdownIntervalRef.current!);
        countdownIntervalRef.current = null;
        setCountdownLeft(0);
        if (!isPlayingRef.current) {
          onStartMetronome();
        }
        actualStartTimer();
      } else {
        setCountdownLeft(count);
      }
    }, 1000);
  }, [hapticFeedback, onStartMetronome, clearCountdownInterval, actualStartTimer]);

  const pauseTimer = useCallback(() => {
    hapticFeedback();
    if (isPlayingRef.current) {
      setState("finishing");
      onStopRequested();
    } else {
      clearTimerInterval();
      elapsedAtPauseRef.current += Date.now() - startTimeRef.current;
      setState("paused");
    }
  }, [hapticFeedback, clearTimerInterval, onStopRequested]);

  const resetTimer = useCallback(() => {
    hapticFeedback();
    clearTimerInterval();
    clearCountdownInterval();
    if (isPlayingRef.current) {
      onStopRequested();
    }
    setRemaining(timerDuration);
    setCountdownLeft(0);
    elapsedAtPauseRef.current = 0;
    thermoHeight.value = 1;
    setState("idle");
  }, [hapticFeedback, clearTimerInterval, clearCountdownInterval, timerDuration, onStopRequested]);

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
    if (state === "countdown") {
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0.2, { duration: 300, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 300, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
    } else if (state === "running") {
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

  const switchMode = useCallback(
    (newMode: Mode) => {
      if (state !== "idle") return;
      hapticFeedback();
      setEditingTimer(false);
      setMode(newMode);
    },
    [state, hapticFeedback, mode]
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
    hapticFeedback();
    const mins = Math.floor(timerDuration / 60);
    const secs = timerDuration % 60;
    setTimerMinInput(String(mins));
    setTimerSecInput(String(secs));
    setEditingTimer(true);
  }, [state, timerDuration, hapticFeedback]);

  const commitTimerEdit = useCallback(() => {
    const mins = parseInt(timerMinInput, 10) || 0;
    const secs = parseInt(timerSecInput, 10) || 0;
    let totalSeconds = mins * 60 + secs;
    totalSeconds = Math.max(1, Math.min(totalSeconds, 5999));
    setTimerDuration(totalSeconds);
    setRemaining(totalSeconds);
    setEditingTimer(false);
  }, [timerMinInput, timerSecInput]);

  const cancelTimerEdit = useCallback(() => {
    setEditingTimer(false);
  }, []);

  const isActive = state !== "idle";

  const handleStatusIcon = () => {
    if (state === "countdown") return "timer-sand" as const;
    if (state === "running") return "radiobox-marked" as const;
    if (state === "finishing") return "radiobox-marked" as const;
    if (mode === "stopwatch") return "timer-outline" as const;
    return "av-timer" as const;
  };

  const handleStatusColor = () => {
    if (state === "countdown") return C.accent;
    if (state === "running") return Colors.success;
    if (state === "finishing") return Colors.danger;
    return Colors.textTertiary;
  };

  if (isLandscape) {
    const swTime = formatTime(elapsed);
    const timerDisplay = formatCountdown(remaining);
    return (
      <View style={[styles.landscapeContainer, { flexDirection: "column" as const, alignItems: "stretch" as const, overflow: "hidden" as const, gap: moderateScale(4, 0.3) }]}>
        <View style={{ flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "center" as const, gap: moderateScale(4, 0.3) }}>
          <Pressable
            onPress={() => switchMode("stopwatch")}
            style={[styles.landscapeTab, mode === "stopwatch" && { backgroundColor: C.accentDim }]}
          >
            <MaterialCommunityIcons name="timer-outline" size={12} color={mode === "stopwatch" ? C.accent : Colors.textTertiary} />
            <Text style={[styles.landscapeTabText, mode === "stopwatch" && { color: C.accent }]}>
              {t("stopwatchTimer", "stopwatch")}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => switchMode("timer")}
            style={[styles.landscapeTab, mode === "timer" && { backgroundColor: C.accentDim }]}
          >
            <MaterialCommunityIcons name="av-timer" size={12} color={mode === "timer" ? C.accent : Colors.textTertiary} />
            <Text style={[styles.landscapeTabText, mode === "timer" && { color: C.accent }]}>
              {t("stopwatchTimer", "timer")}
            </Text>
          </Pressable>
        </View>
        {mode === "timer" && state === "idle" && (
          <View style={[styles.landscapePresetRow, { justifyContent: "center" as const }]}>
            {TIMER_PRESETS.map((p) => (
              <Pressable
                key={p.seconds}
                onPress={() => adjustTimerDuration(p.seconds)}
                style={[styles.landscapePresetChip, timerDuration === p.seconds && { backgroundColor: C.accentDim, borderColor: C.accent }]}
              >
                <Text style={[styles.landscapePresetText, timerDuration === p.seconds && { color: C.accent }]}>
                  {p.label}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
        <View style={{ flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "center" as const, gap: moderateScale(6, 0.3) }}>
          {state === "countdown" ? (
            <Animated.Text style={[styles.landscapeTime, { color: C.accent }, runningDotStyle]} numberOfLines={1}>
              {countdownLeft}
            </Animated.Text>
          ) : mode === "stopwatch" ? (
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              {state === "running" && <Animated.View style={[{ width: moderateScale(5, 0.3), height: moderateScale(5, 0.3), borderRadius: 2.5, backgroundColor: Colors.success, marginRight: moderateScale(4, 0.3) }, runningDotStyle]} />}
              {state === "finishing" && <Animated.View style={[{ width: moderateScale(5, 0.3), height: moderateScale(5, 0.3), borderRadius: 2.5, backgroundColor: Colors.danger, marginRight: moderateScale(4, 0.3) }, finishingStyle]} />}
              <Text style={[styles.landscapeTime, { color: Colors.text }, state === "finishing" && { color: Colors.danger }]} numberOfLines={1}>{swTime.main}</Text>
            </View>
          ) : (
            <Pressable onPress={state === "idle" ? startEditingTimer : undefined} disabled={state !== "idle"}>
              <Text style={[styles.landscapeTime, { color: Colors.text }, state === "finishing" && { color: Colors.danger }]} numberOfLines={1}>
                {timerDisplay}
              </Text>
            </Pressable>
          )}
          {state === "idle" && (
            <Pressable
              onPress={mode === "stopwatch" ? startStopwatch : startTimer}
              style={[styles.landscapeBtn, { backgroundColor: C.accentDim, borderColor: C.accent, width: moderateScale(28, 0.4), height: moderateScale(20, 0.4), borderRadius: moderateScale(6, 0.3) }]}
            >
              <Ionicons name="play" size={moderateScale(10, 0.3)} color={C.accent} />
            </Pressable>
          )}
          {state === "running" && (
            <Pressable
              onPress={mode === "stopwatch" ? pauseStopwatch : pauseTimer}
              style={[styles.landscapeBtn, { backgroundColor: Colors.surfaceLight, borderColor: Colors.border, width: moderateScale(28, 0.4), height: moderateScale(20, 0.4), borderRadius: moderateScale(6, 0.3) }]}
            >
              <Ionicons name="pause" size={moderateScale(10, 0.3)} color={Colors.textSecondary} />
            </Pressable>
          )}
          {state === "finishing" && (
            <Pressable
              onPress={mode === "stopwatch" ? resetStopwatch : resetTimer}
              style={[styles.landscapeBtn, { backgroundColor: "#3a1a1a", borderColor: Colors.danger, width: moderateScale(28, 0.4), height: moderateScale(20, 0.4), borderRadius: moderateScale(6, 0.3) }]}
            >
              <Ionicons name="stop" size={moderateScale(10, 0.3)} color={Colors.danger} />
            </Pressable>
          )}
          {state === "paused" && (
            <>
              <Pressable
                onPress={mode === "stopwatch" ? startStopwatch : startTimer}
                style={[styles.landscapeBtn, { backgroundColor: C.accentDim, borderColor: C.accent, width: moderateScale(28, 0.4), height: moderateScale(20, 0.4), borderRadius: moderateScale(6, 0.3) }]}
              >
                <Ionicons name="play" size={moderateScale(10, 0.3)} color={C.accent} />
              </Pressable>
              <Pressable
                onPress={mode === "stopwatch" ? resetStopwatch : resetTimer}
                style={[styles.landscapeBtn, { backgroundColor: Colors.surfaceLight, borderColor: Colors.border, width: moderateScale(28, 0.4), height: moderateScale(20, 0.4), borderRadius: moderateScale(6, 0.3) }]}
              >
                <Ionicons name="refresh" size={moderateScale(10, 0.3)} color={Colors.textSecondary} />
              </Pressable>
            </>
          )}
          {state === "countdown" && (
            <Pressable
              onPress={mode === "stopwatch" ? resetStopwatch : resetTimer}
              style={[styles.landscapeBtn, { backgroundColor: Colors.surfaceLight, borderColor: Colors.border, width: moderateScale(28, 0.4), height: moderateScale(20, 0.4), borderRadius: moderateScale(6, 0.3) }]}
            >
              <Ionicons name="close" size={moderateScale(10, 0.3)} color={Colors.textSecondary} />
            </Pressable>
          )}
        </View>
      </View>
    );
  }

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
                  {t("stopwatchTimer", "stopwatch")}
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
                  {t("stopwatchTimer", "timer")}
                </Text>
              </Pressable>
            </View>

            <View style={styles.divider} />

            {mode === "stopwatch"
              ? renderStopwatchContent()
              : renderTimerContent()}
          </View>

          <Pressable
            onPress={togglePanel}
            style={({ pressed }) => [
              styles.handle,
              open && styles.handleOpen,
              open && { borderColor: "transparent" },
              pressed && styles.handlePressed,
            ]}
            testID="panel-toggle"
          >
            <Animated.View style={[styles.handleGlow, { backgroundColor: C.accent }, handleGlowStyle]} />
            <Animated.View style={[styles.handleFlash, handleFlashStyle]} />
            {!open && isActive && state === "countdown" ? (
              <View style={{ alignItems: "center", justifyContent: "center" }}>
                <Animated.Text style={[{ fontFamily: "SpaceGrotesk_700Bold", fontSize: moderateScale(16, 0.3), color: C.accent }, runningDotStyle]}>
                  {countdownLeft}
                </Animated.Text>
              </View>
            ) : !open && isActive && mode === "timer" && (state === "running" || state === "finishing") ? (
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
        {state === "countdown" && (
          <View style={{ alignItems: "center", gap: moderateScale(4, 0.3) }}>
            <Animated.Text style={[{ fontFamily: "SpaceGrotesk_700Bold", fontSize: moderateScale(36, 0.3), color: C.accent, letterSpacing: 2 }, runningDotStyle]}>
              {countdownLeft}
            </Animated.Text>
            <Text style={{ fontFamily: "SpaceGrotesk_400Regular", fontSize: moderateScale(10, 0.3), color: Colors.textTertiary, letterSpacing: 1 }}>준비 중...</Text>
          </View>
        )}
        {state !== "countdown" && (
          <>
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
              <Text style={styles.finishingLabel}>{t("stopwatchTimer", "completingMeasure")}</Text>
            )}
          </>
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
        {state === "idle" && !editingTimer && (
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
            <Pressable
              onPress={startEditingTimer}
              style={({ pressed }) => [
                styles.presetChip,
                editingTimer && styles.presetChipActive,
                editingTimer && { backgroundColor: C.accentDim, borderColor: C.accent },
                pressed && styles.buttonPressed,
              ]}
            >
              <Feather name="edit-2" size={11} color={editingTimer ? C.accent : Colors.textTertiary} />
            </Pressable>
          </View>
        )}

        {state === "idle" && editingTimer && (
          <View style={styles.timerEditRow}>
            <View style={styles.timerEditField}>
              <TextInput
                style={[styles.timerEditInput, { borderColor: C.accent }]}
                value={timerMinInput}
                onChangeText={(v) => setTimerMinInput(v.replace(/[^0-9]/g, "").slice(0, 2))}
                keyboardType="number-pad"
                maxLength={2}
                placeholder="0"
                placeholderTextColor={Colors.textTertiary}
                autoFocus
                selectTextOnFocus
                testID="timer-min-input"
              />
              <Text style={styles.timerEditUnit}>{t("stopwatchTimer", "min")}</Text>
            </View>
            <Text style={styles.timerEditColon}>:</Text>
            <View style={styles.timerEditField}>
              <TextInput
                style={[styles.timerEditInput, { borderColor: C.accent }]}
                value={timerSecInput}
                onChangeText={(v) => setTimerSecInput(v.replace(/[^0-9]/g, "").slice(0, 2))}
                keyboardType="number-pad"
                maxLength={2}
                placeholder="0"
                placeholderTextColor={Colors.textTertiary}
                selectTextOnFocus
                testID="timer-sec-input"
              />
              <Text style={styles.timerEditUnit}>{t("stopwatchTimer", "sec")}</Text>
            </View>
            <Pressable
              onPress={commitTimerEdit}
              style={({ pressed }) => [styles.timerEditConfirm, { backgroundColor: C.accent }, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="checkmark" size={16} color={Colors.background} />
            </Pressable>
            <Pressable
              onPress={cancelTimerEdit}
              style={({ pressed }) => [styles.timerEditCancel, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="close" size={14} color={Colors.textTertiary} />
            </Pressable>
          </View>
        )}

        {state === "countdown" && (
          <View style={{ alignItems: "center", gap: 4 }}>
            <Animated.Text style={[{ fontFamily: "SpaceGrotesk_700Bold", fontSize: 36, color: C.accent, letterSpacing: 2 }, runningDotStyle]}>
              {countdownLeft}
            </Animated.Text>
            <Text style={{ fontFamily: "SpaceGrotesk_400Regular", fontSize: 10, color: Colors.textTertiary, letterSpacing: 1 }}>준비 중...</Text>
          </View>
        )}

        {state !== "countdown" && (
          <View style={styles.timeRow}>
            {state === "finishing" && (
              <Animated.View style={[styles.finishingDot, finishingStyle]} />
            )}
            {state === "running" && (
              <Animated.View style={[styles.runningDot, runningDotStyle]} />
            )}
            <Animated.Text
              style={[
                styles.timeText,
                state === "finishing" && styles.finishingText,
                state === "finishing" ? finishingStyle : undefined,
              ]}
            >
              {display}
            </Animated.Text>
          </View>
        )}

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
          <Text style={styles.finishingLabel}>{t("stopwatchTimer", "completingMeasure")}</Text>
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

}

const styles = StyleSheet.create({
  landscapeContainer: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    alignSelf: "stretch" as const,
    backgroundColor: Colors.surface,
    borderRadius: moderateScale(10, 0.3),
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: moderateScale(8, 0.3),
    paddingVertical: moderateScale(4, 0.3),
    gap: moderateScale(6, 0.3),
  },
  landscapeTabRow: {
    flexDirection: "row" as const,
    gap: moderateScale(2, 0.3),
  },
  landscapeTab: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingHorizontal: moderateScale(6, 0.3),
    paddingVertical: moderateScale(4, 0.3),
    borderRadius: moderateScale(6, 0.3),
    gap: moderateScale(3, 0.3),
  },
  landscapeTabText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: moderateScale(10, 0.3),
    color: Colors.textTertiary,
  },
  landscapeDisplay: {
    flex: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  landscapeTime: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: moderateScale(16, 0.3),
    color: Colors.textPrimary,
    letterSpacing: 1,
  },
  landscapeFraction: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: moderateScale(11, 0.3),
    color: Colors.textTertiary,
  },
  landscapePresetRow: {
    flexDirection: "row" as const,
    gap: moderateScale(4, 0.3),
  },
  landscapePresetChip: {
    paddingHorizontal: moderateScale(6, 0.3),
    paddingVertical: moderateScale(2, 0.3),
    borderRadius: moderateScale(6, 0.3),
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceLight,
  },
  landscapePresetText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: moderateScale(9, 0.3),
    color: Colors.textTertiary,
  },
  landscapeBtnRow: {
    flexDirection: "row" as const,
    gap: moderateScale(6, 0.3),
  },
  landscapeBtn: {
    width: moderateScale(30, 0.4),
    height: moderateScale(30, 0.4),
    borderRadius: moderateScale(15, 0.4),
    borderWidth: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
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
    borderTopRightRadius: moderateScale(12, 0.3),
    borderBottomRightRadius: moderateScale(12, 0.3),
    borderWidth: 1,
    borderLeftWidth: 0,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
    gap: moderateScale(4, 0.3),
    overflow: "hidden",
    paddingVertical: moderateScale(6, 0.3),
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
    width: moderateScale(3, 0.3),
    height: moderateScale(10, 0.3),
    borderRadius: 1.5,
    backgroundColor: Colors.textTertiary,
    opacity: 0.4,
  },
  panel: {
    width: PANEL_WIDTH,
    backgroundColor: Colors.surface,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderBottomRightRadius: moderateScale(16, 0.3),
    borderRightColor: Colors.border,
    borderBottomColor: Colors.border,
    paddingHorizontal: moderateScale(14, 0.3),
    paddingTop: moderateScale(12, 0.3),
    paddingBottom: moderateScale(16, 0.3),
    gap: moderateScale(10, 0.3),
  },
  tabRow: {
    flexDirection: "row",
    gap: moderateScale(4, 0.3),
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: moderateScale(4, 0.3),
    paddingVertical: moderateScale(6, 0.3),
    borderRadius: moderateScale(8, 0.3),
  },
  tabActive: {
    backgroundColor: Colors.surfaceLight,
  },
  tabText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: moderateScale(8, 0.3),
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
    gap: moderateScale(10, 0.3),
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  timeText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: moderateScale(28, 0.3),
    color: Colors.text,
    letterSpacing: 2,
    fontVariant: ["tabular-nums"],
  },
  fractionText: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: moderateScale(16, 0.3),
    color: Colors.textSecondary,
    letterSpacing: 1,
    fontVariant: ["tabular-nums"],
  },
  finishingText: {
    color: Colors.danger,
  },
  runningDot: {
    width: moderateScale(5, 0.3),
    height: moderateScale(5, 0.3),
    borderRadius: 2.5,
    backgroundColor: Colors.success,
    marginRight: moderateScale(6, 0.3),
    marginBottom: 3,
  },
  finishingDot: {
    width: moderateScale(5, 0.3),
    height: moderateScale(5, 0.3),
    borderRadius: 2.5,
    backgroundColor: Colors.danger,
    marginRight: moderateScale(6, 0.3),
    marginBottom: 3,
  },
  controlRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: moderateScale(10, 0.3),
  },
  controlButton: {
    width: moderateScale(36, 0.4),
    height: moderateScale(36, 0.4),
    borderRadius: moderateScale(18, 0.4),
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
    gap: moderateScale(5, 0.3),
  },
  presetChip: {
    paddingHorizontal: moderateScale(8, 0.3),
    paddingVertical: moderateScale(4, 0.3),
    borderRadius: moderateScale(10, 0.3),
    borderWidth: 1,
    borderColor: Colors.border,
  },
  presetChipActive: {
    backgroundColor: Colors.accentDim,
    borderColor: Colors.accent,
  },
  presetText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: moderateScale(10, 0.3),
    color: Colors.textTertiary,
    letterSpacing: 1,
  },
  presetTextActive: {
    color: Colors.accent,
  },
  timerEditRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 6,
  },
  timerEditField: {
    alignItems: "center" as const,
    gap: 2,
  },
  timerEditInput: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: moderateScale(24, 0.3),
    color: Colors.text,
    textAlign: "center" as const,
    width: moderateScale(52, 0.3),
    borderBottomWidth: 2,
    paddingVertical: 2,
  },
  timerEditUnit: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: moderateScale(9, 0.3),
    color: Colors.textTertiary,
    letterSpacing: 1,
  },
  timerEditColon: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: moderateScale(24, 0.3),
    color: Colors.textTertiary,
    marginBottom: moderateScale(14, 0.3),
  },
  timerEditConfirm: {
    width: moderateScale(28, 0.4),
    height: moderateScale(28, 0.4),
    borderRadius: moderateScale(14, 0.4),
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginLeft: moderateScale(6, 0.3),
    marginBottom: moderateScale(14, 0.3),
  },
  timerEditCancel: {
    width: moderateScale(24, 0.4),
    height: moderateScale(24, 0.4),
    borderRadius: moderateScale(12, 0.4),
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginBottom: moderateScale(14, 0.3),
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
    fontSize: moderateScale(9, 0.3),
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
    width: moderateScale(6, 0.3),
    height: moderateScale(48, 0.3),
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
    width: moderateScale(14, 0.3),
    height: moderateScale(14, 0.3),
    borderRadius: moderateScale(7, 0.3),
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  thermoBulbInner: {
    width: moderateScale(8, 0.3),
    height: moderateScale(8, 0.3),
    borderRadius: moderateScale(4, 0.3),
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
});
