import { applyTuplet, buildRhythmPlayback, createRhythmDocument, insertNotationNote, interpretRhythm,
  moveNotationEvent, setEventDuration, toNumber, validateRhythmDocument } from "../lib/rhythm-lab/engine";
import { applyDraftCandidate, confirmDraftRegion, prepareValidatedDraft, reconstructNotation, reopenDraftRegion, verifyDraft } from "../lib/rhythm-lab/verification";
import { notationSpelling } from "../lib/rhythm-lab/notation";
import { saveRhythmDocument, listRhythmDocuments } from "../lib/rhythm-lab/storage";
import { sanitizePracticeEntry } from "../lib/backup/shared";
import type { Hit, RhythmDocument } from "../lib/rhythm-lab/types";

const pad = (times: number[], extra: Partial<RhythmDocument> = {}): RhythmDocument => ({
  ...createRhythmDocument({ bpm: 120, title: "Interpretation fixtures" }), ...extra,
  hits: times.map((onsetMs, i) => ({ id: `h${i}`, onsetMs, releaseMs: onsetMs + 20, drum: "snare" })),
});
const keys = (gates: [number, number, number][], extra: Partial<RhythmDocument> = {}): RhythmDocument => ({
  ...createRhythmDocument({ bpm: 120, title: "Independent gates" }), ...extra,
  hits: gates.map(([midi, onsetMs, releaseMs], i) => ({ id: `k${i}`, midi, onsetMs, releaseMs })),
});
const notes = (doc: RhythmDocument) => interpretRhythm(doc).events.filter((e) => e.kind === "note");
const signature = (doc: RhythmDocument) => interpretRhythm(doc).events.map((e) => [e.kind, toNumber(e.startQ), toNumber(e.durationQ)]);

test.each([
  [[0], [0], [0.25]],
  [[0, 500, 1000], [0, 1, 2], [0.25, 0.25, 0.25]],
  [[0, 250, 750, 1500], [0, 0.5, 1.5, 3], [0.25, 0.25, 0.25, 0.25]],
  [[0, 2000], [0, 4], [0.25, 0.25]],
  [[0, 31.25, 62.5, 93.75], [0, 0.0625, 0.125, 0.1875], [0.0625, 0.0625, 0.0625, 0.25]],
  [[500, 1000], [1, 2], [0.25, 0.25]],
  [[1875, 2000], [3.75, 4], [0.25, 0.25]],
] as [number[], number[], number[]][])("known percussion score for %j has exact short notes and complete rests", (times, starts, durations) => {
  const doc = pad(times), events = interpretRhythm(doc).events;
  expect(notes(doc).map((e) => toNumber(e.startQ))).toEqual(starts);
  expect(notes(doc).map((e) => toNumber(e.durationQ))).toEqual(durations);
  expect(events.every((e) => notationSpelling(e).supported)).toBe(true);
  expect(verifyDraft(doc).issues).toEqual([]);
  expect(reconstructNotation(doc).map((hit) => hit.timeMs)).toEqual(times);
  const total = Math.max(...events.map((e) => e.measureIndex + 1)) * 4;
  expect(events.reduce((sum, e) => sum + toNumber(e.durationQ), 0)).toBeCloseTo(total, 9);
  expect(signature(prepareValidatedDraft(doc))).toEqual(signature(doc));
});

test("quarter-spaced attacks have explicit dotted-eighth silence, not sustained quarters", () => {
  expect(signature(pad([0, 500, 1000, 1500]))).toEqual([
    ["note", 0, 0.25], ["rest", 0.25, 0.75], ["note", 1, 0.25], ["rest", 1.25, 0.75],
    ["note", 2, 0.25], ["rest", 2.25, 0.75], ["note", 3, 0.25], ["rest", 3.25, 0.75],
  ]);
});

test("binary sixteenths and a triplet mix inside one beat without a whole-measure tuplet", () => {
  const doc = pad([0, 125, 250, 1000 / 3, 1250 / 3]);
  const events = notes(doc);
  expect(events.map((e) => toNumber(e.startQ))).toEqual([0, 0.25, 0.5, 2 / 3, 5 / 6]);
  expect(events.map((e) => toNumber(e.durationQ))).toEqual([0.25, 0.25, 1 / 6, 1 / 6, 1 / 6]);
  expect(events.slice(0, 2).every((e) => !e.tuplet)).toBe(true);
  expect(new Set(events.slice(2).map((e) => e.tuplet?.groupId)).size).toBe(1);
  expect(events.slice(2).every((e) => e.tuplet?.actual === 3 && e.tuplet.normal === 2)).toBe(true);
  expect(interpretRhythm(doc).events.filter((e) => e.measureIndex === 0 && toNumber(e.startQ) >= 1).every((e) => !e.tuplet)).toBe(true);
  expect(verifyDraft(doc).valid).toBe(true);
});

