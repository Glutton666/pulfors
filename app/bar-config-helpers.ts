import type { BeatType } from "@/lib/metronome-engine";
import type { BarRepeat, LoopBlock } from "@/components/BeatIndicator";
import type { NoteSampleMap, NoteSampleNameMap, NoteSampleSourceMap, NoteSampleChannelMap } from "@/lib/note-samples";
import { defaultBeatTypes } from "./meter-helpers";

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

/**
 * Append a newly added queue item's index to the shuffled-indices array
 * so that random-mode iteration includes it in the current cycle.
 * - If the index already exists (e.g. shuffled array already covered it),
 *   returns the input unchanged.
 * - The new index is placed at the end of the array (after current pos).
 */
export function appendShuffledIndexOnAdd(
  indices: number[],
  appendedQueueIdx: number,
): number[] {
  if (indices.includes(appendedQueueIdx)) return indices;
  return [...indices, appendedQueueIdx];
}

export interface QueueInsertResult<T> {
  queue: T[];
  currentIndex: number;
  shuffledIndices: number[];
}

/**
 * Insert a new entry into the Note-mode queue at `insertAt` and return the
 * adjusted queue / current-index / shuffled-indices triple.
 *
 * Index correction rules (the bug fix targeted by Task #65):
 * - If `insertAt <= currentIndex`, currentIndex must be bumped by +1 so that
 *   it keeps pointing to the same playing entry after the splice.
 * - If `insertAt > currentIndex` or no entry is playing (currentIndex < 0),
 *   currentIndex is unchanged.
 *
 * Shuffled indices are kept consistent for "random" mode:
 * - Append (insertAt === queue.length) → append the new queue index to the
 *   shuffled cycle (only if not already present).
 * - Mid-insert → shift all shuffled entries >= insertAt by +1 and place the
 *   new index right after the current shuffled position.
 */
export function applyQueueInsert<T>(
  queue: T[],
  currentIndex: number,
  shuffledIndices: number[],
  shuffledPos: number,
  mode: "once" | "loop" | "random",
  insertAt: number,
  entry: T,
): QueueInsertResult<T> {
  const pos = Math.max(0, Math.min(insertAt, queue.length));
  const newQueue = [...queue];
  newQueue.splice(pos, 0, entry);

  let newCurrent = currentIndex;
  if (currentIndex >= 0 && pos <= currentIndex) {
    newCurrent = currentIndex + 1;
  }

  let newShuffled = shuffledIndices;
  if (mode === "random") {
    if (pos >= queue.length) {
      newShuffled = appendShuffledIndexOnAdd(shuffledIndices, pos);
    } else {
      newShuffled = adjustShuffledIndicesOnInsert(
        shuffledIndices,
        shuffledPos,
        pos,
      );
    }
  }

  return { queue: newQueue, currentIndex: newCurrent, shuffledIndices: newShuffled };
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

export interface LoopBlocksTarget {
  setLoopBlocks(blocks: LoopBlock[]): void;
}

/**
 * handleLoopBlocksChange의 순수 로직 (엔진 갱신 + barConfig 갱신 + scheduleReRender).
 * app/index.tsx의 useCallback이 이 함수를 호출해 실제 동작을 위임한다.
 * React 상태 setter(setLoopBlocks)는 호출자가 별도로 수행한다.
 *
 * @param engine setLoopBlocks를 갖는 엔진 인터페이스 (null이면 스킵)
 * @param barConfig barConfigRef.current — loopBlocks 필드가 갱신된다
 * @param scheduleReRender WAV 버퍼 재구성을 예약하는 콜백
 * @param blocks 새 루프 블록 배열
 */
export function applyLoopBlocksChange(
  engine: LoopBlocksTarget | null,
  barConfig: { loopBlocks: LoopBlock[] },
  scheduleReRender: () => void,
  blocks: LoopBlock[],
): void {
  engine?.setLoopBlocks(blocks);
  barConfig.loopBlocks = [...blocks];
  scheduleReRender();
}
