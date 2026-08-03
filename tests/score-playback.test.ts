import { test } from "node:test";
import assert from "node:assert/strict";
import {
  noteDurationToBeats,
  measureDurationMs,
  measureBeatTotal,
  resolvePlayOrder,
  findCurrentEvent,
  totalTimelineMs,
  buildPlayTimeline,
  type PlayEvent,
} from "../lib/score-playback";
import type { ScoreMeasure, ScoreDocument } from "../lib/score-types";

// ── 헬퍼: 최소 ScoreElement 팩토리 ─────────────────────────────

let idSeq = 0;
function nid() { return `el-${++idSeq}`; }

function noteEl(duration: string, pitch = { step: "C" as const, octave: 4 }) {
  return { id: nid(), type: "note" as const, duration: duration as any, pitch };
}
function restEl(duration: string) {
  return { id: nid(), type: "rest" as const, duration: duration as any };
}

function mkMeasure(elements: any[], overrides: Partial<ScoreMeasure> = {}): ScoreMeasure {
  return { id: `m-${++idSeq}`, elements, ...overrides };
}

const TS44 = { numerator: 4, denominator: 4 };
const TS68 = { numerator: 6, denominator: 8 };
const TS38 = { numerator: 3, denominator: 8 };

function mkDoc(measures: ScoreMeasure[], bpm = 120, ts = TS44): ScoreDocument {
  return {
    id: "doc",
    metadata: { title: "T", createdAt: 0, updatedAt: 0 },
    parts: [{ id: "p1", instrumentId: "piano", clef: "treble", measures }],
    keySignature: { sharps: 0 },
    timeSignature: ts,
    bpm,
  };
}

// ═══════════════════════════════════════════════════════════════
// noteDurationToBeats
// ═══════════════════════════════════════════════════════════════

test("noteDurationToBeats: whole = 4 beats", () => {
  assert.equal(noteDurationToBeats("whole"), 4);
});

test("noteDurationToBeats: half = 2 beats", () => {
  assert.equal(noteDurationToBeats("half"), 2);
});

test("noteDurationToBeats: quarter = 1 beat", () => {
  assert.equal(noteDurationToBeats("quarter"), 1);
});

test("noteDurationToBeats: eighth = 0.5 beats", () => {
  assert.equal(noteDurationToBeats("eighth"), 0.5);
});

test("noteDurationToBeats: sixteenth = 0.25 beats", () => {
  assert.equal(noteDurationToBeats("sixteenth"), 0.25);
});

test("noteDurationToBeats: thirty_second = 0.125 beats", () => {
  assert.equal(noteDurationToBeats("thirty_second"), 0.125);
});

test("noteDurationToBeats: dotted durations are correct", () => {
  assert.equal(noteDurationToBeats("whole_dot"), 6);
  assert.equal(noteDurationToBeats("half_dot"), 3);
  assert.equal(noteDurationToBeats("quarter_dot"), 1.5);
  assert.equal(noteDurationToBeats("eighth_dot"), 0.75);
  assert.equal(noteDurationToBeats("sixteenth_dot"), 0.375);
  assert.equal(noteDurationToBeats("thirty_second_dot"), 0.1875);
});

test("noteDurationToBeats: doubleDotted flag multiplies base by 1.75", () => {
  // quarter_dot = 1.5, but with doubleDotted the base quarter(1) × 1.75 = 1.75
  assert.equal(noteDurationToBeats("quarter", true), 1.75);
  assert.equal(noteDurationToBeats("half", true), 3.5);
  assert.equal(noteDurationToBeats("eighth", true), 0.875);
});

test("noteDurationToBeats: unknown duration falls back to 1 (quarter)", () => {
  assert.equal(noteDurationToBeats("unknown_dur" as any), 1);
});

// ═══════════════════════════════════════════════════════════════
// measureDurationMs — BPM / time-signature / denominator
// ═══════════════════════════════════════════════════════════════

test("measureDurationMs: 4/4 at 120 BPM = 2000ms", () => {
  const m = mkMeasure([]);
  const { durationMs, startBpm, endBpm } = measureDurationMs(m, TS44, 120);
  assert.equal(durationMs, 2000);
  assert.equal(startBpm, 120);
  assert.equal(endBpm, 120);
});

