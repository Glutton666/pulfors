import { test } from "node:test";
import assert from "node:assert/strict";
import { filterPrimaryInstrumentCategories } from "../lib/primary-instrument-search";

test("primary instrument search: empty query returns the full catalog", () => {
  const results = filterPrimaryInstrumentCategories("");
  assert.equal(results.length, 6);
  assert.equal(results.reduce((count, category) => count + category.instruments.length, 0), 31);
});

test("primary instrument search: Korean and English instrument names filter results", () => {
  assert.deepEqual(
    filterPrimaryInstrumentCategories("기타 (6현)").flatMap((category) => category.instruments.map((instrument) => instrument.id)),
    ["guitar6"],
  );
  assert.deepEqual(
    filterPrimaryInstrumentCategories("violin").flatMap((category) => category.instruments.map((instrument) => instrument.id)),
    ["violin"],
  );
});

test("primary instrument search: category names keep the whole category", () => {
  const results = filterPrimaryInstrumentCategories("동양 전통");
  assert.equal(results.length, 1);
  assert.equal(results[0]?.id, "asian_traditional");
  assert.ok(results[0]?.instruments.length);
});

test("primary instrument search: unmatched query returns no categories", () => {
  assert.deepEqual(filterPrimaryInstrumentCategories("does-not-exist"), []);
});