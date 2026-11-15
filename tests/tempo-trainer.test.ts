/** @jest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { useTempoTrainer } from "@/hooks/useTempoTrainer";
import {
  DEFAULT_TEMPO_TRAINER,
  normalizeTempoTrainer,
  steppedTrainerBpm,
  type TempoTrainerBindings,
} from "@/lib/tempo-trainer";

function fixture(basis: "time" | "beats" = "time", delta = 2) {
  let beat: (() => void) | null = null;
  let bpm = 100;
  const unsubscribe = jest.fn(() => { beat = null; });
  const trainer: TempoTrainerBindings = {
    config: { ...DEFAULT_TEMPO_TRAINER, enabled: true, basis, bpmDelta: delta, intervalSeconds: 1, intervalBeats: 4 },
    getBpm: () => bpm,
    changeBpm: jest.fn(next => { bpm = next; }),
    playAccent: jest.fn(),
    onConfigChange: jest.fn(),
    subscribeBeat: jest.fn(listener => { beat = listener; return unsubscribe; }),
  };
  const props = { trainer, running: true, isPlaying: true, reset: false, endsAt: undefined as number | undefined };
  return { trainer, props, beat: () => beat?.(), unsubscribe };
}

beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(0); });
afterEach(() => { jest.useRealTimers(); });

it("changes BPM repeatedly at the selected time interval and cues each actual increase", () => {
  const f = fixture();
  renderHook(() => useTempoTrainer(f.props));
  act(() => { jest.advanceTimersByTime(1001); });
  expect(f.trainer.changeBpm).toHaveBeenLastCalledWith(102);
  act(() => { jest.advanceTimersByTime(1000); });
  expect(f.trainer.changeBpm).toHaveBeenLastCalledWith(104);
  expect(f.trainer.playAccent).toHaveBeenCalledTimes(2);
});

it("counts full main-beat intervals, not beat indices or the initial time-zero beat", () => {
  const f = fixture("beats");
  renderHook(() => useTempoTrainer(f.props));
  act(() => {
    f.beat();
    for (let i = 0; i < 3; i++) f.beat();
    jest.runOnlyPendingTimers();
  });
  expect(f.trainer.changeBpm).not.toHaveBeenCalled();
  act(() => { f.beat(); jest.advanceTimersByTime(1); });
  expect(f.trainer.changeBpm).toHaveBeenCalledWith(102);
});

it("retains partial time progress across pause/resume but does not count paused time", () => {
  const f = fixture();
  const { rerender } = renderHook(p => useTempoTrainer(p), { initialProps: f.props });
  act(() => { jest.advanceTimersByTime(600); });
  rerender({ ...f.props, running: false });
  act(() => { jest.advanceTimersByTime(10000); });
  expect(f.trainer.changeBpm).not.toHaveBeenCalled();
  rerender(f.props);
  act(() => { jest.advanceTimersByTime(401); });
  expect(f.trainer.changeBpm).toHaveBeenCalledWith(102);
});

it("preserves partial beat progress on resume and skips the resumed time-zero beat", () => {
  const f = fixture("beats");
  const { rerender } = renderHook(p => useTempoTrainer(p), { initialProps: f.props });
  act(() => { f.beat(); f.beat(); f.beat(); });
  rerender({ ...f.props, running: false });
  act(() => { f.beat(); });
  rerender(f.props);
  act(() => { f.beat(); f.beat(); f.beat(); jest.advanceTimersByTime(1); });
  expect(f.trainer.changeBpm).toHaveBeenCalledTimes(1);
});

it.each([-2, 2])("does not play a cue for delta %s when the cue is disabled", (delta) => {
  const f = fixture("time", delta);
  f.trainer.config.accentOnIncrease = false;
  renderHook(() => useTempoTrainer(f.props));
  act(() => { jest.advanceTimersByTime(1001); });
  expect(f.trainer.changeBpm).toHaveBeenCalledWith(100 + delta);
  expect(f.trainer.playAccent).not.toHaveBeenCalled();
});

it("never accents a decrease even with the increase cue enabled", () => {
  const f = fixture("time", -2);
  renderHook(() => useTempoTrainer(f.props));
  act(() => { jest.advanceTimersByTime(1001); });
  expect(f.trainer.changeBpm).toHaveBeenCalledWith(98);
  expect(f.trainer.playAccent).not.toHaveBeenCalled();
});

it("uses wall-clock elapsed time after a stall and emits one cue rather than a burst", () => {
  const f = fixture();
  renderHook(() => useTempoTrainer(f.props));
  act(() => { jest.setSystemTime(5000); jest.advanceTimersByTime(101); });
  expect(f.trainer.changeBpm).toHaveBeenCalledTimes(1);
  expect(f.trainer.changeBpm).toHaveBeenCalledWith(110);
  expect(f.trainer.playAccent).toHaveBeenCalledTimes(1);
});

it("does not change tempo at/after the timer deadline", () => {
  const f = fixture();
  renderHook(() => useTempoTrainer({ ...f.props, endsAt: 1000 }));
  act(() => { jest.advanceTimersByTime(5000); });
  expect(f.trainer.changeBpm).not.toHaveBeenCalled();
});

it("cancels queued changes on stop/unmount and removes the beat listener", () => {
  const f = fixture("beats");
  const { unmount } = renderHook(() => useTempoTrainer(f.props));
  act(() => { for (let i = 0; i < 5; i++) f.beat(); });
  unmount();
  act(() => { jest.advanceTimersByTime(10000); f.beat(); });
  expect(f.trainer.changeBpm).not.toHaveBeenCalled();
  expect(f.unsubscribe).toHaveBeenCalledTimes(1);
});

it("waits for accepted metronome playback rather than counting the startup/countdown wait", () => {
  const f = fixture();
  const { rerender } = renderHook(p => useTempoTrainer(p), { initialProps: { ...f.props, isPlaying: false } });
  act(() => { jest.advanceTimersByTime(10000); });
  expect(f.trainer.changeBpm).not.toHaveBeenCalled();
  rerender(f.props);
  act(() => { jest.advanceTimersByTime(1001); });
  expect(f.trainer.changeBpm).toHaveBeenCalledWith(102);
});

it("reset clears progress without restoring or changing BPM", () => {
  const f = fixture();
  const { rerender } = renderHook(p => useTempoTrainer(p), { initialProps: f.props });
  act(() => { jest.advanceTimersByTime(1500); });
  rerender({ ...f.props, reset: true, running: false });
  expect(f.trainer.changeBpm).toHaveBeenCalledTimes(1);
  rerender(f.props);
  act(() => { jest.advanceTimersByTime(501); });
  expect(f.trainer.changeBpm).toHaveBeenCalledTimes(1);
  act(() => { jest.advanceTimersByTime(500); });
  expect(f.trainer.changeBpm).toHaveBeenLastCalledWith(104);
});

it("does not exceed existing 20–300 BPM limits or cue when already capped", () => {
  const f = fixture("time", 50);
  renderHook(() => useTempoTrainer(f.props));
  act(() => { jest.advanceTimersByTime(6001); });
  expect(f.trainer.getBpm()).toBe(300);
  expect(f.trainer.changeBpm).toHaveBeenCalledTimes(4);
  expect(steppedTrainerBpm(21, -50)).toBe(20);
});

it("normalizes unsafe or zero intervals and deltas", () => {
  expect(normalizeTempoTrainer({ ...DEFAULT_TEMPO_TRAINER, intervalSeconds: 0, intervalBeats: NaN, bpmDelta: 0 }))
    .toEqual({ ...DEFAULT_TEMPO_TRAINER, intervalSeconds: 1, bpmDelta: 1 });
});
