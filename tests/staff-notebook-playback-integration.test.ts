/** @jest-environment jsdom */
import { act, cleanup, renderHook } from "@testing-library/react";
import * as renderer from "../lib/audio-renderer";
import * as audioExport from "../lib/audio-export";
import { useNotebookPlayback } from "../hooks/useNotebookPlayback";
import { DEFAULT_NOTEBOOK_SETTINGS, type StaffNotebook } from "../lib/staff-notebook";
import { materializeRows, ROW_HEIGHT } from "../lib/staff-notebook-layout";
import type { PracticeEntry } from "../lib/storage";
import type { BeatType } from "../lib/metronome-engine";

// Keep the engine, export path, plan and PCM mixer real. Only asset decoding and
// the output device are replaced. Distinct one-sample clicks expose every mixed
// event (including missing, extra, muted and incorrectly reordered events).
jest.mock("react-native", () => ({
  ...jest.requireActual("react-native"),
  Platform: { OS: "web" },
  AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
}));
jest.mock("../lib/audio-renderer", () => ({
  __esModule: true,
  ...jest.requireActual("../lib/audio-renderer"),
  loadAssetPCM: jest.fn(),
  getWebAudioContext: jest.fn(),
  playWebRenderedLoop: jest.fn(),
}));

const SR = renderer.getRenderSampleRate();
const amplitude: Record<BeatType, number> = { strong: 0.125, accent: 0.25, normal: 0.375, mute: 0 };
const sourceOrder = [0, 1, 2, 1, 2, 3, 4, 5, 6, 7];
// Bar cells are single pulses, even with a stored meter numerator. 3/8 at
// BPM 120 normalizes to quarter-note BPM 60 (1000ms); per-cell BPM overrides
// and subdivisions must both survive.
const duration = [500, 1000, 1000, 500, 500, 250, 500, 500];
const patterns: BeatType[][] = [
  ["strong"], ["accent", "normal"], ["normal", "mute", "accent"],
  ["mute", "mute"], ["normal"], ["strong", "normal", "accent", "normal"],
  ["accent"], ["normal"],
];

function makeNote(lineUnit: "measure" | "phrase", count: number): StaffNotebook {
  const source: PracticeEntry = {
    id: "complex-bar", label: "Mixed meter / repeats / rests", createdAt: 1,
    mode: "bar", bpm: 120, beatsPerMeasure: 8,
    beatTypes: ["strong", "accent", "normal", "mute", "normal", "strong", "accent", "normal"],
    beatSubdivisions: { "1": ["normal", "normal"], "2": ["normal", "mute", "accent"],
      "3": ["normal", "accent"], "5": ["normal", "normal", "accent", "normal"] },
    barRepeats: {
      0: { type: "count", value: 1, meterNumerator: 3, meterDenominator: 4 },
      1: { type: "count", value: 1, bpm: 60, meterNumerator: 2, meterDenominator: 4 },
      2: { type: "count", value: 1, bpm: 120, meterNumerator: 3, meterDenominator: 8 },
      5: { type: "count", value: 1, bpm: 240, meterNumerator: 2, meterDenominator: 4 },
    },
    loopBlocks: [{ startBeat: 1, endBeat: 2, type: "count", value: 2 }],
    blockPlayMode: "sequential", barLoopMode: "once", subdivisionPattern: [],
  };
  // One row per page also catches accidental pageIndex/rowIndex confusion.
  return {
    id: "written", title: "Do not change", updatedAt: 7,
    settings: { ...DEFAULT_NOTEBOOK_SETTINGS, lineUnit, random: true, source },
    pages: Array.from({ length: count }, (_, i) => ({
      id: `page-${i}`, staffCount: 1,
      strokes: [{ id: `ink-${i}`, width: 2, points: [{ x: 60 + i, y: 102 }] }],
      stamps: [{ id: `stamp-${i}`, glyph: "sharp", x: 90 + i, y: 102, size: 26 }],
    })),
  };
}

function freezeDeep<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

