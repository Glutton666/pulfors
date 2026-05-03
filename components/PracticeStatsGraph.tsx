import React, { useMemo } from "react";
import { View, Text } from "react-native";
import Svg, { Rect, Line } from "react-native-svg";
import type { ActivityLog, PracticeSessionData } from "@/lib/activity-log";

export interface DailyStat {
  label: string;
  totalSec: number;
  beatSec: number;
  barSec: number;
}

interface Props {
  logs: ActivityLog[];
  accentColor: string;
  borderColor: string;
  textColor: string;
  textSecondary: string;
  width?: number;
  height?: number;
  /** 표시 일수: 7 = 주간, 30 = 월간 */
  days?: number;
}

/**
 * 7일/30일치 일별 연습시간 막대그래프.
 * 활성도가 0인 날에도 회색 빈 막대로 표시해 시각적 흐름이 유지되게 합니다.
 */
export function buildDailyStats(logs: ActivityLog[], days: number = 7): DailyStat[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayMs = 24 * 60 * 60 * 1000;

  const buckets: DailyStat[] = [];
  const labels = ["일", "월", "화", "수", "목", "금", "토"];

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * dayMs);
    const label = days <= 7 ? labels[d.getDay()] : `${d.getMonth() + 1}/${d.getDate()}`;
    buckets.push({ label, totalSec: 0, beatSec: 0, barSec: 0 });
  }

  for (const log of logs) {
    if (log.type !== "practice_session") continue;
    const data = log.data as PracticeSessionData;
    const dur = data.duration || 0;
    const ts = log.timestamp;
    const tsMs = new Date(ts).setHours(0, 0, 0, 0);
    if (!Number.isFinite(tsMs)) continue;
    const dayDelta = Math.floor((today.getTime() - tsMs) / dayMs);
    if (dayDelta < 0 || dayDelta >= days) continue;
    const idx = days - 1 - dayDelta;
    if (idx < 0 || idx >= buckets.length) continue;
    buckets[idx].totalSec += dur;
    if (data.mode === "dial") buckets[idx].beatSec += dur;
    else if (data.mode === "bar") buckets[idx].barSec += dur;
  }

  return buckets;
}

export default function PracticeStatsGraph({
  logs,
  accentColor,
  borderColor,
  textColor,
  textSecondary,
  width = 280,
  height = 80,
  days = 7,
}: Props) {
  const stats = useMemo(() => buildDailyStats(logs, days), [logs, days]);
  const maxSec = useMemo(() => {
    const m = Math.max(...stats.map((s) => s.totalSec), 1);
    return m;
  }, [stats]);

  const padX = 8;
  const padBottom = 14;
  const padTop = 4;
  const innerW = width - padX * 2;
  const innerH = height - padBottom - padTop;
  const slot = innerW / stats.length;
  const barW = Math.max(2, Math.min(slot - 4, 18));

  return (
    <View>
      <Svg width={width} height={height}>
        <Line
          x1={padX}
          y1={padTop + innerH}
          x2={padX + innerW}
          y2={padTop + innerH}
          stroke={borderColor}
          strokeWidth={1}
        />
        {stats.map((s, i) => {
          const cx = padX + slot * i + slot / 2;
          const ratio = s.totalSec / maxSec;
          const h = Math.max(2, ratio * innerH);
          const y = padTop + innerH - h;
          const beatRatio = s.totalSec > 0 ? s.beatSec / s.totalSec : 0;
          const beatH = h * beatRatio;
          const isEmpty = s.totalSec === 0;
          return (
            <React.Fragment key={i}>
              {isEmpty ? (
                <Rect
                  x={cx - barW / 2}
                  y={padTop + innerH - 2}
                  width={barW}
                  height={2}
                  fill={borderColor}
                  rx={1}
                />
              ) : (
                <>
                  <Rect
                    x={cx - barW / 2}
                    y={y}
                    width={barW}
                    height={h}
                    fill={accentColor}
                    opacity={0.35}
                    rx={2}
                  />
                  <Rect
                    x={cx - barW / 2}
                    y={padTop + innerH - beatH}
                    width={barW}
                    height={beatH}
                    fill={accentColor}
                    rx={2}
                  />
                </>
              )}
            </React.Fragment>
          );
        })}
      </Svg>
      <View style={{ flexDirection: "row", paddingHorizontal: padX, marginTop: -4 }}>
        {stats.map((s, i) => (
          <View key={i} style={{ flex: 1, alignItems: "center" }}>
            <Text
              style={{
                color: textSecondary,
                fontSize: 9,
                fontFamily: "Inter_500Medium",
              }}
              numberOfLines={1}
            >
              {s.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
