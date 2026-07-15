import type { ActivityLog, PracticeSessionData } from "@/lib/activity-log";

export interface DailyStat {
  label: string;
  totalSec: number;
  beatSec: number;
  barSec: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;

/**
 * 최근 N일치 일별 연습시간 통계를 계산합니다.
 * - days <= 7 이면 요일 라벨, 그 이상은 "M/D" 라벨
 * - practice_session 로그만 집계, 그 외 타입은 무시
 * - 0초·음수·NaN duration은 건너뜀
 * - 오늘 자정 기준 dayDelta로 버킷팅 (timezone은 로컬)
 *
 * @param logs 활동 로그 (시간 정렬 무관)
 * @param days 표시 일수 (>=1)
 * @param now 기준 시각 (테스트용 주입, 기본 Date.now())
 */
export function buildDailyStats(
  logs: ActivityLog[],
  days: number = 7,
  now: number = Date.now(),
): DailyStat[] {
  const safeDays = Math.max(1, Math.floor(days));
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const buckets: DailyStat[] = [];
  for (let i = safeDays - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * DAY_MS);
    const label = safeDays <= 7
      ? WEEK_LABELS[d.getDay()]
      : `${d.getMonth() + 1}/${d.getDate()}`;
    buckets.push({ label, totalSec: 0, beatSec: 0, barSec: 0 });
  }

  for (const log of logs) {
    if (log.type !== "practice_session") continue;
    const data = log.data as PracticeSessionData;
    const dur = data.duration;
    if (!Number.isFinite(dur) || dur <= 0) continue;
    if (!Number.isFinite(log.timestamp)) continue;
    const tsMs = new Date(log.timestamp).setHours(0, 0, 0, 0);
    if (!Number.isFinite(tsMs)) continue;
    const dayDelta = Math.floor((today.getTime() - tsMs) / DAY_MS);
    if (dayDelta < 0 || dayDelta >= safeDays) continue;
    const idx = safeDays - 1 - dayDelta;
    if (idx < 0 || idx >= buckets.length) continue;
    buckets[idx].totalSec += dur;
    if (data.mode === "dial") buckets[idx].beatSec += dur;
    else if (data.mode === "bar") buckets[idx].barSec += dur;
  }

  return buckets;
}

/**
 * 통계 전체가 비어있는지(empty state 표시 필요 여부).
 */
export function isStatsEmpty(stats: DailyStat[]): boolean {
  return stats.every((s) => s.totalSec === 0);
}
