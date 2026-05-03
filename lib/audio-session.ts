import { Platform } from "react-native";
import { setAudioModeAsync } from "expo-audio";
import { logger } from "@/lib/logger";

export type SessionMode = "playback" | "recording" | "mic";

export interface MetronomeBridge {
  isRunning: () => boolean;
  pause: () => void;
  resume: () => void;
}

const activeCallers: Map<string, SessionMode> = new Map();
let bridge: MetronomeBridge | null = null;
let pausedByUs = false;

export function registerMetronomeBridge(b: MetronomeBridge | null) {
  bridge = b;
}

function needsRecordingCategory(): boolean {
  for (const m of activeCallers.values()) {
    if (m === "recording" || m === "mic") return true;
  }
  return false;
}

async function applyMode(allowsRecording: boolean, isBaseline: boolean): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    await setAudioModeAsync({
      allowsRecording,
      playsInSilentMode: true,
      interruptionMode: "mixWithOthers",
      shouldPlayInBackground: isBaseline,
    });
  } catch (e) {
    logger.warn("[audioSession] setAudioModeAsync failed:", e);
  }
}

export async function acquireAudioSession(callerId: string, mode: SessionMode): Promise<void> {
  activeCallers.set(callerId, mode);
  // 마이크/녹음을 시작하면 메트로놈 출력이 끊기거나 카테고리가 충돌하므로
  // 메트로놈이 재생 중이라면 자동 일시정지한다.
  const needsPause = mode === "recording" || mode === "mic";
  if (needsPause && !pausedByUs && bridge) {
    try {
      if (bridge.isRunning()) {
        bridge.pause();
        pausedByUs = true;
      }
    } catch (e) {
      logger.warn("[audioSession] metronome pause failed:", e);
    }
  }
  await applyMode(needsRecordingCategory(), false);
}

export async function releaseAudioSession(callerId: string): Promise<void> {
  if (!activeCallers.has(callerId)) {
    // 이미 해제된 caller라도 baseline 복귀 보장.
    if (activeCallers.size === 0 && pausedByUs) {
      pausedByUs = false;
      try { bridge?.resume(); } catch (e) { logger.warn("[audioSession] resume failed:", e); }
    }
    return;
  }
  activeCallers.delete(callerId);
  const remaining = activeCallers.size;
  await applyMode(needsRecordingCategory(), remaining === 0);
  if (remaining === 0 && pausedByUs) {
    pausedByUs = false;
    // 모달 안에서 사용자가 직접 메트로놈을 다시 켰다면 그 상태를 존중하고
    // 자동 resume은 건너뛴다. 멈춘 상태일 때만 우리가 일으킨 일시정지를 복구한다.
    try {
      if (bridge && !bridge.isRunning()) {
        bridge.resume();
      }
    } catch (e) {
      logger.warn("[audioSession] metronome resume failed:", e);
    }
  }
}

/** 모달이 에러로 종료되어도 finally에서 안전하게 호출할 수 있는 헬퍼. */
export async function withAudioSession<T>(
  callerId: string,
  mode: SessionMode,
  fn: () => Promise<T>,
): Promise<T> {
  await acquireAudioSession(callerId, mode);
  try {
    return await fn();
  } finally {
    await releaseAudioSession(callerId);
  }
}

export function _resetAudioSessionForTests() {
  activeCallers.clear();
  bridge = null;
  pausedByUs = false;
}

export function _audioSessionDebugState() {
  return {
    activeCallers: Array.from(activeCallers.entries()),
    pausedByUs,
    hasBridge: bridge !== null,
  };
}
