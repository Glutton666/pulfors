import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import * as currentEngine from "../lib/rhythm-lab/engine";
import * as currentAutomatic from "../lib/rhythm-lab/automatic";
import * as currentVerification from "../lib/rhythm-lab/verification";
import * as currentFeedback from "../lib/rhythm-lab/timing-feedback";

const baseline = process.env.RHYTHM_BASELINE_DIR;
const { createRhythmDocument, interpretRhythm }: typeof currentEngine =
  baseline ? require(resolve(baseline, "engine.ts")) : currentEngine;
const { automaticRhythm }: typeof currentAutomatic =
  baseline ? require(resolve(baseline, "automatic.ts")) : currentAutomatic;
const { verifyDraft }: typeof currentVerification =
  baseline ? require(resolve(baseline, "verification.ts")) : currentVerification;
const { compareTapTiming }: typeof currentFeedback =
  baseline ? require(resolve(baseline, "timing-feedback.ts")) : currentFeedback;

// Same synchronous calculation path as RhythmWorkspace, excluding React/native
// layout. Run: npx tsx scripts/benchmark-rhythm.ts. Medians, not CI time limits.
function measure(work: () => void, rounds = 7) {
  const samples: number[] = [];
  for (let i = 0; i < rounds + 2; i++) {
    const start = performance.now(); work();
    if (i >= 2) samples.push(performance.now() - start);
  }
  return +samples.sort((a, b) => a - b)[Math.floor(samples.length / 2)].toFixed(2);
}
for (const size of [300, 1000]) {
  const doc = { ...createRhythmDocument(), hits: Array.from({ length: size }, (_, i) => ({
    id: `h${i}`, onsetMs: i * 250 + [0, 8, -4, 3][i % 4], releaseMs: i * 250 + 30,
    drum: "snare" as const,
  })) };
  const automaticMs = measure(() => { automaticRhythm(doc); });
  const candidatesMs = measure(() => {
    const result = automaticRhythm(doc);
    for (const candidate of result.candidates) void candidate.events.length;
  });
  const interpretMs = measure(() => { interpretRhythm(doc); });
  const inputCalculationMs = measure(() => {
    const next = { ...doc, hits: [...doc.hits, { id: "new", onsetMs: size * 250, drum: "snare" as const }] };
    const interpretation = interpretRhythm(next);
    const report = verifyDraft(next, interpretation);
    compareTapTiming(next, interpretation, report);
  });
  console.log(JSON.stringify({ size, automaticMs, candidatesMs, interpretMs, inputCalculationMs }));
}
