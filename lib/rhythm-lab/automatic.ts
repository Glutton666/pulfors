import type { Hit, InterpretationCandidate, NotationEvent, RhythmDocument } from "./types";
import { attachTuplet, EPS, fillRests, gridRatio, musicalTime, num, spellLength, splitNote } from "./spans";

const GRIDS = [4, 8, 16, 32, 64, 128, 12, 24, 48, 96, 20, 40, 80, 28, 56, 112];
type Choice = { grid: number; score: number };
const qOf = (doc: RhythmDocument, hit: Hit) => Math.max(0, (hit.onsetMs - doc.offsetMs) * doc.bpm / 60000);
const quantize = (q: number, grid: number) => Math.max(0, Math.round(q * grid / 4) * 4 / grid);
function rank(times: number[], ms: number, simplification: number): Choice[] {
  const distinct = [...new Set(times)].sort((a, b) => a - b);
  const gap = Math.min(Infinity, ...distinct.slice(1).map((q, i) => (q - distinct[i]) * ms));
  const tolerance = Math.max(2, Math.min(15, ms * 0.03, gap * 0.12));
  return GRIDS.map((grid) => {
    const errors = times.map((q) => Math.abs(quantize(q, grid) - q) * ms);
    const collapsed = distinct.length - new Set(distinct.map((q) => quantize(q, grid))).size;
    const excess = Math.max(0, ...errors.map((e) => e - tolerance));
    const complexity = Math.log2(grid / 4 + 1) + (gridRatio(grid) ? 0.2 : 0);
    return { grid, score: collapsed * ms ** 2 * 100 + excess ** 2 * 100 +
      complexity * (ms * (0.018 + simplification * 0.006)) ** 2 +
      errors.reduce((sum, e) => sum + e ** 2, 0) / Math.max(1, errors.length) * 0.025 };
  }).sort((a, b) => a.score - b.score);
}

/** Half-quarter regions can mix binary sixteenths and triplets in one beat.
 * No future input outside a region (at most an adjacent bar at its boundary)
 * participates in its ranking. Complexity is local, never a whole-bar veto. */