// Independent oracle: no calls to buildNotebookPlan or schedule filtering.
function expectedPlayback(rowOrder: number[], perRow: number) {
  const events: { time: number; type: BeatType; beat: number; subBeat: number }[] = [];
  const rowEnds: number[] = [];
  const beats: number[] = [];
  let cursor = 0;
  for (const row of rowOrder) {
    for (let j = 0; j < perRow; j++) {
      const beat = sourceOrder[(row * perRow + j) % sourceOrder.length];
      beats.push(beat);
      patterns[beat].forEach((type, subBeat) => {
        events.push({ time: cursor + duration[beat] * subBeat / patterns[beat].length, type, beat, subBeat });
      });
      cursor += duration[beat];
    }
    rowEnds.push(cursor);
  }
  return { events, rowEnds, beats, durationMs: cursor };
}

let presentedMs = 1;
let outputRunning = true;
const stopOutput = jest.fn(() => { outputRunning = false; });
let mix: jest.SpyInstance;
let render: jest.SpyInstance;
let random: jest.SpyInstance;

function expectPlaybackMatches(note: StaffNotebook, rows: ReturnType<typeof useNotebookPlayback>["rows"],
  order: number[], perRow: number, renderCalls = 1, outputCalls = 1) {
  const expected = expectedPlayback(order, perRow);
  expect(rows.map((row) => row.pageIndex)).toEqual(order);
  expect(render).toHaveBeenCalledTimes(renderCalls);
  expect(mix).toHaveBeenCalledTimes(outputCalls);
  expect(renderer.playWebRenderedLoop).toHaveBeenCalledTimes(outputCalls);
  const params = mix.mock.calls[outputCalls - 1][0] as Parameters<typeof renderer.renderMeasureAbortable>[0];
  expect(params.measureDurationMs).toBe(expected.durationMs);
  expect(params.schedule).toHaveLength(expected.events.length);
  params.schedule.forEach((tick, i) => {
    const { time, ...identity } = expected.events[i];
    expect(tick).toMatchObject(identity);
    expect(tick.time).toBeCloseTo(time, 7);
  });
  expect(params.schedule.filter((tick) => tick.subBeat === 0).map((tick) => tick.beat)).toEqual(expected.beats);
  // Every occurrence of the atomic block is complete and internally ordered.
  expected.beats.forEach((beat, i) => {
    if (beat === 1 && expected.beats[i - 1] !== 2) expect(expected.beats.slice(i, i + 4)).toEqual([1, 2, 1, 2]);
  });

  const pcm = jest.mocked(renderer.playWebRenderedLoop).mock.calls[outputCalls - 1][0];
  expect(pcm).toBeInstanceOf(Float32Array);
  if (!(pcm instanceof Float32Array)) throw new Error("Expected mono notebook output");
  expect(pcm.length).toBe(Math.ceil(expected.durationMs / 1000 * SR));
  const actualEvents: { sample: number; value: number }[] = [];
  pcm.forEach((value, sample) => { if (value !== 0) actualEvents.push({ sample, value }); });
  expect(actualEvents).toEqual(expected.events.filter((event) => event.type !== "mute")
    .map((event) => ({ sample: Math.round(event.time / 1000 * SR), value: amplitude[event.type] })));

  const paper = materializeRows(note, rows);
  expect(paper.strokes.map((stroke) => stroke.points[0])).toEqual(
    order.map((original, i) => ({ x: 60 + original, y: 102 + i * ROW_HEIGHT })));
  expect(paper.stamps?.map(({ x, y }) => ({ x, y }))).toEqual(
    order.map((original, i) => ({ x: 90 + original, y: 102 + i * ROW_HEIGHT })));
  return expected;
}

beforeEach(() => {
  // The production mixer yields through setTimeout. Only the presentation
  // interval is virtual, so preparation still executes its real async path.
  jest.useFakeTimers({ doNotFake: ["setTimeout", "performance"] });
  presentedMs = 1;
  outputRunning = true;
  stopOutput.mockClear();
  jest.mocked(renderer.loadAssetPCM).mockReset()
    .mockResolvedValueOnce(new Float32Array([amplitude.strong]))
    .mockResolvedValueOnce(new Float32Array([amplitude.accent]))
    .mockResolvedValueOnce(new Float32Array([amplitude.normal]));
  jest.mocked(renderer.getWebAudioContext).mockReturnValue({ state: "running" } as AudioContext);
  jest.mocked(renderer.playWebRenderedLoop).mockReset().mockReturnValue({
    stop: stopOutput,
    isRunning: () => outputRunning,
    getPresentedPositionSeconds: () => presentedMs / 1000,
    // Deliberately different: following render-ahead instead of audible time
    // must fail the boundary checks below.
    getPositionSeconds: () => 999,
  });
  mix = jest.spyOn(renderer, "renderMeasureAbortable");
  render = jest.spyOn(audioExport, "renderNotebookPatternPCM");
  random = jest.spyOn(Math, "random").mockReturnValue(0);
});

afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe.each(["measure", "phrase"] as const)("%s cancellation during asset decoding", (lineUnit) => {
  describe.each(["stop", "inactive", "unmount"] as const)("%s", (cancellation) => {
    test.each(["resolve", "reject"] as const)("ignores late decode %s without output, paper timers or errors", async (completion) => {
      const note = freezeDeep(makeNote(lineUnit, lineUnit === "measure" ? 10 : 5));
      const before = JSON.stringify(note);
      const delayed = deferred<Float32Array>();
      // The decoder intentionally ignores abort and settles only AFTER leaving
      // preparation. The export, engine, plan and mixer are not stubbed.
      jest.mocked(renderer.loadAssetPCM).mockReset()
        .mockReturnValueOnce(delayed.promise)
        .mockResolvedValueOnce(new Float32Array([amplitude.accent]))
        .mockResolvedValueOnce(new Float32Array([amplitude.normal]));
      const hook = renderHook(({ active }) => useNotebookPlayback(note, active),
        { initialProps: { active: true } });
      const interval = jest.spyOn(globalThis, "setInterval");
      let pendingStart!: Promise<void>;
      act(() => { pendingStart = hook.result.current.start(); });
      expect(hook.result.current.preparing).toBe(true);
      expect(hook.result.current.running).toBe(false);
      expect(hook.result.current.error).toBe("");
      expect(render).toHaveBeenCalledTimes(1);
      expect(render.mock.calls[0][0]).toBe(note.settings?.source);
      expect(renderer.loadAssetPCM).toHaveBeenCalledTimes(3);
      const signal = render.mock.calls[0][1] as AbortSignal;
      expect(signal.aborted).toBe(false);
      expect(mix).not.toHaveBeenCalled();
      expect(renderer.playWebRenderedLoop).not.toHaveBeenCalled();
      expect(interval).not.toHaveBeenCalled();

      if (cancellation === "stop") act(() => { hook.result.current.stop(); });
      else if (cancellation === "inactive") hook.rerender({ active: false });
      else hook.unmount();
      expect(signal.aborted).toBe(true);
      // renderHook retains the last committed result after unmount; it is not
      // evidence of live state. Mounted cancellations must clear preparation.
      if (cancellation !== "unmount") {
        expect(hook.result.current.preparing).toBe(false);
        expect(hook.result.current.running).toBe(false);
      }
      const cancelled = hook.result.current;
      expect(cancelled.rows).toEqual([]);
      expect(cancelled.position).toEqual({ row: 0, progress: 0 });
      expect(cancelled.error).toBe("");

      await act(async () => {
        if (completion === "resolve") delayed.resolve(new Float32Array([amplitude.strong]));
        else delayed.reject(new Error("Cancelled asset decode failed"));
        await pendingStart;
      });
      presentedMs = 5000;
      act(() => { jest.advanceTimersByTime(300); });
      // No late paper publication, progress update or user-visible error.
      expect(hook.result.current).toBe(cancelled);
      expect(hook.result.current.error).toBe("");
      expect(render).toHaveBeenCalledTimes(1);
      expect(renderer.loadAssetPCM).toHaveBeenCalledTimes(3);
      expect(mix).not.toHaveBeenCalled();
      expect(renderer.playWebRenderedLoop).not.toHaveBeenCalled();
      expect(interval).not.toHaveBeenCalled();
      expect(stopOutput).not.toHaveBeenCalled();
      expect(JSON.stringify(note)).toBe(before);
      if (cancellation !== "unmount") hook.unmount();
    });
  });
});

