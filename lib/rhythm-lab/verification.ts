import { interpretRhythm, measureQuarters, toNumber } from "./engine";
import { notationSpelling } from "./notation";
import { scoreTimeline } from "./score-timeline";
import { invalidTiePieces } from "./spans";
import type { Interpretation, InterpretationCandidate, NotationEvent, PlaybackHit, RhythmDocument } from "./types";

export interface DraftIssue {
  code: string;
  measureIndex: number;
  eventId?: string;
  message: string;
}
export interface DraftRegion {
  measureIndex: number;
  similarity: number | null;
  meanErrorMs: number;
  maxErrorMs: number;
  missing: number;
  extra: number;
  status: "ready" | "ambiguous" | "unresolved" | "confirmed" | "invalid";
  reasons: string[];
  candidateCount: number;
  onsetMatches?: boolean;
  durationMatches?: boolean | null;
  maxDurationErrorMs?: number | null;
  comparedDurations?: number;
}
export interface DraftReport {
  similarity: number | null;
  valid: boolean;
  issues: DraftIssue[];
  regions: DraftRegion[];
  onsetCount: number;
  comparedCount: number;
  onsetMatches?: boolean;
  durationMatches?: boolean | null;
}

const EPS = 0.00003;
/** Onsets are score coordinates, durations are decoded from glyph semantics.
 * Structure validation below checks their sequential coverage independently. */
export function reconstructNotation(doc: RhythmDocument, events = interpretRhythm(doc).events): PlaybackHit[] {
  if (doc.notationVersion === 2) return scoreTimeline(doc, events);
  const ms = 60000 / doc.bpm;
  const sources = new Map(doc.hits.map((hit) => [hit.id, hit]));
  const result: PlaybackHit[] = [];
  for (const event of events) {
    if (event.kind !== "note") continue;
    const duration = notationSpelling(event);
    const timeMs = toNumber(event.startQ) * ms;
    if (event.hitIds.length) {
      for (const id of event.hitIds) {
        const source = sources.get(id);
        result.push({ id, timeMs, durationMs: duration.durationQ * ms,
          midi: source?.midi, drum: source?.drum, accent: event.accent });
      }
    } else {
      for (const [index, midi] of (event.midi?.length ? event.midi : [undefined]).entries()) {
        result.push({ id: `${event.id}-${index}`, timeMs, durationMs: duration.durationQ * ms,
          midi, drum: event.drum, accent: event.accent });
      }
    }
    // Unmeasured grace notes have a conventional compact playback, not a
    // secret copy of raw timing that would make validation trivially pass.
    const grace = event.graceHitIds ?? [];
    grace.forEach((id, index) => {
      const source = sources.get(id);
      result.push({ id, timeMs: timeMs - (grace.length - index) * Math.min(ms / 16, 35),
        durationMs: Math.min(ms / 32, 20), midi: source?.midi, drum: source?.drum });
    });
  }
  return result.sort((a, b) => a.timeMs - b.timeMs);
}

export function regionFingerprint(doc: RhythmDocument, index: number, events = interpretRhythm(doc).events): string {
  const localEvents = events.filter((event) => event.measureIndex === index);
  const ids = new Set(localEvents
    .flatMap((event) => [...event.hitIds, ...(event.graceHitIds ?? [])]));
  return fingerprintParts(doc, localEvents, doc.hits.filter((hit) => ids.has(hit.id)));
}

function fingerprintParts(doc: RhythmDocument, events: NotationEvent[], hits: RhythmDocument["hits"]): string {
  // Store a bounded deterministic hash, not a second copy of the performance.
  const payload = [doc.bpm, doc.meter, doc.offsetMs,
    events, hits];
  const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) :
    value && typeof value === "object" ? Object.fromEntries(Object.entries(value)
      .filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)])) : value;
  const value = JSON.stringify(doc.notationVersion === 2 ? canonical(payload) : payload);
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16);
}

