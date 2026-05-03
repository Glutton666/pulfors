import { Platform } from "react-native";
import { setAudioModeAsync } from "expo-audio";
import { logger } from "@/lib/logger";

/**
 * Caller ID 컨벤션 (충돌 방지용 레지스트리)
 *
 * 각 모달/기능은 고유한 callerId 문자열을 사용해야 한다. 같은 ID로 중복 acquire
 * 하면 Map이 덮어써져 release 카운팅이 어긋날 수 있다. 새 caller를 추가할 때
 * 아래 표에 기재할 것.
 *
 * - "noteRecorderModal"     : NoteRecorderModal 녹음
 * - "signalGenMicMobile"    : SignalGeneratorModal iOS 네이티브 마이크 분석
 * - "signalGenMicAndroid"   : SignalGeneratorModal Android WebView 마이크
 * - "settingsSampleRec"     : SettingsModal 사용자 샘플 녹음
 * - "drumKitRec"            : DrumKitModal 패드 녹음
 */
export type SessionMode = "playback" | "recording" | "mic";

export interface MetronomeBridge {
  isRunning: () => boolean;
  pause: () => void;
  resume: () => void;
}

const activeCallers: Map<string, SessionMode> = new Map();
let bridge: MetronomeBridge | null = null;
let pausedByUs = false;
// 사용자가 모달을 연 동안 메트로놈을 직접 토글했는지 추적. true이면 release
// 시점에 자동 resume을 건너뛰어 사용자의 의도(끄거나 켠 채 두기)를 존중한다.
let userToggledDuringSession = false;
// audio-session이 bridge.pause/resume를 호출하는 동안에는 그 호출 경로에서
// notifyUserMetronomeToggle이 들어와도 무시한다 (사용자 액션이 아니므로).
let suppressUserToggle = 0;

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
  // 새 세션이 시작될 때 (이전에 활성 caller가 없었다면) 사용자 토글 추적 리셋.
  if (activeCallers.size === 0) userToggledDuringSession = false;
  activeCallers.set(callerId, mode);
  // 마이크/녹음을 시작하면 메트로놈 출력이 끊기거나 카테고리가 충돌하므로
  // 메트로놈이 재생 중이라면 자동 일시정지한다.
  const needsPause = mode === "recording" || mode === "mic";
  if (needsPause && !pausedByUs && bridge) {
    try {
      if (bridge.isRunning()) {
        suppressUserToggle++;
        try { bridge.pause(); } finally { suppressUserToggle--; }
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
    const wasUserToggled = userToggledDuringSession;
    pausedByUs = false;
    userToggledDuringSession = false;
    // 모달 안에서 사용자가 직접 메트로놈을 토글했다면 (켰다가 다시 끔, 또는
    // 켠 채 둠) 그 의도를 존중하여 자동 resume을 건너뛴다. 사용자가 손대지
    // 않았고 우리가 멈춘 그대로일 때만 baseline으로 복귀한다.
    try {
      if (!wasUserToggled && bridge && !bridge.isRunning()) {
        suppressUserToggle++;
        try { bridge.resume(); } finally { suppressUserToggle--; }
      }
    } catch (e) {
      logger.warn("[audioSession] metronome resume failed:", e);
    }
  }
}

/** 사용자가 직접 메트로놈을 토글했음을 알린다 (Play/Pause 버튼, 음성 명령 등). */
export function notifyUserMetronomeToggle(): void {
  if (suppressUserToggle > 0) return;
  if (activeCallers.size > 0) {
    userToggledDuringSession = true;
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
  userToggledDuringSession = false;
  suppressUserToggle = 0;
}

export function _audioSessionDebugState() {
  return {
    activeCallers: Array.from(activeCallers.entries()),
    pausedByUs,
    hasBridge: bridge !== null,
  };
}