test.each([0, 0.5, 1])("local complexity cannot discard an exact mixed reading at simplification %s", (simplification) => {
  const doc = pad([0, 125, 250, 1000 / 3, 1250 / 3], { simplification });
  expect(reconstructNotation(doc).map((hit) => hit.timeMs)).toEqual([0, 125, 250, 1000 / 3, 1250 / 3]);
});

test.each([
  [0, 500 / 6, 1000 / 6, 250, 2000 / 6, 2500 / 6],
  [80, 537, 1261], [17, 326, 799, 1277, 1812],
  [0, 458, 1183], [105, 318, 674, 1223, 1768, 2111],
])("every intermediate live state in %j remains drawable and preserves source order", (...times) => {
  // Jest spreads the array into arguments for test.each.
  for (let length = 1; length <= times.length; length++) {
    const doc = pad(times.slice(0, length)), before = JSON.stringify(doc.hits);
    expect(verifyDraft(doc).issues).toEqual([]);
    expect(reconstructNotation(doc).map((h) => h.id)).toEqual(doc.hits.map((h) => h.id));
    expect(signature(prepareValidatedDraft(doc))).toEqual(signature(doc));
    expect(JSON.stringify(doc.hits)).toBe(before);
  }
});

test("independent chord releases and later held-over attacks do not share their longest gate", () => {
  const doc = keys([[60, 0, 250], [64, 0, 1000], [67, 500, 1250]]);
  expect(reconstructNotation(doc).map((hit) => [hit.midi, hit.timeMs, hit.durationMs])).toEqual([
    [60, 0, 250], [64, 0, 1000], [67, 500, 750],
  ]);
  expect(new Set(notes(doc).map((e) => e.voiceId)).size).toBe(3);
  expect(verifyDraft(doc)).toMatchObject({ valid: true, onsetMatches: true, durationMatches: true });
});

test("even short keyboard gates use measured release, not percussion default or the next onset", () => {
  const doc = keys([[60, 0, 62.5], [64, 250, 375]]);
  expect(reconstructNotation(doc).map((hit) => hit.durationMs)).toEqual([62.5, 125]);
  expect(verifyDraft(doc).durationMatches).toBe(true);
});

test("long keyboard sound crosses barlines using ties without adding attacks", () => {
  const doc = keys([[60, 1750, 5750]]);
  const events = notes(doc);
  expect(events.length).toBeGreaterThan(2);
  expect(events[0].tie).toMatchObject({ part: 0, count: events.length });
  expect(new Set(events.map((e) => e.tie?.id)).size).toBe(1);
  expect(new Set(events.map((e) => e.measureIndex))).toEqual(new Set([0, 1, 2]));
  expect(events.reduce((sum, e) => sum + notationSpelling(e).durationQ, 0)).toBe(8);
  expect(reconstructNotation(doc)).toMatchObject([{ id: "k0", timeMs: 1750, durationMs: 4000 }]);
  expect(buildRhythmPlayback(doc, "notation")).toEqual(reconstructNotation(doc));
  expect(verifyDraft(doc).issues).toEqual([]);
});

test("a tuplet group spanning a 5/16 barline retains one ratio and group identity", () => {
  const doc = pad([500, 1750 / 3, 2000 / 3], { meter: { numerator: 5, denominator: 16 } });
  const events = notes(doc);
  expect(events.some((e) => e.tie)).toBe(true);
  expect(new Set(events.map((e) => e.tuplet?.groupId)).size).toBe(1);
  expect(events.every((e) => e.tuplet?.actual === 3 && e.tuplet.normal === 2)).toBe(true);
  expect(reconstructNotation(doc).map((hit) => hit.timeMs)).toEqual([500, 1750 / 3, 2000 / 3]);
  expect(verifyDraft(doc).issues).toEqual([]);
});

test("independent reconstruction cannot borrow source onset or release to fabricate a match", () => {
  const doc = keys([[60, 1750, 5750], [64, 2000, 2500]]);
  const score = interpretRhythm(doc).events, expected = reconstructNotation(doc, score);
  const changed = { ...doc, hits: doc.hits.map((h) => ({ ...h, onsetMs: h.onsetMs + 71, releaseMs: h.releaseMs! + 999 })) };
  expect(reconstructNotation(changed, score)).toEqual(expected);
});

