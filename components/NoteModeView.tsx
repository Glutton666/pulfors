import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Platform,
  Image,
  PanResponder,
  useWindowDimensions,
} from "react-native";
import { confirmDestructive } from "@/lib/confirm";
import { AnimatedModal } from "@/components/AnimatedModal";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { Spacing, Radius } from "@/constants/tokens";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import type { PracticeEntry, ControlPadMapping } from "@/lib/storage";
import { CONTROL_PAD_SLOT_COUNT, createEmptyControlPadMapping } from "@/lib/storage";
import type { BeatType } from "@/lib/metronome-engine";
import { useScale } from "@/lib/scale";
import type { ScaleValues } from "@/lib/scale";
import { HintBanner } from "@/components/HintTooltip";
import { loadScore } from "@/lib/score-storage";
import type { ScoreDocument } from "@/lib/score-types";
import { ScoreRenderer } from "@/components/ScoreRenderer";

interface NoteModeViewProps {
  queue: PracticeEntry[];
  barEntries: PracticeEntry[];
  playMode: "once" | "loop" | "random";
  currentIndex: number;
  isPlaying: boolean;
  /** 현재 재생 중인 엔트리의 완료된 마디 수 (0-based) */
  playingBarIdx?: number;
  onAddToQueue: (entry: PracticeEntry) => void;
  onRemoveFromQueue: (index: number) => void;
  onReorderQueue: (fromIndex: number, toIndex: number) => void;
  onInsertNext: (entry: PracticeEntry) => void;
  onPlayModeChange: (mode: "once" | "loop" | "random") => void;
  onTogglePlay: () => void;
  onManualNext?: () => void;
  onManualNextImmediate?: () => void;
  onSave: () => Promise<boolean>;
  onReset: () => void;
  onExitNoteMode: () => void;
  onQueueItemImageChange?: (index: number, imageUri: string | undefined) => void;
  padMapping?: ControlPadMapping;
  onPadMappingChange?: (mapping: ControlPadMapping) => void;
  quickAddList?: PracticeEntry[];
  onQuickAddListChange?: (list: PracticeEntry[]) => void;
}

const BEAT_COLORS: Record<BeatType, string> = {
  accent: "#D4A846",
  normal: "#8B949E",
  mute: "#30363D",
  strong: "#F0883E",
};

function BeatDots({ beatTypes, size = 6 }: { beatTypes: BeatType[]; size?: number }) {
  const { colors: C } = useTheme();
  const S = useScale();
  const styles = useMemo(() => make_styles(C, S), [C, S]);
  return (
    <View style={{ flexDirection: "row", gap: S.ms(2, 0.3) }}>
      {beatTypes.slice(0, 12).map((bt, i) => (
        <View
          key={i}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: BEAT_COLORS[bt] || C.textSecondary,
          }}
        />
      ))}
      {beatTypes.length > 12 && (
        <Text style={{ fontSize: S.ms(8, 0.3), color: C.textTertiary }}>+{beatTypes.length - 12}</Text>
      )}
    </View>
  );
}

function MiniScorePreview({
  scoreId,
  currentMeasureIdx,
  previewUnit = "measure",
  phraseSize = 4,
  width = 52,
  height = 40,
}: {
  scoreId: string;
  currentMeasureIdx?: number;
  previewUnit?: "measure" | "phrase";
  phraseSize?: number;
  width?: number;
  height?: number;
}) {
  const { colors: C } = useTheme();
  const [scoreDoc, setScoreDoc] = useState<ScoreDocument | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadScore(scoreId).then((doc) => {
      if (!cancelled) {
        setScoreDoc(doc);
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [scoreId]);

  if (loading) {
    return (
      <View style={{ width, height, justifyContent: "center", alignItems: "center" }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.textTertiary }} />
      </View>
    );
  }

  if (!scoreDoc) {
    return (
      <View style={{ width, height, justifyContent: "center", alignItems: "center" }}>
        <Ionicons name="document-outline" size={14} color={C.textTertiary} />
      </View>
    );
  }

  // 악구 단위: 현재 마디가 속한 악구의 첫 마디를 강조
  const effectiveMeasureIdx =
    currentMeasureIdx === undefined
      ? undefined
      : previewUnit === "phrase"
        ? Math.floor(currentMeasureIdx / Math.max(1, phraseSize)) * Math.max(1, phraseSize)
        : currentMeasureIdx;

  const renderWidth = width * 3;
  const scale = width / renderWidth;
  const shiftX = -(renderWidth * (1 - scale)) / 2;
  const shiftY = -(height * 3 * (1 - scale)) / 2;
  return (
    <View style={{ width, height, overflow: "hidden", borderRadius: 2 }}>
      <View
        style={{
          width: renderWidth,
          transform: [
            { translateX: shiftX },
            { translateY: shiftY },
            { scale },
          ],
        }}
      >
        <ScoreRenderer
          doc={scoreDoc}
          containerWidth={renderWidth}
          playheadMeasureIdx={effectiveMeasureIdx}
          showPlayhead={false}
          showPartNames={false}
        />
      </View>
    </View>
  );
}

function QueueItem({
  entry,
  index,
  isCurrent,
  isFirst,
  isLast,
  accentColor,
  onRemove,
  onMoveUp,
  onMoveDown,
  onImageChange,
  currentMeasureIdx,
  previewUnit,
  phraseSize,
}: {
  entry: PracticeEntry;
  index: number;
  isCurrent: boolean;
  isFirst: boolean;
  isLast: boolean;
  accentColor: string;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onImageChange?: (imageUri: string | undefined) => void;
  currentMeasureIdx?: number;
  previewUnit?: "measure" | "phrase";
  phraseSize?: number;
}) {
  const { colors: C } = useTheme();
  const S = useScale();
  const styles = useMemo(() => make_styles(C, S), [C, S]);
  const { t } = useLanguage();

  const handlePickImage = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.7,
    });
    if (!result.canceled && result.assets?.[0]) {
      onImageChange?.(result.assets[0].uri);
    }
  }, [onImageChange]);

  return (
    <View style={[styles.queueItem, { borderColor: C.border, backgroundColor: C.surfaceLight }, isCurrent && { borderColor: accentColor, borderWidth: 1.5, backgroundColor: "rgba(212,168,70,0.08)" }]}>
      <View style={styles.reorderBtns}>
        <Pressable onPress={onMoveUp} hitSlop={8} disabled={isFirst} style={{ opacity: isFirst ? 0.25 : 1 }}>
          <Ionicons name="chevron-up" size={S.ms(14, 0.4)} color={C.textTertiary} />
        </Pressable>
        <Pressable onPress={onMoveDown} hitSlop={8} disabled={isLast} style={{ opacity: isLast ? 0.25 : 1 }}>
          <Ionicons name="chevron-down" size={S.ms(14, 0.4)} color={C.textTertiary} />
        </Pressable>
      </View>
      <View style={styles.queueIndex}>
        {isCurrent ? (
          <Ionicons name="play" size={S.ms(12, 0.4)} color={accentColor} />
        ) : (
          <Text style={[styles.queueIndexText, isCurrent && { color: accentColor }]}>{index + 1}</Text>
        )}
      </View>
      <Pressable onPress={entry.scoreId ? undefined : handlePickImage} style={styles.queueThumb}>
        {entry.scoreId ? (
          <MiniScorePreview
            scoreId={entry.scoreId}
            currentMeasureIdx={isCurrent ? currentMeasureIdx : undefined}
            previewUnit={previewUnit}
            phraseSize={phraseSize}
            width={48}
            height={38}
          />
        ) : entry.imageUri ? (
          <Image source={{ uri: entry.imageUri }} style={styles.queueThumbImg} />
        ) : (
          <Ionicons name="image-outline" size={S.ms(16, 0.4)} color={C.textTertiary} />
        )}
      </Pressable>
      <View style={styles.queueItemInfo}>
        <Text style={[styles.queueItemLabel, isCurrent && { color: accentColor }]} numberOfLines={1}>
          {entry.label}
        </Text>
        <View style={styles.queueItemMeta}>
          <Text style={styles.queueItemBpm}>{entry.bpm} BPM</Text>
          <BeatDots beatTypes={entry.beatTypes} />
        </View>
      </View>
      {entry.imageUri && (
        <Pressable onPress={() => onImageChange?.(undefined)} hitSlop={8} style={{ padding: Spacing.xxs }}>
          <Ionicons name="image" size={S.ms(14, 0.4)} color={accentColor} />
        </Pressable>
      )}
      <Pressable onPress={onRemove} hitSlop={8} style={styles.removeBtn}>
        <Ionicons name="close-circle" size={S.ms(18, 0.4)} color={C.textTertiary} />
      </Pressable>
    </View>
  );
}