describe.each([
  // The four emitted cells of block [1,2] must stay adjacent, even across
  // paper rows. Phrase rows 0+1 and 2+3 are joined by separate block passes.
  { lineUnit: "measure" as const, count: 10, perRow: 1, order: [1, 2, 3, 4, 5, 6, 7, 8, 9, 0] },
  { lineUnit: "phrase" as const, count: 5, perRow: 4, order: [2, 3, 4, 0, 1] },
])("$lineUnit complex Bar integration", ({ lineUnit, count, perRow, order }) => {
  test("pre-shuffled paper, rendered events and audible row boundaries agree without changing the source", async () => {
    const note = freezeDeep(makeNote(lineUnit, count));
    const before = JSON.stringify(note);
    const hook = renderHook(() => useNotebookPlayback(note, true));
    await act(async () => { await hook.result.current.start(); });

    expect(hook.result.current.error).toBe("");
    expect(hook.result.current.running).toBe(true);
    expect(hook.result.current.preparing).toBe(false);
    const expected = expectPlaybackMatches(note, hook.result.current.rows, order, perRow);
    const randomCalls = random.mock.calls.length;
    expect(randomCalls).toBeGreaterThan(0);
    // No second shuffle when playback advances or hits a row boundary.
    for (let row = 0; row < count; row++) {
      const start = row ? expected.rowEnds[row - 1] : 0;
      const end = expected.rowEnds[row];
      presentedMs = (start + end) / 2;
      act(() => { jest.advanceTimersByTime(30); });
      expect(hook.result.current.position).toEqual({ row, progress: 0.5 });
      if (row < count - 1) {
        presentedMs = end - 0.001;
        act(() => { jest.advanceTimersByTime(30); });
        expect(hook.result.current.position.row).toBe(row);
        presentedMs = end;
        act(() => { jest.advanceTimersByTime(30); });
        expect(hook.result.current.position).toEqual({ row: row + 1, progress: 0 });
      }
    }
    presentedMs = expected.durationMs;
    act(() => { jest.advanceTimersByTime(30); });
    expect(hook.result.current.position).toEqual({ row: count - 1, progress: 1 });
    expect(hook.result.current.running).toBe(false);
    expect(stopOutput).toHaveBeenCalledTimes(1);
    expect(random).toHaveBeenCalledTimes(randomCalls);
    expect(JSON.stringify(note)).toBe(before);
    hook.unmount();
    expect(stopOutput).toHaveBeenCalledTimes(1);
  });
});

test.each([
  { repair: "add measure rows", lineUnit: "measure", count: 3, nextUnit: "measure", nextCount: 5,
    perRow: 1, order: [1, 2, 3, 4, 0] },
  { repair: "add phrase rows", lineUnit: "phrase", count: 3, nextUnit: "phrase", nextCount: 4,
    perRow: 4, order: [2, 3, 0, 1] },
  { repair: "switch measure to phrase", lineUnit: "measure", count: 4, nextUnit: "phrase", nextCount: 4,
    perRow: 4, order: [2, 3, 0, 1] },
  { repair: "switch phrase to measure", lineUnit: "phrase", count: 6, nextUnit: "measure", nextCount: 6,
    perRow: 1, order: [1, 2, 3, 4, 5, 0] },
] as const)("$repair recovers from an incomplete block on the same hook", async ({
  lineUnit, count, nextUnit, nextCount, perRow, order,
}) => {
  const note = freezeDeep(makeNote(lineUnit, count));
  const corrected = freezeDeep(makeNote(nextUnit, nextCount));
  const before = JSON.stringify(note);
  const correctedBefore = JSON.stringify(corrected);
  const hook = renderHook(({ document }) => useNotebookPlayback(document, true),
    { initialProps: { document: note } });
  const interval = jest.spyOn(globalThis, "setInterval");
  const clearInterval = jest.spyOn(globalThis, "clearInterval");
  // Reuse the original callback as well as the hook instance: it must read
  // the latest edited document, not the rejected snapshot.
  const start = hook.result.current.start;
  await act(async () => { await start(); });
  expect(hook.result.current.error).toContain("반복 블록이 마지막 줄에서 잘립니다");
  expect(hook.result.current.error).toContain("Add rows to complete the source block.");
  expect(hook.result.current.running).toBe(false);
  expect(hook.result.current.preparing).toBe(false);
  expect(hook.result.current.rows).toEqual([]);
  expect(render).not.toHaveBeenCalled();
  expect(mix).not.toHaveBeenCalled();
  expect(renderer.loadAssetPCM).not.toHaveBeenCalled();
  expect(renderer.playWebRenderedLoop).not.toHaveBeenCalled();
  expect(stopOutput).not.toHaveBeenCalled();
  expect(random).not.toHaveBeenCalled();
  expect(interval).not.toHaveBeenCalled();

  hook.rerender({ document: corrected });
  await act(async () => { await start(); });
  expect(hook.result.current.error).toBe("");
  expect(hook.result.current.running).toBe(true);
  expect(hook.result.current.preparing).toBe(false);
  const expected = expectPlaybackMatches(corrected, hook.result.current.rows, [...order], perRow);
  expect(stopOutput).not.toHaveBeenCalled();
  expect(interval).toHaveBeenCalledTimes(1);
  const randomCalls = random.mock.calls.length;
  for (let row = 0; row < nextCount; row++) {
    const startMs = row ? expected.rowEnds[row - 1] : 0;
    presentedMs = (startMs + expected.rowEnds[row]) / 2;
    act(() => { jest.advanceTimersByTime(30); });
    expect(hook.result.current.position).toEqual({ row, progress: 0.5 });
  }
  expect(random).toHaveBeenCalledTimes(randomCalls);
  expect(render).toHaveBeenCalledTimes(1);
  expect(mix).toHaveBeenCalledTimes(1);
  expect(renderer.playWebRenderedLoop).toHaveBeenCalledTimes(1);
  expect(interval).toHaveBeenCalledTimes(1);
  hook.unmount();
  expect(stopOutput).toHaveBeenCalledTimes(1);
  expect(clearInterval).toHaveBeenCalledTimes(1);
  expect(clearInterval).toHaveBeenCalledWith(interval.mock.results[0].value);
  expect(JSON.stringify(note)).toBe(before);
  expect(JSON.stringify(corrected)).toBe(correctedBefore);
});

