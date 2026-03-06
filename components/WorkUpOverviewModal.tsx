import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  Platform,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  Dimensions,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Svg, { Circle } from "react-native-svg";
import Colors from "@/constants/colors";
import { useTheme } from "@/contexts/ThemeContext";
import * as Crypto from "expo-crypto";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import * as ImagePicker from "expo-image-picker";
import {
  loadActivityLogs,
  loadGoals,
  saveGoals,
  type ActivityLog,
  type Goal,
  type PracticeSessionData,
  type PracticeRoomVisitData,
} from "@/lib/activity-log";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatDurationLocalized } from "@/lib/i18n";

interface WorkUpOverviewModalProps {
  visible: boolean;
  onClose: () => void;
  loggingEnabled: boolean;
  roomTrackingActive: boolean;
  trackingRoomName: string | null;
  onStartRoomTracking: (room: { id: string; name: string }) => void;
  onStopRoomTracking: () => void;
  username?: string;
}

type GoalTypeValue = Goal["type"];
const GOAL_TYPE_VALUES: GoalTypeValue[] = ["total_play_time", "beat_mode_time", "bar_mode_time", "room_time"];

const ROOM_COLOR = "#A371F7";

function getStartOfDay(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function getStartOfWeek(date: Date): number {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function getStartOfMonth(date: Date): number {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function getStartOfYear(date: Date): number {
  const d = new Date(date);
  d.setMonth(0, 1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

type PlayTimePeriod = "today" | "week" | "month";

function formatMinutes(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins}`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

function CircularProgress({
  size,
  strokeWidth,
  progress,
  color,
  bgColor,
  children,
}: {
  size: number;
  strokeWidth: number;
  progress: number;
  color: string;
  bgColor: string;
  children?: React.ReactNode;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedProgress = Math.min(1, Math.max(0, progress));
  const strokeDashoffset = circumference * (1 - clampedProgress);

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={bgColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      {children}
    </View>
  );
}

function DonutChart({
  size,
  strokeWidth,
  segments,
  bgColor,
  children,
}: {
  size: number;
  strokeWidth: number;
  segments: { value: number; color: string }[];
  bgColor: string;
  children?: React.ReactNode;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((s, seg) => s + seg.value, 0);

  let currentOffset = 0;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={bgColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {total > 0 && segments.map((seg, i) => {
          const pct = seg.value / total;
          const dash = circumference * pct;
          const gap = circumference - dash;
          const offset = -circumference * currentOffset;
          currentOffset += pct;
          return (
            <Circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={seg.color}
              strokeWidth={strokeWidth}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${gap}`}
              strokeDashoffset={offset}
              rotation="-90"
              origin={`${size / 2}, ${size / 2}`}
            />
          );
        })}
      </Svg>
      {children}
    </View>
  );
}