export function automaticRhythm(doc: RhythmDocument): { notes: NotationEvent[]; candidates: InterpretationCandidate[] } {
  const ms = 60000 / doc.bpm, capacity = doc.meter.numerator * 4 / doc.meter.denominator;
  const grace = new Set(doc.overrides.filter((o) => o.kind === "flam" || o.kind === "drag")
    .flatMap((o) => o.hitIds.filter((id) => id !== o.primaryHitId)));
  const hits = doc.hits.filter((h) => !grace.has(h.id)).sort((a, b) => a.onsetMs - b.onsetMs);
  const regionSize = Math.min(0.5, capacity);
  const bucket = (h: Hit) => Math.floor((qOf(doc, h) + Math.min(0.03, 15 / ms, regionSize * 0.15)) / regionSize);
  const regions = new Map<number, Hit[]>();
  for (const hit of hits) {
    if (qOf(doc, hit) / capacity >= 4096) throw new Error("A rhythm take is limited to 4,096 measures");
    const key = bucket(hit); regions.set(key, [...(regions.get(key) ?? []), hit]);
  }
  const choices = new Map([...regions].map(([key, local]) => [key, rank(local.map((h) => qOf(doc, h)), ms, doc.simplification)]));
  const build = (alternative?: { key: number; grid: number }) => {
    const placed = hits.map((hit) => {
      const key = bucket(hit), grid = alternative?.key === key ? alternative.grid : choices.get(key)![0].grid;
      return { hit, grid, q: quantize(qOf(doc, hit), grid) };
    });
    const logical: NotationEvent[] = placed.map(({ hit, grid, q }, index) => {
      let ratio = gridRatio(grid);
      let duration: number;
      if (hit.midi !== undefined && hit.releaseMs !== undefined && hit.releaseMs > hit.onsetMs) {
        const held = (hit.releaseMs - hit.onsetMs) / ms;
        const heldGrid = rank([0, held], ms, doc.simplification)[0].grid;
        duration = Math.max(4 / heldGrid, quantize(held, heldGrid));
        ratio = gridRatio(heldGrid) ?? ratio;
      } else {
        const base = 0.25 * (ratio ? ratio.normal / ratio.actual : 1);
        const next = placed.slice(index + 1).find((item) => item.q > q + EPS &&
          item.q <= (Math.floor(q / capacity) + 2) * capacity);
        const gap = hit.midi === undefined && next ? next.q - q : Infinity;
        duration = spellLength(Math.min(base, gap), ratio)?.duration ?? Math.min(base, gap);
      }
      const spelling = spellLength(duration, ratio);
      const ids = [hit.id];
      const overrides = doc.overrides.filter((o) => o.hitIds.includes(hit.id));
      const graceIds = overrides.filter((o) => o.kind === "flam" || o.kind === "drag").flatMap((o) => o.hitIds.filter((id) => id !== o.primaryHitId));
      return { id: `note-${hit.id}`, kind: "note", hitIds: ids, startQ: musicalTime(q), durationQ: musicalTime(duration),
        measureIndex: Math.floor((q + EPS) / capacity), value: spelling?.value ?? 16,
        ...(ratio ? { tuplet: attachTuplet(ratio, q, spelling?.value ?? 16) } : {}),
        ...(hit.midi === undefined ? { drum: hit.drum ?? "snare" } : { midi: [hit.midi], voiceId: `key-${hit.id}` }),
        ...(graceIds.length ? { graceHitIds: graceIds } : {}),
        ...(overrides.some((o) => o.kind === "accent") ? { accent: true } : {}),
        ...(overrides.find((o) => o.symbolId) ? { symbolId: overrides.find((o) => o.symbolId)!.symbolId } : {}),
        ...(overrides.length ? { locked: true } : {}) };
    });
    // Only truly equal gates share a chord glyph. Never share the longest gate.
    const chords: NotationEvent[] = [];
    for (const note of logical) {
      const chord = note.midi && chords.find((e) => e.midi && Math.abs(num(e.startQ) - num(note.startQ)) < EPS &&
        Math.abs(num(e.durationQ) - num(note.durationQ)) < EPS && JSON.stringify(e.tuplet) === JSON.stringify(note.tuplet) &&
        !e.locked && !note.locked && !e.midi.some((p) => note.midi!.includes(p)));
      if (chord) { chord.hitIds.push(...note.hitIds); chord.midi!.push(...note.midi!); chord.id = `note-${chord.hitIds.join("-")}`; }
      else chords.push(note);
    }
    return chords.flatMap((note) => splitNote(note, capacity));
  };
  const notes = build(), candidates: InterpretationCandidate[] = [];
  const measures = new Set(hits.map((h) => Math.floor(qOf(doc, h) / capacity)));
  for (const m of measures) {
    const localKeys = [...regions.keys()].filter((key) => key * regionSize >= m * capacity - EPS && key * regionSize < (m + 1) * capacity - EPS);
    const baseScore = localKeys.reduce((sum, key) => sum + choices.get(key)![0].score, 0);
    const variants = [{ key: -1, grid: 16, score: baseScore }, ...localKeys.flatMap((key) =>
      choices.get(key)!.slice(1, 3).map((choice) => ({ key, grid: choice.grid,
        score: baseScore - choices.get(key)![0].score + choice.score })))].sort((a, b) => a.score - b.score).slice(0, 4);
    for (const variant of variants) {
      const full = variant.key === -1 ? notes : build(variant);
      const sourceIds = new Set(full.filter((e) => e.measureIndex === m).flatMap((e) => e.hitIds));
      const selected = full.filter((e) => e.hitIds.some((id) => sourceIds.has(id)));
      candidates.push({ id: `local-${m}-${variant.key}-${variant.grid}`, measureIndex: m,
        grid: variant.grid, label: variant.key === -1 ? "Local" : `${variant.key * regionSize} · ${variant.grid}`,
        score: variant.score, events: selected });
    }
  }
  return { notes, candidates };
}

export function mergeAutomatic(doc: RhythmDocument) {
  const { notes, candidates } = automaticRhythm(doc);
  const capacity = doc.meter.numerator * 4 / doc.meter.denominator;
  const manual = (doc.manualEvents ?? []).flatMap((e) =>
    e.kind === "note" && !e.tie && num(e.startQ) + num(e.durationQ) > (e.measureIndex + 1) * capacity + EPS
      ? splitNote(e, capacity) : [e]);
  const covered = new Set(manual.flatMap((e) => [...e.hitIds, ...(e.graceHitIds ?? [])]));
  const rests = manual.filter((e) => e.kind === "rest");
  const merged = [...manual, ...notes.filter((e) => !e.hitIds.some((id) => covered.has(id)) && !rests.some((r) =>
    num(e.startQ) < num(r.startQ) + num(r.durationQ) - EPS && num(e.startQ) + num(e.durationQ) > num(r.startQ) + EPS))];
  const count = Math.max(1, ...doc.hits.map((h) => Math.floor(qOf(doc, h) / (doc.meter.numerator * 4 / doc.meter.denominator)) + 1));
  const conflicts = manual.filter((e) => e.locked && e.hitIds.length && notes.some((n) =>
    n.hitIds.some((id) => e.hitIds.includes(id)) && n.measureIndex !== e.measureIndex &&
    !manual.some((other) => other.measureIndex === n.measureIndex && other.hitIds.some((id) => n.hitIds.includes(id)))))
    .map((e) => ({ measureIndex: e.measureIndex, hitIds: e.hitIds, code: "protected-boundary" }));
  return { events: fillRests(doc, merged, count), candidates, conflicts };
}
