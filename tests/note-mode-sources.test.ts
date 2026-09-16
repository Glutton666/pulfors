import { getNoteSourceMode, isNoteSourceEntry, reconcileNoteSources } from "@/lib/note-mode-sources";
import type { PracticeEntry } from "@/lib/storage";

const entry = (id: string, mode: PracticeEntry["mode"], label = id): PracticeEntry => ({
  id,
  label,
  mode,
  createdAt: 1,
  bpm: 100,
  beatsPerMeasure: 4,
  beatTypes: ["accent", "normal", "normal", "normal"],
  beatSubdivisions: {},
  barRepeats: {},
  barLoopMode: "once",
  subdivisionPattern: ["accent"],
});

describe("note mode source selection", () => {
  test("accepts beat, bar, and score sources but excludes saved note queues", () => {
    expect(isNoteSourceEntry(entry("beat", "beat"))).toBe(true);
    expect(isNoteSourceEntry(entry("bar", "bar"))).toBe(true);
    expect(isNoteSourceEntry(entry("score", "score"))).toBe(true);
    expect(isNoteSourceEntry(entry("note", "note"))).toBe(false);
    expect(getNoteSourceMode(entry("legacy", undefined))).toBe("bar");
  });

  test("keeps selected order, refreshes values, removes deleted and duplicate entries", () => {
    const selected = [
      entry("b", "bar", "old b"),
      entry("a", "beat", "old a"),
      entry("b", "bar", "duplicate b"),
      entry("deleted", "bar"),
    ];
    const available = [
      entry("a", "beat", "new a"),
      entry("b", "bar", "new b"),
      entry("note", "note"),
    ];

    expect(reconcileNoteSources(selected, available).map(({ id, label }) => ({ id, label })))
      .toEqual([
        { id: "b", label: "new b" },
        { id: "a", label: "new a" },
      ]);
  });
});