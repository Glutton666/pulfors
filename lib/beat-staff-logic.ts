import type { BeatType } from "@/lib/metronome-engine";

export type BeatStaffLayout = number[][];
export type BeatStaffCellRects = Record<number, { x: number; y: number; w: number; h: number }>;

export function findBeatStaffCellTarget(pageX: number, pageY: number, rects: BeatStaffCellRects): number | null {
  for (const [key, rect] of Object.entries(rects)) {
    if (pageX >= rect.x && pageX <= rect.x + rect.w && pageY >= rect.y && pageY <= rect.y + rect.h) return Number(key);
  }
  return null;
}

/** Beat staff uses the meter numerator as its cell count, capped by the UI limit. */
export function getBeatStaffRows(count: number): BeatStaffLayout {
  const safe = Math.max(1, Math.min(16, Math.floor(count)));
  if (safe <= 4) return [Array.from({ length: safe }, (_, i) => i)];
  return Array.from({ length: Math.ceil(safe / 4) }, (_, row) =>
    Array.from({ length: Math.min(4, safe - row * 4) }, (_, column) => row * 4 + column),
  );
}

export function nextBeatCountForStaffAdd(count: number): number | null {
  return count >= 1 && count < 8 ? count + 1 : null;
}

export function addBeatStaffBeat(
  beatsPerMeasure: number,
  beatTypes: BeatType[],
  beatSubdivisions: Record<string, BeatType[]>,
) {
  if (beatsPerMeasure >= 8) return { beatsPerMeasure, beatTypes, beatSubdivisions };
  return {
    beatsPerMeasure: beatsPerMeasure + 1,
    beatTypes: [...beatTypes, "normal" as BeatType],
    beatSubdivisions,
  };
}

export function deleteBeatStaffBeat(
  index: number,
  beatTypes: BeatType[],
  beatSubdivisions: Record<string, BeatType[]>,
) {
  if (index < 0 || index >= beatTypes.length || beatTypes.length <= 1) {
    return { beatTypes, beatSubdivisions };
  }
  const nextSubs: Record<string, BeatType[]> = {};
  Object.entries(beatSubdivisions).forEach(([key, value]) => {
    const old = Number(key);
    if (old < index) nextSubs[key] = value;
    else if (old > index) nextSubs[String(old - 1)] = value;
  });
  return { beatTypes: beatTypes.filter((_, i) => i !== index), beatSubdivisions: nextSubs };
}