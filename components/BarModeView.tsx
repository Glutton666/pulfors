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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  View, Text, ScrollView, Pressable, PanResponder,
  Animated, TextInput, Platform, StyleSheet, Modal,
  type ViewStyle, type StyleProp,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { LinearGradient } from "expo-linear-gradient";
import { AnimatedModal } from "@/components/AnimatedModal";
import { CustomSoundSetEditor } from "./CustomSoundSetEditor";
import { SubdivisionBar } from "./SubdivisionBar";
import { BarPlayButton } from "./BarPlayButton";
import { BeatStepperButton } from "./BeatStepperButton";
import { formatRepeat } from "./beat-indicator-helpers";
import type { BeatType, BarRepeat, LoopBlock, BarLayer } from "./beat-indicator.types";
import type { ProgressInfo } from "@/lib/metronome-engine";
import type { BarModeViewKey } from "@/lib/i18n";
import type { CustomSoundSetConfig } from "@/lib/storage";
import { Spacing, Radius, FontSize } from "@/constants/tokens";
import { useLanguage } from "@/contexts/LanguageContext";
import { useScale, IS_TABLET } from "@/lib/scale";
import { HintBanner } from "@/components/HintTooltip";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

function formatBarCenterInfo(
  repeat: BarRepeat | null,
  bpm: number,
  _beatsPerMeasure: number,
): string | null {
  const effectiveBpm = (repeat?.bpm && repeat.bpm > 0) ? repeat.bpm : bpm;
  // 1바 = 엔진 1비트 = 60 / BPM 초
  const barSec = 60 / Math.max(1, effectiveBpm);
  const bpmStr = String(Math.round(effectiveBpm));

  if (!repeat || (repeat.type === "count" && repeat.value <= 1 && !repeat.bpm)) {
    return `${bpmStr}`;
  }

  if (repeat.type === "count") {
    // 총 시간 = 1바 시간 × 반복 횟수
    const totalSec = barSec * Math.max(1, repeat.value);
    const totalMm = Math.floor(totalSec / 60).toString().padStart(2, "0");
    const totalSs = Math.round(totalSec % 60).toString().padStart(2, "0");
    return `${bpmStr} / ×${repeat.value}(${totalMm}:${totalSs})`;
  } else {
    // duration 타입: 설정 시간이 총 시간, 그 안에 몇 바 들어가는지
    const count = barSec > 0 ? Math.round(repeat.value / barSec) : 0;
    const totalMm = Math.floor(repeat.value / 60).toString().padStart(2, "0");
    const totalSs = Math.round(repeat.value % 60).toString().padStart(2, "0");
    return `${bpmStr} / ×${count}(${totalMm}:${totalSs})`;
  }
}

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
  onAddBar?: (draftRepeat?: BarRepeat) => void;
  onDeleteBar?: (beatIndex: number) => void;
  onCopyBar?: (beat: number) => void;
  subdivisionBarElement?: React.ReactNode;
  onBarQuickSave?: () => Promise<boolean> | void;
  onResetFlash?: () => void;
  onBarReset?: () => void;
  onBarScrollOffset?: (offset: number) => void;
  noteSamples?: Record<string, string>;
  noteSampleNames?: Record<string, string>;
  noteSampleSources?: Record<string, string>;
  bpm?: number;
  halfTime?: boolean;
  beatDenominator?: 2 | 4 | 8;
  onDenominatorCycle?: () => void;
  isLandscape?: boolean;
  tempoLabel?: string;
  soundSet?: string;
  onSoundSetChange?: (ss: string) => void;
  layerSoundSets?: Record<number, string>;
  onLayerSoundSetsChange?: (val: Record<number, string>) => void;
  onPreviewSoundSet?: (key: string) => void;
  customSoundSets?: Record<string, CustomSoundSetConfig>;
  onCustomSoundSetsChange?: (configs: Record<string, CustomSoundSetConfig>) => void;
  colors: BarModeColors;
  ms: (size: number, factor?: number) => number;
  cellOverlayOpacity?: number;
  rowHeight?: number;
  onExitBarMode?: () => void;
  onNoteRecordRequest?: (beatIndex: number, subIndex: number) => void;
  onReorderBar?: (fromIndex: number, toIndex: number) => void;
  onInsertBarAfter?: (beatIndex: number) => void;
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
  blockRepeatText?: string | null;
  symbolBadges: string[];
  isPlaying: boolean;
  progressCurrent?: number;
  progressTotal?: number;
  bpm: number;
  beatsPerMeasure: number;
  onPress: (beat: number) => void;
  onSwipeLeft: (beat: number) => void;
  onSwipeRight: (beat: number) => void;
  onLongPress: (beat: number) => void;
  onDragStart?: (beat: number) => void;
  onDragMove?: (beat: number, dy: number) => void;
  onDragEnd?: (beat: number, dy: number) => void;
  isDragging?: boolean;
  showDropLineAbove?: boolean;
  dragTranslateY?: Animated.Value;
  colors: BarModeColors;
  ms: (size: number, factor?: number) => number;
  rowHeight?: number;
  cellOverlayOpacity?: number;
}

