import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  TextInput,
  Alert,
  Platform,
  Animated,
  PanResponder,
  Dimensions,
} from "react-native";
import { confirmDestructive } from "@/lib/confirm";
import { AnimatedSlideModal } from "@/components/AnimatedModal";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { Radius, FontSize, Spacing } from "@/constants/tokens";
import { useTheme } from "@/contexts/ThemeContext";
import type { PracticeEntry } from "@/lib/storage";
import {
  loadPracticeBook,
  savePracticeBook,
  createPracticeEntry,
} from "@/lib/storage";
import type { BeatType } from "@/lib/metronome-engine";
import { useLanguage } from "@/contexts/LanguageContext";
import { useScale } from "@/lib/scale";
import { ExportEntryModal } from "@/components/ExportEntryModal";

interface PracticeBookModalProps {
  visible: boolean;
  onClose: () => void;
  onLoad: (entry: PracticeEntry) => void;
  onSetGoal?: (entry: PracticeEntry, targetMinutes: number) => void;
  currentConfig: Omit<PracticeEntry, "id" | "label" | "createdAt"> | null;
  username?: string;
  onOpenScore?: (scoreId: string) => void;
  /** Opens the stem-separation modal pre-loaded with a note-sample URI */
  onStemSep?: (uri: string, name: string) => void;
}

const BEAT_COLORS: Record<BeatType, string> = {
  accent: "#D4A846",
  normal: "#8B949E",
  mute: "#30363D",
  strong: "#F0883E",
};

const ACTION_WIDTH = 280;
const SWIPE_THRESHOLD = 60;

