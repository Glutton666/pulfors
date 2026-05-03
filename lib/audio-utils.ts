import { captureBreadcrumb } from "./error-tracking";
import { logger } from "./logger";

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
    logger.warn(`[audio] play threw (${label}):`, e);
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
      logger.warn(`[audio] play rejected (${label}):`, e);
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
          logger.warn(`[audio] seek rejected (${label}):`, e);
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
    logger.warn(`[audio] seek threw (${label}):`, e);
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

/**
 * BPM과 분할(subdivisions) 기준으로 적정 오디오 풀 크기를 권장합니다.
 *
 * 빠른 템포 + 잦은 분할 환경에서는 같은 role/사운드의 호출 간격이 짧아져
 * 단순 A/B 더블버퍼만으로는 이전 재생이 끝나기 전에 같은 슬롯이 재호출되어
 * cut-off가 발생합니다. 풀 크기를 round-robin으로 늘리면 cut-off를 줄일 수 있습니다.
 *
 * 휴리스틱: 1초당 같은 사운드 호출 횟수(hitsPerSec) 기반.
 * 빌트인 메트로놈 샘플 평균 길이가 ~120ms 내외라는 가정 하에:
 *   - hitsPerSec ≤ 5  (≈ 60BPM × 8분 또는 120BPM × 4분): 2 (현 기본값)
 *   - hitsPerSec ≤ 9  (≈ 200BPM × 16분 미만):           3
 *   - hitsPerSec >  9                                     : 4
 *
 * 같은 role이 매 비트 호출되는 것이 아니라, 보통 한 마디에서 강박/약박/일반박이
 * 분리되므로 실제 인스턴스당 호출은 더 드뭅니다. 따라서 적당히 보수적으로 둡니다.
 *
 * @param bpm 분당 박수 (clamp: 1~600)
 * @param subdivisions 비트당 분할 수 (clamp: 1~16)
 * @returns 권장 풀 크기 (2~4)
 */
export function computeRecommendedPoolSize(
  bpm: number,
  subdivisions: number,
): number {
  const safeBpm = Number.isFinite(bpm) ? Math.max(1, Math.min(600, bpm)) : 120;
  const safeSub = Number.isFinite(subdivisions)
    ? Math.max(1, Math.min(16, Math.floor(subdivisions)))
    : 1;
  const hitsPerSec = (safeBpm * safeSub) / 60;
  if (hitsPerSec > 9) return 4;
  if (hitsPerSec > 5) return 3;
  return 2;
}
