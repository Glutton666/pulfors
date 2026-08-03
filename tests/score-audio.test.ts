import { test } from "node:test";
import assert from "node:assert/strict";
import { instrumentToWaveform, getPrepareBatchSize } from "../lib/score-audio";

// ═══════════════════════════════════════════════════════════════
// instrumentToWaveform — 악기 카테고리 → 오실레이터 파형
// ═══════════════════════════════════════════════════════════════

test("instrumentToWaveform: unknown/empty instrumentId returns sine", () => {
  assert.equal(instrumentToWaveform(""), "sine");
  assert.equal(instrumentToWaveform("nonexistent_instrument"), "sine");
});

test("instrumentToWaveform: keyboard instruments return triangle", () => {
  assert.equal(instrumentToWaveform("piano"), "triangle");
  assert.equal(instrumentToWaveform("organ"), "triangle");
  assert.equal(instrumentToWaveform("harpsichord"), "triangle");
});

test("instrumentToWaveform: percussion instruments return triangle", () => {
  assert.equal(instrumentToWaveform("marimba"), "triangle");
  assert.equal(instrumentToWaveform("timpani"), "triangle");
});

test("instrumentToWaveform: strings instruments return sawtooth", () => {
  assert.equal(instrumentToWaveform("violin"), "sawtooth");
  assert.equal(instrumentToWaveform("viola"), "sawtooth");
  assert.equal(instrumentToWaveform("cello"), "sawtooth");
  assert.equal(instrumentToWaveform("bass"), "sawtooth");
});

test("instrumentToWaveform: brass instruments return sawtooth", () => {
  assert.equal(instrumentToWaveform("trumpet"), "sawtooth");
  assert.equal(instrumentToWaveform("horn"), "sawtooth");
  assert.equal(instrumentToWaveform("trombone"), "sawtooth");
  assert.equal(instrumentToWaveform("tuba"), "sawtooth");
});

test("instrumentToWaveform: guitar returns sawtooth", () => {
  assert.equal(instrumentToWaveform("guitar"), "sawtooth");
});

test("instrumentToWaveform: woodwind instruments return sine", () => {
  assert.equal(instrumentToWaveform("flute"), "sine");
  assert.equal(instrumentToWaveform("oboe"), "sine");
  assert.equal(instrumentToWaveform("clarinet"), "sine");
  assert.equal(instrumentToWaveform("bassoon"), "sine");
  assert.equal(instrumentToWaveform("saxophone"), "sine");
});

test("instrumentToWaveform: vocal instruments return sine", () => {
  assert.equal(instrumentToWaveform("soprano"), "sine");
  assert.equal(instrumentToWaveform("tenor"), "sine");
  assert.equal(instrumentToWaveform("bass_voice"), "sine");
});

test("instrumentToWaveform: other category returns sine", () => {
  assert.equal(instrumentToWaveform("custom"), "sine");
});

test("instrumentToWaveform: drums (percussion category) returns triangle", () => {
  assert.equal(instrumentToWaveform("drums"), "triangle");
});

test("instrumentToWaveform: return value is always a valid OscillatorType", () => {
  const valid = new Set(["sine", "triangle", "sawtooth", "square"]);
  for (const id of ["piano", "violin", "flute", "trumpet", "guitar", "custom", ""]) {
    const w = instrumentToWaveform(id);
    assert.ok(valid.has(w), `${id} returned invalid waveform: ${w}`);
  }
});

// ═══════════════════════════════════════════════════════════════
// getPrepareBatchSize — 디바이스 성능 기반 배치 크기
// ═══════════════════════════════════════════════════════════════

test("getPrepareBatchSize: returns a positive integer", () => {
  const size = getPrepareBatchSize();
  assert.ok(typeof size === "number" && Number.isInteger(size) && size > 0,
    `expected positive integer, got ${size}`);
});

test("getPrepareBatchSize: returns one of the documented values (4, 6, 8)", () => {
  const size = getPrepareBatchSize();
  assert.ok([4, 6, 8].includes(size), `expected 4, 6, or 8, got ${size}`);
});

test("getPrepareBatchSize: navigator.hardwareConcurrency >= 8 returns 8", () => {
  const orig = (globalThis as any).navigator;
  try {
    (globalThis as any).navigator = { hardwareConcurrency: 8 };
    assert.equal(getPrepareBatchSize(), 8);
    (globalThis as any).navigator = { hardwareConcurrency: 16 };
    assert.equal(getPrepareBatchSize(), 8);
  } finally {
    (globalThis as any).navigator = orig;
  }
});

test("getPrepareBatchSize: navigator.hardwareConcurrency 4-7 returns 6", () => {
  const orig = (globalThis as any).navigator;
  try {
    (globalThis as any).navigator = { hardwareConcurrency: 4 };
    assert.equal(getPrepareBatchSize(), 6);
    (globalThis as any).navigator = { hardwareConcurrency: 7 };
    assert.equal(getPrepareBatchSize(), 6);
  } finally {
    (globalThis as any).navigator = orig;
  }
});

test("getPrepareBatchSize: navigator.hardwareConcurrency < 4 returns 4", () => {
  const orig = (globalThis as any).navigator;
  try {
    (globalThis as any).navigator = { hardwareConcurrency: 2 };
    assert.equal(getPrepareBatchSize(), 4);
    (globalThis as any).navigator = { hardwareConcurrency: 1 };
    assert.equal(getPrepareBatchSize(), 4);
  } finally {
    (globalThis as any).navigator = orig;
  }
});

test("getPrepareBatchSize: no navigator falls back to platform-based value", () => {
  const orig = (globalThis as any).navigator;
  try {
    // Simulate no hardwareConcurrency
    (globalThis as any).navigator = { hardwareConcurrency: 0 };
    const size = getPrepareBatchSize();
    assert.ok([4, 6, 8].includes(size), `expected 4, 6, or 8 fallback, got ${size}`);
  } finally {
    (globalThis as any).navigator = orig;
  }
});
