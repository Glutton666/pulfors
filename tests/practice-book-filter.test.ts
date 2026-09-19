import {
  filterPracticeBookEntries,
  isScorePracticeEntry,
  matchesPracticeBookMode,
} from "../lib/practice-book-filter";
import type { PracticeEntry } from "../lib/storage";

const entry = (
  id: string,
  mode?: PracticeEntry["mode"],
  scoreId?: string,
): PracticeEntry => ({
  id,
  label: id,
  createdAt: 1,
  mode,
  scoreId,
  bpm: 120,
  beatsPerMeasure: 4,
  beatTypes: ["strong", "normal", "normal", "normal"],
  beatSubdivisions: {},
  barRepeats: {},
  barLoopMode: "loop",
  subdivisionPattern: [],
});

describe("practice book mode filters", () => {
  const entries = [
    entry("legacy"),
    entry("beat", "beat"),
    entry("legacy-score", "beat", "score-legacy"),
    entry("bar", "bar"),
    entry("note", "note"),
    entry("score", "score", "score-current"),
  ];

  test("keeps the integrated book unchanged", () => {
    expect(filterPracticeBookEntries(entries, "all")).toEqual(entries);
  });

  test("classifies legacy and score-linked entries consistently", () => {
    expect(filterPracticeBookEntries(entries, "beat").map((item) => item.id)).toEqual([
      "legacy",
      "beat",
    ]);
    expect(filterPracticeBookEntries(entries, "score").map((item) => item.id)).toEqual([
      "legacy-score",
      "score",
    ]);
    expect(isScorePracticeEntry(entries[2])).toBe(true);
    expect(matchesPracticeBookMode(entries[0], "beat")).toBe(true);
  });

  test("filters bar and note entries without copying or transforming them", () => {
    expect(filterPracticeBookEntries(entries, "bar")).toEqual([entries[3]]);
    expect(filterPracticeBookEntries(entries, "note")).toEqual([entries[4]]);
  });
});