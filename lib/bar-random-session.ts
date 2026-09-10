export type BarRandomStrategy =
  | "independent"
  | "no-consecutive"
  | "shuffle-bag"
  | "bundle-repeat";

export interface BarRandomConfig {
  strategy: BarRandomStrategy;
  /** Number of randomly selected patterns in one repeated bundle. */
  bundleSize: number;
  /** Number of times the selected bundle is repeated. */
  bundleRepeats: number;
}

export const DEFAULT_BAR_RANDOM_CONFIG: BarRandomConfig = {
  strategy: "independent",
  bundleSize: 2,
  bundleRepeats: 2,
};

export interface BarRandomSession {
  /** The source-bar index for every item already generated in this session. */
  order: number[];
  /** The index of the next item the engine should schedule. */
  cursor: number;
  /** The source snapshot is kept separately from the editable bar list. */
  sourceCount: number;
  active: boolean;
  remainingShuffleBag: number[];
  /** Canonical source beats that may be selected independently. */
  sourceIndexes?: number[];
  /** Immutable block boundaries used to render/replay this generated order. */
  loopBlocks?: BarRandomLoopBlock[];
}

export interface BarRandomDisplayItem {
  key: string;
  displayBeat: number;
  sourceBeat: number;
  isRandom: boolean;
  randomSequenceIndex?: number;
}

export interface BarRandomLoopBlock {
  startBeat: number;
  endBeat: number;
  layerOf?: number;
  type?: "count" | "duration";
  value?: number;
  jumpToBlock?: number;
  jumpCount?: number;
  bpm?: number;
  soundSet?: string;
  ownBeatTypes?: Record<number, string>;
  ownSubdivisions?: Record<string, string[]>;
}

export function getBarRandomCandidateCount(
  sourceCount: number,
  barRepeats: Record<number, { isEnd?: boolean }> = {},
): number {
  for (let beat = 0; beat < sourceCount; beat += 1) {
    if (barRepeats[beat]?.isEnd) return beat + 1;
  }
  return Math.max(0, sourceCount);
}

export function buildBarRandomSourceIndexes(
  sourceCount: number,
  loopBlocks: BarRandomLoopBlock[] = [],
  candidateCount: number = sourceCount,
): number[] {
  const topLevel = loopBlocks
    .filter((block, index) => {
      if (block.layerOf !== undefined || block.startBeat < 0 || block.startBeat >= sourceCount) return false;
      return !loopBlocks.some((other, otherIndex) =>
        otherIndex !== index &&
        other.layerOf === undefined &&
        other.startBeat <= block.startBeat &&
        other.endBeat >= block.endBeat &&
        (other.startBeat < block.startBeat || other.endBeat > block.endBeat)
      );
    })
    .map(block => ({
      startBeat: block.startBeat,
      endBeat: Math.min(sourceCount - 1, Math.max(block.startBeat, block.endBeat)),
    }))
    .sort((a, b) => a.startBeat - b.startBeat);
  const covered = new Set<number>();
  topLevel.forEach(block => {
    for (let beat = block.startBeat; beat <= block.endBeat; beat += 1) covered.add(beat);
  });
  return [
    ...topLevel.map(block => block.startBeat),
    ...Array.from({ length: Math.max(0, Math.min(sourceCount, candidateCount)) }, (_, beat) => beat)
      .filter(beat => !covered.has(beat)),
  ].sort((a, b) => a - b);
}

export function buildBarRandomDisplayItems(
  sourceCount: number,
  session: BarRandomSession | null | undefined,
  loopBlocks: BarRandomLoopBlock[] = [],
): BarRandomDisplayItem[] {
  if (session?.active && session.order.length > 0) {
    const sessionBlocks = session.loopBlocks ?? loopBlocks;
    const sourceIndexes = new Set(buildBarRandomSourceIndexes(sourceCount, sessionBlocks));
    const topLevelByStart = new Map<number, BarRandomLoopBlock>();
    sessionBlocks.forEach(block => {
      if (block.layerOf !== undefined || !sourceIndexes.has(block.startBeat)) return;
      const existing = topLevelByStart.get(block.startBeat);
      if (!existing || block.endBeat > existing.endBeat) topLevelByStart.set(block.startBeat, block);
    });
    const result: BarRandomDisplayItem[] = [];
    session.order.forEach((sourceBeat, randomSequenceIndex) => {
      const block = topLevelByStart.get(sourceBeat);
      const endBeat = block
        ? Math.min(sourceCount - 1, Math.max(sourceBeat, block.endBeat))
        : sourceBeat;
      for (let beat = sourceBeat; beat <= endBeat; beat += 1) {
        result.push({
          key: `random-${randomSequenceIndex}-${beat}`,
          displayBeat: result.length,
          sourceBeat: beat,
          isRandom: true,
          randomSequenceIndex,
        });
      }
    });
    return result;
  }
  return Array.from({ length: Math.max(0, sourceCount) }, (_, sourceBeat) => ({
    key: `source-${sourceBeat}`,
    displayBeat: sourceBeat,
    sourceBeat,
    isRandom: false,
  }));
}

