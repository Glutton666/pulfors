/**
 * Android 포그라운드 서비스 연동
 *
 * expo-audio의 AudioControlsService는 MediaSessionService를 상속하는
 * 실제 Android 포그라운드 서비스입니다(android:foregroundServiceType="mediaPlayback").
 * AudioPlayer가 재생 중일 때 내부적으로 startForeground()를 호출합니다.
 *
 * 이 모듈은 메트로놈 재생 생명주기와 포그라운드 서비스를 명시적으로 연동합니다.
 *
 * 흐름:
 *  1. 메트로놈 시작 → requestForegroundPlayback() 호출
 *     → AudioModule.setAudioModeAsync({ shouldPlayInBackground: true })를 적용해
 *       OnActivityEntersBackground 콜백이 오디오를 멈추지 않도록 보장
 *     → createAudioPlayer()로 생성된 AudioPlayer가 재생되면
 *       AudioControlsService.postOrStartForegroundNotification(startInForeground=true)가
 *       자동으로 호출됩니다.
 *  2. 메트로놈 정지 → relinquishForegroundPlayback() 호출
 *     → AudioPlayer가 정지되면 AudioControlsService가 stopSelf()를 호출하고
 *       포그라운드 서비스가 자동으로 해제됩니다.
 *
 * 비-Android 플랫폼에서는 아무 작업도 수행하지 않습니다.
 */

import { Platform } from "react-native";
import { logger } from "./logger";

/**
 * 포그라운드 서비스 활성 여부를 추적합니다.
 * 중복 호출 시 setAudioModeAsync 재실행을 방지합니다.
 */
let isForegroundActive = false;

/**
 * 메트로놈 재생 시작 시 호출합니다.
 * Android에서 expo-audio의 AudioControlsService(foreground service)가
 * 백그라운드에서도 오디오를 유지하도록 AudioModule을 설정합니다.
 */
export async function requestForegroundPlayback(): Promise<void> {
  if (Platform.OS !== "android") return;
  if (isForegroundActive) return;

  try {
    // AudioModule을 동적으로 import해 번들러가 플랫폼별로 처리하도록 합니다.
    // require()를 사용해 테스트 스텁(STUB_MAP)이 정상적으로 적용되도록 합니다.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { AudioModule } = require("expo-audio") as typeof import("expo-audio");

    // shouldPlayInBackground: true → AudioModule.kt의 staysActiveInBackground 플래그를 설정.
    // OnActivityEntersBackground 콜백에서 AudioPlayer를 정지하지 않게 되어,
    // AudioControlsService가 MediaSessionService로서 startForeground()를 유지합니다.
    await AudioModule.setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: "mixWithOthers",
      shouldPlayInBackground: true,
    });

    isForegroundActive = true;
    logger.info("[foreground-service] Android foreground audio activated");
  } catch (e) {
    logger.warn("[foreground-service] requestForegroundPlayback failed:", e);
  }
}

/**
 * 메트로놈 재생 정지 시 호출합니다.
 * AudioPlayer가 정지되면 AudioControlsService는 자동으로 포그라운드 서비스를
 * 해제하므로 JS 레벨에서 추가 작업이 필요하지 않습니다.
 * 상태를 초기화해 다음 재생 시 재설정이 가능하도록 합니다.
 */
export function relinquishForegroundPlayback(): void {
  if (Platform.OS !== "android") return;
  if (!isForegroundActive) return;

  // AudioPlayer가 정지되면 AudioControlsService.clearSession()이 자동으로 호출되어
  // stopForeground() → stopSelf()로 이어집니다.
  // JS 레벨에서는 상태만 초기화합니다.
  isForegroundActive = false;
  logger.info("[foreground-service] Android foreground audio released");
}
