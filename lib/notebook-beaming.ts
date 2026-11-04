import type { NotebookSettings, StaffPage, StaffStamp } from "./staff-notebook";
import { isNotebookNote, isTupletMember } from "./notebook-editing";
import { ROW_HEIGHT, STAFF_GAP, STAFF_TOP, rowAt } from "./staff-notebook-layout";

export type NotebookBeamStem = {
  id: string; stemX: number; headY: number; stemY: number;
  direction: "up" | "down"; scale: number; levels: number;
};
export type NotebookBeamSegment = {
  level: number; x1: number; y1: number; x2: number; y2: number;
  thickness: number; direction: "up" | "down"; hook: boolean;
};
export type NotebookBeamGroup = {
  id: string; row: number; noteIds: string[]; tupletIds: string[];
  stems: NotebookBeamStem[]; segments: NotebookBeamSegment[];
  direction: "up" | "down"; anchorX: number; anchorY: number; slope: number;
};
export type NotebookBeaming = { groups: NotebookBeamGroup[]; stems: Map<string, NotebookBeamStem> };

const EPS = 1e-8;
const values: Record<string, number> = {
  whole: 4, half: 2, quarter: 1, eighth: 0.5, sixteenth: 0.25, thirty_second: 0.125,
};
const levels: Record<string, number> = { eighth: 1, sixteenth: 2, thirty_second: 3 };

export function notebookMeter(settings?: Partial<NotebookSettings>): { beats: number; unit: 2 | 4 | 8 | 16 } {
  if (settings?.notationMeter) return settings.notationMeter;
  return { beats: settings?.source?.beatsPerMeasure ?? settings?.beatsPerMeasure ?? 4, unit: 4 };
}

/** Durations are quarter-note units, never horizontal distances. */
export function notebookStampDuration(stamp: StaffStamp): number {
  return (values[stamp.glyph.replace(/^rest-/, "")] ?? 0) * (stamp.dotted ? 1.5 : 1);
}

function meterGroups(beats: number, unit: number): number[] {
  const quantum = 4 / unit;
  if (beats % 3 === 0 && (beats >= 6 || unit >= 8))
    return Array.from({ length: beats / 3 }, () => 3 * quantum);
  if (unit >= 8 && beats > 3) {
    const result: number[] = [];
    let remaining = beats;
    while (remaining > 3) { result.push(2 * quantum); remaining -= 2; }
    result.push(remaining * quantum);
    return result;
  }
  return Array.from({ length: beats }, () => quantum);
}

function beatAt(time: number, spans: number[]) {
  const measure = spans.reduce((sum, span) => sum + span, 0);
  const bar = Math.floor((time + EPS) / measure);
  const local = time - bar * measure;
  let start = 0;
  for (let index = 0; index < spans.length; index++) {
    const span = spans[index];
    if (local < start + span - EPS || index === spans.length - 1)
      return { key: `${bar}:${index}`, start: bar * measure + start, span };
    start += span;
  }
  return { key: `${bar}:0`, start: bar * measure, span: spans[0] };
}

type Event = {
  stamp: StaffStamp; time: number; duration: number; level: number; row: number;
  key: string; beatStart: number; beatSpan: number; tupletIds: string[];
};

