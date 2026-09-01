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
}

export function createBarRandomSession(sourceCount: number): BarRandomSession {
  return { order: [], cursor: 0, sourceCount, active: true, remainingShuffleBag: [] };
}

function randomIndex(count: number, rng: () => number): number {
  return Math.max(0, Math.min(count - 1, Math.floor(rng() * count)));
}

function shuffled(count: number, rng: () => number): number[] {
  const result = Array.from({ length: count }, (_, index) => index);
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
  const last = () => session.order[session.order.length - 1];
  const chooseIndependent = () => {
    let next = randomIndex(session.sourceCount, rng);
    if (config.strategy === "no-consecutive" && session.sourceCount > 1) {
      while (next === last()) next = randomIndex(session.sourceCount, rng);
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
      bag = shuffled(session.sourceCount, rng);
      if (session.sourceCount > 1 && bag[0] === last()) {
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

export function replayBarRandomSession(
  sourceCount: number,
  order: number[],
): BarRandomSession {
  return {
    sourceCount,
    order: order.filter(index => index >= 0 && index < sourceCount),
    cursor: 0,
    active: true,
    remainingShuffleBag: [],
  };
}