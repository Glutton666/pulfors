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
import { useScale } from "@/lib/scale";
import { Radius, Spacing } from "@/constants/tokens";
import type { ScaleValues } from "@/lib/scale";
import type { BeatType } from "@/lib/metronome-engine";
import { pureGetSubPattern } from "@/lib/metronome-engine-pure";
import { accentGradientEdge, onAccentColor, onAccentShadow } from "@/lib/color-contrast";
import { getSubdivisionCellLayout } from "@/lib/subdivision-cell-layout";
import {
  beginShakeTracking,
  createShakeTracker,
  resetShakeTracker,
  trackSubdivisionShake,
} from "@/lib/subdivision-shake";

interface SubdivisionBarProps {
  pattern: BeatType[];
  onPatternChange: (pattern: BeatType[]) => void;
  onDragStart: () => void;
  onDragMove: (pageX: number, pageY: number) => void;
  onDragEnd: (pageX: number, pageY: number) => void;
  onDragCancel?: () => void;
  onReset: () => void;
  isPlaying?: boolean;
  activeSubNote?: number;
  activeBeatPattern?: BeatType[] | null;
  /** 재생 중 현재 비트의 타입 — 지정 패턴이 없는 비트 차례에 실제 소리(단일 클릭)와 일치하는 1셀 표시용 */
  currentBeatType?: BeatType | null;
}

