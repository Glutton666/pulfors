import { test } from "node:test";
import assert from "node:assert/strict";
import {
  encodePayload,
  decodePayload,
  computeStartEpochMs,
} from "../lib/scheduled-start";

test("encodePayload/decodePayload: roundtrip", () => {
  const p = { startEpochMs: 1714756800000, bpm: 120, beatsPerMeasure: 4 };
  const code = encodePayload(p);
  assert.equal(code, "S1714756800000B120M4");
  const decoded = decodePayload(code);
  assert.deepEqual(decoded, p);
});

test("decodePayload: trims and accepts lower-case", () => {
  const decoded = decodePayload("  s1714756800000b90m3  ");
  assert.deepEqual(decoded, { startEpochMs: 1714756800000, bpm: 90, beatsPerMeasure: 3 });
});

test("decodePayload: rejects invalid format", () => {
  assert.equal(decodePayload(""), null);
  assert.equal(decodePayload("hello"), null);
  assert.equal(decodePayload("S123B120M4"), null); // epoch too short
  assert.equal(decodePayload("S1714756800000B10M4"), null); // bpm < 20
  assert.equal(decodePayload("S1714756800000B120M0"), null); // meter 0
  assert.equal(decodePayload("S1714756800000B120M99"), null); // meter > 32
});

test("encodePayload: rejects out-of-range values", () => {
  assert.throws(() => encodePayload({ startEpochMs: 0, bpm: 120, beatsPerMeasure: 4 }));
  assert.throws(() => encodePayload({ startEpochMs: 1714756800000, bpm: 0, beatsPerMeasure: 4 }));
  assert.throws(() => encodePayload({ startEpochMs: 1714756800000, bpm: 120, beatsPerMeasure: 0 }));
  assert.throws(() => encodePayload({ startEpochMs: 1714756800000, bpm: 120, beatsPerMeasure: 100 }));
});

test("computeStartEpochMs: clamps lead-in and adds to server now", () => {
  const now = 1_000_000;
  assert.equal(computeStartEpochMs(now, 5), 1_005_000);
  assert.equal(computeStartEpochMs(now, 10), 1_010_000);
  assert.equal(computeStartEpochMs(now, 1), 1_002_000); // floor → min 2
  assert.equal(computeStartEpochMs(now, 999), 1_120_000); // capped at 120s
});

test("decodePayload: meter accepted up to 32", () => {
  const decoded = decodePayload("S1714756800000B120M32");
  assert.deepEqual(decoded, { startEpochMs: 1714756800000, bpm: 120, beatsPerMeasure: 32 });
});
