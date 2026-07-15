import React, { useRef, useEffect, useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  PanResponder,
  Pressable,
  ScrollView,
  TextInput,
  Image,
  ActivityIndicator,
  useWindowDimensions,
  type ViewStyle,
  type TextStyle,
  type ImageStyle,
} from "react-native";
import { AnimatedModal } from "@/components/AnimatedModal";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  useAnimatedReaction,
  withTiming,
  withSequence,
  withSpring,
  useSharedValue,
  cancelAnimation,
  Easing,
} from "react-native-reanimated";
import { glowPlan } from "@/lib/animation-lifecycle";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import Colors from "@/constants/colors";
import { Radius, FontSize, Spacing } from "@/constants/tokens";
import { getLayerCountForBeat, formatRepeat, findPillDropTarget as findPillDropTargetPure, mergePillToLayer, type PillLayout } from "./beat-indicator-helpers";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { moderateScale, SCREEN_WIDTH, IS_TABLET, useScale } from "@/lib/scale";
import type { ScaleValues } from "@/lib/scale";
import { make_styles } from "./BeatIndicator.styles";
import { DialBeatDot } from "./DialBeatDot";
import { BlockPill } from "./BlockPill";
import { BarPlayButton } from "./BarPlayButton";
import { BeatStepperButton } from "./BeatStepperButton";
import { LoopBlockStripCompact } from "./LoopBlockStripCompact";
import { LoopBlockStripDetailed } from "./LoopBlockStripDetailed";
import { BlockEditPanel } from "./BlockEditPanel";
import { BarModeView } from "./BarModeView";

export type { BeatType, BarRepeat, LoopBlock } from "./beat-indicator.types";
import type { BeatType } from "./beat-indicator.types";

const DIAL_SIZE = IS_TABLET
  ? Math.min(SCREEN_WIDTH - 80, 420)
  : Math.min(SCREEN_WIDTH - 48, moderateScale(300));
const DIAL_RADIUS = DIAL_SIZE / 2;
const DOT_RADIUS_FROM_CENTER = DIAL_RADIUS - moderateScale(30, 0.4);
const DOT_SIZE = IS_TABLET ? moderateScale(40, 0.4) : moderateScale(34, 0.4);
const MIN_BEATS = 1;
const MAX_BEATS = 16;

export { DIAL_SIZE, DIAL_RADIUS, DOT_RADIUS_FROM_CENTER };

// DialBeatDot 컴포넌트는 components/DialBeatDot.tsx 로 분리되었습니다.
// (T-SPLIT 1차 진입: BeatIndicator 약 220줄 감소)

// BarRepeat/LoopBlock/BeatType 은 ./beat-indicator.types 에서 re-export (위 라인 참조).
import type { BarRepeat, LoopBlock } from "./beat-indicator.types";

export type { ProgressInfo } from "@/lib/metronome-engine";
type ProgressInfo = import("@/lib/metronome-engine").ProgressInfo;

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
  onDenominatorCycle?: () => void;
  barStartBeat?: number | null;
  onBarStartBeatSelect?: (beat: number | null) => void;
  progressInfo?: ProgressInfo | null;
  layerProgressMap?: Record<string, number>;
  measureCount?: number;
  onBarReset?: () => void;
  halfTime?: boolean;
  beatDenominator?: 2 | 4 | 8;
  isLandscape?: boolean;
  beatDirection?: "cw" | "ccw";
  onEnterNoteMode?: () => void;
  tempoLabel?: string;
  onAddBar?: (draftRepeat?: BarRepeat) => void;
  onDeleteBar?: (beatIndex: number) => void;
  onCopyBar?: (beat: number) => void;
  onReorderBar?: (fromIndex: number, toIndex: number) => void;
  onInsertBarAfter?: (beatIndex: number) => void;
  soundSet?: string;
  onSoundSetChange?: (ss: string) => void;
  layerSoundSets?: Record<number, string>;
  onLayerSoundSetsChange?: (val: Record<number, string>) => void;
  onPreviewSoundSet?: (key: string) => void;
  customSoundSets?: Record<string, import("@/lib/storage").CustomSoundSetConfig>;
  onCustomSoundSetsChange?: (configs: Record<string, import("@/lib/storage").CustomSoundSetConfig>) => void;
  barCellOpacity?: number;
  barRowHeight?: number;
  onEasterEggTrigger?: (isHighRange: boolean) => void;
}

