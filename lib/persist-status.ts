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