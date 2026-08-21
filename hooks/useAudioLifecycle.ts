import { useSyncExternalStore } from "react";
import {
  getAudioLifecycleSnapshot,
  subscribeAudioLifecycle,
} from "@/lib/audio-lifecycle";

/** React view of the lifecycle shared by session, watchdog, and playback control. */
export function useAudioLifecycle() {
  return useSyncExternalStore(
    subscribeAudioLifecycle,
    getAudioLifecycleSnapshot,
    getAudioLifecycleSnapshot,
  );
}