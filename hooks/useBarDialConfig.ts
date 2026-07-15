import { useRef } from "react";
import {
  createInitialBarConfig,
  createInitialDialConfig,
  type BarConfig,
  type DialConfig,
} from "@/app/index.helpers";

/**
 * Owns the bar mode configuration ref. The ref is the source of truth for the
 * current bar setup (beats / subdivisions / loop blocks / clock / sample maps)
 * and survives mode swaps in `handleBarModeChange`.
 *
 * Kept as a thin hook for now so the ref has a single registration point and
 * future bar-only state (e.g. queued bars) can move here without touching
 * call sites.
 */
export function useBarConfig(initialBeats = 4): {
  barConfigRef: React.MutableRefObject<BarConfig>;
} {
  const barConfigRef = useRef<BarConfig>(createInitialBarConfig(initialBeats));
  return { barConfigRef };
}

/**
 * Owns the dial (beat) mode configuration ref. Mirrors `useBarConfig` for the
 * dial-side state captured during mode swaps.
 */
export function useDialConfig(initialBeats = 4): {
  dialConfigRef: React.MutableRefObject<DialConfig>;
} {
  const dialConfigRef = useRef<DialConfig>(createInitialDialConfig(initialBeats));
  return { dialConfigRef };
}
