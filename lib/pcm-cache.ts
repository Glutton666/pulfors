import type { ClickPCMs } from "./audio-renderer";
import { PCMLoadError } from "./pcm-loader";

// Polygon supports eight layers. Reserve room for one pinned custom source and
// one currently playable tone variant per layer.
export const PCM_CACHE_MAX_ENTRIES = 16;
export const PCM_CACHE_MAX_BYTES = 8 * 1024 * 1024;
type PCMValue = Float32Array | ClickPCMs | { pcm: Float32Array };
type Entry = {
  value: PCMValue;
  generation: number;
  revision: number;
  bytes: number;
  pinned: boolean;
};
type Inflight = {
  controller: AbortController;
  promise: Promise<PCMValue>;
  epoch: number;
  revision: number;
  waiters: number;
  settled: boolean;
};
const cache = new Map<string, Entry>();
const inflight = new Map<string, Inflight>();
const generations = new Map<string, number>();
let generation = 0;
let bytes = 0;

const sizeOf = (value: PCMValue): number =>
  value instanceof Float32Array ? value.byteLength
    : "pcm" in value ? value.pcm.byteLength
    : value.strong.byteLength + value.high.byteLength + value.low.byteLength;
const cancelled = () => new PCMLoadError("cancelled", "PCM load cancelled");

function evict() {
  while (cache.size > PCM_CACHE_MAX_ENTRIES || bytes > PCM_CACHE_MAX_BYTES) {
    const key = [...cache].find(([, entry]) => !entry.pinned)?.[0];
    if (!key) return;
    const entry = cache.get(key);
    cache.delete(key);
    bytes -= entry?.bytes ?? 0;
  }
}
function touch(key: string, entry: Entry) {
  cache.delete(key);
  cache.set(key, entry);
}
function waitFor<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(cancelled());
  return new Promise<T>((resolve, reject) => {
    const abort = () => { signal.removeEventListener("abort", abort); reject(cancelled()); };
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      value => { signal.removeEventListener("abort", abort); resolve(value); },
      error => { signal.removeEventListener("abort", abort); reject(error); },
    );
  });
}

/** Canonical bounded PCM store. URI fragments and variant fingerprints are part of key. */
export async function getPCM<T extends PCMValue>(
  key: string,
  loader: (signal: AbortSignal) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) throw cancelled();
  const epoch = generation;
  const revision = generations.get(key) ?? 0;
  const hit = cache.get(key);
  if (hit && hit.generation === epoch && hit.revision === revision) {
    touch(key, hit);
    return waitFor(Promise.resolve(hit.value as T), signal);
  }
  const existing = inflight.get(key);
  const reusable = existing && existing.epoch === epoch && existing.revision === revision;
  const request = reusable ? existing : (() => {
    const controller = new AbortController();
    const created: Inflight = {
      controller,
      epoch,
      revision,
      waiters: 0,
      settled: false,
      promise: Promise.resolve(undefined as unknown as PCMValue),
    };
    created.promise = loader(controller.signal).then((value) => {
      if (
        !controller.signal.aborted
        && generation === epoch
        && (generations.get(key) ?? 0) === revision
        && sizeOf(value) > 0
      ) {
        const prior = cache.get(key);
        bytes -= prior?.bytes ?? 0;
        const entry = {
          value,
          generation: epoch,
          revision,
          bytes: sizeOf(value),
          pinned: false,
        };
        cache.set(key, entry);
        bytes += entry.bytes;
        evict();
      }
      return value;
    }).finally(() => {
      created.settled = true;
      if (inflight.get(key) === created) inflight.delete(key);
    });
    inflight.set(key, created);
    return created;
  })();
  request.waiters += 1;
  try {
    return await waitFor(request.promise as Promise<T>, signal);
  } finally {
    request.waiters -= 1;
    if (request.waiters === 0 && !request.settled) {
      request.controller.abort();
      if (inflight.get(key) === request) inflight.delete(key);
    }
  }
}

export async function getClickPCM(
  key: string,
  loader: (signal: AbortSignal) => Promise<ClickPCMs>,
  signal?: AbortSignal,
) {
  return getPCM(key, loader, signal);
}
export function getDecodedPCM(
  sourceIdentity: string,
  loader: (signal: AbortSignal) => Promise<Float32Array>,
  signal?: AbortSignal,
) {
  return getPCM(sourceIdentity, loader, signal);
}
export function peekPCM<T extends PCMValue>(key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry || entry.generation !== generation || entry.revision !== (generations.get(key) ?? 0)) return undefined;
  touch(key, entry);
  return entry.value as T;
}
export function setPCM<T extends PCMValue>(
  key: string,
  value: T,
  options?: { pinned?: boolean },
): T {
  const prior = cache.get(key);
  const valueBytes = sizeOf(value);
  if (options?.pinned === true) {
    let pinnedEntries = 0;
    let pinnedBytes = 0;
    for (const [entryKey, entry] of cache) {
      if (entryKey !== key && entry.pinned) {
        pinnedEntries += 1;
        pinnedBytes += entry.bytes;
      }
    }
    if (
      pinnedEntries + 1 > PCM_CACHE_MAX_ENTRIES
      || pinnedBytes + valueBytes > PCM_CACHE_MAX_BYTES
    ) {
      throw new RangeError("Pinned PCM exceeds canonical cache capacity");
    }
  }
  bytes -= prior?.bytes ?? 0;
  const entry = {
    value,
    generation,
    revision: generations.get(key) ?? 0,
    bytes: valueBytes,
    pinned: options?.pinned === true,
  };
  cache.set(key, entry);
  bytes += entry.bytes;
  evict();
  return value;
}
export function invalidatePCMCachePrefix(prefix: string): void {
  const keys = new Set<string>();
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) keys.add(key);
  }
  for (const key of inflight.keys()) {
    if (key.startsWith(prefix)) keys.add(key);
  }
  for (const key of generations.keys()) {
    if (key.startsWith(prefix)) keys.add(key);
  }
  for (const key of keys) invalidatePCMCache(key);
}
export function invalidatePCMCache(key?: string): void {
  if (key) {
    generations.set(key, (generations.get(key) ?? 0) + 1);
    inflight.get(key)?.controller.abort();
    inflight.delete(key);
    const entry = cache.get(key);
    bytes -= entry?.bytes ?? 0;
    cache.delete(key);
  } else {
    generation += 1;
    for (const request of inflight.values()) request.controller.abort();
    inflight.clear();
    cache.clear();
    bytes = 0;
  }
}
export function getPCMCacheStats() {
  return {
    entries: cache.size,
    bytes,
    generation,
    pinned: [...cache.values()].filter(entry => entry.pinned).length,
  };
}
export function resetPCMCacheForTests() {
  invalidatePCMCache();
  generations.clear();
}