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
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  useAnimatedReaction,
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
import { useLanguage } from "@/contexts/LanguageContext";
import { moderateScale, SCREEN_WIDTH, IS_TABLET, useScale } from "@/lib/scale";
import type { ScaleValues } from "@/lib/scale";

export type BeatType = "strong" | "accent" | "normal" | "mute";

const DIAL_SIZE = IS_TABLET
  ? Math.min(SCREEN_WIDTH - 80, 420)
  : Math.min(SCREEN_WIDTH - 48, moderateScale(300));
const DIAL_RADIUS = DIAL_SIZE / 2;
const DOT_RADIUS_FROM_CENTER = DIAL_RADIUS - moderateScale(30, 0.4);
const DOT_SIZE = IS_TABLET ? moderateScale(40, 0.4) : moderateScale(34, 0.4);
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
  beatDirection?: "cw" | "ccw";
  dDialRadius: number;
  dDotRadiusFromCenter: number;
  dDotSize: number;
}

function DialBeatDot({
  index,
  total,
  isActive,
  beatType,
  onPress,
  isDropTarget,
  subdivisionCount,
  beatDirection = "cw",
  dDialRadius,
  dDotRadiusFromCenter,
  dDotSize,
}: DialBeatDotProps) {
  const { colors: C } = useTheme();
  const isStrong = beatType === "strong";
  const isAccent = beatType === "accent" || isStrong;
  const isMute = beatType === "mute";
  const dirMul = beatDirection === "ccw" ? -1 : 1;
  const angle = dirMul * (index / total) * 2 * Math.PI - Math.PI / 2;
  const size = dDotSize;
  const x = dDialRadius + dDotRadiusFromCenter * Math.cos(angle) - size / 2;
  const y = dDialRadius + dDotRadiusFromCenter * Math.sin(angle) - size / 2;

  const popScale = useSharedValue(1);
  const beatScale = useSharedValue(1);
  const beatBg = useSharedValue(
    isMute ? "transparent" : isAccent ? C.accentMuted : C.textTertiary
  );
  const beatBorder = useSharedValue(
    isMute ? C.textSecondary : "transparent"
  );
  const beatOpacity = useSharedValue(isStrong ? 0.85 : 1);

  const activeSV = useSharedValue(isActive ? 1 : 0);
  useEffect(() => {
    activeSV.value = isActive ? 1 : 0;
  }, [isActive]);

  const accentColor = C.accent;
  const accentMutedColor = C.accentMuted;

  const handlePress = useCallback(() => {
    popScale.value = withSequence(
      withTiming(0.85, { duration: 40, easing: Easing.out(Easing.quad) }),
      withTiming(1, { duration: 100, easing: Easing.out(Easing.quad) })
    );
    onPress();
  }, [onPress]);

  const beatTypeTag = useSharedValue(0);
  const currentTag = (isMute ? 1 : isStrong ? 2 : isAccent ? 3 : 0) + accentColor.length * 0.001;
  useEffect(() => {
    beatTypeTag.value = currentTag;
  }, [currentTag]);

  useAnimatedReaction(
    () => [activeSV.value, beatTypeTag.value] as const,
    ([curActive, _curTag], prev) => {
      const prevActive = prev ? prev[0] : -1;
      const activeChanged = curActive !== prevActive;
      const active = curActive === 1;
      if (isMute) {
        if (active) {
          if (activeChanged) {
            beatScale.value = withSequence(
              withTiming(1.15, { duration: 50, easing: Easing.out(Easing.quad) }),
              withTiming(1, { duration: 200, easing: Easing.out(Easing.quad) })
            );
          }
          beatBg.value = withTiming("rgba(72, 79, 88, 0.35)", { duration: 50 });
          beatBorder.value = withTiming(C.textSecondary, { duration: 50 });
        } else {
          if (activeChanged) {
            beatScale.value = withTiming(1, { duration: 150 });
          }
          beatBg.value = withTiming("transparent", { duration: 150 });
          beatBorder.value = withTiming(C.textSecondary, { duration: 150 });
        }
      } else if (active) {
        if (activeChanged) {
          beatScale.value = withSequence(
            withTiming(isStrong ? 1.35 : 1.2, { duration: 50, easing: Easing.out(Easing.quad) }),
            withTiming(1, { duration: 200, easing: Easing.out(Easing.quad) })
          );
        }
        beatBg.value = withTiming(
          isAccent ? accentColor : C.text,
          { duration: 50 }
        );
        beatBorder.value = withTiming(isStrong ? accentColor : "transparent", { duration: 50 });
        beatOpacity.value = withTiming(1, { duration: 50 });
      } else {
        if (activeChanged) {
          beatScale.value = withTiming(1, { duration: 150 });
        }
        beatBg.value = withTiming(
          isStrong ? accentColor : isAccent ? accentMutedColor : C.textTertiary,
          { duration: 150 }
        );
        beatBorder.value = withTiming(isStrong ? accentColor : "transparent", { duration: 150 });
        beatOpacity.value = withTiming(isStrong ? 0.85 : 1, { duration: 150 });
      }
    },
    [isMute, isStrong, isAccent, accentColor, accentMutedColor]
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: beatScale.value * popScale.value }],
    backgroundColor: beatBg.value,
    borderColor: beatBorder.value,
    opacity: beatOpacity.value,
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
            },
            animatedStyle,
          ]}
        >
          <LinearGradient
            colors={[C.white, C.accent, C.accent]}
            locations={[0, 0.4, 1]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={{ width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center" }}
          >
            <View style={{ width: size - 10, height: size - 10, borderRadius: (size - 10) / 2, backgroundColor: C.accent, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: C.white, fontSize: 11, fontWeight: "bold" as const, lineHeight: 13, textShadowColor: "rgba(0,0,0,0.5)", textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 3 }}>S</Text>
            </View>
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
                : C.textTertiary,
              borderWidth: isMute ? 2.5 : 0,
              borderColor: isMute ? C.textSecondary : "transparent",
            },
            animatedStyle,
          ]}
        />
      )}
      {isDropTarget && (
        <View
          style={{
            position: "absolute",
            borderWidth: 2,
            borderStyle: "dashed" as any,
            opacity: 0.8,
            width: size + 12,
            height: size + 12,
            borderRadius: (size + 12) / 2,
            top: -6,
            left: -6,
            borderColor: C.accent,
          }}
        />
      )}
      {subdivisionCount > 1 && (
        <View style={{
          position: "absolute",
          bottom: -4,
          right: -4,
          width: 16,
          height: 16,
          borderRadius: 8,
          borderWidth: 1,
          alignItems: "center" as const,
          justifyContent: "center" as const,
          borderColor: C.accent,
        }}>
          <Text style={{
            fontFamily: "SpaceGrotesk_700Bold",
            fontSize: 9,
            color: C.accent,
          }}>{subdivisionCount}</Text>
        </View>
      )}
    </Pressable>
  );
}

export interface BarRepeat {
  type: "count" | "duration";
  value: number;
  bpm?: number;
}

export interface LoopBlock {
  startBeat: number;
  endBeat: number;
  type: "count" | "duration";
  value: number;
  jumpToBlock?: number;
  jumpCount?: number;
  bpm?: number;
  layerOf?: number;
  ownBeatTypes?: Record<number, string>;
  ownSubdivisions?: Record<string, string[]>;
}

interface BeatIndicatorProps {
  beatsPerMeasure: number;
  currentBeat: number;
  isPlaying: boolean;
  isPreparing?: boolean;
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
  loopBlocks: LoopBlock[];
  onLoopBlocksChange: (blocks: LoopBlock[]) => void;
  barLoopMode: "loop" | "once";
  onBarLoopModeChange: (mode: "loop" | "once") => void;
  blockPlayMode: "sequential" | "loop" | "random";
  onBlockPlayModeChange: (mode: "sequential" | "loop" | "random") => void;
  onBarQuickSave?: () => Promise<boolean> | void;
  onResetFlash?: () => void;
  onBarScrollOffset?: (offset: number) => void;
  onBarTimerExpired?: () => void;
  subdivisionBarElement?: React.ReactNode;
  bpmSliderElement?: React.ReactNode;
  onBarClockConfigChange?: (mode: "stopwatch" | "timer", duration: number) => void;
  initialBarClockMode?: "stopwatch" | "timer";
  initialBarTimerDuration?: number;
  noteSamples?: Record<string, string>;
  noteSampleNames?: Record<string, string>;
  noteSampleSources?: Record<string, string>;
  onNoteRecordRequest?: (beatIndex: number, subIndex: number) => void;
  bpm?: number;
  barStartBeat?: number | null;
  onBarStartBeatSelect?: (beat: number | null) => void;
  progressInfo?: { beat: number; barRepeatCurrent: number; barRepeatTotal: number; blockIndex: number; blockRepeatCurrent: number; blockRepeatTotal: number; jumpCurrent?: number; jumpTotal?: number; jumpSourceBlockIndex?: number; layerIndex?: number; layerBeat?: number } | null;
  layerProgressMap?: Record<string, number>;
  measureCount?: number;
  onBarReset?: () => void;
  halfTime?: boolean;
  isLandscape?: boolean;
  beatDirection?: "cw" | "ccw";
  onEnterNoteMode?: () => void;
}

interface BlockPillProps {
  origIndex: number;
  block: LoopBlock;
  isEditing: boolean;
  isActive: boolean;
  isPlaying: boolean;
  isDragSource: boolean;
  isDropTarget: boolean;
  hasJump: boolean;
  layerCount: number;
  beatsPerMeasure: number;
  progressInfo?: any;
  accentColor: string;
  textColor: string;
  textTertiaryColor: string;
  bgSecondary: string;
  whiteColor: string;
  onPress: () => void;
  onDragStart: (origIndex: number) => void;
  onDragMove: (origIndex: number, pageX: number, pageY: number) => void;
  onDragEnd: (origIndex: number, pageX: number, pageY: number) => void;
  onMeasure: (origIndex: number, layout: { x: number; y: number; w: number; h: number }) => void;
  size?: "small" | "normal";
}

const BlockPill = React.memo(function BlockPill({
  origIndex, block, isEditing, isActive, isPlaying, isDragSource, isDropTarget, hasJump,
  layerCount, beatsPerMeasure, progressInfo, accentColor, textColor, textTertiaryColor,
  bgSecondary, whiteColor, onPress, onDragStart, onDragMove, onDragEnd, onMeasure, size = "small",
}: BlockPillProps) {
  const pillRef = useRef<View>(null);
  const isDraggingRef = useRef(false);
  const isPlayingRef = useRef(isPlaying);
  const origIndexRef = useRef(origIndex);
  const onDragStartRef = useRef(onDragStart);
  const onDragMoveRef = useRef(onDragMove);
  const onDragEndRef = useRef(onDragEnd);

  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { origIndexRef.current = origIndex; }, [origIndex]);
  useEffect(() => { onDragStartRef.current = onDragStart; }, [onDragStart]);
  useEffect(() => { onDragMoveRef.current = onDragMove; }, [onDragMove]);
  useEffect(() => { onDragEndRef.current = onDragEnd; }, [onDragEnd]);

  useEffect(() => {
    if (!pillRef.current) return;
    const measure = () => (pillRef.current as any)?.measureInWindow?.((x: number, y: number, w: number, h: number) => {
      if (w > 0) onMeasure(origIndex, { x, y, w, h });
    });
    setTimeout(measure, 50);
  }, [origIndex, block.startBeat, block.endBeat]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) => {
        if (isPlayingRef.current) return false;
        return Math.abs(gs.dy) > 10;
      },
      onPanResponderGrant: () => { isDraggingRef.current = false; },
      onPanResponderMove: (e, gs) => {
        const idx = origIndexRef.current;
        if (isDraggingRef.current) {
          onDragMoveRef.current(idx, e.nativeEvent.pageX, e.nativeEvent.pageY);
          return;
        }
        if (Math.abs(gs.dy) > 10) {
          isDraggingRef.current = true;
          onDragStartRef.current(idx);
          onDragMoveRef.current(idx, e.nativeEvent.pageX, e.nativeEvent.pageY);
        }
      },
      onPanResponderRelease: (e) => {
        if (isDraggingRef.current) {
          isDraggingRef.current = false;
          onDragEndRef.current(origIndexRef.current, e.nativeEvent.pageX, e.nativeEvent.pageY);
        }
      },
      onPanResponderTerminate: (e) => {
        if (isDraggingRef.current) {
          isDraggingRef.current = false;
          onDragEndRef.current(origIndexRef.current, e.nativeEvent.pageX, e.nativeEvent.pageY);
        }
      },
    })
  ).current;

  const webGestureRef = useRef({ isDown: false, startX: 0, startY: 0, isDragging: false });

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const node = pillRef.current as unknown as HTMLElement;
    if (!node?.addEventListener) return;

    const handleDown = (e: PointerEvent) => {
      webGestureRef.current = { isDown: true, startX: e.clientX, startY: e.clientY, isDragging: false };
    };
    const handleMove = (e: PointerEvent) => {
      const g = webGestureRef.current;
      if (!g.isDown || isPlayingRef.current) return;
      const idx = origIndexRef.current;
      if (g.isDragging) {
        onDragMoveRef.current(idx, e.clientX, e.clientY);
        return;
      }
      const dy = e.clientY - g.startY;
      if (Math.abs(dy) > 10) {
        g.isDragging = true;
        onDragStartRef.current(idx);
        onDragMoveRef.current(idx, e.clientX, e.clientY);
      }
    };
    const handleUp = (e: PointerEvent) => {
      const g = webGestureRef.current;
      if (g.isDragging) {
        onDragEndRef.current(origIndexRef.current, e.clientX, e.clientY);
      }
      webGestureRef.current = { isDown: false, startX: 0, startY: 0, isDragging: false };
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

  const nativePan = Platform.OS !== "web" ? panResponder.panHandlers : {};
  const isSmall = size === "small";
  const px = isSmall ? 6 : 8;
  const py = isSmall ? 2 : 4;
  const br = isSmall ? 4 : 6;
  const mw = isSmall ? 36 : 48;
  const fs1 = isSmall ? 10 : 12;
  const fs2 = isSmall ? 8 : 9;
  const badgeSize = isSmall ? { top: -3, right: -3, r: 5, mw: 10, h: 10, px: 1, fs: 6 } : { top: -4, right: -4, r: 6, mw: 12, h: 12, px: 2, fs: 7 };

  return (
    <View ref={pillRef} {...nativePan}>
      <Pressable
        onPress={onPress}
        style={{
          paddingHorizontal: px, paddingVertical: py, borderRadius: br,
          backgroundColor: isDropTarget ? accentColor + "50" : isActive ? accentColor + "30" : isEditing ? accentColor + "20" : bgSecondary,
          borderWidth: isDropTarget ? 2 : isActive ? (isSmall ? 1 : 1.5) : isEditing ? 1 : 0,
          borderColor: isDropTarget ? accentColor : isActive ? accentColor : isEditing ? accentColor + "60" : "transparent",
          minWidth: mw, alignItems: "center",
          opacity: isDragSource ? 0.3 : 1,
        }}
      >
        <Text style={{ color: isActive ? accentColor : textColor, fontSize: fs1, fontFamily: "SpaceGrotesk_700Bold" }}>
          {block.startBeat + 1}-{Math.min(block.endBeat + 1, beatsPerMeasure)}
        </Text>
        <Text style={{ color: isActive ? accentColor : textTertiaryColor, fontSize: fs2, fontFamily: "SpaceGrotesk_500Medium" }}>
          ×{block.value}
          {isActive && progressInfo?.blockRepeatTotal > 1 && ` ${progressInfo.blockRepeatCurrent + 1}/${progressInfo.blockRepeatTotal}`}
        </Text>
        {layerCount > 0 && (
          <View style={{ position: "absolute" as any, top: badgeSize.top, right: badgeSize.right, backgroundColor: accentColor, borderRadius: badgeSize.r, minWidth: badgeSize.mw, height: badgeSize.h, alignItems: "center", justifyContent: "center", paddingHorizontal: badgeSize.px }}>
            <Ionicons name="layers-outline" size={badgeSize.fs + 1} color={whiteColor} />
          </View>
        )}
      </Pressable>
    </View>
  );
});