/** A valid candidate can replace provisional notes, never protected edits. */
export function applyDraftCandidate(doc: RhythmDocument, candidate: InterpretationCandidate): RhythmDocument {
  const replacing = new Set(candidate.events.flatMap((e) => e.hitIds));
  const retained = (doc.manualEvents ?? []).filter((event) => event.locked ||
    event.measureIndex !== candidate.measureIndex && !event.hitIds.some((id) => replacing.has(id)));
  const protectedIds = new Set(retained.flatMap((event) => [...event.hitIds, ...(event.graceHitIds ?? [])]));
  const notes = candidate.events.filter((event) => event.kind === "note" &&
    !event.hitIds.some((id) => protectedIds.has(id)));
  return { ...doc, manualEvents: [...retained, ...notes.map((event) => ({ ...event, locked: false }))] };
}

function structuralIssues(doc: RhythmDocument, events: NotationEvent[]): DraftIssue[] {
  const issues: DraftIssue[] = [];
  const capacity = measureQuarters(doc.meter);
  const sourceIds = new Set(doc.hits.map((hit) => hit.id));
  const sourceById = new Map(doc.hits.map((hit) => [hit.id, hit]));
  const seen = new Set<string>();
  const eventIds = new Set<string>();
  const byMeasure = new Map<number, NotationEvent[]>();
  const add = (code: string, event: NotationEvent) => issues.push({
    code, measureIndex: event.measureIndex, eventId: event.id, message: code,
  });
  for (const event of events) {
    const start = toNumber(event.startQ);
    const duration = notationSpelling(event);
    if (!duration.supported) add("glyph-duration", event);
    if (eventIds.has(event.id)) add("duplicate-event", event);
    eventIds.add(event.id);
    if (event.measureIndex !== Math.floor((start + EPS) / capacity)) add("bar-position", event);
    if (start + duration.durationQ > (event.measureIndex + 1) * capacity + EPS) add("bar-overflow", event);
    const list = byMeasure.get(event.measureIndex) ?? [];
    list.push(event); byMeasure.set(event.measureIndex, list);
    for (const id of [...event.hitIds, ...(event.graceHitIds ?? [])]) {
      if (!sourceIds.has(id)) add("unknown-hit", event);
      if (event.tie && event.tie.part !== 0) continue;
      if (seen.has(id)) add("duplicate-hit", event);
      seen.add(id);
    }
    // Multiple drum strikes at one quantized onset are not a chord.
    if (event.hitIds.length > 1 && event.hitIds.some((id) => sourceById.get(id)?.midi === undefined)) {
      add("collapsed-hits", event);
    }
  }
  invalidTiePieces(events).forEach((piece) => add("tie-chain", piece));
  for (const hit of doc.hits) if (!seen.has(hit.id)) issues.push({
    code: "missing-hit", measureIndex: Math.floor(Math.max(0, hit.onsetMs - doc.offsetMs) * doc.bpm / 60000 / capacity),
    message: "missing-hit",
  });
  for (const [index, measureEvents] of byMeasure) {
    const sorted = [...measureEvents].sort((a, b) => toNumber(a.startQ) - toNumber(b.startQ));
    let cursor = index * capacity;
    const occupied: NotationEvent[] = [];
    for (const event of sorted) {
      const start = toNumber(event.startQ);
      if (start > cursor + EPS) add("unfilled-gap", event);
      const overlaps = occupied.filter((e) => toNumber(e.startQ) + notationSpelling(e).durationQ > start + EPS);
      if (event.kind === "note" && !event.midi?.length && overlaps.some((e) => e.kind === "note" &&
        !e.midi?.length && Math.abs(toNumber(e.startQ) - start) < EPS)) add("collapsed-hits", event);
      const independent = (other: NotationEvent) => other.kind === "note" && event.kind === "note" &&
        other.midi?.length && event.midi?.length &&
        (other.voiceId && event.voiceId ? other.voiceId !== event.voiceId : !other.midi.some((m) => event.midi!.includes(m)));
      if (overlaps.some((other) => !independent(other))) add("overlap", event);
      cursor = Math.max(cursor, start + notationSpelling(event).durationQ);
      occupied.push(event);
    }
    if (Math.abs(cursor - (index + 1) * capacity) > EPS && sorted[0]) add("bar-total", sorted[0]);
  }
  return issues;
}