test("measureDurationMs: 4/4 at 60 BPM = 4000ms", () => {
  const { durationMs } = measureDurationMs(mkMeasure([]), TS44, 60);
  assert.equal(durationMs, 4000);
});

test("measureDurationMs: 6/8 at 120 BPM — denominator=8 gives 3 quarter-note beats", () => {
  // 6/8: 6 × (4/8) = 3 beats; 3 × (60000/120) = 1500ms
  const { durationMs } = measureDurationMs(mkMeasure([]), TS68, 120);
  assert.equal(durationMs, 1500);
});

test("measureDurationMs: 3/8 at 120 BPM = 750ms", () => {
  const { durationMs } = measureDurationMs(mkMeasure([]), TS38, 120);
  assert.equal(durationMs, 750);
});

test("measureDurationMs: measure-level BPM overrides prevBpm", () => {
  const m = mkMeasure([], { bpm: 60 });
  const { durationMs, startBpm } = measureDurationMs(m, TS44, 120);
  assert.equal(startBpm, 60);
  assert.equal(durationMs, 4000);
});

test("measureDurationMs: measure-level time-signature overrides doc time-signature", () => {
  const m = mkMeasure([], { timeSignature: TS68 });
  const { durationMs } = measureDurationMs(m, TS44, 120);
  assert.equal(durationMs, 1500); // 6/8 at 120
});

test("measureDurationMs: rit. uses average of start/end BPM", () => {
  const m = mkMeasure([], { tempoChangeType: "rit", tempoEndBpm: 60 });
  // 4/4 at avg BPM (120+60)/2=90: 4 × (60000/90) ≈ 2666.67ms
  const { durationMs, startBpm, endBpm } = measureDurationMs(m, TS44, 120);
  assert.equal(startBpm, 120);
  assert.equal(endBpm, 60);
  assert.ok(Math.abs(durationMs - (4 * (60000 / 90))) < 0.01, `expected ~2667 got ${durationMs}`);
});

test("measureDurationMs: accel. uses average of start/end BPM", () => {
  const m = mkMeasure([], { tempoChangeType: "accel", tempoEndBpm: 180 });
  // avg = (120+180)/2 = 150
  const { durationMs } = measureDurationMs(m, TS44, 120);
  assert.ok(Math.abs(durationMs - (4 * (60000 / 150))) < 0.01);
});

test("measureDurationMs: prevBpm=0 is clamped to 1 (no div-by-zero)", () => {
  const { durationMs } = measureDurationMs(mkMeasure([]), TS44, 0);
  assert.ok(durationMs > 0 && isFinite(durationMs));
});

test("measureDurationMs: denominator=0 fallback to 4", () => {
  const { durationMs } = measureDurationMs(mkMeasure([]), { numerator: 4, denominator: 0 }, 120);
  assert.equal(durationMs, 2000);
});

// ═══════════════════════════════════════════════════════════════
// measureBeatTotal — beat capacity vs actual fill
// ═══════════════════════════════════════════════════════════════

test("measureBeatTotal: empty measure has 0 total, no overflow", () => {
  const status = measureBeatTotal(mkMeasure([]), TS44);
  assert.equal(status.total, 0);
  assert.equal(status.capacity, 4);
  assert.equal(status.overflow, false);
  assert.equal(status.remaining, 4);
});

test("measureBeatTotal: full 4/4 measure (4 quarters) — no overflow", () => {
  const m = mkMeasure([noteEl("quarter"), noteEl("quarter"), noteEl("quarter"), noteEl("quarter")]);
  const status = measureBeatTotal(m, TS44);
  assert.equal(status.total, 4);
  assert.equal(status.overflow, false);
  assert.equal(status.remaining, 0);
});

test("measureBeatTotal: 6/8 capacity = 3 quarter-note beats", () => {
  const status = measureBeatTotal(mkMeasure([]), TS68);
  assert.equal(status.capacity, 3);
});

test("measureBeatTotal: overflow when more beats than capacity", () => {
  const m = mkMeasure([
    noteEl("quarter"), noteEl("quarter"), noteEl("quarter"),
    noteEl("quarter"), noteEl("quarter"),
  ]);
  const status = measureBeatTotal(m, TS44);
  assert.equal(status.overflow, true);
  assert.equal(status.total, 5);
  assert.equal(status.remaining, -1);
});

