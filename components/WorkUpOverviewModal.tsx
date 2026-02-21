import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  Platform,
  ScrollView,
  TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useTheme } from "@/contexts/ThemeContext";
import * as Crypto from "expo-crypto";
import {
  loadActivityLogs,
  loadGoals,
  saveGoals,
  type ActivityLog,
  type Goal,
  type PracticeSessionData,
  type FeatureUsageData,
} from "@/lib/activity-log";

interface WorkUpOverviewModalProps {
  visible: boolean;
  onClose: () => void;
  loggingEnabled: boolean;
}

const GOAL_TYPE_OPTIONS: { value: Goal["type"]; label: string }[] = [
  { value: "daily_practice_time", label: "Daily Practice Time (min)" },
  { value: "daily_sessions", label: "Daily Sessions" },
  { value: "target_bpm", label: "Target BPM" },
];

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

export function WorkUpOverviewModal({
  visible,
  onClose,
  loggingEnabled,
}: WorkUpOverviewModalProps) {
  const { colors: C } = useTheme();
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;

  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [newGoalType, setNewGoalType] = useState<Goal["type"]>("daily_practice_time");
  const [newGoalTarget, setNewGoalTarget] = useState("");

  useEffect(() => {
    if (visible && loggingEnabled) {
      loadActivityLogs().then(setLogs);
      loadGoals().then(setGoals);
    }
  }, [visible, loggingEnabled]);

  const now = Date.now();
  const todayStart = getStartOfDay(new Date());
  const weekStart = getStartOfWeek(new Date());

  const todayLogs = useMemo(
    () => logs.filter((l) => l.timestamp >= todayStart),
    [logs, todayStart]
  );
  const weekLogs = useMemo(
    () => logs.filter((l) => l.timestamp >= weekStart),
    [logs, weekStart]
  );

  const todaySessions = useMemo(
    () => todayLogs.filter((l) => l.type === "practice_session"),
    [todayLogs]
  );
  const weekSessions = useMemo(
    () => weekLogs.filter((l) => l.type === "practice_session"),
    [weekLogs]
  );

  const todayPracticeTime = useMemo(
    () =>
      todaySessions.reduce(
        (sum, l) => sum + ((l.data as PracticeSessionData).duration || 0),
        0
      ),
    [todaySessions]
  );

  const weekPracticeTime = useMemo(
    () =>
      weekSessions.reduce(
        (sum, l) => sum + ((l.data as PracticeSessionData).duration || 0),
        0
      ),
    [weekSessions]
  );

  const daysSinceWeekStart = useMemo(() => {
    const diff = Math.floor((now - weekStart) / (1000 * 60 * 60 * 24));
    return Math.max(1, diff + 1);
  }, [now, weekStart]);

  const avgDailyPractice = weekPracticeTime / daysSinceWeekStart;

  const mostUsedBpm = useMemo(() => {
    const bpmCounts: Record<number, number> = {};
    todaySessions.forEach((l) => {
      const bpm = (l.data as PracticeSessionData).bpm;
      bpmCounts[bpm] = (bpmCounts[bpm] || 0) + 1;
    });
    let maxBpm = 0;
    let maxCount = 0;
    Object.entries(bpmCounts).forEach(([bpm, count]) => {
      if (count > maxCount) {
        maxCount = count;
        maxBpm = Number(bpm);
      }
    });
    return maxBpm;
  }, [todaySessions]);

  const featureUsage = useMemo(() => {
    const usage: Record<string, number> = {
      tuner: 0,
      signal_generator: 0,
      practice_note: 0,
    };
    todayLogs
      .filter((l) => l.type === "feature_usage")
      .forEach((l) => {
        const data = l.data as FeatureUsageData;
        usage[data.feature] = (usage[data.feature] || 0) + data.duration;
      });
    return usage;
  }, [todayLogs]);

  const barModeStats = useMemo(() => {
    const configTimes: Record<string, { config: string; time: number }> = {};
    logs
      .filter(
        (l) =>
          l.type === "practice_session" &&
          (l.data as PracticeSessionData).mode === "bar"
      )
      .forEach((l) => {
        const data = l.data as PracticeSessionData;
        const key = data.barConfig
          ? JSON.stringify(data.barConfig)
          : "default";
        if (!configTimes[key]) {
          configTimes[key] = { config: key, time: 0 };
        }
        configTimes[key].time += data.duration || 0;
      });
    return Object.values(configTimes)
      .sort((a, b) => b.time - a.time)
      .slice(0, 3);
  }, [logs]);

  const getGoalProgress = useCallback(
    (goal: Goal): number => {
      switch (goal.type) {
        case "daily_practice_time":
          return todayPracticeTime / 60;
        case "daily_sessions":
          return todaySessions.length;
        case "target_bpm":
          return mostUsedBpm;
        default:
          return 0;
      }
    },
    [todayPracticeTime, todaySessions, mostUsedBpm]
  );

  const handleAddGoal = useCallback(async () => {
    const target = parseInt(newGoalTarget, 10);
    if (isNaN(target) || target <= 0) return;

    const label =
      GOAL_TYPE_OPTIONS.find((o) => o.value === newGoalType)?.label || "";
    const newGoal: Goal = {
      id: Crypto.randomUUID(),
      type: newGoalType,
      target,
      label,
    };
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
    },
    [goals]
  );

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <ScrollView
          style={{ marginTop: (insets.top || webTopInset) + 50 }}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
          onStartShouldSetResponder={() => true}
        >
          <Pressable
            style={styles.sheet}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.header}>
              <Text style={styles.title}>Work Up Overview</Text>
              <Pressable onPress={onClose} hitSlop={12}>
                <Ionicons
                  name="close"
                  size={22}
                  color={Colors.textSecondary}
                />
              </Pressable>
            </View>

            {!loggingEnabled ? (
              <View style={styles.disabledContainer}>
                <MaterialCommunityIcons
                  name="chart-line"
                  size={48}
                  color={Colors.textTertiary}
                />
                <Text style={styles.disabledText}>
                  Enable activity logging in Settings to start tracking your
                  practice
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Ionicons
                      name="today-outline"
                      size={18}
                      color={C.accent}
                    />
                    <Text style={styles.sectionLabel}>Today's Summary</Text>
                  </View>
                  <View style={styles.statsGrid}>
                    <View style={[styles.statCard, { borderColor: C.accentDim }]}>
                      <Text style={[styles.statValue, { color: C.accent }]}>
                        {formatDuration(todayPracticeTime)}
                      </Text>
                      <Text style={styles.statLabel}>Practice Time</Text>
                    </View>
                    <View style={[styles.statCard, { borderColor: C.accentDim }]}>
                      <Text style={[styles.statValue, { color: C.accent }]}>
                        {todaySessions.length}
                      </Text>
                      <Text style={styles.statLabel}>Sessions</Text>
                    </View>
                    <View style={[styles.statCard, { borderColor: C.accentDim }]}>
                      <Text style={[styles.statValue, { color: C.accent }]}>
                        {mostUsedBpm > 0 ? `${mostUsedBpm}` : "--"}
                      </Text>
                      <Text style={styles.statLabel}>Top BPM</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.divider} />

                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Ionicons
                      name="calendar-outline"
                      size={18}
                      color={C.accent}
                    />
                    <Text style={styles.sectionLabel}>This Week</Text>
                  </View>
                  <View style={styles.statsGrid}>
                    <View style={[styles.statCard, { borderColor: C.accentDim }]}>
                      <Text style={[styles.statValue, { color: C.accent }]}>
                        {formatDuration(weekPracticeTime)}
                      </Text>
                      <Text style={styles.statLabel}>Total Time</Text>
                    </View>
                    <View style={[styles.statCard, { borderColor: C.accentDim }]}>
                      <Text style={[styles.statValue, { color: C.accent }]}>
                        {formatDuration(avgDailyPractice)}
                      </Text>
                      <Text style={styles.statLabel}>Avg/Day</Text>
                    </View>
                    <View style={[styles.statCard, { borderColor: C.accentDim }]}>
                      <Text style={[styles.statValue, { color: C.accent }]}>
                        {weekSessions.length}
                      </Text>
                      <Text style={styles.statLabel}>Sessions</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.divider} />

                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <MaterialCommunityIcons
                      name="toolbox-outline"
                      size={18}
                      color={C.accent}
                    />
                    <Text style={styles.sectionLabel}>Feature Usage</Text>
                  </View>
                  <View style={styles.featureList}>
                    <View style={styles.featureRow}>
                      <MaterialCommunityIcons
                        name="music-clef-treble"
                        size={16}
                        color={Colors.textSecondary}
                      />
                      <Text style={styles.featureLabel}>Tuner</Text>
                      <Text style={[styles.featureValue, { color: C.accent }]}>
                        {formatDuration(featureUsage.tuner)}
                      </Text>
                    </View>
                    <View style={styles.featureRow}>
                      <MaterialCommunityIcons
                        name="sine-wave"
                        size={16}
                        color={Colors.textSecondary}
                      />
                      <Text style={styles.featureLabel}>Signal Generator</Text>
                      <Text style={[styles.featureValue, { color: C.accent }]}>
                        {formatDuration(featureUsage.signal_generator)}
                      </Text>
                    </View>
                    <View style={styles.featureRow}>
                      <Ionicons
                        name="document-text-outline"
                        size={16}
                        color={Colors.textSecondary}
                      />
                      <Text style={styles.featureLabel}>Practice Note</Text>
                      <Text style={[styles.featureValue, { color: C.accent }]}>
                        {formatDuration(featureUsage.practice_note)}
                      </Text>
                    </View>
                  </View>
                </View>

                {barModeStats.length > 0 && (
                  <>
                    <View style={styles.divider} />
                    <View style={styles.section}>
                      <View style={styles.sectionHeader}>
                        <MaterialCommunityIcons
                          name="music-box-multiple-outline"
                          size={18}
                          color={C.accent}
                        />
                        <Text style={styles.sectionLabel}>Bar Mode Stats</Text>
                      </View>
                      {barModeStats.map((stat, idx) => (
                        <View key={idx} style={styles.featureRow}>
                          <Text style={styles.featureLabel}>
                            Config #{idx + 1}
                          </Text>
                          <Text
                            style={[styles.featureValue, { color: C.accent }]}
                          >
                            {formatDuration(stat.time)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </>
                )}

                <View style={styles.divider} />

                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Ionicons
                      name="flag-outline"
                      size={18}
                      color={C.accent}
                    />
                    <Text style={styles.sectionLabel}>Goals</Text>
                    <Pressable
                      onPress={() => setShowAddGoal(!showAddGoal)}
                      hitSlop={8}
                    >
                      <Ionicons
                        name={showAddGoal ? "close-circle" : "add-circle"}
                        size={22}
                        color={C.accent}
                      />
                    </Pressable>
                  </View>

                  {showAddGoal && (
                    <View style={[styles.addGoalForm, { borderColor: C.accentDim }]}>
                      <View style={styles.goalTypeRow}>
                        {GOAL_TYPE_OPTIONS.map((opt) => {
                          const active = newGoalType === opt.value;
                          return (
                            <Pressable
                              key={opt.value}
                              style={[
                                styles.goalTypeBtn,
                                active && {
                                  borderColor: C.accent,
                                  backgroundColor: C.accentDim,
                                },
                              ]}
                              onPress={() => setNewGoalType(opt.value)}
                            >
                              <Text
                                style={[
                                  styles.goalTypeBtnText,
                                  active && { color: C.accent },
                                ]}
                                numberOfLines={1}
                              >
                                {opt.label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                      <View style={styles.goalInputRow}>
                        <TextInput
                          style={[styles.goalInput, { borderColor: C.accentMuted }]}
                          value={newGoalTarget}
                          onChangeText={setNewGoalTarget}
                          placeholder="Target value"
                          placeholderTextColor={Colors.textTertiary}
                          keyboardType="numeric"
                        />
                        <Pressable
                          style={[styles.goalSaveBtn, { backgroundColor: C.accent }]}
                          onPress={handleAddGoal}
                        >
                          <Ionicons
                            name="checkmark"
                            size={18}
                            color={Colors.surface}
                          />
                        </Pressable>
                      </View>
                    </View>
                  )}

                  {goals.length === 0 && !showAddGoal ? (
                    <Text style={styles.emptyText}>
                      No goals set. Tap + to add one.
                    </Text>
                  ) : (
                    goals.map((goal) => {
                      const progress = getGoalProgress(goal);
                      const pct = Math.min(1, progress / goal.target);
                      const unitLabel =
                        goal.type === "daily_practice_time"
                          ? "min"
                          : goal.type === "daily_sessions"
                            ? ""
                            : "BPM";
                      return (
                        <View key={goal.id} style={styles.goalItem}>
                          <View style={styles.goalHeader}>
                            <Text style={styles.goalLabel}>{goal.label}</Text>
                            <Pressable
                              onPress={() => handleDeleteGoal(goal.id)}
                              hitSlop={8}
                            >
                              <Ionicons
                                name="trash-outline"
                                size={16}
                                color={Colors.textTertiary}
                              />
                            </Pressable>
                          </View>
                          <View style={styles.progressBarBg}>
                            <View
                              style={[
                                styles.progressBarFill,
                                {
                                  width: `${Math.round(pct * 100)}%` as any,
                                  backgroundColor: C.accent,
                                },
                              ]}
                            />
                          </View>
                          <Text style={styles.progressText}>
                            {Math.round(progress)}
                            {unitLabel} / {goal.target}
                            {unitLabel}
                          </Text>
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
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  title: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 18,
    color: Colors.text,
    letterSpacing: 0.5,
  },
  disabledContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    gap: 16,
  },
  disabledText: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 20,
  },
  section: {
    gap: 10,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionLabel: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 14,
    color: Colors.text,
    flex: 1,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 16,
  },
  statsGrid: {
    flexDirection: "row",
    gap: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    alignItems: "center",
    gap: 4,
  },
  statValue: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 16,
  },
  statLabel: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
  },
  featureList: {
    gap: 8,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  featureLabel: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 13,
    color: Colors.text,
    flex: 1,
  },
  featureValue: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 13,
  },
  addGoalForm: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    gap: 10,
  },
  goalTypeRow: {
    flexDirection: "row",
    gap: 6,
  },
  goalTypeBtn: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
  },
  goalTypeBtnText: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 10,
    color: Colors.textSecondary,
  },
  goalInputRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  goalInput: {
    flex: 1,
    height: 36,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 14,
    color: Colors.text,
    backgroundColor: Colors.surface,
  },
  goalSaveBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 13,
    color: Colors.textTertiary,
    textAlign: "center",
    paddingVertical: 12,
  },
  goalItem: {
    gap: 6,
    paddingVertical: 6,
  },
  goalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  goalLabel: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 13,
    color: Colors.text,
  },
  progressBarBg: {
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.surfaceLight,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  progressText: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
  },
});
