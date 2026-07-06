import { Platform } from "react-native";
import { Audio, InterruptionModeAndroid } from "expo-av";
import type { AVPlaybackStatus } from "expo-av";
import { logger } from "@/lib/logger";

/**
 * Android Audio Focus Monitor
 *
 * Android에서는 AppState 'inactive'가 거의 발생하지 않기 때문에, 전화 수신
 * 같은 포그라운드 인터럽션을 AppState만으로는 안정적으로 감지할 수 없다.
 * 본 모듈은 expo-av Sound를 "포커스 프로브"로 사용해 AudioManager의
 * AUDIOFOCUS_LOSS / AUDIOFOCUS_LOSS_TRANSIENT 이벤트를 JS 레벨에서 감지한다.
 *
 * 설계:
 * - volume=0 의 무음 루프 Sound를 expo-av로 생성한다.
 * - shouldDuckAndroid=false 로 설정해 포커스를 잃으면 덕킹이 아닌 일시정지가
 *   발생하도록 한다 (이래야 isPlaying 이 false 로 바뀌어 감지 가능).
 * - onPlaybackStatusUpdate 에서 isPlaying 이 예기치 않게 false 로 바뀌면
 *   onFocusLoss 를, 복귀하면 onFocusGain 을 호출한다.
 *
 * 프로브 생명주기:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ startAndroidFocusProbe() — 메트로놈이 재생 시작할 때           │
 * │ stopAndroidFocusProbe()  — 메트로놈이 완전히 정지할 때         │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * 중요: OS 인터럽션(전화 수신 등)이 발생하면 시스템이 Sound 를 일시정지할
 * 뿐이고 프로브는 살아있다. 통화가 끝나면 시스템이 Sound 를 자동 재개하여
 * isPlaying: true 이벤트를 발생시키므로, 그 신호로 onFocusGain 을 호출해
 * 메트로놈을 자동 재개한다.
 * → audio-session.ts 의 notifyInterruptionBegin/End 는 프로브를
 *   절대 정지/시작하지 않는다. 이 원칙을 지켜야 auto-resume 이 동작한다.
 *
 * 우선순위:
 * 1. expo-audio 가 나중에 인터럽션 콜백을 노출하면 그 API를 우선 사용.
 *    (2026-05-09 조사, 56.0.3 재확인: expo-audio 1.1.1 ~ 56.0.3 모두 미노출
 *     → 가드 조건이 false 로 평가됨)
 * 2. 현재는 expo-av 폴백으로 동작한다.
 */

/**
 * expo-av 프로브의 상태 폴링 간격 (ms).
 *
 * expo-av 의 `progressUpdateIntervalMillis` 는 순수 폴링(고정 주기 타이머)이며,
 * isPlaying 전환이 발생해도 즉시 콜백이 오지 않는다 — 다음 예정된 폴링 시점에만
 * 상태를 확인한다. 따라서 이 값보다 짧게 시작하고 끝나는 인터럽트(짧은 알림음 등)는
 * onFocusLoss/onFocusGain 이 아예 호출되지 않을 수 있다.
 *
 * 폴링은 고정 위상(fixed-phase)으로 스케줄링되므로, 지속 시간이 이 값 이상인
 * 인터럽트는 반드시 폴링 시점 하나 이상을 포함한다 (pigeonhole 보장) → 놓치지 않는다.
 * 즉, 이 상수 값이 "확실히 감지 가능한 최소 인터럽트 길이"다.
 *
 * 300ms → 50ms 로 낮춰 감지 지연을 크게 줄인다. 무음 볼륨 프로브의 상태
 * 콜백은 단순 Bundle 읽기 수준이라 50ms 주기로도 배터리/성능 영향은 미미하다.
 */
export const PROBE_PROGRESS_UPDATE_INTERVAL_MS = 50;

type FocusCallback = () => void;

interface ProbeState {
  sound: Audio.Sound;
  interrupted: boolean;
}

let probe: ProbeState | null = null;
let _onFocusLoss: FocusCallback | null = null;
let _onFocusGain: FocusCallback | null = null;

