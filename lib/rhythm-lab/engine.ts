import type {
  Fraction, Hit, Interpretation, InterpretationCandidate, InterpretationOverride,
  Meter, NotationEvent, PlaybackHit, RhythmDocument, TupletSpan,
} from "./types";
import { notationSpelling } from "./notation";

let serial = 0;
export const newRhythmId = (prefix = "rh") => `${prefix}-${Date.now().toString(36)}-${(++serial).toString(36)}`;
const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : Math.abs(a);
export function fraction(n: number, d = 1): Fraction {
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) throw new Error("Invalid musical time");
  const sign = d < 0 ? -1 : 1;
  // Input clocks are floating point; musical storage uses bounded rational values.
  if (!Number.isInteger(n) || !Number.isInteger(d)) return fraction(Math.round(n / d * 96000), 96000);
  const g = gcd(n, d) || 1;
  return { n: sign * n / g, d: sign * d / g };
}
export const toNumber = (f: Fraction): number => f.n / f.d;
const qFraction = (q: number) => fraction(Math.round(q * 96000), 96000);
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
export const measureQuarters = (meter: Meter) => meter.numerator * 4 / meter.denominator;
const grids = [4, 8, 12, 16, 20, 24, 28, 32, 40, 48, 56, 64, 80, 96, 112, 128];
const addFraction = (a: Fraction, b: Fraction) => fraction(a.n * b.d + b.n * a.d, a.d * b.d);
const scaleFraction = (a: Fraction, n: number, d: number) => fraction(a.n * n, a.d * d);

export function createRhythmDocument(options: { title?: string; bpm?: number; meter?: Meter } = {}): RhythmDocument {
  const now = Date.now();
  return {
    version: 1, id: newRhythmId(), title: options.title ?? "",
    bpm: clamp(options.bpm ?? 120, 20, 300),
    meter: options.meter ?? { numerator: 4, denominator: 4 },
    createdAt: now, updatedAt: now, hits: [], overrides: [], tuplets: [], symbols: [],
    simplification: 0.35, offsetMs: 0,
  };
}

/** Display duration and tuplet ratio; 24 is a 16th-note triplet, not a new glyph. */
export function describeDuration(q: number): Pick<NotationEvent, "value" | "tuplet"> {
  const effectiveDenominator = 4 / q;
  const ordinary = [1, 2, 4, 8, 16, 32, 64, 128];
  const exact = ordinary.find((d) => Math.abs(d - effectiveDenominator) < 0.001);
  if (exact) return { value: exact };
  // A dotted value is still an ordinary glyph, not an exotic tuplet.
  const dotted = ordinary.find((d) => Math.abs(q - 4 / d * 1.5) < 1e-7);
  if (dotted) return { value: dotted };
  const triplet = ordinary.find((d) => Math.abs(d * 1.5 - effectiveDenominator) < 0.001);
  if (triplet) return { value: triplet, tuplet: { actual: 3, normal: 2 } };
  if (Number.isInteger(Math.round(effectiveDenominator)) && Math.abs(effectiveDenominator - Math.round(effectiveDenominator)) < 0.001) {
    const value = ordinary.filter((v) => v < effectiveDenominator).pop();
    if (value) {
      const ratio = fraction(Math.round(effectiveDenominator), value);
      return { value, tuplet: { actual: ratio.n, normal: ratio.d } };
    }
  }
  // Unequal/dotted values retain exact durationQ; the UI must not use this glyph
  // denominator as an alternative timing source.
  return { value: ordinary.reduce((best, d) => Math.abs(d - effectiveDenominator) < Math.abs(best - effectiveDenominator) ? d : best, 16) };
}

function correctedQ(doc: RhythmDocument, hit: Hit) {
  return Math.max(0, (hit.onsetMs - doc.offsetMs) * doc.bpm / 60000);
}

/** An onset-only instrument describes rhythm, not finger contact duration.
 * Use the next onset as context, spelling any remainder as an explicit rest.
 * An unfinished final onset provisionally repeats the preceding interval. */
