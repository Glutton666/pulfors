import { createRhythmDocument, interpretRhythm, toNumber, validateRhythmDocument } from "../lib/rhythm-lab/engine";
import { reconstructNotation, verifyDraft, confirmDraftRegion, prepareValidatedDraft } from "../lib/rhythm-lab/verification";
import type { RhythmDocument } from "../lib/rhythm-lab/types";

const take = (times: number[], extra: Partial<RhythmDocument> = {}): RhythmDocument => ({
  ...createRhythmDocument({ bpm: 120 }), ...extra,
  hits: times.map((onsetMs, i) => ({ id: `h${i}`, onsetMs, releaseMs: onsetMs + 20, drum: "snare" })),
});
const notes = (doc: RhythmDocument) => interpretRhythm(doc).events.filter((e) => e.kind === "note");

test("small jitter resolves to ordinary rhythms without changing the raw take", () => {
  const doc = take([12, 513, 992, 1515]);
  const raw = JSON.stringify(doc.hits);
  expect(reconstructNotation(doc).map((e) => e.timeMs)).toEqual([0, 500, 1000, 1500]);
  expect(notes(doc).every((e) => !e.tuplet)).toBe(true);
  expect(JSON.stringify(doc.hits)).toBe(raw);
  expect(verifyDraft(doc).valid).toBe(true);
  expect(reconstructNotation(prepareValidatedDraft(doc)).map((e) => e.timeMs)).toEqual([0, 500, 1000, 1500]);
});

test.each([3, 5, 7])("genuine %i-way subdivisions survive bounded correction", (count) => {
  const doc = take(Array.from({ length: count }, (_, i) => i * 500 / count));
  expect(notes(doc).some((e) => e.tuplet?.actual === count)).toBe(true);
  reconstructNotation(doc).forEach((hit, i) => expect(hit.timeMs).toBeCloseTo(doc.hits[i].onsetMs, 5));
  expect(verifyDraft(doc).valid).toBe(true);
});

test("mixed binary/triplet, rapid attacks and long silence retain their meaning", () => {
  for (const times of [[0, 125, 250, 1000 / 3, 1250 / 3],
    [0, 31.25, 62.5, 93.75], [0, 2000, 6000], [1875, 2000, 2125]]) {
    const doc = take(times);
    expect(reconstructNotation(doc).map((e) => e.timeMs)).toEqual(times);
    expect(verifyDraft(doc).valid).toBe(true);
  }
});

test("whole empty measures use one conventional rest; short note/rest articulation stays intact", () => {
  const doc = take([0, 4000]);
  const events = interpretRhythm(doc).events;
  expect(events.filter((e) => e.measureIndex === 1)).toMatchObject([
    { kind: "rest", value: 1, durationQ: { n: 4, d: 1 } },
  ]);
  expect(toNumber(notes(doc)[0].durationQ)).toBe(0.25);
  expect(events.some((e) => e.kind === "rest" && toNumber(e.startQ) === 0.25)).toBe(true);
});

test("old saved takes do not opt in, while new profile roundtrips and rejects invalid values", () => {
  const doc = take([17, 326, 799, 1277, 1812], { automaticCorrection: undefined });
  const before = interpretRhythm(doc);
  const restored = validateRhythmDocument(JSON.parse(JSON.stringify(doc)));
  expect(restored.automaticCorrection).toBeUndefined();
  expect(interpretRhythm(restored).events).toEqual(before.events);
  const upgraded = { ...restored, automaticCorrection: "bounded" as const };
  expect(validateRhythmDocument(JSON.parse(JSON.stringify(upgraded)))).toEqual(upgraded);
  expect(upgraded.hits).toEqual(doc.hits);
  expect(() => validateRhythmDocument({ ...doc, automaticCorrection: "anything" })).toThrow();
});

test("confirmed manual notes remain protected and future bars do not rewrite earlier beats", () => {
  const doc = take([12, 513, 992, 1515]);
  const approved = confirmDraftRegion(doc, 0);
  const extended = { ...approved, hits: [...approved.hits, { id: "future", onsetMs: 6500, drum: "snare" as const }] };
  expect(notes(extended).filter((e) => e.measureIndex === 0)).toEqual(notes(approved));
  expect(extended.manualEvents).toEqual(approved.manualEvents);
  expect(interpretRhythm({ ...doc, hits: extended.hits }).events.filter((e) => e.measureIndex === 0))
    .toEqual(interpretRhythm(doc).events);
});

test("all prefixes of irregular input remain independently decodable", () => {
  const times = [17, 326, 799, 1277, 1812, 2111, 2286, 2667];
  for (let end = 1; end <= times.length; end++) {
    const doc = take(times.slice(0, end));
    expect(verifyDraft(doc).valid).toBe(true);
    expect(new Set(notes(doc).flatMap((e) => e.hitIds)).size).toBe(end);
  }
});

test("bounded onset correction leaves independent keyboard gates and chords intact", () => {
  const doc = { ...take([]), hits: [
    { id: "c", onsetMs: 0, releaseMs: 500, midi: 60 },
    { id: "e", onsetMs: 0, releaseMs: 1000, midi: 64 },
    { id: "g", onsetMs: 500, releaseMs: 750, midi: 67 },
  ] };
  expect(reconstructNotation(doc).map(({ midi, timeMs, durationMs }) => ({ midi, timeMs, durationMs })))
    .toEqual([
      { midi: 60, timeMs: 0, durationMs: 500 },
      { midi: 64, timeMs: 0, durationMs: 1000 },
      { midi: 67, timeMs: 500, durationMs: 250 },
    ]);
  expect(verifyDraft(doc).valid).toBe(true);
});

test("context does not cross a short or compound measure boundary", () => {
  for (const meter of [{ numerator: 3, denominator: 8 }, { numerator: 1, denominator: 8 }]) {
    const capacityMs = meter.numerator * 4 / meter.denominator * 500;
    const doc = take([capacityMs * 0.8], { meter });
    const before = interpretRhythm(doc).events.filter((e) => e.measureIndex === 0);
    const next = { ...doc, hits: [...doc.hits,
      { id: "later", onsetMs: capacityMs * 1.2, drum: "snare" as const }] };
    expect(interpretRhythm(next).events.filter((e) => e.measureIndex === 0)).toEqual(before);
  }
});
