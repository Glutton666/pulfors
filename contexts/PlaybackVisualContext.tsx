import { createContext, useContext, useSyncExternalStore } from "react";
import type { PlaybackVisualStore } from "@/lib/playback-visual-store";

export const PlaybackVisualContext = createContext<PlaybackVisualStore | null>(null);
const emptySnapshot = () => null;
const emptySubscribe = () => () => {};

/** Standalone components/tests retain their explicit props when no store exists. */
export function usePlaybackVisual(enabled: boolean) {
  const context = useContext(PlaybackVisualContext);
  const store = enabled ? context : null;
  return useSyncExternalStore(store?.subscribe ?? emptySubscribe, store?.getSnapshot ?? emptySnapshot, emptySnapshot);
}