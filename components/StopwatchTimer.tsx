import React, { useState, useRef, useCallback, useEffect, useMemo, useImperativeHandle } from "react";
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
  AppState,
} from "react-native";
import {
  computeStopwatchElapsedMs,
  computeTimerRemaining,
  computeTimerThermoFraction,
  isTimerExpired,
} from "@/lib/timer-derivation";
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
import { Spacing } from "@/constants/tokens";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { moderateScale, useScale } from "@/lib/scale";
import type { ScaleValues } from "@/lib/scale";
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

export interface StopwatchTimerHandle {
  toggleOpen: () => void;
  openStopwatch: () => void;
  openTimer: () => void;
  handleDigit: (digit: string) => void;
  handleEnterKey: () => boolean;
  isTimerInputActive: () => boolean;
}

export const StopwatchTimer = React.forwardRef<StopwatchTimerHandle, StopwatchTimerProps>(
function StopwatchTimer({
  onTimerExpired,
  onStopRequested,
  onStartMetronome,
  isMetronomePlaying,
  currentBeat,
  topInset,
  isLandscape = false,
}: StopwatchTimerProps, ref) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("stopwatch");
  const [state, setState] = useState<TimerState>("idle");
  const [, setTick] = useState(0);
  const [timerDuration, setTimerDuration] = useState(180);
  const [editingTimer, setEditingTimer] = useState(false);
  const [timerMinInput, setTimerMinInput] = useState("");
  const [timerSecInput, setTimerSecInput] = useState("");
  const [timerDigitBuf, setTimerDigitBuf] = useState("");
  const commitTimerEditRef = useRef<(() => void) | null>(null);
  const [countdownLeft, setCountdownLeft] = useState(0);
  const [remaining, setRemaining] = useState(180);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);
  const elapsedAtPauseRef = useRef(0);
  const startRemainingRef = useRef(180);
  const countdownEndAtRef = useRef(0);
  const isPlayingRef = useRef(isMetronomePlaying);
  const stateRef = useRef<TimerState>(state);
  const modeRef = useRef<Mode>(mode);
  const timerMinInputRef = useRef("");
  const timerSecInputRef = useRef("");
  const startTimerRef = useRef<(() => void) | null>(null);
  const bumpTick = useCallback(() => setTick((t) => (t + 1) | 0), []);

  const { colors: C } = useTheme();
  const S = useScale();
  const styles = useMemo(() => make_styles(C, S), [C, S]);

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { timerMinInputRef.current = timerMinInput; }, [timerMinInput]);
  useEffect(() => { timerSecInputRef.current = timerSecInput; }, [timerSecInput]);

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
      const now = Date.now();
      const elapsedMs = Math.max(0, now - startTimeRef.current);
      elapsedAtPauseRef.current = elapsedMs;
      if (modeRef.current === "timer") {
        const elapsedSec = Math.floor(elapsedMs / 1000);
        setRemaining(Math.max(0, startRemainingRef.current - elapsedSec));
      }
      setState("paused");
    }
  }, [isMetronomePlaying]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active" && stateRef.current === "running") {
        bumpTick();
      }
    });
    return () => sub.remove();
  }, [bumpTick]);

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

  useImperativeHandle(ref, () => ({
    toggleOpen: () => {
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      setOpen((prev) => {
        openRef.current = !prev;
        return !prev;
      });
    },
    openStopwatch: () => {
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (openRef.current && modeRef.current === "stopwatch") {
        openRef.current = false;
        setOpen(false);
      } else {
        setMode("stopwatch");
        openRef.current = true;
        setOpen(true);
      }
    },
    openTimer: () => {
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (openRef.current && modeRef.current === "timer") {
        openRef.current = false;
        setOpen(false);
      } else {
        setMode("timer");
        openRef.current = true;
        setOpen(true);
      }
    },
    handleDigit: (digit: string) => {
      if (modeRef.current !== "timer" || !openRef.current) return;
      if (stateRef.current !== "idle" && stateRef.current !== "paused") return;
      setEditingTimer(true);
      setTimerDigitBuf((prev) => {
        const next = (prev + digit).slice(-4);
        const mm = next.slice(0, -2).padStart(1, "0");
        const ss = next.slice(-2);
        setTimerMinInput(mm || "0");
        setTimerSecInput(ss);
        return next;
      });
    },
    handleEnterKey: () => {
      if (modeRef.current !== "timer" || !openRef.current) return false;
      if (stateRef.current === "idle") {
        const mins = parseInt(timerMinInputRef.current || "0", 10) || 0;
        const secs = parseInt(timerSecInputRef.current || "0", 10) || 0;
        const totalSeconds = mins * 60 + secs;
        if (totalSeconds <= 0) return false;
        setTimerDigitBuf("");
        setTimerMinInput(String(mins).padStart(2, "0"));
        setTimerSecInput(String(secs).padStart(2, "0"));
        setTimerDuration(totalSeconds);
        setRemaining(totalSeconds);
        setEditingTimer(false);
        startTimerRef.current?.();
        return true;
      }
      if (stateRef.current === "paused") {
        setTimerDigitBuf("");
        commitTimerEditRef.current?.();
        startTimerRef.current?.();
        return true;
      }
      return false;
    },
    isTimerInputActive: () => {
      return openRef.current && modeRef.current === "timer" &&
        (stateRef.current === "idle" || stateRef.current === "paused");
    },
  }), []);

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
      bumpTick();
    }, 33);
  }, [bumpTick]);

  const runCountdown = useCallback(
    (onComplete: () => void) => {
      clearCountdownInterval();
      countdownEndAtRef.current = Date.now() + 3000;
      setCountdownLeft(3);
      countdownIntervalRef.current = setInterval(() => {
        const remainingMs = countdownEndAtRef.current - Date.now();
        if (remainingMs <= 0) {
          clearInterval(countdownIntervalRef.current!);
          countdownIntervalRef.current = null;
          setCountdownLeft(0);
          if (!isPlayingRef.current) {
            onStartMetronome();
          }
          onComplete();
        } else {
          const left = Math.max(1, Math.ceil(remainingMs / 1000));
          setCountdownLeft(left);
        }
      }, 100);
    },
    [clearCountdownInterval, onStartMetronome]
  );

  const startStopwatch = useCallback(() => {
    hapticFeedback();
    setState("countdown");
    setOpen(false);
    runCountdown(actualStartStopwatch);
  }, [hapticFeedback, runCountdown, actualStartStopwatch]);

  const pauseStopwatch = useCallback(() => {
    hapticFeedback();
    clearTimerInterval();
    elapsedAtPauseRef.current = Date.now() - startTimeRef.current;
    if (isPlayingRef.current) {
      setState("finishing");
      onStopRequested();
    } else {
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
    setCountdownLeft(0);
    elapsedAtPauseRef.current = 0;
    startTimeRef.current = 0;
    setState("idle");
  }, [hapticFeedback, clearTimerInterval, clearCountdownInterval, onStopRequested]);

  const actualStartTimer = useCallback(() => {
    const startRemaining = stateRef.current === "paused" ? remaining : timerDuration;
    startRemainingRef.current = startRemaining;
    setRemaining(startRemaining);
    startTimeRef.current = Date.now();
    elapsedAtPauseRef.current = 0;
    setState("running");
    thermoBreakOpacity.value = 0;
    thermoBreakTop.value = 0;
    thermoBreakBottom.value = 0;
    thermoHeight.value = timerDuration > 0 ? startRemaining / timerDuration : 0;
    intervalRef.current = setInterval(() => {
      const now = Date.now();
      const expired = isTimerExpired(startTimeRef.current, startRemainingRef.current, now);
      const fraction = computeTimerThermoFraction(
        "running",
        startTimeRef.current,
        startRemainingRef.current,
        timerDuration,
        now
      );
      thermoHeight.value = fraction;
      bumpTick();
      if (expired) {
        clearInterval(intervalRef.current!);
        intervalRef.current = null;
        thermoHeight.value = withTiming(0, { duration: 300 });
        setRemaining(0);
        setState("finishing");
        if (isPlayingRef.current) {
          onTimerExpired();
        }
      }
    }, 50);
  }, [timerDuration, remaining, onTimerExpired, bumpTick]);

  const startTimer = useCallback(() => {
    hapticFeedback();
    setState("countdown");
    setOpen(false);
    runCountdown(actualStartTimer);
  }, [hapticFeedback, runCountdown, actualStartTimer]);

  const pauseTimer = useCallback(() => {
    hapticFeedback();
    clearTimerInterval();
    const now = Date.now();
    const elapsedMs = Math.max(0, now - startTimeRef.current);
    elapsedAtPauseRef.current = elapsedMs;
    const pausedSec = Math.max(
      0,
      startRemainingRef.current - Math.floor(elapsedMs / 1000)
    );
    setRemaining(pausedSec);
    if (isPlayingRef.current) {
      setState("finishing");
      onStopRequested();
    } else {
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
    startTimeRef.current = 0;
    startRemainingRef.current = timerDuration;
    thermoHeight.value = 1;
    setState("idle");
  }, [hapticFeedback, clearTimerInterval, clearCountdownInterval, timerDuration, onStopRequested]);

  useEffect(() => {
    if (state === "finishing" && !isMetronomePlaying) {
      const animDuration = 1200;
      const timeout = setTimeout(() => {
        if (mode === "stopwatch") {
          clearTimerInterval();
          elapsedAtPauseRef.current = Math.max(0, Date.now() - startTimeRef.current);
          setState("paused");
        } else {
          clearTimerInterval();
          thermoHeight.value = 1;
          thermoBreakOpacity.value = 0;
          thermoBreakTop.value = 0;
          thermoBreakBottom.value = 0;
          startRemainingRef.current = timerDuration;
          setRemaining(timerDuration);
          setState("idle");
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
    setTimerDigitBuf("");
    setEditingTimer(false);
  }, []);

  useEffect(() => {
    commitTimerEditRef.current = commitTimerEdit;
  }, [commitTimerEdit]);

  useEffect(() => {
    startTimerRef.current = startTimer;
  }, [startTimer]);

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
    if (state === "running") return C.success;
    if (state === "finishing") return C.danger;
    return C.textTertiary;
  };

  if (isLandscape) {
    const now = Date.now();
    const elapsedDisplay = computeStopwatchElapsedMs(
      state,
      startTimeRef.current,
      elapsedAtPauseRef.current,
      now
    );
    const remainingDisplay = computeTimerRemaining(
      state,
      startTimeRef.current,
      startRemainingRef.current,
      remaining,
      timerDuration,
      now
    );
    const swTime = formatTime(elapsedDisplay);
    const timerDisplay = formatCountdown(remainingDisplay.sec);
    return (
      <View style={[styles.landscapeContainer, { flexDirection: "column" as const, alignItems: "stretch" as const, overflow: "hidden" as const, gap: S.ms(4, 0.3) }]}>
        <View style={{ flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "center" as const, gap: S.ms(4, 0.3) }}>
          <Pressable
            onPress={() => switchMode("stopwatch")}
            style={[styles.landscapeTab, mode === "stopwatch" && { backgroundColor: C.accentDim }]}
          >
            <MaterialCommunityIcons name="timer-outline" size={S.ms(12, 0.4)} color={mode === "stopwatch" ? C.accent : C.textTertiary} />
            <Text style={[styles.landscapeTabText, mode === "stopwatch" && { color: C.accent }]}>
              {t("stopwatchTimer", "stopwatch")}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => switchMode("timer")}
            style={[styles.landscapeTab, mode === "timer" && { backgroundColor: C.accentDim }]}
          >
            <MaterialCommunityIcons name="av-timer" size={S.ms(12, 0.4)} color={mode === "timer" ? C.accent : C.textTertiary} />
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
        <View style={{ flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "center" as const, gap: S.ms(6, 0.3) }}>
          {state === "countdown" ? (
            <Animated.Text style={[styles.landscapeTime, { color: C.accent }, runningDotStyle]} numberOfLines={1}>
              {countdownLeft}
            </Animated.Text>
          ) : mode === "stopwatch" ? (
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              {state === "running" && <Animated.View style={[{ width: S.ms(5, 0.3), height: S.ms(5, 0.3), borderRadius: 2.5, backgroundColor: C.success, marginRight: S.ms(4, 0.3) }, runningDotStyle]} />}
              {state === "finishing" && <Animated.View style={[{ width: S.ms(5, 0.3), height: S.ms(5, 0.3), borderRadius: 2.5, backgroundColor: C.danger, marginRight: S.ms(4, 0.3) }, finishingStyle]} />}
              <Text style={[styles.landscapeTime, { color: C.text }, state === "finishing" && { color: C.danger }]} numberOfLines={1}>{swTime.main}</Text>
            </View>
          ) : (
            <Pressable onPress={state === "idle" ? startEditingTimer : undefined} disabled={state !== "idle"}>
              <Text style={[styles.landscapeTime, { color: C.text }, state === "finishing" && { color: C.danger }]} numberOfLines={1}>
                {timerDisplay}
              </Text>
            </Pressable>
          )}
          {state === "idle" && (
            <Pressable
              onPress={mode === "stopwatch" ? startStopwatch : startTimer}
              style={[styles.landscapeBtn, { backgroundColor: C.accentDim, borderColor: C.accent, width: S.ms(28, 0.4), height: S.ms(20, 0.4), borderRadius: S.ms(6, 0.3) }]}
            >
              <Ionicons name="play" size={S.ms(10, 0.3)} color={C.accent} />
            </Pressable>
          )}
          {state === "running" && (
            <Pressable
              onPress={mode === "stopwatch" ? pauseStopwatch : pauseTimer}
              style={[styles.landscapeBtn, { backgroundColor: C.surfaceLight, borderColor: C.border, width: S.ms(28, 0.4), height: S.ms(20, 0.4), borderRadius: S.ms(6, 0.3) }]}
            >
              <Ionicons name="pause" size={S.ms(10, 0.3)} color={C.textSecondary} />
            </Pressable>
          )}
          {state === "finishing" && (
            <Pressable
              onPress={mode === "stopwatch" ? resetStopwatch : resetTimer}
              style={[styles.landscapeBtn, { backgroundColor: "#3a1a1a", borderColor: C.danger, width: S.ms(28, 0.4), height: S.ms(20, 0.4), borderRadius: S.ms(6, 0.3) }]}
            >
              <Ionicons name="stop" size={S.ms(10, 0.3)} color={C.danger} />
            </Pressable>
          )}
          {state === "paused" && (
            <>
              <Pressable
                onPress={mode === "stopwatch" ? startStopwatch : startTimer}
                style={[styles.landscapeBtn, { backgroundColor: C.accentDim, borderColor: C.accent, width: S.ms(28, 0.4), height: S.ms(20, 0.4), borderRadius: S.ms(6, 0.3) }]}
              >
                <Ionicons name="play" size={S.ms(10, 0.3)} color={C.accent} />
              </Pressable>
              <Pressable
                onPress={mode === "stopwatch" ? resetStopwatch : resetTimer}
                style={[styles.landscapeBtn, { backgroundColor: C.surfaceLight, borderColor: C.border, width: S.ms(28, 0.4), height: S.ms(20, 0.4), borderRadius: S.ms(6, 0.3) }]}
              >
                <Ionicons name="refresh" size={S.ms(10, 0.3)} color={C.textSecondary} />
              </Pressable>
            </>
          )}
          {state === "countdown" && (
            <Pressable
              onPress={mode === "stopwatch" ? resetStopwatch : resetTimer}
              style={[styles.landscapeBtn, { backgroundColor: C.surfaceLight, borderColor: C.border, width: S.ms(28, 0.4), height: S.ms(20, 0.4), borderRadius: S.ms(6, 0.3) }]}
            >
              <Ionicons name="close" size={S.ms(10, 0.3)} color={C.textSecondary} />
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
          <View style={[styles.panel, { backgroundColor: C.surface, borderColor: C.border }]}>
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
                  color={mode === "stopwatch" ? C.accent : C.textTertiary}
                />
                <Text style={[styles.tabText, { color: C.textTertiary }, mode === "stopwatch" && styles.tabTextActive, mode === "stopwatch" && { color: C.accent }]}>
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
                  color={mode === "timer" ? C.accent : C.textTertiary}
                />
                <Text style={[styles.tabText, { color: C.textTertiary }, mode === "timer" && styles.tabTextActive, mode === "timer" && { color: C.accent }]}>
                  {t("stopwatchTimer", "timer")}
                </Text>
              </Pressable>
            </View>

            <View style={[styles.divider, { backgroundColor: C.border }]} />

            {mode === "stopwatch"
              ? renderStopwatchContent()
              : renderTimerContent()}
          </View>

          <Pressable
            onPress={togglePanel}
            style={({ pressed }) => [
              styles.handle,
              { backgroundColor: C.surface, borderColor: C.border },
              open && styles.handleOpen,
              open && { backgroundColor: C.surfaceLight, borderColor: "transparent" },
              pressed && styles.handlePressed,
            ]}
            testID="panel-toggle"
          >
            <Animated.View style={[styles.handleGlow, { backgroundColor: C.accent }, handleGlowStyle]} />
            <Animated.View style={[styles.handleFlash, handleFlashStyle]} />
            {!open && isActive && state === "countdown" ? (
              <View style={{ alignItems: "center", justifyContent: "center" }}>
                <Animated.Text style={[{ fontFamily: "SpaceGrotesk_700Bold", fontSize: S.ms(16, 0.3), color: C.accent }, runningDotStyle]}>
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
                        { backgroundColor: C.danger },
                        thermoBreakTopStyle,
                      ]}
                    />
                    <Animated.View
                      style={[
                        styles.thermoBreakShard,
                        { backgroundColor: C.danger, top: 26 },
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
                        backgroundColor: state === "finishing" ? C.danger : C.accent,
                      },
                      thermoFillStyle,
                    ]}
                  />
                </View>
                <View
                  style={[
                    styles.thermoBulb,
                    {
                      backgroundColor: state === "finishing" ? C.danger : C.accent,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.thermoBulbInner,
                      {
                        backgroundColor: state === "finishing" ? C.danger : C.accent,
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
    const elapsedDisplay = computeStopwatchElapsedMs(
      state,
      startTimeRef.current,
      elapsedAtPauseRef.current,
      Date.now()
    );
    const { main, fraction } = formatTime(elapsedDisplay);
    return (
      <View style={styles.displaySection}>
        {state === "countdown" && (
          <View style={{ alignItems: "center", gap: S.ms(4, 0.3) }}>
            <Animated.Text style={[{ fontFamily: "SpaceGrotesk_700Bold", fontSize: S.ms(36, 0.3), color: C.accent, letterSpacing: 2 }, runningDotStyle]}>
              {countdownLeft}
            </Animated.Text>
            <Text style={{ fontFamily: "SpaceGrotesk_400Regular", fontSize: S.ms(10, 0.3), color: C.textTertiary, letterSpacing: 1 }}>준비 중...</Text>
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
              <Text style={[styles.timeText, { color: C.text }, state === "finishing" && styles.finishingText]}>{main}</Text>
              <Text style={[styles.fractionText, { color: C.textTertiary }, state === "finishing" && { color: C.danger }]}>{fraction}</Text>
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
              <Ionicons name="play" size={S.ms(16, 0.4)} color={C.background} />
            </Pressable>
          )}
          {state === "running" && (
            <Pressable
              onPress={pauseStopwatch}
              style={({ pressed }) => [styles.controlButton, styles.pauseButton, pressed && styles.buttonPressed]}
              testID="stopwatch-pause"
            >
              <Ionicons name="pause" size={S.ms(16, 0.4)} color={C.text} />
            </Pressable>
          )}
          {state === "paused" && (
            <>
              <Pressable
                onPress={resetStopwatch}
                style={({ pressed }) => [styles.controlButton, styles.resetButton, pressed && styles.buttonPressed]}
                testID="stopwatch-reset"
              >
                <Feather name="rotate-ccw" size={S.ms(14, 0.4)} color={C.danger} />
              </Pressable>
              <Pressable
                onPress={startStopwatch}
                style={({ pressed }) => [styles.controlButton, styles.startButton, { backgroundColor: C.accent }, pressed && styles.buttonPressed]}
                testID="stopwatch-resume"
              >
                <Ionicons name="play" size={S.ms(16, 0.4)} color={C.background} />
              </Pressable>
            </>
          )}
        </View>
      </View>
    );
  }

  function renderTimerContent() {
    const remainingDisplay = computeTimerRemaining(
      state,
      startTimeRef.current,
      startRemainingRef.current,
      remaining,
      timerDuration,
      Date.now()
    );
    const display = formatCountdown(remainingDisplay.sec);
    const progress = timerDuration > 0 ? remainingDisplay.smooth / timerDuration : 1;
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
              <Feather name="edit-2" size={S.ms(11, 0.4)} color={editingTimer ? C.accent : C.textTertiary} />
            </Pressable>
          </View>
        )}

        {state === "idle" && editingTimer && (
          <View style={styles.timerEditRow} dataSet={{ capturesKeys: "true" }}>
            <View style={styles.timerEditField}>
              <TextInput
                style={[styles.timerEditInput, { borderColor: C.accent }]}
                value={timerMinInput}
                onChangeText={(v) => setTimerMinInput(v.replace(/[^0-9]/g, "").slice(0, 2))}
                keyboardType="number-pad"
                maxLength={2}
                placeholder="0"
                placeholderTextColor={C.textTertiary}
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
                placeholderTextColor={C.textTertiary}
                selectTextOnFocus
                testID="timer-sec-input"
              />
              <Text style={styles.timerEditUnit}>{t("stopwatchTimer", "sec")}</Text>
            </View>
            <Pressable
              onPress={commitTimerEdit}
              style={({ pressed }) => [styles.timerEditConfirm, { backgroundColor: C.accent }, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="checkmark" size={S.ms(16, 0.4)} color={C.background} />
            </Pressable>
            <Pressable
              onPress={cancelTimerEdit}
              style={({ pressed }) => [styles.timerEditCancel, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="close" size={S.ms(14, 0.4)} color={C.textTertiary} />
            </Pressable>
          </View>
        )}

        {state === "countdown" && (
          <View style={{ alignItems: "center", gap: Spacing.xs }}>
            <Animated.Text style={[{ fontFamily: "SpaceGrotesk_700Bold", fontSize: S.ms(36, 0.4), color: C.accent, letterSpacing: 2 }, runningDotStyle]}>
              {countdownLeft}
            </Animated.Text>
            <Text style={{ fontFamily: "SpaceGrotesk_400Regular", fontSize: S.ms(10, 0.3), color: C.textTertiary, letterSpacing: 1 }}>준비 중...</Text>
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
                { color: C.text },
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
                  backgroundColor: state === "finishing" ? C.danger : C.accent,
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
              <Ionicons name="play" size={S.ms(16, 0.4)} color={C.background} />
            </Pressable>
          )}
          {state === "running" && (
            <Pressable
              onPress={pauseTimer}
              style={({ pressed }) => [styles.controlButton, styles.pauseButton, pressed && styles.buttonPressed]}
              testID="timer-pause"
            >
              <Ionicons name="pause" size={S.ms(16, 0.4)} color={C.text} />
            </Pressable>
          )}
          {state === "paused" && (
            <>
              <Pressable
                onPress={resetTimer}
                style={({ pressed }) => [styles.controlButton, styles.resetButton, pressed && styles.buttonPressed]}
                testID="timer-reset"
              >
                <Feather name="rotate-ccw" size={S.ms(14, 0.4)} color={C.danger} />
              </Pressable>
              <Pressable
                onPress={startTimer}
                style={({ pressed }) => [styles.controlButton, styles.startButton, { backgroundColor: C.accent }, pressed && styles.buttonPressed]}
                testID="timer-resume"
              >
                <Ionicons name="play" size={S.ms(16, 0.4)} color={C.background} />
              </Pressable>
            </>
          )}
        </View>
      </View>
    );
  }

});

const make_styles = (C: typeof Colors, S: ScaleValues) => StyleSheet.create({
  landscapeContainer: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    alignSelf: "stretch" as const,
    backgroundColor: C.surface,
    borderRadius: S.ms(10, 0.3),
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: S.ms(8, 0.3),
    paddingVertical: S.ms(4, 0.3),
    gap: S.ms(6, 0.3),
  },
  landscapeTabRow: {
    flexDirection: "row" as const,
    gap: S.ms(2, 0.3),
  },
  landscapeTab: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingHorizontal: S.ms(6, 0.3),
    paddingVertical: S.ms(4, 0.3),
    borderRadius: S.ms(6, 0.3),
    gap: S.ms(3, 0.3),
  },
  landscapeTabText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: S.ms(10, 0.3),
    color: C.textTertiary,
  },
  landscapeDisplay: {
    flex: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  landscapeTime: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: S.ms(16, 0.3),
    color: C.textPrimary,
    letterSpacing: 1,
  },
  landscapeFraction: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: S.ms(11, 0.3),
    color: C.textTertiary,
  },
  landscapePresetRow: {
    flexDirection: "row" as const,
    gap: S.ms(4, 0.3),
  },
  landscapePresetChip: {
    paddingHorizontal: S.ms(6, 0.3),
    paddingVertical: S.ms(2, 0.3),
    borderRadius: S.ms(6, 0.3),
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surfaceLight,
  },
  landscapePresetText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: S.ms(9, 0.3),
    color: C.textTertiary,
  },
  landscapeBtnRow: {
    flexDirection: "row" as const,
    gap: S.ms(6, 0.3),
  },
  landscapeBtn: {
    width: S.ms(30, 0.4),
    height: S.ms(30, 0.4),
    borderRadius: S.ms(15, 0.4),
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
    backgroundColor: C.surface,
    borderTopRightRadius: S.ms(12, 0.3),
    borderBottomRightRadius: S.ms(12, 0.3),
    borderWidth: 1,
    borderLeftWidth: 0,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
    gap: S.ms(4, 0.3),
    overflow: "hidden",
    paddingVertical: S.ms(6, 0.3),
  },
  handleOpen: {
    backgroundColor: C.surfaceLight,
    borderColor: C.accent,
  },
  handlePressed: {
    backgroundColor: C.surfaceLight,
  },
  handleGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: C.accent,
  },
  handleLine: {
    width: S.ms(3, 0.3),
    height: S.ms(10, 0.3),
    borderRadius: 1.5,
    backgroundColor: C.textTertiary,
    opacity: 0.4,
  },
  panel: {
    width: PANEL_WIDTH,
    backgroundColor: C.surface,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderBottomRightRadius: S.ms(16, 0.3),
    borderRightColor: C.border,
    borderBottomColor: C.border,
    paddingHorizontal: S.ms(14, 0.3),
    paddingTop: S.ms(12, 0.3),
    paddingBottom: S.ms(16, 0.3),
    gap: S.ms(10, 0.3),
  },
  tabRow: {
    flexDirection: "row",
    gap: S.ms(4, 0.3),
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: S.ms(4, 0.3),
    paddingVertical: S.ms(6, 0.3),
    borderRadius: S.ms(8, 0.3),
  },
  tabActive: {
    backgroundColor: C.surfaceLight,
  },
  tabText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: S.ms(8, 0.3),
    color: C.textTertiary,
    letterSpacing: 1.5,
  },
  tabTextActive: {
    color: C.accent,
  },
  divider: {
    height: 1,
    backgroundColor: C.border,
    opacity: 0.5,
  },
  displaySection: {
    alignItems: "center",
    gap: S.ms(10, 0.3),
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  timeText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: S.ms(28, 0.3),
    color: C.text,
    letterSpacing: 2,
    fontVariant: ["tabular-nums"],
  },
  fractionText: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: S.ms(16, 0.3),
    color: C.textSecondary,
    letterSpacing: 1,
    fontVariant: ["tabular-nums"],
  },
  finishingText: {
    color: C.danger,
  },
  runningDot: {
    width: S.ms(5, 0.3),
    height: S.ms(5, 0.3),
    borderRadius: 2.5,
    backgroundColor: C.success,
    marginRight: S.ms(6, 0.3),
    marginBottom: 3,
  },
  finishingDot: {
    width: S.ms(5, 0.3),
    height: S.ms(5, 0.3),
    borderRadius: 2.5,
    backgroundColor: C.danger,
    marginRight: S.ms(6, 0.3),
    marginBottom: 3,
  },
  controlRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.ms(10, 0.3),
  },
  controlButton: {
    width: S.ms(40, 0.5),
    height: S.ms(40, 0.5),
    borderRadius: S.ms(20, 0.5),
    alignItems: "center",
    justifyContent: "center",
  },
  startButton: {
    backgroundColor: C.accent,
  },
  pauseButton: {
    backgroundColor: C.surfaceLight,
    borderWidth: 1,
    borderColor: C.border,
  },
  resetButton: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: C.border,
  },
  buttonPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.95 }],
  },
  presetRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: S.ms(5, 0.3),
  },
  presetChip: {
    paddingHorizontal: S.ms(10, 0.4),
    paddingVertical: S.ms(5, 0.4),
    borderRadius: S.ms(10, 0.3),
    borderWidth: 1,
    borderColor: C.border,
  },
  presetChipActive: {
    backgroundColor: C.accentDim,
    borderColor: C.accent,
  },
  presetText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: S.ms(10, 0.3),
    color: C.textTertiary,
    letterSpacing: 1,
  },
  presetTextActive: {
    color: C.accent,
  },
  timerEditRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 6,
  },
  timerEditField: {
    alignItems: "center" as const,
    gap: Spacing.xxs,
  },
  timerEditInput: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: S.ms(24, 0.3),
    color: C.text,
    textAlign: "center" as const,
    width: S.ms(52, 0.3),
    borderBottomWidth: 2,
    paddingVertical: Spacing.xxs,
  },
  timerEditUnit: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: S.ms(9, 0.3),
    color: C.textTertiary,
    letterSpacing: 1,
  },
  timerEditColon: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: S.ms(24, 0.3),
    color: C.textTertiary,
    marginBottom: S.ms(14, 0.3),
  },
  timerEditConfirm: {
    width: S.ms(28, 0.4),
    height: S.ms(28, 0.4),
    borderRadius: S.ms(14, 0.4),
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginLeft: S.ms(6, 0.3),
    marginBottom: S.ms(14, 0.3),
  },
  timerEditCancel: {
    width: S.ms(24, 0.4),
    height: S.ms(24, 0.4),
    borderRadius: S.ms(12, 0.4),
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginBottom: S.ms(14, 0.3),
  },
  progressBarContainer: {
    width: "80%",
    height: 3,
    borderRadius: 1.5,
    backgroundColor: C.surfaceLight,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 1.5,
  },
  finishingLabel: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: S.ms(9, 0.3),
    color: C.danger,
    letterSpacing: 1,
    opacity: 0.8,
  },
  handleFlash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: C.danger,
    borderRadius: 12,
    zIndex: 10,
  },
  thermometer: {
    alignItems: "center",
  },
  thermoTube: {
    width: S.ms(6, 0.3),
    height: S.ms(48, 0.3),
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    overflow: "hidden",
    justifyContent: "flex-end",
    marginBottom: -4,
    zIndex: 0,
  },
  thermoTrack: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: C.surfaceLight,
    borderRadius: 3,
  },
  thermoFill: {
    width: "100%",
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    zIndex: 1,
  },
  thermoBulb: {
    width: S.ms(14, 0.3),
    height: S.ms(14, 0.3),
    borderRadius: S.ms(7, 0.3),
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  thermoBulbInner: {
    width: S.ms(8, 0.3),
    height: S.ms(8, 0.3),
    borderRadius: S.ms(4, 0.3),
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
