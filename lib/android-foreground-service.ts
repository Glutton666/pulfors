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
import { applyAudioModeIfChanged } from "./audio-mode-cache";

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
    // shouldPlayInBackground: true → AudioModule.kt의 staysActiveInBackground 플래그를 설정.
    // OnActivityEntersBackground 콜백에서 AudioPlayer를 정지하지 않게 되어,
    // AudioControlsService가 MediaSessionService로서 startForeground()를 유지합니다.
    //
    // interruptionMode는 반드시 lib/android-audio-focus.ts의 오디오 포커스
    // 프로브와 동일한 값을 사용해야 합니다. 재생 버튼 하나로 이 함수와 포커스
    // 프로브가 거의 동시에 서로 다른
    // interruptionMode로 setAudioModeAsync를 호출하면서 매 재생마다 오디오 모드가
    // 오락가락(mixWithOthers ↔ doNotMix)했습니다. expo-audio의 Android 구현은
    // setAudioModeAsync 호출마다 무조건 AudioManager.setSpeakerphoneOn(true)를
    // 실행하므로, 이 오락가락이 메트로놈 자신의 AudioTrack 생성과 경합해
    // "createTrack_l() initCheck failed -12" → 무음을 유발했습니다
    // (2026-08-02 adb logcat 실기기 재현으로 확인). 두 호출자가 같은 설정을
    // 쓰면 applyAudioModeIfChanged 캐시가 둘 중 하나만 실제로 실행해 경합을
    // 없앤다.
    await applyAudioModeIfChanged({
      allowsRecording: false,
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
