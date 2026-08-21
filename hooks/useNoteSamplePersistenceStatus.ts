import { useEffect, useState } from "react";
import { subscribeNoteSamplePersistenceStatus } from "@/lib/note-samples";
import type { PersisterStatus } from "@/lib/persist";

const INITIAL_STATUS: PersisterStatus = {
  lastSaveAt: null,
  lastErrorAt: null,
  consecutiveFailures: 0,
  pendingChanges: 0,
  cycleFailed: false,
};

function statusesMatch(left: PersisterStatus, right: PersisterStatus): boolean {
  return left.lastSaveAt === right.lastSaveAt
    && left.lastErrorAt === right.lastErrorAt
    && left.consecutiveFailures === right.consecutiveFailures
    && left.pendingChanges === right.pendingChanges
    && left.cycleFailed === right.cycleFailed;
}

/** Makes background note-sample save failures visible to the main screen. */
export function useNoteSamplePersistenceStatus(): PersisterStatus {
  const [status, setStatus] = useState<PersisterStatus>(INITIAL_STATUS);

  useEffect(() => {
    return subscribeNoteSamplePersistenceStatus((next) => {
      setStatus((previous) => (statusesMatch(previous, next) ? previous : next));
    });
  }, []);

  return status;
}