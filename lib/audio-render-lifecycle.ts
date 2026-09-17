export type AudioRenderInterruption = "cancelled" | "superseded";

export type AudioRenderResult<T> =
  | { status: "completed"; prepared: PreparedAudioRender<T> }
  | { status: "cancelled" }
  | { status: "superseded" }
  | { status: "failed"; error: unknown };

export interface PreparedAudioRender<T> {
  readonly value: T;
  commit(publish: (value: T) => void): boolean;
  discard(): void;
  fail(error: unknown): { status: "failed"; error: unknown } | { status: AudioRenderInterruption };
}

export interface AudioRenderSession {
  readonly id: number;
  readonly signal: AbortSignal | undefined;
  isCurrent(): boolean;
  interruption(): { status: AudioRenderInterruption };
  complete<T>(value: T, dispose: (value: T) => void): AudioRenderResult<T>;
  fail(error: unknown): { status: "failed"; error: unknown } | { status: AudioRenderInterruption };
}

export interface AudioRenderLifecycle {
  activate(): void;
  start(): AudioRenderSession;
  cancel(): void;
  dispose(): void;
}

type SessionRecord = {
  interruption: AudioRenderInterruption | null;
  controller?: AbortController;
  prepared?: PreparedAudioRender<unknown>;
};

// Native render artifacts are process-wide cache files. Session identity must
// therefore remain unique across concurrent hooks, unmounts, and remounts.
let nextAudioRenderSessionId = 0;

function disposeQuietly<T>(dispose: (value: T) => void, value: T): void {
  try {
    dispose(value);
  } catch {
    // Resource cleanup is best-effort and must remain idempotent.
  }
}

export function createAudioRenderLifecycle(): AudioRenderLifecycle {
  let current: SessionRecord | null = null;
  let disposed = false;

  const interrupt = (reason: AudioRenderInterruption) => {
    const record = current;
    current = null;
    if (!record) return;
    record.interruption = reason;
    record.controller?.abort();
    record.prepared?.discard();
  };

  return {
    activate() {
      disposed = false;
    },
    start(): AudioRenderSession {
      const id = ++nextAudioRenderSessionId;
      if (disposed) {
        const record: SessionRecord = { interruption: "cancelled" };
        return createSession(record);
      }
      interrupt("superseded");
      const record: SessionRecord = {
        interruption: null,
        controller: typeof AbortController === "undefined"
          ? undefined
          : new AbortController(),
      };
      current = record;
      return createSession(record);

      function createSession(sessionRecord: SessionRecord): AudioRenderSession {
        const interruption = (): { status: AudioRenderInterruption } => ({
          status: sessionRecord.interruption ?? "superseded",
        });

        return {
          id,
          signal: sessionRecord.controller?.signal,
          isCurrent: () =>
            !disposed &&
            current === sessionRecord &&
            sessionRecord.interruption === null,
          interruption,
          complete<T>(value: T, disposeValue: (value: T) => void): AudioRenderResult<T> {
            if (
              disposed ||
              current !== sessionRecord ||
              sessionRecord.interruption !== null
            ) {
              disposeQuietly(disposeValue, value);
              return interruption();
            }

            let state: "prepared" | "committed" | "discarded" = "prepared";
            const prepared: PreparedAudioRender<T> = {
              value,
              commit(publish) {
                if (
                  state !== "prepared" ||
                  disposed ||
                  current !== sessionRecord ||
                  sessionRecord.interruption !== null
                ) {
                  if (state === "prepared") prepared.discard();
                  return false;
                }
                try {
                  publish(value);
                  state = "committed";
                  if (current === sessionRecord) current = null;
                  sessionRecord.prepared = undefined;
                  return true;
                } catch (error) {
                  prepared.discard();
                  throw error;
                }
              },
              discard() {
                if (state !== "prepared") return;
                state = "discarded";
                if (current === sessionRecord) current = null;
                sessionRecord.prepared = undefined;
                disposeQuietly(disposeValue, value);
              },
              fail(error) {
                if (
                  state !== "prepared" ||
                  disposed ||
                  current !== sessionRecord ||
                  sessionRecord.interruption !== null
                ) {
                  if (state === "prepared") prepared.discard();
                  return interruption();
                }
                state = "discarded";
                current = null;
                sessionRecord.prepared = undefined;
                disposeQuietly(disposeValue, value);
                return { status: "failed", error };
              },
            };
            sessionRecord.prepared = prepared as PreparedAudioRender<unknown>;
            return { status: "completed", prepared };
          },
          fail(error) {
            if (
              disposed ||
              current !== sessionRecord ||
              sessionRecord.interruption !== null
            ) {
              return interruption();
            }
            current = null;
            return { status: "failed", error };
          },
        };
      }
    },
    cancel() {
      interrupt("cancelled");
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      interrupt("cancelled");
    },
  };
}