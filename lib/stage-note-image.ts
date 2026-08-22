import type { PracticeEntry } from "@/lib/storage";

/**
 * Stage mode only renders image URIs that can refer to locally-owned media.
 * This mirrors the import sanitizers without making the UI depend on the
 * backup implementation (and keeps malformed persisted data harmless).
 */
export function isStageImageUri(uri: unknown): uri is string {
  if (typeof uri !== "string" || uri.trim().length === 0) return false;
  const raw = uri.split("#")[0] ?? "";
  return (
    raw.startsWith("file://") ||
    raw.startsWith("asset://") ||
    raw.startsWith("blob:") ||
    raw.startsWith("data:")
  );
}

/**
 * Resolve the image shown for a note entry in Stage mode.
 *
 * A photo attached to the parent entry remains authoritative for backwards
 * compatibility. When there is no parent photo, use the photo attached to
 * the currently playing queue child.
 */
export function getStageNoteImageUri(
  entry: PracticeEntry | null | undefined,
  currentIndex: number,
): string | undefined {
  if (!entry || entry.mode !== "note") return undefined;

  if (isStageImageUri(entry.imageUri)) return entry.imageUri;

  const queue = entry.noteQueueEntries;
  if (!queue || queue.length === 0) return undefined;
  // A stage item can be selected before Note mode has initialized its
  // playback index. In that state, show the first queue photo. Also reset to
  // the first item when a stale index from a previous queue is out of range;
  // this can happen while switching stage items without interrupting playback.
  const queueIndex = Number.isInteger(currentIndex) && currentIndex >= 0 && currentIndex < queue.length
    ? currentIndex
    : 0;
  const child = queue[queueIndex];
  return isStageImageUri(child?.imageUri) ? child.imageUri : undefined;
}