test("measureBeatTotal: rests count toward beat total", () => {
  const m = mkMeasure([noteEl("half"), restEl("half")]);
  const status = measureBeatTotal(m, TS44);
  assert.equal(status.total, 4);
  assert.equal(status.overflow, false);
});

test("measureBeatTotal: mixed dotted notes", () => {
  // dotted-half (3) + quarter (1) = 4 in 4/4
  const m = mkMeasure([noteEl("half_dot"), noteEl("quarter")]);
  const status = measureBeatTotal(m, TS44);
  assert.equal(status.total, 4);
  assert.equal(status.overflow, false);
});

// ═══════════════════════════════════════════════════════════════
// resolvePlayOrder — repeat signs
// ═══════════════════════════════════════════════════════════════

function mkDocOrder(measures: Partial<ScoreMeasure>[]): ScoreDocument {
  const fullMeasures: ScoreMeasure[] = measures.map((m, i) => ({
    id: `m${i}`,
    elements: [],
    ...m,
  }));
  return mkDoc(fullMeasures);
}

test("resolvePlayOrder: empty doc returns []", () => {
  assert.deepEqual(resolvePlayOrder(mkDoc([])), []);
});

test("resolvePlayOrder: 3 plain measures returns [0, 1, 2]", () => {
  const doc = mkDocOrder([{}, {}, {}]);
  assert.deepEqual(resolvePlayOrder(doc), [0, 1, 2]);
});

test("resolvePlayOrder: repeat block plays twice (repeatEnd without explicit repeatStart loops from idx 0)", () => {
  // No explicit repeatStart on m0 — default repeatStartIdx=0.
  // Visiting m0 with repeatStart:true would reset the pass counter, so we test the
  // typical case where the repeat start is implicit (first measure).
  const doc = mkDocOrder([
    {},
    {},
    { repeatEnd: true },
    {},
  ]);
  assert.deepEqual(resolvePlayOrder(doc), [0, 1, 2, 0, 1, 2, 3]);
});

test("resolvePlayOrder: jumpTo=fine stops immediately", () => {
  const doc = mkDocOrder([{}, { jumpTo: "fine" }, {}]);
  assert.deepEqual(resolvePlayOrder(doc), [0, 1]);
});

test("resolvePlayOrder: jumpTo=start plays from beginning (once)", () => {
  const doc = mkDocOrder([{}, {}, { jumpTo: "start" }]);
  // order: 0 1 2 (jump to start, jumped=true) 0 1 2
  assert.deepEqual(resolvePlayOrder(doc), [0, 1, 2, 0, 1, 2]);
});

test("resolvePlayOrder: volta brackets — 1st bracket skipped on 2nd pass", () => {
  // Implicit repeatStart at m0 (default repeatStartIdx=0, no repeatStart flag so
  // the counter is not reset when looping back).
  // 1st pass: 0, 1(volta=1 kept, passCount=0), 2(repeatEnd → passCount=1, loop).
  // 2nd pass: 0, 1(volta=1 popped, passCount=1>0), 2(repeatEnd → done). → [0,1,2,0,2]
  const doc = mkDocOrder([
    {},
    { voltaBracket: 1 },
    { repeatEnd: true, voltaBracket: 2 },
  ]);
  const order = resolvePlayOrder(doc);
  assert.deepEqual(order, [0, 1, 2, 0, 2]);
});

test("resolvePlayOrder: single-measure doc", () => {
  assert.deepEqual(resolvePlayOrder(mkDoc([mkMeasure([])])), [0]);
});

// ═══════════════════════════════════════════════════════════════
// findCurrentEvent
// ═══════════════════════════════════════════════════════════════

function mkTimeline(durations: number[]): PlayEvent[] {
  let t = 0;
  return durations.map((dur, i) => {
    const ev: PlayEvent = {
      seqIdx: i, measureIdx: i, startTimeMs: t, durationMs: dur,
      effectiveBpm: 120, endBpm: 120, notes: [], isPercussion: false, instrumentId: "piano",
    };
    t += dur;
    return ev;
  });
}

test("findCurrentEvent: empty timeline returns null", () => {
  const { event } = findCurrentEvent([], 0);
  assert.equal(event, null);
});

