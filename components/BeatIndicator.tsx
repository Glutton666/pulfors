import React, { useRef, useEffect, useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  PanResponder,
  Pressable,
  ScrollView,
  Modal,
  TextInput,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  withTiming,
  withSequence,
  withSpring,
  useSharedValue,
  Easing,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import Colors from "@/constants/colors";
import { useTheme } from "@/contexts/ThemeContext";
import { moderateScale, SCREEN_WIDTH } from "@/lib/scale";

export type BeatType = "strong" | "accent" | "normal" | "mute";

const DIAL_SIZE = Math.min(SCREEN_WIDTH - 48, moderateScale(300));
const DIAL_RADIUS = DIAL_SIZE / 2;
const DOT_RADIUS_FROM_CENTER = DIAL_RADIUS - moderateScale(30, 0.4);
const DOT_SIZE = moderateScale(34, 0.4);
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.35;
const MIN_BEATS = 1;
const MAX_BEATS = 32;

export { DIAL_SIZE, DIAL_RADIUS, DOT_RADIUS_FROM_CENTER };

interface DialBeatDotProps {
  index: number;
  total: number;
  isActive: boolean;
  beatType: BeatType;
  onPress: () => void;
  isDropTarget: boolean;
  subdivisionCount: number;
}

function DialBeatDot({
  index,
  total,
  isActive,
  beatType,
  onPress,
  isDropTarget,
  subdivisionCount,
}: DialBeatDotProps) {
  const { colors: C } = useTheme();
  const isStrong = beatType === "strong";
  const isAccent = beatType === "accent" || isStrong;
  const isMute = beatType === "mute";
  const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
  const size = DOT_SIZE;
  const x = DIAL_RADIUS + DOT_RADIUS_FROM_CENTER * Math.cos(angle) - size / 2;
  const y = DIAL_RADIUS + DOT_RADIUS_FROM_CENTER * Math.sin(angle) - size / 2;

  const popScale = useSharedValue(1);
  const beatScale = useSharedValue(1);
  const beatBg = useSharedValue(
    isMute ? "transparent" : isAccent ? C.accentMuted : Colors.textTertiary
  );
  const beatBorder = useSharedValue(
    isMute ? Colors.textSecondary : "transparent"
  );
  const beatShadow = useSharedValue(0);

  const handlePress = useCallback(() => {
    popScale.value = withSequence(
      withTiming(0.85, { duration: 40, easing: Easing.out(Easing.quad) }),
      withTiming(1, { duration: 100, easing: Easing.out(Easing.quad) })
    );
    onPress();
  }, [onPress]);

  useEffect(() => {
    if (isMute) {
      if (isActive) {
        beatScale.value = withSequence(
          withTiming(1.15, { duration: 50, easing: Easing.out(Easing.quad) }),
          withTiming(1, { duration: 200, easing: Easing.out(Easing.quad) })
        );
        beatBg.value = withTiming("rgba(72, 79, 88, 0.35)", { duration: 50 });
        beatBorder.value = withTiming(Colors.textSecondary, { duration: 50 });
        beatShadow.value = withSequence(
          withTiming(0.3, { duration: 50 }),
          withTiming(0, { duration: 300 })
        );
      } else {
        beatScale.value = withTiming(1, { duration: 150 });
        beatBg.value = withTiming("transparent", { duration: 150 });
        beatBorder.value = withTiming(Colors.textSecondary, { duration: 150 });
        beatShadow.value = withTiming(0, { duration: 150 });
      }
    } else if (isActive) {
      beatScale.value = withSequence(
        withTiming(isStrong ? 1.35 : 1.2, { duration: 50, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: 200, easing: Easing.out(Easing.quad) })
      );
      beatBg.value = withTiming(
        isAccent ? C.accent : Colors.text,
        { duration: 50 }
      );
      beatBorder.value = withTiming(isStrong ? C.accent : "transparent", { duration: 50 });
      beatShadow.value = withSequence(
        withTiming(isStrong ? 1.5 : 1, { duration: 50 }),
        withTiming(0, { duration: 300 })
      );
    } else {
      beatScale.value = withTiming(1, { duration: 150 });
      beatBg.value = withTiming(
        isStrong ? C.accent : isAccent ? C.accentMuted : Colors.textTertiary,
        { duration: 150 }
      );
      beatBorder.value = withTiming(isStrong ? C.accent : "transparent", { duration: 150 });
      beatShadow.value = withTiming(0, { duration: 150 });
    }
  }, [isActive, beatType, C.accent, C.accentMuted]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: beatScale.value * popScale.value }],
    backgroundColor: beatBg.value,
    borderColor: beatBorder.value,
    shadowOpacity: beatShadow.value,
  }));

  return (
    <Pressable
      onPress={handlePress}
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: size,
        height: size,
        zIndex: 10,
      }}
      hitSlop={10}
      pressRetentionOffset={{ top: 20, left: 20, right: 20, bottom: 20 }}
    >
      {isStrong ? (
        <Animated.View
          style={[
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              overflow: "hidden",
              opacity: isActive ? 1 : 0.65,
            },
            animatedStyle,
            {
              shadowColor: C.accent,
              shadowOffset: { width: 0, height: 0 },
              shadowRadius: isActive ? 16 : 0,
            },
          ]}
        >
          <LinearGradient
            colors={[Colors.white, C.accent, C.accentMuted]}
            locations={[0, 0.35, 1]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={{ width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center" }}
          >
            <View style={{ width: size - 14, height: size - 14, borderRadius: (size - 14) / 2, backgroundColor: C.accentMuted }} />
          </LinearGradient>
        </Animated.View>
      ) : (
        <Animated.View
          style={[
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: isMute
                ? "transparent"
                : isAccent
                ? C.accentMuted
                : Colors.textTertiary,
              borderWidth: isMute ? 2.5 : 0,
              borderColor: isMute ? Colors.textSecondary : "transparent",
            },
            animatedStyle,
            {
              shadowColor: isAccent ? C.accent : Colors.text,
              shadowOffset: { width: 0, height: 0 },
              shadowRadius: isActive ? 16 : 0,
            },
          ]}
        />
      )}
      {isDropTarget && (
        <View
          style={[
            styles.dropTargetRing,
            {
              width: size + 12,
              height: size + 12,
              borderRadius: (size + 12) / 2,
              top: -6,
              left: -6,
              borderColor: C.accent,
            },
          ]}
        />
      )}
      {subdivisionCount > 1 && (
        <View style={[styles.subdivBadge, { borderColor: C.accent }]}>
          <Text style={[styles.subdivBadgeText, { color: C.accent }]}>{subdivisionCount}</Text>
        </View>
      )}
    </Pressable>
  );
}

export interface BarRepeat {
  type: "count" | "duration";
  value: number;
}

interface BeatIndicatorProps {
  beatsPerMeasure: number;
  currentBeat: number;
  isPlaying: boolean;
  onBeatsChange: (beats: number) => void;
  onTogglePlay: () => void;
  beatTypes: BeatType[];
  onBeatTypeChange: (index: number, type: BeatType) => void;
  dropTargetBeat: number | null;
  beatSubdivisionCounts: Record<number, number>;
  dialRef?: React.RefObject<View | null>;
  barMode: boolean;
  onBarModeChange: (mode: boolean) => void;
  beatSubdivisions: Record<string, BeatType[]>;
  onBeatSubdivisionChange: (beatIndex: number, pattern: BeatType[] | null) => void;
  activeSubNote: number;
  barAreaRef?: React.RefObject<View | null>;
  barRepeats: Record<number, BarRepeat>;
  onBarRepeatChange: (beat: number, repeat: BarRepeat | null) => void;
  barLoopMode: "loop" | "once";
  onBarLoopModeChange: (mode: "loop" | "once") => void;
  onBarScrollOffset?: (offset: number) => void;
  onBarTimerExpired?: () => void;
  subdivisionBarElement?: React.ReactNode;
  onBarClockConfigChange?: (mode: "stopwatch" | "timer", duration: number) => void;
  initialBarClockMode?: "stopwatch" | "timer";
  initialBarTimerDuration?: number;
  noteSamples?: Record<string, string>;
  onNoteRecordRequest?: (beatIndex: number, subIndex: number) => void;
  bpm?: number;
  barStartBeat?: number | null;
  onBarStartBeatSelect?: (beat: number | null) => void;
}

