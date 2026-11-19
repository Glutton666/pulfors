import { test } from "node:test";
import assert from "node:assert/strict";
import { noteQueueEntryRepeats, serializeNoteQueueEntries } from "../lib/note-queue-helpers";
import type { PracticeEntry } from "../lib/storage";

test("saved note queue keeps each item's sample volume map", () => {
  const queue: PracticeEntry[] = [{
    id: "bar-1",
    label: "Verse",
    createdAt: 1,
    bpm: 120,
    beatsPerMeasure: 4,
    beatTypes: ["strong", "normal", "normal", "normal"],
    beatSubdivisions: {},
    barRepeats: {},
    barLoopMode: "once" as const,
    subdivisionPattern: ["accent" as const],
    noteSamples: { "0-0": "file:///kick.wav" },
    noteSampleVolumes: { "0-0": 0.35 },
  }];

  const saved = serializeNoteQueueEntries(queue);
  assert.deepEqual(saved[0].noteSampleVolumes, { "0-0": 0.35 });
  assert.notEqual(saved[0].noteSampleVolumes, queue[0].noteSampleVolumes);
});

test("queue snapshots keep per-item repeat independently of the queue's play mode", () => {
  const base: PracticeEntry = {
    id: "source", label: "Source", createdAt: 1, bpm: 120, beatsPerMeasure: 1, beatTypes: ["strong"],
    beatSubdivisions: {}, barRepeats: {}, barLoopMode: "once", subdivisionPattern: [],
  };
  const sources: PracticeEntry[] = [
    { ...base, mode: "beat" },
    { ...base, mode: "bar", barLoopMode: "loop" },
    { ...base, mode: "bar" },
    { ...base, barLoopMode: "loop" },
    { ...base, mode: "score", barLoopMode: "loop" },
  ];
  const saved: PracticeEntry[] = JSON.parse(JSON.stringify(serializeNoteQueueEntries(sources)));
  assert.deepEqual(sources.map(noteQueueEntryRepeats), [true, true, false, true, false]);
  assert.deepEqual(saved.map(noteQueueEntryRepeats), [true, true, false, true, false]);
  assert.equal(saved[0].barLoopMode, "loop");
  assert.equal(sources[0].barLoopMode, "once");
});