/**
 * Debounced settings persister factory with retry/backoff.
 *
 * Originally inline in app/index.tsx as `persistSettings`, the timer + pending
 * merge + snapshot-read pattern is reusable for any debounced "merge into
 * snapshot then write" persistence.
 *
 * - `getSnapshot` returns the latest base object (reads current React state).
 * - `write` performs the side effect (e.g. saveSettings); may be sync or async.
 * - `debounceMs` defaults to 500ms.
 * - `retry` configures exponential backoff on write failure.
 *
 * Retry semantics (Task #38):
 * - On write rejection, the persister waits `baseDelayMs * 2^(attempt-1)` ms
 *   then retries automatically up to `maxAttempts` times.
 * - If a new persist() call arrives while waiting on backoff, the pending
 *   change is merged in and a fresh write is fired immediately (the backoff
 *   timer is cancelled). Stale data never blocks a fresh user change.
 * - After `maxAttempts` consecutive failures the persister gives up the
 *   current cycle, surfaces the failure via `getStatus()`, and warns once
 *   in dev (`__DEV__`). The next persist() call starts a new cycle.
 */
export interface PersistRetryOptions {
  /** Maximum total attempts per write cycle (1 = no retry). Default 3. */
  maxAttempts?: number;
  /** Base backoff in milliseconds; doubled per attempt. Default 500. */
  baseDelayMs?: number;
}

export interface PersisterStatus {
  /** Epoch ms of last successful write, or null. */
  lastSaveAt: number | null;
  /** Epoch ms of last failed attempt, or null. */
  lastErrorAt: number | null;
  /**
   * Number of consecutive failed attempts (resets to 0 on success). Stays
   * non-zero after a fully-failed cycle so callers can show "stale" badges.
   */
  consecutiveFailures: number;
  /** Number of merged-but-not-yet-written keys. */
  pendingChanges: number;
  /** True iff the most recent cycle exhausted maxAttempts without success. */
  cycleFailed: boolean;
}

export interface DebouncedPersister<T extends object> {
  (overrides?: Partial<T>): void;
  flush(): void;
  cancel(): void;
  getStatus(): PersisterStatus;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 500;

export function createDebouncedPersister<T extends object>(
  getSnapshot: () => T,
  write: (merged: T) => void | Promise<void>,
  debounceMs = 500,
  retry: PersistRetryOptions = {},
): DebouncedPersister<T> {
  const maxAttempts = Math.max(1, retry.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  const baseDelayMs = Math.max(0, retry.baseDelayMs ?? DEFAULT_BASE_DELAY_MS);

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let backoffTimer: ReturnType<typeof setTimeout> | null = null;
  let pending: Partial<T> = {};
  let attempt = 0;
  let writing = false;
  let lastSaveAt: number | null = null;
  let lastErrorAt: number | null = null;
  let consecutiveFailures = 0;
  let cycleFailed = false;
  // 취소 토큰: cancel() 호출 시마다 증가시켜, 토큰이 캡처된 시점 이전의 in-flight
  // write 콜백이 상태를 오염시키지 않도록 차단한다.
  let cycleToken = 0;

  const clearDebounce = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  };
  const clearBackoff = () => {
    if (backoffTimer) {
      clearTimeout(backoffTimer);
      backoffTimer = null;
    }
  };

  const startCycle = () => {
    if (Object.keys(pending).length === 0) return;
    if (writing) return;
    attempt = 0;
    cycleFailed = false;
    runAttempt();
  };

  const runAttempt = () => {
    if (Object.keys(pending).length === 0) return;
    clearBackoff();
    attempt += 1;
    writing = true;
    const merged: T = { ...getSnapshot(), ...pending };
    const writtenKeys = Object.keys(pending);
    pending = {};
    // 이 시도에 묶인 토큰. cancel() 이후의 콜백은 무시된다.
    const myToken = cycleToken;

    const onSuccess = () => {
      if (myToken !== cycleToken) return;
      writing = false;
      lastSaveAt = Date.now();
      consecutiveFailures = 0;
      cycleFailed = false;
      if (Object.keys(pending).length > 0) {
        // 쓰는 동안 새 변경이 들어왔다면 한 번 더 사이클을 돌린다.
        startCycle();
      }
    };
    const onFailure = (err: unknown) => {
      if (myToken !== cycleToken) return;
      writing = false;
      lastErrorAt = Date.now();
      consecutiveFailures += 1;
      // 실패한 변경분을 다음 시도에 다시 합친다(이후 호출자 머지가 우선되도록 pending이 뒤).
      const restored = Object.fromEntries(
        writtenKeys.map((k) => [k, (merged as Record<string, unknown>)[k]]),
      ) as Partial<T>;
      pending = { ...restored, ...pending };
      if (attempt < maxAttempts) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        backoffTimer = setTimeout(() => {
          backoffTimer = null;
          runAttempt();
        }, delay);
      } else {
        cycleFailed = true;
        if (typeof __DEV__ !== "undefined" && __DEV__) {
          // eslint-disable-next-line no-console
          console.warn(
            `[persist] write failed after ${attempt} attempts; ${Object.keys(pending).length} key(s) still pending`,
            err,
          );
        }
      }
    };

    let result: void | Promise<void>;
    try {
      result = write(merged);
    } catch (err) {
      onFailure(err);
      return;
    }
    if (result && typeof (result as Promise<void>).then === "function") {
      (result as Promise<void>).then(onSuccess, onFailure);
    } else {
      onSuccess();
    }
  };

  const flushNow = () => {
    clearDebounce();
    if (writing) return; // 진행 중인 사이클이 끝나면 자동으로 추가 사이클을 돈다.
    if (backoffTimer) {
      // 백오프 대기 중 → 즉시 새 시도(타이머 클리어 후 같은 사이클 attempt 진행).
      runAttempt();
      return;
    }
    startCycle();
  };

  const persister = ((overrides: Partial<T> = {}) => {
    Object.assign(pending, overrides);
    if (backoffTimer) {
      // 실패 후 대기 중 새 변경 → 즉시 머지 후 재시도.
      runAttempt();
      return;
    }
    if (cycleFailed) {
      // 이전 사이클이 모두 실패한 상태에서 새 변경 → 새 사이클 시작.
      cycleFailed = false;
      attempt = 0;
    }
    clearDebounce();
    debounceTimer = setTimeout(flushNow, debounceMs);
  }) as DebouncedPersister<T>;

  persister.flush = flushNow;
  persister.cancel = () => {
    clearDebounce();
    clearBackoff();
    pending = {};
    attempt = 0;
    cycleFailed = false;
    // 토큰을 무효화해 in-flight write의 콜백이 상태를 더는 건드리지 못하게 한다.
    cycleToken += 1;
    writing = false;
  };
  persister.getStatus = () => ({
    lastSaveAt,
    lastErrorAt,
    consecutiveFailures,
    pendingChanges: Object.keys(pending).length,
    cycleFailed,
  });

  return persister;
}

declare const __DEV__: boolean;
