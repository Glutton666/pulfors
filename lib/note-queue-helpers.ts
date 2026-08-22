import type { PracticeEntry } from "@/lib/storage";

/**
 * Creates independent, persistence-safe snapshots for a saved Note-mode queue.
 * Explicit shallow copies keep later edits from mutating the saved queue entry.
 */
export function serializeNoteQueueEntries(queue: PracticeEntry[]): PracticeEntry[] {
  return queue.map((entry) => ({
    ...entry,
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