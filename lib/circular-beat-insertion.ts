import type { BeatType } from "./metronome-engine";
import type { DialEngineConfig } from "./dial-engine-boundary";
import { circularPatternBeatType } from "./circular-subdivision";
import { MAX_SUBDIVISION_CELLS } from "./subdivision-limits";

export const MAX_CIRCULAR_BEATS = 16;

/** Re-key from the original snapshot, so adjacent samples cannot overwrite one another. */
export function shiftSampleBeatKeys<T>(map: Record<string, T>, insertAt: number): Record<string, T> {
  return Object.fromEntries(Object.entries(map).map(([key, value]) => {
    const match = /^(\d+)(-\d+(?:~[12])?)$/.exec(key);
    return [
      match && Number(match[1]) >= insertAt ? `${Number(match[1]) + 1}${match[2]}` : key,
      value,
    ];
  }));
}

/** The held beat is an anchor. Only the new beat receives the authored pattern. */
export function insertCircularBeat(
  config: DialEngineConfig, anchor: number, pattern: BeatType[],
): DialEngineConfig | null {
  if (!Number.isInteger(anchor) || anchor < 0 || anchor >= config.beatsPerMeasure
    || config.beatsPerMeasure >= MAX_CIRCULAR_BEATS
    || config.beatTypes.length !== config.beatsPerMeasure
    || pattern.length < 1 || pattern.length > MAX_SUBDIVISION_CELLS
    || !pattern.every((type) => ["strong", "accent", "normal", "mute"].includes(type))) return null;
  const insertAt = anchor + 1;
  const beatTypes = [...config.beatTypes];
  beatTypes.splice(insertAt, 0, circularPatternBeatType(pattern));
  const beatSubdivisions = Object.fromEntries(Object.entries(config.beatSubdivisions).map(([key, notes]) => [
    /^\d+$/.test(key) && Number(key) >= insertAt ? String(Number(key) + 1) : key,
    [...notes],
  ]));
  if (pattern.length > 1) beatSubdivisions[String(insertAt)] = [...pattern];
  return { beatsPerMeasure: config.beatsPerMeasure + 1, beatTypes, beatSubdivisions };
}