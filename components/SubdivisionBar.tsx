import React, { useRef, useCallback, useEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  PanResponder,
  Platform,
  Modal,
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
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import Colors from "@/constants/colors";
import { moderateScale, IS_TABLET, useScale } from "@/lib/scale";
import { Radius, Spacing } from "@/constants/tokens";
import type { ScaleValues } from "@/lib/scale";
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

const CELL_SIZE = IS_TABLET ? moderateScale(28, 0.4) : moderateScale(28, 0.4);
const CELL_GAP = IS_TABLET ? moderateScale(4, 0.3) : moderateScale(3, 0.3);
const MAX_CELLS = 8;
const MIN_CELLS = 1;
const SWIPE_THRESHOLD = 30;
const SHAKE_WINDOW_MS = 2000;
const SHAKE_COUNT_TRIGGER = 4;

function getCellColor(type: BeatType, active: boolean, accentColor: string, accentMutedColor: string, textColor: string, textTertiaryColor: string): string {
  if (type === "strong") return accentColor;
  if (type === "accent") return active ? accentColor : accentMutedColor;
  if (type === "normal") return active ? textColor : textTertiaryColor;
  return "transparent";
}

function getCellBorder(type: BeatType, textTertiaryColor: string, whiteColor: string): string {
  if (type === "mute") return textTertiaryColor;
  if (type === "strong") return whiteColor;
  return "transparent";
}

const BEAT_TYPES: BeatType[] = ["normal", "accent", "strong", "mute"];

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
  const { t } = useLanguage();
  const S = useScale();
  const styles = useMemo(() => make_styles(C, S), [C, S]);
  const [containerWidth, setContainerWidth] = useState(0);
  const [typePicker, setTypePicker] = useState<{ cellIndex: number } | null>(null);
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

  const trackShakeRef = useRef(trackShake);
  const triggerResetRef = useRef(triggerReset);
  const addCellRef = useRef(addCell);
  const removeCellRef = useRef(removeCell);
  useEffect(() => { trackShakeRef.current = trackShake; }, [trackShake]);
  useEffect(() => { triggerResetRef.current = triggerReset; }, [triggerReset]);
  useEffect(() => { addCellRef.current = addCell; }, [addCell]);
  useEffect(() => { removeCellRef.current = removeCell; }, [removeCell]);

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

  const webContainerRef = useRef<View>(null);
  const webGestureRef = useRef({
    isDown: false,
    startX: 0,
    startY: 0,
    isDraggingUp: false,
    horizontalTriggered: false,
  });

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const node = webContainerRef.current as unknown as HTMLElement;
    if (!node?.addEventListener) return;

    const handleDown = (e: PointerEvent) => {
      webGestureRef.current = {
        isDown: true,
        startX: e.clientX,
        startY: e.clientY,
        isDraggingUp: false,
        horizontalTriggered: false,
      };
      lastDirectionRef.current = null;
      directionChangesRef.current = [];
    };

    const handleMove = (e: PointerEvent) => {
      const g = webGestureRef.current;
      if (!g.isDown || isPlayingRef.current) return;

      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;

      if (g.isDraggingUp) {
        onDragMoveRef.current(e.clientX, e.clientY);
        return;
      }

      if (trackShakeRef.current(dx)) {
        triggerResetRef.current();
        g.horizontalTriggered = true;
        g.isDown = false;
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

      if (!g.horizontalTriggered && Math.abs(dx) > SWIPE_THRESHOLD) {
        g.horizontalTriggered = true;
        if (dx > 0) {
          addCellRef.current();
        } else {
          removeCellRef.current();
        }
      }
    };

    const handleUp = (e: PointerEvent) => {
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

    node.addEventListener("pointerdown", handleDown, true);
    document.addEventListener("pointermove", handleMove);
    document.addEventListener("pointerup", handleUp);

    return () => {
      node.removeEventListener("pointerdown", handleDown, true);
      document.removeEventListener("pointermove", handleMove);
      document.removeEventListener("pointerup", handleUp);
    };
  }, []);

  const shakeAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: shakeScale.value },
      { rotate: `${shakeRotate.value}deg` },
    ],
  }));

  const nativePanHandlers = Platform.OS !== "web" ? panResponder.panHandlers : {};

  const displayPattern = isPlaying && activeBeatPattern ? activeBeatPattern : pattern;
  const baseCellSize = S.isTablet ? S.ms(28, 0.5) : CELL_SIZE;
  const baseCellGap = S.isTablet ? S.ms(4, 0.4) : CELL_GAP;
  const hintWidth = 16;
  const availableWidth = containerWidth > 0 ? containerWidth - hintWidth * 2 : 0;
  const cellCount = displayPattern.length;
  const dynamicCellSize = availableWidth > 0
    ? Math.min(baseCellSize, Math.floor((availableWidth - baseCellGap * (cellCount - 1)) / cellCount))
    : baseCellSize;
  const clampedCellSize = Math.max(14, dynamicCellSize);
  const dynamicRadius = Math.max(4, Math.round(clampedCellSize * 4 / baseCellSize));
  const dynamicFontSize = Math.max(7, Math.round(clampedCellSize * 11 / baseCellSize));

  return (
    <>
    <View ref={webContainerRef} style={styles.gestureWrapper} {...nativePanHandlers}>
    <Animated.View
      style={[styles.wrapper, shakeAnimStyle]}
      onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
    >
      <View style={styles.cellsContainer} testID="subdivision-cells">
        <View style={styles.swipeHint}>
          <Feather name="chevron-left" size={S.ms(12, 0.4)} color={C.textTertiary} />
        </View>

        {displayPattern.map((type, i) => {
          const isActive = isPlaying && i === activeSubNote;
          return (
            <Pressable
              key={i}
              onPress={() => {
                if (!activeBeatPattern) cycleType(i);
              }}
              onLongPress={() => {
                if (isPlaying) return;
                if (Platform.OS !== "web") {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                }
                setTypePicker({ cellIndex: i });
              }}
              delayLongPress={350}
              style={({ pressed }) => [pressed && !activeBeatPattern && { opacity: 0.6 }]}
              hitSlop={8}
              testID={`subdivision-cell-${i}`}
            >
              {type === "strong" ? (
                <View style={[{ width: clampedCellSize, height: clampedCellSize, borderRadius: dynamicRadius, overflow: "hidden", backgroundColor: C.accent, opacity: isPlaying ? (isActive ? 1 : 0.55) : 1 }]}>
                  <LinearGradient
                    key={C.accent}
                    colors={[C.white, C.accent, C.accent]}
                    locations={[0, 0.4, 1]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{ width: clampedCellSize, height: clampedCellSize, alignItems: "center", justifyContent: "center", borderRadius: dynamicRadius }}
                  >
                    <Text style={{ color: C.white, fontSize: dynamicFontSize, fontWeight: "bold" as const, lineHeight: dynamicFontSize + 2, textShadowColor: "rgba(0,0,0,0.6)", textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 3 }}>S</Text>
                  </LinearGradient>
                </View>
              ) : (
                <View
                  style={[
                    {
                      width: clampedCellSize,
                      height: clampedCellSize,
                      borderRadius: dynamicRadius,
                      backgroundColor: getCellColor(type, true, C.accent, C.accentMuted, C.text, C.textTertiary),
                      borderColor: getCellBorder(type, C.textTertiary, C.white),
                      borderWidth: type === "mute" ? 2 : 0,
                      opacity: isPlaying ? (isActive ? 1 : 0.3) : 1,
                    },
                  ]}
                />
              )}
            </Pressable>
          );
        })}

        <View style={styles.swipeHint}>
          <Feather name="chevron-right" size={S.ms(12, 0.4)} color={C.textTertiary} />
        </View>
      </View>
    </Animated.View>
    </View>

    {typePicker !== null && (
      <Modal
        transparent
        animationType="fade"
        visible={true}
        onRequestClose={() => setTypePicker(null)}
        statusBarTranslucent
      >
        <Pressable
          style={styles.typePickerOverlay}
          onPress={() => setTypePicker(null)}
          testID="type-picker-overlay"
        >
          <View style={[styles.typePickerMenu, { backgroundColor: C.backgroundSecondary, shadowColor: C.text }]} testID="type-picker-menu">
            {BEAT_TYPES.map((bt) => {
              const isSelected = pattern[typePicker.cellIndex] === bt;
              return (
                <Pressable
                  key={bt}
                  testID={`type-picker-option-${bt}`}
                  onPress={() => {
                    const newPattern = [...pattern];
                    newPattern[typePicker.cellIndex] = bt;
                    if (Platform.OS !== "web") {
                      Haptics.impactAsync(
                        bt === "strong"
                          ? Haptics.ImpactFeedbackStyle.Heavy
                          : bt === "accent"
                          ? Haptics.ImpactFeedbackStyle.Heavy
                          : bt === "mute"
                          ? Haptics.ImpactFeedbackStyle.Light
                          : Haptics.ImpactFeedbackStyle.Medium
                      );
                    }
                    onPatternChange(newPattern);
                    setTypePicker(null);
                  }}
                  style={[
                    styles.typePickerOption,
                    isSelected && { backgroundColor: C.accent + "22" },
                  ]}
                >
                  <View style={[styles.typePickerSwatch, {
                    backgroundColor: bt === "strong" ? C.accent : bt === "accent" ? C.accentMuted : bt === "normal" ? C.text : "transparent",
                    borderWidth: bt === "mute" ? 1.5 : 0,
                    borderColor: bt === "mute" ? C.textTertiary : "transparent",
                  }]} />
                  <Text style={[styles.typePickerLabel, {
                    color: isSelected ? C.accent : C.text,
                    fontWeight: isSelected ? ("700" as const) : ("400" as const),
                  }]}>
                    {t("beatTypes", bt)}
                  </Text>
                  {isSelected && (
                    <Feather name="check" size={14} color={C.accent} style={{ marginLeft: "auto" }} />
                  )}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    )}
    </>
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
  const S = useScale();
  const styles = useMemo(() => make_styles(GC, S), [GC, S]);
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
          <View key={i} style={[styles.ghostCell, { overflow: "hidden", backgroundColor: GC.accent }]}>
            <LinearGradient
              key={GC.accent}
              colors={[GC.white, GC.accent, GC.accent]}
              locations={[0, 0.4, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ width: 18, height: 18, alignItems: "center", justifyContent: "center", borderRadius: Radius.xs }}
            >
              <Text style={{ color: GC.white, fontSize: 8, fontWeight: "bold" as const, lineHeight: 10, textShadowColor: "rgba(0,0,0,0.6)", textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 2 }}>S</Text>
            </LinearGradient>
          </View>
        ) : (
          <View
            key={i}
            style={[
              styles.ghostCell,
              {
                backgroundColor: getCellColor(type, true, GC.accent, GC.accentMuted, GC.text, GC.textTertiary),
                borderColor: getCellBorder(type, GC.textTertiary, GC.white),
                borderWidth: type === "mute" ? 1.5 : 0,
              },
            ]}
          />
        )
      ))}
    </View>
  );
}

const make_styles = (C: typeof Colors, S: ScaleValues) => StyleSheet.create({
  gestureWrapper: {
    width: "100%",
    cursor: "grab" as any,
    userSelect: "none" as any,
  },
  wrapper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: S.ms(6, 0.3),
    width: "100%",
  },
  swipeHint: {
    opacity: 0.4,
    paddingHorizontal: Spacing.xxs,
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
    borderRadius: S.ms(6, 0.3),
  } as any,
  ghost: {
    position: "absolute",
    flexDirection: "row",
    gap: Spacing.xxs,
    zIndex: 1000,
    opacity: 0.85,
  },
  ghostCell: {
    width: S.ms(18, 0.4),
    height: S.ms(18, 0.4),
    borderRadius: S.ms(4, 0.3),
  },
  typePickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  typePickerMenu: {
    borderRadius: Radius.md,
    overflow: "hidden",
    minWidth: 180,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 12,
  },
  typePickerOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  typePickerSwatch: {
    width: 14,
    height: 14,
    borderRadius: 4,
  },
  typePickerLabel: {
    fontSize: 15,
    letterSpacing: 0.1,
  },
});
