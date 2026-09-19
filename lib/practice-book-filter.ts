import type { PracticeEntry } from "@/lib/storage";

export type PracticeBookMode = "beat" | "bar" | "note" | "score";
export type PracticeBookFilter = "all" | PracticeBookMode;

export function isScorePracticeEntry(entry: PracticeEntry): boolean {
  return entry.mode === "score"
    || (!!entry.scoreId && (!entry.mode || entry.mode === "beat"));
}

export function matchesPracticeBookMode(
  entry: PracticeEntry,
  mode: PracticeBookMode,
): boolean {
  if (mode === "score") return isScorePracticeEntry(entry);
  if (mode === "beat") {
    return (!entry.mode || entry.mode === "beat") && !entry.scoreId;
  }
  return entry.mode === mode;
}

export function filterPracticeBookEntries(
  entries: PracticeEntry[],
  filter: PracticeBookFilter,
): PracticeEntry[] {
  return filter === "all"
    ? entries
    : entries.filter((entry) => matchesPracticeBookMode(entry, filter));
}