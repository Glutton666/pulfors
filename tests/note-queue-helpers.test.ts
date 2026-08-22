import { test } from "node:test";
import assert from "node:assert/strict";
import { serializeNoteQueueEntries } from "../lib/note-queue-helpers";
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