function SourceItem({
  entry,
  accentColor,
  onAdd,
  onInsertNext,
  isPlaying,
}: {
  entry: PracticeEntry;
  accentColor: string;
  onAdd: () => void;
  onInsertNext: () => void;
  isPlaying: boolean;
}) {
  const { colors: C } = useTheme();
  const S = useScale();
  const styles = useMemo(() => make_styles(C, S), [C, S]);
  const { t } = useLanguage();
  return (
    <View style={styles.sourceItem}>
      <Pressable
        style={({ pressed }) => [styles.sourceItemContent, pressed && { opacity: 0.6 }]}
        onPress={onAdd}
      >
        <View style={styles.sourceItemInfo}>
          <Text style={styles.sourceItemLabel} numberOfLines={1}>{entry.label}</Text>
          <View style={styles.sourceItemMeta}>
            <Text style={styles.sourceItemBpm}>{entry.bpm} BPM</Text>
            <Text style={styles.sourceItemBeats}>{entry.beatsPerMeasure} {t("practiceBook", "beatsUnit")}</Text>
          </View>
        </View>
        <Ionicons name="add-circle-outline" size={S.ms(22, 0.4)} color={accentColor} />
      </Pressable>
      {isPlaying && (
        <Pressable
          onPress={onInsertNext}
          hitSlop={8}
          style={[styles.insertNextBtn, { borderColor: accentColor }]}
        >
          <Ionicons name="arrow-forward" size={S.ms(12, 0.4)} color={accentColor} />
          <Text style={[styles.insertNextText, { color: accentColor }]}>{t("noteMode", "insertNext")}</Text>
        </Pressable>
      )}
    </View>
  );
}


function DragHandle({
  onDragStart,
  onDragMove,
  onDragEnd,
  color,
}: {
  onDragStart: () => void;
  onDragMove: (dy: number) => void;
  onDragEnd: (dy: number) => void;
  color: string;
}) {
  const onDragStartRef = useRef(onDragStart);
  const onDragMoveRef = useRef(onDragMove);
  const onDragEndRef = useRef(onDragEnd);
  useEffect(() => { onDragStartRef.current = onDragStart; }, [onDragStart]);
  useEffect(() => { onDragMoveRef.current = onDragMove; }, [onDragMove]);
  useEffect(() => { onDragEndRef.current = onDragEnd; }, [onDragEnd]);

  const panResponder = useRef(
    Platform.OS !== "web"
      ? PanResponder.create({
          onStartShouldSetPanResponder: () => true,
          onMoveShouldSetPanResponder: () => true,
          onPanResponderGrant: () => { onDragStartRef.current(); },
          onPanResponderMove: (_, gs) => { onDragMoveRef.current(gs.dy); },
          onPanResponderRelease: (_, gs) => { onDragEndRef.current(gs.dy); },
          onPanResponderTerminate: (_, gs) => { onDragEndRef.current(gs.dy); },
        })
      : null,
  ).current;

  const webHandlers =
    Platform.OS === "web"
      ? {
          onPointerDown: (e: any) => {
            e.preventDefault();
            const startY = e.clientY;
            onDragStartRef.current();
            const onMove = (me: PointerEvent) => {
              onDragMoveRef.current(me.clientY - startY);
            };
            const onUp = (me: PointerEvent) => {
              onDragEndRef.current(me.clientY - startY);
              window.removeEventListener("pointermove", onMove);
              window.removeEventListener("pointerup", onUp);
            };
            window.addEventListener("pointermove", onMove);
            window.addEventListener("pointerup", onUp);
          },
        }
      : {};

  return (
    <View
      style={[
        { padding: 6, justifyContent: "center", alignItems: "center" },
        Platform.OS === "web" ? ({ cursor: "grab", userSelect: "none" } as any) : {},
      ]}
      {...(panResponder?.panHandlers ?? {})}
      {...webHandlers}
    >
      <MaterialCommunityIcons name="drag-vertical" size={18} color={color} />
    </View>
  );
}

