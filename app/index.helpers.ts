/**
 * Re-export shell — keeps all existing `@/app/index.helpers` import paths working.
 * Implementation has been split into focused modules:
 *   - app/meter-helpers.ts       — beat/meter math, stats, URI safety
 *   - app/bar-config-helpers.ts  — config types/factories, queue/shuffle, bar selector
 *   - app/practice-entry-helpers.ts — PracticeEntry → engine/state conversion
 */
export * from "./meter-helpers";
export * from "./bar-config-helpers";
export * from "./practice-entry-helpers";