function engrave(events: Event[], compound: boolean, quantum: number): NotebookBeamGroup | null {
  if (events.length < 2) return null;
  const row = events[0].row;
  const meanY = events.reduce((sum, item) => sum + item.stamp.y, 0) / events.length;
  const direction = meanY <= row * ROW_HEIGHT + STAFF_TOP + 2 * STAFF_GAP ? "down" : "up";
  const sign = direction === "up" ? 1 : -1;
  const scale = events.reduce((sum, item) => sum + item.stamp.size / 26, 0) / events.length;
  const thickness = 3.5 * scale, gap = 5.8 * scale;
  const stemXs = events.map(({ stamp }) => stamp.x + sign * 4.8 * stamp.size / 26);
  const dx = stemXs[stemXs.length - 1] - stemXs[0];
  if (dx <= 0) return null;
  const maxSlope = Math.min(0.18, 12 * scale / dx);
  const slope = Math.max(-maxSlope, Math.min(maxSlope,
    (events[events.length - 1].stamp.y - events[0].stamp.y) / dx));
  const starts = events.map((item, index) => {
    const minStem = Math.max(31 * item.stamp.size / 26, (item.level - 1) * gap + thickness + 14 * item.stamp.size / 26);
    return item.stamp.y - sign * minStem - slope * (stemXs[index] - stemXs[0]);
  });
  const anchorY = direction === "up" ? Math.min(...starts) : Math.max(...starts);
  const beamY = (x: number) => anchorY + slope * (x - stemXs[0]);
  const stems = events.map((item, index): NotebookBeamStem => ({
    id: item.stamp.id, stemX: stemXs[index], headY: item.stamp.y,
    stemY: beamY(stemXs[index]), direction, scale: item.stamp.size / 26, levels: item.level,
  }));
  const segments: NotebookBeamSegment[] = [];
  const add = (level: number, x1: number, x2: number, hook = false) => {
    const offset = sign * (level - 1) * gap;
    segments.push({ level, x1, y1: beamY(x1) + offset, x2, y2: beamY(x2) + offset, thickness, direction, hook });
  };
  add(1, stemXs[0], stemXs[stemXs.length - 1]);
  for (let level = 2; level <= 3; level++) {
    // Four sixteenths in simple time share both beams. Compound time
    // separates secondary beams at the written subdivision (e.g. eighths).
    const subSpan = compound
      ? Math.min(events[0].beatSpan, quantum) / 2 ** (level - 2)
      : events[0].beatSpan / 2 ** Math.max(0, level - 2);
    const subIndex = (event: Event) => Math.floor((event.time - event.beatStart + EPS) / subSpan);
    for (let i = 0; i < events.length; i++) {
      if (events[i].level < level) continue;
      let end = i;
      while (end + 1 < events.length && events[end + 1].level >= level &&
        subIndex(events[end + 1]) === subIndex(events[i])) end++;
      if (end > i) add(level, stemXs[i], stemXs[end]);
      else {
        const phase = events[i].time - events[i].beatStart - subIndex(events[i]) * subSpan;
        const right = i === 0 || (i < events.length - 1 && phase < EPS);
        const neighbor = right ? i + 1 : i - 1;
        const length = Math.min(10 * scale, Math.abs(stemXs[neighbor] - stemXs[i]) * 0.45);
        const other = stemXs[i] + (right ? length : -length);
        add(level, Math.min(stemXs[i], other), Math.max(stemXs[i], other), true);
      }
      i = end;
    }
  }
  return {
    id: `beam:${events[0].stamp.id}`, row, noteIds: stems.map((stem) => stem.id), stems, segments,
    tupletIds: [...new Set(events.flatMap((item) => item.tupletIds))],
    direction, anchorX: stemXs[0], anchorY, slope,
  };
}

/**
 * Derived engraving only: never mutates stamps, x/y, note values, or playback.
 * Each row starts a measure; within it, left-to-right order defines onsets.
 * Rests advance time but break beams. Marks/ink do not consume musical time.
 * Closed tuplets are explicit containers; their count is never guessed from
 * proximity. Their internal beams stay together, including unequal note values.
 */