function percussionDuration(gap: number, grid: number): number {
  const spelling = describeDuration(gap);
  const base = 4 / spelling.value * (spelling.tuplet ? spelling.tuplet.normal / spelling.tuplet.actual : 1);
  if (Math.abs(base - gap) < 1e-7 || Math.abs(base * 1.5 - gap) < 1e-7) return gap;
  const ratio = (grid & (grid - 1)) === 0 ? 1 : 2 ** Math.floor(Math.log2(grid)) / grid;
  const values = [4, 2, 1, 0.5, 0.25, 0.125, 0.0625, 0.03125]
    .flatMap((value) => [value, value * 1.5, value * ratio, value * ratio * 1.5])
    .filter((value) => value <= gap + 1e-7);
  return values.length ? Math.max(...values) : gap;
}

function candidateForMeasure(doc: RhythmDocument, index: number, hits: Hit[], grid: number): InterpretationCandidate {
  const capacity = measureQuarters(doc.meter);
  const start = index * capacity;
  const step = 4 / grid;
  const beatMs = 60000 / doc.bpm;
  const graceIds = new Set(doc.overrides.filter((o) => o.kind === "flam" || o.kind === "drag")
    .flatMap((o) => o.hitIds.filter((id) => id !== o.primaryHitId)));
  const mainHits = hits.filter((h) => !graceIds.has(h.id)).sort((a, b) => a.onsetMs - b.onsetMs);
  let error = 0;
  let collisions = 0;
  const placed = mainHits.map((hit) => {
    const observed = correctedQ(doc, hit);
    // A slightly early downbeat may belong to the next bar. Clamping it one
    // grid cell backwards made finer and finer grids win for ordinary jitter.
    const q = clamp(start + Math.round((observed - start) / step) * step, start, start + capacity);
    error += ((q - observed) * beatMs) ** 2;
    if (hit.midi !== undefined && hit.releaseMs !== undefined) {
      const held = (hit.releaseMs - hit.onsetMs) / beatMs;
      if (held * beatMs >= Math.max(80, beatMs / 4)) {
        const quantizedHeld = Math.max(step, Math.round(held / step) * step);
        error += ((quantizedHeld - held) * beatMs) ** 2;
      }
    }
    return { hit, q };
  });
  const grouped: { hits: Hit[]; q: number }[] = [];
  for (const p of placed) {
    const prev = grouped[grouped.length - 1];
    if (prev && Math.abs(prev.q - p.q) < 1e-7) {
      const isChord = p.hit.midi !== undefined && prev.hits.every((h) => h.midi !== undefined && h.midi !== p.hit.midi);
      if (!isChord) collisions++;
      prev.hits.push(p.hit);
    } else grouped.push({ hits: [p.hit], q: p.q });
  }
  const notes: NotationEvent[] = grouped.map((group, i) => {
    const measureEnd = (Math.floor((group.q + 1e-7) / capacity) + 1) * capacity;
    // Context is deliberately bounded to this measure; later bars must not
    // silently rewrite a completed earlier bar.
    const nextOnset = grouped[i + 1]?.q;
    const previousOnset = grouped[i - 1]?.q;
    const inferredGap = nextOnset !== undefined ? nextOnset - group.q
      : previousOnset !== undefined ? group.q - previousOnset : 1;
    const nextQ = Math.min(nextOnset ?? measureEnd, measureEnd);
    // Keyboard gates remain independent of onset-only pad/drum interpretation.
    let tapDuration = 0.25;
    const binaryGrid = (grid & (grid - 1)) === 0;
    if (!binaryGrid) {
      const binaryBase = 2 ** Math.floor(Math.log2(grid));
      tapDuration = 0.25 * binaryBase / grid;
    }
    tapDuration = Math.min(tapDuration, inferredGap);
    const releaseDurations = group.hits.map((h) => {
      if (h.midi === undefined) return percussionDuration(Math.min(inferredGap, nextQ - group.q), grid);
      const held = (h.releaseMs ?? h.onsetMs) - h.onsetMs;
      return held >= Math.max(80, beatMs / 4) ? Math.max(step, Math.round(held / beatMs / step) * step) : tapDuration;
    });
    const duration = Math.max(1 / 24000, Math.min(Math.max(...releaseDurations), nextQ - group.q));
    const mainIds = group.hits.map((h) => h.id);
    const overrides = doc.overrides.filter((o) => o.hitIds.some((id) => mainIds.includes(id)));
    const grace = overrides.filter((o) => o.kind === "flam" || o.kind === "drag");
    return {
      id: `note-${mainIds.join("-")}`, kind: "note", hitIds: mainIds,
      startQ: fraction(Math.round(group.q / step) * 4, grid),
      durationQ: Math.abs(duration / step - Math.round(duration / step)) < 1e-7
        ? fraction(Math.round(duration / step) * 4, grid) : qFraction(duration),
      measureIndex: Math.floor((group.q + 1e-7) / capacity),
      ...describeDuration(duration),
      ...(grace.length ? { graceHitIds: grace.flatMap((o) => o.hitIds.filter((id) => id !== o.primaryHitId)) } : {}),
      ...(overrides.find((o) => o.symbolId) ? { symbolId: overrides.find((o) => o.symbolId)!.symbolId } : {}),
      ...(overrides.some((o) => o.kind === "accent") ? { accent: true } : {}),
      ...(overrides.length ? { locked: true } : {}),
      ...(group.hits.some((h) => h.midi !== undefined) ? { midi: group.hits.flatMap((h) => h.midi === undefined ? [] : [h.midi]) } : {}),
    };
  });
  // Compare complexity in the same squared-millisecond units as timing error.
  // Otherwise tiny input jitter always wins an unnecessarily exotic grid.
  const complexity = Math.log2(grid / 4 + 1) * (beatMs * (0.005 + doc.simplification * 0.045)) ** 2;
  return {
    id: `measure-${index}-grid-${grid}`, measureIndex: index, grid,
    label: `${grid}`, score: (error / Math.max(1, mainHits.length)) + collisions * beatMs ** 2 + complexity,
    events: notes,
  };
}

