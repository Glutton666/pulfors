import type { PracticeEntry } from "@/lib/storage";

/** Legacy Beat entries often contain `barLoopMode: "once"`, but Beat is continuous. */
export function noteQueueEntryRepeats(entry: PracticeEntry): boolean {
  return entry.mode === "beat" || ((entry.mode ?? "bar") === "bar" && entry.barLoopMode === "loop");
}

/**
 * Creates independent, persistence-safe snapshots for a saved Note-mode queue.
 * Explicit shallow copies keep later edits from mutating the saved queue entry.
 */
export function serializeNoteQueueEntries(queue: PracticeEntry[]): PracticeEntry[] {
  return queue.map((entry) => ({
    ...entry,
    ...(entry.mode === "beat" ? { barLoopMode: "loop" as const } : {}),
    beatTypes: [...entry.beatTypes],
    beatSubdivisions: { ...entry.beatSubdivisions },
    barRepeats: { ...entry.barRepeats },
    subdivisionPattern: [...entry.subdivisionPattern],
    noteSamples: entry.noteSamples ? { ...entry.noteSamples } : undefined,
    noteSampleNames: entry.noteSampleNames ? { ...entry.noteSampleNames } : undefined,
    noteSampleSources: entry.noteSampleSources ? { ...entry.noteSampleSources } : undefined,
    noteSampleChannels: entry.noteSampleChannels ? { ...entry.noteSampleChannels } : undefined,
    noteSampleVolumes: entry.noteSampleVolumes ? { ...entry.noteSampleVolumes } : undefined,
    loopBlocks: entry.loopBlocks ? [...entry.loopBlocks] : undefined,
  }));
}