export function BeatIndicator({
  beatsPerMeasure,
  currentBeat,
  isPlaying,
  isPreparing = false,
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
  loopBlocks,
  onLoopBlocksChange,
  barLoopMode,
  onBarLoopModeChange,
  blockPlayMode,
  onBlockPlayModeChange,
  onBarQuickSave,
  onResetFlash,
  onBarScrollOffset,
  onBarTimerExpired,
  subdivisionBarElement,
  bpmSliderElement,
  onBarClockConfigChange,
  initialBarClockMode,
  initialBarTimerDuration,
  noteSamples,
  noteSampleNames,
  noteSampleSources,
  onNoteRecordRequest,
  bpm,
  barStartBeat,
  onBarStartBeatSelect,
  progressInfo,
  layerProgressMap = {},
  measureCount = 0,
  onBarReset,
  halfTime,
  isLandscape = false,
  beatDirection = "cw",
  onEnterNoteMode,
}: BeatIndicatorProps) {
  const { colors: C, getImageForBeatType, hubImages } = useTheme();
  const { t } = useLanguage();
  const S = useScale();
  const styles = useMemo(() => make_styles(C, S), [C, S]);

  const SWIPE_THRESHOLD = S.screenWidth * 0.35;

  const beats = Array.from({ length: beatsPerMeasure }, (_, i) => i);

  const sampleCoveredCells = useMemo(() => {
    const covered = new Map<string, string>();
    if (!noteSamples || !bpm || bpm <= 0) return covered;
    const beatDurMs = 60000 / bpm;

    const getBarDurationMs = (beat: number): number => {
      const rep = barRepeats[beat];
      if (!rep) return beatDurMs;
      if (rep.type === "count") return beatDurMs * Math.max(1, rep.value);
      return Math.max(beatDurMs, rep.value * 1000);
    };

    const markCell = (cellKey: string, source: string) => {
      const existing = covered.get(cellKey);
      if (existing === "recording") return;
      covered.set(cellKey, source);
    };

    for (const [key, uri] of Object.entries(noteSamples)) {
      const [beatStr, subStr] = key.split("-");
      const triggerBeat = parseInt(beatStr, 10);
      const triggerSub = parseInt(subStr, 10);
      if (isNaN(triggerBeat) || isNaN(triggerSub)) continue;
      if (triggerBeat >= beatsPerMeasure) continue;

      const source = (noteSampleSources && noteSampleSources[key]) || "recording";

      const hashParts = uri.split("#t=")[1];
      let durationMs = 0;
      if (hashParts) {
        const parts = hashParts.split(",").map(Number);
        const startMs = !isNaN(parts[0]) ? parts[0] : 0;
        const endMs = parts.length > 1 && !isNaN(parts[1]) ? parts[1] : 0;
        if (endMs > startMs) durationMs = endMs - startMs;
      }

      markCell(key, source);

      if (durationMs <= 0) continue;

      let remainMs = durationMs;
      const triggerPattern = beatSubdivisions[String(triggerBeat)];
      const triggerSubCount = triggerPattern ? triggerPattern.length : 1;
      const triggerSubDur = beatDurMs / triggerSubCount;

      for (let si = triggerSub; si < triggerSubCount && remainMs > 0; si++) {
        markCell(`${triggerBeat}-${si}`, source);
        remainMs -= triggerSubDur;
      }

      const triggerBarDur = getBarDurationMs(triggerBeat);
      const triggerRepeatExtraMs = triggerBarDur - beatDurMs;
      remainMs -= triggerRepeatExtraMs;

      let b = triggerBeat + 1;

      while (remainMs > 0 && b < beatsPerMeasure) {
        const curPattern = beatSubdivisions[String(b)];
        const curSubCount = curPattern ? curPattern.length : 1;
        const curSubDur = beatDurMs / curSubCount;
        const fullBarDur = getBarDurationMs(b);

        if (remainMs >= fullBarDur) {
          for (let si = 0; si < curSubCount; si++) {
            markCell(`${b}-${si}`, source);
          }
          remainMs -= fullBarDur;
          b++;
        } else {
          let leftMs = remainMs;
          for (let si = 0; si < curSubCount && leftMs > 0; si++) {
            markCell(`${b}-${si}`, source);
            leftMs -= curSubDur;
          }
          remainMs = 0;
        }
      }
    }
    return covered;
  }, [noteSamples, noteSampleSources, bpm, beatsPerMeasure, beatSubdivisions, barRepeats]);

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

    if (dx > 0 && canAdd) {
      swipeDirection.value = 1;
      swipeProgress.value = progress;
    } else if (dx < 0 && canRemove) {
      swipeDirection.value = -1;
      swipeProgress.value = progress;
    } else {
      swipeDirection.value = 0;
      swipeProgress.value = 0;
    }

    if (progress >= 1 && !triggeredRef.current) {
      triggeredRef.current = true;
      if (dx > 0 && canAdd) {
        if (Platform.OS !== "web") {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
        onBeatsChangeRef.current(beatsRef.current + 1);
      } else if (dx < 0 && canRemove) {
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
  const barScrollYRef = useRef(0);
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

  const resetFlash = useSharedValue(0);

  const barClockSwipePan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_e, g) => !isPlaying && Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderRelease: (_e, g) => {
      if (Math.abs(g.dx) >= 20) {
        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (g.dx < 0 && barClockMode === "stopwatch") {
          setBarClockMode("timer");
        } else if (g.dx > 0 && barClockMode === "timer") {
          setBarClockMode("stopwatch");
          setBarTimerEditing(false);
        }
      }
    },
  }), [isPlaying, barClockMode]);

  const handleSaveResetLongPress = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    resetFlash.value = withSequence(
      withTiming(1, { duration: 80 }),
      withTiming(0, { duration: 500, easing: Easing.out(Easing.quad) })
    );
    onResetFlash?.();
    onBarReset?.();
  }, [onBarReset, onResetFlash]);

  const [saveFlashVisible, setSaveFlashVisible] = useState(false);
  const saveFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (saveFlashTimer.current) clearTimeout(saveFlashTimer.current);
    };
  }, []);

  const handleSaveResetTap = useCallback(async () => {
    const result = onBarQuickSave?.();
    let ok = true;
    if (result && typeof (result as any).then === "function") {
      ok = await (result as Promise<boolean>);
    }
    if (ok) {
      setSaveFlashVisible(true);
      if (saveFlashTimer.current) clearTimeout(saveFlashTimer.current);
      saveFlashTimer.current = setTimeout(() => setSaveFlashVisible(false), 1500);
    }
  }, [onBarQuickSave]);

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
  const [repeatBpmOverride, setRepeatBpmOverride] = useState<number | null>(null);
  const [repeatBpmEditing, setRepeatBpmEditing] = useState(false);
  const [repeatBpmText, setRepeatBpmText] = useState("");
  const [repeatSecEditing, setRepeatSecEditing] = useState(false);
  const [repeatSecText, setRepeatSecText] = useState("");

  const [blockSelectStart, setBlockSelectStart] = useState<number | null>(null);
  const [editingBlockIndex, setEditingBlockIndex] = useState<number | null>(null);

  const [pillDrag, setPillDrag] = useState<{ origIndex: number; x: number; y: number } | null>(null);
  const [pillDropTarget, setPillDropTarget] = useState<number | null>(null);
  const pillLayoutsRef = useRef<Record<number, { x: number; y: number; w: number; h: number }>>({});

  const findPillDropTarget = useCallback((pageX: number, pageY: number, sourceIdx: number): number | null => {
    const layouts = pillLayoutsRef.current;
    for (const key of Object.keys(layouts)) {
      const idx = parseInt(key, 10);
      if (idx === sourceIdx) continue;
      const l = layouts[idx];
      if (pageX >= l.x - 8 && pageX <= l.x + l.w + 8 && pageY >= l.y - 8 && pageY <= l.y + l.h + 8) {
        return idx;
      }
    }
    return null;
  }, []);

  const handlePillDragStart = useCallback((origIndex: number) => {
    if (isPlaying) return;
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setPillDrag({ origIndex, x: 0, y: 0 });
  }, [isPlaying]);

  const handlePillDragMove = useCallback((origIndex: number, pageX: number, pageY: number) => {
    setPillDrag({ origIndex, x: pageX, y: pageY });
    const target = findPillDropTarget(pageX, pageY, origIndex);
    setPillDropTarget(target);
  }, [findPillDropTarget]);

  const handlePillDragEnd = useCallback((origIndex: number, pageX: number, pageY: number) => {
    const target = findPillDropTarget(pageX, pageY, origIndex);
    setPillDrag(null);
    setPillDropTarget(null);
    if (target !== null) {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      const sourceBlock = loopBlocks[origIndex];
      const targetBlock = loopBlocks[target];
      if (targetBlock?.layerOf !== undefined) return;
      const ownBT: Record<number, string> = {};
      for (let b = sourceBlock.startBeat; b <= sourceBlock.endBeat; b++) {
        ownBT[b] = beatTypes[b] || "normal";
      }
      const ownSub: Record<string, string[]> = {};
      for (let b = sourceBlock.startBeat; b <= sourceBlock.endBeat; b++) {
        const key = String(b);
        if (beatSubdivisions[key]) {
          ownSub[key] = [...beatSubdivisions[key]];
        }
      }
      const sourceHasChildren = loopBlocks.some(b => b.layerOf === origIndex);
      const updated = loopBlocks.map((b, i) => {
        if (i === origIndex) return { ...b, layerOf: target, jumpToBlock: undefined, jumpCount: undefined, ownBeatTypes: ownBT, ownSubdivisions: Object.keys(ownSub).length > 0 ? ownSub : undefined };
        if (sourceHasChildren && b.layerOf === origIndex) return { ...b, layerOf: target };
        return b;
      });
      onLoopBlocksChange(updated);
    }
  }, [findPillDropTarget, loopBlocks, onLoopBlocksChange, beatTypes, beatSubdivisions]);


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
      setRepeatBpmOverride(existing.bpm ?? null);
    } else {
      setRepeatType("count");
      setRepeatCountVal(2);
      setRepeatMinVal(0);
      setRepeatSecVal(30);
      setRepeatBpmOverride(null);
    }
    setRepeatCountEditing(false);
    setRepeatMinEditing(false);
    setRepeatSecEditing(false);
    setRepeatBpmEditing(false);
    setRepeatModalBeat(beat);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  }, [barRepeats]);

  const saveRepeat = useCallback(() => {
    if (repeatModalBeat === null) return;
    const val = repeatType === "count" ? repeatCountVal : repeatMinVal * 60 + repeatSecVal;
    if (val <= 0) return;
    if (repeatType === "count" && val === 1 && repeatBpmOverride === null) {
      onBarRepeatChange(repeatModalBeat, null);
    } else {
      const rep: BarRepeat = { type: repeatType, value: val };
      if (repeatBpmOverride !== null) rep.bpm = repeatBpmOverride;
      onBarRepeatChange(repeatModalBeat, rep);
    }
    setRepeatModalBeat(null);
  }, [repeatModalBeat, repeatType, repeatCountVal, repeatMinVal, repeatSecVal, repeatBpmOverride, onBarRepeatChange]);

  const clearRepeat = useCallback(() => {
    if (repeatModalBeat === null) return;
    onBarRepeatChange(repeatModalBeat, null);
    setRepeatModalBeat(null);
  }, [repeatModalBeat, onBarRepeatChange]);

  const formatRepeat = (r: BarRepeat): string => {
    let label = "";
    if (r.type === "count") label = `\u00D7${r.value}`;
    else {
      const totalSec = r.value;
      const m = Math.floor(totalSec / 60);
      const s = totalSec % 60;
      if (m > 0) label = s > 0 ? `${m}'${s.toString().padStart(2, "0")}"` : `${m}'`;
      else label = `${s}"`;
    }
    if (r.bpm) label += ` ${r.bpm}`;
    return label;
  };

  const barLongPressedRef = useRef(false);

  const handleBarNumberLongPress = useCallback((beat: number) => {
    if (isPlaying) return;
    barLongPressedRef.current = true;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if (blockSelectStart === null) {
      setBlockSelectStart(beat);
    } else {
      const start = Math.min(blockSelectStart, beat);
      const end = Math.max(blockSelectStart, beat);
      const crosses = loopBlocks.some((b) => {
        if (b.layerOf !== undefined) return false;
        const newContainsOld = start <= b.startBeat && end >= b.endBeat;
        const oldContainsNew = b.startBeat <= start && b.endBeat >= end;
        const fullyNested = newContainsOld || oldContainsNew;
        const disjoint = end < b.startBeat || start > b.endBeat;
        return !disjoint && !fullyNested;
      });
      if (crosses) {
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setBlockSelectStart(null);
        return;
      }
      const savedY = barScrollYRef.current;
      const newBlock: LoopBlock = { startBeat: start, endBeat: end, type: "count", value: 2 };
      onLoopBlocksChange([...loopBlocks, newBlock]);
      setBlockSelectStart(null);
      requestAnimationFrame(() => {
        barScrollRef.current?.scrollTo({ y: savedY, animated: false });
      });
    }
  }, [isPlaying, blockSelectStart, loopBlocks, onLoopBlocksChange]);

  const removeLoopBlock = useCallback((index: number) => {
    const updated = loopBlocks
      .filter((_, i) => i !== index)
      .map((block) => {
        let newBlock = { ...block };
        if (newBlock.jumpToBlock !== undefined && newBlock.jumpToBlock !== null) {
          if (newBlock.jumpToBlock === index) {
            newBlock.jumpToBlock = undefined;
            newBlock.jumpCount = undefined;
          } else if (newBlock.jumpToBlock > index) {
            newBlock.jumpToBlock = newBlock.jumpToBlock - 1;
          }
        }
        if (newBlock.layerOf !== undefined) {
          if (newBlock.layerOf === index) {
            newBlock.layerOf = undefined;
          } else if (newBlock.layerOf > index) {
            newBlock.layerOf = newBlock.layerOf - 1;
          }
        }
        return newBlock;
      });
    onLoopBlocksChange(updated);
    if (editingBlockIndex === index) setEditingBlockIndex(null);
    else if (editingBlockIndex !== null && editingBlockIndex > index) setEditingBlockIndex(editingBlockIndex - 1);
  }, [loopBlocks, onLoopBlocksChange, editingBlockIndex]);

  const blockForBeat = useMemo(() => {
    const map = new Map<number, { block: LoopBlock; index: number; isFirst: boolean; isLast: boolean }[]>();
    loopBlocks.forEach((block, idx) => {
      if (block.layerOf !== undefined) return;
      for (let b = block.startBeat; b <= block.endBeat && b < beatsPerMeasure; b++) {
        const entry = { block, index: idx, isFirst: b === block.startBeat, isLast: b === block.endBeat || b === beatsPerMeasure - 1 };
        const existing = map.get(b) || [];
        existing.push(entry);
        map.set(b, existing);
      }
    });
    return map;
  }, [loopBlocks, beatsPerMeasure]);

  const blockDepths = useMemo(() => {
    const depths = new Map<number, number>();
    const nonLayered = loopBlocks.map((b, i) => ({ b, i })).filter(({ b }) => b.layerOf === undefined).sort((a, b) => {
      const spanA = a.b.endBeat - a.b.startBeat;
      const spanB = b.b.endBeat - b.b.startBeat;
      return spanB - spanA || a.b.startBeat - b.b.startBeat;
    });
    for (const { b: block, i: idx } of nonLayered) {
      let depth = 0;
      for (const { b: other, i: oi } of nonLayered) {
        if (oi === idx) continue;
        if (other.startBeat <= block.startBeat && other.endBeat >= block.endBeat && (other.endBeat - other.startBeat) > (block.endBeat - block.startBeat)) {
          depth++;
        }
      }
      depths.set(idx, depth);
    }
    return depths;
  }, [loopBlocks]);

  const resetFlashStyle = useAnimatedStyle(() => ({
    opacity: resetFlash.value * 0.6,
  }));

  const BAR_HEIGHT = 36;
  const BAR_LINE_COLOR = C.textSecondary;
  const [barContainerHeight, setBarContainerHeight] = useState(0);
  const barGap = 18;
  const LAYER_ROW_H = 16;
  const rowH = BAR_HEIGHT + 1 + barGap;

  const getLayerCountForBeat = (beat: number): number => {
    for (let i = 0; i < loopBlocks.length; i++) {
      const b = loopBlocks[i];
      if (b.layerOf !== undefined) continue;
      if (beat >= b.startBeat && beat <= Math.min(b.endBeat, beatsPerMeasure - 1)) {
        let count = 0;
        for (let j = 0; j < loopBlocks.length; j++) {
          if (loopBlocks[j].layerOf === i) count++;
        }
        return count;
      }
    }
    return 0;
  };

  const getBeatRowHeight = useCallback((beat: number): number => {
    const layerCount = getLayerCountForBeat(beat);
    if (layerCount > 0) {
      return BAR_HEIGHT + layerCount * BAR_HEIGHT + 1 + barGap;
    }
    return rowH;
  }, [loopBlocks, beatsPerMeasure, BAR_HEIGHT, barGap, rowH]);

  const beatYOffsets = useMemo(() => {
    const offsets: number[] = [];
    let cumY = 0;
    for (let b = 0; b < beatsPerMeasure; b++) {
      offsets.push(cumY);
      cumY += getBeatRowHeight(b);
    }
    return offsets;
  }, [beatsPerMeasure, getBeatRowHeight]);

  const copyHeight = useMemo(() => {
    if (beatYOffsets.length === 0) return beatsPerMeasure * rowH;
    return beatYOffsets[beatsPerMeasure - 1] + getBeatRowHeight(beatsPerMeasure - 1);
  }, [beatYOffsets, beatsPerMeasure, getBeatRowHeight, rowH]);

  const centerPad = Math.max(0, (barContainerHeight - BAR_HEIGHT) / 2);

  const getBeatTop = (beat: number): number => {
    if (beat >= 0 && beat < beatYOffsets.length) return beatYOffsets[beat];
    return beat * rowH;
  };
  const [activeCopy, setActiveCopy] = useState(1);
  const activeCopyRef = useRef(1);
  const barPrevBeatRef = useRef(-1);
  const prevMeasureCountRef = useRef(0);

  const NUM_COPIES = 3;
  const CENTER_COPY = 1;

  useEffect(() => {
    if (!isPlaying) {
      activeCopyRef.current = CENTER_COPY;
      setActiveCopy(CENTER_COPY);
      barPrevBeatRef.current = -1;
      prevMeasureCountRef.current = 0;
      if (barMode && barContainerHeight > 0) {
        barScrollRef.current?.scrollTo({ y: 0, animated: false });
        onBarScrollOffset?.(0);
      }
    } else if (barMode && barContainerHeight > 0) {
      const startBeat = barStartBeat && barStartBeat > 0 ? barStartBeat : 0;
      if (barLoopMode === "once") {
        const beatTop = centerPad + getBeatTop(startBeat);
        const scrollTarget = Math.max(0, beatTop - barContainerHeight / 2 + BAR_HEIGHT / 2);
        barScrollRef.current?.scrollTo({ y: scrollTarget, animated: false });
      } else {
        const beatTop = centerPad + CENTER_COPY * copyHeight + getBeatTop(startBeat);
        const scrollTarget = Math.max(0, beatTop - barContainerHeight / 2 + BAR_HEIGHT / 2);
        barScrollRef.current?.scrollTo({ y: scrollTarget, animated: false });
      }
    }
  }, [isPlaying, barMode, barContainerHeight, centerPad, copyHeight, barLoopMode, barStartBeat, rowH, beatYOffsets]);

  useEffect(() => {
    if (!barMode || !isPlaying || currentBeat < 0) return;
    if (barContainerHeight <= 0 || copyHeight <= 0) return;

    if (barLoopMode === "once") {
      const beatTop = centerPad + getBeatTop(currentBeat);
      const scrollTarget = Math.max(0, beatTop - barContainerHeight / 2 + BAR_HEIGHT / 2);
      const isFirstTick = barPrevBeatRef.current < 0;
      barPrevBeatRef.current = currentBeat;
      barScrollRef.current?.scrollTo({ y: scrollTarget, animated: !isFirstTick });
      return;
    }

    const prev = barPrevBeatRef.current;
    barPrevBeatRef.current = currentBeat;

    const prevMC = prevMeasureCountRef.current;
    prevMeasureCountRef.current = measureCount;
    const isMeasureWrap = measureCount > prevMC;

    if (isMeasureWrap) {
      activeCopyRef.current++;
      setActiveCopy(activeCopyRef.current);
    }

    if (activeCopyRef.current > CENTER_COPY && isMeasureWrap && currentBeat > 0) {
      activeCopyRef.current = CENTER_COPY;
      setActiveCopy(CENTER_COPY);
      const snapTop = centerPad + CENTER_COPY * copyHeight + getBeatTop(currentBeat - 1);
      const snapTarget = Math.max(0, snapTop - barContainerHeight / 2 + BAR_HEIGHT / 2);
      barScrollRef.current?.scrollTo({ y: snapTarget, animated: false });
    }

    const beatTop = centerPad + activeCopyRef.current * copyHeight + getBeatTop(currentBeat);
    const scrollTarget = Math.max(0, beatTop - barContainerHeight / 2 + BAR_HEIGHT / 2);
    const isFirstTick = prev < 0;
    barScrollRef.current?.scrollTo({ y: scrollTarget, animated: !isFirstTick });
  }, [barMode, isPlaying, currentBeat, beatsPerMeasure, barContainerHeight, centerPad, rowH, copyHeight, barLoopMode, measureCount, beatYOffsets]);

  const jumpConnections = useMemo(() => {
    return loopBlocks
      .map((block, idx) => {
        if (block.jumpToBlock === undefined || block.jumpToBlock === null) return null;
        const targetBlock = loopBlocks[block.jumpToBlock];
        if (!targetBlock) return null;
        return {
          fromIndex: idx,
          toIndex: block.jumpToBlock,
          fromBeat: block.startBeat,
          toBeat: targetBlock.startBeat,
          jumpCount: block.jumpCount || 1,
        };
      })
      .filter(Boolean) as { fromIndex: number; toIndex: number; fromBeat: number; toBeat: number; jumpCount: number }[];
  }, [loopBlocks]);

  const pillDragGhost = pillDrag && pillDrag.x > 0 ? (
    <View
      pointerEvents="none"
      style={{
        position: Platform.OS === "web" ? ("fixed" as any) : "absolute",
        left: pillDrag.x - 24,
        top: pillDrag.y - 24,
        paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
        backgroundColor: C.accent + "90",
        alignItems: "center",
        zIndex: 10000,
      }}
    >
      <Text style={{ color: C.white, fontSize: 10, fontFamily: "SpaceGrotesk_700Bold" }}>
        {loopBlocks[pillDrag.origIndex]?.startBeat !== undefined
          ? `${loopBlocks[pillDrag.origIndex].startBeat + 1}-${Math.min(loopBlocks[pillDrag.origIndex].endBeat + 1, beatsPerMeasure)}`
          : "?"}
      </Text>
    </View>
  ) : null;


  if (barMode) {
    const isDropping = dropTargetBeat !== null;
    const renderBarRow = (beat: number, copyIndex: number, rowHeight?: number, hideLabel?: boolean) => {
      const pattern = beatSubdivisions[String(beat)] || [beatTypes[beat] || "normal"];
      const isCurrent = isPlaying && currentBeat === beat && (barLoopMode === "once" ? copyIndex === 0 : copyIndex === activeCopy);
      const bType = beatTypes[beat] || "normal";
      const isDropTarget = isDropping && (dropTargetBeat === beat || dropTargetBeat === -1);
      const beatBlocks = blockForBeat.get(beat) || [];
      const isPrimary = isPlaying ? (barLoopMode === "once" ? copyIndex === 0 : copyIndex === CENTER_COPY) : copyIndex === 0;
      return (
        <View
          key={`bar-${copyIndex}-${beat}`}
          style={[
            styles.barBeatWrapper,
            { height: rowHeight || BAR_HEIGHT },
            isCurrent && styles.barBeatWrapperActive,
            isPrimary && isDropTarget && { backgroundColor: C.overlay06, borderColor: C.accent, borderWidth: 1, borderRadius: 4, marginHorizontal: -1 },
          ]}
        >
          {(() => {
            const blockStarts = isPrimary ? beatBlocks.filter((bb) => bb.isFirst) : [];
            const blockMid = isPrimary && beatBlocks.length > 0 && blockStarts.length === 0;
            const inBlock = isPrimary && beatBlocks.length > 0;
            const maxDepth = isPrimary ? Math.max(0, ...beatBlocks.map(bb => blockDepths.get(bb.index) || 0)) : 0;
            const leftPad = inBlock ? 10 + maxDepth * 10 : 0;
            return (
              <>
                {!hideLabel && <Pressable
                  style={[
                    styles.barBeatLabel,
                    barStartBeat === beat && !isPlaying && { backgroundColor: C.accent + "30", borderRadius: 4 },
                    blockSelectStart === beat && !isPlaying && { backgroundColor: C.accent + "50", borderRadius: 4 },
                    blockSelectStart !== null && blockSelectStart !== beat && !isPlaying && { borderColor: C.accent + "40", borderWidth: 1, borderRadius: 4 },
                    leftPad > 0 && { paddingLeft: leftPad },
                  ]}
                  onPressIn={() => { barLongPressedRef.current = false; }}
                  onPress={() => {
                    if (barLongPressedRef.current) return;
                    if (isPrimary && !isPlaying && onBarStartBeatSelect) {
                      onBarStartBeatSelect(barStartBeat === beat ? null : beat);
                      if (Platform.OS !== "web") Haptics.selectionAsync();
                    } else if (isPrimary) {
                      cycleBeatType(beat);
                    }
                  }}
                  onLongPress={() => {
                    if (isPrimary) handleBarNumberLongPress(beat);
                  }}
                  delayLongPress={300}
                >
                  {barStartBeat === beat && !isPlaying ? (
                    <Ionicons name="play" size={12} color={C.accent} style={{ marginLeft: 1 }} />
                  ) : blockSelectStart === beat && !isPlaying ? (
                    <Ionicons name="locate" size={12} color={C.accent} />
                  ) : isPrimary && blockStarts.length > 0 ? (
                    <Text style={[styles.barBeatLabelText, { color: C.accent, opacity: 0.9, fontSize: 11, fontFamily: "SpaceGrotesk_700Bold" }]}>
                      {beat + 1}
                    </Text>
                  ) : isPrimary && blockMid ? (
                    <Text style={[styles.barBeatLabelText, { color: C.textTertiary, opacity: 0.3, fontSize: 9 }]}>
                      {beat + 1}
                    </Text>
                  ) : (
                    <Text style={[
                      styles.barBeatLabelText,
                      {
                        color: bType === "strong" ? C.accent
                          : bType === "accent" ? C.accentMuted
                          : bType === "mute" ? C.textTertiary
                          : C.textSecondary,
                        opacity: isCurrent ? 1 : 0.6,
                      }
                    ]}>
                      {beat + 1}
                    </Text>
                  )}
                </Pressable>}
              </>
            );
          })()}
          <View style={[
            styles.barBeatContent,
            { height: rowHeight || BAR_HEIGHT },
            isCurrent && { backgroundColor: C.overlay08 },
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
                  style={[styles.barNoteCell, !isLast && { borderRightWidth: 1, borderRightColor: C.overlay08 }]}
                >
                  {isStrongType ? (
                    <View style={[styles.barNoteFill, { margin: 3, overflow: "hidden", opacity: isActiveCell ? 1 : 0.75 }]}>
                      <LinearGradient
                        colors={[C.white, C.accent, C.accent]}
                        locations={[0, 0.4, 1]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 4, alignItems: "center", justifyContent: "center" }}
                      >
                        <Text style={{ color: C.white, fontSize: 10, fontWeight: "bold" as const, lineHeight: 12, textShadowColor: "rgba(0,0,0,0.5)", textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 2 }}>S</Text>
                      </LinearGradient>
                    </View>
                  ) : type === "mute" ? (
                    <View style={[styles.barNoteFill, {
                      margin: 3,
                      backgroundColor: "transparent",
                      borderWidth: 1,
                      borderColor: C.textTertiary,
                      borderStyle: "dashed" as any,
                      opacity: isActiveCell ? 0.9 : 0.4,
                    }]} />
                  ) : (
                    <View style={[styles.barNoteFill, {
                      margin: 3,
                      backgroundColor: isAccentType
                        ? (isActiveCell ? C.accent : C.accentMuted)
                        : (isActiveCell ? C.text : C.textTertiary),
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

              const getSegmentSource = (seg: { start: number; end: number }): string => {
                for (let ci = seg.start; ci <= seg.end; ci++) {
                  const sk = `${beat}-${ci}`;
                  const directSource = noteSampleSources && noteSamples && noteSamples[sk] && noteSampleSources[sk];
                  if (directSource === "recording") return "recording";
                  const coveredSource = sampleCoveredCells.get(sk);
                  if (coveredSource === "recording") return "recording";
                }
                for (let ci = seg.start; ci <= seg.end; ci++) {
                  const sk = `${beat}-${ci}`;
                  const directSource = noteSampleSources && noteSamples && noteSamples[sk] && noteSampleSources[sk];
                  if (directSource) return directSource;
                  const coveredSource = sampleCoveredCells.get(sk);
                  if (coveredSource) return coveredSource;
                }
                return "recording";
              };

              const beatNameInfo = (() => {
                let name: string | null = null;
                let nameSource: string = "recording";
                for (let ci = 0; ci < pattern.length; ci++) {
                  const sk = `${beat}-${ci}`;
                  if (noteSamples && noteSamples[sk]) {
                    if (noteSampleNames && noteSampleNames[sk]) name = noteSampleNames[sk];
                    nameSource = (noteSampleSources && noteSampleSources[sk]) || "recording";
                    break;
                  }
                }
                return { name, nameSource };
              })();

              const result: React.ReactNode[] = segments.map((seg, si) => {
                const leftPct = (seg.start / pattern.length) * 100;
                const widthPct = ((seg.end - seg.start + 1) / pattern.length) * 100;
                const segSource = getSegmentSource(seg);
                const segColor = segSource === "import" ? "#39FF14" : "#FF4444";
                return (
                  <View key={`bar-${si}`} style={{
                    position: "absolute",
                    left: `${leftPct}%` as any,
                    width: `${widthPct}%` as any,
                    bottom: -1,
                    height: 3,
                    backgroundColor: segColor,
                    opacity: 0.85,
                    zIndex: 10,
                  }} />
                );
              });

              if (beatNameInfo.name) {
                const nameColor = beatNameInfo.nameSource === "import" ? "#39FF14" : "#FF4444";
                result.push(
                  <View key="sample-name" style={{
                    position: "absolute",
                    bottom: 3,
                    left: 2,
                    right: 2,
                    zIndex: 11,
                  }} pointerEvents="none">
                    <Text numberOfLines={1} style={{
                      fontSize: 8,
                      color: nameColor,
                      fontWeight: "600",
                      opacity: 0.9,
                    }}>{beatNameInfo.name}</Text>
                  </View>
                );
              }

              return result;
            })()}
          </View>
          {!hideLabel && <View style={[styles.barBeatEndLine, { backgroundColor: BAR_LINE_COLOR }]} />}
          {!hideLabel && isPrimary && !isPlaying && (
            <Pressable
              onPress={() => openRepeatModal(beat)}
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 8 }}
              style={[
                styles.barBeatLabel,
                {
                  marginLeft: 2,
                  backgroundColor: barRepeats[beat] ? C.accent + "20" : "transparent",
                  borderRadius: 4,
                },
              ]}
            >
              {barRepeats[beat] ? (
                <Text style={[styles.barBeatLabelText, { color: C.accent, fontSize: 9, fontWeight: "700" }]}>
                  {formatRepeat(barRepeats[beat])}
                </Text>
              ) : (
                <Ionicons name="repeat-outline" size={11} color={C.textTertiary} style={{ opacity: 0.4 }} />
              )}
            </Pressable>
          )}
          {!hideLabel && isPrimary && isPlaying && barRepeats[beat] && progressInfo && progressInfo.beat === beat && progressInfo.barRepeatTotal > 1 && (
            <View style={[styles.barBeatLabel, { marginLeft: 2, backgroundColor: C.accent + "30", borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 }]}>
              <Text style={{ color: C.accent, fontSize: 8, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold" }}>
                {progressInfo.barRepeatCurrent + 1}/{progressInfo.barRepeatTotal}
              </Text>
            </View>
          )}
        </View>
      );
    };
    const updateBlock = (index: number, changes: Partial<LoopBlock>) => {
      const updated = loopBlocks.map((b, i) => i === index ? { ...b, ...changes } : b);
      onLoopBlocksChange(updated);
    };

    const getLayersForBeat = (beat: number): { blockIndex: number; parentBeatOffset: number; stackedBlocks: { block: LoopBlock; origIndex: number }[] } | null => {
      for (let i = 0; i < loopBlocks.length; i++) {
        const b = loopBlocks[i];
        if (b.layerOf !== undefined) continue;
        if (beat >= b.startBeat && beat <= Math.min(b.endBeat, beatsPerMeasure - 1)) {
          const stacked: { block: LoopBlock; origIndex: number }[] = [];
          for (let j = 0; j < loopBlocks.length; j++) {
            if (loopBlocks[j].layerOf === i) stacked.push({ block: loopBlocks[j], origIndex: j });
          }
          if (stacked.length > 0) return { blockIndex: i, parentBeatOffset: beat - b.startBeat, stackedBlocks: stacked };
        }
      }
      return null;
    };

    const renderLayerRow = (beat: number, copyIndex: number, stackedBlock: LoopBlock, stackedOrigIdx: number, layerNum: number, parentBlockIndex: number, parentBeatOffset: number, rowHeight?: number) => {
      const ownEntry = loopBlocks[stackedOrigIdx];
      const layerBeats = stackedBlock.endBeat - stackedBlock.startBeat + 1;
      if (parentBeatOffset >= layerBeats) return null;

      const layerBeatIdx = stackedBlock.startBeat + parentBeatOffset;
      const layerKey = `${stackedOrigIdx}:${layerNum}`;
      const layerCurrentBeat = layerProgressMap[layerKey];
      const isCurrentBeatRow = progressInfo && progressInfo.beat === beat && progressInfo.blockIndex === parentBlockIndex;
      const isLayerActive = isPlaying && layerCurrentBeat !== undefined && isCurrentBeatRow && layerCurrentBeat === parentBeatOffset;
      const h = rowHeight || LAYER_ROW_H;

      const displayCells: BeatType[] = [];
      const ownSub = ownEntry?.ownSubdivisions?.[String(layerBeatIdx)];
      if (ownSub && ownSub.length > 0) {
        for (const st of ownSub) displayCells.push(st as BeatType);
      } else {
        const bt = (ownEntry?.ownBeatTypes?.[layerBeatIdx] as BeatType) || beatTypes[layerBeatIdx] || "normal";
        displayCells.push(bt);
      }

      return (
        <View
          key={`layer-${copyIndex}-${beat}-L${layerNum}`}
          style={{
            flexDirection: "row",
            alignItems: "stretch",
            height: h,
          }}
        >
          <View style={{ flex: 1, flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.overlay06 }}>
            {displayCells.map((cellType, ci) => {
              const isActiveCell = isLayerActive;
              const isLast = ci === displayCells.length - 1;
              const isStrongType = cellType === "strong";
              const isAccentType = cellType === "accent";
              return (
                <View
                  key={ci}
                  style={[{ flex: 1, alignItems: "stretch", justifyContent: "center" as const }, !isLast && { borderRightWidth: 1, borderRightColor: C.overlay06 }]}
                >
                  {isStrongType ? (
                    <View style={{ flex: 1, borderRadius: 2, margin: 1, overflow: "hidden", opacity: isActiveCell ? 1 : 0.7 }}>
                      <LinearGradient
                        colors={[C.white, C.accent, C.accent]}
                        locations={[0, 0.4, 1]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 2, alignItems: "center", justifyContent: "center" }}
                      >
                        <Text style={{ color: C.white, fontSize: 6, fontWeight: "bold" as const }}>S</Text>
                      </LinearGradient>
                    </View>
                  ) : cellType === "mute" ? (
                    <View style={{
                      flex: 1, borderRadius: 2, margin: 1,
                      backgroundColor: "transparent", borderWidth: 1, borderColor: C.textTertiary,
                      borderStyle: "dashed" as any, opacity: isActiveCell ? 0.9 : 0.3,
                    }} />
                  ) : (
                    <View style={{
                      flex: 1, borderRadius: 2, margin: 1,
                      backgroundColor: isAccentType
                        ? (isActiveCell ? C.accent : C.accentMuted)
                        : (isActiveCell ? C.text : C.textTertiary),
                      opacity: isActiveCell ? 1 : 0.5,
                    }} />
                  )}
                </View>
              );
            })}
          </View>
          <View style={{ width: 2 }} />
        </View>
      );
    };

    const buildBarRows = (copyIndex: number) => {
      const rows: React.ReactNode[] = [];
      for (const beat of beats) {
        const layerInfo = getLayersForBeat(beat);
        if (layerInfo) {
          const visibleLayers = layerInfo.stackedBlocks.filter(sb => {
            const layerBeats = sb.block.endBeat - sb.block.startBeat + 1;
            return layerInfo.parentBeatOffset < layerBeats;
          });
          if (visibleLayers.length > 0) {
            const bType = beatTypes[beat] || "normal";
            const isCurrent = isPlaying && currentBeat === beat && (barLoopMode === "once" ? copyIndex === 0 : copyIndex === activeCopy);
            const beatBlocks = blockForBeat.get(beat) || [];
            const isPrimary = isPlaying ? (barLoopMode === "once" ? copyIndex === 0 : copyIndex === CENTER_COPY) : copyIndex === 0;
            const blockStarts = isPrimary ? beatBlocks.filter((bb) => bb.isFirst) : [];
            const blockMid = isPrimary && beatBlocks.length > 0 && blockStarts.length === 0;
            const inBlock = isPrimary && beatBlocks.length > 0;
            const maxDepth = isPrimary ? Math.max(0, ...beatBlocks.map(bb => blockDepths.get(bb.index) || 0)) : 0;
            const leftPad = inBlock ? 10 + maxDepth * 10 : 0;
            rows.push(
              <View key={`grp-${copyIndex}-${beat}`} style={{ flexDirection: "row", alignItems: "stretch" }}>
                <Pressable
                  style={[
                    styles.barBeatLabel,
                    { justifyContent: "center" },
                    barStartBeat === beat && !isPlaying && { backgroundColor: C.accent + "30", borderRadius: 4 },
                    blockSelectStart === beat && !isPlaying && { backgroundColor: C.accent + "50", borderRadius: 4 },
                    blockSelectStart !== null && blockSelectStart !== beat && !isPlaying && { borderColor: C.accent + "40", borderWidth: 1, borderRadius: 4 },
                    leftPad > 0 && { paddingLeft: leftPad },
                  ]}
                  onPressIn={() => { barLongPressedRef.current = false; }}
                  onPress={() => {
                    if (barLongPressedRef.current) return;
                    if (isPrimary && !isPlaying && onBarStartBeatSelect) {
                      onBarStartBeatSelect(barStartBeat === beat ? null : beat);
                      if (Platform.OS !== "web") Haptics.selectionAsync();
                    } else if (isPrimary) {
                      cycleBeatType(beat);
                    }
                  }}
                  onLongPress={() => { if (isPrimary) handleBarNumberLongPress(beat); }}
                  delayLongPress={300}
                >
                  {barStartBeat === beat && !isPlaying ? (
                    <Ionicons name="play" size={12} color={C.accent} style={{ marginLeft: 1 }} />
                  ) : blockSelectStart === beat && !isPlaying ? (
                    <Ionicons name="locate" size={12} color={C.accent} />
                  ) : isPrimary && blockStarts.length > 0 ? (
                    <Text style={[styles.barBeatLabelText, { color: C.accent, opacity: 0.9, fontSize: 11, fontFamily: "SpaceGrotesk_700Bold" }]}>
                      {beat + 1}
                    </Text>
                  ) : isPrimary && blockMid ? (
                    <Text style={[styles.barBeatLabelText, { color: C.textTertiary, opacity: 0.3, fontSize: 9 }]}>
                      {beat + 1}
                    </Text>
                  ) : (
                    <Text style={[styles.barBeatLabelText, {
                      color: bType === "strong" ? C.accent : bType === "accent" ? C.accentMuted : bType === "mute" ? C.textTertiary : C.textSecondary,
                      opacity: isCurrent ? 1 : 0.6,
                    }]}>
                      {beat + 1}
                    </Text>
                  )}
                </Pressable>
                <View style={{ flex: 1, gap: 0, overflow: "hidden" }}>
                  {renderBarRow(beat, copyIndex, undefined, true)}
                  {visibleLayers.map((sb, li) => renderLayerRow(beat, copyIndex, sb.block, sb.origIndex, li + 1, layerInfo.blockIndex, layerInfo.parentBeatOffset, BAR_HEIGHT))}
                </View>
                <View style={{ justifyContent: "center" }}>
                  <View style={[styles.barBeatEndLine, { backgroundColor: BAR_LINE_COLOR }]} />
                </View>
                {isPrimary && !isPlaying && (
                  <Pressable
                    onPress={() => openRepeatModal(beat)}
                    hitSlop={{ top: 6, bottom: 6, left: 4, right: 8 }}
                    style={[
                      styles.barBeatLabel,
                      {
                        marginLeft: 2,
                        backgroundColor: barRepeats[beat] ? C.accent + "20" : "transparent",
                        borderRadius: 4,
                        justifyContent: "center",
                      },
                    ]}
                  >
                    {barRepeats[beat] ? (
                      <Text style={[styles.barBeatLabelText, { color: C.accent, fontSize: 9, fontWeight: "700" }]}>
                        {formatRepeat(barRepeats[beat])}
                      </Text>
                    ) : (
                      <Ionicons name="repeat-outline" size={11} color={C.textTertiary} style={{ opacity: 0.4 }} />
                    )}
                  </Pressable>
                )}
                {isPrimary && isPlaying && barRepeats[beat] && progressInfo && progressInfo.beat === beat && progressInfo.barRepeatTotal > 1 && (
                  <View style={[styles.barBeatLabel, { marginLeft: 2, backgroundColor: C.accent + "30", borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1, justifyContent: "center" }]}>
                    <Text style={{ color: C.accent, fontSize: 8, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold" }}>
                      {progressInfo.barRepeatCurrent + 1}/{progressInfo.barRepeatTotal}
                    </Text>
                  </View>
                )}
              </View>
            );
          } else {
            rows.push(renderBarRow(beat, copyIndex));
          }
        } else {
          rows.push(renderBarRow(beat, copyIndex));
        }
      }
      return rows;
    };

    const allBarRows: React.ReactNode[] = [];
    if (isPlaying && barLoopMode !== "once") {
      for (let copy = 0; copy < NUM_COPIES; copy++) {
        allBarRows.push(...buildBarRows(copy));
      }
    } else {
      allBarRows.push(...buildBarRows(0));
    }

    if (isLandscape) {
      return (
        <View style={[styles.barModeContainer, { flexDirection: "row" }]} testID="beat-indicator-bar-mode">
          <Animated.View
            pointerEvents="none"
            style={[{
              position: "absolute",
              top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: C.danger,
              zIndex: 999,
            }, resetFlashStyle]}
          />

          <View style={{ flex: 2 }}>
            <View style={[styles.barTopRowCenter, { paddingTop: 6, paddingBottom: 2 }]}>
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
                  <Ionicons name="layers" size={16} color={C.white} />
                ) : (
                  <Ionicons name="chevron-down" size={18} color={C.textTertiary} />
                )}
              </Pressable>
            </View>

            {blockSelectStart !== null && !isPlaying && (
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 2, gap: 4 }}>
                <Ionicons name="locate" size={10} color={C.accent} />
                <Text style={{ fontFamily: "SpaceGrotesk_500Medium", fontSize: 9, color: C.accent }}>
                  Bar {blockSelectStart + 1} selected
                </Text>
                <Pressable onPress={() => setBlockSelectStart(null)} hitSlop={8}>
                  <Ionicons name="close-circle" size={12} color={C.textTertiary} />
                </Pressable>
              </View>
            )}

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
                scrollEnabled={!isPlaying}
                onScroll={(e) => { barScrollYRef.current = e.nativeEvent.contentOffset.y; onBarScrollOffset?.(e.nativeEvent.contentOffset.y); }}
                scrollEventThrottle={16}
              >
                <View style={[styles.barMeasureInner, { paddingTop: centerPad, paddingBottom: centerPad, gap: barGap }]}>
                  {allBarRows}
                  {loopBlocks.length > 0 && (() => {
                    const copies = isPlaying && barLoopMode !== "once" ? NUM_COPIES : 1;
                    const primaryCopy = isPlaying && barLoopMode !== "once" ? CENTER_COPY : 0;
                    const BLOCK_INDENT = 10;
                    const LINE_BASE_LEFT = 3;
                    return loopBlocks.map((block, idx) => {
                      const depth = blockDepths.get(idx) || 0;
                      const lineWidth = Math.max(2, 3 - depth * 0.5);
                      const lineLeft = LINE_BASE_LEFT + depth * BLOCK_INDENT;
                      const lineOpacity = Math.max(0.3, 0.7 - depth * 0.15);
                      const startBeat = block.startBeat;
                      const endBeat = Math.min(block.endBeat, beatsPerMeasure - 1);
                      const isEditingB = editingBlockIndex === idx;
                      const isActiveB = isPlaying && progressInfo && progressInfo.blockIndex === idx;
                      const isSingleBeat = startBeat === endBeat;
                      const bracketW = 5;
                      const elements: React.ReactNode[] = [];
                      for (let copy = 0; copy < copies; copy++) {
                        const copyOffset = copy * copyHeight;
                        const topPos = centerPad + copyOffset + getBeatTop(startBeat) + (isSingleBeat ? BAR_HEIGHT / 2 - 6 : 2);
                        const endLayerCount = getLayerCountForBeat(endBeat);
                        const endBeatContentH = endLayerCount > 0 ? BAR_HEIGHT + endLayerCount * BAR_HEIGHT : BAR_HEIGHT;
                        const bottomPos = centerPad + copyOffset + getBeatTop(endBeat) + endBeatContentH - (isSingleBeat ? BAR_HEIGHT / 2 - 6 : 2);
                        const totalH = bottomPos - topPos;
                        if (totalH <= 0) continue;
                        const isPrimaryCopy = copy === (isPlaying && barLoopMode !== "once" ? CENTER_COPY : 0);
                        const copyOp = isPrimaryCopy ? 1 : 0.3;
                        const lineOp = (isActiveB ? 0.95 : isEditingB ? 0.85 : lineOpacity) * copyOp;
                        elements.push(
                          <React.Fragment key={`blk-${idx}-c${copy}`}>
                            <View pointerEvents="none" style={{ position: "absolute", left: lineLeft, top: topPos, width: lineWidth, height: totalH, backgroundColor: C.accent, borderRadius: lineWidth / 2, opacity: lineOp, zIndex: 10 + depth }} />
                            <View pointerEvents="none" style={{ position: "absolute", left: lineLeft, top: topPos, width: bracketW, height: lineWidth, backgroundColor: C.accent, borderTopLeftRadius: lineWidth / 2, borderTopRightRadius: lineWidth / 2, opacity: lineOp, zIndex: 10 + depth }} />
                            <View pointerEvents="none" style={{ position: "absolute", left: lineLeft, top: bottomPos - lineWidth, width: bracketW, height: lineWidth, backgroundColor: C.accent, borderBottomLeftRadius: lineWidth / 2, borderBottomRightRadius: lineWidth / 2, opacity: lineOp, zIndex: 10 + depth }} />
                          </React.Fragment>
                        );
                      }
                      return elements;
                    });
                  })()}
                </View>
              </ScrollView>
              <LinearGradient
                colors={[C.background, C.background, C.background + "80", "transparent"]}
                locations={[0, 0.45, 0.75, 1]}
                style={[styles.barFadeGradient, { top: 0, height: rowH * 1.2 }]}
                pointerEvents="none"
              />
            </View>
            <LinearGradient
              colors={["transparent", C.background + "60", C.background + "C0", C.background]}
              locations={[0, 0.3, 0.65, 1]}
              style={[styles.barFadeGradientBottom, { height: rowH + 60, marginTop: -(rowH + 60) }]}
              pointerEvents="none"
            />
          </View>

          <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 6, paddingVertical: 6 }}>
            {subdivisionBarElement && (
              <View style={{ width: "125%", paddingHorizontal: 8 }}>
                {loopBlocks.length > 0 && (() => {
                  const sorted = loopBlocks.map((b, i) => ({ block: b, origIndex: i })).sort((a, b) => a.block.startBeat - b.block.startBeat);
                  const editBlock = editingBlockIndex !== null ? loopBlocks[editingBlockIndex] : null;
                  const otherBlocks = editBlock ? loopBlocks.map((b, i) => ({ b, i })).filter(({ i }) => i !== editingBlockIndex) : [];
                  const editHasJump = editBlock ? editBlock.jumpToBlock !== undefined && editBlock.jumpToBlock !== null : false;
                  const editJumpCount = editBlock ? (editBlock.jumpCount || 1) : 1;
                  return (
                    <View style={{ flexGrow: 0, marginBottom: 4 }}>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 42 }} contentContainerStyle={{ paddingHorizontal: 2, paddingVertical: 3, gap: 4, alignItems: "center" }}>
                        {sorted.map(({ block, origIndex }, si) => {
                          const isEditing = editingBlockIndex === origIndex;
                          const isActive = isPlaying && progressInfo && progressInfo.blockIndex === origIndex;
                          const hasJump = block.jumpToBlock !== undefined && block.jumpToBlock !== null;
                          const jumpTarget = hasJump ? loopBlocks[block.jumpToBlock!] : null;
                          return (
                            <View key={`flow-${origIndex}`} style={{ flexDirection: "row", alignItems: "center" }}>
                              <BlockPill
                                origIndex={origIndex} block={block} isEditing={isEditing} isActive={!!isActive} isPlaying={isPlaying}
                                isDragSource={!!pillDrag && pillDrag.origIndex === origIndex}
                                isDropTarget={pillDropTarget === origIndex}
                                hasJump={hasJump} layerCount={loopBlocks.filter(b => b.layerOf === origIndex).length}
                                beatsPerMeasure={beatsPerMeasure} progressInfo={progressInfo}
                                accentColor={C.accent} textColor={C.text} textTertiaryColor={C.textTertiary} bgSecondary={C.backgroundSecondary} whiteColor={C.white}
                                onPress={() => { if (!isPlaying) setEditingBlockIndex(isEditing ? null : origIndex); }}
                                onDragStart={handlePillDragStart} onDragMove={handlePillDragMove} onDragEnd={handlePillDragEnd}
                                onMeasure={(idx, layout) => { pillLayoutsRef.current[idx] = layout; }}
                                size="small"
                              />
                              {hasJump && jumpTarget && (() => {
                                const targetSortedIdx = sorted.findIndex(s => s.origIndex === block.jumpToBlock);
                                const goesBack = targetSortedIdx >= 0 && targetSortedIdx <= si;
                                return goesBack ? (
                                  <View style={{ alignItems: "center", marginLeft: 3 }}>
                                    <Ionicons name="return-up-back" size={10} color="#f0ad4e" />
                                  </View>
                                ) : (
                                  <Ionicons name="caret-forward" size={8} color="#f0ad4e" style={{ marginLeft: 1 }} />
                                );
                              })()}
                              {si < sorted.length - 1 && !hasJump && (
                                <Ionicons name="chevron-forward" size={8} color={C.textTertiary} style={{ marginLeft: 1, opacity: 0.4 }} />
                              )}
                            </View>
                          );
                        })}
                      </ScrollView>
                    </View>
                  );
                })()}
                {(() => {
                  const editBlock = editingBlockIndex !== null ? loopBlocks[editingBlockIndex] : null;
                  const otherBlocks = editBlock ? loopBlocks.map((b, i) => ({ b, i })).filter(({ i }) => i !== editingBlockIndex) : [];
                  const editHasJump = editBlock ? editBlock.jumpToBlock !== undefined && editBlock.jumpToBlock !== null : false;
                  const editJumpCount = editBlock ? (editBlock.jumpCount || 1) : 1;
                  if (!(!isPlaying && editingBlockIndex !== null && editBlock)) return null;
                  return (
                    <View style={{
                      backgroundColor: C.backgroundSecondary,
                      borderRadius: 6,
                      marginBottom: 4,
                      padding: 6,
                      borderWidth: 1,
                      borderColor: C.accent + "30",
                      alignSelf: "center",
                    }}>
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                        <Text style={{ color: C.accent, fontSize: 10, fontFamily: "SpaceGrotesk_700Bold" }}>
                          Block {editBlock.startBeat + 1}-{Math.min(editBlock.endBeat + 1, beatsPerMeasure)}
                        </Text>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          {loopBlocks.some(b => b.layerOf === editingBlockIndex) && (
                            <Pressable
                              onPress={() => {
                                const updated = loopBlocks.map(b => b.layerOf === editingBlockIndex ? { ...b, layerOf: undefined, ownBeatTypes: undefined, ownSubdivisions: undefined } : b);
                                onLoopBlocksChange(updated);
                              }}
                              hitSlop={8}
                              style={{ flexDirection: "row", alignItems: "center", gap: 2 }}
                            >
                              <Ionicons name="layers-outline" size={11} color={C.accent} />
                              <Text style={{ color: C.accent, fontSize: 8, fontFamily: "SpaceGrotesk_600SemiBold" }}>Unlayer</Text>
                            </Pressable>
                          )}
                          <Pressable
                            onPress={() => { setEditingBlockIndex(null); removeLoopBlock(editingBlockIndex!); }}
                            hitSlop={8}
                          >
                            <Ionicons name="trash-outline" size={11} color={C.danger} />
                          </Pressable>
                          <Pressable onPress={() => setEditingBlockIndex(null)} hitSlop={8}>
                            <Ionicons name="close" size={12} color={C.textTertiary} />
                          </Pressable>
                        </View>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <Text style={{ color: C.textSecondary, fontSize: 9, fontFamily: "SpaceGrotesk_500Medium", width: 36 }}>Repeat</Text>
                        <Pressable
                          onPress={() => { if (editBlock.value > 1) updateBlock(editingBlockIndex!, { value: editBlock.value - 1 }); }}
                          style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: C.accent + "20", alignItems: "center", justifyContent: "center" }}
                        >
                          <Ionicons name="remove" size={12} color={C.accent} />
                        </Pressable>
                        <Text style={{ color: C.text, fontSize: 11, fontFamily: "SpaceGrotesk_700Bold", minWidth: 24, textAlign: "center" }}>
                          ×{editBlock.value}
                        </Text>
                        <Pressable
                          onPress={() => { if (editBlock.value < 16) updateBlock(editingBlockIndex!, { value: editBlock.value + 1 }); }}
                          style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: C.accent + "20", alignItems: "center", justifyContent: "center" }}
                        >
                          <Ionicons name="add" size={12} color={C.accent} />
                        </Pressable>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 }}>
                        <Text style={{ color: C.textSecondary, fontSize: 9, fontFamily: "SpaceGrotesk_500Medium", width: 36 }}>BPM</Text>
                        <Pressable
                          onPress={() => { if (editBlock.bpm) updateBlock(editingBlockIndex!, { bpm: Math.max(20, editBlock.bpm - 5) }); }}
                          style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: editBlock.bpm ? C.accent + "20" : C.overlay08, alignItems: "center", justifyContent: "center", opacity: editBlock.bpm ? 1 : 0.4 }}
                        >
                          <Ionicons name="remove" size={12} color={editBlock.bpm ? C.accent : C.textTertiary} />
                        </Pressable>
                        {editBlock.bpm ? (
                          <TextInput
                            style={{
                              color: C.accent, fontSize: 10, fontFamily: "SpaceGrotesk_700Bold",
                              minWidth: 36, textAlign: "center", paddingHorizontal: 5, paddingVertical: 2,
                              borderRadius: 4, backgroundColor: C.accent + "20", borderWidth: 1, borderColor: C.accent + "50",
                            }}
                            keyboardType="number-pad"
                            defaultValue={String(editBlock.bpm)}
                            key={`bpm-l-${editingBlockIndex}-${editBlock.bpm}`}
                            onEndEditing={(e) => {
                              const v = parseInt(e.nativeEvent.text, 10);
                              if (!isNaN(v) && v >= 20 && v <= 300) updateBlock(editingBlockIndex!, { bpm: v });
                              else if (e.nativeEvent.text === "" || e.nativeEvent.text === "0") updateBlock(editingBlockIndex!, { bpm: undefined });
                            }}
                            selectTextOnFocus
                          />
                        ) : (
                          <Pressable
                            onPress={() => updateBlock(editingBlockIndex!, { bpm: bpm || 120 })}
                            style={{
                              paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, minWidth: 36, alignItems: "center",
                              backgroundColor: "transparent", borderWidth: 1, borderColor: C.accent + "30",
                            }}
                          >
                            <Text style={{ color: C.textTertiary, fontSize: 10, fontFamily: "SpaceGrotesk_700Bold" }}>—</Text>
                          </Pressable>
                        )}
                        <Pressable
                          onPress={() => { if (editBlock.bpm) updateBlock(editingBlockIndex!, { bpm: Math.min(300, editBlock.bpm + 5) }); }}
                          style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: editBlock.bpm ? C.accent + "20" : C.overlay08, alignItems: "center", justifyContent: "center", opacity: editBlock.bpm ? 1 : 0.4 }}
                        >
                          <Ionicons name="add" size={12} color={editBlock.bpm ? C.accent : C.textTertiary} />
                        </Pressable>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, flexWrap: "wrap", marginBottom: editHasJump ? 4 : 0 }}>
                        <Text style={{ color: C.textSecondary, fontSize: 9, fontFamily: "SpaceGrotesk_500Medium", width: 36 }}>Jump</Text>
                        <Pressable
                          onPress={() => { if (editHasJump) updateBlock(editingBlockIndex!, { jumpToBlock: undefined, jumpCount: undefined }); }}
                          style={{
                            paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4,
                            backgroundColor: !editHasJump ? C.accent + "30" : "transparent",
                            borderWidth: 1, borderColor: C.accent + "30",
                          }}
                        >
                          <Text style={{ color: !editHasJump ? C.accent : C.textTertiary, fontSize: 8, fontFamily: "SpaceGrotesk_500Medium" }}>None</Text>
                        </Pressable>
                        {otherBlocks.map(({ b: ob, i: oi }) => (
                          <Pressable
                            key={oi}
                            onPress={() => updateBlock(editingBlockIndex!, { jumpToBlock: oi, jumpCount: editJumpCount || 1 })}
                            style={{
                              paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4,
                              backgroundColor: editBlock.jumpToBlock === oi ? "#f0ad4e30" : "transparent",
                              borderWidth: 1, borderColor: editBlock.jumpToBlock === oi ? "#f0ad4e50" : C.accent + "30",
                            }}
                          >
                            <Text style={{ color: editBlock.jumpToBlock === oi ? "#f0ad4e" : C.textSecondary, fontSize: 8, fontFamily: "SpaceGrotesk_500Medium" }}>
                              {ob.startBeat + 1}-{Math.min(ob.endBeat + 1, beatsPerMeasure)}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                      {editHasJump && (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Text style={{ color: C.textSecondary, fontSize: 9, fontFamily: "SpaceGrotesk_500Medium", width: 36 }}>Jump ×</Text>
                          <Pressable
                            onPress={() => { if (editJumpCount > 1) updateBlock(editingBlockIndex!, { jumpCount: editJumpCount - 1 }); }}
                            style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: "#f0ad4e20", alignItems: "center", justifyContent: "center" }}
                          >
                            <Ionicons name="remove" size={12} color="#f0ad4e" />
                          </Pressable>
                          <Text style={{ color: C.text, fontSize: 11, fontFamily: "SpaceGrotesk_700Bold", minWidth: 24, textAlign: "center" }}>
                            ×{editJumpCount}
                          </Text>
                          <Pressable
                            onPress={() => { if (editJumpCount < 16) updateBlock(editingBlockIndex!, { jumpCount: editJumpCount + 1 }); }}
                            style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: "#f0ad4e20", alignItems: "center", justifyContent: "center" }}
                          >
                            <Ionicons name="add" size={12} color="#f0ad4e" />
                          </Pressable>
                        </View>
                      )}
                    </View>
                  );
                })()}
                {subdivisionBarElement}
              </View>
            )}
            {!subdivisionBarElement && loopBlocks.length > 0 && (() => {
              const sorted = loopBlocks.map((b, i) => ({ block: b, origIndex: i })).sort((a, b) => a.block.startBeat - b.block.startBeat);
              return (
                <View style={{ flexGrow: 0 }}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 42 }} contentContainerStyle={{ paddingHorizontal: 6, paddingVertical: 3, gap: 4, alignItems: "center" }}>
                    {sorted.map(({ block, origIndex }, si) => {
                      const isEditing = editingBlockIndex === origIndex;
                      const isActive = isPlaying && progressInfo && progressInfo.blockIndex === origIndex;
                      const hasJump = block.jumpToBlock !== undefined && block.jumpToBlock !== null;
                      const jumpTarget = hasJump ? loopBlocks[block.jumpToBlock!] : null;
                      return (
                        <View key={`flow-${origIndex}`} style={{ flexDirection: "row", alignItems: "center" }}>
                          <BlockPill
                            origIndex={origIndex} block={block} isEditing={isEditing} isActive={!!isActive} isPlaying={isPlaying}
                            isDragSource={!!pillDrag && pillDrag.origIndex === origIndex}
                            isDropTarget={pillDropTarget === origIndex}
                            hasJump={hasJump} layerCount={loopBlocks.filter(b => b.layerOf === origIndex).length}
                            beatsPerMeasure={beatsPerMeasure} progressInfo={progressInfo}
                            accentColor={C.accent} textColor={C.text} textTertiaryColor={C.textTertiary} bgSecondary={C.backgroundSecondary} whiteColor={C.white}
                            onPress={() => { if (!isPlaying) setEditingBlockIndex(isEditing ? null : origIndex); }}
                            onDragStart={handlePillDragStart} onDragMove={handlePillDragMove} onDragEnd={handlePillDragEnd}
                            onMeasure={(idx, layout) => { pillLayoutsRef.current[idx] = layout; }}
                            size="small"
                          />
                          {hasJump && jumpTarget && (() => {
                            const targetSortedIdx = sorted.findIndex(s => s.origIndex === block.jumpToBlock);
                            const goesBack = targetSortedIdx >= 0 && targetSortedIdx <= si;
                            return goesBack ? (
                              <View style={{ alignItems: "center", marginLeft: 3 }}>
                                <Ionicons name="return-up-back" size={10} color="#f0ad4e" />
                              </View>
                            ) : (
                              <Ionicons name="caret-forward" size={8} color="#f0ad4e" style={{ marginLeft: 1 }} />
                            );
                          })()}
                          {si < sorted.length - 1 && !hasJump && (
                            <Ionicons name="chevron-forward" size={8} color={C.textTertiary} style={{ marginLeft: 1, opacity: 0.4 }} />
                          )}
                        </View>
                      );
                    })}
                  </ScrollView>
                </View>
              );
            })()}

            <View style={{ alignItems: "center", gap: 4 }}>
              <Pressable onPress={handleBarClockTap}>
                <Text style={[styles.barInfoText, { color: barClockMode === "timer" ? C.danger : C.accent, fontSize: 16 }]}>
                  {barTimeDisplay}
                </Text>
              </Pressable>
              <Text style={[styles.barInfoText, { color: C.textTertiary, fontSize: 9 }]}>
                {beatsPerMeasure} bars
              </Text>
              <View style={styles.barClockDots}>
                <View style={[styles.barClockDot, barClockMode === "stopwatch" && { backgroundColor: C.accent }]} />
                <View style={[styles.barClockDot, barClockMode === "timer" && { backgroundColor: C.danger }]} />
              </View>
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 }}>
              <Pressable
                onPress={handleSaveResetTap}
                onLongPress={handleSaveResetLongPress}
                delayLongPress={600}
                style={({ pressed }) => [
                  styles.barLoopBtn,
                  isPlaying && { opacity: 0.3 },
                  pressed && !isPlaying && { opacity: 0.5, transform: [{ scale: 0.9 }] },
                ]}
                hitSlop={10}
                testID="bar-save-reset"
                disabled={isPlaying}
              >
                <Ionicons name={saveFlashVisible ? "checkmark-circle" : "bookmark-outline"} size={16} color={saveFlashVisible ? "#4CAF50" : C.accent} />
              </Pressable>
              <Pressable
                onPress={() => { if (!isPlaying && beatsPerMeasure > MIN_BEATS) { onBeatsChange(beatsPerMeasure - 1); if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } }}
                style={[styles.barTimeSigBtn, (isPlaying || beatsPerMeasure <= MIN_BEATS) && { opacity: 0.3 }]}
                hitSlop={8}
              >
                <Ionicons name="remove" size={14} color={C.textSecondary} />
              </Pressable>
              <View>
                <Pressable
                  onPress={onTogglePlay}
                  onLongPress={() => {
                    const next = barLoopMode === "loop" ? "once" : "loop";
                    onBarLoopModeChange(next);
                    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                  }}
                  delayLongPress={400}
                  style={({ pressed }) => [
                    styles.barPlayBtn, { width: 40, height: 40, borderRadius: 20 },
                    pressed && { opacity: 0.7 },
                    isPreparing && { opacity: 0.5 },
                    barLoopMode === "loop" && { borderWidth: 1.5, borderColor: C.accent },
                  ]}
                  testID="bar-play-button"
                  disabled={isPreparing}
                >
                  {isPreparing ? (
                    <ActivityIndicator size="small" color={C.accent} />
                  ) : (
                    <Ionicons name={isPlaying ? "stop" : "play"} size={20} color={isPlaying ? C.danger : C.accent} style={!isPlaying ? { marginLeft: 2 } : undefined} />
                  )}
                </Pressable>
                {barLoopMode === "loop" && (
                  <View style={{ position: "absolute", top: -6, right: -6, backgroundColor: C.accent, borderRadius: 7, width: 14, height: 14, alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="repeat" size={9} color={C.bg} />
                  </View>
                )}
              </View>
              <Pressable
                onPress={() => { if (!isPlaying && beatsPerMeasure < MAX_BEATS) { onBeatsChange(beatsPerMeasure + 1); if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } }}
                style={[styles.barTimeSigBtn, (isPlaying || beatsPerMeasure >= MAX_BEATS) && { opacity: 0.3 }]}
                hitSlop={8}
              >
                <Ionicons name="add" size={14} color={C.textSecondary} />
              </Pressable>
            </View>
            {bpmSliderElement && (
              <View style={{ width: "100%", paddingHorizontal: 4 }}>{bpmSliderElement}</View>
            )}
          </View>

          <Modal visible={barTimerEditing} transparent animationType="fade" onRequestClose={() => setBarTimerEditing(false)}>
            <View style={styles.barTimerOverlay}>
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setBarTimerEditing(false)} />
              <View style={{ alignItems: "center", gap: 10 }}>
                <View style={{ backgroundColor: C.backgroundSecondary, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, gap: 6, minWidth: 200 }}>
                  <Text style={{ color: C.textSecondary, fontSize: 11, fontWeight: "600" as const, textAlign: "center", marginBottom: 2 }}>Clock Mode</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.accent }} />
                    <Text style={{ color: C.text, fontSize: 12 }}>Stopwatch — tap to start/reset</Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.danger }} />
                    <Text style={{ color: C.text, fontSize: 12 }}>Timer — set time, auto-stop</Text>
                  </View>
                  <Text style={{ color: C.textTertiary, fontSize: 10, textAlign: "center", marginTop: 2 }}>Swipe left/right to switch mode</Text>
                </View>
                <View style={styles.barTimerCard}>
                  <View style={styles.barTimerHeader}>
                    <Ionicons name="timer-outline" size={20} color={C.danger} />
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
                    placeholderTextColor={C.textTertiary}
                  />
                  <Text style={styles.barTimerHint}>M:SS or seconds</Text>
                  <Pressable onPress={commitBarTimerInput} style={[styles.barTimerSetBtn, { backgroundColor: C.danger }]}>
                    <Text style={styles.barTimerSetText}>Set</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </Modal>

        </View>
      );
    }

    return (
      <>
      <View style={styles.barModeContainer} testID="beat-indicator-bar-mode">
        <Animated.View
          pointerEvents="none"
          style={[{
            position: "absolute",
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: C.danger,
            zIndex: 999,
          }, resetFlashStyle]}
        />
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
              <Ionicons name="layers" size={16} color={C.white} />
            ) : (
              <Ionicons name="chevron-down" size={18} color={C.textTertiary} />
            )}
          </Pressable>
        </View>

        {loopBlocks.length > 0 && (() => {
          const sorted = loopBlocks.map((b, i) => ({ block: b, origIndex: i })).sort((a, b) => a.block.startBeat - b.block.startBeat);
          const editBlock = editingBlockIndex !== null ? loopBlocks[editingBlockIndex] : null;
          const otherBlocks = editBlock ? loopBlocks.map((b, i) => ({ b, i })).filter(({ i }) => i !== editingBlockIndex) : [];
          const editHasJump = editBlock ? editBlock.jumpToBlock !== undefined && editBlock.jumpToBlock !== null : false;
          const editJumpCount = editBlock ? (editBlock.jumpCount || 1) : 1;
          return (
            <View style={{ flexGrow: 0 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 72 }} contentContainerStyle={{ paddingHorizontal: 8, paddingVertical: 6, gap: 6, alignItems: "center" }}>
                {sorted.map(({ block, origIndex }, si) => {
                  const isEditing = editingBlockIndex === origIndex;
                  const isActive = isPlaying && progressInfo && progressInfo.blockIndex === origIndex;
                  const hasJump = block.jumpToBlock !== undefined && block.jumpToBlock !== null;
                  const jumpTarget = hasJump ? loopBlocks[block.jumpToBlock!] : null;
                  return (
                    <View key={`flow-${origIndex}`} style={{ flexDirection: "row", alignItems: "center" }}>
                      <BlockPill
                        origIndex={origIndex} block={block} isEditing={isEditing} isActive={!!isActive} isPlaying={isPlaying}
                        isDragSource={!!pillDrag && pillDrag.origIndex === origIndex}
                        isDropTarget={pillDropTarget === origIndex}
                        hasJump={hasJump} layerCount={loopBlocks.filter(b => b.layerOf === origIndex).length}
                        beatsPerMeasure={beatsPerMeasure} progressInfo={progressInfo}
                        accentColor={C.accent} textColor={C.text} textTertiaryColor={C.textTertiary} bgSecondary={C.backgroundSecondary} whiteColor={C.white}
                        onPress={() => { if (!isPlaying) setEditingBlockIndex(isEditing ? null : origIndex); }}
                        onDragStart={handlePillDragStart} onDragMove={handlePillDragMove} onDragEnd={handlePillDragEnd}
                        onMeasure={(idx, layout) => { pillLayoutsRef.current[idx] = layout; }}
                        size="normal"
                      />
                      {hasJump && jumpTarget && (() => {
                        const targetSortedIdx = sorted.findIndex(s => s.origIndex === block.jumpToBlock);
                        const goesBack = targetSortedIdx >= 0 && targetSortedIdx <= si;
                        const isActiveJump = isPlaying && progressInfo && progressInfo.jumpSourceBlockIndex === origIndex && (progressInfo.jumpTotal ?? 0) > 0;
                        const jumpLabel = isActiveJump
                          ? `${(progressInfo!.jumpCurrent ?? 0) + 1}/${progressInfo!.jumpTotal}`
                          : `×${block.jumpCount || 1}`;
                        return goesBack ? (
                          <View style={{ alignItems: "center", marginLeft: 4, marginRight: 2 }}>
                            <View style={{ flexDirection: "row", alignItems: "center" }}>
                              <Ionicons name="return-up-back" size={14} color="#f0ad4e" />
                              <View style={{
                                paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4,
                                backgroundColor: isActiveJump ? "#f0ad4e30" : "#f0ad4e15",
                                marginLeft: 2,
                              }}>
                                <Text style={{ color: "#f0ad4e", fontSize: 8, fontFamily: "SpaceGrotesk_700Bold" }}>
                                  → {jumpTarget.startBeat + 1}-{Math.min(jumpTarget.endBeat + 1, beatsPerMeasure)} {jumpLabel}
                                </Text>
                              </View>
                            </View>
                          </View>
                        ) : (
                          <View style={{ flexDirection: "row", alignItems: "center", marginLeft: 2 }}>
                            <View style={{ width: 10, height: 1.5, backgroundColor: "#f0ad4e" }} />
                            <Ionicons name="caret-forward" size={10} color="#f0ad4e" style={{ marginLeft: -2 }} />
                            <View style={{
                              paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4,
                              backgroundColor: isActiveJump ? "#f0ad4e30" : "#f0ad4e15",
                              marginLeft: 2,
                            }}>
                              <Text style={{ color: "#f0ad4e", fontSize: 8, fontFamily: "SpaceGrotesk_700Bold" }}>
                                {jumpTarget.startBeat + 1}-{Math.min(jumpTarget.endBeat + 1, beatsPerMeasure)} {jumpLabel}
                              </Text>
                            </View>
                          </View>
                        );
                      })()}
                      {si < sorted.length - 1 && !hasJump && (
                        <Ionicons name="chevron-forward" size={10} color={C.textTertiary} style={{ marginLeft: 2, opacity: 0.4 }} />
                      )}
                    </View>
                  );
                })}
                {!isPlaying && loopBlocks.length >= 2 && (() => {
                  const nextMode = blockPlayMode === "sequential" ? "loop" : blockPlayMode === "loop" ? "random" : "sequential";
                  const icon = blockPlayMode === "sequential" ? "arrow-forward" : blockPlayMode === "loop" ? "repeat" : "shuffle";
                  const label = blockPlayMode === "sequential" ? "Once" : blockPlayMode === "loop" ? "Loop" : "Random";
                  const isHighlight = blockPlayMode !== "loop";
                  return (
                    <Pressable
                      onPress={() => onBlockPlayModeChange(nextMode)}
                      style={{
                        paddingHorizontal: 6,
                        paddingVertical: 4,
                        borderRadius: 6,
                        backgroundColor: isHighlight ? "#f0ad4e20" : C.backgroundSecondary,
                        borderWidth: isHighlight ? 1 : 0,
                        borderColor: "#f0ad4e60",
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 3,
                      }}
                      hitSlop={4}
                    >
                      <Ionicons
                        name={icon}
                        size={12}
                        color={isHighlight ? "#f0ad4e" : C.textTertiary}
                      />
                      <Text style={{
                        color: isHighlight ? "#f0ad4e" : C.textTertiary,
                        fontSize: 9,
                        fontFamily: "SpaceGrotesk_600SemiBold",
                      }}>
                        {label}
                      </Text>
                    </Pressable>
                  );
                })()}
              </ScrollView>
              {!isPlaying && editingBlockIndex !== null && editBlock && (
                <View style={{
                  backgroundColor: C.backgroundSecondary,
                  borderRadius: 8,
                  marginHorizontal: 8,
                  marginBottom: 4,
                  padding: 8,
                  borderWidth: 1,
                  borderColor: C.accent + "30",
                }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <Text style={{ color: C.accent, fontSize: 11, fontFamily: "SpaceGrotesk_700Bold" }}>
                      Block {editBlock.startBeat + 1}-{Math.min(editBlock.endBeat + 1, beatsPerMeasure)}
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      {loopBlocks.some(b => b.layerOf === editingBlockIndex) && (
                        <Pressable
                          onPress={() => {
                            const updated = loopBlocks.map(b => b.layerOf === editingBlockIndex ? { ...b, layerOf: undefined, ownBeatTypes: undefined, ownSubdivisions: undefined } : b);
                            onLoopBlocksChange(updated);
                          }}
                          hitSlop={8}
                          style={{ flexDirection: "row", alignItems: "center", gap: 3 }}
                        >
                          <Ionicons name="layers-outline" size={12} color={C.accent} />
                          <Text style={{ color: C.accent, fontSize: 9, fontFamily: "SpaceGrotesk_600SemiBold" }}>Unlayer</Text>
                        </Pressable>
                      )}
                      <Pressable
                        onPress={() => { setEditingBlockIndex(null); removeLoopBlock(editingBlockIndex!); }}
                        hitSlop={8}
                        style={{ flexDirection: "row", alignItems: "center", gap: 3 }}
                      >
                        <Ionicons name="trash-outline" size={12} color={C.danger} />
                      </Pressable>
                      <Pressable onPress={() => setEditingBlockIndex(null)} hitSlop={8}>
                        <Ionicons name="close" size={14} color={C.textTertiary} />
                      </Pressable>
                    </View>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <Text style={{ color: C.textSecondary, fontSize: 10, fontFamily: "SpaceGrotesk_500Medium", width: 48 }}>Repeat</Text>
                    <Pressable
                      onPress={() => { if (editBlock.value > 1) updateBlock(editingBlockIndex!, { value: editBlock.value - 1 }); }}
                      style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: C.accent + "20", alignItems: "center", justifyContent: "center" }}
                    >
                      <Ionicons name="remove" size={14} color={C.accent} />
                    </Pressable>
                    <Text style={{ color: C.text, fontSize: 13, fontFamily: "SpaceGrotesk_700Bold", minWidth: 28, textAlign: "center" }}>
                      ×{editBlock.value}
                    </Text>
                    <Pressable
                      onPress={() => { if (editBlock.value < 16) updateBlock(editingBlockIndex!, { value: editBlock.value + 1 }); }}
                      style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: C.accent + "20", alignItems: "center", justifyContent: "center" }}
                    >
                      <Ionicons name="add" size={14} color={C.accent} />
                    </Pressable>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <Text style={{ color: C.textSecondary, fontSize: 10, fontFamily: "SpaceGrotesk_500Medium", width: 48 }}>BPM</Text>
                    <Pressable
                      onPress={() => {
                        if (editBlock.bpm) {
                          const newBpm = Math.max(20, editBlock.bpm - 5);
                          updateBlock(editingBlockIndex!, { bpm: newBpm });
                        }
                      }}
                      style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: editBlock.bpm ? C.accent + "20" : C.overlay08, alignItems: "center", justifyContent: "center", opacity: editBlock.bpm ? 1 : 0.4 }}
                    >
                      <Ionicons name="remove" size={14} color={editBlock.bpm ? C.accent : C.textTertiary} />
                    </Pressable>
                    {editBlock.bpm ? (
                      <TextInput
                        style={{
                          color: C.accent, fontSize: 11, fontFamily: "SpaceGrotesk_700Bold",
                          minWidth: 44, textAlign: "center", paddingHorizontal: 6, paddingVertical: 2,
                          borderRadius: 4, backgroundColor: C.accent + "20", borderWidth: 1, borderColor: C.accent + "50",
                        }}
                        keyboardType="number-pad"
                        defaultValue={String(editBlock.bpm)}
                        key={`bpm-p-${editingBlockIndex}-${editBlock.bpm}`}
                        onEndEditing={(e) => {
                          const v = parseInt(e.nativeEvent.text, 10);
                          if (!isNaN(v) && v >= 20 && v <= 300) updateBlock(editingBlockIndex!, { bpm: v });
                          else if (e.nativeEvent.text === "" || e.nativeEvent.text === "0") updateBlock(editingBlockIndex!, { bpm: undefined });
                        }}
                        selectTextOnFocus
                      />
                    ) : (
                      <Pressable
                        onPress={() => updateBlock(editingBlockIndex!, { bpm: bpm || 120 })}
                        style={{
                          paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, minWidth: 44, alignItems: "center",
                          backgroundColor: "transparent", borderWidth: 1, borderColor: C.accent + "30",
                        }}
                      >
                        <Text style={{ color: C.textTertiary, fontSize: 11, fontFamily: "SpaceGrotesk_700Bold" }}>—</Text>
                      </Pressable>
                    )}
                    <Pressable
                      onPress={() => {
                        if (editBlock.bpm) {
                          const newBpm = Math.min(300, editBlock.bpm + 5);
                          updateBlock(editingBlockIndex!, { bpm: newBpm });
                        }
                      }}
                      style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: editBlock.bpm ? C.accent + "20" : C.overlay08, alignItems: "center", justifyContent: "center", opacity: editBlock.bpm ? 1 : 0.4 }}
                    >
                      <Ionicons name="add" size={14} color={editBlock.bpm ? C.accent : C.textTertiary} />
                    </Pressable>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: editHasJump ? 6 : 0 }}>
                    <Text style={{ color: C.textSecondary, fontSize: 10, fontFamily: "SpaceGrotesk_500Medium", width: 48 }}>Jump</Text>
                    <Pressable
                      onPress={() => { if (editHasJump) updateBlock(editingBlockIndex!, { jumpToBlock: undefined, jumpCount: undefined }); }}
                      style={{
                        paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4,
                        backgroundColor: !editHasJump ? C.accent + "30" : "transparent",
                        borderWidth: 1, borderColor: C.accent + "30",
                      }}
                    >
                      <Text style={{ color: !editHasJump ? C.accent : C.textTertiary, fontSize: 9, fontFamily: "SpaceGrotesk_500Medium" }}>None</Text>
                    </Pressable>
                    {otherBlocks.map(({ b: ob, i: oi }) => (
                      <Pressable
                        key={oi}
                        onPress={() => updateBlock(editingBlockIndex!, { jumpToBlock: oi, jumpCount: editJumpCount || 1 })}
                        style={{
                          paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4,
                          backgroundColor: editBlock.jumpToBlock === oi ? "#f0ad4e30" : "transparent",
                          borderWidth: 1, borderColor: editBlock.jumpToBlock === oi ? "#f0ad4e50" : C.accent + "30",
                        }}
                      >
                        <Text style={{ color: editBlock.jumpToBlock === oi ? "#f0ad4e" : C.textSecondary, fontSize: 9, fontFamily: "SpaceGrotesk_500Medium" }}>
                          {ob.startBeat + 1}-{Math.min(ob.endBeat + 1, beatsPerMeasure)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  {editHasJump && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text style={{ color: C.textSecondary, fontSize: 10, fontFamily: "SpaceGrotesk_500Medium", width: 48 }}>Jump ×</Text>
                      <Pressable
                        onPress={() => { if (editJumpCount > 1) updateBlock(editingBlockIndex!, { jumpCount: editJumpCount - 1 }); }}
                        style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: "#f0ad4e20", alignItems: "center", justifyContent: "center" }}
                      >
                        <Ionicons name="remove" size={14} color="#f0ad4e" />
                      </Pressable>
                      <Text style={{ color: C.text, fontSize: 13, fontFamily: "SpaceGrotesk_700Bold", minWidth: 28, textAlign: "center" }}>
                        ×{editJumpCount}
                      </Text>
                      <Pressable
                        onPress={() => { if (editJumpCount < 16) updateBlock(editingBlockIndex!, { jumpCount: editJumpCount + 1 }); }}
                        style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: "#f0ad4e20", alignItems: "center", justifyContent: "center" }}
                      >
                        <Ionicons name="add" size={14} color="#f0ad4e" />
                      </Pressable>
                    </View>
                  )}
                </View>
              )}
            </View>
          );
        })()}

        {blockSelectStart !== null && !isPlaying && (
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 4, gap: 6 }}>
            <Ionicons name="locate" size={12} color={C.accent} />
            <Text style={{ fontFamily: "SpaceGrotesk_500Medium", fontSize: 11, color: C.accent }}>
              Bar {blockSelectStart + 1} selected — long press same or another bar to create block
            </Text>
            <Pressable onPress={() => setBlockSelectStart(null)} hitSlop={8}>
              <Ionicons name="close-circle" size={14} color={C.textTertiary} />
            </Pressable>
          </View>
        )}

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
            scrollEnabled={!isPlaying}
            onScroll={(e) => { barScrollYRef.current = e.nativeEvent.contentOffset.y; onBarScrollOffset?.(e.nativeEvent.contentOffset.y); }}
            scrollEventThrottle={16}
          >
            <View style={[styles.barMeasureInner, { paddingTop: centerPad, paddingBottom: centerPad, gap: barGap }]}>
              {allBarRows}
              {loopBlocks.length > 0 && (() => {
                const copies = isPlaying && barLoopMode !== "once" ? NUM_COPIES : 1;
                const primaryCopy = isPlaying && barLoopMode !== "once" ? CENTER_COPY : 0;
                const BLOCK_INDENT = 10;
                const LINE_BASE_LEFT = 3;

                return loopBlocks.map((block, idx) => {
                  const depth = blockDepths.get(idx) || 0;
                  const lineWidth = Math.max(2, 3 - depth * 0.5);
                  const lineLeft = LINE_BASE_LEFT + depth * BLOCK_INDENT;
                  const lineOpacity = Math.max(0.3, 0.7 - depth * 0.15);
                  const startBeat = block.startBeat;
                  const endBeat = Math.min(block.endBeat, beatsPerMeasure - 1);
                  const isEditing = editingBlockIndex === idx;
                  const isActive = isPlaying && progressInfo && progressInfo.blockIndex === idx;
                  const isSingleBeat = startBeat === endBeat;
                  const bracketW = 5;

                  const elements: React.ReactNode[] = [];
                  for (let copy = 0; copy < copies; copy++) {
                    const copyOffset = copy * copyHeight;
                    const topPos = centerPad + copyOffset + getBeatTop(startBeat) + (isSingleBeat ? BAR_HEIGHT / 2 - 6 : 2);
                    const endLayerCount = getLayerCountForBeat(endBeat);
                    const endBeatContentH = endLayerCount > 0 ? BAR_HEIGHT + endLayerCount * BAR_HEIGHT : BAR_HEIGHT;
                    const bottomPos = centerPad + copyOffset + getBeatTop(endBeat) + endBeatContentH - (isSingleBeat ? BAR_HEIGHT / 2 - 6 : 2);
                    const totalH = bottomPos - topPos;
                    if (totalH <= 0) continue;
                    const isPrimaryCopy = copy === primaryCopy;
                    const copyOp = isPrimaryCopy ? 1 : 0.3;
                    const lineOp = (isActive ? 0.95 : isEditing ? 0.85 : lineOpacity) * copyOp;

                    elements.push(
                      <React.Fragment key={`blk-${idx}-c${copy}`}>
                        <View pointerEvents="none" style={{
                          position: "absolute",
                          left: lineLeft,
                          top: topPos,
                          width: lineWidth,
                          height: totalH,
                          backgroundColor: C.accent,
                          borderRadius: lineWidth / 2,
                          opacity: lineOp,
                          zIndex: 10 + depth,
                        }} />
                        <View pointerEvents="none" style={{
                          position: "absolute",
                          left: lineLeft,
                          top: topPos,
                          width: bracketW,
                          height: lineWidth,
                          backgroundColor: C.accent,
                          borderTopLeftRadius: lineWidth / 2,
                          borderTopRightRadius: lineWidth / 2,
                          opacity: lineOp,
                          zIndex: 10 + depth,
                        }} />
                        <View pointerEvents="none" style={{
                          position: "absolute",
                          left: lineLeft,
                          top: bottomPos - lineWidth,
                          width: bracketW,
                          height: lineWidth,
                          backgroundColor: C.accent,
                          borderBottomLeftRadius: lineWidth / 2,
                          borderBottomRightRadius: lineWidth / 2,
                          opacity: lineOp,
                          zIndex: 10 + depth,
                        }} />
                      </React.Fragment>
                    );
                  }
                  return elements;
                });
              })()}
            </View>
          </ScrollView>
          <LinearGradient
            colors={[C.background, C.background, C.background + "80", "transparent"]}
            locations={[0, 0.45, 0.75, 1]}
            style={[styles.barFadeGradient, { top: 0, height: rowH * 1.8 }]}
            pointerEvents="none"
          />
        </View>
        <LinearGradient
          colors={["transparent", C.background + "60", C.background + "C0", C.background]}
          locations={[0, 0.3, 0.65, 1]}
          style={[styles.barFadeGradientBottom, { height: rowH + 100, marginTop: -(rowH + 100) }]}
          pointerEvents="none"
        />

        <View style={{ flexShrink: 0 }}>
          {subdivisionBarElement && (
            <View style={styles.barSubdivisionSlot}>{subdivisionBarElement}</View>
          )}

          <View style={styles.barBottomRow}>
            <Pressable
              onPress={handleSaveResetTap}
              onLongPress={handleSaveResetLongPress}
              delayLongPress={600}
              style={({ pressed }) => [
                styles.barLoopBtn,
                isPlaying && { opacity: 0.3 },
                pressed && !isPlaying && { opacity: 0.5, transform: [{ scale: 0.9 }] },
              ]}
              hitSlop={10}
              testID="bar-save-reset"
              disabled={isPlaying}
            >
              <Ionicons
                name={saveFlashVisible ? "checkmark-circle" : "bookmark-outline"}
                size={18}
                color={saveFlashVisible ? "#4CAF50" : C.accent}
              />
            </Pressable>
            <View style={styles.barTimeSigRow}>
              <Pressable
                onPress={() => { if (!isPlaying && beatsPerMeasure > MIN_BEATS) { onBeatsChange(beatsPerMeasure - 1); if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } }}
                style={[styles.barTimeSigBtn, (isPlaying || beatsPerMeasure <= MIN_BEATS) && { opacity: 0.3 }]}
                hitSlop={8}
              >
                <Ionicons name="remove" size={16} color={C.textSecondary} />
              </Pressable>
              <View style={styles.barInfoCol} {...barClockSwipePan.panHandlers}>
                <Pressable onPress={handleBarClockTap}>
                  <Text style={[styles.barInfoText, { color: barClockMode === "timer" ? C.danger : C.accent }]}>
                    {barTimeDisplay}
                    {barClockMode === "timer" && !isPlaying && <Text style={{ fontSize: 9, color: C.textTertiary }}> &#9202;</Text>}
                  </Text>
                </Pressable>
                <Text style={[styles.barInfoText, { color: C.textTertiary, fontSize: 10 }]}>
                  {beatsPerMeasure} bars
                </Text>
                <View style={styles.barClockDots}>
                  <View style={[styles.barClockDot, barClockMode === "stopwatch" && { backgroundColor: C.accent }]} />
                  <View style={[styles.barClockDot, barClockMode === "timer" && { backgroundColor: C.danger }]} />
                </View>
              </View>
              <Pressable
                onPress={() => { if (!isPlaying && beatsPerMeasure < MAX_BEATS) { onBeatsChange(beatsPerMeasure + 1); if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } }}
                style={[styles.barTimeSigBtn, (isPlaying || beatsPerMeasure >= MAX_BEATS) && { opacity: 0.3 }]}
                hitSlop={8}
              >
                <Ionicons name="add" size={16} color={C.textSecondary} />
              </Pressable>
            </View>
            <View>
              <Pressable
                onPress={onTogglePlay}
                onLongPress={() => {
                  const next = barLoopMode === "loop" ? "once" : "loop";
                  onBarLoopModeChange(next);
                  if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                }}
                delayLongPress={400}
                style={({ pressed }) => [
                  styles.barPlayBtn,
                  pressed && { opacity: 0.7 },
                  isPreparing && { opacity: 0.5 },
                  barLoopMode === "loop" && { borderWidth: 1.5, borderColor: C.accent },
                ]}
                testID="bar-play-button"
                disabled={isPreparing}
              >
                {isPreparing ? (
                  <ActivityIndicator size="small" color={C.accent} />
                ) : (
                  <Ionicons
                    name={isPlaying ? "stop" : "play"}
                    size={22}
                    color={isPlaying ? C.danger : C.accent}
                    style={!isPlaying ? { marginLeft: 2 } : undefined}
                  />
                )}
              </Pressable>
              {barLoopMode === "loop" && (
                <View style={{ position: "absolute", top: -6, right: -6, backgroundColor: C.accent, borderRadius: 7, width: 14, height: 14, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="repeat" size={9} color={C.bg} />
                </View>
              )}
            </View>
          </View>
        </View>

        <Modal
          visible={barTimerEditing}
          transparent
          animationType="fade"
          onRequestClose={() => setBarTimerEditing(false)}
        >
          <View style={styles.barTimerOverlay}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setBarTimerEditing(false)} />
            <View style={{ alignItems: "center", gap: 10 }}>
              <View style={{ backgroundColor: C.backgroundSecondary, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, gap: 6, minWidth: 200 }}>
                <Text style={{ color: C.textSecondary, fontSize: 11, fontWeight: "600" as const, textAlign: "center", marginBottom: 2 }}>Clock Mode</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.accent }} />
                  <Text style={{ color: C.text, fontSize: 12 }}>Stopwatch — tap to start/reset</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.danger }} />
                  <Text style={{ color: C.text, fontSize: 12 }}>Timer — set time, auto-stop</Text>
                </View>
                <Text style={{ color: C.textTertiary, fontSize: 10, textAlign: "center", marginTop: 2 }}>Swipe left/right to switch mode</Text>
              </View>
              <View style={styles.barTimerCard}>
                <View style={styles.barTimerHeader}>
                  <Ionicons name="timer-outline" size={20} color={C.danger} />
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
                  placeholderTextColor={C.textTertiary}
                />
                <Text style={styles.barTimerHint}>M:SS or seconds</Text>
                <Pressable
                  onPress={commitBarTimerInput}
                  style={[styles.barTimerSetBtn, { backgroundColor: C.danger }]}
                >
                  <Text style={styles.barTimerSetText}>Set</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        <Modal
          visible={repeatModalBeat !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setRepeatModalBeat(null)}
        >
          <View style={styles.barTimerOverlay}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setRepeatModalBeat(null)} />
            <View style={[styles.barTimerCard, { width: 260 }]}>
              <View style={styles.barTimerHeader}>
                <Ionicons name="repeat" size={18} color={C.accent} />
                <Text style={[styles.barTimerTitle, { color: C.accent }]}>
                  Bar {repeatModalBeat !== null ? repeatModalBeat + 1 : ""} Repeat
                </Text>
              </View>

              <View style={{ flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: 14 }}>
                <Pressable
                  onPress={() => setRepeatType("count")}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 6,
                    borderRadius: 14,
                    backgroundColor: repeatType === "count" ? C.accent + "30" : C.overlay08,
                  }}
                >
                  <Text style={{ color: repeatType === "count" ? C.accent : C.textSecondary, fontSize: 13, fontWeight: "600" }}>Count</Text>
                </Pressable>
                <Pressable
                  onPress={() => setRepeatType("duration")}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 6,
                    borderRadius: 14,
                    backgroundColor: repeatType === "duration" ? C.accent + "30" : C.overlay08,
                  }}
                >
                  <Text style={{ color: repeatType === "duration" ? C.accent : C.textSecondary, fontSize: 13, fontWeight: "600" }}>Time</Text>
                </Pressable>
              </View>

              {repeatType === "count" ? (
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 16 }}>
                  <Pressable
                    onPress={() => setRepeatCountVal(Math.max(1, repeatCountVal - 1))}
                    style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: C.overlay10, alignItems: "center", justifyContent: "center" }}
                  >
                    <Ionicons name="remove" size={16} color={C.textSecondary} />
                  </Pressable>
                  {repeatCountEditing ? (
                    <TextInput
                      style={{ color: C.text, fontSize: 22, fontWeight: "700", textAlign: "center", width: 50, borderBottomWidth: 1, borderBottomColor: C.accent, padding: 0 }}
                      value={repeatCountText}
                      onChangeText={setRepeatCountText}
                      keyboardType="number-pad"
                      autoFocus
                      selectTextOnFocus
                      onBlur={() => {
                        const n = parseInt(repeatCountText, 10);
                        if (!isNaN(n) && n >= 1) setRepeatCountVal(n);
                        setRepeatCountEditing(false);
                      }}
                      onSubmitEditing={() => {
                        const n = parseInt(repeatCountText, 10);
                        if (!isNaN(n) && n >= 1) setRepeatCountVal(n);
                        setRepeatCountEditing(false);
                      }}
                    />
                  ) : (
                    <Pressable onPress={() => { setRepeatCountText(String(repeatCountVal)); setRepeatCountEditing(true); }}>
                      <Text style={{ color: C.text, fontSize: 22, fontWeight: "700" }}>{`\u00D7${repeatCountVal}`}</Text>
                    </Pressable>
                  )}
                  <Pressable
                    onPress={() => setRepeatCountVal(repeatCountVal + 1)}
                    style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: C.overlay10, alignItems: "center", justifyContent: "center" }}
                  >
                    <Ionicons name="add" size={16} color={C.textSecondary} />
                  </Pressable>
                </View>
              ) : (
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 16 }}>
                  <Pressable
                    onPress={() => {
                      const total = Math.max(0, repeatMinVal * 60 + repeatSecVal - 10);
                      setRepeatMinVal(Math.floor(total / 60));
                      setRepeatSecVal(total % 60);
                    }}
                    style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: C.overlay10, alignItems: "center", justifyContent: "center" }}
                  >
                    <Ionicons name="remove" size={14} color={C.textSecondary} />
                  </Pressable>
                  {repeatMinEditing ? (
                    <TextInput
                      style={{ color: C.text, fontSize: 20, fontWeight: "700", textAlign: "center", width: 30, borderBottomWidth: 1, borderBottomColor: C.accent, padding: 0 }}
                      value={repeatMinText}
                      onChangeText={setRepeatMinText}
                      keyboardType="number-pad"
                      autoFocus
                      selectTextOnFocus
                      onBlur={() => { const n = parseInt(repeatMinText, 10); if (!isNaN(n) && n >= 0) setRepeatMinVal(n); setRepeatMinEditing(false); }}
                      onSubmitEditing={() => { const n = parseInt(repeatMinText, 10); if (!isNaN(n) && n >= 0) setRepeatMinVal(n); setRepeatMinEditing(false); }}
                    />
                  ) : (
                    <Pressable onPress={() => { setRepeatMinText(String(repeatMinVal)); setRepeatMinEditing(true); }}>
                      <Text style={{ color: C.text, fontSize: 20, fontWeight: "700" }}>{repeatMinVal}</Text>
                    </Pressable>
                  )}
                  <Text style={{ color: C.textTertiary, fontSize: 12 }}>m</Text>
                  {repeatSecEditing ? (
                    <TextInput
                      style={{ color: C.text, fontSize: 20, fontWeight: "700", textAlign: "center", width: 30, borderBottomWidth: 1, borderBottomColor: C.accent, padding: 0 }}
                      value={repeatSecText}
                      onChangeText={setRepeatSecText}
                      keyboardType="number-pad"
                      autoFocus
                      selectTextOnFocus
                      onBlur={() => { const n = parseInt(repeatSecText, 10); if (!isNaN(n) && n >= 0 && n < 60) setRepeatSecVal(n); setRepeatSecEditing(false); }}
                      onSubmitEditing={() => { const n = parseInt(repeatSecText, 10); if (!isNaN(n) && n >= 0 && n < 60) setRepeatSecVal(n); setRepeatSecEditing(false); }}
                    />
                  ) : (
                    <Pressable onPress={() => { setRepeatSecText(String(repeatSecVal)); setRepeatSecEditing(true); }}>
                      <Text style={{ color: C.text, fontSize: 20, fontWeight: "700" }}>{String(repeatSecVal).padStart(2, "0")}</Text>
                    </Pressable>
                  )}
                  <Text style={{ color: C.textTertiary, fontSize: 12 }}>s</Text>
                  <Pressable
                    onPress={() => {
                      const total = repeatMinVal * 60 + repeatSecVal + 10;
                      setRepeatMinVal(Math.floor(total / 60));
                      setRepeatSecVal(total % 60);
                    }}
                    style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: C.overlay10, alignItems: "center", justifyContent: "center" }}
                  >
                    <Ionicons name="add" size={14} color={C.textSecondary} />
                  </Pressable>
                </View>
              )}

              <View style={{ marginBottom: 14 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 4 }}>
                  <Ionicons name="speedometer-outline" size={14} color={C.textSecondary} />
                  <Text style={{ color: C.textSecondary, fontSize: 12, fontWeight: "600" }}>BPM Override</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 }}>
                  <Pressable
                    onPress={() => {
                      if (repeatBpmOverride === null) {
                        setRepeatBpmOverride(bpm || 120);
                      } else {
                        setRepeatBpmOverride(Math.max(20, repeatBpmOverride - 5));
                      }
                    }}
                    style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: C.overlay10, alignItems: "center", justifyContent: "center" }}
                  >
                    <Ionicons name="remove" size={14} color={C.textSecondary} />
                  </Pressable>
                  {repeatBpmEditing ? (
                    <TextInput
                      style={{ color: C.text, fontSize: 18, fontWeight: "700", textAlign: "center", width: 50, borderBottomWidth: 1, borderBottomColor: C.accent, padding: 0 }}
                      value={repeatBpmText}
                      onChangeText={setRepeatBpmText}
                      keyboardType="number-pad"
                      autoFocus
                      selectTextOnFocus
                      onBlur={() => {
                        const n = parseInt(repeatBpmText, 10);
                        if (!isNaN(n) && n >= 20 && n <= 300) setRepeatBpmOverride(n);
                        else if (repeatBpmText === "" || repeatBpmText === "0") setRepeatBpmOverride(null);
                        setRepeatBpmEditing(false);
                      }}
                      onSubmitEditing={() => {
                        const n = parseInt(repeatBpmText, 10);
                        if (!isNaN(n) && n >= 20 && n <= 300) setRepeatBpmOverride(n);
                        else if (repeatBpmText === "" || repeatBpmText === "0") setRepeatBpmOverride(null);
                        setRepeatBpmEditing(false);
                      }}
                    />
                  ) : (
                    <Pressable onPress={() => { setRepeatBpmText(repeatBpmOverride !== null ? String(repeatBpmOverride) : ""); setRepeatBpmEditing(true); }}>
                      <Text style={{ color: repeatBpmOverride !== null ? C.accent : C.textTertiary, fontSize: 18, fontWeight: "700" }}>
                        {repeatBpmOverride !== null ? repeatBpmOverride : "—"}
                      </Text>
                    </Pressable>
                  )}
                  <Pressable
                    onPress={() => {
                      if (repeatBpmOverride === null) {
                        setRepeatBpmOverride(bpm || 120);
                      } else {
                        setRepeatBpmOverride(Math.min(300, repeatBpmOverride + 5));
                      }
                    }}
                    style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: C.overlay10, alignItems: "center", justifyContent: "center" }}
                  >
                    <Ionicons name="add" size={14} color={C.textSecondary} />
                  </Pressable>
                  {repeatBpmOverride !== null && (
                    <Pressable
                      onPress={() => setRepeatBpmOverride(null)}
                      style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, backgroundColor: C.overlay08 }}
                    >
                      <Text style={{ color: C.textTertiary, fontSize: 11 }}>Reset</Text>
                    </Pressable>
                  )}
                </View>
              </View>

              <View style={{ flexDirection: "row", gap: 10, justifyContent: "center" }}>
                <Pressable
                  onPress={clearRepeat}
                  style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16, backgroundColor: C.overlay08 }}
                >
                  <Text style={{ color: C.textSecondary, fontSize: 13, fontWeight: "600" }}>Clear</Text>
                </Pressable>
                <Pressable
                  onPress={saveRepeat}
                  style={{ paddingHorizontal: 20, paddingVertical: 8, borderRadius: 16, backgroundColor: C.accent }}
                >
                  <Text style={{ color: C.white, fontSize: 13, fontWeight: "700" }}>Save</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

      </View>
      {pillDragGhost}

      </>
    );
  }

  const dialContent = (
    <View
      ref={containerRef}
      style={isLandscape ? undefined : styles.touchArea}
      testID={isLandscape ? undefined : "beat-indicator-swipe"}
      {...(isLandscape ? {} : nativePanHandlers)}
    >
      <Animated.View
        pointerEvents="none"
        style={[{
          position: "absolute",
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: C.danger,
          zIndex: 999,
        }, resetFlashStyle]}
      />
      <View style={styles.dialContainer}>
        <View
          ref={dialRef}
          style={{ width: S.dialSize, height: S.dialSize }}
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
                beatDirection={beatDirection}
                dDialRadius={S.dialRadius}
                dDotRadiusFromCenter={S.dotRadiusFromCenter}
                dDotSize={S.dotSize}
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
            <Text style={[styles.digitalSignature, { color: halfTime ? C.accent : C.textTertiary, opacity: halfTime ? 0.25 : 0.15 }]} numberOfLines={1} adjustsFontSizeToFit>
              {halfTime ? "1/2" : "1/1"}
            </Text>
          </View>

          <Animated.View
            style={[
              styles.centerGlow,
              {
                backgroundColor: isAccentBeat ? C.accent : C.text,
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
              isPreparing && { opacity: 0.5 },
            ]}
            testID="play-button"
            disabled={isPreparing}
          >
            {isPreparing ? (
              <ActivityIndicator size="large" color={C.accent} />
            ) : (
              <Ionicons
                name={isPlaying ? "stop" : "play"}
                size={56}
                color={isPlaying ? C.danger : C.accent}
                style={!isPlaying ? { marginLeft: 5 } : undefined}
              />
            )}
          </Pressable>

          {dropTargetBeat === -1 && (
            <Text style={[styles.centerDropLabel, { color: C.accent }]}>ALL</Text>
          )}
        </View>
      </View>

      {!isLandscape && <Text style={[styles.hintText, { marginTop: 4, marginBottom: 2 }]}>{t("main", "beatHint")}</Text>}
    </View>
  );

  if (isLandscape) {
    return (
      <>
        <View style={[styles.touchArea, { flexDirection: "row" as const, gap: 12 }]} testID="beat-indicator-swipe" {...nativePanHandlers}>
          {dialContent}
          <View style={{ flexDirection: "column" as const, alignItems: "center" as const, justifyContent: "center" as const, gap: 8 }}>
            <Pressable
              onPress={() => onBarModeChange(true)}
              style={styles.landscapeModeBtn}
              testID="open-bar-mode"
              hitSlop={{ top: 6, bottom: 6, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Open bar mode"
            >
              <Ionicons name="reorder-three" size={S.ms(16, 0.4)} color={C.textTertiary} />
            </Pressable>
            {onEnterNoteMode && (
              <Pressable
                onPress={onEnterNoteMode}
                style={styles.landscapeModeBtn}
                testID="open-note-mode"
                hitSlop={{ top: 6, bottom: 6, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel="Open note mode"
              >
                <Ionicons name="musical-notes-outline" size={S.ms(14, 0.4)} color={C.textTertiary} />
              </Pressable>
            )}
          </View>
        </View>
        {pillDragGhost}
  
      </>
    );
  }

  return (
    <>
      {dialContent}
      {pillDragGhost}

    </>
  );
}

const make_styles = (C: typeof Colors, S: ScaleValues) => StyleSheet.create({
  touchArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    cursor: "grab" as any,
    userSelect: "none" as any,
  },
  dialContainer: {
    width: S.dialSize,
    height: S.dialSize,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden" as const,
  },
  dial: {
    width: S.dialSize,
    height: S.dialSize,
    borderRadius: S.dialRadius,
  },
  centerArea: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  signatureRow: {
    position: "absolute",
    width: S.ms(160),
    height: S.ms(160),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  digitalSignature: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: S.ms(116, 0.4),
    color: C.text,
    opacity: 0.15,
  },
  centerImageContainer: {
    position: "absolute",
    width: S.ms(130),
    height: S.ms(130),
    borderRadius: S.ms(65),
    overflow: "hidden",
    opacity: 0.35,
  },
  centerImage: {
    width: S.ms(130),
    height: S.ms(130),
    borderRadius: S.ms(65),
  },
  centerGlow: {
    position: "absolute",
    width: S.ms(120),
    height: S.ms(120),
    borderRadius: S.ms(60),
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
    letterSpacing: 1,
    color: C.text,
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
    backgroundColor: C.scrim,
    justifyContent: "center",
    alignItems: "center",
  },
  barTimerCard: {
    borderRadius: 16,
    padding: 24,
    width: S.ms(220, 0.5),
    alignItems: "center",
    borderWidth: 1,
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
    color: C.text,
  },
  barTimerInput: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 32,
    textAlign: "center",
    color: C.text,
    padding: 8,
    borderBottomWidth: 2,
    width: "100%" as any,
  },
  barTimerHint: {
    fontSize: 11,
    marginTop: 8,
    fontFamily: "SpaceGrotesk_400Regular",
    color: C.textTertiary,
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
    color: C.white,
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
  },
  barInfoCol: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: S.ms(48, 0.4),
  },
  barInfoText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: S.ms(12, 0.4),
    letterSpacing: 0.5,
    color: C.text,
  },
  dropTargetRing: {
    position: "absolute",
    borderWidth: 2,
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
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  subdivBadgeText: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 9,
    color: C.text,
  },
  centerDropRing: {
    position: "absolute",
    width: S.ms(110),
    height: S.ms(110),
    borderRadius: S.ms(55),
    borderWidth: 2,
    borderStyle: "dashed" as any,
    opacity: 0.8,
  },
  centerDropLabel: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 11,
    letterSpacing: 2,
    marginTop: 8,
    color: C.text,
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
    width: S.ms(32, 0.4),
    height: S.ms(32, 0.4),
    borderRadius: S.ms(16, 0.4),
    backgroundColor: C.overlay06,
    alignItems: "center",
    justifyContent: "center",
  },
  barPlayBtn: {
    width: S.ms(32, 0.4),
    height: S.ms(32, 0.4),
    borderRadius: S.ms(16, 0.4),
    backgroundColor: C.overlay06,
    alignItems: "center",
    justifyContent: "center",
  },
  barLoopBtn: {
    width: S.ms(32, 0.4),
    height: S.ms(32, 0.4),
    borderRadius: S.ms(16, 0.4),
    backgroundColor: C.overlay06,
    alignItems: "center",
    justifyContent: "center",
  },
  barTimeSigRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  barTimeSigBtn: {
    width: S.ms(28, 0.4),
    height: S.ms(28, 0.4),
    borderRadius: S.ms(14, 0.4),
    backgroundColor: C.overlay08,
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
    width: S.ms(22, 0.4),
    alignItems: "center",
    justifyContent: "center",
  },
  barBeatLabelText: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: S.ms(13, 0.4),
    color: C.text,
  },
  barBeatContent: {
    flex: 1,
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: C.overlay08,
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
    backgroundColor: C.overlay03,
  },
  barModeHandle: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: S.ms(8, 0.4),
    paddingHorizontal: S.ms(24, 0.4),
    minWidth: S.ms(80, 0.4),
    minHeight: S.ms(36, 0.4),
    backgroundColor: C.overlay05,
    borderRadius: S.ms(12, 0.3),
  },
  barModeHandleLandscape: {
    position: "absolute" as const,
    right: -30,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingVertical: 12,
    paddingHorizontal: 4,
    backgroundColor: C.overlay07,
    borderRadius: 8,
  },
  noteModeHandleLandscape: {
    position: "absolute" as const,
    left: -30,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingVertical: 12,
    paddingHorizontal: 4,
    backgroundColor: C.overlay07,
    borderRadius: 8,
  },
  landscapeModeBtn: {
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingVertical: S.ms(10, 0.4),
    paddingHorizontal: S.ms(4, 0.3),
    backgroundColor: C.overlay07,
    borderRadius: S.ms(8, 0.3),
  },
  barSubdivisionSlot: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
});