function SwipeableBarRow({
  beat, beatType, subdivisions, repeat, isCurrentBeat, isEditingBeat,
  blockDepth, blockStart, blockEnd, blockRepeatText, symbolBadges, isPlaying, progressCurrent,
  progressTotal, bpm, beatsPerMeasure, onPress, onSwipeLeft, onSwipeRight, onLongPress,
  onDragStart, onDragMove, onDragEnd, isDragging, showDropLineAbove, dragTranslateY,
  colors: C, ms,
  rowHeight, cellOverlayOpacity,
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

  const beatNumDragStarted = useRef(false);
  const beatNumPan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !isPlaying,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => { beatNumDragStarted.current = false; },
    onPanResponderMove: (_e, g) => {
      if (!beatNumDragStarted.current && Math.abs(g.dy) > 8) {
        beatNumDragStarted.current = true;
        onDragStart?.(beat);
      }
      if (beatNumDragStarted.current) { onDragMove?.(beat, g.dy); }
    },
    onPanResponderRelease: (_e, g) => {
      if (beatNumDragStarted.current) {
        onDragEnd?.(beat, g.dy);
      } else if (Math.abs(g.dx) < 8 && Math.abs(g.dy) < 8) {
        onPress?.(beat);
      }
      beatNumDragStarted.current = false;
    },
    onPanResponderTerminate: (_e, g) => {
      if (beatNumDragStarted.current) { onDragEnd?.(beat, g.dy ?? 0); }
      beatNumDragStarted.current = false;
    },
  }), [isPlaying, beat, onDragStart, onDragMove, onDragEnd, onPress]);

  const cells: BeatType[] = subdivisions.length > 0 ? subdivisions : [beatType];
  const BRACKET_COL_W = 16;

  const rowTransform = dragTranslateY
    ? [{ translateX }, { translateY: dragTranslateY }]
    : [{ translateX }];

  return (
    <View style={{ position: "relative", overflow: isDragging ? "visible" : "hidden" }}>
      {showDropLineAbove && (
        <View style={{ height: 2, backgroundColor: "#5b9cf6", borderRadius: 1, marginHorizontal: 4 }} />
      )}
      <Animated.View
        style={[
          { transform: rowTransform },
          isDragging && {
            zIndex: 20,
            shadowColor: "#000",
            shadowOpacity: 0.3,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 4 },
            elevation: 10,
            opacity: 0.92,
          },
        ]}
        {...panResponder.panHandlers}
      >
        <Pressable
          testID={`bar-row-${beat}`}
          onPress={() => { if (!isPlaying) onPress(beat); }}
          onLongPress={() => { if (!isPlaying) onLongPress(beat); }}
          delayLongPress={500}
          style={[
            styles.barRow,
            {
              height: rowHeight ?? BAR_ROW_H,
              backgroundColor: isCurrentBeat
                ? C.accent + "18"
                : isEditingBeat
                ? C.backgroundSecondary
                : "transparent",
              borderBottomColor: C.overlay06,
            },
          ]}
        >
          {/* 바 번호 + 드래그 핸들 */}
          <View
            style={[styles.barRowNumber, { width: ms(32, 0.5), paddingHorizontal: 2 }]}
            {...beatNumPan.panHandlers}
          >
            <Text
              style={[
                styles.barRowNumberText,
                {
                  fontSize: ms(13, 0.45),
                  color: isDragging
                    ? "#5b9cf6"
                    : isCurrentBeat
                    ? C.accent
                    : beatType === "strong" ? C.accent
                    : beatType === "accent" ? C.accentMuted
                    : beatType === "mute" ? C.textTertiary
                    : C.textSecondary,
                  fontFamily: isDragging || isCurrentBeat ? "SpaceGrotesk_700Bold" : "SpaceGrotesk_500Medium",
                  opacity: isDragging ? 0.9 : 0.2,
                },
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.6}
            >
              {beat + 1}
            </Text>
            <View style={{ flexDirection: "column", gap: 2, marginLeft: 1, opacity: isDragging ? 0.7 : 0.2 }}>
              {[0, 1, 2].map(i => (
                <View key={i} style={{ width: 10, height: 1.5, borderRadius: 1, backgroundColor: isDragging ? "#5b9cf6" : C.textTertiary }} />
              ))}
            </View>
          </View>

          {/* 중앙: 비트 셀 (info overlay + 브래킷 절대 오버레이 포함) */}
          <View style={[styles.barRowCells, { height: rowHeight != null ? Math.max(20, rowHeight - 16) : 28 }]}>
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

            {/* 비트 셀 위 info overlay */}
            <View style={[styles.barCellOverlay, { backgroundColor: "transparent" }]} pointerEvents="none">
              <Text
                style={[styles.barCenterInfo, {
                  color: isCurrentBeat ? C.accent : C.text,
                  fontSize: ms(13, 0.45),
                  textShadowColor: "rgba(0,0,0,0.85)",
                  textShadowOffset: { width: 0, height: 1 },
                  textShadowRadius: 4,
                }]}
                numberOfLines={1}
              >
                {isPlaying && progressTotal && progressTotal > 1 && progressCurrent !== undefined
                  ? `${formatBarCenterInfo(repeat, bpm, beatsPerMeasure) ?? String(Math.round(bpm))} [${progressCurrent + 1}/${progressTotal}]`
                  : (formatBarCenterInfo(repeat, bpm, beatsPerMeasure) ?? String(Math.round(bpm)))
                }
                {symbolBadges.length > 0 ? `  ${symbolBadges.join(" ")}` : ""}
              </Text>
            </View>

            {/* 좌측 블록 시작 괄호 — 셀 왼쪽 테두리에 붙는 절대 오버레이 */}
            {blockStart && (
              <View
                style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 10, alignItems: "center", justifyContent: "center" }}
                pointerEvents="none"
              >
                <Text style={{ fontSize: ms(14, 0.5), color: C.accent, fontFamily: "SpaceGrotesk_700Bold", opacity: 0.85, includeFontPadding: false }}>{"["}</Text>
              </View>
            )}

            {/* 우측 블록 끝 괄호 + 반복 횟수 뱃지 — 셀 오른쪽 테두리에 붙는 절대 오버레이 */}
            {blockEnd && (
              <View
                style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 10, alignItems: "center", justifyContent: "center" }}
                pointerEvents="none"
              >
                <Text style={{ fontSize: ms(14, 0.5), color: C.accent, fontFamily: "SpaceGrotesk_700Bold", opacity: 0.85, includeFontPadding: false }}>{"]"}</Text>
              </View>
            )}

            {/* 반복 횟수 뱃지 (×N) — 오른쪽 끝 상단 */}
            {blockRepeatText && (
              <View
                style={{ position: "absolute", right: blockEnd ? 10 : 4, top: 2 }}
                pointerEvents="none"
              >
                <Text style={{ fontSize: ms(9, 0.4), color: C.accent, fontFamily: "SpaceGrotesk_700Bold", opacity: 0.9 }}>{blockRepeatText}</Text>
              </View>
            )}
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
  noteSamples, bpm, beatDenominator = 4, onDenominatorCycle, isLandscape, tempoLabel,
  soundSet = "classic", onSoundSetChange, layerSoundSets = {} as Record<number, string>, onLayerSoundSetsChange, onPreviewSoundSet,
  customSoundSets = {} as Record<string, CustomSoundSetConfig>, onCustomSoundSetsChange,
  colors: C, ms,
  cellOverlayOpacity,
  rowHeight,
  onExitBarMode,
  onNoteRecordRequest,
  onReorderBar,
  onInsertBarAfter,
}: BarModeViewProps) {

  const { t } = useLanguage();
  const S = useScale();
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const topInset = insets.top || webTopInset;

  // ─── 드래그 재정렬 상태 ──────────────────────────────────────────────────

  const [draggingBeat, setDraggingBeat] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const draggingDyAnim = useRef(new Animated.Value(0)).current;
  const draggingBeatRef = useRef<number | null>(null);

  const rowH = rowHeight ?? BAR_ROW_H;

  const handleDragStart = useCallback((beat: number) => {
    if (isPlaying) return;
    draggingBeatRef.current = beat;
    setDraggingBeat(beat);
    setDropIndex(beat);
    draggingDyAnim.setValue(0);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [isPlaying, draggingDyAnim]);

  const handleDragMove = useCallback((beat: number, dy: number) => {
    draggingDyAnim.setValue(dy);
    const n = beatsPerMeasure;
    const newDrop = Math.max(0, Math.min(n - 1, beat + Math.round(dy / rowH)));
    setDropIndex(prev => prev !== newDrop ? newDrop : prev);
  }, [beatsPerMeasure, rowH, draggingDyAnim]);

  const handleDragEnd = useCallback((beat: number, dy: number) => {
    const n = beatsPerMeasure;
    const finalDrop = Math.max(0, Math.min(n - 1, beat + Math.round(dy / rowH)));
    draggingBeatRef.current = null;
    setDraggingBeat(null);
    setDropIndex(null);
    draggingDyAnim.setValue(0);
    if (finalDrop !== beat) {
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onReorderBar?.(beat, finalDrop);
    }
  }, [beatsPerMeasure, rowH, draggingDyAnim, onReorderBar]);

  // ─── 상태 ────────────────────────────────────────────────────────────────

  const [symbolDrawerOpen, setSymbolDrawerOpen] = useState(false);
  const [soundSetPickerTarget, setSoundSetPickerTarget] = useState<{ isLayer: boolean; layerNum: number } | null>(null);
  const [editingCustomSlot, setEditingCustomSlot] = useState<string | null>(null);
  const soundSetDidLongPressRef = useRef(false);
  const [placingSymbol, setPlacingSymbol] = useState<SymbolType | null>(null);
  const [blockSelectFirst, setBlockSelectFirst] = useState<number | null>(null);
  const [activeLayerTab, setActiveLayerTab] = useState(0);
  const [editorCollapsed, setEditorCollapsed] = useState(false);

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
  const [repCount, setRepCount] = useState(1);
  const [repMin, setRepMin] = useState(0);
  const [repSec, setRepSec] = useState(30);
  const [repBpm, setRepBpm] = useState<number | null>(null);

  // BPM 스와이프/롱프레스 refs
  const repBpmRef = useRef<number | null>(null);
  useEffect(() => { repBpmRef.current = repBpm; }, [repBpm]);
  const repTypeRef = useRef<"count" | "duration">("count");
  useEffect(() => { repTypeRef.current = repType; }, [repType]);
  const repCountRef = useRef(1);
  useEffect(() => { repCountRef.current = repCount; }, [repCount]);
  const repMinRef = useRef(0);
  useEffect(() => { repMinRef.current = repMin; }, [repMin]);
  const repSecRef = useRef(30);
  useEffect(() => { repSecRef.current = repSec; }, [repSec]);
  const bpmPropRef = useRef(bpm);
  useEffect(() => { bpmPropRef.current = bpm; }, [bpm]);
  const bpmPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bpmPressInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const bpmHoldFired = useRef(false);
  const clearBpmTimers = useCallback(() => {
    if (bpmPressTimer.current) { clearTimeout(bpmPressTimer.current); bpmPressTimer.current = null; }
    if (bpmPressInterval.current) { clearInterval(bpmPressInterval.current); bpmPressInterval.current = null; }
    bpmHoldFired.current = false;
  }, []);

  const secHoldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const secHoldInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const secHoldFired = useRef(false);
  const clearSecTimers = useCallback(() => {
    if (secHoldTimer.current) { clearTimeout(secHoldTimer.current); secHoldTimer.current = null; }
    if (secHoldInterval.current) { clearInterval(secHoldInterval.current); secHoldInterval.current = null; }
    secHoldFired.current = false;
  }, []);

  // 바 미선택 상태에서 "다음 추가할 바"의 레이어 draft
  const [draftLayers, setDraftLayers] = useState<BarLayer[]>([]);

  // 재생 경과 시간
  const [barElapsedSec, setBarElapsedSec] = useState(0);
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

  // 재생 경과 시간 카운트
  useEffect(() => {
    if (isPlaying) {
      barStartTimeRef.current = Date.now();
      setBarElapsedSec(0);
      const iv = setInterval(() => {
        setBarElapsedSec(Math.floor((Date.now() - barStartTimeRef.current) / 1000));
      }, 1000);
      return () => clearInterval(iv);
    } else {
      setBarElapsedSec(0);
    }
    return undefined;
  }, [isPlaying]);

  useEffect(() => {
    return () => { if (saveFlashTimer.current) clearTimeout(saveFlashTimer.current); };
  }, []);

  // ─── 재생 중 자동 스크롤 ──────────────────────────────────────────────────

  useEffect(() => {
    if (!isPlaying) {
      barScrollRef.current?.scrollTo({ y: 0, animated: false });
      onBarScrollOffset?.(0);
      return;
    }
    if (barContainerHeight <= 0 || currentBeat < 0) return;
    const rowH = rowHeight ?? BAR_ROW_H;
    const beatTop = currentBeat * rowH;
    const scrollTarget = Math.max(0, beatTop - barContainerHeight / 2 + rowH / 2);
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

  const totalDurationDisplay = useMemo(() => {
    if (!bpm || bpm <= 0 || beatsPerMeasure <= 0) return null;
    let totalSec = 0;
    for (let i = 0; i < beatsPerMeasure; i++) {
      const rep = barRepeats[i];
      const effectiveBpm = (rep?.bpm && rep.bpm > 0) ? rep.bpm : bpm;
      const barSec = 60 / effectiveBpm; // 1바 = 엔진 1비트 = 60/BPM 초
      if (!rep || rep.type === "count") {
        totalSec += barSec * (rep?.value ?? 1);
      } else {
        totalSec += rep.value;
      }
    }
    const mm = Math.floor(totalSec / 60);
    const ss = Math.round(totalSec % 60);
    return `${mm}:${String(ss).padStart(2, "0")}`;
  }, [bpm, beatsPerMeasure, barRepeats]);

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

  const getNextCustomSlot = useCallback((): string | null => {
    const slots = ["custom1", "custom2", "custom3"];
    for (const s of slots) {
      if (!customSoundSets[s]) return s;
    }
    return null;
  }, [customSoundSets]);

  const openCustomEditor = useCallback((slot: string) => {
    setSoundSetPickerTarget(null);
    setEditingCustomSlot(slot);
  }, []);

  const handleSymbolPlacementRef = useRef<(beat: number) => void>(() => {});

  const handleBarRowPress = useCallback((beat: number) => {
    if (isPlaying) return;
    if (placingSymbol) {
      handleSymbolPlacementRef.current(beat);
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
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onNoteRecordRequest?.(beat, 0);
  }, [isPlaying, onNoteRecordRequest]);

  const handleSwipeLeft = useCallback((beat: number) => {
    // 삭제: 해당 바를 삭제
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onDeleteBar?.(beat);
  }, [onDeleteBar]);

  const handleSwipeRight = useCallback((beat: number) => {
    // 복사 삽입: 해당 바와 같은 설정의 바를 바로 아래에 삽입
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onInsertBarAfter?.(beat);
  }, [onInsertBarAfter]);

  const handleAddBar = useCallback(() => {
    if (isPlaying) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // draft 상태(반복 설정 + 레이어)를 적용해서 새 바 추가
    const val = repType === "count" ? repCount : repMin * 60 + repSec;
    const draftRepeat: BarRepeat | undefined =
      (repType === "count" && repCount === 1 && !repBpm && draftLayers.length === 0)
        ? undefined
        : { type: repType, value: Math.max(1, val), ...(repBpm ? { bpm: repBpm } : {}), ...(draftLayers.length > 0 ? { layers: draftLayers.map(l => ({ ...l })) } : {}) };
    onAddBar?.(draftRepeat);
  }, [isPlaying, onAddBar, repType, repCount, repMin, repSec, repBpm, draftLayers]);

  const handleBeatsIncrement = useCallback(() => {
    if (beatsPerMeasure < MAX_BEATS) onBeatsChange(beatsPerMeasure + 1);
  }, [beatsPerMeasure, onBeatsChange]);

  const handleBeatsDecrement = useCallback(() => {
    if (beatsPerMeasure > MIN_BEATS) onBeatsChange(beatsPerMeasure - 1);
  }, [beatsPerMeasure, onBeatsChange]);

  const deleteBlock = useCallback(() => {
    if (blockEditingIdx === null) return;
    onLoopBlocksChange(loopBlocks.filter((_, i) => i !== blockEditingIdx));
    setBlockEditingIdx(null);
  }, [blockEditingIdx, loopBlocks, onLoopBlocksChange]);

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
      onBarStartBeatSelect(beat);
      setPlacingSymbol(null);
      return;
    }
  }, [placingSymbol, blockSelectFirst, loopBlocks, onLoopBlocksChange, barRepeats, onBarRepeatChange, onBarStartBeatSelect]);

  // 항상 최신 handleSymbolPlacement를 참조하도록 ref 업데이트
  handleSymbolPlacementRef.current = handleSymbolPlacement;

  const saveVolta = useCallback(() => {
    if (voltaBeat === null) return;
    const existing = barRepeats[voltaBeat] ?? { type: "count" as const, value: 1 };
    onBarRepeatChange(voltaBeat, { ...existing, voltaMax: voltaVal });
    setVoltaBeat(null);
  }, [voltaBeat, voltaVal, barRepeats, onBarRepeatChange]);

  // ─── 편집기 위로 스와이프하여 바 추가 ────────────────────────────────────

  // ─── 선택된 바에 적용된 심볼 계산 ─────────────────────────────────────────

  const selectedBarApplied = useMemo<Set<SymbolType>>(() => {
    const s = new Set<SymbolType>();
    if (barStartBeat === null) return s;
    const rep = barRepeats[barStartBeat];
    if (rep?.jumpFromId !== undefined) s.add("jump_from");
    if (rep?.jumpToId !== undefined) s.add("jump_to");
    if (rep?.voltaMax !== undefined) s.add("volta");
    if (rep?.isEnd) s.add("end");
    if (loopBlocks.some(b => b.layerOf === undefined && (b.startBeat === barStartBeat || b.endBeat === barStartBeat))) {
      s.add("block");
    }
    return s;
  }, [barStartBeat, barRepeats, loopBlocks]);

  const handleRemoveSymbol = useCallback((sym: SymbolType, beat: number) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (sym === "block") {
      const newBlocks = loopBlocks.filter(b =>
        !(b.layerOf === undefined && (b.startBeat === beat || b.endBeat === beat))
      );
      onLoopBlocksChange(newBlocks);
      return;
    }
    const existing = barRepeats[beat];
    if (!existing) return;
    if (sym === "jump_from") {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { jumpFromId: _jf, ...updated } = existing;
      onBarRepeatChange(beat, updated as BarRepeat);
    } else if (sym === "jump_to") {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { jumpToId: _jt, ...updated } = existing;
      onBarRepeatChange(beat, updated as BarRepeat);
    } else if (sym === "volta") {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { voltaMax: _vm, ...updated } = existing;
      onBarRepeatChange(beat, updated as BarRepeat);
    } else if (sym === "end") {
      onBarRepeatChange(beat, { ...existing, isEnd: false });
    }
  }, [loopBlocks, onLoopBlocksChange, barRepeats, onBarRepeatChange]);

  const editorSwipeAnim = useRef(new Animated.Value(0)).current;
  const editorSwipePan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_e, g) =>
      !isPlaying && draggingBeatRef.current === null && g.dy < -15 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
    onPanResponderMove: () => {},
    onPanResponderRelease: (_e, g) => {
      if (g.dy < -50) {
        handleAddBar();
      }
    },
    onPanResponderTerminate: () => {},
  }), [isPlaying, handleAddBar]);

  // ─── 레이어 관련 ─────────────────────────────────────────────────────────

  const editingBeat = barStartBeat;
  const editingRepeat = editingBeat !== null ? barRepeats[editingBeat] : null;
  const editingSubdivisionCount = editingBeat !== null
    ? (beatSubdivisions[String(editingBeat)]?.length || 1)
    : 1;

  // 선택된 바 변경 시 반복 로컬 상태 동기화 (barRepeats는 의도적 제외 — 값 변경마다 리셋 방지)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (editingBeat === null) {
      // 바 선택 해제 시 draft 초기화
      setDraftLayers([]);
      setRepType("count"); setRepCount(1); setRepMin(0); setRepSec(30); setRepBpm(null);
      setActiveLayerTab(0);
      return;
    }
    const existing = barRepeats[editingBeat];
    if (existing) {
      setRepType(existing.type);
      if (existing.type === "count") setRepCount(existing.value >= 1 ? existing.value : 1);
      else { setRepMin(Math.floor(existing.value / 60)); setRepSec(existing.value % 60); }
      setRepBpm(existing.bpm ?? null);
    } else {
      setRepType("count"); setRepCount(1); setRepMin(0); setRepSec(30); setRepBpm(null);
    }
  }, [editingBeat]); // barRepeats 제외 의도적

  // ─── 반복 설정 인라인 편집 ────────────────────────────────────────────────

  const commitRepeat = useCallback((
    type: "count" | "duration",
    count: number,
    min: number,
    sec: number,
    bpmOverride: number | null,
  ) => {
    if (isPlaying) return;
    const val = type === "count" ? count : min * 60 + sec;
    if (val <= 0) return;
    if (editingBeat === null) return; // draft 모드에서는 repCount/repType 로컬 상태만 유지
    const rep: BarRepeat = { type, value: type === "count" ? Math.max(1, val) : Math.max(1, val) };
    if (bpmOverride !== null && bpmOverride > 0) rep.bpm = bpmOverride;
    const existing = barRepeats[editingBeat];
    if (existing) {
      if (existing.voltaMax) rep.voltaMax = existing.voltaMax;
      if (existing.isEnd) rep.isEnd = existing.isEnd;
      if (existing.jumpFromId) rep.jumpFromId = existing.jumpFromId;
      if (existing.jumpToId) rep.jumpToId = existing.jumpToId;
      if (existing.layers) rep.layers = existing.layers;
    }
    onBarRepeatChange(editingBeat, rep);
  }, [editingBeat, isPlaying, barRepeats, onBarRepeatChange]);

  // BPM 스와이프/롱프레스 핸들러 refs (stale closure 방지)
  const commitRepeatRef = useRef(commitRepeat);
  useEffect(() => { commitRepeatRef.current = commitRepeat; }, [commitRepeat]);
  const editingBeatRef = useRef(editingBeat);
  useEffect(() => { editingBeatRef.current = editingBeat; }, [editingBeat]);

  const applyRepBpm = useCallback((newBpm: number) => {
    setRepBpm(newBpm);
    if (editingBeatRef.current !== null) {
      commitRepeatRef.current(repTypeRef.current, repCountRef.current, repMinRef.current, repSecRef.current, newBpm);
    }
  }, []);

  const startBpmHold = useCallback((dir: 1 | -1) => {
    clearBpmTimers();
    bpmPressTimer.current = setTimeout(() => {
      bpmHoldFired.current = true;
      const step = () => {
        const cur = repBpmRef.current ?? bpmPropRef.current ?? 120;
        let next: number;
        if (dir === -1) {
          const t = Math.floor(cur / 10) * 10;
          next = Math.max(20, cur === t ? cur - 10 : t);
        } else {
          const t = Math.ceil(cur / 10) * 10;
          next = Math.min(300, cur === t ? cur + 10 : t);
        }
        applyRepBpm(next);
      };
      step();
      bpmPressInterval.current = setInterval(step, 350);
    }, 500);
  }, [clearBpmTimers, applyRepBpm]);

  const startSecHold = useCallback((dir: 1 | -1, repMinVal: number, repSecVal: number, commitFn: (m: number, s: number) => void) => {
    clearSecTimers();
    secHoldTimer.current = setTimeout(() => {
      secHoldFired.current = true;
      const step = () => {
        const totalSec = repMinRef.current * 60 + repSecRef.current;
        const next = Math.max(0, Math.min(3599, totalSec + dir * 10));
        const m = Math.floor(next / 60);
        const s = next % 60;
        commitFn(m, s);
      };
      step();
      secHoldInterval.current = setInterval(step, 250);
    }, 400);
  }, [clearSecTimers]);

  const bpmSwipePan = useMemo(() => {
    let startBpm = 0;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 8 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5,
      onPanResponderGrant: () => {
        startBpm = repBpmRef.current ?? bpmPropRef.current ?? 120;
      },
      onPanResponderMove: (_, gs) => {
        const newBpm = Math.min(300, Math.max(20, Math.round(startBpm - gs.dx / 3)));
        applyRepBpm(newBpm);
      },
      onPanResponderRelease: () => {},
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearRepeat = useCallback(() => {
    if (isPlaying) return;
    if (editingBeat === null) {
      // draft 모드: 반복 설정 초기화
      setRepType("count"); setRepCount(1); setRepMin(0); setRepSec(30); setRepBpm(null);
      return;
    }
    const existing = barRepeats[editingBeat];
    if (!existing) return;
    const hasOtherFields = existing.voltaMax || existing.isEnd || existing.jumpFromId || existing.jumpToId || existing.layers;
    if (hasOtherFields) {
      const rep: BarRepeat = { type: "count", value: 1 };
      if (existing.voltaMax) rep.voltaMax = existing.voltaMax;
      if (existing.isEnd) rep.isEnd = existing.isEnd;
      if (existing.jumpFromId) rep.jumpFromId = existing.jumpFromId;
      if (existing.jumpToId) rep.jumpToId = existing.jumpToId;
      if (existing.layers) rep.layers = existing.layers;
      onBarRepeatChange(editingBeat, rep);
    } else {
      onBarRepeatChange(editingBeat, null);
    }
    setRepType("count"); setRepCount(1); setRepMin(0); setRepSec(30); setRepBpm(null);
  }, [editingBeat, isPlaying, barRepeats, onBarRepeatChange]);

  // 현재 편집 중인 레이어 목록: 바 선택 시 barRepeats, 미선택 시 draft
  const editingLayers: BarLayer[] = editingBeat !== null
    ? (editingRepeat?.layers ?? [])
    : draftLayers;

  const MAX_LAYERS = 6;

  const addLayer = useCallback(() => {
    if (editingBeat === null) {
      // draft 모드
      if (draftLayers.length >= MAX_LAYERS) return;
      const layers = [...draftLayers, { beatType: "normal" as BeatType }];
      setDraftLayers(layers);
      setActiveLayerTab(layers.length);
      return;
    }
    const existing = barRepeats[editingBeat] ?? { type: "count" as const, value: 1 };
    if ((existing.layers ?? []).length >= MAX_LAYERS) return;
    const layers = [...(existing.layers ?? []), { beatType: "normal" as BeatType }];
    onBarRepeatChange(editingBeat, { ...existing, layers });
    setActiveLayerTab(layers.length);
  }, [editingBeat, draftLayers, barRepeats, onBarRepeatChange]);

  const removeLayer = useCallback((layerIdx: number) => {
    if (editingBeat === null) {
      // draft 모드
      const layers = draftLayers.filter((_, i) => i !== layerIdx);
      setDraftLayers(layers);
      setActiveLayerTab(0);
      return;
    }
    const existing = barRepeats[editingBeat];
    if (!existing?.layers) return;
    const layers = existing.layers.filter((_, i) => i !== layerIdx);
    onBarRepeatChange(editingBeat, { ...existing, layers: layers.length === 0 ? undefined : layers });
    setActiveLayerTab(0);
  }, [editingBeat, draftLayers, barRepeats, onBarRepeatChange]);

  const updateLayerBeatType = useCallback((layerIdx: number, bt: BeatType) => {
    if (editingBeat === null) {
      setDraftLayers(prev => prev.map((l, i) => i === layerIdx ? { ...l, beatType: bt } : l));
      return;
    }
    const existing = barRepeats[editingBeat];
    if (!existing?.layers) return;
    const layers = existing.layers.map((l, i) => i === layerIdx ? { ...l, beatType: bt } : l);
    onBarRepeatChange(editingBeat, { ...existing, layers });
  }, [editingBeat, barRepeats, onBarRepeatChange]);

  const updateLayerSubdivisions = useCallback((layerIdx: number, subs: BeatType[] | null) => {
    if (editingBeat === null) {
      setDraftLayers(prev => prev.map((l, i) => {
        if (i !== layerIdx) return l;
        if (subs === null) { const { subdivisions: _d, ...rest } = l; return rest; }
        return { ...l, subdivisions: subs };
      }));
      return;
    }
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
    if (editingBeat === null) {
      setDraftLayers(prev => prev.map((l, i) => {
        if (i !== layerIdx) return l;
        if (ss === null) { const { soundSet: _d, ...rest } = l; return rest; }
        return { ...l, soundSet: ss };
      }));
      return;
    }
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

      <HintBanner
        hintKey="bar_mode_intro"
        message={t("barModeView", "hintLongPress")}
        icon="hand-left-outline"
      />

      {/* ── 심볼 드로어 (바 목록 위) ── */}
      <View style={[styles.drawerToggleRow, { borderBottomColor: C.overlay06, borderBottomWidth: StyleSheet.hairlineWidth }]}>
        {/* 좌: flex:1 — 드로어 토글 왼쪽 정렬 */}
        <View style={{ flex: 1 }}>
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
        </View>

        {/* 중앙: 총 시간 + 바 개수 — 양쪽 flex:1 사이에서 자동으로 정중앙 */}
        <View style={{ alignItems: "center" }}>
          {isPlaying ? (
            <>
              <Text style={{ color: C.accent, fontSize: ms(14, 0.4), fontFamily: "SpaceGrotesk_700Bold" }}>
                {(() => {
                  const em = Math.floor(barElapsedSec / 60);
                  const es = barElapsedSec % 60;
                  return `${em}:${String(es).padStart(2, "0")}`;
                })()}
                {totalDurationDisplay ? ` / ${totalDurationDisplay}` : ""}
              </Text>
              {beatsPerMeasure > 0 && (
                <Text style={{ color: C.textTertiary, fontSize: 9, fontFamily: "SpaceGrotesk_400Regular" }}>
                  {beatsPerMeasure}{t("barModeView", "barsDisplay")}
                </Text>
              )}
            </>
          ) : (
            <>
              <Text style={{ color: C.accent, fontSize: ms(14, 0.4), fontFamily: "SpaceGrotesk_700Bold" }}>
                {totalDurationDisplay ?? "—"}
              </Text>
              {beatsPerMeasure > 0 && (
                <Text style={{ color: C.textTertiary, fontSize: 9, fontFamily: "SpaceGrotesk_400Regular" }}>
                  {beatsPerMeasure}{t("barModeView", "barsDisplay")}
                </Text>
              )}
            </>
          )}
        </View>

        {/* 우: flex:1 — 닫기 버튼 오른쪽 정렬 */}
        <View style={{ flex: 1, alignItems: "flex-end" }}>
          {onExitBarMode && (
            <Pressable
              onPress={onExitBarMode}
              hitSlop={10}
              style={[styles.stpBtn, { backgroundColor: C.overlay08 }]}
            >
              <Ionicons name="close" size={ms(14, 0.4)} color={C.textSecondary} />
            </Pressable>
          )}
        </View>
      </View>

      <Animated.View style={[styles.symbolDrawer, { height: drawerHeight, overflow: "hidden" }]}>
        <View style={[styles.symbolDrawerInner, { borderBottomColor: C.overlay08 }]}>
          {(Object.keys(SYMBOL_INFO) as SymbolType[]).map((sym) => {
            const info = SYMBOL_INFO[sym];
            const isPlacing = placingSymbol === sym;
            const isApplied = !placingSymbol && selectedBarApplied.has(sym);
            const col = info.color(C);
            const showActive = isPlacing || isApplied;
            return (
              <Pressable
                key={sym}
                onPress={() => {
                  if (isPlacing) {
                    setPlacingSymbol(null); setBlockSelectFirst(null);
                  } else if (isApplied && barStartBeat !== null) {
                    handleRemoveSymbol(sym, barStartBeat);
                  } else {
                    setPlacingSymbol(sym); setBlockSelectFirst(null);
                  }
                }}
                style={[
                  styles.symbolBtn,
                  {
                    backgroundColor: showActive ? col + "30" : C.backgroundSecondary,
                    borderColor: showActive ? col : "transparent",
                  },
                ]}
              >
                <View style={{ position: "relative" }}>
                  <Ionicons name={info.icon} size={ms(14, 0.4)} color={showActive ? col : C.textSecondary} />
                  {isApplied && (
                    <View style={{
                      position: "absolute",
                      top: -4, right: -5,
                      width: 10, height: 10,
                      borderRadius: 5,
                      backgroundColor: C.danger,
                      alignItems: "center",
                      justifyContent: "center",
                    }}>
                      <Text style={{ color: "#fff", fontSize: 7, fontFamily: "SpaceGrotesk_700Bold", lineHeight: 10 }}>×</Text>
                    </View>
                  )}
                </View>
                <Text style={{ color: showActive ? col : C.textTertiary, fontSize: 9, fontFamily: "SpaceGrotesk_500Medium", marginTop: 2 }}>
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
        style={[styles.barList, S.isTablet && { paddingHorizontal: S.ms(16, 0.5) }]}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        scrollEnabled={!isPlaying && draggingBeat === null}
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
          const startEntry = blockEntries.find(e => e.isStart);
          const blockRepeatText = (() => {
            // 재생 중 활성 블록: 끝 바(])에 카운트다운 표시
            if (isPlaying && progressInfo && progressInfo.blockIndex >= 0) {
              const activeEndEntry = blockEntries.find(
                e => e.isEnd && e.blockIdx === progressInfo.blockIndex,
              );
              if (activeEndEntry) {
                const lb = loopBlocks[activeEndEntry.blockIdx];
                if (lb?.type === "count" && lb.value > 1) {
                  const remaining =
                    progressInfo.blockRepeatTotal - progressInfo.blockRepeatCurrent;
                  return remaining > 0 ? `×${remaining}` : null;
                }
              }
            }
            // 정지 중 or 다른 블록 활성: 시작 바([)에 정적 표시
            if (startEntry) {
              const lb = loopBlocks[startEntry.blockIdx];
              if (lb?.type === "count" && lb.value > 1) return `×${lb.value}`;
            }
            return null;
          })();
          const badges = getSymbolBadges(beat);
          const isCurrent = isPlaying && currentBeat === beat;
          const isEditing = barStartBeat === beat && !isPlaying;
          const isDragging = draggingBeat === beat;
          const showDropLineAbove = (
            draggingBeat !== null &&
            dropIndex !== null &&
            beat !== draggingBeat &&
            beat === dropIndex
          );

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
              blockRepeatText={blockRepeatText}
              symbolBadges={badges}
              isPlaying={isPlaying}
              progressCurrent={progressInfo?.beat === beat ? progressInfo.barRepeatCurrent : undefined}
              progressTotal={progressInfo?.beat === beat ? progressInfo.barRepeatTotal : undefined}
              bpm={bpm ?? 120}
              beatsPerMeasure={beatsPerMeasure}
              onPress={handleBarRowPress}
              onSwipeLeft={handleSwipeLeft}
              onSwipeRight={handleSwipeRight}
              onLongPress={handleBarRowLongPress}
              onDragStart={handleDragStart}
              onDragMove={handleDragMove}
              onDragEnd={handleDragEnd}
              isDragging={isDragging}
              showDropLineAbove={showDropLineAbove}
              dragTranslateY={isDragging ? draggingDyAnim : undefined}
              colors={C}
              ms={ms}
              rowHeight={rowHeight}
              cellOverlayOpacity={cellOverlayOpacity}
            />
          );
        })}

        {/* 스와이프 힌트 (바 미선택 시 빈 공간에 표시) */}
        {editingBeat === null && !isPlaying && (
          <View style={[styles.swipeHintRow, { paddingTop: 12 }]}>
            <Text style={[styles.swipeHintText, { color: C.textTertiary }]}>{t("barModeView", "swipeHintCopy")}</Text>
            <Text style={{ color: C.textTertiary, fontSize: FontSize.micro, opacity: 0.3, marginHorizontal: 8 }}>|</Text>
            <Text style={[styles.swipeHintText, { color: C.textTertiary }]}>{t("barModeView", "swipeHintEdit")}</Text>
            <Text style={{ color: C.textTertiary, fontSize: FontSize.micro, opacity: 0.3, marginHorizontal: 8 }}>|</Text>
            <Text style={[styles.swipeHintText, { color: C.textTertiary }]}>{t("barModeView", "swipeHintAdd")}</Text>
          </View>
        )}

        {/* 바 목록 하단 여백 */}
        <View style={{ height: 8 }} />
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
          {!isPlaying && editingLayers.length < MAX_LAYERS && (
            <Pressable onPress={addLayer} style={styles.layerTab} hitSlop={8}>
              <Text style={{ color: C.textTertiary, fontSize: FontSize.micro }}>+</Text>
            </Pressable>
          )}

          <View style={{ flex: 1 }} />

          {editingBeat !== null && !isPlaying && (
            <Pressable
              onPress={() => { onDeleteBar?.(editingBeat); onBarStartBeatSelect(null); }}
              hitSlop={10}
              style={{ paddingHorizontal: 8, paddingVertical: 4 }}
            >
              <Ionicons name="trash-outline" size={ms(13, 0.4)} color={C.danger} />
            </Pressable>
          )}

          <Pressable onPress={handleSaveTap} hitSlop={10} testID="bar-save-reset" disabled={isPlaying} style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
            <Ionicons
              name={saveFlashVisible ? "checkmark-circle" : "bookmark-outline"}
              size={ms(13, 0.4)}
              color={saveFlashVisible ? "#4CAF50" : isPlaying ? C.textTertiary : C.accent}
            />
          </Pressable>

          <Pressable onPress={() => setEditorCollapsed(v => !v)} hitSlop={10} style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
            <Ionicons name={editorCollapsed ? "chevron-up" : "chevron-down"} size={ms(13, 0.4)} color={C.textTertiary + "99"} />
          </Pressable>
        </View>

        {/* ① 타입 토글 + ×N 스테퍼 행 */}
        {!editorCollapsed && (
          <View style={[styles.inlineRepeatPanel, { borderBottomWidth: 0, flexDirection: "row", alignItems: "center", opacity: isPlaying ? 0.5 : 1 }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
              <Ionicons
                name={editingRepeat ? "repeat" : "repeat-outline"}
                size={ms(12, 0.4)}
                color={editingRepeat ? C.accent : C.textTertiary}
              />
              {(["count", "duration"] as const).map(type => (
                <Pressable
                  key={type}
                  onPress={() => { if (!isPlaying) { setRepType(type); commitRepeat(type, repCount, repMin, repSec, repBpm); } }}
                  style={[styles.typeToggle, { backgroundColor: repType === type ? C.accent + "30" : C.overlay08, paddingHorizontal: 8, paddingVertical: 3 }]}
                >
                  <Text style={{ color: repType === type ? C.accent : C.textSecondary, fontSize: FontSize.micro, fontFamily: "SpaceGrotesk_600SemiBold" }}>
                    {type === "count" ? t("barModeView", "repCount") : t("barModeView", "repDuration")}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              {repType === "count" ? (
                <>
                  <Pressable onPress={() => { if (!isPlaying) { const c = Math.max(1, repCount - 1); setRepCount(c); commitRepeat(repType, c, repMin, repSec, repBpm); } }} style={[styles.stepBtn, { backgroundColor: C.overlay10 }]}>
                    <Ionicons name="remove" size={ms(13, 0.4)} color={C.textSecondary} />
                  </Pressable>
                  <Text style={{ color: C.text, fontSize: 16, fontFamily: "SpaceGrotesk_700Bold", minWidth: 32, textAlign: "center" }}>×{repCount}</Text>
                  <Pressable onPress={() => { if (!isPlaying) { const c = Math.min(99, repCount + 1); setRepCount(c); commitRepeat(repType, c, repMin, repSec, repBpm); } }} style={[styles.stepBtn, { backgroundColor: C.overlay10 }]}>
                    <Ionicons name="add" size={ms(13, 0.4)} color={C.textSecondary} />
                  </Pressable>
                </>
              ) : (
                <>
                  <Pressable onPress={() => { if (!isPlaying) { const m = Math.max(0, repMin - 1); setRepMin(m); commitRepeat(repType, repCount, m, repSec, repBpm); } }} style={[styles.stepBtn, { backgroundColor: C.overlay10 }]}>
                    <Ionicons name="remove" size={ms(12, 0.4)} color={C.textSecondary} />
                  </Pressable>
                  <Text style={{ color: C.text, fontSize: 14, fontFamily: "SpaceGrotesk_700Bold", minWidth: 24, textAlign: "center" }}>{repMin}{t("barModeView", "minuteSuffix")}</Text>
                  <Pressable onPress={() => { if (!isPlaying) { const m = Math.min(59, repMin + 1); setRepMin(m); commitRepeat(repType, repCount, m, repSec, repBpm); } }} style={[styles.stepBtn, { backgroundColor: C.overlay10 }]}>
                    <Ionicons name="add" size={ms(12, 0.4)} color={C.textSecondary} />
                  </Pressable>
                  <Pressable
                    onPress={() => { if (!isPlaying && !secHoldFired.current) { const total = Math.max(0, repMin * 60 + repSec - 1); const m = Math.floor(total / 60); const s = total % 60; setRepMin(m); setRepSec(s); commitRepeat(repType, repCount, m, s, repBpm); } }}
                    onPressIn={() => { if (!isPlaying) startSecHold(-1, repMin, repSec, (m, s) => { setRepMin(m); setRepSec(s); commitRepeat(repTypeRef.current, repCountRef.current, m, s, repBpmRef.current); }); }}
                    onPressOut={() => clearSecTimers()}
                    style={[styles.stepBtn, { backgroundColor: C.overlay10 }]}
                  >
                    <Ionicons name="remove" size={ms(12, 0.4)} color={C.textSecondary} />
                  </Pressable>
                  <Text style={{ color: C.text, fontSize: 14, fontFamily: "SpaceGrotesk_700Bold", minWidth: 24, textAlign: "center" }}>{repSec}{t("barModeView", "secondSuffix")}</Text>
                  <Pressable
                    onPress={() => { if (!isPlaying && !secHoldFired.current) { const total = Math.min(3599, repMin * 60 + repSec + 1); const m = Math.floor(total / 60); const s = total % 60; setRepMin(m); setRepSec(s); commitRepeat(repType, repCount, m, s, repBpm); } }}
                    onPressIn={() => { if (!isPlaying) startSecHold(1, repMin, repSec, (m, s) => { setRepMin(m); setRepSec(s); commitRepeat(repTypeRef.current, repCountRef.current, m, s, repBpmRef.current); }); }}
                    onPressOut={() => clearSecTimers()}
                    style={[styles.stepBtn, { backgroundColor: C.overlay10 }]}
                  >
                    <Ionicons name="add" size={ms(12, 0.4)} color={C.textSecondary} />
                  </Pressable>
                </>
              )}
            </View>
          </View>
        )}

        {/* ② 박자기호 N/4 + 재생 + 저장 + BPM 스테퍼 행 */}
        {!editorCollapsed && (
          <View style={[styles.inlineRepeatPanel, { borderBottomColor: C.overlay08, flexDirection: "row", alignItems: "center", gap: 6 }]}>
            {/* N/4 박자기호 */}
            <Pressable
              onLongPress={() => {
                if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                onDenominatorCycle?.();
              }}
              delayLongPress={500}
              disabled={isPlaying}
              hitSlop={8}
              style={{ flexDirection: "row", alignItems: "center", gap: 2, paddingVertical: 2 }}
            >
              <Text style={{ fontFamily: "SpaceGrotesk_700Bold", fontSize: ms(28, 0.4), color: isPlaying ? C.textTertiary : C.accent }}>
                {editingSubdivisionCount}
              </Text>
              <Text style={{ fontFamily: "SpaceGrotesk_700Bold", fontSize: ms(28, 0.4), color: C.textTertiary }}>
                /
              </Text>
              <Text style={{ fontFamily: "SpaceGrotesk_700Bold", fontSize: ms(28, 0.4), color: isPlaying ? C.textTertiary : C.accent }}>
                {beatDenominator}
              </Text>
            </Pressable>
            <View style={{ flex: 1 }} />
            {/* 재생 버튼 — 중앙 */}
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
              iconSize={ms(26, 0.4)}
              badgeIconSize={ms(10, 0.4)}
              t={t}
            />
            <View style={{ flex: 1 }} />
            {/* BPM 스테퍼 — N/4 동일 폰트 크기 */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, opacity: isPlaying ? 0.5 : 1 }} {...bpmSwipePan.panHandlers}>
              <Pressable
                onPress={() => { if (!isPlaying && !bpmHoldFired.current) { applyRepBpm(Math.max(20, (repBpm ?? bpm ?? 120) - 1)); } }}
                onPressIn={() => { if (!isPlaying) startBpmHold(-1); }}
                onPressOut={() => clearBpmTimers()}
                style={{ width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: C.overlay10 }}
              >
                <Ionicons name="remove" size={ms(13, 0.4)} color={C.accent} />
              </Pressable>
              <TextInput
                style={{ fontSize: ms(28, 0.4), fontFamily: "SpaceGrotesk_700Bold", width: 56, textAlign: "center", borderBottomWidth: 1.5, paddingVertical: 1, color: C.accent, borderBottomColor: C.accent }}
                value={String(repBpm ?? bpm ?? 120)}
                keyboardType="number-pad"
                editable={!isPlaying}
                onEndEditing={e => {
                  if (isPlaying) return;
                  const v = parseInt(e.nativeEvent.text, 10);
                  if (!isNaN(v) && v >= 20 && v <= 300) { applyRepBpm(v); }
                  else if (!e.nativeEvent.text) { setRepBpm(null); commitRepeat(repType, repCount, repMin, repSec, null); }
                }}
                selectTextOnFocus
              />
              <Pressable
                onPress={() => { if (!isPlaying && !bpmHoldFired.current) { applyRepBpm(Math.min(300, (repBpm ?? bpm ?? 120) + 1)); } }}
                onPressIn={() => { if (!isPlaying) startBpmHold(1); }}
                onPressOut={() => clearBpmTimers()}
                style={{ width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: C.overlay10 }}
              >
                <Ionicons name="add" size={ms(13, 0.4)} color={C.accent} />
              </Pressable>
            </View>
          </View>
        )}

        {/* 레이어 내용 */}
        {!editorCollapsed && (activeLayerTab === 0 ? (
          <View style={styles.mainSubdivisionSlot}>
            {subdivisionBarElement ?? (
              <View style={{ alignItems: "center", paddingVertical: 12 }}>
                <Text style={{ color: C.textTertiary, fontSize: FontSize.caption }}>
                  {editingBeat !== null ? t("barModeView", "editingBeat").replace("{{n}}", String(editingBeat + 1)) : t("barModeView", "tapToEdit")}
                </Text>
              </View>
            )}
            {/* 사운드셋 선택 */}
            {(() => {
              const builtinOpts = SOUND_SET_OPTIONS.map(o => ({ key: o.key, label: t("barModeView", o.labelKey), isCustom: false }));
              const customOpts = Object.entries(customSoundSets).map(([k, cfg]) => ({ key: k, label: cfg.name, isCustom: true }));
              const allOpts = [...builtinOpts, ...customOpts];
              const idx = allOpts.findIndex(o => o.key === soundSet);
              const safeIdx = idx >= 0 ? idx : 0;
              const cur = allOpts[safeIdx];
              return (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 }}>
                  <Pressable
                    onPress={() => { const prev = allOpts[(safeIdx - 1 + allOpts.length) % allOpts.length]; onSoundSetChange?.(prev.key); onPreviewSoundSet?.(prev.key); }}
                    hitSlop={10}
                    style={{ padding: 4 }}
                  >
                    <Ionicons name="chevron-back" size={ms(14, 0.4)} color={C.textSecondary} />
                  </Pressable>
                  <Pressable
                    style={{ flex: 1, alignItems: "center", paddingVertical: 5, paddingHorizontal: 8, backgroundColor: C.overlay08, borderRadius: 8 }}
                    onPress={() => {
                      if (soundSetDidLongPressRef.current) { soundSetDidLongPressRef.current = false; return; }
                      setSoundSetPickerTarget({ isLayer: false, layerNum: 0 });
                    }}
                    onLongPress={() => {
                      if (!cur?.isCustom) return;
                      soundSetDidLongPressRef.current = true;
                      openCustomEditor(cur.key);
                      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    }}
                    onPressOut={() => { soundSetDidLongPressRef.current = false; }}
                    delayLongPress={400}
                  >
                    <Text style={{ color: C.accent, fontSize: FontSize.micro, fontFamily: "SpaceGrotesk_600SemiBold" }}>
                      {cur?.label ?? soundSet}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => { const next = allOpts[(safeIdx + 1) % allOpts.length]; onSoundSetChange?.(next.key); onPreviewSoundSet?.(next.key); }}
                    hitSlop={10}
                    style={{ padding: 4 }}
                  >
                    <Ionicons name="chevron-forward" size={ms(14, 0.4)} color={C.textSecondary} />
                  </Pressable>
                </View>
              );
            })()}
          </View>
        ) : (() => {
          const layer = editingLayers[activeLayerTab - 1];
          const layerIdx = activeLayerTab - 1;
          const layerNum = layerIdx + 1;
          return (
            <View style={styles.mainSubdivisionSlot}>
              <SubdivisionBar
                pattern={layer?.subdivisions && layer.subdivisions.length > 0 ? layer.subdivisions : [layer?.beatType ?? "normal"]}
                onPatternChange={p => {
                  const isDefaultSingle = p.length === 1 && p[0] === (layer?.beatType ?? "normal");
                  updateLayerSubdivisions(layerIdx, isDefaultSingle ? null : p);
                }}
                onDragStart={() => {}}
                onDragMove={() => {}}
                onDragEnd={() => {}}
                onReset={() => updateLayerSubdivisions(layerIdx, null)}
                isPlaying={isPlaying}
              />
              {/* 레이어 사운드셋 선택 */}
              {(() => {
                const builtinOpts = [
                  { key: "", label: t("barModeView", "soundSetDefault"), isCustom: false },
                  ...SOUND_SET_OPTIONS.map(o => ({ key: o.key, label: t("barModeView", o.labelKey), isCustom: false })),
                ];
                const customOpts = Object.entries(customSoundSets).map(([k, cfg]) => ({ key: k, label: cfg.name, isCustom: true }));
                const allOpts = [...builtinOpts, ...customOpts];
                const curKey = layerSoundSets[layerNum] ?? "";
                const idx = allOpts.findIndex(o => o.key === curKey);
                const safeIdx = idx >= 0 ? idx : 0;
                const cur = allOpts[safeIdx];
                return (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 }}>
                    <Pressable
                      onPress={() => {
                        const prev = allOpts[(safeIdx - 1 + allOpts.length) % allOpts.length];
                        const updated = { ...layerSoundSets };
                        if (!prev.key) { delete updated[layerNum]; } else { updated[layerNum] = prev.key as string; }
                        onLayerSoundSetsChange?.(updated);
                        if (prev.key) onPreviewSoundSet?.(prev.key);
                      }}
                      hitSlop={10} style={{ padding: 4 }}
                    >
                      <Ionicons name="chevron-back" size={ms(14, 0.4)} color={C.textSecondary} />
                    </Pressable>
                    <Pressable
                      style={{ flex: 1, alignItems: "center", paddingVertical: 5, paddingHorizontal: 8, backgroundColor: C.overlay08, borderRadius: 8 }}
                      onPress={() => {
                        if (soundSetDidLongPressRef.current) { soundSetDidLongPressRef.current = false; return; }
                        setSoundSetPickerTarget({ isLayer: true, layerNum });
                      }}
                      onLongPress={() => {
                        if (!cur?.isCustom) return;
                        soundSetDidLongPressRef.current = true;
                        openCustomEditor(cur.key);
                        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      }}
                      onPressOut={() => { soundSetDidLongPressRef.current = false; }}
                      delayLongPress={400}
                    >
                      <Text style={{ color: cur?.isCustom ? C.accent : C.textSecondary, fontSize: FontSize.micro, fontFamily: "SpaceGrotesk_600SemiBold" }}>
                        {cur?.label ?? t("barModeView", "soundSetDefault")}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        const next = allOpts[(safeIdx + 1) % allOpts.length];
                        const updated = { ...layerSoundSets };
                        if (!next.key) { delete updated[layerNum]; } else { updated[layerNum] = next.key as string; }
                        onLayerSoundSetsChange?.(updated);
                        if (next.key) onPreviewSoundSet?.(next.key);
                      }}
                      hitSlop={10} style={{ padding: 4 }}
                    >
                      <Ionicons name="chevron-forward" size={ms(14, 0.4)} color={C.textSecondary} />
                    </Pressable>
                  </View>
                );
              })()}
            </View>
          );
        })())}

      </Animated.View>



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
              <Pressable onPress={deleteBlock} hitSlop={8} style={{ marginRight: 6 }}>
                <Ionicons name="trash-outline" size={ms(15, 0.4)} color="#e05c5c" />
              </Pressable>
              <Pressable onPress={() => setBlockEditingIdx(null)} hitSlop={8}>
                <Ionicons name="close" size={ms(14, 0.4)} color={C.textSecondary} />
              </Pressable>
              <Pressable onPress={saveBlock} hitSlop={8} style={{ marginLeft: 10 }}>
                <Ionicons name="checkmark" size={ms(16, 0.4)} color={C.accent} />
              </Pressable>
            </View>

            {/* 반복 유형 탭 + 값 스테퍼 한 줄 */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
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
              <View style={{ flex: 1 }} />
              {blockRepType === "count" ? (
                <>
                  <Pressable onPress={() => setBlockRepCount(v => Math.max(1, v - 1))} style={[styles.stepBtn, { backgroundColor: C.overlay10 }]}>
                    <Ionicons name="remove" size={ms(15, 0.4)} color={C.textSecondary} />
                  </Pressable>
                  <Text style={{ color: C.text, fontSize: 18, fontFamily: "SpaceGrotesk_700Bold", minWidth: 36, textAlign: "center" }}>×{blockRepCount}</Text>
                  <Pressable onPress={() => setBlockRepCount(v => Math.min(99, v + 1))} style={[styles.stepBtn, { backgroundColor: C.overlay10 }]}>
                    <Ionicons name="add" size={ms(15, 0.4)} color={C.textSecondary} />
                  </Pressable>
                </>
              ) : (
                <>
                  <Pressable onPress={() => setBlockRepMin(v => Math.max(0, v - 1))} style={[styles.stepBtn, { backgroundColor: C.overlay10 }]}>
                    <Ionicons name="remove" size={ms(13, 0.4)} color={C.textSecondary} />
                  </Pressable>
                  <Text style={{ color: C.text, fontSize: 15, fontFamily: "SpaceGrotesk_700Bold", minWidth: 26, textAlign: "center" }}>{blockRepMin}{t("barModeView", "minuteSuffix")}</Text>
                  <Pressable onPress={() => setBlockRepMin(v => Math.min(59, v + 1))} style={[styles.stepBtn, { backgroundColor: C.overlay10 }]}>
                    <Ionicons name="add" size={ms(13, 0.4)} color={C.textSecondary} />
                  </Pressable>
                  <Pressable onPress={() => setBlockRepSec(v => Math.max(0, v - 5))} style={[styles.stepBtn, { backgroundColor: C.overlay10 }]}>
                    <Ionicons name="remove" size={ms(13, 0.4)} color={C.textSecondary} />
                  </Pressable>
                  <Text style={{ color: C.text, fontSize: 15, fontFamily: "SpaceGrotesk_700Bold", minWidth: 26, textAlign: "center" }}>{blockRepSec}{t("barModeView", "secondSuffix")}</Text>
                  <Pressable onPress={() => setBlockRepSec(v => Math.min(59, v + 5))} style={[styles.stepBtn, { backgroundColor: C.overlay10 }]}>
                    <Ionicons name="add" size={ms(13, 0.4)} color={C.textSecondary} />
                  </Pressable>
                </>
              )}
            </View>

            {/* BPM 오버라이드 */}
            <View style={{ marginBottom: 12 }}>
              <Text style={{ color: C.textSecondary, fontSize: FontSize.caption, marginBottom: 6 }}>{t("barModeView", "repBpmOverride")}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, justifyContent: "center" }}>
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

      {/* 사운드셋 피커 모달 */}
      <Modal
        visible={soundSetPickerTarget !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSoundSetPickerTarget(null)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }}
          onPress={() => setSoundSetPickerTarget(null)}
        >
          <View style={{ flex: 1 }} />
          <Pressable onPress={() => {}} style={{ backgroundColor: C.backgroundSecondary, borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: insets.bottom + 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.overlay06 }}>
              <Text style={{ color: C.text, fontSize: FontSize.body, fontFamily: "SpaceGrotesk_600SemiBold" }}>
                {soundSetPickerTarget?.isLayer ? t("barModeView", "soundSetPickerLayer") : t("barModeView", "soundSetPickerTitle")}
              </Text>
              <Pressable onPress={() => setSoundSetPickerTarget(null)} hitSlop={8}>
                <Ionicons name="close" size={ms(20, 0.4)} color={C.textSecondary} />
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 360 }}>
              {soundSetPickerTarget?.isLayer && (
                <Pressable
                  style={{ flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.overlay06 }}
                  onPress={() => {
                    if (!soundSetPickerTarget) return;
                    const updated = { ...layerSoundSets };
                    delete updated[soundSetPickerTarget.layerNum];
                    onLayerSoundSetsChange?.(updated);
                    setSoundSetPickerTarget(null);
                    if (Platform.OS !== "web") Haptics.selectionAsync();
                  }}
                >
                  <View style={{ width: 24, alignItems: "center" }}>
                    {(layerSoundSets[soundSetPickerTarget?.layerNum ?? -1] ?? "") === "" && (
                      <Ionicons name="checkmark" size={ms(16, 0.4)} color={C.accent} />
                    )}
                  </View>
                  <Text style={{ color: C.textSecondary, fontSize: FontSize.small, flex: 1, marginLeft: 8 }}>
                    {t("barModeView", "soundSetDefault")}
                  </Text>
                </Pressable>
              )}
              {[
                ...SOUND_SET_OPTIONS.map(o => ({ key: o.key, label: t("barModeView", o.labelKey), isCustom: false })),
                ...Object.entries(customSoundSets).map(([k, cfg]) => ({ key: k, label: cfg.name, isCustom: true })),
              ].map(opt => {
                const isSelected = soundSetPickerTarget?.isLayer
                  ? (layerSoundSets[soundSetPickerTarget.layerNum] ?? "") === opt.key
                  : soundSet === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    style={{ flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.overlay06 }}
                    onPress={() => {
                      if (!soundSetPickerTarget) return;
                      if (soundSetPickerTarget.isLayer) {
                        const updated = { ...layerSoundSets, [soundSetPickerTarget.layerNum]: opt.key };
                        onLayerSoundSetsChange?.(updated);
                      } else {
                        onSoundSetChange?.(opt.key);
                      }
                      setSoundSetPickerTarget(null);
                      if (Platform.OS !== "web") Haptics.selectionAsync();
                    }}
                  >
                    <View style={{ width: 24, alignItems: "center" }}>
                      {isSelected && <Ionicons name="checkmark" size={ms(16, 0.4)} color={C.accent} />}
                    </View>
                    <Text style={{ color: opt.isCustom ? C.accent : C.text, fontSize: FontSize.small, flex: 1, marginLeft: 8 }}>
                      {opt.label}
                    </Text>
                    {opt.isCustom && <Ionicons name="color-wand-outline" size={ms(12, 0.4)} color={C.textTertiary} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <CustomSoundSetEditor
        visible={editingCustomSlot !== null}
        slot={editingCustomSlot}
        customSoundSets={customSoundSets}
        onCustomSoundSetsChange={(configs) => {
          onCustomSoundSetsChange?.(configs);
        }}
        currentSoundSet={soundSet}
        onSoundSetChange={onSoundSetChange}
        onClose={() => setEditingCustomSlot(null)}
      />
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
  },
  drawerToggleBtn: {
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
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  barRowNumber: {
    width: 22,
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
    marginHorizontal: 2,
    height: 28,
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
  barCellOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingHorizontal: 4,
    backgroundColor: "rgba(0,0,0,0.30)",
  },
  barCenterInfo: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    flexShrink: 1,
  },
  barAddRightBtn: {
    width: 22,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "stretch",
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
  inlineRepeatPanel: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  swipeHintRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  swipeHintText: {
    fontSize: FontSize.micro,
    fontFamily: "SpaceGrotesk_500Medium",
    opacity: 0.6,
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
    width: 54,
    height: 54,
    borderRadius: 27,
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
    maxWidth: IS_TABLET ? 520 : 320,
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