export function notebookBeaming(page: StaffPage, settings?: Partial<NotebookSettings>, openTupletIds?: string[]): NotebookBeaming {
  const result: NotebookBeaming = { groups: [], stems: new Map() };
  const meter = notebookMeter(settings);
  const spans = meterGroups(meter.beats, meter.unit);
  const quantum = 4 / meter.unit;
  const stamps = (page.stamps ?? []).filter((stamp) => isTupletMember(stamp.glyph));
  const groups = (page.tuplets ?? []).map((group) => ({ ...group, ids: new Set(group.stampIds) }));
  const stampById = new Map(stamps.map((stamp) => [stamp.id, stamp]));
  const membershipsById = new Map<string, typeof groups>();
  for (const group of groups) for (const id of group.stampIds) {
    const memberships = membershipsById.get(id) ?? [];
    memberships.push(group); membershipsById.set(id, memberships);
  }
  // This clock belongs solely to engraving. Standard tuplet counts occupy
  // their usual written span (3:2, 5:4, 6:4, 2:3, 4:3...), so a following
  // ordinary note starts at the right subdivision. Stored note values and
  // the independent notebook/metronome playback clock remain untouched.
  const durations = new Map(stamps.map((stamp) => {
    const memberships = [...(membershipsById.get(stamp.id) ?? [])].sort((a, b) => b.ids.size - a.ids.size);
    let previous: typeof groups[number] | undefined;
    let ratio = 1;
    for (const group of memberships) {
      if (previous && (group.ids.size === previous.ids.size || !group.stampIds.every((id) => previous!.ids.has(id)))) continue;
      const count = group.ids.size;
      const power = 2 ** Math.floor(Math.log2(count));
      const normal = count === 2 ? 3 : count === power ? count * 0.75 : power;
      ratio *= normal / count;
      previous = group;
    }
    return [stamp.id, notebookStampDuration(stamp) * ratio] as const;
  }));
  const groupDurations = new Map(groups.map((group) => [group.id, group.stampIds.reduce((sum, id) =>
    sum + (stampById.has(id) ? durations.get(id)! : 0), 0)]));
  const open = new Set(openTupletIds);
  const staffCount = page.staffCount ?? 7;
  const rows = new Map<number, StaffStamp[]>();
  for (const stamp of stamps) {
    const row = rowAt(stamp.y, staffCount);
    const items = rows.get(row) ?? [];
    items.push(stamp); rows.set(row, items);
  }
  for (const [row, items] of rows) {
    items.sort((a, b) => a.x - b.x);
    let time = 0;
    let run: Event[] = [];
    const tupletStarts = new Map<string, number>();
    const flush = () => {
      const group = engrave(run, !!run.length && run[0].beatSpan > 2 * quantum + EPS, quantum);
      if (group) {
        result.groups.push(group);
        for (const stem of group.stems) result.stems.set(stem.id, stem);
      }
      run = [];
    };
    for (const stamp of items) {
      const memberships = membershipsById.get(stamp.id) ?? [];
      // Membership is visual containment, not a change to playback duration.
      const outer = memberships.reduce<typeof memberships[number] | undefined>(
        (largest, group) => !largest || group.ids.size > largest.ids.size ? group : largest, undefined);
      if (outer && !tupletStarts.has(outer.id)) tupletStarts.set(outer.id, time);
      const beat = beatAt(time, spans);
      const key = outer ? `tuplet:${outer.id}` : open.has(stamp.id) ? "open-tuplet" : beat.key;
      const level = isNotebookNote(stamp.glyph) ? levels[stamp.glyph] ?? 0 : 0;
      const duration = durations.get(stamp.id)!;
      const previous = run[run.length - 1];
      // Keep a minimum legible head spacing; overlapping stamps retain flags.
      if (!level || previous && (previous.key !== key ||
        stamp.x - previous.stamp.x < 14 * Math.max(stamp.size, previous.stamp.size) / 26)) flush();
      if (level) {
        const first = run[0];
        run.push({
          stamp, row, time, duration, level, key,
          beatStart: outer ? tupletStarts.get(outer.id)! : open.has(stamp.id) ? first?.beatStart ?? time : beat.start,
          beatSpan: outer ? Math.max(quantum, groupDurations.get(outer.id) ?? quantum) : beat.span,
          tupletIds: memberships.map((group) => group.id),
        });
      }
      time += duration;
    }
    flush();
  }
  return result;
}
