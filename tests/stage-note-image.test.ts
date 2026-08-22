import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  getStageNoteImageUri,
  isStageImageUri,
} from "../lib/stage-note-image";
import type { PracticeEntry } from "../lib/storage";

function noteEntry(overrides: Partial<PracticeEntry> = {}): PracticeEntry {
  return {
    id: "note-parent",
    label: "Photo queue",
    createdAt: 1,
    mode: "note",
    bpm: 100,
    beatsPerMeasure: 4,
    beatTypes: ["strong", "normal", "normal", "normal"],
    beatSubdivisions: {},
    barRepeats: {},
    barLoopMode: "once",
    subdivisionPattern: ["accent"],
    ...overrides,
  };
}

describe("stage note image resolution", () => {
  test("uses the parent photo before any queue child photo", () => {
    const entry = noteEntry({
      imageUri: "file:///parent.jpg",
      noteQueueEntries: [
        noteEntry({ id: "child-0", imageUri: "file:///child.jpg" }),
      ],
    });

    assert.equal(getStageNoteImageUri(entry, 0), "file:///parent.jpg");
  });

  test("uses the photo for the currently playing queue index", () => {
    const entry = noteEntry({
      noteQueueEntries: [
        noteEntry({ id: "child-0", imageUri: "file:///first.jpg" }),
        noteEntry({ id: "child-1", imageUri: "file:///second.jpg" }),
      ],
    });

    assert.equal(getStageNoteImageUri(entry, 0), "file:///first.jpg");
    assert.equal(getStageNoteImageUri(entry, 1), "file:///second.jpg");
  });

  test("shows the first queue photo when a stage item is selected before playback", () => {
    const entry = noteEntry({
      noteQueueEntries: [
        noteEntry({ id: "child-0", imageUri: "file:///first.jpg" }),
      ],
    });

    assert.equal(getStageNoteImageUri(entry, -1), "file:///first.jpg");
  });

  test("returns no image for an empty or out-of-range queue", () => {
    const entry = noteEntry({ noteQueueEntries: [] });

    assert.equal(getStageNoteImageUri(entry, 0), undefined);
    assert.equal(getStageNoteImageUri(noteEntry(), 0), undefined);
  });

  test("ignores malformed and remote image URIs without throwing", () => {
    const entry = noteEntry({
      imageUri: "https://example.com/remote.jpg",
      noteQueueEntries: [
        noteEntry({ id: "child-0", imageUri: "not-a-uri" }),
        noteEntry({ id: "child-1", imageUri: "data:image/png;base64,AAAA" }),
      ],
    });

    assert.equal(isStageImageUri("https://example.com/remote.jpg"), false);
    assert.equal(getStageNoteImageUri(entry, 0), undefined);
    assert.equal(getStageNoteImageUri(entry, 1), "data:image/png;base64,AAAA");
    assert.equal(getStageNoteImageUri(null, 0), undefined);
  });

  test("does not treat non-note entries as queue photo sources", () => {
    const entry = noteEntry({
      mode: "bar",
      imageUri: "file:///bar.jpg",
      noteQueueEntries: [noteEntry({ imageUri: "file:///child.jpg" })],
    });

    assert.equal(getStageNoteImageUri(entry, 0), undefined);
  });
});