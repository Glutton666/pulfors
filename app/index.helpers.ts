import { Platform } from "react-native";
import type { BeatType } from "@/lib/metronome-engine";
import type { BarRepeat, LoopBlock } from "@/components/BeatIndicator";
import type { NoteSampleMap, NoteSampleNameMap, NoteSampleSourceMap, NoteSampleChannelMap } from "@/lib/note-samples";
import type { ActivityLog, PracticeSessionData } from "@/lib/activity-log";
import type { PracticeEntry } from "@/lib/storage";

export interface LandscapeStatsTotals {
  todayTotal: number;
  todayBeat: number;
  todayBar: number;
  weekTotal: number;
}

/**
 * 가로화면 통계 위젯 집계.
 * 오늘/이번 주(월요일 기준) 합계와 모드별(dial/bar) 분리.
 * @param logs activity log 배열
 * @param now 기준 시각 (테스트 주입용, 기본값 new Date())
 */
export function computeLandscapeStats(
  logs: ActivityLog[],
  now: Date = new Date(),
): LandscapeStatsTotals {
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(now);
  const day = weekStart.getDay();
  const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1);
  weekStart.setDate(diff); weekStart.setHours(0, 0, 0, 0);
  const todayMs = todayStart.getTime();
  const weekMs = weekStart.getTime();
  let todayTotal = 0, todayBeat = 0, todayBar = 0, weekTotal = 0;
  for (const l of logs) {
    if (l.type !== "practice_session") continue;
    const d = l.data as PracticeSessionData;
    const dur = d.duration || 0;
    if (l.timestamp >= weekMs) weekTotal += dur;
    if (l.timestamp >= todayMs) {
      todayTotal += dur;
      if (d.mode === "dial") todayBeat += dur;
      else if (d.mode === "bar") todayBar += dur;
    }
  }
  return { todayTotal, todayBeat, todayBar, weekTotal };
}

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
  noteSampleChannels: NoteSampleChannelMap;
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
  noteSampleChannels: NoteSampleChannelMap;
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
    noteSampleChannels: {},
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
  noteSampleChannels: NoteSampleChannelMap;
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
  noteSampleChannels: NoteSampleChannelMap;
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
      noteSampleChannels: { ...input.noteSampleChannels },
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
    noteSampleChannels: { ...dc.noteSampleChannels },
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

export interface AppliedEntryState {
  bpm: number;
  beatsPerMeasure: number;
  beatTypes: BeatType[];
  beatSubdivisions: Record<string, BeatType[]>;
  barRepeats: Record<number, BarRepeat>;
  loopBlocks: LoopBlock[];
  barLoopMode: BarLoopMode;
  blockPlayMode: BlockPlayMode;
  subdivisionPattern: BeatType[] | null;
  noteSamples: NoteSampleMap;
  noteSampleNames: NoteSampleNameMap;
  noteSampleSources: NoteSampleSourceMap;
  noteSampleChannels: NoteSampleChannelMap;
  bpmOverrides: Record<number, number>;
}

/**
 * Pure reducer mirroring the React-state side effects of applyEntryToEngine.
 * Returns the values that the live component would set on bpm/beatsPerMeasure/
 * note-sample maps/etc when loading the entry. Engine-level calls are
 * deliberately not modeled here; tests can verify state-roundtrip without a
 * real engine instance.
 */
export function applyEntryToState(entry: PracticeEntry): AppliedEntryState {
  const e = entry as PracticeEntry & {
    loopBlocks?: LoopBlock[];
    blockPlayMode?: BlockPlayMode;
  };
  const blocks = e.loopBlocks ?? [];
  const bpmOverrides: Record<number, number> = {};
  for (const [k, v] of Object.entries(entry.barRepeats || {})) {
    const maybe = (v as { bpm?: number }).bpm;
    if (typeof maybe === "number") bpmOverrides[Number(k)] = maybe;
  }
  return {
    bpm: entry.bpm,
    beatsPerMeasure: entry.beatsPerMeasure,
    beatTypes: [...entry.beatTypes],
    beatSubdivisions: { ...entry.beatSubdivisions },
    barRepeats: { ...(entry.barRepeats || {}) } as Record<number, BarRepeat>,
    loopBlocks: [...blocks],
    barLoopMode: entry.barLoopMode || "once",
    blockPlayMode: e.blockPlayMode || "loop",
    subdivisionPattern: entry.subdivisionPattern ? [...entry.subdivisionPattern] : null,
    noteSamples: { ...(entry.noteSamples || {}) } as NoteSampleMap,
    noteSampleNames: { ...(entry.noteSampleNames || {}) } as NoteSampleNameMap,
    noteSampleSources: { ...(entry.noteSampleSources || {}) } as NoteSampleSourceMap,
    noteSampleChannels: { ...(entry.noteSampleChannels || {}) } as NoteSampleChannelMap,
    bpmOverrides,
  };
}

/**
 * Pure projection of a PracticeEntry into the BarConfig shape held in barConfigRef.
 * Centralizes default values for blockPlayMode/barClockMode/barTimerDuration so
 * apply (write) and selectCurrentBarConfig (read) stay in lockstep and can be
 * verified via roundtrip tests.
 *
 * Notes:
 * - barLoopMode is forced to "once" to match legacy applyEntryToEngine behavior;
 *   the entry's own barLoopMode is dropped intentionally (kept for parity).
 * - Maps are shallow-cloned so callers can mutate without affecting the entry.
 */
export function entryToBarConfig(entry: PracticeEntry): BarConfig {
  const e = entry as PracticeEntry & {
    loopBlocks?: LoopBlock[];
    blockPlayMode?: BlockPlayMode;
  };
  const blocks = e.loopBlocks ?? [];
  return {
    beatsPerMeasure: entry.beatsPerMeasure,
    beatTypes: [...entry.beatTypes],
    beatSubdivisions: { ...entry.beatSubdivisions },
    barRepeats: { ...(entry.barRepeats || {}) } as Record<number, BarRepeat>,
    loopBlocks: [...blocks],
    barClockMode: entry.barClockMode || "stopwatch",
    barTimerDuration: entry.barTimerDuration ?? 180,
    noteSamples: { ...(entry.noteSamples || {}) } as NoteSampleMap,
    noteSampleNames: { ...(entry.noteSampleNames || {}) } as NoteSampleNameMap,
    noteSampleSources: { ...(entry.noteSampleSources || {}) } as NoteSampleSourceMap,
    noteSampleChannels: { ...(entry.noteSampleChannels || {}) } as NoteSampleChannelMap,
    barLoopMode: "once",
    blockPlayMode: e.blockPlayMode || "loop",
    hasBeenConfigured: true,
  };
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
    noteSampleChannels: {},
    barLoopMode: "once",
    blockPlayMode: "loop",
    hasBeenConfigured: false,
  };
}
