/* eslint-disable import/first */
import { beforeEach, describe, expect, jest, test } from "@jest/globals";

jest.mock("../lib/score-storage", () => ({
  saveScore: jest.fn(),
}));

jest.mock("expo-crypto", () => ({
  randomUUID: jest.fn(() => "imported-score-id"),
}));

jest.mock("react-native-view-shot", () => ({
  captureRef: jest.fn(),
}));

import {
  parsePulforsJson,
  validateScoreDocument,
  validateScoreTimeSignature,
} from "../lib/score-io";
import { saveScore } from "../lib/score-storage";
import type { ScoreDocument } from "../lib/score-types";

const mockSaveScore = saveScore as jest.MockedFunction<typeof saveScore>;

function makeValidDoc(): ScoreDocument {
  return {
    id: "source-score",
    metadata: {
      title: "Import me",
      composer: "Composer",
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_100_000,
    },
    parts: [{
      id: "part-1",
      instrumentId: "piano",
      clef: "treble",
      measures: [{
        id: "measure-1",
        elements: [
          {
            id: "note-1",
            type: "note",
            pitch: { step: "C", octave: 4 },
            duration: "quarter",
          },
          {
            id: "rest-1",
            type: "rest",
            duration: "quarter",
          },
        ],
      }],
    }],
    keySignature: { sharps: 0 },
    timeSignature: { numerator: 4, denominator: 4 },
    bpm: 120,
  };
}

function wrap(doc: unknown): string {
  return JSON.stringify({
    _type: "pulfors_score_v1",
    createdAt: "2026-09-02T00:00:00.000Z",
    doc,
  });
}

beforeEach(() => {
  mockSaveScore.mockReset();
  mockSaveScore.mockResolvedValue(undefined);
});

