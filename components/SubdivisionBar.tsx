import React, { useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  PanResponder,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withSpring,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import Colors from "@/constants/colors";
import { useTheme } from "@/contexts/ThemeContext";
import type { BeatType } from "@/lib/metronome-engine";

interface SubdivisionBarProps {
  pattern: BeatType[];
  onPatternChange: (pattern: BeatType[]) => void;
  onDragStart: () => void;
  onDragMove: (pageX: number, pageY: number) => void;
  onDragEnd: (pageX: number, pageY: number) => void;
  onReset: () => void;
  isPlaying?: boolean;
  activeSubNote?: number;
  activeBeatPattern?: BeatType[] | null;
}

const CELL_SIZE = 28;
const CELL_GAP = 3;
const MAX_CELLS = 8;
const MIN_CELLS = 1;
const SWIPE_THRESHOLD = 30;
const SHAKE_WINDOW_MS = 3000;
const SHAKE_COUNT_TRIGGER = 10;

function getCellColor(type: BeatType, active: boolean, accentColor: string, accentMutedColor: string): string {
  if (type === "strong") return accentColor;
  if (type === "accent") return active ? accentColor : accentMutedColor;
  if (type === "normal") return active ? Colors.text : Colors.textTertiary;
  return "transparent";
}

function getCellBorder(type: BeatType): string {
  if (type === "mute") return Colors.textTertiary;
  if (type === "strong") return Colors.white;
  return "transparent";
}

export function SubdivisionBar({
  pattern,
  onPatternChange,
  onDragStart,
  onDragMove,
  onDragEnd,
  onReset,
  isPlaying = false,
  activeSubNote = -1,
  activeBeatPattern = null,
}: SubdivisionBarProps) {
  const { colors: C } = useTheme();
  const isDraggingUpRef = useRef(false);
  const horizontalTriggeredRef = useRef(false);
  const patternRef = useRef(pattern);
  const onPatternChangeRef = useRef(onPatternChange);
  const onResetRef = useRef(onReset);
  const onDragStartRef = useRef(onDragStart);
  const onDragMoveRef = useRef(onDragMove);
  const onDragEndRef = useRef(onDragEnd);

  const directionChangesRef = useRef<number[]>([]);
  const lastDirectionRef = useRef<"left" | "right" | null>(null);

  const shakeScale = useSharedValue(1);
  const shakeRotate = useSharedValue(0);

  useEffect(() => {
    patternRef.current = pattern;
  }, [pattern]);
  useEffect(() => {
    onPatternChangeRef.current = onPatternChange;
  }, [onPatternChange]);
  useEffect(() => {
    onResetRef.current = onReset;
  }, [onReset]);
  useEffect(() => {
    onDragStartRef.current = onDragStart;
  }, [onDragStart]);
  useEffect(() => {
    onDragMoveRef.current = onDragMove;
  }, [onDragMove]);
  useEffect(() => {
    onDragEndRef.current = onDragEnd;
  }, [onDragEnd]);

  const cycleType = useCallback(
    (index: number) => {
      if (isPlaying) return;
      const newPattern = [...pattern];
      const current = newPattern[index];
      const next: BeatType =
        current === "strong"
          ? "accent"
          : current === "accent"
          ? "normal"
          : current === "normal"
          ? "mute"
          : "strong";
      newPattern[index] = next;

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

      onPatternChange(newPattern);
    },
    [pattern, onPatternChange, isPlaying]
  );

  const isPlayingRef = useRef(isPlaying);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  const addCell = useCallback(() => {
    if (isPlayingRef.current) return;
    const p = patternRef.current;
    if (p.length >= MAX_CELLS) return;
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPatternChangeRef.current([...p, "normal"]);
  }, []);

  const removeCell = useCallback(() => {
    if (isPlayingRef.current) return;
    const p = patternRef.current;
    if (p.length <= MIN_CELLS) return;
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPatternChangeRef.current(p.slice(0, -1));
  }, []);

  const trackShake = useCallback((dx: number) => {
    const now = Date.now();
    const dir: "left" | "right" = dx < 0 ? "left" : "right";

    if (lastDirectionRef.current !== null && dir !== lastDirectionRef.current) {
      directionChangesRef.current.push(now);
    }
    lastDirectionRef.current = dir;

    directionChangesRef.current = directionChangesRef.current.filter(
      (t) => now - t < SHAKE_WINDOW_MS
    );

    if (directionChangesRef.current.length >= SHAKE_COUNT_TRIGGER) {
      directionChangesRef.current = [];
      lastDirectionRef.current = null;
      return true;
    }
    return false;
  }, []);

  const triggerReset = useCallback(() => {
    if (isPlayingRef.current) return;
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    shakeScale.value = withSequence(
      withTiming(0.85, { duration: 80 }),
      withSpring(1, { damping: 8, stiffness: 400 })
    );
    shakeRotate.value = withSequence(
      withTiming(-4, { duration: 40 }),
      withTiming(4, { duration: 40 }),
      withTiming(-2, { duration: 40 }),
      withTiming(0, { duration: 60 })
    );
    onResetRef.current();
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) => {
        if (isPlayingRef.current) return false;
        return Math.abs(gs.dy) > 12 || Math.abs(gs.dx) > 15;
      },
      onPanResponderGrant: () => {
        isDraggingUpRef.current = false;
        horizontalTriggeredRef.current = false;
        lastDirectionRef.current = null;
      },
      onPanResponderMove: (e, gs) => {
        if (isDraggingUpRef.current) {
          onDragMoveRef.current(e.nativeEvent.pageX, e.nativeEvent.pageY);
          return;
        }

        if (
          !horizontalTriggeredRef.current &&
          Math.abs(gs.dy) > 12 &&
          Math.abs(gs.dy) > Math.abs(gs.dx)
        ) {
          isDraggingUpRef.current = true;
          onDragStartRef.current();
          onDragMoveRef.current(e.nativeEvent.pageX, e.nativeEvent.pageY);
          return;
        }

        const dx = gs.dx;
        if (trackShake(dx)) {
          triggerReset();
          horizontalTriggeredRef.current = true;
          return;
        }

        if (
          !horizontalTriggeredRef.current &&
          Math.abs(dx) > SWIPE_THRESHOLD
        ) {
          horizontalTriggeredRef.current = true;
          if (dx > 0) {
            addCell();
          } else {
            removeCell();
          }
        }
      },
      onPanResponderRelease: (e) => {
        if (isDraggingUpRef.current) {
          isDraggingUpRef.current = false;
          onDragEndRef.current(e.nativeEvent.pageX, e.nativeEvent.pageY);
        }
        horizontalTriggeredRef.current = false;
        lastDirectionRef.current = null;
      },
      onPanResponderTerminate: (e) => {
        if (isDraggingUpRef.current) {
          isDraggingUpRef.current = false;
          onDragEndRef.current(e.nativeEvent.pageX, e.nativeEvent.pageY);
        }
        horizontalTriggeredRef.current = false;
        lastDirectionRef.current = null;
      },
    })
  ).current;

  const containerRef = useRef<View>(null);
  const webGestureRef = useRef({
    isDown: false,
    startX: 0,
    startY: 0,
    isDraggingUp: false,
    horizontalTriggered: false,
  });

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const node = containerRef.current as any;
    if (!node?.addEventListener) return;
    const el = node as unknown as HTMLElement;

    const handleDown = (e: MouseEvent) => {
      webGestureRef.current = {
        isDown: true,
        startX: e.clientX,
        startY: e.clientY,
        isDraggingUp: false,
        horizontalTriggered: false,
      };
      lastDirectionRef.current = null;
    };

    const handleMove = (e: MouseEvent) => {
      const g = webGestureRef.current;
      if (!g.isDown || isPlayingRef.current) return;

      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;

      if (g.isDraggingUp) {
        onDragMoveRef.current(e.clientX, e.clientY);
        return;
      }

      if (
        !g.horizontalTriggered &&
        Math.abs(dy) > 12 &&
        Math.abs(dy) > Math.abs(dx)
      ) {
        g.isDraggingUp = true;
        onDragStartRef.current();
        onDragMoveRef.current(e.clientX, e.clientY);
        return;
      }

      if (trackShake(dx)) {
        triggerReset();
        g.horizontalTriggered = true;
        return;
      }

      if (!g.horizontalTriggered && Math.abs(dx) > SWIPE_THRESHOLD) {
        g.horizontalTriggered = true;
        if (dx > 0) {
          addCell();
        } else {
          removeCell();
        }
      }
    };

    const handleUp = (e: MouseEvent) => {
      const g = webGestureRef.current;
      if (g.isDraggingUp) {
        onDragEndRef.current(e.clientX, e.clientY);
      }
      webGestureRef.current = {
        isDown: false,
        startX: 0,
        startY: 0,
        isDraggingUp: false,
        horizontalTriggered: false,
      };
      lastDirectionRef.current = null;
    };

    el.addEventListener("mousedown", handleDown);
    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);

    return () => {
      el.removeEventListener("mousedown", handleDown);
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
    };
  }, [trackShake, triggerReset, addCell, removeCell]);

  const shakeAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: shakeScale.value },
      { rotate: `${shakeRotate.value}deg` },
    ],
  }));

  const nativePanHandlers =
    Platform.OS !== "web" ? panResponder.panHandlers : {};

  return (
    <Animated.View
      ref={containerRef}
      style={[styles.wrapper, shakeAnimStyle]}
      {...nativePanHandlers}
    >
      <View style={styles.cellsContainer} testID="subdivision-cells">
        <View style={styles.swipeHint}>
          <Feather name="chevron-left" size={12} color={Colors.textTertiary} />
        </View>

        {(() => {
          const displayPattern = isPlaying && activeBeatPattern ? activeBeatPattern : pattern;
          return displayPattern.map((type, i) => {
            const isActive = isPlaying && i === activeSubNote;
            return (
              <Pressable
                key={i}
                onPress={() => {
                  if (!activeBeatPattern) cycleType(i);
                }}
                style={({ pressed }) => [pressed && !activeBeatPattern && { opacity: 0.6 }]}
                hitSlop={2}
                testID={`subdivision-cell-${i}`}
              >
                {type === "strong" ? (
                  <View style={[styles.cell, { overflow: "hidden", opacity: isPlaying ? (isActive ? 1 : 0.3) : 1 }]}>
                    <LinearGradient
                      colors={[Colors.white, C.accent, C.accentMuted]}
                      locations={[0, 0.35, 1]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={{ width: CELL_SIZE, height: CELL_SIZE, alignItems: "center", justifyContent: "center", borderRadius: 6 }}
                    >
                      <View style={{ width: CELL_SIZE - 10, height: CELL_SIZE - 10, borderRadius: 3, backgroundColor: C.accentMuted }} />
                    </LinearGradient>
                  </View>
                ) : (
                  <View
                    style={[
                      styles.cell,
                      {
                        backgroundColor: getCellColor(type, true, C.accent, C.accentMuted),
                        borderColor: getCellBorder(type),
                        borderWidth: type === "mute" ? 2 : 0,
                        opacity: isPlaying ? (isActive ? 1 : 0.3) : 1,
                      },
                    ]}
                  />
                )}
              </Pressable>
            );
          });
        })()}

        <View style={styles.swipeHint}>
          <Feather name="chevron-right" size={12} color={Colors.textTertiary} />
        </View>
      </View>
    </Animated.View>
  );
}

