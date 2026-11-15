export interface TempoTrainerConfig {
  enabled: boolean;
  basis: "time" | "measures";
  intervalSeconds: number;
  intervalMeasures: number;
  bpmDelta: number;
  accentOnIncrease: boolean;
}

export interface TempoTrainerBindings {
  config: TempoTrainerConfig;
  onConfigChange: (config: TempoTrainerConfig) => void;
  setActivity: (owner: object, activity: TrainerActivity | null) => void;
}

export interface TrainerActivity {
  running: boolean;
  reset: boolean;
  endsAt?: number;
}

export const DEFAULT_TEMPO_TRAINER: TempoTrainerConfig = {
  enabled: false,
  basis: "time",
  intervalSeconds: 30,
  intervalMeasures: 4,
  bpmDelta: 2,
  accentOnIncrease: true,
};

export function normalizeTempoTrainer(value: unknown): TempoTrainerConfig {
  const config = value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Partial<TempoTrainerConfig> : {};
  const integer = (value: unknown, fallback: number, min: number, max: number) =>
    typeof value === "number" && Number.isFinite(value)
      ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
  const delta = integer(config.bpmDelta, 2, -50, 50);
  return {
    enabled: config.enabled === true,
    // A legacy beat-count rule must not silently become N measures.
    // Migrate to the new four-measure default, independent of current meter.
    basis: config.basis === "measures" || (config as { basis?: string }).basis === "beats" ? "measures" : "time",
    intervalSeconds: integer(config.intervalSeconds, 30, 1, 5999),
    intervalMeasures: integer(config.intervalMeasures, 4, 1, 9999),
    bpmDelta: delta === 0 ? 1 : delta,
    accentOnIncrease: typeof config.accentOnIncrease === "boolean"
      ? config.accentOnIncrease : DEFAULT_TEMPO_TRAINER.accentOnIncrease,
  };
}

export function steppedTrainerBpm(bpm: number, delta: number, steps = 1): number {
  return Math.min(300, Math.max(20, Math.round(bpm + delta * steps)));
}
