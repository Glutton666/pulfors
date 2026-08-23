/**
 * BarModeView — shell that composes bar-mode sub-components.
 *
 * Layout (top → bottom):
 *   1. BarSymbolDrawer (symbol palette + time display)
 *   2. Bar list (ScrollView of SwipeableBarRows)
 *   3. BarEditorPanel (repeat / layer / BPM editor + sound-set picker)
 *   4. BarVoltaModal / BarBlockEditModal (overlays)
 */
import React, {
  useState, useRef, useCallback, useMemo, useEffect,
} from "react";
import { View, Text, ScrollView, Platform, Animated } from "react-native";
import * as Haptics from "expo-haptics";

import { HintBanner } from "@/components/HintTooltip";
import type { BeatType, BarRepeat, LoopBlock } from "@/components/beat-indicator.types";
import type { ProgressInfo } from "@/lib/metronome-engine";
import type { CustomSoundSetConfig } from "@/lib/storage";
import { useLanguage } from "@/contexts/LanguageContext";
import { useScale } from "@/lib/scale";
import { FontSize, Spacing } from "@/constants/tokens";

import {
  BAR_ROW_H,
  SYMBOL_INFO,
  getBarSampleCells,
  nextJumpPairId,
  type BarModeColors,
  type SymbolType,
} from "./bar-mode/BarModeTypes";
import { SwipeableBarRow } from "./bar-mode/SwipeableBarRow";
import { BarSymbolDrawer } from "./bar-mode/BarSymbolDrawer";
import { BarEditorPanel } from "./bar-mode/BarEditorPanel";
import { BarVoltaModal } from "./bar-mode/BarVoltaModal";
import { BarBlockEditModal } from "./bar-mode/BarBlockEditModal";

// ─── Props ───────────────────────────────────────────────────────────────────

export interface BarModeViewProps {
  beatsPerMeasure: number;
  onBeatsChange: (beats: number) => void;
  beatTypes: BeatType[];
  onBeatTypeChange: (index: number, type: BeatType) => void;
  beatSubdivisions: Record<string, BeatType[]>;
  onBeatSubdivisionChange: (beatIndex: number, pattern: BeatType[] | null) => void;
  barRepeats: Record<number, BarRepeat>;
  onBarRepeatChange: (beat: number, repeat: BarRepeat | null) => void;
  onBarMeterChange?: (
    beat: number,
    meter: { numerator: number; denominator: 2 | 4 | 8 },
  ) => void;
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
  /** Called when user edits the base bar-mode BPM (not a per-bar override). */
  onBpmChange?: (bpm: number) => void;
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

// ─── Component ───────────────────────────────────────────────────────────────

export function BarModeView({
  beatsPerMeasure, beatTypes, beatSubdivisions,
  barRepeats, onBarRepeatChange, onBarMeterChange, loopBlocks, onLoopBlocksChange,
  isPlaying, isPreparing, currentBeat, onTogglePlay, barLoopMode,
  onBarLoopModeChange, blockPlayMode, onBlockPlayModeChange, progressInfo,
  barStartBeat, onBarStartBeatSelect, onAddBar, onDeleteBar,
  subdivisionBarElement, onBarQuickSave, onBarScrollOffset,
  bpm, onBpmChange, beatDenominator = 4, onDenominatorCycle,
  soundSet = "classic", onSoundSetChange, layerSoundSets = {} as Record<number, string>,
  onLayerSoundSetsChange, onPreviewSoundSet,
  customSoundSets = {} as Record<string, CustomSoundSetConfig>, onCustomSoundSetsChange,
  colors: C, ms,
  cellOverlayOpacity, rowHeight,
  noteSamples, onNoteRecordRequest, onReorderBar, onInsertBarAfter,
}: BarModeViewProps) {
  const { t } = useLanguage();
  const S = useScale();

  // ─── Drag-reorder state ────────────────────────────────────────────────────

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

  // ─── Symbol / drawer state ────────────────────────────────────────────────

  const [symbolDrawerOpen, setSymbolDrawerOpen] = useState(false);
  const [placingSymbol, setPlacingSymbol] = useState<SymbolType | null>(null);
  const [blockSelectFirst, setBlockSelectFirst] = useState<number | null>(null);

  const drawerAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(drawerAnim, {
      toValue: symbolDrawerOpen ? 1 : 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [symbolDrawerOpen]);

  // ─── Volta modal state ─────────────────────────────────────────────────────

  const [voltaBeat, setVoltaBeat] = useState<number | null>(null);
  const [voltaVal, setVoltaVal] = useState(2);

  // ─── Block edit modal state ────────────────────────────────────────────────

  const [blockEditingIdx, setBlockEditingIdx] = useState<number | null>(null);

  // ─── Scroll state ─────────────────────────────────────────────────────────

  const barScrollRef = useRef<ScrollView>(null);
  const barScrollYRef = useRef(0);
  const [barContainerHeight, setBarContainerHeight] = useState(0);

  // ─── Elapsed time ─────────────────────────────────────────────────────────

  const [barElapsedSec, setBarElapsedSec] = useState(0);
  const barStartTimeRef = useRef(0);

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

  // ─── Auto-scroll while playing ────────────────────────────────────────────

  useEffect(() => {
    if (!isPlaying) {
      barScrollRef.current?.scrollTo({ y: 0, animated: false });
      onBarScrollOffset?.(0);
      return;
    }
    if (barContainerHeight <= 0 || currentBeat < 0) return;
    const rh = rowHeight ?? BAR_ROW_H;
    const beatTop = currentBeat * rh;
    const scrollTarget = Math.max(0, beatTop - barContainerHeight / 2 + rh / 2);
    barScrollRef.current?.scrollTo({ y: scrollTarget, animated: true });
  }, [isPlaying, currentBeat, barContainerHeight]);

  // ─── Memos ────────────────────────────────────────────────────────────────

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
      const barSec = 60 / effectiveBpm;
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

  // ─── Handlers ────────────────────────────────────────────────────────────

  const handleBarRowPress = useCallback((beat: number) => {
    if (isPlaying) return;
    if (placingSymbol) {
      handleSymbolPlacementRef.current(beat);
      return;
    }
    // If the row is a block boundary, open block edit modal
    const blockIdx = loopBlocks.findIndex(b => b.layerOf === undefined && (b.startBeat === beat || b.endBeat === beat));
    if (blockIdx !== -1) {
      setBlockEditingIdx(blockIdx);
      return;
    }
    if (barStartBeat === beat) {
      onBarStartBeatSelect(null);
    } else {
      onBarStartBeatSelect(beat);
    }
  }, [isPlaying, placingSymbol, loopBlocks, barStartBeat, onBarStartBeatSelect]);

  const handleBarRowLongPress = useCallback((beat: number) => {
    if (isPlaying) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onNoteRecordRequest?.(beat, 0);
  }, [isPlaying, onNoteRecordRequest]);

  const handleSwipeLeft = useCallback((beat: number) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onDeleteBar?.(beat);
  }, [onDeleteBar]);

  const handleSwipeRight = useCallback((beat: number) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onInsertBarAfter?.(beat);
  }, [onInsertBarAfter]);

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

