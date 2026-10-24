import type { NotationEvent } from "./types";

/** The renderer and verifier must agree on the glyph's duration. Never
 * substitute an arbitrary durationQ for a glyph that cannot express it. */
export function notationSpelling(event: NotationEvent) {
  const value = event.value;
  const ordinary = [1, 2, 4, 8, 16, 32, 64, 128].includes(value);
  const ratio = event.tuplet ? event.tuplet.normal / event.tuplet.actual : 1;
  const baseQ = 4 / value * ratio;
  const storedQ = event.durationQ.n / event.durationQ.d;
  const dotted = Math.abs(storedQ - baseQ * 1.5) < 0.00003;
  const durationQ = baseQ * (dotted ? 1.5 : 1);
  return {
    value, dotted, durationQ,
    supported: ordinary && Number.isFinite(durationQ) && durationQ > 0 &&
      Math.abs(durationQ - storedQ) < 0.00003,
  };
}
