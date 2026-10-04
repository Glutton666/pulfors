import type { PlaybackVisual } from "./playback-visual";

/** Latest-only mailbox: subscribers are small playback displays, not the screen. */
export function createPlaybackVisualStore() {
  let value: PlaybackVisual | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => value,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    publish: (next: PlaybackVisual | null) => {
      const changed = next?.pulseId !== value?.pulseId || next?.type !== value?.type || next?.intervalMs !== value?.intervalMs;
      if (!changed) return;
      value = next;
      for (const listener of listeners) listener();
    },
  };
}

export type PlaybackVisualStore = ReturnType<typeof createPlaybackVisualStore>;