export function NoteModeView({
  queue,
  barEntries,
  playMode,
  currentIndex,
  isPlaying,
  playingBarIdx,
  onAddToQueue,
  onRemoveFromQueue,
  onReorderQueue,
  onInsertNext,
  onPlayModeChange,
  onTogglePlay,
  onManualNext,
  onManualNextImmediate,
  onSave,
  onReset,
  onExitNoteMode,
  onQueueItemImageChange,
  padMapping: padMappingProp,
  onPadMappingChange,
  quickAddList,
  onQuickAddListChange,
}: NoteModeViewProps) {
  const { colors: C } = useTheme();
  const S = useScale();
  const styles = useMemo(() => make_styles(C, S), [C, S]);
  const { t } = useLanguage();
  const { width: winW, height: winH } = useWindowDimensions();
  const isLandscape = winW > winH;
  const [saved, setSaved] = useState(false);

  const handleSaveWithFeedback = useCallback(async () => {
    const ok = await onSave();
    if (ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }
  }, [onSave]);
  const [sourceCollapsed, setSourceCollapsed] = useState(false);
  const [previewUnit, setPreviewUnit] = useState<"measure" | "phrase">("measure");
  const [phraseSize, setPhraseSize] = useState(4);
  const hasScoreItems = queue.some((e) => !!e.scoreId);
  const [padEnabled, setPadEnabled] = useState(false);
  const [assignSlot, setAssignSlot] = useState<number | null>(null);
  const [activePadTab, setActivePadTab] = useState<"pad" | "quick">("pad");
  const [quickAddExpanded, setQuickAddExpanded] = useState(true);
  const [quickAssignIdx, setQuickAssignIdx] = useState<number | null>(null);
  const [lastTriggeredSlot, setLastTriggeredSlot] = useState<number | null>(null);
  const [qaRearranging, setQaRearranging] = useState<{ fromIdx: number; toIdx: number } | null>(null);
  const qaItemLayouts = useRef<{ y: number; height: number }[]>([]);

  const calcQaDropIndex = useCallback((fromIdx: number, dy: number, listLen: number): number => {
    const layouts = qaItemLayouts.current;
    if (!layouts.length) return fromIdx;
    const fromLayout = layouts[fromIdx];
    if (!fromLayout) return fromIdx;
    const draggedCenterY = fromLayout.y + fromLayout.height / 2 + dy;
    let best = fromIdx;
    let bestDist = Infinity;
    for (let i = 0; i < listLen; i++) {
      const l = layouts[i];
      if (!l) continue;
      const centerY = l.y + l.height / 2;
      const dist = Math.abs(draggedCenterY - centerY);
      if (dist < bestDist) { bestDist = dist; best = i; }
    }
    return best;
  }, []);

  useEffect(() => {
    if (isPlaying) setSourceCollapsed(true);
    else setSourceCollapsed(false);
  }, [isPlaying]);

  const padMapping = useMemo<ControlPadMapping>(
    () => (padMappingProp && padMappingProp.length === CONTROL_PAD_SLOT_COUNT ? padMappingProp : createEmptyControlPadMapping()),
    [padMappingProp],
  );
  const padIdLookup = useMemo(() => {
    const map: Record<string, PracticeEntry> = {};
    for (const e of barEntries) map[e.id] = e;
    return map;
  }, [barEntries]);

  const updatePadSlot = useCallback((slot: number, entryId: string | null) => {
    if (!onPadMappingChange) return;
    if (slot < 0 || slot >= CONTROL_PAD_SLOT_COUNT) return;
    const next = [...padMapping];
    next[slot] = entryId;
    onPadMappingChange(next);
  }, [padMapping, onPadMappingChange]);

  const handlePadPress = useCallback((slot: number) => {
    const id = padMapping[slot];
    if (!isPlaying) {
      setAssignSlot(slot);
      return;
    }
    if (!padEnabled) return;
    if (!id) return;
    const entry = padIdLookup[id];
    if (!entry) return;
    onAddToQueue(entry);
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    setLastTriggeredSlot(slot);
  }, [padMapping, isPlaying, padEnabled, padIdLookup, onAddToQueue]);

  useEffect(() => {
    if (lastTriggeredSlot === null) return;
    const t = setTimeout(() => setLastTriggeredSlot(null), 350);
    return () => clearTimeout(t);
  }, [lastTriggeredSlot]);

  const renderPadGrid = (compact: boolean) => (
    <View style={styles.padGrid}>
      {Array.from({ length: CONTROL_PAD_SLOT_COUNT }).map((_, slot) => {
        const id = padMapping[slot];
        const entry = id ? padIdLookup[id] : null;
        const missing = !!id && !entry;
        const triggerable = isPlaying && padEnabled && !!entry;
        const dimmed = isPlaying && !padEnabled;
        const disabledWhilePlaying = isPlaying && (!padEnabled || !entry);
        const inactiveDuringPlay = isPlaying && padEnabled && !entry;
        return (
          <Pressable
            key={`pad-${slot}`}
            style={[
              styles.padCell,
              compact && styles.padCellCompact,
              { borderColor: C.border, backgroundColor: C.surface },
              !id && { borderStyle: "dashed" as const },
              missing && { borderColor: C.danger },
              triggerable && { borderColor: C.accent, backgroundColor: "rgba(212,168,70,0.08)" },
              triggerable && lastTriggeredSlot === slot && { borderColor: C.accent, backgroundColor: "rgba(212,168,70,0.28)" },
              dimmed && { opacity: 0.4 },
              inactiveDuringPlay && { opacity: 0.35 },
            ]}
            onPress={() => handlePadPress(slot)}
            disabled={disabledWhilePlaying}
          >
            {!id ? (
              <Ionicons name="add" size={compact ? 16 : 22} color={C.textTertiary} />
            ) : missing ? (
              <>
                <Ionicons name="help-circle-outline" size={compact ? 14 : 18} color={C.danger} />
                {!compact && (
                  <Text style={[styles.padCellMeta, { color: C.danger }]} numberOfLines={1}>
                    {t("noteMode", "padMissing")}
                  </Text>
                )}
              </>
            ) : (
              <>
                <Text style={[styles.padCellLabel, compact && { fontSize: S.ms(10, 0.3) }, { color: C.text }]} numberOfLines={1}>
                  {entry!.label}
                </Text>
                {!compact && (
                  <Text style={[styles.padCellMeta, { color: C.textTertiary }]} numberOfLines={1}>
                    {entry!.bpm} BPM
                  </Text>
                )}
              </>
            )}
            {!isPlaying && id && (
              <Pressable
                onPress={() => updatePadSlot(slot, null)}
                hitSlop={6}
                style={styles.padClearBtn}
              >
                <Ionicons name="close-circle" size={14} color={C.textTertiary} />
              </Pressable>
            )}
          </Pressable>
        );
      })}
    </View>
  );

  const renderControlPadHeader = (showToggle: boolean) => (
    <View style={[styles.sectionHeader, isLandscape && { marginBottom: S.ms(2, 0.3) }]}>
      <View style={{ flexDirection: "row", gap: 4 }}>
        <Pressable
          style={[styles.padTabBtn, { borderColor: activePadTab === "pad" ? C.accent : C.border, backgroundColor: activePadTab === "pad" ? C.accent + "22" : "transparent" }]}
          onPress={() => setActivePadTab("pad")}
        >
          <Text style={[styles.padTabText, { color: activePadTab === "pad" ? C.accent : C.textSecondary }]}>
            {t("noteMode", "controlPadTab")}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.padTabBtn, { borderColor: activePadTab === "quick" ? C.accent : C.border, backgroundColor: activePadTab === "quick" ? C.accent + "22" : "transparent" }]}
          onPress={() => setActivePadTab("quick")}
        >
          <Text style={[styles.padTabText, { color: activePadTab === "quick" ? C.accent : C.textSecondary }]}>
            {t("noteMode", "quickAdd")}
          </Text>
        </Pressable>
      </View>
      {activePadTab === "pad" && showToggle ? (
        <Pressable
          onPress={() => setPadEnabled(p => !p)}
          style={[styles.padToggle, { borderColor: padEnabled ? C.accent : C.border, backgroundColor: padEnabled ? C.accent + "22" : C.surface }]}
          hitSlop={6}
        >
          <Ionicons name={padEnabled ? "radio-button-on" : "radio-button-off"} size={S.ms(12, 0.3)} color={padEnabled ? C.accent : C.textTertiary} />
          <Text style={[styles.padToggleText, { color: padEnabled ? C.accent : C.textTertiary }]}>
            {t("noteMode", "controlPadEnable")}
          </Text>
        </Pressable>
      ) : activePadTab === "quick" ? (
        <Pressable
          onPress={() => setQuickAddExpanded(p => !p)}
          style={[styles.padToggle, { borderColor: quickAddExpanded ? C.accent : C.border, backgroundColor: quickAddExpanded ? C.accent + "22" : C.surface }]}
          hitSlop={6}
        >
          <Ionicons name={quickAddExpanded ? "eye-outline" : "eye-off-outline"} size={S.ms(12, 0.3)} color={quickAddExpanded ? C.accent : C.textTertiary} />
          <Text style={[styles.padToggleText, { color: quickAddExpanded ? C.accent : C.textTertiary }]}>
            {t("noteMode", "quickAddToggle")}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );

  const renderQuickAddSection = () => {
    const list = quickAddList || [];
    return (
      <View>
        {quickAddExpanded && (
          <>
            {list.length > 0 && (
              <Text style={[styles.padHint, { color: C.textTertiary }]}>
                {t("noteMode", "quickAddHint")}
                {Platform.OS === "web" ? `  ·  ${t("noteMode", "quickAddKeyHint")}` : ""}
              </Text>
            )}
            {list.length === 0 ? (
              <Text style={[styles.padHint, { color: C.textTertiary }]}>
                {t("noteMode", "quickAddEmpty")}
              </Text>
            ) : (
              list.map((entry, idx) => {
                const badge = idx < 9 ? idx + 1 : null;
                const isDragging = qaRearranging?.fromIdx === idx;
                const isDropTarget = qaRearranging !== null && qaRearranging.toIdx === idx && qaRearranging.fromIdx !== idx;
                return (
                  <View
                    key={`qa-${entry.id ?? idx}-${idx}`}
                    onLayout={(e) => {
                      qaItemLayouts.current[idx] = { y: e.nativeEvent.layout.y, height: e.nativeEvent.layout.height };
                    }}
                  >
                    {isDropTarget && (
                      <View style={[styles.qaDropIndicator, { backgroundColor: C.accent }]} />
                    )}
                    <Pressable
                      style={[
                        styles.quickAddItem,
                        {
                          borderColor: isDragging ? C.accent : C.border,
                          backgroundColor: C.surface,
                          opacity: isDragging ? 0.45 : isPlaying ? 1 : 0.6,
                        },
                      ]}
                      onPress={() => { if (isPlaying && !qaRearranging) onAddToQueue(entry); }}
                      onLongPress={() => { if (!qaRearranging) setQuickAssignIdx(idx); }}
                      delayLongPress={500}
                    >
                      {!isPlaying && (
                        <DragHandle
                          color={C.textTertiary}
                          onDragStart={() => setQaRearranging({ fromIdx: idx, toIdx: idx })}
                          onDragMove={(dy) => {
                            setQaRearranging((prev) =>
                              prev ? { ...prev, toIdx: calcQaDropIndex(prev.fromIdx, dy, list.length) } : null,
                            );
                          }}
                          onDragEnd={(dy) => {
                            const toIdx = calcQaDropIndex(idx, dy, list.length);
                            if (toIdx !== idx) {
                              const next = [...list];
                              const [moved] = next.splice(idx, 1);
                              next.splice(toIdx, 0, moved);
                              onQuickAddListChange?.(next);
                            }
                            setQaRearranging(null);
                          }}
                        />
                      )}
                      {badge !== null ? (
                        <View style={[styles.quickAddBadge, { backgroundColor: C.accent + "33", borderColor: C.accent + "66" }]}>
                          <Text style={[styles.quickAddBadgeText, { color: C.accent }]}>{badge}</Text>
                        </View>
                      ) : (
                        <View style={[styles.quickAddBadge, { backgroundColor: "transparent", borderColor: "transparent" }]} />
                      )}
                      {entry.imageUri ? (
                        <Image source={{ uri: entry.imageUri }} style={styles.quickAddThumb} />
                      ) : null}
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[styles.quickAddItemLabel, { color: C.text }]} numberOfLines={1}>{entry.label}</Text>
                        <Text style={[styles.quickAddItemMeta, { color: C.textTertiary }]}>{entry.bpm} BPM · {entry.beatsPerMeasure} {t("practiceBook", "beatsUnit")}</Text>
                      </View>
                      {!isPlaying && (
                        <Pressable
                          onPress={() => {
                            const next = [...list];
                            next.splice(idx, 1);
                            onQuickAddListChange?.(next);
                          }}
                          hitSlop={8}
                          style={{ padding: 4 }}
                        >
                          <Ionicons name="close-circle-outline" size={S.ms(16, 0.3)} color={C.textTertiary} />
                        </Pressable>
                      )}
                    </Pressable>
                  </View>
                );
              })
            )}
            <Pressable
              style={[styles.quickAddNewBtn, { borderColor: C.border }]}
              onPress={() => setQuickAssignIdx(-1)}
            >
              <Ionicons name="add" size={S.ms(14, 0.3)} color={C.textTertiary} />
              <Text style={[styles.quickAddNewText, { color: C.textTertiary }]}>{t("noteMode", "quickAddAssign")}</Text>
            </Pressable>
          </>
        )}
      </View>
    );
  };

  const renderQuickAssignModal = () => {
    if (quickAssignIdx === null) return null;
    const isAdd = quickAssignIdx === -1;
    const list = quickAddList || [];
    const currentEntry = !isAdd && quickAssignIdx >= 0 ? list[quickAssignIdx] : undefined;
    return (
      <AnimatedModal
        visible={true}
        transparent
        onRequestClose={() => setQuickAssignIdx(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setQuickAssignIdx(null)}>
          <Pressable style={[styles.modalSheet, { backgroundColor: C.surface, borderColor: C.border }]} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: C.text }]}>
                {isAdd ? t("noteMode", "quickAddAssign") : t("noteMode", "quickAddChange")}
              </Text>
              {!isAdd && (
                <Pressable
                  onPress={() => {
                    const next = [...list];
                    next.splice(quickAssignIdx!, 1);
                    onQuickAddListChange?.(next);
                    setQuickAssignIdx(null);
                  }}
                  style={[styles.modalClearBtn, { borderColor: C.danger }]}
                  hitSlop={8}
                >
                  <Text style={[styles.modalClearText, { color: C.danger }]}>{t("noteMode", "quickAddRemove")}</Text>
                </Pressable>
              )}
            </View>
            {barEntries.length === 0 ? (
              <Text style={[styles.padHint, { color: C.textTertiary, paddingVertical: S.ms(12, 0.3) }]}>
                {t("noteMode", "quickAddNoEntries")}
              </Text>
            ) : (
              <FlatList
                data={barEntries}
                keyExtractor={(item, i) => `qa-pick-${item.id ?? i}`}
                style={{ maxHeight: S.ms(300, 0.4) }}
                renderItem={({ item }) => {
                  const selected = !isAdd && currentEntry?.id === item.id;
                  return (
                    <Pressable
                      onPress={() => {
                        const next = [...list];
                        if (isAdd) {
                          next.push(item);
                        } else if (quickAssignIdx !== null && quickAssignIdx >= 0) {
                          next[quickAssignIdx] = item;
                        }
                        onQuickAddListChange?.(next);
                        setQuickAssignIdx(null);
                      }}
                      style={[styles.modalItem, { borderColor: selected ? C.accent : C.border, backgroundColor: selected ? C.accent + "22" : "transparent" }]}
                    >
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[styles.modalItemLabel, { color: C.text }]} numberOfLines={1}>{item.label}</Text>
                        <Text style={[styles.modalItemMeta, { color: C.textSecondary }]}>{item.bpm} BPM · {item.beatsPerMeasure}박</Text>
                      </View>
                      {selected && <Ionicons name="checkmark" size={S.ms(16, 0.3)} color={C.accent} />}
                    </Pressable>
                  );
                }}
              />
            )}
          </Pressable>
        </Pressable>
      </AnimatedModal>
    );
  };

  const renderControlPadSection = (compact: boolean) => (
    <View style={isLandscape ? { marginTop: S.ms(4, 0.3) } : { marginTop: S.ms(6, 0.3) }}>
      {renderControlPadHeader(isPlaying)}
      {activePadTab === "pad" ? (
        <>
          {isPlaying && padEnabled && (
            <Text style={[styles.padHint, { color: C.textTertiary }]}>
              {t("noteMode", "padPlayingHint")}
            </Text>
          )}
          {renderPadGrid(compact)}
        </>
      ) : (
        renderQuickAddSection()
      )}
    </View>
  );

  const renderAssignModal = () => (
    <AnimatedModal
      visible={assignSlot !== null}
      transparent
      onRequestClose={() => setAssignSlot(null)}
    >
      <Pressable style={styles.modalBackdrop} onPress={() => setAssignSlot(null)}>
        <Pressable
          style={[styles.modalSheet, { backgroundColor: C.surface, borderColor: C.border }]}
          onPress={() => {}}
        >
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: C.text }]}>
              {assignSlot !== null && padMapping[assignSlot]
                ? t("noteMode", "padReassign")
                : t("noteMode", "padAssign")}
            </Text>
            {assignSlot !== null && padMapping[assignSlot] ? (
              <Pressable
                onPress={() => {
                  if (assignSlot !== null) updatePadSlot(assignSlot, null);
                  setAssignSlot(null);
                }}
                style={[styles.modalClearBtn, { borderColor: C.danger }]}
              >
                <Text style={[styles.modalClearText, { color: C.danger }]}>
                  {t("noteMode", "padClear")}
                </Text>
              </Pressable>
            ) : null}
          </View>
          {barEntries.length === 0 ? (
            <Text style={[styles.padHint, { color: C.textTertiary, paddingVertical: 16 }]}>
              {t("noteMode", "padNoBarEntries")}
            </Text>
          ) : (
            <FlatList
              data={barEntries}
              keyExtractor={(item) => `assign-${item.id}`}
              style={{ maxHeight: 360 }}
              renderItem={({ item }) => {
                const selected = assignSlot !== null && padMapping[assignSlot] === item.id;
                return (
                  <Pressable
                    onPress={() => {
                      if (assignSlot !== null) updatePadSlot(assignSlot, item.id);
                      setAssignSlot(null);
                    }}
                    style={[
                      styles.modalItem,
                      { borderColor: C.border },
                      selected && { borderColor: C.accent, backgroundColor: C.accent + "22" },
                    ]}
                  >
                    <Text style={[styles.modalItemLabel, { color: C.text }]} numberOfLines={1}>
                      {item.label}
                    </Text>
                    <Text style={[styles.modalItemMeta, { color: C.textSecondary }]}>
                      {item.bpm} BPM · {item.beatsPerMeasure}
                    </Text>
                  </Pressable>
                );
              }}
            />
          )}
        </Pressable>
      </Pressable>
    </AnimatedModal>
  );

  const playModes: Array<"once" | "loop" | "random"> = ["once", "loop", "random"];
  const playModeLabels = {
    once: t("noteMode", "playModeOnce"),
    loop: t("noteMode", "playModeLoop"),
    random: t("noteMode", "playModeRandom"),
  };
  const playModeIcons: Record<string, string> = {
    once: "play-forward",
    loop: "repeat",
    random: "shuffle",
  };

  const handleReset = useCallback(() => {
    confirmDestructive(t("noteMode", "resetConfirm"), {
      title: t("noteMode", "reset"),
      confirmText: t("noteMode", "reset"),
      cancelText: t("main", "cancel"),
      onConfirm: onReset,
    });
  }, [onReset, t]);

  const currentEntry = queue[currentIndex];
  const prevEntry = currentIndex > 0 ? queue[currentIndex - 1] : (playMode === "loop" && queue.length > 0 ? queue[queue.length - 1] : null);
  const nextEntry = currentIndex < queue.length - 1 ? queue[currentIndex + 1] : (playMode === "loop" && queue.length > 0 ? queue[0] : null);

  const renderPlayingStrip = () => (
    <View style={[styles.playingStrip, isLandscape && { flexDirection: "column" as const }]}>
      <View style={[styles.stripItem, styles.stripItemDim]}>
        {prevEntry ? (
          <>
            {prevEntry.imageUri ? (
              <Image source={{ uri: prevEntry.imageUri }} style={styles.stripThumb} />
            ) : (
              <View style={[styles.stripThumb, styles.stripThumbEmpty]}>
                <Ionicons name="musical-note" size={S.ms(10, 0.4)} color={C.textTertiary} />
              </View>
            )}
            <Text style={styles.stripLabel} numberOfLines={1}>{prevEntry.label}</Text>
          </>
        ) : <View style={{ flex: 1 }} />}
      </View>
      <View style={[styles.stripItem, styles.stripItemActive, { borderColor: C.accent }]}>
        {currentEntry?.imageUri ? (
          <Image source={{ uri: currentEntry.imageUri }} style={styles.stripThumb} />
        ) : (
          <View style={[styles.stripThumb, styles.stripThumbEmpty, { borderColor: C.accent }]}>
            <Ionicons name="play" size={S.ms(10, 0.4)} color={C.accent} />
          </View>
        )}
        <Text style={[styles.stripLabel, { color: C.accent, fontFamily: "SpaceGrotesk_600SemiBold" }]} numberOfLines={1}>{currentEntry?.label}</Text>
      </View>
      <View style={[styles.stripItem, styles.stripItemDim]}>
        {nextEntry ? (
          <>
            {nextEntry.imageUri ? (
              <Image source={{ uri: nextEntry.imageUri }} style={styles.stripThumb} />
            ) : (
              <View style={[styles.stripThumb, styles.stripThumbEmpty]}>
                <Ionicons name="musical-note" size={S.ms(10, 0.4)} color={C.textTertiary} />
              </View>
            )}
            <Text style={styles.stripLabel} numberOfLines={1}>{nextEntry.label}</Text>
          </>
        ) : <View style={{ flex: 1 }} />}
      </View>
    </View>
  );

  if (isPlaying && queue.length > 0) {
    if (isLandscape) {
      const hasImgL = !!currentEntry?.imageUri;
      return (
        <View style={[styles.container, { flexDirection: "row" as const }]}>
          {/* 가로모드: 사진이 있으면 전체 배경으로 */}
          {hasImgL && (
            <Image
              source={{ uri: currentEntry!.imageUri }}
              style={StyleSheet.absoluteFillObject}
              resizeMode="cover"
            />
          )}
          <View style={styles.landscapePlayingLeft}>
            {!hasImgL && (
              <View style={styles.playingImageArea}>
                <View style={styles.playingImagePlaceholder}>
                  <Ionicons name="musical-notes" size={S.ms(36, 0.4)} color={C.textTertiary} />
                  <Text style={[styles.playingImagePlaceholderText, { fontSize: S.ms(14, 0.3) }]}>{currentEntry?.label}</Text>
                </View>
              </View>
            )}
          </View>
          <View style={[
            styles.landscapePlayingRight,
            hasImgL && { backgroundColor: "rgba(0,0,0,0.55)" },
          ]}>
            <View style={{ flexDirection: "row" as const, alignItems: "center" as const, gap: S.ms(8, 0.3), marginBottom: S.ms(6, 0.3) }}>
              <View style={[styles.progressBadge, { backgroundColor: hasImgL ? "rgba(0,0,0,0.45)" : C.accent + "22" }]}>
                <Text style={[styles.progressText, { color: hasImgL ? "#fff" : C.accent }]}>{currentIndex + 1}/{queue.length}</Text>
              </View>
              <Pressable
                style={[styles.playButton, { backgroundColor: C.danger, width: S.ms(36, 0.4), height: S.ms(36, 0.4), borderRadius: S.ms(18, 0.4) }]}
                onPress={onTogglePlay}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                accessibilityRole="button"
                accessibilityLabel={t("a11y", "playButton")}
              >
                <Ionicons name="stop" size={S.ms(20, 0.4)} color="#fff" />
              </Pressable>
              {queue.length > 1 && (
                <Pressable
                  style={[styles.nextButton, { width: S.ms(44, 0.4), height: S.ms(36, 0.4), borderRadius: S.ms(8, 0.3) }]}
                  onPress={onManualNext}
                  onLongPress={onManualNextImmediate}
                  delayLongPress={500}
                  hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                  accessibilityRole="button"
                  accessibilityLabel={t("noteMode", "nextBeat")}
                >
                  <Ionicons name="play-skip-forward" size={S.ms(14, 0.3)} color={C.accent} />
                  <Text style={[styles.nextButtonText, { color: C.accent, fontSize: S.ms(9, 0.3) }]}>
                    {t("noteMode", "nextBeat")}
                  </Text>
                </Pressable>
              )}
            </View>
            {renderPlayingStrip()}
            {renderControlPadSection(true)}
          </View>
          {renderAssignModal()}
          {renderQuickAssignModal()}
        </View>
      );
    }

    const hasImg = !!currentEntry?.imageUri;

    return (
      <View style={styles.container}>
        {/* 사진 전체 화면 배경 */}
        {hasImg && (
          <Image
            source={{ uri: currentEntry!.imageUri }}
            style={StyleSheet.absoluteFillObject}
            resizeMode="cover"
          />
        )}

        {/* 상단 스크림 — 헤더 가독성 */}
        {hasImg && (
          <View style={styles.imgScrimTop} pointerEvents="none" />
        )}

        <View style={styles.header}>
          <View style={{ width: 22 }} />
          <Text style={[styles.title, { color: hasImg ? "#fff" : C.accent }]}>
            {t("noteMode", "title")}
          </Text>
          <View style={[styles.progressBadge, { backgroundColor: hasImg ? "rgba(0,0,0,0.45)" : C.accent + "22" }]}>
            <Text style={[styles.progressText, { color: hasImg ? "#fff" : C.accent }]}>
              {currentIndex + 1}/{queue.length}
            </Text>
          </View>
        </View>

        {/* 이미지 없을 때만 플레이스홀더 표시 */}
        {!hasImg && (
          <View style={styles.playingImageArea}>
            <View style={styles.playingImagePlaceholder}>
              <Ionicons name="musical-notes" size={S.ms(48, 0.4)} color={C.textTertiary} />
              <Text style={styles.playingImagePlaceholderText}>{currentEntry?.label}</Text>
            </View>
          </View>
        )}

        <View style={{ flex: 1 }} />

        {renderControlPadSection(true)}

        {/* 하단 스크림 — 스트립/버튼 가독성 */}
        {hasImg && (
          <View style={styles.imgScrimBottom} pointerEvents="none" />
        )}

        <View style={styles.playingStripContainer}>
          {renderPlayingStrip()}
          <View style={{ flexDirection: "row" as const, alignItems: "center" as const, gap: S.ms(8, 0.3) }}>
            <Pressable
              style={[styles.playButton, { backgroundColor: C.danger }]}
              onPress={onTogglePlay}
              accessibilityRole="button"
              accessibilityLabel={t("a11y", "playButton")}
            >
              <Ionicons name="stop" size={S.ms(28, 0.4)} color="#fff" />
            </Pressable>
            {queue.length > 1 && (
              <Pressable
                style={styles.nextButton}
                onPress={onManualNext}
                onLongPress={onManualNextImmediate}
                delayLongPress={500}
                accessibilityRole="button"
                accessibilityLabel={t("noteMode", "nextBeat")}
              >
                <Ionicons name="play-skip-forward" size={S.ms(18, 0.4)} color={C.accent} />
                <Text style={[styles.nextButtonText, { color: C.accent }]}>
                  {t("noteMode", "nextBeat")}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
        {renderAssignModal()}
        {renderQuickAssignModal()}
      </View>
    );
  }

  const renderQueueSection = () => (
    <>
      <View style={[styles.sectionHeader, isLandscape && { marginBottom: S.ms(2, 0.3) }]}>
        <Text style={[styles.sectionTitle, { color: C.text }, isLandscape && { fontSize: S.ms(11, 0.3) }]}>{t("noteMode", "queue")}</Text>
        <Text style={[styles.sectionCount, { color: C.textTertiary }, isLandscape && { fontSize: S.ms(10, 0.3) }]}>{queue.length} {t("noteMode", "items")}</Text>
      </View>
      {hasScoreItems && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6, paddingHorizontal: 2 }}>
          <Text style={{ fontSize: S.ms(11, 0.3), color: C.textTertiary }}>{t("noteMode", "previewUnit")}:</Text>
          <Pressable
            onPress={() => setPreviewUnit("measure")}
            style={[{
              paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10,
              backgroundColor: previewUnit === "measure" ? C.accent + "30" : "transparent",
              borderWidth: 1, borderColor: previewUnit === "measure" ? C.accent : C.border,
            }]}
          >
            <Text style={{ fontSize: S.ms(11, 0.3), color: previewUnit === "measure" ? C.accent : C.textTertiary }}>
              {t("noteMode", "previewMeasure")}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setPreviewUnit("phrase")}
            style={[{
              paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10,
              backgroundColor: previewUnit === "phrase" ? C.accent + "30" : "transparent",
              borderWidth: 1, borderColor: previewUnit === "phrase" ? C.accent : C.border,
            }]}
          >
            <Text style={{ fontSize: S.ms(11, 0.3), color: previewUnit === "phrase" ? C.accent : C.textTertiary }}>
              {t("noteMode", "previewPhrase")}
            </Text>
          </Pressable>
          {previewUnit === "phrase" && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginLeft: 4 }}>
              <Pressable
                onPress={() => setPhraseSize((p) => Math.max(1, p - 1))}
                hitSlop={8}
                style={{ opacity: phraseSize <= 1 ? 0.4 : 1 }}
              >
                <Ionicons name="remove-circle-outline" size={S.ms(16, 0.4)} color={C.textSecondary} />
              </Pressable>
              <Text style={{ fontSize: S.ms(12, 0.3), color: C.text, minWidth: 14, textAlign: "center" as const }}>
                {phraseSize}
              </Text>
              <Pressable
                onPress={() => setPhraseSize((p) => Math.min(16, p + 1))}
                hitSlop={8}
                style={{ opacity: phraseSize >= 16 ? 0.4 : 1 }}
              >
                <Ionicons name="add-circle-outline" size={S.ms(16, 0.4)} color={C.textSecondary} />
              </Pressable>
              <Text style={{ fontSize: S.ms(11, 0.3), color: C.textTertiary }}>{t("noteMode", "phraseMeasures")}</Text>
            </View>
          )}
        </View>
      )}
      <View style={[styles.queueContainer, !isLandscape && sourceCollapsed && { flex: 2 }, isLandscape && { marginBottom: 0 }]}>
        {queue.length === 0 ? (
          <View style={styles.emptyQueue}>
            <Ionicons name="musical-notes-outline" size={isLandscape ? 24 : 32} color={C.textTertiary} />
            <Text style={[styles.emptyQueueText, { color: C.textTertiary }]}>{t("noteMode", "emptyQueue")}</Text>
          </View>
        ) : (
          <FlatList
            data={queue}
            keyExtractor={(_, i) => `queue-${i}`}
            renderItem={({ item, index }) => (
              <QueueItem
                entry={item}
                index={index}
                isCurrent={isPlaying && index === currentIndex}
                isFirst={index === 0}
                isLast={index === queue.length - 1}
                accentColor={C.accent}
                onRemove={() => onRemoveFromQueue(index)}
                onMoveUp={() => onReorderQueue(index, index - 1)}
                onMoveDown={() => onReorderQueue(index, index + 1)}
                onImageChange={(uri) => onQueueItemImageChange?.(index, uri)}
                currentMeasureIdx={isPlaying && index === currentIndex ? playingBarIdx : undefined}
                previewUnit={previewUnit}
                phraseSize={phraseSize}
              />
            )}
            showsVerticalScrollIndicator={false}
            scrollEnabled={queue.length > 0}
          />
        )}
      </View>
    </>
  );

  const renderSourceSection = () => (
    <>
      <Pressable
        style={[styles.sectionHeader, isLandscape && { marginBottom: Spacing.xxs }]}
        onPress={() => setSourceCollapsed(prev => !prev)}
      >
        <View style={styles.sectionHeaderLeft}>
          <Ionicons
            name={sourceCollapsed ? "chevron-forward" : "chevron-down"}
            size={S.ms(14, 0.4)}
            color={C.textSecondary}
          />
          <Text style={[styles.sectionTitle, { color: C.text }]}>{t("noteMode", "source")}</Text>
          {sourceCollapsed && barEntries.length > 0 && (
            <Text style={[styles.sectionCount, { color: C.textTertiary }]}>{barEntries.length}</Text>
          )}
        </View>
      </Pressable>
      {!sourceCollapsed && (
        <View style={[styles.sourceContainer, isLandscape && { flex: 1 }]}>
          {barEntries.length === 0 ? (
            <View style={styles.emptySource}>
              <Text style={styles.emptySourceText}>{t("noteMode", "noBarEntries")}</Text>
            </View>
          ) : (
            <FlatList
              key="src-list-ls"
              data={barEntries}
              keyExtractor={(item) => `source-${item.id}`}
              renderItem={({ item }) => (
                <SourceItem
                  entry={item}
                  accentColor={C.accent}
                  onAdd={() => onAddToQueue(item)}
                  onInsertNext={() => onInsertNext(item)}
                  isPlaying={isPlaying}
                />
              )}
              showsVerticalScrollIndicator={false}
              scrollEnabled={barEntries.length > 0}
            />
          )}
        </View>
      )}
    </>
  );

  const renderPlayControls = () => (
    <View style={[styles.playControls, isLandscape && { marginBottom: S.ms(4, 0.3) }]}>
      <View style={styles.playModeRow}>
        {playModes.map((mode) => (
          <Pressable
            key={mode}
            style={[
              styles.playModeBtn,
              playMode === mode && { backgroundColor: C.accent + "22", borderColor: C.accent },
              isLandscape && { paddingHorizontal: S.ms(6, 0.3), paddingVertical: S.ms(4, 0.3) },
            ]}
            onPress={() => onPlayModeChange(mode)}
          >
            <Ionicons
              name={playModeIcons[mode] as any}
              size={isLandscape ? 12 : 14}
              color={playMode === mode ? C.accent : C.textTertiary}
            />
            <Text
              style={[
                styles.playModeText,
                playMode === mode && { color: C.accent },
                isLandscape && { fontSize: S.ms(9, 0.3) },
              ]}
            >
              {playModeLabels[mode]}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: "row" as const, alignItems: "center" as const, gap: S.ms(6, 0.3) }}>
        <Pressable
          style={[
            styles.playButton,
            { backgroundColor: isPlaying ? C.danger : C.accent },
            queue.length === 0 && { opacity: 0.4 },
            isLandscape && { width: S.ms(60, 0.4), height: S.ms(30, 0.4), borderRadius: S.ms(8, 0.3) },
          ]}
          onPress={onTogglePlay}
          disabled={queue.length === 0}
          hitSlop={isLandscape ? { top: 8, bottom: 8, left: 4, right: 4 } : undefined}
          accessibilityRole="button"
          accessibilityLabel={t("a11y", "playButton")}
          accessibilityState={{ selected: isPlaying, disabled: queue.length === 0 }}
        >
          <Ionicons name={isPlaying ? "stop" : "play"} size={isLandscape ? 24 : 28} color="#fff" />
        </Pressable>
        {isPlaying && queue.length > 1 && (
          <Pressable
            style={[
              styles.nextButton,
              isLandscape && { width: S.ms(52, 0.4), height: S.ms(30, 0.4), borderRadius: S.ms(8, 0.3) },
            ]}
            onPress={onManualNext}
            onLongPress={onManualNextImmediate}
            delayLongPress={500}
            hitSlop={isLandscape ? { top: 8, bottom: 8, left: 4, right: 4 } : undefined}
            accessibilityRole="button"
            accessibilityLabel={t("noteMode", "nextBeatHint")}
          >
            <Ionicons name="play-skip-forward" size={isLandscape ? 16 : 18} color={C.accent} />
            <Text style={[styles.nextButtonText, { color: C.accent }, isLandscape && { fontSize: S.ms(9, 0.3) }]}>
              {t("noteMode", "nextBeat")}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );

  if (isLandscape) {
    return (
      <View style={[styles.container, { flexDirection: "row" as const, gap: S.ms(8, 0.3) }, S.isTablet && { maxWidth: 900, alignSelf: "center" as const, width: "100%" as const }]}>
        <Pressable onPress={onExitNoteMode} hitSlop={8} style={{ position: "absolute" as const, top: S.ms(6, 0.3), right: S.ms(8, 0.3), zIndex: 10 }}>
          <Ionicons name="close" size={S.ms(22, 0.3)} color={C.textSecondary} />
        </Pressable>
        <View style={{ flex: 2 }}>
          <View style={[styles.header, { marginBottom: S.ms(2, 0.3), gap: S.ms(8, 0.3) }]}>
            <Text style={[styles.title, { color: C.accent, fontSize: S.ms(14, 0.3) }]}>{t("noteMode", "title")}</Text>
            <View style={[styles.headerActions, { gap: S.ms(6, 0.3) }]}>
              <Pressable onPress={handleSaveWithFeedback} hitSlop={8} style={[styles.headerBtn, { borderColor: saved ? "#4CAF50" : C.accent, backgroundColor: saved ? "#4CAF5020" : C.surface, width: S.ms(28, 0.4), height: S.ms(28, 0.4) }]}>
                <Ionicons name={saved ? "checkmark" : "save-outline"} size={S.ms(13, 0.3)} color={saved ? "#4CAF50" : C.accent} />
              </Pressable>
              <Pressable onPress={handleReset} hitSlop={8} style={[styles.headerBtn, { borderColor: C.danger, width: S.ms(28, 0.4), height: S.ms(28, 0.4) }]}>
                <Ionicons name="refresh" size={S.ms(13, 0.3)} color={C.danger} />
              </Pressable>
            </View>
          </View>
          {renderQueueSection()}
        </View>
        <View style={[styles.landscapeRightPanel, { justifyContent: "space-between" as const }]}>
          {renderSourceSection()}
          {renderControlPadSection(true)}
          {renderPlayControls()}
        </View>
        {renderAssignModal()}
        {renderQuickAssignModal()}
      </View>
    );
  }

  return (
    <View style={[styles.container, S.isTablet && { maxWidth: 720, alignSelf: "center" as const, width: "100%" as const }]}>
      <Pressable onPress={onExitNoteMode} hitSlop={12} style={styles.closeButtonCenter}>
        <Ionicons name="close" size={S.ms(28, 0.4)} color={C.textSecondary} />
      </Pressable>

      <View style={styles.header}>
        <View style={{ width: 22 }} />
        <Text style={[styles.title, { color: C.accent }]}>{t("noteMode", "title")}</Text>
        <View style={styles.headerActions}>
          <Pressable onPress={handleSaveWithFeedback} hitSlop={8} style={[styles.headerBtn, { borderColor: saved ? "#4CAF50" : C.accent, backgroundColor: saved ? "#4CAF5020" : C.surface }]}>
            <Ionicons name={saved ? "checkmark" : "save-outline"} size={S.ms(16, 0.4)} color={saved ? "#4CAF50" : C.accent} />
          </Pressable>
          <Pressable onPress={handleReset} hitSlop={8} style={[styles.headerBtn, { borderColor: C.danger }]}>
            <Ionicons name="refresh" size={S.ms(16, 0.4)} color={C.danger} />
          </Pressable>
        </View>
      </View>

      {renderPlayControls()}

      <HintBanner
        hintKey="note_mode_intro"
        message={t("noteMode", "hintAddToQueue")}
        icon="list-outline"
      />

      {renderQueueSection()}

      {renderSourceSection()}

      {renderControlPadSection(false)}

      {renderAssignModal()}
      {renderQuickAssignModal()}
    </View>
  );
}

const make_styles = (C: typeof Colors, S: ScaleValues) => StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.ms(12, 0.3),
    marginBottom: S.ms(4, 0.3),
  },
  title: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: S.ms(18, 0.3),
    color: C.text,
    flex: 1,
  },
  headerActions: {
    flexDirection: "row",
    gap: S.ms(8, 0.3),
  },
  closeButtonCenter: {
    alignSelf: "center",
    marginTop: S.ms(2, 0.3),
    marginBottom: S.ms(2, 0.3),
    padding: S.ms(6, 0.3),
  },
  headerBtn: {
    width: S.ms(32, 0.4),
    height: S.ms(32, 0.4),
    borderRadius: S.ms(8, 0.3),
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.surface,
  },
  nowPlaying: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.ms(8, 0.3),
    borderWidth: 1,
    borderRadius: S.ms(10, 0.3),
    paddingHorizontal: S.ms(12, 0.3),
    paddingVertical: S.ms(8, 0.3),
    backgroundColor: C.surface,
    marginBottom: S.ms(10, 0.3),
  },
  nowPlayingLabel: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: S.ms(14, 0.3),
    color: C.text,
    flex: 1,
  },
  nowPlayingBpm: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: S.ms(12, 0.3),
    color: C.textSecondary,
  },
  progressBadge: {
    borderRadius: S.ms(6, 0.3),
    paddingHorizontal: S.ms(6, 0.3),
    paddingVertical: S.ms(2, 0.3),
  },
  progressText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: S.ms(11, 0.3),
    color: C.text,
  },
  playControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.ms(12, 0.3),
    marginBottom: S.ms(12, 0.3),
  },
  playModeRow: {
    flex: 1,
    flexDirection: "row",
    gap: S.ms(6, 0.3),
  },
  playModeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.ms(4, 0.3),
    paddingHorizontal: S.ms(10, 0.3),
    paddingVertical: S.ms(6, 0.3),
    borderRadius: S.ms(8, 0.3),
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  playModeText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: S.ms(11, 0.3),
    color: C.textTertiary,
  },
  playButton: {
    width: S.ms(48, 0.4),
    height: S.ms(48, 0.4),
    borderRadius: S.ms(24, 0.4),
    alignItems: "center",
    justifyContent: "center",
  },
  nextButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: S.ms(4, 0.3),
    paddingHorizontal: S.ms(12, 0.4),
    height: S.ms(48, 0.4),
    borderRadius: S.ms(10, 0.3),
    borderWidth: 1,
    borderColor: C.accent + "55",
    backgroundColor: C.accent + "15",
  },
  nextButtonText: {
    fontSize: S.ms(12, 0.3),
    fontWeight: "600" as const,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: S.ms(6, 0.3),
  },
  sectionHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.ms(4, 0.3),
  },
  sectionTitle: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: S.ms(13, 0.3),
    color: C.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  sectionCount: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: S.ms(12, 0.3),
    color: C.textTertiary,
  },
  queueContainer: {
    flex: 1,
    minHeight: S.ms(60, 0.3),
    marginBottom: S.ms(6, 0.3),
  },
  emptyQueue: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: S.ms(6, 0.3),
    paddingVertical: S.ms(10, 0.3),
  },
  emptyQueueText: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: S.ms(13, 0.3),
    color: C.textTertiary,
    textAlign: "center",
  },
  queueItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.ms(10, 0.3),
    paddingHorizontal: S.ms(12, 0.3),
    paddingVertical: S.ms(10, 0.3),
    backgroundColor: C.surface,
    borderRadius: S.ms(10, 0.3),
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: S.ms(6, 0.3),
  },
  reorderBtns: {
    alignItems: "center",
    gap: 0,
  },
  queueIndex: {
    width: S.ms(22, 0.3),
    alignItems: "center",
  },
  queueIndexText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: S.ms(13, 0.3),
    color: C.textTertiary,
  },
  queueItemInfo: {
    flex: 1,
    gap: 3,
  },
  queueItemLabel: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: S.ms(13, 0.3),
    color: C.text,
  },
  queueItemMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  queueItemBpm: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: S.ms(11, 0.3),
    color: C.textSecondary,
  },
  queueThumb: {
    width: S.ms(32, 0.4),
    height: S.ms(32, 0.4),
    borderRadius: S.ms(6, 0.3),
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  queueThumbImg: {
    width: S.ms(32, 0.4),
    height: S.ms(32, 0.4),
    borderRadius: S.ms(6, 0.3),
  },
  imgScrimTop: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    height: 90,
    backgroundColor: "rgba(0,0,0,0.55)",
    zIndex: 1,
  },
  imgScrimBottom: {
    position: "absolute" as const,
    bottom: 0,
    left: 0,
    right: 0,
    height: 180,
    backgroundColor: "rgba(0,0,0,0.55)",
    zIndex: 1,
  },
  playingImageArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: Spacing.sm,
    borderRadius: 12,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
  },
  playingImage: {
    width: "100%",
    height: "100%",
  },
  playingImagePlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  playingImagePlaceholderText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: S.ms(18, 0.3),
    color: C.textTertiary,
    textAlign: "center",
    paddingHorizontal: S.ms(20, 0.3),
  },
  playingStripContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.ms(12, 0.3),
    marginTop: S.ms(8, 0.3),
    marginBottom: S.ms(4, 0.3),
  },
  playingStrip: {
    flex: 1,
    flexDirection: "row",
    gap: S.ms(6, 0.3),
  },
  stripItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: S.ms(6, 0.3),
    paddingHorizontal: S.ms(8, 0.3),
    paddingVertical: S.ms(6, 0.3),
    borderRadius: S.ms(8, 0.3),
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  stripItemActive: {
    borderWidth: 1.5,
    backgroundColor: "rgba(212,168,70,0.08)",
  },
  stripItemDim: {
    opacity: 0.5,
  },
  stripThumb: {
    width: S.ms(24, 0.4),
    height: S.ms(24, 0.4),
    borderRadius: S.ms(4, 0.3),
    overflow: "hidden",
  },
  stripThumbEmpty: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  stripLabel: {
    flex: 1,
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: S.ms(11, 0.3),
    color: C.textSecondary,
  },
  landscapePlayingLeft: {
    flex: 2,
    marginRight: S.ms(10, 0.3),
  },
  landscapePlayingRight: {
    flex: 1,
    justifyContent: "center",
  },
  landscapeRightPanel: {
    flex: 1,
  },
  removeBtn: {
    padding: Spacing.xxs,
  },
  sourceContainer: {
    flex: 1,
    minHeight: S.ms(80, 0.3),
  },
  emptySource: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: S.ms(16, 0.3),
  },
  emptySourceText: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: S.ms(13, 0.3),
    color: C.textTertiary,
  },
  sourceItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.ms(6, 0.3),
    marginBottom: S.ms(5, 0.3),
  },
  sourceItemContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: S.ms(10, 0.3),
    paddingHorizontal: S.ms(12, 0.3),
    paddingVertical: S.ms(9, 0.3),
    backgroundColor: C.surface,
    borderRadius: S.ms(8, 0.3),
    borderWidth: 1,
    borderColor: C.border,
  },
  sourceItemInfo: {
    flex: 1,
    gap: Spacing.xxs,
  },
  sourceItemLabel: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: S.ms(13, 0.3),
    color: C.text,
  },
  sourceItemMeta: {
    flexDirection: "row",
    gap: S.ms(8, 0.3),
  },
  sourceItemBpm: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: S.ms(11, 0.3),
    color: C.textSecondary,
  },
  sourceItemBeats: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: S.ms(11, 0.3),
    color: C.textTertiary,
  },
  insertNextBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.ms(3, 0.3),
    borderWidth: 1,
    borderRadius: S.ms(6, 0.3),
    paddingHorizontal: S.ms(8, 0.3),
    paddingVertical: S.ms(5, 0.3),
  },
  insertNextText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: S.ms(10, 0.3),
    color: C.text,
  },
  padGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: S.ms(6, 0.3),
  },
  padCell: {
    width: "31.5%",
    aspectRatio: 1.6,
    borderWidth: 1,
    borderRadius: S.ms(8, 0.3),
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: S.ms(6, 0.3),
    gap: S.ms(2, 0.3),
    position: "relative",
  },
  padCellCompact: {
    aspectRatio: 1.9,
    paddingHorizontal: S.ms(4, 0.3),
  },
  padCellLabel: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: S.ms(12, 0.3),
    textAlign: "center",
  },
  padCellMeta: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: S.ms(10, 0.3),
    textAlign: "center",
  },
  padClearBtn: {
    position: "absolute",
    top: 2,
    right: 2,
    padding: Spacing.xxs,
  },
  padToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.ms(4, 0.3),
    paddingHorizontal: S.ms(8, 0.3),
    paddingVertical: S.ms(3, 0.3),
    borderRadius: S.ms(6, 0.3),
    borderWidth: 1,
  },
  padToggleText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: S.ms(10, 0.3),
  },
  padHint: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: S.ms(10, 0.3),
    marginBottom: S.ms(4, 0.3),
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
  },
  modalSheet: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 12,
    borderWidth: 1,
    padding: Spacing.md,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  modalTitle: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: S.ms(14, 0.3),
    flex: 1,
  },
  modalClearBtn: {
    paddingHorizontal: 10,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  modalClearText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: S.ms(11, 0.3),
  },
  modalItem: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderRadius: Radius.md,
    borderWidth: 1,
    marginBottom: 6,
    gap: Spacing.xxs,
  },
  modalItemLabel: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: S.ms(13, 0.3),
  },
  modalItemMeta: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: S.ms(11, 0.3),
  },
  padTabBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  padTabText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: S.ms(11, 0.3),
  },
  quickAddItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 7,
    borderRadius: Radius.sm,
    borderWidth: 1,
    marginBottom: 4,
  },
  quickAddBadge: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  quickAddBadgeText: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: S.ms(11, 0.3),
  },
  quickAddItemLabel: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: S.ms(12, 0.3),
  },
  quickAddItemMeta: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: S.ms(10, 0.3),
  },
  quickAddThumb: {
    width: 30,
    height: 30,
    borderRadius: Radius.sm,
  },
  quickAddNewBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 7,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderStyle: "dashed",
    marginTop: 2,
  },
  quickAddNewText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: S.ms(11, 0.3),
  },
  qaDropIndicator: {
    height: 2,
    borderRadius: 1,
    marginBottom: 2,
    marginHorizontal: 4,
  },
});
