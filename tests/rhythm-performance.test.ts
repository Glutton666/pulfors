import { createHash } from "node:crypto";
import { rhythmPerformanceCases } from "./fixtures/rhythm-performance-cases";
import { createRhythmDocument, interpretRhythm } from "../lib/rhythm-lab/engine";
import { automaticRhythm } from "../lib/rhythm-lab/automatic";
import { confirmDraftRegion, verifyDraft } from "../lib/rhythm-lab/verification";

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
// Captured from the eager whole-take implementation, including every candidate
// and verification field, not just the chosen onset positions.
const expected = [
  ["121d1a5507cbc9e0eb0a4ec132f8332ee1fa465c5dbdfa9089c737286b599722", "8c2fef6f39c16501789a3094cbcff388c0e2a864a0bf1bab1d85a0ec4de8f6aa"],
  ["c8ae40fc226fe24d1afceca721a61faafa80e7421f543d7a9be5098785b08118", "0e22b023c70ed9fb194d552403e79293634105cf9e07922661e46e20e39b86a9"],
  ["da35860f3e04d04c8e3d2ed38938a58351823ef031d2bd3e0fda66d74afe3af9", "52f602e185bd2b3f95ba9edd173103e7805753fbb18eabc5852fa8185951c803"],
  ["5a0a3ebc773d4a65b38a80768a9627fd1f248ce13c77190618645bb8afd2b42b", "23681a5f83336a1e990003b3c52777ee35ae6f3641cd43e65eb1557be356a24a"],
  ["1c1930da1d1bf5c2c1d27b0c980d142faecb135882628d7e4a7d60a84b2b728a", "45bf7923430c064bb2907b3751d8dd57d5dd270dfb97eaf1ea3c34cd9adfb813"],
  ["7e00985a091c3aae51ec79a324add7bebd25ff047e476db23489407bea6fba0e", "40812329ed6736bbc4565218da0ee8b11a1cd67b6c342710baa863d6082ff152"],
];
test.each(rhythmPerformanceCases().map((doc, i) => [i, doc] as const))(
  "local/lazy candidates and reports preserve the eager reference %i", (index, doc) => {
    const raw = JSON.stringify(doc.hits);
    const result = interpretRhythm(doc);
    expect(digest(result)).toBe(expected[index][0]);
    expect(digest(verifyDraft(doc, result))).toBe(expected[index][1]);
    expect(JSON.stringify(doc.hits)).toBe(raw);
    for (const candidate of result.candidates) expect(candidate.events).toBe(candidate.events);
  });

test.each([300, 1000])("a late input in a %i-hit take preserves earlier bars, edits and confirmed ties", (size) => {
  const base = { ...createRhythmDocument(), hits: Array.from({ length: size }, (_, i) => ({
    id: `h${i}`, onsetMs: i * 250, releaseMs: i * 250 + (i === 0 ? 5000 : 125), midi: 60 + i % 3,
  })) };
  const doc = confirmDraftRegion(base, 0);
  const before = interpretRhythm(doc);
  const oldEvents = before.events.filter((event) => event.measureIndex < 3);
  const updated = { ...doc, hits: [...doc.hits, { id: "new", onsetMs: size * 250, midi: 62 }] };
  expect(interpretRhythm(updated).events.filter((event) => event.measureIndex < 3)).toEqual(oldEvents);
  expect(updated.manualEvents).toBe(doc.manualEvents);
  expect(verifyDraft(updated).regions.find((region) => region.measureIndex === 0)?.status).toBe("confirmed");
});

test("reading candidate metadata does not materialize candidate events", () => {
  const doc = rhythmPerformanceCases()[0];
  const result = automaticRhythm(doc);
  const getters = result.candidates.map((candidate) => jest.spyOn(candidate, "events", "get"));
  result.candidates.filter((candidate) => candidate.measureIndex === 0).map((c) => [c.id, c.score, c.label]);
  expect(getters.every((getter) => getter.mock.calls.length === 0)).toBe(true);
  void result.candidates[0].events;
  expect(getters[0]).toHaveBeenCalledTimes(1);
  expect(getters.slice(1).every((getter) => getter.mock.calls.length === 0)).toBe(true);
});

test("materializing a recent alternative only reads local onsets in a long take", () => {
  let reads = 0;
  const doc = { ...createRhythmDocument(), hits: Array.from({ length: 1000 }, (_, i) => ({
    id: `h${i}`, get onsetMs() { reads++; return i * 250; }, drum: "snare" as const,
  })) };
  const result = automaticRhythm(doc);
  const lastMeasure = result.candidates.at(-1)!.measureIndex;
  const alternative = result.candidates.find((candidate) =>
    candidate.measureIndex === lastMeasure && !candidate.id.includes("--1-"))!;
  reads = 0;
  expect(alternative.events.length).toBeGreaterThan(0);
  // Deterministic work budget, not a machine-dependent timing assertion.
  expect(reads).toBeLessThan(300);
});
