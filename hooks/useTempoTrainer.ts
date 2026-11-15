import { useEffect, useRef } from "react";
import { steppedTrainerBpm, type TempoTrainerBindings } from "@/lib/tempo-trainer";

interface Options {
  trainer?: TempoTrainerBindings;
  running: boolean;
  isPlaying: boolean;
  reset: boolean;
  /** Absolute end of a countdown timer; stopwatch has no deadline. */
  endsAt?: number;
}

/**
 * Counts main-beat callbacks, never rendered UI beat indices/subdivisions.
 * Changes run outside the engine callback to avoid mutating its schedule mid-tick.
 */
export function useTempoTrainer(options: Options): void {
  const latest = useRef(options);
  latest.current = options;
  const elapsedRef = useRef(0);
  const startedAtRef = useRef<number | null>(null);
  const appliedTimeStepsRef = useRef(0);
  const beatsRef = useRef(0);
  const firstBeatRef = useRef(true);
  const pendingStepsRef = useRef(0);
  const pendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generationRef = useRef(0);
  const config = options.trainer?.config;
  const active = !!config?.enabled && options.running && options.isPlaying;
  const subscribeBeat = options.trainer?.subscribeBeat;

  useEffect(() => {
    elapsedRef.current = 0;
    appliedTimeStepsRef.current = 0;
    beatsRef.current = 0;
    firstBeatRef.current = true;
    const current = latest.current;
    startedAtRef.current = current.trainer?.config.enabled && current.running && current.isPlaying
      ? Date.now() : null;
    // Config edits and reset start a new progress interval, not a new BPM.
  }, [config, options.reset]);

  useEffect(() => {
    if (active) {
      startedAtRef.current = Date.now();
    } else if (startedAtRef.current !== null) {
      elapsedRef.current += Math.max(0, Date.now() - startedAtRef.current);
      startedAtRef.current = null;
    }
  }, [active]);

  useEffect(() => {
    // A new engine run starts with a beat at time zero, not one elapsed beat.
    firstBeatRef.current = true;
  }, [options.running]);

  useEffect(() => {
    const generation = ++generationRef.current;
    const queueChange = (steps: number) => {
      pendingStepsRef.current += steps;
      if (pendingRef.current !== null) return;
      pendingRef.current = setTimeout(() => {
        pendingRef.current = null;
        const count = pendingStepsRef.current;
        pendingStepsRef.current = 0;
        const current = latest.current;
        const binding = current.trainer;
        if (generation !== generationRef.current || !binding?.config.enabled ||
            !current.running || !current.isPlaying ||
            (current.endsAt !== undefined && Date.now() >= current.endsAt)) return;
        const before = binding.getBpm();
        const next = steppedTrainerBpm(before, binding.config.bpmDelta, count);
        if (next === before) return;
        binding.changeBpm(next);
        if (next > before && binding.config.accentOnIncrease) binding.playAccent();
      }, 0);
    };
    const unsubscribe = subscribeBeat?.(() => {
      const current = latest.current;
      const rule = current.trainer?.config;
      if (!rule?.enabled || !current.running || rule.basis !== "beats" ||
          (current.endsAt !== undefined && Date.now() >= current.endsAt)) return;
      if (firstBeatRef.current) {
        firstBeatRef.current = false;
        return;
      }
      beatsRef.current += 1;
      if (beatsRef.current >= rule.intervalBeats) {
        const steps = Math.floor(beatsRef.current / rule.intervalBeats);
        beatsRef.current %= rule.intervalBeats;
        queueChange(steps);
      }
    });
    const interval = setInterval(() => {
      const current = latest.current;
      const rule = current.trainer?.config;
      if (!rule?.enabled || !current.running || !current.isPlaying ||
          rule.basis !== "time" || startedAtRef.current === null ||
          (current.endsAt !== undefined && Date.now() >= current.endsAt)) return;
      const elapsed = elapsedRef.current + Math.max(0, Date.now() - startedAtRef.current);
      const totalSteps = Math.floor(elapsed / (rule.intervalSeconds * 1000));
      const due = totalSteps - appliedTimeStepsRef.current;
      if (due > 0) {
        appliedTimeStepsRef.current = totalSteps;
        queueChange(due);
      }
    }, 100);
    return () => {
      generationRef.current += 1;
      clearInterval(interval);
      unsubscribe?.();
      if (pendingRef.current !== null) clearTimeout(pendingRef.current);
      pendingRef.current = null;
      pendingStepsRef.current = 0;
    };
  }, [subscribeBeat, config, options.running, options.isPlaying, options.reset]);
}