export function BeatIndicator({
  beatsPerMeasure,
  currentBeat,
  isPlaying,
  onBeatsChange,
  onTogglePlay,
  beatTypes,
  onBeatTypeChange,
  dropTargetBeat,
  beatSubdivisionCounts,
  dialRef,
  barMode,
  onBarModeChange,
  beatSubdivisions,
  onBeatSubdivisionChange,
  activeSubNote,
  barAreaRef,
  barRepeats,
  onBarRepeatChange,
  barLoopMode,
  onBarLoopModeChange,
  onBarScrollOffset,
  onBarTimerExpired,
  subdivisionBarElement,
  onBarClockConfigChange,
  initialBarClockMode,
  initialBarTimerDuration,
  noteSamples,
  onNoteRecordRequest,
  bpm,
  barStartBeat,
  onBarStartBeatSelect,
}: BeatIndicatorProps) {
  const { colors: C, getImageForBeatType, hubImages } = useTheme();

  const beats = Array.from({ length: beatsPerMeasure }, (_, i) => i);

  const sampleCoveredCells = useMemo(() => {
    const covered = new Set<string>();
    if (!noteSamples || !bpm || bpm <= 0) return covered;
    const beatDurMs = 60000 / bpm;

    const getRepeatCount = (beat: number) => {
      const repeat = barRepeats[beat];
      if (!repeat) return 1;
      if (repeat.type === "count") return Math.max(1, repeat.value);
      const durationMs = repeat.value * 1000;
      return Math.max(1, Math.round(durationMs / beatDurMs));
    };

    for (const [key, uri] of Object.entries(noteSamples)) {
      const [beatStr, subStr] = key.split("-");
      const triggerBeat = parseInt(beatStr, 10);
      const triggerSub = parseInt(subStr, 10);
      if (isNaN(triggerBeat) || isNaN(triggerSub)) continue;
      if (triggerBeat >= beatsPerMeasure) continue;

      const hashParts = uri.split("#t=")[1];
      let durationMs = 0;
      if (hashParts) {
        const parts = hashParts.split(",").map(Number);
        const startMs = !isNaN(parts[0]) ? parts[0] : 0;
        const endMs = parts.length > 1 && !isNaN(parts[1]) ? parts[1] : 0;
        if (endMs > startMs) durationMs = endMs - startMs;
      }

      covered.add(key);

      if (durationMs <= 0) continue;

      let remainMs = durationMs;
      const triggerPattern = beatSubdivisions[String(triggerBeat)];
      const triggerSubCount = triggerPattern ? triggerPattern.length : 1;
      const triggerSubDur = beatDurMs / triggerSubCount;

      for (let si = triggerSub; si < triggerSubCount && remainMs > 0; si++) {
        covered.add(`${triggerBeat}-${si}`);
        remainMs -= triggerSubDur;
      }

      const triggerRepeatCount = getRepeatCount(triggerBeat);
      const triggerRepeatExtraMs = (triggerRepeatCount - 1) * beatDurMs;
      remainMs -= triggerRepeatExtraMs;

      let b = triggerBeat + 1;

      while (remainMs > 0 && b < beatsPerMeasure) {
        const curPattern = beatSubdivisions[String(b)];
        const curSubCount = curPattern ? curPattern.length : 1;
        const curSubDur = beatDurMs / curSubCount;
        const curRepeatCount = getRepeatCount(b);
        const fullBeatDur = beatDurMs * curRepeatCount;

        if (remainMs >= fullBeatDur) {
          for (let si = 0; si < curSubCount; si++) {
            covered.add(`${b}-${si}`);
          }
          remainMs -= fullBeatDur;
          b++;
        } else {
          let leftMs = remainMs;
          for (let si = 0; si < curSubCount && leftMs > 0; si++) {
            covered.add(`${b}-${si}`);
            leftMs -= curSubDur;
          }
          remainMs = 0;
        }
      }
    }
    return covered;
  }, [noteSamples, bpm, beatsPerMeasure, beatSubdivisions, barRepeats]);

  const swipeProgress = useSharedValue(0);
  const swipeDirection = useSharedValue(0);
  const dialRotation = useSharedValue(0);
  const centerGlow = useSharedValue(0);
  const prevBeatRef = useRef(-1);

  useEffect(() => {
    if (isPlaying && currentBeat >= 0 && currentBeat !== prevBeatRef.current) {
      prevBeatRef.current = currentBeat;
      centerGlow.value = withSequence(
        withTiming(1, { duration: 60, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 500, easing: Easing.out(Easing.cubic) })
      );
    } else if (!isPlaying) {
      prevBeatRef.current = -1;
      centerGlow.value = withTiming(0, { duration: 200 });
    }
  }, [isPlaying, currentBeat]);

  const startXRef = useRef(0);
  const isDraggingRef = useRef(false);
  const triggeredRef = useRef(false);
  const beatsRef = useRef(beatsPerMeasure);
  const onBeatsChangeRef = useRef(onBeatsChange);
  const containerRef = useRef<View>(null);

  useEffect(() => {
    beatsRef.current = beatsPerMeasure;
  }, [beatsPerMeasure]);
  useEffect(() => {
    onBeatsChangeRef.current = onBeatsChange;
  }, [onBeatsChange]);

  const resetVisuals = useCallback(() => {
    swipeProgress.value = withTiming(0, { duration: 200 });
    swipeDirection.value = 0;
    dialRotation.value = withSpring(0, { damping: 15, stiffness: 300 });
  }, []);

  const processMoveByDx = useCallback((dx: number) => {
    const progress = Math.min(Math.abs(dx) / SWIPE_THRESHOLD, 1);
    const canAdd = beatsRef.current < MAX_BEATS;
    const canRemove = beatsRef.current > MIN_BEATS;

    dialRotation.value = dx * -0.08;

    if (dx < 0 && canAdd) {
      swipeDirection.value = -1;
      swipeProgress.value = progress;
    } else if (dx > 0 && canRemove) {
      swipeDirection.value = 1;
      swipeProgress.value = progress;
    } else {
      swipeDirection.value = 0;
      swipeProgress.value = 0;
    }

    if (progress >= 1 && !triggeredRef.current) {
      triggeredRef.current = true;
      if (dx < 0 && canAdd) {
        if (Platform.OS !== "web") {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
        onBeatsChangeRef.current(beatsRef.current + 1);
      } else if (dx > 0 && canRemove) {
        if (Platform.OS !== "web") {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
        onBeatsChangeRef.current(beatsRef.current - 1);
      }
    }
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") return;

    const handleMouseDown = (e: MouseEvent) => {
      startXRef.current = e.clientX;
      isDraggingRef.current = true;
      triggeredRef.current = false;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      processMoveByDx(e.clientX - startXRef.current);
    };

    const handleMouseUp = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      resetVisuals();
    };

    const node = containerRef.current as any;
    if (!node) return;

    const el = node as unknown as HTMLElement;
    if (!el || !el.addEventListener) return;

    el.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      el.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [processMoveByDx, resetVisuals]);

  const panResponder = useRef(
    Platform.OS !== "web"
      ? PanResponder.create({
          onStartShouldSetPanResponder: () => false,
          onStartShouldSetPanResponderCapture: () => false,
          onMoveShouldSetPanResponder: (_, gs) =>
            Math.abs(gs.dx) > 20 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5,
          onMoveShouldSetPanResponderCapture: () => false,
          onShouldBlockNativeResponder: () => false,
          onPanResponderGrant: () => {
            triggeredRef.current = false;
          },
          onPanResponderMove: (_, gs) => {
            processMoveByDx(gs.dx);
          },
          onPanResponderRelease: () => {
            resetVisuals();
          },
          onPanResponderTerminate: () => {
            resetVisuals();
          },
          onPanResponderTerminationRequest: () => true,
        })
      : null
  ).current;

  const dialStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${dialRotation.value}deg` }],
  }));

  const centerGlowStyle = useAnimatedStyle(() => ({
    opacity: centerGlow.value * 0.7,
    transform: [{ scale: 1 + centerGlow.value * 0.3 }],
  }));

  const isAccentBeat = isPlaying && currentBeat === 0;

  const nativePanHandlers =
    Platform.OS !== "web" && panResponder ? panResponder.panHandlers : {};

  const noteHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteHoldFiredRef = useRef(false);
  const noteHoldActiveRef = useRef(false);
  const noteHoldTargetRef = useRef<{ beat: number; ci: number } | null>(null);

  const clearNoteHold = useCallback(() => {
    noteHoldActiveRef.current = false;
    if (noteHoldTimerRef.current) {
      clearTimeout(noteHoldTimerRef.current);
      noteHoldTimerRef.current = null;
    }
  }, []);

  const startNoteHold = useCallback((beat: number, ci: number, patternLen: number) => {
    clearNoteHold();
    noteHoldFiredRef.current = false;
    noteHoldActiveRef.current = true;
    noteHoldTargetRef.current = { beat, ci };
    noteHoldTimerRef.current = setTimeout(() => {
      noteHoldFiredRef.current = true;
      noteHoldActiveRef.current = false;
      noteHoldTimerRef.current = null;
      if (!isPlaying && onNoteRecordRequest) {
        if (Platform.OS !== "web") {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        }
        onNoteRecordRequest(beat, ci);
      }
    }, 500);
  }, [isPlaying, onNoteRecordRequest, clearNoteHold]);

  const cycleBeatType = useCallback(
    (index: number) => {
      const current = beatTypes[index] || "normal";
      let next: BeatType;
      if (current === "strong") {
        next = "accent";
      } else if (current === "accent") {
        next = "normal";
      } else if (current === "normal") {
        next = "mute";
      } else {
        next = "strong";
      }
      if (Platform.OS !== "web") {
        Haptics.impactAsync(
          next === "strong"
            ? Haptics.ImpactFeedbackStyle.Heavy
            : next === "accent"
            ? Haptics.ImpactFeedbackStyle.Heavy
            : next === "mute"
            ? Haptics.ImpactFeedbackStyle.Light
            : Haptics.ImpactFeedbackStyle.Medium
        );
      }
      onBeatTypeChange(index, next);
    },
    [beatTypes, onBeatTypeChange]
  );

  const handleBarCellPress = useCallback((beatIndex: number, cellIndex: number) => {
    if (isPlaying) return;
    const pattern = beatSubdivisions[String(beatIndex)];
    if (!pattern || pattern.length <= 1) {
      cycleBeatType(beatIndex);
      return;
    }
    const newPattern = [...pattern];
    const current = newPattern[cellIndex];
    const next: BeatType =
      current === "strong" ? "accent"
      : current === "accent" ? "normal"
      : current === "normal" ? "mute"
      : "strong";
    newPattern[cellIndex] = next;
    onBeatSubdivisionChange(beatIndex, newPattern);
    if (Platform.OS !== "web") {
      Haptics.impactAsync(
        next === "strong" || next === "accent"
          ? Haptics.ImpactFeedbackStyle.Heavy
          : next === "mute"
          ? Haptics.ImpactFeedbackStyle.Light
          : Haptics.ImpactFeedbackStyle.Medium
      );
    }
  }, [isPlaying, beatSubdivisions, onBeatSubdivisionChange, cycleBeatType]);

  const barScrollRef = useRef<ScrollView>(null);
  const [barElapsedSec, setBarElapsedSec] = useState(0);
  const barStartTimeRef = useRef(0);
  const [barClockMode, setBarClockModeRaw] = useState<"stopwatch" | "timer">(initialBarClockMode || "stopwatch");
  const [barTimerDuration, setBarTimerDurationRaw] = useState(initialBarTimerDuration || 180);

  const setBarClockMode = useCallback((mode: "stopwatch" | "timer") => {
    setBarClockModeRaw(mode);
    onBarClockConfigChange?.(mode, barTimerDuration);
  }, [barTimerDuration, onBarClockConfigChange]);

  const setBarTimerDuration = useCallback((dur: number) => {
    setBarTimerDurationRaw(dur);
    onBarClockConfigChange?.(barClockMode, dur);
  }, [barClockMode, onBarClockConfigChange]);

  useEffect(() => {
    if (initialBarClockMode) setBarClockModeRaw(initialBarClockMode);
    if (initialBarTimerDuration != null) setBarTimerDurationRaw(initialBarTimerDuration);
  }, [initialBarClockMode, initialBarTimerDuration]);

  const [barTimerRemaining, setBarTimerRemaining] = useState(180);
  const [barTimerEditing, setBarTimerEditing] = useState(false);
  const [barTimerInput, setBarTimerInput] = useState("");
  const barTimerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!barMode) return;
    if (isPlaying) {
      barStartTimeRef.current = Date.now();
      setBarElapsedSec(0);
      if (barClockMode === "stopwatch") {
        const iv = setInterval(() => {
          setBarElapsedSec(Math.floor((Date.now() - barStartTimeRef.current) / 1000));
        }, 1000);
        return () => clearInterval(iv);
      } else {
        setBarTimerRemaining(barTimerDuration);
        const startTime = Date.now();
        barTimerIntervalRef.current = setInterval(() => {
          const elapsed = Math.floor((Date.now() - startTime) / 1000);
          const left = Math.max(0, barTimerDuration - elapsed);
          setBarTimerRemaining(left);
          setBarElapsedSec(elapsed);
          if (left <= 0) {
            if (barTimerIntervalRef.current) clearInterval(barTimerIntervalRef.current);
            barTimerIntervalRef.current = null;
            onBarTimerExpired?.();
          }
        }, 250);
        return () => {
          if (barTimerIntervalRef.current) {
            clearInterval(barTimerIntervalRef.current);
            barTimerIntervalRef.current = null;
          }
        };
      }
    } else {
      setBarElapsedSec(0);
      setBarTimerRemaining(barTimerDuration);
      if (barTimerIntervalRef.current) {
        clearInterval(barTimerIntervalRef.current);
        barTimerIntervalRef.current = null;
      }
    }
  }, [isPlaying, barMode, barClockMode, barTimerDuration, onBarTimerExpired]);

  const barTimeDisplay = useMemo(() => {
    if (barClockMode === "timer") {
      const t = isPlaying ? barTimerRemaining : barTimerDuration;
      const m = Math.floor(t / 60);
      const s = t % 60;
      return `${m}:${s.toString().padStart(2, "0")}`;
    }
    const m = Math.floor(barElapsedSec / 60);
    const s = barElapsedSec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }, [barClockMode, barElapsedSec, barTimerRemaining, barTimerDuration, isPlaying]);

  const barClockSwipePan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_e, g) => !isPlaying && Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderRelease: (_e, g) => {
      if (Math.abs(g.dx) < 20) return;
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (g.dx < 0 && barClockMode === "stopwatch") {
        setBarClockMode("timer");
      } else if (g.dx > 0 && barClockMode === "timer") {
        setBarClockMode("stopwatch");
        setBarTimerEditing(false);
      }
    },
  }), [isPlaying, barClockMode]);

  const handleBarClockTap = useCallback(() => {
    if (isPlaying) return;
    if (barClockMode === "timer") {
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setBarTimerEditing(true);
      const m = Math.floor(barTimerDuration / 60);
      const s = barTimerDuration % 60;
      setBarTimerInput(m > 0 ? `${m}:${s.toString().padStart(2, "0")}` : `${s}`);
    }
  }, [isPlaying, barClockMode, barTimerDuration]);

  const commitBarTimerInput = useCallback(() => {
    setBarTimerEditing(false);
    const trimmed = barTimerInput.trim();
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
    setBarTimerDuration(totalSeconds);
    setBarTimerRemaining(totalSeconds);
  }, [barTimerInput]);

  const [repeatModalBeat, setRepeatModalBeat] = useState<number | null>(null);
  const [repeatType, setRepeatType] = useState<"count" | "duration">("count");
  const [repeatCountVal, setRepeatCountVal] = useState(2);
  const [repeatMinVal, setRepeatMinVal] = useState(0);
  const [repeatSecVal, setRepeatSecVal] = useState(30);
  const [repeatCountEditing, setRepeatCountEditing] = useState(false);
  const [repeatCountText, setRepeatCountText] = useState("");
  const [repeatMinEditing, setRepeatMinEditing] = useState(false);
  const [repeatMinText, setRepeatMinText] = useState("");
  const [repeatSecEditing, setRepeatSecEditing] = useState(false);
  const [repeatSecText, setRepeatSecText] = useState("");

  const countSwipeStartRef = useRef(0);
  const countPanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 10 && Math.abs(gs.dx) > Math.abs(gs.dy),
    onPanResponderGrant: () => { countSwipeStartRef.current = repeatCountVal; },
    onPanResponderMove: (_, gs) => {
      const delta = Math.round(gs.dx / 30);
      setRepeatCountVal(Math.max(2, Math.min(99, countSwipeStartRef.current + delta)));
    },
    onPanResponderRelease: () => {
      if (Platform.OS !== "web") Haptics.selectionAsync();
    },
  }), [repeatCountVal]);

  const durSwipeStartMinRef = useRef(0);
  const durSwipeStartSecRef = useRef(0);
  const durPanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dy) > 10 && Math.abs(gs.dy) > Math.abs(gs.dx),
    onPanResponderGrant: () => {
      durSwipeStartMinRef.current = repeatMinVal;
      durSwipeStartSecRef.current = repeatSecVal;
    },
    onPanResponderMove: (_, gs) => {
      const totalStartSec = durSwipeStartMinRef.current * 60 + durSwipeStartSecRef.current;
      const delta = Math.round(-gs.dy / 20) * 5;
      const newTotal = Math.max(0, Math.min(3599, totalStartSec + delta));
      setRepeatMinVal(Math.floor(newTotal / 60));
      setRepeatSecVal(newTotal % 60);
    },
    onPanResponderRelease: () => {
      if (Platform.OS !== "web") Haptics.selectionAsync();
    },
  }), [repeatMinVal, repeatSecVal]);

  const openRepeatModal = useCallback((beat: number) => {
    const existing = barRepeats[beat];
    if (existing) {
      setRepeatType(existing.type);
      if (existing.type === "count") {
        setRepeatCountVal(existing.value);
      } else {
        setRepeatMinVal(Math.floor(existing.value / 60));
        setRepeatSecVal(existing.value % 60);
      }
    } else {
      setRepeatType("count");
      setRepeatCountVal(2);
      setRepeatMinVal(0);
      setRepeatSecVal(30);
    }
    setRepeatCountEditing(false);
    setRepeatMinEditing(false);
    setRepeatSecEditing(false);
    setRepeatModalBeat(beat);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  }, [barRepeats]);

  const saveRepeat = useCallback(() => {
    if (repeatModalBeat === null) return;
    const val = repeatType === "count" ? repeatCountVal : repeatMinVal * 60 + repeatSecVal;
    if (val <= 0) return;
    if (repeatType === "count" && val === 1) {
      onBarRepeatChange(repeatModalBeat, null);
    } else {
      onBarRepeatChange(repeatModalBeat, { type: repeatType, value: val });
    }
    setRepeatModalBeat(null);
  }, [repeatModalBeat, repeatType, repeatCountVal, repeatMinVal, repeatSecVal, onBarRepeatChange]);

  const clearRepeat = useCallback(() => {
    if (repeatModalBeat === null) return;
    onBarRepeatChange(repeatModalBeat, null);
    setRepeatModalBeat(null);
  }, [repeatModalBeat, onBarRepeatChange]);

  const formatRepeat = (r: BarRepeat): string => {
    if (r.type === "count") return `\u00D7${r.value}`;
    const totalSec = r.value;
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    if (m > 0) return s > 0 ? `${m}'${s.toString().padStart(2, "0")}"` : `${m}'`;
    return `${s}"`;
  };

  const BAR_HEIGHT = 36;
  const BAR_LINE_COLOR = Colors.textSecondary;
  const [barContainerHeight, setBarContainerHeight] = useState(0);
  const barGap = 18;
  const rowH = BAR_HEIGHT + 1 + barGap;
  const centerPad = Math.max(0, (barContainerHeight - BAR_HEIGHT) / 2);
  const copyHeight = beatsPerMeasure * rowH;
  const [activeCopy, setActiveCopy] = useState(2);
  const activeCopyRef = useRef(2);
  const barPrevBeatRef = useRef(-1);

  const NUM_COPIES = 5;
  const CENTER_COPY = 2;

  useEffect(() => {
    if (!isPlaying) {
      activeCopyRef.current = CENTER_COPY;
      setActiveCopy(CENTER_COPY);
      barPrevBeatRef.current = -1;
      if (barMode && barContainerHeight > 0) {
        barScrollRef.current?.scrollTo({ y: 0, animated: false });
        onBarScrollOffset?.(0);
      }
    } else if (barMode && barContainerHeight > 0) {
      const startBeat = barStartBeat && barStartBeat > 0 ? barStartBeat : 0;
      if (barLoopMode === "once") {
        const beatTop = centerPad + startBeat * rowH;
        const scrollTarget = Math.max(0, beatTop - barContainerHeight / 2 + BAR_HEIGHT / 2);
        barScrollRef.current?.scrollTo({ y: scrollTarget, animated: false });
      } else {
        const beatTop = centerPad + CENTER_COPY * copyHeight + startBeat * rowH;
        const scrollTarget = Math.max(0, beatTop - barContainerHeight / 2 + BAR_HEIGHT / 2);
        barScrollRef.current?.scrollTo({ y: scrollTarget, animated: false });
      }
    }
  }, [isPlaying, barMode, barContainerHeight, centerPad, copyHeight, barLoopMode, barStartBeat, rowH]);

  useEffect(() => {
    if (!barMode || !isPlaying || currentBeat < 0) return;
    if (barContainerHeight <= 0 || copyHeight <= 0) return;

    if (barLoopMode === "once") {
      const beatTop = centerPad + currentBeat * rowH;
      const scrollTarget = Math.max(0, beatTop - barContainerHeight / 2 + BAR_HEIGHT / 2);
      const isFirstTick = barPrevBeatRef.current < 0;
      barPrevBeatRef.current = currentBeat;
      barScrollRef.current?.scrollTo({ y: scrollTarget, animated: !isFirstTick });
      return;
    }

    const prev = barPrevBeatRef.current;
    barPrevBeatRef.current = currentBeat;

    if (prev >= 0 && currentBeat < prev) {
      activeCopyRef.current++;
      setActiveCopy(activeCopyRef.current);
    }

    if (activeCopyRef.current > CENTER_COPY && currentBeat > 0) {
      activeCopyRef.current = CENTER_COPY;
      setActiveCopy(CENTER_COPY);
      const snapTop = centerPad + CENTER_COPY * copyHeight + (currentBeat - 1) * rowH;
      const snapTarget = Math.max(0, snapTop - barContainerHeight / 2 + BAR_HEIGHT / 2);
      barScrollRef.current?.scrollTo({ y: snapTarget, animated: false });
    }

    const beatTop = centerPad + activeCopyRef.current * copyHeight + currentBeat * rowH;
    const scrollTarget = Math.max(0, beatTop - barContainerHeight / 2 + BAR_HEIGHT / 2);
    const isFirstTick = prev < 0;
    barScrollRef.current?.scrollTo({ y: scrollTarget, animated: !isFirstTick });
  }, [barMode, isPlaying, currentBeat, beatsPerMeasure, barContainerHeight, centerPad, rowH, copyHeight, barLoopMode]);

  if (barMode) {
    const isDropping = dropTargetBeat !== null;
    const renderBarRow = (beat: number, copyIndex: number) => {
      const pattern = beatSubdivisions[String(beat)] || [beatTypes[beat] || "normal"];
      const isCurrent = isPlaying && currentBeat === beat && (barLoopMode === "once" ? copyIndex === 0 : copyIndex === activeCopy);
      const bType = beatTypes[beat] || "normal";
      const isDropTarget = isDropping && (dropTargetBeat === beat || dropTargetBeat === -1);
      const repeat = barRepeats[beat];
      const isPrimary = isPlaying ? (barLoopMode === "once" ? copyIndex === 0 : copyIndex === CENTER_COPY) : copyIndex === 0;
      return (
        <View
          key={`bar-${copyIndex}-${beat}`}
          style={[
            styles.barBeatWrapper,
            isCurrent && styles.barBeatWrapperActive,
            isPrimary && isDropTarget && { backgroundColor: "rgba(255,255,255,0.06)", borderColor: C.accent, borderWidth: 1, borderRadius: 4, marginHorizontal: -1 },
          ]}
        >
          <Pressable
            style={[
              styles.barBeatLabel,
              barStartBeat === beat && !isPlaying && { backgroundColor: C.accent + "30", borderRadius: 4 },
            ]}
            onLongPress={() => { if (isPrimary && !isPlaying) openRepeatModal(beat); }}
            delayLongPress={500}
            onPress={() => {
              if (isPrimary && !isPlaying && onBarStartBeatSelect) {
                onBarStartBeatSelect(barStartBeat === beat ? null : beat);
                if (Platform.OS !== "web") Haptics.selectionAsync();
              } else if (isPrimary) {
                cycleBeatType(beat);
              }
            }}
          >
            {barStartBeat === beat && !isPlaying ? (
              <Ionicons name="play" size={12} color={C.accent} style={{ marginLeft: 1 }} />
            ) : (
              <Text style={[
                styles.barBeatLabelText,
                {
                  color: bType === "strong" ? C.accent
                    : bType === "accent" ? C.accentMuted
                    : bType === "mute" ? Colors.textTertiary
                    : Colors.textSecondary,
                  opacity: isCurrent ? 1 : 0.6,
                }
              ]}>
                {beat + 1}
              </Text>
            )}
          </Pressable>
          <View style={[
            styles.barBeatContent,
            { height: BAR_HEIGHT },
            isCurrent && { backgroundColor: "rgba(255,255,255,0.08)" },
          ]}>
            {pattern.map((type, ci) => {
              const isActiveCell = isCurrent && ci === activeSubNote;
              const isStrongType = type === "strong";
              const isAccentType = type === "accent" || isStrongType;
              const isLast = ci === pattern.length - 1;
              const sampleKey = `${beat}-${ci}`;
              const hasSample = !!(noteSamples && noteSamples[sampleKey]);
              const isCovered = sampleCoveredCells.has(sampleKey);
              const canRecord = true;
              return (
                <Pressable
                  key={ci}
                  onPress={() => {
                    if (!noteHoldFiredRef.current && isPrimary) handleBarCellPress(beat, ci);
                  }}
                  onLongPress={() => {
                    if (!noteHoldFiredRef.current && isPrimary && !isPlaying && canRecord && onNoteRecordRequest) {
                      noteHoldFiredRef.current = true;
                      onNoteRecordRequest(beat, ci);
                    }
                  }}
                  onPressIn={() => { noteHoldFiredRef.current = false; }}
                  delayLongPress={500}
                  onTouchStart={() => {
                    noteHoldFiredRef.current = false;
                    if (isPrimary && !isPlaying && canRecord && onNoteRecordRequest) {
                      startNoteHold(beat, ci, pattern.length);
                    }
                  }}
                  onTouchEnd={() => { clearNoteHold(); }}
                  onTouchCancel={() => { clearNoteHold(); }}
                  style={[styles.barNoteCell, !isLast && { borderRightWidth: 1, borderRightColor: "rgba(255,255,255,0.08)" }]}
                >
                  {isStrongType ? (
                    <LinearGradient
                      colors={[Colors.white, C.accent, C.accentMuted]}
                      locations={[0, 0.35, 1]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={[styles.barNoteFill, { opacity: isActiveCell ? 1 : 0.75, margin: 3 }]}
                    />
                  ) : type === "mute" ? (
                    <View style={[styles.barNoteFill, {
                      margin: 3,
                      backgroundColor: "transparent",
                      borderWidth: 1,
                      borderColor: Colors.textTertiary,
                      borderStyle: "dashed" as any,
                      opacity: isActiveCell ? 0.9 : 0.4,
                    }]} />
                  ) : (
                    <View style={[styles.barNoteFill, {
                      margin: 3,
                      backgroundColor: isAccentType
                        ? (isActiveCell ? C.accent : C.accentMuted)
                        : (isActiveCell ? Colors.text : Colors.textTertiary),
                      opacity: isActiveCell ? 1 : 0.7,
                    }]} />
                  )}
                  
                </Pressable>
              );
            })}
            {(() => {
              const cellHas = (b: number, c: number) => {
                const sk = `${b}-${c}`;
                return !!(noteSamples && noteSamples[sk]) || sampleCoveredCells.has(sk);
              };
              const anyCovered = pattern.some((_, ci) => cellHas(beat, ci));
              if (!anyCovered) return null;

              const segments: { start: number; end: number }[] = [];
              let segStart = -1;
              for (let ci = 0; ci <= pattern.length; ci++) {
                const covered = ci < pattern.length && cellHas(beat, ci);
                if (covered && segStart < 0) segStart = ci;
                if (!covered && segStart >= 0) {
                  segments.push({ start: segStart, end: ci - 1 });
                  segStart = -1;
                }
              }
              if (segStart >= 0) segments.push({ start: segStart, end: pattern.length - 1 });

              return segments.map((seg, si) => {
                const leftPct = (seg.start / pattern.length) * 100;
                const widthPct = ((seg.end - seg.start + 1) / pattern.length) * 100;
                return (
                  <View key={`bar-${si}`} style={{
                    position: "absolute",
                    left: `${leftPct}%` as any,
                    width: `${widthPct}%` as any,
                    bottom: -1,
                    height: 3,
                    backgroundColor: "#39FF14",
                    opacity: 0.85,
                    zIndex: 10,
                  }} />
                );
              });
            })()}
          </View>
          <View style={[styles.barBeatEndLine, { backgroundColor: BAR_LINE_COLOR }]} />
          <Pressable
            onPress={(e) => { e.stopPropagation(); if (isPrimary && !isPlaying) openRepeatModal(beat); }}
            style={styles.barRepeatBadge}
            hitSlop={6}
          >
            <Text style={[styles.barRepeatText, { color: repeat ? C.accent : Colors.textTertiary }]}>
              {repeat ? formatRepeat(repeat) : "\u00D71"}
            </Text>
          </Pressable>
        </View>
      );
    };
    const allBarRows: React.ReactNode[] = [];
    if (isPlaying && barLoopMode !== "once") {
      for (let copy = 0; copy < NUM_COPIES; copy++) {
        for (const beat of beats) {
          allBarRows.push(renderBarRow(beat, copy));
        }
      }
    } else {
      for (const beat of beats) {
        allBarRows.push(renderBarRow(beat, 0));
      }
    }

    return (
      <View style={styles.barModeContainer} testID="beat-indicator-bar-mode">
        <View style={styles.barTopRowCenter}>
          <Pressable
            onPress={() => onBarModeChange(false)}
            style={[
              styles.barModeHandle,
              dropTargetBeat === -1 && { backgroundColor: C.accent },
            ]}
            testID="close-bar-mode"
            hitSlop={{ top: 10, bottom: 10, left: 20, right: 20 }}
            accessibilityRole="button"
            accessibilityLabel="Close bar mode"
          >
            {dropTargetBeat === -1 ? (
              <Ionicons name="layers" size={16} color={Colors.white} />
            ) : (
              <Ionicons name="chevron-down" size={18} color={Colors.textTertiary} />
            )}
          </Pressable>
        </View>

        <View
          ref={barAreaRef}
          style={styles.barMeasureOuter}
          onLayout={(e) => setBarContainerHeight(e.nativeEvent.layout.height)}
        >
          <ScrollView
            ref={barScrollRef}
            style={styles.barScrollView}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            contentOffset={{ x: 0, y: 0 }}
            scrollEnabled={!isPlaying}
            onScroll={(e) => onBarScrollOffset?.(e.nativeEvent.contentOffset.y)}
            scrollEventThrottle={16}
          >
            <View style={[styles.barMeasureInner, { paddingTop: centerPad, paddingBottom: centerPad, gap: barGap }]}>{allBarRows}</View>
          </ScrollView>
          <LinearGradient
            colors={[Colors.background, Colors.background, Colors.background + "80", "transparent"]}
            locations={[0, 0.45, 0.75, 1]}
            style={[styles.barFadeGradient, { top: 0, height: rowH * 1.8 }]}
            pointerEvents="none"
          />
        </View>
        <LinearGradient
          colors={["transparent", Colors.background + "60", Colors.background + "C0", Colors.background]}
          locations={[0, 0.3, 0.65, 1]}
          style={[styles.barFadeGradientBottom, { height: rowH + 100, marginTop: -(rowH + 100) }]}
          pointerEvents="none"
        />

        {subdivisionBarElement && (
          <View style={styles.barSubdivisionSlot}>{subdivisionBarElement}</View>
        )}

        <View style={styles.barBottomRow}>
          <Pressable
            onPress={() => { if (!isPlaying) onBarLoopModeChange(barLoopMode === "loop" ? "once" : "loop"); }}
            style={[styles.barLoopBtn, barLoopMode === "once" && { backgroundColor: "rgba(255,255,255,0.12)" }, isPlaying && { opacity: 0.3 }]}
            hitSlop={6}
            testID="bar-loop-toggle"
            disabled={isPlaying}
          >
            <Ionicons
              name={barLoopMode === "loop" ? "repeat" : "play-forward"}
              size={18}
              color={barLoopMode === "loop" ? C.accent : Colors.textSecondary}
            />
          </Pressable>
          <View style={styles.barTimeSigRow}>
            <Pressable
              onPress={() => { if (!isPlaying && beatsPerMeasure > MIN_BEATS) { onBeatsChange(beatsPerMeasure - 1); if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } }}
              style={[styles.barTimeSigBtn, (isPlaying || beatsPerMeasure <= MIN_BEATS) && { opacity: 0.3 }]}
              hitSlop={8}
            >
              <Ionicons name="remove" size={16} color={Colors.textSecondary} />
            </Pressable>
            <View style={styles.barInfoCol} {...barClockSwipePan.panHandlers}>
              <Pressable onPress={handleBarClockTap}>
                <Text style={[styles.barInfoText, { color: barClockMode === "timer" ? Colors.danger : C.accent }]}>
                  {barTimeDisplay}
                  {barClockMode === "timer" && !isPlaying && <Text style={{ fontSize: 9, color: Colors.textTertiary }}> &#9202;</Text>}
                </Text>
              </Pressable>
              <Text style={[styles.barInfoText, { color: Colors.textTertiary, fontSize: 10 }]}>
                {beatsPerMeasure} bars
              </Text>
              <View style={styles.barClockDots}>
                <View style={[styles.barClockDot, barClockMode === "stopwatch" && { backgroundColor: C.accent }]} />
                <View style={[styles.barClockDot, barClockMode === "timer" && { backgroundColor: Colors.danger }]} />
              </View>
            </View>
            <Pressable
              onPress={() => { if (!isPlaying && beatsPerMeasure < MAX_BEATS) { onBeatsChange(beatsPerMeasure + 1); if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } }}
              style={[styles.barTimeSigBtn, (isPlaying || beatsPerMeasure >= MAX_BEATS) && { opacity: 0.3 }]}
              hitSlop={8}
            >
              <Ionicons name="add" size={16} color={Colors.textSecondary} />
            </Pressable>
          </View>
          <Pressable
            onPress={onTogglePlay}
            style={({ pressed }) => [
              styles.barPlayBtn,
              pressed && { opacity: 0.7 },
            ]}
            testID="bar-play-button"
          >
            <Ionicons
              name={isPlaying ? "stop" : "play"}
              size={22}
              color={isPlaying ? Colors.danger : C.accent}
              style={!isPlaying ? { marginLeft: 2 } : undefined}
            />
          </Pressable>
        </View>

        <Modal
          visible={barTimerEditing}
          transparent
          animationType="fade"
          onRequestClose={() => setBarTimerEditing(false)}
        >
          <View style={styles.barTimerOverlay}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setBarTimerEditing(false)} />
            <View style={styles.barTimerCard}>
              <View style={styles.barTimerHeader}>
                <Ionicons name="timer-outline" size={20} color={Colors.danger} />
                <Text style={styles.barTimerTitle}>Timer</Text>
              </View>
              <TextInput
                style={[styles.barTimerInput, { borderBottomColor: C.accent, color: C.accent }]}
                value={barTimerInput}
                onChangeText={setBarTimerInput}
                onSubmitEditing={commitBarTimerInput}
                keyboardType="numbers-and-punctuation"
                autoFocus
                selectTextOnFocus
                placeholder="M:SS"
                placeholderTextColor={Colors.textTertiary}
              />
              <Text style={styles.barTimerHint}>M:SS or seconds</Text>
              <Pressable
                onPress={commitBarTimerInput}
                style={[styles.barTimerSetBtn, { backgroundColor: Colors.danger }]}
              >
                <Text style={styles.barTimerSetText}>Set</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

        <Modal
          visible={repeatModalBeat !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setRepeatModalBeat(null)}
        >
          <Pressable style={styles.repeatModalOverlay} onPress={() => setRepeatModalBeat(null)}>
            <View style={[styles.repeatModalCard, { borderColor: C.accent }]} onStartShouldSetResponder={() => true}>
              <Text style={styles.repeatModalTitle}>
                Bar {repeatModalBeat !== null ? repeatModalBeat + 1 : ""} Repeat
              </Text>

              <View style={styles.repeatTypeRow}>
                <Pressable
                  onPress={() => setRepeatType("count")}
                  style={[styles.repeatTypeBtn, repeatType === "count" && { backgroundColor: C.accent }]}
                >
                  <Text style={[styles.repeatTypeBtnText, repeatType === "count" && { color: Colors.background }]}>Count</Text>
                </Pressable>
                <Pressable
                  onPress={() => setRepeatType("duration")}
                  style={[styles.repeatTypeBtn, repeatType === "duration" && { backgroundColor: C.accent }]}
                >
                  <Text style={[styles.repeatTypeBtnText, repeatType === "duration" && { color: Colors.background }]}>Duration</Text>
                </Pressable>
              </View>

              {repeatType === "count" ? (
                <View style={styles.repeatValueRow}>
                  <Pressable onPress={() => setRepeatCountVal(Math.max(2, repeatCountVal - 1))} style={styles.repeatValBtn}>
                    <Ionicons name="remove" size={20} color={Colors.text} />
                  </Pressable>
                  <View {...countPanResponder.panHandlers} style={{ alignItems: "center", minWidth: 70 }}>
                    {repeatCountEditing ? (
                      <TextInput
                        style={[styles.repeatValText, { textAlign: "center", minWidth: 50, padding: 4, borderBottomWidth: 1, borderBottomColor: C.accent }]}
                        keyboardType="number-pad"
                        value={repeatCountText}
                        onChangeText={setRepeatCountText}
                        onBlur={() => {
                          const v = parseInt(repeatCountText, 10);
                          if (!isNaN(v)) setRepeatCountVal(Math.max(2, Math.min(99, v)));
                          setRepeatCountEditing(false);
                        }}
                        onSubmitEditing={() => {
                          const v = parseInt(repeatCountText, 10);
                          if (!isNaN(v)) setRepeatCountVal(Math.max(2, Math.min(99, v)));
                          setRepeatCountEditing(false);
                        }}
                        autoFocus
                        selectTextOnFocus
                        maxLength={2}
                      />
                    ) : (
                      <Pressable onPress={() => { setRepeatCountText(String(repeatCountVal)); setRepeatCountEditing(true); }}>
                        <Text style={styles.repeatValText}>{"\u00D7"}{repeatCountVal}</Text>
                      </Pressable>
                    )}
                    <Text style={{ color: Colors.textTertiary, fontSize: 10, marginTop: 2 }}>{"\u2190"} swipe {"\u2192"}</Text>
                  </View>
                  <Pressable onPress={() => setRepeatCountVal(Math.min(99, repeatCountVal + 1))} style={styles.repeatValBtn}>
                    <Ionicons name="add" size={20} color={Colors.text} />
                  </Pressable>
                </View>
              ) : (
                <View {...durPanResponder.panHandlers}>
                  <View style={styles.repeatValueRow}>
                    <View style={styles.repeatTimeGroup}>
                      <Pressable onPress={() => setRepeatMinVal(Math.max(0, repeatMinVal - 1))} style={styles.repeatValBtn}>
                        <Ionicons name="remove" size={18} color={Colors.text} />
                      </Pressable>
                      {repeatMinEditing ? (
                        <TextInput
                          style={[styles.repeatValText, { textAlign: "center", minWidth: 30, padding: 4, borderBottomWidth: 1, borderBottomColor: C.accent }]}
                          keyboardType="number-pad"
                          value={repeatMinText}
                          onChangeText={setRepeatMinText}
                          onBlur={() => {
                            const v = parseInt(repeatMinText, 10);
                            if (!isNaN(v)) setRepeatMinVal(Math.max(0, Math.min(59, v)));
                            setRepeatMinEditing(false);
                          }}
                          onSubmitEditing={() => {
                            const v = parseInt(repeatMinText, 10);
                            if (!isNaN(v)) setRepeatMinVal(Math.max(0, Math.min(59, v)));
                            setRepeatMinEditing(false);
                          }}
                          autoFocus
                          selectTextOnFocus
                          maxLength={2}
                        />
                      ) : (
                        <Pressable onPress={() => { setRepeatMinText(String(repeatMinVal)); setRepeatMinEditing(true); }}>
                          <Text style={styles.repeatValText}>{repeatMinVal}</Text>
                        </Pressable>
                      )}
                      <Pressable onPress={() => setRepeatMinVal(Math.min(59, repeatMinVal + 1))} style={styles.repeatValBtn}>
                        <Ionicons name="add" size={18} color={Colors.text} />
                      </Pressable>
                      <Text style={styles.repeatTimeLabel}>min</Text>
                    </View>
                    <Text style={styles.repeatTimeSep}>:</Text>
                    <View style={styles.repeatTimeGroup}>
                      <Pressable onPress={() => setRepeatSecVal(Math.max(0, repeatSecVal - 5))} style={styles.repeatValBtn}>
                        <Ionicons name="remove" size={18} color={Colors.text} />
                      </Pressable>
                      {repeatSecEditing ? (
                        <TextInput
                          style={[styles.repeatValText, { textAlign: "center", minWidth: 30, padding: 4, borderBottomWidth: 1, borderBottomColor: C.accent }]}
                          keyboardType="number-pad"
                          value={repeatSecText}
                          onChangeText={setRepeatSecText}
                          onBlur={() => {
                            const v = parseInt(repeatSecText, 10);
                            if (!isNaN(v)) setRepeatSecVal(Math.max(0, Math.min(59, v)));
                            setRepeatSecEditing(false);
                          }}
                          onSubmitEditing={() => {
                            const v = parseInt(repeatSecText, 10);
                            if (!isNaN(v)) setRepeatSecVal(Math.max(0, Math.min(59, v)));
                            setRepeatSecEditing(false);
                          }}
                          autoFocus
                          selectTextOnFocus
                          maxLength={2}
                        />
                      ) : (
                        <Pressable onPress={() => { setRepeatSecText(String(repeatSecVal).padStart(2, "0")); setRepeatSecEditing(true); }}>
                          <Text style={styles.repeatValText}>{repeatSecVal.toString().padStart(2, "0")}</Text>
                        </Pressable>
                      )}
                      <Pressable onPress={() => setRepeatSecVal(Math.min(55, repeatSecVal + 5))} style={styles.repeatValBtn}>
                        <Ionicons name="add" size={18} color={Colors.text} />
                      </Pressable>
                      <Text style={styles.repeatTimeLabel}>sec</Text>
                    </View>
                  </View>
                  <Text style={{ color: Colors.textTertiary, fontSize: 10, textAlign: "center", marginTop: 4 }}>{"\u2191"} swipe {"\u2193"}</Text>
                </View>
              )}

              <View style={styles.repeatActions}>
                <Pressable onPress={clearRepeat} style={styles.repeatClearBtn}>
                  <Text style={[styles.repeatClearText, { color: Colors.danger }]}>Clear</Text>
                </Pressable>
                <Pressable onPress={saveRepeat} style={[styles.repeatSaveBtn, { backgroundColor: C.accent }]}>
                  <Text style={[styles.repeatSaveText, { color: Colors.background }]}>Save</Text>
                </Pressable>
              </View>
            </View>
          </Pressable>
        </Modal>
      </View>
    );
  }

  return (
    <View
      ref={containerRef}
      style={styles.touchArea}
      testID="beat-indicator-swipe"
      {...nativePanHandlers}
    >
      <View style={styles.dialContainer}>
        <View
          ref={dialRef}
          style={{ width: DIAL_SIZE, height: DIAL_SIZE }}
          collapsable={false}
        >
          <Animated.View style={[styles.dial, dialStyle]}>
            {beats.map((beat) => (
              <DialBeatDot
                key={`beat-${beat}`}
                index={beat}
                total={beatsPerMeasure}
                isActive={isPlaying && currentBeat === beat}
                beatType={beatTypes[beat] || "normal"}
                onPress={() => cycleBeatType(beat)}
                isDropTarget={dropTargetBeat === beat || dropTargetBeat === -1}
                subdivisionCount={beatSubdivisionCounts[beat] || 0}
              />
            ))}
          </Animated.View>
        </View>

        <View style={styles.centerArea} pointerEvents="box-none">
          {hubImages.length > 0 && (() => {
            const currentBeatType = isPlaying && currentBeat >= 0 ? (beatTypes[currentBeat] || "normal") : "normal";
            const activeUri = getImageForBeatType(currentBeatType);
            return (
              <View style={styles.centerImageContainer} pointerEvents="none">
                {hubImages.map((img) => (
                  <Image
                    key={img.id}
                    source={{ uri: img.uri }}
                    style={[
                      styles.centerImage,
                      { position: "absolute", opacity: img.uri === activeUri ? 1 : 0 },
                    ]}
                  />
                ))}
              </View>
            );
          })()}

          <View style={styles.signatureRow} pointerEvents="none">
            <Text style={styles.digitalSignature} numberOfLines={1}>
              {beatsPerMeasure}
            </Text>
            <Text style={styles.digitalSignatureSlash} numberOfLines={1}>
              /
            </Text>
            <Text style={styles.digitalSignature} numberOfLines={1}>
              {beatsPerMeasure <= 4 ? "4" : "8"}
            </Text>
          </View>

          <Animated.View
            style={[
              styles.centerGlow,
              {
                backgroundColor: isAccentBeat ? C.accent : Colors.text,
              },
              centerGlowStyle,
            ]}
            pointerEvents="none"
          />

          {dropTargetBeat === -1 && (
            <View style={[styles.centerDropRing, { borderColor: C.accent }]} pointerEvents="none" />
          )}

          <Pressable
            onPress={onTogglePlay}
            style={({ pressed }) => [
              styles.playButton,
              pressed && styles.playButtonPressed,
            ]}
            testID="play-button"
          >
            <Ionicons
              name={isPlaying ? "stop" : "play"}
              size={56}
              color={isPlaying ? Colors.danger : C.accent}
              style={!isPlaying ? { marginLeft: 5 } : undefined}
            />
          </Pressable>

          {dropTargetBeat === -1 && (
            <Text style={[styles.centerDropLabel, { color: C.accent }]}>ALL</Text>
          )}
        </View>
      </View>

      <Pressable
        onPress={() => onBarModeChange(true)}
        style={styles.barModeHandle}
        testID="open-bar-mode"
        hitSlop={{ top: 10, bottom: 10, left: 20, right: 20 }}
        accessibilityRole="button"
        accessibilityLabel="Open bar mode"
      >
        <Ionicons name="chevron-up" size={18} color={Colors.textTertiary} />
      </Pressable>

      <Text style={styles.hintText}>swipe to add or remove beats</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  touchArea: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    cursor: "grab" as any,
    userSelect: "none" as any,
  },
  dialContainer: {
    width: DIAL_SIZE,
    height: DIAL_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  dial: {
    width: DIAL_SIZE,
    height: DIAL_SIZE,
    borderRadius: DIAL_RADIUS,
  },
  centerArea: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  signatureRow: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  digitalSignature: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: moderateScale(83, 0.4),
    color: Colors.textTertiary,
    opacity: 0.15,
  },
  digitalSignatureSlash: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: moderateScale(70, 0.4),
    color: Colors.textTertiary,
    opacity: 0.15,
    marginHorizontal: -2,
  },
  centerImageContainer: {
    position: "absolute",
    width: moderateScale(130),
    height: moderateScale(130),
    borderRadius: moderateScale(65),
    overflow: "hidden",
    opacity: 0.35,
  },
  centerImage: {
    width: moderateScale(130),
    height: moderateScale(130),
    borderRadius: moderateScale(65),
  },
  centerGlow: {
    position: "absolute",
    width: moderateScale(120),
    height: moderateScale(120),
    borderRadius: moderateScale(60),
    opacity: 0,
  },
  playButton: {
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
  },
  playButtonPressed: {
    transform: [{ scale: 0.85 }],
    opacity: 0.6,
  },
  hintText: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 11,
    color: Colors.textTertiary,
    letterSpacing: 1,
    opacity: 0.5,
  },
  barFadeGradient: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 10,
  },
  barFadeGradientBottom: {
    width: "100%" as any,
    zIndex: 10,
  },
  barTimerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  barTimerCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 24,
    width: moderateScale(220, 0.5),
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  barTimerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  barTimerTitle: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 16,
    color: Colors.danger,
  },
  barTimerInput: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 32,
    textAlign: "center",
    padding: 8,
    borderBottomWidth: 2,
    width: "100%" as any,
  },
  barTimerHint: {
    color: Colors.textTertiary,
    fontSize: 11,
    marginTop: 8,
    fontFamily: "SpaceGrotesk_400Regular",
  },
  barTimerSetBtn: {
    marginTop: 16,
    paddingHorizontal: 32,
    paddingVertical: 10,
    borderRadius: 8,
  },
  barTimerSetText: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 14,
    color: Colors.white,
  },
  barClockDots: {
    flexDirection: "row",
    gap: 4,
    marginTop: 3,
  },
  barClockDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.textTertiary,
  },
  barInfoCol: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: moderateScale(48, 0.4),
  },
  barInfoText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: moderateScale(12, 0.4),
    letterSpacing: 0.5,
  },
  dropTargetRing: {
    position: "absolute",
    borderWidth: 2,
    borderColor: Colors.accent,
    borderStyle: "dashed" as any,
    opacity: 0.8,
  },
  subdivBadge: {
    position: "absolute",
    bottom: -4,
    right: -4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  subdivBadgeText: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 9,
    color: Colors.accent,
  },
  centerDropRing: {
    position: "absolute",
    width: moderateScale(110),
    height: moderateScale(110),
    borderRadius: moderateScale(55),
    borderWidth: 2,
    borderColor: Colors.accent,
    borderStyle: "dashed" as any,
    opacity: 0.8,
  },
  centerDropLabel: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 11,
    color: Colors.accent,
    letterSpacing: 2,
    marginTop: 8,
    opacity: 0.9,
  },
  barModeContainer: {
    flex: 1,
    width: "100%" as any,
  },
  barTopRowCenter: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 40,
    paddingBottom: 4,
  },
  barBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    gap: 16,
  },
  barModeCloseBtn: {
    width: moderateScale(32, 0.4),
    height: moderateScale(32, 0.4),
    borderRadius: moderateScale(16, 0.4),
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  barPlayBtn: {
    width: moderateScale(32, 0.4),
    height: moderateScale(32, 0.4),
    borderRadius: moderateScale(16, 0.4),
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  barLoopBtn: {
    width: moderateScale(32, 0.4),
    height: moderateScale(32, 0.4),
    borderRadius: moderateScale(16, 0.4),
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  barTimeSigRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  barTimeSigBtn: {
    width: moderateScale(28, 0.4),
    height: moderateScale(28, 0.4),
    borderRadius: moderateScale(14, 0.4),
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  barMeasureInner: {
    flex: 1,
    gap: 0,
  },
  barBeatWrapper: {
    flexDirection: "row",
    alignItems: "stretch",
    overflow: "visible" as any,
  },
  barBeatLabel: {
    width: moderateScale(22, 0.4),
    alignItems: "center",
    justifyContent: "center",
  },
  barBeatLabelText: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: moderateScale(13, 0.4),
  },
  barBeatContent: {
    flex: 1,
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
    overflow: "visible" as any,
  },
  barNoteCell: {
    flex: 1,
    alignItems: "stretch",
    justifyContent: "stretch",
  },
  barNoteFill: {
    flex: 1,
    borderRadius: 4,
  },
  noteSampleBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    borderRadius: 0,
    zIndex: 10,
  },
  barBeatEndLine: {
    width: 1.5,
    marginLeft: 0,
    opacity: 0.4,
  },
  barRepeatBadge: {
    width: moderateScale(32, 0.4),
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  barRepeatText: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: moderateScale(10, 0.4),
    letterSpacing: 0.5,
  },
  repeatModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  repeatModalCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    width: moderateScale(280, 0.5),
    gap: 16,
  },
  repeatModalTitle: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 16,
    color: Colors.text,
    textAlign: "center" as const,
  },
  repeatTypeRow: {
    flexDirection: "row",
    gap: 8,
  },
  repeatTypeBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.border,
    alignItems: "center",
  },
  repeatTypeBtnText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 13,
    color: Colors.text,
  },
  repeatValueRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  repeatValBtn: {
    width: moderateScale(36, 0.4),
    height: moderateScale(36, 0.4),
    borderRadius: moderateScale(18, 0.4),
    backgroundColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  repeatValText: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 22,
    color: Colors.text,
    minWidth: 48,
    textAlign: "center" as const,
  },
  repeatTimeGroup: {
    alignItems: "center",
    gap: 4,
  },
  repeatTimeLabel: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 10,
    color: Colors.textTertiary,
  },
  repeatTimeSep: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 22,
    color: Colors.textSecondary,
    marginBottom: 16,
  },
  repeatActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  repeatClearBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.danger,
    alignItems: "center",
  },
  repeatClearText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 14,
  },
  repeatSaveBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  repeatSaveText: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 14,
  },
  barMeasureOuter: {
    flex: 1,
    flexShrink: 1,
    width: "100%" as any,
    paddingHorizontal: 0,
    overflow: "hidden",
  },
  barScrollView: {
    flexGrow: 0,
  },
  barScrollFade: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 20,
    backgroundColor: "transparent",
  },
  barBeatWrapperActive: {
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  barModeHandle: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 24,
    minWidth: 80,
    minHeight: 36,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 12,
  },
  barSubdivisionSlot: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
});