// expo-audio 네이티브 구독 — stopAndroidFocusProbe 시 반드시 해제해야 한다.
let expoAudioSub: { remove: () => void } | null = null;

// expo-audio 네이티브 API 가용 여부 캐시.
// null = 아직 확인 안 함, true/false = 확인 완료.
// 매 startAndroidFocusProbe 호출마다 동적 import 와 경고 로그가 반복되지
// 않도록 한 번만 체크하고 결과를 재사용한다.
let expoAudioCapabilityChecked: boolean | null = null;
let expoAudioNativeAvailable = false;

function handlePlaybackStatus(status: AVPlaybackStatus): void {
  if (!probe) return;
  if (!status.isLoaded) return;

  const isPlaying = status.isPlaying;

  if (!isPlaying && !probe.interrupted) {
    // 우리가 멈추지 않았는데 isPlaying 이 false → audio focus 손실
    // 프로브는 언로드하지 않는다. 포커스가 회복되면 OS 가 Sound 를
    // 자동 재개해 isPlaying: true 이벤트를 보내준다.
    probe.interrupted = true;
    logger.info("[androidFocus] audio focus lost → calling onFocusLoss");
    _onFocusLoss?.();
  } else if (isPlaying && probe.interrupted) {
    // 시스템이 focus 를 돌려줘 probe 가 자동 재개됨 → focus 회복
    probe.interrupted = false;
    logger.info("[androidFocus] audio focus regained → calling onFocusGain");
    _onFocusGain?.();
  }
}

/**
 * 인터럽션 콜백을 등록한다. 사운드 프로브는 시작하지 않는다.
 * 앱 마운트 시 한 번 호출한다.
 */
export function initAndroidFocusCallbacks(
  onFocusLoss: FocusCallback,
  onFocusGain: FocusCallback,
): void {
  if (Platform.OS !== "android") return;
  _onFocusLoss = onFocusLoss;
  _onFocusGain = onFocusGain;
}

/**
 * 오디오 포커스 프로브를 시작한다.
 * 메트로놈이 실제로 재생을 시작할 때만 호출해야 한다.
 * 이미 프로브가 실행 중이면 no-op 이다.
 *
 * OS 인터럽션 중에는 호출하면 안 된다 — 인터럽션 중에는 프로브가 살아있어야
 * focus 회복 이벤트를 받을 수 있다. audio-session.ts 에서 interruption
 * begin/end 경로에 이 함수를 절대 넣지 않도록 주의한다.
 */
