import { insertCircularBeat, shiftSampleBeatKeys } from "../lib/circular-beat-insertion";
import type { BeatType } from "../lib/metronome-engine";

const config = () => ({
  beatsPerMeasure: 4,
  beatTypes: ["strong", "mute", "accent", "normal"] as BeatType[],
  beatSubdivisions: { "0": ["strong", "normal"], "2": ["accent", "mute", "normal"] } as Record<string, BeatType[]>,
});
test.each([0, 1, 3])("inserts after anchor %i without mutating original rhythm", (anchor) => {
  const original = config();
  const before = JSON.stringify(original);
  const pattern: BeatType[] = ["accent", "normal", "accent", "normal", "accent", "normal", "accent", "normal", "strong"];
  const next = insertCircularBeat(original, anchor, pattern)!;
  expect(next.beatsPerMeasure).toBe(5);
  expect(next.beatTypes.filter((_, i) => i !== anchor + 1)).toEqual(original.beatTypes);
  expect(next.beatSubdivisions[String(anchor + 1)]).toEqual(pattern);
  for (const [key, notes] of Object.entries(original.beatSubdivisions)) {
    expect(next.beatSubdivisions[String(Number(key) > anchor ? Number(key) + 1 : Number(key))]).toEqual(notes);
  }
  expect(JSON.stringify(original)).toBe(before);
  pattern[0] = "mute";
  expect(next.beatSubdivisions[String(anchor + 1)][0]).toBe("accent");
});
test("a leading mute silences only its own slot", () => {
  const next = insertCircularBeat(config(), 0, ["mute", "strong", "normal"])!;
  expect(next.beatTypes[1]).toBe("normal");
  expect(next.beatSubdivisions["1"]).toEqual(["mute", "strong", "normal"]);
});
test.each([[[]], [Array(10).fill("normal")], [["bad"]]])("rejects invalid pattern %j", (pattern) => {
  expect(insertCircularBeat(config(), 0, pattern as BeatType[])).toBeNull();
});
test("shifts all three sample slots and cell metadata without key collisions", () => {
  const original = { "0-0": "anchor", "1-0": "one", "1-0~1": "two", "1-0~2": "three", "2-8": "later", unrelated: "keep" };
  expect(shiftSampleBeatKeys(original, 1)).toEqual({
    "0-0": "anchor", "2-0": "one", "2-0~1": "two", "2-0~2": "three", "3-8": "later", unrelated: "keep",
  });
  expect(original["1-0"]).toBe("one");
});