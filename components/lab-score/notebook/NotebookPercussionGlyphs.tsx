import React from "react";
import { G, Path, Rect, Text } from "react-native-svg";
import { ROW_HEIGHT, STAFF_GAP, STAFF_TOP, rowAt } from "@/lib/staff-notebook-layout";
import type { StaffStamp } from "@/lib/staff-notebook";
import { flamPosition, type NotebookFlam, type NotebookSticking } from "@/lib/notebook-percussion";
import { NotebookNoteGlyph } from "./NotebookNoteGlyph";

export function NotebookFlamGlyph({ stamp, flam, width, pending, active }: {
  stamp: StaffStamp; flam: NotebookFlam; width: number; pending: boolean; active: boolean;
}) {
  const point = flamPosition(stamp, flam, width);
  const scale = stamp.size / 26;
  const size = Math.max(4, stamp.size * .57);
  const start = point.x + Math.sign(stamp.x - point.x) * 3 * scale;
  const end = stamp.x - Math.sign(stamp.x - point.x) * 3 * scale;
  const y = stamp.y + 5 * scale;
  const color = pending ? "#986929" : "#111111";
  return <G testID={`notebook-flam-${stamp.id}`} opacity={pending ? .72 : 1}>
    {active && <Rect x={point.x - 8 * scale} y={point.y - 27 * scale} width={18 * scale} height={35 * scale}
      fill="#e8c477" fillOpacity={.35} stroke="#a36f36" strokeWidth={1} />}
    <NotebookNoteGlyph duration="eighth" x={point.x} y={point.y} size={size} color={color} />
    <Path testID="notebook-flam-slash" d={`M${point.x - 2 * scale} ${point.y - 12 * scale} l${11 * scale} ${-9 * scale}`}
      fill="none" stroke={color} strokeWidth={1.2 * scale} strokeLinecap="round" />
    <Path d={`M${start} ${y} Q${(start + end) / 2} ${y + 12 * scale} ${end} ${y}`}
      fill="none" stroke={color} strokeWidth={1.1 * scale} />
  </G>;
}

export function NotebookStickingGlyph({ stamp, value, x, count, bracketBottom = 0, part }: {
  stamp: StaffStamp; value?: NotebookSticking; x: number; count: number; bracketBottom?: number; part: "note" | "flam";
}) {
  if (!value?.lines.some(Boolean)) return null;
  const row = rowAt(stamp.y, count);
  const top = Math.max(row * ROW_HEIGHT + STAFF_TOP + STAFF_GAP * 4, stamp.y + stamp.size * .24, bracketBottom) + 4;
  return <G>
    {value.lines.map((letter, i) => letter && <Text key={i} testID={`notebook-sticking-${stamp.id}-${part}-${i + 1}`}
      x={x} y={top + value.size + i * (value.size + 2)} fontSize={value.size}
      textAnchor="middle" fill="#483421" fontWeight="600">{letter}</Text>)}
  </G>;
}