test.each(["measure", "phrase"] as const)("%s stops previous output when restarting with an incomplete block", async (lineUnit) => {
  const note = freezeDeep(makeNote(lineUnit, lineUnit === "measure" ? 10 : 5));
  const incomplete = freezeDeep(makeNote(lineUnit, 3));
  const before = JSON.stringify(note);
  const incompleteBefore = JSON.stringify(incomplete);
  const hook = renderHook(({ document }) => useNotebookPlayback(document, true),
    { initialProps: { document: note } });
  const interval = jest.spyOn(globalThis, "setInterval");
  const clearInterval = jest.spyOn(globalThis, "clearInterval");
  await act(async () => { await hook.result.current.start(); });
  expect(hook.result.current.error).toBe("");
  expect(hook.result.current.running).toBe(true);
  expect(hook.result.current.preparing).toBe(false);
  expect(render).toHaveBeenCalledTimes(1);
  expect(mix).toHaveBeenCalledTimes(1);
  expect(renderer.playWebRenderedLoop).toHaveBeenCalledTimes(1);
  expect(outputRunning).toBe(true);
  expect(stopOutput).not.toHaveBeenCalled();
  expect(interval).toHaveBeenCalledTimes(1);
  const decodeCalls = jest.mocked(renderer.loadAssetPCM).mock.calls.length;
  const randomCalls = random.mock.calls.length;
  const position = hook.result.current.position;

  hook.rerender({ document: incomplete });
  await act(async () => { await hook.result.current.start(); });
  expect(hook.result.current.error).toContain("반복 블록이 마지막 줄에서 잘립니다");
  expect(hook.result.current.error).toContain("Add rows to complete the source block.");
  expect(hook.result.current.running).toBe(false);
  expect(hook.result.current.preparing).toBe(false);
  expect(stopOutput).toHaveBeenCalledTimes(1);
  expect(outputRunning).toBe(false);
  expect(clearInterval).toHaveBeenCalledTimes(1);
  expect(clearInterval).toHaveBeenCalledWith(interval.mock.results[0].value);
  // Neither an old presentation timer nor a rejected restart may produce work.
  presentedMs = 1000;
  act(() => { jest.advanceTimersByTime(300); });
  expect(hook.result.current.position).toEqual(position);
  expect(render).toHaveBeenCalledTimes(1);
  expect(mix).toHaveBeenCalledTimes(1);
  expect(renderer.loadAssetPCM).toHaveBeenCalledTimes(decodeCalls);
  expect(renderer.playWebRenderedLoop).toHaveBeenCalledTimes(1);
  expect(random).toHaveBeenCalledTimes(randomCalls);
  expect(interval).toHaveBeenCalledTimes(1);
  hook.unmount();
  expect(stopOutput).toHaveBeenCalledTimes(1);
  expect(clearInterval).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(note)).toBe(before);
  expect(JSON.stringify(incomplete)).toBe(incompleteBefore);
});

