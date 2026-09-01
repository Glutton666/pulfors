/**
 * BarEditorPanel — the editor section rendered below the bar list.
 *
 * Owns:
 *   - repType / repCount / repMin / repSec / repBpm (repeat editing state + refs)
 *   - activeLayerTab, editorCollapsed
 *   - draftLayers (used when no bar is selected)
 *   - saveFlashVisible
 *   - soundSetPickerTarget, soundSetDidLongPressRef, editingCustomSlot
 *   - BPM / sec hold timers
 *   - editorSwipePan (swipe-up to add bar)
 * Renders:
 *   - Layer tab row + repeat panel + time-sig / play / BPM row + layer content
 *   - Sound-set picker modal + CustomSoundSetEditor
 */
import React, { useState, useRef, useCallback, useMemo, useEffect } from "react";
import {
  View, Text, Pressable, PanResponder, Animated, TextInput, Platform,
  Modal, ScrollView, StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CustomSoundSetEditor } from "@/components/CustomSoundSetEditor";
import { SubdivisionBar } from "@/components/SubdivisionBar";
import { BarPlayButton } from "@/components/BarPlayButton";
import { FontSize, Spacing, Radius } from "@/constants/tokens";
import type { BeatType, BarRepeat, BarLayer } from "@/components/beat-indicator.types";
import type { LoopBlock } from "@/components/beat-indicator.types";
import type { CustomSoundSetConfig } from "@/lib/storage";
import type { TranslationFn } from "@/lib/i18n";
import {
  adjustBarDuration,
  clampBarBpm,
  clampBarRepeatCount,
  formatBarDuration,
  splitBarDuration,
  SOUND_SET_OPTIONS,
  BAR_REPEAT_COUNT_HOLD_DELAY_MS,
  getBarRepeatCountHoldIntervalMs,
  type BarModeColors,
  type BarDurationPart,
} from "./BarModeTypes";

// ─── Props ───────────────────────────────────────────────────────────────────

export interface BarEditorPanelProps {
  // Bar selection context
  editingBeat: number | null;
  barRepeats: Record<number, BarRepeat>;
  isPlaying: boolean;
  beatsPerMeasure: number;
  beatSubdivisions: Record<string, BeatType[]>;
  // Callbacks to parent
  onBarRepeatChange: (beat: number, repeat: BarRepeat | null) => void;
  onBarMeterChange?: (
    beat: number,
    meter: { numerator: number; denominator: 2 | 4 | 8 },
  ) => void;
  onDeleteBar?: (beatIndex: number) => void;
  onBarStartBeatSelect: (beat: number | null) => void;
  onAddBar: (draftRepeat?: BarRepeat) => void;
  onBarQuickSave?: () => Promise<boolean> | void;
  onOpenSettings?: () => void;
  // Playback controls
  bpm?: number;
  /** Retained for parent compatibility; bar editing only changes a selected bar. */
  onBpmChange?: (bpm: number) => void;
  beatDenominator?: 2 | 4 | 8;
  onDenominatorCycle?: () => void;
  isPreparing: boolean;
  onTogglePlay: () => void;
  onRandomPlayRequest?: () => void;
  barLoopMode: "loop" | "once";
  onBarLoopModeChange: (mode: "loop" | "once") => void;
  blockPlayMode: "sequential" | "loop" | "random";
  onBlockPlayModeChange: (mode: "sequential" | "loop" | "random") => void;
  // Layer + sound
  loopBlocks: LoopBlock[];
  onLoopBlocksChange: (blocks: LoopBlock[]) => void;
  soundSet?: string;
  onSoundSetChange?: (ss: string) => void;
  layerSoundSets?: Record<number, string>;
  onLayerSoundSetsChange?: (val: Record<number, string>) => void;
  onPreviewSoundSet?: (key: string) => void;
  customSoundSets?: Record<string, CustomSoundSetConfig>;
  onCustomSoundSetsChange?: (configs: Record<string, CustomSoundSetConfig>) => void;
  subdivisionBarElement?: React.ReactNode;
  // Style / theme
  colors: BarModeColors;
  ms: (size: number, factor?: number) => number;
  t: TranslationFn;
  // Drag guard: swipe-up to add bar is blocked while a row is being dragged
  isDragging: boolean;
}

