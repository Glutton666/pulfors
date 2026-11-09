import type { StaffPage, StaffStamp } from "./staff-notebook";
import { PAPER_WIDTH, ROW_HEIGHT, STAFF_TOP, STAFF_GAP, rowAt } from "./staff-notebook-layout";
import { isNotebookNote } from "./notebook-editing";
import type { NotebookBeaming, NotebookBeamGroup, NotebookBeamStem } from "./notebook-beaming";

export type NotebookTupletSpan = {
  id: string; row: number; left: number; right: number; y: number;
  count: number; fontSize: number; below: boolean;
  continuedLeft: boolean; continuedRight: boolean; open: boolean;
  numberOnly?: boolean;
};

function inkTop(stamp: StaffStamp, beam?: NotebookBeamStem): number {
  const scale = stamp.size / 26;
  if (!isNotebookNote(stamp.glyph)) return stamp.y - 6 * scale;
  if (beam?.direction === "up") return beam.stemY - (stamp.role === "strong" ? 25 : 2) * scale;
  if (beam?.direction === "down") return stamp.y - (stamp.role === "strong" ? 51 : 6) * scale;
  if (stamp.role === "strong") return stamp.y - 51 * scale;
  if (stamp.glyph === "whole") return stamp.y - (stamp.role === "ghost" ? 10 : 5) * scale;
  return stamp.y - 32 * scale;
}

/** Complete groups on their own beam need only a numeral; rests, long notes
 * and row-break fragments retain brackets. Counts remain document membership,
 * never inferred from the number of nearby notes. */
export function notebookTupletSpans(page: StaffPage, openIds?: string[], beaming?: NotebookBeaming): NotebookTupletSpan[] {
  const staffCount = page.staffCount ?? 7;
  const stamps = page.stamps ?? [];
  const groups = [...(page.tuplets ?? []), ...(openIds?.length ? [{ id: "open", stampIds: openIds }] : [])];
  const beamByMember = new Map<string, NotebookBeamGroup>();
  for (const beam of beaming?.groups ?? []) for (const id of beam.memberIds) beamByMember.set(id, beam);
  const depthCache = new Map<typeof groups[number], number>();
  const nestedDepth = (group: typeof groups[number]): number => {
    if (depthCache.has(group)) return depthCache.get(group)!;
    const children = groups.filter((other) => other.stampIds.length < group.stampIds.length &&
      other.stampIds.every((id) => group.stampIds.includes(id)));
    const depth = children.length ? 1 + Math.max(...children.map(nestedDepth)) : 0;
    depthCache.set(group, depth);
    return depth;
  };
  return groups.flatMap((group) => {
    const members = stamps.filter((stamp) => group.stampIds.includes(stamp.id));
    if (!members.length) return [];
    const rows = [...new Set(members.map((stamp) => rowAt(stamp.y, staffCount)))].sort((a, b) => a - b);
    return rows.map((row) => {
      const items = members.filter((stamp) => rowAt(stamp.y, staffCount) === row);
      const beam = beaming?.groups.find((candidate) => candidate.noteIds.length === members.length &&
        members.every((stamp) => candidate.noteIds.includes(stamp.id)));
      const numberOnly = !!beam && group.id !== "open" && rows.length === 1;
      const attachments = stamps.filter((stamp) => stamp.attachTo && items.some((item) => item.id === stamp.attachTo));
      const fontSize = Math.max(12, Math.min(22, items.reduce((sum, stamp) => sum + stamp.size, 0) / items.length * 0.54));
      const continuedLeft = row !== rows[0], continuedRight = row !== rows[rows.length - 1];
      const rawLeft = continuedLeft ? 38 : Math.min(...items.map((stamp) => stamp.x - stamp.size * 0.3)) - 5;
      const rawRight = continuedRight ? PAPER_WIDTH - 38 : Math.max(...items.map((stamp) => stamp.x + stamp.size * (stamp.dotted ? 0.7 : 0.4))) + 5;
      const gap = String(members.length).length * fontSize * 0.65 + 8;
      const half = Math.min((PAPER_WIDTH - 12) / 2, Math.max((rawRight - rawLeft) / 2, (gap + 16) / 2));
      const center = Math.max(6 + half, Math.min(PAPER_WIDTH - 6 - half, (rawRight + rawLeft) / 2));
      const top = Math.min(...items.map((stamp) => inkTop(stamp, beaming?.stems.get(stamp.id))),
        ...attachments.map((stamp) => stamp.y - stamp.size * 0.8));
      // Rest-spanning and partial beams still need clearance even though they
      // retain a bracket instead of qualifying for number-only notation.
      const relatedBeams = [...new Set(items.flatMap((stamp) => {
        const associated = beamByMember.get(stamp.id);
        return associated ? [associated] : [];
      }))];
      const beamTop = Math.min(Infinity, ...relatedBeams.flatMap((candidate) =>
        candidate.segments.map((segment) => Math.min(segment.y1, segment.y2) - segment.thickness / 2)));
      const beamBottom = Math.max(0, ...relatedBeams.flatMap((candidate) =>
        candidate.segments.map((segment) => Math.max(segment.y1, segment.y2) + segment.thickness / 2)));
      const labelClearance = fontSize * 0.6 + 4;
      const aboveY = Math.min(top - 9, beamTop - labelClearance, row * ROW_HEIGHT + STAFF_TOP - 14);
      const below = numberOnly ? beam!.direction === "down" : aboveY < row * ROW_HEIGHT + fontSize * 0.7 + 4;
      const belowY = Math.max(row * ROW_HEIGHT + STAFF_TOP + STAFF_GAP * 4 + 15,
        ...items.map((stamp) => stamp.y + stamp.size * 0.4 + 10));
      let y = below ? Math.min(staffCount * ROW_HEIGHT - fontSize * 0.5 - 3,
        Math.max(belowY, relatedBeams.length ? beamBottom + labelClearance : 0)) : aboveY;
      // Properly contained nested groups occupy separate notation levels.
      const innerDepth = nestedDepth(group);
      if (innerDepth) y += (below ? 1 : -1) * (fontSize + 8) * innerDepth;
      return {
        id: group.id, row, left: center - half, right: center + half, y,
        count: members.length, fontSize, below, continuedLeft, continuedRight, open: group.id === "open", numberOnly,
      };
    });
  });
}