describe.each([
  { lineUnit: "measure" as const, count: 10, perRow: 1, order: [1, 2, 3, 4, 5, 6, 7, 8, 9, 0] },
  { lineUnit: "phrase" as const, count: 5, perRow: 4, order: [2, 3, 4, 0, 1] },
])("$lineUnit restart during PCM preparation", ({ lineUnit, count, perRow, order }) => {
  test.each(["resolve", "reject"] as const)("ignores an older decode that completes late (%s)", async (completion) => {
    const previous = freezeDeep(makeNote(lineUnit === "measure" ? "phrase" : "measure",
      lineUnit === "measure" ? 5 : 10));
    const latest = freezeDeep(makeNote(lineUnit, count));
    const previousBefore = JSON.stringify(previous);
    const latestBefore = JSON.stringify(latest);
    const delayed = deferred<Float32Array>();
    // Only the first asset decode is stalled. Both starts still use the real
    // export/schedule/mixer path; the old decoder deliberately ignores abort.
    jest.mocked(renderer.loadAssetPCM).mockReset()
      .mockReturnValueOnce(delayed.promise)
      .mockResolvedValueOnce(new Float32Array([amplitude.accent]))
      .mockResolvedValueOnce(new Float32Array([amplitude.normal]))
      .mockResolvedValueOnce(new Float32Array([amplitude.strong]))
      .mockResolvedValueOnce(new Float32Array([amplitude.accent]))
      .mockResolvedValueOnce(new Float32Array([amplitude.normal]));
    const hook = renderHook(({ document }) => useNotebookPlayback(document, true),
      { initialProps: { document: previous } });
    const interval = jest.spyOn(globalThis, "setInterval");
    const clearInterval = jest.spyOn(globalThis, "clearInterval");
    const start = hook.result.current.start;
    let firstStart!: Promise<void>;
    act(() => { firstStart = start(); });
    expect(hook.result.current.preparing).toBe(true);
    expect(hook.result.current.running).toBe(false);
    expect(hook.result.current.rows).toEqual([]);
    expect(render).toHaveBeenCalledTimes(1);
    expect(renderer.loadAssetPCM).toHaveBeenCalledTimes(3);
    expect(mix).not.toHaveBeenCalled();
    expect(renderer.playWebRenderedLoop).not.toHaveBeenCalled();
    expect(interval).not.toHaveBeenCalled();
    const firstSignal = render.mock.calls[0][1] as AbortSignal;
    expect(firstSignal.aborted).toBe(false);

    // Same hook AND original callback; start() must read the edited document.
    hook.rerender({ document: latest });
    expect(hook.result.current.start).toBe(start);
    await act(async () => { await start(); });
    expect(firstSignal.aborted).toBe(true);
    expect(render).toHaveBeenCalledTimes(2);
    expect(render.mock.calls[1][0]).toBe(latest.settings?.source);
    expect((render.mock.calls[1][1] as AbortSignal).aborted).toBe(false);
    expect(renderer.loadAssetPCM).toHaveBeenCalledTimes(6);
    // Two exports entered preparation, but only the winner reached the real
    // mixer. Check its complete PCM and paper against the independent oracle.
    const expected = expectPlaybackMatches(latest, hook.result.current.rows, order, perRow, 2);
    expect(hook.result.current.running).toBe(true);
    expect(hook.result.current.preparing).toBe(false);
    expect(hook.result.current.error).toBe("");
    expect(interval).toHaveBeenCalledTimes(1);
    expect(stopOutput).not.toHaveBeenCalled();

    presentedMs = expected.rowEnds[0] + (expected.rowEnds[1] - expected.rowEnds[0]) / 2;
    act(() => { jest.advanceTimersByTime(30); });
    expect(hook.result.current.position).toEqual({ row: 1, progress: 0.5 });
    const rows = hook.result.current.rows;
    const position = hook.result.current.position;
    const randomCalls = random.mock.calls.length;
    await act(async () => {
      if (completion === "resolve") delayed.resolve(new Float32Array([amplitude.strong]));
      else delayed.reject(new Error("Old asset decode failed"));
      await firstStart;
    });
    expect(hook.result.current.rows).toBe(rows);
    expect(hook.result.current.position).toBe(position);
    expect(hook.result.current.running).toBe(true);
    expect(hook.result.current.preparing).toBe(false);
    expect(hook.result.current.error).toBe("");
    expect(outputRunning).toBe(true);
    expect(stopOutput).not.toHaveBeenCalled();
    expect(clearInterval).not.toHaveBeenCalled();
    expect(interval).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledTimes(2);
    expect(mix).toHaveBeenCalledTimes(1);
    expect(renderer.playWebRenderedLoop).toHaveBeenCalledTimes(1);
    expect(renderer.loadAssetPCM).toHaveBeenCalledTimes(6);
    expect(random).toHaveBeenCalledTimes(randomCalls);

    presentedMs = expected.rowEnds[1];
    act(() => { jest.advanceTimersByTime(30); });
    expect(hook.result.current.position).toEqual({ row: 2, progress: 0 });
    hook.unmount();
    expect(stopOutput).toHaveBeenCalledTimes(1);
    expect(clearInterval).toHaveBeenCalledTimes(1);
    expect(clearInterval).toHaveBeenCalledWith(interval.mock.results[0].value);
    expect(JSON.stringify(previous)).toBe(previousBefore);
    expect(JSON.stringify(latest)).toBe(latestBefore);
  });
});

