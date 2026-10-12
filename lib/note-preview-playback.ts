import { safePlayAndConfirm } from "./audio-utils";

type PreviewPlayer = {
  pause(): void;
  replace(source: { uri: string }): void;
  isLoaded: boolean;
  duration: number;
  playing?: boolean;
  currentTime?: number;
  seekTo(seconds: number): void | Promise<void>;
  play(): void | Promise<void>;
};

/** Preparation only; callers own volume, clocks and cancellation cleanup. */
const pending = new WeakMap<PreviewPlayer, Promise<unknown>>();
export function startNotePreview(
  player: PreviewPlayer, uri: string, start: number, cancelled: () => boolean,
  configure?: () => void,
): Promise<boolean> {
  // A late seek from an earlier request must finish before replacing its source.
  const run = (pending.get(player) ?? Promise.resolve()).catch(() => {}).then(() =>
    preparePreview(player, uri, start, cancelled, configure));
  pending.set(player, run);
  return run;
}

async function preparePreview(
  player: PreviewPlayer, uri: string, start: number, cancelled: () => boolean, configure?: () => void,
): Promise<boolean> {
  if (cancelled()) return false;
  player.pause();
  player.replace({ uri });
  const deadline = Date.now() + 3000;
  while (!player.isLoaded || !Number.isFinite(player.duration) || player.duration <= 0) {
    if (cancelled()) return false;
    if (Date.now() >= deadline) throw new Error("previewLoad");
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  if (cancelled()) return false;
  configure?.();
  if (!Number.isFinite(start) || start < 0 || start >= player.duration) throw new Error("previewSeek");
  try { await player.seekTo(start); } catch { throw new Error("previewSeek"); }
  if (cancelled()) return false;
  if (!await safePlayAndConfirm(player, "noteRecorder.preview")) throw new Error("previewPlay");
  const startedBy = Date.now() + 1500;
  // Accepted requests can still be suppressed by focus/output. Progress also
  // catches a short sample that finished before the next status observation.
  while (player.playing === false && (player.currentTime ?? start) <= start + 0.01) {
    if (cancelled()) return false;
    if (Date.now() >= startedBy) throw new Error("previewPlay");
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  return !cancelled();
}