export async function startAndroidFocusProbe(): Promise<void> {
  if (Platform.OS !== "android") return;
  if (probe || expoAudioSub) return; // 이미 실행 중

  // ── 우선순위 1: expo-audio 네이티브 인터럽션 콜백 (현재 미노출) ──────────
  // expo-audio 가 향후 addInterruptionListener 등을 노출하면 여기서 사용한다.
  // 가용성 확인은 최초 1회만 수행하고 결과를 캐시해 반복 경고 로그를 방지한다.
  if (expoAudioCapabilityChecked === null) {
    try {
      // require() 는 의도적이다: await import() 는 Node.js 22 에서 ESM 경로로
      // 처리되어 테스트용 Module._resolveFilename 훅을 우회한다. require() 를
      // 사용하면 tests/_stubs/setup.cjs 의 STUB_MAP 이 작동해 노이즈 없는
      // 스텁 교체가 가능하다. 런타임(Metro)에서는 정적 require 로 번들링되어
      // 동작에 차이가 없다.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const expoAudioMod = require("expo-audio") as typeof import("expo-audio");
      const audioModule = (expoAudioMod as Record<string, unknown>).AudioModule as
        | {
            addInterruptionListener?: (
              event: string,
              cb: (e: { type: string }) => void,
            ) => { remove: () => void };
          }
        | undefined;
      expoAudioNativeAvailable =
        audioModule != null &&
        typeof audioModule.addInterruptionListener === "function";
    } catch (err) {
      logger.warn("[androidFocus] expo-audio import check failed:", err);
      expoAudioNativeAvailable = false;
    }
    expoAudioCapabilityChecked = expoAudioNativeAvailable;
    if (expoAudioNativeAvailable) {
      logger.info("[androidFocus] expo-audio native interruption API detected");
    }
  }

  if (expoAudioNativeAvailable) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const expoAudioMod = require("expo-audio") as typeof import("expo-audio");
      const audioModule = (expoAudioMod as Record<string, unknown>).AudioModule as
        | {
            addInterruptionListener?: (
              event: string,
              cb: (e: { type: string }) => void,
            ) => { remove: () => void };
          }
        | undefined;
      if (audioModule?.addInterruptionListener) {
        const sub = audioModule.addInterruptionListener("interruption", (event) => {
          if (event.type === "began") {
            logger.info("[androidFocus] expo-audio: interruption began");
            _onFocusLoss?.();
          } else if (event.type === "ended") {
            logger.info("[androidFocus] expo-audio: interruption ended");
            _onFocusGain?.();
          }
        });
        expoAudioSub = sub;
        return;
      }
    } catch (err) {
      logger.warn("[androidFocus] expo-audio listener registration failed:", err);
    }
  }

  // ── 우선순위 2: expo-av Sound 프로브 ─────────────────────────────────────
  logger.info("[androidFocus] starting expo-av sound probe");
  try {
    // shouldDuckAndroid=false: 포커스를 잃으면 덕킹 대신 일시정지되어
    // isPlaying 이 false 로 전환 → JS 에서 감지 가능.
    await Audio.setAudioModeAsync({
      interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
      shouldDuckAndroid: false,
    });

    const { sound } = await Audio.Sound.createAsync(
      // 기존 에셋의 짧은 WAV 파일을 volume=0 루프로 사용 → 사용자에게 들리지 않음
      require("@/assets/sounds/click-low.wav"),
      {
        shouldPlay: true,
        isLooping: true,
        volume: 0,
        progressUpdateIntervalMillis: PROBE_PROGRESS_UPDATE_INTERVAL_MS,
      },
      handlePlaybackStatus,
    );

    probe = { sound, interrupted: false };
    logger.info("[androidFocus] expo-av focus probe started");
  } catch (err) {
    logger.warn("[androidFocus] failed to start focus probe:", err);
    probe = null;
  }
}

/**
 * 오디오 포커스 프로브를 정지하고 리소스를 해제한다.
 * 메트로놈이 사용자에 의해 정지할 때만 호출해야 한다.
 *
 * OS 인터럽션 중에는 호출하면 안 된다 — 프로브가 살아있어야 포커스 회복을
 * 감지할 수 있다. 인터럽션 종료 후 auto-resume 이 완료된 다음에도 여전히
 * 프로브가 필요하므로 "재생 중 = 프로브 존재" 불변식을 유지한다.
 *
 * 프로브가 없으면 no-op 이다.
 */
export async function stopAndroidFocusProbe(): Promise<void> {
  // expo-audio 구독이 있으면 먼저 해제한다.
  if (expoAudioSub) {
    const sub = expoAudioSub;
    expoAudioSub = null;
    try {
      sub.remove();
      logger.info("[androidFocus] expo-audio subscription removed");
    } catch (err) {
      logger.warn("[androidFocus] expo-audio subscription removal failed:", err);
    }
  }

  if (!probe) return;
  const p = probe;
  probe = null;
  try {
    await p.sound.unloadAsync();
    logger.info("[androidFocus] expo-av focus probe stopped");
  } catch (err) {
    logger.warn("[androidFocus] probe cleanup failed:", err);
  }
}

/** 테스트 전용: 모듈 수준 상태를 초기화한다. */
export function _resetAndroidFocusForTests(): void {
  probe = null;
  expoAudioSub = null;
  _onFocusLoss = null;
  _onFocusGain = null;
  expoAudioCapabilityChecked = null;
  expoAudioNativeAvailable = false;
}
