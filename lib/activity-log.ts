import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { logger } from "./logger";

const ACTIVITY_LOG_KEY = "metronome_activity_log";
const ACTIVITY_SETTINGS_KEY = "metronome_activity_settings";
const GOALS_KEY = "metronome_goals";
export const ACTIVITY_RETENTION_DAYS = 730;
const ACTIVITY_RETENTION_MS = ACTIVITY_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export interface PracticeSessionData {
  bpm: number;
  mode: "dial" | "bar";
  /** V1 호환 필드. V2에서는 activeDurationSec와 같은 능동 연습 시간이다. */
  duration: number;
  barConfig?: unknown;
  practiceNoteId?: string;
  practiceNoteLabel?: string;
  /** V2 fields. Missing fields mean a legacy V1 session. */
  schemaVersion?: 2;
  startedAt?: number;
  endedAt?: number;
  activeDurationSec?: number;
  pausedDurationSec?: number;
  interruptionDurationSec?: number;
  pauseCount?: number;
  interruptionCount?: number;
  status?: "completed" | "abandoned";
  endReason?: "manual" | "timer" | "measure_complete" | "fade_out" | "audio_interruption" | "audio_recovery_failed";
  bpmStart?: number;
  bpmEnd?: number;
  bpmPeak?: number;
}

export interface FeatureUsageData {
  feature: "signal_generator" | "practice_note";
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

export type PracticeSessionState = "running" | "paused" | "interrupted";
type PracticeSessionStart = Omit<PracticeSessionData, "duration" | "activeDurationSec" | "pausedDurationSec" | "interruptionDurationSec" | "pauseCount" | "interruptionCount" | "status" | "endReason" | "endedAt" | "bpmEnd" | "bpmPeak">;

/**
 * In-memory state machine for one user practice. It deliberately stores no
 * partial record: a single V2 log is emitted only when the session ends.
 */
export class PracticeSessionTracker {
  private state: PracticeSessionState = "running";
  private segmentStartedAt: number;
  private inactiveStartedAt: number | null = null;
  private activeMs = 0;
  private pausedMs = 0;
  private interruptionMs = 0;
  private pauseCount = 0;
  private interruptionCount = 0;
  private bpmPeak: number;

  constructor(private readonly start: PracticeSessionStart, startedAt: number = Date.now()) {
    this.segmentStartedAt = startedAt;
    this.bpmPeak = start.bpm;
  }

  getState(): PracticeSessionState {
    return this.state;
  }

  updateBpm(bpm: number): void {
    if (Number.isFinite(bpm)) this.bpmPeak = Math.max(this.bpmPeak, bpm);
  }

  pause(now: number = Date.now()): void {
    if (this.state !== "running") return;
    this.activeMs += Math.max(0, now - this.segmentStartedAt);
    this.inactiveStartedAt = now;
    this.pauseCount += 1;
    this.state = "paused";
  }

  interrupt(now: number = Date.now()): void {
    if (this.state === "interrupted") return;
    if (this.state === "running") this.activeMs += Math.max(0, now - this.segmentStartedAt);
    if (this.state === "paused" && this.inactiveStartedAt !== null) {
      this.pausedMs += Math.max(0, now - this.inactiveStartedAt);
    }
    this.inactiveStartedAt = now;
    this.interruptionCount += 1;
    this.state = "interrupted";
  }

  resume(now: number = Date.now()): void {
    if (this.state === "running") return;
    const inactiveMs = this.inactiveStartedAt === null ? 0 : Math.max(0, now - this.inactiveStartedAt);
    if (this.state === "paused") this.pausedMs += inactiveMs;
    else this.interruptionMs += inactiveMs;
    this.segmentStartedAt = now;
    this.inactiveStartedAt = null;
    this.state = "running";
  }