function withRests(doc: RhythmDocument, notes: NotationEvent[], minimumMeasures: number, firstMeasure = 0): NotationEvent[] {
  const capacity = measureQuarters(doc.meter);
  const length = Math.max(minimumMeasures, ...notes.map((e) => Math.ceil((toNumber(e.startQ) + toNumber(e.durationQ) - 1e-7) / capacity)), 1);
  const result = [...notes];
  for (let m = firstMeasure; m < length; m++) {
    const from = m * capacity;
    const to = from + capacity;
    const intervals = notes.map((e) => [Math.max(from, toNumber(e.startQ)), Math.min(to, toNumber(e.startQ) + toNumber(e.durationQ))])
      .filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
    let cursor = from;
    for (const [a, b] of [...intervals, [to, to]]) {
      if (a > cursor + 1e-7) {
        // Split gaps on beat boundaries and into conventional powers of two;
        // exact residual rational time is retained for uncommon tuplet rests.
        let p = cursor;
        while (p < a - 1e-7) {
          // Finish the current tuplet group before spelling the remaining
          // silence in ordinary beats. Do not carry its fractional residue
          // through the rest of the measure.
          const previousTuplet = notes.find((e) => e.tuplet &&
            Math.abs(toNumber(e.startQ) + toNumber(e.durationQ) - cursor) < 1e-7);
          const groupQ = previousTuplet?.tuplet
            ? 4 / previousTuplet.value * previousTuplet.tuplet.normal : 1;
          const completion = (Math.floor((cursor + 1e-7) / groupQ) + 1) * groupQ;
          const needsCompletion = Math.abs(cursor / groupQ - Math.round(cursor / groupQ)) > 1e-7;
          const groupEnd = needsCompletion && p < completion - 1e-7 ? completion : Number.POSITIVE_INFINITY;
          const boundary = Math.min(a, Math.floor(p + 1e-7) + 1, groupEnd);
          const remaining = boundary - p;
          const powers = [4, 2, 1, 0.5, 0.25, 0.125, 0.0625, 0.03125];
          // Prefer a single exact ordinary/dotted/tuplet rest. Greedily
          // subtracting binary values from a triplet gap fabricated tiny rests.
          const spelling = describeDuration(remaining);
          const base = 4 / spelling.value * (spelling.tuplet ? spelling.tuplet.normal / spelling.tuplet.actual : 1);
          const exact = Math.abs(base - remaining) < 1e-7 || Math.abs(base * 1.5 - remaining) < 1e-7;
          const dur = exact ? remaining : powers.find((v) => v <= remaining + 1e-7) ?? remaining;
          result.push({
            id: `rest-${m}-${Math.round(p * 96000)}`, kind: "rest", hitIds: [],
            startQ: qFraction(p), durationQ: qFraction(dur), measureIndex: m, ...describeDuration(dur),
          });
          p += dur;
        }
      }
      cursor = Math.max(cursor, b);
    }
  }
  return result.sort((a, b) => toNumber(a.startQ) - toNumber(b.startQ) || (a.kind === "rest" ? 1 : -1));
}

