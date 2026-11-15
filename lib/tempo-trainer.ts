export interface TempoTrainerConfig {
  enabled: boolean;
  basis: "time" | "beats";
  intervalSeconds: number;
  intervalBeats: number;
  bpmDelta: number;
  accentOnIncrease: boolean;
}

export interface TempoTrainerBindings {
  config: TempoTrainerConfig;
  onConfigChange: (config: TempoTrainerConfig) => void;
  getBpm: () => number;
  changeBpm: (bpm: number) => void;
  playAccent: () => void;
  subscribeBeat: (listener: () => void) => () => void;
}

export const DEFAULT_TEMPO_TRAINER: TempoTrainerConfig = {
  enabled: false,
  basis: "time",
  intervalSeconds: 30,
  intervalBeats: 16,
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
    basis: config.basis === "beats" ? "beats" : "time",
    intervalSeconds: integer(config.intervalSeconds, 30, 1, 5999),
    intervalBeats: integer(config.intervalBeats, 16, 1, 9999),
    bpmDelta: delta === 0 ? 1 : delta,
    accentOnIncrease: typeof config.accentOnIncrease === "boolean"
      ? config.accentOnIncrease : DEFAULT_TEMPO_TRAINER.accentOnIncrease,
  };
}

export function steppedTrainerBpm(bpm: number, delta: number, steps = 1): number {
  return Math.min(300, Math.max(20, Math.round(bpm + delta * steps)));
}
