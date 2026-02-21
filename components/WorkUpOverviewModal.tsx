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
  type FeatureUsageData,
  type PracticeRoomVisitData,
} from "@/lib/activity-log";
import {
  loadPracticeRooms,
  addPracticeRoom,
  deletePracticeRoom,
  requestLocationPermission,
  type PracticeRoom,
} from "@/lib/practice-room";

interface WorkUpOverviewModalProps {
  visible: boolean;
  onClose: () => void;
  loggingEnabled: boolean;
  roomTrackingActive: boolean;
  trackingRoomName: string | null;
  onStartRoomTracking: (room: { id: string; name: string }) => void;
  onStopRoomTracking: () => void;
}

const GOAL_TYPE_OPTIONS: { value: Goal["type"]; label: string; short: string }[] = [
  { value: "total_play_time", label: "Total Play Time", short: "Total" },
  { value: "beat_mode_time", label: "Beat Mode Time", short: "Beat" },
  { value: "bar_mode_time", label: "Bar Mode Time", short: "Bar" },
  { value: "room_time", label: "Practice Room Time", short: "Room" },
];

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

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins < 60) return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return remainMins > 0 ? `${hrs}h ${remainMins}m` : `${hrs}h`;
}

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
}: WorkUpOverviewModalProps) {
  const { colors: C } = useTheme();
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

  const [practiceRooms, setPracticeRooms] = useState<PracticeRoom[]>([]);
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [addingRoom, setAddingRoom] = useState(false);

  const [showShareModal, setShowShareModal] = useState(false);
  const [shareBgMode, setShareBgMode] = useState<"grayscale" | "custom">("grayscale");
  const [shareBgUri, setShareBgUri] = useState<string | null>(null);
  const [shareCapturing, setShareCapturing] = useState(false);
  const shareRef = useRef<View>(null);

  const grayscaleColors = useMemo(() => {
    const hues = ["#1a1a2e", "#16213e", "#0f3460", "#1a1a1a", "#2d2d2d", "#1e1e2f", "#0d1117", "#161b22", "#21262d", "#282c34"];
    const idx = Math.floor(Math.random() * hues.length);
    return { bg: hues[idx], secondary: "#ffffff15" };
  }, [showShareModal]);

  const pickShareBg = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [9, 16],
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.[0]) {
      setShareBgUri(result.assets[0].uri);
      setShareBgMode("custom");
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
          await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "Share Practice Summary" });
        } else {
          Alert.alert("Sharing not available on this device");
        }
      }
    } catch (e) {
      console.warn("Share error:", e);
      Alert.alert("Error", "Could not capture or share the image.");
    } finally {
      setShareCapturing(false);
    }
  }, []);

  useEffect(() => {
    if (visible && loggingEnabled) {
      loadActivityLogs().then(setLogs);
      loadGoals().then(setGoals);
      loadPracticeRooms().then(setPracticeRooms);
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

  const featureUsage = useMemo(() => {
    const usage: Record<string, number> = { tuner: 0, signal_generator: 0, practice_note: 0 };
    todayLogs.filter((l) => l.type === "feature_usage").forEach((l) => {
      const data = l.data as FeatureUsageData;
      usage[data.feature] = (usage[data.feature] || 0) + data.duration;
    });
    return usage;
  }, [todayLogs]);

  const beatSessionDetails = useMemo(() => {
    const byBpm: Record<number, { bpm: number; duration: number; count: number }> = {};
    todaySessions
      .filter(l => (l.data as PracticeSessionData).mode === "dial")
      .forEach(l => {
        const d = l.data as PracticeSessionData;
        if (!byBpm[d.bpm]) byBpm[d.bpm] = { bpm: d.bpm, duration: 0, count: 0 };
        byBpm[d.bpm].duration += d.duration;
        byBpm[d.bpm].count += 1;
      });
    return Object.values(byBpm).sort((a, b) => b.duration - a.duration);
  }, [todaySessions]);

  const barSessionDetails = useMemo(() => {
    const configs: { label: string; sublabel?: string; duration: number; count: number; bpm: number; beats: number; subdivisions: number; practiceNoteId?: string; practiceNoteLabel?: string }[] = [];
    const configMap: Record<string, number> = {};
    todaySessions
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
  }, [todaySessions]);

  const todayRoomTime = useMemo(
    () => todayLogs.filter(l => l.type === "practice_room_visit").reduce((s, l) => s + ((l.data as PracticeRoomVisitData).duration || 0), 0),
    [todayLogs]
  );

  const roomVisitStats = useMemo(() => {
    const visits: Record<string, { name: string; totalDuration: number; visitCount: number }> = {};
    logs.filter((l) => l.type === "practice_room_visit").forEach((l) => {
      const data = l.data as PracticeRoomVisitData;
      if (!visits[data.roomId]) visits[data.roomId] = { name: data.roomName, totalDuration: 0, visitCount: 0 };
      visits[data.roomId].totalDuration += data.duration;
      visits[data.roomId].visitCount += 1;
    });
    return Object.entries(visits).sort(([, a], [, b]) => b.totalDuration - a.totalDuration);
  }, [logs]);

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
    const label = GOAL_TYPE_OPTIONS.find((o) => o.value === newGoalType)?.label || "";
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

  const handleAddRoom = useCallback(async () => {
    if (!newRoomName.trim()) return;
    setAddingRoom(true);
    const granted = await requestLocationPermission();
    if (!granted) {
      setAddingRoom(false);
      Alert.alert("Permission Needed", "Location permission is required to register a practice room.");
      return;
    }
    const room = await addPracticeRoom(newRoomName.trim());
    if (room) {
      setPracticeRooms((prev) => [...prev, room]);
      setNewRoomName("");
      setShowAddRoom(false);
    } else {
      Alert.alert("Error", "Could not get your current location. Please try again.");
    }
    setAddingRoom(false);
  }, [newRoomName]);

  const handleDeleteRoom = useCallback(async (id: string) => {
    await deletePracticeRoom(id);
    setPracticeRooms((prev) => prev.filter((r) => r.id !== id));
  }, []);

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
                        {GOAL_TYPE_OPTIONS.map((opt) => (
                          <Pressable
                            key={opt.value}
                            style={[s.goalTypeChip, newGoalType === opt.value && { borderColor: C.accent, backgroundColor: C.accentDim }]}
                            onPress={() => setNewGoalType(opt.value)}
                          >
                            <Text style={[s.goalTypeChipText, newGoalType === opt.value && { color: C.accent }]} numberOfLines={1}>
                              {opt.short}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                      <View style={s.addFormRow}>
                        <TextInput
                          style={[s.formInput, { borderColor: C.accentMuted }]}
                          value={newGoalTarget}
                          onChangeText={setNewGoalTarget}
                          placeholder="Minutes"
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

                {/* ── Play Time Donut ── */}
                <View style={s.card}>
                  <View style={s.cardHeader}>
                    <View style={s.cardHeaderLeft}>
                      <Ionicons name="time-outline" size={16} color={C.accent} />
                      <Text style={[s.cardTitle, { color: Colors.text }]}>Today's Play Time</Text>
                    </View>
                  </View>

                  <View style={s.donutRow}>
                    <DonutChart
                      size={120}
                      strokeWidth={10}
                      segments={[
                        { value: todayBeatTime || 0.01, color: BEAT_COLOR },
                        { value: todayBarTime || 0.01, color: BAR_COLOR },
                      ]}
                      bgColor={Colors.surfaceLight}
                    >
                      <Text style={[s.donutCenter, { color: C.accent }]}>{formatMinutes(todayTotalTime)}</Text>
                      <Text style={s.donutUnit}>min</Text>
                    </DonutChart>

                    <View style={s.donutLegend}>
                      <View style={s.legendItem}>
                        <View style={[s.legendDot, { backgroundColor: BEAT_COLOR }]} />
                        <View>
                          <Text style={s.legendLabel}>Beat Mode</Text>
                          <Text style={[s.legendValue, { color: BEAT_COLOR }]}>{formatDuration(todayBeatTime)}</Text>
                        </View>
                      </View>
                      <View style={s.legendItem}>
                        <View style={[s.legendDot, { backgroundColor: BAR_COLOR }]} />
                        <View>
                          <Text style={s.legendLabel}>Bar Mode</Text>
                          <Text style={[s.legendValue, { color: BAR_COLOR }]}>{formatDuration(todayBarTime)}</Text>
                        </View>
                      </View>
                      <View style={s.legendItem}>
                        <View style={[s.legendDot, { backgroundColor: C.accent }]} />
                        <View>
                          <Text style={s.legendLabel}>Total</Text>
                          <Text style={[s.legendValue, { color: C.accent }]}>{formatDuration(todayTotalTime)}</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                </View>

                {/* ── Weekly Summary ── */}
                <View style={s.card}>
                  <View style={s.cardHeader}>
                    <View style={s.cardHeaderLeft}>
                      <Ionicons name="calendar-outline" size={16} color={C.accent} />
                      <Text style={[s.cardTitle, { color: Colors.text }]}>This Week</Text>
                    </View>
                  </View>
                  <View style={s.weekGrid}>
                    <View style={s.weekStat}>
                      <Text style={[s.weekValue, { color: C.accent }]}>{formatDuration(weekTotalTime)}</Text>
                      <Text style={s.weekLabel}>Total</Text>
                    </View>
                    <View style={[s.weekDivider, { backgroundColor: Colors.border }]} />
                    <View style={s.weekStat}>
                      <Text style={[s.weekValue, { color: BEAT_COLOR }]}>{formatDuration(weekBeatTime)}</Text>
                      <Text style={s.weekLabel}>Beat</Text>
                    </View>
                    <View style={[s.weekDivider, { backgroundColor: Colors.border }]} />
                    <View style={s.weekStat}>
                      <Text style={[s.weekValue, { color: BAR_COLOR }]}>{formatDuration(weekBarTime)}</Text>
                      <Text style={s.weekLabel}>Bar</Text>
                    </View>
                  </View>
                </View>

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
                            <Text style={[s.detailSectionTitle, { color: BEAT_COLOR }]}>Beat Mode Sessions</Text>
                          </View>
                          {beatSessionDetails.map((sess, i) => (
                            <View key={i} style={s.detailRow}>
                              <View style={s.detailInfo}>
                                <Text style={s.detailMain}>{sess.bpm} BPM</Text>
                                <Text style={s.detailSub}>{sess.count} session{sess.count > 1 ? "s" : ""}</Text>
                              </View>
                              <Text style={[s.detailTime, { color: BEAT_COLOR }]}>{formatDuration(sess.duration)}</Text>
                            </View>
                          ))}
                        </View>
                      )}

                      {/* Bar mode details */}
                      {barSessionDetails.length > 0 && (
                        <View style={s.detailSection}>
                          <View style={s.detailSectionHeader}>
                            <View style={[s.legendDot, { backgroundColor: BAR_COLOR }]} />
                            <Text style={[s.detailSectionTitle, { color: BAR_COLOR }]}>Bar Mode Sessions</Text>
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
                              <Text style={[s.detailTime, { color: BAR_COLOR }]}>{formatDuration(sess.duration)}</Text>
                            </View>
                          ))}
                        </View>
                      )}

                      {/* Feature usage details */}
                      <View style={s.detailSection}>
                        <View style={s.detailSectionHeader}>
                          <View style={[s.legendDot, { backgroundColor: Colors.textSecondary }]} />
                          <Text style={[s.detailSectionTitle, { color: Colors.textSecondary }]}>Feature Usage</Text>
                        </View>
                        <View style={s.detailRow}>
                          <View style={s.detailInfo}>
                            <Text style={s.detailMain}>Tuner</Text>
                          </View>
                          <Text style={s.detailTimeSec}>{formatDuration(featureUsage.tuner)}</Text>
                        </View>
                        <View style={s.detailRow}>
                          <View style={s.detailInfo}>
                            <Text style={s.detailMain}>Signal Generator</Text>
                          </View>
                          <Text style={s.detailTimeSec}>{formatDuration(featureUsage.signal_generator)}</Text>
                        </View>
                        <View style={s.detailRow}>
                          <View style={s.detailInfo}>
                            <Text style={s.detailMain}>Practice Note</Text>
                          </View>
                          <Text style={s.detailTimeSec}>{formatDuration(featureUsage.practice_note)}</Text>
                        </View>
                      </View>

                      {beatSessionDetails.length === 0 && barSessionDetails.length === 0 && (
                        <Text style={s.emptyHint}>No sessions recorded today</Text>
                      )}
                    </View>
                  )}
                </View>

                {/* ── Practice Rooms ── */}
                <View style={s.card}>
                  <View style={s.cardHeader}>
                    <View style={s.cardHeaderLeft}>
                      <Ionicons name="location" size={16} color={C.accent} />
                      <Text style={[s.cardTitle, { color: Colors.text }]}>Practice Rooms</Text>
                    </View>
                    <Pressable onPress={() => setShowAddRoom(!showAddRoom)} hitSlop={8}>
                      <Ionicons name={showAddRoom ? "close-circle" : "add-circle"} size={20} color={C.accent} />
                    </Pressable>
                  </View>

                  {roomTrackingActive && trackingRoomName && (
                    <View style={[s.trackingBanner, { borderColor: Colors.success }]}>
                      <View style={s.trackingDot} />
                      <Text style={[s.trackingText, { color: Colors.success }]}>
                        Tracking at {trackingRoomName}
                      </Text>
                      <Pressable style={[s.trackingStopBtn, { backgroundColor: Colors.danger }]} onPress={onStopRoomTracking}>
                        <Text style={s.trackingStopText}>Stop</Text>
                      </Pressable>
                    </View>
                  )}

                  {showAddRoom && (
                    <View style={[s.addForm, { borderColor: C.accentDim }]}>
                      <Text style={s.formHint}>Register your current location as a practice room</Text>
                      <View style={s.addFormRow}>
                        <TextInput
                          style={[s.formInput, { borderColor: C.accentMuted, flex: 1 }]}
                          value={newRoomName}
                          onChangeText={setNewRoomName}
                          placeholder="Room name"
                          placeholderTextColor={Colors.textTertiary}
                          maxLength={30}
                        />
                        <Pressable style={[s.formSaveBtn, { backgroundColor: C.accent }]} onPress={handleAddRoom} disabled={addingRoom}>
                          {addingRoom ? (
                            <ActivityIndicator size="small" color={Colors.surface} />
                          ) : (
                            <Ionicons name="checkmark" size={16} color={Colors.surface} />
                          )}
                        </Pressable>
                      </View>
                    </View>
                  )}

                  {practiceRooms.length === 0 && !showAddRoom ? (
                    <Text style={s.emptyHint}>Tap + to register a practice room</Text>
                  ) : (
                    practiceRooms.map((room) => {
                      const visitInfo = roomVisitStats.find(([id]) => id === room.id);
                      const isTracking = roomTrackingActive && trackingRoomName === room.name;
                      return (
                        <View key={room.id} style={s.roomRow}>
                          <View style={s.roomInfo}>
                            <Ionicons name="location-outline" size={14} color={C.accent} />
                            <Text style={s.roomName} numberOfLines={1}>{room.name}</Text>
                          </View>
                          <View style={s.roomActions}>
                            {visitInfo && (
                              <Text style={s.roomStat}>
                                {visitInfo[1].visitCount}x · {formatDuration(visitInfo[1].totalDuration)}
                              </Text>
                            )}
                            {!isTracking && !roomTrackingActive && (
                              <Pressable
                                style={[s.roomStartBtn, { backgroundColor: C.accentDim }]}
                                onPress={() => onStartRoomTracking({ id: room.id, name: room.name })}
                              >
                                <Ionicons name="play" size={12} color={C.accent} />
                              </Pressable>
                            )}
                            <Pressable onPress={() => handleDeleteRoom(room.id)} hitSlop={8}>
                              <Ionicons name="trash-outline" size={14} color={Colors.textTertiary} />
                            </Pressable>
                          </View>
                        </View>
                      );
                    })
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
              <Text style={shareStyles.topTitle}>Share Summary</Text>
              <Pressable onPress={handleShare} disabled={shareCapturing} style={[shareStyles.shareBtn, { backgroundColor: C.accent }]}>
                {shareCapturing ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={shareStyles.shareBtnText}>Share</Text>
                )}
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={shareStyles.scrollContent} showsVerticalScrollIndicator={false}>
              <View ref={shareRef} collapsable={false} style={shareStyles.cardOuter}>
                <View style={[shareStyles.card, { backgroundColor: shareBgMode === "custom" && shareBgUri ? "transparent" : grayscaleColors.bg }]}>
                  {shareBgMode === "custom" && shareBgUri && (
                    <Image source={{ uri: shareBgUri }} style={shareStyles.bgImage} blurRadius={2} />
                  )}
                  {shareBgMode === "custom" && shareBgUri && (
                    <View style={shareStyles.bgOverlay} />
                  )}

                  <View style={shareStyles.cardContent}>
                    {/* App branding */}
                    <View style={shareStyles.brandRow}>
                      <MaterialCommunityIcons name="metronome" size={20} color={C.accent} />
                      <Text style={[shareStyles.brandText, { color: C.accent }]}>Metronome</Text>
                    </View>

                    <Text style={shareStyles.dateText}>
                      {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                    </Text>

                    {/* Total time big display */}
                    <View style={shareStyles.bigTimeWrap}>
                      <Text style={[shareStyles.bigTime, { color: "#fff" }]}>{formatMinutes(todayTotalTime)}</Text>
                      <Text style={shareStyles.bigTimeUnit}>minutes</Text>
                    </View>

                    {/* Play time bar chart */}
                    <View style={shareStyles.barChart}>
                      <View style={shareStyles.barRow}>
                        <Text style={shareStyles.barLabel}>Beat</Text>
                        <View style={shareStyles.barTrack}>
                          <View style={[shareStyles.barFill, {
                            backgroundColor: BEAT_COLOR,
                            width: todayTotalTime > 0 ? `${Math.max(5, (todayBeatTime / todayTotalTime) * 100)}%` : "5%"
                          }]} />
                        </View>
                        <Text style={[shareStyles.barValue, { color: BEAT_COLOR }]}>{formatDuration(todayBeatTime)}</Text>
                      </View>
                      <View style={shareStyles.barRow}>
                        <Text style={shareStyles.barLabel}>Bar</Text>
                        <View style={shareStyles.barTrack}>
                          <View style={[shareStyles.barFill, {
                            backgroundColor: BAR_COLOR,
                            width: todayTotalTime > 0 ? `${Math.max(5, (todayBarTime / todayTotalTime) * 100)}%` : "5%"
                          }]} />
                        </View>
                        <Text style={[shareStyles.barValue, { color: BAR_COLOR }]}>{formatDuration(todayBarTime)}</Text>
                      </View>
                    </View>

                    {/* Goals */}
                    {goals.length > 0 && (
                      <View style={shareStyles.goalsSection}>
                        <Text style={shareStyles.sectionTitle}>Goals</Text>
                        {goals.map((goal) => {
                          const progress = getGoalProgress(goal);
                          const pct = Math.min(1, progress / goal.target);
                          const goalColor = goal.type === "beat_mode_time" ? BEAT_COLOR : goal.type === "bar_mode_time" ? BAR_COLOR : goal.type === "room_time" ? ROOM_COLOR : C.accent;
                          const completed = pct >= 1;
                          return (
                            <View key={goal.id} style={shareStyles.goalItem}>
                              <View style={shareStyles.goalLeft}>
                                <Ionicons name={completed ? "checkmark-circle" : "ellipse-outline"} size={16} color={completed ? "#3fb950" : goalColor} />
                                <Text style={shareStyles.goalText}>{goal.label}</Text>
                              </View>
                              <Text style={[shareStyles.goalProg, { color: goalColor }]}>
                                {Math.round(progress)}m / {goal.target}m
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    )}

                    {/* Weekly summary */}
                    <View style={shareStyles.weekSection}>
                      <Text style={shareStyles.sectionTitle}>This Week</Text>
                      <View style={shareStyles.weekRow}>
                        <View style={shareStyles.weekItem}>
                          <Text style={[shareStyles.weekVal, { color: C.accent }]}>{formatDuration(weekTotalTime)}</Text>
                          <Text style={shareStyles.weekLbl}>Total</Text>
                        </View>
                        <View style={[shareStyles.weekDivider, { backgroundColor: "#ffffff20" }]} />
                        <View style={shareStyles.weekItem}>
                          <Text style={[shareStyles.weekVal, { color: BEAT_COLOR }]}>{formatDuration(weekBeatTime)}</Text>
                          <Text style={shareStyles.weekLbl}>Beat</Text>
                        </View>
                        <View style={[shareStyles.weekDivider, { backgroundColor: "#ffffff20" }]} />
                        <View style={shareStyles.weekItem}>
                          <Text style={[shareStyles.weekVal, { color: BAR_COLOR }]}>{formatDuration(weekBarTime)}</Text>
                          <Text style={shareStyles.weekLbl}>Bar</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                </View>
              </View>

              {/* Background options */}
              <View style={shareStyles.bgOptions}>
                <Text style={shareStyles.bgTitle}>Background</Text>
                <View style={shareStyles.bgRow}>
                  <Pressable
                    style={[shareStyles.bgChip, shareBgMode === "grayscale" && !shareBgUri && { borderColor: C.accent, backgroundColor: C.accentDim }]}
                    onPress={() => { setShareBgMode("grayscale"); setShareBgUri(null); }}
                  >
                    <View style={[shareStyles.bgPreview, { backgroundColor: grayscaleColors.bg }]} />
                    <Text style={[shareStyles.bgChipText, shareBgMode === "grayscale" && !shareBgUri && { color: C.accent }]}>Random</Text>
                  </Pressable>
                  <Pressable
                    style={[shareStyles.bgChip, shareBgMode === "custom" && shareBgUri ? { borderColor: C.accent, backgroundColor: C.accentDim } : {}]}
                    onPress={pickShareBg}
                  >
                    {shareBgUri ? (
                      <Image source={{ uri: shareBgUri }} style={shareStyles.bgPreview} />
                    ) : (
                      <View style={[shareStyles.bgPreview, { backgroundColor: Colors.surfaceLight }]}>
                        <Ionicons name="image-outline" size={14} color={Colors.textTertiary} />
                      </View>
                    )}
                    <Text style={[shareStyles.bgChipText, shareBgMode === "custom" && shareBgUri ? { color: C.accent } : {}]}>Custom</Text>
                  </Pressable>
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
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
    minHeight: 500,
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
  dateText: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 12,
    color: "#ffffffaa",
    marginTop: -12,
  },
  bigTimeWrap: {
    alignItems: "center",
    paddingVertical: 10,
  },
  bigTime: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 64,
    lineHeight: 70,
  },
  bigTimeUnit: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 14,
    color: "#ffffff88",
    marginTop: 2,
  },
  barChart: {
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
