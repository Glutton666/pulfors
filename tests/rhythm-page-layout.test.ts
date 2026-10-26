import { changeStaffRow, staffRows } from "../components/lab-score/rhythm-staff-layout";
import { createRhythmDocument, validateRhythmDocument } from "../lib/rhythm-lab/engine";

test("fixed default count and one-row exceptions reflow all following rows", () => {
  const base = { barsPerRow: 4, rowOverrides: [] };
  expect(staffRows(11, base).rows).toEqual([{ start: 0, count: 4 }, { start: 4, count: 4 }, { start: 8, count: 4 }]);
  const changed = changeStaffRow(base, 4, 2);
  expect(staffRows(11, changed).rows).toEqual([{ start: 0, count: 4 }, { start: 4, count: 2 }, { start: 6, count: 4 }, { start: 10, count: 4 }]);
  expect(staffRows(11, changeStaffRow(changed, 4)).rows).toEqual(staffRows(11, base).rows);
  expect(changeStaffRow({ barsPerRow: 4, rowOverrides: [{ startMeasure: 0, count: 3 }, { startMeasure: 7, count: 1 }] }, 3, 2).rowOverrides)
    .toEqual([{ startMeasure: 0, count: 3 }, { startMeasure: 3, count: 2 }]);
});

test("layout survives validated JSON roundtrip and never modifies musical input", () => {
  const doc = createRhythmDocument();
  doc.hits = [{ id: "h", onsetMs: 100, releaseMs: 160, drum: "snare" }];
  const next = { ...doc, staffLayout: { barsPerRow: 3, rowOverrides: [{ startMeasure: 3, count: 2 }] } };
  expect(validateRhythmDocument(JSON.parse(JSON.stringify(next)))).toEqual(next);
  expect(next.hits).toBe(doc.hits);
  expect(validateRhythmDocument(doc).staffLayout).toBeUndefined();
  for (const count of [0, 17, 1.5, NaN]) {
    expect(() => validateRhythmDocument({ ...next, staffLayout: { barsPerRow: count, rowOverrides: [] } })).toThrow();
  }
  expect(() => validateRhythmDocument({ ...next, staffLayout: { barsPerRow: 4, rowOverrides: [{ startMeasure: 4096, count: 2 }] } })).toThrow();
});
