import {
  PCM_CACHE_MAX_BYTES,
  PCM_CACHE_MAX_ENTRIES,
  getClickPCM,
  getPCM,
  getPCMCacheStats,
  invalidatePCMCache,
  peekPCM,
  resetPCMCacheForTests,
  setPCM,
} from "@/lib/pcm-cache";
import { createAudioWarmup } from "@/lib/audio-warmup";
import { isPCMCancelled } from "@/lib/pcm-loader";

const click = (value: number) => ({
  strong: new Float32Array([value]),
  high: new Float32Array([value]),
  low: new Float32Array([value]),
});

describe("PCM preparation boundaries", () => {
  beforeEach(() => resetPCMCacheForTests());

  it("deduplicates an in-flight click decode and publishes one URI identity", async () => {
    let resolve!: (value: ReturnType<typeof click>) => void;
    const loader = jest.fn(() => new Promise<ReturnType<typeof click>>(r => { resolve = r; }));
    const first = getClickPCM("file:///same.wav#t=0,1", loader);
    const second = getClickPCM("file:///same.wav#t=0,1", loader);
    resolve(click(0.5));
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(getPCMCacheStats().entries).toBe(1);
  });

  it("rejects a completion from an invalidated generation", async () => {
    let resolve!: (value: ReturnType<typeof click>) => void;
    const pending = getClickPCM("old", () => new Promise(r => { resolve = r; }));
    invalidatePCMCache();
    resolve(click(0.2));
    await pending;
    expect(getPCMCacheStats().entries).toBe(0);
  });

  it("keeps URI fragments as distinct cache identities", async () => {
    const loader = jest.fn(async () => new Float32Array([0.4]));
    await getPCM("sample:file:///same.wav#t=0,1", loader);
    await getPCM("sample:file:///same.wav#t=1,2", loader);
    expect(loader).toHaveBeenCalledTimes(2);
    expect(getPCMCacheStats().entries).toBe(2);
  });

  it("evicts least-recently-used entries at the count limit", async () => {
    for (let index = 0; index < PCM_CACHE_MAX_ENTRIES; index += 1) {
      await getPCM(`sample:${index}`, async () => new Float32Array([index]));
    }
    expect(peekPCM("sample:0")).toBeDefined();
    await getPCM("sample:overflow", async () => new Float32Array([99]));
    expect(peekPCM("sample:1")).toBeUndefined();
    expect(peekPCM("sample:0")).toBeDefined();
  });

  it("evicts entries when decoded PCM exceeds the byte budget", async () => {
    const sampleCount = Math.floor(PCM_CACHE_MAX_BYTES / Float32Array.BYTES_PER_ELEMENT / 2) + 1;
    await getPCM("large:a", async () => new Float32Array(sampleCount));
    await getPCM("large:b", async () => new Float32Array(sampleCount));
    expect(getPCMCacheStats().bytes).toBeLessThanOrEqual(PCM_CACHE_MAX_BYTES);
    expect(peekPCM("large:a")).toBeUndefined();
    expect(peekPCM("large:b")).toBeDefined();
  });

  it("keeps explicitly pinned custom PCM while evicting reloadable entries", async () => {
    setPCM("polygon-raw:custom-layer", click(0.7), { pinned: true });
    for (let index = 0; index < PCM_CACHE_MAX_ENTRIES + 2; index += 1) {
      await getPCM(`reloadable:${index}`, async () => new Float32Array([index]));
    }
    expect(peekPCM("polygon-raw:custom-layer")).toEqual(click(0.7));
    expect(getPCMCacheStats().pinned).toBe(1);
  });

  it("rejects pinned entries beyond the count limit without exceeding it", () => {
    for (let index = 0; index < PCM_CACHE_MAX_ENTRIES; index += 1) {
      setPCM(`pinned:${index}`, new Float32Array([index]), { pinned: true });
    }
    expect(() => {
      setPCM("pinned:overflow", new Float32Array([99]), { pinned: true });
    }).toThrow("Pinned PCM exceeds canonical cache capacity");
    expect(getPCMCacheStats()).toMatchObject({
      entries: PCM_CACHE_MAX_ENTRIES,
      pinned: PCM_CACHE_MAX_ENTRIES,
    });
  });

  it("rejects an oversized pinned entry without retaining it", () => {
    const oversized = new Float32Array(
      Math.floor(PCM_CACHE_MAX_BYTES / Float32Array.BYTES_PER_ELEMENT) + 1,
    );
    expect(() => {
      setPCM("pinned:oversized", oversized, { pinned: true });
    }).toThrow("Pinned PCM exceeds canonical cache capacity");
    expect(getPCMCacheStats()).toMatchObject({ entries: 0, bytes: 0, pinned: 0 });
  });

  it("does not reuse an old in-flight request after key invalidation", async () => {
    let resolveOld!: (value: Float32Array) => void;
    const old = getPCM(
      "sample:key",
      () => new Promise<Float32Array>(resolve => { resolveOld = resolve; }),
    );
    invalidatePCMCache("sample:key");
    const freshLoader = jest.fn(async () => new Float32Array([2]));
    const fresh = await getPCM("sample:key", freshLoader);
    resolveOld(new Float32Array([1]));
    await expect(old).resolves.toEqual(new Float32Array([1]));
    expect(fresh[0]).toBe(2);
    expect(peekPCM<Float32Array>("sample:key")?.[0]).toBe(2);
    expect(freshLoader).toHaveBeenCalledTimes(1);
  });

  it("blocks stale publication after key then global invalidation", async () => {
    invalidatePCMCache("sample:key");
    let resolve!: (value: Float32Array) => void;
    const pending = getPCM(
      "sample:key",
      () => new Promise<Float32Array>(r => { resolve = r; }),
    );
    invalidatePCMCache();
    resolve(new Float32Array([1]));
    await expect(pending).resolves.toEqual(new Float32Array([1]));
    expect(peekPCM("sample:key")).toBeUndefined();
  });

  it("cancels the shared decode only after its last waiter leaves", async () => {
    const firstController = new AbortController();
    const secondController = new AbortController();
    let resolve!: (value: Float32Array) => void;
    let sharedSignal!: AbortSignal;
    const loader = jest.fn((signal: AbortSignal) => {
      sharedSignal = signal;
      return new Promise<Float32Array>(r => { resolve = r; });
    });
    const first = getPCM("shared", loader, firstController.signal);
    const second = getPCM("shared", loader, secondController.signal);
    firstController.abort();
    await first.catch(error => expect(isPCMCancelled(error)).toBe(true));
    expect(sharedSignal.aborted).toBe(false);
    resolve(new Float32Array([3]));
    await expect(second).resolves.toEqual(new Float32Array([3]));
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("runs different warmup keys concurrently without superseding either", async () => {
    const warmup = createAudioWarmup();
    const [first, second] = await Promise.all([
      warmup.warm("a", async () => "a"),
      warmup.warm("b", async () => "b"),
    ]);
    expect([first, second]).toEqual(["a", "b"]);
  });

  it("deduplicates a warmup while isolating caller cancellation", async () => {
    const warmup = createAudioWarmup();
    const caller = new AbortController();
    let resolve!: (value: string) => void;
    const prepare = jest.fn(() => new Promise<string>(r => { resolve = r; }));
    const cancelledWaiter = warmup.warm("same", prepare, caller.signal);
    const activeWaiter = warmup.warm("same", prepare);
    caller.abort();
    await cancelledWaiter.catch(error => expect(isPCMCancelled(error)).toBe(true));
    resolve("ready");
    await expect(activeWaiter).resolves.toBe("ready");
    expect(prepare).toHaveBeenCalledTimes(1);
  });

  it("explicitly cancels a keyed warmup without touching other keys", async () => {
    const warmup = createAudioWarmup();
    const pendingA = warmup.warm("a", signal => new Promise((_, reject) => {
      signal.addEventListener("abort", () => reject(new Error("RENDER_ABORTED")), { once: true });
    }));
    const pendingB = warmup.warm("b", async () => "ready");
    warmup.cancel("a");
    await expect(pendingA).rejects.toThrow("RENDER_ABORTED");
    await expect(pendingB).resolves.toBe("ready");
  });

  it("warmup is cancellable and has no output-resource surface", async () => {
    const warmup = createAudioWarmup();
    let resolve!: (value: Float32Array) => void;
    const pending = warmup.warm("sample", () => new Promise(r => { resolve = r; }));
    warmup.cancel();
    resolve(new Float32Array([1]));
    await pending.catch(error => expect(isPCMCancelled(error)).toBe(true));
    expect(Object.keys(warmup)).toEqual(["warm", "cancel", "dispose"]);
  });
});