test("a valid start match does not conceal a manually shortened keyboard duration", () => {
  const doc = keys([[60, 0, 1000]]);
  const changed = setEventDuration(doc, notes(doc)[0].id, 0.25);
  const report = verifyDraft(changed);
  expect(report).toMatchObject({ valid: true, onsetMatches: true, durationMatches: false });
  expect(report.regions[0]).toMatchObject({ status: "unresolved", maxDurationErrorMs: 875 });
  expect(() => confirmDraftRegion(changed, 0)).toThrow();
  expect(verifyDraft(pad([0, 500])).durationMatches).toBeNull();
});

test("malformed or missing tie pieces cannot pass structure or create extra attacks", () => {
  const doc = keys([[60, 1750, 5750]]), result = interpretRhythm(doc);
  const broken = { ...result, events: result.events.filter((e) => !e.tie || e.tie.part !== 1) };
  expect(verifyDraft(doc, broken).issues.map((issue) => issue.code)).toContain("tie-chain");
  expect(verifyDraft(doc, broken).valid).toBe(false);
});

test("moving and resizing a tied note edits the complete sound while retaining raw input", () => {
  const doc = keys([[60, 1750, 5750]]), root = notes(doc)[0];
  const moved = moveNotationEvent(doc, root.id, 4);
  expect(reconstructNotation(moved)).toMatchObject([{ timeMs: 2000, durationMs: 4000 }]);
  const resized = setEventDuration(moved, root.id, 5);
  expect(reconstructNotation(resized)).toMatchObject([{ timeMs: 2000, durationMs: 2500 }]);
  expect(resized.hits).toEqual(doc.hits);
  expect(validateRhythmDocument(JSON.parse(JSON.stringify(resized))).manualEvents).toEqual(resized.manualEvents);
});

test("approving a bar freezes complete connected sounds and survives reopen/serialization", () => {
  const source = keys([[60, 1750, 5750]]);
  const confirmed = confirmDraftRegion(source, 0);
  expect(confirmed.manualEvents!.length).toBe(notes(source).length);
  expect(confirmed.manualEvents!.every((e) => e.locked)).toBe(true);
  const loaded = validateRhythmDocument(JSON.parse(JSON.stringify(confirmed)));
  expect(verifyDraft(loaded).regions.find((r) => r.measureIndex === 0)?.status).toBe("confirmed");
  const open = reopenDraftRegion(loaded, 0);
  expect(open.manualEvents!.every((e) => !e.locked)).toBe(true);
  expect(reconstructNotation(open)).toEqual(reconstructNotation(source));
});

test("new input/candidates cannot rewrite user edits or history outside adjacent-bar context", () => {
  const initial = pad([0, 125, 500]);
  const frozen = confirmDraftRegion(initial, 0);
  const extended = prepareValidatedDraft({ ...frozen, hits: [...frozen.hits, { id: "future", onsetMs: 6210, drum: "snare" }] });
  expect(extended.manualEvents).toEqual(frozen.manualEvents);
  expect(interpretRhythm(extended).events.filter((e) => e.measureIndex === 0)).toEqual(interpretRhythm(frozen).events);
  const candidate = interpretRhythm(extended).candidates.find((c) => c.measureIndex === 0)!;
  expect(applyDraftCandidate(extended, candidate).manualEvents!.filter((e) => e.locked)).toEqual(frozen.manualEvents);
  const unprotected = { ...initial, hits: [...initial.hits, { id: "future", onsetMs: 6210, drum: "snare" as const }] };
  expect(interpretRhythm(unprotected).events.filter((e) => e.measureIndex === 0)).toEqual(interpretRhythm(initial).events);
});

test("legacy documents keep the old reader until explicit opt-in without changing raw or manual data", () => {
  const legacy = { ...pad([0, 500]), notationVersion: undefined };
  expect(notes(legacy).map((e) => toNumber(e.durationQ))).toEqual([1, 1]);
  const loaded = validateRhythmDocument(JSON.parse(JSON.stringify(legacy)));
  expect(loaded.notationVersion).toBeUndefined();
  const upgraded = { ...loaded, notationVersion: 2 as const };
  expect(notes(upgraded).map((e) => toNumber(e.durationQ))).toEqual([0.25, 0.25]);
  expect(upgraded.hits).toEqual(legacy.hits);
});

