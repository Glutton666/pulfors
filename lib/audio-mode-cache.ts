import { Platform } from "react-native";
import { logger } from "@/lib/logger";

/**
 * setAudioModeAsync 호출을 감싸 "이미 적용된 설정과 동일하면 네이티브 호출을
 * 생략"하는 캐시 레이어.
 *
 * 배경 (2026-08-02, adb logcat 실기기 재현으로 확인):
 * expo-audio 의 Android 구현은 setAudioModeAsync 가 호출될 때마다 전달된
 * 필드 값과 무관하게 매번 무조건 다음을 실행한다 (updatePlaySoundThroughEarpiece,
 * shouldRouteThroughEarpiece 기본값 false):
 *   audioManager.mode = AudioManager.MODE_NORMAL
 *   audioManager.setSpeakerphoneOn(true)
 *
 * 이 네이티브 호출은 AudioDeviceBroker 의 커뮤니케이션 라우팅 재구성을
 * 트리거하는데, 메트로놈이 재생을 시작하며 자신의 AudioTrack 을 생성하는
 * 시점과 겹치면 AudioFlinger 가 "createTrack_l() initCheck failed -12;
 * no control block?" 로 트랙 생성에 실패해 무음으로 이어진다.
 *
 * 여러 모듈(오디오 포커스 프로브, 포그라운드 서비스, 앱 부팅 초기화, 녹음
 * 세션 매니저)이 각자 독립적으로 setAudioModeAsync 를 호출하면서 재생 시작
 * 시점에 이 호출이 중복/경합되는 것이 근본 원인이었다. 동일한 설정을 다시
 * 적용하려는 호출을 여기서 걸러내면 실제 네이티브 호출 빈도가 크게 줄어
 * 경합 창이 좁아진다.
 */
export interface AudioModeConfig {
  allowsRecording: boolean;
  playsInSilentMode: boolean;
  interruptionMode: "doNotMix" | "mixWithOthers";
  shouldPlayInBackground: boolean;
}

let lastApplied: AudioModeConfig | null = null;

function sameConfig(a: AudioModeConfig, b: AudioModeConfig): boolean {
  return (
    a.allowsRecording === b.allowsRecording &&
    a.playsInSilentMode === b.playsInSilentMode &&
    a.interruptionMode === b.interruptionMode &&
    a.shouldPlayInBackground === b.shouldPlayInBackground
  );
}

/**
 * 이전에 적용한 설정과 다를 때만 네이티브 setAudioModeAsync 를 호출한다.
 *
 * 캐시 갱신(lastApplied 대입)은 await 이전, 동기적으로 수행한다 — 같은 tick
 * 안에서 여러 호출자가 연달아 이 함수를 부르는 경우(예: 재생 버튼 하나로
 * 포커스 프로브와 포그라운드 서비스가 동시에 트리거되는 경우)에도 두 번째
 * 호출자가 첫 번째 호출자가 아직 await 중인 native Promise 를 기다리지 않고
 * 즉시 스킵하도록 하기 위함이다.
 */
export async function applyAudioModeIfChanged(config: AudioModeConfig): Promise<void> {
  if (Platform.OS === "web") return;
  if (lastApplied && sameConfig(lastApplied, config)) return;
  lastApplied = config;
  try {
    // require() 는 의도적이다 — tests/_stubs/setup.cjs 의 STUB_MAP 이
    // require() 훅에만 적용되므로, 다른 모듈들(android-audio-focus.ts 등)과
    // 동일한 패턴을 사용해 테스트 스텁 교체가 정상 동작하게 한다.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { setAudioModeAsync } = require("expo-audio") as typeof import("expo-audio");
    await setAudioModeAsync(config);
  } catch (e) {
    // 실패하면 캐시를 무효화해 다음 호출이 재시도하도록 한다.
    lastApplied = null;
    logger.warn("[audioModeCache] setAudioModeAsync failed:", e);
  }
}

/** 테스트 전용: 캐시 상태를 초기화한다. */
export function _resetAudioModeCacheForTests(): void {
  lastApplied = null;
}
