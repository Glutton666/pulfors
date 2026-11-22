import type { PracticeEntry } from "@/lib/storage";
import { captureBreadcrumb } from "@/lib/error-tracking";

/** Legacy Beat entries often contain `barLoopMode: "once"`, but Beat is continuous. */
export function noteQueueEntryRepeats(entry: PracticeEntry): boolean {
  return entry.mode === "beat" || ((entry.mode ?? "bar") === "bar" && entry.barLoopMode === "loop");
}

/** Warm the next known item without changing the current audio owner or sample map. */
export function warmNextNoteQueueEntry(
  queue: PracticeEntry[], index: number, mode: "once" | "loop" | "random", shuffledNext: number | undefined,
  warm: (samples: Record<string, string>) => Promise<unknown>, isCurrent: () => boolean,
) {
  const next = mode === "random" ? shuffledNext ?? -1 : mode === "loop" ? (index + 1) % queue.length : index + 1;
  const samples = queue[next]?.noteSamples;
  if (!samples || !Object.keys(samples).length) return;
  void warm(samples).catch((error) => {
    if (isCurrent()) captureBreadcrumb({
      category: "sample.preload", message: "Next Note queue PCM warm-up failed",
      level: "warning", data: { error: String(error) },
    });
  });
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
    noteVideo: entry.noteVideo ? { ...entry.noteVideo, source: { ...entry.noteVideo.source } } : undefined,
    noteSamples: entry.noteSamples ? { ...entry.noteSamples } : undefined,
    noteSampleNames: entry.noteSampleNames ? { ...entry.noteSampleNames } : undefined,
    noteSampleSources: entry.noteSampleSources ? { ...entry.noteSampleSources } : undefined,
    noteSampleChannels: entry.noteSampleChannels ? { ...entry.noteSampleChannels } : undefined,
    noteSampleVolumes: entry.noteSampleVolumes ? { ...entry.noteSampleVolumes } : undefined,
    loopBlocks: entry.loopBlocks ? [...entry.loopBlocks] : undefined,
  }));
}