const MAX_CELLS = 8;
const MIN_CELLS = 1;
const SWIPE_THRESHOLD = 30;

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
  onDragCancel,
  onReset,
  isPlaying = false,
  activeSubNote = -1,
  activeBeatPattern = null,
  currentBeatType = null,
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
  const onDragCancelRef = useRef(onDragCancel);

  const shakeTrackerRef = useRef(createShakeTracker());

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
  useEffect(() => {
    onDragCancelRef.current = onDragCancel;
  }, [onDragCancel]);

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

  const triggerResetRef = useRef(triggerReset);
  const addCellRef = useRef(addCell);
  const removeCellRef = useRef(removeCell);
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
        beginShakeTracking(shakeTrackerRef.current);
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
        if (trackSubdivisionShake(shakeTrackerRef.current, dx, Date.now())) {
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
        resetShakeTracker(shakeTrackerRef.current);
      },
      onPanResponderTerminate: (e) => {
        if (isDraggingUpRef.current) {
          isDraggingUpRef.current = false;
        onDragCancelRef.current?.();
        }
        horizontalTriggeredRef.current = false;
        resetShakeTracker(shakeTrackerRef.current);
      },
    })
  ).current;

  const webGestureRef = useRef({
    isDown: false,
    startX: 0,
    startY: 0,
    isDraggingUp: false,
    horizontalTriggered: false,
  });

  useEffect(() => {
    if (Platform.OS !== "web") return;

    const handleDown = (e: PointerEvent) => {
      const target = e.target;
      if (
        !(target instanceof Element) ||
        !target.closest('[data-testid="subdivision-gesture-wrapper"]')
      ) {
        return;
      }

      webGestureRef.current = {
        isDown: true,
        startX: e.clientX,
        startY: e.clientY,
        isDraggingUp: false,
        horizontalTriggered: false,
      };
      beginShakeTracking(shakeTrackerRef.current);
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

      if (trackSubdivisionShake(shakeTrackerRef.current, dx, Date.now())) {
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

    const resetWebGesture = () => {
      webGestureRef.current = {
        isDown: false,
        startX: 0,
        startY: 0,
        isDraggingUp: false,
        horizontalTriggered: false,
      };
      resetShakeTracker(shakeTrackerRef.current);
    };

    const handleUp = (e: PointerEvent) => {
      const g = webGestureRef.current;
      if (g.isDraggingUp) {
        onDragEndRef.current(e.clientX, e.clientY);
      }
      resetWebGesture();
    };

    const handleCancel = () => {
      const g = webGestureRef.current;
      if (g.isDraggingUp) {
        onDragCancelRef.current?.();
      }
      resetWebGesture();
    };

    document.addEventListener("pointerdown", handleDown, true);
    document.addEventListener("pointermove", handleMove);
    document.addEventListener("pointerup", handleUp);
    document.addEventListener("pointercancel", handleCancel);
    document.addEventListener("lostpointercapture", handleCancel);

    return () => {
      document.removeEventListener("pointerdown", handleDown, true);
      document.removeEventListener("pointermove", handleMove);
      document.removeEventListener("pointerup", handleUp);
      document.removeEventListener("pointercancel", handleCancel);
      document.removeEventListener("lostpointercapture", handleCancel);
      if (webGestureRef.current.isDraggingUp) {
        onDragCancelRef.current?.();
      }
      resetWebGesture();
    };
  }, []);

  useEffect(() => () => {
    if (isDraggingUpRef.current) {
      onDragCancelRef.current?.();
    }
    isDraggingUpRef.current = false;
    horizontalTriggeredRef.current = false;
    resetShakeTracker(shakeTrackerRef.current);
  }, []);

  const shakeAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: shakeScale.value },
      { rotate: `${shakeRotate.value}deg` },
    ],
  }));

  const nativePanHandlers = Platform.OS !== "web" ? panResponder.panHandlers : {};

  // 재생 중에는 실제로 연주되는 내용만 표시한다. 엔진과 동일한 순수 함수로
  // 비트 타입 변환(뮤트 비트 → 전부 뮤트, strong/accent → 첫 셀 승격)까지 반영:
  // - 현재 비트에 지정 패턴이 있으면 변환된 그 패턴
  // - 없으면 단일 클릭(비트 타입 1셀) — 준비(스테이징) 패턴은 소리로 재생되지 않으므로 보여주지 않음
  const livePattern: BeatType[] | null = useMemo(() => {
    if (!currentBeatType) return null;
    const subs = new Map<number, BeatType[]>();
    if (activeBeatPattern && activeBeatPattern.length > 0) subs.set(0, activeBeatPattern);
    return pureGetSubPattern([currentBeatType], subs, 0);
  }, [currentBeatType, activeBeatPattern]);
  const displayPattern = isPlaying ? (livePattern ?? pattern) : pattern;
  const isShowingLivePattern = isPlaying && displayPattern !== pattern;
  const { cellSize, radius: dynamicRadius, fontSize: dynamicFontSize } = getSubdivisionCellLayout({
    containerWidth,
    cellCount: displayPattern.length,
    preferredCellSize: S.ms(28, 0.5),
    preferredGap: S.ms(3, 0.3),
  });

  return (
    <>
    <View
      testID="subdivision-gesture-wrapper"
      style={styles.gestureWrapper}
      {...nativePanHandlers}
    >
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
                if (!isShowingLivePattern) cycleType(i);
              }}
              onLongPress={() => {
                if (isPlaying) return;
                if (Platform.OS !== "web") {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                }
                setTypePicker({ cellIndex: i });
              }}
              delayLongPress={350}
              style={({ pressed }) => [pressed && !isShowingLivePattern && { opacity: 0.6 }]}
              hitSlop={8}
              testID={`subdivision-cell-${i}`}
            >
              {type === "strong" ? (
                <View style={{ width: cellSize, height: cellSize, borderRadius: dynamicRadius, overflow: "hidden", opacity: isPlaying ? (isActive ? 1 : 0.8) : 1 }}>
                  {/* LinearGradient에 자식(View/Text)을 중첩시키면 이 빌드에서
                      배경은 그려지는데 자식 콘텐츠가 합성되지 않는 문제가
                      있었다 (2026-08-25 실기기 확인 — "S" 표시가 항상 안 보임).
                      그라디언트는 자식 없이 배경만 그리고, 텍스트는 형제
                      요소로 절대위치 오버레이한다. */}
                  <LinearGradient
                    key={C.accent}
                    colors={[accentGradientEdge(C.accent), C.accent, C.accent]}
                    locations={[0, 0.4, 1]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{ width: cellSize, height: cellSize }}
                  />
                  <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ color: onAccentColor(C.accent), fontSize: dynamicFontSize, fontWeight: "bold" as const, lineHeight: dynamicFontSize + 2, textShadowColor: onAccentShadow(C.accent), textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 3 }}>S</Text>
                  </View>
                </View>
              ) : (
                <View
                  style={[
                    {
                      width: cellSize,
                      height: cellSize,
                      borderRadius: dynamicRadius,
                      backgroundColor: getCellColor(type, true, C.accent, C.accentMuted, C.text, C.textTertiary),
                      borderColor: getCellBorder(type, C.textTertiary, C.white),
                      borderWidth: type === "mute" ? 2 : 0,
                      // 재생 중에도 현재 비트의 패턴이 뚜렷이 보이도록 비활성 셀을
                      // 지나치게 어둡게(0.3) 만들지 않는다 — 활성 셀은 하이라이트로 구분됨.
                      opacity: isPlaying ? (isActive ? 1 : 0.7) : 1,
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
                  accessibilityRole="radio"
                  aria-checked={isSelected}
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
      testID="subdivision-drag-ghost"
      style={[
        styles.ghost,
        {
          // pageX/pageY are viewport coordinates on web. A fixed overlay
          // keeps the ghost aligned while the bar list or drawer scrolls.
          position: Platform.OS === "web" ? ("fixed" as "absolute") : "absolute",
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
              key={GC.accent}
              colors={[accentGradientEdge(GC.accent), GC.accent, GC.accent]}
              locations={[0, 0.4, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ width: 18, height: 18, borderRadius: Radius.xs }}
            />
            <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: onAccentColor(GC.accent), fontSize: 8, fontWeight: "bold" as const, lineHeight: 10, textShadowColor: onAccentShadow(GC.accent), textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 2 }}>S</Text>
            </View>
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
    touchAction: "none" as any,
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
    borderRadius: Radius.xs,
  },
  typePickerLabel: {
    fontSize: 15,
    letterSpacing: 0.1,
  },
});
