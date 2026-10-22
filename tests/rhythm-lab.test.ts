import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyInterpretation, applyTuplet, buildRhythmPlayback, chooseCandidate, createRhythmDocument,
  fraction, insertRest, insertNotationNote, interpretRhythm, moveNotationEvent, setEventDuration, toNumber, validateRhythmDocument,
} from "../lib/rhythm-lab/engine";
import { calibrateOffset, evaluatePractice, timingTolerance } from "../lib/rhythm-lab/practice";
import { saveRhythmDocument, listRhythmDocuments, deleteRhythmDocument } from "../lib/rhythm-lab/storage";
import type { Hit, RhythmDocument } from "../lib/rhythm-lab/types";

const makeDoc = (times: number[], extra: Partial<RhythmDocument> = {}) => ({
  ...createRhythmDocument({ title: "test", bpm: 120 }),
  hits: times.map((onsetMs, i) => ({ id: `h${i}`, onsetMs })), ...extra,
});
const notes = (doc: RhythmDocument) => interpretRhythm(doc).events.filter((e) => e.kind === "note");
test("rhythm rational time reduces exactly", () => {
  assert.deepEqual(fraction(4, 24), { n: 1, d: 6 });
  assert.equal(toNumber(fraction(0)), 0);
  assert.throws(() => fraction(1, 0));
});
test("64th input remains distinct instead of collapsing into sixteenths", () => {
  const doc = makeDoc([0, 31.25, 62.5, 93.75]);
  const events = notes(doc);
  assert.equal(events.length, 4);
  assert.deepEqual(events.map((e) => toNumber(e.startQ)), [0, 1 / 16, 1 / 8, 3 / 16]);
});
test("24th equivalent is represented as sixteenth triplets", () => {
  const events = notes(makeDoc([0, 500 / 6, 1000 / 6, 250]));
  assert.equal(events.length, 4);
  assert.equal(toNumber(events[1].startQ), 1 / 6);
  assert.deepEqual(events[0].tuplet, { actual: 3, normal: 2 });
});
test("silence is an explicit rest and held keyboard duration is retained", () => {
  const doc = makeDoc([0, 1000]);
  doc.hits[0] = { ...doc.hits[0], releaseMs: 500, midi: 60 } as Hit;
  const result = interpretRhythm(doc).events;
  assert.equal(toNumber(result.find((e) => e.kind === "note")!.durationQ), 1);
  assert.ok(result.some((e) => e.kind === "rest" && toNumber(e.startQ) >= 1));
});
test("a keyboard chord is one notational onset but all sounding hits survive", () => {
  const doc = makeDoc([0, 0, 0]);
  doc.hits = doc.hits.map((h, i) => ({ ...h, midi: 60 + i * 4 }));
  assert.equal(notes(doc).length, 1);
  assert.equal(notes(doc)[0].midi!.length, 3);
  assert.equal(buildRhythmPlayback(doc, "notation").length, 3);
});
test("flam correction links grace to principal without mutating original hits", () => {
  const doc = makeDoc([0, 25, 500]);
  const before = JSON.stringify(doc.hits);
  const next = applyInterpretation(doc, ["h0", "h1"], "flam");
  assert.equal(JSON.stringify(next.hits), before);
  const event = notes(next).find((e) => e.hitIds.includes("h1"))!;
  assert.deepEqual(event.graceHitIds, ["h0"]);
  assert.equal(event.locked, true);
  const original = buildRhythmPlayback(next, "original");
  assert.deepEqual(original.map((h) => h.timeMs), [0, 25, 500]);
  const changed = buildRhythmPlayback(next, "notation");
  const a = changed.find((h) => h.id === "h0")!, b = changed.find((h) => h.id === "h1")!;
  assert.equal(b.timeMs - a.timeMs, 25);
});
test("drag needs at least three recorded hits", () => {
  assert.throws(() => applyInterpretation(makeDoc([0, 30]), ["h0", "h1"], "drag"));
});
test("protected interpretation is not rewritten by simplification or new input", () => {
  let doc = applyInterpretation(makeDoc([0, 25, 500]), ["h0", "h1"], "flam");
  const before = notes(doc).find((e) => e.hitIds.includes("h1"));
  doc = { ...doc, simplification: 1, hits: [...doc.hits, { id: "new", onsetMs: 2050 }] };
  assert.deepEqual(notes(doc).find((e) => e.hitIds.includes("h1")), before);
  assert.ok(notes(doc).some((e) => e.hitIds.includes("new")));
});
test("future measures cannot change an earlier automatic measure", () => {
  const doc = makeDoc([0, 125, 500]);
  const first = interpretRhythm(doc).events.filter((e) => e.measureIndex === 0);
  const next = interpretRhythm({ ...doc, hits: [...doc.hits, { id: "future", onsetMs: 3210 }] }).events.filter((e) => e.measureIndex === 0);
  assert.deepEqual(next, first);
});
test("candidate selection preserves protected corrected events", () => {
  const doc = applyInterpretation(makeDoc([0, 25, 500]), ["h0", "h1"], "flam");
  const protectedNote = notes(doc).find((e) => e.hitIds.includes("h1"));
  const candidate = interpretRhythm(doc).candidates.find((c) => c.grid === 16) ?? interpretRhythm(doc).candidates[0];
  assert.deepEqual(notes(chooseCandidate(doc, candidate)).find((e) => e.hitIds.includes("h1")), protectedNote);
});
test("moving one note preserves original input and unselected note timing", () => {
  const doc = makeDoc([0, 500, 1000]);
  const before = notes(doc);
  const next = moveNotationEvent(doc, before[1].id, 1.5);
  assert.equal(toNumber(notes(next).find((e) => e.id === before[1].id)!.startQ), 1.5);
  assert.equal(toNumber(notes(next).find((e) => e.id === before[2].id)!.startQ), 2);
  assert.deepEqual(next.hits, doc.hits);
});
test("explicit duration supports 64th and exact rational triplets", () => {
  const doc = makeDoc([0]);
  const id = notes(doc)[0].id;
  const sixtyFourth = setEventDuration(doc, id, 1 / 16);
  assert.equal(notes(sixtyFourth)[0].value, 64);
  assert.deepEqual(notes(setEventDuration(doc, id, 1 / 6))[0].tuplet, { actual: 3, normal: 2 });
});
test("a manually inserted rest does not regenerate an automatic note over it", () => {
  const doc = insertRest(makeDoc([0, 500]), 1, 0.5);
  assert.equal(notes(doc).length, 1);
  assert.ok(interpretRhythm(doc).events.some((e) => e.kind === "rest" && e.locked));
});
test("stopped insertion is audible notation but never invents raw input", () => {
  const doc = insertNotationNote(makeDoc([0]), 2, 0.5, { midi: 72 });
  assert.equal(doc.hits.length, 1);
  assert.equal(buildRhythmPlayback(doc, "original").length, 1);
  assert.ok(buildRhythmPlayback(doc, "notation").some((h) => h.midi === 72 && h.timeMs === 1000 && h.durationMs === 250));
  assert.doesNotThrow(() => validateRhythmDocument(JSON.parse(JSON.stringify(doc))));
});
test("mixed-duration Herta uses requested ratio, not number of elements", () => {
  let doc = makeDoc([0, 125, 250, 500]);
  const ids = notes(doc).map((e) => e.id);
  for (const [i, id] of ids.entries()) doc = setEventDuration(doc, id, i < 2 ? 0.25 : 0.5);
  doc = applyTuplet(doc, ids, 3, 2);
  const selected = notes(doc);
  assert.equal(doc.tuplets[0].actual, 3);
  assert.equal(doc.tuplets[0].eventIds.length, 4);
  assert.ok(Math.abs(toNumber(selected[3].startQ) + toNumber(selected[3].durationQ) - 1) < 1e-8);
});
test("nested tuplets retain both ratios and multiply exact times", () => {
  let doc = makeDoc([0, 500, 1000]);
  const ids = notes(doc).map((e) => e.id);
  doc = applyTuplet(doc, ids, 3, 2);
  doc = applyTuplet(doc, ids.slice(0, 2), 5, 3, doc.tuplets[0].id);
  assert.equal(doc.tuplets.length, 2);
  assert.equal(toNumber(notes(doc)[1].startQ), 0.4);
  assert.doesNotThrow(() => validateRhythmDocument(JSON.parse(JSON.stringify(doc))));
});
test("non-binary tuplet ratios retain exact fractions without clock rounding", () => {
  let doc = makeDoc([0, 500]);
  const ids = notes(doc).map((e) => e.id);
  doc = applyTuplet(doc, ids, 7, 6);
  assert.deepEqual(notes(doc)[1].startQ, { n: 6, d: 7 });
});
test("tuplets can reference events on both sides of a barline", () => {
  let doc = makeDoc([1750, 2000, 2250]);
  doc = applyTuplet(doc, notes(doc).map((e) => e.id), 7, 6);
  assert.ok(notes(doc).some((e) => e.measureIndex === 0));
  assert.ok(notes(doc).some((e) => e.measureIndex === 1));
  assert.doesNotThrow(() => validateRhythmDocument(doc));
});
test("invalid documents fail explicitly instead of accepting arbitrary values", () => {
  const doc = makeDoc([0]);
  assert.throws(() => validateRhythmDocument({ ...doc, bpm: NaN }));
  assert.throws(() => validateRhythmDocument({ ...doc, hits: [doc.hits[0], doc.hits[0]] }));
  assert.throws(() => validateRhythmDocument({ ...doc, overrides: [{ id: "o", kind: "flam", hitIds: ["missing"] }] }));
});
test("calibration ignores warm-up taps and isolated outlier", () => {
  const expected = Array.from({ length: 16 }, (_, i) => i * 500);
  const taps = expected.map((v, i) => v + (i < 3 ? 180 : i === 9 ? 400 : 35));
  assert.equal(calibrateOffset(taps, expected), 35);
  assert.throws(() => calibrateOffset([0], [0]));
});
test("practice tolerance follows selected difficulty and neighboring distance", () => {
  assert.equal(timingTolerance(120, "easy"), 75);
  assert.equal(timingTolerance(120, "normal"), 50);
  assert.equal(timingTolerance(120, "strict"), 25);
  assert.equal(timingTolerance(120, "normal", 31.25), 14.0625);
});
test("practice uses one-to-one matching and 70/30 score", () => {
  const expected = [0, 500, 1000].map((timeMs, i) => ({ id: `e${i}`, timeMs }));
  const result = evaluatePractice(expected, [{ id: "a0", timeMs: 0 }, { id: "a1", timeMs: 1025 }], 120, "normal");
  assert.equal(result.matched, 2);
  assert.equal(result.missed, 1);
  assert.equal(result.extra, 0);
  assert.equal(result.score, Math.round((200 / 3) * 0.7 + 75 * 0.3));
});
test("practice counts grace hits as expected events, not automatic extras", () => {
  const doc = applyInterpretation(makeDoc([0, 25, 500]), ["h0", "h1"], "flam");
  const expected = buildRhythmPlayback(doc, "original");
  const result = evaluatePractice(expected, expected.map((h) => ({ ...h, id: `played-${h.id}` })), 120, "normal");
  assert.equal(result.score, 100);
  assert.equal(result.extra, 0);
});
test("local rhythm storage round-trips corrections and deletes without legacy keys", async () => {
  const doc = applyInterpretation(makeDoc([0, 25, 500]), ["h0", "h1"], "flam");
  await saveRhythmDocument(doc);
  const loaded = (await listRhythmDocuments()).find((d) => d.id === doc.id)!;
  assert.deepEqual(loaded.hits, doc.hits);
  assert.deepEqual(loaded.overrides, doc.overrides);
  await deleteRhythmDocument(doc.id);
  assert.equal((await listRhythmDocuments()).some((d) => d.id === doc.id), false);
});