describe.each([
  { lineUnit: "measure" as const, count: 10, perRow: 1, order: [1, 2, 3, 4, 5, 6, 7, 8, 9, 0] },
  { lineUnit: "phrase" as const, count: 5, perRow: 4, order: [2, 3, 4, 0, 1] },
])("$lineUnit restart while output is starting", ({ lineUnit, count, perRow, order }) => {
  describe.each(["isRunning", "presented position"] as const)("waiting for %s", (waitingFor) => {
    test.each(["late readiness", "expired deadline"] as const)("preserves the latest playback after %s", async (completion) => {
      const previous = freezeDeep(makeNote(lineUnit === "measure" ? "phrase" : "measure",
        lineUnit === "measure" ? 5 : 10));
      const latest = freezeDeep(makeNote(lineUnit, count));
      const previousBefore = JSON.stringify(previous);
      const latestBefore = JSON.stringify(latest);
      // Both exports finish real synthesis. Only decoding (the shared fixture)
      // and output readiness are controlled; neither render nor mixer is mocked.
      jest.mocked(renderer.loadAssetPCM)
        .mockResolvedValueOnce(new Float32Array([amplitude.strong]))
        .mockResolvedValueOnce(new Float32Array([amplitude.accent]))
        .mockResolvedValueOnce(new Float32Array([amplitude.normal]));
      let oldRunning = waitingFor !== "isRunning";
      let oldPresentedMs = waitingFor === "presented position" ? 0 : 1;
      const oldStop = jest.fn(() => { oldRunning = false; });
      const oldReady = jest.fn(() => oldRunning);
      const oldPosition = jest.fn(() => oldPresentedMs / 1000);
      jest.mocked(renderer.playWebRenderedLoop).mockReturnValueOnce({
        stop: oldStop, isRunning: oldReady,
        getPresentedPositionSeconds: oldPosition, getPositionSeconds: () => 999,
      });

      // Hold just the 20ms output-start poll. The PCM mixer's yielding timeouts
      // remain real. Wake the stale poll deliberately AFTER the new timer runs,
      // including a wake past its original deadline, without wall-clock sleeps.
      const pollInstalled = deferred<void>();
      const polls: (() => void)[] = [];
      const realSetTimeout = globalThis.setTimeout;
      jest.spyOn(globalThis, "setTimeout").mockImplementation((callback, delay, ...args) => {
        if (delay === 20 && typeof callback === "function") {
          polls.push(() => callback(...args));
          pollInstalled.resolve();
          return 0 as unknown as ReturnType<typeof setTimeout>;
        }
        return realSetTimeout(callback, delay, ...args);
      });
      let now = 0;
      jest.spyOn(performance, "now").mockImplementation(() => now);
      const hook = renderHook(({ document }) => useNotebookPlayback(document, true),
        { initialProps: { document: previous } });
      const interval = jest.spyOn(globalThis, "setInterval");
      const clearInterval = jest.spyOn(globalThis, "clearInterval");
      const start = hook.result.current.start;
      let firstStart!: Promise<void>;
      let firstSettled = false;
      await act(async () => {
        firstStart = start().then(() => { firstSettled = true; });
        await pollInstalled.promise;
      });
      expect(firstSettled).toBe(false);
      expect(polls).toHaveLength(1);
      expect(render).toHaveBeenCalledTimes(1);
      expect(mix).toHaveBeenCalledTimes(1);
      expect(renderer.playWebRenderedLoop).toHaveBeenCalledTimes(1);
      expect(oldReady).toHaveBeenCalled();
      if (waitingFor === "presented position") expect(oldPosition).toHaveReturnedWith(0);
      expect(oldStop).not.toHaveBeenCalled();
      expect(interval).not.toHaveBeenCalled();
      expect(hook.result.current).toMatchObject({
        preparing: true, running: false, error: "", rows: [], position: { row: 0, progress: 0 },
      });
      const oldSignal = render.mock.calls[0][1] as AbortSignal;
      expect(oldSignal.aborted).toBe(false);

      hook.rerender({ document: latest });
      expect(hook.result.current.start).toBe(start);
      await act(async () => { await start(); });
      expect(firstSettled).toBe(false);
      expect(oldSignal.aborted).toBe(true);
      expect(oldStop).toHaveBeenCalledTimes(1);
      expect(stopOutput).not.toHaveBeenCalled();
      expect(render.mock.calls[1][0]).toBe(latest.settings?.source);
      const latestSignal = render.mock.calls[1][1] as AbortSignal;
      expect(latestSignal.aborted).toBe(false);
      expect(renderer.loadAssetPCM).toHaveBeenCalledTimes(6);
      const expected = expectPlaybackMatches(latest, hook.result.current.rows, order, perRow, 2, 2);
      expect(hook.result.current).toMatchObject({ running: true, preparing: false, error: "" });
      expect(interval).toHaveBeenCalledTimes(1);
      expect(interval).toHaveBeenCalledWith(expect.any(Function), 30);

      presentedMs = expected.rowEnds[0] + (expected.rowEnds[1] - expected.rowEnds[0]) / 2;
      act(() => { jest.advanceTimersByTime(30); });
      expect(hook.result.current.position).toEqual({ row: 1, progress: 0.5 });
      const rows = hook.result.current.rows;
      const position = hook.result.current.position;
      const randomCalls = random.mock.calls.length;
      if (completion === "late readiness") {
        // A device can report readiness even after its stop request.
        oldRunning = true;
        oldPresentedMs = 9000;
      } else {
        oldRunning = waitingFor !== "isRunning";
        oldPresentedMs = waitingFor === "presented position" ? 0 : 1;
        now = 6000;
      }
      await act(async () => { polls.shift()!(); await firstStart; });
      expect(firstSettled).toBe(true);
      expect(polls).toHaveLength(0);
      expect(hook.result.current.rows).toBe(rows);
      expect(hook.result.current.position).toBe(position);
      expect(hook.result.current).toMatchObject({ running: true, preparing: false, error: "" });
      expect(outputRunning).toBe(true);
      expect(latestSignal.aborted).toBe(false);
      expect(oldStop).toHaveBeenCalledTimes(1);
      expect(stopOutput).not.toHaveBeenCalled();
      expect(clearInterval).not.toHaveBeenCalled();
      expect(interval).toHaveBeenCalledTimes(1);
      expect(render).toHaveBeenCalledTimes(2);
      expect(mix).toHaveBeenCalledTimes(2);
      expect(renderer.playWebRenderedLoop).toHaveBeenCalledTimes(2);
      expect(random).toHaveBeenCalledTimes(randomCalls);

      // The winning timer still follows its own output, not the stale device.
      presentedMs = expected.rowEnds[1];
      act(() => { jest.advanceTimersByTime(30); });
      expect(hook.result.current.position).toEqual({ row: 2, progress: 0 });
      expect(hook.result.current.error).toBe("");
      expect(stopOutput).not.toHaveBeenCalled();
      hook.unmount();
      expect(oldStop).toHaveBeenCalledTimes(1);
      expect(stopOutput).toHaveBeenCalledTimes(1);
      expect(clearInterval).toHaveBeenCalledTimes(1);
      expect(clearInterval).toHaveBeenCalledWith(interval.mock.results[0].value);
      expect(JSON.stringify(previous)).toBe(previousBefore);
      expect(JSON.stringify(latest)).toBe(latestBefore);
    });
  });
});