test("findCurrentEvent: elapsed=0 returns first event, fraction=0", () => {
  const tl = mkTimeline([1000, 1000]);
  const { event, fraction } = findCurrentEvent(tl, 0);
  assert.equal(event?.seqIdx, 0);
  assert.equal(fraction, 0);
});

test("findCurrentEvent: elapsed mid-first-event", () => {
  const tl = mkTimeline([1000, 1000]);
  const { event, fraction } = findCurrentEvent(tl, 500);
  assert.equal(event?.seqIdx, 0);
  assert.equal(fraction, 0.5);
});

test("findCurrentEvent: elapsed at exact boundary of second event", () => {
  const tl = mkTimeline([1000, 1000]);
  const { event } = findCurrentEvent(tl, 1000);
  assert.equal(event?.seqIdx, 1);
});

test("findCurrentEvent: elapsed past end returns last event with fraction=1", () => {
  const tl = mkTimeline([1000, 1000]);
  const { event, fraction } = findCurrentEvent(tl, 9999);
  assert.equal(event?.seqIdx, 1);
  assert.equal(fraction, 1);
});

test("findCurrentEvent: single-event timeline", () => {
  const tl = mkTimeline([2000]);
  assert.equal(findCurrentEvent(tl, 1000).event?.seqIdx, 0);
});

// ═══════════════════════════════════════════════════════════════
// totalTimelineMs
// ═══════════════════════════════════════════════════════════════

test("totalTimelineMs: empty timeline = 0", () => {
  assert.equal(totalTimelineMs([]), 0);
});

test("totalTimelineMs: sums all durations", () => {
  const tl = mkTimeline([1000, 2000, 500]);
  assert.equal(totalTimelineMs(tl), 3500);
});

test("totalTimelineMs: single event", () => {
  assert.equal(totalTimelineMs(mkTimeline([1234])), 1234);
});

// ═══════════════════════════════════════════════════════════════
// buildPlayTimeline — integration of all sub-functions
// ═══════════════════════════════════════════════════════════════

test("buildPlayTimeline: empty doc returns []", () => {
  assert.deepEqual(buildPlayTimeline(mkDoc([])), []);
});

test("buildPlayTimeline: single measure, no notes", () => {
  const events = buildPlayTimeline(mkDoc([mkMeasure([])]));
  assert.equal(events.length, 1);
  assert.equal(events[0].seqIdx, 0);
  assert.equal(events[0].measureIdx, 0);
  assert.equal(events[0].startTimeMs, 0);
  assert.equal(events[0].durationMs, 2000); // 4/4 at 120
  assert.deepEqual(events[0].notes, []);
});

test("buildPlayTimeline: multiple measures accumulate startTimeMs", () => {
  const events = buildPlayTimeline(mkDoc([mkMeasure([]), mkMeasure([]), mkMeasure([])]));
  assert.equal(events.length, 3);
  assert.equal(events[0].startTimeMs, 0);
  assert.equal(events[1].startTimeMs, 2000);
  assert.equal(events[2].startTimeMs, 4000);
});

test("buildPlayTimeline: BPM change propagates to subsequent measures", () => {
  const m0 = mkMeasure([]);
  const m1 = mkMeasure([], { bpm: 60 }); // slows down here
  const m2 = mkMeasure([]);
  const events = buildPlayTimeline(mkDoc([m0, m1, m2]));
  // m0: 2000ms at 120; m1: 4000ms at 60; m2 uses endBpm=60 → 4000ms
  assert.equal(events[0].durationMs, 2000);
  assert.equal(events[1].durationMs, 4000);
  assert.equal(events[2].durationMs, 4000);
  assert.equal(events[2].startTimeMs, 6000);
});

test("buildPlayTimeline: note events are generated with correct offsetMs", () => {
  const qNote = noteEl("quarter"); // C4
  const m = mkMeasure([qNote, noteEl("quarter"), noteEl("quarter"), noteEl("quarter")]);
  const events = buildPlayTimeline(mkDoc([m]));
  assert.equal(events[0].notes.length, 4);
  const [n0, n1, n2, n3] = events[0].notes;
  assert.equal(n0.startOffsetMs, 0);
  assert.equal(n1.startOffsetMs, 500); // quarter at 120 = 500ms
  assert.equal(n2.startOffsetMs, 1000);
  assert.equal(n3.startOffsetMs, 1500);
});