export function interpretRhythm(doc: RhythmDocument): Interpretation {
  const capacity = measureQuarters(doc.meter);
  const byMeasure = new Map<number, Hit[]>();
  for (const hit of doc.hits) {
    const index = Math.floor(correctedQ(doc, hit) / capacity);
    if (!Number.isFinite(index) || index > 4095) throw new Error("A rhythm take is limited to 4,096 measures");
    const measureHits = byMeasure.get(index) ?? [];
    measureHits.push(hit);
    byMeasure.set(index, measureHits);
  }
  const candidates: InterpretationCandidate[] = [];
  const auto: NotationEvent[] = [];
  for (const [index, hits] of byMeasure) {
    const choices = grids.filter((g) => 4 / g <= capacity)
      .map((g) => candidateForMeasure(doc, index, hits, g))
      .map((candidate) => ({ ...candidate, events: withRests(doc, candidate.events, index + 1, index)
        .filter((event) => event.kind === "note" || event.measureIndex === index) }))
      // A numerically close onset grid is not a usable score if its note/rest
      // durations cannot be expressed by the renderer's actual glyphs.
      .filter((candidate) => candidate.events.every((event) => notationSpelling(event).supported))
      .sort((a, b) => a.score - b.score);
    if (!choices.length) throw new Error("No representable rhythm interpretation");
    candidates.push(...choices.slice(0, 4));
    auto.push(...choices[0].events.filter((event) => event.kind === "note"));
  }
  const manual = doc.manualEvents ?? [];
  const coveredHits = new Set(manual.flatMap((e) => [...e.hitIds, ...(e.graceHitIds ?? [])]));
  const merged = [...manual.filter((e) => e.kind === "note"),
    ...auto.filter((e) => !e.hitIds.some((id) => coveredHits.has(id)))];
  // Explicitly inserted rests reserve their interval; generated notes cannot
  // silently overwrite a user-confirmed rest.
  const rests = manual.filter((e) => e.kind === "rest");
  const filtered = merged.filter((e) => e.locked || !rests.some((r) =>
    toNumber(e.startQ) < toNumber(r.startQ) + toNumber(r.durationQ) &&
    toNumber(e.startQ) + toNumber(e.durationQ) > toNumber(r.startQ)));
  return { events: withRests(doc, [...filtered, ...rests], Math.max(1, ...[...byMeasure.keys()].map((i) => i + 1))), candidates };
}

export function applyInterpretation(
  doc: RhythmDocument, hitIds: string[], kind: InterpretationOverride["kind"], symbolId?: string,
): RhythmDocument {
  const ids = new Set(hitIds);
  const hits = doc.hits.filter((h) => ids.has(h.id)).sort((a, b) => a.onsetMs - b.onsetMs);
  if (hits.length !== ids.size || !hits.length) throw new Error("Select existing recorded hits");
  if ((kind === "flam" && hits.length < 2) || (kind === "drag" && hits.length < 3)) throw new Error("Flam needs two hits; drag needs three");
  const overrides = doc.overrides.filter((o) => !o.hitIds.some((id) => ids.has(id)));
  const next: RhythmDocument = {
    ...doc, updatedAt: Date.now(),
    overrides: [...overrides, { id: newRhythmId("meaning"), hitIds: hits.map((h) => h.id), kind, ...(symbolId ? { symbolId } : {}),
      ...((kind === "flam" || kind === "drag") ? { primaryHitId: hits[hits.length - 1].id } : {}) }],
    manualEvents: doc.manualEvents?.filter((e) => ![...e.hitIds, ...(e.graceHitIds ?? [])].some((id) => ids.has(id))),
  };
  // Freeze only the explicitly corrected events. Other input remains provisional.
  const fixed = interpretRhythm(next).events.filter((e) => e.kind === "note" && e.hitIds.some((id) => ids.has(id)));
  return { ...next, manualEvents: [...(next.manualEvents ?? []), ...fixed.map((e) => ({ ...e, locked: true }))] };
}