export function verifyDraft(doc: RhythmDocument, interpretation: Interpretation = interpretRhythm(doc)): DraftReport {
  const { events, candidates } = interpretation;
  const issues = structuralIssues(doc, events);
  const timeline = reconstructNotation(doc, events);
  const byId = new Map(timeline.map((hit) => [hit.id, hit]));
  const ms = 60000 / doc.bpm;
  const capacity = measureQuarters(doc.meter);
  const eventForHit = new Map<string, NotationEvent>();
  const timelineByMeasure = new Map<number, PlaybackHit[]>();
  events.filter((e) => !e.tie || e.tie.part === 0).forEach((event) =>
    [...event.hitIds, ...(event.graceHitIds ?? [])].forEach((id) => eventForHit.set(id, event)));
  const eventById = new Map(events.map((event) => [event.id, event]));
  for (const hit of timeline) {
    const event = eventForHit.get(hit.id) ?? eventById.get(hit.id.slice(0, hit.id.lastIndexOf("-")));
    if (!event) continue;
    const list = timelineByMeasure.get(event.measureIndex) ?? [];
    list.push(hit); timelineByMeasure.set(event.measureIndex, list);
  }
  const buckets = new Map<number, typeof doc.hits>();
  for (const hit of doc.hits) {
    const index = eventForHit.get(hit.id)?.measureIndex ??
      Math.floor(Math.max(0, hit.onsetMs - doc.offsetMs) / ms / capacity);
    const bucket = buckets.get(index) ?? []; bucket.push(hit); buckets.set(index, bucket);
  }
  for (const event of events) if (event.kind === "note" && !buckets.has(event.measureIndex)) buckets.set(event.measureIndex, []);
  for (const issue of issues) if (!buckets.has(issue.measureIndex)) buckets.set(issue.measureIndex, []);
  const invalidMeasures = new Set(issues.map((issue) => issue.measureIndex));
  const conflictingMeasures = new Set(interpretation.conflicts?.map((item) => item.measureIndex));
  const candidatesByMeasure = new Map<number, InterpretationCandidate[]>();
  for (const candidate of candidates) {
    const list = candidatesByMeasure.get(candidate.measureIndex) ?? [];
    list.push(candidate); candidatesByMeasure.set(candidate.measureIndex, list);
  }
  const confirmations = new Map<number, NonNullable<RhythmDocument["reviewConfirmations"]>>();
  for (const entry of doc.reviewConfirmations ?? []) {
    const list = confirmations.get(entry.measureIndex) ?? [];
    list.push(entry); confirmations.set(entry.measureIndex, list);
  }
  const eventsByMeasure = new Map<number, NotationEvent[]>();
  const fingerprintHitMeasures = new Map<string, Set<number>>();
  for (const event of events) if (confirmations.has(event.measureIndex)) {
    const list = eventsByMeasure.get(event.measureIndex) ?? [];
    list.push(event); eventsByMeasure.set(event.measureIndex, list);
    for (const id of [...event.hitIds, ...(event.graceHitIds ?? [])]) {
      const measures = fingerprintHitMeasures.get(id) ?? new Set<number>();
      measures.add(event.measureIndex); fingerprintHitMeasures.set(id, measures);
    }
  }
  const fingerprintHits = new Map<number, typeof doc.hits>();
  for (const hit of doc.hits) for (const index of fingerprintHitMeasures.get(hit.id) ?? []) {
    const list = fingerprintHits.get(index) ?? []; list.push(hit); fingerprintHits.set(index, list);
  }
  let aggregate = 0, comparedCount = 0, totalWeight = 0;
  const regions: DraftRegion[] = [];
  for (const [index, hits] of [...buckets].sort(([a], [b]) => a - b)) {
    const localTimeline = timelineByMeasure.get(index) ?? [];
    const localSourceIds = new Set(hits.map((hit) => hit.id));
    const times = [...new Set(hits.map((hit) => hit.onsetMs))].sort((a, b) => a - b);
    const gaps = new Map(times.map((time, i) => [time, Math.min(i ? time - times[i - 1] : Infinity,
      i < times.length - 1 ? times[i + 1] - time : Infinity)]));
    let similaritySum = 0, errors = 0, maxErrorMs = 0, matched = 0, heldMismatch = false, severeTiming = false;
    let comparedDurations = 0, maxDurationErrorMs = 0, onsetMatches = true;
    const toleranceFor = (time: number) => Math.max(4, Math.min(ms * 0.1, 60, (gaps.get(time) ?? Infinity) * 0.45));
    for (const hit of hits) {
      const recovered = byId.get(hit.id);
      if (!recovered) continue;
      const error = Math.abs(recovered.timeMs - Math.max(0, hit.onsetMs - doc.offsetMs));
      const tolerance = toleranceFor(hit.onsetMs);
      onsetMatches &&= error <= tolerance;
      severeTiming ||= error > tolerance * 2;
      let closeness = Math.max(0, 1 - error / (tolerance * 2));
      if (hit.midi !== undefined && hit.releaseMs !== undefined) {
        const durationError = Math.abs((recovered.durationMs ?? 0) - (hit.releaseMs - hit.onsetMs));
        heldMismatch ||= durationError > tolerance;
        comparedDurations++; maxDurationErrorMs = Math.max(maxDurationErrorMs, durationError);
      }
      similaritySum += closeness;
      errors += error; maxErrorMs = Math.max(maxErrorMs, error); matched++;
    }
    const missing = hits.length - matched;
    const extra = localTimeline.filter((hit) => !localSourceIds.has(hit.id)).length;
    const weight = Math.max(hits.length, localTimeline.length);
    const similarity = weight ? Math.round(100 * similaritySum / weight) : null;
    const invalid = invalidMeasures.has(index);
    const choices = candidatesByMeasure.get(index) ?? [];
    const localHitsById = new Map(hits.map((hit) => [hit.id, hit]));
    const signatures = new Set(choices.filter((candidate) => {
      // Candidate scoring is for ranking, not a percentage. Only genuinely
      // different timing/spelling hypotheses can count as ambiguous.
      const reference = choices[0]?.score ?? 0;
      return candidate.score <= reference + (ms * 0.025) ** 2;
    }).map((candidate) => JSON.stringify(candidate.events.filter((event) => event.kind === "note")
      .map((event) => [event.hitIds, event.startQ,
        event.hitIds.some((id) => {
          const hit = localHitsById.get(id);
           return hit?.midi !== undefined && hit.releaseMs !== undefined && hit.releaseMs - hit.onsetMs >= Math.max(80, ms / 4);
        }) ? event.durationQ : null]))));
    const entries = confirmations.get(index);
    const confirmed = entries?.some((entry) => entry.fingerprint ===
      fingerprintParts(doc, eventsByMeasure.get(index) ?? [], fingerprintHits.get(index) ?? []));
    const reasons: string[] = [];
    if (invalid) reasons.push("structure");
    if (missing) reasons.push("missing");
    if (extra) reasons.push("extra");
    if (maxErrorMs > Math.min(ms * 0.05, 30)) reasons.push("timing");
    if (heldMismatch) reasons.push("duration");
    const conflict = conflictingMeasures.has(index);
    if (conflict) reasons.push("protected-boundary");
    if (signatures.size > 1) reasons.push("ambiguous");
    const status = conflict ? "unresolved" : invalid ? "invalid" : confirmed ? "confirmed" :
      conflict || heldMismatch || similarity !== null && (similarity < 65 || missing || extra || severeTiming) ? "unresolved" :
      reasons.length ? "ambiguous" : "ready";
    regions.push({ measureIndex: index, similarity: invalid ? null : similarity,
      meanErrorMs: matched ? errors / matched : 0, maxErrorMs, missing, extra, status, reasons,
      candidateCount: choices.length, onsetMatches: onsetMatches && !missing && !extra,
      durationMatches: comparedDurations ? !heldMismatch : null,
      maxDurationErrorMs: comparedDurations ? maxDurationErrorMs : null, comparedDurations });
    aggregate += similaritySum; totalWeight += weight; comparedCount += matched;
  }
  return { similarity: issues.length || !totalWeight ? null : Math.round(100 * aggregate / totalWeight),
    valid: issues.length === 0, issues, regions, onsetCount: doc.hits.length, comparedCount,
    onsetMatches: !!doc.hits.length && !issues.length && regions.every((region) => region.onsetMatches),
    durationMatches: regions.some((r) => r.comparedDurations)
      ? regions.every((r) => r.durationMatches !== false) : null };
}

