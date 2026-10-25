import { test } from "node:test";
import assert from "node:assert/strict";
import { createRhythmDocument, fraction, interpretRhythm, toNumber } from "../lib/rhythm-lab/engine";
import { compareTapTiming } from "../lib/rhythm-lab/timing-feedback";
import { reconstructNotation, verifyDraft } from "../lib/rhythm-lab/verification";
import type { RhythmDocument } from "../lib/rhythm-lab/types";

const makeDoc = (times: number[], extra: Partial<RhythmDocument> = {}): RhythmDocument => ({
  ...createRhythmDocument({ bpm: 120 }),
  hits: times.map((onsetMs, i) => ({ id: `tap-${i}`, onsetMs, releaseMs: onsetMs + 20, drum: "snare" })),
  ...extra,
});
const noteDurations = (doc: RhythmDocument) => interpretRhythm(doc).events.filter((event) => event.kind === "note").map((event) => toNumber(event.durationQ));

test("different intervals change rests and onsets, not the default short percussion gate", () => {
  assert.deepEqual(noteDurations(makeDoc([0, 500, 1000, 1500])), [0.25, 0.25, 0.25, 0.25]);
  assert.deepEqual(noteDurations(makeDoc([0, 250, 500, 750])), [0.25, 0.25, 0.25, 0.25]);
  assert.deepEqual(noteDurations(makeDoc([0, 125, 250, 375])), [0.25, 0.25, 0.25, 0.25]);
});

test("mixed and dotted intervals leave explicit silence, preserving all original down/up timestamps", () => {
  const doc = makeDoc([0, 250, 750, 1500]);
  const before = JSON.stringify(doc.hits);
  assert.deepEqual(noteDurations(doc), [0.25, 0.25, 0.25, 0.25]);
  assert.deepEqual(reconstructNotation(doc).map((hit) => hit.timeMs), [0, 250, 750, 1500]);
  assert.equal(JSON.stringify(doc.hits), before);
  assert.equal(verifyDraft(doc).valid, true);
});

test("the final percussion gate never copies the preceding gap or a quarter", () => {
  assert.deepEqual(noteDurations(makeDoc([0])), [0.25]);
  assert.deepEqual(noteDurations(makeDoc([0, 250])), [0.25, 0.25]);
  assert.deepEqual(noteDurations(makeDoc([0, 250, 1000])), [0.25, 0.25, 0.25]);
});

test("initial silence remains explicit, and context across a bar is clipped to its boundary", () => {
  const delayed = makeDoc([500, 1000]);
  const first = interpretRhythm(delayed).events[0];
  assert.equal(first.kind, "rest");
  assert.equal(toNumber(first.durationQ), 1);
  const doc = makeDoc([0, 500, 1500, 2000, 2250]);
  assert.deepEqual(noteDurations(doc), [0.25, 0.25, 0.25, 0.25, 0.25]);
  assert.equal(verifyDraft(doc).valid, true);
});

test("keyboard holds, independent releases, and intervening rests are not replaced by intervals", () => {
  const doc = makeDoc([0, 1000]);
  doc.hits = doc.hits.map((hit) => ({ ...hit, drum: undefined, midi: 60, releaseMs: hit.onsetMs + 250 }));
  assert.deepEqual(noteDurations(doc), [0.5, 0.5]);
  assert.ok(interpretRhythm(doc).events.some((event) => event.kind === "rest" && toNumber(event.startQ) === 0.5));
});

test("pad contact length is not misreported as a held-note mismatch", () => {
  const doc = makeDoc([0, 500, 1000, 1500]);
  doc.hits = doc.hits.map((hit) => ({ ...hit, releaseMs: hit.onsetMs + 170 }));
  assert.deepEqual(noteDurations(doc), [0.25, 0.25, 0.25, 0.25]);
  assert.equal(verifyDraft(doc).similarity, 100);
});

test("feedback compares actual spacing to independent score timing and reports real jitter", () => {
  const exact = makeDoc([0, 500, 1000]);
  const match = compareTapTiming(exact, interpretRhythm(exact));
  assert.equal(match.matches, true);
  assert.equal(match.maxIntervalErrorMs, 0);
  const jittered = makeDoc([12, 508, 997, 1515]);
  const feedback = compareTapTiming(jittered, interpretRhythm(jittered));
  assert.deepEqual(feedback.intervals.map((row) => row.actualMs), [496, 489, 518]);
  assert.deepEqual(feedback.intervals.map((row) => row.notationMs), [500, 500, 500]);
  assert.deepEqual(feedback.intervals.map((row) => row.errorMs), [4, 11, -18]);
});

test("equal note counts cannot hide incorrect score spacing or collapsed taps", () => {
  const doc = makeDoc([0, 500, 1000]);
  const interpretation = interpretRhythm(doc);
  const wrong = { ...interpretation, events: interpretation.events.map((event) =>
    event.hitIds.includes("tap-1") ? { ...event, startQ: fraction(1, 2) } : event) };
  const feedback = compareTapTiming(doc, wrong);
  assert.equal(feedback.matches, false);
  assert.equal(feedback.maxIntervalErrorMs, 250);
  const collapsed = { ...interpretation, events: interpretation.events.filter((event) => !event.hitIds.includes("tap-1")) };
  const missing = compareTapTiming(doc, collapsed);
  assert.equal(missing.matches, false);
  assert.equal(missing.intervals[0].notationMs, null);
});

test("empty or one-tap input never claims a verified interval", () => {
  for (const times of [[], [0]]) {
    const doc = makeDoc(times);
    const feedback = compareTapTiming(doc, interpretRhythm(doc));
    assert.equal(feedback.matches, false);
    assert.equal(feedback.meanIntervalErrorMs, null);
  }
});

test("live automatic notation remains structurally valid for off-grid mixed intervals", () => {
  // Real-world delayed first strike plus unequal spacing must not select a
  // numerically close exotic grid whose dotted note/rest glyph is incorrect.
  for (const times of [
    [80, 537, 1261], [75, 532, 1256], [17, 326, 799, 1277, 1812],
    [0, 458, 1183], [105, 318, 674, 1223, 1768, 2111],
  ]) {
    for (let length = 1; length <= times.length; length++) {
      const doc = makeDoc(times.slice(0, length));
      const report = verifyDraft(doc);
      assert.deepEqual(report.issues, []);
      assert.equal(report.comparedCount, length);
    }
  }
});