describe("score import validation", () => {
  test("imports and saves a valid exported score", async () => {
    const result = await parsePulforsJson(wrap(makeValidDoc()));

    expect(result.success).toBe(true);
    expect(result.doc?.id).toBe("imported-score-id");
    expect(result.doc).toBeDefined();
    expect(mockSaveScore).toHaveBeenCalledTimes(1);
    if (!result.doc) throw new Error("valid import did not return a document");
    expect(mockSaveScore).toHaveBeenCalledWith(result.doc);
  });

  test("keeps legacy placedX scores compatible and migrates their layout", async () => {
    const legacy = makeValidDoc();
    (legacy.parts[0].measures[0].elements[0] as unknown as Record<string, unknown>).placedX = 42;

    const result = await parsePulforsJson(wrap(legacy));

    expect(result.success).toBe(true);
    expect(result.doc?.layoutOverrides).toEqual({
      "measure-1": { "note-1": 42 },
    });
    expect(result.doc?.parts[0].measures[0].elements[0]).not.toHaveProperty("placedX");
  });

  test("imports a valid tuplet group without changing its timing ratio", async () => {
    const doc = makeValidDoc();
    doc.parts[0].measures[0].tuplets = [{
      id: "tuplet-1",
      elementIds: ["note-1", "rest-1"],
      count: 2,
      normalCount: 1,
    }];

    const result = await parsePulforsJson(wrap(doc));

    expect(result.success).toBe(true);
    expect(result.doc?.parts[0].measures[0].tuplets).toEqual(doc.parts[0].measures[0].tuplets);
  });

  test("imports valid free-placement layout overrides", async () => {
    const doc = makeValidDoc();
    doc.layoutOverrides = {
      "measure-1": { "note-1": 42 },
    };

    const result = await parsePulforsJson(wrap(doc));

    expect(result.success).toBe(true);
    expect(result.doc?.layoutOverrides).toEqual(doc.layoutOverrides);
  });

  test("keeps editor-created measure signatures above 64 compatible", async () => {
    const doc = makeValidDoc();
    doc.parts[0].measures[0].timeSignature = { numerator: 65, denominator: 4 };

    const result = await parsePulforsJson(wrap(doc));

    expect(result.success).toBe(true);
    expect(result.doc?.parts[0].measures[0].timeSignature).toEqual({
      numerator: 65,
      denominator: 4,
    });
    expect(validateScoreTimeSignature({ numerator: 65, denominator: 4 })).toBeNull();
  });

  test("uses the same playback-duration limit for editor input and imports", () => {
    expect(validateScoreTimeSignature({
      numerator: 100_000,
      denominator: 1,
    })).toContain("numerator");
    expect(validateScoreTimeSignature({
      numerator: Number.MAX_SAFE_INTEGER,
      denominator: Number.MAX_SAFE_INTEGER,
    })).toContain("numerator");
  });

  test("rejects malformed JSON and does not save it", async () => {
    const result = await parsePulforsJson("{ broken");

    expect(result).toMatchObject({
      success: false,
      errorCode: "invalid",
    });
    expect(result.errorMessage).toContain("JSON");
    expect(mockSaveScore).not.toHaveBeenCalled();
  });

  test.each([
    {
      label: "null part",
      mutate: (doc: Record<string, any>) => { doc.parts[0] = null; },
      path: "doc.parts[0]",
    },
    ...["toString", "constructor", "__proto__"].map((instrumentId) => ({
      label: `prototype instrument id ${instrumentId}`,
      mutate: (doc: Record<string, any>) => { doc.parts[0].instrumentId = instrumentId; },
      path: "doc.parts[0].instrumentId",
    })),
    {
      label: "prototype-colliding element ID",
      mutate: (doc: Record<string, any>) => {
        doc.parts[0].measures[0].elements[0].id = "toString";
        doc.layoutOverrides = { "measure-1": {} };
      },
      path: "doc.parts[0].measures[0].elements[0].id",
    },
    {
      label: "measure without elements",
      mutate: (doc: Record<string, any>) => { delete doc.parts[0].measures[0].elements; },
      path: "doc.parts[0].measures[0].elements",
    },
    {
      label: "null score element",
      mutate: (doc: Record<string, any>) => { doc.parts[0].measures[0].elements[0] = null; },
      path: "doc.parts[0].measures[0].elements[0]",
    },
    {
      label: "note without pitch",
      mutate: (doc: Record<string, any>) => { delete doc.parts[0].measures[0].elements[0].pitch; },
      path: "doc.parts[0].measures[0].elements[0].pitch",
    },
    {
      label: "unknown drum type",
      mutate: (doc: Record<string, any>) => {
        doc.parts[0].measures[0].elements[0].drumType = "laser_drum";
      },
      path: "doc.parts[0].measures[0].elements[0].drumType",
    },
    {
      label: "invalid document time signature",
      mutate: (doc: Record<string, any>) => { doc.timeSignature.denominator = 0; },
      path: "doc.timeSignature.denominator",
    },
    {
      label: "invalid measure time signature",
      mutate: (doc: Record<string, any>) => {
        doc.parts[0].measures[0].timeSignature = { numerator: "3", denominator: 4 };
      },
      path: "doc.parts[0].measures[0].timeSignature.numerator",
    },
    {
      label: "invalid document BPM",
      mutate: (doc: Record<string, any>) => { doc.bpm = -120; },
      path: "doc.bpm",
    },
    {
      label: "document BPM too small for finite playback timing",
      mutate: (doc: Record<string, any>) => { doc.bpm = 1e-323; },
      path: "doc.bpm",
    },
    {
      label: "invalid measure BPM",
      mutate: (doc: Record<string, any>) => { doc.parts[0].measures[0].bpm = "fast"; },
      path: "doc.parts[0].measures[0].bpm",
    },
    {
      label: "time signature too large for safe playback timing",
      mutate: (doc: Record<string, any>) => {
        doc.timeSignature = { numerator: Number.MAX_SAFE_INTEGER, denominator: 1 };
      },
      path: "doc.timeSignature.numerator",
    },
    {
      label: "misaligned part measure counts",
      mutate: (doc: Record<string, any>) => {
        doc.parts.push({
          id: "part-2",
          instrumentId: "violin",
          clef: "treble",
          measures: [
            { id: "measure-2", elements: [] },
            { id: "measure-3", elements: [] },
          ],
        });
      },
      path: "doc.parts[1].measures",
    },
    {
      label: "duplicate measure ID across parts",
      mutate: (doc: Record<string, any>) => {
        doc.parts.push({
          id: "part-2",
          instrumentId: "violin",
          clef: "treble",
          measures: [{ id: "measure-1", elements: [] }],
        });
      },
      path: "doc.parts",
    },
    {
      label: "duplicate element ID across measures",
      mutate: (doc: Record<string, any>) => {
        doc.parts[0].measures.push({
          id: "measure-2",
          elements: [{
            id: "note-1",
            type: "note",
            pitch: { step: "D", octave: 4 },
            duration: "quarter",
          }],
        });
      },
      path: "doc.parts",
    },
    {
      label: "layout override for an unknown measure",
      mutate: (doc: Record<string, any>) => {
        doc.layoutOverrides = { "missing-measure": { "note-1": 42 } };
      },
      path: "doc.layoutOverrides.missing-measure",
    },
    {
      label: "layout override for an unknown element",
      mutate: (doc: Record<string, any>) => {
        doc.layoutOverrides = { "measure-1": { "missing-note": 42 } };
      },
      path: "doc.layoutOverrides.measure-1.missing-note",
    },
    {
      label: "tuplet with duplicate element IDs",
      mutate: (doc: Record<string, any>) => {
        doc.parts[0].measures[0].tuplets = [{
          id: "tuplet-1", elementIds: ["note-1", "note-1"], count: 2, normalCount: 1,
        }];
      },
      path: "doc.parts[0].measures[0].tuplets[0].elementIds",
    },
    {
      label: "tuplet with non-contiguous element IDs",
      mutate: (doc: Record<string, any>) => {
        doc.parts[0].measures[0].elements.push({
          id: "note-2", type: "note", pitch: { step: "D", octave: 4 }, duration: "quarter",
        });
        doc.parts[0].measures[0].tuplets = [{
          id: "tuplet-1", elementIds: ["note-1", "note-2"], count: 2, normalCount: 1,
        }];
      },
      path: "doc.parts[0].measures[0].tuplets[0].elementIds",
    },
    {
      label: "tuplet whose count differs from its elements",
      mutate: (doc: Record<string, any>) => {
        doc.parts[0].measures[0].tuplets = [{
          id: "tuplet-1", elementIds: ["note-1", "rest-1"], count: 3, normalCount: 2,
        }];
      },
      path: "doc.parts[0].measures[0].tuplets[0].count",
    },
    {
      label: "tuplet with a non-standard normal count",
      mutate: (doc: Record<string, any>) => {
        doc.parts[0].measures[0].tuplets = [{
          id: "tuplet-1", elementIds: ["note-1", "rest-1"], count: 2, normalCount: 2,
        }];
      },
      path: "doc.parts[0].measures[0].tuplets[0].normalCount",
    },
    {
      label: "overlapping tuplet groups",
      mutate: (doc: Record<string, any>) => {
        doc.parts[0].measures[0].elements.push({
          id: "note-2", type: "note", pitch: { step: "D", octave: 4 }, duration: "quarter",
        });
        doc.parts[0].measures[0].tuplets = [
          { id: "tuplet-1", elementIds: ["note-1", "rest-1"], count: 2, normalCount: 1 },
          { id: "tuplet-2", elementIds: ["rest-1", "note-2"], count: 2, normalCount: 1 },
        ];
      },
      path: "doc.parts[0].measures[0].tuplets[1].elementIds",
    },
    {
      label: "duplicate tuplet group IDs",
      mutate: (doc: Record<string, any>) => {
        doc.parts[0].measures[0].elements.push(
          { id: "note-2", type: "note", pitch: { step: "D", octave: 4 }, duration: "quarter" },
          { id: "note-3", type: "note", pitch: { step: "E", octave: 4 }, duration: "quarter" },
        );
        doc.parts[0].measures[0].tuplets = [
          { id: "tuplet-1", elementIds: ["note-1", "rest-1"], count: 2, normalCount: 1 },
          { id: "tuplet-1", elementIds: ["note-2", "note-3"], count: 2, normalCount: 1 },
        ];
      },
      path: "doc.parts[0].measures[0].tuplets",
    },
  ])("rejects $label before saving", async ({ mutate, path }) => {
    const broken = makeValidDoc() as unknown as Record<string, any>;
    mutate(broken);

    const result = await parsePulforsJson(wrap(broken));

    expect(result).toMatchObject({
      success: false,
      errorCode: "invalid",
    });
    expect(result.errorMessage).toContain(path);
    expect(mockSaveScore).not.toHaveBeenCalled();
  });

  test("returns a field-level explanation for incomplete metadata", () => {
    const broken = makeValidDoc() as unknown as Record<string, any>;
    delete broken.metadata.title;

    expect(validateScoreDocument(broken)).toBe("doc.metadata.title must be a string");
  });

  test("reports storage failures as I/O errors rather than invalid files", async () => {
    mockSaveScore.mockRejectedValueOnce(new Error("disk full"));

    const result = await parsePulforsJson(wrap(makeValidDoc()));

    expect(result).toEqual({ success: false, errorCode: "io" });
  });
});