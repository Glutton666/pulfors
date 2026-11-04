import type { StaffPage, StaffStamp } from "./staff-notebook";
import { PAPER_WIDTH, ROW_HEIGHT, STAFF_TOP, STAFF_GAP, rowAt } from "./staff-notebook-layout";
import { isNotebookNote } from "./notebook-editing";

export type NotebookTupletSpan = {
  id: string; row: number; left: number; right: number; y: number;
  count: number; fontSize: number; below: boolean;
  continuedLeft: boolean; continuedRight: boolean; open: boolean;
};

function inkTop(stamp: StaffStamp): number {
  const scale = stamp.size / 26;
  if (!isNotebookNote(stamp.glyph)) return stamp.y - 6 * scale;
  if (stamp.role === "strong") return stamp.y - 47 * scale;
  if (stamp.glyph === "whole") return stamp.y - (stamp.role === "ghost" ? 10 : 5) * scale;
  return stamp.y - 32 * scale;
}

/** Unbeamed free-placement notes need a real bracket, not a text-box mask.
 * The numeral stays the size of the complete group across line breaks. */
export function notebookTupletSpans(page: StaffPage, openIds?: string[]): NotebookTupletSpan[] {
  const staffCount = page.staffCount ?? 7;
  const stamps = page.stamps ?? [];
  const groups = [...(page.tuplets ?? []), ...(openIds?.length ? [{ id: "open", stampIds: openIds }] : [])];
  return groups.flatMap((group) => {
    const members = stamps.filter((stamp) => group.stampIds.includes(stamp.id));
    if (!members.length) return [];
    const rows = [...new Set(members.map((stamp) => rowAt(stamp.y, staffCount)))].sort((a, b) => a - b);
    return rows.map((row) => {
      const items = members.filter((stamp) => rowAt(stamp.y, staffCount) === row);
      const attachments = stamps.filter((stamp) => stamp.attachTo && items.some((item) => item.id === stamp.attachTo));
      const fontSize = Math.max(12, Math.min(22, items.reduce((sum, stamp) => sum + stamp.size, 0) / items.length * 0.54));
      const continuedLeft = row !== rows[0], continuedRight = row !== rows[rows.length - 1];
      const rawLeft = continuedLeft ? 38 : Math.min(...items.map((stamp) => stamp.x - stamp.size * 0.3)) - 5;
      const rawRight = continuedRight ? PAPER_WIDTH - 38 : Math.max(...items.map((stamp) => stamp.x + stamp.size * (stamp.dotted ? 0.7 : 0.4))) + 5;
      const gap = String(members.length).length * fontSize * 0.65 + 8;
      const half = Math.min((PAPER_WIDTH - 12) / 2, Math.max((rawRight - rawLeft) / 2, (gap + 16) / 2));
      const center = Math.max(6 + half, Math.min(PAPER_WIDTH - 6 - half, (rawRight + rawLeft) / 2));
      const top = Math.min(...items.map(inkTop), ...attachments.map((stamp) => stamp.y - stamp.size * 0.8));
      const aboveY = Math.min(top - 9, row * ROW_HEIGHT + STAFF_TOP - 14);
      const below = aboveY < row * ROW_HEIGHT + fontSize * 0.7 + 4;
      const belowY = Math.max(row * ROW_HEIGHT + STAFF_TOP + STAFF_GAP * 4 + 15,
        ...items.map((stamp) => stamp.y + stamp.size * 0.4 + 10));
      const y = below ? Math.min(staffCount * ROW_HEIGHT - fontSize * 0.5 - 3, belowY) : aboveY;
      return {
        id: group.id, row, left: center - half, right: center + half, y,
        count: members.length, fontSize, below, continuedLeft, continuedRight, open: group.id === "open",
      };
    });
  });
}
