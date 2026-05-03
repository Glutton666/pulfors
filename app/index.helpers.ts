import { Platform } from "react-native";
import type { BeatType } from "@/lib/metronome-engine";
import type { BarRepeat, LoopBlock } from "@/components/BeatIndicator";
import type { NoteSampleMap, NoteSampleNameMap, NoteSampleSourceMap } from "@/lib/note-samples";

export function defaultBeatTypes(beats: number): BeatType[] {
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

export interface DialConfig {
  beatsPerMeasure: number;
  beatTypes: BeatType[];
  beatSubdivisions: Record<string, BeatType[]>;
  noteSamples: NoteSampleMap;
  noteSampleNames: NoteSampleNameMap;
  noteSampleSources: NoteSampleSourceMap;
}

export interface BarConfig {
  beatsPerMeasure: number;
  beatTypes: BeatType[];
  beatSubdivisions: Record<string, BeatType[]>;
  barRepeats: Record<number, BarRepeat>;
  loopBlocks: LoopBlock[];
  barClockMode: "stopwatch" | "timer";
  barTimerDuration: number;
  noteSamples: NoteSampleMap;
  noteSampleNames: NoteSampleNameMap;
  noteSampleSources: NoteSampleSourceMap;
  barLoopMode: "loop" | "once";
  blockPlayMode: "sequential" | "loop" | "random";
  hasBeenConfigured: boolean;
}

export function createInitialDialConfig(beats = 4): DialConfig {
  return {
    beatsPerMeasure: beats,
    beatTypes: defaultBeatTypes(beats),
    beatSubdivisions: {},
    noteSamples: {},
    noteSampleNames: {},
    noteSampleSources: {},
  };
}

/**
 * Fisher-Yates shuffled index array (in-place, then returned).
 * RNG is injectable for deterministic tests.
 */
export function createShuffledIndices(
  length: number,
  rng: () => number = Math.random,
): number[] {
  const indices = Array.from({ length }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices;
}

/**
 * Adjust shuffled-mode index array when a new entry is inserted at queueIdx.
 * - All existing indices >= queueIdx shift +1.
 * - The new queueIdx is inserted at pos+1 so it plays right after the current.
 * Returns a new array (does not mutate input).
 */
export function adjustShuffledIndicesOnInsert(
  indices: number[],
  pos: number,
  insertedQueueIdx: number,
): number[] {
  const next = indices.map(i => (i >= insertedQueueIdx ? i + 1 : i));
  next.splice(pos + 1, 0, insertedQueueIdx);
  return next;
}

export type BlockPlayMode = "sequential" | "loop" | "random";
export type BarLoopMode = "loop" | "once";

export interface CurrentBarConfigInput {
  barMode: boolean;
  bpm: number;
  beatsPerMeasure: number;
  beatTypes: BeatType[];
  beatSubdivisions: Record<string, BeatType[]>;
  barRepeats: Record<number, BarRepeat>;
  loopBlocks: LoopBlock[];
  barLoopMode: BarLoopMode;
  blockPlayMode: BlockPlayMode;
  subdivisionPattern: BeatType[];
  noteSamples: NoteSampleMap;
  noteSampleNames: NoteSampleNameMap;
  noteSampleSources: NoteSampleSourceMap;
  dialConfig: DialConfig;
  barClockMode: "stopwatch" | "timer";
  barTimerDuration: number;
}

export interface CurrentBarConfigOutput {
  mode: "bar" | "beat";
  bpm: number;
  beatsPerMeasure: number;
  beatTypes: BeatType[];
  beatSubdivisions: Record<string, BeatType[]>;
  barRepeats: Record<number, BarRepeat>;
  loopBlocks: LoopBlock[];
  barLoopMode: BarLoopMode;
  blockPlayMode: BlockPlayMode;
  subdivisionPattern: BeatType[];
  barClockMode?: "stopwatch" | "timer";
  barTimerDuration?: number;
  noteSamples: NoteSampleMap;
  noteSampleNames: NoteSampleNameMap;
  noteSampleSources: NoteSampleSourceMap;
}

/**
 * Compute currentBarConfig: in barMode return live bar state; otherwise return
 * dial-derived config. All container values are shallow-cloned to keep callers
 * insulated from later mutations.
 */
export function selectCurrentBarConfig(input: CurrentBarConfigInput): CurrentBarConfigOutput {
  if (input.barMode) {
    return {
      mode: "bar",
      bpm: input.bpm,
      beatsPerMeasure: input.beatsPerMeasure,
      beatTypes: [...input.beatTypes],
      beatSubdivisions: { ...input.beatSubdivisions },
      barRepeats: { ...input.barRepeats },
      loopBlocks: [...input.loopBlocks],
      barLoopMode: input.barLoopMode,
      blockPlayMode: input.blockPlayMode,
      subdivisionPattern: [...input.subdivisionPattern],
      barClockMode: input.barClockMode,
      barTimerDuration: input.barTimerDuration,
      noteSamples: { ...input.noteSamples },
      noteSampleNames: { ...input.noteSampleNames },
      noteSampleSources: { ...input.noteSampleSources },
    };
  }
  const dc = input.dialConfig;
  return {
    mode: "beat",
    bpm: input.bpm,
    beatsPerMeasure: dc.beatsPerMeasure,
    beatTypes: [...dc.beatTypes],
    beatSubdivisions: { ...dc.beatSubdivisions },
    barRepeats: {},
    loopBlocks: [],
    barLoopMode: "once",
    blockPlayMode: "loop",
    subdivisionPattern: [...input.subdivisionPattern],
    noteSamples: { ...dc.noteSamples },
    noteSampleNames: { ...dc.noteSampleNames },
    noteSampleSources: { ...dc.noteSampleSources },
  };
}

/**
 * Count subdivisions per beat (selector for beatSubdivisions map).
 */
export function beatSubdivisionCounts(
  beatSubdivisions: Record<string, unknown[]>,
): Record<number, number> {
  const counts: Record<number, number> = {};
  for (const [k, v] of Object.entries(beatSubdivisions)) {
    counts[Number(k)] = v.length;
  }
  return counts;
}

export function createInitialBarConfig(beats = 4): BarConfig {
  return {
    beatsPerMeasure: beats,
    beatTypes: defaultBeatTypes(beats),
    beatSubdivisions: {},
    barRepeats: {},
    loopBlocks: [],
    barClockMode: "stopwatch",
    barTimerDuration: 180,
    noteSamples: {},
    noteSampleNames: {},
    noteSampleSources: {},
    barLoopMode: "once",
    blockPlayMode: "loop",
    hasBeenConfigured: false,
  };
}