export function chooseCandidate(doc: RhythmDocument, candidate: InterpretationCandidate): RhythmDocument {
  const existing = (doc.manualEvents ?? []).filter((e) => e.measureIndex !== candidate.measureIndex || e.locked);
  const protectedIds = new Set(existing.flatMap((e) => [...e.hitIds, ...(e.graceHitIds ?? [])]));
  const selected = candidate.events.filter((e) => e.kind === "note" && !e.hitIds.some((id) => protectedIds.has(id)));
  return { ...doc, updatedAt: Date.now(), manualEvents: [...existing, ...selected.map((e) => ({ ...e, locked: true }))] };
}

export function moveNotationEvent(doc: RhythmDocument, eventId: string, newStartQ: number, snap = true): RhythmDocument {
  const event = interpretRhythm(doc).events.find((e) => e.id === eventId);
  if (!event) throw new Error("Note not found");
  const start = Math.max(0, snap ? Math.round(newStartQ * 16) / 16 : newStartQ);
  const moved = { ...event, startQ: qFraction(start), measureIndex: Math.floor(start / measureQuarters(doc.meter)), locked: true };
  return { ...doc, updatedAt: Date.now(), manualEvents: [...(doc.manualEvents ?? []).filter((e) => e.id !== eventId), moved] };
}

export function setEventDuration(doc: RhythmDocument, eventId: string, durationQ: number): RhythmDocument {
  if (!(durationQ > 0) || !Number.isFinite(durationQ)) throw new Error("Duration must be positive");
  const event = interpretRhythm(doc).events.find((e) => e.id === eventId);
  if (!event) throw new Error("Note not found");
  const edited: NotationEvent = { ...event, durationQ: qFraction(durationQ), ...describeDuration(durationQ), locked: true };
  return { ...doc, updatedAt: Date.now(), manualEvents: [...(doc.manualEvents ?? []).filter((e) => e.id !== eventId), edited] };
}

export function insertRest(doc: RhythmDocument, startQ: number, durationQ: number): RhythmDocument {
  if (startQ < 0 || durationQ <= 0 || !Number.isFinite(startQ + durationQ)) throw new Error("Invalid rest time");
  const rest: NotationEvent = { id: newRhythmId("rest"), kind: "rest", hitIds: [], startQ: qFraction(startQ),
    durationQ: qFraction(durationQ), measureIndex: Math.floor(startQ / measureQuarters(doc.meter)), ...describeDuration(durationQ), locked: true };
  return { ...doc, manualEvents: [...(doc.manualEvents ?? []), rest], updatedAt: Date.now() };
}

/** Editor-created notes are not fake raw performance hits. */
export function insertNotationNote(doc: RhythmDocument, startQ: number, durationQ: number, sound: { midi?: number; drum?: Hit["drum"] }): RhythmDocument {
  if (startQ < 0 || durationQ <= 0 || !Number.isFinite(startQ + durationQ)) throw new Error("Invalid note time");
  const note: NotationEvent = {
    id: newRhythmId("inserted"), kind: "note", hitIds: [], startQ: qFraction(startQ),
    durationQ: qFraction(durationQ), measureIndex: Math.floor(startQ / measureQuarters(doc.meter)),
    ...describeDuration(durationQ), locked: true,
    ...(sound.midi === undefined ? { drum: sound.drum ?? "snare" } : { midi: [sound.midi] }),
  };
  return { ...doc, manualEvents: [...(doc.manualEvents ?? []), note], updatedAt: Date.now() };
}