export function WorkUpOverviewModal({
  visible,
  onClose,
  loggingEnabled,
  roomTrackingActive,
  trackingRoomName,
  onStartRoomTracking,
  onStopRoomTracking,
  username,
}: WorkUpOverviewModalProps) {
  const { colors: C } = useTheme();
  const { language, t } = useLanguage();
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;

  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [newGoalType, setNewGoalType] = useState<Goal["type"]>("total_play_time");
  const [newGoalTarget, setNewGoalTarget] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [editGoalTarget, setEditGoalTarget] = useState("");

  const [playTimePeriod, setPlayTimePeriod] = useState<PlayTimePeriod>("today");
  const [showYearlySummary, setShowYearlySummary] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareBgUri, setShareBgUri] = useState<string | null>(null);
  const [shareCapturing, setShareCapturing] = useState(false);
  const shareRef = useRef<View>(null);

  const pickShareBg = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [9, 16],
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.[0]) {
      setShareBgUri(result.assets[0].uri);
    }
  }, []);

  const handleShare = useCallback(async () => {
    if (!shareRef.current) return;
    setShareCapturing(true);
    try {
      const uri = await captureRef(shareRef, {
        format: "png",
        quality: 1,
      });
      if (Platform.OS === "web") {
        const link = document.createElement("a");
        link.href = uri;
        link.download = "practice-summary.png";
        link.click();
      } else {
        const available = await Sharing.isAvailableAsync();
        if (available) {
          await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: t("workUp", "shareTitle") });
        } else {
          Alert.alert(t("workUp", "sharingNotAvailable"));
        }
      }
    } catch (e) {
      console.warn("Share error:", e);
      Alert.alert(t("workUp", "error"), t("workUp", "shareError"));
    } finally {
      setShareCapturing(false);
    }
  }, []);

  useEffect(() => {
    if (visible && loggingEnabled) {
      loadActivityLogs().then(setLogs);
      loadGoals().then(setGoals);
    }
  }, [visible, loggingEnabled]);

  const todayStart = getStartOfDay(new Date());
  const weekStart = getStartOfWeek(new Date());

  const todayLogs = useMemo(() => logs.filter((l) => l.timestamp >= todayStart), [logs, todayStart]);
  const weekLogs = useMemo(() => logs.filter((l) => l.timestamp >= weekStart), [logs, weekStart]);

  const todaySessions = useMemo(() => todayLogs.filter((l) => l.type === "practice_session"), [todayLogs]);

  const todayTotalTime = useMemo(
    () => todaySessions.reduce((s, l) => s + ((l.data as PracticeSessionData).duration || 0), 0),
    [todaySessions]
  );
  const todayBeatTime = useMemo(
    () => todaySessions.filter(l => (l.data as PracticeSessionData).mode === "dial").reduce((s, l) => s + ((l.data as PracticeSessionData).duration || 0), 0),
    [todaySessions]
  );
  const todayBarTime = useMemo(
    () => todaySessions.filter(l => (l.data as PracticeSessionData).mode === "bar").reduce((s, l) => s + ((l.data as PracticeSessionData).duration || 0), 0),
    [todaySessions]
  );

  const weekSessions = useMemo(() => weekLogs.filter((l) => l.type === "practice_session"), [weekLogs]);
  const weekTotalTime = useMemo(
    () => weekSessions.reduce((s, l) => s + ((l.data as PracticeSessionData).duration || 0), 0),
    [weekSessions]
  );
  const weekBeatTime = useMemo(
    () => weekSessions.filter(l => (l.data as PracticeSessionData).mode === "dial").reduce((s, l) => s + ((l.data as PracticeSessionData).duration || 0), 0),
    [weekSessions]
  );
  const weekBarTime = useMemo(
    () => weekSessions.filter(l => (l.data as PracticeSessionData).mode === "bar").reduce((s, l) => s + ((l.data as PracticeSessionData).duration || 0), 0),
    [weekSessions]
  );

  const monthStart = getStartOfMonth(new Date());
  const monthLogs = useMemo(() => logs.filter((l) => l.timestamp >= monthStart), [logs, monthStart]);
  const monthSessions = useMemo(() => monthLogs.filter((l) => l.type === "practice_session"), [monthLogs]);
  const monthTotalTime = useMemo(
    () => monthSessions.reduce((s, l) => s + ((l.data as PracticeSessionData).duration || 0), 0),
    [monthSessions]
  );
  const monthBeatTime = useMemo(
    () => monthSessions.filter(l => (l.data as PracticeSessionData).mode === "dial").reduce((s, l) => s + ((l.data as PracticeSessionData).duration || 0), 0),
    [monthSessions]
  );
  const monthBarTime = useMemo(
    () => monthSessions.filter(l => (l.data as PracticeSessionData).mode === "bar").reduce((s, l) => s + ((l.data as PracticeSessionData).duration || 0), 0),
    [monthSessions]
  );

  const lastYearStart = getStartOfYear(new Date(new Date().getFullYear() - 1, 0, 1));
  const lastYearEnd = getStartOfYear(new Date());
  const lastYearLogs = useMemo(() => logs.filter((l) => l.timestamp >= lastYearStart && l.timestamp < lastYearEnd), [logs, lastYearStart, lastYearEnd]);
  const lastYearSessions = useMemo(() => lastYearLogs.filter((l) => l.type === "practice_session"), [lastYearLogs]);
  const lastYearTotalTime = useMemo(
    () => lastYearSessions.reduce((s, l) => s + ((l.data as PracticeSessionData).duration || 0), 0),
    [lastYearSessions]
  );
  const lastYearBeatTime = useMemo(
    () => lastYearSessions.filter(l => (l.data as PracticeSessionData).mode === "dial").reduce((s, l) => s + ((l.data as PracticeSessionData).duration || 0), 0),
    [lastYearSessions]
  );
  const lastYearBarTime = useMemo(
    () => lastYearSessions.filter(l => (l.data as PracticeSessionData).mode === "bar").reduce((s, l) => s + ((l.data as PracticeSessionData).duration || 0), 0),
    [lastYearSessions]
  );
  const lastYearSessionCount = lastYearSessions.length;
  const hasLastYearData = lastYearTotalTime > 0;

  const periodData = useMemo(() => {
    switch (playTimePeriod) {
      case "today": return { total: todayTotalTime, beat: todayBeatTime, bar: todayBarTime };
      case "week": return { total: weekTotalTime, beat: weekBeatTime, bar: weekBarTime };
      case "month": return { total: monthTotalTime, beat: monthBeatTime, bar: monthBarTime };
    }
  }, [playTimePeriod, todayTotalTime, todayBeatTime, todayBarTime, weekTotalTime, weekBeatTime, weekBarTime, monthTotalTime, monthBeatTime, monthBarTime]);

  const periodLabel = playTimePeriod === "today" ? t("workUp", "today") : playTimePeriod === "week" ? t("workUp", "thisWeek") : t("workUp", "thisMonth");

  const cyclePeriod = useCallback((direction: 1 | -1) => {
    const periods: PlayTimePeriod[] = ["today", "week", "month"];
    const idx = periods.indexOf(playTimePeriod);
    const next = idx + direction;
    if (next >= 0 && next < periods.length) {
      setPlayTimePeriod(periods[next]);
    }
  }, [playTimePeriod]);

  const periodSessions = useMemo(() => {
    switch (playTimePeriod) {
      case "today": return todaySessions;
      case "week": return weekSessions;
      case "month": return monthSessions;
    }
  }, [playTimePeriod, todaySessions, weekSessions, monthSessions]);

  const beatSessionDetails = useMemo(() => {
    const byBpm: Record<number, { bpm: number; duration: number; count: number }> = {};
    periodSessions
      .filter(l => (l.data as PracticeSessionData).mode === "dial")
      .forEach(l => {
        const d = l.data as PracticeSessionData;
        if (!byBpm[d.bpm]) byBpm[d.bpm] = { bpm: d.bpm, duration: 0, count: 0 };
        byBpm[d.bpm].duration += d.duration;
        byBpm[d.bpm].count += 1;
      });
    return Object.values(byBpm).sort((a, b) => b.duration - a.duration);
  }, [periodSessions]);

  const barSessionDetails = useMemo(() => {
    const configs: { label: string; sublabel?: string; duration: number; count: number; bpm: number; beats: number; subdivisions: number; practiceNoteId?: string; practiceNoteLabel?: string }[] = [];
    const configMap: Record<string, number> = {};
    periodSessions
      .filter(l => (l.data as PracticeSessionData).mode === "bar")
      .forEach(l => {
        const d = l.data as PracticeSessionData;
        const noteId = d.practiceNoteId;
        const noteLabel = d.practiceNoteLabel;
        const key = noteId
          ? `note-${noteId}`
          : `${d.bpm}-${d.barConfig?.beatsPerMeasure || "?"}/${d.barConfig?.subdivisions || "?"}`;
        if (configMap[key] === undefined) {
          configMap[key] = configs.length;
          configs.push({
            label: noteLabel
              ? `\u266B ${noteLabel}`
              : `${d.bpm} BPM \u00B7 ${d.barConfig?.beatsPerMeasure || "?"}/${d.barConfig?.subdivisions || "?"}`,
            sublabel: noteLabel
              ? `${d.bpm} BPM \u00B7 ${d.barConfig?.beatsPerMeasure || "?"}/${d.barConfig?.subdivisions || "?"}`
              : undefined,
            duration: 0,
            count: 0,
            bpm: d.bpm,
            beats: d.barConfig?.beatsPerMeasure || 4,
            subdivisions: d.barConfig?.subdivisions || 1,
            practiceNoteId: noteId,
            practiceNoteLabel: noteLabel,
          });
        }
        configs[configMap[key]].duration += d.duration;
        configs[configMap[key]].count += 1;
      });
    return configs.sort((a, b) => b.duration - a.duration);
  }, [periodSessions]);

  const todayRoomTime = useMemo(
    () => todayLogs.filter(l => l.type === "practice_room_visit").reduce((s, l) => s + ((l.data as PracticeRoomVisitData).duration || 0), 0),
    [todayLogs]
  );

  const getGoalProgress = useCallback(
    (goal: Goal): number => {
      switch (goal.type) {
        case "total_play_time": return todayTotalTime / 60;
        case "beat_mode_time": return todayBeatTime / 60;
        case "bar_mode_time": return todayBarTime / 60;
        case "room_time": return todayRoomTime / 60;
        case "session_goal": {
          const sessionTime = todaySessions
            .filter(l => {
              const d = l.data as PracticeSessionData;
              return d.mode === "bar" && d.practiceNoteId === goal.practiceNoteId;
            })
            .reduce((s, l) => s + ((l.data as PracticeSessionData).duration || 0), 0);
          return sessionTime / 60;
        }
        default: return 0;
      }
    },
    [todayTotalTime, todayBeatTime, todayBarTime, todayRoomTime, todaySessions]
  );

  const handleAddGoal = useCallback(async () => {
    const target = parseInt(newGoalTarget, 10);
    if (isNaN(target) || target <= 0) return;
    const goalLabelMap: Record<GoalTypeValue, string> = {
      total_play_time: t("workUp", "totalPlayTime"),
      beat_mode_time: t("workUp", "beatModeTime"),
      bar_mode_time: t("workUp", "barModeTime"),
      room_time: t("workUp", "roomTime"),
    };
    const label = goalLabelMap[newGoalType] || "";
    const newGoal: Goal = { id: Crypto.randomUUID(), type: newGoalType, target, label };
    const updated = [...goals, newGoal];
    setGoals(updated);
    await saveGoals(updated);
    setShowAddGoal(false);
    setNewGoalTarget("");
  }, [goals, newGoalType, newGoalTarget]);

  const handleDeleteGoal = useCallback(
    async (id: string) => {
      const updated = goals.filter((g) => g.id !== id);
      setGoals(updated);
      await saveGoals(updated);
      if (editingGoalId === id) setEditingGoalId(null);
    },
    [goals, editingGoalId]
  );

  const handleUpdateGoalTarget = useCallback(
    async () => {
      if (!editingGoalId) return;
      const target = parseInt(editGoalTarget, 10);
      if (isNaN(target) || target <= 0) {
        setEditingGoalId(null);
        return;
      }
      const updated = goals.map((g) => g.id === editingGoalId ? { ...g, target } : g);
      setGoals(updated);
      await saveGoals(updated);
      setEditingGoalId(null);
    },
    [goals, editingGoalId, editGoalTarget]
  );

  const BEAT_COLOR = "#58A6FF";
  const BAR_COLOR = "#F0883E";

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={s.overlay} onPress={onClose}>
        <ScrollView
          style={{ marginTop: (insets.top || webTopInset) + 44 }}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
          onStartShouldSetResponder={() => true}
        >
          <Pressable style={[s.sheet, { backgroundColor: Colors.surface }]} onPress={(e) => e.stopPropagation()}>

            <View style={s.header}>
              <Text style={s.title}>Work Up</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                {loggingEnabled && (
                  <Pressable onPress={() => setShowShareModal(true)} hitSlop={12}>
                    <Ionicons name="share-outline" size={20} color={C.accent} />
                  </Pressable>
                )}
                <Pressable onPress={onClose} hitSlop={12}>
                  <Ionicons name="close" size={22} color={Colors.textSecondary} />
                </Pressable>
              </View>
            </View>

            {!loggingEnabled ? (
              <View style={s.disabledWrap}>
                <MaterialCommunityIcons name="chart-line" size={48} color={Colors.textTertiary} />
                <Text style={s.disabledText}>Enable activity logging in Settings to track your practice</Text>
              </View>
            ) : (
              <>
                {/* ── Goals (top) ── */}
                <View style={s.card}>
                  <View style={s.cardHeader}>
                    <View style={s.cardHeaderLeft}>
                      <Ionicons name="flag" size={16} color={C.accent} />
                      <Text style={[s.cardTitle, { color: C.accent }]}>Goals</Text>
                    </View>
                    <Pressable testID="add-goal-btn" onPress={() => setShowAddGoal(!showAddGoal)} hitSlop={12} style={{ padding: 4 }}>
                      <Ionicons name={showAddGoal ? "close-circle" : "add-circle"} size={20} color={C.accent} />
                    </Pressable>
                  </View>

                  {showAddGoal && (
                    <View style={[s.addForm, { borderColor: C.accentDim }]}>
                      <View style={s.goalTypeRow}>
                        {GOAL_TYPE_VALUES.map((val) => {
                          const shortMap: Record<GoalTypeValue, string> = {
                            total_play_time: t("workUp", "totalShort"),
                            beat_mode_time: t("workUp", "beatShort"),
                            bar_mode_time: t("workUp", "barShort"),
                            room_time: t("workUp", "roomShort"),
                          };
                          return (
                          <Pressable
                            key={val}
                            style={[s.goalTypeChip, newGoalType === val && { borderColor: C.accent, backgroundColor: C.accentDim }]}
                            onPress={() => setNewGoalType(val)}
                          >
                            <Text style={[s.goalTypeChipText, newGoalType === val && { color: C.accent }]} numberOfLines={1}>
                              {shortMap[val]}
                            </Text>
                          </Pressable>
                          );
                        })}
                      </View>
                      <View style={s.addFormRow}>
                        <TextInput
                          style={[s.formInput, { borderColor: C.accentMuted }]}
                          value={newGoalTarget}
                          onChangeText={setNewGoalTarget}
                          placeholder={t("workUp", "minutesPlaceholder")}
                          placeholderTextColor={Colors.textTertiary}
                          keyboardType="numeric"
                        />
                        <Pressable style={[s.formSaveBtn, { backgroundColor: C.accent }]} onPress={handleAddGoal}>
                          <Ionicons name="checkmark" size={16} color={Colors.surface} />
                        </Pressable>
                      </View>
                    </View>
                  )}

                  {goals.length === 0 && !showAddGoal ? (
                    <Text style={s.emptyHint}>Tap + to set a practice goal</Text>
                  ) : (
                    goals.map((goal) => {
                      const progress = getGoalProgress(goal);
                      const pct = Math.min(1, progress / goal.target);
                      const goalColor = goal.type === "beat_mode_time" ? BEAT_COLOR : goal.type === "bar_mode_time" ? BAR_COLOR : goal.type === "room_time" ? ROOM_COLOR : goal.type === "session_goal" ? BAR_COLOR : C.accent;
                      const isEditing = editingGoalId === goal.id;
                      return (
                        <Pressable
                          key={goal.id}
                          style={s.goalRow}
                          onLongPress={() => {
                            setEditingGoalId(goal.id);
                            setEditGoalTarget(String(goal.target));
                          }}
                          delayLongPress={500}
                        >
                          <CircularProgress size={44} strokeWidth={4} progress={pct} color={goalColor} bgColor={Colors.surfaceLight}>
                            <Text style={[s.goalPct, { color: goalColor }]}>{Math.round(pct * 100)}%</Text>
                          </CircularProgress>
                          <View style={s.goalInfo}>
                            <Text style={s.goalLabel}>{goal.label}</Text>
                            {isEditing ? (
                              <View style={s.goalEditRow}>
                                <TextInput
                                  style={[s.goalEditInput, { borderColor: goalColor }]}
                                  value={editGoalTarget}
                                  onChangeText={setEditGoalTarget}
                                  keyboardType="numeric"
                                  autoFocus
                                  selectTextOnFocus
                                  onSubmitEditing={handleUpdateGoalTarget}
                                />
                                <Text style={s.goalEditUnit}>분</Text>
                                <Pressable style={[s.goalEditSave, { backgroundColor: goalColor }]} onPress={handleUpdateGoalTarget}>
                                  <Ionicons name="checkmark" size={14} color={Colors.surface} />
                                </Pressable>
                                <Pressable style={s.goalEditCancel} onPress={() => setEditingGoalId(null)}>
                                  <Ionicons name="close" size={14} color={Colors.textTertiary} />
                                </Pressable>
                              </View>
                            ) : (
                              <Text style={s.goalProgress}>
                                {Math.round(progress)}m / {goal.target}m
                              </Text>
                            )}
                          </View>
                          <Pressable onPress={() => handleDeleteGoal(goal.id)} hitSlop={8}>
                            <Ionicons name="trash-outline" size={14} color={Colors.textTertiary} />
                          </Pressable>
                        </Pressable>
                      );
                    })
                  )}
                </View>

                {/* ── Play Time (Today / Week / Month) ── */}
                <View style={s.card}>
                  <View style={s.cardHeader}>
                    <Pressable onPress={() => cyclePeriod(-1)} hitSlop={12} style={{ opacity: playTimePeriod === "today" ? 0.2 : 1 }}>
                      <Ionicons name="chevron-back" size={18} color={C.accent} />
                    </Pressable>
                    <View style={s.cardHeaderLeft}>
                      <Ionicons name="time-outline" size={16} color={C.accent} />
                      <Text style={[s.cardTitle, { color: Colors.text }]}>{periodLabel}</Text>
                    </View>
                    <Pressable onPress={() => cyclePeriod(1)} hitSlop={12} style={{ opacity: playTimePeriod === "month" ? 0.2 : 1 }}>
                      <Ionicons name="chevron-forward" size={18} color={C.accent} />
                    </Pressable>
                  </View>

                  <View style={s.periodDots}>
                    {(["today", "week", "month"] as PlayTimePeriod[]).map((p) => (
                      <View key={p} style={[s.periodDot, { backgroundColor: p === playTimePeriod ? C.accent : Colors.surfaceLight }]} />
                    ))}
                  </View>

                  <View style={s.donutRow}>
                    <DonutChart
                      size={120}
                      strokeWidth={10}
                      segments={[
                        { value: periodData.beat || 0.01, color: BEAT_COLOR },
                        { value: periodData.bar || 0.01, color: BAR_COLOR },
                      ]}
                      bgColor={Colors.surfaceLight}
                    >
                      <Text style={[s.donutCenter, { color: C.accent }]}>{formatMinutes(periodData.total)}</Text>
                      <Text style={s.donutUnit}>{t("workUp", "goalUnit")}</Text>
                    </DonutChart>

                    <View style={s.donutLegend}>
                      <View style={s.legendItem}>
                        <View style={[s.legendDot, { backgroundColor: BEAT_COLOR }]} />
                        <View>
                          <Text style={s.legendLabel}>{t("workUp", "beatMode")}</Text>
                          <Text style={[s.legendValue, { color: BEAT_COLOR }]}>{formatDurationLocalized(periodData.beat, language)}</Text>
                        </View>
                      </View>
                      <View style={s.legendItem}>
                        <View style={[s.legendDot, { backgroundColor: BAR_COLOR }]} />
                        <View>
                          <Text style={s.legendLabel}>{t("workUp", "barMode")}</Text>
                          <Text style={[s.legendValue, { color: BAR_COLOR }]}>{formatDurationLocalized(periodData.bar, language)}</Text>
                        </View>
                      </View>
                      <View style={s.legendItem}>
                        <View style={[s.legendDot, { backgroundColor: C.accent }]} />
                        <View>
                          <Text style={s.legendLabel}>{t("workUp", "total")}</Text>
                          <Text style={[s.legendValue, { color: C.accent }]}>{formatDurationLocalized(periodData.total, language)}</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                </View>

                {goals.length > 0 && goals.some(g => getGoalProgress(g) >= g.target) && (
                  <View style={s.card}>
                    <View style={s.cardHeader}>
                      <View style={s.cardHeaderLeft}>
                        <Ionicons name="checkmark-done" size={16} color="#3fb950" />
                        <Text style={[s.cardTitle, { color: "#3fb950" }]}>{t("workUp", "completedGoals")}</Text>
                      </View>
                    </View>
                    {goals.filter(g => getGoalProgress(g) >= g.target).map((goal) => {
                      const progress = getGoalProgress(goal);
                      const goalColor = goal.type === "beat_mode_time" ? BEAT_COLOR : goal.type === "bar_mode_time" ? BAR_COLOR : goal.type === "room_time" ? ROOM_COLOR : goal.type === "session_goal" ? BAR_COLOR : C.accent;
                      return (
                        <View key={goal.id} style={s.goalRow}>
                          <View style={[s.completedIcon, { backgroundColor: "rgba(63, 185, 80, 0.15)" }]}>
                            <Ionicons name="checkmark-circle" size={22} color="#3fb950" />
                          </View>
                          <View style={s.goalInfo}>
                            <Text style={s.goalLabel}>{goal.label}</Text>
                            <Text style={[s.goalProgress, { color: "#3fb950" }]}>
                              {Math.round(progress)}m / {goal.target}m ✓
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}

                {hasLastYearData && (
                  <Pressable style={[s.card, { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]} onPress={() => setShowYearlySummary(true)}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <Ionicons name="trophy-outline" size={20} color="#FFD700" />
                      <Text style={[s.cardTitle, { color: Colors.text }]}>{new Date().getFullYear() - 1} Year in Review</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
                  </Pressable>
                )}

                {/* ── Detailed Breakdown (+ button) ── */}
                <View style={s.card}>
                  <Pressable style={s.cardHeader} onPress={() => setShowDetails(!showDetails)}>
                    <View style={s.cardHeaderLeft}>
                      <MaterialCommunityIcons name="format-list-bulleted" size={16} color={C.accent} />
                      <Text style={[s.cardTitle, { color: Colors.text }]}>Session Details</Text>
                    </View>
                    <Ionicons name={showDetails ? "chevron-up" : "chevron-down"} size={18} color={Colors.textSecondary} />
                  </Pressable>

                  {showDetails && (
                    <View style={s.detailsWrap}>
                      {/* Beat mode details */}
                      {beatSessionDetails.length > 0 && (
                        <View style={s.detailSection}>
                          <View style={s.detailSectionHeader}>
                            <View style={[s.legendDot, { backgroundColor: BEAT_COLOR }]} />
                            <Text style={[s.detailSectionTitle, { color: BEAT_COLOR }]}>{t("workUp", "beatModeSessions")}</Text>
                          </View>
                          {beatSessionDetails.map((sess, i) => (
                            <View key={i} style={s.detailRow}>
                              <View style={s.detailInfo}>
                                <Text style={s.detailMain}>{sess.bpm} BPM</Text>
                                <Text style={s.detailSub}>{sess.count} session{sess.count > 1 ? "s" : ""}</Text>
                              </View>
                              <Text style={[s.detailTime, { color: BEAT_COLOR }]}>{formatDurationLocalized(sess.duration, language)}</Text>
                            </View>
                          ))}
                        </View>
                      )}

                      {/* Bar mode details */}
                      {barSessionDetails.length > 0 && (
                        <View style={s.detailSection}>
                          <View style={s.detailSectionHeader}>
                            <View style={[s.legendDot, { backgroundColor: BAR_COLOR }]} />
                            <Text style={[s.detailSectionTitle, { color: BAR_COLOR }]}>{t("workUp", "barModeSessions")}</Text>
                          </View>
                          {barSessionDetails.map((sess, i) => (
                            <View key={i} style={s.detailRow}>
                              <View style={s.detailInfo}>
                                <Text style={s.detailMain}>{sess.label}</Text>
                                {sess.sublabel && (
                                  <Text style={s.detailSub}>{sess.sublabel}</Text>
                                )}
                                <Text style={s.detailSub}>{sess.count} session{sess.count > 1 ? "s" : ""}</Text>
                              </View>
                              <Text style={[s.detailTime, { color: BAR_COLOR }]}>{formatDurationLocalized(sess.duration, language)}</Text>
                            </View>
                          ))}
                        </View>
                      )}

                      {beatSessionDetails.length === 0 && barSessionDetails.length === 0 && (
                        <Text style={s.emptyHint}>No sessions recorded {periodLabel.toLowerCase()}</Text>
                      )}
                    </View>
                  )}
                </View>

              </>
            )}
          </Pressable>
        </ScrollView>
      </Pressable>

      {/* ── Share Summary Modal ── */}
      <Modal visible={showShareModal} animationType="slide" transparent onRequestClose={() => setShowShareModal(false)} statusBarTranslucent>
        <View style={shareStyles.overlay}>
          <View style={[shareStyles.container, { paddingTop: (insets.top || webTopInset) + 10, paddingBottom: insets.bottom + 10 }]}>
            <View style={shareStyles.topBar}>
              <Pressable onPress={() => setShowShareModal(false)} hitSlop={12}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </Pressable>
              <Text style={shareStyles.topTitle}>{t("workUp", "shareSummary")}</Text>
              <Pressable onPress={handleShare} disabled={shareCapturing} style={[shareStyles.shareBtn, { backgroundColor: C.accent }]}>
                {shareCapturing ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={shareStyles.shareBtnText}>{t("workUp", "share")}</Text>
                )}
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={shareStyles.scrollContent} showsVerticalScrollIndicator={false}>
              <View ref={shareRef} collapsable={false} style={shareStyles.cardOuter}>
                <View style={[shareStyles.card, { backgroundColor: shareBgUri ? "transparent" : Colors.background }]}>
                  {shareBgUri && (
                    <Image source={{ uri: shareBgUri }} style={shareStyles.bgImage} blurRadius={2} />
                  )}
                  {shareBgUri && (
                    <View style={shareStyles.bgOverlay} />
                  )}

                  <View style={shareStyles.cardContent}>
                    <View style={shareStyles.brandRow}>
                      <Text style={[shareStyles.brandText, { color: C.accent }]}>PurPors</Text>
                      {username ? (
                        <Text style={shareStyles.usernameText}>{username}</Text>
                      ) : null}
                    </View>

                    <Text style={shareStyles.dateText}>
                      {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                    </Text>

                    <View style={shareStyles.comboSection}>
                      <View style={shareStyles.bigTimeWrap}>
                        <Text style={[shareStyles.bigTime, { color: "#fff" }]}>{formatMinutes(todayTotalTime)}</Text>
                        <Text style={shareStyles.bigTimeUnit}>{t("workUp", "goalUnit")}</Text>
                      </View>
                      <View style={shareStyles.barChart}>
                        <View style={shareStyles.barRow}>
                          <Text style={shareStyles.barLabel}>{t("workUp", "beatShort")}</Text>
                          <View style={shareStyles.barTrack}>
                            <View style={[shareStyles.barFill, {
                              backgroundColor: BEAT_COLOR,
                              width: todayTotalTime > 0 ? `${Math.max(5, (todayBeatTime / todayTotalTime) * 100)}%` : "5%"
                            }]} />
                          </View>
                          <Text style={[shareStyles.barValue, { color: BEAT_COLOR }]}>{formatDurationLocalized(todayBeatTime, language)}</Text>
                        </View>
                        <View style={shareStyles.barRow}>
                          <Text style={shareStyles.barLabel}>{t("workUp", "barShort")}</Text>
                          <View style={shareStyles.barTrack}>
                            <View style={[shareStyles.barFill, {
                              backgroundColor: BAR_COLOR,
                              width: todayTotalTime > 0 ? `${Math.max(5, (todayBarTime / todayTotalTime) * 100)}%` : "5%"
                            }]} />
                          </View>
                          <Text style={[shareStyles.barValue, { color: BAR_COLOR }]}>{formatDurationLocalized(todayBarTime, language)}</Text>
                        </View>
                      </View>
                    </View>

                    {goals.length > 0 && (
                      <View style={shareStyles.goalsSection}>
                        <Text style={shareStyles.sectionTitle}>Goals</Text>
                        {[...goals].sort((a, b) => {
                          const aCompleted = getGoalProgress(a) >= a.target ? 1 : 0;
                          const bCompleted = getGoalProgress(b) >= b.target ? 1 : 0;
                          if (aCompleted !== bCompleted) return bCompleted - aCompleted;
                          return (getGoalProgress(b) / b.target) - (getGoalProgress(a) / a.target);
                        }).map((goal) => {
                          const progress = getGoalProgress(goal);
                          const pct = Math.min(1, progress / goal.target);
                          const goalColor = goal.type === "beat_mode_time" ? BEAT_COLOR : goal.type === "bar_mode_time" ? BAR_COLOR : goal.type === "room_time" ? ROOM_COLOR : C.accent;
                          const completed = pct >= 1;
                          return (
                            <View key={goal.id} style={shareStyles.goalItem}>
                              <View style={shareStyles.goalLeft}>
                                <Ionicons name={completed ? "checkmark-circle" : "ellipse-outline"} size={16} color={completed ? "#3fb950" : goalColor} />
                                <Text style={[shareStyles.goalText, completed && { color: "#3fb950" }]}>{goal.label}</Text>
                              </View>
                              <Text style={[shareStyles.goalProg, { color: completed ? "#3fb950" : goalColor }]}>
                                {Math.round(progress)}m / {goal.target}m{completed ? " ✓" : ""}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    )}

                    {(beatSessionDetails.length > 0 || barSessionDetails.length > 0) && (
                      <View style={shareStyles.goalsSection}>
                        <Text style={shareStyles.sectionTitle}>{t("workUp", "sessionDetails")}</Text>
                        {beatSessionDetails.map((sess, i) => (
                          <View key={`b${i}`} style={shareStyles.goalItem}>
                            <View style={shareStyles.goalLeft}>
                              <View style={[shareStyles.shareDot, { backgroundColor: BEAT_COLOR }]} />
                              <Text style={shareStyles.goalText}>{sess.bpm} BPM</Text>
                            </View>
                            <Text style={[shareStyles.goalProg, { color: BEAT_COLOR }]}>
                              {formatDurationLocalized(sess.duration, language)}
                            </Text>
                          </View>
                        ))}
                        {barSessionDetails.map((sess, i) => (
                          <View key={`r${i}`} style={shareStyles.goalItem}>
                            <View style={shareStyles.goalLeft}>
                              <View style={[shareStyles.shareDot, { backgroundColor: BAR_COLOR }]} />
                              <Text style={shareStyles.goalText} numberOfLines={1}>{sess.label}</Text>
                            </View>
                            <Text style={[shareStyles.goalProg, { color: BAR_COLOR }]}>
                              {formatDurationLocalized(sess.duration, language)}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                </View>
              </View>

              {/* Background option */}
              <View style={shareStyles.bgOptions}>
                <Text style={shareStyles.bgTitle}>Background</Text>
                <View style={shareStyles.bgRow}>
                  <Pressable
                    style={[shareStyles.bgChip, shareBgUri ? { borderColor: C.accent, backgroundColor: C.accentDim } : {}]}
                    onPress={pickShareBg}
                  >
                    {shareBgUri ? (
                      <Image source={{ uri: shareBgUri }} style={shareStyles.bgPreview} />
                    ) : (
                      <View style={[shareStyles.bgPreview, { backgroundColor: Colors.surfaceLight }]}>
                        <Ionicons name="image-outline" size={14} color={Colors.textTertiary} />
                      </View>
                    )}
                    <Text style={[shareStyles.bgChipText, shareBgUri ? { color: C.accent } : {}]}>Custom Image</Text>
                  </Pressable>
                  {shareBgUri && (
                    <Pressable
                      style={[shareStyles.bgChip, { borderColor: Colors.border }]}
                      onPress={() => setShareBgUri(null)}
                    >
                      <View style={[shareStyles.bgPreview, { backgroundColor: Colors.background }]} />
                      <Text style={shareStyles.bgChipText}>Reset</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Yearly Summary Modal ── */}
      <Modal visible={showYearlySummary} animationType="fade" transparent onRequestClose={() => setShowYearlySummary(false)} statusBarTranslucent>
        <Pressable style={yearStyles.overlay} onPress={() => setShowYearlySummary(false)}>
          <Pressable style={[yearStyles.card, { backgroundColor: Colors.surface }]} onPress={(e) => e.stopPropagation()}>
            <View style={yearStyles.header}>
              <Ionicons name="trophy" size={28} color="#FFD700" />
              <Text style={yearStyles.title}>{new Date().getFullYear() - 1} Year in Review</Text>
              <Pressable onPress={() => setShowYearlySummary(false)} hitSlop={12}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </Pressable>
            </View>

            <View style={yearStyles.bigStat}>
              <Text style={[yearStyles.bigNum, { color: C.accent }]}>{formatMinutes(lastYearTotalTime)}</Text>
              <Text style={yearStyles.bigLabel}>{t("workUp", "minutesPracticed")}</Text>
            </View>

            <View style={yearStyles.statsGrid}>
              <View style={yearStyles.statItem}>
                <Text style={[yearStyles.statVal, { color: BEAT_COLOR }]}>{formatDurationLocalized(lastYearBeatTime, language)}</Text>
                <Text style={yearStyles.statLabel}>{t("workUp", "beatMode")}</Text>
              </View>
              <View style={yearStyles.statItem}>
                <Text style={[yearStyles.statVal, { color: BAR_COLOR }]}>{formatDurationLocalized(lastYearBarTime, language)}</Text>
                <Text style={yearStyles.statLabel}>{t("workUp", "barMode")}</Text>
              </View>
              <View style={yearStyles.statItem}>
                <Text style={[yearStyles.statVal, { color: C.accent }]}>{lastYearSessionCount}</Text>
                <Text style={yearStyles.statLabel}>{t("workUp", "sessions")}</Text>
              </View>
            </View>

            <Text style={yearStyles.footerText}>{t("workUp", "keepUp")}</Text>
          </Pressable>
        </Pressable>
      </Modal>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
  },
  scrollContent: {
    paddingHorizontal: 14,
    paddingBottom: 50,
  },
  sheet: {
    borderRadius: 20,
    padding: 16,
    gap: 12,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  title: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 20,
    color: Colors.text,
    letterSpacing: 0.3,
  },
  disabledWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    gap: 14,
  },
  disabledText: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  cardTitle: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 14,
    letterSpacing: 0.2,
  },
  emptyHint: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 12,
    color: Colors.textTertiary,
    textAlign: "center",
    paddingVertical: 6,
  },

  // Goals
  goalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 4,
  },
  goalPct: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 10,
  },
  goalInfo: {
    flex: 1,
    gap: 2,
  },
  goalLabel: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 13,
    color: Colors.text,
  },
  goalProgress: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
  },
  completedIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  goalEditRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  goalEditInput: {
    width: 56,
    height: 28,
    borderWidth: 1,
    borderRadius: 6,
    backgroundColor: Colors.surfaceLight,
    color: Colors.text,
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 0,
  },
  goalEditUnit: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
  },
  goalEditSave: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  goalEditCancel: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surfaceLight,
  },
  goalTypeRow: {
    flexDirection: "row",
    gap: 6,
  },
  goalTypeChip: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
  },
  goalTypeChipText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 12,
    color: Colors.textSecondary,
  },

  // Forms
  addForm: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    gap: 8,
  },
  addFormRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  formInput: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 13,
    color: Colors.text,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    flex: 1,
  },
  formSaveBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  formHint: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
  },

  // Donut
  donutRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
    paddingVertical: 4,
  },
  donutCenter: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 22,
  },
  donutUnit: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 10,
    color: Colors.textSecondary,
    marginTop: -2,
  },
  donutLegend: {
    gap: 10,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
  },
  legendValue: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 13,
  },

  // Week
  weekGrid: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingVertical: 4,
  },
  weekStat: {
    alignItems: "center",
    gap: 2,
    flex: 1,
  },
  weekValue: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 15,
  },
  weekLabel: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
  },
  weekDivider: {
    width: 1,
    height: 28,
  },

  // Details
  detailsWrap: {
    gap: 14,
  },
  detailSection: {
    gap: 6,
  },
  detailSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 2,
  },
  detailSectionTitle: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 12,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 3,
    paddingLeft: 16,
  },
  detailInfo: {
    flex: 1,
    gap: 1,
  },
  detailMain: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 12,
    color: Colors.text,
  },
  detailSub: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 10,
    color: Colors.textTertiary,
  },
  detailTime: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 12,
  },
  detailTimeSec: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 12,
    color: Colors.textSecondary,
  },

  // Practice rooms
  trackingBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    backgroundColor: "rgba(63, 185, 80, 0.08)",
  },
  trackingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.success,
  },
  trackingText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 12,
    flex: 1,
  },
  trackingStopBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  trackingStopText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 11,
    color: Colors.white,
  },
  roomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  roomInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  roomName: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 13,
    color: Colors.text,
    flex: 1,
  },
  roomActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  roomStat: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
  },
  roomStartBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  periodDots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    marginTop: -4,
    marginBottom: 4,
  },
  periodDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});

const shareStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  topTitle: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 16,
    color: Colors.text,
  },
  shareBtn: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 70,
    alignItems: "center",
  },
  shareBtnText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 14,
    color: "#fff",
  },
  scrollContent: {
    alignItems: "center",
    paddingBottom: 30,
  },
  cardOuter: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 24,
    overflow: "hidden",
  },
  card: {
    borderRadius: 24,
    overflow: "hidden",
    minHeight: 320,
  },
  bgImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
    resizeMode: "cover" as any,
  },
  bgOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  cardContent: {
    padding: 28,
    gap: 20,
    zIndex: 1,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  brandText: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 16,
    letterSpacing: 1,
  },
  usernameText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 13,
    color: "#ffffffcc",
  },
  dateText: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 12,
    color: "#ffffffaa",
    marginTop: -12,
  },
  comboSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  bigTimeWrap: {
    alignItems: "center",
  },
  bigTime: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 48,
    lineHeight: 54,
  },
  bigTimeUnit: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 12,
    color: "#ffffff88",
    marginTop: 2,
  },
  barChart: {
    flex: 1,
    gap: 10,
  },
  barRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  barLabel: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 12,
    color: "#ffffffbb",
    width: 36,
  },
  barTrack: {
    flex: 1,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#ffffff15",
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 5,
  },
  barValue: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 12,
    width: 50,
    textAlign: "right",
  },
  goalsSection: {
    gap: 8,
  },
  sectionTitle: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 13,
    color: "#ffffffcc",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  goalItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  goalLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  goalText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 13,
    color: "#ffffffdd",
  },
  goalProg: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 12,
  },
  shareDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  weekSection: {
    gap: 10,
  },
  weekRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    backgroundColor: "#ffffff10",
    borderRadius: 14,
    paddingVertical: 14,
  },
  weekItem: {
    alignItems: "center",
    flex: 1,
  },
  weekVal: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 15,
  },
  weekLbl: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 11,
    color: "#ffffff88",
    marginTop: 2,
  },
  weekDivider: {
    width: 1,
    height: 28,
  },
  bgOptions: {
    marginTop: 20,
    gap: 10,
    width: "100%",
    maxWidth: 360,
  },
  bgTitle: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  bgRow: {
    flexDirection: "row",
    gap: 12,
  },
  bgChip: {
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 10,
    flex: 1,
  },
  bgPreview: {
    width: 50,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  bgChipText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 11,
    color: Colors.textSecondary,
  },
});

const yearStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    gap: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    width: "100%",
    justifyContent: "center",
  },
  title: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 18,
    color: Colors.text,
    flex: 1,
  },
  bigStat: {
    alignItems: "center",
    gap: 4,
  },
  bigNum: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 56,
    lineHeight: 62,
  },
  bigLabel: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  statsGrid: {
    flexDirection: "row",
    width: "100%",
    justifyContent: "space-around",
    backgroundColor: Colors.surfaceLight,
    borderRadius: 14,
    paddingVertical: 14,
  },
  statItem: {
    alignItems: "center",
    gap: 4,
  },
  statVal: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 16,
  },
  statLabel: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  footerText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
  },
});