function formatDate(ts: number) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}.${m}.${day} ${h}:${min}`;
}

function BeatPreview({ beatTypes, size = 10 }: { beatTypes: BeatType[]; size?: number }) {
  const { colors: C } = useTheme();
  const styles = make_styles(C);
  const gridStyles = make_gridStyles(C);
  return (
    <View style={{ flexDirection: "row", gap: 3 }}>
      {beatTypes.map((t, i) => (
        <View
          key={i}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: BEAT_COLORS[t] || C.textSecondary,
          }}
        />
      ))}
    </View>
  );
}

function SwipeableEntry({
  item,
  isEditing,
  editLabel,
  setEditLabel,
  editInputRef,
  onOpenScore,
  onRename,
  onLoad,
  onDelete,
  onShare,
  onExport,
  onSetGoal,
  onStemSep,
  accentColor,
  openItemId,
  setOpenItemId,
}: {
  item: PracticeEntry;
  isEditing: boolean;
  editLabel: string;
  setEditLabel: (v: string) => void;
  editInputRef: React.RefObject<TextInput | null>;

  onOpenScore?: (scoreId: string) => void;
  onRename: (id: string) => void;
  onLoad: (entry: PracticeEntry) => void;
  onDelete: (id: string) => void;
  onShare: (entry: PracticeEntry) => void;
  onExport: (entry: PracticeEntry) => void;
  onSetGoal?: (entry: PracticeEntry) => void;
  onStemSep?: (entry: PracticeEntry) => void;
  accentColor: string;
  openItemId: string | null;
  setOpenItemId: (id: string | null) => void;
}) {
  const { colors: C } = useTheme();
  const S = useScale();
  const styles = make_styles(C);
  const gridStyles = make_gridStyles(C);
  const { t } = useLanguage();
  const translateX = useRef(new Animated.Value(0)).current;
  const isOpenRef = useRef(false);

  useEffect(() => {
    if (openItemId !== item.id && isOpenRef.current) {
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 8 }).start();
      isOpenRef.current = false;
    }
  }, [openItemId, item.id]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > 10 && Math.abs(gs.dy) < 20,
      onPanResponderMove: (_, gs) => {
        const base = isOpenRef.current ? -ACTION_WIDTH : 0;
        const val = Math.min(0, Math.max(-ACTION_WIDTH, base + gs.dx));
        translateX.setValue(val);
      },
      onPanResponderRelease: (_, gs) => {
        if (isOpenRef.current) {
          if (gs.dx > SWIPE_THRESHOLD) {
            Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 8 }).start();
            isOpenRef.current = false;
            setOpenItemId(null);
          } else {
            Animated.spring(translateX, { toValue: -ACTION_WIDTH, useNativeDriver: true, friction: 8 }).start();
          }
        } else {
          if (gs.dx < -SWIPE_THRESHOLD) {
            Animated.spring(translateX, { toValue: -ACTION_WIDTH, useNativeDriver: true, friction: 8 }).start();
            isOpenRef.current = true;
            setOpenItemId(item.id);
          } else {
            Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 8 }).start();
          }
        }
      },
    })
  ).current;

  const isBeatMode = (item.mode || "bar") === "beat";
  const isNoteMode = item.mode === "note";
  const barCount = item.beatsPerMeasure;
  const secondsPerBeat = 60 / item.bpm;
  const onePlaySeconds = barCount * secondsPerBeat;

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    if (m > 0) return `${m}${t("practiceBook", "minSec")} ${s}${t("practiceBook", "sec")}`;
    return `${s}${t("practiceBook", "sec")}`;
  };

  const clockMode = item.barClockMode || "stopwatch";
  const timerDur = item.barTimerDuration;
  let playModeText: string;
  if (isNoteMode) {
    const pm = item.notePlayMode || "once";
    playModeText = pm === "loop" ? t("practiceBook", "continuousPlay") : pm === "random" ? t("practiceBook", "randomPlay") : t("practiceBook", "singlePlay");
  } else if (isBeatMode) {
    playModeText = t("practiceBook", "continuousPlay");
  } else if (clockMode === "timer" && timerDur != null && timerDur > 0) {
    const tm = Math.floor(timerDur / 60);
    const ts = timerDur % 60;
    playModeText = tm > 0 ? `${tm}:${String(ts).padStart(2, "0")}` : `${ts}${t("practiceBook", "sec")}`;
  } else if (item.barLoopMode === "loop") {
    playModeText = t("practiceBook", "continuousPlay");
  } else {
    playModeText = t("practiceBook", "singlePlay");
  }

  return (
    <View style={styles.swipeContainer}>
      <View style={styles.actionsBackground}>
        <Pressable
          style={[styles.swipeAction, { backgroundColor: "#3B82F6" }]}
          onPress={() => {
            Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 8 }).start();
            isOpenRef.current = false;
            setOpenItemId(null);
            onShare(item);
          }}
        >
          <Ionicons name="share-outline" size={S.ms(18, 0.4)} color="#fff" />
          <Text style={styles.swipeActionText}>{t("practiceBook", "share")}</Text>
        </Pressable>
        <Pressable
          style={[styles.swipeAction, { backgroundColor: "#8B5CF6" }]}
          onPress={() => {
            Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 8 }).start();
            isOpenRef.current = false;
            setOpenItemId(null);
            onExport(item);
          }}
        >
          <Ionicons name="download-outline" size={S.ms(18, 0.4)} color="#fff" />
          <Text style={styles.swipeActionText}>{t("practiceBook", "exportAudio")}</Text>
        </Pressable>
        <Pressable
          style={[styles.swipeAction, { backgroundColor: "#F59E0B" }]}
          onPress={() => {
            Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 8 }).start();
            isOpenRef.current = false;
            setOpenItemId(null);
            onRename(item.id);
          }}
        >
          <Ionicons name="pencil" size={S.ms(18, 0.4)} color="#fff" />
          <Text style={styles.swipeActionText}>{t("practiceBook", "edit")}</Text>
        </Pressable>
        {onSetGoal && (
          <Pressable
            style={[styles.swipeAction, { backgroundColor: "#10B981" }]}
            onPress={() => {
              Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 8 }).start();
              isOpenRef.current = false;
              setOpenItemId(null);
              onSetGoal(item);
            }}
          >
            <Ionicons name="flag-outline" size={S.ms(18, 0.4)} color="#fff" />
            <Text style={styles.swipeActionText}>{t("practiceBook", "goalSet")}</Text>
          </Pressable>
        )}
        {onStemSep && (item.mode === "note") && Object.keys(item.noteSamples ?? {}).length > 0 && (
          <Pressable
            style={[styles.swipeAction, { backgroundColor: "#0EA5E9" }]}
            onPress={() => {
              Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 8 }).start();
              isOpenRef.current = false;
              setOpenItemId(null);
              onStemSep(item);
            }}
          >
            <MaterialCommunityIcons name="layers-triple-outline" size={S.ms(18, 0.4)} color="#fff" />
            <Text style={styles.swipeActionText}>{t("stemSep", "title")}</Text>
          </Pressable>
        )}
        <Pressable
          style={[styles.swipeAction, { backgroundColor: C.danger }]}
          onPress={() => {
            Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 8 }).start();
            isOpenRef.current = false;
            setOpenItemId(null);
            onDelete(item.id);
          }}
        >
          <Ionicons name="trash-outline" size={S.ms(18, 0.4)} color="#fff" />
          <Text style={styles.swipeActionText}>{t("practiceBook", "delete")}</Text>
        </Pressable>
      </View>

      <Animated.View
        style={[styles.entryCard, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        <Pressable
          style={styles.entryMain}
          onPress={() => {
            if (item.scoreId && onOpenScore) {
              onOpenScore(item.scoreId);
            } else {
              onLoad(item);
            }
          }}
          delayLongPress={500}
        >
          <View style={styles.entryHeader}>
            {isEditing ? (
              <TextInput
                ref={editInputRef}
                style={[styles.editInput, { borderColor: accentColor }]}
                value={editLabel}
                onChangeText={setEditLabel}
                onSubmitEditing={() => onRename(item.id)}
                onBlur={() => onRename(item.id)}
                autoFocus
                selectTextOnFocus
              />
            ) : (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, flex: 1 }}>
                {item.scoreId ? (
                  <Ionicons name="musical-note" size={12} color="#22c55e" />
                ) : null}
                <Text style={[styles.entryLabel, { flex: 1 }]} numberOfLines={1}>
                  {item.label}
                </Text>
              </View>
            )}
            <Text style={styles.entryDate}>{formatDate(item.createdAt)}</Text>
            <Pressable
              testID={`export-row-${item.id}`}
              accessibilityLabel={t("practiceBook", "exportAudio")}
              onPress={(e) => {
                e.stopPropagation?.();
                onExport(item);
              }}
              hitSlop={8}
              style={({ pressed }) => [styles.exportIconBtn, pressed && { opacity: 0.6 }]}
            >
              <Ionicons name="download-outline" size={S.ms(18, 0.4)} color={accentColor} />
            </Pressable>
          </View>

          {item.createdBy ? (
            <Text style={styles.createdBy}>{t("practiceBook", "byPrefix")} {item.createdBy}</Text>
          ) : null}

          <View style={styles.entryDetails}>
            <View style={[styles.modeBadge, { backgroundColor: isNoteMode ? "#22c55e" : isBeatMode ? "#3B82F6" : accentColor }]}>
              <Text style={styles.modeBadgeText}>{isNoteMode ? t("practiceBook", "badgeNote") : isBeatMode ? t("practiceBook", "badgeBeat") : t("practiceBook", "badgeBar")}</Text>
            </View>
            {isNoteMode ? (
              <>
                <View style={styles.detailChip}>
                  <MaterialCommunityIcons name="playlist-music" size={S.ms(12, 0.4)} color={C.textSecondary} />
                  <Text style={[styles.detailValue, { color: accentColor }]}>
                    {(item.noteQueueEntries || item.noteQueueEntryIds || []).length}
                  </Text>
                  <Text style={styles.detailUnit}>{t("practiceBook", "badgeBar")}</Text>
                </View>
                <View style={styles.detailChip}>
                  <Ionicons
                    name={item.notePlayMode === "loop" ? "infinite" : item.notePlayMode === "random" ? "shuffle" : "play"}
                    size={S.ms(12, 0.4)}
                    color={C.textSecondary}
                  />
                  <Text style={styles.detailUnit}>{playModeText}</Text>
                </View>
              </>
            ) : (
              <>
                <View style={styles.detailChip}>
                  <Text style={[styles.detailValue, { color: accentColor }]}>
                    {item.bpm}
                  </Text>
                  <Text style={styles.detailUnit}>{t("practiceBook", "bpmUnit")}</Text>
                </View>
                <View style={styles.detailChip}>
                  <Text style={[styles.detailValue, { color: accentColor }]}>
                    {barCount}
                  </Text>
                  <Text style={styles.detailUnit}>{isBeatMode ? t("practiceBook", "badgeBeat") : t("practiceBook", "badgeBar")}</Text>
                </View>
                <View style={styles.detailChip}>
                  <Ionicons
                    name={clockMode === "timer" ? "timer-outline" : "infinite"}
                    size={S.ms(12, 0.4)}
                    color={C.textSecondary}
                  />
                  <Text style={styles.detailUnit}>{playModeText}</Text>
                </View>
                <View style={styles.detailChip}>
                  <Ionicons name="time-outline" size={S.ms(12, 0.4)} color={C.textSecondary} />
                  <Text style={styles.detailUnit}>{formatTime(onePlaySeconds)}</Text>
                </View>
              </>
            )}
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

function GridItem({
  item,
  onLoad,
  onDelete,
  onShare,
  onExport,
  accentColor,
}: {
  item: PracticeEntry;
  onLoad: (entry: PracticeEntry) => void;
  onDelete: (id: string) => void;
  onShare: (entry: PracticeEntry) => void;
  onExport: (entry: PracticeEntry) => void;
  accentColor: string;
}) {
  const { colors: C } = useTheme();
  const S = useScale();
  const styles = make_styles(C);
  const gridStyles = make_gridStyles(C);
  const { t } = useLanguage();
  const isBeatMode = (item.mode || "bar") === "beat";
  const isNoteMode = item.mode === "note";

  let playModeText: string;
  if (isNoteMode) {
    const pm = item.notePlayMode || "once";
    playModeText = pm === "loop" ? t("practiceBook", "continuousPlay") : pm === "random" ? t("practiceBook", "randomPlay") : t("practiceBook", "singlePlay");
  } else if (isBeatMode) {
    playModeText = t("practiceBook", "continuousPlay");
  } else {
    const clockMode = item.barClockMode || "stopwatch";
    if (clockMode === "timer" && item.barTimerDuration != null && item.barTimerDuration > 0) {
      const tm = Math.floor(item.barTimerDuration / 60);
      const ts = item.barTimerDuration % 60;
      playModeText = tm > 0 ? `${tm}:${String(ts).padStart(2, "0")}` : `${ts}${t("practiceBook", "sec")}`;
    } else if (item.barLoopMode === "loop") {
      playModeText = t("practiceBook", "continuousPlay");
    } else {
      playModeText = t("practiceBook", "singlePlay");
    }
  }

  const handleLongPressActions = useCallback(() => {
    Alert.alert(
      item.label,
      undefined,
      [
        { text: t("practiceBook", "share"), onPress: () => onShare(item) },
        { text: t("practiceBook", "exportAudio"), onPress: () => onExport(item) },
        { text: t("practiceBook", "delete"), style: "destructive", onPress: () => onDelete(item.id) },
        { text: t("practiceBook", "cancel"), style: "cancel" },
      ]
    );
  }, [item, onDelete, onShare, onExport, t]);

  return (
    <Pressable
      style={({ pressed }) => [
        gridStyles.card,
        pressed && { opacity: 0.7 },
      ]}
      onPress={() => onLoad(item)}
      onLongPress={handleLongPressActions}
      delayLongPress={500}
    >
      <View style={gridStyles.cardHeader}>
        <Text style={gridStyles.cardLabel} numberOfLines={1}>{item.label}</Text>
        <View style={[gridStyles.modeDot, { backgroundColor: isNoteMode ? "#22c55e" : isBeatMode ? "#3B82F6" : accentColor }]} />
        <Pressable
          testID={`export-grid-${item.id}`}
          accessibilityLabel={t("practiceBook", "exportAudio")}
          onPress={(e) => {
            e.stopPropagation?.();
            onExport(item);
          }}
          hitSlop={8}
          style={({ pressed }) => [gridStyles.exportIconBtn, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="download-outline" size={S.ms(16, 0.4)} color={accentColor} />
        </Pressable>
      </View>
      {isNoteMode ? (
        <View style={gridStyles.cardStats}>
          <Text style={[gridStyles.cardBpm, { color: accentColor }]}>
            {(item.noteQueueEntries || item.noteQueueEntryIds || []).length}
          </Text>
          <Text style={gridStyles.cardUnit}>{t("practiceBook", "badgeBar")}</Text>
        </View>
      ) : (
        <View style={gridStyles.cardStats}>
          <Text style={[gridStyles.cardBpm, { color: accentColor }]}>{item.bpm}</Text>
          <Text style={gridStyles.cardUnit}>{t("practiceBook", "bpmUnit")}</Text>
        </View>
      )}
      <View style={gridStyles.cardFooter}>
        <Text style={gridStyles.cardMeta} numberOfLines={1}>
          {isNoteMode ? t("practiceBook", "badgeNote") : isBeatMode ? t("practiceBook", "badgeBeat") : t("practiceBook", "badgeBar")}
          {" · "}
          {isNoteMode ? `${(item.noteQueueEntries || item.noteQueueEntryIds || []).length}` : `${item.beatsPerMeasure}`}
          {!isNoteMode && ` ${t("practiceBook", "beatsUnit")}`}
        </Text>
        <Text style={gridStyles.cardPlayMode} numberOfLines={1}>{playModeText}</Text>
      </View>
      {item.createdBy ? (
        <Text style={gridStyles.cardBy} numberOfLines={1}>{item.createdBy}</Text>
      ) : null}
    </Pressable>
  );
}

const VIEW_MODE_KEY = "@practice_book_view_mode";

export function PracticeBookModal({
  visible,
  onClose,
  onLoad,
  onSetGoal,
  currentConfig,
  username,
  onOpenScore,
  onStemSep,
}: PracticeBookModalProps) {
  const insets = useSafeAreaInsets();
  const { colors: C } = useTheme();
  const S = useScale();
  const styles = make_styles(C);
  const gridStyles = make_gridStyles(C);
  const { t } = useLanguage();
  const [entries, setEntries] = useState<PracticeEntry[]>([]);
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [saveLabel, setSaveLabel] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [goalEntry, setGoalEntry] = useState<PracticeEntry | null>(null);
  const [goalMinutes, setGoalMinutes] = useState("10");
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [filterMode, setFilterMode] = useState<"all" | "beat" | "bar" | "note">("all");
  const saveInputRef = useRef<TextInput>(null);
  const editInputRef = useRef<TextInput | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(VIEW_MODE_KEY).then(v => {
      if (v === "grid" || v === "list") setViewMode(v);
    });
  }, []);

  const toggleViewMode = useCallback(() => {
    setViewMode(prev => {
      const next = prev === "list" ? "grid" : "list";
      AsyncStorage.setItem(VIEW_MODE_KEY, next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (visible) {
      loadPracticeBook().then(setEntries);
      setShowSaveInput(false);
      setEditingId(null);
      setOpenItemId(null);
    }
  }, [visible]);

  const handleSave = useCallback(async () => {
    if (!currentConfig || !saveLabel.trim()) return;
    const entry = createPracticeEntry(saveLabel.trim(), currentConfig, username || undefined);
    const updated = [entry, ...entries];
    setEntries(updated);
    await savePracticeBook(updated);
    setSaveLabel("");
    setShowSaveInput(false);
  }, [currentConfig, saveLabel, entries, username]);

  const handleDelete = useCallback(
    (id: string) => {
      const doDelete = async () => {
        const updated = entries.filter((e) => e.id !== id);
        setEntries(updated);
        await savePracticeBook(updated);
      };
      confirmDestructive(t("practiceBook", "deleteConfirm"), {
        title: t("practiceBook", "delete"),
        confirmText: t("practiceBook", "delete"),
        cancelText: t("practiceBook", "cancel"),
        onConfirm: doDelete,
      });
    },
    [entries]
  );

  const handleRename = useCallback(
    async (id: string) => {
      if (!editLabel.trim()) {
        setEditingId(null);
        return;
      }
      const updated = entries.map((e) =>
        e.id === id ? { ...e, label: editLabel.trim() } : e
      );
      setEntries(updated);
      await savePracticeBook(updated);
      setEditingId(null);
    },
    [entries, editLabel]
  );

  const handleStartRename = useCallback((id: string) => {
    const entry = entries.find((e) => e.id === id);
    if (entry) {
      setEditingId(id);
      setEditLabel(entry.label);
    }
  }, [entries]);

  const handleLoad = useCallback(
    (entry: PracticeEntry) => {
      onLoad(entry);
      onClose();
    },
    [onLoad, onClose]
  );

  const handleShare = useCallback(async (entry: PracticeEntry) => {
    try {
      const { sharePracticeEntry } = await import("@/lib/backup");
      await sharePracticeEntry(entry);
    } catch (_) {}
  }, []);

  const [exportEntry, setExportEntry] = useState<PracticeEntry | null>(null);
  const handleExport = useCallback((entry: PracticeEntry) => {
    setExportEntry(entry);
  }, []);

  const handleImportEntry = useCallback(async () => {
    try {
      const { importPracticeEntry } = await import("@/lib/backup");
      const result = await importPracticeEntry();
      if (result.success) {
        Alert.alert(t("practiceBook", "importEntry"), t("practiceBook", "importSuccess"));
        const fresh = await loadPracticeBook();
        setEntries(fresh);
      } else {
        const detail = result.validationDetail
          ? `\n\n${t("practiceBook", "importInvalidDetail")}: ${result.validationDetail}`
          : "";
        Alert.alert(t("practiceBook", "importEntry"), t("practiceBook", "importFail") + detail);
      }
    } catch (_) {
      Alert.alert(t("practiceBook", "importEntry"), t("practiceBook", "importFail"));
    }
  }, []);

  const filteredEntries = filterMode === "all"
    ? entries
    : entries.filter(e => (e.mode || "beat") === filterMode);

  const modeCounts = {
    all: entries.length,
    beat: entries.filter(e => !e.mode || e.mode === "beat").length,
    bar: entries.filter(e => e.mode === "bar").length,
    note: entries.filter(e => e.mode === "note").length,
  };

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  const renderItem = ({ item }: { item: PracticeEntry }) => (
    <SwipeableEntry
      item={item}
      isEditing={editingId === item.id}
      editLabel={editLabel}
      setEditLabel={setEditLabel}
      editInputRef={editInputRef}
      onOpenScore={onOpenScore}
      onRename={editingId === item.id ? handleRename : handleStartRename}
      onLoad={handleLoad}
      onDelete={handleDelete}
      onShare={handleShare}
      onExport={handleExport}
      onSetGoal={onSetGoal ? (entry) => {
        setGoalEntry(entry);
        setGoalMinutes("10");
      } : undefined}
      onStemSep={onStemSep ? (entry) => {
        const samples = entry.noteSamples ?? {};
        const firstKey = Object.keys(samples)[0];
        if (firstKey) onStemSep(samples[firstKey], entry.label || firstKey);
      } : undefined}
      accentColor={C.accent}
      openItemId={openItemId}
      setOpenItemId={setOpenItemId}
    />
  );

  return (
    <AnimatedSlideModal
      visible={visible}
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.container,
          {
            paddingTop: (insets.top || webTopInset) + 8,
            paddingBottom: (insets.bottom || webBottomInset) + 8,
            backgroundColor: C.background,
          },
        ]}
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <MaterialCommunityIcons
              name="notebook-outline"
              size={S.ms(22, 0.4)}
              color={C.accent}
            />
            <Text style={[styles.title, { color: C.text }]}>{t("practiceBook", "title")}</Text>
          </View>
          <View style={styles.headerRight}>
            <Pressable
              onPress={toggleViewMode}
              hitSlop={8}
              style={styles.viewToggleBtn}
            >
              <Ionicons
                name={viewMode === "grid" ? "grid" : "list"}
                size={S.ms(18, 0.4)}
                color={C.accent}
              />
            </Pressable>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t("a11y", "closeModal")}>
              <Ionicons name="close" size={S.ms(24, 0.4)} color={C.textSecondary} />
            </Pressable>
          </View>
        </View>

        {currentConfig && (
          <View style={styles.saveSection}>
            {showSaveInput ? (
              <View style={styles.saveInputRow}>
                <TextInput
                  ref={saveInputRef}
                  style={[styles.saveInput, { borderColor: C.accent }]}
                  value={saveLabel}
                  onChangeText={setSaveLabel}
                  placeholder={t("practiceBook", "namePlaceholder")}
                  placeholderTextColor={C.textTertiary}
                  onSubmitEditing={handleSave}
                  autoFocus
                />
                <Pressable
                  style={[
                    styles.saveConfirmBtn,
                    { backgroundColor: C.accent },
                    !saveLabel.trim() && { opacity: 0.4 },
                  ]}
                  onPress={handleSave}
                  disabled={!saveLabel.trim()}
                >
                  <Text style={styles.saveConfirmText}>{t("practiceBook", "save")}</Text>
                </Pressable>
                <Pressable
                  style={styles.saveCancelBtn}
                  onPress={() => {
                    setShowSaveInput(false);
                    setSaveLabel("");
                  }}
                >
                  <Text style={styles.saveCancelText}>{t("practiceBook", "cancel")}</Text>
                </Pressable>
              </View>
            ) : (
              <View style={{ flexDirection: "row", gap: Spacing.sm }}>
                <Pressable
                  style={[styles.saveButton, { borderColor: C.accent, flex: 1 }]}
                  onPress={() => setShowSaveInput(true)}
                >
                  <Ionicons name="add-circle-outline" size={S.ms(18, 0.4)} color={C.accent} />
                  <Text style={[styles.saveButtonText, { color: C.accent }]}>
                    {currentConfig?.mode === "note" ? t("practiceBook", "saveNoteConfig") : currentConfig?.mode === "beat" ? t("practiceBook", "saveBeatConfig") : t("practiceBook", "saveBarConfig")}
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.saveButton, { borderColor: C.accentDim, paddingHorizontal: 12 }]}
                  onPress={handleImportEntry}
                >
                  <Ionicons name="download-outline" size={S.ms(18, 0.4)} color={C.accent} />
                </Pressable>
              </View>
            )}
          </View>
        )}

        {entries.length > 0 && (
          <View style={styles.tabBar}>
            {(["all", "beat", "bar", "note"] as const).map((mode) => {
              const isActive = filterMode === mode;
              const label = mode === "all" ? t("practiceBook", "tabAll")
                : mode === "beat" ? t("practiceBook", "tabBeat")
                : mode === "bar" ? t("practiceBook", "tabBar")
                : t("practiceBook", "tabNote");
              const count = modeCounts[mode];
              return (
                <Pressable
                  key={mode}
                  onPress={() => setFilterMode(mode)}
                  style={[
                    styles.tabItem,
                    isActive && { borderBottomColor: C.accent, borderBottomWidth: 2 },
                  ]}
                >
                  <Text style={[
                    styles.tabText,
                    isActive && { color: C.accent },
                  ]}>
                    {label} {count > 0 ? `(${count})` : ""}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {filteredEntries.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons
              name="notebook-outline"
              size={S.ms(48, 0.4)}
              color={C.textTertiary}
            />
            <Text style={styles.emptyText}>{t("practiceBook", "emptyTitle")}</Text>
            <Text style={styles.emptySubtext}>
              {t("practiceBook", "emptyHint")}
            </Text>
          </View>
        ) : viewMode === "grid" ? (
          <FlatList
            key={`grid-${filterMode}`}
            data={filteredEntries}
            keyExtractor={(item) => item.id}
            numColumns={2}
            columnWrapperStyle={gridStyles.row}
            renderItem={({ item }) => (
              <GridItem
                item={item}
                onLoad={handleLoad}
                onDelete={handleDelete}
                onShare={handleShare}
                onExport={handleExport}
                accentColor={C.accent}
              />
            )}
            contentContainerStyle={gridStyles.list}
            scrollEnabled={!!filteredEntries.length}
          />
        ) : (
          <FlatList
            key={`list-${filterMode}`}
            data={filteredEntries}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            extraData={editingId}
            contentContainerStyle={styles.list}
            scrollEnabled={!!filteredEntries.length}
          />
        )}

        <ExportEntryModal
          visible={!!exportEntry}
          entry={exportEntry}
          onClose={() => setExportEntry(null)}
        />

        {goalEntry && (
          <View style={styles.goalOverlay}>
            <View style={[styles.goalDialog, { borderColor: C.accent }]}>
              <Text style={styles.goalDialogTitle}>{t("practiceBook", "goalTitle")}</Text>
              <Text style={styles.goalDialogSub}>"{goalEntry.label}" {t("practiceBook", "goalSub")}</Text>
              <View style={styles.goalInputRow}>
                <TextInput
                  style={[styles.goalInput, { borderColor: C.accent }]}
                  value={goalMinutes}
                  onChangeText={setGoalMinutes}
                  keyboardType="numeric"
                  autoFocus
                  selectTextOnFocus
                />
                <Text style={styles.goalInputUnit}>{t("practiceBook", "goalUnit")}</Text>
              </View>
              <View style={styles.goalBtnRow}>
                <Pressable
                  style={styles.goalCancelBtn}
                  onPress={() => setGoalEntry(null)}
                >
                  <Text style={styles.goalCancelText}>{t("practiceBook", "cancel")}</Text>
                </Pressable>
                <Pressable
                  style={[styles.goalConfirmBtn, { backgroundColor: C.accent }, !goalMinutes.trim() && { opacity: 0.4 }]}
                  onPress={() => {
                    const mins = parseInt(goalMinutes, 10);
                    if (!isNaN(mins) && mins > 0 && onSetGoal && goalEntry) {
                      onSetGoal(goalEntry, mins);
                      setGoalEntry(null);
                    }
                  }}
                  disabled={!goalMinutes.trim()}
                >
                  <Text style={styles.goalConfirmText}>{t("practiceBook", "goalSet")}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}
      </View>
    </AnimatedSlideModal>
  );
}

const make_styles = (C: typeof Colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  viewToggleBtn: {
    width: 32,
    height: 32,
    borderRadius: Radius.md,
    backgroundColor: C.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 18,
    color: C.text,
  },
  tabBar: {
    flexDirection: "row",
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: FontSize.small,
    color: C.textSecondary,
  },
  saveSection: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "dashed",
  },
  saveButtonText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 14,
    color: C.text,
  },
  saveInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  saveInput: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 14,
    color: C.text,
    backgroundColor: C.surface,
  },
  saveConfirmBtn: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  saveConfirmText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 14,
    color: C.white,
  },
  saveCancelBtn: {
    height: 40,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  saveCancelText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 14,
    color: C.textSecondary,
  },
  list: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
  },
  swipeContainer: {
    marginBottom: 10,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: C.surface,
  },
  actionsBackground: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: ACTION_WIDTH,
    flexDirection: "row",
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    overflow: "hidden",
  },
  swipeAction: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  swipeActionText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: FontSize.micro,
    color: "#fff",
  },
  entryCard: {
    backgroundColor: C.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
  },
  entryMain: {
    padding: 14,
    gap: 6,
  },
  entryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  entryLabel: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 15,
    color: C.text,
    flex: 1,
    marginRight: Spacing.sm,
  },
  entryDate: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: FontSize.caption,
    color: C.textTertiary,
  },
  exportIconBtn: {
    marginLeft: Spacing.sm,
    padding: Spacing.xs,
  },
  createdBy: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: FontSize.caption,
    color: C.textTertiary,
    marginTop: -2,
  },
  editInput: {
    flex: 1,
    height: 30,
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 14,
    color: C.text,
    backgroundColor: C.surfaceLight,
    marginRight: Spacing.sm,
  },
  entryDetails: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flexWrap: "wrap",
  },
  modeBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.sm,
  },
  modeBadgeText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: FontSize.micro,
    color: "#fff",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  detailChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: C.surfaceLight,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.sm,
  },
  detailValue: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: FontSize.small,
    color: C.text,
  },
  detailUnit: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: FontSize.caption,
    color: C.textSecondary,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: 40,
  },
  emptyText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 15,
    color: C.textSecondary,
    marginTop: Spacing.sm,
  },
  emptySubtext: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 13,
    color: C.textTertiary,
    textAlign: "center",
  },
  goalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  goalDialog: {
    width: "80%",
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    padding: 20,
    gap: 12,
  },
  goalDialogTitle: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 16,
    color: C.text,
    textAlign: "center",
  },
  goalDialogSub: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 13,
    color: C.textSecondary,
    textAlign: "center",
  },
  goalInputRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  goalInput: {
    width: 80,
    height: 42,
    borderWidth: 1,
    borderRadius: Radius.md,
    backgroundColor: C.surfaceLight,
    color: C.text,
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 18,
    textAlign: "center",
  },
  goalInputUnit: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 14,
    color: C.textSecondary,
  },
  goalBtnRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    marginTop: Spacing.xs,
  },
  goalCancelBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: Radius.md,
    backgroundColor: C.surfaceLight,
  },
  goalCancelText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 14,
    color: C.textSecondary,
  },
  goalConfirmBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: Radius.md,
  },
  goalConfirmText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 14,
    color: C.white,
  },
});

const make_gridStyles = (C: typeof Colors) => StyleSheet.create({
  list: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 20,
  },
  row: {
    gap: 10,
    marginBottom: 10,
  },
  card: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
    gap: 6,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.xs,
  },
  cardLabel: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 13,
    color: C.text,
    flex: 1,
  },
  modeDot: {
    width: 8,
    height: 8,
    borderRadius: Radius.xs,
  },
  exportIconBtn: {
    padding: Spacing.xs,
  },
  cardStats: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: Spacing.xs,
  },
  cardBpm: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 22,
    color: C.text,
  },
  cardUnit: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: FontSize.caption,
    color: C.textSecondary,
  },
  cardFooter: {
    gap: Spacing.xxs,
  },
  cardMeta: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: FontSize.caption,
    color: C.textSecondary,
  },
  cardPlayMode: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: FontSize.micro,
    color: C.textTertiary,
  },
  cardBy: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: FontSize.micro,
    color: C.textTertiary,
    marginTop: Spacing.xxs,
  },
});