export function applyTuplet(doc: RhythmDocument, eventIds: string[], actual: number, normal: number, parentId?: string): RhythmDocument {
  if (![actual, normal].every((v) => Number.isInteger(v) && v > 0 && v <= 128) || actual < 2) throw new Error("Invalid tuplet ratio");
  if (!eventIds.length || new Set(eventIds).size !== eventIds.length) throw new Error("Select distinct notes/rests");
  if (parentId && !doc.tuplets.some((t) => t.id === parentId)) throw new Error("Parent tuplet not found");
  const selected = interpretRhythm(doc).events.filter((e) => eventIds.includes(e.id)).sort((a, b) => toNumber(a.startQ) - toNumber(b.startQ));
  if (selected.length !== eventIds.length) throw new Error("Selected event no longer exists");
  const parent = parentId ? doc.tuplets.find((t) => t.id === parentId) : undefined;
  if (parent && eventIds.some((id) => !parent.eventIds.includes(id))) throw new Error("Nested tuplet must be inside its parent");
  // Overlap is valid only for ancestors: otherwise two independent ratios
  // would silently scale the same interval twice.
  const ancestorIds = new Set<string>();
  let ancestor = parent;
  while (ancestor) { ancestorIds.add(ancestor.id); ancestor = doc.tuplets.find((t) => t.id === ancestor!.parentId); }
  if (doc.tuplets.some((t) => !ancestorIds.has(t.id) && t.eventIds.some((id) => eventIds.includes(id)))) throw new Error("Overlapping tuplets need an explicit parent");
  const start = selected[0].startQ;
  const changed = selected.map((e) => {
    const relative = addFraction(e.startQ, { n: -start.n, d: start.d });
    const onset = addFraction(start, scaleFraction(relative, normal, actual));
    return { ...e, startQ: onset, durationQ: scaleFraction(e.durationQ, normal, actual),
      measureIndex: Math.floor(toNumber(onset) / measureQuarters(doc.meter)), tuplet: { actual, normal }, locked: true };
  });
  const group: TupletSpan = { id: newRhythmId("tuplet"), eventIds: [...eventIds], actual, normal, ...(parentId ? { parentId } : {}) };
  return { ...doc, updatedAt: Date.now(), tuplets: [...doc.tuplets, group],
    manualEvents: [...(doc.manualEvents ?? []).filter((e) => !eventIds.includes(e.id)), ...changed] };
}

export function buildRhythmPlayback(doc: RhythmDocument, mode: "original" | "notation"): PlaybackHit[] {
  if (mode === "original") return doc.hits.map((h) => ({
    id: h.id, timeMs: h.onsetMs, midi: h.midi, drum: h.drum,
    durationMs: Math.max(25, (h.releaseMs ?? h.onsetMs + 100) - h.onsetMs),
  })).sort((a, b) => a.timeMs - b.timeMs);
  const msPerQ = 60000 / doc.bpm;
  const byId = new Map(doc.hits.map((h) => [h.id, h]));
  const result: PlaybackHit[] = [];
  for (const event of interpretRhythm(doc).events.filter((e) => e.kind === "note")) {
    const qMs = toNumber(event.startQ) * msPerQ;
    if (!event.hitIds.length) {
      for (const [i, midi] of (event.midi?.length ? event.midi : [undefined]).entries()) {
        result.push({ id: `${event.id}-${i}`, timeMs: qMs, durationMs: toNumber(event.durationQ) * msPerQ,
          ...(midi === undefined ? { drum: event.drum ?? "snare" } : { midi }), accent: event.accent });
      }
    }
    const primary = byId.get(event.hitIds[event.hitIds.length - 1]);
    for (const id of event.hitIds) {
      const hit = byId.get(id);
      if (hit) result.push({ id, timeMs: qMs, durationMs: toNumber(event.durationQ) * msPerQ, midi: hit.midi, drum: hit.drum, accent: event.accent });
    }
    for (const id of event.graceHitIds ?? []) {
      const hit = byId.get(id);
      if (hit && primary) result.push({ id, timeMs: qMs + hit.onsetMs - primary.onsetMs, midi: hit.midi, drum: hit.drum });
    }
  }
  // A leading grace may be before notated zero: add a common lead-in, never
  // truncate the grace or change its interval to the principal.
  const lead = Math.max(0, -Math.min(0, ...result.map((h) => h.timeMs)));
  return result.map((h) => ({ ...h, timeMs: h.timeMs + lead })).sort((a, b) => a.timeMs - b.timeMs);
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid rhythm document");
  return value as Record<string, unknown>;
}
function finite(value: unknown, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new Error("Invalid numeric value");
  return value;
}
function text(value: unknown, limit = 200): string {
  if (typeof value !== "string" || value.length > limit) throw new Error("Invalid text");
  return value;
}
function array(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new Error("Invalid list");
  return value;
}
function readFraction(value: unknown, positive = false): Fraction {
  const f = object(value);
  const n = finite(f.n, positive ? 1 : 0, 1e12);
  const d = finite(f.d, 1, 1e9);
  if (!Number.isInteger(n) || !Number.isInteger(d)) throw new Error("Musical time must be rational");
  return fraction(n, d);
}

