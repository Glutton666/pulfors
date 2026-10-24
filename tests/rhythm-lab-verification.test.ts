import { test } from "node:test";
import assert from "node:assert/strict";
import { applyInterpretation, createRhythmDocument, fraction, insertNotationNote, insertRest,
  interpretRhythm, moveNotationEvent, setEventDuration, toNumber, validateRhythmDocument } from "../lib/rhythm-lab/engine";
import { applyDraftCandidate, confirmDraftRegion, prepareValidatedDraft, reconstructNotation,
  reopenDraftRegion, verifyDraft } from "../lib/rhythm-lab/verification";
import { notationSpelling } from "../lib/rhythm-lab/notation";
import { listRhythmDocuments, saveRhythmDocument, deleteRhythmDocument } from "../lib/rhythm-lab/storage";
import type { RhythmDocument } from "../lib/rhythm-lab/types";

const makeDoc = (times: number[]): RhythmDocument => ({
  ...createRhythmDocument({ bpm: 120 }),
  hits: times.map((onsetMs, index) => ({ id: `hit${index}`, onsetMs, drum: "snare" })),
});

test("exact quarters, triplets and 64ths round trip through notation at 100%", () => {
  for (const times of [[0, 500, 1000, 1500], [0, 500 / 6, 1000 / 6, 250], [0, 31.25, 62.5, 93.75]]) {
    const doc = prepareValidatedDraft(makeDoc(times));
    const report = verifyDraft(doc);
    assert.equal(report.valid, true);
    assert.equal(report.similarity, 100);
    assert.equal(report.comparedCount, times.length);
    assert.deepEqual(reconstructNotation(doc).map((hit) => hit.timeMs), times);
  }
});
test("equivalent grid representations are not spurious intent questions", () => {
  const report = verifyDraft(makeDoc([0, 500, 1000, 1500]));
  assert.equal(report.regions[0].status, "ready");
});
test("human jitter is reported without copying raw onsets into notation", () => {
  const doc = makeDoc([12, 508, 997, 1515]);
  const report = verifyDraft(doc);
  assert.equal(report.valid, true);
  assert.ok(report.similarity! < 100 && report.similarity! > 80);
  assert.equal(report.regions[0].maxErrorMs, 15);
  assert.deepEqual(reconstructNotation(doc).map((hit) => hit.timeMs), [0, 500, 1000, 1500]);
  assert.deepEqual(doc.hits.map((hit) => hit.onsetMs), [12, 508, 997, 1515]);
});
test("empty input is not falsely presented as a perfect match", () => {
  const report = verifyDraft(makeDoc([]));
  assert.equal(report.similarity, null);
  assert.equal(report.onsetCount, 0);
});
test("glyph duration and stored duration must agree before intent review", () => {
  const doc = makeDoc([0, 500]);
  const events = interpretRhythm(doc).events;
  events[0] = { ...events[0], value: 8 }; // Drawing says eighth, storage says sixteenth.
  const report = verifyDraft(doc, { events, candidates: [] });
  assert.equal(report.valid, false);
  assert.equal(report.similarity, null);
  assert.ok(report.issues.some((issue) => issue.code === "glyph-duration"));
});
test("dotted and tuplet glyphs independently decode their musical duration", () => {
  const doc = makeDoc([0]);
  const event = interpretRhythm(doc).events[0];
  assert.deepEqual(notationSpelling({ ...event, value: 8, durationQ: fraction(3, 4) }),
    { value: 8, dotted: true, durationQ: 0.75, supported: true });
  const triplet = notationSpelling({ ...event, value: 16, durationQ: fraction(1, 6), tuplet: { actual: 3, normal: 2 } });
  assert.equal(triplet.supported, true);
  assert.equal(triplet.durationQ, 1 / 6);
  assert.equal(notationSpelling({ ...event, durationQ: fraction(7, 20) }).supported, false);
});
test("missing raw strikes are calculation failures, not confirmable ambiguity", () => {
  const doc = insertRest(makeDoc([0, 500]), 1, 0.25);
  const report = verifyDraft(doc);
  assert.equal(report.valid, false);
  assert.ok(report.issues.some((issue) => issue.code === "missing-hit"));
  assert.throws(() => confirmDraftRegion(doc, 0));
});
test("duplicate references, collapsed strikes, and overlaps cannot get a valid percentage", () => {
  const doc = makeDoc([0, 500]);
  const result = interpretRhythm(doc);
  const duplicate = { ...result.events[0], id: "duplicate" };
  const report = verifyDraft(doc, { ...result, events: [...result.events, duplicate] });
  assert.equal(report.similarity, null);
  assert.ok(report.issues.some((issue) => issue.code === "duplicate-hit"));
  assert.ok(report.issues.some((issue) => issue.code === "overlap"));
  const collapsed = verifyDraft(makeDoc([0, 0]));
  assert.ok(collapsed.issues.some((issue) => issue.code === "collapsed-hits"));
});
test("bar duration and unfilled gaps are checked independently of hit matches", () => {
  const doc = makeDoc([0, 500]);
  const result = interpretRhythm(doc);
  const report = verifyDraft(doc, { ...result, events: result.events.filter((event) => event.kind === "note") });
  assert.equal(report.valid, false);
  assert.ok(report.issues.some((issue) => issue.code === "unfilled-gap"));
  assert.ok(report.issues.some((issue) => issue.code === "bar-total"));
});
test("poorly fitting but structurally valid edited notation remains unresolved", () => {
  const doc = makeDoc([0, 500, 1000]);
  const event = interpretRhythm(doc).events.find((item) => item.hitIds.includes("hit1"))!;
  const moved = moveNotationEvent(doc, event.id, 1.5);
  const report = verifyDraft(moved);
  assert.equal(report.valid, true);
  assert.ok(report.similarity! < 70);
  assert.equal(report.regions[0].status, "unresolved");
  assert.throws(() => confirmDraftRegion(moved, 0));
});
test("confirmation preserves measured similarity and freezes only approved notes", () => {
  const doc = makeDoc([12, 508, 997, 1515, 2000]);
  const before = verifyDraft(doc);
  const next = confirmDraftRegion(doc, 0);
  const after = verifyDraft(next);
  assert.equal(after.similarity, before.similarity);
  assert.equal(after.regions[0].status, "confirmed");
  assert.ok(next.manualEvents!.every((event) => event.locked && event.measureIndex === 0));
  assert.deepEqual(next.hits, doc.hits);
  assert.doesNotThrow(() => validateRhythmDocument(JSON.parse(JSON.stringify(next))));
  assert.equal(verifyDraft({ ...next, bpm: 121 }).regions[0].status === "confirmed", false);
});
test("a new input invalidates approval but cannot silently rewrite protected notes", () => {
  const doc = confirmDraftRegion(makeDoc([0, 500, 1000]), 0);
  const frozen = doc.manualEvents;
  const next = prepareValidatedDraft({ ...doc, hits: [...doc.hits, { id: "new", onsetMs: 1500, drum: "snare" }] });
  assert.equal(verifyDraft(next).regions[0].status === "confirmed", false);
  assert.deepEqual(next.manualEvents, frozen);
});
test("reopening approval does not release independently corrected notes", () => {
  let doc = makeDoc([0, 500, 1000]);
  const event = interpretRhythm(doc).events[0];
  doc = setEventDuration(doc, event.id, 0.5);
  doc = confirmDraftRegion(doc, 0);
  const reopened = reopenDraftRegion(doc, 0);
  assert.equal(reopened.manualEvents!.find((item) => item.id === event.id)!.locked, true);
  assert.ok(reopened.manualEvents!.some((item) => item.id !== event.id && !item.locked));
});
test("alternative drafts preserve protected corrections and original performance", () => {
  let doc = makeDoc([0, 125, 500]);
  const first = interpretRhythm(doc).events[0];
  doc = setEventDuration(doc, first.id, 0.125);
  const candidate = interpretRhythm(doc).candidates[1];
  const next = applyDraftCandidate(doc, candidate);
  assert.deepEqual(next.hits, doc.hits);
  assert.equal(toNumber(interpretRhythm(next).events.find((event) => event.id === first.id)!.durationQ), 0.125);
});
test("the app automatically replaces an invalid provisional grid before intent review", () => {
  const doc = makeDoc([0, 125, 250, 375]);
  const interpretation = interpretRhythm(doc);
  const invalidCandidate = {
    ...interpretation.candidates[0],
    events: [{
      ...interpretation.events[0], hitIds: doc.hits.map((hit) => hit.id),
      id: "collapsed", startQ: fraction(0), durationQ: fraction(1, 4),
    }],
  };
  const invalid = applyDraftCandidate(doc, invalidCandidate);
  assert.equal(verifyDraft(invalid).valid, false);
  const corrected = prepareValidatedDraft(invalid);
  assert.equal(verifyDraft(corrected).valid, true);
  assert.equal(verifyDraft(corrected).similarity, 100);
  assert.deepEqual(corrected.hits, doc.hits);
});
test("grace reconstruction does not copy the raw grace interval to manufacture a match", () => {
  const doc = applyInterpretation(makeDoc([0, 25, 500]), ["hit0", "hit1"], "flam");
  const recovered = reconstructNotation(doc);
  const grace = recovered.find((hit) => hit.id === "hit0")!;
  const principal = recovered.find((hit) => hit.id === "hit1")!;
  assert.equal(principal.timeMs - grace.timeMs, 31.25);
  assert.deepEqual(doc.hits.map((hit) => hit.onsetMs), [0, 25, 500]);
});
test("inserted notes are explicit extra notation, not invented raw hits", () => {
  const doc = insertNotationNote(makeDoc([0]), 2, 0.25, { drum: "snare" });
  const report = verifyDraft(doc);
  assert.equal(doc.hits.length, 1);
  assert.equal(report.regions[0].extra, 1);
  assert.equal(report.regions[0].status, "unresolved");
});
test("approved interpretation survives storage round trip without forcing 100%", async () => {
  const doc = confirmDraftRegion(makeDoc([12, 508, 997, 1515]), 0);
  await saveRhythmDocument(doc);
  const loaded = (await listRhythmDocuments()).find((item) => item.id === doc.id)!;
  assert.equal(verifyDraft(loaded).regions[0].status, "confirmed");
  assert.equal(verifyDraft(loaded).similarity, verifyDraft(doc).similarity);
  await deleteRhythmDocument(doc.id);
});
