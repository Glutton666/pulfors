import { notationSpelling } from "./notation";
import type { Fraction, NotationEvent, RhythmDocument } from "./types";

export const EPS = 1e-7;
export const num = (f: Fraction) => f.n / f.d;
export function invalidTiePieces(events: NotationEvent[]): NotationEvent[] {
  const chains = new Map<string, NotationEvent[]>();
  for (const event of events) if (event.tie)
    chains.set(event.tie.id, [...(chains.get(event.tie.id) ?? []), event]);
  return [...chains.values()].flatMap((chain) => {
    const sorted = [...chain].sort((a, b) => a.tie!.part - b.tie!.part);
    const root = sorted[0], count = root.tie!.count;
    const invalid = !Number.isInteger(count) || count < 2 || sorted.length !== count ||
      sorted.some((piece, part) => piece.kind !== "note" || piece.tie!.part !== part ||
        piece.tie!.count !== count || piece.voiceId !== root.voiceId || piece.drum !== root.drum ||
        JSON.stringify(piece.hitIds) !== JSON.stringify(root.hitIds) ||
        JSON.stringify(piece.midi) !== JSON.stringify(root.midi) ||
        part > 0 && Math.abs(num(sorted[part - 1].startQ) + notationSpelling(sorted[part - 1]).durationQ - num(piece.startQ)) > EPS);
    return invalid ? sorted : [];
  });
}
const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : Math.abs(a);
/** Continued fractions retain exact musical ratios, including sevenths. */
export function musicalTime(value: number): Fraction {
  let x = value, p0 = 0, p1 = 1, q0 = 1, q1 = 0;
  for (let i = 0; i < 24; i++) {
    const a = Math.floor(x), p = a * p1 + p0, q = a * q1 + q0;
    if (q > 1e9) break;
    p0 = p1; p1 = p; q0 = q1; q1 = q;
    if (Math.abs(p / q - value) < 1e-10 || Math.abs(x - a) < 1e-12) break;
    x = 1 / (x - a);
  }
  return { n: p1, d: q1 || 1 };
}
export type Ratio = { actual: number; normal: number };
export const gridRatio = (grid: number): Ratio | undefined => {
  if ((grid & (grid - 1)) === 0) return undefined;
  const binary = 2 ** Math.floor(Math.log2(grid)), g = gcd(grid, binary);
  return { actual: grid / g, normal: binary / g };
};
const values = [1, 2, 4, 8, 16, 32, 64, 128];
export function spellLength(length: number, ratio?: Ratio) {
  const factor = ratio ? ratio.normal / ratio.actual : 1;
  const choices = values.flatMap((value) => [false, true].map((dotted) => ({
    value, duration: 4 / value * factor * (dotted ? 1.5 : 1),
  }))).filter((item) => item.duration <= length + EPS).sort((a, b) => b.duration - a.duration);
  return choices[0];
}
export function attachTuplet(ratio: Ratio | undefined, at: number, value: number): NotationEvent["tuplet"] {
  if (!ratio) return undefined;
  const span = 4 / value * ratio.normal;
  const from = Math.floor((at + EPS) / span) * span;
  return { ...ratio, groupId: `auto-${ratio.actual}-${ratio.normal}-${musicalTime(from).n}/${musicalTime(from).d}-${span}`,
    startQ: musicalTime(from), endQ: musicalTime(from + span) };
}

function exactFragment(length: number, original?: NotationEvent["tuplet"]) {
  const layers = original?.layers ?? (original ? [{ actual: original.actual, normal: original.normal }] : []);
  const factor = layers.reduce((r, layer) => r * layer.normal / layer.actual, 1);
  const choices = values.map((value) => {
    const ratio = musicalTime(length / (4 / value) / factor);
    const actual = ratio.d === 1 ? 2 : ratio.d, normal = ratio.d === 1 ? ratio.n * 2 : ratio.n;
    return { value, actual, normal, score: Math.abs(Math.log2(normal / actual)) + (actual + normal) * 0.001 };
  }).filter((item) => item.actual <= 128 && item.normal > 0 && item.normal <= 128).sort((a, b) => a.score - b.score);
  const best = choices[0];
  if (!best) throw new Error("Unrepresentable bar fragment");
  const ratio = { actual: best.actual, normal: best.normal };
  return { value: best.value, tuplet: original ? { ...original, layers: [...layers, ratio] } : ratio };
}

/** Split logical notes at barlines and at representable glyph lengths.
 * The original event ID remains the attack ID, so legacy references survive. */
