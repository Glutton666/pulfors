import type { PracticeEntry } from "@/lib/storage";

export function isNoteSourceEntry(entry: PracticeEntry): boolean {
  return getNoteSourceMode(entry) !== null;
}

export function getNoteSourceMode(
  entry: PracticeEntry,
): "beat" | "bar" | "score" | null {
  const mode = entry.mode || "bar";
  return mode === "bar" || mode === "beat" || mode === "score" ? mode : null;
}

export function reconcileNoteSources(
  selected: PracticeEntry[],
  available: PracticeEntry[],
): PracticeEntry[] {
  const availableById = new Map(
    available.filter(isNoteSourceEntry).map((entry) => [entry.id, entry]),
  );
  const seen = new Set<string>();

  return selected.flatMap((entry) => {
    if (seen.has(entry.id)) return [];
    const latest = availableById.get(entry.id);
    if (!latest) return [];
    seen.add(entry.id);
    return [latest];
  });
}