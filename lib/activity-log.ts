import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";

const ACTIVITY_LOG_KEY = "metronome_activity_log";
const ACTIVITY_SETTINGS_KEY = "metronome_activity_settings";
const GOALS_KEY = "metronome_goals";

export interface AccuracyData {
  avgOffsetMs: number;
  accuracyPercent: number;
  hitCount: number;
}

export interface PracticeSessionData {
  bpm: number;
  mode: "dial" | "bar";
  duration: number;
  barConfig?: any;
  practiceNoteId?: string;
  practiceNoteLabel?: string;
  accuracy?: AccuracyData;
}

export interface FeatureUsageData {
  feature: "tuner" | "signal_generator" | "practice_note";
  duration: number;
}

export interface PracticeRoomVisitData {
  roomId: string;
  roomName: string;
  duration: number;
}

export interface ActivityLog {
  id: string;
  type: "practice_session" | "feature_usage" | "practice_room_visit";
  timestamp: number;
  data: PracticeSessionData | FeatureUsageData | PracticeRoomVisitData;
}

export interface Goal {
  id: string;
  type: "total_play_time" | "beat_mode_time" | "bar_mode_time" | "room_time" | "session_goal";
  target: number;
  label: string;
  practiceNoteId?: string;
  practiceNoteLabel?: string;
}

export async function loadLoggingEnabled(): Promise<boolean> {
  try {
    const data = await AsyncStorage.getItem(ACTIVITY_SETTINGS_KEY);
    if (data) {
      const parsed = JSON.parse(data);
      return parsed.loggingEnabled ?? false;
    }
  } catch (e) {
    console.warn("Failed to load logging settings:", e);
  }
  return false;
}

export async function saveLoggingEnabled(val: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(
      ACTIVITY_SETTINGS_KEY,
      JSON.stringify({ loggingEnabled: val })
    );
  } catch (e) {
    console.warn("Failed to save logging settings:", e);
  }
}

export async function addActivityLog(
  entry: Omit<ActivityLog, "id" | "timestamp">
): Promise<void> {
  try {
    const logs = await loadActivityLogs();
    const newEntry: ActivityLog = {
      id: Crypto.randomUUID(),
      timestamp: Date.now(),
      ...entry,
    };
    logs.push(newEntry);
    await AsyncStorage.setItem(ACTIVITY_LOG_KEY, JSON.stringify(logs));
    console.log("[ActivityLog] Saved entry:", entry.type, JSON.stringify(entry.data), "total logs:", logs.length);
  } catch (e) {
    console.warn("Failed to add activity log:", e);
  }
}

export async function loadActivityLogs(): Promise<ActivityLog[]> {
  try {
    const data = await AsyncStorage.getItem(ACTIVITY_LOG_KEY);
    if (data) return JSON.parse(data);
  } catch (e) {
    console.warn("Failed to load activity logs:", e);
  }
  return [];
}

export async function clearActivityLogs(): Promise<void> {
  try {
    await AsyncStorage.removeItem(ACTIVITY_LOG_KEY);
  } catch (e) {
    console.warn("Failed to clear activity logs:", e);
  }
}

export async function loadGoals(): Promise<Goal[]> {
  try {
    const data = await AsyncStorage.getItem(GOALS_KEY);
    if (data) return JSON.parse(data);
  } catch (e) {
    console.warn("Failed to load goals:", e);
  }
  return [];
}

export async function saveGoals(goals: Goal[]): Promise<void> {
  try {
    await AsyncStorage.setItem(GOALS_KEY, JSON.stringify(goals));
  } catch (e) {
    console.warn("Failed to save goals:", e);
  }
}
