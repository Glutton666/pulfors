import { PCMLoadError } from "./pcm-loader";

export interface AudioWarmup {
  warm: <T>(
    key: string,
    prepare: (signal: AbortSignal) => Promise<T>,
    signal?: AbortSignal,
  ) => Promise<T>;
  cancel: (key?: string) => void;
  dispose: () => void;
}

/** Output-free, key-scoped preparation coordinator. */
export function createAudioWarmup(): AudioWarmup {
  const jobs = new Map<string, { controller: AbortController; promise: Promise<unknown> }>();
  const waitFor = <T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> => {
    if (!signal) return promise;
    if (signal.aborted) {
      return Promise.reject(new PCMLoadError("cancelled", "Audio warmup cancelled"));
    }
    return new Promise<T>((resolve, reject) => {
      const abort = () => {
        signal.removeEventListener("abort", abort);
        reject(new PCMLoadError("cancelled", "Audio warmup cancelled"));
      };
      signal.addEventListener("abort", abort, { once: true });
      promise.then(
        value => {
          signal.removeEventListener("abort", abort);
          resolve(value);
        },
        error => {
          signal.removeEventListener("abort", abort);
          reject(error);
        },
      );
    });
  };
  const warm = <T>(
    key: string,
    prepare: (signal: AbortSignal) => Promise<T>,
    signal?: AbortSignal,
  ) => {
    const previous = jobs.get(key);
    if (previous) return waitFor(previous.promise as Promise<T>, signal);
    const controller = new AbortController();
    const promise = prepare(controller.signal).then((value) => {
      if (controller.signal.aborted) {
        throw new PCMLoadError("cancelled", "Audio warmup cancelled");
      }
      return value;
    }).finally(() => {
      if (jobs.get(key)?.promise === promise) jobs.delete(key);
    });
    jobs.set(key, { controller, promise });
    return waitFor(promise, signal);
  };
  const cancel = (key?: string) => {
    if (key) {
      const job = jobs.get(key);
      job?.controller.abort();
      if (job) jobs.delete(key);
      return;
    }
    for (const job of jobs.values()) job.controller.abort();
    jobs.clear();
  };
  return { warm, cancel, dispose: () => cancel() };
}