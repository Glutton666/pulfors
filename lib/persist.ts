/**
 * Debounced settings persister factory.
 *
 * Originally inline in app/index.tsx as `persistSettings`, the timer + pending
 * merge + snapshot-read pattern is reusable for any debounced "merge into
 * snapshot then write" persistence.
 *
 * - `getSnapshot` returns the latest base object (reads current React state).
 * - `write` performs the side effect (e.g. saveSettings).
 * - `debounceMs` defaults to 500ms.
 *
 * The returned persister merges incremental overrides into one pending object
 * and flushes after the debounce window. `flush()` forces an immediate write
 * (e.g. before unmount); `cancel()` discards pending changes.
 */
export interface DebouncedPersister<T extends object> {
  (overrides?: Partial<T>): void;
  flush(): void;
  cancel(): void;
}

export function createDebouncedPersister<T extends object>(
  getSnapshot: () => T,
  write: (merged: T) => void,
  debounceMs = 500,
): DebouncedPersister<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: Partial<T> = {};

  const flushNow = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (Object.keys(pending).length === 0) return;
    const merged: T = { ...getSnapshot(), ...pending };
    pending = {};
    write(merged);
  };

  const persister = ((overrides: Partial<T> = {}) => {
    Object.assign(pending, overrides);
    if (timer) clearTimeout(timer);
    timer = setTimeout(flushNow, debounceMs);
  }) as DebouncedPersister<T>;

  persister.flush = flushNow;
  persister.cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    pending = {};
  };

  return persister;
}
