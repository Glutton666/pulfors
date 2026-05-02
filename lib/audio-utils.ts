import { captureBreadcrumb } from "./error-tracking";

interface PlayerLike {
  play: () => unknown;
}

/**
 * `player.play()` 호출을 안전하게 감싸 동기/비동기 양쪽 실패를 모두 잡습니다.
 *
 * 이전에는 코드 곳곳에 `try { p.play(); } catch {}` 가 흩어져 있어
 * 오디오 시스템 실패가 조용히 묵살되었습니다. 이 헬퍼는 실패를 콘솔에 남기고
 * (DSN이 설정된 경우) Sentry breadcrumb으로도 기록해 디버깅을 가능케 합니다.
 *
 * @param player .play() 메서드를 가진 객체. null/undefined도 안전하게 무시됩니다.
 * @param label 디버깅용 컨텍스트 라벨 (예: "metronome.tick", "preview.start")
 */
export function safePlay(player: PlayerLike | null | undefined, label: string): void {
  if (!player || typeof player.play !== "function") return;
  let result: unknown;
  try {
    result = player.play();
  } catch (e) {
    console.warn(`[audio] play threw (${label}):`, e);
    captureBreadcrumb({
      category: "audio.play",
      message: `play threw: ${label}`,
      level: "warning",
      data: { error: String(e) },
    });
    return;
  }
  if (result && typeof (result as any).then === "function") {
    (result as Promise<unknown>).catch((e: unknown) => {
      console.warn(`[audio] play rejected (${label}):`, e);
      captureBreadcrumb({
        category: "audio.play",
        message: `play rejected: ${label}`,
        level: "warning",
        data: { error: String(e) },
      });
    });
  }
}

/**
 * seekTo + play 조합을 안전하게 처리합니다.
 * seekTo가 Promise를 반환하면 await한 후 play를 호출합니다.
 */
export function safeSeekAndPlay(
  player: (PlayerLike & { seekTo: (s: number) => unknown }) | null | undefined,
  seconds: number,
  label: string
): void {
  if (!player) return;
  try {
    const seekResult = player.seekTo(seconds);
    if (seekResult && typeof (seekResult as any).then === "function") {
      (seekResult as Promise<unknown>)
        .then(() => safePlay(player, label))
        .catch((e: unknown) => {
          console.warn(`[audio] seek rejected (${label}):`, e);
          captureBreadcrumb({
            category: "audio.seek",
            message: `seek rejected: ${label}`,
            level: "warning",
            data: { error: String(e) },
          });
        });
    } else {
      safePlay(player, label);
    }
  } catch (e) {
    console.warn(`[audio] seek threw (${label}):`, e);
    captureBreadcrumb({
      category: "audio.seek",
      message: `seek threw: ${label}`,
      level: "warning",
      data: { error: String(e) },
    });
  }
}

/**
 * AudioRecorder 인스턴스를 안전하게 정리합니다.
 * stop은 Promise를 반환할 수 있으므로 await하고, 그 후 SharedObject의 remove()를 호출합니다.
 * expo-audio의 공개 타입에는 remove()가 노출되지 않으므로 SharedObject 캐스트가 필요합니다.
 *
 * @param rec 정리할 AudioRecorder. null이면 무시.
 * @param label 디버깅 컨텍스트 (예: "mic.tuner.cleanup")
 */
export async function releaseRecorder(
  rec: { stop: () => unknown } | null | undefined,
  label: string,
): Promise<void> {
  if (!rec) return;
  try {
    const r = rec.stop();
    if (r && typeof (r as any).then === "function") {
      await (r as Promise<unknown>).catch(() => {});
    }
  } catch (e) {
    captureBreadcrumb({
      category: "audio.recorder",
      message: `stop threw: ${label}`,
      level: "warning",
      data: { error: String(e) },
    });
  }
  try {
    (rec as any).remove?.();
  } catch (e) {
    captureBreadcrumb({
      category: "audio.recorder",
      message: `remove threw: ${label}`,
      level: "warning",
      data: { error: String(e) },
    });
  }
}

/**
 * 오디오 풀 워치독: 사운드셋 폴백이 일어나거나 풀에서 플레이어를 찾지 못했을 때 호출합니다.
 * 빈도/디바이스 패턴을 추적하기 위한 breadcrumb을 남깁니다.
 */
export function notifyAudioPoolFallback(
  reason: string,
  data?: Record<string, unknown>,
): void {
  captureBreadcrumb({
    category: "audio.pool",
    message: `pool fallback: ${reason}`,
    level: "warning",
    data,
  });
}