const MAX_LAYERS = 6;

export function BarEditorPanel({
  editingBeat, barRepeats, isPlaying, beatsPerMeasure, beatSubdivisions,
  onBarRepeatChange, onBarMeterChange, onDeleteBar, onBarStartBeatSelect, onAddBar, onBarQuickSave, onOpenSettings,
  bpm, onBpmChange, beatDenominator = 4, onDenominatorCycle, isPreparing, onTogglePlay,
  onRandomPlayRequest, barLoopMode, onBarLoopModeChange, blockPlayMode, onBlockPlayModeChange,
  loopBlocks, onLoopBlocksChange,
  soundSet = "classic", onSoundSetChange, layerSoundSets = {}, onLayerSoundSetsChange,
  onPreviewSoundSet, customSoundSets = {}, onCustomSoundSetsChange,
  subdivisionBarElement, colors: C, ms, t, isDragging,
}: BarEditorPanelProps) {
  const insets = useSafeAreaInsets();

  // ─── Local state ─────────────────────────────────────────────────────────

  const [activeLayerTab, setActiveLayerTab] = useState(0);
  const [editorCollapsed, setEditorCollapsed] = useState(false);
  const [saveFlashVisible, setSaveFlashVisible] = useState(false);
  const saveFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [repType, setRepType] = useState<"count" | "duration">("count");
  const [repCount, setRepCount] = useState(1);
  const [repMin, setRepMin] = useState(0);
  const [repSec, setRepSec] = useState(30);
  const [repBpm, setRepBpm] = useState<number | null>(null);
  const [durationPart, setDurationPart] = useState<BarDurationPart>("seconds");

  // Refs to avoid stale closures in hold timers
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
  const durationPartRef = useRef<BarDurationPart>("seconds");
  useEffect(() => { durationPartRef.current = durationPart; }, [durationPart]);
  const bpmPropRef = useRef(bpm);
  useEffect(() => { bpmPropRef.current = bpm; }, [bpm]);

  const [draftLayers, setDraftLayers] = useState<BarLayer[]>([]);

  // Sound set picker
  const [soundSetPickerTarget, setSoundSetPickerTarget] = useState<{ isLayer: boolean; layerNum: number } | null>(null);
  const [editingCustomSlot, setEditingCustomSlot] = useState<string | null>(null);
  const soundSetDidLongPressRef = useRef(false);

  // BPM hold timers
  const bpmPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bpmPressInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const bpmHoldFired = useRef(false);
  const clearBpmTimers = useCallback(() => {
    if (bpmPressTimer.current) { clearTimeout(bpmPressTimer.current); bpmPressTimer.current = null; }
    if (bpmPressInterval.current) { clearInterval(bpmPressInterval.current); bpmPressInterval.current = null; }
    bpmHoldFired.current = false;
  }, []);

  // Repeat-count hold timers. The recursive timeout lets each interval use
  // the current hold duration, so the control accelerates smoothly instead
  // of running at one fixed repeat rate.
  const countPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countRepeatTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countHoldStartedAt = useRef(0);
  const countHoldFired = useRef(false);
  const clearCountTimers = useCallback(() => {
    if (countPressTimer.current) {
      clearTimeout(countPressTimer.current);
      countPressTimer.current = null;
    }
    if (countRepeatTimer.current) {
      clearTimeout(countRepeatTimer.current);
      countRepeatTimer.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveFlashTimer.current) clearTimeout(saveFlashTimer.current);
    };
  }, []);

  // ─── Derived ─────────────────────────────────────────────────────────────

  const editingRepeat = editingBeat !== null ? barRepeats[editingBeat] : null;
  const editingSubdivisionCount = editingBeat !== null
    ? (beatSubdivisions[String(editingBeat)]?.length || 1)
    : 1;
  const editingLayers: BarLayer[] = editingBeat !== null
    ? (editingRepeat?.layers ?? [])
    : draftLayers;

  // ─── Sync repeat local state when selected bar changes ───────────────────

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    // A newly selected row should never appear uneditable because the previous
    // row's panel was collapsed.
    setEditorCollapsed(false);
    if (editingBeat === null) {
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
  }, [editingBeat, barRepeats]);

  const cycleSelectedBarDenominator = useCallback(() => {
    if (isPlaying || editingBeat === null) return;
    const current = barRepeats[editingBeat]?.meterDenominator ?? beatDenominator;
    const next: 2 | 4 | 8 = current === 4 ? 8 : current === 8 ? 2 : 4;
    onBarMeterChange?.(editingBeat, {
      numerator: 1,
      denominator: next,
    });
  }, [
    barRepeats,
    beatDenominator,
    editingBeat,
    editingSubdivisionCount,
    isPlaying,
    onBarMeterChange,
  ]);

  // ─── commitRepeat ─────────────────────────────────────────────────────────

  const commitRepeat = useCallback((
    type: "count" | "duration",
    count: number, min: number, sec: number, bpmOverride: number | null,
  ) => {
    if (isPlaying) return;
    const val = type === "count" ? count : min * 60 + sec;
    if (val <= 0) return;
    if (editingBeat === null) return;
    const rep: BarRepeat = { type, value: type === "count" ? Math.max(1, val) : Math.max(1, val) };
    if (bpmOverride !== null && bpmOverride > 0) rep.bpm = bpmOverride;
    const existing = barRepeats[editingBeat];
    if (existing) {
      if (existing.meterNumerator) rep.meterNumerator = existing.meterNumerator;
      if (existing.meterDenominator) rep.meterDenominator = existing.meterDenominator;
      if (existing.voltaMax) rep.voltaMax = existing.voltaMax;
      if (existing.isEnd) rep.isEnd = existing.isEnd;
      if (existing.jumpFromId) rep.jumpFromId = existing.jumpFromId;
      if (existing.jumpToId) rep.jumpToId = existing.jumpToId;
      if (existing.layers) rep.layers = existing.layers;
    }
    onBarRepeatChange(editingBeat, rep);
  }, [editingBeat, isPlaying, barRepeats, onBarRepeatChange]);

  const commitRepeatRef = useRef(commitRepeat);
  useEffect(() => { commitRepeatRef.current = commitRepeat; }, [commitRepeat]);
  const editingBeatRef = useRef(editingBeat);
  useEffect(() => { editingBeatRef.current = editingBeat; }, [editingBeat]);

  // ─── BPM helpers ─────────────────────────────────────────────────────────

  const onBpmChangeRef = useRef(onBpmChange);
  useEffect(() => { onBpmChangeRef.current = onBpmChange; }, [onBpmChange]);

  const applyRepBpm = useCallback((newBpm: number) => {
    if (editingBeatRef.current !== null) {
      // Per-bar override: update local repBpm state and commit to bar repeat
      setRepBpm(newBpm);
      commitRepeatRef.current(repTypeRef.current, repCountRef.current, repMinRef.current, repSecRef.current, newBpm);
    } else {
      // No selected bar: edit the bar-mode base BPM instead of disabling the control.
      onBpmChangeRef.current?.(newBpm);
    }
  }, []);

  const commitCount = useCallback((nextCount: number) => {
    const next = clampBarRepeatCount(nextCount);
    repCountRef.current = next;
    setRepCount(next);
    commitRepeatRef.current(repTypeRef.current, next, repMinRef.current, repSecRef.current, repBpmRef.current);
  }, []);

  const commitDuration = useCallback((minutes: number, seconds: number) => {
    const { minutes: nextMin, seconds: nextSec } = splitBarDuration(minutes * 60 + seconds);
    setRepMin(nextMin);
    setRepSec(nextSec);
    commitRepeatRef.current(repTypeRef.current, repCountRef.current, nextMin, nextSec, repBpmRef.current);
  }, []);

  const startBpmHold = useCallback((dir: 1 | -1) => {
    clearBpmTimers();
    bpmPressTimer.current = setTimeout(() => {
      bpmHoldFired.current = true;
      const step = () => {
        const cur = repBpmRef.current ?? bpmPropRef.current ?? 120;
        let next: number;
        if (dir === -1) {
          const t2 = Math.floor(cur / 10) * 10;
          next = Math.max(20, cur === t2 ? cur - 10 : t2);
        } else {
          const t2 = Math.ceil(cur / 10) * 10;
          next = Math.min(300, cur === t2 ? cur + 10 : t2);
        }
        applyRepBpm(next);
      };
      step();
      bpmPressInterval.current = setInterval(step, 350);
    }, 500);
  }, [clearBpmTimers, applyRepBpm]);

  const scheduleCountHoldStep = useCallback((dir: 1 | -1) => {
    if (isPlaying) {
      clearCountTimers();
      return;
    }

    const current = repCountRef.current;
    const next = clampBarRepeatCount(current + dir);
    if (next === current) {
      countRepeatTimer.current = null;
      return;
    }

    commitCount(next);
    const elapsed = Date.now() - countHoldStartedAt.current;
    countRepeatTimer.current = setTimeout(
      () => scheduleCountHoldStep(dir),
      getBarRepeatCountHoldIntervalMs(elapsed),
    );
  }, [clearCountTimers, commitCount, isPlaying]);

  const startCountHold = useCallback((dir: 1 | -1) => {
    clearCountTimers();
    countHoldFired.current = false;
    countPressTimer.current = setTimeout(() => {
      countPressTimer.current = null;
      countHoldFired.current = true;
      countHoldStartedAt.current = Date.now();
      scheduleCountHoldStep(dir);
    }, BAR_REPEAT_COUNT_HOLD_DELAY_MS);
  }, [clearCountTimers, scheduleCountHoldStep]);

  useEffect(() => {
    if (isPlaying) clearCountTimers();
  }, [clearCountTimers, isPlaying]);

  useEffect(() => clearCountTimers, [clearCountTimers]);

  const bpmSwipePan = useMemo(() => {
    let startBpm = 0;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 8 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5,
      onPanResponderGrant: () => { startBpm = repBpmRef.current ?? bpmPropRef.current ?? 120; },
      onPanResponderMove: (_, gs) => {
        if (isPlaying) return;
        // 오른쪽 스와이프 = 증가, 왼쪽 스와이프 = 감소로 반전 (2026-08-25 요청).
        const newBpm = clampBarBpm(startBpm + gs.dx / 3);
        applyRepBpm(newBpm);
      },
      onPanResponderRelease: () => {},
    });
  }, [applyRepBpm, isPlaying]);

  const countSwipePan = useMemo(() => {
    let startCount = 1;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) => !isPlaying && Math.abs(gs.dx) > 8 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5,
      onPanResponderGrant: () => { startCount = repCountRef.current; },
      onPanResponderMove: (_, gs) => {
        if (isPlaying) return;
        commitCount(startCount - Math.round(gs.dx / 24));
      },
      onPanResponderRelease: () => {},
    });
  }, [commitCount, isPlaying]);

  const durationSwipePan = useMemo(() => {
    let startTotal = 0;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) => !isPlaying && Math.abs(gs.dx) > 8 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5,
      onPanResponderGrant: () => {
        startTotal = repMinRef.current * 60 + repSecRef.current;
      },
      onPanResponderMove: (_, gs) => {
        if (isPlaying) return;
        const total = adjustBarDuration(
          startTotal,
          durationPartRef.current,
          -Math.round(gs.dx / 24),
        );
        commitDuration(Math.floor(total / 60), total % 60);
      },
      onPanResponderRelease: () => {},
    });
  }, [commitDuration, isPlaying]);

  // ─── clearRepeat ─────────────────────────────────────────────────────────

  const clearRepeat = useCallback(() => {
    if (isPlaying) return;
    if (editingBeat === null) {
      setRepType("count"); setRepCount(1); setRepMin(0); setRepSec(30); setRepBpm(null);
      return;
    }
    const existing = barRepeats[editingBeat];
    if (!existing) return;
    const hasOtherFields =
      existing.bpm ||
      existing.meterNumerator ||
      existing.meterDenominator ||
      existing.voltaMax ||
      existing.isEnd ||
      existing.jumpFromId ||
      existing.jumpToId ||
      existing.layers;
    if (hasOtherFields) {
      const rep: BarRepeat = { type: "count", value: 1 };
      if (existing.bpm) rep.bpm = existing.bpm;
      if (existing.meterNumerator) rep.meterNumerator = existing.meterNumerator;
      if (existing.meterDenominator) rep.meterDenominator = existing.meterDenominator;
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

  // ─── Layer callbacks ──────────────────────────────────────────────────────

  const addLayer = useCallback(() => {
    if (editingBeat === null) {
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

  // ─── Save ────────────────────────────────────────────────────────────────

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

  // ─── Add bar via swipe-up gesture ────────────────────────────────────────

  const handleAddBarFromPanel = useCallback(() => {
    if (isPlaying) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const val = repType === "count" ? repCount : repMin * 60 + repSec;
    const draftRepeat: BarRepeat | undefined =
      (repType === "count" && repCount === 1 && !repBpm && draftLayers.length === 0)
        ? undefined
        : { type: repType, value: Math.max(1, val), ...(repBpm ? { bpm: repBpm } : {}), ...(draftLayers.length > 0 ? { layers: draftLayers.map(l => ({ ...l })) } : {}) };
    onAddBar(draftRepeat);
  }, [isPlaying, onAddBar, repType, repCount, repMin, repSec, repBpm, draftLayers]);

  const editorSwipePan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_e, g) =>
      !isPlaying && !isDragging && g.dy < -15 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
    onPanResponderMove: () => {},
    onPanResponderRelease: (_e, g) => {
      if (g.dy < -50) handleAddBarFromPanel();
    },
    onPanResponderTerminate: () => {},
  }), [isPlaying, isDragging, handleAddBarFromPanel]);

  // ─── Custom editor / sound set helpers ───────────────────────────────────

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

  // ─── Render ───────────────────────────────────────────────────────────────

  const editorSwipeAnim = useRef(new Animated.Value(0)).current;
  const randomPlayShakeAnim = useRef(new Animated.Value(0)).current;
  const [displayMinutes, displaySeconds] = formatBarDuration(repMin * 60 + repSec).split(":");
  const handleRandomPlayRequest = useCallback(() => {
    randomPlayShakeAnim.stopAnimation();
    Animated.sequence([
      Animated.timing(randomPlayShakeAnim, { toValue: -3, duration: 45, useNativeDriver: true }),
      Animated.timing(randomPlayShakeAnim, { toValue: 3, duration: 90, useNativeDriver: true }),
      Animated.timing(randomPlayShakeAnim, { toValue: 0, duration: 45, useNativeDriver: true }),
    ]).start();
    onRandomPlayRequest?.();
  }, [onRandomPlayRequest, randomPlayShakeAnim]);

  return (
    <>
      <Animated.View
        style={[styles.editorSection, { borderTopColor: C.overlay08, transform: [{ translateY: editorSwipeAnim }, { translateX: randomPlayShakeAnim }] }]}
        {...editorSwipePan.panHandlers}
      >
        {/* Layer tab row */}
        <View style={[styles.layerTabRow, { borderBottomColor: C.overlay06 }]}>
          <Pressable
            onPress={() => setActiveLayerTab(0)}
            style={[styles.layerTab, { borderBottomWidth: activeLayerTab === 0 ? 2 : 0, borderBottomColor: C.accent }]}
          >
            <Text style={{ color: activeLayerTab === 0 ? C.accent : C.textTertiary, fontSize: FontSize.micro, fontFamily: "SpaceGrotesk_600SemiBold" }}>
              {t("barModeView", "mainLayer")}
            </Text>
          </Pressable>
          {editingLayers.map((_, li) => (
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
          {onOpenSettings && (
            <Pressable
              onPress={onOpenSettings}
              hitSlop={10}
              testID="open-bar-settings"
              accessibilityRole="button"
              accessibilityLabel={t("settings", "title")}
              style={{ paddingHorizontal: 8, paddingVertical: 4 }}
            >
              <Ionicons name="settings-outline" size={ms(13, 0.4)} color={C.textSecondary} />
            </Pressable>
          )}
          <Pressable onPress={() => setEditorCollapsed(v => !v)} hitSlop={10} style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
            <Ionicons name={editorCollapsed ? "chevron-up" : "chevron-down"} size={ms(13, 0.4)} color={C.textTertiary + "99"} />
          </Pressable>
        </View>

        {/* ① Repeat type toggle + count/duration stepper */}
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
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: repType === "count" ? 4 : 6 }}
              {...(repType === "count" ? countSwipePan.panHandlers : durationSwipePan.panHandlers)}
            >
              {repType === "count" ? (
                <>
                  <Pressable
                    disabled={isPlaying}
                    onPress={() => {
                      const wasHeld = countHoldFired.current;
                      countHoldFired.current = false;
                      if (!isPlaying && !wasHeld) commitCount(repCount - 1);
                    }}
                    onPressIn={() => { if (!isPlaying) startCountHold(-1); }}
                    onPressOut={clearCountTimers}
                    style={styles.stepBtn}
                    testID="bar-count-minus"
                  >
                    <Ionicons name="remove" size={ms(13, 0.4)} color={C.textSecondary} />
                  </Pressable>
                  <Text
                    style={{ color: C.text, fontSize: 16, fontFamily: "SpaceGrotesk_700Bold", minWidth: 32, textAlign: "center" }}
                    testID="bar-count-value"
                  >
                    ×{repCount}
                  </Text>
                  <Pressable
                    disabled={isPlaying}
                    onPress={() => {
                      const wasHeld = countHoldFired.current;
                      countHoldFired.current = false;
                      if (!isPlaying && !wasHeld) commitCount(repCount + 1);
                    }}
                    onPressIn={() => { if (!isPlaying) startCountHold(1); }}
                    onPressOut={clearCountTimers}
                    style={styles.stepBtn}
                    testID="bar-count-plus"
                  >
                    <Ionicons name="add" size={ms(13, 0.4)} color={C.textSecondary} />
                  </Pressable>
                </>
              ) : (
                <>
                  <Pressable
                    onPress={() => {
                      if (!isPlaying) {
                        const total = adjustBarDuration(repMin * 60 + repSec, durationPart, -1);
                        commitDuration(Math.floor(total / 60), total % 60);
                      }
                    }}
                    style={[styles.stepBtn, styles.stepBtnCompact]}
                    testID="bar-duration-minus"
                  >
                    <Ionicons name="remove" size={ms(11, 0.4)} color={C.textSecondary} />
                  </Pressable>
                  <Pressable
                    onPress={() => !isPlaying && setDurationPart("minutes")}
                    style={[
                      styles.durationPart,
                      durationPart === "minutes" && { borderBottomColor: C.accent },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={t("barModeView", "minuteSuffix")}
                    testID="bar-duration-minutes"
                  >
                    <Text style={{ color: durationPart === "minutes" ? C.accent : C.text, fontSize: 15, fontFamily: "SpaceGrotesk_700Bold" }}>
                      {displayMinutes}
                    </Text>
                  </Pressable>
                  <Text style={{ color: C.textTertiary, fontSize: 15, fontFamily: "SpaceGrotesk_700Bold" }}>:</Text>
                  <Pressable
                    onPress={() => !isPlaying && setDurationPart("seconds")}
                    style={[
                      styles.durationPart,
                      durationPart === "seconds" && { borderBottomColor: C.accent },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={t("barModeView", "secondSuffix")}
                    testID="bar-duration-seconds"
                  >
                    <Text style={{ color: durationPart === "seconds" ? C.accent : C.text, fontSize: 15, fontFamily: "SpaceGrotesk_700Bold" }}>
                      {displaySeconds}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      if (!isPlaying) {
                        const total = adjustBarDuration(repMin * 60 + repSec, durationPart, 1);
                        commitDuration(Math.floor(total / 60), total % 60);
                      }
                    }}
                    style={[styles.stepBtn, styles.stepBtnCompact]}
                    testID="bar-duration-plus"
                  >
                    <Ionicons name="add" size={ms(11, 0.4)} color={C.textSecondary} />
                  </Pressable>
                </>
              )}
            </View>
          </View>
        )}

        {/* ② Time sig + play + BPM row */}
        {!editorCollapsed && (
          <View style={[styles.inlineRepeatPanel, { borderBottomColor: C.overlay08, flexDirection: "row", alignItems: "center", paddingHorizontal: Spacing.md, overflow: "visible" }]}>
            {/* Left: time signature */}
            <View style={{ flex: 1, alignItems: "center" }}>
              <Pressable
                onLongPress={() => {
                  if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                  if (editingBeat !== null && onBarMeterChange) {
                    cycleSelectedBarDenominator();
                  } else {
                    onDenominatorCycle?.();
                  }
                }}
                delayLongPress={500}
                disabled={isPlaying}
                hitSlop={8}
                style={{ flexDirection: "row", alignItems: "center", gap: 2, paddingVertical: 2 }}
              >
                <Text style={{ fontFamily: "SpaceGrotesk_700Bold", fontSize: ms(36, 0.4), color: isPlaying ? C.textTertiary : C.accent }}>
                  {editingSubdivisionCount}
                </Text>
                <Text style={{ fontFamily: "SpaceGrotesk_700Bold", fontSize: ms(36, 0.4), color: C.textTertiary }}>/</Text>
                <Text style={{ fontFamily: "SpaceGrotesk_700Bold", fontSize: ms(36, 0.4), color: isPlaying ? C.textTertiary : C.accent }}>
                  {editingRepeat?.meterDenominator ?? beatDenominator}
                </Text>
              </Pressable>
            </View>

            {/* Centre: play button */}
            <View style={{ marginTop: -34, zIndex: 10 }}>
              <BarPlayButton
                isPlaying={isPlaying}
                isPreparing={isPreparing}
                barLoopMode={barLoopMode}
                onTogglePlay={onTogglePlay}
                onRandomPlayRequest={handleRandomPlayRequest}
                onBarLoopModeChange={onBarLoopModeChange}
                blockPlayMode={blockPlayMode}
                onBlockPlayModeChange={onBlockPlayModeChange}
                baseStyle={[styles.playBtn, { backgroundColor: C.backgroundSecondary }]}
                sizeOverride={{ width: 76, height: 76, borderRadius: 38 }}
                accentColor={C.accent}
                dangerColor={C.danger}
                backgroundColor={C.background}
                iconSize={ms(34, 0.4)}
                badgeIconSize={ms(13, 0.4)}
                t={t}
              />
            </View>

            {/* Right: BPM stepper */}
              <View style={{ flex: 1, alignItems: "flex-end" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, opacity: isPlaying ? 0.5 : 1 }} {...bpmSwipePan.panHandlers}>
                <Pressable
                  disabled={isPlaying}
                  onPress={() => { if (!isPlaying && !bpmHoldFired.current) { applyRepBpm(Math.max(20, (repBpm ?? bpm ?? 120) - 1)); } }}
                  onPressIn={() => { if (!isPlaying) startBpmHold(-1); }}
                  onPressOut={() => clearBpmTimers()}
                  style={styles.stepBtn}
                  testID="bar-bpm-minus"
                >
                  <Ionicons name="remove" size={ms(13, 0.4)} color={C.accent} />
                </Pressable>
                <TextInput
                  style={{ fontSize: ms(28, 0.4), fontFamily: "SpaceGrotesk_700Bold", width: ms(56, 0.4), textAlign: "center", borderBottomWidth: 1.5, paddingVertical: 1, color: C.accent, borderBottomColor: C.accent }}
                  value={String(repBpm ?? bpm ?? 120)}
                  keyboardType="number-pad"
                  editable={!isPlaying}
                  onEndEditing={e => {
                    if (isPlaying) return;
                    const v = parseInt(e.nativeEvent.text, 10);
                    if (!isNaN(v) && v >= 20 && v <= 300) { applyRepBpm(v); }
                    else if (!e.nativeEvent.text && editingBeat !== null) {
                      setRepBpm(null);
                      commitRepeat(repType, repCount, repMin, repSec, null);
                    }
                  }}
                  selectTextOnFocus
                  testID="bar-bpm-value"
                />
                <Pressable
                  disabled={isPlaying}
                  onPress={() => { if (!isPlaying && !bpmHoldFired.current) { applyRepBpm(Math.min(300, (repBpm ?? bpm ?? 120) + 1)); } }}
                  onPressIn={() => { if (!isPlaying) startBpmHold(1); }}
                  onPressOut={() => clearBpmTimers()}
                  style={styles.stepBtn}
                  testID="bar-bpm-plus"
                >
                  <Ionicons name="add" size={ms(13, 0.4)} color={C.accent} />
                </Pressable>
              </View>
            </View>
          </View>
        )}

        {/* Layer content */}
        {!editorCollapsed && (activeLayerTab === 0 ? (
          <View style={styles.mainSubdivisionSlot}>
            {subdivisionBarElement ?? (
              <View style={{ alignItems: "center", paddingVertical: 12 }}>
                <Text style={{ color: C.textTertiary, fontSize: FontSize.caption }}>
                  {editingBeat !== null ? t("barModeView", "editingBeat").replace("{{n}}", String(editingBeat + 1)) : t("barModeView", "tapToEdit")}
                </Text>
              </View>
            )}
            {/* Sound set selector for main layer */}
            {(() => {
              const builtinOpts = SOUND_SET_OPTIONS.map(o => ({ key: o.key, label: t("barModeView", o.labelKey), isCustom: false }));
              const customOpts = Object.entries(customSoundSets).map(([k, cfg]) => ({ key: k, label: cfg.name, isCustom: true }));
              const allOpts = [...builtinOpts, ...customOpts];
              const idx = allOpts.findIndex(o => o.key === soundSet);
              const safeIdx = idx >= 0 ? idx : 0;
              const cur = allOpts[safeIdx];
              return (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 }}>
                  <Pressable onPress={() => { const prev = allOpts[(safeIdx - 1 + allOpts.length) % allOpts.length]; onSoundSetChange?.(prev.key); onPreviewSoundSet?.(prev.key); }} hitSlop={10} style={{ padding: 4 }}>
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
                    <Text style={{ color: C.accent, fontSize: FontSize.micro, fontFamily: "SpaceGrotesk_600SemiBold" }}>{cur?.label ?? soundSet}</Text>
                  </Pressable>
                  <Pressable onPress={() => { const next = allOpts[(safeIdx + 1) % allOpts.length]; onSoundSetChange?.(next.key); onPreviewSoundSet?.(next.key); }} hitSlop={10} style={{ padding: 4 }}>
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
              {/* Layer sound set selector */}
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

      {/* Sound set picker modal */}
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
        onCustomSoundSetsChange={(configs) => { onCustomSoundSetsChange?.(configs); }}
        currentSoundSet={soundSet}
        onSoundSetChange={onSoundSetChange}
        onClose={() => setEditingCustomSlot(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  editorSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingBottom: Spacing.xs,
    overflow: "visible",
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
  mainSubdivisionSlot: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  playBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
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
  stepBtnCompact: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
    durationPart: {
      minWidth: 24,
      paddingHorizontal: 2,
      paddingVertical: 2,
      alignItems: "center",
      justifyContent: "center",
      borderBottomWidth: 2,
      borderBottomColor: "transparent",
    },
});