/** Only structurally valid hypotheses may reach intent review. Try alternative
 * grids for failed measures automatically, while retaining explicit corrections. */
export function prepareValidatedDraft(doc: RhythmDocument): RhythmDocument {
  let next = doc;
  const interpretation = interpretRhythm(doc);
  const initial = verifyDraft(next, interpretation);
  const candidates = interpretation.candidates;
  const latestMeasure = Math.max(0, ...doc.hits.map((h) =>
    Math.floor(Math.max(0, h.onsetMs - doc.offsetMs) * doc.bpm / 60000 / measureQuarters(doc.meter))));
  const needsRepair = initial.regions.filter((region) => (region.status === "invalid" || region.status === "unresolved") &&
    (doc.notationVersion !== 2 || region.measureIndex >= latestMeasure - 1));
  for (const region of needsRepair) {
    let best = next;
    let bestSimilarity = region.status === "invalid" ? -1 : region.similarity ?? -1;
    // Coarse-to-fine ranking already includes the complexity penalty. Prefer
    // its first adequately fitting valid alternative, not a maximal grid.
    for (const candidate of candidates.filter((choice) => choice.measureIndex === region.measureIndex)) {
      const option = applyDraftCandidate(next, candidate);
      const result = verifyDraft(option).regions.find((item) => item.measureIndex === region.measureIndex);
      if (!result || result.status === "invalid") continue;
      if ((result.similarity ?? -1) > bestSimilarity) {
        best = option; bestSimilarity = result.similarity ?? -1;
        if (bestSimilarity >= 85) break;
      }
    }
    next = best;
  }
  return next;
}

