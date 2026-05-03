import { useRef } from "react";
import { MetronomeEngine } from "@/lib/metronome-engine";

/**
 * Owns the MetronomeEngine instance ref. The engine itself is constructed in
 * the consumer's setup effect (it needs many caller-side closures for audio
 * callbacks); this hook centralizes the ref registration so future engine
 * lifecycle work (recreation, hot-swap, teardown) has a single home.
 */
export function useMetronomeEngine(): {
  engineRef: React.MutableRefObject<MetronomeEngine | null>;
} {
  const engineRef = useRef<MetronomeEngine | null>(null);
  return { engineRef };
}
