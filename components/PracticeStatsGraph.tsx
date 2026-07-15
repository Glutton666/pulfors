import React, { useMemo } from "react";
import { View, Text } from "react-native";
import Svg, { Rect, Line } from "react-native-svg";
import type { ActivityLog } from "@/lib/activity-log";
import { buildDailyStats, isStatsEmpty, type DailyStat } from "./practice-stats-utils";
import { FontSize } from "@/constants/tokens";
import { createT, type Language } from "@/lib/i18n";

export type { DailyStat };
export { buildDailyStats, isStatsEmpty };

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
  /** 언어 (i18n empty state 텍스트). 미지정시 "ko" */
  lang?: Language;
}

/**
 * 7일/30일치 일별 연습시간 막대그래프.
 * 활성도가 0인 날에도 회색 빈 막대로 표시해 시각적 흐름이 유지되게 합니다.
 * 데이터 전체가 0이면 안내 텍스트를 추가로 표시합니다(empty state).
 */
export default function PracticeStatsGraph({
  logs,
  accentColor,
  borderColor,
  textColor,
  textSecondary,
  width = 280,
  height = 80,
  days = 7,
  lang = "ko",
}: Props) {
  const t = useMemo(() => createT(lang), [lang]);
  const stats = useMemo(() => buildDailyStats(logs, days), [logs, days]);
  const maxSec = useMemo(() => {
    const m = Math.max(...stats.map((s) => s.totalSec), 1);
    return m;
  }, [stats]);
  const empty = useMemo(() => isStatsEmpty(stats), [stats]);

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
      {empty && (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            alignItems: "center",
            justifyContent: "center",
          }}
          pointerEvents="none"
        >
          <Text
            style={{
              color: textSecondary,
              fontSize: FontSize.small,
              fontFamily: "Inter_500Medium",
              opacity: 0.7,
            }}
          >
            {t("settings", "statsEmpty")}
          </Text>
        </View>
      )}
    </View>
  );
}