export function confirmDraftRegion(doc: RhythmDocument, index: number): RhythmDocument {
  const report = verifyDraft(doc);
  const region = report.regions.find((item) => item.measureIndex === index);
  if (!region || region.status === "invalid" || region.status === "unresolved") {
    throw new Error("This region has not passed notation validation");
  }
  const events = interpretRhythm(doc).events;
  const connected = new Set(events.filter((event) => event.measureIndex === index && event.tie).map((e) => e.tie!.id));
  const frozen = events.filter((event) => (event.measureIndex === index || event.tie && connected.has(event.tie.id)) && event.kind === "note" && !event.locked);
  const ids = new Set(frozen.map((event) => event.id));
  const owned = new Set(doc.reviewConfirmations?.flatMap((entry) => entry.eventIds));
  const shared = events.filter((event) => owned.has(event.id) &&
    (event.measureIndex === index || event.tie && connected.has(event.tie.id))).map((event) => event.id);
  const previouslyFrozen = doc.reviewConfirmations?.find((entry) => entry.measureIndex === index)?.eventIds ?? [];
  const next = { ...doc, manualEvents: [...(doc.manualEvents ?? []).filter((event) => !ids.has(event.id)),
    ...frozen.map((event) => ({ ...event, locked: true }))] };
  return { ...next, reviewConfirmations: [...(doc.reviewConfirmations ?? []).filter((entry) => entry.measureIndex !== index),
    { measureIndex: index, fingerprint: regionFingerprint(next, index),
      eventIds: [...new Set([...previouslyFrozen, ...ids, ...shared])].filter((id) => next.manualEvents.some((event) => event.id === id)) }] };
}

/** A user explicitly reopening an approval only releases notes frozen by that
 * approval; earlier independent edits remain protected. */
export function reopenDraftRegion(doc: RhythmDocument, index: number): RhythmDocument {
  const entry = doc.reviewConfirmations?.find((item) => item.measureIndex === index);
  const ids = new Set(entry?.eventIds ?? []);
  const otherApprovals = new Set(doc.reviewConfirmations?.filter((item) => item.measureIndex !== index).flatMap((item) => item.eventIds));
  return { ...doc, manualEvents: doc.manualEvents?.map((event) => ids.has(event.id) && !otherApprovals.has(event.id) ? { ...event, locked: false } : event),
    reviewConfirmations: doc.reviewConfirmations?.filter((item) => item.measureIndex !== index) };
}
