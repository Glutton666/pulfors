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

/** Android 오디오 포커스 프로브의 start/stop 진입점. */
export interface AndroidFocusProbeController {
  start: () => void;
  stop: () => void;
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

// 외부 OS 인터럽션 (전화/Siri/알람/다른 앱의 미디어 재생 등) 동안 메트로놈을
// 우리가 일시정지했는지 추적. 모달 caller 경로(`pausedByUs`)와 독립적으로
// 동작하므로, 인터럽션과 모달이 겹쳐도 양쪽이 모두 종료된 뒤에만 자동 재개한다.
let pausedByInterruption = false;
// 인터럽션 도중 사용자가 직접 메트로놈을 토글했는지. 인터럽션이 끝났을 때
// 사용자의 의도를 존중해 자동 재개를 건너뛰는 데 사용한다.
let userToggledDuringInterruption = false;

// Android: 오디오 포커스 프로브 컨트롤러.
// app/_layout.tsx 에서 initAndroidFocusCallbacks / startAndroidFocusProbe /
// stopAndroidFocusProbe 를 registerAndroidFocusProbeController 로 주입한다.
// 메트로놈이 실제로 재생될 때만 프로브를 실행해 오디오 포커스를 점유한다.
let androidProbe: AndroidFocusProbeController | null = null;

// 인터럽션(전화/Siri/알람 등)이 끝났을 때 메트로놈을 자동으로 재개할지 여부.
// 기본값 true (기존 동작 유지). false로 설정하면 notifyInterruptionEnd에서
// bridge.resume() 호출을 건너뛴다.
let autoResumeAfterInterruption = true;

/**
 * 인터럽션 후 자동 재개 여부를 설정한다.
 * app/index.tsx에서 사용자 설정 변경 시 호출한다.
 */
export function setAutoResumeAfterInterruption(value: boolean): void {
  autoResumeAfterInterruption = value;
}

/**
 * Android 오디오 포커스 프로브 컨트롤러를 주입한다.
 * null 을 전달하면 해제(앱 언마운트 시 사용).
 * 순환 임포트를 피하기 위해 의존성 주입 패턴을 사용한다.
 */
export function registerAndroidFocusProbeController(
  ctrl: AndroidFocusProbeController | null,
): void {
  androidProbe = ctrl;
}

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
        try {
          bridge.pause();
          androidProbe?.stop();
        } finally {
          suppressUserToggle--;
        }
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
      try {
        bridge?.resume();
        androidProbe?.start();
      } catch (e) {
        logger.warn("[audioSession] resume failed:", e);
      }
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
    // 외부 인터럽션이 아직 진행 중이면(전화 통화 중에 모달을 닫는 경우 등)
    // 재개하지 않는다 — 인터럽션이 끝나는 시점에 notifyInterruptionEnd가
    // 일관되게 처리한다.
    try {
      if (!wasUserToggled && !pausedByInterruption && bridge && !bridge.isRunning()) {
        suppressUserToggle++;
        try {
          bridge.resume();
          androidProbe?.start();
        } finally {
          suppressUserToggle--;
        }
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
  if (pausedByInterruption) {
    userToggledDuringInterruption = true;
  }
  // Android: 토글이 일어나기 직전에 bridge.isRunning() 으로 현재 상태를 읽어
  // 토글 후 상태를 추론해 프로브를 시작/정지한다.
  // isRunning() == true  → 토글 후 정지 → 프로브 정지
  // isRunning() == false → 토글 후 시작 → 프로브 시작
  if (bridge && Platform.OS === "android") {
    if (bridge.isRunning()) {
      androidProbe?.stop();
    } else {
      androidProbe?.start();
    }
  }
}

/**
 * OS 레벨 오디오 인터럽션이 시작됐을 때 호출. 전화 수신, Siri, 알람,
 * 다른 앱의 미디어 재생 시작 등으로 AVAudioSession이 우리 오디오를 강제
 * 정지시키는 시점이다. 메트로놈 엔진(JS 스케줄러)도 함께 멈춰서, 인터럽션이
 * 끝난 뒤 일관된 상태에서 재개할 수 있게 한다. 멱등하게 동작한다.
 */
export function notifyInterruptionBegin(): void {
  if (pausedByInterruption) return;
  // bridge가 아직 등록되지 않았으면 우리가 멈출 수 있는 게 없으므로 추적도
  // 하지 않는다. (앱 부팅 직후 상태)
  if (!bridge) return;
  try {
    if (bridge.isRunning()) {
      suppressUserToggle++;
      try {
        bridge.pause();
        // 주의: androidProbe?.stop() 을 호출하지 않는다.
        // 프로브는 OS 인터럽션 동안 살아있어야 포커스 회복(isPlaying: true)을
        // 감지하고 onFocusGain → notifyInterruptionEnd 를 호출할 수 있다.
      } finally {
        suppressUserToggle--;
      }
      pausedByInterruption = true;
      userToggledDuringInterruption = false;
      logger.info("[audioSession] interruption begin → metronome paused");
    } else if (activeCallers.size > 0) {
      // 메트로놈은 이미 모달 acquire로 멈춰있는 상태에서 인터럽션이 들어옴.
      // 모달이 release될 때 인터럽션이 끝났는지 확인할 수 있도록 플래그를
      // 세운다. (인터럽션 진행 중에 모달이 닫혀도 통화가 끝날 때까지 자동
      // 재개를 미루는 데 사용)
      pausedByInterruption = true;
      userToggledDuringInterruption = false;
      logger.info("[audioSession] interruption begin → already paused by modal, flagged");
    } else {
      // 메트로놈이 꺼져 있고 모달도 없는 상태 → 추적할 게 없다.
      logger.info("[audioSession] interruption begin → metronome already off, no-op");
    }
  } catch (e) {
    logger.warn("[audioSession] interruption pause failed:", e);
  }
}

/**
 * OS 레벨 오디오 인터럽션이 종료됐을 때 호출. 우리가 begin에서 멈췄고,
 * 사용자가 인터럽션 도중 직접 토글하지 않았으며, 다른 모달 caller도 활성
 * 상태가 아닐 때만 자동 재개한다.
 */
export function notifyInterruptionEnd(): void {
  if (!pausedByInterruption) return;
  const wasUserToggled = userToggledDuringInterruption;
  pausedByInterruption = false;
  userToggledDuringInterruption = false;
  if (wasUserToggled) {
    logger.info("[audioSession] interruption end → user toggled during interruption, skipping auto-resume");
    return;
  }
  // 모달이 아직 열려 있으면 모달 release 시점이 재개를 담당하도록 owner를
  // 이전한다 (인터럽션 동안 모달이 새로 열린 경우에도 release에서 정상
  // 재개되도록 pausedByUs를 켠다).
  if (activeCallers.size > 0) {
    pausedByUs = true;
    logger.info("[audioSession] interruption end → modal still open, ownership transferred to modal release");
    return;
  }
  if (!bridge) return;
  if (!autoResumeAfterInterruption) {
    logger.info("[audioSession] interruption end → auto-resume disabled by user setting, skipping resume");
    return;
  }
  try {
    if (!bridge.isRunning()) {
      suppressUserToggle++;
      try {
        bridge.resume();
        // 주의: androidProbe?.start() 를 호출하지 않는다.
        // 프로브는 이미 살아있다 — OS 가 Sound 를 자동 재개해 isPlaying: true
        // 이벤트를 발생시키고 그 이벤트가 이 함수를 호출했다.
      } finally {
        suppressUserToggle--;
      }
      logger.info("[audioSession] interruption end → metronome resumed");
    } else {
      logger.info("[audioSession] interruption end → metronome already running, no-op");
    }
  } catch (e) {
    logger.warn("[audioSession] interruption resume failed:", e);
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
  pausedByInterruption = false;
  userToggledDuringInterruption = false;
  androidProbe = null;
  autoResumeAfterInterruption = true;
}

export function _audioSessionDebugState() {
  return {
    activeCallers: Array.from(activeCallers.entries()),
    pausedByUs,
    pausedByInterruption,
    hasBridge: bridge !== null,
  };
}