/** Validation reconstructs owned fields; persisted/imported data is never trusted. */
export function validateRhythmDocument(value: unknown): RhythmDocument {
  const d = object(value), meter = object(d.meter);
  if (d.version !== 1) throw new Error("Unsupported rhythm document version");
  const numerator = finite(meter.numerator, 1, 32), denominator = finite(meter.denominator, 1, 64);
  if (!Number.isInteger(numerator) || ![1, 2, 4, 8, 16, 32, 64].includes(denominator)) throw new Error("Invalid meter");
  const doc: RhythmDocument = {
    version: 1, id: text(d.id), title: text(d.title, 1000), bpm: finite(d.bpm, 20, 300),
    meter: { numerator, denominator }, createdAt: finite(d.createdAt, 0, 1e15), updatedAt: finite(d.updatedAt, 0, 1e15),
    offsetMs: finite(d.offsetMs, -2000, 2000), simplification: finite(d.simplification, 0, 1),
    hits: [], overrides: [], tuplets: [], symbols: [],
  };
  doc.hits = array(d.hits, 20000).map((value) => {
    const h = object(value);
    const hit: Hit = { id: text(h.id), onsetMs: finite(h.onsetMs, 0, 86400000) };
    if (h.releaseMs !== undefined) hit.releaseMs = finite(h.releaseMs, hit.onsetMs, 86400000);
    if (h.midi !== undefined) { hit.midi = finite(h.midi, 0, 127); if (!Number.isInteger(hit.midi)) throw new Error("Invalid MIDI"); }
    if (h.drum !== undefined) {
      if (!["snare", "kick", "hihat_closed"].includes(h.drum as string)) throw new Error("Invalid drum");
      hit.drum = h.drum as Hit["drum"];
    }
    if (h.hand !== undefined) { if (h.hand !== "R" && h.hand !== "L") throw new Error("Invalid hand"); hit.hand = h.hand; }
    return hit;
  });
  const ids = new Set(doc.hits.map((h) => h.id));
  if (ids.size !== doc.hits.length) throw new Error("Duplicate hit IDs");
  doc.symbols = array(d.symbols, 500).map((value) => {
    const s = object(value);
    if (!["rhythm", "pitch", "expression", "structure"].includes(s.role as string) ||
        !["flam", "drag", "diddle", "accent", "annotation"].includes(s.meaning as string)) throw new Error("Invalid symbol role");
    const shapes = array(s.shapes, 200).map((value) => {
      const shape = object(value);
      const id = text(shape.id);
      const coord = (key: string) => finite(shape[key], -10000, 10000);
      switch (shape.type) {
        case "line": return { id, type: "line" as const, x1: coord("x1"), y1: coord("y1"), x2: coord("x2"), y2: coord("y2") };
        case "ellipse": return { id, type: "ellipse" as const, cx: coord("cx"), cy: coord("cy"), rx: finite(shape.rx, 0, 10000), ry: finite(shape.ry, 0, 10000) };
        case "curve": return { id, type: "curve" as const, x1: coord("x1"), y1: coord("y1"), cx: coord("cx"), cy: coord("cy"), x2: coord("x2"), y2: coord("y2") };
        default: throw new Error("Invalid symbol shape");
      }
    });
    return { id: text(s.id), name: text(s.name), role: s.role as RhythmDocument["symbols"][number]["role"],
      meaning: s.meaning as RhythmDocument["symbols"][number]["meaning"], description: text(s.description, 2000), shapes };
  });
  const symbolIds = new Set(doc.symbols.map((s) => s.id));
  if (symbolIds.size !== doc.symbols.length) throw new Error("Duplicate symbol IDs");
  const readIds = (v: unknown) => {
    const list = array(v, 20000).map((x) => text(x));
    if (new Set(list).size !== list.length || list.some((id) => !ids.has(id))) throw new Error("Invalid hit reference");
    return list;
  };
  doc.overrides = array(d.overrides, 20000).map((value) => {
    const o = object(value);
    if (!["flam", "drag", "diddle", "regular", "accent"].includes(o.kind as string)) throw new Error("Invalid interpretation");
    const hitIds = readIds(o.hitIds);
    if (!hitIds.length) throw new Error("Empty interpretation");
    const result: InterpretationOverride = { id: text(o.id), hitIds, kind: o.kind as InterpretationOverride["kind"] };
    if (o.primaryHitId !== undefined) { result.primaryHitId = text(o.primaryHitId); if (!hitIds.includes(result.primaryHitId)) throw new Error("Invalid primary hit"); }
    if ((result.kind === "flam" || result.kind === "drag") && (!result.primaryHitId || hitIds.length < (result.kind === "drag" ? 3 : 2))) throw new Error("Invalid grace group");
    if (o.symbolId !== undefined) { result.symbolId = text(o.symbolId); if (!symbolIds.has(result.symbolId)) throw new Error("Missing symbol"); }
    return result;
  });
  if (d.manualEvents !== undefined) doc.manualEvents = array(d.manualEvents, 30000).map((value) => {
    const e = object(value);
    if (e.kind !== "note" && e.kind !== "rest") throw new Error("Invalid notation event");
    const event: NotationEvent = { id: text(e.id), kind: e.kind, hitIds: readIds(e.hitIds),
      startQ: readFraction(e.startQ), durationQ: readFraction(e.durationQ, true),
      measureIndex: finite(e.measureIndex, 0, 1000000), value: finite(e.value, 1, 1024) };
    if (e.graceHitIds !== undefined) event.graceHitIds = readIds(e.graceHitIds);
    if (e.locked !== undefined) { if (typeof e.locked !== "boolean") throw new Error("Invalid lock"); event.locked = e.locked; }
    if (e.accent !== undefined) { if (typeof e.accent !== "boolean") throw new Error("Invalid accent"); event.accent = e.accent; }
    if (e.tuplet !== undefined) { const t = object(e.tuplet); event.tuplet = { actual: finite(t.actual, 2, 128), normal: finite(t.normal, 1, 128) }; }
    if (e.symbolId !== undefined) { event.symbolId = text(e.symbolId); if (!symbolIds.has(event.symbolId)) throw new Error("Missing symbol"); }
    if (e.midi !== undefined) event.midi = array(e.midi, 128).map((x) => finite(x, 0, 127));
    if (e.drum !== undefined) {
      if (!["snare", "kick", "hihat_closed"].includes(e.drum as string)) throw new Error("Invalid drum");
      event.drum = e.drum as Hit["drum"];
    }
    return event;
  });
  const eventIds = new Set(interpretRhythm(doc).events.map((e) => e.id));
  doc.tuplets = array(d.tuplets, 20000).map((value) => {
    const t = object(value);
    const actual = finite(t.actual, 2, 128), normal = finite(t.normal, 1, 128);
    if (!Number.isInteger(actual) || !Number.isInteger(normal)) throw new Error("Invalid tuplet ratio");
    const members = array(t.eventIds, 20000).map((id) => text(id));
    if (!members.length || new Set(members).size !== members.length || members.some((id) => !eventIds.has(id))) throw new Error("Invalid tuplet members");
    return { id: text(t.id), actual, normal, eventIds: members, ...(t.parentId === undefined ? {} : { parentId: text(t.parentId) }) };
  });
  const groups = new Map(doc.tuplets.map((t) => [t.id, t]));
  if (groups.size !== doc.tuplets.length) throw new Error("Duplicate tuplet IDs");
  for (const t of doc.tuplets) {
    const seen = new Set([t.id]);
    let current = t;
    while (current.parentId) {
      if (seen.has(current.parentId)) throw new Error("Cyclic tuplet");
      seen.add(current.parentId);
      const parent = groups.get(current.parentId);
      if (!parent || current.eventIds.some((id) => !parent.eventIds.includes(id))) throw new Error("Invalid parent tuplet");
      current = parent;
    }
  }
  if (d.reviewConfirmations !== undefined) {
    doc.reviewConfirmations = array(d.reviewConfirmations, 4096).map((value) => {
      const entry = object(value);
      const measureIndex = finite(entry.measureIndex, 0, 4095);
      if (!Number.isInteger(measureIndex)) throw new Error("Invalid review measure");
      const frozen = array(entry.eventIds, 30000).map((id) => text(id));
      if (new Set(frozen).size !== frozen.length) {
        throw new Error("Invalid review event");
      }
      return { measureIndex, fingerprint: text(entry.fingerprint, 32), eventIds: frozen };
    }).filter((entry) => entry.eventIds.every((id) => eventIds.has(id)));
    if (new Set(doc.reviewConfirmations.map((entry) => entry.measureIndex)).size !== doc.reviewConfirmations.length) {
      throw new Error("Duplicate review measure");
    }
  }
  return doc;
}
