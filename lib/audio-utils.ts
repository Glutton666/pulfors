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