  // Symbol placement (uses ref to avoid stale closure in handleBarRowPress)
  const handleSymbolPlacementRef = useRef<(beat: number) => void>(() => {});

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
      setBlockEditingIdx(newIdx);
      return;
    }

    if (placingSymbol === "jump_from") {
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

  handleSymbolPlacementRef.current = handleSymbolPlacement;

  const saveVolta = useCallback(() => {
    if (voltaBeat === null) return;
    const existing = barRepeats[voltaBeat] ?? { type: "count" as const, value: 1 };
    onBarRepeatChange(voltaBeat, { ...existing, voltaMax: voltaVal });
    setVoltaBeat(null);
  }, [voltaBeat, voltaVal, barRepeats, onBarRepeatChange]);

  // ─── Render ───────────────────────────────────────────────────────────────

  const beats = Array.from({ length: beatsPerMeasure }, (_, i) => i);

  return (
    <View style={{ flex: 1, backgroundColor: C.background }} testID="beat-indicator-bar-mode">

      <HintBanner
        hintKey="bar_mode_intro"
        message={t("barModeView", "hintLongPress")}
        icon="hand-left-outline"
      />

      {/* ── Symbol drawer ── */}
      <BarSymbolDrawer
        open={symbolDrawerOpen}
        onToggle={() => setSymbolDrawerOpen(v => !v)}
        placingSymbol={placingSymbol}
        blockSelectFirst={blockSelectFirst}
        selectedBarApplied={selectedBarApplied}
        barStartBeat={barStartBeat}
        isPlaying={isPlaying}
        totalDurationDisplay={totalDurationDisplay}
        barElapsedSec={barElapsedSec}
        beatsPerMeasure={beatsPerMeasure}
        onSymbolPress={(sym) => { setPlacingSymbol(sym); setBlockSelectFirst(null); }}
        onRemoveSymbol={handleRemoveSymbol}
        onCancelPlacing={() => { setPlacingSymbol(null); setBlockSelectFirst(null); }}
        colors={C}
        ms={ms}
        t={t}
        drawerAnim={drawerAnim}
      />

      {/* ── Bar list ── */}
      <ScrollView
        ref={barScrollRef}
        style={[{ flex: 1 }, S.isTablet && { paddingHorizontal: S.ms(16, 0.5) }]}
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
            if (isPlaying && progressInfo && progressInfo.blockIndex >= 0) {
              const activeEndEntry = blockEntries.find(
                e => e.isEnd && e.blockIdx === progressInfo.blockIndex,
              );
              if (activeEndEntry) {
                const lb = loopBlocks[activeEndEntry.blockIdx];
                if (lb?.type === "count" && lb.value > 1) {
                  const remaining = progressInfo.blockRepeatTotal - progressInfo.blockRepeatCurrent;
                  return remaining > 0 ? `×${remaining}` : null;
                }
              }
            }
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
              bpm={rep?.bpm ?? bpm ?? 120}
              meterNumerator={rep?.meterNumerator ?? (subs.length || 1)}
              meterDenominator={rep?.meterDenominator ?? beatDenominator}
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
              sampleBadgeLabel={t("barModeView", "sampleBadge")}
              sampleBadgeAccessibilityLabel={t("barModeView", "sampleBadgeAccessibility").replace("{{n}}", String(beat + 1))}
              sampleCells={getBarSampleCells(
                beat,
                beatSubdivisions[String(beat)]?.length || 1,
                noteSamples,
              )}
            />
          );
        })}

        {/* Swipe hint */}
        {barStartBeat === null && !isPlaying && (
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", paddingTop: 12, paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs }}>
            <Text style={{ fontSize: FontSize.micro, fontFamily: "SpaceGrotesk_500Medium", opacity: 0.6, color: C.textTertiary }}>{t("barModeView", "swipeHintCopy")}</Text>
            <Text style={{ color: C.textTertiary, fontSize: FontSize.micro, opacity: 0.3, marginHorizontal: 8 }}>|</Text>
            <Text style={{ fontSize: FontSize.micro, fontFamily: "SpaceGrotesk_500Medium", opacity: 0.6, color: C.textTertiary }}>{t("barModeView", "swipeHintEdit")}</Text>
            <Text style={{ color: C.textTertiary, fontSize: FontSize.micro, opacity: 0.3, marginHorizontal: 8 }}>|</Text>
            <Text style={{ fontSize: FontSize.micro, fontFamily: "SpaceGrotesk_500Medium", opacity: 0.6, color: C.textTertiary }}>{t("barModeView", "swipeHintAdd")}</Text>
          </View>
        )}
        <View style={{ height: 8 }} />
      </ScrollView>

      {/* ── Editor panel ── */}
      <BarEditorPanel
        editingBeat={barStartBeat}
        barRepeats={barRepeats}
        isPlaying={isPlaying}
        beatsPerMeasure={beatsPerMeasure}
        beatSubdivisions={beatSubdivisions}
        onBarRepeatChange={onBarRepeatChange}
        onBarMeterChange={onBarMeterChange}
        onDeleteBar={onDeleteBar}
        onBarStartBeatSelect={onBarStartBeatSelect}
        onAddBar={onAddBar ?? (() => {})}
        onBarQuickSave={onBarQuickSave}
        bpm={bpm}
        onBpmChange={onBpmChange}
        beatDenominator={beatDenominator}
        onDenominatorCycle={onDenominatorCycle}
        isPreparing={isPreparing}
        onTogglePlay={onTogglePlay}
        barLoopMode={barLoopMode}
        onBarLoopModeChange={onBarLoopModeChange}
        blockPlayMode={blockPlayMode}
        onBlockPlayModeChange={onBlockPlayModeChange}
        loopBlocks={loopBlocks}
        onLoopBlocksChange={onLoopBlocksChange}
        soundSet={soundSet}
        onSoundSetChange={onSoundSetChange}
        layerSoundSets={layerSoundSets}
        onLayerSoundSetsChange={onLayerSoundSetsChange}
        onPreviewSoundSet={onPreviewSoundSet}
        customSoundSets={customSoundSets}
        onCustomSoundSetsChange={onCustomSoundSetsChange}
        subdivisionBarElement={subdivisionBarElement}
        colors={C}
        ms={ms}
        t={t}
        isDragging={draggingBeat !== null}
      />

      {/* ── Volta modal ── */}
      <BarVoltaModal
        beat={voltaBeat}
        voltaVal={voltaVal}
        onChangeVal={setVoltaVal}
        onSave={saveVolta}
        colors={C}
        ms={ms}
        t={t}
      />

      {/* ── Block edit modal ── */}
      <BarBlockEditModal
        visible={blockEditingIdx !== null}
        blockIndex={blockEditingIdx}
        loopBlocks={loopBlocks}
        customSoundSets={customSoundSets}
        onSave={(idx, updated) => {
          onLoopBlocksChange(loopBlocks.map((b, i) => i === idx ? updated : b));
          setBlockEditingIdx(null);
        }}
        onDelete={(idx) => {
          onLoopBlocksChange(loopBlocks.filter((_, i) => i !== idx));
          setBlockEditingIdx(null);
        }}
        onClose={() => setBlockEditingIdx(null)}
        colors={C}
        ms={ms}
        t={t}
      />
    </View>
  );
}
