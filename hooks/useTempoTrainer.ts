import { useEffect, useRef } from "react";
import type { TempoTrainerBindings } from "@/lib/tempo-trainer";

interface Options {
  trainer?: TempoTrainerBindings;
  running: boolean;
  isPlaying: boolean;
  reset: boolean;
  endsAt?: number;
}

/** UI owns activity only. Counting, tempo changes and clicks belong to output. */
export function useTempoTrainer(options: Options): void {
  const owner = useRef({});
  const setActivity = options.trainer?.setActivity;
  useEffect(() => {
    setActivity?.(owner.current, {
      running: !!options.trainer?.config.enabled && options.running && options.isPlaying,
      reset: options.reset,
      endsAt: options.endsAt,
    });
  }, [setActivity, options.trainer?.config, options.running, options.isPlaying, options.reset, options.endsAt]);
  useEffect(() => {
    const token = owner.current;
    return () => setActivity?.(token, null);
  }, [setActivity]);
}
