import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  CHORD_EASTER_EGG_TITLE,
  CHORD_DEFINITIONS,
  appendRapidTap,
  createPitchQuestion,
  isChordEasterEggTitle,
} from "../lib/pitch-quiz";

describe("pitch quiz question generation", () => {
  test("relative question picks one of the 12 semitone distances and plays root then target", () => {
    const question = createPitchQuestion("relative", () => 0);
    assert.equal(question.mode, "relative");
    if (question.mode !== "relative") return;
    assert.equal(question.rootMidi, 48);
    assert.equal(question.interval, 1);
    assert.deepEqual(question.notes, [48, 49]);
  });

  test("absolute question covers the C-to-B pitch classes", () => {
    const first = createPitchQuestion("absolute", () => 0);
    const last = createPitchQuestion("absolute", () => 0.9999);
    assert.equal(first.mode, "absolute");
    assert.equal(last.mode, "absolute");
    if (first.mode !== "absolute" || last.mode !== "absolute") return;
    assert.equal(first.pitchClass, 0);
    assert.equal(last.pitchClass, 11);
  });

  test("chord questions use only the five supported root-position chord shapes", () => {
    const kinds = Object.keys(CHORD_DEFINITIONS);
    for (let i = 0; i < kinds.length; i++) {
      const random = () => (i + 0.01) / kinds.length;
      const question = createPitchQuestion("chord", random);
      assert.equal(question.mode, "chord");
      if (question.mode !== "chord") continue;
      const definition = CHORD_DEFINITIONS[question.kind];
      assert.deepEqual(
        question.notes.map((midi) => midi - question.rootMidi),
        definition.intervals,
      );
      assert.ok(question.notes.length === 3 || question.notes.length === 4);
    }
  });
});

test("choooooord title trigger is case-insensitive but exact after trimming", () => {
  assert.equal(isChordEasterEggTitle(CHORD_EASTER_EGG_TITLE), true);
  assert.equal(isChordEasterEggTitle("  ChOoOoOoRd  "), true);
  assert.equal(isChordEasterEggTitle("chooooord"), false);
  assert.equal(isChordEasterEggTitle("my choooooord song"), false);
});

test("rapid mic taps retain only events from the previous 2.5 seconds", () => {
  const taps = [100, 1000, 2600];
  assert.deepEqual(appendRapidTap(taps, 3000), [1000, 2600, 3000]);
  assert.deepEqual(appendRapidTap(taps, 5101), [5101]);
});