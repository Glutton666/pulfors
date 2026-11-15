import { createTrainerKernel, renderTrainerFrames, type TrainerTemplates, type TrainerCommand } from "@/lib/tempo-trainer-kernel";
import { DEFAULT_TEMPO_TRAINER } from "@/lib/tempo-trainer";

const RATE = 1000;
function fixture(beats = 4, overrides: Partial<TrainerCommand["rule"]> = {}, bpm = 120) {
  const normal = Array.from({ length: beats }, (_, i) => ({
    at: i / beats, left: new Float32Array([0.1]), right: new Float32Array([0.1]),
  }));
  const templates: TrainerTemplates = {
    normal, accent: normal.map((e, i) => i ? e : { ...e, left: new Float32Array([0.7]), right: new Float32Array([0.7]) }),
    baseBpm: bpm, periodSeconds: beats * 60 / bpm,
  };
  const command: TrainerCommand = {
    revision: 0, reset: 0, active: true, endsAt: 0,
    rule: { ...DEFAULT_TEMPO_TRAINER, enabled: true, basis: "measures", intervalMeasures: 4, ...overrides },
  };
  const state = createTrainerKernel(bpm);
  const render = (seconds: number, start = state.frame) => {
    const frames = Math.round(seconds * RATE);
    const left = new Float32Array(frames);
    const right = new Float32Array(frames);
    renderTrainerFrames(state, command, templates, left, right, frames, RATE, start);
    return left;
  };
  return { state, command, templates, render };
}

test.each([3, 4, 5])("%s/4 changes after four COMPLETE measures, not sixteen beats", beats => {
  const f = fixture(beats);
  const at = beats * 0.5 * 4;
  const before = f.render(at);
  expect(f.state.position.bpm).toBe(120);
  expect(before.filter(v => v > 0.5)).toHaveLength(0);
  const after = f.render(0.2);
  expect(f.state.position.bpm).toBe(122);
  expect(after[0]).toBeCloseTo(0.7);
  expect(after.filter(v => v > 0.01)).toHaveLength(1);
});

test("time threshold waits for the next first beat and resets the interval at actual application", () => {
  const f = fixture(3, { basis: "time", intervalSeconds: 2 });
  f.render(2.5);
  expect(f.state.position.bpm).toBe(120);
  f.render(0.501);
  expect(f.state.position.bpm).toBe(122);
  expect(f.state.since).toBe(3);
  f.render(2);
  expect(f.state.position.bpm).toBe(122);
  f.render(1);
  expect(f.state.position.bpm).toBe(124);
});

test.each([
  { bpmDelta: -2, accentOnIncrease: true, bpm: 120, next: 118 },
  { bpmDelta: 2, accentOnIncrease: false, bpm: 120, next: 122 },
  { bpmDelta: 2, accentOnIncrease: true, bpm: 300, next: 300 },
])("decrease, disabled cue and capped BPM do not add an accent: %j", ({ bpm, next, ...rule }) => {
  const f = fixture(4, { ...rule, intervalMeasures: 1 }, bpm);
  f.render(4 * 60 / bpm);
  const boundary = f.render(0.02);
  expect(f.state.position.bpm).toBe(next);
  expect(boundary[0]).toBeCloseTo(0.1);
});

test("the time-zero click and partially active first measure do not count as elapsed measures", () => {
  const f = fixture(4, { intervalMeasures: 1 });
  f.command.active = false;
  f.render(0.5);
  f.command.active = true;
  f.command.revision++;
  f.render(1.501);
  expect(f.state.position.bpm).toBe(120);
  f.render(2);
  expect(f.state.position.bpm).toBe(122);
});

test("pause preserves completed measures but discards a partial measure", () => {
  const f = fixture(4, { intervalMeasures: 2 });
  f.render(2.5);
  f.command.active = false; f.command.revision++;
  f.render(10);
  expect(f.state.position.bpm).toBe(120);
  f.command.active = true; f.command.revision++;
  f.render(3.501);
  expect(f.state.position.bpm).toBe(122);
});

test("a timer deadline excludes a change at that exact audio frame", () => {
  const f = fixture(4, { intervalMeasures: 1 });
  f.command.endsAt = 2;
  const pcm = f.render(10);
  expect(f.state.position.bpm).toBe(120);
  expect(pcm.filter(v => v > 0.5)).toHaveLength(0);
});

test("a long producer stall does not burst missed notes or multiple tempo steps", () => {
  const f = fixture(4, { basis: "time", intervalSeconds: 1 });
  f.render(0.1);
  const resumed = f.render(0.1, RATE * 60);
  expect(f.state.position.bpm).toBe(120);
  expect(resumed.filter(v => v > 0)).toHaveLength(1);
  f.render(2);
  expect(f.state.position.bpm).toBe(122);
});

test("explicit reset clears progress and a stopped command never resumes changes", () => {
  const f = fixture(4);
  f.render(7);
  f.command.reset++; f.command.revision++;
  f.command.active = false;
  f.render(20);
  expect(f.state.measures).toBe(0);
  expect(f.state.position.bpm).toBe(120);
});

test("partial time progress excludes pause duration and continues at a later boundary", () => {
  const f = fixture(4, { basis: "time", intervalSeconds: 1 });
  f.render(0.6);
  f.command.active = false; f.command.revision++;
  f.render(10);
  expect(f.state.position.bpm).toBe(120);
  f.command.active = true; f.command.revision++;
  f.render(1.399);
  expect(f.state.position.bpm).toBe(120);
  f.render(0.002);
  expect(f.state.position.bpm).toBe(122);
  expect(f.state.since).toBe(12);
});