export function createBarRandomSession(
  sourceCount: number,
  sourceIndexes?: number[],
  loopBlocks?: BarRandomLoopBlock[],
): BarRandomSession {
  const validIndexes = sourceIndexes
    ?.filter((index, position, all) =>
      Number.isInteger(index) && index >= 0 && index < sourceCount && all.indexOf(index) === position
    );
  return {
    order: [],
    cursor: 0,
    sourceCount,
    active: true,
    remainingShuffleBag: [],
    sourceIndexes: validIndexes?.length ? validIndexes : undefined,
    loopBlocks: loopBlocks?.map(block => ({ ...block })),
  };
}

function randomIndex(count: number, rng: () => number): number {
  return Math.max(0, Math.min(count - 1, Math.floor(rng() * count)));
}

function shuffled(values: number[], rng: () => number): number[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = randomIndex(index + 1, rng);
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

/**
 * Adds a predictable chunk to a session. The chunk is deliberately pure so
 * the exact order can be persisted and replayed without touching the source
 * bars.
 */
export function appendBarRandomItems(
  session: BarRandomSession,
  count: number,
  config: BarRandomConfig = DEFAULT_BAR_RANDOM_CONFIG,
  rng: () => number = Math.random,
): number[] {
  if (count <= 0 || session.sourceCount <= 0) return [];

  const added: number[] = [];
  const choices = session.sourceIndexes?.length
    ? session.sourceIndexes
    : Array.from({ length: session.sourceCount }, (_, index) => index);
  const last = () => session.order[session.order.length - 1];
  const chooseIndependent = () => {
    let next = choices[randomIndex(choices.length, rng)];
    if (config.strategy === "no-consecutive" && choices.length > 1) {
      while (next === last()) next = choices[randomIndex(choices.length, rng)];
    }
    return next;
  };

  if (config.strategy === "bundle-repeat") {
    const bundleSize = Math.max(1, Math.floor(config.bundleSize || 1));
    const repeats = Math.max(1, Math.floor(config.bundleRepeats || 1));
    while (added.length < count) {
      const bundle = Array.from({ length: bundleSize }, chooseIndependent);
      for (let repeat = 0; repeat < repeats && added.length < count; repeat += 1) {
        for (const item of bundle) {
          if (added.length >= count) break;
          session.order.push(item);
          added.push(item);
        }
      }
    }
    return added;
  }

  let bag = session.remainingShuffleBag;
  while (added.length < count) {
    if (config.strategy === "shuffle-bag" && bag.length === 0) {
      bag = shuffled(choices, rng);
      if (choices.length > 1 && bag[0] === last()) {
        [bag[0], bag[1]] = [bag[1], bag[0]];
      }
    }
    const next = config.strategy === "shuffle-bag" ? (bag.shift() as number) : chooseIndependent();
    session.order.push(next);
    added.push(next);
  }
  session.remainingShuffleBag = bag;
  return added;
}

/**
 * Builds the next engine chunk without ever consuming or reordering the source
 * bar list. A one-shot random play is always a shuffled permutation of every
 * source bar. Repeating random play follows the user-selected strategy and can
 * be replenished in the background.
 */
export function appendBarRandomPlaybackChunk(
  session: BarRandomSession,
  requestedCount: number,
  repeatEnabled: boolean,
  config: BarRandomConfig = DEFAULT_BAR_RANDOM_CONFIG,
  rng: () => number = Math.random,
): number[] {
  if (session.sourceCount <= 0) return [];
  if (!repeatEnabled) {
    if (session.order.length > 0) return [];
    return appendBarRandomItems(
      session,
      session.sourceIndexes?.length ?? session.sourceCount,
      { ...config, strategy: "shuffle-bag" },
      rng,
    );
  }
  return appendBarRandomItems(
    session,
    Math.max(1, requestedCount),
    config,
    rng,
  );
}

export function replayBarRandomSession(
  sourceCount: number,
  order: number[],
  sourceIndexes?: number[],
  loopBlocks?: BarRandomLoopBlock[],
): BarRandomSession {
  return {
    sourceCount,
    order: order.filter(index => index >= 0 && index < sourceCount),
    cursor: 0,
    active: true,
    remainingShuffleBag: [],
    sourceIndexes,
    loopBlocks: loopBlocks?.map(block => ({ ...block })),
  };
}