import { createWebTrainerDriver } from "@/lib/tempo-trainer-driver.web";
import { DEFAULT_TEMPO_TRAINER } from "@/lib/tempo-trainer";
import type { TrainerCommand, TrainerTemplates } from "@/lib/tempo-trainer-kernel";

function fixture() {
  const sources: { start: jest.Mock; stop: jest.Mock; disconnect: jest.Mock }[] = [];
  const context = {
    currentTime: 0, state: "running",
    createBuffer: () => ({ copyToChannel: jest.fn() }),
    createBufferSource: () => {
      const source = { start: jest.fn(), stop: jest.fn(), connect: jest.fn(), disconnect: jest.fn(), buffer: null, onended: null };
      sources.push(source);
      return source;
    },
    destination: {},
  };
  const voice = { at: 0, left: new Float32Array([0.1]), right: new Float32Array([0.1]) };
  const templates: TrainerTemplates = { normal: [voice], accent: [{ ...voice, left: new Float32Array([0.7]) }], baseBpm: 120, periodSeconds: 0.2 };
  const command: TrainerCommand = {
    revision: 0, reset: 0, active: true, endsAt: 0,
    rule: { ...DEFAULT_TEMPO_TRAINER, enabled: true, basis: "measures", intervalMeasures: 1 },
  };
  const driver = createWebTrainerDriver(context as unknown as AudioContext, templates, command);
  return { driver, context, command, sources };
}
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test("preparation emits nothing; reservations use contiguous future audio times", () => {
  const { driver, command, sources } = fixture();
  driver.update({ ...command, revision: 1 });
  expect(sources).toHaveLength(0);
  driver.start();
  expect(sources.length).toBeGreaterThan(2);
  expect(sources[0].start.mock.calls[0][0]).toBeCloseTo(0.08, 4);
  for (let i = 1; i < sources.length; i++) {
    expect(sources[i].start.mock.calls[0][0] - sources[i - 1].start.mock.calls[0][0]).toBeCloseTo(512 / 44100, 8);
  }
  driver.release();
});

test("an ahead-of-time tempo change is not reported as already audible", () => {
  const { driver, context } = fixture();
  driver.start();
  context.currentTime = 0.14;
  jest.advanceTimersByTime(20);
  expect(driver.position()?.bpm).toBe(120);
  context.currentTime = 0.285;
  expect(driver.position()?.bpm).toBe(122);
  driver.release();
});

test("pause cancels old reservations, and release forbids late callbacks from restarting output", () => {
  const { driver, command, sources, context } = fixture();
  driver.start();
  const old = [...sources];
  context.currentTime = 0.09;
  driver.update({ ...command, revision: 1, active: false });
  for (const source of old) expect(source.stop).toHaveBeenCalledTimes(1);
  const all = [...sources];
  driver.release();
  const count = sources.length;
  context.currentTime = 20;
  driver.update({ ...command, revision: 2 });
  jest.advanceTimersByTime(10000);
  expect(sources).toHaveLength(count);
  expect(all.every(source => source.stop.mock.calls.length === 1)).toBe(true);
  expect(driver.running()).toBe(false);
});