// BlockPill 컴포넌트는 components/BlockPill.tsx 로 분리되었습니다.
// (T-SPLIT 2차: BeatIndicator 약 170줄 추가 감소)

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
  onDenominatorCycle,
  barStartBeat,
  onBarStartBeatSelect,
  progressInfo,
  layerProgressMap = {},
  measureCount = 0,
  onBarReset,
  halfTime,
  beatDenominator = 4,
  isLandscape = false,
  beatDirection = "cw",
  onEnterNoteMode,
  tempoLabel,
  onAddBar,
  onDeleteBar,
  onCopyBar,
  onReorderBar,
  onInsertBarAfter,
  soundSet,
  onSoundSetChange,
  layerSoundSets = {},
  onLayerSoundSetsChange,
  onPreviewSoundSet,
  customSoundSets,
  onCustomSoundSetsChange,
  barCellOpacity,
  barRowHeight,
  onEasterEggTrigger,
}: BeatIndicatorProps) {
  const { colors: C, getImageForBeatType, hubImages } = useTheme();
  const { t } = useLanguage();
  const S = useScale();
  const styles = useMemo(() => make_styles(C, S), [C, S]);

  // 원형 다이얼 — 각도 기반 threshold (45°)
  const ANGLE_THRESHOLD = 45;

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
    // glowPlan이 cancel/pulse/reset 명령을 결정론적으로 산출한다. 고 BPM에서
    // release가 비트 간격보다 길면 글로우가 중첩돼 깜빡임이 누적되므로,
    // 진행 중 애니메이션을 cancel하고 BPM에 맞춰 release를 단축한 단일
    // sequence로 재트리거한다.
    const ops = glowPlan({
      isPlaying,
      currentBeat,
      prevBeat: prevBeatRef.current,
      bpm: bpm ?? 120,
    });
    if (ops.length === 0) return;
    if (!isPlaying) {
      prevBeatRef.current = -1;
    } else if (currentBeat >= 0 && currentBeat !== prevBeatRef.current) {
      prevBeatRef.current = currentBeat;
    }
    for (const op of ops) {
      if (op.type === "cancel") {
        cancelAnimation(centerGlow);
      } else if (op.type === "reset") {
        centerGlow.value = withTiming(0, { duration: op.duration });
      } else {
        centerGlow.value = withSequence(
          withTiming(1, { duration: op.attackMs, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: op.releaseMs, easing: Easing.out(Easing.cubic) })
        );
      }
    }
  }, [isPlaying, currentBeat, bpm]);

  const startPosRef = useRef({ x: 0, y: 0 });
  const centerRef = useRef({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const triggeredRef = useRef(false);
  const lastDeltaAngleRef = useRef(0);
  const accumulatedAngleDeltaRef = useRef(0);
  const prevMoveAngleRef = useRef<number | null>(null);
  const totalRotationRef = useRef(0);
  const easterEggLockRef = useRef(false);
  const onEasterEggTriggerRef = useRef(onEasterEggTrigger);
  const beatsRef = useRef(beatsPerMeasure);
  const onBeatsChangeRef = useRef(onBeatsChange);
  const containerRef = useRef<View>(null);

  useEffect(() => {
    beatsRef.current = beatsPerMeasure;
  }, [beatsPerMeasure]);
  useEffect(() => {
    onBeatsChangeRef.current = onBeatsChange;
  }, [onBeatsChange]);
  useEffect(() => {
    onEasterEggTriggerRef.current = onEasterEggTrigger;
  }, [onEasterEggTrigger]);

  const handleBeatsDecrement = useCallback(() => {
    if (beatsPerMeasure > MIN_BEATS) {
      onBeatsChange(beatsPerMeasure - 1);
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  }, [beatsPerMeasure, onBeatsChange]);

  const handleBeatsIncrement = useCallback(() => {
    if (beatsPerMeasure < MAX_BEATS) {
      onBeatsChange(beatsPerMeasure + 1);
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  }, [beatsPerMeasure, onBeatsChange]);

  const resetVisuals = useCallback(() => {
    swipeProgress.value = withTiming(0, { duration: 200 });
    swipeDirection.value = 0;
    dialRotation.value = withSpring(0, { damping: 15, stiffness: 300 });
  }, []);

  // 각도 헬퍼
  const getAngleDeg = (cx: number, cy: number, px: number, py: number) =>
    Math.atan2(py - cy, px - cx) * (180 / Math.PI);
  const wrapAngle = (d: number) => {
    let r = d % 360;
    if (r > 180) r -= 360;
    if (r < -180) r += 360;
    return r;
  };

  // 원형 다이얼 기준 각도 차이로 비주얼 피드백 처리 (비트 변경은 release에서)
  const processMoveByAngle = useCallback((deltaAngle: number) => {
    lastDeltaAngleRef.current = deltaAngle;
    const progress = Math.min(Math.abs(deltaAngle) / ANGLE_THRESHOLD, 1);
    const canAdd = beatsRef.current < MAX_BEATS;
    const canRemove = beatsRef.current > MIN_BEATS;

    // 다이얼 자체를 회전량에 비례해 시각적으로 돌림 (절반 감쇠)
    dialRotation.value = deltaAngle * 0.5;

    if (deltaAngle > 0 && canAdd) {
      swipeDirection.value = 1;
      swipeProgress.value = progress;
    } else if (deltaAngle < 0 && canRemove) {
      swipeDirection.value = -1;
      swipeProgress.value = progress;
    } else {
      swipeDirection.value = 0;
      swipeProgress.value = 0;
    }
  }, [ANGLE_THRESHOLD]);

  // 스와이프 종료 시 실제 비트 변경 커밋
  const processMoveByAngleRef = useRef<(delta: number) => void>(() => {});
  useEffect(() => { processMoveByAngleRef.current = processMoveByAngle; }, [processMoveByAngle]);

  const commitAndResetRef = useRef<() => void>(() => {});
  const EASTER_EGG_THRESHOLD = 2520; // 7 full rotations
  const commitAndReset = useCallback(() => {
    const delta = lastDeltaAngleRef.current;
    const progress = Math.min(Math.abs(delta) / ANGLE_THRESHOLD, 1);
    if (progress >= 1) {
      const canAdd = beatsRef.current < MAX_BEATS;
      const canRemove = beatsRef.current > MIN_BEATS;
      if (delta > 0 && canAdd) {
        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onBeatsChangeRef.current(beatsRef.current + 1);
      } else if (delta < 0 && canRemove) {
        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onBeatsChangeRef.current(beatsRef.current - 1);
      }
    }

    // 이스터에그 회전 카운터: 7바퀴 같은 방향으로 돌리면 트리거
    if (!easterEggLockRef.current && Math.abs(delta) > 10) {
      const dir = delta > 0 ? 1 : -1;
      const prevTotal = totalRotationRef.current;
      if (prevTotal === 0 || Math.sign(prevTotal) === dir) {
        totalRotationRef.current += delta;
      } else {
        // 방향 반전 시 누적 초기화 + 진행률 즉시 리셋
        totalRotationRef.current = delta;
      }
      if (Math.abs(totalRotationRef.current) >= EASTER_EGG_THRESHOLD) {
        const isHighRange = Math.abs(totalRotationRef.current) >= EASTER_EGG_THRESHOLD * 1.5;
        totalRotationRef.current = 0;
        easterEggLockRef.current = true;
        setTimeout(() => { easterEggLockRef.current = false; }, 3000);
        onEasterEggTriggerRef.current?.(isHighRange);
      }
    }

    lastDeltaAngleRef.current = 0;
    triggeredRef.current = false;
    resetVisuals();
  }, [ANGLE_THRESHOLD, resetVisuals]);

  useEffect(() => {
    commitAndResetRef.current = commitAndReset;
  }, [commitAndReset]);

  // 바 모드 전환 시 이스터에그 누적 회전량 초기화
  useEffect(() => {
    if (barMode) {
      totalRotationRef.current = 0;
    }
  }, [barMode]);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    // barMode 에서는 dial 컨테이너가 언마운트되어 containerRef 가 null 이므로 스킵
    if (barMode) return;

    // 원의 중심과 시작점을 저장하고 각도 차이로 처리
    const getCenter = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };

    // 누적 증분 방식: start-to-current 방식은 180° 초과 스와이프 시 부호 반전됨
    let prevWebAngle: number | null = null;
    let accumulatedWebDelta = 0;
    const stepWebAngle = (newAngle: number): number => {
      if (prevWebAngle === null) {
        prevWebAngle = newAngle;
        return accumulatedWebDelta;
      }
      let step = newAngle - prevWebAngle;
      if (step > 180) step -= 360;
      if (step < -180) step += 360;
      prevWebAngle = newAngle;
      accumulatedWebDelta += step;
      return accumulatedWebDelta;
    };
    const resetWebAngle = () => {
      prevWebAngle = null;
      accumulatedWebDelta = 0;
    };

    const handleMouseDown = (e: MouseEvent) => {
      const el = containerRef.current as unknown as HTMLElement | null;
      if (el) centerRef.current = getCenter(el);
      startPosRef.current = { x: e.clientX, y: e.clientY };
      isDraggingRef.current = true;
      triggeredRef.current = false;
      lastDeltaAngleRef.current = 0;
      resetWebAngle();
    };
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const curAngle = getAngleDeg(centerRef.current.x, centerRef.current.y, e.clientX, e.clientY);
      processMoveByAngle(stepWebAngle(curAngle));
    };
    const handleMouseUp = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      commitAndResetRef.current();
    };
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 0) return;
      const el = containerRef.current as unknown as HTMLElement | null;
      if (el) centerRef.current = getCenter(el);
      startPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      isDraggingRef.current = true;
      triggeredRef.current = false;
      lastDeltaAngleRef.current = 0;
      resetWebAngle();
    };
    const handleTouchMove = (e: TouchEvent) => {
      if (!isDraggingRef.current || e.touches.length === 0) return;
      const curAngle = getAngleDeg(centerRef.current.x, centerRef.current.y, e.touches[0].clientX, e.touches[0].clientY);
      processMoveByAngle(stepWebAngle(curAngle));
    };
    const handleTouchEnd = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      commitAndResetRef.current();
    };

    // dial 컨테이너가 다음 페인트에 마운트되었을 수 있으므로 짧게 폴링
    let attached: HTMLElement | null = null;
    let cancelled = false;
    const attach = () => {
      if (cancelled) return;
      const el = containerRef.current as unknown as HTMLElement | null;
      if (!el || !el.addEventListener) {
        // 다음 프레임에 재시도 (최대 ~5회)
        return false;
      }
      el.addEventListener("mousedown", handleMouseDown);
      el.addEventListener("touchstart", handleTouchStart, { passive: true });
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.addEventListener("touchmove", handleTouchMove, { passive: true });
      document.addEventListener("touchend", handleTouchEnd);
      document.addEventListener("touchcancel", handleTouchEnd);
      attached = el;
      return true;
    };

    let tries = 0;
    const tryAttach = () => {
      if (attach()) return;
      tries += 1;
      if (tries < 6) requestAnimationFrame(tryAttach);
    };
    tryAttach();

    return () => {
      cancelled = true;
      if (attached) {
        attached.removeEventListener("mousedown", handleMouseDown);
        attached.removeEventListener("touchstart", handleTouchStart);
      }
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
      document.removeEventListener("touchcancel", handleTouchEnd);
      // 모드 전환 시 드래그 상태 잔류 방지
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        triggeredRef.current = false;
        resetVisuals();
      }
    };
  }, [processMoveByAngle, resetVisuals, barMode, isLandscape]);

  const panResponder = useRef(
    Platform.OS !== "web"
      ? PanResponder.create({
          onStartShouldSetPanResponder: () => false,
          onStartShouldSetPanResponderCapture: () => false,
          onMoveShouldSetPanResponder: (_, gs) =>
            Math.sqrt(gs.dx * gs.dx + gs.dy * gs.dy) > 20,
          onMoveShouldSetPanResponderCapture: () => false,
          onShouldBlockNativeResponder: () => false,
          onPanResponderGrant: (e, gs) => {
            triggeredRef.current = false;
            lastDeltaAngleRef.current = 0;
            accumulatedAngleDeltaRef.current = 0;
            prevMoveAngleRef.current = null;
            startPosRef.current = { x: gs.x0, y: gs.y0 };
            // 다이얼 컨테이너 중심 측정
            containerRef.current?.measure((_x, _y, width, height, pageX, pageY) => {
              centerRef.current = { x: pageX + width / 2, y: pageY + height / 2 };
            });
          },
          onPanResponderMove: (_, gs) => {
            const cx = centerRef.current.x;
            const cy = centerRef.current.y;
            if (cx === 0 && cy === 0) return;
            const curAngle = Math.atan2(gs.moveY - cy, gs.moveX - cx) * (180 / Math.PI);
            if (prevMoveAngleRef.current === null) {
              prevMoveAngleRef.current = curAngle;
              return;
            }
            let step = curAngle - prevMoveAngleRef.current;
            if (step > 180) step -= 360;
            if (step < -180) step += 360;
            prevMoveAngleRef.current = curAngle;
            accumulatedAngleDeltaRef.current += step;
            processMoveByAngleRef.current(accumulatedAngleDeltaRef.current);
          },
          onPanResponderRelease: () => {
            commitAndResetRef.current();
          },
          onPanResponderTerminate: () => {
            lastDeltaAngleRef.current = 0;
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

  const currentBeatTypeForGlow = isPlaying && currentBeat >= 0 ? (beatTypes[currentBeat] || "normal") : "normal";
  const isAccentBeat = isPlaying && (currentBeatTypeForGlow === "strong" || currentBeatTypeForGlow === "accent");

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
      // 서브디비전 없음: 비트 타입 사이클
      cycleBeatType(beatIndex);
      return;
    }
    if (cellIndex === 0) {
      // 첫 셀: 엔진과 동일한 로직으로 현재 표시 타입을 계산하고 사이클
      // onBeatTypeChange (handleBeatTypeChange)가 rawPattern[0]도 자동 동기화함
      const bType = beatTypes[beatIndex] || "normal";
      let currentDisplay: BeatType;
      if (bType === "mute") {
        currentDisplay = "mute";
      } else if (bType === "strong") {
        currentDisplay = (pattern[0] === "normal" || pattern[0] === "accent") ? "strong" : (pattern[0] as BeatType);
      } else if (bType === "accent") {
        currentDisplay = pattern[0] === "normal" ? "accent" : (pattern[0] as BeatType);
      } else {
        currentDisplay = pattern[0] as BeatType;
      }
      const next: BeatType =
        currentDisplay === "strong" ? "accent"
        : currentDisplay === "accent" ? "normal"
        : currentDisplay === "normal" ? "mute"
        : "strong";
      onBeatTypeChange(beatIndex, next);
      if (Platform.OS !== "web") {
        Haptics.impactAsync(
          next === "strong" || next === "accent"
            ? Haptics.ImpactFeedbackStyle.Heavy
            : next === "mute"
            ? Haptics.ImpactFeedbackStyle.Light
            : Haptics.ImpactFeedbackStyle.Medium
        );
      }
      return;
    }
    const newPattern = [...pattern] as BeatType[];
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
  }, [isPlaying, beatSubdivisions, beatTypes, onBeatSubdivisionChange, onBeatTypeChange, cycleBeatType]);

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
    if (result && typeof (result as { then?: unknown }).then === "function") {
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
  const pillLayoutsRef = useRef<Record<number, PillLayout>>({});

  const findPillDropTarget = useCallback((pageX: number, pageY: number, sourceIdx: number): number | null => {
    return findPillDropTargetPure(pageX, pageY, sourceIdx, pillLayoutsRef.current);
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
      const updated = mergePillToLayer(loopBlocks, origIndex, target, beatTypes, beatSubdivisions);
      if (updated === null) return;
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
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

  const getBeatRowHeight = useCallback((beat: number): number => {
    const layerCount = getLayerCountForBeat(beat, loopBlocks, beatsPerMeasure);
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
        // RN ViewStyle.position 타입은 "absolute"|"relative"만 허용하지만 RN-web에서 "fixed" 동작 — 의도적 cast(타입 시스템 한계)
        position: Platform.OS === "web" ? ("fixed" as "absolute") : "absolute",
        left: pillDrag.x - 24,
        top: pillDrag.y - 24,
        paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs, borderRadius: Radius.sm,
        backgroundColor: C.accent + "90",
        alignItems: "center",
        zIndex: 10000,
      }}
    >
      <Text style={{ color: C.white, fontSize: FontSize.micro, fontFamily: "SpaceGrotesk_700Bold" }}>
        {loopBlocks[pillDrag.origIndex]?.startBeat !== undefined
          ? `${loopBlocks[pillDrag.origIndex].startBeat + 1}-${Math.min(loopBlocks[pillDrag.origIndex].endBeat + 1, beatsPerMeasure)}`
          : "?"}
      </Text>
    </View>
  ) : null;


  if (barMode) {
    return (
      <BarModeView
        beatsPerMeasure={beatsPerMeasure}
        onBeatsChange={onBeatsChange}
        beatTypes={beatTypes}
        onBeatTypeChange={onBeatTypeChange}
        beatSubdivisions={beatSubdivisions}
        onBeatSubdivisionChange={onBeatSubdivisionChange}
        barRepeats={barRepeats}
        onBarRepeatChange={onBarRepeatChange}
        loopBlocks={loopBlocks}
        onLoopBlocksChange={onLoopBlocksChange}
        isPlaying={isPlaying}
        isPreparing={isPreparing}
        currentBeat={currentBeat}
        activeSubNote={activeSubNote}
        onTogglePlay={onTogglePlay}
        barLoopMode={barLoopMode}
        onBarLoopModeChange={onBarLoopModeChange}
        blockPlayMode={blockPlayMode}
        onBlockPlayModeChange={onBlockPlayModeChange}
        progressInfo={progressInfo}
        layerProgressMap={layerProgressMap}
        measureCount={measureCount}
        barStartBeat={barStartBeat ?? null}
        onBarStartBeatSelect={onBarStartBeatSelect ?? (() => {})}
        onAddBar={onAddBar}
        onDeleteBar={onDeleteBar}
        onCopyBar={onCopyBar}
        onReorderBar={onReorderBar}
        onInsertBarAfter={onInsertBarAfter}
        subdivisionBarElement={subdivisionBarElement}
        onBarQuickSave={onBarQuickSave}
        onResetFlash={onResetFlash}
        onBarReset={onBarReset}
        onBarScrollOffset={onBarScrollOffset}
        noteSamples={noteSamples ?? {}}
        noteSampleNames={noteSampleNames}
        noteSampleSources={noteSampleSources}
        bpm={bpm}
        halfTime={halfTime}
        beatDenominator={beatDenominator}
        onDenominatorCycle={onDenominatorCycle}
        isLandscape={isLandscape}
        tempoLabel={tempoLabel}
        colors={{
          background: C.background,
          backgroundSecondary: C.backgroundSecondary,
          text: C.text,
          textSecondary: C.textSecondary,
          textTertiary: C.textTertiary,
          accent: C.accent,
          accentMuted: C.accentMuted,
          danger: C.danger,
          overlay06: C.overlay06,
          overlay08: C.overlay08,
          overlay10: C.overlay10,
          white: C.white,
        }}
        soundSet={soundSet}
        onSoundSetChange={onSoundSetChange}
        onPreviewSoundSet={onPreviewSoundSet}
        layerSoundSets={layerSoundSets}
        onLayerSoundSetsChange={onLayerSoundSetsChange}
        customSoundSets={customSoundSets}
        onCustomSoundSetsChange={onCustomSoundSetsChange}
        ms={S.ms}
        cellOverlayOpacity={barCellOpacity}
        rowHeight={barRowHeight}
        onExitBarMode={() => onBarModeChange(false)}
        onNoteRecordRequest={onNoteRecordRequest}
      />
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
            const currentBeatType = isPlaying && currentBeat >= 0 ? (beatTypes[currentBeat] || "normal") : (beatTypes[0] || "normal");
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

          {(() => {
            const sigText = `${beatsPerMeasure}/${beatDenominator}`;
            const sigFontSize = Math.floor((S.dialSize * 0.55) / (sigText.length * 0.62));
            return (
              <View style={styles.signatureRow} pointerEvents="none">
                <Text style={[styles.digitalSignature, { color: C.textTertiary, opacity: 0.2, fontSize: sigFontSize }]}>
                  {sigText}
                </Text>
              </View>
            );
          })()}

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
            accessibilityRole="button"
            accessibilityLabel={t("a11y", "playButton")}
            accessibilityState={{ selected: isPlaying, disabled: isPreparing }}
          >
            {isPreparing ? (
              <ActivityIndicator size="large" color={C.accent} />
            ) : (
              <Ionicons
                name={isPlaying ? "stop" : "play"}
                size={S.ms(56, 0.4)}
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

    </View>
  );

  if (isLandscape) {
    return (
      <>
        <View style={[styles.touchArea, { flexDirection: "row" as const, gap: 12 }]} testID="beat-indicator-swipe" {...nativePanHandlers}>
          {dialContent}
          <View style={{ flexDirection: "column" as const, alignItems: "center" as const, justifyContent: "center" as const, gap: Spacing.sm }}>
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

