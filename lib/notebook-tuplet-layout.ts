import type { StaffPage, StaffStamp } from "./staff-notebook";
import { ROW_HEIGHT, STAFF_TOP, STAFF_GAP, rowAt } from "./staff-notebook-layout";
import { naturalPaperWidth } from "./notebook-measures";
import { isNotebookNote } from "./notebook-editing";
import { notebookRestEngraving } from "./notebook-rest-engraving";
import type { NotebookBeaming, NotebookBeamGroup, NotebookBeamStem } from "./notebook-beaming";

export type NotebookTupletSpan = {
  id: string; row: number; left: number; right: number; y: number;
  count: number; fontSize: number; below: boolean;
  continuedLeft: boolean; continuedRight: boolean; open: boolean;
  numberOnly?: boolean;
  numberY?: number;
  stemJoins?: NotebookBeamStem[];
};

export const tupletNumberGap = (count: number, fontSize: number) => String(count).length * fontSize * 0.65 + 8;

function inkTop(stamp: StaffStamp, beam?: NotebookBeamStem): number {
  const scale = stamp.size / 26;
  if (!isNotebookNote(stamp.glyph)) return notebookRestEngraving(stamp)?.bounds.y ?? stamp.y - 6 * scale;
  if (beam?.direction === "up") return beam.stemY - (stamp.role === "strong" ? 25 : 2) * scale;
  if (beam?.direction === "down") return stamp.y - (stamp.role === "strong" ? 51 : 6) * scale;
  if (stamp.role === "strong") return stamp.y - 51 * scale;
  if (stamp.glyph === "whole") return stamp.y - (stamp.role === "ghost" ? 10 : 5) * scale;
  if (stamp.glyph === "quarter" || stamp.glyph === "half") return stamp.y - 42 * scale;
  return stamp.y - 32 * scale;
}

/** Complete groups on their own beam need only a numeral; rests, long notes
 * and row-break fragments retain brackets. Counts remain document membership,
 * never inferred from the number of nearby notes. */
export function notebookTupletSpans(page: StaffPage, openIds?: string[], beaming?: NotebookBeaming): NotebookTupletSpan[] {
  const staffCount = page.staffCount ?? 7;
  const paperWidth = naturalPaperWidth(page);
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
      const rawRight = continuedRight ? paperWidth - 38 : Math.max(...items.map((stamp) => stamp.x + stamp.size * (stamp.dotted ? 0.7 : 0.4))) + 5;
      const gap = tupletNumberGap(members.length, fontSize);
      const half = Math.min((paperWidth - 12) / 2, Math.max((rawRight - rawLeft) / 2, (gap + 16) / 2));
      const center = Math.max(6 + half, Math.min(paperWidth - 6 - half, (rawRight + rawLeft) / 2));
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
      // Join unflagged stems to the thin tuplet rule, not to a rhythmic
      // beam (which would make a quarter/half read as a shorter value).
      // Use the innermost bracket only so two levels never share a stem.
      const innerDepth = nestedDepth(group);
      const joinable = !numberOnly && !innerDepth && rows.length === 1 && members.length > 1
        ? items.filter((stamp) => stamp.glyph === "quarter" || stamp.glyph === "half") : [];
      const joinX = (stamp: StaffStamp, below: boolean) => stamp.x + (below ? -4.8 : 4.8) * stamp.size / 26;
      const blocksNumeral = (below: boolean) => joinable.some((stamp) =>
        Math.abs(joinX(stamp, below) - center) <= gap / 2 + 2 * stamp.size / 26);
      const numberOffset = fontSize * 0.7 + 9;
      const aboveSpace = fontSize * 0.7 + 4 + (blocksNumeral(false) ? numberOffset : 0);
      const below = numberOnly ? beam!.direction === "down" : aboveY < row * ROW_HEIGHT + aboveSpace;
      const belowY = Math.max(row * ROW_HEIGHT + STAFF_TOP + STAFF_GAP * 4 + 15,
        ...items.map((stamp) => {
          const rest = notebookRestEngraving(stamp)?.bounds;
          return (rest ? rest.y + rest.height : stamp.y + stamp.size * 0.4) + 10;
        }));
      const outsideOffset = blocksNumeral(below) ? numberOffset : 0;
      let y = below ? Math.min(staffCount * ROW_HEIGHT - fontSize * 0.5 - 3 - outsideOffset,
        Math.max(belowY, relatedBeams.length ? beamBottom + labelClearance : 0)) : aboveY;
      // Properly contained nested groups occupy separate notation levels.
      if (innerDepth) y += (below ? 1 : -1) * (fontSize + 8) * innerDepth;
      const stemJoins = joinable.flatMap((stamp): NotebookBeamStem[] => {
        const stemX = joinX(stamp, below);
        if (stemX < center - half || stemX > center + half || (below ? y <= stamp.y : y >= stamp.y)) return [];
        return [{ id: stamp.id, stemX, headY: stamp.y, stemY: y, direction: below ? "down" : "up", scale: stamp.size / 26, levels: 0 }];
      });
      // If a stem lands at the numeral, keep the rule intact and move the
      // numeral outside it. A gap here would leave that stem disconnected.
      const numberY = outsideOffset ? y + (below ? 1 : -1) * outsideOffset : undefined;
      return {
        id: group.id, row, left: center - half, right: center + half, y,
        count: members.length, fontSize, below, continuedLeft, continuedRight, open: group.id === "open", numberOnly,
        numberY, stemJoins,
      };
    });
  });
}
