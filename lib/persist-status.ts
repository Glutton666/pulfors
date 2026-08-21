import type { PersisterStatus } from "@/lib/persist";

export type PersistFailureBannerKey = "saveRetrying" | "saveFailedPending";

/**
 * Maps persistence status to the truthful warning copy shown in the UI.
 * A fully failed cycle waits for another settings change, so it must not claim
 * that a retry is currently in progress.
 */
export function getPersistFailureBannerKey(
  status: PersisterStatus,
): PersistFailureBannerKey | null {
  if (status.cycleFailed) return "saveFailedPending";
  if (status.consecutiveFailures > 0) return "saveRetrying";
  return null;
}

/** Combines independent persistence paths for the shared main-screen banner. */
export function combinePersisterStatuses(...statuses: PersisterStatus[]): PersisterStatus {
  return {
    lastSaveAt: statuses.reduce<number | null>(
      (latest, status) => Math.max(latest ?? 0, status.lastSaveAt ?? 0) || null,
      null,
    ),
    lastErrorAt: statuses.reduce<number | null>(
      (latest, status) => Math.max(latest ?? 0, status.lastErrorAt ?? 0) || null,
      null,
    ),
    consecutiveFailures: Math.max(0, ...statuses.map((status) => status.consecutiveFailures)),
    pendingChanges: statuses.reduce((total, status) => total + status.pendingChanges, 0),
    cycleFailed: statuses.some((status) => status.cycleFailed),
  };
}