  complete(
    bpmEnd: number,
    endReason: NonNullable<PracticeSessionData["endReason"]>,
    status: NonNullable<PracticeSessionData["status"]> = "completed",
    now: number = Date.now(),
  ): PracticeSessionData {
    if (this.state === "running") this.activeMs += Math.max(0, now - this.segmentStartedAt);
    else if (this.inactiveStartedAt !== null) {
      const inactiveMs = Math.max(0, now - this.inactiveStartedAt);
      if (this.state === "paused") this.pausedMs += inactiveMs;
      else this.interruptionMs += inactiveMs;
    }
    this.updateBpm(bpmEnd);
    const activeDurationSec = Math.max(0, Math.round(this.activeMs / 1000));
    return {
      ...this.start,
      duration: activeDurationSec,
      schemaVersion: 2,
      endedAt: now,
      activeDurationSec,
      pausedDurationSec: Math.max(0, Math.round(this.pausedMs / 1000)),
      interruptionDurationSec: Math.max(0, Math.round(this.interruptionMs / 1000)),
      pauseCount: this.pauseCount,
      interruptionCount: this.interruptionCount,
      status,
      endReason,
      bpmStart: this.start.bpm,
      bpmEnd,
      bpmPeak: this.bpmPeak,
    };
  }
}

/** Uses V2 active time when present and preserves V1 duration semantics. */
export function getPracticeSessionDuration(data: PracticeSessionData): number {
  const candidate = data.schemaVersion === 2 ? data.activeDurationSec : data.duration;
  const duration = Number(candidate);
  return Number.isFinite(duration) && duration > 0 ? duration : 0;
}

/** V1 records remain usable for time/goal totals but have no growth evidence. */
export function isGrowthEligiblePracticeSession(data: PracticeSessionData): boolean {
  return data.schemaVersion === 2
    && data.status === "completed"
    && getPracticeSessionDuration(data) >= 3;
}

/** V1 records remain visible; V2 records must have completed normally. */
export function isPracticeSessionIncludedInActivityTotals(data: PracticeSessionData): boolean {
  return data.schemaVersion !== 2
    || (data.status === "completed" && getPracticeSessionDuration(data) >= 3);
}

export function pruneActivityLogs(logs: ActivityLog[], now: number = Date.now()): ActivityLog[] {
  const cutoff = now - ACTIVITY_RETENTION_MS;
  return logs.filter((log) => !Number.isFinite(log.timestamp) || log.timestamp >= cutoff);
}

export async function loadLoggingEnabled(): Promise<boolean> {
  try {
    const data = await AsyncStorage.getItem(ACTIVITY_SETTINGS_KEY);
    if (data) {
      const parsed = JSON.parse(data);
      return parsed.loggingEnabled ?? false;
    }
  } catch (e) {
    logger.warn("Failed to load logging settings:", e);
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
    logger.warn("Failed to save logging settings:", e);
  }
}

let activityWriteChain: Promise<void> = Promise.resolve();

export async function addActivityLog(
  entry: Omit<ActivityLog, "id" | "timestamp">
): Promise<void> {
  const next = activityWriteChain.then(async () => {
    try {
      const logs = await loadActivityLogs();
      const newEntry: ActivityLog = {
        id: Crypto.randomUUID(),
        timestamp: Date.now(),
        ...entry,
      };
      logs.push(newEntry);
      await AsyncStorage.setItem(ACTIVITY_LOG_KEY, JSON.stringify(logs));
    } catch (e) {
      logger.warn("Failed to add activity log:", e);
    }
  });
  activityWriteChain = next.catch(() => {});
  return next;
}

export async function loadActivityLogs(): Promise<ActivityLog[]> {
  try {
    const data = await AsyncStorage.getItem(ACTIVITY_LOG_KEY);
    if (data) {
      const parsed = JSON.parse(data);
      if (!Array.isArray(parsed)) return [];
      const retained = pruneActivityLogs(parsed);
      if (retained.length !== parsed.length) {
        await AsyncStorage.setItem(ACTIVITY_LOG_KEY, JSON.stringify(retained));
      }
      return retained;
    }
  } catch (e) {
    logger.warn("Failed to load activity logs:", e);
  }
  return [];
}

export async function clearActivityLogs(): Promise<void> {
  try {
    await AsyncStorage.removeItem(ACTIVITY_LOG_KEY);
  } catch (e) {
    logger.warn("Failed to clear activity logs:", e);
  }
}

/** Erases activity records, their goals, and the local logging-consent setting. */
export async function clearActivityData(): Promise<void> {
  const next = activityWriteChain.then(async () => {
    try {
      await AsyncStorage.multiRemove([ACTIVITY_LOG_KEY, GOALS_KEY, ACTIVITY_SETTINGS_KEY]);
    } catch (e) {
      logger.warn("Failed to clear activity data:", e);
    }
  });
  activityWriteChain = next.catch(() => {});
  return next;
}

export async function loadGoals(): Promise<Goal[]> {
  try {
    const data = await AsyncStorage.getItem(GOALS_KEY);
    if (data) return JSON.parse(data);
  } catch (e) {
    logger.warn("Failed to load goals:", e);
  }
  return [];
}

export async function saveGoals(goals: Goal[]): Promise<void> {
  try {
    await AsyncStorage.setItem(GOALS_KEY, JSON.stringify(goals));
  } catch (e) {
    logger.warn("Failed to save goals:", e);
  }
}