test("buildPlayTimeline: note duration is 82% of theoretical duration", () => {
  const m = mkMeasure([noteEl("quarter")]); // 500ms theoretical
  const events = buildPlayTimeline(mkDoc([m]));
  const note = events[0].notes[0];
  assert.ok(Math.abs(note.durationMs - 500 * 0.82) < 0.1, `expected 410, got ${note.durationMs}`);
});

test("buildPlayTimeline: tieEnd notes are not emitted as events", () => {
  const n1 = { ...noteEl("half"), tieStart: true };
  const n2 = { ...noteEl("half"), tieEnd: true };
  const m = mkMeasure([n1, n2]);
  const events = buildPlayTimeline(mkDoc([m]));
  assert.equal(events[0].notes.length, 1); // only the tieStart note
  assert.equal(events[0].notes[0].startOffsetMs, 0);
});

test("buildPlayTimeline: rest elements advance offset but produce no note events", () => {
  const m = mkMeasure([restEl("half"), noteEl("half")]);
  const events = buildPlayTimeline(mkDoc([m]));
  assert.equal(events[0].notes.length, 1);
  assert.equal(events[0].notes[0].startOffsetMs, 1000); // half rest at 120 = 1000ms
});

test("buildPlayTimeline: repeat doubles event count", () => {
  // Implicit repeatStart (no flag on m0, default idx=0, counter not reset on loop-back).
  const m0 = mkMeasure([]);
  const m1 = mkMeasure([], { repeatEnd: true });
  const events = buildPlayTimeline(mkDoc([m0, m1]));
  assert.equal(events.length, 4); // order: [0,1,0,1]
});

test("buildPlayTimeline: 6/8 measures have correct duration", () => {
  const events = buildPlayTimeline(mkDoc([mkMeasure([])], 120, TS68));
  assert.equal(events[0].durationMs, 1500); // 3 beats × 500ms
});

test("buildPlayTimeline: effectiveBpm matches measure BPM", () => {
  const m = mkMeasure([], { bpm: 90 });
  const events = buildPlayTimeline(mkDoc([m]));
  assert.equal(events[0].effectiveBpm, 90);
});

test("buildPlayTimeline: very fast BPM (300) produces short durations", () => {
  const events = buildPlayTimeline(mkDoc([mkMeasure([])], 300));
  // 4/4 at 300: 4 × (60000/300) = 800ms
  assert.equal(events[0].durationMs, 800);
});

test("buildPlayTimeline: pitchToMidi uses octave*12 + stepSemitones (C5 = MIDI 60)", () => {
  // This library's pitchToMidi: base = octave * 12 + STEP_SEMITONES[step].
  // STEP_SEMITONES["C"] = 0, so C5 = 5*12 = 60 (standard MIDI middle C).
  const m = mkMeasure([noteEl("quarter", { step: "C", octave: 5 })]);
  const events = buildPlayTimeline(mkDoc([m]));
  assert.equal(events[0].notes[0].midiNote, 60);
  // Relative interval check: D5 should be 2 semitones above C5 = 62
  const m2 = mkMeasure([noteEl("quarter", { step: "D", octave: 5 })]);
  const events2 = buildPlayTimeline(mkDoc([m2]));
  assert.equal(events2[0].notes[0].midiNote - events[0].notes[0].midiNote, 2);
});

test("buildPlayTimeline: percussion part notes populate drumType", () => {
  const drumNote = {
    id: nid(), type: "note" as const,
    pitch: { step: "C" as const, octave: 4 },
    duration: "quarter" as any,
    drumType: "snare" as const,
  };
  const m = mkMeasure([drumNote]);
  const doc: ScoreDocument = {
    id: "doc",
    metadata: { title: "T", createdAt: 0, updatedAt: 0 },
    parts: [{ id: "p1", instrumentId: "drums", clef: "percussion", measures: [m] }],
    keySignature: { sharps: 0 },
    timeSignature: TS44,
    bpm: 120,
  };
  const events = buildPlayTimeline(doc);
  // percussion part is excluded from non-percussion note building
  assert.equal(events.length, 1);
  assert.equal(events[0].notes.length, 0); // no pitched notes
});