test("ties, voices and nested cross-bar tuplet ratios survive main-book storage and backup", async () => {
  const source = keys([[60, 1750, 2250], [64, 2000, 2500]]);
  const grouped = applyTuplet(source, notes(source).map((e) => e.id), 7, 6);
  await saveRhythmDocument(grouped);
  const loaded = (await listRhythmDocuments()).find((doc) => doc.id === grouped.id)!;
  expect(loaded.hits).toEqual(source.hits);
  expect(loaded.tuplets).toEqual(grouped.tuplets);
  expect(reconstructNotation(loaded)).toEqual(reconstructNotation(grouped));
  const entry: any = { id: "backup", label: loaded.title, mode: "rhythm", rhythmDocument: loaded,
    bpm: 120, beatsPerMeasure: 4, beatTypes: [], beatSubdivisions: {}, barRepeats: {}, barLoopMode: "once", subdivisionPattern: [], createdAt: loaded.createdAt };
  const restored = sanitizePracticeEntry(JSON.parse(JSON.stringify(entry)));
  expect(restored?.rhythmDocument).toEqual(loaded);
});

test("overlapping bar approvals keep their shared tie protected until both are reopened", () => {
  const source = keys([[60, 1750, 5750]]);
  const first = confirmDraftRegion(source, 0);
  const second = confirmDraftRegion(first, 1);
  expect(second.reviewConfirmations![1].eventIds).toEqual(first.reviewConfirmations![0].eventIds);
  const oneOpen = reopenDraftRegion(second, 0);
  expect(oneOpen.manualEvents!.every((e) => e.locked)).toBe(true);
  expect(verifyDraft(oneOpen).regions.find((r) => r.measureIndex === 1)?.status).toBe("confirmed");
  expect(reopenDraftRegion(oneOpen, 1).manualEvents!.every((e) => !e.locked)).toBe(true);
});

test("a continuation drag moves the connected gate by its displacement, not its own absolute start", () => {
  const doc = keys([[60, 1750, 5750]]);
  const continuation = notes(doc).find((e) => e.tie?.part === 1)!;
  const moved = moveNotationEvent(doc, continuation.id, toNumber(continuation.startQ) + 0.5, false);
  expect(reconstructNotation(moved)).toMatchObject([{ timeMs: 2000, durationMs: 4000 }]);
  expect(verifyDraft(moved).issues).toEqual([]);
});

test("editing a nested tied tuplet keeps valid group references and serializes without lost gates", () => {
  const source = keys([[60, 1750, 2250], [64, 2500, 2750]]);
  const group = applyTuplet(source, notes(source).map((e) => e.id), 7, 6);
  const root = notes(group)[0];
  const nested = applyTuplet(group, notes(group).map((e) => e.id), 3, 2, group.tuplets[0].id);
  expect(verifyDraft(nested).issues).toEqual([]);
  const moved = moveNotationEvent(nested, root.id, 4, false);
  expect(verifyDraft(moved).issues).toEqual([]);
  const loaded = validateRhythmDocument(JSON.parse(JSON.stringify(moved)));
  expect(loaded.tuplets).toEqual(moved.tuplets);
  expect(reconstructNotation(loaded).length).toBe(2);
});

test("an accepted coarse boundary note is not silently moved by adjacent-bar context", () => {
  const source = pad([1990]);
  const approved = confirmDraftRegion(source, 1);
  const changed = { ...approved, hits: [...approved.hits, { id: "boundary", onsetMs: 2005, drum: "snare" as const }] };
  const before = JSON.stringify(approved.manualEvents);
  const report = verifyDraft(changed);
  expect(report.regions.find((r) => r.measureIndex === 1)?.status).toBe("unresolved");
  expect(report.regions.find((r) => r.measureIndex === 1)?.reasons).toContain("protected-boundary");
  expect(JSON.stringify(prepareValidatedDraft(changed).manualEvents)).toBe(before);
  expect(changed.hits[0].onsetMs).toBe(1990);
});

test("imports reject missing tie pieces, noninteger nested ratios and reversed group bounds", () => {
  const source = confirmDraftRegion(keys([[60, 1750, 5750]]), 0);
  expect(() => validateRhythmDocument({ ...source, manualEvents: source.manualEvents!.slice(1) })).toThrow(/tie chain/);
  const note = notes(pad([0]))[0];
  expect(() => validateRhythmDocument({ ...pad([0]), manualEvents: [{ ...note, tuplet: { actual: 3.1, normal: 2 } }] })).toThrow(/ratio/);
  expect(() => validateRhythmDocument({ ...pad([0]), manualEvents: [{ ...note, tuplet: { actual: 3, normal: 2,
    startQ: { n: 1, d: 1 }, endQ: { n: 0, d: 1 } } }] })).toThrow();
});
