import { Platform } from "react-native";
import type { BeatType } from "@/lib/metronome-engine";
import { getPracticeSessionDuration, isPracticeSessionIncludedInActivityTotals, type ActivityLog, type PracticeSessionData } from "@/lib/activity-log";

export interface LandscapeStatsTotals {
  todayTotal: number;
  todayBeat: number;
  todayBar: number;
  weekTotal: number;
}

/**
 * 가로화면 통계 위젯 집계.
 * 오늘/이번 주(월요일 기준) 합계와 모드별(dial/bar) 분리.
 * @param logs activity log 배열
 * @param now 기준 시각 (테스트 주입용, 기본값 new Date())
 */
export function computeLandscapeStats(
  logs: ActivityLog[],
  now: Date = new Date(),
): LandscapeStatsTotals {
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(now);
  const day = weekStart.getDay();
  const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1);
  weekStart.setDate(diff); weekStart.setHours(0, 0, 0, 0);
  const todayMs = todayStart.getTime();
  const weekMs = weekStart.getTime();
  let todayTotal = 0, todayBeat = 0, todayBar = 0, weekTotal = 0;
  for (const l of logs) {
    if (l.type !== "practice_session") continue;
    const d = l.data as PracticeSessionData;
    if (!isPracticeSessionIncludedInActivityTotals(d)) continue;
    const dur = getPracticeSessionDuration(d);
    if (l.timestamp >= weekMs) weekTotal += dur;
    if (l.timestamp >= todayMs) {
      todayTotal += dur;
      if (d.mode === "dial") todayBeat += dur;
      else if (d.mode === "bar") todayBar += dur;
    }
  }
  return { todayTotal, todayBeat, todayBar, weekTotal };
}

/**
 * 표준 복합박자(6/8, 9/8, 12/8)에 해당하는 총 박(서브비트) 수인지 판별.
 * 이 앱은 별도의 분자/분모 시간표기 UI가 없고 beatsPerMeasure(총 8분음표 개수)만
 * 다루므로, 6·9·12는 항상 "점4분음표 단위로 3개씩 묶이는 복합박자"로 간주한다.
 */
export function isCompoundMeterBeatCount(beats: number): boolean {
  return beats === 6 || beats === 9 || beats === 12;
}

/**
 * 복합박자에서 큰 박(그룹)이 시작되는 인덱스 목록(3개 단위)을 반환.
 * 예) 6 → [0, 3] (2개 그룹), 9 → [0, 3, 6] (3개 그룹), 12 → [0, 3, 6, 9] (4개 그룹)
 */
export function getCompoundGroupStarts(beats: number): number[] {
  if (!isCompoundMeterBeatCount(beats)) return [];
  const starts: number[] = [];
  for (let i = 0; i < beats; i += 3) starts.push(i);
  return starts;
}

export function defaultBeatTypes(beats: number): BeatType[] {
  if (isCompoundMeterBeatCount(beats)) {
    const groupStarts = new Set(getCompoundGroupStarts(beats));
    return Array.from({ length: beats }, (_, i) =>
      i === 0 ? "strong" : groupStarts.has(i) ? "accent" : "normal"
    );
  }
  return Array.from({ length: beats }, (_, i) =>
    i === 0 ? "accent" : "normal"
  );
}

/**
 * Validate that a noteSample URI is a local resource.
 * Blocks attacker-supplied http/https URIs that would cause outbound network
 * requests from the victim device (SSRF / privacy beacon via deep-link import).
 */
export function isSafeNoteSampleUri(uri: string): boolean {
  const raw = uri.split("#")[0];
  if (raw.startsWith("http://") || raw.startsWith("https://")) return false;
  if (Platform.OS !== "web") {
    return raw.startsWith("file://") || raw.startsWith("asset://");
  }
  return raw.startsWith("blob:") || raw.startsWith("data:") || raw.startsWith("file://");
}
