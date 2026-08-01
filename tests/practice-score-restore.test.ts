/**
 * practice-score-restore.test.ts
 *
 * Verifies that importPracticeEntry() restores the bundled ScoreDocument
 * when the receiving device does not already have it, and skips overwriting
 * when the score already exists.
 */

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

const AsyncStorage = require("./_stubs/async-storage");
const FileSystemStub = require("./_stubs/expo-file-system");
const DocumentPickerStub = require("./_stubs/expo-document-picker");

beforeEach(() => {
  AsyncStorage.__reset();
  FileSystemStub.readAsStringAsync = async () => "";
  FileSystemStub.getInfoAsync = async () => ({ exists: false });
  DocumentPickerStub.getDocumentAsync = async () => ({ canceled: true, assets: null });
});

const SCORE_ID = "score-abc-123";
const SCORE_DOC = {
  id: SCORE_ID,
  bpm: 120,
  timeSignature: { numerator: 4, denominator: 4 },
  metadata: { title: "Test Score", createdAt: 1000, updatedAt: 1000 },
  parts: [],
  layoutOverrides: {},
};

function makePracticeShareJson(includeScoreDoc: boolean): string {
  return JSON.stringify({
    _meta: {
      app: "metronome",
      type: "practice_entry",
      createdAt: new Date().toISOString(),
    },
    entry: {
      id: "entry-1",
      label: "Score Practice",
      createdAt: Date.now(),
      mode: "score",
      bpm: 120,
      beatsPerMeasure: 4,
      beatTypes: ["accent", "normal", "normal", "normal"],
      beatSubdivisions: {},
      barRepeats: {},
      barLoopMode: "loop",
      subdivisionPattern: ["accent"],
      scoreId: SCORE_ID,
    },
    ...(includeScoreDoc ? { scoreDoc: SCORE_DOC } : {}),
  });
}

test("importPracticeEntry: restores scoreDoc when score is absent on receiving device", async () => {
  const json = makePracticeShareJson(true);
  FileSystemStub.readAsStringAsync = async () => json;
  DocumentPickerStub.getDocumentAsync = async () => ({
    canceled: false,
    assets: [{ uri: "file:///stub/score-practice.json", size: json.length }],
  });

  const { importPracticeEntry } = require("../lib/backup/practice");
  const result = await importPracticeEntry();

  assert.equal(result.success, true, "Import should succeed");
  assert.ok(result.entry, "Entry should be present");
  assert.equal(result.entry?.scoreId, SCORE_ID, "scoreId should be preserved");

  // ScoreDocument should have been saved to AsyncStorage under its key
  const scoreKey = `metronome_score_${SCORE_ID}`;
  const stored = await AsyncStorage.getItem(scoreKey);
  assert.ok(stored !== null, "ScoreDocument should have been saved to AsyncStorage");
  const parsed = JSON.parse(stored!);
  assert.equal(parsed.id, SCORE_ID, "Saved score should have the correct id");
});

test("importPracticeEntry: does not overwrite an existing scoreDoc", async () => {
  // Pre-load an existing score with a different title
  const existingDoc = { ...SCORE_DOC, metadata: { ...SCORE_DOC.metadata, title: "Existing Score" } };
  await AsyncStorage.setItem(`metronome_score_${SCORE_ID}`, JSON.stringify(existingDoc));
  // Also add to the index so loadScore finds it
  await AsyncStorage.setItem("metronome_scores_v1", JSON.stringify([SCORE_ID]));

  const json = makePracticeShareJson(true);
  FileSystemStub.readAsStringAsync = async () => json;
  DocumentPickerStub.getDocumentAsync = async () => ({
    canceled: false,
    assets: [{ uri: "file:///stub/score-practice.json", size: json.length }],
  });

  const { importPracticeEntry } = require("../lib/backup/practice");
  const result = await importPracticeEntry();

  assert.equal(result.success, true, "Import should succeed");

  // Existing score should not have been overwritten
  const stored = await AsyncStorage.getItem(`metronome_score_${SCORE_ID}`);
  const parsed = JSON.parse(stored!);
  assert.equal(parsed.metadata.title, "Existing Score", "Existing score must not be overwritten");
});

test("importPracticeEntry: succeeds even when no scoreDoc is included", async () => {
  const json = makePracticeShareJson(false);
  FileSystemStub.readAsStringAsync = async () => json;
  DocumentPickerStub.getDocumentAsync = async () => ({
    canceled: false,
    assets: [{ uri: "file:///stub/score-practice.json", size: json.length }],
  });

  const { importPracticeEntry } = require("../lib/backup/practice");
  const result = await importPracticeEntry();

  assert.equal(result.success, true, "Import should succeed without scoreDoc");
  assert.equal(result.entry?.scoreId, SCORE_ID, "scoreId should still be preserved");

  // No score should be in AsyncStorage
  const scoreKey = `metronome_score_${SCORE_ID}`;
  const stored = await AsyncStorage.getItem(scoreKey);
  assert.equal(stored, null, "No score should be saved when scoreDoc is absent");
});
