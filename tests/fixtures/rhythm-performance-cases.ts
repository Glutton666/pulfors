import { createRhythmDocument } from "../../lib/rhythm-lab/engine";
import type { RhythmDocument } from "../../lib/rhythm-lab/types";

/** Deterministic boundary, jitter, polyphony and release fixtures. */
export function rhythmPerformanceCases(): RhythmDocument[] {
  return [0, 1, 2, 3, 4, 5].map((seed) => ({
    ...createRhythmDocument({ bpm: 120, meter: seed === 4
      ? { numerator: 7, denominator: 8 } : { numerator: 4, denominator: 4 } }),
    hits: Array.from({ length: 48 }, (_, i) => {
      const onsetMs = seed === 3 ? Math.floor(i / 3) * 250
        : Math.max(0, i * 125 + (seed < 2 ? [0, 9, -6, 15, -3][(i + seed) % 5] : 0));
      return { id: `h${i}`, onsetMs, releaseMs: onsetMs + (seed === 3 ? (i < 3 ? 5000 : 250)
        : seed >= 2 ? [125, 5000, 250, 500][i % 4] : 20),
        ...(seed >= 2 ? { midi: 60 + i % 4 } : { drum: "snare" as const }) };
    }).reverse(),
    overrides: seed === 5 ? [
      { id: "accent", kind: "accent" as const, hitIds: ["h2"] },
      { id: "grace", kind: "flam" as const, hitIds: ["h0", "h1"], primaryHitId: "h1" },
    ] : [],
  }));
}
