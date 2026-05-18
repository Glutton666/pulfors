/**
 * BarModeView — 바 모드 4단 레이아웃 전면 재설계
 *
 * 레이아웃 (위→아래):
 *   1. 심볼 드로어 (접기/펼치기)
 *   2. 바 목록 (ScrollView, flex:1)
 *   3. 편집기 (레이어 탭 + 서브디비전 바 + 반복 설정)
 *   4. 액션 바 (저장 | 타이머 | 재생)
 */
import React, {
  useState, useRef, useCallback, useMemo, useEffect,
} from "react";
import {
  View, Text, ScrollView, Pressable, PanResponder,
  Animated, TextInput, Platform, StyleSheet,
  type ViewStyle, type StyleProp,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { LinearGradient } from "expo-linear-gradient";
import { AnimatedModal } from "@/components/AnimatedModal";
import { BarPlayButton } from "./BarPlayButton";
import { BeatStepperButton } from "./BeatStepperButton";
import { formatRepeat } from "./beat-indicator-helpers";
import type { BeatType, BarRepeat, LoopBlock, BarLayer } from "./beat-indicator.types";
import type { ProgressInfo } from "@/lib/metronome-engine";
import type { BarModeViewKey } from "@/lib/i18n";
import { Spacing, Radius, FontSize } from "@/constants/tokens";
import { useLanguage } from "@/contexts/LanguageContext";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

// ─── 타입 ────────────────────────────────────────────────────────────────────

type SymbolType = "block" | "repeat" | "jump_from" | "jump_to" | "volta" | "end";

interface BarModeColors {
  background: string;
  backgroundSecondary: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  accent: string;
  accentMuted: string;
  danger: string;
  overlay06: string;
  overlay08: string;
  overlay10: string;
  white: string;
}

export interface BarModeViewProps {
  beatsPerMeasure: number;
  onBeatsChange: (beats: number) => void;
  beatTypes: BeatType[];
  onBeatTypeChange: (index: number, type: BeatType) => void;
  beatSubdivisions: Record<string, BeatType[]>;
  onBeatSubdivisionChange: (beatIndex: number, pattern: BeatType[] | null) => void;
  barRepeats: Record<number, BarRepeat>;
  onBarRepeatChange: (beat: number, repeat: BarRepeat | null) => void;
  loopBlocks: LoopBlock[];
  onLoopBlocksChange: (blocks: LoopBlock[]) => void;
  isPlaying: boolean;
  isPreparing: boolean;
  currentBeat: number;
  activeSubNote: number;
  onTogglePlay: () => void;
  barLoopMode: "loop" | "once";
  onBarLoopModeChange: (mode: "loop" | "once") => void;
  blockPlayMode: "sequential" | "loop" | "random";
  onBlockPlayModeChange: (mode: "sequential" | "loop" | "random") => void;
  progressInfo?: ProgressInfo | null;
  layerProgressMap?: Record<string, number>;
  measureCount?: number;
  barStartBeat: number | null;
  onBarStartBeatSelect: (beat: number | null) => void;
  onAddBar?: () => void;
  onDeleteBar?: (beatIndex: number) => void;
  onCopyBar?: (beat: number) => void;
  subdivisionBarElement?: React.ReactNode;
  onBarQuickSave?: () => Promise<boolean> | void;
  onResetFlash?: () => void;
  onBarReset?: () => void;
  onBarScrollOffset?: (offset: number) => void;
  onBarTimerExpired?: () => void;
  onBarClockConfigChange?: (mode: "stopwatch" | "timer", duration: number) => void;
  initialBarClockMode?: "stopwatch" | "timer";
  initialBarTimerDuration?: number;
  noteSamples?: Record<string, string>;
  noteSampleNames?: Record<string, string>;
  noteSampleSources?: Record<string, string>;
  bpm?: number;
  halfTime?: boolean;
  isLandscape?: boolean;
  tempoLabel?: string;
  colors: BarModeColors;
  ms: (size: number, factor?: number) => number;
}

// ─── 상수 ────────────────────────────────────────────────────────────────────

const BAR_ROW_H = 44;
const MIN_BEATS = 1;
const MAX_BEATS = 16;
const SWIPE_ACTION_THRESHOLD = 60;
const BLOCK_DEPTH_INDENT = 8;

const SYMBOL_INFO: Record<SymbolType, { icon: IoniconName; labelKey: BarModeViewKey; color: (c: BarModeColors) => string }> = {
  block:     { icon: "code-slash",        labelKey: "symbolBlock",    color: c => c.accent },
  repeat:    { icon: "repeat",            labelKey: "symbolRepeat",   color: c => c.accent },
  jump_from: { icon: "arrow-forward",     labelKey: "symbolJumpFrom", color: c => "#f0ad4e" },
  jump_to:   { icon: "arrow-back",        labelKey: "symbolJumpTo",   color: c => "#f0ad4e" },
  volta:     { icon: "hourglass-outline", labelKey: "symbolVolta",    color: c => "#7b68ee" },
  end:       { icon: "stop",              labelKey: "symbolEnd",      color: c => c.danger },
};

const SOUND_SET_OPTIONS: { key: string; labelKey: BarModeViewKey }[] = [
  { key: "classic",   labelKey: "ssClassic" },
  { key: "woodblock", labelKey: "ssWoodblock" },
  { key: "cowbell",   labelKey: "ssCowbell" },
  { key: "digital",   labelKey: "ssDigital" },
  { key: "rimshot",   labelKey: "ssRimshot" },
  { key: "triangle",  labelKey: "ssTriangle" },
  { key: "hihat",     labelKey: "ssHihat" },
];

// ─── 헬퍼 ────────────────────────────────────────────────────────────────────

function cycleBeatType(current: BeatType): BeatType {
  if (current === "strong") return "accent";
  if (current === "accent") return "normal";
  if (current === "normal") return "mute";
  return "strong";
}

function nextJumpPairId(barRepeats: Record<number, BarRepeat>): number {
  let max = 0;
  for (const r of Object.values(barRepeats)) {
    if (r.jumpFromId && r.jumpFromId > max) max = r.jumpFromId;
    if (r.jumpToId && r.jumpToId > max) max = r.jumpToId;
  }
  return max + 1;
}

// ─── 스와이프 가능한 바 행 ───────────────────────────────────────────────────

interface SwipeableBarRowProps {
  beat: number;
  beatType: BeatType;
  subdivisions: BeatType[];
  repeat: BarRepeat | null;
  isCurrentBeat: boolean;
  isEditingBeat: boolean;
  blockDepth: number;
  blockStart: boolean;
  blockEnd: boolean;
  symbolBadges: string[];
  isPlaying: boolean;
  progressCurrent?: number;
  progressTotal?: number;
  onPress: (beat: number) => void;
  onSwipeLeft: (beat: number) => void;
  onSwipeRight: (beat: number) => void;
  onLongPress: (beat: number) => void;
  colors: BarModeColors;
  ms: (size: number, factor?: number) => number;
}

function SwipeableBarRow({
  beat, beatType, subdivisions, repeat, isCurrentBeat, isEditingBeat,
  blockDepth, blockStart, blockEnd, symbolBadges, isPlaying, progressCurrent,
  progressTotal, onPress, onSwipeLeft, onSwipeRight, onLongPress, colors: C, ms,
}: SwipeableBarRowProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  const actionTriggered = useRef(false);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_e, g) =>
      !isPlaying && Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderGrant: () => { actionTriggered.current = false; },
    onPanResponderMove: (_e, g) => {
      translateX.setValue(Math.max(-80, Math.min(80, g.dx * 0.5)));
    },
    onPanResponderRelease: (_e, g) => {
      if (!actionTriggered.current) {
        if (g.dx < -SWIPE_ACTION_THRESHOLD) {
          if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onSwipeLeft(beat);
        } else if (g.dx > SWIPE_ACTION_THRESHOLD) {
          if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onSwipeRight(beat);
        }
      }
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true, tension: 120, friction: 8 }).start();
    },
    onPanResponderTerminate: () => {
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true, tension: 120, friction: 8 }).start();
    },
  }), [isPlaying, beat, onSwipeLeft, onSwipeRight]);

  const cells: BeatType[] = subdivisions.length > 0 ? subdivisions : [beatType];
  const leftPad = blockDepth * BLOCK_DEPTH_INDENT + (blockStart || blockEnd ? 12 : 0);

  return (
    <View style={{ position: "relative", overflow: "hidden" }}>
      <View style={{
        position: "absolute", top: 0, bottom: 0, left: 0, right: 0,
        flexDirection: "row", alignItems: "center",
      }}>
        <View style={{ flex: 1, alignItems: "flex-end", paddingRight: 12 }}>
          <Ionicons name="copy-outline" size={14} color={C.accent} />
        </View>
        <View style={{ flex: 1, alignItems: "flex-start", paddingLeft: 12 }}>
          <Ionicons name="pencil-outline" size={14} color={C.textSecondary} />
        </View>
      </View>

      <Animated.View
        style={{ transform: [{ translateX }] }}
        {...panResponder.panHandlers}
      >
        <Pressable
          onPress={() => { if (!isPlaying) onPress(beat); }}
          onLongPress={() => { if (!isPlaying) onLongPress(beat); }}
          delayLongPress={500}
          style={[
            styles.barRow,
            {
              backgroundColor: isCurrentBeat
                ? C.accent + "18"
                : isEditingBeat
                ? C.backgroundSecondary
                : "transparent",
              borderBottomColor: C.overlay06,
            },
          ]}
        >
          {blockDepth > 0 && (
            <View style={{
              position: "absolute",
              left: blockDepth * BLOCK_DEPTH_INDENT - 2,
              top: blockStart ? BAR_ROW_H / 2 : 0,
              bottom: blockEnd ? BAR_ROW_H / 2 : 0,
              width: 2,
              backgroundColor: C.accent + "60",
            }} />
          )}
          {blockStart && (
            <View style={{
              position: "absolute",
              left: blockDepth * BLOCK_DEPTH_INDENT - 2,
              top: BAR_ROW_H / 2,
              width: 6,
              height: 2,
              backgroundColor: C.accent + "60",
            }} />
          )}
          {blockEnd && (
            <View style={{
              position: "absolute",
              left: blockDepth * BLOCK_DEPTH_INDENT - 2,
              bottom: BAR_ROW_H / 2,
              width: 6,
              height: 2,
              backgroundColor: C.accent + "60",
            }} />
          )}

          <View style={[styles.barRowNumber, { paddingLeft: leftPad + 4 }]}>
            <Text style={[
              styles.barRowNumberText,
              {
                color: isCurrentBeat
                  ? C.accent
                  : beatType === "strong" ? C.accent
                  : beatType === "accent" ? C.accentMuted
                  : beatType === "mute" ? C.textTertiary
                  : C.textSecondary,
                fontFamily: isCurrentBeat ? "SpaceGrotesk_700Bold" : "SpaceGrotesk_500Medium",
              },
            ]}>
              {beat + 1}
            </Text>
          </View>

          <View style={styles.barRowCells}>
            {cells.map((ct, ci) => {
              const isLast = ci === cells.length - 1;
              const isActiveCell = isCurrentBeat;
              return (
                <View
                  key={ci}
                  style={[
                    styles.barMiniCell,
                    !isLast && { borderRightWidth: 0.5, borderRightColor: C.overlay06 },
                    {
                      backgroundColor:
                        ct === "strong" ? (isActiveCell ? C.accent : C.accent + "90")
                        : ct === "accent" ? (isActiveCell ? C.accentMuted : C.accentMuted + "90")
                        : ct === "mute" ? "transparent"
                        : (isActiveCell ? C.textSecondary : C.textTertiary + "60"),
                      borderWidth: ct === "mute" ? 1 : 0,
                      borderColor: ct === "mute" ? C.textTertiary + "80" : "transparent",
                    },
                  ]}
                />
              );
            })}
          </View>

          <View style={styles.barRowRight}>
            {symbolBadges.map((badge, bi) => (
              <Text key={bi} style={[styles.badgeText, { color: C.accent }]}>{badge}</Text>
            ))}
            {isPlaying && progressTotal && progressTotal > 1 && progressCurrent !== undefined ? (
              <Text style={[styles.barRepeatBadge, { color: C.accent, backgroundColor: C.accent + "30" }]}>
                {progressCurrent + 1}/{progressTotal}
              </Text>
            ) : repeat ? (
              <Text style={[styles.barRepeatBadge, { color: C.accent, backgroundColor: C.accent + "18" }]}>
                {formatRepeat(repeat)}
              </Text>
            ) : null}
            {repeat?.bpm ? (
              <Text style={[styles.barBpmBadge, { color: C.textSecondary }]}>
                {repeat.bpm}
              </Text>
            ) : null}
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

export function BarModeView({
  beatsPerMeasure, onBeatsChange, beatTypes, onBeatTypeChange, beatSubdivisions,
  onBeatSubdivisionChange, barRepeats, onBarRepeatChange, loopBlocks, onLoopBlocksChange,
  isPlaying, isPreparing, currentBeat, activeSubNote, onTogglePlay, barLoopMode,
  onBarLoopModeChange, blockPlayMode, onBlockPlayModeChange, progressInfo, layerProgressMap,
  measureCount = 0, barStartBeat, onBarStartBeatSelect, onAddBar, onDeleteBar, onCopyBar,
  subdivisionBarElement, onBarQuickSave, onResetFlash, onBarReset, onBarScrollOffset,
  onBarTimerExpired, onBarClockConfigChange, initialBarClockMode, initialBarTimerDuration,
  noteSamples, bpm, isLandscape, tempoLabel, colors: C, ms,
}: BarModeViewProps) {

  const { t } = useLanguage();

  // ─── 상태 ────────────────────────────────────────────────────────────────

  const [symbolDrawerOpen, setSymbolDrawerOpen] = useState(false);
  const [placingSymbol, setPlacingSymbol] = useState<SymbolType | null>(null);
  const [blockSelectFirst, setBlockSelectFirst] = useState<number | null>(null);
  const [activeLayerTab, setActiveLayerTab] = useState(0);
  const [editingRepeatBeat, setEditingRepeatBeat] = useState<number | null>(null);

  // ─── 블록 편집 모달 상태 ─────────────────────────────────────────────────
  const [blockEditingIdx, setBlockEditingIdx] = useState<number | null>(null);
  const [blockRepType, setBlockRepType] = useState<"count" | "duration">("count");
  const [blockRepCount, setBlockRepCount] = useState(2);
  const [blockRepMin, setBlockRepMin] = useState(0);
  const [blockRepSec, setBlockRepSec] = useState(30);
  const [blockRepBpm, setBlockRepBpm] = useState<number | null>(null);
  const [blockRepSoundSet, setBlockRepSoundSet] = useState<string | null>(null);

  // 반복 편집 로컬 상태
  const [repType, setRepType] = useState<"count" | "duration">("count");
  const [repCount, setRepCount] = useState(2);
  const [repMin, setRepMin] = useState(0);
  const [repSec, setRepSec] = useState(30);
  const [repBpm, setRepBpm] = useState<number | null>(null);

  // 바 클럭 (stopwatch/timer)
  const [barClockMode, setBarClockModeRaw] = useState<"stopwatch" | "timer">(initialBarClockMode || "stopwatch");
  const [barTimerDuration, setBarTimerDurationRaw] = useState(initialBarTimerDuration || 180);
  const [barTimerRemaining, setBarTimerRemaining] = useState(initialBarTimerDuration || 180);
  const [barElapsedSec, setBarElapsedSec] = useState(0);
  const [barTimerEditing, setBarTimerEditing] = useState(false);
  const [barTimerInput, setBarTimerInput] = useState("");
  const barTimerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const barStartTimeRef = useRef(0);

  const [saveFlashVisible, setSaveFlashVisible] = useState(false);
  const saveFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const barScrollRef = useRef<ScrollView>(null);
  const barScrollYRef = useRef(0);
  const [barContainerHeight, setBarContainerHeight] = useState(0);

  // N회/End 편집 모달
  const [voltaBeat, setVoltaBeat] = useState<number | null>(null);
  const [voltaVal, setVoltaVal] = useState(2);

  // 드로어 애니메이션
  const drawerAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(drawerAnim, {
      toValue: symbolDrawerOpen ? 1 : 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [symbolDrawerOpen]);
  const drawerHeight = drawerAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 90] });

  // ─── 초기화 효과 ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (initialBarClockMode) setBarClockModeRaw(initialBarClockMode);
    if (initialBarTimerDuration != null) {
      setBarTimerDurationRaw(initialBarTimerDuration);
      setBarTimerRemaining(initialBarTimerDuration);
    }
  }, [initialBarClockMode, initialBarTimerDuration]);

  const setBarClockMode = useCallback((mode: "stopwatch" | "timer") => {
    setBarClockModeRaw(mode);
    onBarClockConfigChange?.(mode, barTimerDuration);
  }, [barTimerDuration, onBarClockConfigChange]);

  const setBarTimerDuration = useCallback((dur: number) => {
    setBarTimerDurationRaw(dur);
    onBarClockConfigChange?.(barClockMode, dur);
  }, [barClockMode, onBarClockConfigChange]);

  // 타이머/스탑워치 효과
  useEffect(() => {
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
          if (barTimerIntervalRef.current) { clearInterval(barTimerIntervalRef.current); barTimerIntervalRef.current = null; }
        };
      }
    } else {
      setBarElapsedSec(0);
      setBarTimerRemaining(barTimerDuration);
      if (barTimerIntervalRef.current) { clearInterval(barTimerIntervalRef.current); barTimerIntervalRef.current = null; }
    }
    return undefined;
  }, [isPlaying, barClockMode, barTimerDuration, onBarTimerExpired]);

  useEffect(() => {
    return () => { if (saveFlashTimer.current) clearTimeout(saveFlashTimer.current); };
  }, []);

  // 시간 표시
  const barTimeDisplay = useMemo(() => {
    if (barClockMode === "timer") {
      const t = isPlaying ? barTimerRemaining : barTimerDuration;
      const m = Math.floor(t / 60); const s = t % 60;
      return `${m}:${s.toString().padStart(2, "0")}`;
    }
    const m = Math.floor(barElapsedSec / 60); const s = barElapsedSec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }, [barClockMode, barElapsedSec, barTimerRemaining, barTimerDuration, isPlaying]);

  // ─── 재생 중 자동 스크롤 ──────────────────────────────────────────────────

  useEffect(() => {
    if (!isPlaying) {
      barScrollRef.current?.scrollTo({ y: 0, animated: false });
      onBarScrollOffset?.(0);
      return;
    }
    if (barContainerHeight <= 0 || currentBeat < 0) return;
    const beatTop = currentBeat * BAR_ROW_H;
    const scrollTarget = Math.max(0, beatTop - barContainerHeight / 2 + BAR_ROW_H / 2);
    barScrollRef.current?.scrollTo({ y: scrollTarget, animated: true });
  }, [isPlaying, currentBeat, barContainerHeight]);

  // ─── 블록 관련 계산 ───────────────────────────────────────────────────────

  const blockForBeat = useMemo(() => {
    const map = new Map<number, { blockIdx: number; isStart: boolean; isEnd: boolean; depth: number }[]>();
    const nonLayered = loopBlocks.filter(b => b.layerOf === undefined);
    const depths = new Map<number, number>();
    nonLayered.forEach((block, i) => {
      let depth = 0;
      nonLayered.forEach((other, j) => {
        if (i === j) return;
        if (other.startBeat <= block.startBeat && other.endBeat >= block.endBeat &&
          (other.endBeat - other.startBeat) > (block.endBeat - block.startBeat)) depth++;
      });
      depths.set(i, depth);
    });
    loopBlocks.forEach((block, idx) => {
      if (block.layerOf !== undefined) return;
      for (let b = block.startBeat; b <= Math.min(block.endBeat, beatsPerMeasure - 1); b++) {
        const entry = {
          blockIdx: idx,
          isStart: b === block.startBeat,
          isEnd: b === block.endBeat || b === beatsPerMeasure - 1,
          depth: (depths.get(idx) || 0) + 1,
        };
        map.set(b, [...(map.get(b) || []), entry]);
      }
    });
    return map;
  }, [loopBlocks, beatsPerMeasure]);

  const getSymbolBadges = useCallback((beat: number): string[] => {
    const badges: string[] = [];
    const rep = barRepeats[beat];
    if (rep?.jumpFromId) badges.push(`→${rep.jumpFromId}`);
    if (rep?.jumpToId) badges.push(`←${rep.jumpToId}`);
    if (rep?.voltaMax) badges.push(t("barModeView", "voltaBadge").replace("{{n}}", String(rep.voltaMax)));
    if (rep?.isEnd) badges.push("■");
    return badges;
  }, [barRepeats]);

  // ─── 액션 핸들러 ─────────────────────────────────────────────────────────

  const handleSaveTap = useCallback(async () => {
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

  const handleBarRowPress = useCallback((beat: number) => {
    if (isPlaying) return;
    if (placingSymbol) {
      handleSymbolPlacement(beat);
      return;
    }
    // 이 바가 loopBlock의 startBeat 또는 endBeat이면 해당 블록 편집 모달 열기
    const blockIdx = loopBlocks.findIndex(b => b.layerOf === undefined && (b.startBeat === beat || b.endBeat === beat));
    if (blockIdx !== -1) {
      const lb = loopBlocks[blockIdx];
      setBlockEditingIdx(blockIdx);
      setBlockRepType(lb.type);
      if (lb.type === "count") setBlockRepCount(lb.value);
      else { setBlockRepMin(Math.floor(lb.value / 60)); setBlockRepSec(lb.value % 60); }
      setBlockRepBpm(lb.bpm ?? null);
      setBlockRepSoundSet((lb.soundSet ?? null) as string | null);
      return;
    }
    // 탭 → 해당 바 편집기로 로드
    if (barStartBeat === beat) {
      onBarStartBeatSelect(null);
    } else {
      onBarStartBeatSelect(beat);
      setActiveLayerTab(0);
    }
  }, [isPlaying, placingSymbol, loopBlocks, barStartBeat, onBarStartBeatSelect]);

  const handleBarRowLongPress = useCallback((beat: number) => {
    if (isPlaying) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    onDeleteBar?.(beat);
  }, [isPlaying, onDeleteBar]);

  const handleSwipeLeft = useCallback((beat: number) => {
    // 복사: 해당 바를 새 바로 복사
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onCopyBar?.(beat);
  }, [onCopyBar]);

  const handleSwipeRight = useCallback((beat: number) => {
    // 수정: 해당 바를 편집기에 로드
    onBarStartBeatSelect(beat);
    setActiveLayerTab(0);
  }, [onBarStartBeatSelect]);

  const handleAddBar = useCallback(() => {
    if (isPlaying) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onAddBar?.();
  }, [isPlaying, onAddBar]);

  const handleBeatsIncrement = useCallback(() => {
    if (beatsPerMeasure < MAX_BEATS) onBeatsChange(beatsPerMeasure + 1);
  }, [beatsPerMeasure, onBeatsChange]);

  const handleBeatsDecrement = useCallback(() => {
    if (beatsPerMeasure > MIN_BEATS) onBeatsChange(beatsPerMeasure - 1);
  }, [beatsPerMeasure, onBeatsChange]);

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
    let total = 0;
    if (trimmed.includes(":")) {
      const parts = trimmed.split(":");
      total = (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
    } else {
      const v = parseInt(trimmed, 10) || 0;
      total = v < 10 ? v * 60 : v;
    }
    total = Math.max(1, Math.min(total, 5999));
    setBarTimerDuration(total);
    setBarTimerRemaining(total);
  }, [barTimerInput, setBarTimerDuration]);

  const barClockSwipePan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_e, g) => !isPlaying && Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderRelease: (_e, g) => {
      if (Math.abs(g.dx) < 20) return;
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (g.dx < 0 && barClockMode === "stopwatch") setBarClockMode("timer");
      else if (g.dx > 0 && barClockMode === "timer") { setBarClockMode("stopwatch"); setBarTimerEditing(false); }
    },
  }), [isPlaying, barClockMode, setBarClockMode]);

  // ─── 반복 설정 인라인 편집 ────────────────────────────────────────────────

  const openRepeatEditor = useCallback((beat: number) => {
    if (isPlaying) return;
    const existing = barRepeats[beat];
    if (existing) {
      setRepType(existing.type);
      if (existing.type === "count") setRepCount(existing.value);
      else { setRepMin(Math.floor(existing.value / 60)); setRepSec(existing.value % 60); }
      setRepBpm(existing.bpm ?? null);
    } else {
      setRepType("count"); setRepCount(2); setRepMin(0); setRepSec(30); setRepBpm(null);
    }
    setEditingRepeatBeat(beat);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [isPlaying, barRepeats]);

  const saveRepeat = useCallback(() => {
    if (editingRepeatBeat === null) return;
    const val = repType === "count" ? repCount : repMin * 60 + repSec;
    if (val <= 0) { onBarRepeatChange(editingRepeatBeat, null); setEditingRepeatBeat(null); return; }
    if (repType === "count" && val === 1 && repBpm === null) {
      onBarRepeatChange(editingRepeatBeat, null);
    } else {
      const rep: BarRepeat = { type: repType, value: val };
      if (repBpm !== null) rep.bpm = repBpm;
      const existing = barRepeats[editingRepeatBeat];
      if (existing) {
        if (existing.voltaMax) rep.voltaMax = existing.voltaMax;
        if (existing.isEnd) rep.isEnd = existing.isEnd;
        if (existing.jumpFromId) rep.jumpFromId = existing.jumpFromId;
        if (existing.jumpToId) rep.jumpToId = existing.jumpToId;
        if (existing.layers) rep.layers = existing.layers;
      }
      onBarRepeatChange(editingRepeatBeat, rep);
    }
    setEditingRepeatBeat(null);
  }, [editingRepeatBeat, repType, repCount, repMin, repSec, repBpm, onBarRepeatChange, barRepeats]);

  const saveBlock = useCallback(() => {
    if (blockEditingIdx === null) return;
    const val = blockRepType === "count" ? blockRepCount : blockRepMin * 60 + blockRepSec;
    const updated = loopBlocks.map((b, i) => {
      if (i !== blockEditingIdx) return b;
      const next = { ...b, type: blockRepType, value: Math.max(1, val) };
      if (blockRepBpm !== null && blockRepBpm > 0) next.bpm = blockRepBpm;
      else delete next.bpm;
      if (blockRepSoundSet) (next as LoopBlock).soundSet = blockRepSoundSet as LoopBlock["soundSet"];
      else delete (next as LoopBlock).soundSet;
      return next;
    });
    onLoopBlocksChange(updated);
    setBlockEditingIdx(null);
  }, [blockEditingIdx, blockRepType, blockRepCount, blockRepMin, blockRepSec,
      blockRepBpm, blockRepSoundSet, loopBlocks, onLoopBlocksChange]);

  // ─── 심볼 배치 ───────────────────────────────────────────────────────────

  const handleSymbolPlacement = useCallback((beat: number) => {
    if (!placingSymbol) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (placingSymbol === "block") {
      if (blockSelectFirst === null) {
        setBlockSelectFirst(beat);
        return;
      }
      const start = Math.min(blockSelectFirst, beat);
      const end = Math.max(blockSelectFirst, beat);
      const crosses = loopBlocks.some(b => {
        if (b.layerOf !== undefined) return false;
        const fullyNested = (start <= b.startBeat && end >= b.endBeat) || (b.startBeat <= start && b.endBeat >= end);
        const disjoint = end < b.startBeat || start > b.endBeat;
        return !disjoint && !fullyNested;
      });
      if (crosses) {
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setBlockSelectFirst(null);
        return;
      }
      const newIdx = loopBlocks.length;
      onLoopBlocksChange([...loopBlocks, { startBeat: start, endBeat: end, type: "count", value: 2 }]);
      setBlockSelectFirst(null);
      setPlacingSymbol(null);
      // 블록 편집 모달 열기
      setBlockEditingIdx(newIdx);
      setBlockRepType("count");
      setBlockRepCount(2);
      setBlockRepMin(0);
      setBlockRepSec(30);
      setBlockRepBpm(null);
      setBlockRepSoundSet(null);
      return;
    }

    if (placingSymbol === "jump_from") {
      // jump_to가 먼저 배치된 미연결 항목이 있으면 그 ID를 재사용해 자동 연결
      const allRepeatsArr = Object.values(barRepeats);
      const unmatchedTo = Object.entries(barRepeats)
        .filter(([, r]) => r.jumpToId !== undefined)
        .filter(([, r]) => !allRepeatsArr.some(rr => rr.jumpFromId === r.jumpToId))
        .sort(([a], [b]) => Number(a) - Number(b))[0];
      const pairId = unmatchedTo ? (unmatchedTo[1].jumpToId ?? nextJumpPairId(barRepeats)) : nextJumpPairId(barRepeats);
      const existing = barRepeats[beat] ?? { type: "count" as const, value: 1 };
      onBarRepeatChange(beat, { ...existing, jumpFromId: pairId });
      setPlacingSymbol(null);
      return;
    }

    if (placingSymbol === "jump_to") {
      // jump_from이 먼저 배치된 미연결 항목이 있으면 그 ID를 재사용해 자동 연결
      const allRepeatsArr = Object.values(barRepeats);
      const unmatchedFrom = Object.entries(barRepeats)
        .filter(([, r]) => r.jumpFromId !== undefined)
        .filter(([, r]) => !allRepeatsArr.some(rr => rr.jumpToId === r.jumpFromId))
        .sort(([a], [b]) => Number(b) - Number(a))[0];
      const pairId = unmatchedFrom ? (unmatchedFrom[1].jumpFromId ?? nextJumpPairId(barRepeats)) : nextJumpPairId(barRepeats);
      const existing = barRepeats[beat] ?? { type: "count" as const, value: 1 };
      onBarRepeatChange(beat, { ...existing, jumpToId: pairId });
      setPlacingSymbol(null);
      return;
    }

    if (placingSymbol === "volta") {
      setVoltaBeat(beat);
      setVoltaVal(barRepeats[beat]?.voltaMax ?? 2);
      setPlacingSymbol(null);
      return;
    }

    if (placingSymbol === "end") {
      const existing = barRepeats[beat];
      const isEnd = !(existing?.isEnd);
      onBarRepeatChange(beat, { ...(existing ?? { type: "count", value: 1 }), isEnd });
      setPlacingSymbol(null);
      return;
    }

    if (placingSymbol === "repeat") {
      openRepeatEditor(beat);
      setPlacingSymbol(null);
      return;
    }
  }, [placingSymbol, blockSelectFirst, loopBlocks, onLoopBlocksChange, barRepeats, onBarRepeatChange, openRepeatEditor]);

  const saveVolta = useCallback(() => {
    if (voltaBeat === null) return;
    const existing = barRepeats[voltaBeat] ?? { type: "count" as const, value: 1 };
    onBarRepeatChange(voltaBeat, { ...existing, voltaMax: voltaVal });
    setVoltaBeat(null);
  }, [voltaBeat, voltaVal, barRepeats, onBarRepeatChange]);

  // ─── 편집기 위로 스와이프하여 바 추가 ────────────────────────────────────

  const editorSwipeAnim = useRef(new Animated.Value(0)).current;
  const editorSwipePan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_e, g) => !isPlaying && g.dy < -15 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
    onPanResponderMove: (_e, g) => {
      if (g.dy < 0) editorSwipeAnim.setValue(Math.max(-60, g.dy * 0.5));
    },
    onPanResponderRelease: (_e, g) => {
      if (g.dy < -50) {
        Animated.sequence([
          Animated.timing(editorSwipeAnim, { toValue: -30, duration: 80, useNativeDriver: true }),
          Animated.timing(editorSwipeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
        ]).start();
        handleAddBar();
      } else {
        Animated.spring(editorSwipeAnim, { toValue: 0, useNativeDriver: true }).start();
      }
    },
    onPanResponderTerminate: () => {
      Animated.spring(editorSwipeAnim, { toValue: 0, useNativeDriver: true }).start();
    },
  }), [isPlaying, handleAddBar]);

  // ─── 레이어 관련 ─────────────────────────────────────────────────────────

  const editingBeat = barStartBeat;
  const editingRepeat = editingBeat !== null ? barRepeats[editingBeat] : null;
  const editingLayers: BarLayer[] = (editingRepeat?.layers) ?? [];

  const addLayer = useCallback(() => {
    if (editingBeat === null) return;
    const existing = barRepeats[editingBeat] ?? { type: "count" as const, value: 1 };
    const layers = [...(existing.layers ?? []), { beatType: "normal" as BeatType }];
    onBarRepeatChange(editingBeat, { ...existing, layers });
    setActiveLayerTab(layers.length);
  }, [editingBeat, barRepeats, onBarRepeatChange]);

  const removeLayer = useCallback((layerIdx: number) => {
    if (editingBeat === null) return;
    const existing = barRepeats[editingBeat];
    if (!existing?.layers) return;
    const layers = existing.layers.filter((_, i) => i !== layerIdx);
    onBarRepeatChange(editingBeat, { ...existing, layers: layers.length === 0 ? undefined : layers });
    setActiveLayerTab(0);
  }, [editingBeat, barRepeats, onBarRepeatChange]);

  const updateLayerBeatType = useCallback((layerIdx: number, bt: BeatType) => {
    if (editingBeat === null) return;
    const existing = barRepeats[editingBeat];
    if (!existing?.layers) return;
    const layers = existing.layers.map((l, i) => i === layerIdx ? { ...l, beatType: bt } : l);
    onBarRepeatChange(editingBeat, { ...existing, layers });
  }, [editingBeat, barRepeats, onBarRepeatChange]);

  const updateLayerSubdivisions = useCallback((layerIdx: number, subs: BeatType[] | null) => {
    if (editingBeat === null) return;
    const existing = barRepeats[editingBeat];
    if (!existing?.layers) return;
    const layers = existing.layers.map((l, i) => {
      if (i !== layerIdx) return l;
      if (subs === null) { const { subdivisions: _d, ...rest } = l; return rest; }
      return { ...l, subdivisions: subs };
    });
    onBarRepeatChange(editingBeat, { ...existing, layers });
  }, [editingBeat, barRepeats, onBarRepeatChange]);

  const updateLayerSoundSet = useCallback((layerIdx: number, ss: BarLayer["soundSet"] | null) => {
    if (editingBeat === null) return;
    const existing = barRepeats[editingBeat];
    if (!existing?.layers) return;
    const layers = existing.layers.map((l, i) => {
      if (i !== layerIdx) return l;
      if (ss === null) { const { soundSet: _d, ...rest } = l; return rest; }
      return { ...l, soundSet: ss };
    });
    onBarRepeatChange(editingBeat, { ...existing, layers });
  }, [editingBeat, barRepeats, onBarRepeatChange]);

  // ─── 렌더링 ───────────────────────────────────────────────────────────────

  const beats = Array.from({ length: beatsPerMeasure }, (_, i) => i);

  return (
    <View style={[styles.container, { backgroundColor: C.background }]} testID="beat-indicator-bar-mode">

      {/* ── 심볼 드로어 ── */}
      <View style={[styles.drawerToggleRow, { borderBottomColor: C.overlay06 }]}>
        <Pressable
          onPress={() => {
            if (placingSymbol) { setPlacingSymbol(null); setBlockSelectFirst(null); return; }
            setSymbolDrawerOpen(v => !v);
          }}
          style={styles.drawerToggleBtn}
          hitSlop={10}
        >
          {placingSymbol ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons name="close-circle" size={ms(14, 0.4)} color={SYMBOL_INFO[placingSymbol].color(C)} />
              <Text style={{ color: SYMBOL_INFO[placingSymbol].color(C), fontSize: FontSize.caption, fontFamily: "SpaceGrotesk_600SemiBold" }}>
                {placingSymbol === "block" && blockSelectFirst !== null
                  ? t("barModeView", "blockSelectStarted").replace("{{n}}", String(blockSelectFirst + 1))
                  : `${t("barModeView", SYMBOL_INFO[placingSymbol].labelKey)} ${t("barModeView", "blockSelectPrompt")}`}
              </Text>
            </View>
          ) : (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons
                name={symbolDrawerOpen ? "chevron-up" : "chevron-down"}
                size={ms(14, 0.4)}
                color={C.textTertiary}
              />
              <Text style={{ color: C.textTertiary, fontSize: FontSize.micro, fontFamily: "SpaceGrotesk_500Medium" }}>
                {symbolDrawerOpen ? t("barModeView", "symbolDrawerClose") : t("barModeView", "symbolDrawerLabel")}
              </Text>
            </View>
          )}
        </Pressable>

        <View style={{ flexDirection: "row", gap: Spacing.xs }}>
          <BeatStepperButton
            direction="minus"
            onPress={handleBeatsDecrement}
            disabled={isPlaying || beatsPerMeasure <= MIN_BEATS}
            iconSize={ms(13, 0.4)}
            iconColor={C.textSecondary}
            baseStyle={[styles.stpBtn, { backgroundColor: C.overlay08 }]}
            testID="bar-beats-minus"
            t={t}
          />
          <Text style={{ color: C.textSecondary, fontSize: FontSize.caption, fontFamily: "SpaceGrotesk_500Medium", alignSelf: "center", minWidth: 24, textAlign: "center" }}>
            {beatsPerMeasure}
          </Text>
          <BeatStepperButton
            direction="plus"
            onPress={handleBeatsIncrement}
            disabled={isPlaying || beatsPerMeasure >= MAX_BEATS}
            iconSize={ms(13, 0.4)}
            iconColor={C.textSecondary}
            baseStyle={[styles.stpBtn, { backgroundColor: C.overlay08 }]}
            testID="bar-beats-plus"
            t={t}
          />
        </View>
      </View>

      <Animated.View style={[styles.symbolDrawer, { height: drawerHeight, overflow: "hidden" }]}>
        <View style={[styles.symbolDrawerInner, { borderBottomColor: C.overlay08 }]}>
          {(Object.keys(SYMBOL_INFO) as SymbolType[]).map((sym) => {
            const info = SYMBOL_INFO[sym];
            const isActive = placingSymbol === sym;
            const col = info.color(C);
            return (
              <Pressable
                key={sym}
                onPress={() => {
                  if (isActive) { setPlacingSymbol(null); setBlockSelectFirst(null); }
                  else { setPlacingSymbol(sym); setBlockSelectFirst(null); }
                }}
                style={[
                  styles.symbolBtn,
                  {
                    backgroundColor: isActive ? col + "30" : C.backgroundSecondary,
                    borderColor: isActive ? col : "transparent",
                  },
                ]}
              >
                <Ionicons name={info.icon} size={ms(14, 0.4)} color={isActive ? col : C.textSecondary} />
                <Text style={{ color: isActive ? col : C.textTertiary, fontSize: 9, fontFamily: "SpaceGrotesk_500Medium", marginTop: 2 }}>
                  {t("barModeView", info.labelKey)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Animated.View>

      {/* ── 바 목록 ── */}
      <ScrollView
        ref={barScrollRef}
        style={styles.barList}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        scrollEnabled={!isPlaying}
        onLayout={e => setBarContainerHeight(e.nativeEvent.layout.height)}
        onScroll={e => {
          barScrollYRef.current = e.nativeEvent.contentOffset.y;
          onBarScrollOffset?.(e.nativeEvent.contentOffset.y);
        }}
        scrollEventThrottle={16}
      >
        {beats.map(beat => {
          const bType = beatTypes[beat] || "normal";
          const subs = beatSubdivisions[String(beat)] ?? [];
          const rep = barRepeats[beat] ?? null;
          const blockEntries = blockForBeat.get(beat) ?? [];
          const maxDepth = blockEntries.length > 0 ? Math.max(...blockEntries.map(e => e.depth)) : 0;
          const blockStart = blockEntries.some(e => e.isStart);
          const blockEnd = blockEntries.some(e => e.isEnd);
          const badges = getSymbolBadges(beat);
          const isCurrent = isPlaying && currentBeat === beat;
          const isEditing = barStartBeat === beat && !isPlaying;

          return (
            <SwipeableBarRow
              key={beat}
              beat={beat}
              beatType={bType}
              subdivisions={subs}
              repeat={rep}
              isCurrentBeat={isCurrent}
              isEditingBeat={isEditing}
              blockDepth={maxDepth}
              blockStart={blockStart}
              blockEnd={blockEnd}
              symbolBadges={badges}
              isPlaying={isPlaying}
              progressCurrent={progressInfo?.beat === beat ? progressInfo.barRepeatCurrent : undefined}
              progressTotal={progressInfo?.beat === beat ? progressInfo.barRepeatTotal : undefined}
              onPress={handleBarRowPress}
              onSwipeLeft={handleSwipeLeft}
              onSwipeRight={handleSwipeRight}
              onLongPress={handleBarRowLongPress}
              colors={C}
              ms={ms}
            />
          );
        })}

        {!isPlaying && (
          <Pressable
            onPress={handleAddBar}
            style={[styles.addBarBtn, { borderColor: C.accent + "40" }]}
            testID="bar-add-btn"
          >
            <Ionicons name="add" size={ms(16, 0.4)} color={C.accent + "80"} />
            <Text style={{ color: C.accent + "80", fontSize: FontSize.caption, fontFamily: "SpaceGrotesk_500Medium" }}>
              {t("barModeView", "addBar")}
            </Text>
          </Pressable>
        )}
      </ScrollView>

      {/* ── 편집기 영역 ── */}
      <Animated.View
        style={[styles.editorSection, { borderTopColor: C.overlay08, transform: [{ translateY: editorSwipeAnim }] }]}
        {...editorSwipePan.panHandlers}
      >
        {/* 레이어 탭 */}
        <View style={[styles.layerTabRow, { borderBottomColor: C.overlay06 }]}>
          <Pressable
            onPress={() => setActiveLayerTab(0)}
            style={[styles.layerTab, { borderBottomWidth: activeLayerTab === 0 ? 2 : 0, borderBottomColor: C.accent }]}
          >
            <Text style={{ color: activeLayerTab === 0 ? C.accent : C.textTertiary, fontSize: FontSize.micro, fontFamily: "SpaceGrotesk_600SemiBold" }}>
              {t("barModeView", "mainLayer")}
            </Text>
          </Pressable>
          {editingLayers.map((layer, li) => (
            <Pressable
              key={li}
              onPress={() => setActiveLayerTab(li + 1)}
              onLongPress={() => removeLayer(li)}
              delayLongPress={500}
              style={[styles.layerTab, { borderBottomWidth: activeLayerTab === li + 1 ? 2 : 0, borderBottomColor: C.accent }]}
            >
              <Text style={{ color: activeLayerTab === li + 1 ? C.accent : C.textTertiary, fontSize: FontSize.micro }}>
                {t("barModeView", "layerLabel")}{li + 1}
              </Text>
            </Pressable>
          ))}
          {editingBeat !== null && !isPlaying && (
            <Pressable onPress={addLayer} style={styles.layerTab} hitSlop={8}>
              <Text style={{ color: C.textTertiary, fontSize: FontSize.micro }}>+</Text>
            </Pressable>
          )}

          <View style={{ flex: 1 }} />

          {editingBeat !== null && (
            <Pressable
              onPress={() => openRepeatEditor(editingBeat)}
              style={[styles.repeatBadgeTouchable, {
                backgroundColor: editingRepeat ? C.accent + "20" : "transparent",
                borderColor: C.accent + "30",
              }]}
              hitSlop={8}
            >
              {editingRepeat ? (
                <Text style={{ color: C.accent, fontSize: FontSize.micro, fontFamily: "SpaceGrotesk_700Bold" }}>
                  {formatRepeat(editingRepeat)}
                </Text>
              ) : (
                <Ionicons name="repeat-outline" size={ms(13, 0.4)} color={C.textTertiary} />
              )}
            </Pressable>
          )}

          <View style={{ width: ms(10, 0.4) }}>
            <Ionicons name="chevron-up" size={ms(11, 0.4)} color={C.textTertiary + "60"} />
          </View>
        </View>

        {/* 레이어 내용 */}
        {activeLayerTab === 0 ? (
          <View style={styles.mainSubdivisionSlot}>
            {subdivisionBarElement ?? (
              <View style={{ alignItems: "center", paddingVertical: 12 }}>
                <Text style={{ color: C.textTertiary, fontSize: FontSize.caption }}>
                  {editingBeat !== null ? t("barModeView", "editingBeat").replace("{{n}}", String(editingBeat + 1)) : t("barModeView", "tapToEdit")}
                </Text>
              </View>
            )}
          </View>
        ) : (() => {
          const layer = editingLayers[activeLayerTab - 1];
          const layerIdx = activeLayerTab - 1;
          const SUB_PRESETS: { key: string; subs: BeatType[] | null }[] = [
            { key: t("barModeView", "subPatternDefault"), subs: null },
            { key: "×2", subs: ["normal", "normal"] },
            { key: "×3", subs: ["normal", "normal", "normal"] },
            { key: "×4", subs: ["normal", "normal", "normal", "normal"] },
            { key: "×6", subs: ["normal", "normal", "normal", "normal", "normal", "normal"] },
          ];
          const currentSubs = layer?.subdivisions ? JSON.stringify(layer.subdivisions) : null;
          return (
            <View style={{ paddingHorizontal: Spacing.sm, paddingVertical: 6 }}>
              {/* 비트 타입 선택 */}
              <View style={styles.layerEditorRow}>
                {(["normal", "accent", "strong", "mute"] as BeatType[]).map(bt => {
                  const isActive = layer?.beatType === bt;
                  return (
                    <Pressable
                      key={bt}
                      onPress={() => updateLayerBeatType(layerIdx, bt)}
                      style={[
                        styles.layerBeatTypeBtn,
                        {
                          backgroundColor: isActive ? C.accent + "30" : C.backgroundSecondary,
                          borderColor: isActive ? C.accent : "transparent",
                        },
                      ]}
                    >
                      <Text style={{ color: isActive ? C.accent : C.textSecondary, fontSize: FontSize.micro }}>
                        {bt === "normal" ? t("barModeView", "layerBeatNormal") : bt === "accent" ? t("barModeView", "layerBeatAccent") : bt === "strong" ? t("barModeView", "layerBeatStrong") : t("barModeView", "layerBeatMute")}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {/* 서브디비전 프리셋 */}
              <Text style={{ color: C.textTertiary, fontSize: FontSize.micro, marginTop: 6, marginBottom: 3 }}>
                {t("barModeView", "subPatternLabel")}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
                {SUB_PRESETS.map(p => {
                  const isActive = p.subs === null ? !layer?.subdivisions : currentSubs === JSON.stringify(p.subs);
                  return (
                    <Pressable
                      key={p.key}
                      onPress={() => updateLayerSubdivisions(layerIdx, p.subs)}
                      style={[styles.typeToggle, { backgroundColor: isActive ? C.accent + "30" : C.overlay08 }]}
                    >
                      <Text style={{ color: isActive ? C.accent : C.textSecondary, fontSize: FontSize.micro, fontFamily: "SpaceGrotesk_600SemiBold" }}>
                        {p.key}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {/* 사운드셋 선택 */}
              <Text style={{ color: C.textTertiary, fontSize: FontSize.micro, marginTop: 6, marginBottom: 3 }}>
                {t("barModeView", "soundSetLabel")}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
                {[{ key: null, label: t("barModeView", "soundSetDefault") }, ...SOUND_SET_OPTIONS.map(o => ({ key: o.key, label: t("barModeView", o.labelKey) }))].map(opt => {
                  const isActive = (opt.key === null) ? !layer?.soundSet : layer?.soundSet === opt.key;
                  return (
                    <Pressable
                      key={opt.key ?? "__default"}
                      onPress={() => updateLayerSoundSet(layerIdx, opt.key as BarLayer["soundSet"] | null)}
                      style={[styles.typeToggle, { backgroundColor: isActive ? C.accent + "30" : C.overlay08 }]}
                    >
                      <Text style={{ color: isActive ? C.accent : C.textSecondary, fontSize: FontSize.micro, fontFamily: "SpaceGrotesk_600SemiBold" }}>
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })()}

        {tempoLabel ? (
          <Text style={{ color: C.accentMuted, fontSize: ms(10, 0.3), textAlign: "center", paddingVertical: 2 }}>
            {tempoLabel}
          </Text>
        ) : null}
      </Animated.View>

      {/* ── 액션 바 ── */}
      <View style={[styles.actionBar, { borderTopColor: C.overlay08 }]}>
        <Pressable
          onPress={handleSaveTap}
          style={styles.actionBtn}
          hitSlop={10}
          testID="bar-save-reset"
          disabled={isPlaying}
        >
          <Ionicons
            name={saveFlashVisible ? "checkmark-circle" : "bookmark-outline"}
            size={ms(18, 0.4)}
            color={saveFlashVisible ? "#4CAF50" : C.accent}
          />
        </Pressable>

        <View style={styles.clockArea} {...barClockSwipePan.panHandlers}>
          <Pressable onPress={handleBarClockTap} style={{ alignItems: "center" }}>
            <Text style={[styles.clockText, { color: barClockMode === "timer" ? C.danger : C.accent }]}>
              {barTimeDisplay}
            </Text>
            <Text style={{ color: C.textTertiary, fontSize: 9, fontFamily: "SpaceGrotesk_400Regular" }}>
              {beatsPerMeasure} {t("barModeView", "barsDisplay")}
            </Text>
            <View style={{ flexDirection: "row", gap: 3, marginTop: 2 }}>
              <View style={[styles.clockDot, { backgroundColor: barClockMode === "stopwatch" ? C.accent : C.overlay08 }]} />
              <View style={[styles.clockDot, { backgroundColor: barClockMode === "timer" ? C.danger : C.overlay08 }]} />
            </View>
          </Pressable>
        </View>

        <BarPlayButton
          isPlaying={isPlaying}
          isPreparing={isPreparing}
          barLoopMode={barLoopMode}
          onTogglePlay={onTogglePlay}
          onBarLoopModeChange={onBarLoopModeChange}
          blockPlayMode={blockPlayMode}
          onBlockPlayModeChange={onBlockPlayModeChange}
          baseStyle={[styles.playBtn, { backgroundColor: C.backgroundSecondary }]}
          accentColor={C.accent}
          dangerColor={C.danger}
          backgroundColor={C.background}
          iconSize={ms(22, 0.4)}
          badgeIconSize={ms(9, 0.4)}
          t={t}
        />
      </View>

      {/* ── 반복 편집 모달 ── */}
      <AnimatedModal
        visible={editingRepeatBeat !== null}
        transparent
        onRequestClose={() => setEditingRepeatBeat(null)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={saveRepeat} />
          <View style={[styles.modalCard, { backgroundColor: C.backgroundSecondary }]} dataSet={{ capturesKeys: "true" }}>
            <View style={[styles.modalHeader, { borderBottomColor: C.overlay08 }]}>
              <Ionicons name="repeat" size={ms(16, 0.4)} color={C.accent} />
              <Text style={{ color: C.accent, fontSize: FontSize.small, fontFamily: "SpaceGrotesk_700Bold" }}>
                {t("barModeView", "repeatTitle").replace("{{n}}", String((editingRepeatBeat ?? 0) + 1))}
              </Text>
              <View style={{ flex: 1 }} />
              <Pressable onPress={() => { if (editingRepeatBeat !== null) onBarRepeatChange(editingRepeatBeat, null); setEditingRepeatBeat(null); }} hitSlop={8}>
                <Ionicons name="trash-outline" size={ms(14, 0.4)} color={C.danger} />
              </Pressable>
              <Pressable onPress={saveRepeat} hitSlop={8} style={{ marginLeft: 10 }}>
                <Ionicons name="checkmark" size={ms(16, 0.4)} color={C.accent} />
              </Pressable>
            </View>

            <View style={{ flexDirection: "row", gap: 8, marginVertical: 12, justifyContent: "center" }}>
              {(["count", "duration"] as const).map(type => (
                <Pressable
                  key={type}
                  onPress={() => setRepType(type)}
                  style={[styles.typeToggle, { backgroundColor: repType === type ? C.accent + "30" : C.overlay08 }]}
                >
                  <Text style={{ color: repType === type ? C.accent : C.textSecondary, fontSize: FontSize.caption, fontFamily: "SpaceGrotesk_600SemiBold" }}>
                    {type === "count" ? t("barModeView", "repCount") : t("barModeView", "repDuration")}
                  </Text>
                </Pressable>
              ))}
            </View>

            {repType === "count" ? (
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 12 }}>
                <Pressable onPress={() => setRepCount(v => Math.max(1, v - 1))} style={[styles.stepBtn, { backgroundColor: C.overlay10 }]}>
                  <Ionicons name="remove" size={ms(16, 0.4)} color={C.textSecondary} />
                </Pressable>
                <Text style={{ color: C.text, fontSize: 22, fontFamily: "SpaceGrotesk_700Bold", minWidth: 40, textAlign: "center" }}>
                  ×{repCount}
                </Text>
                <Pressable onPress={() => setRepCount(v => Math.min(99, v + 1))} style={[styles.stepBtn, { backgroundColor: C.overlay10 }]}>
                  <Ionicons name="add" size={ms(16, 0.4)} color={C.textSecondary} />
                </Pressable>
              </View>
            ) : (
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 12 }}>
                <Pressable onPress={() => setRepMin(v => Math.max(0, v - 1))} style={[styles.stepBtn, { backgroundColor: C.overlay10 }]}>
                  <Ionicons name="remove" size={ms(14, 0.4)} color={C.textSecondary} />
                </Pressable>
                <Text style={{ color: C.text, fontSize: 18, fontFamily: "SpaceGrotesk_700Bold", minWidth: 30, textAlign: "center" }}>{repMin}{t("barModeView", "minuteSuffix")}</Text>
                <Pressable onPress={() => setRepMin(v => Math.min(59, v + 1))} style={[styles.stepBtn, { backgroundColor: C.overlay10 }]}>
                  <Ionicons name="add" size={ms(14, 0.4)} color={C.textSecondary} />
                </Pressable>
                <Pressable onPress={() => setRepSec(v => Math.max(0, v - 5))} style={[styles.stepBtn, { backgroundColor: C.overlay10 }]}>
                  <Ionicons name="remove" size={ms(14, 0.4)} color={C.textSecondary} />
                </Pressable>
                <Text style={{ color: C.text, fontSize: 18, fontFamily: "SpaceGrotesk_700Bold", minWidth: 30, textAlign: "center" }}>{repSec}{t("barModeView", "secondSuffix")}</Text>
                <Pressable onPress={() => setRepSec(v => Math.min(59, v + 5))} style={[styles.stepBtn, { backgroundColor: C.overlay10 }]}>
                  <Ionicons name="add" size={ms(14, 0.4)} color={C.textSecondary} />
                </Pressable>
              </View>
            )}

            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, justifyContent: "center", marginBottom: 4 }}>
              <Text style={{ color: C.textSecondary, fontSize: FontSize.caption }}>{t("barModeView", "repBpmOverride")}</Text>
              {repBpm !== null ? (
                <>
                  <Pressable onPress={() => setRepBpm(v => v !== null ? Math.max(20, v - 5) : null)} style={[styles.stepBtn, { backgroundColor: C.overlay10 }]}>
                    <Ionicons name="remove" size={ms(13, 0.4)} color={C.accent} />
                  </Pressable>
                  <TextInput
                    style={[styles.bpmInput, { color: C.accent, borderBottomColor: C.accent }]}
                    value={String(repBpm)}
                    keyboardType="number-pad"
                    onEndEditing={e => {
                      const v = parseInt(e.nativeEvent.text, 10);
                      if (!isNaN(v) && v >= 20 && v <= 300) setRepBpm(v);
                      else if (!e.nativeEvent.text) setRepBpm(null);
                    }}
                    selectTextOnFocus
                  />
                  <Pressable onPress={() => setRepBpm(v => v !== null ? Math.min(300, v + 5) : null)} style={[styles.stepBtn, { backgroundColor: C.overlay10 }]}>
                    <Ionicons name="add" size={ms(13, 0.4)} color={C.accent} />
                  </Pressable>
                  <Pressable onPress={() => setRepBpm(null)} hitSlop={8}>
                    <Ionicons name="close-circle" size={ms(14, 0.4)} color={C.textTertiary} />
                  </Pressable>
                </>
              ) : (
                <Pressable
                  onPress={() => setRepBpm(bpm ?? 120)}
                  style={[styles.typeToggle, { backgroundColor: C.overlay08 }]}
                >
                  <Text style={{ color: C.textTertiary, fontSize: FontSize.caption }}>{t("barModeView", "bpmSet")}</Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>
      </AnimatedModal>

      {/* ── 타이머 편집 모달 ── */}
      <AnimatedModal visible={barTimerEditing} transparent onRequestClose={() => setBarTimerEditing(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setBarTimerEditing(false)} />
          <View style={[styles.modalCard, { backgroundColor: C.backgroundSecondary }]} dataSet={{ capturesKeys: "true" }}>
            <View style={[styles.modalHeader, { borderBottomColor: C.overlay08 }]}>
              <Ionicons name="timer-outline" size={ms(16, 0.4)} color={C.danger} />
              <Text style={{ color: C.danger, fontSize: FontSize.small, fontFamily: "SpaceGrotesk_700Bold" }}>{t("barModeView", "timerModalTitle")}</Text>
            </View>
            <TextInput
              style={[styles.timerInput, { borderBottomColor: C.accent, color: C.accent }]}
              value={barTimerInput}
              onChangeText={setBarTimerInput}
              onSubmitEditing={commitBarTimerInput}
              keyboardType="numbers-and-punctuation"
              autoFocus
              selectTextOnFocus
              placeholder="M:SS"
              placeholderTextColor={C.textTertiary}
            />
            <Text style={{ color: C.textTertiary, fontSize: FontSize.micro, textAlign: "center", marginBottom: 12 }}>
              {t("barModeView", "timerHint")}
            </Text>
            <Pressable
              onPress={commitBarTimerInput}
              style={[styles.timerSetBtn, { backgroundColor: C.danger }]}
            >
              <Text style={{ color: C.white, fontSize: FontSize.small, fontFamily: "SpaceGrotesk_700Bold" }}>{t("barModeView", "timerSet")}</Text>
            </Pressable>
          </View>
        </View>
      </AnimatedModal>

      {/* ── N회(볼타) 편집 모달 ── */}
      <AnimatedModal visible={voltaBeat !== null} transparent onRequestClose={() => setVoltaBeat(null)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={saveVolta} />
          <View style={[styles.modalCard, { backgroundColor: C.backgroundSecondary }]} dataSet={{ capturesKeys: "true" }}>
            <View style={[styles.modalHeader, { borderBottomColor: C.overlay08 }]}>
              <Ionicons name="hourglass-outline" size={ms(16, 0.4)} color="#7b68ee" />
              <Text style={{ color: "#7b68ee", fontSize: FontSize.small, fontFamily: "SpaceGrotesk_700Bold" }}>
                {t("barModeView", "voltaModalTitle").replace("{{n}}", String((voltaBeat ?? 0) + 1))}
              </Text>
              <View style={{ flex: 1 }} />
              <Pressable onPress={saveVolta} hitSlop={8}>
                <Ionicons name="checkmark" size={ms(16, 0.4)} color={C.accent} />
              </Pressable>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 16, paddingVertical: 16 }}>
              <Pressable onPress={() => setVoltaVal(v => Math.max(1, v - 1))} style={[styles.stepBtn, { backgroundColor: C.overlay10 }]}>
                <Ionicons name="remove" size={ms(16, 0.4)} color={C.textSecondary} />
              </Pressable>
              <Text style={{ color: "#7b68ee", fontSize: 28, fontFamily: "SpaceGrotesk_700Bold" }}>
                {t("barModeView", "voltaBadge").replace("{{n}}", String(voltaVal))}
              </Text>
              <Pressable onPress={() => setVoltaVal(v => Math.min(99, v + 1))} style={[styles.stepBtn, { backgroundColor: C.overlay10 }]}>
                <Ionicons name="add" size={ms(16, 0.4)} color={C.textSecondary} />
              </Pressable>
            </View>
            <Text style={{ color: C.textTertiary, fontSize: FontSize.micro, textAlign: "center", paddingBottom: 8 }}>
              {t("barModeView", "voltaHint").replace("{{n}}", String(voltaVal))}
            </Text>
          </View>
        </View>
      </AnimatedModal>

      {/* ── 블록 편집 모달 ── */}
      <AnimatedModal
        visible={blockEditingIdx !== null}
        transparent
        onRequestClose={saveBlock}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={saveBlock} />
          <View style={[styles.modalCard, { backgroundColor: C.backgroundSecondary }]} dataSet={{ capturesKeys: "true" }}>
            <View style={[styles.modalHeader, { borderBottomColor: C.overlay08 }]}>
              <Ionicons name="code-slash" size={ms(16, 0.4)} color={C.accent} />
              <Text style={{ color: C.accent, fontSize: FontSize.small, fontFamily: "SpaceGrotesk_700Bold" }}>
                {t("barModeView", "blockEditTitle").replace("{{n}}", String((blockEditingIdx ?? 0) + 1))}
              </Text>
              <View style={{ flex: 1 }} />
              <Pressable onPress={() => setBlockEditingIdx(null)} hitSlop={8}>
                <Ionicons name="close" size={ms(14, 0.4)} color={C.textSecondary} />
              </Pressable>
              <Pressable onPress={saveBlock} hitSlop={8} style={{ marginLeft: 10 }}>
                <Ionicons name="checkmark" size={ms(16, 0.4)} color={C.accent} />
              </Pressable>
            </View>

            {/* 반복 유형 탭 */}
            <View style={{ flexDirection: "row", gap: 6, marginBottom: 12 }}>
              {(["count", "duration"] as const).map(repT => (
                <Pressable
                  key={repT}
                  onPress={() => setBlockRepType(repT)}
                  style={[styles.typeToggle, { backgroundColor: blockRepType === repT ? C.accent + "30" : C.overlay08 }]}
                >
                  <Text style={{ color: blockRepType === repT ? C.accent : C.textSecondary, fontSize: FontSize.caption, fontFamily: "SpaceGrotesk_600SemiBold" }}>
                    {repT === "count" ? t("barModeView", "repCount") : t("barModeView", "repDuration")}
                  </Text>
                </Pressable>
              ))}
            </View>

            {blockRepType === "count" ? (
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 12 }}>
                <Pressable onPress={() => setBlockRepCount(v => Math.max(1, v - 1))} style={[styles.stepBtn, { backgroundColor: C.overlay10 }]}>
                  <Ionicons name="remove" size={ms(16, 0.4)} color={C.textSecondary} />
                </Pressable>
                <Text style={{ color: C.text, fontSize: 22, fontFamily: "SpaceGrotesk_700Bold", minWidth: 40, textAlign: "center" }}>
                  ×{blockRepCount}
                </Text>
                <Pressable onPress={() => setBlockRepCount(v => Math.min(99, v + 1))} style={[styles.stepBtn, { backgroundColor: C.overlay10 }]}>
                  <Ionicons name="add" size={ms(16, 0.4)} color={C.textSecondary} />
                </Pressable>
              </View>
            ) : (
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 12 }}>
                <Pressable onPress={() => setBlockRepMin(v => Math.max(0, v - 1))} style={[styles.stepBtn, { backgroundColor: C.overlay10 }]}>
                  <Ionicons name="remove" size={ms(14, 0.4)} color={C.textSecondary} />
                </Pressable>
                <Text style={{ color: C.text, fontSize: 18, fontFamily: "SpaceGrotesk_700Bold", minWidth: 30, textAlign: "center" }}>{blockRepMin}{t("barModeView", "minuteSuffix")}</Text>
                <Pressable onPress={() => setBlockRepMin(v => Math.min(59, v + 1))} style={[styles.stepBtn, { backgroundColor: C.overlay10 }]}>
                  <Ionicons name="add" size={ms(14, 0.4)} color={C.textSecondary} />
                </Pressable>
                <Pressable onPress={() => setBlockRepSec(v => Math.max(0, v - 5))} style={[styles.stepBtn, { backgroundColor: C.overlay10 }]}>
                  <Ionicons name="remove" size={ms(14, 0.4)} color={C.textSecondary} />
                </Pressable>
                <Text style={{ color: C.text, fontSize: 18, fontFamily: "SpaceGrotesk_700Bold", minWidth: 30, textAlign: "center" }}>{blockRepSec}{t("barModeView", "secondSuffix")}</Text>
                <Pressable onPress={() => setBlockRepSec(v => Math.min(59, v + 5))} style={[styles.stepBtn, { backgroundColor: C.overlay10 }]}>
                  <Ionicons name="add" size={ms(14, 0.4)} color={C.textSecondary} />
                </Pressable>
              </View>
            )}

            {/* BPM 오버라이드 */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, justifyContent: "center", marginBottom: 12 }}>
              <Text style={{ color: C.textSecondary, fontSize: FontSize.caption }}>{t("barModeView", "repBpmOverride")}</Text>
              {blockRepBpm !== null ? (
                <>
                  <Pressable onPress={() => setBlockRepBpm(v => v !== null ? Math.max(20, v - 5) : null)} style={[styles.stepBtn, { backgroundColor: C.overlay10 }]}>
                    <Ionicons name="remove" size={ms(13, 0.4)} color={C.accent} />
                  </Pressable>
                  <TextInput
                    style={[styles.bpmInput, { color: C.accent, borderBottomColor: C.accent }]}
                    value={String(blockRepBpm)}
                    keyboardType="number-pad"
                    onEndEditing={e => {
                      const v = parseInt(e.nativeEvent.text, 10);
                      if (!isNaN(v) && v >= 20 && v <= 300) setBlockRepBpm(v);
                      else if (!e.nativeEvent.text) setBlockRepBpm(null);
                    }}
                    selectTextOnFocus
                  />
                  <Pressable onPress={() => setBlockRepBpm(v => v !== null ? Math.min(300, v + 5) : null)} style={[styles.stepBtn, { backgroundColor: C.overlay10 }]}>
                    <Ionicons name="add" size={ms(13, 0.4)} color={C.accent} />
                  </Pressable>
                  <Pressable onPress={() => setBlockRepBpm(null)} style={[styles.typeToggle, { backgroundColor: C.overlay08 }]} hitSlop={4}>
                    <Text style={{ color: C.textSecondary, fontSize: FontSize.caption }}>{t("barModeView", "repBpmReset")}</Text>
                  </Pressable>
                </>
              ) : (
                <Pressable onPress={() => setBlockRepBpm(120)} style={[styles.typeToggle, { backgroundColor: C.overlay08 }]}>
                  <Text style={{ color: C.textSecondary, fontSize: FontSize.caption }}>{t("barModeView", "repBpmSet")}</Text>
                </Pressable>
              )}
            </View>

            {/* 사운드셋 선택 */}
            <Text style={{ color: C.textSecondary, fontSize: FontSize.caption, marginBottom: 6 }}>{t("barModeView", "soundSetLabel")}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
              <Pressable
                onPress={() => setBlockRepSoundSet(null)}
                style={[styles.typeToggle, { backgroundColor: blockRepSoundSet === null ? C.accent + "30" : C.overlay08 }]}
              >
                <Text style={{ color: blockRepSoundSet === null ? C.accent : C.textSecondary, fontSize: FontSize.caption, fontFamily: "SpaceGrotesk_600SemiBold" }}>
                  {t("barModeView", "soundSetDefault")}
                </Text>
              </Pressable>
              {SOUND_SET_OPTIONS.map(opt => (
                <Pressable
                  key={opt.key}
                  onPress={() => setBlockRepSoundSet(opt.key)}
                  style={[styles.typeToggle, { backgroundColor: blockRepSoundSet === opt.key ? C.accent + "30" : C.overlay08 }]}
                >
                  <Text style={{ color: blockRepSoundSet === opt.key ? C.accent : C.textSecondary, fontSize: FontSize.caption, fontFamily: "SpaceGrotesk_600SemiBold" }}>
                    {t("barModeView", opt.labelKey)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </AnimatedModal>
    </View>
  );
}

// ─── 스타일 ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  drawerToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    justifyContent: "space-between",
  },
  drawerToggleBtn: {
    flex: 1,
    paddingRight: 8,
  },
  stpBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  symbolDrawer: {
    overflow: "hidden",
  },
  symbolDrawerInner: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    gap: Spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  symbolBtn: {
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.sm,
    borderWidth: 1,
    gap: 2,
  },
  barList: {
    flex: 1,
  },
  barRow: {
    flexDirection: "row",
    alignItems: "center",
    height: BAR_ROW_H,
    paddingHorizontal: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  barRowNumber: {
    width: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  barRowNumberText: {
    fontSize: FontSize.caption,
  },
  barRowCells: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: Spacing.xs,
    height: 20,
    borderRadius: Radius.xs,
    overflow: "hidden",
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.08)",
  },
  barMiniCell: {
    flex: 1,
    height: "100%",
    borderRadius: 0,
  },
  barRowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minWidth: 50,
    justifyContent: "flex-end",
  },
  badgeText: {
    fontSize: 9,
    fontFamily: "SpaceGrotesk_700Bold",
  },
  barRepeatBadge: {
    fontSize: 9,
    fontFamily: "SpaceGrotesk_700Bold",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
  },
  barBpmBadge: {
    fontSize: 9,
    fontFamily: "SpaceGrotesk_500Medium",
    opacity: 0.7,
  },
  addBarBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginHorizontal: Spacing.md,
    marginVertical: Spacing.sm,
    paddingVertical: 10,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderStyle: "dashed",
  },
  editorSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingBottom: Spacing.xs,
  },
  layerTabRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.xs,
  },
  layerTab: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 2,
  },
  repeatBadgeTouchable: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.xs,
    borderWidth: 1,
    marginRight: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  mainSubdivisionSlot: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  layerEditorRow: {
    flexDirection: "row",
    gap: 6,
    padding: Spacing.sm,
    justifyContent: "center",
  },
  layerBeatTypeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    borderWidth: 1,
    alignItems: "center",
  },
  actionBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingBottom: Spacing.sm,
  },
  actionBtn: {
    padding: Spacing.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  clockArea: {
    flex: 1,
    alignItems: "center",
  },
  clockText: {
    fontSize: 18,
    fontFamily: "SpaceGrotesk_700Bold",
  },
  clockDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  playBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    borderRadius: Radius.md,
    padding: Spacing.md,
    width: "100%",
    maxWidth: 320,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingBottom: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: Spacing.sm,
  },
  typeToggle: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
  },
  stepBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  bpmInput: {
    fontSize: 16,
    fontFamily: "SpaceGrotesk_700Bold",
    minWidth: 44,
    textAlign: "center",
    borderBottomWidth: 1.5,
    paddingVertical: 2,
  },
  timerInput: {
    fontSize: 28,
    fontFamily: "SpaceGrotesk_700Bold",
    textAlign: "center",
    borderBottomWidth: 1.5,
    paddingVertical: 8,
    marginVertical: 16,
  },
  timerSetBtn: {
    paddingVertical: 10,
    borderRadius: Radius.sm,
    alignItems: "center",
    marginTop: 4,
  },
});