export function splitNote(event: NotationEvent, capacity: number): NotationEvent[] {
  const from = num(event.startQ), end = from + num(event.durationQ);
  const result: NotationEvent[] = [];
  let at = from;
  while (at < end - EPS) {
    if (result.length >= 32768) throw new Error("Note duration exceeds notation limits");
    const barEnd = (Math.floor((at + EPS) / capacity) + 1) * capacity;
    const remaining = Math.min(end, barEnd) - at;
    // Retain valid user glyphs (including nested ratios) when no split is needed.
    if (!result.length && end <= barEnd + EPS && notationSpelling(event).supported)
      return [{ ...event, measureIndex: Math.floor((at + EPS) / capacity) }];
    const ratio = event.tuplet;
    const layerFactor = ratio?.layers?.reduce((r, layer) => r * layer.normal / layer.actual, 1);
    const effective = layerFactor ? musicalTime(layerFactor) : undefined;
    const factor = layerFactor ?? (ratio ? ratio.normal / ratio.actual : 1);
    const denominator = musicalTime(remaining / factor).d;
    const exact = (denominator & (denominator - 1)) !== 0
      ? exactFragment(remaining, event.tuplet) : undefined;
    const spelling = exact ? { value: exact.value, duration: remaining } : spellLength(remaining, effective ? { actual: effective.d, normal: effective.n } : ratio);
    if (!spelling) throw new Error("Duration is shorter than the supported notation resolution");
    result.push({ ...event, id: result.length ? `${event.id}~${result.length}` : event.id,
      startQ: musicalTime(at), durationQ: musicalTime(spelling.duration), value: spelling.value,
      measureIndex: Math.floor((at + EPS) / capacity), ...(exact ? { tuplet: exact.tuplet } : {}) });
    at += spelling.duration;
  }
  if (result.length > 1) result.forEach((piece, part) => { piece.tie = { id: event.tie?.id ?? `tie-${event.id}`, part, count: result.length }; });
  return result;
}

/** Global silence is the complement of sounding voices, not one rest per key. */
export function fillRests(doc: RhythmDocument, notes: NotationEvent[], measures = 1): NotationEvent[] {
  const capacity = doc.meter.numerator * 4 / doc.meter.denominator;
  const count = Math.max(measures, 1, ...notes.map((e) => Math.ceil((num(e.startQ) + num(e.durationQ) - EPS) / capacity)));
  if (count > 4096) throw new Error("A rhythm take is limited to 4,096 measures");
  const result = [...notes];
  const hints = notes.filter((e) => e.tuplet?.startQ && e.tuplet.endQ);
  const intervalsByMeasure = new Map<number, number[][]>();
  const hintsByMeasure = new Map<number, NotationEvent[]>();
  for (const event of notes) {
    const start = num(event.startQ), end = start + num(event.durationQ);
    for (let m = Math.max(0, Math.floor(start / capacity)); m < count && m * capacity < end - EPS; m++) {
      const a = Math.max(m * capacity, start), b = Math.min((m + 1) * capacity, end);
      if (b > a + EPS) {
        const list = intervalsByMeasure.get(m) ?? [];
        list.push([a, b]); intervalsByMeasure.set(m, list);
      }
    }
  }
  for (const hint of hints) {
    const start = num(hint.tuplet!.startQ!), end = num(hint.tuplet!.endQ!);
    for (let m = Math.max(0, Math.floor(start / capacity)); m < count && m * capacity < end - EPS; m++) {
      const list = hintsByMeasure.get(m) ?? [];
      list.push(hint); hintsByMeasure.set(m, list);
    }
  }
  for (let m = 0; m < count; m++) {
    const end = (m + 1) * capacity;
    const intervals = (intervalsByMeasure.get(m) ?? []).sort((a, b) => a[0] - b[0]);
    let cursor = m * capacity;
    for (const [a, b] of [...intervals, [end, end]]) {
      let at = cursor;
      while (at < a - EPS) {
        const hint = hintsByMeasure.get(m)?.find((e) => at >= num(e.tuplet!.startQ!) - EPS && at < num(e.tuplet!.endQ!) - EPS)?.tuplet;
        let ordinaryEnd = Math.floor(at + EPS) + 1;
        if (doc.automaticCorrection && !hint) {
          // Consolidate complete metrical units, never erase a short silence
          // or stretch a percussion note to occupy it.
          const from = m * capacity;
          const wholeBar = Math.abs(at - from) < EPS && a >= end - EPS;
          const wholeSpelling = wholeBar ? spellLength(capacity) : undefined;
          const unit = doc.meter.denominator === 8 && doc.meter.numerator > 3 &&
            doc.meter.numerator % 3 === 0 ? 1.5 : 1;
          const aligned = [unit * 4, unit * 2, unit].find((size) =>
            Math.abs((at - from) / size - Math.round((at - from) / size)) < EPS &&
            at + size <= Math.min(a, end) + EPS);
          if (wholeSpelling && Math.abs(wholeSpelling.duration - capacity) < EPS) ordinaryEnd = end;
          else if (aligned) ordinaryEnd = at + aligned;
        }
        const boundary = Math.min(a, ordinaryEnd, hint?.endQ ? num(hint.endQ) : Infinity);
        const length = boundary - at;
        let spelling = spellLength(length, hint);
        if (!spelling) {
          // A cross-family residual: use its exact rational spelling, never
          // a fabricated binary duration which fails independent decoding.
          const ratio = musicalTime(length / (4 / 128));
          if (ratio.d > 128 || ratio.n > 128) throw new Error("Unrepresentable rest");
          spelling = { value: 128, duration: length };
          result.push({ id: `rest-${m}-${at}`, kind: "rest", hitIds: [], value: 128,
            startQ: musicalTime(at), durationQ: musicalTime(length), measureIndex: m,
            tuplet: { actual: ratio.d, normal: ratio.n, groupId: `residual-${at}` } });
        } else result.push({ id: `rest-${m}-${at}`, kind: "rest", hitIds: [], value: spelling.value,
          startQ: musicalTime(at), durationQ: musicalTime(spelling.duration), measureIndex: m, ...(hint ? { tuplet: hint } : {}) });
        at += spelling.duration;
      }
      cursor = Math.max(cursor, b);
    }
  }
  return result.sort((a, b) => num(a.startQ) - num(b.startQ) || (a.kind === b.kind ? 0 : a.kind === "rest" ? 1 : -1));
}
