export const SCHEDULED_PREPARE_LEAD_MS = 8000;

export function getScheduledPreparationDelay(delayMs: number): number {
  return Math.max(0, delayMs - SCHEDULED_PREPARE_LEAD_MS);
}