export function DragGhost({
  pattern,
  x,
  y,
}: {
  pattern: BeatType[];
  x: number;
  y: number;
}) {
  const { colors: GC } = useTheme();
  return (
    <View
      style={[
        styles.ghost,
        {
          left: x - (pattern.length * (18 + 2)) / 2,
          top: y - 12,
        },
      ]}
      pointerEvents="none"
    >
      {pattern.map((type, i) => (
        type === "strong" ? (
          <View key={i} style={[styles.ghostCell, { overflow: "hidden" }]}>
            <LinearGradient
              colors={[Colors.white, GC.accent, GC.accentMuted]}
              locations={[0, 0.35, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ width: 18, height: 18, alignItems: "center", justifyContent: "center", borderRadius: 4 }}
            >
              <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: GC.accentMuted }} />
            </LinearGradient>
          </View>
        ) : (
          <View
            key={i}
            style={[
              styles.ghostCell,
              {
                backgroundColor: getCellColor(type, true, GC.accent, GC.accentMuted),
                borderColor: getCellBorder(type),
                borderWidth: type === "mute" ? 1.5 : 0,
              },
            ]}
          />
        )
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
    width: "100%",
    cursor: "grab" as any,
    userSelect: "none" as any,
  },
  swipeHint: {
    opacity: 0.4,
    paddingHorizontal: 2,
  },
  cellsContainer: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-evenly",
    alignItems: "center",
  },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    borderRadius: 6,
  },
  ghost: {
    position: "absolute",
    flexDirection: "row",
    gap: 2,
    zIndex: 1000,
    opacity: 0.85,
  },
  ghostCell: {
    width: 18,
    height: 18,
    borderRadius: 4,
  },
});
